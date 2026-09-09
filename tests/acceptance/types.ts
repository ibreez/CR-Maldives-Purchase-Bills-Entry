/**
 * Phase 50 — Accountant Acceptance Testing Types
 * 
 * Maldives Inland Revenue Authority (MIRA) & CA Maldives
 * Structured Acceptance-Test Framework for Accounting & Tax Practitioners
 */

export type AcceptanceCategory =
  | 'PURCHASE_INVOICES'
  | 'GST'
  | 'TOURISM_GST'
  | 'NWT'
  | 'FOREIGN_CURRENCY'
  | 'CAPITAL_ASSETS'
  | 'TAX_ADJUSTMENTS'
  | 'TAX_LOSSES'
  | 'COMPANY_INCOME_TAX'
  | 'INDIVIDUAL_INCOME_TAX'
  | 'RELATED_PARTIES'
  | 'CFE'
  | 'PERIOD_AMENDMENTS'
  | 'MIRA_604'
  | 'MIRA_205'
  | 'MIRA_206'
  | 'MIRA_602';

export type AcceptanceTestStatus =
  | 'PENDING_REVIEW'
  | 'IN_REVIEW'
  | 'PASSED'
  | 'FAILED'
  | 'FLAGGED_WITH_COMMENTS'
  | 'CONDITIONALLY_ACCEPTED';

export interface ReviewerProfile {
  reviewerId: string;
  name: string;
  designation: string;
  licenseNumber: string; // e.g. MIRA-TA-2021-018
  firm: string;
  membershipBody: string; // e.g. CA Maldives, ACCA, CPA
  contactEmail?: string;
}

export interface JournalLineExpectation {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string;
}

export interface ExpectedAccounting {
  journalEntries: JournalLineExpectation[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  assetCapitalized: boolean;
  assetClass?: string;
  usefulLifeYears?: number;
  fxGainLoss?: {
    amount: number;
    type: 'REALIZED_GAIN' | 'REALIZED_LOSS' | 'UNREALIZED_GAIN' | 'UNREALIZED_LOSS' | 'NONE';
    exchangeRateUsed: number;
  };
  accountingNotes: string;
}

export interface ExpectedTaxTreatment {
  taxType: 'GST' | 'TGST' | 'NWT' | 'CIT' | 'IIT' | 'CAPITAL_ALLOWANCE' | 'MIXED';
  statutoryRate: number; // percentage (e.g. 8, 16, 17, 10, 5, 15, 0)
  taxableAmount: number;
  taxAmount: number;
  deductibilityStatus:
    | 'FULLY_DEDUCTIBLE'
    | 'PARTIALLY_DEDUCTIBLE'
    | 'NON_DEDUCTIBLE'
    | 'BLOCKED_INPUT_TAX'
    | 'CLAIMABLE_INPUT_TAX'
    | 'EXEMPT'
    | 'ZERO_RATED'
    | 'STATUTORY_WITHHOLDING';
  statutoryCitation: string;
  treatmentExplanation: string;
}

export interface ExpectedMiraResult {
  formId: 'MIRA_205' | 'MIRA_206' | 'MIRA_602' | 'MIRA_604';
  formTitle: string;
  formVersion: string;
  relevantBoxes: Record<string, number | string | boolean>;
  netStatutoryPayableOrRefundable: number;
  miraReturnNotice: string;
}

export interface PractitionerSignOff {
  reviewer: ReviewerProfile;
  reviewDate: string; // YYYY-MM-DD
  result: AcceptanceTestStatus;
  comments: string;
  verifiedCalculations: boolean;
  statutoryComplianceConfirmed: boolean;
  signatureHash: string; // SHA-256 digital signature
}

export interface AnonymizedTaxpayer {
  name: string;
  tin: string;
  entityType: 'COMPANY' | 'INDIVIDUAL' | 'PARTNERSHIP';
  regime: 'GENERAL' | 'TOURISM';
  sector: string;
  registeredAddress: string;
}

export interface AcceptanceTestCase {
  caseId: string;
  scenarioNumber: number;
  title: string;
  category: AcceptanceCategory;
  anonymizedTaxpayer: AnonymizedTaxpayer;
  scenarioDescription: string;
  input: Record<string, any>;
  expectedAccounting: ExpectedAccounting;
  expectedTaxTreatment: ExpectedTaxTreatment;
  expectedMiraResult: ExpectedMiraResult;
  reviewer: ReviewerProfile | null;
  reviewDate: string | null;
  result: AcceptanceTestStatus;
  comments: string;
  calculationRunDetails?: {
    computedMatchesExpected: boolean;
    discrepancies: string[];
    executionTimestamp?: string;
  };
  practitionerSignOff?: PractitionerSignOff;
}

export interface AcceptanceSuiteReportSummary {
  totalScenarios: number;
  passedCount: number;
  pendingCount: number;
  failedCount: number;
  categoriesCovered: number;
  allCategoriesCovered: boolean;
  practitionersInvolved: ReviewerProfile[];
  generatedAt: string;
}
