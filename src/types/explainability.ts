import { TaxpayerType } from '../regulatory/types';

export type CalculationType =
  | 'INCOME_TAX_COMPANY'
  | 'INCOME_TAX_INDIVIDUAL'
  | 'GST_GENERAL'
  | 'GST_TOURISM'
  | 'NWT_WITHHOLDING'
  | 'CAPITAL_ALLOWANCE'
  | 'TAX_ADJUSTMENT'
  | 'MIRA_604';

export interface ExplanationAdjustment {
  id?: string;
  code?: string;
  description: string;
  type: 'ADD_BACK' | 'DEDUCTION';
  amount: number;
  legalReference: string;
  isStatutory: boolean;
}

export interface ExplanationPriorLoss {
  originTaxYear: number;
  originalAmount: number;
  utilisedAmount: number;
  remainingAmount: number;
  isExpired: boolean;
  expiryTaxYear?: number;
  legalReference: string;
}

export interface ExplanationTaxCredit {
  creditId?: string;
  type: string;
  description: string;
  amount: number;
  legalReference: string;
}

export interface ExplanationPrepayment {
  paymentId?: string;
  type: string;
  amount: number;
  paymentDate?: string;
  referenceNumber?: string;
  legalReference: string;
}

export interface ExplanationWithholdingCredit {
  creditId?: string;
  type: string;
  payerName?: string;
  taxWithheld: number;
  legalReference: string;
}

export interface ExplanationRuleRef {
  ruleId: string;
  ruleCode: string;
  legalReference: string;
  version?: string;
  sourceId?: string;
}

export interface ExplanationRule {
  ruleId: string;
  ruleCode: string;
  description: string;
  legalReference: string;
  sourceId: string;
  version: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  parameters: Record<string, any>;
}

export interface ExplanationBracketDetail {
  bracketIndex: number;
  bracketName: string;
  minIncome: number;
  maxIncome: number | null;
  taxableAmount: number;
  rate: number;
  ratePercentage: number;
  taxAmount: number;
  ruleId: string;
  formula: string;
  stepExplanation: string;
}

export interface ExplanationStep {
  stepNumber: number;
  stepKey: string;
  title: string;
  ruleRef: ExplanationRuleRef;
  formula: string;
  operands: Record<string, number | string | boolean>;
  intermediateResult: number | string | boolean;
  explanationText: string;
  bracketBreakdown?: ExplanationBracketDetail[];
}

export interface ExplanationInputs {
  rawInputs: Record<string, any>;
  normalizedInputs: Record<string, any>;
  taxYear: number;
  accountingDays: number;
  groupFactor: number;
  accountingProfit?: number;
  grossTaxableIncome?: number;
  adjustments?: ExplanationAdjustment[];
  priorLosses?: ExplanationPriorLoss[];
  taxCredits?: ExplanationTaxCredit[];
  prepayments?: ExplanationPrepayment[];
  withholdingCredits?: ExplanationWithholdingCredit[];
  [key: string]: any;
}

export interface ExplanationIntermediateResults {
  accountingProfit?: number;
  totalAdditions?: number;
  totalDeductions?: number;
  adjustedTaxableProfitBeforeLoss?: number;
  priorLossesAvailable?: number;
  lossReliefApplied?: number;
  remainingUnabsorbedLosses?: number;
  netTaxableIncome: number;
  proRatedThreshold?: number;
  bracketBreakdowns?: ExplanationBracketDetail[];
  grossTaxLiability: number;
  totalTaxCreditsApplied: number;
  netTaxAfterCredits: number;
  totalDeductionsAtSource: number;
  [key: string]: any;
}

export interface FormattedTaxSummary {
  taxableIncomeLine: string; // e.g. "Taxable income: MVR 3,500,000.00"
  bracketLines: string[];    // e.g. ["Bracket 1: MVR 500,000.00 × 0% = MVR 0.00", "Bracket 2: MVR 3,000,000.00 × 15% = MVR 450,000.00"]
  creditsLine?: string;      // e.g. "Tax Credits Applied: MVR 20,000.00"
  prepaymentsLine?: string;  // e.g. "Prepayments & Withholding: MVR 100,000.00"
  totalLine: string;         // e.g. "Total Income Tax Payable: MVR 330,000.00"
}

export interface ExplanationFinalResult {
  finalTaxPayable: number;
  isRefundable: boolean;
  refundAmount: number;
  payableAmount: number;
  effectiveTaxRatePercentage: number;
  formattedSummary: FormattedTaxSummary;
}

export interface ExplanationMetadata {
  engineVersion: string;
  deterministicHash: string;
  isDeterministicVerified: boolean;
  reproductionStatus: 'EXACT_MATCH' | 'DISCREPANCY_DETECTED';
  ruleCount: number;
  stepCount: number;
  unexplainedAdjustmentCount: number; // Guardrail: MUST be 0
  generatedWithoutAI: true; // Hard guarantee: directly produced by deterministic mathematical engine
  generatedAt: string;
}

export interface TaxCalculationExplanation {
  calculationId: string;
  calculationType: CalculationType;
  taxYear?: number;
  period?: string;
  taxpayer: {
    tin?: string;
    entityName?: string;
    taxpayerType?: TaxpayerType | string;
    residencyStatus?: 'RESIDENT' | 'NON_RESIDENT';
  };
  timestamp: string;
  currency: 'MVR' | 'USD';

  // Core 5-Part Architectural Structure
  inputs: ExplanationInputs;
  rules: ExplanationRule[];
  steps: ExplanationStep[];
  intermediateResults: ExplanationIntermediateResults;
  finalResult: ExplanationFinalResult;

  // Verifiability & Integrity Metadata
  metadata: ExplanationMetadata;
}

export interface ExplanationVerificationResult {
  isValid: boolean;
  reproducedFinalTax: number;
  originalFinalTax: number;
  discrepancy: number;
  allStepsHaveRuleRef: boolean;
  unexplainedAdjustmentCount: number;
  reproductionStatus: 'EXACT_MATCH' | 'DISCREPANCY_DETECTED';
  errors: string[];
}
