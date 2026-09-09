import crypto from 'crypto';
import {
  AIExtractionMetadata,
  AIExtractionResult,
  AISuggestion,
  AIAnomaly,
  AIFieldOverride,
  AIReviewThresholds,
  DEFAULT_AI_REVIEW_THRESHOLDS,
  DeterministicValidationResult,
  AIPostingForbiddenError,
  AIApprovalForbiddenError,
  AIRateOverrideForbiddenError,
  AITaxLiabilityCalculationForbiddenError,
  AIMandatoryReviewBypassForbiddenError,
  FieldConfidence
} from '../../types/aiGovernance';
import { UserSession, Role } from '../../types/rbac';
import { recordAuditEvent } from '../audit/auditService';

/**
 * Phase 39 — AI Governance Service
 * 
 * Core Invariants:
 * 1. AI extracts and suggests. It is never the tax authority.
 * 2. Deterministic validation overrides probabilistic predictions.
 * 3. Humans alone hold authorization to approve transactions and tax treatments.
 * 4. Accounting postings to the General Ledger require verified human authorization.
 */

export interface CreateAIExtractionInput<T = unknown> {
  documentId: string;
  tenantId: string;
  model: string;
  modelVersion?: string;
  promptVersion?: string;
  rawResponseText: string;
  normalizedOutput: T;
  confidence: FieldConfidence;
  isRetryAttempt?: boolean;
  retryReason?: string;
}

export interface HumanOverrideInput {
  extractionId: string;
  tenantId: string;
  field: string;
  originalAiValue: unknown;
  humanVerifiedValue: unknown;
  reason?: string;
  originalConfidence?: number;
}

export class AIGovernanceService {
  private static extractions: Map<string, AIExtractionResult<any>> = new Map();
  private static suggestions: Map<string, AISuggestion> = new Map();
  private static overrides: Map<string, AIFieldOverride[]> = new Map();
  private static reviewThresholds: AIReviewThresholds = { ...DEFAULT_AI_REVIEW_THRESHOLDS };

  /**
   * Resets internal stores (useful for test isolation).
   */
  public static clearStore(): void {
    this.extractions.clear();
    this.suggestions.clear();
    this.overrides.clear();
    this.reviewThresholds = { ...DEFAULT_AI_REVIEW_THRESHOLDS };
  }

  /**
   * Configure custom review thresholds.
   */
  public static setReviewThresholds(thresholds: Partial<AIReviewThresholds>): void {
    this.reviewThresholds = { ...this.reviewThresholds, ...thresholds };
  }

  public static getReviewThresholds(): AIReviewThresholds {
    return { ...this.reviewThresholds };
  }

  /**
   * Computes a deterministic SHA-256 hash of raw AI output text.
   */
  public static hashRawOutput(rawText: string): string {
    return crypto.createHash('sha256').update(rawText || '', 'utf8').digest('hex');
  }

  // =========================================================================
  // 1. AI EXTRACTION STAGE
  // =========================================================================

  /**
   * Records an immutable AI extraction attempt with cryptographic raw output hash
   * and complete model lineage metadata.
   */
  public static recordAIExtraction<T>(input: CreateAIExtractionInput<T>): AIExtractionResult<T> {
    const rawOutputHash = this.hashRawOutput(input.rawResponseText);
    const extractionId = `EXT-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();

    const metadata: AIExtractionMetadata = {
      extractionId,
      documentId: input.documentId,
      tenantId: input.tenantId,
      model: input.model,
      modelVersion: input.modelVersion || '2026-v1.0',
      promptVersion: input.promptVersion || 'mira-bill-extraction-v3.0',
      timestamp,
      confidence: input.confidence,
      rawOutputHash,
      rawOutputLength: (input.rawResponseText || '').length,
      isRetryAttempt: input.isRetryAttempt,
      retryReason: input.retryReason
    };

    const extraction: AIExtractionResult<T> = {
      metadata,
      normalizedOutput: input.normalizedOutput,
      rawOutput: input.rawResponseText,
      extractedAt: timestamp,
      status: 'EXTRACTED'
    };

    this.extractions.set(extractionId, extraction);
    return extraction;
  }

  public static getExtraction(extractionId: string): AIExtractionResult<any> | null {
    return this.extractions.get(extractionId) || null;
  }

  // =========================================================================
  // 2. AI SUGGESTION & ANOMALY DETECTION STAGE
  // =========================================================================

  /**
   * Analyzes an extracted bill or document to generate intelligent suggestions,
   * detect anomalies, and calculate risk scores against governance thresholds.
   */
  public static generateAISuggestionsAndAssessRisk(
    extraction: AIExtractionResult<any>,
    context?: {
      taxpayerTin?: string;
      isTourismSector?: boolean;
      historicalSupplierCategory?: string;
    }
  ): AISuggestion {
    const data = extraction.normalizedOutput || {};
    const conf = extraction.metadata.confidence || { overall: 85 } as FieldConfidence;
    const anomalies: AIAnomaly[] = [];
    const reviewTriggers: string[] = [];
    let riskScore = 0;

    const thresholds = this.reviewThresholds;

    // 1. Confidence Evaluation
    if (conf.overall < thresholds.minOverallConfidence) {
      anomalies.push({
        type: 'LOW_CONFIDENCE',
        severity: 'HIGH',
        message: `Overall extraction confidence (${conf.overall}%) is below minimum threshold (${thresholds.minOverallConfidence}%).`,
        actualValue: conf.overall,
        expectedValue: thresholds.minOverallConfidence,
        requiresSpecialistReview: false
      });
      reviewTriggers.push('Low overall OCR confidence');
      riskScore += 30;
    }

    const lowConfidenceFields: string[] = [];
    for (const [field, score] of Object.entries(conf)) {
      if (field !== 'overall' && typeof score === 'number' && score < thresholds.minFieldConfidence) {
        lowConfidenceFields.push(`${field} (${score}%)`);
      }
    }
    if (lowConfidenceFields.length > 0) {
      anomalies.push({
        type: 'LOW_CONFIDENCE',
        severity: 'MEDIUM',
        message: `Fields with low confidence: ${lowConfidenceFields.join(', ')}`,
        actualValue: lowConfidenceFields,
        requiresSpecialistReview: false
      });
      reviewTriggers.push(`Low field confidence: ${lowConfidenceFields.join(', ')}`);
      riskScore += 20;
    }

    // 2. Arithmetic Consistency Check
    const taxableValue = Number(data.totals?.taxable_value ?? data.taxable_value ?? 0);
    const gstAmount = Number(data.totals?.gst_amount ?? data.gst_amount ?? 0);
    const roundOff = Number(data.totals?.round_off ?? data.round_off ?? 0);
    const invoiceTotal = Number(data.totals?.invoice_total ?? data.invoice_total ?? 0);

    if (invoiceTotal > 0 && taxableValue > 0) {
      const calculatedTotal = Math.round((taxableValue + gstAmount + roundOff) * 100) / 100;
      const discrepancy = Math.abs(calculatedTotal - invoiceTotal);
      if (discrepancy > 0.05) { // Allow up to 0.05 rounding variance
        anomalies.push({
          type: 'ARITHMETIC_MISMATCH',
          severity: 'HIGH',
          message: `Arithmetic mismatch: Taxable Value (${taxableValue}) + GST (${gstAmount}) + Rounding (${roundOff}) = ${calculatedTotal}, which does not match Invoice Total (${invoiceTotal}). Discrepancy: ${discrepancy.toFixed(2)} MVR.`,
          field: 'totals.invoice_total',
          expectedValue: calculatedTotal,
          actualValue: invoiceTotal,
          requiresSpecialistReview: true
        });
        reviewTriggers.push('Arithmetic calculation mismatch');
        riskScore += 40;
      }
    }

    // 3. High Value Document Check
    if (invoiceTotal >= thresholds.highValueThresholdMVR) {
      anomalies.push({
        type: 'HIGH_VALUE_THRESHOLD',
        severity: 'MEDIUM',
        message: `Invoice total (MVR ${invoiceTotal.toLocaleString()}) exceeds the high-value threshold (MVR ${thresholds.highValueThresholdMVR.toLocaleString()}).`,
        field: 'totals.invoice_total',
        actualValue: invoiceTotal,
        expectedValue: thresholds.highValueThresholdMVR,
        requiresSpecialistReview: true
      });
      reviewTriggers.push(`High value transaction (>= MVR ${thresholds.highValueThresholdMVR.toLocaleString()})`);
      riskScore += 25;
    }

    // 4. Capital Asset / Equipment Classification Check
    const isCapitalAsset = Boolean(
      data.is_capital_asset ||
      data.document_type === 'CAPITAL_EXPENDITURE' ||
      data.mira_schedule1_category === 'Capital Asset (Schedule 2)' ||
      data.accounting_treatment === 'CAPITAL_EXPENDITURE' ||
      data.income_tax_treatment === 'CAPITAL_ALLOWANCE'
    );

    if (isCapitalAsset && thresholds.requireReviewForCapitalAssets) {
      anomalies.push({
        type: 'CAPITAL_ASSET_THRESHOLD',
        severity: 'HIGH',
        message: 'Transaction classified as Capital Asset (Schedule 2) / Capital Allowance. Requires Finance Manager verification for depreciation scheduling.',
        field: 'mira_schedule1_category',
        actualValue: 'Capital Asset (Schedule 2)',
        requiresSpecialistReview: true
      });
      reviewTriggers.push('Capital Asset (Schedule 2) classification');
      riskScore += 35;
    }

    // 5. Blocked Input Tax / Non-Deductible Detection (GST Act Section 21/22)
    const notesLower = String(data.notes || '').toLowerCase();
    const expCatLower = String(data.expense_category || '').toLowerCase();
    const descLower = (data.items || []).map((i: any) => String(i.description || '').toLowerCase()).join(' ');
    const fullText = `${notesLower} ${expCatLower} ${descLower}`;

    const isEntertainment = fullText.includes('entertainment') || fullText.includes('party') || fullText.includes('hospitality');
    const isMotorCar = fullText.includes('passenger car') || fullText.includes('luxury car') || fullText.includes('motor vehicle');
    const isPersonal = fullText.includes('personal') || fullText.includes('private expense') || fullText.includes('owner withdrawal');

    if ((isEntertainment || isMotorCar || isPersonal) && thresholds.requireReviewForNonDeductible) {
      anomalies.push({
        type: 'BLOCKED_INPUT_TAX',
        severity: 'HIGH',
        message: 'Possible blocked input tax under Maldives GST Act Sections 21/22 (entertainment, passenger vehicle, or personal expense). Input tax claim must be reviewed.',
        field: 'income_tax_treatment',
        actualValue: fullText,
        requiresSpecialistReview: true
      });
      reviewTriggers.push('Blocked Input Tax / Non-deductible expense risk');
      riskScore += 35;
    }

    // 6. Non-Resident Withholding Tax (NWT) Triggers (Income Tax Act Section 55)
    const isForeignService = fullText.includes('consulting foreign') || fullText.includes('overseas software') || fullText.includes('management fee foreign') || data.invoice?.currency !== 'MVR';
    if (isForeignService && data.invoice?.currency !== 'MVR' && thresholds.requireReviewForNwt) {
      anomalies.push({
        type: 'FOREIGN_CURRENCY_VARIANCE',
        severity: 'MEDIUM',
        message: `Foreign currency transaction (${data.invoice?.currency || 'Foreign'}). Requires exchange rate verification and Section 55 Non-Resident Withholding Tax (NWT) check.`,
        field: 'invoice.currency',
        actualValue: data.invoice?.currency,
        requiresSpecialistReview: true
      });
      reviewTriggers.push('Foreign currency & NWT evaluation');
      riskScore += 25;
    }

    // 7. Related Party Transaction Risk (Income Tax Act Section 67)
    const isRelatedParty = data.mira_schedule1_category === 'Related Party Expenses' || fullText.includes('related party') || fullText.includes('director payment') || fullText.includes('inter-company');
    if (isRelatedParty && thresholds.requireReviewForRelatedParty) {
      anomalies.push({
        type: 'RELATED_PARTY_RISK',
        severity: 'HIGH',
        message: 'Related-party transaction detected under Income Tax Act Section 67. Requires arm\'s length transfer pricing verification.',
        field: 'mira_schedule1_category',
        actualValue: 'Related Party Expenses',
        requiresSpecialistReview: true
      });
      reviewTriggers.push('Related-party transaction');
      riskScore += 35;
    }

    // 8. Missing Mandatory Tax Invoice Particulars
    if (data.document_type === 'TAX_INVOICE') {
      if (!data.supplier?.gstin) {
        anomalies.push({
          type: 'MISSING_MANDATORY_FIELD',
          severity: 'HIGH',
          message: 'Tax Invoice missing Supplier TIN / GSTIN. Input tax claim is disallowed under GST Act without valid vendor registration.',
          field: 'supplier.gstin',
          requiresSpecialistReview: true
        });
        reviewTriggers.push('Missing Supplier TIN on Tax Invoice');
        riskScore += 30;
      }
      if (!data.invoice?.number) {
        anomalies.push({
          type: 'MISSING_MANDATORY_FIELD',
          severity: 'MEDIUM',
          message: 'Missing Invoice Number.',
          field: 'invoice.number',
          requiresSpecialistReview: false
        });
        reviewTriggers.push('Missing Invoice Number');
        riskScore += 15;
      }
    }

    // 9. Handwritten / Local Market Slip
    if (data.document_type === 'HANDWRITTEN_PURCHASE' && thresholds.requireReviewForHandwritten) {
      anomalies.push({
        type: 'HANDWRITTEN_UNCERTAINTY',
        severity: 'MEDIUM',
        message: 'Handwritten / local market purchase slip. Requires human verification of item description and cash payment amount.',
        field: 'document_type',
        actualValue: 'HANDWRITTEN_PURCHASE',
        requiresSpecialistReview: false
      });
      reviewTriggers.push('Handwritten purchase record');
      riskScore += 20;
    }

    // Calculate capped risk score (0-100)
    riskScore = Math.min(100, Math.max(0, riskScore));
    const requiresHumanReview = riskScore >= 25 || reviewTriggers.length > 0;

    const suggestionId = `SUG-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const suggestion: AISuggestion = {
      suggestionId,
      extractionId: extraction.metadata.extractionId,
      tenantId: extraction.metadata.tenantId,
      suggestedSchedule1Category: data.mira_schedule1_category,
      suggestedAccountingTreatment: data.accounting_treatment,
      suggestedIncomeTaxTreatment: data.income_tax_treatment,
      suggestedGstTreatment: data.tax_status === 'NO_TAX' ? 'NO_INPUT_TAX' : (data.tax_status === 'TAX_CHARGED' ? 'CLAIMABLE_INPUT_TAX' : 'UNKNOWN'),
      confidenceScore: conf.overall,
      anomaliesDetected: anomalies,
      riskScore,
      requiresHumanReview,
      reviewTriggers,
      suggestedAt: new Date().toISOString()
    };

    this.suggestions.set(extraction.metadata.extractionId, suggestion);
    return suggestion;
  }

  // =========================================================================
  // 3. DETERMINISTIC VALIDATION STAGE
  // =========================================================================

  /**
   * Executes deterministic statutory validation.
   * Hard Rule: AI suggestions CANNOT change or override statutory tax rates.
   */
  public static performDeterministicValidation(
    data: any,
    options: {
      effectiveDate?: string;
      isTourism?: boolean;
    } = {}
  ): DeterministicValidationResult {
    const issues: Array<{ code: string; message: string; field?: string; isBlocker: boolean }> = [];
    const isTourism = options.isTourism || false;
    
    // Statutory Maldives Rates: General = 8%, Tourism = 16% (post 2023)
    const statutoryRate = isTourism ? 16 : 8;

    const gstRateProvided = data.invoice?.gst_rate ?? (data.tax_status === 'NO_TAX' ? 0 : statutoryRate);

    // Hard Invariant Check: Did AI try to invent an illegal rate (e.g. 5%, 10%, 12%)?
    if (data.tax_status === 'TAX_CHARGED' && gstRateProvided !== 0 && gstRateProvided !== statutoryRate) {
      issues.push({
        code: 'INVALID_STATUTORY_RATE',
        message: `Illegal tax rate ${gstRateProvided}% detected. For this transaction type, the statutory rate is strictly ${statutoryRate}%. AI cannot alter statutory rates.`,
        field: 'invoice.gst_rate',
        isBlocker: true
      });
    }

    const taxableValue = Number(data.totals?.taxable_value ?? data.taxable_value ?? 0);
    const gstAmount = Number(data.totals?.gst_amount ?? data.gst_amount ?? 0);
    const invoiceTotal = Number(data.totals?.invoice_total ?? data.invoice_total ?? 0);
    const roundOff = Number(data.totals?.round_off ?? data.round_off ?? 0);

    // Deterministic arithmetic validation
    if (taxableValue < 0 || gstAmount < 0 || invoiceTotal < 0) {
      issues.push({
        code: 'NEGATIVE_AMOUNT',
        message: 'Monetary amounts cannot be negative on purchase bills.',
        isBlocker: true
      });
    }

    if (invoiceTotal > 0 && taxableValue > 0) {
      const computedTotal = Math.round((taxableValue + gstAmount + roundOff) * 100) / 100;
      if (Math.abs(computedTotal - invoiceTotal) > 0.05) {
        issues.push({
          code: 'ARITHMETIC_TOTAL_MISMATCH',
          message: `Computed total (${computedTotal}) does not match declared total (${invoiceTotal}).`,
          field: 'totals.invoice_total',
          isBlocker: true
        });
      }
    }

    // Expected statutory tax calculation
    const expectedGst = data.tax_status === 'NO_TAX' ? 0 : Math.round(taxableValue * (statutoryRate / 100) * 100) / 100;

    return {
      isValid: issues.filter((i) => i.isBlocker).length === 0,
      issues,
      statutoryGstRateEnforced: statutoryRate,
      statutoryTaxLiability: expectedGst,
      validatedAt: new Date().toISOString()
    };
  }

  // =========================================================================
  // 4. HUMAN OVERRIDE & CORRECTION AUDITING
  // =========================================================================

  /**
   * Records a verified human correction or override of an AI-extracted field.
   * Emits an immutable, cryptographic audit log event.
   */
  public static recordHumanOverride(
    input: HumanOverrideInput,
    session: UserSession
  ): AIFieldOverride {
    if (!session || !session.userId) {
      throw new Error('User session is required to perform human override.');
    }

    // Verify actor is not an AI bot attempting to simulate human override
    if ((session as any).isAI || session.userId.toLowerCase().includes('bot') || session.userId.toLowerCase().includes('gemini')) {
      throw new AIApprovalForbiddenError('AI agents cannot perform human overrides. Verified human authorization is required.');
    }

    const extraction = this.extractions.get(input.extractionId);
    if (!extraction) {
      throw new Error(`Extraction with ID ${input.extractionId} not found.`);
    }

    const overrideId = `OVR-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const timestamp = new Date().toISOString();

    // Create immutable audit event
    const auditEvent = recordAuditEvent({
      tenantId: input.tenantId,
      actorId: session.userId,
      eventType: 'OCR_CORRECTION',
      action: 'OCR_CORRECTION',
      entityType: 'DOCUMENT',
      entityId: input.extractionId,
      beforeState: { field: input.field, value: input.originalAiValue, confidence: input.originalConfidence },
      newState: { field: input.field, value: input.humanVerifiedValue, reason: input.reason },
      metadata: {
        overrideId,
        extractionId: input.extractionId,
        overriddenByRole: session.role,
        reason: input.reason || 'Manual human verification and correction of AI extraction'
      },
      reason: input.reason || 'Human correction of OCR extraction'
    }, session);

    const overrideRecord: AIFieldOverride = {
      id: overrideId,
      extractionId: input.extractionId,
      tenantId: input.tenantId,
      field: input.field,
      originalAiValue: input.originalAiValue,
      originalConfidence: input.originalConfidence,
      humanVerifiedValue: input.humanVerifiedValue,
      overriddenBy: session.userId,
      userRole: session.role,
      overriddenAt: timestamp,
      reason: input.reason,
      auditEventId: auditEvent.id
    };

    // Store override
    const existing = this.overrides.get(input.extractionId) || [];
    existing.push(overrideRecord);
    this.overrides.set(input.extractionId, existing);

    // Update extraction status
    extraction.status = 'OVERRIDDEN';

    // Apply correction to normalized output in memory
    const keys = input.field.split('.');
    let target: any = extraction.normalizedOutput;
    for (let i = 0; i < keys.length - 1; i++) {
      if (target[keys[i]] === undefined || target[keys[i]] === null) {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = input.humanVerifiedValue;

    return overrideRecord;
  }

  public static getOverridesForExtraction(extractionId: string): AIFieldOverride[] {
    return this.overrides.get(extractionId) || [];
  }

  // =========================================================================
  // 5. HUMAN APPROVAL & GOVERNANCE INVARIANTS
  // =========================================================================

  /**
   * Approves an AI extraction after human verification.
   * Safety Invariant: AI is STRICTLY FORBIDDEN from approving.
   */
  public static approveExtraction(
    extractionId: string,
    session: UserSession,
    comments?: string
  ): { status: 'ACCEPTED'; approvedBy: string; approvedAt: string; auditEventId: string } {
    // 1. Invariant: AI cannot approve
    if ((session as any)?.isAI || session.userId.toLowerCase().includes('gemini') || session.userId.toLowerCase().includes('ai-agent') || session.userId.toLowerCase().includes('bot')) {
      throw new AIApprovalForbiddenError('The AI model cannot approve transactions. Human authorization is strictly mandatory.');
    }

    const extraction = this.extractions.get(extractionId);
    if (!extraction) {
      throw new Error(`Extraction with ID ${extractionId} not found.`);
    }

    const suggestion = this.suggestions.get(extractionId);
    if (suggestion && suggestion.requiresHumanReview) {
      // If critical blockers exist, verify reviewer has adequate clearance
      const isHighRole = session.role === 'FINANCE_MANAGER' || session.role === 'TAX_REVIEWER' || session.role === 'ADMIN' || session.role === 'TAX_MANAGER' || session.role === 'CLIENT_ADMIN' || (session.role as string) === 'super_admin';
      const hasCriticalAnomaly = suggestion.anomaliesDetected.some((a) => a.severity === 'CRITICAL' || a.requiresSpecialistReview);
      
      if (hasCriticalAnomaly && !isHighRole) {
        throw new AIMandatoryReviewBypassForbiddenError('This extraction contains high-risk/critical tax anomalies and requires approval by a Tax Reviewer or Finance Manager.');
      }
    }

    const timestamp = new Date().toISOString();
    extraction.status = 'ACCEPTED';

    const auditEvent = recordAuditEvent({
      tenantId: extraction.metadata.tenantId,
      actorId: session.userId,
      eventType: 'TRANSACTION_APPROVAL',
      action: 'APPROVAL_APPROVE',
      entityType: 'DOCUMENT',
      entityId: extractionId,
      newState: { status: 'ACCEPTED', comments },
      metadata: {
        comments,
        reviewerRole: session.role,
        overridesCount: (this.overrides.get(extractionId) || []).length
      },
      reason: comments || 'Human verification and approval of document extraction'
    }, session);

    return {
      status: 'ACCEPTED',
      approvedBy: session.userId,
      approvedAt: timestamp,
      auditEventId: auditEvent.id
    };
  }

  // =========================================================================
  // 6. GENERAL LEDGER POSTING & TAX LIABILITY INVARIANTS
  // =========================================================================

  /**
   * Validates posting eligibility to the General Ledger.
   * Safety Invariant: AI CANNOT DIRECTLY POST TO THE GENERAL LEDGER.
   */
  public static validatePostingEligibility(
    extractionId: string,
    session: UserSession
  ): { isEligible: boolean; documentId: string; tenantId: string } {
    // 1. Invariant: AI cannot post
    if (!session || (session as any).isAI || session.userId.toLowerCase().includes('gemini') || session.userId.toLowerCase().includes('bot')) {
      throw new AIPostingForbiddenError('AI models and automated OCR services cannot directly post journal entries. Human posting authorization is required.');
    }

    const extraction = this.extractions.get(extractionId);
    if (!extraction) {
      throw new Error(`Extraction with ID ${extractionId} not found.`);
    }

    // 2. Invariant: Unapproved extractions cannot post to GL
    if (extraction.status !== 'ACCEPTED') {
      throw new AIMandatoryReviewBypassForbiddenError(`Extraction ${extractionId} must be approved (ACCEPTED) before it can be posted to the General Ledger. Current status: ${extraction.status}.`);
    }

    return {
      isEligible: true,
      documentId: extraction.metadata.documentId,
      tenantId: extraction.metadata.tenantId
    };
  }

  /**
   * Validates final tax liability calculation.
   * Safety Invariant: AI cannot directly determine legal tax liability without deterministic calculation and human sign-off.
   */
  public static validateTaxLiabilityCalculation(
    calculatedLiability: number,
    session: UserSession,
    isCalculatedByDeterministicEngine: boolean
  ): boolean {
    if (!isCalculatedByDeterministicEngine) {
      throw new AITaxLiabilityCalculationForbiddenError('Tax liability must be calculated deterministically using Maldives statutory rates and formulas. Direct AI generation of tax liability is forbidden.');
    }

    if (!session || (session as any).isAI || session.userId.toLowerCase().includes('gemini') || session.userId.toLowerCase().includes('bot')) {
      throw new AITaxLiabilityCalculationForbiddenError('AI models cannot certify final legal tax liability. Human review is strictly mandatory.');
    }

    return true;
  }

  /**
   * Asserts that statutory tax rates cannot be altered by AI prompts.
   */
  public static assertStatutoryRateIntegrity(requestedRate: number, statutoryRate: number): void {
    if (requestedRate !== statutoryRate) {
      throw new AIRateOverrideForbiddenError(`AI model or caller requested tax rate ${requestedRate}%, which differs from Maldives statutory rate ${statutoryRate}%. AI cannot alter statutory rates.`);
    }
  }
}
