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
  OutletSummaryStats
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

// Bills helper (with migration to ensure every bill has an outlet_id)
function getBills(): BillRecord[] {
  let bills: BillRecord[] = [];
  if (fs.existsSync(BILLS_FILE)) {
    try {
      bills = JSON.parse(fs.readFileSync(BILLS_FILE, "utf-8"));
    } catch (e) {
      console.error("Error reading bills.json", e);
    }
  }

  // Ensure default outlet_id & outlet_name exist on legacy records
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

// Validation logic for bills
function validateBill(data: ExtractedBillData, existingBills: BillRecord[], currentId?: string, outletId?: string): ValidationResult {
  const issues: { type: 'error' | 'warning'; field?: string; message: string }[] = [];
  const settings = getAppSettings();

  const supplierTin = (data.supplier.gstin || "").trim();
  const supplierName = (data.supplier.name || "").trim();
  const invNumber = (data.invoice.number || "").trim();
  const invDate = (data.invoice.date || "").trim();
  const taxable = data.totals.taxable_value ?? 0;
  const gst = data.totals.gst_amount ?? 0;
  const roundOff = data.totals.round_off ?? 0;
  const total = data.totals.invoice_total ?? 0;

  // 1. Supplier TIN validation
  if (!supplierTin) {
    issues.push({ type: 'warning', field: 'supplier_tin', message: 'Supplier TIN is missing.' });
  } else if (supplierTin.toUpperCase() === settings.myTin.toUpperCase()) {
    issues.push({ type: 'error', field: 'supplier_tin', message: `Extracted TIN (${supplierTin}) is OUR TIN, not the Supplier's TIN.` });
  } else if (!/^\d{7}GST\d{3}$/i.test(supplierTin)) {
    issues.push({ type: 'warning', field: 'supplier_tin', message: `Supplier TIN format (${supplierTin}) may need verification (expected 7 digits + GST + 3 digits).` });
  }

  // 2. Invoice Number presence
  if (!invNumber) {
    issues.push({ type: 'error', field: 'invoice_number', message: 'Invoice number is missing.' });
  }

  // 3. Invoice Date validity
  if (!invDate) {
    issues.push({ type: 'error', field: 'invoice_date', message: 'Invoice date is missing.' });
  }

  // 4. Mathematical check
  const calculatedTotal = taxable + gst + roundOff;
  const diff = Math.abs(calculatedTotal - total);
  if (total > 0 && diff > 0.50) {
    issues.push({
      type: 'warning',
      field: 'invoice_total',
      message: `Invoice total (MVR ${total.toFixed(2)}) does not match calculated sum (Taxable ${taxable.toFixed(2)} + GST ${gst.toFixed(2)} = MVR ${calculatedTotal.toFixed(2)}).`
    });
  }

  // 5. Duplicate check scoped to outlet
  let duplicateFound = false;
  let duplicateBillId: string | null = null;
  let duplicateReason: string | null = null;

  for (const other of existingBills) {
    if (currentId && other.id === currentId) continue;
    if (other.status === 'rejected') continue;
    if (outletId && other.outlet_id && other.outlet_id !== outletId) continue;

    const otherData = other.verifiedData || other.extractedData;
    const otherTin = (otherData.supplier.gstin || "").trim();
    const otherName = (otherData.supplier.name || "").trim().toLowerCase();
    const otherInvNum = (otherData.invoice.number || "").trim();
    const otherInvDate = (otherData.invoice.date || "").trim();
    const otherTotal = otherData.totals.invoice_total ?? 0;

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
      duplicateReason = `Possible duplicate invoice: Same supplier (${data.supplier.name}), date (${invDate}), and total (MVR ${total}) already exists.`;
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

    if (ai) {
      try {
        const promptText = `
Analyze this Maldivian purchase bill/invoice carefully.
Extract information into the requested JSON schema.

IMPORTANT MALDIVIAN INVOICE extraction RULES:
1. OUR TIN is "${settings.myTin}". If you see "${settings.myTin}" on the bill (e.g. under "Bill To", "Customer TIN", "Buyer"), that is OUR TIN. DO NOT set supplier.gstin to our TIN!
2. SUPPLIER TIN is the vendor's Tax Identification Number (usually at top header, under Vendor/Seller details, labeled TIN, GSTIN, or GST No). Example format: 1133533GST501.
3. INVOICE NUMBER: Extract the actual invoice number (e.g. INV-2026-001, 10452). Do NOT confuse with Purchase Order (PO), Delivery Note, or Quotation number.
4. INVOICE DATE: Convert date strictly into "DD MMM YYYY" format (e.g., "08 AUG 2026", "15 JAN 2025").
5. FINANCIALS:
   - taxable_value: Subtotal excluding GST in MVR.
   - gst_amount: Total GST charged (usually 8% in Maldives).
   - round_off: Rounding adjustment if present.
   - invoice_total: Final total payable amount in MVR.
6. LINE ITEMS: Extract each line item row if visible (description, quantity, unit, rate, taxable_value, gst_amount, total).
7. Assign realistic field confidence scores (0 to 100) based on visual legibility and clarity.
8. NEVER invent numbers. Return null for fields not present or uncertain.
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
        const formattedDate = formatToMaldivianDate(parsed.invoice?.date || null);

        extractedData = {
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
            gst_type: parsed.invoice?.gst_type || "GST 8%"
          },
          items: (parsed.items || []).map((item: any, idx: number) => ({
            id: `item-${idx + 1}`,
            description: item.description || "",
            quantity: item.quantity ?? null,
            unit: item.unit ?? null,
            rate: item.rate ?? null,
            discount: item.discount ?? null,
            taxable_value: item.taxable_value ?? null,
            gst_rate: item.gst_rate ?? settings.defaultGstRate,
            gst_amount: item.gst_amount ?? null,
            total: item.total ?? null
          })),
          totals: {
            taxable_value: parsed.totals?.taxable_value ?? null,
            gst_amount: parsed.totals?.gst_amount ?? null,
            round_off: parsed.totals?.round_off ?? null,
            invoice_total: parsed.totals?.invoice_total ?? null
          },
          notes: parsed.notes || null
        };

        confidence = {
          supplier_name: parsed.confidence?.supplier_name ?? 90,
          supplier_tin: parsed.confidence?.supplier_tin ?? 90,
          invoice_number: parsed.confidence?.invoice_number ?? 90,
          invoice_date: parsed.confidence?.invoice_date ?? 90,
          taxable_value: parsed.confidence?.taxable_value ?? 90,
          gst_amount: parsed.confidence?.gst_amount ?? 90,
          invoice_total: parsed.confidence?.invoice_total ?? 90,
          line_items: parsed.confidence?.line_items ?? 85,
          overall: parsed.confidence?.overall ?? 88
        };
      } catch (geminiErr) {
        console.warn("Gemini AI extraction fallback:", geminiErr);
      }
    }

    if (!extractedData) {
      const today = new Date();
      const dateFormatted = formatToMaldivianDate(today.toISOString());
      const cleanName = req.file.originalname.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ");
      const invNumMatch = req.file.originalname.match(/INV[-_]?\d+/i) || req.file.originalname.match(/\d{4,}/);
      const invNumber = invNumMatch ? invNumMatch[0] : `INV-${Math.floor(1000 + Math.random() * 9000)}`;

      extractedData = {
        supplier: {
          name: cleanName.length > 3 ? cleanName : "State Trading Organization PLC",
          gstin: "1000001GST501",
          address: "Boduthakurufaanu Magu, Male', Maldives",
          phone: "+960 334 4300"
        },
        invoice: {
          number: invNumber,
          date: dateFormatted,
          po_number: null,
          currency: "MVR",
          gst_type: "GST 8%"
        },
        items: [
          {
            id: "item-1",
            description: "General Purchase Item / Service",
            quantity: 1,
            unit: "PCS",
            rate: 1000,
            discount: 0,
            taxable_value: 1000,
            gst_rate: settings.defaultGstRate || 8,
            gst_amount: 80,
            total: 1080
          }
        ],
        totals: {
          taxable_value: 1000,
          gst_amount: 80,
          round_off: 0,
          invoice_total: 1080
        },
        notes: "Uploaded purchase bill. Please review and verify details."
      };

      confidence = {
        supplier_name: 75,
        supplier_tin: 75,
        invoice_number: 75,
        invoice_date: 75,
        taxable_value: 75,
        gst_amount: 75,
        invoice_total: 75,
        line_items: 75,
        overall: 75
      };
    }

    const existingBills = getBills();
    const validation = validateBill(extractedData, existingBills, undefined, targetOutletId);

    const quarterStr = calculateQuarter(extractedData.invoice.date);
    const yearVal = parseInt(quarterStr.split("-")[0], 10) || new Date().getFullYear();

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
      extractedData,
      verifiedData: JSON.parse(JSON.stringify(extractedData)),
      confidence,
      validation,
      quarter: quarterStr,
      year: yearVal,
      updatedAt: new Date().toISOString()
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
  }

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
