import { RegulatoryTestCase } from './regression';

export * from './regression';

export type TaxType = 
  | 'GST' 
  | 'INCOME_TAX' 
  | 'NWT' 
  | 'CAPITAL_ALLOWANCE' 
  | 'STAMP_DUTY' 
  | 'OTHER';

export type RuleStatus = 
  | 'ACTIVE' 
  | 'SUPERSEDED' 
  | 'DRAFT' 
  | 'REVIEW_REQUIRED';

export type TaxpayerType = 
  | 'COMPANY' 
  | 'SOLE_PROPRIETOR' 
  | 'INDIVIDUAL' 
  | 'PARTNERSHIP' 
  | 'TRUST'
  | 'BODY_OF_PERSONS'
  | 'NON_RESIDENT_COMPANY'
  | 'ALL';

export type BusinessSector = 
  | 'GENERAL' 
  | 'TOURISM' 
  | 'ALL';

export interface RegulatoryRule {
  ruleId: string;
  taxType: TaxType;
  ruleCode: string;
  description: string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null; // YYYY-MM-DD or null if currently active
  taxYear: number | null;
  version: string;
  legalReference: string;
  sourceURL: string;
  sourceId?: string;
  parameters: Record<string, any>;
  status: RuleStatus;
  sector?: BusinessSector;
  taxpayerType?: TaxpayerType;
  jurisdiction?: string; // Default: 'MV'
  testCases?: RegulatoryTestCase[];
  checksum?: string;
}

export interface RegulatoryVersion {
  versionId: string;
  versionNumber: string; // e.g. "v25.1"
  effectiveTaxYear: number;
  releaseDate: string; // YYYY-MM-DD
  description: string;
  miraNoticeReference?: string;
  status: 'ACTIVE' | 'DEPRECATED' | 'DRAFT';
}

export interface RegulatorySource {
  sourceId: string;
  title: string;
  legislation: string;
  section: string;
  url: string;
  effectiveDate: string;
  verifiedOn: string;
  notes?: string;
}

export interface RuleResolverContext {
  transactionDate: string | Date; // Date or ISO YYYY-MM-DD
  taxYear?: number;
  taxpayerType?: TaxpayerType;
  sector?: BusinessSector;
  jurisdiction?: string; // Default: 'MV'
  applicableRegulatoryVersion?: string;
  taxType?: TaxType;
  ruleCode?: string;
}
