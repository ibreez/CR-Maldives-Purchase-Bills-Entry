export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  discount: number | null;
  taxable_value: number | null;
  gst_rate: number | null;
  gst_amount: number | null;
  total: number | null;
}

export interface ExtractedSupplier {
  name: string | null;
  gstin: string | null;
  address: string | null;
  phone: string | null;
}

export interface ExtractedInvoiceInfo {
  number: string | null;
  date: string | null; // Format: DD MMM YYYY (e.g. 08 AUG 2026)
  po_number: string | null;
  currency: string | null;
  gst_type: string | null; // e.g. "GST 8%", "TGST 16%", "Zero-Rated", "Exempt"
}

export interface ExtractedTotals {
  taxable_value: number | null; // Subtotal excluding GST
  gst_amount: number | null;    // Total GST charged
  round_off: number | null;     // Rounding adjustment if any
  invoice_total: number | null; // Final payable total
}

export interface ExtractedBillData {
  supplier: ExtractedSupplier;
  invoice: ExtractedInvoiceInfo;
  items: InvoiceLineItem[];
  totals: ExtractedTotals;
  notes: string | null;
}

export interface FieldConfidence {
  supplier_name: number; // 0 to 100
  supplier_tin: number;
  invoice_number: number;
  invoice_date: number;
  taxable_value: number;
  gst_amount: number;
  invoice_total: number;
  line_items: number;
  overall: number;
}

export interface ValidationIssue {
  type: 'error' | 'warning';
  field?: string;
  message: string;
}

export interface ValidationResult {
  is_valid: boolean;
  issues: ValidationIssue[];
  duplicate_found: boolean;
  duplicate_bill_id?: string | null;
  duplicate_reason?: string | null;
}

export type BillStatus = 'pending_review' | 'verified' | 'rejected';

export interface BillRecord {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  uploadDate: string;
  status: BillStatus;
  extractedData: ExtractedBillData;
  verifiedData: ExtractedBillData;
  confidence: FieldConfidence;
  validation: ValidationResult;
  quarter: string; // e.g. "2026-Q3"
  year: number;
  updatedAt: string;
}

export interface TemplateColumnMapping {
  supplier_name: string;
  supplier_tin: string;
  invoice_number: string;
  invoice_date: string;
  taxable_value: string;
  gst_amount: string;
  invoice_total: string;
  quarter: string;
  notes: string;
}

export interface ExcelTemplateInfo {
  hasCustomTemplate: boolean;
  filename?: string;
  availableColumns: string[];
  mapping: TemplateColumnMapping;
}

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  sheetName: string;
  connected: boolean;
  mapping: TemplateColumnMapping;
}

export interface AppSettings {
  myTin: string; // e.g. "1133533GST501"
  defaultGstRate: number; // 8%
  autoApproveHighConfidence: boolean;
  templateMapping: TemplateColumnMapping;
  googleSheets: GoogleSheetsConfig;
}

export interface DashboardSummary {
  totalBills: number;
  pendingReviewCount: number;
  verifiedCount: number;
  rejectedCount: number;
  totalPurchases: number; // Taxable value total
  totalGst: number;       // Total GST paid
  quarterlyStats: Record<string, { count: number; totalPurchases: number; totalGst: number }>;
}
