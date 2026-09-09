/**
 * Phase 50 — Accountant Acceptance Test Runner
 * 
 * Maldives Inland Revenue Authority (MIRA) / CA Maldives Practitioner Framework
 * 
 * CORE STATUTORY PRINCIPLE:
 * "Do not automatically mark acceptance tests passed."
 * Automated verification may only confirm computational accuracy. The acceptance
 * status requires accredited human practitioner attribution, license verification,
 * review date, and professional comments.
 */

import crypto from 'crypto';
import {
  AcceptanceTestCase,
  AcceptanceCategory,
  AcceptanceTestStatus,
  ReviewerProfile,
  PractitionerSignOff,
  AcceptanceSuiteReportSummary
} from './types';
import { ACCEPTANCE_SCENARIOS, ACCREDITED_PRACTITIONERS } from './scenarios';

export class AutoPassProhibitedError extends Error {
  constructor(message?: string) {
    super(
      message ||
        'AUTO_PASS_PROHIBITED: Acceptance tests cannot be automatically marked as PASSED by automated runners. Maldives statutory compliance requires explicit human practitioner review with licensed credentials, review date, and professional comments.'
    );
    this.name = 'AutoPassProhibitedError';
  }
}

export class PractitionerReviewValidationError extends Error {
  constructor(message: string) {
    super(`PRACTITIONER_REVIEW_INVALID: ${message}`);
    this.name = 'PractitionerReviewValidationError';
  }
}

export interface PractitionerReviewInput {
  reviewer: ReviewerProfile;
  reviewDate: string; // YYYY-MM-DD
  result: AcceptanceTestStatus;
  comments: string;
}

export class AcceptanceTestRunner {
  private cases: Map<string, AcceptanceTestCase>;

  constructor(initialCases?: AcceptanceTestCase[]) {
    this.cases = new Map<string, AcceptanceTestCase>();
    const source = initialCases || ACCEPTANCE_SCENARIOS;
    for (const c of source) {
      // Deep clone case to prevent mutation leaks
      this.cases.set(c.caseId, JSON.parse(JSON.stringify(c)));
    }
  }

  /**
   * Retrieves all loaded acceptance test cases
   */
  public getAllCases(): AcceptanceTestCase[] {
    return Array.from(this.cases.values());
  }

  /**
   * Retrieves a specific acceptance case by ID
   */
  public getCase(caseId: string): AcceptanceTestCase | undefined {
    const c = this.cases.get(caseId);
    return c ? JSON.parse(JSON.stringify(c)) : undefined;
  }

  /**
   * Returns all cases belonging to a specific category
   */
  public getCasesByCategory(category: AcceptanceCategory): AcceptanceTestCase[] {
    return this.getAllCases().filter((c) => c.category === category);
  }

  /**
   * Executes technical and computational verification on a case without altering practitioner sign-off.
   * Confirms double-entry balancing, tax calculation arithmetic, and MIRA box alignment.
   * 
   * NOTE: In strict accordance with Phase 50 rules, this DOES NOT set result to 'PASSED'.
   * It only updates calculationRunDetails.
   */
  public executeComputationalVerification(caseId: string): {
    isValid: boolean;
    discrepancies: string[];
  } {
    const testCase = this.cases.get(caseId);
    if (!testCase) {
      throw new Error(`Acceptance test case not found: ${caseId}`);
    }

    const discrepancies: string[] = [];

    // 1. Accounting Double-Entry Verification
    const accounting = testCase.expectedAccounting;
    let computedDebit = 0;
    let computedCredit = 0;

    for (const line of accounting.journalEntries) {
      computedDebit += line.debit;
      computedCredit += line.credit;
    }

    // Floating-point tolerant cents comparison
    if (Math.abs(computedDebit - accounting.totalDebit) > 0.01) {
      discrepancies.push(
        `Journal total debit mismatch: lines sum MVR ${computedDebit} vs expected ${accounting.totalDebit}`
      );
    }
    if (Math.abs(computedCredit - accounting.totalCredit) > 0.01) {
      discrepancies.push(
        `Journal total credit mismatch: lines sum MVR ${computedCredit} vs expected ${accounting.totalCredit}`
      );
    }
    if (Math.abs(computedDebit - computedCredit) > 0.01) {
      discrepancies.push(
        `Journal unbalanced: Debits (MVR ${computedDebit}) != Credits (MVR ${computedCredit})`
      );
    }

    // 2. Tax Treatment Arithmetic Verification
    const tax = testCase.expectedTaxTreatment;
    if (testCase.category === 'MIRA_602' && Array.isArray(testCase.input.foreignPayments)) {
      let sumCalculatedTax = 0;
      for (const p of testCase.input.foreignPayments) {
        sumCalculatedTax += (p.amountMVR || 0) * (p.rate || 0);
      }
      if (Math.abs(sumCalculatedTax - tax.taxAmount) > 1.0) {
        discrepancies.push(
          `MIRA 602 multi-rate payments tax mismatch: sum of line items MVR ${sumCalculatedTax} vs expected ${tax.taxAmount}`
        );
      }
    } else if (tax.taxableAmount > 0 && tax.statutoryRate > 0) {
      const expectedTaxArithmetic = (tax.taxableAmount * tax.statutoryRate) / 100;
      // Allow for graduated, thresholded, or multi-rate categories
      if (
        testCase.category !== 'INDIVIDUAL_INCOME_TAX' &&
        testCase.category !== 'NWT' &&
        testCase.category !== 'TAX_LOSSES' &&
        testCase.category !== 'COMPANY_INCOME_TAX' &&
        testCase.category !== 'MIRA_604' &&
        testCase.category !== 'MIRA_602'
      ) {
        if (Math.abs(expectedTaxArithmetic - tax.taxAmount) > 1.0) {
          discrepancies.push(
            `Tax calculation mismatch: ${tax.taxableAmount} @ ${tax.statutoryRate}% = ${expectedTaxArithmetic}, expected ${tax.taxAmount}`
          );
        }
      }
    }

    // 3. MIRA Result Verification
    const mira = testCase.expectedMiraResult;
    if (!mira.formId) {
      discrepancies.push('MIRA formId is missing in expected result');
    }
    if (!mira.relevantBoxes || Object.keys(mira.relevantBoxes).length === 0) {
      discrepancies.push('No relevant MIRA form boxes specified in expected result');
    }

    const isValid = discrepancies.length === 0;

    testCase.calculationRunDetails = {
      computedMatchesExpected: isValid,
      discrepancies,
      executionTimestamp: new Date().toISOString()
    };

    // Notice: testCase.result is NOT marked as PASSED here!
    // "Do not automatically mark acceptance tests passed."

    return { isValid, discrepancies };
  }

  /**
   * Strictly prohibited: Any attempt by automated systems to auto-pass a case
   */
  public autoPassCase(_caseId: string): never {
    throw new AutoPassProhibitedError();
  }

  /**
   * Applies an authenticated human practitioner's review to an acceptance test case.
   * Strictly validates practitioner credentials, review date, and detailed commentary.
   */
  public submitPractitionerReview(
    caseId: string,
    review: PractitionerReviewInput
  ): AcceptanceTestCase {
    const testCase = this.cases.get(caseId);
    if (!testCase) {
      throw new Error(`Acceptance test case not found: ${caseId}`);
    }

    // Validate Reviewer Profile
    if (!review.reviewer || !review.reviewer.name || !review.reviewer.licenseNumber) {
      throw new PractitionerReviewValidationError(
        'Reviewer must possess valid name and MIRA Tax Agent / CA Maldives license number.'
      );
    }
    if (!review.reviewer.membershipBody) {
      throw new PractitionerReviewValidationError(
        'Reviewer must be registered with a recognized accounting/tax professional body.'
      );
    }

    // Validate Review Date
    if (!review.reviewDate || !/^\d{4}-\d{2}-\d{2}$/.test(review.reviewDate)) {
      throw new PractitionerReviewValidationError(
        'Review date must be provided in valid ISO YYYY-MM-DD format.'
      );
    }

    // Validate Comments
    if (!review.comments || review.comments.trim().length < 15) {
      throw new PractitionerReviewValidationError(
        'Substantive professional practitioner comments and regulatory observations are mandatory.'
      );
    }

    // If practitioner is marking as PASSED, ensure computations have been verified
    if (review.result === 'PASSED') {
      if (
        !testCase.calculationRunDetails ||
        !testCase.calculationRunDetails.computedMatchesExpected
      ) {
        // Run computational verification first
        const comp = this.executeComputationalVerification(caseId);
        if (!comp.isValid) {
          throw new PractitionerReviewValidationError(
            `Cannot sign off case as PASSED with computational discrepancies: ${comp.discrepancies.join('; ')}`
          );
        }
      }
    }

    // Generate SHA-256 Digital Verification Hash
    const signPayload = [
      review.reviewer.reviewerId,
      review.reviewer.licenseNumber,
      caseId,
      review.reviewDate,
      review.result,
      review.comments
    ].join('|');
    const signatureHash = crypto.createHash('sha256').update(signPayload).digest('hex');

    const signOff: PractitionerSignOff = {
      reviewer: review.reviewer,
      reviewDate: review.reviewDate,
      result: review.result,
      comments: review.comments,
      verifiedCalculations: testCase.calculationRunDetails?.computedMatchesExpected === true,
      statutoryComplianceConfirmed: review.result === 'PASSED',
      signatureHash
    };

    testCase.reviewer = review.reviewer;
    testCase.reviewDate = review.reviewDate;
    testCase.result = review.result;
    testCase.comments = review.comments;
    testCase.practitionerSignOff = signOff;

    return JSON.parse(JSON.stringify(testCase));
  }

  /**
   * Validates the integrity of the entire acceptance test suite.
   * Ensures that every case marked as PASSED has valid practitioner attribution and digital signature.
   */
  public verifyAcceptanceSuiteIntegrity(): {
    isFullyCompliant: boolean;
    unreviewedCount: number;
    passedCount: number;
    failedCount: number;
    errors: string[];
  } {
    const errors: string[] = [];
    let unreviewedCount = 0;
    let passedCount = 0;
    let failedCount = 0;

    for (const testCase of this.cases.values()) {
      if (testCase.result === 'PENDING_REVIEW' || testCase.result === 'IN_REVIEW') {
        unreviewedCount++;
        continue;
      }

      if (testCase.result === 'FAILED') {
        failedCount++;
        continue;
      }

      if (testCase.result === 'PASSED') {
        passedCount++;

        // Enforce reviewer presence
        if (!testCase.reviewer) {
          errors.push(`Case ${testCase.caseId} is marked PASSED but lacks reviewer profile.`);
        } else if (!testCase.reviewer.licenseNumber) {
          errors.push(`Case ${testCase.caseId} reviewer lacks MIRA/CA Maldives license number.`);
        }

        // Enforce review date
        if (!testCase.reviewDate) {
          errors.push(`Case ${testCase.caseId} is marked PASSED but lacks review date.`);
        }

        // Enforce comments
        if (!testCase.comments || testCase.comments.trim().length === 0) {
          errors.push(`Case ${testCase.caseId} is marked PASSED but lacks practitioner comments.`);
        }

        // Enforce cryptographic signature match
        if (testCase.practitionerSignOff) {
          const signPayload = [
            testCase.reviewer?.reviewerId,
            testCase.reviewer?.licenseNumber,
            testCase.caseId,
            testCase.reviewDate,
            testCase.result,
            testCase.comments
          ].join('|');
          const expectedHash = crypto.createHash('sha256').update(signPayload).digest('hex');
          if (testCase.practitionerSignOff.signatureHash !== expectedHash) {
            errors.push(`Case ${testCase.caseId} digital signature hash verification failed.`);
          }
        }
      }
    }

    return {
      isFullyCompliant: errors.length === 0,
      unreviewedCount,
      passedCount,
      failedCount,
      errors
    };
  }

  /**
   * Generates a high-level summary of the acceptance suite
   */
  public generateReportSummary(): AcceptanceSuiteReportSummary {
    const allCases = this.getAllCases();
    const categories = new Set<AcceptanceCategory>();
    const practitioners = new Map<string, ReviewerProfile>();

    let passedCount = 0;
    let pendingCount = 0;
    let failedCount = 0;

    for (const c of allCases) {
      categories.add(c.category);
      if (c.result === 'PASSED') passedCount++;
      else if (c.result === 'FAILED') failedCount++;
      else pendingCount++;

      if (c.reviewer) {
        practitioners.set(c.reviewer.reviewerId, c.reviewer);
      }
    }

    const mandatoryCategories: AcceptanceCategory[] = [
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

    const allCategoriesCovered = mandatoryCategories.every((cat) => categories.has(cat));

    return {
      totalScenarios: allCases.length,
      passedCount,
      pendingCount,
      failedCount,
      categoriesCovered: categories.size,
      allCategoriesCovered,
      practitionersInvolved: Array.from(practitioners.values()),
      generatedAt: new Date().toISOString()
    };
  }
}
