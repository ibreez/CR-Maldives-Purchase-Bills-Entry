import { describe, it, expect, beforeEach } from 'vitest';
import {
  AIGovernanceService,
  AIPostingForbiddenError,
  AIApprovalForbiddenError,
  AIRateOverrideForbiddenError,
  AITaxLiabilityCalculationForbiddenError,
  AIMandatoryReviewBypassForbiddenError
} from '../../src/services/ai';
import { UserSession } from '../../src/types/rbac';
import { resetAuditStore, queryAuditLogs, verifyAuditChain } from '../../src/services/audit/auditService';

describe('Phase 39: AI Governance Framework & Invariants', () => {
  const mockHumanSession: UserSession = {
    userId: 'usr-tax-accountant-001',
    tenantId: 'TENANT-MLE-01',
    role: 'ACCOUNTANT'
  };

  const mockTaxReviewerSession: UserSession = {
    userId: 'usr-senior-reviewer-002',
    tenantId: 'TENANT-MLE-01',
    role: 'TAX_REVIEWER'
  };

  const mockFinanceManagerSession: UserSession = {
    userId: 'usr-finance-mgr-003',
    tenantId: 'TENANT-MLE-01',
    role: 'FINANCE_MANAGER'
  };

  const mockAISession: UserSession = {
    userId: 'gemini-3.6-flash-agent',
    tenantId: 'TENANT-MLE-01',
    role: 'ACCOUNTANT',
    // Flagged as AI agent
    ...({ isAI: true } as any)
  };

  beforeEach(() => {
    AIGovernanceService.clearStore();
    resetAuditStore();
  });

  describe('1. AI Extraction Lineage & Cryptographic Integrity', () => {
    it('records full model lineage, prompt version, field confidences, and SHA-256 hash of raw output', () => {
      const rawText = JSON.stringify({
        supplier: { name: 'State Trading Organization PLC', gstin: '1000014GST001' },
        invoice: { number: 'INV-2026-8891', date: '15 Aug 2026', currency: 'MVR' },
        totals: { taxable_value: 10000, gst_amount: 800, invoice_total: 10800 }
      });

      const extraction = AIGovernanceService.recordAIExtraction({
        documentId: 'doc-bill-001',
        tenantId: 'TENANT-MLE-01',
        model: 'gemini-3.6-flash',
        modelVersion: '2026-v1.0',
        promptVersion: 'mira-bill-extraction-v3.0',
        rawResponseText: rawText,
        normalizedOutput: JSON.parse(rawText),
        confidence: {
          supplier_name: 98,
          supplier_tin: 96,
          invoice_number: 95,
          invoice_date: 92,
          taxable_value: 99,
          gst_amount: 99,
          invoice_total: 99,
          line_items: 90,
          overall: 96
        }
      });

      expect(extraction.metadata.extractionId).toMatch(/^EXT-/);
      expect(extraction.metadata.model).toBe('gemini-3.6-flash');
      expect(extraction.metadata.promptVersion).toBe('mira-bill-extraction-v3.0');
      expect(extraction.metadata.rawOutputHash).toBeDefined();
      expect(extraction.metadata.rawOutputHash.length).toBe(64); // SHA-256 hex string
      expect(extraction.metadata.rawOutputHash).toBe(AIGovernanceService.hashRawOutput(rawText));
      expect(extraction.status).toBe('EXTRACTED');
    });
  });

  describe('2. Invariant: AI Cannot Post to General Ledger', () => {
    it('throws AIPostingForbiddenError when an AI agent attempts to post directly to General Ledger', () => {
      const extraction = AIGovernanceService.recordAIExtraction({
        documentId: 'doc-bill-002',
        tenantId: 'TENANT-MLE-01',
        model: 'gemini-3.6-flash',
        rawResponseText: '{}',
        normalizedOutput: { totals: { invoice_total: 500 } },
        confidence: { supplier_name: 90, supplier_tin: 90, invoice_number: 90, invoice_date: 90, taxable_value: 90, gst_amount: 90, invoice_total: 90, line_items: 90, overall: 90 }
      });

      expect(() => {
        AIGovernanceService.validatePostingEligibility(extraction.metadata.extractionId, mockAISession);
      }).toThrow(AIPostingForbiddenError);
    });

    it('throws AIMandatoryReviewBypassForbiddenError if an extraction has unreviewed triggers and is not accepted', () => {
      const extraction = AIGovernanceService.recordAIExtraction({
        documentId: 'doc-bill-003',
        tenantId: 'TENANT-MLE-01',
        model: 'gemini-3.6-flash',
        rawResponseText: '{}',
        normalizedOutput: {
          document_type: 'TAX_INVOICE',
          totals: { taxable_value: 50000, gst_amount: 4000, invoice_total: 54000 },
          is_capital_asset: true
        },
        confidence: { supplier_name: 90, supplier_tin: 90, invoice_number: 90, invoice_date: 90, taxable_value: 90, gst_amount: 90, invoice_total: 90, line_items: 90, overall: 90 }
      });

      AIGovernanceService.generateAISuggestionsAndAssessRisk(extraction);

      // Human accountant attempts to post before reviewing and approving
      expect(() => {
        AIGovernanceService.validatePostingEligibility(extraction.metadata.extractionId, mockHumanSession);
      }).toThrow(AIMandatoryReviewBypassForbiddenError);
    });

    it('allows posting when verified and approved by a qualified human reviewer', () => {
      const extraction = AIGovernanceService.recordAIExtraction({
        documentId: 'doc-bill-004',
        tenantId: 'TENANT-MLE-01',
        model: 'gemini-3.6-flash',
        rawResponseText: '{}',
        normalizedOutput: {
          document_type: 'TAX_INVOICE',
          totals: { taxable_value: 5000, gst_amount: 400, invoice_total: 5400 }
        },
        confidence: { supplier_name: 95, supplier_tin: 95, invoice_number: 95, invoice_date: 95, taxable_value: 95, gst_amount: 95, invoice_total: 95, line_items: 95, overall: 95 }
      });

      // Human approves
      AIGovernanceService.approveExtraction(extraction.metadata.extractionId, mockHumanSession, 'Approved for standard stationery purchase');

      const postingCheck = AIGovernanceService.validatePostingEligibility(extraction.metadata.extractionId, mockHumanSession);
      expect(postingCheck.isEligible).toBe(true);
      expect(postingCheck.documentId).toBe('doc-bill-004');
    });
  });

  describe('3. Invariant: AI Cannot Alter Statutory Tax Rules or Rates', () => {
    it('rejects illegal tax rates invented or suggested by AI', () => {
      const dataWithIllegalRate = {
        tax_status: 'TAX_CHARGED',
        invoice: { gst_rate: 12 }, // Illegal rate in Maldives
        totals: { taxable_value: 1000, gst_amount: 120, invoice_total: 1120 }
      };

      const result = AIGovernanceService.performDeterministicValidation(dataWithIllegalRate);
      expect(result.isValid).toBe(false);
      expect(result.issues.some((i) => i.code === 'INVALID_STATUTORY_RATE')).toBe(true);
      expect(result.statutoryGstRateEnforced).toBe(8); // General statutory rate enforced
    });

    it('throws AIRateOverrideForbiddenError if an AI attempts to alter Maldives statutory rate integrity', () => {
      expect(() => {
        AIGovernanceService.assertStatutoryRateIntegrity(10, 8); // Prompt claimed 10%
      }).toThrow(AIRateOverrideForbiddenError);
    });

    it('enforces 16% for Tourism sector and 8% for General sector deterministically', () => {
      const generalData = { tax_status: 'TAX_CHARGED', totals: { taxable_value: 1000, gst_amount: 80, invoice_total: 1080 } };
      const tourismData = { tax_status: 'TAX_CHARGED', totals: { taxable_value: 1000, gst_amount: 160, invoice_total: 1160 } };

      const genVal = AIGovernanceService.performDeterministicValidation(generalData, { isTourism: false });
      expect(genVal.statutoryGstRateEnforced).toBe(8);
      expect(genVal.statutoryTaxLiability).toBe(80);
      expect(genVal.isValid).toBe(true);

      const tourVal = AIGovernanceService.performDeterministicValidation(tourismData, { isTourism: true });
      expect(tourVal.statutoryGstRateEnforced).toBe(16);
      expect(tourVal.statutoryTaxLiability).toBe(160);
      expect(tourVal.isValid).toBe(true);
    });
  });

  describe('4. Invariant: AI Cannot Approve Transactions or Tax Returns', () => {
    it('throws AIApprovalForbiddenError if an AI agent attempts to approve an extraction', () => {
      const extraction = AIGovernanceService.recordAIExtraction({
        documentId: 'doc-bill-005',
        tenantId: 'TENANT-MLE-01',
        model: 'gemini-3.6-flash',
        rawResponseText: '{}',
        normalizedOutput: { totals: { invoice_total: 500 } },
        confidence: { supplier_name: 90, supplier_tin: 90, invoice_number: 90, invoice_date: 90, taxable_value: 90, gst_amount: 90, invoice_total: 90, line_items: 90, overall: 90 }
      });

      expect(() => {
        AIGovernanceService.approveExtraction(extraction.metadata.extractionId, mockAISession);
      }).toThrow(AIApprovalForbiddenError);
    });

    it('requires Tax Reviewer or Finance Manager role for high-risk / specialist review items', () => {
      const extraction = AIGovernanceService.recordAIExtraction({
        documentId: 'doc-bill-006',
        tenantId: 'TENANT-MLE-01',
        model: 'gemini-3.6-flash',
        rawResponseText: '{}',
        normalizedOutput: {
          document_type: 'TAX_INVOICE',
          expense_category: 'Equipment',
          is_capital_asset: true,
          mira_schedule1_category: 'Capital Asset (Schedule 2)',
          totals: { taxable_value: 85000, gst_amount: 6800, invoice_total: 91800 }
        },
        confidence: { supplier_name: 95, supplier_tin: 95, invoice_number: 95, invoice_date: 95, taxable_value: 95, gst_amount: 95, invoice_total: 95, line_items: 95, overall: 95 }
      });

      AIGovernanceService.generateAISuggestionsAndAssessRisk(extraction);

      // Standard accountant cannot sign off high-risk capital asset alone
      const basicAccountantSession: UserSession = {
        userId: 'usr-basic-clerk',
        tenantId: 'TENANT-MLE-01',
        role: 'DATA_ENTRY'
      };

      expect(() => {
        AIGovernanceService.approveExtraction(extraction.metadata.extractionId, basicAccountantSession);
      }).toThrow(AIMandatoryReviewBypassForbiddenError);

      // Tax Reviewer or Finance Manager can approve
      const approved = AIGovernanceService.approveExtraction(
        extraction.metadata.extractionId,
        mockTaxReviewerSession,
        'Verified capital asset classification and Schedule 2 depreciation schedule'
      );

      expect(approved.status).toBe('ACCEPTED');
      expect(approved.approvedBy).toBe('usr-senior-reviewer-002');
    });
  });

  describe('5. Risk Assessment & Low Confidence / Mandatory Review Triggers', () => {
    it('flags review required when overall confidence is below 85%', () => {
      const extraction = AIGovernanceService.recordAIExtraction({
        documentId: 'doc-bill-007',
        tenantId: 'TENANT-MLE-01',
        model: 'gemini-3.6-flash',
        rawResponseText: '{}',
        normalizedOutput: { totals: { invoice_total: 250 } },
        confidence: { supplier_name: 80, supplier_tin: 75, invoice_number: 70, invoice_date: 80, taxable_value: 80, gst_amount: 80, invoice_total: 80, line_items: 70, overall: 76 }
      });

      const suggestion = AIGovernanceService.generateAISuggestionsAndAssessRisk(extraction);
      expect(suggestion.requiresHumanReview).toBe(true);
      expect(suggestion.anomaliesDetected.some((a) => a.type === 'LOW_CONFIDENCE')).toBe(true);
      expect(suggestion.reviewTriggers).toContain('Low overall OCR confidence');
    });

    it('flags review required when individual critical fields have low confidence', () => {
      const extraction = AIGovernanceService.recordAIExtraction({
        documentId: 'doc-bill-008',
        tenantId: 'TENANT-MLE-01',
        model: 'gemini-3.6-flash',
        rawResponseText: '{}',
        normalizedOutput: { totals: { invoice_total: 250 } },
        confidence: { supplier_name: 95, supplier_tin: 65, invoice_number: 95, invoice_date: 95, taxable_value: 95, gst_amount: 95, invoice_total: 95, line_items: 95, overall: 89 }
      });

      const suggestion = AIGovernanceService.generateAISuggestionsAndAssessRisk(extraction);
      expect(suggestion.requiresHumanReview).toBe(true);
      expect(suggestion.anomaliesDetected.some((a) => a.type === 'LOW_CONFIDENCE')).toBe(true);
    });

    it('detects arithmetic calculation mismatch anomalies', () => {
      const extraction = AIGovernanceService.recordAIExtraction({
        documentId: 'doc-bill-009',
        tenantId: 'TENANT-MLE-01',
        model: 'gemini-3.6-flash',
        rawResponseText: '{}',
        normalizedOutput: {
          totals: {
            taxable_value: 1000,
            gst_amount: 80,
            invoice_total: 1200 // Math mismatch: 1000 + 80 != 1200
          }
        },
        confidence: { supplier_name: 95, supplier_tin: 95, invoice_number: 95, invoice_date: 95, taxable_value: 95, gst_amount: 95, invoice_total: 95, line_items: 95, overall: 95 }
      });

      const suggestion = AIGovernanceService.generateAISuggestionsAndAssessRisk(extraction);
      expect(suggestion.requiresHumanReview).toBe(true);
      expect(suggestion.anomaliesDetected.some((a) => a.type === 'ARITHMETIC_MISMATCH')).toBe(true);
      expect(suggestion.riskScore).toBeGreaterThanOrEqual(40);
    });

    it('detects high value transactions (>= MVR 10,000)', () => {
      const extraction = AIGovernanceService.recordAIExtraction({
        documentId: 'doc-bill-010',
        tenantId: 'TENANT-MLE-01',
        model: 'gemini-3.6-flash',
        rawResponseText: '{}',
        normalizedOutput: {
          totals: { taxable_value: 20000, gst_amount: 1600, invoice_total: 21600 }
        },
        confidence: { supplier_name: 95, supplier_tin: 95, invoice_number: 95, invoice_date: 95, taxable_value: 95, gst_amount: 95, invoice_total: 95, line_items: 95, overall: 95 }
      });

      const suggestion = AIGovernanceService.generateAISuggestionsAndAssessRisk(extraction);
      expect(suggestion.requiresHumanReview).toBe(true);
      expect(suggestion.anomaliesDetected.some((a) => a.type === 'HIGH_VALUE_THRESHOLD')).toBe(true);
    });

    it('detects Blocked Input Tax under GST Act Section 21/22 (entertainment / luxury car)', () => {
      const extraction = AIGovernanceService.recordAIExtraction({
        documentId: 'doc-bill-011',
        tenantId: 'TENANT-MLE-01',
        model: 'gemini-3.6-flash',
        rawResponseText: '{}',
        normalizedOutput: {
          expense_category: 'Other',
          notes: 'Annual staff dinner entertainment hospitality',
          items: [{ description: 'Catering and entertainment band' }],
          totals: { taxable_value: 8000, gst_amount: 640, invoice_total: 8640 }
        },
        confidence: { supplier_name: 95, supplier_tin: 95, invoice_number: 95, invoice_date: 95, taxable_value: 95, gst_amount: 95, invoice_total: 95, line_items: 95, overall: 95 }
      });

      const suggestion = AIGovernanceService.generateAISuggestionsAndAssessRisk(extraction);
      expect(suggestion.requiresHumanReview).toBe(true);
      expect(suggestion.anomaliesDetected.some((a) => a.type === 'BLOCKED_INPUT_TAX')).toBe(true);
    });

    it('detects Related-Party risk under Income Tax Act Section 67', () => {
      const extraction = AIGovernanceService.recordAIExtraction({
        documentId: 'doc-bill-012',
        tenantId: 'TENANT-MLE-01',
        model: 'gemini-3.6-flash',
        rawResponseText: '{}',
        normalizedOutput: {
          mira_schedule1_category: 'Related Party Expenses',
          notes: 'Director consulting and related party management fees',
          totals: { taxable_value: 15000, gst_amount: 1200, invoice_total: 16200 }
        },
        confidence: { supplier_name: 95, supplier_tin: 95, invoice_number: 95, invoice_date: 95, taxable_value: 95, gst_amount: 95, invoice_total: 95, line_items: 95, overall: 95 }
      });

      const suggestion = AIGovernanceService.generateAISuggestionsAndAssessRisk(extraction);
      expect(suggestion.requiresHumanReview).toBe(true);
      expect(suggestion.anomaliesDetected.some((a) => a.type === 'RELATED_PARTY_RISK')).toBe(true);
    });
  });

  describe('6. Human Override Auditing & Cryptographic Verification', () => {
    it('creates an immutable, hash-linked audit record when a human overrides an AI extraction', () => {
      const extraction = AIGovernanceService.recordAIExtraction({
        documentId: 'doc-bill-013',
        tenantId: 'TENANT-MLE-01',
        model: 'gemini-3.6-flash',
        rawResponseText: JSON.stringify({
          supplier: { name: 'Typo Suplier Ltd', gstin: '1009999GST001' },
          totals: { taxable_value: 1000, gst_amount: 80, invoice_total: 1080 }
        }),
        normalizedOutput: {
          supplier: { name: 'Typo Suplier Ltd', gstin: '1009999GST001' },
          totals: { taxable_value: 1000, gst_amount: 80, invoice_total: 1080 }
        },
        confidence: { supplier_name: 82, supplier_tin: 95, invoice_number: 95, invoice_date: 95, taxable_value: 95, gst_amount: 95, invoice_total: 95, line_items: 95, overall: 92 }
      });

      // Human accountant corrects the supplier name
      const override = AIGovernanceService.recordHumanOverride(
        {
          extractionId: extraction.metadata.extractionId,
          tenantId: 'TENANT-MLE-01',
          field: 'supplier.name',
          originalAiValue: 'Typo Suplier Ltd',
          humanVerifiedValue: 'Type Supplier PLC',
          originalConfidence: 82,
          reason: 'Corrected spelling error in vendor registration name'
        },
        mockHumanSession
      );

      expect(override.id).toMatch(/^OVR-/);
      expect(override.field).toBe('supplier.name');
      expect(override.originalAiValue).toBe('Typo Suplier Ltd');
      expect(override.humanVerifiedValue).toBe('Type Supplier PLC');
      expect(override.overriddenBy).toBe('usr-tax-accountant-001');
      expect(override.userRole).toBe('ACCOUNTANT');

      // Check extraction status updated to OVERRIDDEN
      expect(extraction.status).toBe('OVERRIDDEN');
      expect(extraction.normalizedOutput.supplier.name).toBe('Type Supplier PLC');

      // Verify audit logs in auditService
      const logs = queryAuditLogs({ tenantId: 'TENANT-MLE-01' });
      const overrideLog = logs.find((l) => l.id === override.auditEventId);
      expect(overrideLog).toBeDefined();
      expect(overrideLog?.eventType).toBe('OCR_CORRECTION');
      expect(overrideLog?.actorId).toBe('usr-tax-accountant-001');

      // Verify cryptographic audit chain integrity
      const chainVerification = verifyAuditChain('TENANT-MLE-01');
      expect(chainVerification.isValid).toBe(true);
    });

    it('rejects simulated human overrides initiated by AI bots', () => {
      const extraction = AIGovernanceService.recordAIExtraction({
        documentId: 'doc-bill-014',
        tenantId: 'TENANT-MLE-01',
        model: 'gemini-3.6-flash',
        rawResponseText: '{}',
        normalizedOutput: { totals: { invoice_total: 1000 } },
        confidence: { supplier_name: 90, supplier_tin: 90, invoice_number: 90, invoice_date: 90, taxable_value: 90, gst_amount: 90, invoice_total: 90, line_items: 90, overall: 90 }
      });

      expect(() => {
        AIGovernanceService.recordHumanOverride(
          {
            extractionId: extraction.metadata.extractionId,
            tenantId: 'TENANT-MLE-01',
            field: 'totals.invoice_total',
            originalAiValue: 1000,
            humanVerifiedValue: 1200
          },
          mockAISession
        );
      }).toThrow(AIApprovalForbiddenError);
    });
  });

  describe('7. Invariant: AI Cannot Directly Calculate Final Legal Tax Liability', () => {
    it('throws AITaxLiabilityCalculationForbiddenError if tax calculation is not performed by deterministic engine', () => {
      expect(() => {
        AIGovernanceService.validateTaxLiabilityCalculation(
          15000,
          mockHumanSession,
          false // AI hallucinated amount directly without deterministic engine
        );
      }).toThrow(AITaxLiabilityCalculationForbiddenError);
    });

    it('throws AITaxLiabilityCalculationForbiddenError if AI session attempts to certify tax liability', () => {
      expect(() => {
        AIGovernanceService.validateTaxLiabilityCalculation(
          15000,
          mockAISession,
          true
        );
      }).toThrow(AITaxLiabilityCalculationForbiddenError);
    });

    it('accepts tax liability calculated deterministically and certified by human session', () => {
      const isValid = AIGovernanceService.validateTaxLiabilityCalculation(
        15000,
        mockFinanceManagerSession,
        true
      );
      expect(isValid).toBe(true);
    });
  });
});
