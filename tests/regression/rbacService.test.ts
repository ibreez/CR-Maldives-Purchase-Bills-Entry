import { describe, test, expect, beforeEach } from 'vitest';
import {
  hasPermission,
  createApprovalRequest,
  submitForReview,
  approveTaxReturn,
  rejectTaxReturn,
  validateForMiraSubmission,
  clearApprovalStore,
  getApprovalRequest,
  ApprovalRequiredError
} from '../../src/services/auth/rbacService';
import { UserSession } from '../../src/types/rbac';

describe('Phase 16 - Multi-Tenant Role-Based Access Control (RBAC) & Approval Workflows Tests', () => {

  const tenantA = 'COMPANY-001';
  const tenantB = 'COMPANY-002';
  const tenantUnassigned = 'COMPANY-UNASSIGNED-999';

  const clientUserSession: UserSession = {
    userId: 'USR-CLIENT-01',
    tenantId: tenantA,
    role: 'CLIENT_USER',
    assignedEntities: [tenantA]
  };

  const accountantSession: UserSession = {
    userId: 'USR-ACCT-01',
    tenantId: tenantA,
    role: 'STAFF_ACCOUNTANT',
    assignedEntities: [tenantA]
  };

  const taxManagerSession: UserSession = {
    userId: 'USR-MGR-01',
    tenantId: tenantA,
    role: 'TAX_MANAGER',
    assignedEntities: [tenantA, tenantB]
  };

  const adminSession: UserSession = {
    userId: 'USR-ADMIN-01',
    tenantId: tenantA,
    role: 'CLIENT_ADMIN',
    assignedEntities: [tenantA]
  };

  const auditorSession: UserSession = {
    userId: 'USR-AUDIT-01',
    tenantId: tenantA,
    role: 'AUDITOR',
    assignedEntities: [tenantA]
  };

  beforeEach(() => {
    clearApprovalStore();
  });

  test('hasPermission blocks access when a user attempts to view or modify data for an unassigned tenant ID', () => {
    // Attempt viewing or modifying data for unassigned tenant ID
    expect(hasPermission(clientUserSession, 'READ_TRANSACTIONS', tenantUnassigned)).toBe(false);
    expect(hasPermission(clientUserSession, 'CREATE_TRANSACTIONS', tenantUnassigned)).toBe(false);

    expect(hasPermission(accountantSession, 'READ_TRANSACTIONS', tenantUnassigned)).toBe(false);
    expect(hasPermission(accountantSession, 'CREATE_TRANSACTIONS', tenantUnassigned)).toBe(false);
    expect(hasPermission(accountantSession, 'APPROVE_ADJUSTMENTS', tenantUnassigned)).toBe(false);

    expect(hasPermission(taxManagerSession, 'READ_TRANSACTIONS', tenantUnassigned)).toBe(false);
    expect(hasPermission(taxManagerSession, 'SUBMIT_TAX_RETURNS', tenantUnassigned)).toBe(false);

    expect(hasPermission(adminSession, 'READ_TRANSACTIONS', tenantUnassigned)).toBe(false);
    expect(hasPermission(auditorSession, 'READ_TRANSACTIONS', tenantUnassigned)).toBe(false);

    // Cross-tenant check: Accountant for Tenant A attempting access on Tenant B
    expect(hasPermission(accountantSession, 'READ_TRANSACTIONS', tenantB)).toBe(false);
    expect(hasPermission(accountantSession, 'CREATE_TRANSACTIONS', tenantB)).toBe(false);
  });

  test('STAFF_ACCOUNTANT can draft returns and submit them for review, but cannot self-approve or submit directly to MIRAconnect', () => {
    // 1. STAFF_ACCOUNTANT creates draft approval request
    const request = createApprovalRequest(
      { tenantId: tenantA, returnType: 'MIRA604', taxYear: 2026 },
      accountantSession
    );
    expect(request.status).toBe('DRAFT');
    expect(request.submittedBy).toBe('USR-ACCT-01');

    // 2. STAFF_ACCOUNTANT submits return for review
    const submitted = submitForReview(request.requestId, accountantSession);
    expect(submitted.status).toBe('PENDING_REVIEW');

    // 3. STAFF_ACCOUNTANT attempting to self-approve throws error
    expect(() =>
      approveTaxReturn(request.requestId, accountantSession, 'Self-approval attempt')
    ).toThrow(/lacks permission|Only TAX_MANAGER or CLIENT_ADMIN roles can approve/);

    // 4. STAFF_ACCOUNTANT attempting to submit directly to MIRAconnect throws permission error
    expect(() =>
      validateForMiraSubmission(request.requestId, accountantSession)
    ).toThrow(/User 'USR-ACCT-01' is not authorized to submit tax returns/);
  });

  test('Only TAX_MANAGER or CLIENT_ADMIN can transition returns from PENDING_REVIEW to APPROVED', () => {
    // Create & submit return to PENDING_REVIEW
    const req1 = createApprovalRequest(
      { tenantId: tenantA, returnType: 'MIRA105', taxYear: 2026 },
      accountantSession
    );
    submitForReview(req1.requestId, accountantSession);

    // CLIENT_USER attempt to approve fails
    expect(() => approveTaxReturn(req1.requestId, clientUserSession)).toThrow();

    // STAFF_ACCOUNTANT attempt to approve fails
    expect(() => approveTaxReturn(req1.requestId, accountantSession)).toThrow();

    // AUDITOR attempt to approve fails
    expect(() => approveTaxReturn(req1.requestId, auditorSession)).toThrow();

    // TAX_MANAGER transition to APPROVED succeeds
    const approvedByMgr = approveTaxReturn(req1.requestId, taxManagerSession, 'Approved by Tax Manager');
    expect(approvedByMgr.status).toBe('APPROVED');
    expect(approvedByMgr.reviewedBy).toBe('USR-MGR-01');

    // Second return approved by CLIENT_ADMIN succeeds
    const req2 = createApprovalRequest(
      { tenantId: tenantA, returnType: 'MIRA302', taxYear: 2026 },
      accountantSession
    );
    submitForReview(req2.requestId, accountantSession);

    const approvedByAdmin = approveTaxReturn(req2.requestId, adminSession, 'Approved by Client Admin');
    expect(approvedByAdmin.status).toBe('APPROVED');
    expect(approvedByAdmin.reviewedBy).toBe('USR-ADMIN-01');
  });

  test('Attempting to submit an unapproved or rejected tax return to MIRAconnect throws an explicit ApprovalRequiredError', () => {
    // 1. DRAFT tax return
    const draftReq = createApprovalRequest(
      { tenantId: tenantA, returnType: 'MIRA604', taxYear: 2026 },
      accountantSession
    );
    expect(() => validateForMiraSubmission(draftReq.requestId, taxManagerSession)).toThrow(ApprovalRequiredError);

    // 2. PENDING_REVIEW tax return
    const pendingReq = createApprovalRequest(
      { tenantId: tenantA, returnType: 'MIRA105', taxYear: 2026 },
      accountantSession
    );
    submitForReview(pendingReq.requestId, accountantSession);
    expect(() => validateForMiraSubmission(pendingReq.requestId, taxManagerSession)).toThrow(ApprovalRequiredError);

    // 3. REJECTED tax return
    const rejectedReq = createApprovalRequest(
      { tenantId: tenantA, returnType: 'MIRA302', taxYear: 2026 },
      accountantSession
    );
    submitForReview(rejectedReq.requestId, accountantSession);
    rejectTaxReturn(rejectedReq.requestId, 'Missing vendor TIN details', taxManagerSession);
    expect(() => validateForMiraSubmission(rejectedReq.requestId, taxManagerSession)).toThrow(ApprovalRequiredError);

    // 4. APPROVED return succeeds without throwing ApprovalRequiredError
    const approvedReq = createApprovalRequest(
      { tenantId: tenantA, returnType: 'MIRA604', taxYear: 2026 },
      accountantSession
    );
    submitForReview(approvedReq.requestId, accountantSession);
    approveTaxReturn(approvedReq.requestId, taxManagerSession, 'Ready for MIRA');

    const result = validateForMiraSubmission(approvedReq.requestId, taxManagerSession);
    expect(result.canSubmit).toBe(true);
    expect(result.request.status).toBe('APPROVED');
  });

});
