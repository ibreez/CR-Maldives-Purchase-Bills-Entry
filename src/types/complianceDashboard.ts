/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ComplianceStatus = 'PASS' | 'WARNING' | 'BLOCKED' | 'NOT_APPLICABLE';

export type ComplianceCategory =
  | 'accounting'
  | 'gst'
  | 'nwt'
  | 'income_tax'
  | 'mira_returns'
  | 'reconciliation'
  | 'approval'
  | 'period';

export type ComplianceIssueSeverity = 'BLOCKED' | 'WARNING';

export type ComplianceRecordType =
  | 'bill'
  | 'journal'
  | 'asset'
  | 'revenue'
  | 'period'
  | 'return'
  | 'schedule'
  | 'general_ledger';

export interface ComplianceIssue {
  id: string;
  category: ComplianceCategory;
  severity: ComplianceIssueSeverity;
  code: string;
  title: string;
  detail: string;
  remedy: string;
  legalReference?: string;
  recordId: string;
  recordType: ComplianceRecordType;
  recordIdentifier: string;
  recordDate?: string;
  amount?: number;
  outletId?: string;
  outletName?: string;
  metadata?: Record<string, any>;
}

export interface CategoryComplianceSummary {
  category: ComplianceCategory;
  categoryName: string;
  description: string;
  status: ComplianceStatus;
  passedCount: number;
  warningCount: number;
  blockedCount: number;
  notApplicableCount: number;
  issues: ComplianceIssue[];
}

export interface ComplianceDashboardResult {
  overallStatus: ComplianceStatus;
  asOfDate: string;
  period: string;
  outletId: string;
  outletName: string;
  entityName: string;
  tin: string;
  categories: Record<ComplianceCategory, CategoryComplianceSummary>;
  blockingIssues: ComplianceIssue[];
  warnings: ComplianceIssue[];
  totalChecks: number;
  totalPassed: number;
  totalWarnings: number;
  totalBlocked: number;
  filingReadiness: {
    isReadyToFile: boolean;
    blockedReasonCount: number;
    warningReasonCount: number;
    summaryText: string;
  };
}

export interface EvaluateComplianceOptions {
  tenantId?: string;
  outletId?: string;
  period?: string;
  taxYear?: number;
  bills?: any[];
  journals?: any[];
  assets?: any[];
  outlets?: any[];
  revenueRecords?: any[];
}
