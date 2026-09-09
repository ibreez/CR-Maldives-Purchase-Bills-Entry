/**
 * Authoritative Tax Adjustment Ledger Models & Interfaces (Phase 30)
 * Compliant with Maldives Income Tax Act (Act No. 25/2019) & MIRA 604 v25.1
 */

export type TaxAdjustmentDirection = 'ADD_BACK' | 'DEDUCTION';

export type TaxAdjustmentReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type TaxAdjustmentCategory =
  | 'DEPRECIATION_ADDBACK'
  | 'NON_DEDUCTIBLE_EXPENDITURE'
  | 'PRIVATE_EXPENDITURE'
  | 'FINES_PENALTIES'
  | 'CAPITAL_EXPENDITURE'
  | 'RELATED_PARTY_EXCESS'
  | 'GENERAL_PROVISIONS'
  | 'OWNER_DRAWINGS'
  | 'ALLOWABLE_TAX_DEDUCTIONS'
  | 'APPROVED_DONATIONS'
  | 'SPECIFIC_BAD_DEBTS'
  | 'TAX_EXEMPT_INCOME'
  | 'OTHER_ADJUSTMENT';

export interface TaxAdjustmentEntry {
  id: string;
  tenantId: string;
  taxYear: number;
  
  // Traceability Dimensions (MANDATORY: document, journal, account, tax rule)
  sourceJournalId?: string;
  sourceJournalLineId?: string;
  sourceTransactionId?: string;
  supportingDocument?: string; // Document ID, File URL, or Invoice Reference
  accountCode: string;
  accountName?: string;

  // Adjustment Identity
  adjustmentCode: string; // e.g. 'ADJ-DEPR', 'ADJ-FINES', 'ADJ-PRIVATE', etc.
  category: TaxAdjustmentCategory;
  description: string;
  amount: number; // Stored as positive magnitude
  direction: TaxAdjustmentDirection;

  // Regulatory & Statutory Tracing
  ruleId: string;
  ruleVersion?: string;
  legalReference?: string;

  // RBAC & Review Governance
  reviewStatus: TaxAdjustmentReviewStatus;
  approvedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;

  // Accounting Reversal & Lifecycle
  isReversed?: boolean;
  reversalOfAdjustmentId?: string;
  reversalJournalId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaxAdjustmentInput {
  id?: string;
  tenantId: string;
  taxYear: number;
  
  // Traceability
  sourceJournalId?: string;
  sourceJournalLineId?: string;
  sourceTransactionId?: string;
  supportingDocument?: string;
  accountCode: string;
  accountName?: string;

  // Classification & Amount
  adjustmentCode?: string;
  category: TaxAdjustmentCategory;
  description: string;
  amount: number;
  direction?: TaxAdjustmentDirection; // Resolved dynamically from rule if omitted

  // Optional Override / Explicit Rule Binding
  ruleId?: string;
  ruleVersion?: string;
  legalReference?: string;
  reviewStatus?: TaxAdjustmentReviewStatus;
  approvedBy?: string;
  approvedAt?: string;
  transactionDate?: string;
}

export interface TaxBridgeCalculationParams {
  tenantId: string;
  taxYear: number;
  accountingProfit: number;
  adjustments?: TaxAdjustmentEntry[];
  capitalAllowanceTotal?: number;
  balancingAllowanceTotal?: number;
  balancingChargeTotal?: number;
  includePendingAdjustments?: boolean;
}

export interface TaxBridgeResult {
  tenantId: string;
  taxYear: number;

  // 1. Accounting Starting Point
  accountingProfit: number;

  // 2. Statutory Non-Deductible Add-backs (Section C MIRA 604)
  totalAddBacks: number;
  addBacksBreakdown: Record<string, number>;

  // 3. Statutory Allowable Deductions (Section C MIRA 604)
  totalAllowableDeductions: number;
  deductionsBreakdown: Record<string, number>;

  // 4. Intermediate Subtotal
  adjustedProfitBeforeCapitalAllowance: number;

  // 5. Capital Allowances & Balancing Adjustments (Section D MIRA 604)
  capitalAllowanceDeduction: number;
  balancingAllowance: number;
  balancingCharge: number;
  netCapitalAllowanceDeduction: number;

  // 6. Final Statutory Taxable Profit / Loss
  taxableIncomeBeforeLossRelief: number;
  isTaxLoss: boolean;
  taxLossAmount: number;

  // Audit and Traceability Bridge
  traceableAdjustments: TaxAdjustmentEntry[];
  lineageSummary: {
    totalAdjustmentsCount: number;
    approvedCount: number;
    pendingCount: number;
    totalAmountBridged: number;
  };
  generatedAt: string;
}
