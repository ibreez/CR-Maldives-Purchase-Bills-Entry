import { TaxpayerType } from '../regulatory/types';
import { TaxLossLot, TaxLossUtilisation } from './taxLoss';
import { TaxCalculationExplanation } from './explainability';

export type { TaxpayerType, TaxLossLot, TaxLossUtilisation, TaxCalculationExplanation };

export interface TaxAdjustmentItem {
  id: string;
  code: string;
  description: string;
  amount: number;
  type: 'ADD_BACK' | 'DEDUCTION';
  legalReference?: string;
}

export interface PriorTaxLoss {
  year: number;
  lossAmount: number;
  utilisedAmount?: number;
  remainingAmount?: number;
  isExpired?: boolean;
}

export interface TaxCreditItem {
  creditId: string;
  type: 'FOREIGN_TAX_CREDIT' | 'DONATION_CREDIT' | 'STATUTORY_CREDIT' | 'OTHER';
  description: string;
  amount: number;
  claimableAmount?: number;
  referenceNumber?: string;
  jurisdiction?: string;
}

export interface PrepaymentItem {
  paymentId: string;
  type: 'FIRST_INTERIM_PAYMENT' | 'SECOND_INTERIM_PAYMENT' | 'ADVANCE_TAX_PAYMENT' | 'OTHER';
  amount: number;
  paymentDate: string;
  referenceNumber: string;
  notes?: string;
}

export interface WithholdingCreditItem {
  creditId: string;
  type: 'SECTION_54_EMPLOYEE_WHT' | 'SECTION_55_NWT_WITHHELD' | 'OTHER';
  payerName: string;
  payerTin?: string;
  certificateNumber?: string;
  grossAmount: number;
  taxWithheld: number;
  paymentDate: string;
}

export interface IncomeTaxCalculationInput {
  taxpayerType: TaxpayerType;
  taxYear: number;
  entityName?: string;
  tin?: string;
  accountingPeriodStart?: string; // YYYY-MM-DD
  accountingPeriodEnd?: string;   // YYYY-MM-DD
  accountingDays?: number;        // Default 365
  groupFactor?: number;           // Default 1 for standalone, >1 for group of companies
  accountingProfit: number;       // Net accounting profit before tax (can be negative for accounting loss)
  adjustments?: TaxAdjustmentItem[];
  capitalAllowanceClaimed?: number;
  exemptIncome?: number;
  priorLossRecords?: PriorTaxLoss[];
  priorUnabsorbedLosses?: number;
  lossLots?: TaxLossLot[];
  taxCredits?: TaxCreditItem[];
  prepayments?: PrepaymentItem[];
  withholdingCredits?: WithholdingCreditItem[];
  applicableRegulatoryVersion?: string;
}

export interface TaxableIncomeCalculation {
  accountingProfit: number;
  totalAdditions: number;
  totalDeductions: number;
  capitalAllowanceClaimed: number;
  exemptIncome: number;
  adjustedTaxableProfitBeforeLoss: number;
  priorLossesAvailable: number;
  lossReliefApplied: number;
  remainingUnabsorbedLosses: number;
  expiredLosses: number;
  netTaxableIncome: number;
  isTaxLoss: boolean;
  taxLossAmount: number;
  lossDetails: PriorTaxLoss[];
  lossLotUtilisations?: TaxLossUtilisation[];
  activeLossLots?: TaxLossLot[];
  ruleIds: string[];
  formula: string;
  stepExplanations: string[];
}

export interface TaxBracketCalculation {
  bracketIndex: number;
  bracketName: string;
  minIncome: number;
  maxIncome: number | null;
  rate: number;
  ratePercentage: number;
  taxableInBracket: number;
  taxInBracket: number;
  ruleId: string;
  formula: string;
  stepExplanation: string;
}

export interface TaxLiability {
  taxpayerType: TaxpayerType;
  taxYear: number;
  accountingDays: number;
  groupFactor: number;
  proRatedThreshold?: number;
  grossTaxableIncome: number;
  netTaxableIncome: number;
  brackets: TaxBracketCalculation[];
  totalGrossTaxLiability: number;
  effectiveTaxRate: number;       // Percentage (%) based on Gross Taxable Income
  effectiveTaxRateOnNet: number;  // Percentage (%) based on Net Taxable Income
  ruleIds: string[];
  formula: string;
  stepExplanations: string[];
}

export interface FinalTaxPayable {
  taxpayerType: TaxpayerType;
  taxYear: number;
  entityName?: string;
  tin?: string;
  accountingDays: number;
  groupFactor: number;

  // Step 1: Taxable Income & Loss Relief
  taxableIncomeCalculation: TaxableIncomeCalculation;

  // Step 2 & 3: Tax Liability by Brackets
  taxLiability: TaxLiability;

  // Step 4: Tax Credits
  taxCredits: TaxCreditItem[];
  totalTaxCredits: number;
  taxCreditsApplied: number;
  taxCreditsCarriedForward: number;
  netTaxAfterCredits: number;

  // Step 5: Prepayments & Withholding Deductions
  prepayments: PrepaymentItem[];
  totalPrepayments: number;
  withholdingCredits: WithholdingCreditItem[];
  totalWithholdingCredits: number;
  totalDeductionsAtSource: number;

  // Step 6: Final Tax Due or Refund
  finalTaxPayable: number; // Positive = Due to MIRA, Negative = Refundable
  isRefundable: boolean;
  refundAmount: number;
  payableAmount: number;

  // Step 7: Explainability & Audit Metadata
  calculationTimestamp: string;
  explanation?: TaxCalculationExplanation;
  auditSummary: {
    inputs: Record<string, any>;
    ruleIds: string[];
    intermediateValues: Record<string, any>;
    formula: string;
    stepExplanations: string[];
  };
}
