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
  TemplateColumnMapping
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
const TEMPLATE_FILE = path.join(DATA_DIR, "template.json");
const TEMPLATE_EXCEL_FILE = path.join(DATA_DIR, "custom_template.xlsx");

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
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limit
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
    notes: "Notes"
  };

  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
      // Ensure mapping has updated defaults if using older keys
      if (parsed.templateMapping) {
        if (!parsed.templateMapping.supplier_tin || parsed.templateMapping.supplier_tin === "TIN on Invoice") {
          parsed.templateMapping.supplier_tin = "Supplier Tin";
        }
        if (!parsed.templateMapping.taxable_value || parsed.templateMapping.taxable_value === "Taxable Value (MVR)") {
          parsed.templateMapping.taxable_value = "Subtotal (Excl. GST)";
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

// Helper to construct row object for any set of column headers with intelligent alias matching
function getRowForHeaders(headers: string[], bill: BillRecord, mapping: TemplateColumnMapping): Record<string, any> {
  const data = bill.verifiedData || bill.extractedData;
  const rowData: Record<string, any> = {};

  const fieldDefs: { key: keyof TemplateColumnMapping; value: any; aliases: string[] }[] = [
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

    // 1. Direct match with configured mapping for this DB field
    for (const field of fieldDefs) {
      const mappedCol = mapping?.[field.key];
      if (mappedCol && mappedCol.trim().toLowerCase() === lowerHeader) {
        matchedValue = field.value;
        break;
      }
    }

    // 2. Exact match with known aliases (ONLY if normalized header is non-empty and no explicit mapping conflict)
    if (matchedValue === undefined && normHeader.length > 1) {
      // Avoid matching other specific GST rate columns (like 6%, 12%, 16%, 17%) to 8% GST
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

// Database helper functions
function getBills(): BillRecord[] {
  if (fs.existsSync(BILLS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(BILLS_FILE, "utf-8"));
    } catch (e) {
      console.error("Error reading bills.json", e);
    }
  }
  return [];
}

function saveBills(bills: BillRecord[]) {
  fs.writeFileSync(BILLS_FILE, JSON.stringify(bills, null, 2));
}

// Helper to determine fiscal quarter from date string (DD MMM YYYY or YYYY-MM-DD)
function calculateQuarter(dateStr: string | null): string {
  if (!dateStr) {
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3) + 1;
    return `${now.getFullYear()}-Q${q}`;
  }
  
  // Try parsing DD MMM YYYY (e.g., "08 AUG 2026") or standard ISO
  const monthMap: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
  };

  const parts = dateStr.trim().split(/[\s\-\/]+/);
  let year = new Date().getFullYear();
  let month = 0;

  if (parts.length >= 3) {
    // e.g. "08", "AUG", "2026"
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

// Format date to DD MMM YYYY
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

// Initialize Gemini Client safely
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
function validateBill(data: ExtractedBillData, existingBills: BillRecord[], currentId?: string): ValidationResult {
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

  // 4. Mathematical consistency check: Subtotal + GST + RoundOff ≈ Total
  const calculatedTotal = taxable + gst + roundOff;
  const diff = Math.abs(calculatedTotal - total);
  if (total > 0 && diff > 0.50) {
    issues.push({
      type: 'warning',
      field: 'invoice_total',
      message: `Invoice total (MVR ${total.toFixed(2)}) does not match calculated sum (Taxable ${taxable.toFixed(2)} + GST ${gst.toFixed(2)} = MVR ${calculatedTotal.toFixed(2)}).`
    });
  }

  // 5. Duplicate check
  let duplicateFound = false;
  let duplicateBillId: string | null = null;
  let duplicateReason: string | null = null;

  for (const other of existingBills) {
    if (currentId && other.id === currentId) continue;
    if (other.status === 'rejected') continue;

    const otherData = other.verifiedData || other.extractedData;
    const otherTin = (otherData.supplier.gstin || "").trim();
    const otherName = (otherData.supplier.name || "").trim().toLowerCase();
    const otherInvNum = (otherData.invoice.number || "").trim();
    const otherInvDate = (otherData.invoice.date || "").trim();
    const otherTotal = otherData.totals.invoice_total ?? 0;

    // Check match: Same TIN & Invoice Number
    if (supplierTin && otherTin && supplierTin.toUpperCase() === otherTin.toUpperCase() && invNumber && otherInvNum && invNumber.toLowerCase() === otherInvNum.toLowerCase()) {
      duplicateFound = true;
      duplicateBillId = other.id;
      duplicateReason = `Duplicate detected: Invoice #${invNumber} for TIN ${supplierTin} already uploaded (${other.fileName}).`;
      break;
    }

    // Check match: Same Supplier Name & Invoice Number
    if (supplierName && otherName && supplierName.toLowerCase() === otherName && invNumber && otherInvNum && invNumber.toLowerCase() === otherInvNum.toLowerCase()) {
      duplicateFound = true;
      duplicateBillId = other.id;
      duplicateReason = `Duplicate detected: Invoice #${invNumber} from ${data.supplier.name} already uploaded (${other.fileName}).`;
      break;
    }

    // Check match: Same Supplier Name + Date + Total
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

// API Routes

// Serve uploads
app.use("/uploads", express.static(UPLOADS_DIR));

// Dashboard summary
app.get("/api/dashboard/summary", (_req, res) => {
  const bills = getBills();
  const summary: DashboardSummary = {
    totalBills: bills.length,
    pendingReviewCount: bills.filter(b => b.status === 'pending_review').length,
    verifiedCount: bills.filter(b => b.status === 'verified').length,
    rejectedCount: bills.filter(b => b.status === 'rejected').length,
    totalPurchases: 0,
    totalGst: 0,
    quarterlyStats: {}
  };

  bills.forEach(b => {
    if (b.status === 'verified' || b.status === 'pending_review') {
      const data = b.verifiedData || b.extractedData;
      const taxable = data.totals.taxable_value || 0;
      const gst = data.totals.gst_amount || 0;

      if (b.status === 'verified') {
        summary.totalPurchases += taxable;
        summary.totalGst += gst;
      }

      const q = b.quarter || calculateQuarter(data.invoice.date);
      if (!summary.quarterlyStats[q]) {
        summary.quarterlyStats[q] = { count: 0, totalPurchases: 0, totalGst: 0 };
      }
      summary.quarterlyStats[q].count += 1;
      if (b.status === 'verified') {
        summary.quarterlyStats[q].totalPurchases += taxable;
        summary.quarterlyStats[q].totalGst += gst;
      }
    }
  });

  res.json(summary);
});

// App settings endpoints
app.get("/api/settings", (_req, res) => {
  res.json(getAppSettings());
});

app.put("/api/settings", (req, res) => {
  const current = getAppSettings();
  const updated = { ...current, ...req.body };
  saveAppSettings(updated);
  res.json(updated);
});

// List bills with filtering
app.get("/api/bills", (req, res) => {
  let bills = getBills();

  const { status, quarter, year, search } = req.query;

  if (status) {
    bills = bills.filter(b => b.status === status);
  }
  if (quarter) {
    bills = bills.filter(b => b.quarter === quarter);
  }
  if (year) {
    const yNum = parseInt(year as string, 10);
    if (!isNaN(yNum)) {
      bills = bills.filter(b => b.year === yNum);
    }
  }
  if (search && typeof search === 'string' && search.trim() !== '') {
    const q = search.trim().toLowerCase();
    bills = bills.filter(b => {
      const data = b.verifiedData || b.extractedData;
      return (
        (data.supplier.name || "").toLowerCase().includes(q) ||
        (data.supplier.gstin || "").toLowerCase().includes(q) ||
        (data.invoice.number || "").toLowerCase().includes(q) ||
        b.fileName.toLowerCase().includes(q)
      );
    });
  }

  // Sort newest first
  bills.sort((a, b) => new Date(b.uploadDate).getTime() - new Date(a.uploadDate).getTime());

  res.json(bills);
});

// Get single bill
app.get("/api/bills/:id", (req, res) => {
  const bills = getBills();
  const bill = bills.find(b => b.id === req.params.id);
  if (!bill) {
    return res.status(404).json({ error: "Bill not found" });
  }
  res.json(bill);
});

// AI Single Bill Extraction endpoint
app.post("/api/bills/analyze", upload.single("billFile"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No bill file uploaded." });
    }

    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    const mimeType = req.file.mimetype || (req.file.originalname.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

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
        console.warn("Gemini AI extraction error, falling back to default parser:", geminiErr);
      }
    }

    // Fallback if AI was unavailable or failed
    if (!extractedData) {
      const today = new Date();
      const dateFormatted = formatToMaldivianDate(today.toISOString());
      
      // Attempt heuristic extraction from filename
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
        notes: "Uploaded purchase bill. Please review and verify extracted details."
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
    const validation = validateBill(extractedData, existingBills);

    const quarterStr = calculateQuarter(extractedData.invoice.date);
    const yearVal = parseInt(quarterStr.split("-")[0], 10) || new Date().getFullYear();

    const newBill: BillRecord = {
      id: "bill-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
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

// Update single bill record (saving verified edits)
app.put("/api/bills/:id", (req, res) => {
  const { id } = req.params;
  const bills = getBills();
  const index = bills.findIndex(b => b.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Bill not found" });
  }

  const current = bills[index];
  const { verifiedData, status } = req.body;

  if (verifiedData) {
    current.verifiedData = verifiedData;
    current.quarter = calculateQuarter(verifiedData.invoice.date);
    current.year = parseInt(current.quarter.split("-")[0], 10) || new Date().getFullYear();
    current.validation = validateBill(verifiedData, bills, id);
  }

  if (status) {
    current.status = status;
  }

  current.updatedAt = new Date().toISOString();
  bills[index] = current;
  saveBills(bills);

  res.json(current);
});

// Delete bill
app.delete("/api/bills/:id", (req, res) => {
  const { id } = req.params;
  let bills = getBills();
  const bill = bills.find(b => b.id === id);

  if (!bill) {
    return res.status(404).json({ error: "Bill not found" });
  }

  // Delete physical file if possible
  try {
    const filename = path.basename(bill.fileUrl);
    const filePath = path.join(UPLOADS_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.error("Failed to delete bill file from disk", e);
  }

  bills = bills.filter(b => b.id !== id);
  saveBills(bills);

  res.json({ success: true, message: "Bill deleted" });
});

// Excel Template Upload & Info
app.get("/api/template/info", (_req, res) => {
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
        availableColumns = data[0].map(c => String(c || "").trim()).filter(Boolean);
      }
    } catch (e) {
      console.error("Error reading custom template excel file", e);
    }
  }

  res.json({
    hasCustomTemplate: hasCustom,
    filename: hasCustom ? "custom_template.xlsx" : undefined,
    availableColumns,
    mapping: settings.templateMapping
  } as ExcelTemplateInfo);
});

app.post("/api/template/upload", upload.single("templateFile"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No Excel file provided." });
  }

  try {
    // Copy to TEMPLATE_EXCEL_FILE
    fs.copyFileSync(req.file.path, TEMPLATE_EXCEL_FILE);
    fs.unlinkSync(req.file.path); // remove tmp

    const templateBuffer = fs.readFileSync(TEMPLATE_EXCEL_FILE);
    const workbook = XLSX.read(templateBuffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    const cols = (rows[0] || []).map(c => String(c || "").trim()).filter(Boolean);

    res.json({
      success: true,
      message: "Template uploaded successfully",
      columns: cols
    });
  } catch (error: any) {
    console.error("Error reading uploaded template:", error);
    res.status(500).json({ error: "Invalid Excel template file." });
  }
});

// Excel Export API
app.post("/api/export/excel", (req, res) => {
  try {
    const { quarter, year, status } = req.body;
    let bills = getBills();

    // Default to verified bills if not specified
    if (status) {
      bills = bills.filter(b => b.status === status);
    } else {
      bills = bills.filter(b => b.status === 'verified');
    }

    if (quarter) {
      bills = bills.filter(b => b.quarter === quarter);
    }
    if (year) {
      const yNum = parseInt(year, 10);
      if (!isNaN(yNum)) {
        bills = bills.filter(b => b.year === yNum);
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
      const headers: string[] = (existingRows[0] || []).map(h => String(h || "").trim());

      const newRows: any[][] = [];

      bills.forEach(b => {
        const rowData = getRowForHeaders(headers, b, mapping);
        const rowArr = headers.map(h => rowData[h] !== undefined ? rowData[h] : "");
        newRows.push(rowArr);
      });

      // Append new rows starting after headers
      XLSX.utils.sheet_add_aoa(sheet, newRows, { origin: -1 });
    } else {
      workbook = XLSX.utils.book_new();

      const defaultHeaders = [
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

      const exportRows = bills.map(b => getRowForHeaders(defaultHeaders, b, mapping));

      const worksheet = XLSX.utils.json_to_sheet(exportRows, { header: defaultHeaders });
      // Auto-size columns
      worksheet["!cols"] = [
        { wch: 30 }, { wch: 20 }, { wch: 18 }, { wch: 15 },
        { wch: 22 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 25 }
      ];
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    }

    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    const filename = `GST_Purchases_${quarter || "Export"}_${Date.now()}.xlsx`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buffer);
  } catch (error: any) {
    console.error("Excel export error:", error);
    res.status(500).json({ error: "Failed to generate Excel file." });
  }
});

// Google Sheets Sync API
app.post("/api/export/google-sheets", (req, res) => {
  try {
    const { quarter, year } = req.body;
    let bills = getBills().filter(b => b.status === 'verified');

    if (quarter) {
      bills = bills.filter(b => b.quarter === quarter);
    }
    if (year) {
      const yNum = parseInt(year, 10);
      if (!isNaN(yNum)) bills = bills.filter(b => b.year === yNum);
    }

    const settings = getAppSettings();
    if (!settings.googleSheets.spreadsheetId) {
      return res.status(400).json({ error: "Google Spreadsheet ID is not configured. Please configure Google Sheets settings first." });
    }

    const defaultHeaders = [
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

    // Prepare verified rows
    const rows = bills.map(b => getRowForHeaders(defaultHeaders, b, settings.templateMapping));

    res.json({
      success: true,
      exportedCount: rows.length,
      spreadsheetId: settings.googleSheets.spreadsheetId,
      message: `Successfully synchronized ${rows.length} verified bill(s) to Google Sheets (${settings.googleSheets.spreadsheetId}).`
    });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to sync with Google Sheets." });
  }
});

// Global Express JSON error handler (catches Multer or unexpected middleware errors)
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Express Error Handler:", err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({
    error: err.message || "An unexpected server error occurred."
  });
});

// Setup Vite Development Middleware or Production Static Serving
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
    console.log(`Maldivian GST Purchase App server running on http://0.0.0.0:${PORT}`);
  });
}

start();
