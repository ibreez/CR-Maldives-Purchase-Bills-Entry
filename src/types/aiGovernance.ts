/**
 * Phase 39 — AI Governance Types & Interfaces
 * In strict compliance with Maldives Tax Acts, MIRA Regulations, and AI Development Rules.
 * 
 * Core Principle: AI extracts and suggests. Deterministic rules validate. Humans approve. Accounting posts.
 */

import { Role } from './rbac';

export type AIModelIdentifier = 'gemini-3.6-flash' | 'gemini-3.6-pro' | 'gemini-3.7-flash' | 'gemini-1.5-pro' | string;

export interface FieldConfidence {
  supplier_name?: number;
  supplier_tin?: number;
  invoice_number?: number;
  invoice_date?: number;
  taxable_value?: number;
  gst_amount?: number;
  invoice_total?: number;
  line_items?: number;
  overall: number;
}

export type AIAnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type AIAnomalyType =
  | 'ARITHMETIC_MISMATCH'
  | 'TAX_RATE_ANOMALY'
  | 'HIGH_VALUE_THRESHOLD'
  | 'BLOCKED_INPUT_TAX'
  | 'CAPITAL_ASSET_THRESHOLD'
  | 'RELATED_PARTY_RISK'
  | 'FOREIGN_CURRENCY_VARIANCE'
  | 'LOW_CONFIDENCE'
  | 'MISSING_MANDATORY_FIELD'
  | 'HANDWRITTEN_UNCERTAINTY'
  | 'DUPLICATE_SUSPECT'
  | 'INVALID_TIN_FORMAT';

export interface AIAnomaly {
  type: AIAnomalyType;
  severity: AIAnomalySeverity;
  message: string;
  field?: string;
  expectedValue?: unknown;
  actualValue?: unknown;
  requiresSpecialistReview: boolean;
}

export interface AIExtractionMetadata {
  extractionId: string;
  documentId: string;
  tenantId: string;
  model: AIModelIdentifier;
  modelVersion: string;
  promptVersion: string;
  timestamp: string;
  confidence: FieldConfidence;
  rawOutputHash: string; // SHA-256 hash of raw JSON / text returned by the model
  rawOutputLength: number;
  isRetryAttempt?: boolean;
  retryReason?: string;
}

export interface AIExtractionResult<T = unknown> {
  metadata: AIExtractionMetadata;
  normalizedOutput: T;
  rawOutput?: string;
  extractedAt: string;
  status: 'EXTRACTED' | 'FAILED' | 'OVERRIDDEN' | 'ACCEPTED';
}

export interface AISuggestion {
  suggestionId: string;
  extractionId: string;
  tenantId: string;
  suggestedSchedule1Category?: string;
  suggestedAccountingTreatment?: string;
  suggestedIncomeTaxTreatment?: string;
  suggestedGstTreatment?: string;
  confidenceScore: number;
  anomaliesDetected: AIAnomaly[];
  riskScore: number; // 0 to 100
  requiresHumanReview: boolean;
  reviewTriggers: string[];
  suggestedAt: string;
}

export interface AIReviewThresholds {
  minOverallConfidence: number; // e.g. 85
  minFieldConfidence: number; // e.g. 80
  highValueThresholdMVR: number; // e.g. 10,000 MVR
  requireReviewForCapitalAssets: boolean; // default true
  requireReviewForNonDeductible: boolean; // default true
  requireReviewForNwt: boolean; // default true
  requireReviewForRelatedParty: boolean; // default true
  requireReviewForHandwritten: boolean; // default true
}

export const DEFAULT_AI_REVIEW_THRESHOLDS: AIReviewThresholds = {
  minOverallConfidence: 85,
  minFieldConfidence: 80,
  highValueThresholdMVR: 10000,
  requireReviewForCapitalAssets: true,
  requireReviewForNonDeductible: true,
  requireReviewForNwt: true,
  requireReviewForRelatedParty: true,
  requireReviewForHandwritten: true
};

export interface AIFieldOverride {
  id: string;
  extractionId: string;
  tenantId: string;
  field: string;
  originalAiValue: unknown;
  originalConfidence?: number;
  humanVerifiedValue: unknown;
  overriddenBy: string; // User ID
  userRole: Role | string;
  overriddenAt: string;
  reason?: string;
  auditEventId?: string;
}

export interface HumanReviewResult {
  reviewId: string;
  extractionId: string;
  tenantId: string;
  reviewerId: string;
  reviewerRole: Role | string;
  reviewStatus: 'APPROVED' | 'REJECTED' | 'CORRECTED_AND_APPROVED';
  overridesApplied: AIFieldOverride[];
  comments?: string;
  reviewedAt: string;
}

export interface DeterministicValidationResult {
  isValid: boolean;
  issues: Array<{
    code: string;
    message: string;
    field?: string;
    isBlocker: boolean;
  }>;
  statutoryGstRateEnforced?: number;
  statutoryTaxLiability?: number;
  validatedAt: string;
}

// ---------------------------------------------------------------------------
// GOVERNANCE ERROR CLASSES (STRICT SAFETY INVARIANTS)
// ---------------------------------------------------------------------------

export class AIPostingForbiddenError extends Error {
  constructor(message: string = 'AI models and automated OCR services are strictly forbidden from directly posting journal entries or altering the General Ledger. Human authorization is mandatory.') {
    super(message);
    this.name = 'AIPostingForbiddenError';
  }
}

export class AIApprovalForbiddenError extends Error {
  constructor(message: string = 'AI models are probabilistic assistants and cannot approve accounting transactions, tax returns, or compliance filings. A verified human actor must approve.') {
    super(message);
    this.name = 'AIApprovalForbiddenError';
  }
}

export class AIRateOverrideForbiddenError extends Error {
  constructor(message: string = 'AI suggestions cannot alter or override statutory tax rates defined by Maldives Tax Acts (GST Act 8% / 16%). Deterministic statutory rates prevail.') {
    super(message);
    this.name = 'AIRateOverrideForbiddenError';
  }
}

export class AITaxLiabilityCalculationForbiddenError extends Error {
  constructor(message: string = 'AI models cannot directly determine or file final legal tax liability. Tax liabilities must be calculated deterministically and certified by a human reviewer.') {
    super(message);
    this.name = 'AITaxLiabilityCalculationForbiddenError';
  }
}

export class AIMandatoryReviewBypassForbiddenError extends Error {
  constructor(message: string = 'Transactions flagged for mandatory review (low confidence, high value, capital asset, or blocked GST) cannot bypass human review.') {
    super(message);
    this.name = 'AIMandatoryReviewBypassForbiddenError';
  }
}
