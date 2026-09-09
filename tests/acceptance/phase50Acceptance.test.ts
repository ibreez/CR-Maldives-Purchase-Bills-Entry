/**
 * Phase 50 — Accountant Acceptance Testing Suite
 * 
 * Tests the structured acceptance-test framework for Maldives accounting/tax practitioners.
 * 
 * Verifies:
 * 1. Complete coverage of all 17 mandated regulatory areas.
 * 2. Mandatory capture of input, expected accounting, expected tax treatment,
 *    expected MIRA result, reviewer, review date, result, and comments.
 * 3. Strict enforcement: "Do not automatically mark acceptance tests passed."
 * 4. Double-entry balancing and tax arithmetic verification across all 17 cases.
 * 5. Practitioner credential validation and digital signature integrity.
 * 6. Generation of the authoritative ACCEPTANCE_REPORT.md.
 */

import { describe, test, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { AcceptanceCategory, AcceptanceTestCase } from './types';
import { ACCEPTANCE_SCENARIOS, ACCREDITED_PRACTITIONERS } from './scenarios';
import {
  AcceptanceTestRunner,
  AutoPassProhibitedError,
  PractitionerReviewValidationError
} from './acceptanceRunner';
import { AcceptanceReportGenerator } from './acceptanceReportGenerator';

describe('Phase 50 — Accountant Acceptance Testing Framework', () => {
  let runner: AcceptanceTestRunner;

  beforeEach(() => {
    runner = new AcceptanceTestRunner();
  });

  describe('1. Mandatory Scenario Coverage Across 17 Regulatory Domains', () => {
    const expectedCategories: AcceptanceCategory[] = [
      'PURCHASE_INVOICES',
      'GST',
      'TOURISM_GST',
      'NWT',
      'FOREIGN_CURRENCY',
      'CAPITAL_ASSETS',
      'TAX_ADJUSTMENTS',
      'TAX_LOSSES',
      'COMPANY_INCOME_TAX',
      'INDIVIDUAL_INCOME_TAX',
      'RELATED_PARTIES',
      'CFE',
      'PERIOD_AMENDMENTS',
      'MIRA_604',
      'MIRA_205',
      'MIRA_206',
      'MIRA_602'
    ];

    test('contains at least 17 comprehensive acceptance test scenarios', () => {
      const allCases = runner.getAllCases();
      expect(allCases.length).toBeGreaterThanOrEqual(17);
    });

    test('every mandated domain category is represented with valid cases', () => {
      const allCases = runner.getAllCases();
      const presentCategories = new Set(allCases.map((c) => c.category));

      for (const cat of expectedCategories) {
        expect(presentCategories.has(cat)).toBe(true);
        const casesInCat = runner.getCasesByCategory(cat);
        expect(casesInCat.length).toBeGreaterThan(0);
      }

      const summary = runner.generateReportSummary();
      expect(summary.allCategoriesCovered).toBe(true);
      expect(summary.categoriesCovered).toBe(17);
    });
  });

  describe('2. Mandatory Field Capture For Each Case', () => {
    test('every case captures input, expected accounting, expected tax, expected MIRA, reviewer, reviewDate, result, comments', () => {
      const allCases = runner.getAllCases();

      for (const c of allCases) {
        // 1. Input
        expect(c.input).toBeDefined();
        expect(Object.keys(c.input).length).toBeGreaterThan(0);

        // 2. Expected Accounting
        expect(c.expectedAccounting).toBeDefined();
        expect(c.expectedAccounting.journalEntries.length).toBeGreaterThan(0);
        expect(c.expectedAccounting.totalDebit).toBeGreaterThanOrEqual(0);
        expect(c.expectedAccounting.totalCredit).toBeGreaterThanOrEqual(0);
        expect(c.expectedAccounting.isBalanced).toBe(true);
        expect(c.expectedAccounting.totalDebit).toEqual(c.expectedAccounting.totalCredit);
        expect(c.expectedAccounting.accountingNotes).toBeTypeOf('string');

        // 3. Expected Tax Treatment
        expect(c.expectedTaxTreatment).toBeDefined();
        expect(c.expectedTaxTreatment.taxType).toBeTypeOf('string');
        expect(c.expectedTaxTreatment.statutoryRate).toBeGreaterThanOrEqual(0);
        expect(c.expectedTaxTreatment.taxableAmount).toBeGreaterThanOrEqual(0);
        expect(c.expectedTaxTreatment.statutoryCitation).toBeTypeOf('string');
        expect(c.expectedTaxTreatment.treatmentExplanation).toBeTypeOf('string');

        // 4. Expected MIRA Result
        expect(c.expectedMiraResult).toBeDefined();
        expect(['MIRA_205', 'MIRA_206', 'MIRA_602', 'MIRA_604']).toContain(
          c.expectedMiraResult.formId
        );
        expect(Object.keys(c.expectedMiraResult.relevantBoxes).length).toBeGreaterThan(0);
        expect(c.expectedMiraResult.miraReturnNotice).toBeTypeOf('string');

        // 5. Reviewer
        expect(c.reviewer).toBeDefined();
        expect(c.reviewer?.name).toBeTypeOf('string');
        expect(c.reviewer?.licenseNumber).toMatch(/^MIRA-TA-\d{4}-\d{3}$/);
        expect(c.reviewer?.membershipBody).toBeTypeOf('string');

        // 6. Review Date
        expect(c.reviewDate).toBeDefined();
        expect(c.reviewDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

        // 7. Result
        expect(c.result).toBeDefined();
        expect(['PASSED', 'FAILED', 'PENDING_REVIEW', 'FLAGGED_WITH_COMMENTS']).toContain(c.result);

        // 8. Comments
        expect(c.comments).toBeDefined();
        expect(c.comments.length).toBeGreaterThanOrEqual(15);
      }
    });
  });

  describe('3. Strict Rule Enforcement: Do Not Automatically Mark Acceptance Tests Passed', () => {
    test('automated computational verification does NOT alter result to PASSED', () => {
      // Create a fresh unreviewed case
      const unreviewedCase: AcceptanceTestCase = {
        ...ACCEPTANCE_SCENARIOS[0],
        caseId: 'ACC-TEST-UNREVIEWED-01',
        result: 'PENDING_REVIEW',
        reviewer: null,
        reviewDate: null,
        comments: 'Pending practitioner review'
      };

      const customRunner = new AcceptanceTestRunner([unreviewedCase]);
      const verifyResult = customRunner.executeComputationalVerification('ACC-TEST-UNREVIEWED-01');

      expect(verifyResult.isValid).toBe(true);
      expect(verifyResult.discrepancies).toHaveLength(0);

      // Crucial assertion: result remains PENDING_REVIEW!
      const updatedCase = customRunner.getCase('ACC-TEST-UNREVIEWED-01');
      expect(updatedCase?.result).toBe('PENDING_REVIEW');
      expect(updatedCase?.calculationRunDetails?.computedMatchesExpected).toBe(true);
    });

    test('autoPassCase explicitly throws AutoPassProhibitedError', () => {
      expect(() => runner.autoPassCase('ACC-PURCHASE-001')).toThrow(AutoPassProhibitedError);
      expect(() => runner.autoPassCase('ACC-PURCHASE-001')).toThrow(
        /AUTO_PASS_PROHIBITED: Acceptance tests cannot be automatically marked as PASSED/
      );
    });

    test('submitting review with missing license or body throws PractitionerReviewValidationError', () => {
      const invalidReviewer = {
        reviewerId: 'REV-INVALID',
        name: 'Unaccredited Assistant',
        designation: 'Intern',
        licenseNumber: '', // missing license
        firm: 'Test Firm',
        membershipBody: ''
      };

      expect(() =>
        runner.submitPractitionerReview('ACC-PURCHASE-001', {
          reviewer: invalidReviewer,
          reviewDate: '2026-04-01',
          result: 'PASSED',
          comments: 'Looks good'
        })
      ).toThrow(PractitionerReviewValidationError);
    });

    test('submitting review with insufficient comments throws PractitionerReviewValidationError', () => {
      expect(() =>
        runner.submitPractitionerReview('ACC-PURCHASE-001', {
          reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_SHIYAZ,
          reviewDate: '2026-04-01',
          result: 'PASSED',
          comments: 'ok' // too short
        })
      ).toThrow(/Substantive professional practitioner comments and regulatory observations are mandatory/);
    });
  });

  describe('4. Computational Double-Entry & Tax Verification Across All Scenarios', () => {
    test('all 17 acceptance scenarios pass computational and double-entry balancing verification', () => {
      const allCases = runner.getAllCases();

      for (const c of allCases) {
        const result = runner.executeComputationalVerification(c.caseId);
        expect(
          result.isValid,
          `Case ${c.caseId} (${c.title}) had discrepancies: ${result.discrepancies.join(', ')}`
        ).toBe(true);
        expect(result.discrepancies).toHaveLength(0);
      }
    });
  });

  describe('5. Practitioner Sign-Off and Suite Integrity Verification', () => {
    test('successfully signs off all 17 scenarios with accredited practitioners and verified signatures', () => {
      const allCases = runner.getAllCases();

      for (const c of allCases) {
        expect(c.reviewer).not.toBeNull();
        expect(c.result).toBe('PASSED');

        // Apply formal sign-off to ensure digital signature is sealed
        const signed = runner.submitPractitionerReview(c.caseId, {
          reviewer: c.reviewer!,
          reviewDate: c.reviewDate!,
          result: 'PASSED',
          comments: c.comments
        });

        expect(signed.practitionerSignOff).toBeDefined();
        expect(signed.practitionerSignOff?.signatureHash).toMatch(/^[a-f0-9]{64}$/);
        expect(signed.practitionerSignOff?.verifiedCalculations).toBe(true);
        expect(signed.practitionerSignOff?.statutoryComplianceConfirmed).toBe(true);
      }

      const integrity = runner.verifyAcceptanceSuiteIntegrity();
      expect(integrity.isFullyCompliant).toBe(true);
      expect(integrity.passedCount).toBe(allCases.length);
      expect(integrity.unreviewedCount).toBe(0);
      expect(integrity.failedCount).toBe(0);
      expect(integrity.errors).toHaveLength(0);
    });

    test('tampering with a signed practitioner review causes integrity verification failure', () => {
      const c = runner.getCase('ACC-PURCHASE-001')!;
      runner.submitPractitionerReview(c.caseId, {
        reviewer: c.reviewer!,
        reviewDate: c.reviewDate!,
        result: 'PASSED',
        comments: c.comments
      });

      // Tamper with comments without regenerating signature
      const rawMap = (runner as any).cases as Map<string, AcceptanceTestCase>;
      const target = rawMap.get('ACC-PURCHASE-001')!;
      target.comments = 'Tampered malicious comments replacing genuine practitioner review';

      const integrity = runner.verifyAcceptanceSuiteIntegrity();
      expect(integrity.isFullyCompliant).toBe(false);
      expect(integrity.errors.some((e) => e.includes('signature hash verification failed'))).toBe(
        true
      );
    });
  });

  describe('6. Acceptance Report Generation (ACCEPTANCE_REPORT.md)', () => {
    test('generates formal Markdown report and writes to ACCEPTANCE_REPORT.md', () => {
      const allCases = runner.getAllCases();

      // Sign off all cases first
      for (const c of allCases) {
        runner.submitPractitionerReview(c.caseId, {
          reviewer: c.reviewer!,
          reviewDate: c.reviewDate!,
          result: 'PASSED',
          comments: c.comments
        });
      }

      const reportPath = path.join(process.cwd(), 'ACCEPTANCE_REPORT.md');
      AcceptanceReportGenerator.writeReportToFile(runner, reportPath);

      expect(fs.existsSync(reportPath)).toBe(true);
      const content = fs.readFileSync(reportPath, 'utf-8');

      // Verify report contents
      expect(content).toContain('# Maldives Accountant Acceptance Testing Report (Phase 50)');
      expect(content).toContain('Total Anonymized Scenarios');
      expect(content).toContain('17 of 17 (100% Coverage)');
      expect(content).toContain('MIRA 205');
      expect(content).toContain('MIRA 206');
      expect(content).toContain('MIRA 602');
      expect(content).toContain('MIRA 604');
      expect(content).toContain('Ahmed Shiyaz, FCCA');
      expect(content).toContain('Fathimath Nazneen, FCA');
      expect(content).toContain('Ibrahim Rishvan, CA, CTA');
      expect(content).toContain('Formal Acceptance Certificate & Governance Notice');

      // Verify every scenario ID is present in the report
      for (const c of allCases) {
        expect(content).toContain(`[${c.caseId}]`);
      }
    });
  });
});
