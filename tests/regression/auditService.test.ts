import { describe, test, expect, beforeEach } from 'vitest';
import {
  logAuditEvent,
  getAuditLog,
  getAuditHistoryForEntity,
  lockAccountingPeriod,
  unlockAccountingPeriod,
  validatePeriodNotLocked,
  reverseTransaction,
  resetAuditStore
} from '../../src/services/audit/auditService';
import { TransactionRecord } from '../../src/types/taxEngine';

describe('Phase 12 - Audit Trail, Immutable Ledger & Revision Engine Tests', () => {

  beforeEach(() => {
    resetAuditStore();
  });

  const sampleTx: TransactionRecord = {
    transactionId: 'TX-2026-INV-500',
    sourceType: 'invoice',
    sourceId: 'INV-500',
    entityId: 'COMPANY-001',
    outletId: 'OUTLET-001',
    transactionDate: '2025-10-15',
    description: 'Software Development Consultancy Services',
    accountingCategory: 'revenue.sales',
    miraCategory: 'revenue',
    amount: 50000,
    gstAmount: 4000,
    totalAmount: 54000,
    accountingTreatment: 'REVENUE',
    incomeTaxTreatment: 'DEDUCTIBLE',
    gstTreatment: 'STANDARD_RATED',
    taxYear: 2025,
    accountingPeriodStart: '2025-01-01',
    accountingPeriodEnd: '2025-12-31',
    reviewStatus: 'APPROVED',
    auditHistory: [],
    createdAt: '2025-10-15T10:00:00Z'
  };

  test('Requirement 1: Audit logging captures immutable audit events with userId, timestamp, and details', () => {
    const event = logAuditEvent({
      userId: 'USER-ADMIN-01',
      action: 'CREATE',
      entityType: 'TRANSACTION',
      entityId: sampleTx.transactionId,
      newState: sampleTx as unknown as Record<string, unknown>,
      reason: 'Initial transaction entry created'
    });

    expect(event.eventId).toBeDefined();
    expect(event.timestamp).toBeDefined();
    expect(event.userId).toBe('USER-ADMIN-01');
    expect(event.action).toBe('CREATE');
    expect(event.entityType).toBe('TRANSACTION');
    expect(event.entityId).toBe(sampleTx.transactionId);

    const fullLog = getAuditLog();
    expect(fullLog.length).toBe(1);
    expect(fullLog[0].eventId).toBe(event.eventId);
  });

  test('Requirement 2: reverseTransaction creates an explicit reversal entry with inverted amounts without mutating original transaction', () => {
    const result = reverseTransaction(sampleTx, 'Duplicate invoice entry error', 'USER-SENIOR-ACC');

    // Original transaction is unmodified
    expect(result.originalTransaction.amount).toBe(50000);
    expect(result.originalTransaction.totalAmount).toBe(54000);

    // Reversal transaction has negated amounts and linked reversal ID
    expect(result.reversalTransaction.transactionId).toBe('TX-REV-TX-2026-INV-500');
    expect(result.reversalTransaction.amount).toBe(-50000);
    expect(result.reversalTransaction.gstAmount).toBe(-4000);
    expect(result.reversalTransaction.totalAmount).toBe(-54000);
    expect(result.reversalTransaction.description).toContain('REVERSAL: Software Development Consultancy Services');
    expect(result.reversalTransaction.description).toContain('Reason: Duplicate invoice entry error');

    // Audit log recorded
    expect(result.auditEvent.action).toBe('REVERSE');
    expect(result.auditEvent.userId).toBe('USER-SENIOR-ACC');
  });

  test('Requirement 3: lockAccountingPeriod locks period and prevents modifications on or before lock date', () => {
    // Lock accounting period up to 2025-12-31 for COMPANY-001
    const lock = lockAccountingPeriod('COMPANY-001', '2025-12-31', 'USER-AUDITOR-99');

    expect(lock.status).toBe('LOCKED');
    expect(lock.lockDate).toBe('2025-12-31');

    // Transaction on 2025-10-15 is locked
    const isLocked = !validatePeriodNotLocked('2025-10-15', 'COMPANY-001');
    expect(isLocked).toBe(true);

    // Transaction on 2026-01-15 is allowed
    const isNextYearAllowed = validatePeriodNotLocked('2026-01-15', 'COMPANY-001');
    expect(isNextYearAllowed).toBe(true);

    // Attempting to reverse locked transaction throws Period Locked error
    expect(() => {
      reverseTransaction(sampleTx, 'Attempting reversal in locked period', 'USER-ACC');
    }).toThrow(/Period Locked Error/i);
  });

  test('Requirement 4: unlockAccountingPeriod allows admin override and records REOPEN audit event', () => {
    // Lock period
    lockAccountingPeriod('COMPANY-001', '2025-12-31', 'USER-AUDITOR-99');
    expect(validatePeriodNotLocked('2025-10-15', 'COMPANY-001')).toBe(false);

    // Unlock period
    const reopened = unlockAccountingPeriod(
      'COMPANY-001',
      '2025-12-31',
      'USER-FINANCE-DIR',
      'Auditor adjustment requested for prior year closing'
    );

    expect(reopened.status).toBe('UNLOCKED');
    expect(reopened.unlockReason).toContain('Auditor adjustment requested');

    // Now reversal is allowed
    expect(validatePeriodNotLocked('2025-10-15', 'COMPANY-001')).toBe(true);
    const revResult = reverseTransaction(sampleTx, 'Auditor approved reversal', 'USER-FINANCE-DIR');
    expect(revResult.reversalTransaction.amount).toBe(-50000);
  });

  test('Requirement 5: getAuditHistoryForEntity retrieves complete audit trails for a specific entity', () => {
    logAuditEvent({
      userId: 'USER-1',
      action: 'CREATE',
      entityType: 'TRANSACTION',
      entityId: 'COMPANY-001',
      reason: 'Event 1'
    });

    logAuditEvent({
      userId: 'USER-2',
      action: 'UPDATE',
      entityType: 'TRANSACTION',
      entityId: 'COMPANY-002',
      reason: 'Event for other entity'
    });

    lockAccountingPeriod('COMPANY-001', '2025-12-31', 'USER-1');

    const company1Events = getAuditHistoryForEntity('COMPANY-001');
    expect(company1Events.length).toBe(2); // CREATE and LOCK_PERIOD
  });

});
