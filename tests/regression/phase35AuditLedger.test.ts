import { describe, test, expect, beforeEach } from 'vitest';
import {
  recordAuditEvent,
  queryAuditLogs,
  verifyAuditChain,
  verifyCustomAuditChain,
  updateAuditEvent,
  deleteAuditEvent,
  resetAuditStore,
  recordDocumentUploadAudit,
  recordOcrProcessingAudit,
  recordOcrCorrectionAudit,
  recordClassificationAudit,
  recordClassificationOverrideAudit,
  recordApprovalAudit,
  recordJournalPostingAudit,
  recordJournalReversalAudit,
  recordTaxAdjustmentAudit,
  recordTaxCalculationAudit,
  recordPeriodLockAudit,
  recordReturnGenerationAudit,
  recordFilingPackageAudit,
  computeStateHash,
  GENESIS_HASH
} from '../../src/services/audit/auditService';
import {
  ImmutableAuditError,
  UnauthorizedAuditAccessError,
  PeriodLockRecord
} from '../../src/types/audit';
import { UserSession } from '../../src/types/rbac';

describe('Phase 35 — Immutable Audit Ledger & Tamper-Evident Chaining', () => {
  const sampleTenantA = 'TENANT-RESORT-01';
  const sampleTenantB = 'TENANT-RETAIL-02';

  const auditorSession: UserSession = {
    userId: 'USER-AUDITOR-01',
    tenantId: sampleTenantA,
    role: 'AUDITOR',
    assignedEntities: [sampleTenantA]
  };

  const taxManagerSession: UserSession = {
    userId: 'USER-TAX-MGR-01',
    tenantId: sampleTenantA,
    role: 'TAX_MANAGER',
    assignedEntities: [sampleTenantA]
  };

  const clientUserSession: UserSession = {
    userId: 'USER-DATA-ENTRY-01',
    tenantId: sampleTenantA,
    role: 'CLIENT_USER',
    assignedEntities: [sampleTenantA]
  };

  beforeEach(() => {
    resetAuditStore();
  });

  describe('Acceptance Criterion 1: Every Financial Mutation Produces an Audit Event', () => {
    test('1.1 Document Upload creates an immutable audit event with hashes', () => {
      const docData = {
        originalFileName: 'INVOICE_OCT_2025.pdf',
        fileSize: 245000,
        mimeType: 'application/pdf',
        supplierName: 'Maldives Marine Supply Pvt Ltd'
      };

      const event = recordDocumentUploadAudit(
        sampleTenantA,
        'USER-ACC-01',
        'DOC-2026-901',
        docData,
        'CORR-DOC-001'
      );

      expect(event.id).toBeDefined();
      expect(event.tenantId).toBe(sampleTenantA);
      expect(event.actorId).toBe('USER-ACC-01');
      expect(event.eventType).toBe('DOCUMENT_UPLOAD');
      expect(event.entityType).toBe('DOCUMENT');
      expect(event.entityId).toBe('DOC-2026-901');
      expect(event.beforeHash).toBeNull();
      expect(event.afterHash).toBe(computeStateHash(docData));
      expect(event.previousEventHash).toBe(GENESIS_HASH);
      expect(event.eventHash).toBeDefined();
      expect(event.correlationId).toBe('CORR-DOC-001');
    });

    test('1.2 OCR Processing creates an audit event capturing extracted evidence', () => {
      const rawOcr = {
        invoiceNumber: 'INV-88990',
        invoiceDate: '2026-02-15',
        subtotal: 100000,
        gstAmount: 8000,
        total: 108000,
        confidence: 0.96
      };

      const event = recordOcrProcessingAudit(
        sampleTenantA,
        'SYSTEM-GEMINI-OCR',
        'DOC-2026-901',
        rawOcr,
        'CORR-DOC-001',
        { model: 'gemini-1.5-pro', ocrVersion: 'v2.1' }
      );

      expect(event.eventType).toBe('DOCUMENT_OCR');
      expect(event.actorId).toBe('SYSTEM-GEMINI-OCR');
      expect(event.afterHash).toBe(computeStateHash(rawOcr));
    });

    test('1.3 OCR Correction audits manual corrections with mandatory reason and before/after states', () => {
      const originalOcr = { invoiceNumber: '1NV-8899O', total: 100000 };
      const correctedOcr = { invoiceNumber: 'INV-88990', total: 108000 };

      const event = recordOcrCorrectionAudit(
        sampleTenantA,
        'USER-ACCOUNTANT-01',
        'DOC-2026-901',
        originalOcr,
        correctedOcr,
        'Corrected OCR misreading of characters 1->I and O->0 and verified grand total against tax invoice',
        'CORR-DOC-001'
      );

      expect(event.eventType).toBe('OCR_CORRECTION');
      expect(event.beforeHash).toBe(computeStateHash(originalOcr));
      expect(event.afterHash).toBe(computeStateHash(correctedOcr));
      expect(event.reason).toContain('Corrected OCR misreading');

      // Mandatory reason check
      expect(() => {
        recordOcrCorrectionAudit(
          sampleTenantA,
          'USER-ACCOUNTANT-01',
          'DOC-2026-901',
          originalOcr,
          correctedOcr,
          '' // Empty reason
        );
      }).toThrow(/Reason is mandatory/i);
    });

    test('1.4 Classification and Classification Override audit statutory treatment changes', () => {
      const originalClassification = {
        accountingCategory: 'repairs_and_maintenance',
        gstTreatment: 'STANDARD_RATED',
        incomeTaxTreatment: 'DEDUCTIBLE'
      };

      const suggestionEvent = recordClassificationAudit(
        sampleTenantA,
        'SYSTEM-TAX-ENGINE',
        'INV-LINE-001',
        originalClassification,
        'CORR-DOC-001',
        true
      );
      expect(suggestionEvent.eventType).toBe('CLASSIFICATION_SUGGESTION');

      const overrideClassification = {
        accountingCategory: 'capital_expenditure_vessel',
        gstTreatment: 'CAPITAL_INPUT_TAX',
        incomeTaxTreatment: 'CAPITAL_ALLOWANCE',
        assetClass: 'MARINE_VESSEL',
        capitalAllowanceRate: 20
      };

      const overrideEvent = recordClassificationOverrideAudit(
        sampleTenantA,
        'USER-TAX-OFFICER',
        'INV-LINE-001',
        originalClassification,
        overrideClassification,
        'Vessel hull replacement qualifies as Section 17 Capital Expenditure eligible for Capital Allowance',
        'CORR-DOC-001'
      );

      expect(overrideEvent.eventType).toBe('CLASSIFICATION_OVERRIDE');
      expect(overrideEvent.actorId).toBe('USER-TAX-OFFICER');
      expect(overrideEvent.beforeHash).toBe(computeStateHash(originalClassification));
      expect(overrideEvent.afterHash).toBe(computeStateHash(overrideClassification));
      expect(overrideEvent.reason).toContain('Section 17 Capital Expenditure');
    });

    test('1.5 Approvals, Journal Postings, and Reversals create traceable audit records', () => {
      // Approval audit
      const approvalEvent = recordApprovalAudit(
        sampleTenantA,
        'USER-FINANCE-MGR',
        'INVOICE',
        'INV-2026-001',
        'APPROVED',
        'PENDING_REVIEW',
        'CORR-APPROVAL-01',
        'Approved by Finance Manager following 3-way match'
      );
      expect(approvalEvent.eventType).toBe('APPROVAL_APPROVE');

      // Journal posting audit
      const journalData = {
        journalId: 'JRN-2026-101',
        entryDate: '2026-02-15',
        totalDebit: 108000,
        totalCredit: 108000,
        lines: [
          { accountCode: '1500', debit: 100000, credit: 0 },
          { accountCode: '2150', debit: 8000, credit: 0 },
          { accountCode: '2000', debit: 0, credit: 108000 }
        ]
      };
      const postingEvent = recordJournalPostingAudit(
        sampleTenantA,
        'USER-ACCOUNTANT-01',
        'JRN-2026-101',
        journalData,
        'CORR-JRN-01'
      );
      expect(postingEvent.eventType).toBe('JOURNAL_POSTING');
      expect(postingEvent.afterHash).toBe(computeStateHash(journalData));

      // Journal reversal audit
      const reversalJournalData = {
        journalId: 'JRN-REV-2026-101',
        originalJournalId: 'JRN-2026-101',
        totalDebit: -108000,
        totalCredit: -108000
      };
      const reversalEvent = recordJournalReversalAudit(
        sampleTenantA,
        'USER-SENIOR-ACC',
        'JRN-2026-101',
        reversalJournalData,
        'Reversed duplicate supplier bill entry after credit note issuance',
        'CORR-JRN-REV-01'
      );
      expect(reversalEvent.eventType).toBe('JOURNAL_REVERSAL');
      expect(reversalEvent.reason).toContain('credit note issuance');
    });

    test('1.6 Tax Adjustments, Calculations, Returns, and Filing Packages produce audit events', () => {
      // Tax adjustment audit
      const adjData = {
        adjustmentCode: 'NON_DEDUCTIBLE_PENALTY',
        amount: 35000,
        direction: 'ADD_BACK',
        legalReference: 'Maldives Income Tax Act Section 22(a)'
      };
      const adjEvent = recordTaxAdjustmentAudit(
        sampleTenantA,
        'USER-TAX-DIR',
        'ADJ-2026-001',
        adjData,
        'CORR-TAX-ADJ-01',
        'APPROVE'
      );
      expect(adjEvent.eventType).toBe('TAX_ADJUSTMENT_APPROVE');

      // Tax calculation audit
      const calcResult = {
        taxYear: 2026,
        accountingProfit: 5000000,
        totalAdditions: 35000,
        totalDeductions: 120000,
        taxableIncome: 4915000,
        taxPayable: 662250
      };
      const calcEvent = recordTaxCalculationAudit(
        sampleTenantA,
        'SYSTEM-TAX-ENGINE',
        'CALC-2026-001',
        calcResult,
        'CORR-CALC-01',
        2026
      );
      expect(calcEvent.eventType).toBe('TAX_CALCULATION');

      // Period lock audit
      const lockRecord: PeriodLockRecord = {
        lockId: `LOCK-${sampleTenantA}-2025-12-31`,
        entityId: sampleTenantA,
        lockDate: '2025-12-31',
        lockedBy: 'USER-AUDITOR-01',
        lockedAt: new Date().toISOString(),
        status: 'LOCKED'
      };
      const lockEvent = recordPeriodLockAudit(
        sampleTenantA,
        'USER-AUDITOR-01',
        sampleTenantA,
        lockRecord,
        'CORR-LOCK-01'
      );
      expect(lockEvent.eventType).toBe('PERIOD_LOCK');

      // Return generation audit
      const returnData = {
        formType: 'MIRA604',
        formVersion: 'v25.1',
        taxYear: 2026,
        taxPayable: 662250
      };
      const returnEvent = recordReturnGenerationAudit(
        sampleTenantA,
        'USER-TAX-MGR-01',
        'MIRA604',
        'MIRA604-2026-FINAL',
        returnData,
        'CORR-RET-01',
        2026
      );
      expect(returnEvent.eventType).toBe('RETURN_GENERATION');

      // Filing package generation audit
      const manifestData = {
        packageId: 'PKG-2026-001',
        taxYear: 2026,
        totalFiles: 8,
        masterChecksum: 'sha256-master-abc123'
      };
      const pkgEvent = recordFilingPackageAudit(
        sampleTenantA,
        'USER-TAX-MGR-01',
        'PKG-2026-001',
        manifestData,
        'CORR-PKG-01',
        2026
      );
      expect(pkgEvent.eventType).toBe('FILING_PACKAGE_GENERATION');
    });
  });

  describe('Acceptance Criterion 2: Immutability Enforcements', () => {
    test('2.1 Audit events are strictly frozen and cannot be modified', () => {
      const event = recordDocumentUploadAudit(
        sampleTenantA,
        'USER-ACC-01',
        'DOC-001',
        { fileName: 'doc.pdf' }
      );

      expect(Object.isFrozen(event)).toBe(true);

      // Attempting mutation fails in strict mode
      expect(() => {
        (event as any).reason = 'Tampered reason';
      }).toThrow();

      expect(() => {
        (event as any).actorId = 'ATTACKER';
      }).toThrow();
    });

    test('2.2 updateAuditEvent and deleteAuditEvent strictly throw ImmutableAuditError', () => {
      expect(() => {
        updateAuditEvent();
      }).toThrow(ImmutableAuditError);

      expect(() => {
        deleteAuditEvent();
      }).toThrow(ImmutableAuditError);
    });
  });

  describe('Acceptance Criterion 3: RBAC & Multi-Tenant Authorization Security', () => {
    beforeEach(() => {
      // Seed several audit logs for Tenant A and Tenant B
      recordDocumentUploadAudit(sampleTenantA, 'USER-A', 'DOC-A1', { name: 'A1' });
      recordJournalPostingAudit(sampleTenantA, 'USER-A', 'JRN-A1', { amount: 1000 });
      recordDocumentUploadAudit(sampleTenantB, 'USER-B', 'DOC-B1', { name: 'B1' });
    });

    test('3.1 Auditor and Tax Manager can query audit logs for their tenant', () => {
      const logs = queryAuditLogs({ tenantId: sampleTenantA }, auditorSession);
      expect(logs.length).toBe(2);
      expect(logs.every((l) => l.tenantId === sampleTenantA)).toBe(true);

      const mgrLogs = queryAuditLogs({ tenantId: sampleTenantA }, taxManagerSession);
      expect(mgrLogs.length).toBe(2);
    });

    test('3.2 Unauthorized roles (e.g. CLIENT_USER) are rejected with UnauthorizedAuditAccessError', () => {
      expect(() => {
        queryAuditLogs({ tenantId: sampleTenantA }, clientUserSession);
      }).toThrow(UnauthorizedAuditAccessError);
    });

    test('3.3 Cross-Tenant access is strictly blocked (Tenant A user cannot query Tenant B)', () => {
      expect(() => {
        queryAuditLogs({ tenantId: sampleTenantB }, auditorSession);
      }).toThrow(UnauthorizedAuditAccessError);
    });
  });

  describe('Acceptance Criterion 4: Tamper-Evident Cryptographic Hash Chaining', () => {
    test('4.1 Clean audit chain verifies successfully', () => {
      recordDocumentUploadAudit(sampleTenantA, 'USER-1', 'DOC-1', { data: 1 });
      recordOcrProcessingAudit(sampleTenantA, 'SYSTEM', 'DOC-1', { ocr: 'data' });
      recordJournalPostingAudit(sampleTenantA, 'USER-1', 'JRN-1', { debit: 100 });
      recordTaxCalculationAudit(sampleTenantA, 'SYSTEM', 'CALC-1', { tax: 50 });

      const verification = verifyAuditChain(sampleTenantA);
      expect(verification.isValid).toBe(true);
      expect(verification.totalEvents).toBe(4);
      expect(verification.lastVerifiedHash).toBeDefined();
    });

    test('4.2 Tampering with an event payload or hash is detected at the exact index', () => {
      const e1 = recordDocumentUploadAudit(sampleTenantA, 'USER-1', 'DOC-1', { data: 1 });
      const e2 = recordOcrProcessingAudit(sampleTenantA, 'SYSTEM', 'DOC-1', { ocr: 'data' });
      const e3 = recordJournalPostingAudit(sampleTenantA, 'USER-1', 'JRN-1', { debit: 100 });

      // Clean chain verifies
      const cleanResult = verifyAuditChain(sampleTenantA);
      expect(cleanResult.isValid).toBe(true);
      expect(cleanResult.totalEvents).toBe(3);

      // Create tampered copy of the events array: Alter e2 payload
      const tamperedEventsPayload = [
        e1,
        { ...e2, actorId: 'ATTACKER' }, // Tampered actorId without recalculating hash
        e3
      ];
      const tamperPayloadResult = verifyCustomAuditChain(tamperedEventsPayload, sampleTenantA);
      expect(tamperPayloadResult.isValid).toBe(false);
      expect(tamperPayloadResult.brokenAtIndex).toBe(1);
      expect(tamperPayloadResult.error).toContain('Tamper detected at index 1');

      // Create tampered copy: Break previousEventHash pointer
      const tamperedEventsPointer = [
        e1,
        e2,
        { ...e3, previousEventHash: '0000000000000000000000000000000000000000000000000000000000000000' }
      ];
      const tamperPointerResult = verifyCustomAuditChain(tamperedEventsPointer, sampleTenantA);
      expect(tamperPointerResult.isValid).toBe(false);
      expect(tamperPointerResult.brokenAtIndex).toBe(2);
      expect(tamperPointerResult.error).toContain('Chain pointer broken at index 2');
    });

    test('4.3 Tenant hash chains are isolated from other tenants', () => {
      recordDocumentUploadAudit(sampleTenantA, 'USER-A', 'DOC-A', { tenant: 'A' });
      recordDocumentUploadAudit(sampleTenantB, 'USER-B', 'DOC-B', { tenant: 'B' });
      recordJournalPostingAudit(sampleTenantA, 'USER-A', 'JRN-A', { tenant: 'A' });
      recordJournalPostingAudit(sampleTenantB, 'USER-B', 'JRN-B', { tenant: 'B' });

      const verifyA = verifyAuditChain(sampleTenantA);
      const verifyB = verifyAuditChain(sampleTenantB);

      expect(verifyA.isValid).toBe(true);
      expect(verifyA.totalEvents).toBe(2);

      expect(verifyB.isValid).toBe(true);
      expect(verifyB.totalEvents).toBe(2);

      expect(verifyA.lastVerifiedHash).not.toBe(verifyB.lastVerifiedHash);
    });
  });
});
