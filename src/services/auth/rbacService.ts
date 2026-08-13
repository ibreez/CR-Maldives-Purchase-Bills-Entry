import {
  ApprovalRequest,
  Permission,
  Role,
  UserSession
} from '../../types/rbac';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  CLIENT_USER: ['READ_TRANSACTIONS', 'CREATE_TRANSACTIONS'],
  STAFF_ACCOUNTANT: [
    'READ_TRANSACTIONS',
    'CREATE_TRANSACTIONS',
    'APPROVE_ADJUSTMENTS'
  ],
  TAX_MANAGER: [
    'READ_TRANSACTIONS',
    'CREATE_TRANSACTIONS',
    'APPROVE_ADJUSTMENTS',
    'LOCK_PERIODS',
    'SUBMIT_TAX_RETURNS',
    'VIEW_AUDIT_LOGS'
  ],
  CLIENT_ADMIN: [
    'READ_TRANSACTIONS',
    'CREATE_TRANSACTIONS',
    'APPROVE_ADJUSTMENTS',
    'LOCK_PERIODS',
    'SUBMIT_TAX_RETURNS',
    'VIEW_AUDIT_LOGS'
  ],
  AUDITOR: ['READ_TRANSACTIONS', 'VIEW_AUDIT_LOGS']
};

export class ApprovalRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalRequiredError';
  }
}

// In-memory store for tracking approval requests
const approvalStore = new Map<string, ApprovalRequest>();

/**
 * Checks if a user session has permission for a specific target tenant ID.
 * Enforces strict multi-tenant isolation.
 */
export function hasPermission(
  session: UserSession,
  permission: Permission,
  targetTenantId: string
): boolean {
  if (!session || !session.tenantId) {
    return false;
  }

  // Tenant Isolation Check: User must belong to target tenant or be assigned to it
  const isTenantMember =
    session.tenantId === targetTenantId ||
    (Array.isArray(session.assignedEntities) &&
      session.assignedEntities.includes(targetTenantId));

  if (!isTenantMember) {
    return false;
  }

  // Role Permission Check
  const permissions = ROLE_PERMISSIONS[session.role] || [];
  return permissions.includes(permission);
}

/**
 * Creates a new approval request in DRAFT status.
 */
export function createApprovalRequest(
  data: {
    tenantId: string;
    returnType: 'MIRA604' | 'MIRA105' | 'MIRA302';
    taxYear: number;
  },
  session: UserSession
): ApprovalRequest {
  if (!hasPermission(session, 'READ_TRANSACTIONS', data.tenantId)) {
    throw new Error(
      `RBAC Security Error: User '${session.userId}' is not authorized to create approval requests for tenant '${data.tenantId}'`
    );
  }

  const requestId = `REQ-${data.returnType}-${data.taxYear}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  const request: ApprovalRequest = {
    requestId,
    tenantId: data.tenantId,
    returnType: data.returnType,
    taxYear: data.taxYear,
    status: 'DRAFT',
    submittedBy: session.userId,
    submittedAt: new Date().toISOString()
  };

  approvalStore.set(requestId, request);
  return request;
}

/**
 * Transitions an approval request from DRAFT to PENDING_REVIEW.
 */
export function submitForReview(
  requestId: string,
  session: UserSession
): ApprovalRequest {
  const request = approvalStore.get(requestId);
  if (!request) {
    throw new Error(`Approval Workflow Error: Request '${requestId}' not found`);
  }

  if (!hasPermission(session, 'READ_TRANSACTIONS', request.tenantId)) {
    throw new Error(
      `RBAC Security Error: Tenant isolation violation. User cannot access request for tenant '${request.tenantId}'`
    );
  }

  if (request.status !== 'DRAFT' && request.status !== 'REJECTED') {
    throw new Error(
      `Approval Workflow Error: Cannot submit request in '${request.status}' state for review. Status must be DRAFT or REJECTED.`
    );
  }

  request.status = 'PENDING_REVIEW';
  request.submittedBy = session.userId;
  request.submittedAt = new Date().toISOString();

  approvalStore.set(requestId, request);
  return request;
}

/**
 * Approves a tax return request. Verifies TAX_MANAGER or CLIENT_ADMIN permission.
 */
export function approveTaxReturn(
  requestId: string,
  session: UserSession,
  comments?: string
): ApprovalRequest {
  const request = approvalStore.get(requestId);
  if (!request) {
    throw new Error(`Approval Workflow Error: Request '${requestId}' not found`);
  }

  if (!hasPermission(session, 'SUBMIT_TAX_RETURNS', request.tenantId)) {
    throw new Error(
      `RBAC Security Error: User '${session.userId}' with role '${session.role}' lacks permission to approve tax returns for tenant '${request.tenantId}'`
    );
  }

  const isAuthorizedRole =
    session.role === 'TAX_MANAGER' || session.role === 'CLIENT_ADMIN';
  if (!isAuthorizedRole) {
    throw new Error(
      `RBAC Security Error: Only TAX_MANAGER or CLIENT_ADMIN roles can approve tax returns. Current role: '${session.role}'`
    );
  }

  request.status = 'APPROVED';
  request.reviewedBy = session.userId;
  request.reviewedAt = new Date().toISOString();
  request.comments = comments || 'Tax return approved for MIRAconnect submission';

  approvalStore.set(requestId, request);
  return request;
}

/**
 * Rejects a tax return request. Logs review notes/reasons.
 */
export function rejectTaxReturn(
  requestId: string,
  reason: string,
  session: UserSession
): ApprovalRequest {
  const request = approvalStore.get(requestId);
  if (!request) {
    throw new Error(`Approval Workflow Error: Request '${requestId}' not found`);
  }

  if (!hasPermission(session, 'APPROVE_ADJUSTMENTS', request.tenantId)) {
    throw new Error(
      `RBAC Security Error: User '${session.userId}' lacks permission to reject tax returns for tenant '${request.tenantId}'`
    );
  }

  if (!reason || !reason.trim()) {
    throw new Error(
      `Approval Workflow Error: Rejection reason/comment is required when rejecting a tax return`
    );
  }

  request.status = 'REJECTED';
  request.reviewedBy = session.userId;
  request.reviewedAt = new Date().toISOString();
  request.comments = reason;

  approvalStore.set(requestId, request);
  return request;
}

/**
 * Validates whether an approval request can be submitted to MIRAconnect via Phase 15.
 * Ensures that tax returns cannot be sent to MIRAconnect unless status is APPROVED.
 */
export function validateForMiraSubmission(
  requestId: string,
  session: UserSession
): { canSubmit: boolean; request: ApprovalRequest } {
  const request = approvalStore.get(requestId);
  if (!request) {
    throw new Error(`Approval Workflow Error: Request '${requestId}' not found`);
  }

  if (!hasPermission(session, 'SUBMIT_TAX_RETURNS', request.tenantId)) {
    throw new Error(
      `RBAC Security Error: User '${session.userId}' is not authorized to submit tax returns to MIRAconnect for tenant '${request.tenantId}'`
    );
  }

  if (request.status !== 'APPROVED') {
    throw new ApprovalRequiredError(
      `Approval Workflow Error: Tax return '${requestId}' cannot be submitted to MIRAconnect because its status is '${request.status}'. Return must be APPROVED first.`
    );
  }

  return { canSubmit: true, request };
}

/**
 * Retrieves an approval request from store by ID.
 */
export function getApprovalRequest(requestId: string): ApprovalRequest | undefined {
  return approvalStore.get(requestId);
}

/**
 * Clears the in-memory approval store (for unit test isolation).
 */
export function clearApprovalStore(): void {
  approvalStore.clear();
}
