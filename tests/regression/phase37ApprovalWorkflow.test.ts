import { describe, it, expect, beforeEach } from 'vitest';
import {
  ApprovalWorkflowService,
  assessRisk,
  isAIActor
} from '../../src/services/approval/approvalWorkflowService';
import {
  ApprovalWorkflowError,
  UnauthorizedApprovalError,
  AIApprovalForbiddenError,
  RejectedItemPostingError,
  InvalidWorkflowTransitionError
} from '../../src/types/approvalWorkflow';
import { UserSession } from '../../src/types/rbac';
import { JournalPostingService } from '../../src/services/accounting/journalPostingService';
import { TaxAdjustmentLedgerEngine } from '../../src/services/tax/taxAdjustmentLedgerEngine';
import { queryAuditLogs } from '../../src/services/audit/auditService';

describe('Phase 37 — Accounting and Tax Approval Workflow Engine', () => {
  const tenantA = 'TENANT-ALPHA-100';
  const tenantB = 'TENANT-BETA-200';

  // Sessions for each required role
  const dataEntrySession: UserSession = {
    userId: 'user_data_entry',
    role: 'DATA_ENTRY',
    tenantId: tenantA
  };

  const accountantSession: UserSession = {
    userId: 'user_accountant',
    role: 'ACCOUNTANT',
    tenantId: tenantA
  };

  const taxReviewerSession: UserSession = {
    userId: 'user_tax_reviewer',
    role: 'TAX_REVIEWER',
    tenantId: tenantA
  };

  const financeManagerSession: UserSession = {
    userId: 'user_finance_mgr',
    role: 'FINANCE_MANAGER',
    tenantId: tenantA
  };

  const adminSession: UserSession = {
    userId: 'user_admin',
    role: 'ADMIN',
    tenantId: tenantA
  };

  const auditorSession: UserSession = {
    userId: 'user_auditor',
    role: 'AUDITOR',
    tenantId: tenantA
  };

  const aiSession: UserSession = {
    userId: 'AI_MODEL_GEMINI_AUTO',
    role: 'ADMIN',
    tenantId: tenantA
  };

  beforeEach(() => {
    ApprovalWorkflowService.clearStore();
  });

  describe('1. Risk-Based Assessment Engine', () => {
    it('assesses standard operating expense as low risk for Accountant approval', () => {
      const assessment = assessRisk({
        tenantId: tenantA,
        itemId: 'TX-101',
        itemType: 'TRANSACTION',
        title: 'Office Supplies Expense',
        amount: 1500,
        currency: 'MVR'
      });

      expect(assessment.riskCategory).toBe('NONE');
      expect(assessment.requiresSpecialistReview).toBe(false);
      expect(assessment.requiredRole).toBe('ACCOUNTANT');
      expect(assessment.riskScore).toBeLessThan(50);
    });

    it('flags capital assets (>= MVR 10,000) for Finance Manager & Schedule 2 review', () => {
      const assessment = assessRisk({
        tenantId: tenantA,
        itemId: 'INV-CAP-01',
        itemType: 'CAPITAL_ASSET',
        title: 'Server Rack and Network Hardware',
        amount: 85000,
        currency: 'MVR',
        isCapitalAsset: true
      });

      expect(assessment.riskCategory).toBe('CAPITAL_ASSETS');
      expect(assessment.requiresSpecialistReview).toBe(true);
      expect(assessment.requiredRole).toBe('FINANCE_MANAGER');
      expect(assessment.riskTriggers.length).toBeGreaterThan(0);
      expect(assessment.riskTriggers.some(t => t.includes('Capital asset'))).toBe(true);
    });

    it('flags blocked GST claims for Tax Reviewer approval', () => {
      const assessment = assessRisk({
        tenantId: tenantA,
        itemId: 'INV-GST-BLOCK-01',
        itemType: 'INVOICE',
        title: 'Executive Entertainment & Club Membership',
        amount: 12000,
        isBlockedGst: true
      });

      expect(assessment.riskCategory).toBe('BLOCKED_GST');
      expect(assessment.requiresSpecialistReview).toBe(true);
      expect(assessment.requiredRole).toBe('TAX_REVIEWER');
      expect(assessment.riskTriggers.some(t => t.includes('Blocked input tax claim'))).toBe(true);
    });

    it('flags Non-Resident Withholding Tax (NWT Section 55) for Tax Reviewer approval', () => {
      const assessment = assessRisk({
        tenantId: tenantA,
        itemId: 'INV-NWT-01',
        itemType: 'INVOICE',
        title: 'Foreign Technical Consultancy Fee (Singapore)',
        amount: 150000,
        isNwtApplicable: true
      });

      expect(assessment.riskCategory).toBe('NWT');
      expect(assessment.requiresSpecialistReview).toBe(true);
      expect(assessment.requiredRole).toBe('TAX_REVIEWER');
      expect(assessment.riskTriggers.some(t => t.includes('withholding tax (NWT)'))).toBe(true);
    });

    it('flags statutory Tax Adjustments for Tax Reviewer approval', () => {
      const assessment = assessRisk({
        tenantId: tenantA,
        itemId: 'ADJ-FINE-01',
        itemType: 'TAX_ADJUSTMENT',
        title: 'MIRA Non-Compliance Penalty Add-Back',
        amount: 25000,
        isTaxAdjustment: true
      });

      expect(assessment.riskCategory).toBe('TAX_ADJUSTMENTS');
      expect(assessment.requiresSpecialistReview).toBe(true);
      expect(assessment.requiredRole).toBe('TAX_REVIEWER');
      expect(assessment.riskTriggers.some(t => t.includes('tax adjustment'))).toBe(true);
    });

    it('flags Related-Party transactions (Section 67 / Transfer Pricing) for Finance Manager review', () => {
      const assessment = assessRisk({
        tenantId: tenantA,
        itemId: 'TX-RP-01',
        itemType: 'TRANSACTION',
        title: 'Intercompany Management Services Fee',
        amount: 450000,
        isRelatedParty: true
      });

      expect(assessment.riskCategory).toBe('RELATED_PARTY');
      expect(assessment.requiresSpecialistReview).toBe(true);
      expect(assessment.requiredRole).toBe('FINANCE_MANAGER');
      expect(assessment.riskTriggers.some(t => t.includes('Related-party'))).toBe(true);
    });

    it('flags Foreign Currency Exceptions (Rate Variance) for Finance Manager review', () => {
      const assessment = assessRisk({
        tenantId: tenantA,
        itemId: 'TX-FX-01',
        itemType: 'TRANSACTION',
        title: 'Overseas Vendor Settlement in EUR',
        amount: 75000,
        currency: 'EUR',
        isForeignCurrencyException: true,
        exchangeRateVariance: 0.045
      });

      expect(assessment.riskCategory).toBe('FOREIGN_CURRENCY_EXCEPTIONS');
      expect(assessment.requiresSpecialistReview).toBe(true);
      expect(assessment.requiredRole).toBe('FINANCE_MANAGER');
    });

    it('flags manual OCR corrections affecting tax for secondary review', () => {
      const assessment = assessRisk({
        tenantId: tenantA,
        itemId: 'INV-OCR-01',
        itemType: 'INVOICE',
        title: 'Tax Invoice with Manual Tax Amount Correction',
        amount: 9800,
        hasManualOcrCorrection: true
      });

      expect(assessment.riskCategory).toBe('MANUAL_OCR_CORRECTIONS');
      expect(assessment.requiresSpecialistReview).toBe(true);
      expect(assessment.requiredRole).toBe('ACCOUNTANT');
    });

    it('flags statutory Tax Returns for Tax Reviewer sign-off', () => {
      const assessment = assessRisk({
        tenantId: tenantA,
        itemId: 'MIRA-604-2025',
        itemType: 'TAX_RETURN',
        title: 'MIRA 604 Annual Income Tax Return 2025',
        amount: 1850000,
        isTaxReturn: true
      });

      expect(assessment.riskCategory).toBe('TAX_RETURN_APPROVAL');
      expect(assessment.requiresSpecialistReview).toBe(true);
      expect(assessment.requiredRole).toBe('TAX_REVIEWER');
    });
  });

  describe('2. Anti-AI Rule: The AI Model Cannot Approve', () => {
    it('isAIActor accurately identifies AI models and automated bots', () => {
      expect(isAIActor('AI_MODEL')).toBe(true);
      expect(isAIActor('GEMINI_PRO_AGENT')).toBe(true);
      expect(isAIActor('OCR_ENGINE_BOT')).toBe(true);
      expect(isAIActor('user_accountant')).toBe(false);
      expect(isAIActor(aiSession)).toBe(true);
      expect(isAIActor(taxReviewerSession)).toBe(false);
    });

    it('strictly forbids AI model from approving any workflow item', () => {
      const item = ApprovalWorkflowService.createWorkflowItem(
        {
          tenantId: tenantA,
          itemId: 'INV-001',
          itemType: 'INVOICE',
          title: 'Consulting Invoice',
          amount: 5000
        },
        dataEntrySession
      );

      expect(() => {
        ApprovalWorkflowService.approveItem(item.id, aiSession, 'AI Auto-Approval');
      }).toThrow(AIApprovalForbiddenError);

      const fetched = ApprovalWorkflowService.getItem(item.id);
      expect(fetched?.status).not.toBe('APPROVED');
    });

    it('strictly forbids AI model from rejecting workflow items', () => {
      const item = ApprovalWorkflowService.createWorkflowItem(
        {
          tenantId: tenantA,
          itemId: 'INV-002',
          itemType: 'INVOICE',
          title: 'Consulting Invoice 2',
          amount: 5000
        },
        dataEntrySession
      );

      expect(() => {
        ApprovalWorkflowService.rejectItem(item.id, 'AI deemed invalid', aiSession);
      }).toThrow(AIApprovalForbiddenError);
    });
  });

  describe('3. Role Hierarchy & Unauthorized Approval Rejection', () => {
    it('DATA_ENTRY role cannot approve standard classifications', () => {
      const item = ApprovalWorkflowService.createWorkflowItem(
        {
          tenantId: tenantA,
          itemId: 'EXP-101',
          itemType: 'TRANSACTION',
          title: 'Office Refreshments',
          amount: 2500
        },
        dataEntrySession
      );

      expect(() => {
        ApprovalWorkflowService.approveItem(item.id, dataEntrySession);
      }).toThrow(UnauthorizedApprovalError);
    });

    it('AUDITOR role has read-only access and cannot approve any item', () => {
      const item = ApprovalWorkflowService.createWorkflowItem(
        {
          tenantId: tenantA,
          itemId: 'EXP-102',
          itemType: 'TRANSACTION',
          title: 'Software Subscription',
          amount: 4200
        },
        dataEntrySession
      );

      expect(() => {
        ApprovalWorkflowService.approveItem(item.id, auditorSession);
      }).toThrow(UnauthorizedApprovalError);
    });

    it('ACCOUNTANT can approve standard low-risk classifications', () => {
      const item = ApprovalWorkflowService.createWorkflowItem(
        {
          tenantId: tenantA,
          itemId: 'EXP-103',
          itemType: 'TRANSACTION',
          title: 'Utilities & Internet Bill',
          amount: 3800
        },
        dataEntrySession
      );

      const approved = ApprovalWorkflowService.approveItem(item.id, accountantSession, 'Verified against utility invoice');
      expect(approved.status).toBe('APPROVED');
      expect(approved.reviewedBy).toBe('user_accountant');
    });

    it('ACCOUNTANT is rejected when attempting to approve high-risk Tax Adjustments (Tax Reviewer required)', () => {
      const item = ApprovalWorkflowService.createWorkflowItem(
        {
          tenantId: tenantA,
          itemId: 'ADJ-DONATION-01',
          itemType: 'TAX_ADJUSTMENT',
          title: 'Disallowed Donation Add-Back',
          amount: 15000,
          isTaxAdjustment: true
        },
        dataEntrySession
      );

      expect(() => {
        ApprovalWorkflowService.approveItem(item.id, accountantSession);
      }).toThrow(UnauthorizedApprovalError);
    });

    it('TAX_REVIEWER can approve high-risk Tax Adjustments and blocked GST', () => {
      const item = ApprovalWorkflowService.createWorkflowItem(
        {
          tenantId: tenantA,
          itemId: 'ADJ-DONATION-02',
          itemType: 'TAX_ADJUSTMENT',
          title: 'Disallowed Donation Add-Back 2',
          amount: 15000,
          isTaxAdjustment: true
        },
        dataEntrySession
      );

      const approved = ApprovalWorkflowService.approveItem(
        item.id,
        taxReviewerSession,
        'Reviewed add-back under Section 11 of Maldives Income Tax Act'
      );

      expect(approved.status).toBe('APPROVED');
      expect(approved.reviewedBy).toBe('user_tax_reviewer');
    });

    it('ACCOUNTANT is rejected when attempting to approve Capital Assets >= MVR 10,000 (Finance Manager required)', () => {
      const item = ApprovalWorkflowService.createWorkflowItem(
        {
          tenantId: tenantA,
          itemId: 'AST-MACHINERY-01',
          itemType: 'CAPITAL_ASSET',
          title: 'Industrial Generator Purchase',
          amount: 350000,
          isCapitalAsset: true
        },
        dataEntrySession
      );

      expect(() => {
        ApprovalWorkflowService.approveItem(item.id, accountantSession);
      }).toThrow(UnauthorizedApprovalError);

      // FINANCE_MANAGER can approve
      const approved = ApprovalWorkflowService.approveItem(
        item.id,
        financeManagerSession,
        'Capital expenditure authorized under FY2026 Capex budget'
      );
      expect(approved.status).toBe('APPROVED');
    });
  });

  describe('4. Workflow Rejection & Posting Safeguards', () => {
    it('rejecting an item transitions status to REJECTED and records rejectionReason', () => {
      const item = ApprovalWorkflowService.createWorkflowItem(
        {
          tenantId: tenantA,
          itemId: 'INV-SUSPICIOUS-01',
          itemType: 'INVOICE',
          title: 'Unverifiable Foreign Service Charge',
          amount: 95000
        },
        dataEntrySession
      );

      const rejected = ApprovalWorkflowService.rejectItem(
        item.id,
        'Missing tax invoice and contract agreement evidence',
        taxReviewerSession
      );

      expect(rejected.status).toBe('REJECTED');
      expect(rejected.rejectionReason).toBe('Missing tax invoice and contract agreement evidence');
      expect(rejected.reviewedBy).toBe('user_tax_reviewer');
    });

    it('rejecting requires a non-empty rejectionReason', () => {
      const item = ApprovalWorkflowService.createWorkflowItem(
        {
          tenantId: tenantA,
          itemId: 'INV-004',
          itemType: 'INVOICE',
          title: 'Standard Invoice',
          amount: 1200
        },
        dataEntrySession
      );

      expect(() => {
        ApprovalWorkflowService.rejectItem(item.id, '   ', taxReviewerSession);
      }).toThrow(ApprovalWorkflowError);
    });

    it('rejected records strictly cannot post to the general ledger', () => {
      const item = ApprovalWorkflowService.createWorkflowItem(
        {
          tenantId: tenantA,
          itemId: 'INV-REJECTED-POST-01',
          itemType: 'INVOICE',
          title: 'Disputed Subcontractor Invoice',
          amount: 45000
        },
        dataEntrySession
      );

      ApprovalWorkflowService.rejectItem(
        item.id,
        'Duplicate invoice submitted previously',
        taxReviewerSession
      );

      expect(() => {
        ApprovalWorkflowService.validateCanPostToLedger(item.id, tenantA);
      }).toThrow(RejectedItemPostingError);
    });

    it('unapproved DRAFT/SUBMITTED records cannot post to the general ledger', () => {
      const item = ApprovalWorkflowService.createWorkflowItem(
        {
          tenantId: tenantA,
          itemId: 'INV-DRAFT-POST-01',
          itemType: 'INVOICE',
          title: 'Draft Marketing Bill',
          amount: 8000
        },
        dataEntrySession
      );

      expect(() => {
        ApprovalWorkflowService.validateCanPostToLedger(item.id, tenantA);
      }).toThrow(ApprovalWorkflowError);
    });
  });

  describe('5. Audit Trail & Immutability Integration', () => {
    it('creating, submitting, approving, and rejecting workflow items emits tamper-evident audit events', () => {
      const item = ApprovalWorkflowService.createWorkflowItem(
        {
          tenantId: tenantA,
          itemId: 'AUDIT-TEST-01',
          itemType: 'TRANSACTION',
          title: 'Legal Advisory Fee',
          amount: 8000
        },
        dataEntrySession
      );

      ApprovalWorkflowService.approveItem(item.id, accountantSession, 'Legal engagement letter confirmed');

      const auditEvents = queryAuditLogs({ tenantId: tenantA, entityType: 'WORKFLOW_ITEM', entityId: item.id });
      expect(auditEvents.length).toBeGreaterThanOrEqual(2);

      const approvalEvent = auditEvents.find(e => e.eventType === 'APPROVAL_APPROVE');
      expect(approvalEvent).toBeDefined();
      expect(approvalEvent?.actorId).toBe('user_accountant');
      expect(approvalEvent?.afterHash).toBeDefined();
    });
  });

  describe('6. Multi-Tenant Isolation', () => {
    it('prevents user from Tenant A from approving or accessing Tenant B workflow items', () => {
      const itemTenantB = ApprovalWorkflowService.createWorkflowItem(
        {
          tenantId: tenantB,
          itemId: 'INV-TENANT-B-01',
          itemType: 'INVOICE',
          title: 'Tenant B IT License',
          amount: 30000
        }
      );

      expect(() => {
        ApprovalWorkflowService.approveItem(itemTenantB.id, adminSession);
      }).toThrow(UnauthorizedApprovalError);

      expect(() => {
        ApprovalWorkflowService.validateCanPostToLedger(itemTenantB.id, tenantA);
      }).toThrow(UnauthorizedApprovalError);
    });
  });
});
