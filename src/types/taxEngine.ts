/**
 * Tax & Accounting Engine Architecture - Phase 1 Data Models
 * Core Transaction & Decoupled Classification Model (MIRA 604 V25.1 Compliance)
 */

/**
 * Decoupled Accounting Classification (Section 1.2)
 * Defines the standard double-entry financial statement bucket.
 */
export type AccountingClassification = 
  | 'EXPENSE' 
  | 'COST_OF_SALES' 
  | 'ASSET' 
  | 'REVENUE' 
  | 'LIABILITY' 
  | 'EQUITY';

/**
 * Decoupled GST Treatment (Section 1.2)
 * Explicitly isolates MIRA GST Tax Rules from Income Tax logic.
 */
export type GstTreatment = 
  | 'STANDARD_RATED' 
  | 'ZERO_RATED' 
  | 'EXEMPT' 
  | 'OUT_OF_SCOPE' 
  | 'INPUT_TAX' 
  | 'NO_INPUT_TAX';

/**
 * Decoupled Income Tax Treatment (Section 1.2)
 * Explicitly isolates Income Tax Deductibility and Allowance Rules.
 */
export type IncomeTaxTreatment = 
  | 'DEDUCTIBLE' 
  | 'NON_DEDUCTIBLE' 
  | 'CAPITAL_ALLOWANCE' 
  | 'TAX_EXEMPT_INCOME' 
  | 'SPECIAL_TREATMENT' 
  | 'REVIEW_REQUIRED';

/**
 * Review Status for Unified Transactions
 */
export type TransactionReviewStatus = 'PENDING' | 'APPROVED' | 'NEEDS_REVIEW';

/**
 * Transaction Source Type (Section 2.2)
 */
export type TransactionSourceType = 'bill' | 'invoice' | 'journal' | 'payment';

/**
 * Unique Accounting Identity Object (Section 2.2)
 */
export interface TransactionIdentity {
  transactionId: string;      // Formatted as TX-YYYY-XXXXXXXX, e.g. TX-2026-00001234
  sourceType: TransactionSourceType;
  sourceId: string;           // e.g. BILL-123
  entityId: string;
  outletId: string;
  transactionDate: string;    // YYYY-MM-DD
  accountingCategory: string; // e.g. "utilities.electricity"
  amount: number;             // Net amount
  gstAmount: number;          // GST amount
  totalAmount: number;        // Gross amount (amount + gstAmount)
}

/**
 * Double-Entry Journal Line Interface (Section 2.1)
 */
export interface JournalLine {
  lineId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description?: string;
}

/**
 * Double-Entry Journal Entry Interface (Section 2.1)
 */
export interface JournalEntry {
  journalId: string;          // e.g. JNL-2026-00001234
  transactionId: string;
  entryDate: string;
  entityId: string;
  outletId: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  notes?: string;
}

/**
 * Transaction Audit Trail Entry
 */
export interface TransactionAuditEntry {
  timestamp: string;
  action: string;
  performedBy: string;
  details?: string;
  previousState?: Record<string, any>;
}

/**
 * Complete Transaction Record (Section 2.1 & 2.2)
 */
export interface TransactionRecord extends TransactionIdentity {
  supplierOrCustomer?: string;
  description: string;
  miraCategory: string;
  accountingTreatment: AccountingClassification;
  incomeTaxTreatment: IncomeTaxTreatment;
  gstTreatment: GstTreatment;
  taxYear: number;
  accountingPeriodStart: string;
  accountingPeriodEnd: string;
  reviewStatus: TransactionReviewStatus;
  auditHistory: TransactionAuditEntry[];
  journalEntry?: JournalEntry;
  createdAt: string;
}

/**
 * Unified Transaction Structure (Section 1.1)
 * Represents a single normalized transaction entry in the core ledger abstraction.
 */
export interface Transaction {
  transactionId: string;          // e.g. "TX-2026-00001234"
  entityId: string;               // e.g. "COMPANY-001" or TIN
  outletId: string;               // e.g. "OUTLET-004"
  transactionDate: string;        // YYYY-MM-DD
  documentId?: string;            // Reference ID to underlying document/bill
  supplierOrCustomer?: string;    // Name or TIN of counterparty
  description: string;            // Item or transaction description
  amount: number;                 // Net taxable amount
  gstAmount: number;              // Calculated GST amount
  accountingCategory: string;    // e.g. "utilities.electricity"
  miraCategory: string;          // e.g. "other_expenses" or Schedule 1 code
  accountingTreatment: AccountingClassification;
  incomeTaxTreatment: IncomeTaxTreatment;
  gstTreatment: GstTreatment;
  taxYear: number;                // e.g. 2026
  accountingPeriodStart: string;  // YYYY-MM-DD (Supports non-calendar tax years)
  accountingPeriodEnd: string;    // YYYY-MM-DD
  reviewStatus: TransactionReviewStatus;
  auditHistory: TransactionAuditEntry[];
}

/**
 * Flexible Accounting Period Interface (Section 1.4)
 * Replaces year constants with dynamic non-calendar period parameters.
 */
export interface AccountingPeriod {
  periodId: string;
  entityId: string;
  taxYear: number;
  accountingPeriodStart: string; // YYYY-MM-DD
  accountingPeriodEnd: string;   // YYYY-MM-DD
  isCalendarYear: boolean;
  totalDays: number;
  isClosed: boolean;
}

/**
 * MIRA Schedule 2 Fixed Asset Classes (Section 1.3 & Phase 4)
 */
export type MiraAssetClass =
  | 'Buildings'
  | 'Aircraft'
  | 'Marine vessels (Wooden)'
  | 'Marine vessels (Other)'
  | 'Furniture & Fittings'
  | 'Motor vehicles'
  | 'Earth moving vehicles'
  | 'Plant & equipment / Machinery'
  | 'Office equipment'
  | 'Computer software & hardware'
  | 'Loose tools / Utensils / Crockery';

/**
 * Fixed Asset Record (Section 1.3)
 * Decouples capital purchases from direct Schedule 1 expense reporting,
 * routing them to the Fixed Asset Register instead.
 */
export interface FixedAssetRecord {
  assetId: string;
  entityId: string;
  outletId: string;
  transactionId?: string;           // Refers to source capital transaction
  documentId?: string;              // Refers to original bill or invoice
  assetName: string;
  assetClass: MiraAssetClass;
  acquisitionDate: string;         // YYYY-MM-DD
  costPrice: number;
  cost?: number;                    // Alias for costPrice
  salvageValue?: number;
  taxYearAcquired?: number;
  daysInServiceThisYear?: number;
  disposalProceeds?: number;        // Alias for disposalValue
  miraCapitalAllowanceRate: number; // Percentage e.g. 4, 10, 20, 33.33
  openingWDV: number;               // Written Down Value at start of tax period
  additionsInYear: number;          // Additions in current tax year at cost
  disposalsInYear: number;          // Disposals in current tax year at disposal value
  capitalAllowanceClaimed: number;  // Allowance calculated for current tax year
  closingWDV: number;               // Written Down Value carried forward
  taxYear: number;
  accountingPeriodStart: string;   // YYYY-MM-DD
  accountingPeriodEnd: string;     // YYYY-MM-DD
  notes?: string;
  isDisposed?: boolean;
  disposalDate?: string;
  disposalValue?: number;
  balancingAllowanceOrCharge?: number;
}

/**
 * Capital Asset Pipeline Routing
 */
export interface FixedAssetPipelineRouting {
  isCapitalAsset: boolean;
  targetAssetClass?: MiraAssetClass;
  routeToAssetRegister: boolean;
  excludeFromSchedule1Expenses: boolean; // Prevents double counting in Schedule 1
  reason: string;
}

export type { MiraSchedule1LineItem } from '../config/miraCategoryMapping';
export type { MiraSchedule1Report, MiraSchedule1LineSummary } from '../services/accounting/pnlService';
export type { MiraAdjustmentCode, AdjustmentDirection, MiraAdjustmentCodeConfig } from '../config/miraAdjustmentCodes';
export type { TaxAdjustment, TaxCalculationPipelineResult, AdjustmentReviewStatus } from '../services/tax/taxAdjustmentService';
export type { EntityType, TaxBracket } from '../config/miraTaxRates';
export type { EntityTaxResult, EntityTaxCalculationOptions, TaxBracketDetail, PriorTaxLossRecord } from '../services/tax/entityTaxService';
export type { Mira604TaxReturn, Mira604InputData, TaxpayerInfo, Schedule1PnLSummary, TaxAdjustmentsSummary, Schedule2CapitalAllowanceSummary, TaxableIncomeAndLossReliefSummary, TaxComputationSummary } from './mira604';
export type { Mira105GstReturn, GstPeriod, GstRegime, InputGstEligibility, Mira105OutputSalesBox, Mira105InputPurchasesBox, Mira105CapitalPurchasesBox } from './mira105';
export type { Mira302WhtReturn, WhtPeriod, NonResidentPaymentCategory, NonResidentPayee, WhtScheduleItem } from './mira302';
export type { CurrencyCode, ExchangeRateRecord, FxConversionResult, FxGainLossRecord, FxClassification, OpenForeignTransactionItem, UnrealizedFxReport } from './fx';
export type { AuditEvent, AuditAction, AuditEntityType, PeriodLockRecord, ReversalResult } from './audit';
export type { ValidationIssue, ValidationSeverity, ReconciliationSummary, ReconciliationReport } from './reconciliation';
export type { MiraReturnType, SubmissionStatus, SubmissionPayload, SubmissionResponse, WebhookPayload, WebhookProcessResult } from './miraconnectGateway';
