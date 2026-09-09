import { describe, it, expect } from 'vitest';
import { IncomeTaxEngineService, defaultIncomeTaxEngine } from '../../src/services/tax/incomeTaxEngineService';
import { defaultRuleResolver } from '../../src/regulatory/resolvers/ruleResolver';
import { IncomeTaxCalculationInput } from '../../src/types/incomeTax';

describe('Phase 26 — Income Tax Engine Regression Suite', () => {
  const engine = new IncomeTaxEngineService(defaultRuleResolver);

  // --------------------------------------------------------------------------
  // TEST 1: COMPANY MVR 500,000 BOUNDARY & MVR 500,001 CASE
  // --------------------------------------------------------------------------
  it('correctly evaluates Company MVR 500,000 boundary (tax = 0) and MVR 500,001 case (tax = 0.15)', () => {
    // 500,000 boundary
    const boundaryResult = engine.calculateTaxLiability(500000, 'COMPANY', { taxYear: 2026 });
    expect(boundaryResult.totalGrossTaxLiability).toBe(0);
    expect(boundaryResult.proRatedThreshold).toBe(500000);
    expect(boundaryResult.brackets[0].taxableInBracket).toBe(500000);
    expect(boundaryResult.brackets[0].taxInBracket).toBe(0);
    expect(boundaryResult.brackets[1].taxableInBracket).toBe(0);
    expect(boundaryResult.brackets[1].taxInBracket).toBe(0);

    // 500,001 case (MVR 1 taxed at 15% = 0.15)
    const excessOneResult = engine.calculateTaxLiability(500001, 'COMPANY', { taxYear: 2026 });
    expect(excessOneResult.totalGrossTaxLiability).toBe(0.15);
    expect(excessOneResult.brackets[0].taxableInBracket).toBe(500000);
    expect(excessOneResult.brackets[1].taxableInBracket).toBe(1);
    expect(excessOneResult.brackets[1].taxInBracket).toBe(0.15);
  });

  // --------------------------------------------------------------------------
  // TEST 2: INDIVIDUAL PROGRESSIVE BRACKET BOUNDARIES
  // --------------------------------------------------------------------------
  it('accurately calculates every progressive bracket boundary for Individual / Sole Proprietor under Section 16', () => {
    // 1. Tier 1 boundary: MVR 720,000 -> 0% = MVR 0 tax
    const tier1 = engine.calculateTaxLiability(720000, 'SOLE_PROPRIETOR', { taxYear: 2026 });
    expect(tier1.totalGrossTaxLiability).toBe(0);
    expect(tier1.brackets[0].taxableInBracket).toBe(720000);
    expect(tier1.brackets[1].taxableInBracket).toBe(0);

    // 2. Just above Tier 1: MVR 720,001 -> 5.5% on MVR 1 = MVR 0.06 (rounded)
    const tier1Plus = engine.calculateTaxLiability(720001, 'SOLE_PROPRIETOR', { taxYear: 2026 });
    expect(tier1Plus.totalGrossTaxLiability).toBe(0.06);

    // 3. Tier 2 boundary: MVR 1,200,000 -> 480,000 @ 5.5% = MVR 26,400
    const tier2 = engine.calculateTaxLiability(1200000, 'SOLE_PROPRIETOR', { taxYear: 2026 });
    expect(tier2.brackets[0].taxableInBracket).toBe(720000);
    expect(tier2.brackets[1].taxableInBracket).toBe(480000);
    expect(tier2.brackets[1].taxInBracket).toBe(26400);
    expect(tier2.totalGrossTaxLiability).toBe(26400);

    // 4. Tier 3 boundary: MVR 1,800,000 -> 26,400 + (600,000 @ 8% = 48,000) = MVR 74,400
    const tier3 = engine.calculateTaxLiability(1800000, 'SOLE_PROPRIETOR', { taxYear: 2026 });
    expect(tier3.brackets[2].taxableInBracket).toBe(600000);
    expect(tier3.brackets[2].taxInBracket).toBe(480000 * 0.1); // 48,000
    expect(tier3.totalGrossTaxLiability).toBe(74400);

    // 5. Tier 4 boundary: MVR 2,400,000 -> 74,400 + (600,000 @ 12% = 72,000) = MVR 146,400
    const tier4 = engine.calculateTaxLiability(2400000, 'SOLE_PROPRIETOR', { taxYear: 2026 });
    expect(tier4.brackets[3].taxableInBracket).toBe(600000);
    expect(tier4.brackets[3].taxInBracket).toBe(72000);
    expect(tier4.totalGrossTaxLiability).toBe(146400);

    // 6. Tier 5 (Over 2,400,000): MVR 3,000,000 -> 146,400 + (600,000 @ 15% = 90,000) = MVR 236,400
    const tier5 = engine.calculateTaxLiability(3000000, 'INDIVIDUAL', { taxYear: 2026 });
    expect(tier5.brackets[4].taxableInBracket).toBe(600000);
    expect(tier5.brackets[4].taxInBracket).toBe(90000);
    expect(tier5.totalGrossTaxLiability).toBe(236400);
  });

  // --------------------------------------------------------------------------
  // TEST 3: ZERO INCOME & NEGATIVE ACCOUNTING PROFIT
  // --------------------------------------------------------------------------
  it('handles zero income and negative accounting profit (tax loss) cleanly', () => {
    // Zero income
    const zeroResult = engine.calculateFinalTaxPayable({
      taxpayerType: 'COMPANY',
      taxYear: 2026,
      accountingProfit: 0
    });
    expect(zeroResult.taxableIncomeCalculation.netTaxableIncome).toBe(0);
    expect(zeroResult.taxLiability.totalGrossTaxLiability).toBe(0);
    expect(zeroResult.finalTaxPayable).toBe(0);
    expect(zeroResult.isRefundable).toBe(false);

    // Negative accounting profit (-MVR 250,000)
    const lossResult = engine.calculateFinalTaxPayable({
      taxpayerType: 'COMPANY',
      taxYear: 2026,
      accountingProfit: -250000,
      adjustments: [
        { id: '1', code: 'MIRA_ADJ_NON_DEDUCTIBLE', description: 'Fines', amount: 50000, type: 'ADD_BACK' }
      ]
    });
    // -250,000 + 50,000 = -200,000 current tax loss
    expect(lossResult.taxableIncomeCalculation.isTaxLoss).toBe(true);
    expect(lossResult.taxableIncomeCalculation.taxLossAmount).toBe(200000);
    expect(lossResult.taxableIncomeCalculation.netTaxableIncome).toBe(0);
    expect(lossResult.taxLiability.totalGrossTaxLiability).toBe(0);
    expect(lossResult.finalTaxPayable).toBe(0);
  });

  // --------------------------------------------------------------------------
  // TEST 4: SECTION 30 LOSS RELIEF (5-YEAR CARRY FORWARD & EXPIRY)
  // --------------------------------------------------------------------------
  it('applies Section 30 loss relief for valid prior losses (<= 5 years) and expires older losses', () => {
    const input: IncomeTaxCalculationInput = {
      taxpayerType: 'COMPANY',
      taxYear: 2026,
      accountingProfit: 1000000, // MVR 1,000,000 profit
      priorLossRecords: [
        { year: 2024, lossAmount: 200000, utilisedAmount: 0 }, // 2 years old (valid)
        { year: 2022, lossAmount: 150000, utilisedAmount: 0 }, // 4 years old (valid)
        { year: 2019, lossAmount: 300000, utilisedAmount: 0 }  // 7 years old (> 5 years, expired)
      ]
    };

    const calc = engine.calculateTaxableIncome(input);
    expect(calc.priorLossesAvailable).toBe(350000); // 200k + 150k
    expect(calc.expiredLosses).toBe(300000); // 300k expired
    expect(calc.lossReliefApplied).toBe(350000);
    expect(calc.netTaxableIncome).toBe(650000); // 1,000,000 - 350,000 = 650,000
    expect(calc.remainingUnabsorbedLosses).toBe(300000); // 300k expired remaining

    // Tax liability on 650,000: (650,000 - 500,000) * 15% = 22,500
    const liability = engine.calculateTaxLiability(calc.netTaxableIncome, 'COMPANY', { taxYear: 2026 });
    expect(liability.totalGrossTaxLiability).toBe(22500);
  });

  // --------------------------------------------------------------------------
  // TEST 5: SHORT ACCOUNTING PERIOD PRO-RATING UNDER SECTION 15(c)
  // --------------------------------------------------------------------------
  it('pro-rates the MVR 500,000 company threshold for short accounting periods', () => {
    // 180 days accounting period: threshold = (500,000 * 180 / 365) = 246,575.34
    const shortPeriod = engine.calculateTaxLiability(400000, 'COMPANY', {
      taxYear: 2026,
      accountingDays: 180,
      groupFactor: 1
    });

    expect(shortPeriod.proRatedThreshold).toBe(246575.34);
    expect(shortPeriod.brackets[0].taxableInBracket).toBe(246575.34);
    expect(shortPeriod.brackets[1].taxableInBracket).toBe(153424.66); // 400,000 - 246,575.34
    // 153,424.66 * 15% = 23,013.70
    expect(shortPeriod.totalGrossTaxLiability).toBe(23013.70);
  });

  // --------------------------------------------------------------------------
  // TEST 6: GROUP FACTOR DIVISION FOR COMPANY THRESHOLD
  // --------------------------------------------------------------------------
  it('divides company threshold by group factor for group of companies', () => {
    // Group factor 2: threshold = 500,000 / 2 = 250,000
    const groupResult = engine.calculateTaxLiability(500000, 'COMPANY', {
      taxYear: 2026,
      accountingDays: 365,
      groupFactor: 2
    });

    expect(groupResult.proRatedThreshold).toBe(250000);
    expect(groupResult.brackets[0].taxableInBracket).toBe(250000);
    expect(groupResult.brackets[1].taxableInBracket).toBe(250000);
    expect(groupResult.totalGrossTaxLiability).toBe(37500); // 250,000 * 0.15
  });

  // --------------------------------------------------------------------------
  // TEST 7: TAX CREDITS, PREPAYMENTS, AND WITHHOLDING TAX CREDITS
  // --------------------------------------------------------------------------
  it('accurately applies tax credits, interim prepayments, and withholding tax deductions', () => {
    const input: IncomeTaxCalculationInput = {
      taxpayerType: 'COMPANY',
      taxYear: 2026,
      accountingProfit: 2000000, // Gross profit 2,000,000 -> Taxable above 500k = 1,500,000 -> Gross Tax = 225,000
      taxCredits: [
        { creditId: 'CR-1', type: 'FOREIGN_TAX_CREDIT', description: 'Foreign Tax Credit', amount: 25000 }
      ],
      prepayments: [
        { paymentId: 'P-1', type: 'FIRST_INTERIM_PAYMENT', amount: 80000, paymentDate: '2026-07-31', referenceNumber: 'INT-01' },
        { paymentId: 'P-2', type: 'SECOND_INTERIM_PAYMENT', amount: 80000, paymentDate: '2027-01-31', referenceNumber: 'INT-02' }
      ],
      withholdingCredits: [
        { creditId: 'WHT-1', type: 'SECTION_55_NWT_WITHHELD', payerName: 'Client Co', grossAmount: 200000, taxWithheld: 20000, paymentDate: '2026-06-15' }
      ]
    };

    const finalResult = engine.calculateFinalTaxPayable(input);
    // Gross Tax: 225,000
    expect(finalResult.taxLiability.totalGrossTaxLiability).toBe(225000);
    // Credits: 25,000 -> Net Tax After Credits = 200,000
    expect(finalResult.taxCreditsApplied).toBe(25000);
    expect(finalResult.netTaxAfterCredits).toBe(200000);
    // Prepayments: 160,000 + WHT Credits: 20,000 = Total Deductions 180,000
    expect(finalResult.totalPrepayments).toBe(160000);
    expect(finalResult.totalWithholdingCredits).toBe(20000);
    expect(finalResult.totalDeductionsAtSource).toBe(180000);
    // Final Tax Payable: 200,000 - 180,000 = 20,000
    expect(finalResult.finalTaxPayable).toBe(20000);
    expect(finalResult.payableAmount).toBe(20000);
    expect(finalResult.isRefundable).toBe(false);
  });

  // --------------------------------------------------------------------------
  // TEST 8: REFUND SCENARIO (PREPAYMENTS EXCEED TAX LIABILITY)
  // --------------------------------------------------------------------------
  it('correctly identifies refund due when advance prepayments exceed total tax liability', () => {
    const input: IncomeTaxCalculationInput = {
      taxpayerType: 'COMPANY',
      taxYear: 2026,
      accountingProfit: 800000, // Net taxable 800,000 -> Gross Tax: (800,000 - 500,000) * 15% = 45,000
      prepayments: [
        { paymentId: 'P-1', type: 'FIRST_INTERIM_PAYMENT', amount: 50000, paymentDate: '2026-07-31', referenceNumber: 'INT-01' },
        { paymentId: 'P-2', type: 'SECOND_INTERIM_PAYMENT', amount: 50000, paymentDate: '2027-01-31', referenceNumber: 'INT-02' }
      ]
    };

    const finalResult = engine.calculateFinalTaxPayable(input);
    expect(finalResult.taxLiability.totalGrossTaxLiability).toBe(45000);
    expect(finalResult.totalPrepayments).toBe(100000);
    expect(finalResult.finalTaxPayable).toBe(-55000);
    expect(finalResult.isRefundable).toBe(true);
    expect(finalResult.refundAmount).toBe(55000);
    expect(finalResult.payableAmount).toBe(0);
  });

  // --------------------------------------------------------------------------
  // TEST 9: OTHER STATUTORY ENTITY TYPES (PARTNERSHIP, TRUST, NON-RESIDENT CO)
  // --------------------------------------------------------------------------
  it('applies Section 15 threshold and rate rules for other taxpayer types (Partnership, Trust, Non-Resident Company)', () => {
    const partnershipResult = engine.calculateTaxLiability(1500000, 'PARTNERSHIP', { taxYear: 2026 });
    expect(partnershipResult.proRatedThreshold).toBe(500000);
    expect(partnershipResult.totalGrossTaxLiability).toBe(150000);

    const trustResult = engine.calculateTaxLiability(1500000, 'TRUST', { taxYear: 2026 });
    expect(trustResult.totalGrossTaxLiability).toBe(150000);

    const nonResResult = engine.calculateTaxLiability(1500000, 'NON_RESIDENT_COMPANY', { taxYear: 2026 });
    expect(nonResResult.totalGrossTaxLiability).toBe(150000);
  });

  // --------------------------------------------------------------------------
  // TEST 10: FULL EXPLAINABILITY & AUDIT METADATA
  // --------------------------------------------------------------------------
  it('retains inputs, rule IDs, intermediate values, formula, and step explanations in audit summary', () => {
    const input: IncomeTaxCalculationInput = {
      taxpayerType: 'COMPANY',
      taxYear: 2026,
      accountingProfit: 1200000,
      adjustments: [
        { id: '1', code: 'MIRA_ADJ_NON_DEDUCTIBLE', description: 'Non-deductible expense', amount: 50000, type: 'ADD_BACK' }
      ],
      capitalAllowanceClaimed: 100000
    };

    const result = engine.calculateFinalTaxPayable(input);
    expect(result.auditSummary).toBeDefined();
    expect(result.auditSummary.ruleIds).toContain('RULE-IT-COMPANY-500K');
    expect(result.auditSummary.ruleIds).toContain('RULE-IT-LOSS-RELIEF-SEC30');
    expect(result.auditSummary.intermediateValues.adjustedTaxableProfitBeforeLoss).toBe(1150000); // 1,200,000 + 50,000 - 100,000
    expect(result.auditSummary.intermediateValues.proRatedThreshold).toBe(500000);
    expect(result.auditSummary.intermediateValues.totalGrossTaxLiability).toBe(97500); // (1,150,000 - 500,000) * 0.15 = 97,500
    expect(result.auditSummary.stepExplanations.length).toBeGreaterThan(4);
  });
});
