import { TransactionRecord, Transaction } from './taxEngine';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'REVERSE'
  | 'REOPEN'
  | 'LOCK_PERIOD'
  | 'DOCUMENT_UPLOAD'
  | 'DOCUMENT_OCR'
  | 'OCR_CORRECTION'
  | 'CLASSIFICATION_SUGGESTION'
  | 'CLASSIFICATION_VALIDATION'
  | 'CLASSIFICATION_OVERRIDE'
  | 'TRANSACTION_APPROVAL'
  | 'APPROVAL_SUBMIT'
  | 'APPROVAL_APPROVE'
  | 'APPROVAL_REJECT'
  | 'JOURNAL_POSTING'
  | 'JOURNAL_REVERSAL'
  | 'REVENUE_POSTED'
  | 'REVENUE_REVERSED'
  | 'REVENUE_CREATED'
  | 'REVENUE_UPDATED'
  | 'TAX_ADJUSTMENT_CREATE'
  | 'TAX_ADJUSTMENT_APPROVE'
  | 'TAX_CALCULATION'
  | 'RETURN_GENERATION'
  | 'FILING_PACKAGE_GENERATION';

export type AuditEventType =
  | 'DOCUMENT_UPLOAD'
  | 'DOCUMENT_OCR'
  | 'OCR_CORRECTION'
  | 'CLASSIFICATION_SUGGESTION'
  | 'CLASSIFICATION_VALIDATION'
  | 'CLASSIFICATION_OVERRIDE'
  | 'TRANSACTION_APPROVAL'
  | 'APPROVAL_SUBMIT'
  | 'APPROVAL_APPROVE'
  | 'APPROVAL_REJECT'
  | 'JOURNAL_POSTING'
  | 'JOURNAL_REVERSAL'
  | 'REVENUE_POSTED'
  | 'REVENUE_REVERSED'
  | 'REVENUE_CREATED'
  | 'REVENUE_UPDATED'
  | 'TAX_ADJUSTMENT_CREATE'
  | 'TAX_ADJUSTMENT_APPROVE'
  | 'TAX_CALCULATION'
  | 'PERIOD_LOCK'
  | 'PERIOD_UNLOCK'
  | 'PERIOD_AMENDMENT'
  | 'PERIOD_STATE_TRANSITION'
  | 'RETURN_GENERATION'
  | 'FILING_PACKAGE_GENERATION'
  | 'CREATE'
  | 'UPDATE'
  | 'REVERSE'
  | 'REOPEN'
  | 'LOCK_PERIOD';

export type AuditEntityType =
  | 'DOCUMENT'
  | 'INVOICE'
  | 'CLASSIFICATION'
  | 'JOURNAL'
  | 'TRANSACTION'
  | 'REVENUE'
  | 'TAX_ADJUSTMENT'
  | 'TAX_LOSS'
  | 'TAX_CALCULATION'
  | 'FIXED_ASSET'
  | 'PERIOD_LOCK'
  | 'PERIOD_CONTROL'
  | 'PERIOD'
  | 'MIRA_RETURN'
  | 'FILING_PACKAGE'
  | 'RECONCILIATION'
  | 'ASSET'
  | 'WORKFLOW_ITEM'
  | 'APPROVAL';

/**
 * Authoritative, immutable Audit Event structure conforming to Phase 35 specifications
 * and supporting cryptographic hash chaining for tamper-evident ledger integrity.
 */
export interface AuditEvent {
  id: string;
  tenantId: string;
  actorId: string;
  timestamp: string;               // ISO-8601 UTC
  eventType: AuditEventType;
  entityType: AuditEntityType;
  entityId: string;
  beforeHash?: string | null;      // SHA-256 hash of previous state (or null)
  afterHash: string;               // SHA-256 hash of new/current state
  metadata?: Record<string, unknown>;
  reason?: string;
  correlationId: string;           // Distributed trace ID
  previousEventHash?: string | null; // Cryptographic pointer to previous audit event in chain
  eventHash: string;               // Cryptographic SHA-256 hash of this entire event

  // Backward-compatibility aliases for Phase 12 legacy models
  eventId?: string;
  userId?: string;
  action?: AuditAction;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
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

/**
 * Result of validating the cryptographic audit chain for tamper detection.
 */
export interface AuditChainVerificationResult {
  isValid: boolean;
  tenantId?: string;
  totalEvents: number;
  lastVerifiedHash?: string;
  brokenAtIndex?: number;
  brokenEventId?: string;
  expectedHash?: string;
  actualHash?: string;
  error?: string;
}

/**
 * Options for filtering and querying the audit ledger.
 */
export interface AuditQueryOptions {
  tenantId?: string;
  entityId?: string;
  entityType?: AuditEntityType;
  eventType?: AuditEventType;
  actorId?: string;
  correlationId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * Error thrown when an attempt is made to edit or delete an immutable audit record.
 */
export class ImmutableAuditError extends Error {
  constructor(message: string = 'Audit Error: Audit records are strictly immutable and cannot be modified or deleted') {
    super(message);
    this.name = 'ImmutableAuditError';
  }
}

/**
 * Error thrown when an unauthorized user attempts to view or modify audit logs.
 */
export class UnauthorizedAuditAccessError extends Error {
  constructor(message: string = 'RBAC Security Error: Unauthorized audit log access') {
    super(message);
    this.name = 'UnauthorizedAuditAccessError';
  }
}

