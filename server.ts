import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import { GoogleGenAI, Type } from "@google/genai";
import * as XLSXModule from "xlsx";
const XLSX = (XLSXModule as any).default || XLSXModule;
import {
  BillRecord,
  ExtractedBillData,
  FieldConfidence,
  ValidationResult,
  AppSettings,
  DashboardSummary,
  ExcelTemplateInfo,
  TemplateColumnMapping,
  Outlet,
  User,
  AuthUser,
  LoginResponse,
  OutletSummaryStats,
  RevenueRecord,
  Mira604Summary,
  MiraSchedule1Category,
  AccountingTreatment,
  IncomeTaxTreatment,
  FixedAssetRecord,
  AssetClass,
  TaxAuditCheck
} from "./src/types.js";

const PORT = 3000;
const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Ensure data directories exist
const DATA_DIR = path.join(process.cwd(), "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const BILLS_FILE = path.join(DATA_DIR, "bills.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const TEMPLATE_EXCEL_FILE = path.join(DATA_DIR, "custom_template.xlsx");
const OUTLETS_FILE = path.join(DATA_DIR, "outlets.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const REVENUE_FILE = path.join(DATA_DIR, "revenue.json");
const ASSETS_FILE = path.join(DATA_DIR, "assets.json");

// MIRA Capital Allowance Rates Standard Table
const MIRA_CAPITAL_ALLOWANCE_RATES: Record<AssetClass, number> = {
  'Buildings': 4,
  'Plant & Equipment / Machinery': 10,
  'Vehicles & Transport': 20,
  'Computer Software & Hardware': 33.33,
  'Loose Tools / Utensils / Crockery': 33.33,
  'Furniture & Fittings': 10
};

// Fixed Assets storage helpers
function getAssets(): FixedAssetRecord[] {
  if (fs.existsSync(ASSETS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(ASSETS_FILE, "utf-8"));
    } catch (e) {
      console.error("Error reading assets.json", e);
    }
  }
  // Initialize default sample capital assets
  const defaultAssets: FixedAssetRecord[] = [
    {
      id: "ast-001",
      outlet_id: "outlet-1",
      outlet_name: "Male' Main Branch",
      asset_name: "POS Hardware & Server System",
      asset_class: "Computer Software & Hardware",
      purchase_date: "2025-01-15",
      cost_price: 45000,
      mira_rate: 33.33,
      opening_wdv: 45000,
      capital_allowance: 14998.50,
      closing_wdv: 30001.50,
      supplier: "Alpha Technology Pvt Ltd",
      notes: "Main POS terminals and kitchen display system"
    },
    {
      id: "ast-002",
      outlet_id: "outlet-1",
      outlet_name: "Male' Main Branch",
      asset_name: "Commercial Espresso Machine & Coffee Grinder",
      asset_class: "Plant & Equipment / Machinery",
      purchase_date: "2025-03-10",
      cost_price: 85000,
      mira_rate: 10,
      opening_wdv: 85000,
      capital_allowance: 8500,
      closing_wdv: 76500,
      supplier: "Maldives Kitchen Equipment Pvt Ltd",
      notes: "3-Group La Marzocco espresso machine"
    },
    {
      id: "ast-003",
      outlet_id: "outlet-2",
      outlet_name: "Hulhumale' Express",
      asset_name: "Delivery Scooter (Honda Click 125)",
      asset_class: "Vehicles & Transport",
      purchase_date: "2025-06-20",
      cost_price: 38000,
      mira_rate: 20,
      opening_wdv: 38000,
      capital_allowance: 7600,
      closing_wdv: 30400,
      supplier: "Sheesha Motors Maldives",
      notes: "Food delivery vehicle"
    }
  ];
  fs.writeFileSync(ASSETS_FILE, JSON.stringify(defaultAssets, null, 2));
  return defaultAssets;
}

function saveAssets(assets: FixedAssetRecord[]) {
  fs.writeFileSync(ASSETS_FILE, JSON.stringify(assets, null, 2));
}

// Revenue storage helpers
function getRevenues(): RevenueRecord[] {
  if (fs.existsSync(REVENUE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(REVENUE_FILE, "utf-8"));
    } catch (e) {
      console.error("Error reading revenue.json", e);
    }
  }
  return [];
}

function saveRevenues(revenues: RevenueRecord[]) {
  fs.writeFileSync(REVENUE_FILE, JSON.stringify(revenues, null, 2));
}

// Tax & Accounting derive helper
function deriveTaxTreatment(
  category?: string | null,
  docType?: string | null,
  notes?: string | null
): {
  mira_schedule1_category: MiraSchedule1Category;
  accounting_treatment: AccountingTreatment;
  income_tax_treatment: IncomeTaxTreatment;
  deductible_percentage: number;
} {
  const cat = (category || 'Other').trim();
  const type = (docType || 'TAX_INVOICE').trim().toUpperCase();
  const lowerNotes = (notes || '').toLowerCase();

  // Non-deductible disallowances (fines, MIRA penalties, personal expenses, income tax payments)
  if (
    lowerNotes.includes('fine') ||
    lowerNotes.includes('penalty') ||
    lowerNotes.includes('income tax payment') ||
    lowerNotes.includes('mira penalty') ||
    lowerNotes.includes('personal')
  ) {
    return {
      mira_schedule1_category: 'Other Expenses',
      accounting_treatment: 'NON_DEDUCTIBLE',
      income_tax_treatment: 'NON_DEDUCTIBLE',
      deductible_percentage: 0
    };
  }

  // Capital asset / expenditure check
  if (type === 'CAPITAL_EXPENDITURE' || cat === 'Equipment' || cat === 'Capital Asset (Schedule 2)') {
    return {
      mira_schedule1_category: 'Capital Asset (Schedule 2)',
      accounting_treatment: 'CAPITAL_EXPENDITURE',
      income_tax_treatment: 'CAPITAL_ALLOWANCE',
      deductible_percentage: 100
    };
  }

  if (cat === 'Food Ingredients' || cat === 'Beverages' || cat === 'Packaging') {
    return {
      mira_schedule1_category: 'Cost of Sales',
      accounting_treatment: 'COST_OF_SALES',
      income_tax_treatment: 'DEDUCTIBLE_EXPENSE',
      deductible_percentage: 100
    };
  }

  if (cat === 'Insurance') {
    return {
      mira_schedule1_category: 'Insurance Premium',
      accounting_treatment: 'OPERATING_EXPENSE',
      income_tax_treatment: 'DEDUCTIBLE_EXPENSE',
      deductible_percentage: 100
    };
  }

  if (cat === 'Professional Fees' || cat === 'Consulting') {
    return {
      mira_schedule1_category: 'Professional & Consulting Fees',
      accounting_treatment: 'OPERATING_EXPENSE',
      income_tax_treatment: 'DEDUCTIBLE_EXPENSE',
      deductible_percentage: 100
    };
  }

  if (cat === 'Rent' || cat === 'Lease' || cat === 'Licenses') {
    return {
      mira_schedule1_category: 'Rental, Lease & License',
      accounting_treatment: 'OPERATING_EXPENSE',
      income_tax_treatment: 'DEDUCTIBLE_EXPENSE',
      deductible_percentage: 100
    };
  }

  if (cat === 'Repairs' || cat === 'Maintenance') {
    return {
      mira_schedule1_category: 'Repairs & Maintenance',
      accounting_treatment: 'OPERATING_EXPENSE',
      income_tax_treatment: 'DEDUCTIBLE_EXPENSE',
      deductible_percentage: 100
    };
  }

  if (cat === 'Salaries' || cat === 'Wages') {
    return {
      mira_schedule1_category: 'Salaries & Wages',
      accounting_treatment: 'OPERATING_EXPENSE',
      income_tax_treatment: 'DEDUCTIBLE_EXPENSE',
      deductible_percentage: 100
    };
  }

  if (cat === 'Marketing' || cat === 'Advertising') {
    return {
      mira_schedule1_category: 'Sales & Marketing',
      accounting_treatment: 'OPERATING_EXPENSE',
      income_tax_treatment: 'DEDUCTIBLE_EXPENSE',
      deductible_percentage: 100
    };
  }

  return {
    mira_schedule1_category: 'Other Expenses',
    accounting_treatment: 'OPERATING_EXPENSE',
    income_tax_treatment: 'DEDUCTIBLE_EXPENSE',
    deductible_percentage: 100
  };
}

// Multer storage for uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `bill-${uniqueSuffix}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }
});

// Helper for default settings
function getAppSettings(): AppSettings {
  const defaultMapping = {
    supplier_name: "Supplier Name",
    supplier_tin: "Supplier Tin",
    invoice_number: "Invoice Number",
    invoice_date: "Invoice Date",
    taxable_value: "Subtotal (Excl. GST)",
    gst_amount: "GST Amount (8%)",
    invoice_total: "Invoice Total",
    quarter: "Quarter",
    notes: "Notes",
    outlet_name: "Outlet Name"
  };

  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
      if (parsed.templateMapping) {
        if (!parsed.templateMapping.supplier_tin || parsed.templateMapping.supplier_tin === "TIN on Invoice") {
          parsed.templateMapping.supplier_tin = "Supplier Tin";
        }
        if (!parsed.templateMapping.taxable_value || parsed.templateMapping.taxable_value === "Taxable Value (MVR)") {
          parsed.templateMapping.taxable_value = "Subtotal (Excl. GST)";
        }
        if (!parsed.templateMapping.outlet_name) {
          parsed.templateMapping.outlet_name = "Outlet Name";
        }
      } else {
        parsed.templateMapping = { ...defaultMapping };
      }
      return parsed;
    } catch (e) {
      console.error("Error reading settings.json", e);
    }
  }
  const defaults: AppSettings = {
    myTin: "1133533GST501",
    defaultGstRate: 8,
    autoApproveHighConfidence: false,
    templateMapping: defaultMapping,
    googleSheets: {
      spreadsheetId: "",
      sheetName: "GST Purchases",
      connected: false,
      mapping: { ...defaultMapping }
    }
  };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(defaults, null, 2));
  return defaults;
}

function saveAppSettings(settings: AppSettings) {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// Outlets helper
function getOutlets(): Outlet[] {
  if (fs.existsSync(OUTLETS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(OUTLETS_FILE, "utf-8"));
    } catch (e) {
      console.error("Error reading outlets.json", e);
    }
  }
  // Initial seed outlets
  const seedOutlets: Outlet[] = [
    {
      id: "outlet-1",
      name: "Male' Main Branch",
      code: "MLE-01",
      tin: "1000001GST501",
      address: "Boduthakurufaanu Magu, Male', Maldives",
      phone: "+960 334 4300",
      status: "active",
      createdAt: new Date().toISOString()
    },
    {
      id: "outlet-2",
      name: "Hulhumale' Outlet",
      code: "HLM-02",
      tin: "1000002GST502",
      address: "Nirolhu Magu, Hulhumale', Maldives",
      phone: "+960 335 1122",
      status: "active",
      createdAt: new Date().toISOString()
    },
    {
      id: "outlet-3",
      name: "Maafushi Resort Shop",
      code: "MFS-03",
      tin: "1000003GST503",
      address: "Kani Magu, Maafushi, Maldives",
      phone: "+960 778 9988",
      status: "active",
      createdAt: new Date().toISOString()
    }
  ];
  fs.writeFileSync(OUTLETS_FILE, JSON.stringify(seedOutlets, null, 2));
  return seedOutlets;
}

function saveOutlets(outlets: Outlet[]) {
  fs.writeFileSync(OUTLETS_FILE, JSON.stringify(outlets, null, 2));
}

// Users helper
function getUsers(): User[] {
  let usersList: User[] = [];
  if (fs.existsSync(USERS_FILE)) {
    try {
      usersList = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    } catch (e) {
      console.error("Error reading users.json", e);
    }
  }

  if (usersList.length === 0) {
    usersList = [
      {
        id: "user-ibreez",
        name: "Ibreez Super Admin",
        email: "ibreez@crmaldives.com",
        username: "ibreez",
        role: "super_admin",
        outlet_id: null,
        outlet_name: "All Outlets (System Admin)",
        status: "active",
        createdAt: new Date().toISOString()
      },
      {
        id: "user-admin",
        name: "Super Admin",
        email: "admin@crmaldives.com",
        username: "admin",
        role: "super_admin",
        outlet_id: null,
        outlet_name: "All Outlets (System Admin)",
        status: "active",
        createdAt: new Date().toISOString()
      },
      {
        id: "user-male",
        name: "Male' Manager",
        email: "male@crmaldives.com",
        username: "male_user",
        role: "outlet_user",
        outlet_id: "outlet-1",
        outlet_name: "Male' Main Branch",
        status: "active",
        createdAt: new Date().toISOString()
      },
      {
        id: "user-hulhumale",
        name: "Hulhumale' Manager",
        email: "hulhumale@crmaldives.com",
        username: "hulhumale_user",
        role: "outlet_user",
        outlet_id: "outlet-2",
        outlet_name: "Hulhumale' Outlet",
        status: "active",
        createdAt: new Date().toISOString()
      },
      {
        id: "user-maafushi",
        name: "Maafushi Manager",
        email: "maafushi@crmaldives.com",
        username: "maafushi_user",
        role: "outlet_user",
        outlet_id: "outlet-3",
        outlet_name: "Maafushi Resort Shop",
        status: "active",
        createdAt: new Date().toISOString()
      }
    ];
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersList, null, 2));
    return usersList;
  }

  // Ensure 'ibreez' super admin user exists
  const ibreezUser = usersList.find((u) => u.username.toLowerCase() === "ibreez" || u.id === "user-ibreez");
  if (!ibreezUser) {
    usersList.unshift({
      id: "user-ibreez",
      name: "Ibreez Super Admin",
      email: "ibreez@crmaldives.com",
      username: "ibreez",
      role: "super_admin",
      outlet_id: null,
      outlet_name: "All Outlets (System Admin)",
      status: "active",
      createdAt: new Date().toISOString()
    });
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersList, null, 2));
  } else {
    if (ibreezUser.role !== "super_admin" || ibreezUser.status !== "active") {
      ibreezUser.role = "super_admin";
      ibreezUser.status = "active";
      fs.writeFileSync(USERS_FILE, JSON.stringify(usersList, null, 2));
    }
  }

  return usersList;
}

function saveUsers(users: User[]) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// User passwords storage
const PASSWORDS_FILE = path.join(DATA_DIR, "passwords.json");
function getPasswords(): Record<string, string> {
  let passwords: Record<string, string> = {};
  if (fs.existsSync(PASSWORDS_FILE)) {
    try {
      passwords = JSON.parse(fs.readFileSync(PASSWORDS_FILE, "utf-8"));
    } catch (e) {
      console.error("Error reading passwords.json", e);
    }
  }

  let modified = false;
  if (!passwords["user-ibreez"]) {
    passwords["user-ibreez"] = "admin";
    modified = true;
  } else if (passwords["user-ibreez"] !== "admin") {
    passwords["user-ibreez"] = "admin";
    modified = true;
  }

  if (modified || Object.keys(passwords).length === 0) {
    if (!passwords["user-admin"]) passwords["user-admin"] = "admin123";
    if (!passwords["user-male"]) passwords["user-male"] = "outlet123";
    if (!passwords["user-hulhumale"]) passwords["user-hulhumale"] = "outlet123";
    if (!passwords["user-maafushi"]) passwords["user-maafushi"] = "outlet123";
    fs.writeFileSync(PASSWORDS_FILE, JSON.stringify(passwords, null, 2));
  }

  return passwords;
}

function savePasswords(passwords: Record<string, string>) {
  fs.writeFileSync(PASSWORDS_FILE, JSON.stringify(passwords, null, 2));
}

// Sessions storage
interface SessionRecord {
  token: string;
  userId: string;
  createdAt: string;
}

function getSessions(): SessionRecord[] {
  if (fs.existsSync(SESSIONS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8"));
    } catch (e) {
      console.error("Error reading sessions.json", e);
    }
  }
  return [];
}

function saveSessions(sessions: SessionRecord[]) {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

// Bills helper (with migration to ensure every bill has document_type, tax_status, expense_category, ocr_status, etc.)
function getBills(): BillRecord[] {
  let bills: BillRecord[] = [];
  if (fs.existsSync(BILLS_FILE)) {
    try {
      bills = JSON.parse(fs.readFileSync(BILLS_FILE, "utf-8"));
    } catch (e) {
      console.error("Error reading bills.json", e);
    }
  }

  const outlets = getOutlets();
  const defaultOutlet = outlets[0] || { id: "outlet-1", name: "Male' Main Branch" };
  let modified = false;

  bills.forEach((b) => {
    if (!b.outlet_id) {
      b.outlet_id = defaultOutlet.id;
      b.outlet_name = defaultOutlet.name;
      modified = true;
    } else if (!b.outlet_name) {
      const match = outlets.find((o) => o.id === b.outlet_id);
      b.outlet_name = match ? match.name : "Branch Outlet";
      modified = true;
    }

    if (!b.ocr_status) {
      b.ocr_status = b.status === "verified" ? "APPROVED" : "NEEDS_REVIEW";
      modified = true;
    }
    if (b.ocr_attempts === undefined) {
      b.ocr_attempts = 1;
      modified = true;
    }
    if (b.needs_review === undefined) {
      b.needs_review = b.status === "pending_review";
      modified = true;
    }

    // Ensure extracted & verified data structures have new fields
    const dataObjects = [b.extractedData, b.verifiedData].filter(Boolean);
    dataObjects.forEach((data) => {
      if (!data.document_type) {
        data.document_type = "TAX_INVOICE";
        modified = true;
      }
      if (!data.tax_status) {
        data.tax_status = (data.totals?.gst_amount && data.totals.gst_amount > 0) ? "TAX_CHARGED" : "NO_TAX";
        modified = true;
      }
      if (!data.expense_category) {
        data.expense_category = "Other";
        modified = true;
      }
      if (!data.mira_schedule1_category || !data.accounting_treatment || !data.income_tax_treatment) {
        const taxDerived = deriveTaxTreatment(data.expense_category, data.document_type, data.notes);
        if (!data.mira_schedule1_category) data.mira_schedule1_category = taxDerived.mira_schedule1_category;
        if (!data.accounting_treatment) data.accounting_treatment = taxDerived.accounting_treatment;
        if (!data.income_tax_treatment) data.income_tax_treatment = taxDerived.income_tax_treatment;
        if (data.deductible_percentage === undefined) data.deductible_percentage = taxDerived.deductible_percentage;
        modified = true;
      }
    });
  });

  if (modified) {
    saveBills(bills);
  }

  return bills;
}

function saveBills(bills: BillRecord[]) {
  fs.writeFileSync(BILLS_FILE, JSON.stringify(bills, null, 2));
}

// Authentication Middleware
function getAuthUser(req: express.Request): AuthUser | null {
  const authHeader = req.headers.authorization;
  const tokenHeader = req.headers["x-auth-token"] as string;
  let token = tokenHeader;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  }

  if (!token) {
    return null;
  }

  const sessions = getSessions();
  const session = sessions.find((s) => s.token === token);
  if (!session) {
    return null;
  }

  const users = getUsers();
  const user = users.find((u) => u.id === session.userId && u.status === "active");
  if (!user) {
    return null;
  }

  const outlets = getOutlets();
  const outlet = user.outlet_id ? outlets.find((o) => o.id === user.outlet_id) : null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    outlet_id: user.outlet_id,
    outlet_name: outlet ? outlet.name : user.role === "super_admin" ? "All Outlets (Super Admin)" : "Branch Outlet"
  };
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authUser = getAuthUser(req);
  if (!authUser) {
    return res.status(401).json({ error: "Authentication required. Please log in." });
  }
  (req as any).user = authUser;
  next();
}

function requireSuperAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const user = (req as any).user as AuthUser;
  if (!user || user.role !== "super_admin") {
    return res.status(403).json({ error: "Forbidden: Super Admin privilege required." });
  }
  next();
}

// Helper to construct row object for any set of column headers
function getRowForHeaders(headers: string[], bill: BillRecord, mapping: TemplateColumnMapping): Record<string, any> {
  const data = bill.verifiedData || bill.extractedData;
  const rowData: Record<string, any> = {};

  const fieldDefs: { key: keyof TemplateColumnMapping; value: any; aliases: string[] }[] = [
    {
      key: "outlet_name",
      value: bill.outlet_name || "Branch Outlet",
      aliases: ["outlet name", "outlet", "branch", "shop"]
    },
    {
      key: "supplier_name",
      value: data.supplier.name || "",
      aliases: ["supplier name", "supplier", "vendor name", "vendor"]
    },
    {
      key: "supplier_tin",
      value: data.supplier.gstin || "",
      aliases: ["supplier tin", "tin on invoice", "gstd/tin", "tin", "gstin", "supplier gstin"]
    },
    {
      key: "invoice_number",
      value: data.invoice.number || "",
      aliases: ["invoice number", "invoice #", "inv #", "invoice no", "bill no"]
    },
    {
      key: "invoice_date",
      value: data.invoice.date || "",
      aliases: ["invoice date", "date", "bill date"]
    },
    {
      key: "taxable_value",
      value: data.totals.taxable_value ?? 0,
      aliases: ["subtotal (excl. gst)", "subtotal (excl gst)", "taxable value (mvr)", "taxable amount", "taxable value", "subtotal"]
    },
    {
      key: "gst_amount",
      value: data.totals.gst_amount ?? 0,
      aliases: ["gst amount (8%)", "gst charged at 8%", "gst amount", "gst (mvr)", "gst paid"]
    },
    {
      key: "invoice_total",
      value: data.totals.invoice_total ?? 0,
      aliases: ["invoice total", "total amount", "total (mvr)", "grand total", "total"]
    },
    {
      key: "quarter",
      value: bill.quarter || "",
      aliases: ["quarter", "period"]
    },
    {
      key: "notes",
      value: data.notes || "",
      aliases: ["notes", "remarks"]
    }
  ];

  for (const header of headers) {
    const trimmedHeader = header.trim();
    if (!trimmedHeader) continue;
    const lowerHeader = trimmedHeader.toLowerCase();
    const normHeader = lowerHeader.replace(/[^a-z0-9]/g, "");

    let matchedValue: any = undefined;

    for (const field of fieldDefs) {
      const mappedCol = mapping?.[field.key];
      if (mappedCol && mappedCol.trim().toLowerCase() === lowerHeader) {
        matchedValue = field.value;
        break;
      }
    }

    if (matchedValue === undefined && normHeader.length > 1) {
      const isOtherGstRate = /gst.*(6|12|16|17)%?/i.test(trimmedHeader);

      if (!isOtherGstRate) {
        for (const field of fieldDefs) {
          const matchAlias = field.aliases.some(alias => {
            const aliasNorm = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
            return lowerHeader === alias || normHeader === aliasNorm;
          });
          if (matchAlias) {
            matchedValue = field.value;
            break;
          }
        }
      }
    }

    rowData[trimmedHeader] = matchedValue !== undefined ? matchedValue : "";
  }

  return rowData;
}

// Date helpers
function calculateQuarter(dateStr: string | null): string {
  if (!dateStr) {
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3) + 1;
    return `${now.getFullYear()}-Q${q}`;
  }

  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  const parts = dateStr.trim().split(/[\s\-\/]+/);
  let year = new Date().getFullYear();
  let month = 0;

  if (parts.length >= 3) {
    const mStr = parts[1].toLowerCase().slice(0, 3);
    if (mStr in monthMap) {
      month = monthMap[mStr];
      const y = parseInt(parts[2], 10);
      if (!isNaN(y)) year = y < 100 ? 2000 + y : y;
    } else {
      const parsedDate = new Date(dateStr);
      if (!isNaN(parsedDate.getTime())) {
        year = parsedDate.getFullYear();
        month = parsedDate.getMonth();
      }
    }
  }

  const q = Math.floor(month / 3) + 1;
  return `${year}-Q${q}`;
}

function formatToMaldivianDate(rawDateStr: string | null): string {
  if (!rawDateStr) return "";
  const d = new Date(rawDateStr);
  if (!isNaN(d.getTime())) {
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  }
  return rawDateStr;
}

// Gemini AI client
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}

// Validation logic for bills (smart validation based on document_type and tax_status)
function validateBill(data: ExtractedBillData, existingBills: BillRecord[], currentId?: string, outletId?: string): ValidationResult {
  const issues: { type: 'error' | 'warning'; field?: string; message: string }[] = [];
  const settings = getAppSettings();

  const docType = data.document_type || 'TAX_INVOICE';
  const taxStatus = data.tax_status || 'TAX_CHARGED';

  const supplierTin = (data.supplier?.gstin || "").trim();
  const supplierName = (data.supplier?.name || "").trim();
  const invNumber = (data.invoice?.number || "").trim();
  const invDate = (data.invoice?.date || "").trim();
  const taxable = data.totals?.taxable_value ?? 0;
  const gst = data.totals?.gst_amount ?? 0;
  const roundOff = data.totals?.round_off ?? 0;
  const total = data.totals?.invoice_total ?? 0;

  const isTaxDoc = docType === 'TAX_INVOICE' || taxStatus === 'TAX_CHARGED' || taxStatus === 'TAX_INCLUDED';

  // 1. Supplier Name check
  if (!supplierName) {
    issues.push({ type: 'warning', field: 'supplier_name', message: 'Supplier name is missing or unreadable.' });
  }

  // 2. Supplier TIN validation (Only required/expected for Tax Invoices)
  if (isTaxDoc) {
    if (!supplierTin) {
      issues.push({ type: 'warning', field: 'supplier_tin', message: 'Supplier TIN is missing on Tax Invoice.' });
    } else if (supplierTin.toUpperCase() === settings.myTin.toUpperCase()) {
      issues.push({ type: 'error', field: 'supplier_tin', message: `Extracted TIN (${supplierTin}) is OUR TIN, not the Supplier's TIN.` });
    } else if (!/^\d{7}GST\d{3}$/i.test(supplierTin)) {
      issues.push({ type: 'warning', field: 'supplier_tin', message: `Supplier TIN format (${supplierTin}) may need verification (expected 7 digits + GST + 3 digits).` });
    }
  }

  // 3. Invoice Number
  if (!invNumber) {
    if (isTaxDoc) {
      issues.push({ type: 'error', field: 'invoice_number', message: 'Invoice number is missing.' });
    } else {
      issues.push({ type: 'warning', field: 'invoice_number', message: 'Document reference / number is missing.' });
    }
  }

  // 4. Invoice Date
  if (!invDate) {
    issues.push({ type: 'error', field: 'invoice_date', message: 'Document date is missing.' });
  }

  // 5. Total and Mathematical check & Input GST Separation
  if (total <= 0 && taxable <= 0) {
    issues.push({ type: 'error', field: 'invoice_total', message: 'Total purchase amount is zero or unreadable.' });
  } else if (isTaxDoc) {
    if (taxStatus === 'TAX_CHARGED' && total > 0 && (gst === 0 || gst === null)) {
      issues.push({
        type: 'warning',
        field: 'gst_amount',
        message: 'Tax Invoice indicates tax charged, but Input GST amount is 0 or not separated from net expenses.'
      });
    }

    const calculatedTotal = taxable + gst + roundOff;
    const diff = Math.abs(calculatedTotal - total);
    if (total > 0 && diff > 0.50) {
      issues.push({
        type: 'warning',
        field: 'invoice_total',
        message: `Invoice total (MVR ${total.toFixed(2)}) does not match calculated sum (Subtotal MVR ${taxable.toFixed(2)} + GST MVR ${gst.toFixed(2)} = MVR ${calculatedTotal.toFixed(2)}).`
      });
    }
  } else {
    // Non-tax / handwritten purchase math check
    const diff = Math.abs((taxable + roundOff) - total);
    if (total > 0 && taxable > 0 && diff > 0.50) {
      issues.push({
        type: 'warning',
        field: 'invoice_total',
        message: `Total amount (MVR ${total.toFixed(2)}) does not match subtotal (MVR ${taxable.toFixed(2)}).`
      });
    }
  }

  // 6. Capital Asset & Tax Disallowance Validation
  if (
    docType === 'CAPITAL_EXPENDITURE' ||
    data.mira_schedule1_category === 'Capital Asset (Schedule 2)' ||
    data.income_tax_treatment === 'CAPITAL_ALLOWANCE'
  ) {
    issues.push({
      type: 'warning',
      field: 'mira_schedule1_category',
      message: 'Capital Asset / Expenditure detected: Excluded from direct operating deduction; subject to MIRA Schedule 2 Capital Allowance.'
    });
  }

  if (
    data.income_tax_treatment === 'NON_DEDUCTIBLE' ||
    (data.deductible_percentage !== undefined && data.deductible_percentage === 0)
  ) {
    issues.push({
      type: 'warning',
      field: 'income_tax_treatment',
      message: 'Non-deductible expense detected (e.g. fines, penalties, personal expenses). Added back to MIRA taxable income.'
    });
  }

  // 7. Duplicate check scoped to outlet
  let duplicateFound = false;
  let duplicateBillId: string | null = null;
  let duplicateReason: string | null = null;

  for (const other of existingBills) {
    if (currentId && other.id === currentId) continue;
    if (other.status === 'rejected') continue;
    if (outletId && other.outlet_id && other.outlet_id !== outletId) continue;

    const otherData = other.verifiedData || other.extractedData;
    const otherTin = (otherData.supplier?.gstin || "").trim();
    const otherName = (otherData.supplier?.name || "").trim().toLowerCase();
    const otherInvNum = (otherData.invoice?.number || "").trim();
    const otherInvDate = (otherData.invoice?.date || "").trim();
    const otherTotal = otherData.totals?.invoice_total ?? 0;

    if (supplierTin && otherTin && supplierTin.toUpperCase() === otherTin.toUpperCase() && invNumber && otherInvNum && invNumber.toLowerCase() === otherInvNum.toLowerCase()) {
      duplicateFound = true;
      duplicateBillId = other.id;
      duplicateReason = `Duplicate detected: Invoice #${invNumber} for TIN ${supplierTin} already uploaded (${other.fileName}).`;
      break;
    }

    if (supplierName && otherName && supplierName.toLowerCase() === otherName && invNumber && otherInvNum && invNumber.toLowerCase() === otherInvNum.toLowerCase()) {
      duplicateFound = true;
      duplicateBillId = other.id;
      duplicateReason = `Duplicate detected: Invoice #${invNumber} from ${data.supplier.name} already uploaded (${other.fileName}).`;
      break;
    }

    if (supplierName && otherName && supplierName.toLowerCase() === otherName && invDate && otherInvDate && invDate === otherInvDate && total > 0 && Math.abs(total - otherTotal) < 0.01) {
      duplicateFound = true;
      duplicateBillId = other.id;
      duplicateReason = `Possible duplicate: Same supplier (${data.supplier.name}), date (${invDate}), and total (MVR ${total}) already exists.`;
      break;
    }
  }

  if (duplicateFound && duplicateReason) {
    issues.push({ type: 'warning', field: 'invoice_number', message: duplicateReason });
  }

  const hasErrors = issues.some(i => i.type === 'error');

  return {
    is_valid: !hasErrors,
    issues,
    duplicate_found: duplicateFound,
    duplicate_bill_id: duplicateBillId,
    duplicate_reason: duplicateReason
  };
}

// Serve uploads
app.use("/uploads", express.static(UPLOADS_DIR));

// ---------------- AUTH ROUTES ----------------

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username/Email and password are required." });
  }

  const users = getUsers();
  const passwords = getPasswords();
  const outlets = getOutlets();

  const term = username.trim().toLowerCase();
  const user = users.find(
    (u) => (u.username.toLowerCase() === term || u.email.toLowerCase() === term) && u.status === "active"
  );

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials or account deactivated." });
  }

  const expectedPass = passwords[user.id] || "outlet123";
  if (password !== expectedPass) {
    return res.status(401).json({ error: "Invalid username or password." });
  }

  // Update last login
  user.lastLogin = new Date().toISOString();
  saveUsers(users);

  // Generate session token
  const token = "session-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
  const sessions = getSessions();
  sessions.push({
    token,
    userId: user.id,
    createdAt: new Date().toISOString()
  });
  saveSessions(sessions);

  const outlet = user.outlet_id ? outlets.find((o) => o.id === user.outlet_id) : null;
  const authUser: AuthUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    role: user.role,
    outlet_id: user.outlet_id,
    outlet_name: outlet ? outlet.name : user.role === "super_admin" ? "All Outlets (Super Admin)" : "Branch Outlet"
  };

  const response: LoginResponse = { token, user: authUser };
  res.json(response);
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  res.json({ user });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
  const authHeader = req.headers.authorization;
  const tokenHeader = req.headers["x-auth-token"] as string;
  let token = tokenHeader;
  if (authHeader && authHeader.startsWith("Bearer ")) token = authHeader.substring(7);

  if (token) {
    let sessions = getSessions();
    sessions = sessions.filter((s) => s.token !== token);
    saveSessions(sessions);
  }

  res.json({ success: true, message: "Logged out successfully" });
});

// ---------------- OUTLET MANAGEMENT ROUTES ----------------

app.get("/api/outlets", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  let outlets = getOutlets();

  if (user.role === "outlet_user") {
    outlets = outlets.filter((o) => o.id === user.outlet_id);
  }

  res.json(outlets);
});

app.post("/api/outlets", requireAuth, requireSuperAdmin, (req, res) => {
  const { name, code, tin, address, phone } = req.body;
  if (!name || !code) {
    return res.status(400).json({ error: "Outlet Name and Code are required." });
  }

  const outlets = getOutlets();
  const existing = outlets.find((o) => o.code.toLowerCase() === code.trim().toLowerCase());
  if (existing) {
    return res.status(400).json({ error: `Outlet code "${code}" already exists.` });
  }

  const newOutlet: Outlet = {
    id: "outlet-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    name: name.trim(),
    code: code.trim().toUpperCase(),
    tin: tin ? tin.trim() : undefined,
    address: address ? address.trim() : undefined,
    phone: phone ? phone.trim() : undefined,
    status: "active",
    createdAt: new Date().toISOString()
  };

  outlets.push(newOutlet);
  saveOutlets(outlets);

  res.json(newOutlet);
});

app.put("/api/outlets/:id", requireAuth, requireSuperAdmin, (req, res) => {
  const { id } = req.params;
  const outlets = getOutlets();
  const idx = outlets.findIndex((o) => o.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Outlet not found" });
  }

  const current = outlets[idx];
  const { name, code, tin, address, phone, status } = req.body;

  if (name) current.name = name.trim();
  if (code) current.code = code.trim().toUpperCase();
  if (tin !== undefined) current.tin = tin.trim();
  if (address !== undefined) current.address = address.trim();
  if (phone !== undefined) current.phone = phone.trim();
  if (status) current.status = status;
  current.updatedAt = new Date().toISOString();

  outlets[idx] = current;
  saveOutlets(outlets);

  // Sync outlet_name on bills
  const bills = getBills();
  let billsUpdated = false;
  bills.forEach((b) => {
    if (b.outlet_id === id) {
      b.outlet_name = current.name;
      billsUpdated = true;
    }
  });
  if (billsUpdated) saveBills(bills);

  // Sync outlet_name on users
  const users = getUsers();
  let usersUpdated = false;
  users.forEach((u) => {
    if (u.outlet_id === id) {
      u.outlet_name = current.name;
      usersUpdated = true;
    }
  });
  if (usersUpdated) saveUsers(users);

  res.json(current);
});

// ---------------- USER MANAGEMENT ROUTES ----------------

app.get("/api/users", requireAuth, requireSuperAdmin, (_req, res) => {
  const users = getUsers();
  const outlets = getOutlets();

  // Populate latest outlet_name
  const populated = users.map((u) => {
    const o = u.outlet_id ? outlets.find((out) => out.id === u.outlet_id) : null;
    return {
      ...u,
      outlet_name: o ? o.name : u.role === "super_admin" ? "All Outlets (Super Admin)" : "Unassigned"
    };
  });

  res.json(populated);
});

app.post("/api/users", requireAuth, requireSuperAdmin, (req, res) => {
  const { name, email, username, password, role, outlet_id, status } = req.body;
  if (!name || !email || !username || !password) {
    return res.status(400).json({ error: "Name, email, username and password are required." });
  }

  const users = getUsers();
  if (users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) {
    return res.status(400).json({ error: "Email is already registered." });
  }
  if (users.some((u) => u.username.toLowerCase() === username.trim().toLowerCase())) {
    return res.status(400).json({ error: "Username is already taken." });
  }

  const outlets = getOutlets();
  const outlet = outlet_id ? outlets.find((o) => o.id === outlet_id) : null;

  const newUser: User = {
    id: "user-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    username: username.trim().toLowerCase(),
    role: role === "super_admin" ? "super_admin" : "outlet_user",
    outlet_id: role === "super_admin" ? null : outlet_id || null,
    outlet_name: outlet ? outlet.name : role === "super_admin" ? "All Outlets (Super Admin)" : undefined,
    status: status || "active",
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  saveUsers(users);

  // Save password
  const passwords = getPasswords();
  passwords[newUser.id] = password;
  savePasswords(passwords);

  res.json(newUser);
});

app.put("/api/users/:id", requireAuth, requireSuperAdmin, (req, res) => {
  const { id } = req.params;
  const users = getUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "User not found" });
  }

  const current = users[idx];
  const { name, email, role, outlet_id, status } = req.body;

  if (name) current.name = name.trim();
  if (email) current.email = email.trim().toLowerCase();
  if (role) current.role = role;
  if (role === "super_admin") {
    current.outlet_id = null;
    current.outlet_name = "All Outlets (Super Admin)";
  } else if (outlet_id !== undefined) {
    current.outlet_id = outlet_id;
    const outlets = getOutlets();
    const o = outlets.find((out) => out.id === outlet_id);
    current.outlet_name = o ? o.name : undefined;
  }
  if (status) current.status = status;

  users[idx] = current;
  saveUsers(users);

  res.json(current);
});

app.post("/api/users/:id/reset-password", requireAuth, requireSuperAdmin, (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4) {
    return res.status(400).json({ error: "New password must be at least 4 characters long." });
  }

  const users = getUsers();
  const user = users.find((u) => u.id === id);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  const passwords = getPasswords();
  passwords[id] = newPassword;
  savePasswords(passwords);

  res.json({ success: true, message: `Password reset successfully for user ${user.username}.` });
});

// ---------------- DASHBOARD SUMMARY ROUTE ----------------

app.get("/api/dashboard/summary", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  const { outlet: requestedOutlet } = req.query;

  let bills = getBills();
  const outlets = getOutlets();
  const users = getUsers();

  // Backend Isolation logic:
  let effectiveOutletId: string | null = null;
  if (user.role === "outlet_user") {
    effectiveOutletId = user.outlet_id;
  } else if (requestedOutlet && requestedOutlet !== "ALL") {
    effectiveOutletId = requestedOutlet as string;
  }

  if (effectiveOutletId) {
    bills = bills.filter((b) => b.outlet_id === effectiveOutletId);
  }

  const summary: DashboardSummary = {
    totalBills: bills.length,
    pendingReviewCount: bills.filter((b) => b.status === "pending_review").length,
    verifiedCount: bills.filter((b) => b.status === "verified").length,
    rejectedCount: bills.filter((b) => b.status === "rejected").length,
    totalPurchases: 0,
    totalGst: 0,
    quarterlyStats: {},
    totalOutlets: outlets.length,
    totalUsers: users.length,
    outletStats: []
  };

  bills.forEach((b) => {
    if (b.status === "verified" || b.status === "pending_review") {
      const data = b.verifiedData || b.extractedData;
      const taxable = data.totals.taxable_value || 0;
      const gst = data.totals.gst_amount || 0;

      if (b.status === "verified") {
        summary.totalPurchases += taxable;
        summary.totalGst += gst;
      }

      const q = b.quarter || calculateQuarter(data.invoice.date);
      if (!summary.quarterlyStats[q]) {
        summary.quarterlyStats[q] = { count: 0, totalPurchases: 0, totalGst: 0 };
      }
      summary.quarterlyStats[q].count += 1;
      if (b.status === "verified") {
        summary.quarterlyStats[q].totalPurchases += taxable;
        summary.quarterlyStats[q].totalGst += gst;
      }
    }
  });

  // Calculate Outlet breakdown stats if Super Admin
  if (user.role === "super_admin") {
    const allBills = getBills();
    const statsMap: Record<string, OutletSummaryStats> = {};

    outlets.forEach((o) => {
      statsMap[o.id] = {
        outletId: o.id,
        outletName: o.name,
        totalBills: 0,
        pendingCount: 0,
        verifiedCount: 0,
        totalPurchases: 0,
        totalGst: 0
      };
    });

    allBills.forEach((b) => {
      if (b.outlet_id && statsMap[b.outlet_id]) {
        statsMap[b.outlet_id].totalBills += 1;
        if (b.status === "pending_review") statsMap[b.outlet_id].pendingCount += 1;
        if (b.status === "verified") {
          statsMap[b.outlet_id].verifiedCount += 1;
          const data = b.verifiedData || b.extractedData;
          statsMap[b.outlet_id].totalPurchases += data.totals.taxable_value || 0;
          statsMap[b.outlet_id].totalGst += data.totals.gst_amount || 0;
        }
      }
    });

    summary.outletStats = Object.values(statsMap);
  }

  res.json(summary);
});

// App settings endpoints
app.get("/api/settings", requireAuth, (_req, res) => {
  res.json(getAppSettings());
});

app.put("/api/settings", requireAuth, (req, res) => {
  const current = getAppSettings();
  const updated = { ...current, ...req.body };
  saveAppSettings(updated);
  res.json(updated);
});

// ---------------- BILL MANAGEMENT ROUTES ----------------

// List bills with filtering and Backend Isolation
app.get("/api/bills", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  let bills = getBills();

  const { status, quarter, year, search, outlet } = req.query;

  // Backend Isolation:
  if (user.role === "outlet_user") {
    bills = bills.filter((b) => b.outlet_id === user.outlet_id);
  } else if (outlet && outlet !== "ALL") {
    bills = bills.filter((b) => b.outlet_id === outlet);
  }

  if (status) {
    bills = bills.filter((b) => b.status === status);
  }
  if (quarter) {
    bills = bills.filter((b) => b.quarter === quarter);
  }
  if (year) {
    const yNum = parseInt(year as string, 10);
    if (!isNaN(yNum)) {
      bills = bills.filter((b) => b.year === yNum);
    }
  }
  if (search && typeof search === "string" && search.trim() !== "") {
    const q = search.trim().toLowerCase();
    bills = bills.filter((b) => {
      const data = b.verifiedData || b.extractedData;
      return (
        (data.supplier.name || "").toLowerCase().includes(q) ||
        (data.supplier.gstin || "").toLowerCase().includes(q) ||
        (data.invoice.number || "").toLowerCase().includes(q) ||
        (b.outlet_name || "").toLowerCase().includes(q) ||
        b.fileName.toLowerCase().includes(q)
      );
    });
  }

  bills.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());

  res.json(bills);
});

// Get single bill with isolation check
app.get("/api/bills/:id", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  const bills = getBills();
  const bill = bills.find((b) => b.id === req.params.id);

  if (!bill) {
    return res.status(404).json({ error: "Bill not found" });
  }

  // Backend Isolation Check:
  if (user.role === "outlet_user" && bill.outlet_id !== user.outlet_id) {
    return res.status(403).json({ error: "Access Denied: Bill belongs to another outlet." });
  }

  res.json(bill);
});

// AI Single Bill Extraction & Creation with Automatic Outlet Assignment
app.post("/api/bills/analyze", requireAuth, upload.single("billFile"), async (req, res) => {
  try {
    const user = (req as any).user as AuthUser;

    if (!req.file) {
      return res.status(400).json({ error: "No bill file uploaded." });
    }

    // Determine target outlet
    let targetOutletId = user.outlet_id;
    let targetOutletName = user.outlet_name;

    // If Super Admin uploaded and specified an outlet in body/headers, use it
    if (user.role === "super_admin" && req.body.outlet_id) {
      const outlets = getOutlets();
      const match = outlets.find((o) => o.id === req.body.outlet_id);
      if (match) {
        targetOutletId = match.id;
        targetOutletName = match.name;
      }
    }

    if (!targetOutletId) {
      const outlets = getOutlets();
      targetOutletId = outlets[0]?.id || "outlet-1";
      targetOutletName = outlets[0]?.name || "Male' Main Branch";
    }

    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    const mimeType = req.file.mimetype || (req.file.originalname.endsWith(".pdf") ? "application/pdf" : "image/jpeg");

    const ai = getGeminiClient();
    const settings = getAppSettings();

    let extractedData: ExtractedBillData | null = null;
    let confidence: FieldConfidence | null = null;
    let ocrAttempts = 0;
    let ocrErrorMsg: string | null = null;

    if (ai) {
      const runGeminiExtraction = async (retryNote?: string) => {
        ocrAttempts++;
        const promptText = `
You are an expert financial document extraction system specifically tuned for Maldivian purchase bills, receipts, invoices, and handwritten market purchase slips under MIRA (Maldives Inland Revenue Authority) Income Tax & GST Tax Rules.

Extract information from this image into the required JSON schema.

CRITICAL INSTRUCTIONS & RULES:
1. DOCUMENT TYPE CLASSIFICATION:
   - "TAX_INVOICE": Formal tax invoice with vendor GST details and tax calculations.
   - "INVOICE": Standard commercial invoice without explicit GST tax breakdown.
   - "RECEIPT": Till/POS store receipt or cash receipt slip.
   - "HANDWRITTEN_PURCHASE": Handwritten purchase note, paper slip, or local market handwritten bill.
   - "CASH_PURCHASE": Cash voucher or petty cash receipt.
   - "CAPITAL_EXPENDITURE": Purchase of long-term capital assets, machinery, commercial kitchen appliances, electronics, vehicles, or equipment > MVR 10,000.
   - "OTHER" / "UNKNOWN"

2. TAX STATUS CLASSIFICATION:
   - "TAX_CHARGED": GST/VAT is explicitly itemized as a separate amount or rate.
   - "TAX_INCLUDED": Document explicitly states "GST Included" / "Inclusive of Tax".
   - "NO_TAX": Handwritten slip, non-registered seller, cash purchase without GST.
   - "UNKNOWN"

3. MIRA SCHEDULE 1 CATEGORY CLASSIFICATION (Mandatory):
   Evaluate semantic context and item descriptions, then assign exact MIRA Schedule 1 category:
   - "Cost of Sales": Direct food ingredients, beverages, food packaging, raw ingredients for cooking/resale.
   - "Insurance Premium": Property insurance, inventory insurance, staff medical insurance.
   - "Professional & Consulting Fees": Audit, legal, tax advice, IT implementation, accounting software fees.
   - "Rental, Lease & License": Shop lease, restaurant rent, POS software licenses, trade licenses.
   - "Repairs & Maintenance": Equipment servicing, AC repair, kitchen hood cleaning, building maintenance.
   - "Related Party Expenses": Management fees or payments to directors, parent companies, or sister entities.
   - "Salaries & Wages": Staff payroll, allowances, service charge distribution, Ramadan allowance.
   - "Sales & Marketing": Social media ads, promos, flyers, branding design, signage.
   - "Other Expenses": Office stationery, cleaning chemicals, internet, electricity, water, general admin overhead.
   - "Capital Asset (Schedule 2)": Machinery, commercial refrigerators, ovens, espresso machines, computers, furniture, vehicles, or single item value > MVR 10,000.

4. TAX DISALLOWANCES & CAPITAL ASSET DETECTION:
   - mira_schedule1_category: Choose one of the exact Schedule 1 categories listed above.
   - accounting_treatment: "COST_OF_SALES" | "OPERATING_EXPENSE" | "CAPITAL_EXPENDITURE" | "NON_DEDUCTIBLE".
   - income_tax_treatment:
     - "DEDUCTIBLE_EXPENSE": Standard 100% tax-deductible operational expense.
     - "CAPITAL_ALLOWANCE": Capital expenditure eligible for MIRA Schedule 2 Capital Allowance depreciation.
     - "NON_DEDUCTIBLE": Fines, government penalties, MIRA tax penalties, personal/owner expenses, income tax payments.
     - "EXCLUDED": Non-operating transaction.
   - deductible_percentage: 100 for deductible operating expenses / capital allowance; 0 for fines, penalties, personal expenses, or income tax payments.
   - is_capital_asset: Set to true if the bill is for long-term equipment, machinery, electronics, furniture, or single items > MVR 10,000.

5. SEMANTIC FIELD MAPPING (Meaning > Exact Label):
   - document_number: Recognize "Invoice No", "Invoice #", "Inv #", "Bill No", "Bill #", "Receipt No", "Doc #", "Ref #", "Memo #", or handwritten reference.
   - supplier_name: Recognize "Supplier", "Vendor", "Seller", "Sold By", "Shop Name", "Company", "Store Name", or top header text.
   - supplier_tin: Vendor's GST Registration / Tax Identification Number (e.g. 1133533GST501).
     IMPORTANT: OUR TIN is "${settings.myTin}". If you see "${settings.myTin}" under "Bill To", "Customer", or "Buyer", that is OUR TIN! DO NOT put our TIN as the supplier TIN!
   - invoice_date: Format strictly as "DD MMM YYYY" (e.g., "08 AUG 2026").
   - FINANCIALS:
     - taxable_value: Subtotal in MVR (excluding tax if tax charged, or total subtotal if no tax). ALWAYS separate Input GST from net taxable subtotal for tax invoices.
     - gst_amount: Total GST charged in MVR (set to 0 or null if NO_TAX).
     - round_off: Rounding adjustment if present.
     - invoice_total: Final total payable amount in MVR.
   - LINE ITEMS: Extract line items if visible (description, quantity, unit, rate, taxable_value, gst_amount, total).

6. EVIDENCE RULES (HARD MANDATE):
   - ONLY extract values supported by text in the document.
   - NEVER invent TINs, invoice numbers, prices, or taxes. If absent or unreadable, return null.
   - For handwritten/non-tax bills, DO NOT fabricate GST or TIN! Set tax_status to "NO_TAX" and gst_amount to 0 or null.
${retryNote ? `\nRETRY FEEDBACK FROM PREVIOUS ATTEMPT: ${retryNote}\nRe-examine the image carefully for handwritten numbers, alternate labels, or subtotal totals.` : ''}
`;

        const imagePart = {
          inlineData: {
            mimeType,
            data: fileBuffer.toString("base64")
          }
        };

        const response = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: [imagePart, promptText],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                document_type: { type: Type.STRING },
                tax_status: { type: Type.STRING },
                expense_category: { type: Type.STRING },
                mira_schedule1_category: { type: Type.STRING, nullable: true },
                accounting_treatment: { type: Type.STRING, nullable: true },
                income_tax_treatment: { type: Type.STRING, nullable: true },
                deductible_percentage: { type: Type.NUMBER, nullable: true },
                is_capital_asset: { type: Type.BOOLEAN, nullable: true },
                supplier: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, nullable: true },
                    gstin: { type: Type.STRING, nullable: true },
                    address: { type: Type.STRING, nullable: true },
                    phone: { type: Type.STRING, nullable: true }
                  }
                },
                invoice: {
                  type: Type.OBJECT,
                  properties: {
                    number: { type: Type.STRING, nullable: true },
                    date: { type: Type.STRING, nullable: true },
                    po_number: { type: Type.STRING, nullable: true },
                    currency: { type: Type.STRING, nullable: true },
                    gst_type: { type: Type.STRING, nullable: true }
                  }
                },
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      description: { type: Type.STRING },
                      quantity: { type: Type.NUMBER, nullable: true },
                      unit: { type: Type.STRING, nullable: true },
                      rate: { type: Type.NUMBER, nullable: true },
                      discount: { type: Type.NUMBER, nullable: true },
                      taxable_value: { type: Type.NUMBER, nullable: true },
                      gst_rate: { type: Type.NUMBER, nullable: true },
                      gst_amount: { type: Type.NUMBER, nullable: true },
                      total: { type: Type.NUMBER, nullable: true }
                    }
                  }
                },
                totals: {
                  type: Type.OBJECT,
                  properties: {
                    taxable_value: { type: Type.NUMBER, nullable: true },
                    gst_amount: { type: Type.NUMBER, nullable: true },
                    round_off: { type: Type.NUMBER, nullable: true },
                    invoice_total: { type: Type.NUMBER, nullable: true }
                  }
                },
                confidence: {
                  type: Type.OBJECT,
                  properties: {
                    supplier_name: { type: Type.NUMBER },
                    supplier_tin: { type: Type.NUMBER },
                    invoice_number: { type: Type.NUMBER },
                    invoice_date: { type: Type.NUMBER },
                    taxable_value: { type: Type.NUMBER },
                    gst_amount: { type: Type.NUMBER },
                    invoice_total: { type: Type.NUMBER },
                    line_items: { type: Type.NUMBER },
                    overall: { type: Type.NUMBER }
                  }
                },
                notes: { type: Type.STRING, nullable: true }
              }
            }
          }
        });

        const rawJson = response.text ? response.text.trim() : "{}";
        const parsed = JSON.parse(rawJson);

        const docType = (parsed.document_type || "TAX_INVOICE").toUpperCase() as any;
        const taxStat = (parsed.tax_status || "TAX_CHARGED").toUpperCase() as any;
        const expCat = (parsed.expense_category || "Other") as any;

        const formattedDate = formatToMaldivianDate(parsed.invoice?.date || null);
        const taxDerived = deriveTaxTreatment(expCat, docType, parsed.notes);

        let miraCat = parsed.mira_schedule1_category || taxDerived.mira_schedule1_category;
        let acctTreat = parsed.accounting_treatment || taxDerived.accounting_treatment;
        let taxTreat = parsed.income_tax_treatment || taxDerived.income_tax_treatment;
        let dedPct = parsed.deductible_percentage ?? taxDerived.deductible_percentage;

        if (parsed.is_capital_asset || docType === 'CAPITAL_EXPENDITURE' || expCat === 'Equipment') {
          miraCat = 'Capital Asset (Schedule 2)';
          acctTreat = 'CAPITAL_EXPENDITURE';
          taxTreat = 'CAPITAL_ALLOWANCE';
          dedPct = 100;
        }

        const data: ExtractedBillData = {
          document_type: docType,
          tax_status: taxStat,
          expense_category: expCat,
          mira_schedule1_category: miraCat,
          accounting_treatment: acctTreat,
          income_tax_treatment: taxTreat,
          deductible_percentage: dedPct,
          supplier: {
            name: parsed.supplier?.name || null,
            gstin: parsed.supplier?.gstin || null,
            address: parsed.supplier?.address || null,
            phone: parsed.supplier?.phone || null
          },
          invoice: {
            number: parsed.invoice?.number || null,
            date: formattedDate || null,
            po_number: parsed.invoice?.po_number || null,
            currency: parsed.invoice?.currency || "MVR",
            gst_type: parsed.invoice?.gst_type || (taxStat === "NO_TAX" ? "Exempt / No Tax" : "GST 8%")
          },
          items: (parsed.items || []).map((item: any, idx: number) => ({
            id: `item-${idx + 1}`,
            description: item.description || "",
            quantity: item.quantity ?? null,
            unit: item.unit ?? null,
            rate: item.rate ?? null,
            discount: item.discount ?? null,
            taxable_value: item.taxable_value ?? null,
            gst_rate: item.gst_rate ?? (taxStat === "NO_TAX" ? 0 : settings.defaultGstRate),
            gst_amount: item.gst_amount ?? (taxStat === "NO_TAX" ? 0 : null),
            total: item.total ?? null
          })),
          totals: {
            taxable_value: parsed.totals?.taxable_value ?? null,
            gst_amount: taxStat === "NO_TAX" ? 0 : (parsed.totals?.gst_amount ?? null),
            round_off: parsed.totals?.round_off ?? 0,
            invoice_total: parsed.totals?.invoice_total ?? null
          },
          notes: parsed.notes || null
        };

        const conf: FieldConfidence = {
          supplier_name: parsed.confidence?.supplier_name ?? 85,
          supplier_tin: parsed.confidence?.supplier_tin ?? 85,
          invoice_number: parsed.confidence?.invoice_number ?? 85,
          invoice_date: parsed.confidence?.invoice_date ?? 85,
          taxable_value: parsed.confidence?.taxable_value ?? 85,
          gst_amount: parsed.confidence?.gst_amount ?? 85,
          invoice_total: parsed.confidence?.invoice_total ?? 85,
          line_items: parsed.confidence?.line_items ?? 80,
          overall: parsed.confidence?.overall ?? 85
        };

        return { data, conf };
      };

      try {
        // Attempt #1
        const res1 = await runGeminiExtraction();
        extractedData = res1.data;
        confidence = res1.conf;

        // Check if Attempt #1 has math errors or critical issues that justify Attempt #2
        const existingBills = getBills();
        const v1 = validateBill(extractedData, existingBills, undefined, targetOutletId);

        if (!v1.is_valid && ocrAttempts === 1) {
          const feedbackMsg = v1.issues.map((i) => i.message).join("; ");
          try {
            console.log("Validation issue on Attempt 1, running Intelligent Retry #2...", feedbackMsg);
            const res2 = await runGeminiExtraction(feedbackMsg);
            const v2 = validateBill(res2.data, existingBills, undefined, targetOutletId);
            // Use Attempt 2 if it improved validity
            if (v2.is_valid || v2.issues.length <= v1.issues.length) {
              extractedData = res2.data;
              confidence = res2.conf;
            }
          } catch (retryErr) {
            console.warn("OCR Retry failed, keeping Attempt 1 results:", retryErr);
          }
        }
      } catch (geminiErr: any) {
        console.warn("Gemini AI extraction error:", geminiErr);
        ocrErrorMsg = geminiErr.message || "Failed to parse document with Gemini AI.";
      }
    }

    // PHASE 9 MANDATE: REMOVE FAKE FALLBACK COMPLETELY!
    // Never invent fake MVR 1,000 / GST 80 / STO data.
    const isOcrSuccess = extractedData !== null;
    if (!extractedData) {
      const today = new Date();
      const dateFormatted = formatToMaldivianDate(today.toISOString());

      extractedData = {
        document_type: "UNKNOWN",
        tax_status: "UNKNOWN",
        expense_category: "Other",
        supplier: {
          name: null,
          gstin: null,
          address: null,
          phone: null
        },
        invoice: {
          number: null,
          date: dateFormatted,
          po_number: null,
          currency: "MVR",
          gst_type: "GST 8%"
        },
        items: [],
        totals: {
          taxable_value: null,
          gst_amount: null,
          round_off: 0,
          invoice_total: null
        },
        notes: `OCR Extraction Failed: ${ocrErrorMsg || 'Unable to parse document clearly'}. Please enter details manually.`
      };

      confidence = {
        supplier_name: 0,
        supplier_tin: 0,
        invoice_number: 0,
        invoice_date: 0,
        taxable_value: 0,
        gst_amount: 0,
        invoice_total: 0,
        line_items: 0,
        overall: 0
      };
    }

    const existingBills = getBills();
    const validation = validateBill(extractedData, existingBills, undefined, targetOutletId);

    const quarterStr = calculateQuarter(extractedData.invoice.date);
    const yearVal = parseInt(quarterStr.split("-")[0], 10) || new Date().getFullYear();

    const ocrStatus = !isOcrSuccess ? "FAILED" : validation.is_valid ? "VALIDATED" : "NEEDS_REVIEW";
    const needsReview = !validation.is_valid || !isOcrSuccess || confidence.overall < 80;

    let reviewReason: string | null = null;
    if (!isOcrSuccess) {
      reviewReason = "OCR processing failed to extract document details. Manual review and entry required.";
    } else if (validation.issues.length > 0) {
      reviewReason = validation.issues.map((i) => i.message).join(" ");
    } else if (confidence.overall < 80) {
      reviewReason = `Low OCR confidence (${confidence.overall}%). Please verify extracted numbers.`;
    }

    const newBill: BillRecord = {
      id: "bill-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      outlet_id: targetOutletId,
      outlet_name: targetOutletName,
      uploaded_by: {
        userId: user.id,
        userName: user.name,
        userEmail: user.email
      },
      fileName: req.file.originalname,
      fileType: mimeType,
      fileSize: req.file.size,
      fileUrl: `/uploads/${req.file.filename}`,
      uploadDate: new Date().toISOString(),
      status: (settings.autoApproveHighConfidence && confidence.overall >= 95 && validation.is_valid) ? "verified" : "pending_review",
      ocr_status: (settings.autoApproveHighConfidence && confidence.overall >= 95 && validation.is_valid) ? "APPROVED" : ocrStatus,
      ocr_attempts: Math.max(1, ocrAttempts),
      needs_review: needsReview,
      review_reason: reviewReason,
      extractedData,
      verifiedData: JSON.parse(JSON.stringify(extractedData)),
      confidence,
      validation,
      quarter: quarterStr,
      year: yearVal,
      updatedAt: new Date().toISOString(),
      audit_trail: [
        {
          date: new Date().toISOString(),
          action: "Bill Uploaded & Analyzed",
          performedBy: user.name,
          details: `Doc Type: ${extractedData.document_type}, Tax Status: ${extractedData.tax_status}, OCR Status: ${ocrStatus}, Attempts: ${Math.max(1, ocrAttempts)}`
        }
      ]
    };

    existingBills.push(newBill);
    saveBills(existingBills);

    res.json(newBill);
  } catch (error: any) {
    console.error("Error analyzing bill:", error);
    res.status(500).json({ error: error.message || "Failed to analyze purchase bill." });
  }
});

// Update single bill record with backend isolation check
app.put("/api/bills/:id", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  const { id } = req.params;
  const bills = getBills();
  const index = bills.findIndex((b) => b.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Bill not found" });
  }

  const current = bills[index];

  // Isolation Check:
  if (user.role === "outlet_user" && current.outlet_id !== user.outlet_id) {
    return res.status(403).json({ error: "Access Denied: Cannot modify bill from another outlet." });
  }

  const { verifiedData, status } = req.body;

  if (verifiedData) {
    current.verifiedData = verifiedData;
    current.quarter = calculateQuarter(verifiedData.invoice.date);
    current.year = parseInt(current.quarter.split("-")[0], 10) || new Date().getFullYear();
    current.validation = validateBill(verifiedData, bills, id, current.outlet_id);
  }

  if (status) {
    current.status = status;
    if (status === "verified") {
      current.ocr_status = "APPROVED";
      current.needs_review = false;
      current.review_reason = null;
    } else if (status === "rejected") {
      current.ocr_status = "FAILED";
      current.needs_review = false;
    }
  }

  if (!current.audit_trail) current.audit_trail = [];
  current.audit_trail.push({
    date: new Date().toISOString(),
    action: status === "verified" ? "Bill Approved & Verified" : status === "rejected" ? "Bill Rejected" : "Bill Data Updated",
    performedBy: user.name,
    details: `Updated status to ${current.status}. Doc type: ${current.verifiedData?.document_type || 'N/A'}`
  });

  current.updatedAt = new Date().toISOString();
  bills[index] = current;
  saveBills(bills);

  res.json(current);
});

// Delete bill with backend isolation check
app.delete("/api/bills/:id", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  const { id } = req.params;
  let bills = getBills();
  const bill = bills.find((b) => b.id === id);

  if (!bill) {
    return res.status(404).json({ error: "Bill not found" });
  }

  // Isolation Check:
  if (user.role === "outlet_user" && bill.outlet_id !== user.outlet_id) {
    return res.status(403).json({ error: "Access Denied: Cannot delete bill from another outlet." });
  }

  try {
    const filename = path.basename(bill.fileUrl);
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.error("Failed to delete file from disk", e);
  }

  bills = bills.filter((b) => b.id !== id);
  saveBills(bills);

  res.json({ success: true, message: "Bill deleted successfully" });
});

// ---------------- EXCEL TEMPLATE & EXPORT ----------------

app.get("/api/template/info", requireAuth, (_req, res) => {
  const hasCustom = fs.existsSync(TEMPLATE_EXCEL_FILE);
  let availableColumns: string[] = [];
  const settings = getAppSettings();

  if (hasCustom) {
    try {
      const fileBuffer = fs.readFileSync(TEMPLATE_EXCEL_FILE);
      const workbook = XLSX.read(fileBuffer, { type: "buffer" });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];
      const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (data.length > 0) {
        availableColumns = data[0].map((c) => String(c || "").trim()).filter(Boolean);
      }
    } catch (e) {
      console.error("Error reading template excel file", e);
    }
  }

  res.json({
    hasCustomTemplate: hasCustom,
    filename: hasCustom ? "custom_template.xlsx" : undefined,
    availableColumns,
    mapping: settings.templateMapping
  } as ExcelTemplateInfo);
});

app.post("/api/template/upload", requireAuth, upload.single("templateFile"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No Excel file provided." });
  }

  try {
    fs.copyFileSync(req.file.path, TEMPLATE_EXCEL_FILE);
    fs.unlinkSync(req.file.path);

    const templateBuffer = fs.readFileSync(TEMPLATE_EXCEL_FILE);
    const workbook = XLSX.read(templateBuffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const cols = (rows[0] || []).map((c) => String(c || "").trim()).filter(Boolean);

    res.json({
      success: true,
      message: "Template uploaded successfully",
      columns: cols
    });
  } catch (error: any) {
    console.error("Error reading template:", error);
    res.status(500).json({ error: "Invalid Excel template file." });
  }
});

// Excel Export API with Outlet Scope & Consolidation Support
app.post("/api/export/excel", requireAuth, (req, res) => {
  try {
    const user = (req as any).user as AuthUser;
    const { quarter, year, status, outlet: requestedOutlet } = req.body;
    let bills = getBills();

    // Backend Isolation:
    let effectiveOutlet = requestedOutlet;
    if (user.role === "outlet_user") {
      effectiveOutlet = user.outlet_id;
    }

    if (effectiveOutlet && effectiveOutlet !== "ALL") {
      bills = bills.filter((b) => b.outlet_id === effectiveOutlet);
    }

    if (status) {
      bills = bills.filter((b) => b.status === status);
    } else {
      bills = bills.filter((b) => b.status === "verified");
    }

    if (quarter) {
      bills = bills.filter((b) => b.quarter === quarter);
    }
    if (year) {
      const yNum = parseInt(year, 10);
      if (!isNaN(yNum)) {
        bills = bills.filter((b) => b.year === yNum);
      }
    }

    const settings = getAppSettings();
    const mapping = settings.templateMapping;
    const hasCustom = fs.existsSync(TEMPLATE_EXCEL_FILE);

    let workbook: any;
    let sheetName = "GST Purchases";

    if (hasCustom) {
      const templateBuffer = fs.readFileSync(TEMPLATE_EXCEL_FILE);
      workbook = XLSX.read(templateBuffer, { type: "buffer" });
      sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const existingRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const headers: string[] = (existingRows[0] || []).map((h) => String(h || "").trim());

      const newRows: any[][] = [];

      bills.forEach((b) => {
        const rowData = getRowForHeaders(headers, b, mapping);
        const rowArr = headers.map((h) => (rowData[h] !== undefined ? rowData[h] : ""));
        newRows.push(rowArr);
      });

      XLSX.utils.sheet_add_aoa(sheet, newRows, { origin: -1 });
    } else {
      workbook = XLSX.utils.book_new();

      const defaultHeaders = [
        "Outlet Name",
        "Supplier Name",
        "Supplier Tin",
        "Invoice Number",
        "Invoice Date",
        "Subtotal (Excl. GST)",
        "GST Amount (8%)",
        "Invoice Total",
        "Quarter",
        "Notes"
      ];

      const exportRows = bills.map((b) => getRowForHeaders(defaultHeaders, b, mapping));

      const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: defaultHeaders });
      worksheet["!cols"] = [
        { wch: 25 }, { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 15 },
        { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 25 }
      ];
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    }

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const filename = `CR_Maldives_GST_Purchases_${quarter || "Export"}_${Date.now()}.xlsx`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error: any) {
    console.error("Excel export error:", error);
    res.status(500).json({ error: "Failed to generate Excel file." });
  }
});

// Google Sheets Sync API
app.post("/api/export/google-sheets", requireAuth, (req, res) => {
  try {
    const user = (req as any).user as AuthUser;
    const { quarter, year, outlet: requestedOutlet } = req.body;
    let bills = getBills().filter((b) => b.status === "verified");

    if (user.role === "outlet_user") {
      bills = bills.filter((b) => b.outlet_id === user.outlet_id);
    } else if (requestedOutlet && requestedOutlet !== "ALL") {
      bills = bills.filter((b) => b.outlet_id === requestedOutlet);
    }

    if (quarter) {
      bills = bills.filter((b) => b.quarter === quarter);
    }
    if (year) {
      const yNum = parseInt(year, 10);
      if (!isNaN(yNum)) bills = bills.filter((b) => b.year === yNum);
    }

    const settings = getAppSettings();
    if (!settings.googleSheets.spreadsheetId) {
      return res.status(400).json({ error: "Google Spreadsheet ID is not configured." });
    }

    const defaultHeaders = [
      "Outlet Name",
      "Supplier Name",
      "Supplier Tin",
      "Invoice Number",
      "Invoice Date",
      "Subtotal (Excl. GST)",
      "GST Amount (8%)",
      "Invoice Total",
      "Quarter",
      "Notes"
    ];

    const rows = bills.map((b) => getRowForHeaders(defaultHeaders, b, settings.templateMapping));

    res.json({
      success: true,
      exportedCount: rows.length,
      spreadsheetId: settings.googleSheets.spreadsheetId,
      message: `Successfully synchronized ${rows.length} verified bill(s) to Google Sheets.`
    });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to sync with Google Sheets." });
  }
});

// ---------------- REVENUE & INCOME TAX ROUTES ----------------

// GET /api/revenue - List revenue entries
app.get("/api/revenue", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  let revenues = getRevenues();

  if (user.role === "outlet_user") {
    revenues = revenues.filter((r) => r.outlet_id === user.outlet_id);
  } else if (req.query.outlet && req.query.outlet !== "ALL") {
    revenues = revenues.filter((r) => r.outlet_id === req.query.outlet);
  }

  if (req.query.year) {
    const yNum = parseInt(req.query.year as string, 10);
    if (!isNaN(yNum)) {
      revenues = revenues.filter((r) => (r.year || new Date(r.date).getFullYear()) === yNum);
    }
  }

  // Ensure default/legacy fields populated
  revenues = revenues.map((r) => {
    const gross = r.gross_amount ?? r.amount ?? 0;
    const gst = r.gst_collected ?? 0;
    const net = r.net_revenue ?? (gross - gst);
    return {
      ...r,
      gross_amount: gross,
      gst_collected: gst,
      net_revenue: net,
      amount: net,
      notes: r.notes || r.description || "Sales Revenue"
    };
  });

  revenues.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  res.json(revenues);
});

// POST /api/revenue - Add a revenue entry (or bulk array)
app.post("/api/revenue", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  const outlets = getOutlets();

  const handleSingleEntry = (body: any): RevenueRecord => {
    const {
      id,
      outlet_id,
      date,
      category,
      gross_amount,
      gst_collected,
      net_revenue,
      amount,
      payment_method,
      notes,
      description
    } = body;

    let targetOutletId = outlet_id;
    let targetOutletName = "";

    if (user.role === "outlet_user") {
      targetOutletId = user.outlet_id;
      targetOutletName = user.outlet_name || "Branch Outlet";
    } else {
      const match = outlets.find((o) => o.id === targetOutletId);
      targetOutletName = match ? match.name : (outlets[0]?.name || "Main Branch");
    }

    const dStr = date || new Date().toISOString().split("T")[0];
    const grossVal = Number(gross_amount ?? amount ?? 0);
    const gstVal = Number(gst_collected ?? 0);
    const netVal = net_revenue !== undefined ? Number(net_revenue) : (grossVal - gstVal);

    const quarterStr = calculateQuarter(dStr);
    const yearVal = parseInt(quarterStr.split("-")[0], 10) || new Date(dStr).getFullYear();

    return {
      id: id || ("rev-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6)),
      outlet_id: targetOutletId,
      outlet_name: targetOutletName,
      date: dStr,
      category: category || "POS Sales",
      gross_amount: grossVal,
      gst_collected: gstVal,
      net_revenue: netVal,
      amount: netVal,
      payment_method: payment_method || "Card / POS",
      notes: notes || description || "Sales Revenue",
      description: notes || description || "Sales Revenue",
      quarter: quarterStr,
      year: yearVal,
      created_by: user.name,
      created_at: new Date().toISOString()
    };
  };

  const revenues = getRevenues();

  if (Array.isArray(req.body)) {
    const newEntries = req.body.map((item) => handleSingleEntry(item));
    const updatedRevenues = [...newEntries, ...revenues];
    saveRevenues(updatedRevenues);
    return res.json({ success: true, count: newEntries.length, entries: newEntries });
  }

  const { date, gross_amount, net_revenue, amount } = req.body;
  if (!date || (gross_amount === undefined && net_revenue === undefined && amount === undefined)) {
    return res.status(400).json({ error: "Date and gross_amount/net_revenue are required." });
  }

  const newRevenue = handleSingleEntry(req.body);
  revenues.unshift(newRevenue);
  saveRevenues(revenues);

  res.json(newRevenue);
});

// PUT /api/revenue/:id - Edit an existing revenue entry
app.put("/api/revenue/:id", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  const { id } = req.params;
  const revenues = getRevenues();
  const index = revenues.findIndex((r) => r.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Revenue entry not found." });
  }

  const existing = revenues[index];
  if (user.role === "outlet_user" && existing.outlet_id !== user.outlet_id) {
    return res.status(403).json({ error: "Access Denied: Cannot edit revenue from another outlet." });
  }

  const {
    outlet_id,
    date,
    category,
    gross_amount,
    gst_collected,
    net_revenue,
    payment_method,
    notes,
    description
  } = req.body;

  const outlets = getOutlets();
  let targetOutletId = existing.outlet_id;
  let targetOutletName = existing.outlet_name;

  if (user.role !== "outlet_user" && outlet_id) {
    targetOutletId = outlet_id;
    const match = outlets.find((o) => o.id === outlet_id);
    targetOutletName = match ? match.name : targetOutletName;
  }

  const dStr = date || existing.date;
  const grossVal = gross_amount !== undefined ? Number(gross_amount) : (existing.gross_amount ?? existing.amount ?? 0);
  const gstVal = gst_collected !== undefined ? Number(gst_collected) : (existing.gst_collected ?? 0);
  const netVal = net_revenue !== undefined ? Number(net_revenue) : (grossVal - gstVal);

  const quarterStr = calculateQuarter(dStr);
  const yearVal = parseInt(quarterStr.split("-")[0], 10) || new Date(dStr).getFullYear();

  const updated: RevenueRecord = {
    ...existing,
    outlet_id: targetOutletId,
    outlet_name: targetOutletName,
    date: dStr,
    category: category || existing.category,
    gross_amount: grossVal,
    gst_collected: gstVal,
    net_revenue: netVal,
    amount: netVal,
    payment_method: payment_method || existing.payment_method,
    notes: notes || description || existing.notes || existing.description,
    description: notes || description || existing.description || existing.notes,
    quarter: quarterStr,
    year: yearVal
  };

  revenues[index] = updated;
  saveRevenues(revenues);

  res.json(updated);
});

// DELETE /api/revenue/:id - Delete a revenue entry
app.delete("/api/revenue/:id", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  const { id } = req.params;
  let revenues = getRevenues();
  const rev = revenues.find((r) => r.id === id);

  if (!rev) {
    return res.status(404).json({ error: "Revenue record not found" });
  }

  if (user.role === "outlet_user" && rev.outlet_id !== user.outlet_id) {
    return res.status(403).json({ error: "Access Denied: Cannot delete revenue record from another outlet." });
  }

  revenues = revenues.filter((r) => r.id !== id);
  saveRevenues(revenues);

  res.json({ success: true, message: "Revenue entry deleted successfully" });
});

// ================= FIXED ASSET REGISTER & CAPITAL ALLOWANCE ROUTES =================

// GET /api/assets - Get fixed asset register items
app.get("/api/assets", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  let assets = getAssets();

  if (user.role === "outlet_user") {
    assets = assets.filter((a) => a.outlet_id === user.outlet_id);
  } else if (req.query.outlet && req.query.outlet !== "ALL") {
    assets = assets.filter((a) => a.outlet_id === req.query.outlet);
  }

  if (req.query.year) {
    const yNum = parseInt(req.query.year as string, 10);
    if (!isNaN(yNum)) {
      assets = assets.filter((a) => new Date(a.purchase_date).getFullYear() === yNum);
    }
  }

  assets.sort((a, b) => new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime());

  res.json(assets);
});

// POST /api/assets - Add fixed asset entry (or bulk array)
app.post("/api/assets", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  const outlets = getOutlets();

  const handleSingleAsset = (body: any): FixedAssetRecord => {
    const {
      id,
      outlet_id,
      asset_name,
      asset_class,
      purchase_date,
      cost_price,
      mira_rate,
      opening_wdv,
      supplier,
      notes,
      bill_id
    } = body;

    let targetOutletId = outlet_id;
    let targetOutletName = "";

    if (user.role === "outlet_user") {
      targetOutletId = user.outlet_id;
      targetOutletName = user.outlet_name || "Branch Outlet";
    } else {
      const match = outlets.find((o) => o.id === targetOutletId);
      targetOutletName = match ? match.name : (outlets[0]?.name || "Main Branch");
    }

    const aClass: AssetClass = asset_class || 'Plant & Equipment / Machinery';
    const stdRate = mira_rate !== undefined ? Number(mira_rate) : (MIRA_CAPITAL_ALLOWANCE_RATES[aClass] || 10);
    const costNum = Number(cost_price || 0);
    const openWdv = opening_wdv !== undefined ? Number(opening_wdv) : costNum;

    const allowance = Math.min(openWdv, Number((openWdv * (stdRate / 100)).toFixed(2)));
    const closeWdv = Number((openWdv - allowance).toFixed(2));

    return {
      id: id || ("ast-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6)),
      outlet_id: targetOutletId,
      outlet_name: targetOutletName,
      asset_name: asset_name || "Capital Asset",
      asset_class: aClass,
      purchase_date: purchase_date || new Date().toISOString().split("T")[0],
      cost_price: costNum,
      mira_rate: stdRate,
      opening_wdv: openWdv,
      capital_allowance: allowance,
      closing_wdv: closeWdv,
      supplier: supplier || "",
      notes: notes || "",
      bill_id: bill_id || "",
      created_at: new Date().toISOString()
    };
  };

  const assets = getAssets();

  if (Array.isArray(req.body)) {
    const newAssets = req.body.map((item) => handleSingleAsset(item));
    const updated = [...newAssets, ...assets];
    saveAssets(updated);
    return res.json({ success: true, count: newAssets.length, entries: newAssets });
  }

  const newAsset = handleSingleAsset(req.body);
  assets.unshift(newAsset);
  saveAssets(assets);

  res.json(newAsset);
});

// POST /api/assets/import-from-bills - Automatically register Capital Expenditure bills into asset register
app.post("/api/assets/import-from-bills", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  const bills = getBills();
  const existingAssets = getAssets();
  const outlets = getOutlets();

  let importedCount = 0;
  const created: FixedAssetRecord[] = [];

  bills.forEach((b) => {
    if (b.status === "rejected") return;
    const data = b.verifiedData || b.extractedData;

    const isCapEx =
      data.document_type === "CAPITAL_EXPENDITURE" ||
      data.mira_schedule1_category === "Capital Asset (Schedule 2)" ||
      data.income_tax_treatment === "CAPITAL_ALLOWANCE";

    if (isCapEx) {
      // Check if already registered
      const alreadyExists = existingAssets.some((a) => a.bill_id === b.id);
      if (!alreadyExists) {
        let outletName = b.outlet_name || "";
        const matchOutlet = outlets.find((o) => o.id === b.outlet_id);
        if (matchOutlet) outletName = matchOutlet.name;

        const costVal = data.totals?.taxable_value || data.totals?.invoice_total || 0;
        const aClass: AssetClass = 'Plant & Equipment / Machinery';
        const stdRate = MIRA_CAPITAL_ALLOWANCE_RATES[aClass] || 10;
        const allowance = Number((costVal * (stdRate / 100)).toFixed(2));
        const closeWdv = Number((costVal - allowance).toFixed(2));

        const invNum = data.invoice?.number || (data.invoice as any)?.invoice_number || "Invoice Purchase";
        const newAsset: FixedAssetRecord = {
          id: "ast-bill-" + b.id.slice(0, 8),
          outlet_id: b.outlet_id,
          outlet_name: outletName,
          asset_name: (data.supplier?.name || "Equipment") + " - " + invNum,
          asset_class: aClass,
          purchase_date: data.invoice?.date || b.uploadDate.split("T")[0],
          cost_price: costVal,
          mira_rate: stdRate,
          opening_wdv: costVal,
          capital_allowance: allowance,
          closing_wdv: closeWdv,
          bill_id: b.id,
          supplier: data.supplier?.name || "",
          notes: `Imported from purchase bill #${invNum}`,
          created_at: new Date().toISOString()
        };

        existingAssets.unshift(newAsset);
        created.push(newAsset);
        importedCount++;
      }
    }
  });

  if (importedCount > 0) {
    saveAssets(existingAssets);
  }

  res.json({ success: true, count: importedCount, created });
});

// PUT /api/assets/:id - Update an existing asset entry
app.put("/api/assets/:id", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  const { id } = req.params;
  const assets = getAssets();
  const index = assets.findIndex((a) => a.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Fixed asset record not found." });
  }

  const existing = assets[index];
  if (user.role === "outlet_user" && existing.outlet_id !== user.outlet_id) {
    return res.status(403).json({ error: "Access Denied: Cannot edit assets from another outlet." });
  }

  const {
    outlet_id,
    asset_name,
    asset_class,
    purchase_date,
    cost_price,
    mira_rate,
    opening_wdv,
    supplier,
    notes
  } = req.body;

  const outlets = getOutlets();
  let targetOutletId = existing.outlet_id;
  let targetOutletName = existing.outlet_name;

  if (user.role !== "outlet_user" && outlet_id) {
    targetOutletId = outlet_id;
    const match = outlets.find((o) => o.id === outlet_id);
    targetOutletName = match ? match.name : targetOutletName;
  }

  const aClass: AssetClass = asset_class || existing.asset_class;
  const stdRate = mira_rate !== undefined ? Number(mira_rate) : (MIRA_CAPITAL_ALLOWANCE_RATES[aClass] || existing.mira_rate);
  const costNum = cost_price !== undefined ? Number(cost_price) : existing.cost_price;
  const openWdv = opening_wdv !== undefined ? Number(opening_wdv) : existing.opening_wdv;

  const allowance = Math.min(openWdv, Number((openWdv * (stdRate / 100)).toFixed(2)));
  const closeWdv = Number((openWdv - allowance).toFixed(2));

  const updated: FixedAssetRecord = {
    ...existing,
    outlet_id: targetOutletId,
    outlet_name: targetOutletName,
    asset_name: asset_name || existing.asset_name,
    asset_class: aClass,
    purchase_date: purchase_date || existing.purchase_date,
    cost_price: costNum,
    mira_rate: stdRate,
    opening_wdv: openWdv,
    capital_allowance: allowance,
    closing_wdv: closeWdv,
    supplier: supplier !== undefined ? supplier : existing.supplier,
    notes: notes !== undefined ? notes : existing.notes
  };

  assets[index] = updated;
  saveAssets(assets);

  res.json(updated);
});

// DELETE /api/assets/:id - Delete a fixed asset record
app.delete("/api/assets/:id", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  const { id } = req.params;
  let assets = getAssets();
  const ast = assets.find((a) => a.id === id);

  if (!ast) {
    return res.status(404).json({ error: "Fixed asset record not found" });
  }

  if (user.role === "outlet_user" && ast.outlet_id !== user.outlet_id) {
    return res.status(403).json({ error: "Access Denied: Cannot delete asset record from another outlet." });
  }

  assets = assets.filter((a) => a.id !== id);
  saveAssets(assets);

  res.json({ success: true, message: "Fixed asset record deleted successfully" });
});

// Helper function for MIRA 604 & Schedule 1 Tax Computation
function generateTaxReportHelper(reqYear: number, requestedOutlet: string): Mira604Summary {
  const settings = getAppSettings();

  // 1. Gather Revenues
  let revenues = getRevenues().filter((r) => (r.year || new Date(r.date).getFullYear()) === reqYear);
  if (requestedOutlet !== "ALL") {
    revenues = revenues.filter((r) => r.outlet_id === requestedOutlet);
  }
  const totalRevenue = revenues.reduce((sum, r) => {
    const net = r.net_revenue ?? (r.gross_amount ? r.gross_amount - (r.gst_collected || 0) : r.amount) ?? 0;
    return sum + net;
  }, 0);

  // 2. Gather Bills
  let bills = getBills().filter((b) => b.year === reqYear && b.status !== "rejected");
  if (requestedOutlet !== "ALL") {
    bills = bills.filter((b) => b.outlet_id === requestedOutlet);
  }

  const schedule1: Record<MiraSchedule1Category, number> = {
    'Cost of Sales': 0,
    'Insurance Premium': 0,
    'Professional & Consulting Fees': 0,
    'Rental, Lease & License': 0,
    'Repairs & Maintenance': 0,
    'Related Party Expenses': 0,
    'Salaries & Wages': 0,
    'Sales & Marketing': 0,
    'Other Expenses': 0,
    'Capital Asset (Schedule 2)': 0
  };

  let nonDeductibleAddbacks = 0;
  let unverifiedCount = 0;
  let unclassifiedCount = 0;

  bills.forEach((b) => {
    if (b.status === "pending_review" || b.needs_review || !b.verifiedData) {
      unverifiedCount++;
    }

    const data = b.verifiedData || b.extractedData;
    const cat = data.mira_schedule1_category || 'Other Expenses';
    if (!data.mira_schedule1_category || cat === 'Other Expenses') {
      unclassifiedCount++;
    }

    const subtotal = data.totals?.taxable_value || data.totals?.invoice_total || 0;
    const dedPct = data.deductible_percentage ?? 100;

    if (schedule1[cat] !== undefined) {
      schedule1[cat] += subtotal;
    } else {
      schedule1['Other Expenses'] += subtotal;
    }

    if (data.income_tax_treatment === 'NON_DEDUCTIBLE' || dedPct === 0) {
      nonDeductibleAddbacks += subtotal;
    } else if (dedPct < 100) {
      const nonDedPortion = subtotal * ((100 - dedPct) / 100);
      nonDeductibleAddbacks += nonDedPortion;
    }
  });

  // 3. Check for missing revenue months
  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const activeMonths = new Set<number>();
  revenues.forEach((r) => {
    const d = new Date(r.date);
    if (!isNaN(d.getTime())) {
      activeMonths.add(d.getMonth());
    }
  });

  const missingRevenueMonths: string[] = [];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

  for (let m = 0; m < 12; m++) {
    if (reqYear < currentYear || (reqYear === currentYear && m <= currentMonth)) {
      if (!activeMonths.has(m)) {
        missingRevenueMonths.push(MONTH_NAMES[m]);
      }
    }
  }

  // 4. Gather Capital Allowances from Fixed Asset Register
  let assets = getAssets();
  if (requestedOutlet !== "ALL") {
    assets = assets.filter((a) => a.outlet_id === requestedOutlet);
  }
  const totalCapitalAllowance = assets.reduce((sum, a) => sum + (a.capital_allowance || 0), 0);

  const costOfSales = schedule1['Cost of Sales'];
  const grossProfit = totalRevenue - costOfSales;

  const totalOperatingExpenses =
    schedule1['Insurance Premium'] +
    schedule1['Professional & Consulting Fees'] +
    schedule1['Rental, Lease & License'] +
    schedule1['Repairs & Maintenance'] +
    schedule1['Related Party Expenses'] +
    schedule1['Salaries & Wages'] +
    schedule1['Sales & Marketing'] +
    schedule1['Other Expenses'];

  const netAccountingProfit = grossProfit - totalOperatingExpenses;
  const taxableIncome = Math.max(0, netAccountingProfit + nonDeductibleAddbacks - totalCapitalAllowance);

  // 5. Tax Bracket Engine based on Entity Profile
  const profile = settings.taxpayerProfile || 'COMPANY';
  let estimatedTax = 0;
  let bracketsApplied = '';

  if (profile === 'COMPANY') {
    if (taxableIncome > 500000) {
      estimatedTax = (taxableIncome - 500000) * 0.15;
      bracketsApplied = 'Company Rate: 0% on first MVR 500,000; 15% on excess (MVR ' + (taxableIncome - 500000).toLocaleString() + ')';
    } else {
      estimatedTax = 0;
      bracketsApplied = 'Company Rate: 0% (Taxable Income ≤ MVR 500,000)';
    }
  } else {
    let remaining = taxableIncome;
    let tax = 0;

    if (remaining > 2400000) {
      tax += (remaining - 2400000) * 0.15;
      remaining = 2400000;
    }
    if (remaining > 1800000) {
      tax += (remaining - 1800000) * 0.12;
      remaining = 1800000;
    }
    if (remaining > 1200000) {
      tax += (remaining - 1200000) * 0.08;
      remaining = 1200000;
    }
    if (remaining > 720000) {
      tax += (remaining - 720000) * 0.055;
    }
    estimatedTax = tax;
    bracketsApplied = 'Sole Proprietor Progressive Individual Brackets (Exempt up to MVR 720,000; 5.5% to 15% tiers)';
  }

  const warnings: string[] = [];
  if (unverifiedCount > 0) {
    warnings.push(`${unverifiedCount} purchase invoice(s) are unverified or awaiting approval.`);
  }
  if (missingRevenueMonths.length > 0) {
    warnings.push(`No sales logged for ${missingRevenueMonths.length} month(s): ${missingRevenueMonths.slice(0, 4).join(', ')}${missingRevenueMonths.length > 4 ? '...' : ''}.`);
  }
  if (unclassifiedCount > 0) {
    warnings.push(`${unclassifiedCount} expense document(s) categorized under default 'Other Expenses'.`);
  }

  const auditChecks: TaxAuditCheck = {
    unverified_documents_count: unverifiedCount,
    missing_revenue_months: missingRevenueMonths,
    unclassified_expenses_count: unclassifiedCount,
    audit_warnings: warnings,
    is_audit_passed: warnings.length === 0
  };

  return {
    taxpayer_profile: profile,
    accounting_basis: settings.accountingBasis || 'ACCRUAL',
    year: reqYear,
    outlet_id: requestedOutlet,
    revenue: totalRevenue,
    cost_of_sales: costOfSales,
    gross_profit: grossProfit,
    operating_expenses: totalOperatingExpenses,
    schedule1_breakdown: schedule1,
    net_accounting_profit: netAccountingProfit,
    non_deductible_addbacks: nonDeductibleAddbacks,
    total_capital_allowances: totalCapitalAllowance,
    taxable_income: taxableIncome,
    estimated_income_tax: estimatedTax,
    tax_brackets_applied: bracketsApplied,
    total_bills_analyzed: bills.length,
    total_revenue_entries: revenues.length,
    audit_checks: auditChecks
  };
}

// GET /api/reports/income-tax - Generate MIRA 604 & Schedule 1 Summary Report
app.get("/api/reports/income-tax", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  const reqYear = parseInt(req.query.year as string, 10) || new Date().getFullYear();
  let requestedOutlet = (req.query.outlet_id as string) || (req.query.outlet as string) || "ALL";

  if (user.role === "outlet_user") {
    requestedOutlet = user.outlet_id || "ALL";
  }

  const summary = generateTaxReportHelper(reqYear, requestedOutlet);
  res.json(summary);
});

// GET /api/tax-report/:year - Dedicated MIRA 604 Tax Preparation Computation Route
app.get("/api/tax-report/:year", requireAuth, (req, res) => {
  const user = (req as any).user as AuthUser;
  const reqYear = parseInt(req.params.year, 10) || new Date().getFullYear();
  let requestedOutlet = (req.query.outlet_id as string) || (req.query.outlet as string) || "ALL";

  if (user.role === "outlet_user") {
    requestedOutlet = user.outlet_id || "ALL";
  }

  const summary = generateTaxReportHelper(reqYear, requestedOutlet);
  res.json(summary);
});

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Express Error Handler:", err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({
    error: err.message || "An unexpected server error occurred."
  });
});

// Setup Vite Middleware / Static
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Maldivian Multi-Outlet GST App server running on http://0.0.0.0:${PORT}`);
  });
}

start();
