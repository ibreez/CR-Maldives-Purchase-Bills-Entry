import { TransactionRecord, Transaction } from './taxEngine';

export type AuditAction = 'CREATE' | 'UPDATE' | 'REVERSE' | 'REOPEN' | 'LOCK_PERIOD';
export type AuditEntityType = 'TRANSACTION' | 'ASSET' | 'TAX_ADJUSTMENT' | 'PERIOD_LOCK';

export interface AuditEvent {
  eventId: string;
  timestamp: string;
  userId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason?: string;
}

export interface PeriodLockRecord {
  lockId: string;
  entityId: string;
  lockDate: string;           // YYYY-MM-DD
  lockedBy: string;
  lockedAt: string;
  status: 'LOCKED' | 'UNLOCKED';
  unlockedAt?: string;
  unlockedBy?: string;
  unlockReason?: string;
}

export interface ReversalResult {
  originalTransaction: TransactionRecord;
  reversalTransaction: TransactionRecord;
  auditEvent: AuditEvent;
}

export type AnyTransaction = TransactionRecord | Transaction;
