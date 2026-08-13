export type Role =
  | 'CLIENT_USER'
  | 'STAFF_ACCOUNTANT'
  | 'TAX_MANAGER'
  | 'CLIENT_ADMIN'
  | 'AUDITOR';

export type Permission =
  | 'READ_TRANSACTIONS'
  | 'CREATE_TRANSACTIONS'
  | 'APPROVE_ADJUSTMENTS'
  | 'LOCK_PERIODS'
  | 'SUBMIT_TAX_RETURNS'
  | 'VIEW_AUDIT_LOGS';

export type ApprovalStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export interface UserSession {
  userId: string;
  tenantId: string;
  role: Role;
  assignedEntities: string[];
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
