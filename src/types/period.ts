import { UserSession } from './rbac';
import { AuditEvent } from './audit';

/**
 * Phase 36 Period Control Lifecycle States:
 * - OPEN: Normal posting and editing allowed.
 * - REVIEW: Controlled changes; flagged for review/reconciliation.
 * - APPROVED: Only authorized amendments/finalizations allowed.
 * - LOCKED: Strictly no normal modifications, postings, edits, or deletes.
 * - AMENDED: Active controlled amendment workflow with linked reversals/audit.
 */
export type PeriodStatus = 'OPEN' | 'REVIEW' | 'APPROVED' | 'LOCKED' | 'AMENDED';

/**
 * Authoritative Period Control Record
 */
export interface PeriodControlRecord {
  periodId: string;
  tenantId: string;
  periodName: string;
  startDate: string;             // YYYY-MM-DD
  endDate: string;               // YYYY-MM-DD
  status: PeriodStatus;
  isClosed: boolean;             // True if LOCKED or APPROVED
  lockedBy?: string;
  lockedAt?: string;             // ISO-8601 UTC
  approvedBy?: string;
  approvedAt?: string;           // ISO-8601 UTC
  reviewedBy?: string;
  reviewedAt?: string;           // ISO-8601 UTC
  amendedBy?: string;
  amendedAt?: string;            // ISO-8601 UTC
  amendmentReason?: string;
  amendmentCount: number;
  createdAt: string;             // ISO-8601 UTC
  updatedAt: string;             // ISO-8601 UTC
}

/**
 * Period State Transition Request
 */
export interface PeriodTransitionRequest {
  tenantId: string;
  periodId: string;
  targetStatus: PeriodStatus;
  reason?: string;
  session: UserSession;
  correlationId?: string;
}

/**
 * Period Amendment Request
 */
export interface PeriodAmendmentRequest {
  tenantId: string;
  periodId: string;
  reason: string;
  session: UserSession;
  targetTransactions?: string[];
  correlationId?: string;
}

/**
 * Result of initiating a period amendment
 */
export interface PeriodAmendmentResult {
  periodId: string;
  previousStatus: PeriodStatus;
  newStatus: PeriodStatus;
  amendmentId: string;
  amendedAt: string;
  amendedBy: string;
  reason: string;
  auditEvent: AuditEvent;
}

/**
 * Error thrown when an operation attempts to mutate or post to a locked period
 */
export class LockedPeriodMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LockedPeriodMutationError';
  }
}

/**
 * Error thrown when an invalid period state transition is attempted
 */
export class PeriodStateTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PeriodStateTransitionError';
  }
}

/**
 * Error thrown when a user attempts a period control action without requisite permissions
 */
export class UnauthorizedPeriodActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedPeriodActionError';
  }
}

/**
 * Error thrown when a requested period is not found
 */
export class PeriodNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PeriodNotFoundError';
  }
}
