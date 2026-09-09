import { TaxpayerType } from '../../../types';
import { FieldSourceTrace, FormValidationResult, FormFieldDefinition } from '../../types';

export type MIRA604ScheduleCode = 
  | 'SCHEDULE_2' 
  | 'SCHEDULE_3' 
  | 'SCHEDULE_4' 
  | 'SCHEDULE_5';

export interface ScheduleApplicabilityResult {
  scheduleCode: MIRA604ScheduleCode;
  isApplicable: boolean;
  reason: string;
  triggeredBy?: string[];
}

// ----------------------------------------------------------------------
// Schedule 2 Data Types (Statement of Financial Position)
// ----------------------------------------------------------------------
export interface Schedule2BalanceSheetData {
  nonCurrentAssets: {
    propertyPlantEquipment?: number;
    investmentProperty?: number;
    intangibleAssets?: number;
    longTermInvestments?: number;
    otherNonCurrentAssets?: number;
  };
  currentAssets: {
    inventories?: number;
    tradeAndOtherReceivables?: number;
    cashAndCashEquivalents?: number;
    shortTermInvestments?: number;
    prepaymentsAndOtherCurrentAssets?: number;
  };
  equity: {
    shareCapital?: number;
    retainedEarnings?: number;
    otherReserves?: number;
  };
  nonCurrentLiabilities: {
    longTermBorrowings?: number;
    deferredTaxLiabilities?: number;
    otherNonCurrentLiabilities?: number;
  };
  currentLiabilities: {
    tradeAndOtherPayables?: number;
    shortTermBorrowings?: number;
    currentTaxPayable?: number;
    otherCurrentLiabilities?: number;
  };
  glAccountReferences?: Record<string, string>;
}

// ----------------------------------------------------------------------
// Schedule 3 Data Types (Statement of Net Worth Excluding Business)
// ----------------------------------------------------------------------
export interface Schedule3PersonalNetWorthData {
  personalAssets: {
    immovableProperties?: number; // Land & buildings held personally
    vehiclesAndVessels?: number;  // Personal cars, speedboats, etc.
    bankDepositsAndCash?: number; // Personal bank accounts & cash
    sharesAndSecurities?: number; // Personal portfolio investments
    jewelryAndValuables?: number; // Precious metals, jewelry, art
    personalReceivables?: number; // Loans given personally
    otherPersonalAssets?: number;
  };
  personalLiabilities: {
    housingMortgages?: number;    // Personal home mortgages
    personalBankLoans?: number;   // Auto/personal loans
    creditCardsAndOther?: number; // Card balances & personal debts
  };
  previousYearNetWorth?: number;
  assetValuationReferences?: Record<string, string>;
}

// ----------------------------------------------------------------------
// Schedule 4 Data Types (International Transactions with Associates)
// ----------------------------------------------------------------------
export type AssociateRelationshipType = 
  | 'FOREIGN_PARENT' 
  | 'FOREIGN_SUBSIDIARY' 
  | 'FELLOW_SUBSIDIARY' 
  | 'BRANCH_OFFICE' 
  | 'COMMON_CONTROL' 
  | 'INDIVIDUAL_ASSOCIATE' 
  | 'OTHER_ASSOCIATE';

export type TransferPricingTransactionCategory = 
  | 'SALE_OF_GOODS' 
  | 'PURCHASE_OF_GOODS' 
  | 'SERVICES_PROVIDED' 
  | 'SERVICES_RECEIVED' 
  | 'ROYALTIES_IP_FEES' 
  | 'FINANCE_INTEREST_PAID' 
  | 'FINANCE_INTEREST_RECEIVED' 
  | 'MANAGEMENT_FEES' 
  | 'GUARANTEE_FEES' 
  | 'CAPITAL_TRANSACTION' 
  | 'OTHER';

export type TransferPricingMethod = 
  | 'CUP' 
  | 'RESALE_PRICE' 
  | 'COST_PLUS' 
  | 'TNMM' 
  | 'PROFIT_SPLIT' 
  | 'OTHER';

export interface InternationalAssociateTransaction {
  id?: string;
  associateName: string;
  associateTinOrRegistration?: string;
  countryOfResidence: string; // Non-Maldives country
  relationshipType: AssociateRelationshipType;
  ownershipPercentage: number; // 0 - 100
  transactionCategory: TransferPricingTransactionCategory;
  transferPricingMethod: TransferPricingMethod;
  recordedAmount: number;
  armsLengthAmount: number;
  tpDocumentationHeld: boolean;
  notes?: string;
  glAccountReference?: string;
}

export interface Schedule4SourceData {
  hasInternationalAssociateTransactions?: boolean;
  transactions?: InternationalAssociateTransaction[];
  tpMasterFileHeld?: boolean;
  tpLocalFileHeld?: boolean;
}

// ----------------------------------------------------------------------
// Schedule 5 Data Types (Controlled Foreign Entities - CFE)
// ----------------------------------------------------------------------
export type CfeExemptionReason = 
  | 'NOT_EXEMPT' 
  | 'ACTIVE_BUSINESS_EXCEPTION' 
  | 'MINIMUM_FOREIGN_TAX_RATE_MET' 
  | 'DE_MINIMIS_THRESHOLD_MET';

export interface ControlledForeignEntityRecord {
  id?: string;
  cfeName: string;
  countryOfIncorporation: string;
  countryOfTaxResidence: string;
  directOwnershipPercentage: number;
  indirectOwnershipPercentage?: number;
  totalControlPercentage: number; // > 50% for CFE status
  accountingNetProfit: number; // Pre-tax or distributable accounting profit
  foreignIncomeTaxPaid: number;
  effectiveForeignTaxRate?: number; // foreignIncomeTaxPaid / accountingNetProfit
  exemptionReason: CfeExemptionReason;
  attributableTaxableIncome?: number; // Computed if NOT_EXEMPT: profit * control %
  foreignTaxCreditShare?: number;     // Allowable FTC share
  notes?: string;
}

export interface Schedule5SourceData {
  hasControlledForeignEntities?: boolean;
  controlledForeignEntities?: ControlledForeignEntityRecord[];
}

// ----------------------------------------------------------------------
// Schedule Instance & Overall Engine Result
// ----------------------------------------------------------------------
export interface ScheduleInstance<TData = any> {
  scheduleCode: MIRA604ScheduleCode;
  scheduleTitle: string;
  version: string;
  taxYear: number;
  isApplicable: boolean;
  applicabilityReason: string;
  values: Record<string, any>;
  items?: any[];
  traces: Record<string, FieldSourceTrace>;
  validationResult: FormValidationResult;
  status: 'VALIDATED' | 'REJECTED' | 'NOT_APPLICABLE';
  metadata: {
    generatedAt: string;
    calculationDurationMs: number;
  };
}

export interface MIRA604SchedulesContext {
  taxpayerType: TaxpayerType;
  taxYear: number;
  grossRevenue?: number;
  totalAssets?: number;
  schedule2Data?: Schedule2BalanceSheetData;
  schedule3Data?: Schedule3PersonalNetWorthData;
  schedule4Data?: Schedule4SourceData;
  schedule5Data?: Schedule5SourceData;
}

export interface ScheduleEngineResult {
  schedule2?: ScheduleInstance<Schedule2BalanceSheetData>;
  schedule3?: ScheduleInstance<Schedule3PersonalNetWorthData>;
  schedule4?: ScheduleInstance<Schedule4SourceData>;
  schedule5?: ScheduleInstance<Schedule5SourceData>;
  reconciliationSummary: {
    schedule2BalanceVariance: number;
    schedule3NetWorth: number;
    schedule4TotalAdjustment: number;
    schedule5TotalAttributableIncome: number;
    schedule5TotalForeignTaxCredit: number;
  };
  overallStatus: 'VALIDATED' | 'REJECTED' | 'WARNINGS';
  validationErrors: FormValidationResult['errors'];
}
