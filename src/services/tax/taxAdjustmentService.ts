import {
  MiraAdjustmentCode,
  AdjustmentDirection,
  MIRA_ADJUSTMENT_CODES
} from '../../config/miraAdjustmentCodes';

export type AdjustmentReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface TaxAdjustment {
  adjustmentId: string;
  miraCode: MiraAdjustmentCode;
  amount: number;
  reason: string;
  sourceTransactionId?: string;
  supportingDocumentId?: string;
  reviewStatus: AdjustmentReviewStatus;
  
  // Optional metadata
  entityId?: string;
  taxYear?: number;
  direction?: AdjustmentDirection;
  adjustmentName?: string;
  createdAt?: string;
}

export interface TaxCalculationPipelineResult {
  taxYear?: number;
  entityId?: string;

  // Step 1: Accounting Profit
  accountingProfit: number;

  // Step 2: Non-deductible add-backs
  totalAddBacks: number;
  addBacksBreakdown: Record<MiraAdjustmentCode, number>;

  // Step 3: Tax-exempt income / Allowable deductions
  totalAllowableDeductions: number;
  totalDeductions?: number;
  netTaxAdjustment?: number;
  
  // Adjusted Profit before Capital Allowance
  adjustedProfitBeforeCapitalAllowance: number;

  // Step 4: Capital Allowance
  capitalAllowanceTotal: number;
  balancingAllowanceTotal: number;
  balancingChargeTotal: number;
  netCapitalAllowanceDeduction: number;

  // Final Step: Taxable Income
  taxableIncomeBeforeLossRelief: number;
  isTaxLoss: boolean;
  taxLossAmount: number;

  // Audit and metadata
  adjustmentsProcessed: TaxAdjustment[];
  generatedAt: string;
}

let adjustmentSeq = 1000;

/**
 * Creates a structured TaxAdjustment record.
 */
export function createTaxAdjustment(params: {
  adjustmentId?: string;
  miraCode: MiraAdjustmentCode;
  amount: number;
  reason?: string;
  sourceTransactionId?: string;
  supportingDocumentId?: string;
  reviewStatus?: AdjustmentReviewStatus;
  entityId?: string;
  taxYear?: number;
  direction?: AdjustmentDirection;
}): TaxAdjustment {
  const codeConfig = MIRA_ADJUSTMENT_CODES[params.miraCode];
  const direction = params.direction || codeConfig?.direction || 'ADD_BACK';
  
  return {
    adjustmentId: params.adjustmentId || `ADJ-${Date.now()}-${adjustmentSeq++}`,
    miraCode: params.miraCode,
    amount: Math.abs(params.amount || 0),
    reason: params.reason || codeConfig?.name || 'Tax Adjustment',
    sourceTransactionId: params.sourceTransactionId,
    supportingDocumentId: params.supportingDocumentId,
    reviewStatus: params.reviewStatus || 'APPROVED',
    entityId: params.entityId || 'COMPANY-001',
    taxYear: params.taxYear || new Date().getFullYear(),
    direction,
    adjustmentName: codeConfig?.name,
    createdAt: new Date().toISOString()
  };
}

/**
 * Calculates Taxable Income Pipeline following MIRA Section 6.3 Rules:
 * Accounting Profit
 * + Non-deductible Addbacks (ADJ-DEPR, ADJ-FINES, ADJ-DONATION, etc.)
 * - Allowable Tax Deductions / Tax-exempt Income
 * - Total Claimable Capital Allowance (from Phase 5)
 * = Taxable Income Before Business Loss Relief
 */
export function calculateTaxableIncomePipeline(
  accountingProfit: number,
  adjustments: TaxAdjustment[],
  capitalAllowanceTotal: number,
  options?: {
    taxYear?: number;
    entityId?: string;
    balancingAllowanceTotal?: number;
    balancingChargeTotal?: number;
    includePendingAdjustments?: boolean;
  }
): TaxCalculationPipelineResult {
  const list = adjustments || [];
  const includePending = options?.includePendingAdjustments ?? false;

  const addBacksBreakdown: Record<MiraAdjustmentCode, number> = {
    'ADJ-DEPR': 0,
    'ADJ-FINES': 0,
    'ADJ-DONATION': 0,
    'ADJ-PRIVATE': 0,
    'ADJ-CAPITAL': 0,
    'ADJ-OWNER': 0,
    'ADJ-RELATED': 0,
    'ADJ-OTHER': 0
  };

  let totalAddBacks = 0;
  let totalAllowableDeductions = 0;
  const processedList: TaxAdjustment[] = [];

  for (const adj of list) {
    // Filter by reviewStatus
    if (adj.reviewStatus === 'REJECTED') continue;
    if (adj.reviewStatus === 'PENDING' && !includePending) continue;

    processedList.push(adj);

    const dir = adj.direction || MIRA_ADJUSTMENT_CODES[adj.miraCode]?.direction || 'ADD_BACK';

    if (dir === 'ADD_BACK') {
      totalAddBacks += adj.amount;
      if (addBacksBreakdown[adj.miraCode] !== undefined) {
        addBacksBreakdown[adj.miraCode] += adj.amount;
      } else {
        addBacksBreakdown[adj.miraCode] = adj.amount;
      }
    } else if (dir === 'DEDUCTION') {
      totalAllowableDeductions += adj.amount;
    }
  }

  const balancingAllowance = options?.balancingAllowanceTotal || 0;
  const balancingCharge = options?.balancingChargeTotal || 0;

  // Net Capital Allowance Deduction = Capital Allowance + Balancing Allowance - Balancing Charge
  const netCapitalAllowanceDeduction = capitalAllowanceTotal + balancingAllowance - balancingCharge;

  // Pipeline Step-by-Step
  const profit = Number(accountingProfit || 0);
  const adjustedProfitBeforeCapitalAllowance = profit + totalAddBacks - totalAllowableDeductions;
  
  const rawTaxableIncome = adjustedProfitBeforeCapitalAllowance - netCapitalAllowanceDeduction;

  const isTaxLoss = rawTaxableIncome < 0;
  const taxableIncomeBeforeLossRelief = Math.max(0, rawTaxableIncome);
  const taxLossAmount = isTaxLoss ? Math.abs(rawTaxableIncome) : 0;
  const totalDeductions = Math.round((totalAllowableDeductions + netCapitalAllowanceDeduction) * 100) / 100;
  const netTaxAdjustment = Math.round((totalAddBacks - totalDeductions) * 100) / 100;

  return {
    taxYear: options?.taxYear || new Date().getFullYear(),
    entityId: options?.entityId || 'COMPANY-001',
    accountingProfit: Math.round(profit * 100) / 100,
    totalAddBacks: Math.round(totalAddBacks * 100) / 100,
    addBacksBreakdown,
    totalAllowableDeductions: Math.round(totalAllowableDeductions * 100) / 100,
    totalDeductions,
    netTaxAdjustment,
    adjustedProfitBeforeCapitalAllowance: Math.round(adjustedProfitBeforeCapitalAllowance * 100) / 100,
    capitalAllowanceTotal: Math.round(capitalAllowanceTotal * 100) / 100,
    balancingAllowanceTotal: Math.round(balancingAllowance * 100) / 100,
    balancingChargeTotal: Math.round(balancingCharge * 100) / 100,
    netCapitalAllowanceDeduction: Math.round(netCapitalAllowanceDeduction * 100) / 100,
    taxableIncomeBeforeLossRelief: Math.round(taxableIncomeBeforeLossRelief * 100) / 100,
    isTaxLoss,
    taxLossAmount: Math.round(taxLossAmount * 100) / 100,
    adjustmentsProcessed: processedList,
    generatedAt: new Date().toISOString()
  };
}

/**
 * Adapter helper to convert legacy TaxAdjustment to authoritative TaxAdjustmentEntry
 */
export function toAuthoritativeTaxAdjustment(adj: TaxAdjustment): import('../../types/taxAdjustment').TaxAdjustmentEntry {
  const categoryMap: Record<string, import('../../types/taxAdjustment').TaxAdjustmentCategory> = {
    'ADJ-DEPR': 'DEPRECIATION_ADDBACK',
    'ADJ-FINES': 'FINES_PENALTIES',
    'ADJ-DONATION': 'APPROVED_DONATIONS',
    'ADJ-PRIVATE': 'PRIVATE_EXPENDITURE',
    'ADJ-CAPITAL': 'CAPITAL_EXPENDITURE',
    'ADJ-OWNER': 'OWNER_DRAWINGS',
    'ADJ-RELATED': 'RELATED_PARTY_EXCESS',
    'ADJ-OTHER': 'NON_DEDUCTIBLE_EXPENDITURE'
  };

  return {
    id: adj.adjustmentId,
    tenantId: adj.entityId || 'COMPANY-001',
    taxYear: adj.taxYear || new Date().getFullYear(),
    sourceTransactionId: adj.sourceTransactionId,
    supportingDocument: adj.supportingDocumentId,
    accountCode: 'ACC-TAX-ADJ',
    accountName: adj.adjustmentName || adj.reason,
    adjustmentCode: adj.miraCode,
    category: categoryMap[adj.miraCode] || 'NON_DEDUCTIBLE_EXPENDITURE',
    description: adj.reason,
    amount: adj.amount,
    direction: adj.direction === 'DEDUCTION' ? 'DEDUCTION' : 'ADD_BACK',
    ruleId: `RULE-${adj.miraCode}`,
    ruleVersion: 'v25.1',
    reviewStatus: adj.reviewStatus,
    createdAt: adj.createdAt || new Date().toISOString(),
    updatedAt: adj.createdAt || new Date().toISOString()
  };
}
