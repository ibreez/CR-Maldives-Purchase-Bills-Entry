/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Types & Schemas for Pre-Filing Control Engine (Phase 45)
 * 
 * Maldives Inland Revenue Authority (MIRA) Statutory Pre-Filing Control Standard
 * Guarantees that no statutory filing package can be created while blocking issues remain.
 */

export type PreFilingReadinessStatus = 'READY_FOR_FILING' | 'NOT_READY';
export type PreFilingStatus = PreFilingReadinessStatus;

export type PreFilingCheckStatus = 'PASS' | 'WARNING' | 'BLOCKED' | 'NOT_APPLICABLE';

export type PreFilingIssueSeverity = 'BLOCKING' | 'WARNING';

export type PreFilingCheckCode =
  | 'ACCOUNTING_BALANCES'
  | 'NO_UNPOSTED_TRANSACTIONS'
  | 'NO_UNPOSTED_REQUIRED_TRANSACTIONS'
  | 'PERIOD_APPROVED'
  | 'PERIOD_STATUS_VALID'
  | 'GST_RECONCILED'
  | 'NWT_RECONCILED'
  | 'FIXED_ASSETS_RECONCILED'
  | 'TAX_ADJUSTMENTS_REVIEWED'
  | 'TAX_LOSSES_RECONCILED'
  | 'MIRA_RETURN_VALIDATED'
  | 'REQUIRED_SCHEDULES_VALIDATED'
  | 'SUPPORTING_DOCUMENTS_PRESENT'
  | 'MANDATORY_APPROVALS_COMPLETE'
  | 'NO_BLOCKING_AUDIT_EXCEPTIONS';

export interface PreFilingIssue {
  id: string;
  code?: string;
  checkCode: PreFilingCheckCode;
  checkName: string;
  severity: PreFilingIssueSeverity;
  title: string;
  detail: string;
  remedy: string;
  legalReference?: string;
  recordId?: string;
  recordType?:
    | 'bill'
    | 'journal'
    | 'asset'
    | 'revenue'
    | 'period'
    | 'return'
    | 'schedule'
    | 'tax_adjustment'
    | 'tax_loss'
    | 'audit_event'
    | 'general_ledger'
    | 'approval';
  recordIdentifier?: string;
  recordDate?: string;
  amount?: number;
}

export interface PreFilingCheck {
  code: PreFilingCheckCode;
  name: string;
  description: string;
  status: PreFilingCheckStatus;
  isPassed: boolean;
  hasBlockingIssues: boolean;
  issues: PreFilingIssue[];
  evaluatedAt: string;
  metrics?: Record<string, any>;
}

export interface PreFilingResult {
  status: PreFilingReadinessStatus; // 'READY_FOR_FILING' | 'NOT_READY'
  isReady: boolean;
  evaluatedAt: string;
  tenantId?: string;
  outletId?: string;
  period?: string;
  taxYear?: number;
  summary: {
    isReady: boolean;
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    warningChecks: number;
    blockingIssuesCount: number;
    warningsCount: number;
  };
  checks: Record<PreFilingCheckCode, PreFilingCheck>;
  checkList: PreFilingCheck[];
  blockingIssues: PreFilingIssue[];
  warnings: PreFilingIssue[];
  refusalReason?: string;
}

export interface PreFilingCheckInput {
  tenantId?: string;
  outletId?: string;
  period?: string;
  periodStatus?: string;
  periodApproved?: boolean;
  taxYear?: number;
  bills?: any[];
  journals?: any[];
  outlets?: any[];
  assets?: any[];
  revenueRecords?: any[];
  taxAdjustments?: any[];
  taxLossLots?: any[];
  auditLogs?: any[];
  trialBalance?: {
    totalDebits?: number;
    totalCredits?: number;
    difference?: number;
  };
  gstReconciliation?: {
    outputGst?: number;
    inputGst?: number;
    netPayable?: number;
    ledgerBalance?: number;
    variance?: number;
    isReconciled?: boolean;
  };
  nwtReconciliation?: {
    taxWithheld?: number;
    ledgerBalance?: number;
    variance?: number;
    isReconciled?: boolean;
  };
  miraReturnValid?: boolean;
  approvals?: {
    preparer?: any;
    reviewer?: any;
    taxAgent?: any;
  };
  supportingDocumentsCount?: number;
  blockingAuditExceptionsCount?: number;
  periodInfo?: {
    id?: string;
    periodKey?: string;
    status?: string; // 'OPEN' | 'PENDING_APPROVAL' | 'APPROVED' | 'LOCKED' | 'CLOSED'
    isApproved?: boolean;
    approvedBy?: string;
    approvedAt?: string;
    isLocked?: boolean;
    startDate?: string;
    endDate?: string;
  };
  miraReturns?: {
    mira604?: any;
    mira205?: any;
    mira206?: any;
    mira602?: any;
  };
  schedules?: {
    schedule1_addbacks?: any;
    schedule2_capitalAllowances?: any;
    schedule3_losses?: any;
    [key: string]: any;
  };
  reconciliationResult?: any;
  options?: {
    strict?: boolean;
    requireMIRA604?: boolean;
    requireGST?: boolean;
    requireNWT?: boolean;
  };
}
