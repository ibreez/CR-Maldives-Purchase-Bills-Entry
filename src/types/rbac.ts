export type Role =
  | 'DATA_ENTRY'
  | 'ACCOUNTANT'
  | 'TAX_REVIEWER'
  | 'FINANCE_MANAGER'
  | 'ADMIN'
  | 'AUDITOR'
  // Backward-compatibility aliases
  | 'CLIENT_USER'
  | 'STAFF_ACCOUNTANT'
  | 'TAX_MANAGER'
  | 'CLIENT_ADMIN';

export type Permission =
  | 'READ_TRANSACTIONS'
  | 'CREATE_TRANSACTIONS'
  | 'SUBMIT_FOR_APPROVAL'
  | 'APPROVE_STANDARD_CLASSIFICATION'
  | 'APPROVE_HIGH_RISK_ITEMS'
  | 'APPROVE_ADJUSTMENTS'
  | 'APPROVE_TAX_ADJUSTMENTS'
  | 'APPROVE_TAX_RETURNS'
  | 'REJECT_ITEMS'
  | 'POST_TRANSACTIONS'
  | 'LOCK_PERIODS'
  | 'UNLOCK_PERIODS'
  | 'AMEND_PERIODS'
  | 'REVERSE_TRANSACTIONS'
  | 'SUBMIT_TAX_RETURNS'
  | 'VIEW_AUDIT_LOGS';

export type ApprovalStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export interface UserSession {
  userId: string;
  tenantId: string;
  role: Role;
  assignedEntities?: string[];
}

export interface ApprovalRequest {
  requestId: string;
  tenantId: string;
  returnType: 'MIRA604' | 'MIRA105' | 'MIRA302';
  taxYear: number;
  status: ApprovalStatus;
  submittedBy: string;
  reviewedBy?: string;
  comments?: string;
  submittedAt?: string;
  reviewedAt?: string;
}
