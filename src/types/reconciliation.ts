import { TransactionRecord, Transaction } from './taxEngine';

export type ReconciliationStatus = 'PASS' | 'WARNING' | 'FAIL';

export type ReconciliationType =
  | 'GL_GST'
  | 'GL_NWT'
  | 'AP_NWT'
  | 'FIXED_ASSETS_GL'
  | 'TAX_ASSETS_FIXED_ASSETS'
  | 'PNL_INCOME_TAX'
  | 'TAX_ADJUSTMENTS_TAX_CALC'
  | 'MIRA604_TAX_ENGINE'
  | 'SCHEDULE2_BALANCE_SHEET'
  | 'SCHEDULE3_NET_WORTH'
  | 'SCHEDULE4_RELATED_PARTY'
  | 'SCHEDULE5_CFE';

export interface UnderlyingTransactionDrilldown {
  transactionId: string;
  source: string;
  sourceType?: string;
  sourceId?: string;
  reference?: string;
  date?: string;
  amount: number;
  taxAmount?: number;
  accountCode?: string;
  accountName?: string;
  description?: string;
  discrepancyReason: string;
  side: 'SOURCE_A' | 'SOURCE_B' | 'BOTH';
  metadata?: Record<string, unknown>;
}

export interface ReconciliationRule {
  ruleId: string;
  name: string;
  reconciliationType: ReconciliationType;
  description: string;
  sourceA: string;
  sourceB: string;
  tolerance: number;            // e.g. 0.05 for rounding differences
  warningThreshold?: number;    // e.g. 1.00 for minor rounding warnings
  legalReference: string;
  active: boolean;
}

export interface ReconciliationItem {
  itemId: string;
  code: string;
  label: string;
  sourceAValue: number;
  sourceBValue: number;
  difference: number;           // sourceAValue - sourceBValue
  absoluteDifference: number;
  status: ReconciliationStatus; // PASS | WARNING | FAIL
  tolerance: number;
  explanation?: string;
  unmatchedTransactions: UnderlyingTransactionDrilldown[];
}

export interface Reconciliation {
  reconciliationId: string;
  entityId: string;
  taxYear: number;
  reconciliationType: ReconciliationType;
  title: string;
  status: ReconciliationStatus; // PASS | WARNING | FAIL
  rule: ReconciliationRule;
  totalSourceA: number;
  totalSourceB: number;
  totalDifference: number;
  items: ReconciliationItem[];
  underlyingTransactions: UnderlyingTransactionDrilldown[];
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ReconciliationSuiteResult {
  suiteId: string;
  entityId: string;
  taxYear: number;
  overallStatus: ReconciliationStatus;
  passedCount: number;
  warningCount: number;
  failedCount: number;
  reconciliations: Record<ReconciliationType, Reconciliation>;
  reconciliationList: Reconciliation[];
  allDiscrepancies: UnderlyingTransactionDrilldown[];
  generatedAt: string;
  ruleId: string;
  legalReference: string;
}

// -----------------------------------------------------------------------------
// LEGACY COMPATIBILITY TYPES
// -----------------------------------------------------------------------------

export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  field: string;
  message: string;
  suggestedFix?: string;
  underlyingTransactionId?: string;
  drilldown?: UnderlyingTransactionDrilldown;
}

export interface ReconciliationSummary {
  totalRevenueLedger: number;
  totalRevenueReturn: number;
  totalGstOutputLedger: number;
  totalGstOutputReturn: number;
  totalWhtLedger: number;
  totalWhtReturn: number;
  totalAssetAdditionsLedger?: number;
  totalAssetAdditionsSchedule2?: number;
  totalCapitalAllowanceClaimed?: number;
}

export interface ReconciliationReport {
  taxYear: number;
  entityId: string;
  isValid: boolean;
  issues: ValidationIssue[];
  summary: ReconciliationSummary;
  generatedAt: string;
  suiteResult?: ReconciliationSuiteResult;
}

export type AnyTransaction = TransactionRecord | Transaction;

