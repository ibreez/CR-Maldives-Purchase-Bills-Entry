export type AccountingClassification =
  | 'EXPENSE'
  | 'COST_OF_SALES'
  | 'ASSET'
  | 'REVENUE'
  | 'LIABILITY'
  | 'EQUITY';

export type GstClassification =
  | 'STANDARD_RATED_8'
  | 'STANDARD_RATED_16'
  | 'STANDARD_RATED_17'
  | 'ZERO_RATED'
  | 'EXEMPT'
  | 'OUT_OF_SCOPE'
  | 'BLOCKED_INPUT_TAX'
  | 'GENERAL_INPUT_TAX'
  | 'CAPITAL_INPUT_TAX'
  | 'NO_INPUT_TAX';

export type IncomeTaxClassification =
  | 'DEDUCTIBLE'
  | 'NON_DEDUCTIBLE_FINE'
  | 'NON_DEDUCTIBLE_TAX_PAYMENT'
  | 'NON_DEDUCTIBLE_ENTERTAINMENT'
  | 'NON_DEDUCTIBLE_OTHER'
  | 'CAPITAL_ALLOWANCE'
  | 'TAX_EXEMPT_INCOME'
  | 'SPECIAL_TREATMENT';

export type NwtClassification =
  | 'NONE'
  | 'NWT_10_ROYALTY'
  | 'NWT_10_TECHNICAL_SERVICES'
  | 'NWT_10_RENT'
  | 'NWT_10_COMMISSION'
  | 'NWT_10_INSURANCE_PREMIUM'
  | 'NWT_5_CONTRACTOR'
  | 'NWT_10_INTEREST'
  | 'NWT_10_DIVIDENDS';

export type AssetClassification =
  | 'NONE'
  | 'BUILDINGS'
  | 'PLANT_EQUIPMENT_MACHINERY'
  | 'MOTOR_VEHICLES'
  | 'COMPUTER_SOFTWARE_HARDWARE'
  | 'FURNITURE_FITTINGS'
  | 'OFFICE_EQUIPMENT'
  | 'LOOSE_TOOLS_UTENSILS_CROCKERY';

export type MiraReportingClassification =
  | 'SCHEDULE1_REVENUE'
  | 'SCHEDULE1_COST_OF_SALES'
  | 'SCHEDULE1_SALARIES_WAGES'
  | 'SCHEDULE1_RENTAL_LEASE'
  | 'SCHEDULE1_REPAIRS_MAINTENANCE'
  | 'SCHEDULE1_PROFESSIONAL_FEES'
  | 'SCHEDULE1_INSURANCE_PREMIUM'
  | 'SCHEDULE1_RELATED_PARTY'
  | 'SCHEDULE1_OTHER_EXPENSES'
  | 'SCHEDULE2_CAPITAL_ALLOWANCE'
  | 'NON_DEDUCTIBLE';

export type ClassificationSource =
  | 'DETERMINISTIC_RULE'
  | 'AI_SUGGESTION'
  | 'MANUAL_OVERRIDE';

export type HighRiskCategory =
  | 'CAPITAL_ASSET'
  | 'BLOCKED_GST'
  | 'NON_DEDUCTIBLE_EXPENSE'
  | 'NWT_APPLICABLE'
  | 'RELATED_PARTY'
  | 'FOREIGN_SUPPLIER'
  | 'NONE';

export interface ClassificationInput {
  tenantId?: string;
  invoiceId?: string;
  lineId?: string;
  lineNumber?: number;
  description: string;
  itemCategory?: string;
  quantity?: number;
  unitPrice?: number;
  taxableAmount?: number;
  gstAmount?: number;
  totalAmount?: number;
  currency?: string;
  supplierName?: string;
  supplierTin?: string;
  supplierCountry?: string;
  isForeignSupplier?: boolean;
  isRelatedParty?: boolean;
  transactionDate?: string | Date;
  rawText?: string;
}

export interface CanonicalLineClassification {
  // Six Decoupled Classification Dimensions
  accountingClassification: AccountingClassification;
  gstClassification: GstClassification;
  incomeTaxClassification: IncomeTaxClassification;
  nwtClassification: NwtClassification;
  assetClassification: AssetClassification;
  miraReportingClassification: MiraReportingClassification;

  // Regulatory Traceability & Decision Metadata
  ruleId: string;
  regulatoryVersion: string;
  regulatoryCitation: string;
  classificationReason: string;
  confidence: number;
  source: ClassificationSource;

  // Review & Risk Metadata
  isHighRisk: boolean;
  highRiskCategory: HighRiskCategory;
  requiresReview: boolean;
  isApproved: boolean;
  reviewer?: string | null;
  reviewedAt?: string | Date | null;
}

export interface ClassificationOverridePayload {
  tenantId: string;
  invoiceId: string;
  lineId?: string;
  lineNumber?: number;
  overrideValues: Partial<{
    accountingClassification: AccountingClassification;
    gstClassification: GstClassification;
    incomeTaxClassification: IncomeTaxClassification;
    nwtClassification: NwtClassification;
    assetClassification: AssetClassification;
    miraReportingClassification: MiraReportingClassification;
  }>;
  overrideReason: string;
  overriddenBy: string;
}

export interface ClassificationApprovalPayload {
  tenantId: string;
  invoiceId: string;
  lineId?: string;
  lineNumber?: number;
  approvedBy: string;
  comments?: string;
}

export interface ClassificationValidationResult {
  isValid: boolean;
  canApprove: boolean;
  canPost: boolean;
  warnings: string[];
  errors: string[];
}
