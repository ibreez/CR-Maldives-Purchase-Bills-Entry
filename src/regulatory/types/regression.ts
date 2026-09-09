import { BusinessSector, RegulatoryRule, RegulatorySource, RuleStatus, TaxpayerType, TaxType } from './index';

export interface RegulatoryTestCase {
  testCaseId: string;
  name: string;
  description?: string;
  input: {
    transactionDate: string;
    taxYear?: number;
    taxpayerType?: TaxpayerType;
    sector?: BusinessSector;
    taxType?: TaxType;
    ruleCode?: string;
    amount?: number;
    category?: string;
    [key: string]: any;
  };
  expected: {
    ruleId: string;
    rate?: number;
    ratePercentage?: number;
    threshold?: number;
    parametersMatch?: Record<string, any>;
    calculatedTax?: number;
    [key: string]: any;
  };
}

export type RegulatoryRegressionTest = RegulatoryTestCase;

export interface RegulatoryRuleVersion {
  ruleId: string;
  ruleCode: string;
  version: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  taxYear: number | null;
  taxType: TaxType;
  description: string;
  legalReference: string;
  sourceURL: string;
  sourceId?: string;
  source?: RegulatorySource;
  parameters: Record<string, any>;
  status: RuleStatus;
  sector?: BusinessSector;
  taxpayerType?: TaxpayerType;
  jurisdiction?: string;
  testCases: RegulatoryTestCase[];
  checksum: string;
}

export interface RegulatorySnapshot {
  snapshotId: string;
  asOfDate: string;
  effectiveTaxYear?: number;
  regulatoryVersion: string;
  createdAt: string;
  sha256Digest: string;
  ruleCount: number;
  taxTypesCovered: TaxType[];
  rules: RegulatoryRule[];
}

export interface RegulatoryTestCaseResult {
  ruleId: string;
  testCaseId: string;
  name: string;
  passed: boolean;
  error?: string;
  expected: any;
  actual: any;
}

export interface RegulatoryRegressionResult {
  totalTests: number;
  passed: number;
  failed: number;
  isSuccess: boolean;
  timestamp: string;
  executedRuleIds: string[];
  testCaseResults: RegulatoryTestCaseResult[];
  historicalConsistencyConfirmed: boolean;
}

export interface RegulatoryComparisonReport {
  baselineSnapshotId: string;
  targetSnapshotId: string;
  asOfDateBaseline: string;
  asOfDateTarget: string;
  addedRules: RegulatoryRule[];
  removedRules: RegulatoryRule[];
  modifiedRules: Array<{
    ruleId: string;
    ruleCode: string;
    field: string;
    oldValue: any;
    newValue: any;
  }>;
  isIdentical: boolean;
}
