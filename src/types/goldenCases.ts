/**
 * Golden Regulatory Tax Cases - Phase 41 Data Models
 * Defines immutable schemas for the 20 MIRA regulatory benchmark test cases.
 */

export type GoldenCaseId =
  | 'GOLDEN-001'
  | 'GOLDEN-002'
  | 'GOLDEN-003'
  | 'GOLDEN-004'
  | 'GOLDEN-005'
  | 'GOLDEN-006'
  | 'GOLDEN-007'
  | 'GOLDEN-008'
  | 'GOLDEN-009'
  | 'GOLDEN-010'
  | 'GOLDEN-011'
  | 'GOLDEN-012'
  | 'GOLDEN-013'
  | 'GOLDEN-014'
  | 'GOLDEN-015'
  | 'GOLDEN-016'
  | 'GOLDEN-017'
  | 'GOLDEN-018'
  | 'GOLDEN-019'
  | 'GOLDEN-020';

export type GoldenCaseCategory =
  | 'GST'
  | 'NWT'
  | 'INCOME_TAX'
  | 'CAPITAL_ASSETS'
  | 'FX'
  | 'TRANSFER_PRICING'
  | 'CFE'
  | 'PERIOD_CONTROL'
  | 'ACCOUNTING_AUDIT'
  | 'OCR_CORRECTION'
  | 'FILING_PACKAGE';

export interface GoldenCaseTaxpayerInput {
  tenantId: string;
  tin: string;
  taxpayerName: string;
  businessType: 'COMPANY' | 'INDIVIDUAL' | 'PARTNERSHIP';
  sector: 'GENERAL' | 'TOURISM' | 'TELECOM' | 'FINANCIAL';
  isGstRegistered: boolean;
  filingFrequency?: 'MONTHLY' | 'QUARTERLY';
  taxYear?: number;
}

export interface GoldenCaseDocumentInput {
  fileName: string;
  documentType: string;
  supplierName?: string;
  supplierTin?: string;
  invoiceNumber?: string;
  issueDate: string;
  currency: string;
  exchangeRate?: number;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  items?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
  rawExtractionText?: string;
}

export interface GoldenCaseInputs {
  taxpayer: GoldenCaseTaxpayerInput;
  document?: GoldenCaseDocumentInput;
  documents?: GoldenCaseDocumentInput[];
  parameters?: Record<string, any>;
  priorUnabsorbedLosses?: number;
  relatedPartyData?: Record<string, any>;
  cfeData?: Record<string, any>;
  sessionUser?: {
    userId: string;
    role: string;
    name: string;
  };
}

export interface GoldenCaseExpectedClassifications {
  documentType?: string;
  accountingClassification?: string;
  accountingCategory?: string;
  gstTreatment?: string;
  incomeTaxTreatment?: string;
  miraCategory?: string;
  reviewStatus?: string;
  taxRate?: number;
}

export interface GoldenCaseExpectedCalculations {
  subtotal?: number;
  taxableAmount?: number;
  gstAmount?: number;
  totalAmount?: number;
  claimableInputTax?: number;
  blockedInputTax?: number;
  outputGst?: number;
  netGstPayable?: number;
  whtGrossAmount?: number;
  whtRate?: number;
  whtAmountWithheld?: number;
  whtNetAmountPaid?: number;
  costBasis?: number;
  capitalAllowanceClaimed?: number;
  bookDepreciationAddBack?: number;
  taxAdjustmentsAddBack?: number;
  taxAdjustmentsDeductions?: number;
  netTaxAdjustments?: number;
  grossRevenue?: number;
  totalExpenses?: number;
  accountingProfit?: number;
  adjustedTaxableProfit?: number;
  lossReliefApplied?: number;
  remainingLossCarriedForward?: number;
  netTaxableIncome?: number;
  taxLiability?: number;
  individualBracketBreakdown?: Array<{
    bracketIndex: number;
    bracketName: string;
    rate: number;
    taxableInBracket: number;
    taxForBracket: number;
  }>;
  journalBalanceVariance?: number;
  realizedFxGainLoss?: number;
}

export interface GoldenCaseExpectedReturnValues {
  primaryForm: 'MIRA_105' | 'MIRA_205' | 'MIRA_206' | 'MIRA_302' | 'MIRA_602' | 'MIRA_604' | 'MIRA_PACKAGE';
  boxValues?: Record<string, number | string>;
  schedulesIncluded?: string[];
  totalFormsCount?: number;
}

export interface GoldenCaseExpectedReconciliationState {
  isValid: boolean;
  discrepanciesCount: number;
  glBalanced: boolean;
  auditHashChainValid: boolean;
  periodState?: string;
  isFilingReady: boolean;
}

export interface GoldenTaxCaseFixture {
  caseId: GoldenCaseId;
  caseNumber: number;
  title: string;
  description: string;
  category: GoldenCaseCategory;
  regulatoryReferences: string[];
  effectiveDate: string;
  inputs: GoldenCaseInputs;
  expectedClassifications: GoldenCaseExpectedClassifications;
  expectedCalculations: GoldenCaseExpectedCalculations;
  expectedReturnValues: GoldenCaseExpectedReturnValues;
  expectedReconciliationState: GoldenCaseExpectedReconciliationState;
  immutableSha256Checksum?: string;
}

export interface GoldenCaseValidationResult {
  caseId: GoldenCaseId;
  passed: boolean;
  checksumValid: boolean;
  classificationMatches: boolean;
  calculationMatches: boolean;
  returnMatches: boolean;
  reconciliationMatches: boolean;
  errors: string[];
  warnings: string[];
}
