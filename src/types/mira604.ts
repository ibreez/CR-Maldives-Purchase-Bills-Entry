import { EntityType } from '../config/miraTaxRates';
import { TaxBracketDetail } from '../services/tax/entityTaxService';
import { TaxAdjustment } from '../services/tax/taxAdjustmentService';

/**
 * Section A: Taxpayer Information
 */
export interface TaxpayerInfo {
  tin: string;
  taxpayerName: string;
  entityType: EntityType;
  taxYear: number;
  accountingPeriodStart: string; // YYYY-MM-DD
  accountingPeriodEnd: string;   // YYYY-MM-DD
  contactEmail?: string;
  contactPhone?: string;
  businessActivity?: string;
}

/**
 * Section B: Schedule 1 Profit & Loss Summary
 */
export interface Schedule1PnLSummary {
  grossRevenue: number;
  costOfSales: number;
  grossProfit: number;
  otherIncome: number;
  operatingExpenses: number;
  accountingProfitBeforeTax: number;
}

/**
 * Section C: Tax Adjustments
 */
export interface TaxAdjustmentsSummary {
  itemizedAddBacks: TaxAdjustment[];
  totalAddBacks: number;
  itemizedDeductions: TaxAdjustment[];
  totalDeductions: number;
  netTaxAdjustments: number; // totalAddBacks - totalDeductions
}

/**
 * Section D: Schedule 2 Capital Allowances
 */
export interface Schedule2CapitalAllowanceSummary {
  totalClaimableCapitalAllowance: number;
  assetClassBreakdown?: Array<{
    assetClass: string;
    allowanceClaimed: number;
  }>;
}

/**
 * Section E: Taxable Income & Loss Relief
 */
export interface TaxableIncomeAndLossReliefSummary {
  adjustedTaxableProfitBeforeLoss: number;
  priorUnabsorbedLosses: number;
  lossCarriedForwardApplied: number;
  remainingUnabsorbedLoss: number;
  netTaxableIncome: number;
  isTaxLoss: boolean;
  taxLossAmount: number;
}

/**
 * Section F: Tax Computation
 */
export interface TaxComputationSummary {
  taxThreshold?: number;
  taxByBracket: TaxBracketDetail[];
  totalTaxPayable: number;
  advanceTaxPaid: number;
  interimTaxPaid: number;
  withholdingTaxDeducted: number;
  totalPrepayments: number;
  netTaxDueOrRefundable: number; // Positive = Tax Due, Negative = Refundable
  effectiveTaxRate: number;
}

/**
 * Complete MIRA 604 Income Tax Return Form
 */
export interface Mira604TaxReturn {
  formId: string; // e.g. MIRA604-2026-TIN-1000200
  formVersion: 'V25.1';
  submissionStatus: 'DRAFT' | 'READY_FOR_FILING' | 'SUBMITTED';
  generatedAt: string;

  sectionA_TaxpayerInfo: TaxpayerInfo;
  sectionB_Schedule1PnL: Schedule1PnLSummary;
  sectionC_TaxAdjustments: TaxAdjustmentsSummary;
  sectionD_CapitalAllowances: Schedule2CapitalAllowanceSummary;
  sectionE_TaxableIncomeLoss: TaxableIncomeAndLossReliefSummary;
  sectionF_TaxComputation: TaxComputationSummary;

  verificationChecksum?: string;
}

/**
 * Input Data Parameters for MIRA 604 Return Generation
 */
export interface Mira604InputData {
  taxpayer: TaxpayerInfo;
  pnl: {
    grossRevenue: number;
    costOfSales: number;
    otherIncome?: number;
    operatingExpenses: number;
    accountingProfitBeforeTax?: number; // Calculated automatically if omitted
  };
  adjustments?: TaxAdjustment[];
  capitalAllowanceTotal?: number;
  capitalAllowanceBreakdown?: Array<{ assetClass: string; allowanceClaimed: number }>;
  priorUnabsorbedLosses?: number;
  priorLossRecords?: Array<{ year: number; lossAmount: number; utilisedAmount?: number }>;
  advancePayments?: {
    advanceTaxPaid?: number;
    interimTaxPaid?: number;
    withholdingTaxDeducted?: number;
  };
  accountingDays?: number;
  groupFactor?: number;
}
