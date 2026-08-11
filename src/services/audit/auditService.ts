import { TransactionRecord } from '../../types/taxEngine';
import {
  AuditEvent,
  AuditAction,
  AuditEntityType,
  PeriodLockRecord,
  ReversalResult
} from '../../types/audit';

// Global in-memory audit store and period lock registry
const auditLogStore: AuditEvent[] = [];
const periodLockStore: Map<string, PeriodLockRecord> = new Map();

/**
 * Resets in-memory audit store (mainly for test suite isolation).
 */
export function resetAuditStore(): void {
  auditLogStore.length = 0;
  periodLockStore.clear();
}

/**
 * Logs an immutable audit event into the audit trail.
 */
export function logAuditEvent(
  eventData: Omit<AuditEvent, 'eventId' | 'timestamp'>
): AuditEvent {
  const eventId = `AUD-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const timestamp = new Date().toISOString();

  const auditEvent: AuditEvent = {
    eventId,
    timestamp,
    ...eventData
  };

  auditLogStore.push(auditEvent);
  return auditEvent;
}

/**
 * Retrieves full audit log history.
 */
export function getAuditLog(): AuditEvent[] {
  return [...auditLogStore];
}

/**
 * Retrieves audit history events for a specific entity ID.
 */
export function getAuditHistoryForEntity(entityId: string): AuditEvent[] {
  return auditLogStore.filter(
    (event) => event.entityId === entityId || (event.previousState as { entityId?: string })?.entityId === entityId
  );
}

/**
 * Locks an accounting period up to lockDate for an entity.
 */
export function lockAccountingPeriod(
  entityId: string,
  lockDate: string,
  userId: string
): PeriodLockRecord {
  if (!entityId || !entityId.trim()) {
    throw new Error('Validation Error: Entity ID is required for period lock');
  }

  if (!lockDate || !lockDate.trim()) {
    throw new Error('Validation Error: Lock date is required for period lock');
  }

  const existing = periodLockStore.get(entityId);

  const lockRecord: PeriodLockRecord = {
    lockId: `LOCK-${entityId}-${lockDate}`,
    entityId,
    lockDate,
    lockedBy: userId,
    lockedAt: new Date().toISOString(),
    status: 'LOCKED'
  };

  periodLockStore.set(entityId, lockRecord);

  logAuditEvent({
    userId,
    action: 'LOCK_PERIOD',
    entityType: 'PERIOD_LOCK',
    entityId,
    previousState: existing ? (existing as unknown as Record<string, unknown>) : null,
    newState: lockRecord as unknown as Record<string, unknown>,
    reason: `Accounting period locked up to ${lockDate}`
  });

  return lockRecord;
}

/**
 * Unlocks / Reopens an accounting period for an entity.
 */
export function unlockAccountingPeriod(
  entityId: string,
  lockDate: string,
  userId: string,
  reason: string
): PeriodLockRecord {
  const existing = periodLockStore.get(entityId);

  const unlockedRecord: PeriodLockRecord = {
    lockId: existing?.lockId || `LOCK-${entityId}-${lockDate}`,
    entityId,
    lockDate,
    lockedBy: existing?.lockedBy || userId,
    lockedAt: existing?.lockedAt || new Date().toISOString(),
    status: 'UNLOCKED',
    unlockedAt: new Date().toISOString(),
    unlockedBy: userId,
    unlockReason: reason
  };

  periodLockStore.set(entityId, unlockedRecord);

  logAuditEvent({
    userId,
    action: 'REOPEN',
    entityType: 'PERIOD_LOCK',
    entityId,
    previousState: existing ? (existing as unknown as Record<string, unknown>) : null,
    newState: unlockedRecord as unknown as Record<string, unknown>,
    reason: `Accounting period reopened up to ${lockDate}: ${reason}`
  });

  return unlockedRecord;
}

/**
 * Checks if period is locked for transaction date and entity.
 * Returns true if period is NOT locked (i.e. transaction is allowed).
 * Returns false if period IS locked.
 */
export function validatePeriodNotLocked(transactionDate: string, entityId: string): boolean {
  const lock = periodLockStore.get(entityId);
  if (!lock || lock.status !== 'LOCKED') {
    return true; // No active lock
  }

  // If transaction date is on or before lockDate, period is locked
  if (transactionDate <= lock.lockDate) {
    return false;
  }

  return true;
}

/**
 * Reverses a posted transaction without deleting or altering the original record.
 * Generates an explicit reversing journal entry with negated amounts.
 */
export function reverseTransaction(
  transaction: TransactionRecord,
  reason: string,
  userId: string
): ReversalResult {
  if (!transaction || !transaction.transactionId) {
    throw new Error('Validation Error: Valid transaction is required for reversal');
  }

  if (!reason || !reason.trim()) {
    throw new Error('Validation Error: Reversal reason is required for audit trail');
  }

  // Enforce period lock check
  const isAllowed = validatePeriodNotLocked(transaction.transactionDate, transaction.entityId);
  if (!isAllowed) {
    throw new Error(
      `Period Locked Error: Cannot reverse transaction ${transaction.transactionId} dated ${transaction.transactionDate} because accounting period is locked`
    );
  }

  const timestamp = new Date().toISOString();
  const reversalId = `TX-REV-${transaction.transactionId}`;

  const reversalTransaction: TransactionRecord = {
    ...transaction,
    transactionId: reversalId,
    description: `REVERSAL: ${transaction.description} (Reason: ${reason})`,
    amount: -Math.abs(transaction.amount),
    gstAmount: transaction.gstAmount ? -Math.abs(transaction.gstAmount) : 0,
    totalAmount: -Math.abs(transaction.totalAmount),
    reviewStatus: 'APPROVED',
    createdAt: timestamp,
    auditHistory: [
      ...(transaction.auditHistory || []),
      {
        timestamp,
        performedBy: userId,
        action: 'REVERSED',
        details: reason
      }
    ]
  };

  const auditEvent = logAuditEvent({
    userId,
    action: 'REVERSE',
    entityType: 'TRANSACTION',
    entityId: transaction.transactionId,
    previousState: transaction as unknown as Record<string, unknown>,
    newState: reversalTransaction as unknown as Record<string, unknown>,
    reason
  });

  return {
    originalTransaction: transaction,
    reversalTransaction,
    auditEvent
  };
}
