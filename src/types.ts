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

export type DocumentType = 
  | 'TAX_INVOICE' 
  | 'INVOICE' 
  | 'RECEIPT' 
  | 'HANDWRITTEN_PURCHASE' 
  | 'CASH_PURCHASE' 
  | 'CAPITAL_EXPENDITURE'
  | 'OTHER' 
  | 'UNKNOWN';

export type TaxStatus = 
  | 'TAX_CHARGED' 
  | 'TAX_INCLUDED' 
  | 'NO_TAX' 
  | 'UNKNOWN';

export type ExpenseCategory = 
  | 'Food Ingredients' 
  | 'Beverages' 
  | 'Cleaning Supplies' 
  | 'Packaging' 
  | 'Stationery' 
  | 'Maintenance' 
  | 'Equipment' 
  | 'Repairs' 
  | 'Transportation' 
  | 'Utilities' 
  | 'Other';

export type TaxpayerProfile = 'COMPANY' | 'SOLE_PROPRIETOR';
export type AccountingBasis = 'ACCRUAL' | 'CASH';

export type AccountingTreatment = 
  | 'COST_OF_SALES' 
  | 'OPERATING_EXPENSE' 
  | 'CAPITAL_EXPENDITURE' 
  | 'NON_DEDUCTIBLE' 
  | 'REVENUE' 
  | 'OTHER';

export type IncomeTaxTreatment = 
  | 'DEDUCTIBLE_EXPENSE' 
  | 'CAPITAL_ALLOWANCE' 
  | 'NON_DEDUCTIBLE' 
  | 'EXCLUDED' 
  | 'TAXABLE_INCOME';

export type MiraSchedule1Category = 
  | 'Cost of Sales' 
  | 'Insurance Premium' 
  | 'Professional & Consulting Fees' 
  | 'Rental, Lease & License' 
  | 'Repairs & Maintenance' 
  | 'Related Party Expenses' 
  | 'Salaries & Wages' 
  | 'Sales & Marketing' 
  | 'Other Expenses' 
  | 'Capital Asset (Schedule 2)';

export type OcrStatus = 
  | 'PROCESSING' 
  | 'EXTRACTED' 
  | 'VALIDATED' 
  | 'APPROVED' 
  | 'NEEDS_REVIEW' 
  | 'FAILED';

export interface FieldEvidenceItem {
  value: any;
  source_label?: string | null;
  confidence: number;
}

export interface ExtractedBillData {
  document_type: DocumentType;
  tax_status: TaxStatus;
  expense_category: ExpenseCategory;
  mira_schedule1_category?: MiraSchedule1Category;
  accounting_treatment?: AccountingTreatment;
  income_tax_treatment?: IncomeTaxTreatment;
  deductible_percentage?: number; // 0 to 100%
  supplier: ExtractedSupplier;
  invoice: ExtractedInvoiceInfo;
  items: InvoiceLineItem[];
  totals: ExtractedTotals;
  notes: string | null;
  field_evidence?: Record<string, FieldEvidenceItem>;
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

export interface AuditLogEntry {
  date: string;
  action: string;
  performedBy: string;
  details?: string;
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

export interface UploaderInfo {
  userId: string;
  userName: string;
  userEmail: string;
}

export interface BillRecord {
  id: string;
  outlet_id: string;
  outlet_name?: string;
  uploaded_by?: UploaderInfo;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  uploadDate: string;
  status: BillStatus;
  ocr_status: OcrStatus;
  ocr_attempts: number;
  needs_review: boolean;
  review_reason?: string | null;
  extractedData: ExtractedBillData;
  verifiedData: ExtractedBillData;
  confidence: FieldConfidence;
  validation: ValidationResult;
  quarter: string; // e.g. "2026-Q3"
  year: number;
  updatedAt: string;
  audit_trail?: AuditLogEntry[];
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
  outlet_name?: string;
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
  taxpayerProfile?: TaxpayerProfile; // "COMPANY" or "SOLE_PROPRIETOR"
  accountingBasis?: AccountingBasis; // "ACCRUAL" or "CASH"
  templateMapping: TemplateColumnMapping;
  googleSheets: GoogleSheetsConfig;
}

export type RevenueCategory = 
  | 'POS Sales' 
  | 'Catering' 
  | 'Delivery' 
  | 'Direct Sales' 
  | 'Other Income' 
  | 'Dine-In Sales' 
  | 'Takeaway / Delivery' 
  | 'Wholesale' 
  | 'Other Revenue';

export interface RevenueRecord {
  id: string;
  outlet_id: string;
  outlet_name?: string;
  date: string; // YYYY-MM-DD
  category: RevenueCategory;
  gross_amount: number;
  gst_collected: number;
  net_revenue: number;
  payment_method?: 'Cash' | 'Card / POS' | 'Bank Transfer' | 'Credit' | 'Other';
  notes?: string;
  description?: string;
  amount?: number;
  quarter?: string;
  year?: number;
  created_by?: string;
  created_at?: string;
}

export type AssetClass =
  | 'Buildings'
  | 'Plant & Equipment / Machinery'
  | 'Vehicles & Transport'
  | 'Computer Software & Hardware'
  | 'Loose Tools / Utensils / Crockery'
  | 'Furniture & Fittings';

export interface FixedAssetRecord {
  id: string;
  outlet_id: string;
  outlet_name?: string;
  asset_name: string;
  asset_class: AssetClass;
  purchase_date: string;
  cost_price: number;
  mira_rate: number; // percentage e.g. 4, 10, 20, 33.33
  opening_wdv: number;
  capital_allowance: number;
  closing_wdv: number;
  bill_id?: string;
  supplier?: string;
  notes?: string;
  created_at?: string;
}

export interface TaxAuditCheck {
  unverified_documents_count: number;
  missing_revenue_months: string[];
  unclassified_expenses_count: number;
  audit_warnings: string[];
  is_audit_passed: boolean;
}

export interface Mira604Summary {
  taxpayer_profile: TaxpayerProfile;
  accounting_basis: AccountingBasis;
  year: number;
  outlet_id: string;
  revenue: number;
  cost_of_sales: number;
  gross_profit: number;
  operating_expenses: number;
  schedule1_breakdown: Record<MiraSchedule1Category, number>;
  net_accounting_profit: number;
  non_deductible_addbacks: number;
  total_capital_allowances?: number;
  taxable_income: number;
  estimated_income_tax: number;
  tax_brackets_applied: string;
  total_bills_analyzed: number;
  total_revenue_entries: number;
  audit_checks?: TaxAuditCheck;
}

export interface OutletSummaryStats {
  outletId: string;
  outletName: string;
  totalBills: number;
  pendingCount: number;
  verifiedCount: number;
  totalPurchases: number;
  totalGst: number;
}

export interface DashboardSummary {
  totalBills: number;
  pendingReviewCount: number;
  verifiedCount: number;
  rejectedCount: number;
  totalPurchases: number; // Taxable value total
  totalGst: number;       // Total GST paid
  quarterlyStats: Record<string, { count: number; totalPurchases: number; totalGst: number }>;
  totalOutlets?: number;
  totalUsers?: number;
  outletStats?: OutletSummaryStats[];
}

// Multi-Outlet & Auth Types
export type UserRole = "super_admin" | "outlet_user";

export interface Outlet {
  id: string;
  name: string;
  code: string;
  tin?: string;
  address?: string;
  phone?: string;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  username: string;
  role: UserRole;
  outlet_id: string | null;
  outlet_name?: string;
  status: "active" | "inactive";
  createdAt: string;
  lastLogin?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  username: string;
  role: UserRole;
  outlet_id: string | null;
  outlet_name?: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export * from './types/taxEngine';
