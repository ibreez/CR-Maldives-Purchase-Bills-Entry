import { Role, UserSession } from './rbac';

/**
 * Phase 37 — Accounting and Tax Approval Workflow Types & Interfaces
 * In full compliance with Maldives Income Tax Act, MIRA Regulations, and AI Development Rules.
 */

export type WorkflowStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'POSTED';

export type ApprovalRiskCategory =
  | 'CAPITAL_ASSETS'
  | 'BLOCKED_GST'
  | 'NWT'
  | 'TAX_ADJUSTMENTS'
  | 'RELATED_PARTY'
  | 'FOREIGN_CURRENCY_EXCEPTIONS'
  | 'MANUAL_OCR_CORRECTIONS'
  | 'TAX_RETURN_APPROVAL'
  | 'HIGH_VALUE'
  | 'NONE';

export type WorkflowItemType =
  | 'INVOICE'
  | 'TRANSACTION'
  | 'TAX_ADJUSTMENT'
  | 'TAX_RETURN'
  | 'JOURNAL_ENTRY'
  | 'CAPITAL_ASSET';

export type RequiredApprovalRole =
  | 'ACCOUNTANT'
  | 'TAX_REVIEWER'
  | 'FINANCE_MANAGER'
  | 'ADMIN';

export interface ApprovalRiskAssessment {
  riskCategory: ApprovalRiskCategory;
  requiresSpecialistReview: boolean;
  requiredRole: RequiredApprovalRole;
  riskTriggers: string[];
  riskScore: number;
}

export interface ApprovalWorkflowItem {
  id: string;
  tenantId: string;
  itemType: WorkflowItemType;
  itemId: string;
  title: string;
  description?: string;
  amount: number;
  currency: string;
  taxYear?: number;
  status: WorkflowStatus;
  riskAssessment: ApprovalRiskAssessment;
  
  // Actor & Traceability
  submittedBy: string;
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  approvalComments?: string;
  postedJournalId?: string;
  postedAt?: string;

  // Metadata & Context
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowItemInput {
  id?: string;
  tenantId: string;
  itemType: WorkflowItemType;
  itemId: string;
  title: string;
  description?: string;
  amount: number;
  currency?: string;
  taxYear?: number;
  initialStatus?: 'DRAFT' | 'SUBMITTED';
  riskOverrides?: Partial<ApprovalRiskAssessment>;
  metadata?: Record<string, unknown>;
  
  // Domain Attributes for Automated Risk-Assessment
  isCapitalAsset?: boolean;
  isBlockedGst?: boolean;
  isNwtApplicable?: boolean;
  isTaxAdjustment?: boolean;
  isRelatedParty?: boolean;
  isForeignCurrencyException?: boolean;
  hasManualOcrCorrection?: boolean;
  isTaxReturn?: boolean;
  gstRate?: number;
  exchangeRateVariance?: number;
}

export class ApprovalWorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalWorkflowError';
  }
}

export class UnauthorizedApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnauthorizedApprovalError';
  }
}

export class AIApprovalForbiddenError extends Error {
  constructor(message: string = 'The AI model cannot approve or reject accounting transactions or tax returns. Human authorization is strictly mandatory.') {
    super(message);
    this.name = 'AIApprovalForbiddenError';
  }
}

export class RejectedItemPostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RejectedItemPostingError';
  }
}

export class InvalidWorkflowTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidWorkflowTransitionError';
  }
}
