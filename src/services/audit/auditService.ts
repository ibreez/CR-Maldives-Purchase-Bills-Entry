import crypto from 'crypto';
import { TransactionRecord } from '../../types/taxEngine';
import {
  AuditEvent,
  AuditAction,
  AuditEventType,
  AuditEntityType,
  AuditChainVerificationResult,
  AuditQueryOptions,
  PeriodLockRecord,
  ReversalResult,
  ImmutableAuditError,
  UnauthorizedAuditAccessError
} from '../../types/audit';
import { UserSession } from '../../types/rbac';
import { hasPermission } from '../auth/rbacService';

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

// Global in-memory audit store and period lock registry
const auditLogStore: AuditEvent[] = [];
const periodLockStore: Map<string, PeriodLockRecord> = new Map();
const lastEventHashByTenant: Map<string, string> = new Map();

/**
 * Deep freezes an object and all nested properties recursively.
 */
function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  // Freeze array elements or object properties
  Object.freeze(obj);
  for (const key of Object.keys(obj as object)) {
    const prop = (obj as any)[key];
    if (prop !== null && typeof prop === 'object' && !Object.isFrozen(prop)) {
      deepFreeze(prop);
    }
  }

  return obj as Readonly<T>;
}

/**
 * Deterministically stringifies an object by sorting its keys recursively.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }
  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }

  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalJsonStringify((obj as Record<string, unknown>)[k])}`
  );
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes a SHA-256 hash of any JavaScript state object using canonical serialization.
 */
export function computeStateHash(state: unknown): string {
  if (state === null || state === undefined) {
    return 'null';
  }
  const canonicalStr = canonicalJsonStringify(state);
  return crypto.createHash('sha256').update(canonicalStr, 'utf8').digest('hex');
}

/**
 * Computes the cryptographic hash of an audit event including previous hash link.
 */
export function computeEventHash(params: {
  id: string;
  tenantId: string;
  actorId: string;
  timestamp: string;
  eventType: string;
  entityType: string;
  entityId: string;
  beforeHash?: string | null;
  afterHash: string;
  metadata?: Record<string, unknown>;
  correlationId: string;
  previousEventHash?: string | null;
}): string {
  const metaCanonical = canonicalJsonStringify(params.metadata || {});
  const payload = [
    params.id,
    params.tenantId,
    params.actorId,
    params.timestamp,
    params.eventType,
    params.entityType,
    params.entityId,
    params.beforeHash || 'null',
    params.afterHash,
    metaCanonical,
    params.correlationId,
    params.previousEventHash || GENESIS_HASH
  ].join('|');

  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Resets in-memory audit store (primarily for test suite isolation).
 */
export function resetAuditStore(): void {
  auditLogStore.length = 0;
  periodLockStore.clear();
  lastEventHashByTenant.clear();
}

export interface CreateAuditEventInput {
  id?: string;
  tenantId: string;
  actorId: string;
  timestamp?: string;
  eventType: AuditEventType;
  action?: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  beforeState?: unknown | null;
  beforeHash?: string | null;
  newState?: unknown | null;
  afterHash?: string;
  metadata?: Record<string, unknown>;
  reason?: string;
  correlationId?: string;
}

/**
 * Primary Phase 35 immutable audit event logger.
 * Computes before/after cryptographic hashes, links to previous event hash,
 * and seals the record in deep freeze.
 */
export function recordAuditEvent(
  input: CreateAuditEventInput,
  session?: UserSession
): Readonly<AuditEvent> {
  const timestamp = input.timestamp || new Date().toISOString();
  const id = input.id || `AUD-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const correlationId = input.correlationId || `CORR-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

  const tenantId = input.tenantId || (session ? session.tenantId : 'DEFAULT_TENANT');
  const actorId = input.actorId || (session ? session.userId : 'SYSTEM');

  // Compute state hashes if raw objects were provided
  let beforeHash = input.beforeHash;
  if (beforeHash === undefined && input.beforeState !== undefined) {
    beforeHash = input.beforeState !== null ? computeStateHash(input.beforeState) : null;
  }

  let afterHash = input.afterHash;
  if (!afterHash) {
    afterHash = input.newState !== undefined ? computeStateHash(input.newState) : computeStateHash({});
  }

  // Retrieve previous event hash for tenant
  const previousEventHash = lastEventHashByTenant.get(tenantId) || GENESIS_HASH;

  // Compute this event's tamper-evident hash
  const eventHash = computeEventHash({
    id,
    tenantId,
    actorId,
    timestamp,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    beforeHash,
    afterHash,
    metadata: input.metadata,
    correlationId,
    previousEventHash
  });

  const event: AuditEvent = {
    id,
    tenantId,
    actorId,
    timestamp,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId,
    beforeHash: beforeHash || null,
    afterHash,
    metadata: input.metadata ? { ...input.metadata } : undefined,
    reason: input.reason,
    correlationId,
    previousEventHash,
    eventHash,

    // Backward-compatibility aliases
    eventId: id,
    userId: actorId,
    action: (input.action || (input.eventType === 'JOURNAL_REVERSAL' ? 'REVERSE' : input.eventType)) as AuditAction,
    previousState: input.beforeState as Record<string, unknown> | null,
    newState: input.newState as Record<string, unknown> | null
  };

  const frozenEvent = deepFreeze(event);

  auditLogStore.push(frozenEvent as AuditEvent);
  lastEventHashByTenant.set(tenantId, eventHash);

  return frozenEvent;
}

/**
 * Backward-compatible wrapper for legacy Phase 12 audit calls.
 */
export function logAuditEvent(
  eventData: {
    userId?: string;
    actorId?: string;
    tenantId?: string;
    action?: AuditAction;
    eventType?: AuditEventType;
    entityType: AuditEntityType;
    entityId: string;
    previousState?: Record<string, unknown> | null;
    newState?: Record<string, unknown> | null;
    reason?: string;
    metadata?: Record<string, unknown>;
    correlationId?: string;
  }
): AuditEvent {
  const action = eventData.eventType || eventData.action || 'CREATE';
  const tenantId = eventData.tenantId || 'DEFAULT_TENANT';
  const actorId = eventData.actorId || eventData.userId || 'SYSTEM';

  return recordAuditEvent({
    tenantId,
    actorId,
    eventType: action as AuditEventType,
    action: eventData.action,
    entityType: eventData.entityType,
    entityId: eventData.entityId,
    beforeState: eventData.previousState,
    newState: eventData.newState,
    metadata: eventData.metadata,
    reason: eventData.reason,
    correlationId: eventData.correlationId
  }) as AuditEvent;
}

/**
 * Verifies cryptographic integrity of an arbitrary sequence of audit events.
 */
export function verifyCustomAuditChain(events: AuditEvent[], tenantId?: string): AuditChainVerificationResult {
  if (events.length === 0) {
    return {
      isValid: true,
      tenantId,
      totalEvents: 0,
      lastVerifiedHash: GENESIS_HASH
    };
  }

  let expectedPreviousHash: string = GENESIS_HASH;

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];

    // Check pointer integrity
    if (ev.previousEventHash !== expectedPreviousHash) {
      return {
        isValid: false,
        tenantId,
        totalEvents: events.length,
        brokenAtIndex: i,
        brokenEventId: ev.id,
        expectedHash: expectedPreviousHash,
        actualHash: ev.previousEventHash || undefined,
        error: `Chain pointer broken at index ${i}: expected previous hash ${expectedPreviousHash} but found ${ev.previousEventHash}`
      };
    }

    // Recalculate event hash
    const recomputedHash = computeEventHash({
      id: ev.id,
      tenantId: ev.tenantId,
      actorId: ev.actorId,
      timestamp: ev.timestamp,
      eventType: ev.eventType,
      entityType: ev.entityType,
      entityId: ev.entityId,
      beforeHash: ev.beforeHash,
      afterHash: ev.afterHash,
      metadata: ev.metadata,
      correlationId: ev.correlationId,
      previousEventHash: ev.previousEventHash
    });

    if (recomputedHash !== ev.eventHash) {
      return {
        isValid: false,
        tenantId,
        totalEvents: events.length,
        brokenAtIndex: i,
        brokenEventId: ev.id,
        expectedHash: recomputedHash,
        actualHash: ev.eventHash,
        error: `Tamper detected at index ${i} (Event ${ev.id}): event payload altered`
      };
    }

    expectedPreviousHash = ev.eventHash;
  }

  return {
    isValid: true,
    tenantId,
    totalEvents: events.length,
    lastVerifiedHash: expectedPreviousHash
  };
}

/**
 * Verifies cryptographic integrity of the audit chain for a tenant or globally.
 */
export function verifyAuditChain(tenantId?: string): AuditChainVerificationResult {
  const events = tenantId
    ? auditLogStore.filter((e) => e.tenantId === tenantId)
    : [...auditLogStore];

  return verifyCustomAuditChain(events, tenantId);
}

/**
 * Queries the audit log with optional RBAC authorization enforcement and rich filtering.
 */
export function queryAuditLogs(
  options: AuditQueryOptions = {},
  session?: UserSession
): ReadonlyArray<AuditEvent> {
  // If session is provided, enforce security and role verification
  if (session) {
    const targetTenant = options.tenantId || session.tenantId;

    // Check authorization: User must have VIEW_AUDIT_LOGS permission for target tenant
    const hasAuditPerm = hasPermission(session, 'VIEW_AUDIT_LOGS', targetTenant);
    const isAuditorOrAdmin =
      session.role === 'AUDITOR' ||
      session.role === 'TAX_MANAGER' ||
      session.role === 'CLIENT_ADMIN';

    if (!hasAuditPerm && !isAuditorOrAdmin) {
      throw new UnauthorizedAuditAccessError(
        `RBAC Security Error: User '${session.userId}' with role '${session.role}' is not authorized to view audit logs for tenant '${targetTenant}'`
      );
    }

    // Strict multi-tenant isolation
    if (session.tenantId !== targetTenant && !session.assignedEntities?.includes(targetTenant)) {
      throw new UnauthorizedAuditAccessError(
        `Multi-Tenant Isolation Error: User belongs to tenant '${session.tenantId}', cannot access audit logs of tenant '${targetTenant}'`
      );
    }
  }

  let results = [...auditLogStore];

  if (options.tenantId) {
    results = results.filter((e) => e.tenantId === options.tenantId);
  }
  if (options.entityId) {
    results = results.filter((e) => e.entityId === options.entityId);
  }
  if (options.entityType) {
    results = results.filter((e) => e.entityType === options.entityType);
  }
  if (options.eventType) {
    results = results.filter((e) => e.eventType === options.eventType);
  }
  if (options.actorId) {
    results = results.filter((e) => e.actorId === options.actorId);
  }
  if (options.correlationId) {
    results = results.filter((e) => e.correlationId === options.correlationId);
  }
  if (options.startDate) {
    results = results.filter((e) => e.timestamp >= options.startDate!);
  }
  if (options.endDate) {
    results = results.filter((e) => e.timestamp <= options.endDate!);
  }

  if (options.offset !== undefined && options.offset > 0) {
    results = results.slice(options.offset);
  }
  if (options.limit !== undefined && options.limit > 0) {
    results = results.slice(0, options.limit);
  }

  return deepFreeze(results);
}

/**
 * Retrieves full audit log history (backwards-compatible).
 */
export function getAuditLog(): AuditEvent[] {
  return [...auditLogStore];
}

/**
 * Retrieves audit history events for a specific entity ID (backwards-compatible).
 */
export function getAuditHistoryForEntity(entityId: string): AuditEvent[] {
  return auditLogStore.filter(
    (event) =>
      event.entityId === entityId ||
      (event.previousState as { entityId?: string })?.entityId === entityId
  );
}

/**
 * Enforces audit immutability by strictly rejecting edit/delete attempts.
 */
export function updateAuditEvent(): never {
  throw new ImmutableAuditError('Audit Error: Audit records are strictly immutable and cannot be updated');
}

export function deleteAuditEvent(): never {
  throw new ImmutableAuditError('Audit Error: Audit records are strictly immutable and cannot be deleted');
}

// -----------------------------------------------------------------------------
// PHASE 35 SPECIFIC MUTATION AUDIT RECORDERS
// -----------------------------------------------------------------------------

export function recordDocumentUploadAudit(
  tenantId: string,
  actorId: string,
  documentId: string,
  docData: Record<string, unknown>,
  correlationId?: string,
  reason: string = 'Purchase document uploaded'
): Readonly<AuditEvent> {
  return recordAuditEvent({
    tenantId,
    actorId,
    eventType: 'DOCUMENT_UPLOAD',
    entityType: 'DOCUMENT',
    entityId: documentId,
    beforeState: null,
    newState: docData,
    reason,
    correlationId,
    metadata: { fileName: docData.originalFileName, fileSize: docData.fileSize }
  });
}

export function recordOcrProcessingAudit(
  tenantId: string,
  actorId: string,
  documentId: string,
  rawOcrData: Record<string, unknown>,
  correlationId?: string,
  metadata?: Record<string, unknown>
): Readonly<AuditEvent> {
  return recordAuditEvent({
    tenantId,
    actorId,
    eventType: 'DOCUMENT_OCR',
    entityType: 'DOCUMENT',
    entityId: documentId,
    beforeState: null,
    newState: rawOcrData,
    reason: 'OCR document extraction completed',
    correlationId,
    metadata
  });
}

export function recordOcrCorrectionAudit(
  tenantId: string,
  actorId: string,
  documentId: string,
  originalOcr: Record<string, unknown>,
  correctedData: Record<string, unknown>,
  reason: string,
  correlationId?: string
): Readonly<AuditEvent> {
  if (!reason || !reason.trim()) {
    throw new Error('Audit Error: Reason is mandatory for manual OCR corrections');
  }
  return recordAuditEvent({
    tenantId,
    actorId,
    eventType: 'OCR_CORRECTION',
    entityType: 'DOCUMENT',
    entityId: documentId,
    beforeState: originalOcr,
    newState: correctedData,
    reason,
    correlationId
  });
}

export function recordClassificationAudit(
  tenantId: string,
  actorId: string,
  entityId: string,
  classificationData: Record<string, unknown>,
  correlationId?: string,
  isAuto: boolean = true
): Readonly<AuditEvent> {
  return recordAuditEvent({
    tenantId,
    actorId,
    eventType: isAuto ? 'CLASSIFICATION_SUGGESTION' : 'CLASSIFICATION_VALIDATION',
    entityType: 'CLASSIFICATION',
    entityId,
    beforeState: null,
    newState: classificationData,
    reason: isAuto ? 'Automated classification evaluated' : 'Classification validated by accountant',
    correlationId
  });
}

export function recordClassificationOverrideAudit(
  tenantId: string,
  actorId: string,
  entityId: string,
  originalClassification: Record<string, unknown>,
  overrideClassification: Record<string, unknown>,
  reason: string,
  correlationId?: string
): Readonly<AuditEvent> {
  if (!reason || !reason.trim()) {
    throw new Error('Audit Error: Reason is mandatory for classification overrides');
  }
  return recordAuditEvent({
    tenantId,
    actorId,
    eventType: 'CLASSIFICATION_OVERRIDE',
    entityType: 'CLASSIFICATION',
    entityId,
    beforeState: originalClassification,
    newState: overrideClassification,
    reason,
    correlationId
  });
}

export function recordApprovalAudit(
  tenantId: string,
  actorId: string,
  entityType: AuditEntityType,
  entityId: string,
  newApprovalStatus: 'APPROVED' | 'REJECTED' | 'SUBMITTED',
  previousStatus: string | null = null,
  correlationId?: string,
  reason?: string
): Readonly<AuditEvent> {
  let eventType: AuditEventType = 'TRANSACTION_APPROVAL';
  if (newApprovalStatus === 'SUBMITTED') eventType = 'APPROVAL_SUBMIT';
  if (newApprovalStatus === 'APPROVED') eventType = 'APPROVAL_APPROVE';
  if (newApprovalStatus === 'REJECTED') eventType = 'APPROVAL_REJECT';

  return recordAuditEvent({
    tenantId,
    actorId,
    eventType,
    entityType,
    entityId,
    beforeState: previousStatus ? { status: previousStatus } : null,
    newState: { status: newApprovalStatus },
    reason: reason || `Approval state updated to ${newApprovalStatus}`,
    correlationId
  });
}

export function recordJournalPostingAudit(
  tenantId: string,
  actorId: string,
  journalId: string,
  journalData: Record<string, unknown>,
  correlationId?: string,
  reason: string = 'General ledger journal posted'
): Readonly<AuditEvent> {
  return recordAuditEvent({
    tenantId,
    actorId,
    eventType: 'JOURNAL_POSTING',
    entityType: 'JOURNAL',
    entityId: journalId,
    beforeState: null,
    newState: journalData,
    reason,
    correlationId
  });
}

export function recordJournalReversalAudit(
  tenantId: string,
  actorId: string,
  journalId: string,
  reversalJournalData: Record<string, unknown>,
  reason: string,
  correlationId?: string
): Readonly<AuditEvent> {
  if (!reason || !reason.trim()) {
    throw new Error('Audit Error: Reversal reason is mandatory for journal reversals');
  }
  return recordAuditEvent({
    tenantId,
    actorId,
    eventType: 'JOURNAL_REVERSAL',
    entityType: 'JOURNAL',
    entityId: journalId,
    beforeState: { journalId, status: 'POSTED' },
    newState: reversalJournalData,
    reason,
    correlationId
  });
}

export function recordTaxAdjustmentAudit(
  tenantId: string,
  actorId: string,
  adjustmentId: string,
  adjustmentData: Record<string, unknown>,
  correlationId?: string,
  actionType: 'CREATE' | 'APPROVE' = 'CREATE',
  previousData: Record<string, unknown> | null = null,
  reason?: string
): Readonly<AuditEvent> {
  return recordAuditEvent({
    tenantId,
    actorId,
    eventType: actionType === 'APPROVE' ? 'TAX_ADJUSTMENT_APPROVE' : 'TAX_ADJUSTMENT_CREATE',
    entityType: 'TAX_ADJUSTMENT',
    entityId: adjustmentId,
    beforeState: previousData,
    newState: adjustmentData,
    reason: reason || (actionType === 'APPROVE' ? 'Tax adjustment approved' : 'Tax adjustment created'),
    correlationId
  });
}

export function recordTaxCalculationAudit(
  tenantId: string,
  actorId: string,
  calculationId: string,
  calculationResult: Record<string, unknown>,
  correlationId?: string,
  taxYear?: number
): Readonly<AuditEvent> {
  return recordAuditEvent({
    tenantId,
    actorId,
    eventType: 'TAX_CALCULATION',
    entityType: 'TAX_CALCULATION',
    entityId: calculationId,
    beforeState: null,
    newState: calculationResult,
    reason: `Income tax liability calculated for tax year ${taxYear || calculationResult.taxYear || 'current'}`,
    correlationId,
    metadata: { taxYear }
  });
}

export function recordPeriodLockAudit(
  tenantId: string,
  actorId: string,
  entityId: string,
  lockRecord: PeriodLockRecord,
  correlationId?: string,
  isUnlock: boolean = false,
  previousLock: PeriodLockRecord | null = null,
  reason?: string
): Readonly<AuditEvent> {
  return recordAuditEvent({
    tenantId,
    actorId,
    eventType: isUnlock ? 'PERIOD_UNLOCK' : 'PERIOD_LOCK',
    entityType: 'PERIOD_LOCK',
    entityId,
    beforeState: previousLock ? (previousLock as unknown as Record<string, unknown>) : null,
    newState: lockRecord as unknown as Record<string, unknown>,
    reason: reason || (isUnlock ? `Period unlocked up to ${lockRecord.lockDate}` : `Period locked up to ${lockRecord.lockDate}`),
    correlationId
  });
}

export function recordReturnGenerationAudit(
  tenantId: string,
  actorId: string,
  formType: 'MIRA604' | 'MIRA205' | 'MIRA206' | 'MIRA602',
  formId: string,
  returnData: Record<string, unknown>,
  correlationId?: string,
  taxYear?: number
): Readonly<AuditEvent> {
  return recordAuditEvent({
    tenantId,
    actorId,
    eventType: 'RETURN_GENERATION',
    entityType: 'MIRA_RETURN',
    entityId: formId,
    beforeState: null,
    newState: returnData,
    reason: `MIRA return ${formType} generated for review`,
    correlationId,
    metadata: { formType, taxYear }
  });
}

export function recordFilingPackageAudit(
  tenantId: string,
  actorId: string,
  packageId: string,
  manifestData: Record<string, unknown>,
  correlationId?: string,
  taxYear?: number
): Readonly<AuditEvent> {
  return recordAuditEvent({
    tenantId,
    actorId,
    eventType: 'FILING_PACKAGE_GENERATION',
    entityType: 'FILING_PACKAGE',
    entityId: packageId,
    beforeState: null,
    newState: manifestData,
    reason: 'Offline MIRA statutory filing package generated for taxpayer review',
    correlationId,
    metadata: { taxYear, totalFiles: manifestData.totalFiles }
  });
}

// -----------------------------------------------------------------------------
// LEGACY PERIOD LOCK & REVERSAL HELPERS (PRESERVED)
// -----------------------------------------------------------------------------

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

  recordPeriodLockAudit(
    'DEFAULT_TENANT',
    userId,
    entityId,
    lockRecord,
    undefined,
    false,
    existing || null,
    `Accounting period locked up to ${lockDate}`
  );

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

  recordPeriodLockAudit(
    'DEFAULT_TENANT',
    userId,
    entityId,
    unlockedRecord,
    undefined,
    true,
    existing || null,
    `Accounting period reopened up to ${lockDate}: ${reason}`
  );

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
  userIdOrSession: string | UserSession
): ReversalResult {
  if (!transaction || !transaction.transactionId) {
    throw new Error('Validation Error: Valid transaction is required for reversal');
  }

  if (!reason || !reason.trim()) {
    throw new Error('Validation Error: Reversal reason is required for audit trail');
  }

  let actorId = typeof userIdOrSession === 'string' ? userIdOrSession : userIdOrSession.userId;
  let tenantId = typeof userIdOrSession === 'string' ? 'DEFAULT_TENANT' : userIdOrSession.tenantId;

  // If session is provided, enforce RBAC permissions
  if (typeof userIdOrSession !== 'string') {
    const session = userIdOrSession;
    const canReverse =
      hasPermission(session, 'REVERSE_TRANSACTIONS', session.tenantId) ||
      session.role === 'STAFF_ACCOUNTANT' ||
      session.role === 'TAX_MANAGER' ||
      session.role === 'CLIENT_ADMIN';

    if (!canReverse) {
      throw new Error(
        `RBAC Security Error: User '${session.userId}' with role '${session.role}' is not authorized to reverse transactions`
      );
    }
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
        performedBy: actorId,
        action: 'REVERSED',
        details: reason
      }
    ]
  };

  const auditEvent = recordJournalReversalAudit(
    tenantId,
    actorId,
    transaction.transactionId,
    reversalTransaction as unknown as Record<string, unknown>,
    reason
  );

  return {
    originalTransaction: transaction,
    reversalTransaction,
    auditEvent: auditEvent as AuditEvent
  };
}
