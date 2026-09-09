import { describe, test, expect, beforeEach } from 'vitest';
import { PeriodControlService } from '../../src/services/accounting/periodControlService';
import { JournalPostingService } from '../../src/services/accounting/journalPostingService';
import { AccountingPeriodService } from '../../src/services/accounting/accountingPeriodService';
import { UserSession } from '../../src/types/rbac';
import {
  LockedPeriodMutationError,
  PeriodStateTransitionError,
  UnauthorizedPeriodActionError
} from '../../src/types/period';
import { prisma } from '../../src/db/client';
import { reverseTransaction } from '../../src/services/audit/auditService';
import { TransactionRecord } from '../../src/types/taxEngine';

describe('Phase 36: Period Control Lifecycle & Immutable Lock Enforcement', { timeout: 30000 }, () => {
  const tenantId = `TENANT-P36-${Date.now()}`;
  const otherTenantId = `TENANT-P36-OTHER-${Date.now()}`;

  const clientUserSession: UserSession = {
    userId: 'USR-CLIENT-001',
    role: 'CLIENT_USER',
    tenantId,
    assignedEntities: [tenantId]
  };

  const accountantSession: UserSession = {
    userId: 'USR-ACCT-001',
    role: 'STAFF_ACCOUNTANT',
    tenantId,
    assignedEntities: [tenantId]
  };

  const taxManagerSession: UserSession = {
    userId: 'USR-MGR-001',
    role: 'TAX_MANAGER',
    tenantId,
    assignedEntities: [tenantId]
  };

  const adminSession: UserSession = {
    userId: 'USR-ADMIN-001',
    role: 'CLIENT_ADMIN',
    tenantId,
    assignedEntities: [tenantId]
  };

  const auditorSession: UserSession = {
    userId: 'USR-AUDITOR-001',
    role: 'AUDITOR',
    tenantId,
    assignedEntities: [tenantId]
  };

  beforeEach(() => {
    PeriodControlService.resetStore();
  });

  test('1. Period initial state is OPEN and allows standard balanced postings', async () => {
    const period = await PeriodControlService.createPeriod({
      tenantId,
      periodName: 'FY2026-Q1',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      status: 'OPEN',
      session: accountantSession
    });

    expect(period.status).toBe('OPEN');
    expect(period.isClosed).toBe(false);

    // Post balanced journal
    const journal = await JournalPostingService.postJournal({
      tenantId,
      entryDate: '2026-02-15',
      reference: `INV-P36-001-${Date.now()}`,
      description: 'Standard Consulting Income',
      session: accountantSession,
      lines: [
        { accountCode: '1000-BANK', debit: 54000, credit: 0 },
        { accountCode: '4000-REVENUE', debit: 0, credit: 50000 },
        { accountCode: '2200-GST-OUTPUT', debit: 0, credit: 4000 }
      ]
    });

    expect(journal.status).toBe('POSTED');
    expect(journal.isBalanced).toBe(true);
  });

  test('2. Transition from OPEN -> REVIEW by Staff Accountant', async () => {
    const period = await PeriodControlService.createPeriod({
      tenantId,
      periodName: 'FY2026-Q2',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      status: 'OPEN'
    });

    const { period: updated, auditEvent } = await PeriodControlService.transitionPeriodState({
      tenantId,
      periodId: period.periodId,
      targetStatus: 'REVIEW',
      reason: 'End of Q2 reconciliation initiated',
      session: accountantSession
    });

    expect(updated.status).toBe('REVIEW');
    expect(updated.reviewedBy).toBe(accountantSession.userId);
    expect(auditEvent.eventType).toBe('PERIOD_STATE_TRANSITION');
    expect(auditEvent.entityType).toBe('PERIOD_CONTROL');
  });

  test('3. Transition from REVIEW -> APPROVED by Tax Manager', async () => {
    const period = await PeriodControlService.createPeriod({
      tenantId,
      periodName: 'FY2026-Q2',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      status: 'REVIEW'
    });

    const { period: updated, auditEvent } = await PeriodControlService.transitionPeriodState({
      tenantId,
      periodId: period.periodId,
      targetStatus: 'APPROVED',
      reason: 'Tax manager verified all accounts and tax filings',
      session: taxManagerSession
    });

    expect(updated.status).toBe('APPROVED');
    expect(updated.isClosed).toBe(true);
    expect(updated.approvedBy).toBe(taxManagerSession.userId);
    expect(auditEvent.eventType).toBe('PERIOD_STATE_TRANSITION');
  });

  test('4. APPROVED period rejects standard postings from Client User', async () => {
    await PeriodControlService.createPeriod({
      tenantId,
      periodName: 'FY2026-Q2',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      status: 'APPROVED'
    });

    await expect(
      JournalPostingService.postJournal({
        tenantId,
        entryDate: '2026-05-10',
        reference: 'INV-POST-APPROVED',
        description: 'Attempting to post to approved period',
        session: clientUserSession,
        lines: [
          { accountCode: '1000-BANK', debit: 1000, credit: 0 },
          { accountCode: '4000-REVENUE', debit: 0, credit: 1000 }
        ]
      })
    ).rejects.toThrow(LockedPeriodMutationError);
  });

  test('5. Transition from APPROVED -> LOCKED by Tax Manager', async () => {
    const period = await PeriodControlService.createPeriod({
      tenantId,
      periodName: 'FY2026-Q2',
      startDate: '2026-04-01',
      endDate: '2026-06-30',
      status: 'APPROVED'
    });

    const { period: lockedPeriod, auditEvent } = await PeriodControlService.transitionPeriodState({
      tenantId,
      periodId: period.periodId,
      targetStatus: 'LOCKED',
      reason: 'Quarterly tax return filed with MIRA; locking period permanently',
      session: taxManagerSession
    });

    expect(lockedPeriod.status).toBe('LOCKED');
    expect(lockedPeriod.isClosed).toBe(true);
    expect(lockedPeriod.lockedBy).toBe(taxManagerSession.userId);
    expect(auditEvent.eventType).toBe('PERIOD_LOCK');
  });

  test('6. LOCKED period strictly rejects new journal postings from all users', async () => {
    await PeriodControlService.createPeriod({
      tenantId,
      periodName: 'FY2026-LOCKED',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'LOCKED'
    });

    await expect(
      JournalPostingService.postJournal({
        tenantId,
        entryDate: '2026-07-20',
        reference: 'INV-POST-LOCKED',
        description: 'Posting to locked period',
        session: adminSession,
        lines: [
          { accountCode: '1000-BANK', debit: 500, credit: 0 },
          { accountCode: '4000-REVENUE', debit: 0, credit: 500 }
        ]
      })
    ).rejects.toThrow(/closed or locked|LOCKED/i);
  });

  test('7. Unauthorized roles (CLIENT_USER, AUDITOR) cannot lock or unlock periods', async () => {
    const period = await PeriodControlService.createPeriod({
      tenantId,
      periodName: 'FY2026-Q3',
      startDate: '2026-07-01',
      endDate: '2026-09-30',
      status: 'OPEN'
    });

    // Client user attempt to lock
    await expect(
      PeriodControlService.transitionPeriodState({
        tenantId,
        periodId: period.periodId,
        targetStatus: 'LOCKED',
        reason: 'Client user locking',
        session: clientUserSession
      })
    ).rejects.toThrow(UnauthorizedPeriodActionError);

    // Auditor attempt to lock
    await expect(
      PeriodControlService.transitionPeriodState({
        tenantId,
        periodId: period.periodId,
        targetStatus: 'LOCKED',
        reason: 'Auditor locking',
        session: auditorSession
      })
    ).rejects.toThrow(UnauthorizedPeriodActionError);
  });

  test('8. Invalid state transition (e.g. OPEN -> AMENDED directly) is rejected', async () => {
    const period = await PeriodControlService.createPeriod({
      tenantId,
      periodName: 'FY2026-Q3',
      startDate: '2026-07-01',
      endDate: '2026-09-30',
      status: 'OPEN'
    });

    await expect(
      PeriodControlService.transitionPeriodState({
        tenantId,
        periodId: period.periodId,
        targetStatus: 'AMENDED',
        reason: 'Illegal direct transition',
        session: taxManagerSession
      })
    ).rejects.toThrow(PeriodStateTransitionError);
  });

  test('9. Controlled Amendment Workflow on LOCKED period requires reason and Tax Manager/Admin role', async () => {
    const period = await PeriodControlService.createPeriod({
      tenantId,
      periodName: 'FY2026-Q4',
      startDate: '2026-10-01',
      endDate: '2026-12-31',
      status: 'LOCKED'
    });

    // Attempting amendment without reason throws error
    await expect(
      PeriodControlService.initiatePeriodAmendment({
        tenantId,
        periodId: period.periodId,
        reason: '',
        session: taxManagerSession
      })
    ).rejects.toThrow(/reason is required/i);

    // Attempting amendment by Staff Accountant throws UnauthorizedPeriodActionError
    await expect(
      PeriodControlService.initiatePeriodAmendment({
        tenantId,
        periodId: period.periodId,
        reason: 'Need to correct supplier credit note',
        session: accountantSession
      })
    ).rejects.toThrow(UnauthorizedPeriodActionError);

    // Successful initiation by Tax Manager
    const amendmentResult = await PeriodControlService.initiatePeriodAmendment({
      tenantId,
      periodId: period.periodId,
      reason: 'Late supplier credit note received under MIRA Notice 2026/04',
      session: taxManagerSession
    });

    expect(amendmentResult.newStatus).toBe('AMENDED');
    expect(amendmentResult.amendedBy).toBe(taxManagerSession.userId);
    expect(amendmentResult.auditEvent.eventType).toBe('PERIOD_AMENDMENT');
    expect(amendmentResult.auditEvent.entityType).toBe('PERIOD_CONTROL');

    // Period is now in AMENDED status
    const amendedPeriod = await PeriodControlService.getPeriod(tenantId, period.periodId);
    expect(amendedPeriod.status).toBe('AMENDED');
    expect(amendedPeriod.amendmentCount).toBe(1);
  });

  test('10. Posted journals cannot be edited or deleted (Immuntability Invariant)', async () => {
    await expect(JournalPostingService.updateJournal()).rejects.toThrow(
      'Journal Error: Posted journals cannot be edited'
    );

    await expect(JournalPostingService.deleteJournal()).rejects.toThrow(
      'Journal Error: Posted journals cannot be deleted'
    );
  });

  test('11. Reversal of transaction in LOCKED period is rejected unless amended or unlocked', async () => {
    await PeriodControlService.createPeriod({
      tenantId,
      periodName: 'FY2026-ANNUAL',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'LOCKED'
    });

    const txRecord: TransactionRecord = {
      sourceType: 'invoice',
      sourceId: 'DOC-001',
      outletId: 'OUTLET-001',
      accountingCategory: 'REVENUE',
      transactionId: 'TX-LOCKED-001',
      entityId: tenantId,
      transactionDate: '2026-06-15',
      description: 'Consulting Fee',
      amount: 10000,
      gstAmount: 800,
      totalAmount: 10800,
      miraCategory: 'GENERAL_SERVICES',
      accountingTreatment: 'REVENUE',
      incomeTaxTreatment: 'DEDUCTIBLE',
      gstTreatment: 'STANDARD_RATED',
      taxYear: 2026,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31',
      reviewStatus: 'APPROVED',
      createdAt: '2026-06-15T10:00:00Z',
      auditHistory: []
    };

    // Attempting reversal in locked period throws error
    await expect(
      PeriodControlService.executeControlledReversal({
        tenantId,
        transaction: txRecord,
        reason: 'Customer billing error correction',
        session: taxManagerSession
      })
    ).rejects.toThrow(LockedPeriodMutationError);
  });

  test('12. Reversal is allowed in AMENDED period and creates linked reversal record with audit event', async () => {
    const period = await PeriodControlService.createPeriod({
      tenantId,
      periodName: 'FY2026-AMENDED-TEST',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'AMENDED'
    });

    expect(period.status).toBe('AMENDED');

    const txRecord: TransactionRecord = {
      sourceType: 'invoice',
      sourceId: 'DOC-002',
      outletId: 'OUTLET-001',
      accountingCategory: 'REVENUE',
      transactionId: 'TX-AMEND-001',
      entityId: tenantId,
      transactionDate: '2026-06-15',
      description: 'Consulting Fee Correction',
      amount: 10000,
      gstAmount: 800,
      totalAmount: 10800,
      miraCategory: 'GENERAL_SERVICES',
      accountingTreatment: 'REVENUE',
      incomeTaxTreatment: 'DEDUCTIBLE',
      gstTreatment: 'STANDARD_RATED',
      taxYear: 2026,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31',
      reviewStatus: 'APPROVED',
      createdAt: '2026-06-15T10:00:00Z',
      auditHistory: []
    };

    const reversalResult = await PeriodControlService.executeControlledReversal({
      tenantId,
      transaction: txRecord,
      reason: 'Amended invoice reversal under MIRA tax ruling',
      session: taxManagerSession
    });

    expect(reversalResult.reversalTransaction.transactionId).toBe('TX-REV-TX-AMEND-001');
    expect(reversalResult.reversalTransaction.amount).toBe(-10000);
    expect(reversalResult.reversalTransaction.totalAmount).toBe(-10800);
    expect(reversalResult.auditEvent.eventType).toBe('JOURNAL_REVERSAL');
  });

  test('13. Multi-Tenant isolation blocks cross-tenant period manipulation', async () => {
    const period = await PeriodControlService.createPeriod({
      tenantId: otherTenantId,
      periodName: 'OTHER-FY2026',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'OPEN'
    });

    // User from tenantId cannot modify period of otherTenantId
    await expect(
      PeriodControlService.transitionPeriodState({
        tenantId: otherTenantId,
        periodId: period.periodId,
        targetStatus: 'LOCKED',
        reason: 'Unauthorized cross-tenant attack',
        session: taxManagerSession // belongs to tenantId, not otherTenantId
      })
    ).rejects.toThrow(UnauthorizedPeriodActionError);
  });

  test('14. Complete State Machine Lifecycle (OPEN -> REVIEW -> APPROVED -> LOCKED -> AMENDED -> APPROVED -> LOCKED)', async () => {
    // 1. OPEN
    let period = await PeriodControlService.createPeriod({
      tenantId,
      periodName: 'FY2026-FULL-CYCLE',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      status: 'OPEN'
    });
    expect(period.status).toBe('OPEN');

    // 2. REVIEW
    let res = await PeriodControlService.transitionPeriodState({
      tenantId,
      periodId: period.periodId,
      targetStatus: 'REVIEW',
      reason: 'Staff review started',
      session: accountantSession
    });
    expect(res.period.status).toBe('REVIEW');

    // 3. APPROVED
    res = await PeriodControlService.transitionPeriodState({
      tenantId,
      periodId: period.periodId,
      targetStatus: 'APPROVED',
      reason: 'Tax manager approved numbers',
      session: taxManagerSession
    });
    expect(res.period.status).toBe('APPROVED');

    // 4. LOCKED
    res = await PeriodControlService.transitionPeriodState({
      tenantId,
      periodId: period.periodId,
      targetStatus: 'LOCKED',
      reason: 'MIRA return filed, period locked',
      session: taxManagerSession
    });
    expect(res.period.status).toBe('LOCKED');

    // 5. AMENDED
    const amd = await PeriodControlService.initiatePeriodAmendment({
      tenantId,
      periodId: period.periodId,
      reason: 'Controlled MIRA amendment approved by auditor',
      session: taxManagerSession
    });
    expect(amd.newStatus).toBe('AMENDED');

    // 6. Re-APPROVED
    res = await PeriodControlService.transitionPeriodState({
      tenantId,
      periodId: period.periodId,
      targetStatus: 'APPROVED',
      reason: 'Amended return re-verified',
      session: taxManagerSession
    });
    expect(res.period.status).toBe('APPROVED');

    // 7. Re-LOCKED
    res = await PeriodControlService.transitionPeriodState({
      tenantId,
      periodId: period.periodId,
      targetStatus: 'LOCKED',
      reason: 'Final amended lock',
      session: taxManagerSession
    });
    expect(res.period.status).toBe('LOCKED');
    expect(res.period.amendmentCount).toBe(1);
  });
});
