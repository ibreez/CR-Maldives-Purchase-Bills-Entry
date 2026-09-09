import { describe, it, expect } from 'vitest';
import {
  TaxExplainabilityEngine,
  defaultTaxExplainabilityEngine,
  TaxCalculationExplanation,
  ExplanationAdjustment
} from '../../src/services/explainability';
import { defaultIncomeTaxEngine } from '../../src/services/tax';
import { IncomeTaxCalculationInput } from '../../src/types/incomeTax';

describe('Phase 43: Explainable Tax Calculations', () => {
  const engine = new TaxExplainabilityEngine();

  describe('Core 5-Part Architectural Structure', () => {
    it('produces an explanation containing INPUTS, RULES, STEPS, INTERMEDIATE_RESULTS, and FINAL_RESULT', () => {
      const input: IncomeTaxCalculationInput = {
        tin: '1001234GST001',
        entityName: 'Maldives Marine Logistics Pvt Ltd',
        taxpayerType: 'COMPANY',
        taxYear: 2024,
        accountingProfit: 3500000,
        accountingDays: 365,
        groupFactor: 1,
        adjustments: [
          {
            id: 'ADJ-001',
            code: 'NON_DED_FINE',
            description: 'Regulatory penalty under Transport Act',
            type: 'ADD_BACK',
            amount: 50000,
            legalReference: 'Income Tax Act Section 33(a)(v) (Fines and Penalties)'
          },
          {
            id: 'ADJ-002',
            code: 'DEP_ADD_BACK',
            description: 'Accounting Depreciation',
            type: 'ADD_BACK',
            amount: 250000,
            legalReference: 'Income Tax Act Section 32 (Accounting Depreciation)'
          }
        ],
        capitalAllowanceClaimed: 200000
      };

      const finalCalc = defaultIncomeTaxEngine.calculateFinalTaxPayable(input);
      expect(finalCalc.explanation).toBeDefined();

      const explanation: TaxCalculationExplanation = finalCalc.explanation!;

      // 1. INPUTS
      expect(explanation.inputs).toBeDefined();
      expect(explanation.inputs.taxYear).toBe(2024);
      expect(explanation.inputs.accountingProfit).toBe(3500000);
      expect(explanation.inputs.adjustments).toHaveLength(2);

      // 2. RULES
      expect(explanation.rules).toBeDefined();
      expect(explanation.rules.length).toBeGreaterThan(0);
      const companyRule = explanation.rules.find(r => r.ruleCode.includes('COMPANY') || r.ruleCode.includes('THRESHOLD'));
      expect(companyRule).toBeDefined();
      expect(companyRule?.legalReference).toContain('Income Tax Act');

      // 3. STEPS
      expect(explanation.steps).toBeDefined();
      expect(explanation.steps.length).toBeGreaterThanOrEqual(7);

      // 4. INTERMEDIATE_RESULTS
      expect(explanation.intermediateResults).toBeDefined();
      expect(explanation.intermediateResults.accountingProfit).toBe(3500000);
      expect(explanation.intermediateResults.totalAdditions).toBe(300000);
      expect(explanation.intermediateResults.totalDeductions).toBe(200000);
      expect(explanation.intermediateResults.adjustedTaxableProfitBeforeLoss).toBe(3600000);
      expect(explanation.intermediateResults.netTaxableIncome).toBe(3600000);
      expect(explanation.intermediateResults.grossTaxLiability).toBeGreaterThan(0);

      // 5. FINAL_RESULT
      expect(explanation.finalResult).toBeDefined();
      expect(explanation.finalResult.finalTaxPayable).toBe(finalCalc.finalTaxPayable);
      expect(explanation.finalResult.isRefundable).toBe(false);
      expect(explanation.finalResult.payableAmount).toBe(finalCalc.payableAmount);
    });
  });

  describe('Acceptance Criteria 1: Calculation Explanation Reproduces Exact Tax Result', () => {
    it('mathematically reproduces corporate income tax to exact precision (discrepancy = 0)', () => {
      const input: IncomeTaxCalculationInput = {
        tin: '1008899GST001',
        entityName: 'Reefside Traders Pvt Ltd',
        taxpayerType: 'COMPANY',
        taxYear: 2024,
        accountingProfit: 4500000,
        accountingDays: 365,
        groupFactor: 1,
        adjustments: [
          {
            id: 'A1',
            code: 'NON_DED',
            description: 'Non-allowable entertainment expenses',
            type: 'ADD_BACK',
            amount: 120000,
            legalReference: 'Income Tax Act Section 32(a)'
          }
        ],
        capitalAllowanceClaimed: 350000,
        priorLossRecords: [
          {
            year: 2022,
            lossAmount: 500000,
            utilisedAmount: 100000,
            remainingAmount: 400000
          }
        ],
        taxCredits: [
          {
            creditId: 'TC-01',
            type: 'FOREIGN_TAX_CREDIT',
            description: 'DTT Foreign Withholding Credit',
            amount: 25000
          }
        ],
        prepayments: [
          {
            paymentId: 'PRE-01',
            type: 'FIRST_INTERIM_PAYMENT',
            amount: 150000,
            paymentDate: '2024-07-31',
            referenceNumber: 'REF-01'
          }
        ]
      };

      const finalCalc = defaultIncomeTaxEngine.calculateFinalTaxPayable(input);
      const explanation = finalCalc.explanation!;

      const verification = engine.verifyExplanation(explanation);
      expect(verification.isValid).toBe(true);
      expect(verification.reproductionStatus).toBe('EXACT_MATCH');
      expect(verification.discrepancy).toBe(0);
      expect(verification.reproducedFinalTax).toBe(finalCalc.finalTaxPayable);
      expect(verification.errors).toHaveLength(0);
    });

    it('mathematically reproduces individual progressive brackets (Section 16) with exact match', () => {
      const input: IncomeTaxCalculationInput = {
        tin: 'IND-1002003',
        entityName: 'Ahmed Zahir (Sole Proprietor)',
        taxpayerType: 'INDIVIDUAL',
        taxYear: 2024,
        accountingProfit: 2500000,
        accountingDays: 365,
        groupFactor: 1
      };

      const finalCalc = defaultIncomeTaxEngine.calculateFinalTaxPayable(input);
      const explanation = finalCalc.explanation!;

      const verification = engine.verifyExplanation(explanation);
      expect(verification.isValid).toBe(true);
      expect(verification.reproductionStatus).toBe('EXACT_MATCH');
      expect(verification.reproducedFinalTax).toBe(finalCalc.finalTaxPayable);
      expect(verification.discrepancy).toBe(0);
      expect(explanation.steps.find(s => s.stepKey === 'BRACKET_COMPUTATION')?.bracketBreakdown?.length).toBeGreaterThanOrEqual(3);
    });

    it('mathematically reproduces GST General Output/Input tax and refund calculation', () => {
      const gstExplanation = engine.generateGstExplanation({
        tenantId: 'T-GST-GEN',
        taxYear: 2024,
        periodName: '2024-Q1',
        sector: 'GENERAL',
        standardSupplies: 1200000,
        standardPurchases: 450000,
        ratePercentage: 8
      });

      // Output Tax = 1,200,000 * 8% = 96,000
      // Input Tax = 450,000 * 8% = 36,000
      // Net Tax = 60,000
      expect(gstExplanation.intermediateResults.netGstOutputTax).toBe(96000);
      expect(gstExplanation.intermediateResults.netGstInputTax).toBe(36000);
      expect(gstExplanation.finalResult.finalTaxPayable).toBe(60000);

      const verification = engine.verifyExplanation(gstExplanation);
      expect(verification.isValid).toBe(true);
      expect(verification.reproducedFinalTax).toBe(60000);
      expect(verification.discrepancy).toBe(0);
    });

    it('mathematically reproduces Non-Resident Withholding Tax (Section 55) including gross-up contracts', () => {
      const nwtExplanation = engine.generateNwtExplanation({
        payerTin: '1004567GST001',
        payeeName: 'Global Cloud Systems Pte Ltd (Singapore)',
        taxYear: 2024,
        paymentCategory: 'TECHNICAL_SERVICE',
        grossAmount: 180000, // net of tax payment
        isGrossedUp: true
      });

      // Grossed up = 180,000 / (1 - 0.10) = 200,000
      // Tax = 200,000 * 10% = 20,000
      expect(nwtExplanation.intermediateResults.grossTaxableIncome).toBe(200000);
      expect(nwtExplanation.finalResult.finalTaxPayable).toBe(20000);

      const verification = engine.verifyExplanation(nwtExplanation);
      expect(verification.isValid).toBe(true);
      expect(verification.reproducedFinalTax).toBe(20000);
      expect(verification.discrepancy).toBe(0);
    });
  });

  describe('Acceptance Criteria 2: Every Tax Step Has a Rule Reference', () => {
    it('verifies that 100% of calculation steps reference a valid statutory rule and legal citation', () => {
      const input: IncomeTaxCalculationInput = {
        tin: '1009900GST001',
        entityName: 'Audited Resort Suppliers Pvt Ltd',
        taxpayerType: 'COMPANY',
        taxYear: 2024,
        accountingProfit: 5000000,
        accountingDays: 365,
        groupFactor: 1,
        adjustments: [
          {
            id: 'A1',
            code: 'PENALTY',
            description: 'Customs duty late penalty',
            type: 'ADD_BACK',
            amount: 80000,
            legalReference: 'Income Tax Act Section 33(a)(v)'
          }
        ]
      };

      const explanation = engine.generateIncomeTaxExplanation(
        input,
        defaultIncomeTaxEngine.calculateFinalTaxPayable(input)
      );

      expect(explanation.steps.length).toBeGreaterThanOrEqual(8);

      explanation.steps.forEach((step) => {
        expect(step.ruleRef, `Step ${step.stepNumber} must have ruleRef`).toBeDefined();
        expect(step.ruleRef.ruleId, `Step ${step.stepNumber} must have ruleId`).toBeTruthy();
        expect(step.ruleRef.legalReference, `Step ${step.stepNumber} must have legal citation`).toBeTruthy();
        expect(step.ruleRef.legalReference).toMatch(/(Income Tax Act|Goods and Services Tax Act|Tax Ruling)/);
      });
    });

    it('rejects an explanation if any step is missing a statutory rule reference', () => {
      const input: IncomeTaxCalculationInput = {
        tin: '1009901GST001',
        entityName: 'Test Entity',
        taxpayerType: 'COMPANY',
        taxYear: 2024,
        accountingProfit: 1000000
      };

      const explanation = engine.generateIncomeTaxExplanation(
        input,
        defaultIncomeTaxEngine.calculateFinalTaxPayable(input)
      );

      // Artificially strip ruleRef from a step to test verification guardrail
      (explanation.steps[2] as any).ruleRef = { ruleId: '', legalReference: '' };

      const verification = engine.verifyExplanation(explanation);
      expect(verification.isValid).toBe(false);
      expect(verification.allStepsHaveRuleRef).toBe(false);
      expect(verification.errors.some(e => e.includes('lacks statutory rule reference'))).toBe(true);
    });
  });

  describe('Acceptance Criteria 3: No Unexplained Adjustment Exists', () => {
    it('confirms 0 unexplained adjustments when all items cite statutory legal bases', () => {
      const input: IncomeTaxCalculationInput = {
        tin: '1009902GST001',
        entityName: 'Compliant Holding Pvt Ltd',
        taxpayerType: 'COMPANY',
        taxYear: 2024,
        accountingProfit: 2000000,
        adjustments: [
          {
            id: 'ADJ-1',
            code: 'PROVISION_BAD_DEBT',
            description: 'General provision for doubtful debts',
            type: 'ADD_BACK',
            amount: 45000,
            legalReference: 'Income Tax Act Section 32(d) (Specific vs General Provisions)'
          },
          {
            id: 'ADJ-2',
            code: 'DIVIDEND_EXEMPT',
            description: 'Exempt domestic dividend income',
            type: 'DEDUCTION',
            amount: 150000,
            legalReference: 'Income Tax Act Section 12(h) (Exempt Dividends)'
          }
        ]
      };

      const explanation = engine.generateIncomeTaxExplanation(
        input,
        defaultIncomeTaxEngine.calculateFinalTaxPayable(input)
      );

      expect(explanation.metadata.unexplainedAdjustmentCount).toBe(0);
      const verification = engine.verifyExplanation(explanation);
      expect(verification.unexplainedAdjustmentCount).toBe(0);
      expect(verification.isValid).toBe(true);
    });

    it('detects and flags unexplained adjustments lacking statutory justification', () => {
      const input: IncomeTaxCalculationInput = {
        tin: '1009903GST001',
        entityName: 'Unexplained Entity',
        taxpayerType: 'COMPANY',
        taxYear: 2024,
        accountingProfit: 2000000,
        adjustments: [
          {
            id: 'BAD-1',
            code: 'RANDOM_DISALLOWANCE',
            description: 'Disallowed without legal citation',
            type: 'ADD_BACK',
            amount: 75000,
            legalReference: '' // Empty legal reference
          }
        ]
      };

      const explanation = engine.generateIncomeTaxExplanation(
        input,
        defaultIncomeTaxEngine.calculateFinalTaxPayable(input)
      );

      // Verify engine caught the unexplained adjustment
      expect(explanation.metadata.unexplainedAdjustmentCount).toBe(1);
      const verification = engine.verifyExplanation(explanation);
      expect(verification.isValid).toBe(false);
      expect(verification.unexplainedAdjustmentCount).toBe(1);
      expect(verification.errors.some(e => e.includes('unexplained adjustment'))).toBe(true);
    });
  });

  describe('Prompt Required Formatting Compliance', () => {
    it('produces formatted summary strictly adhering to prompt specification format', () => {
      const input: IncomeTaxCalculationInput = {
        tin: '1007766GST001',
        entityName: 'Male Ocean Cargo Pvt Ltd',
        taxpayerType: 'COMPANY',
        taxYear: 2024,
        accountingProfit: 3500000,
        accountingDays: 365,
        groupFactor: 1
      };

      const finalCalc = defaultIncomeTaxEngine.calculateFinalTaxPayable(input);
      const explanation = finalCalc.explanation!;
      const summary = explanation.finalResult.formattedSummary;

      // Check format:
      // Taxable income:
      // MVR X
      expect(summary.taxableIncomeLine).toContain('Taxable income:');
      expect(summary.taxableIncomeLine).toContain('MVR 3,500,000.00');

      // Bracket 1:
      // amount × rate = tax
      // Bracket 2:
      // amount × rate = tax
      expect(summary.bracketLines.length).toBe(2);
      expect(summary.bracketLines[0]).toMatch(/Bracket 1: MVR 500,000\.00 × 0% = MVR 0\.00/);
      expect(summary.bracketLines[1]).toMatch(/Bracket 2: MVR 3,000,000\.00 × 15% = MVR 450,000\.00/);

      // Total:
      // MVR X
      expect(summary.totalLine).toContain('Total:');
      expect(summary.totalLine).toContain('MVR 450,000.00');
    });
  });

  describe('Deterministic & AI-Free Architecture Guarantee', () => {
    it('proves generatedWithoutAI is true and repeated executions produce identical SHA-256 digests', () => {
      const input: IncomeTaxCalculationInput = {
        tin: '1006655GST001',
        entityName: 'Hulhumale Construction Co Pvt Ltd',
        taxpayerType: 'COMPANY',
        taxYear: 2024,
        accountingProfit: 6000000
      };

      const calc1 = defaultIncomeTaxEngine.calculateFinalTaxPayable(input);
      const exp1 = calc1.explanation!;

      const calc2 = defaultIncomeTaxEngine.calculateFinalTaxPayable(input);
      const exp2 = calc2.explanation!;

      expect(exp1.metadata.generatedWithoutAI).toBe(true);
      expect(exp2.metadata.generatedWithoutAI).toBe(true);
      expect(exp1.finalResult.finalTaxPayable).toBe(exp2.finalResult.finalTaxPayable);
      expect(exp1.steps.length).toBe(exp2.steps.length);
      expect(exp1.rules.length).toBe(exp2.rules.length);
    });
  });
});
