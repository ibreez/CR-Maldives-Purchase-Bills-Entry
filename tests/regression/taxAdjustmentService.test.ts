import { describe, test, expect } from 'vitest';
import { 
  MIRA_ADJUSTMENT_CODES, 
  MiraAdjustmentCode 
} from '../../src/config/miraAdjustmentCodes';
import { 
  createTaxAdjustment, 
  calculateTaxableIncomePipeline 
} from '../../src/services/tax/taxAdjustmentService';

describe('Phase 6 - Income Tax Adjustment Engine Tests', () => {

  test('Requirement 1: Fines and statutory penalties automatically generate an ADJ-FINES addback record', () => {
    const fineAdj = createTaxAdjustment({
      miraCode: 'ADJ-FINES',
      amount: 15000,
      reason: 'Late tax filing penalty imposed by MIRA',
      sourceTransactionId: 'TX-2026-FINE-001',
      supportingDocumentId: 'DOC-MIRA-PENALTY'
    });

    expect(fineAdj.miraCode).toBe('ADJ-FINES');
    expect(fineAdj.direction).toBe('ADD_BACK');
    expect(fineAdj.amount).toBe(15000);
    expect(fineAdj.reason).toContain('penalty');
    expect(fineAdj.sourceTransactionId).toBe('TX-2026-FINE-001');

    // Run through pipeline and verify it acts as an add-back to taxable income
    const result = calculateTaxableIncomePipeline(100000, [fineAdj], 0);
    expect(result.totalAddBacks).toBe(15000);
    expect(result.addBacksBreakdown['ADJ-FINES']).toBe(15000);
    expect(result.adjustedProfitBeforeCapitalAllowance).toBe(115000);
  });

  test('Requirement 2: Accounting depreciation is fully added back via ADJ-DEPR before subtracting MIRA Capital Allowances', () => {
    const depreciationAdj = createTaxAdjustment({
      miraCode: 'ADJ-DEPR',
      amount: 50000,
      reason: 'Add-back of annual accounting book depreciation'
    });

    const accountingProfit = 200000;
    const capitalAllowanceTotal = 35000; // Phase 5 MIRA Capital Allowance

    const pipeline = calculateTaxableIncomePipeline(
      accountingProfit,
      [depreciationAdj],
      capitalAllowanceTotal
    );

    // Step 1: Accounting profit = 200,000
    expect(pipeline.accountingProfit).toBe(200000);

    // Step 2: Book depreciation added back = +50,000
    expect(pipeline.addBacksBreakdown['ADJ-DEPR']).toBe(50000);
    expect(pipeline.adjustedProfitBeforeCapitalAllowance).toBe(250000);

    // Step 3: MIRA Capital Allowance deducted = -35,000
    expect(pipeline.capitalAllowanceTotal).toBe(35000);

    // Final Taxable Income = 200,000 + 50,000 - 35,000 = 215,000
    expect(pipeline.taxableIncomeBeforeLossRelief).toBe(215000);
  });

  test('Requirement 3: Private expenses and non-qualifying donations correctly increase taxable profit', () => {
    const privateExpenseAdj = createTaxAdjustment({
      miraCode: 'ADJ-PRIVATE',
      amount: 12000,
      reason: 'Director personal holiday expenditure charged to company card'
    });

    const nonQualifyingDonationAdj = createTaxAdjustment({
      miraCode: 'ADJ-DONATION',
      amount: 8000,
      reason: 'Sponsorship contribution to non-approved political association'
    });

    const result = calculateTaxableIncomePipeline(
      150000,
      [privateExpenseAdj, nonQualifyingDonationAdj],
      0
    );

    expect(result.addBacksBreakdown['ADJ-PRIVATE']).toBe(12000);
    expect(result.addBacksBreakdown['ADJ-DONATION']).toBe(8000);
    expect(result.totalAddBacks).toBe(20000);

    // Taxable profit increased from 150,000 to 170,000
    expect(result.adjustedProfitBeforeCapitalAllowance).toBe(170000);
    expect(result.taxableIncomeBeforeLossRelief).toBe(170000);
  });

  test('Requirement 4: Overall calculateTaxableIncomePipeline returns exact step-by-step arithmetic matches from Accounting Profit to Final Taxable Income', () => {
    // Exact Step-by-Step Scenario:
    // Accounting Profit = MVR 1,000,000
    // + ADJ-DEPR (Depreciation Add-back) = MVR 120,000
    // + ADJ-FINES (Late Tax Penalty) = MVR 25,000
    // + ADJ-PRIVATE (Personal Perks) = MVR 15,000
    // + ADJ-DONATION (Non-approved Sponsorship) = MVR 10,000
    // + ADJ-CAPITAL (Uncapitalized Laptop Purchase) = MVR 30,000
    // - Allowable Tax-Exempt Income = MVR 50,000
    // = Adjusted Profit = 1,000,000 + 200,000 - 50,000 = MVR 1,150,000
    // - Capital Allowance = MVR 150,000
    // = Final Taxable Income = MVR 1,000,000

    const adjustments = [
      createTaxAdjustment({ miraCode: 'ADJ-DEPR', amount: 120000, reason: 'Depreciation' }),
      createTaxAdjustment({ miraCode: 'ADJ-FINES', amount: 25000, reason: 'MIRA penalty' }),
      createTaxAdjustment({ miraCode: 'ADJ-PRIVATE', amount: 15000, reason: 'Private club membership' }),
      createTaxAdjustment({ miraCode: 'ADJ-DONATION', amount: 10000, reason: 'Unapproved donation' }),
      createTaxAdjustment({ miraCode: 'ADJ-CAPITAL', amount: 30000, reason: 'Uncapitalized asset' }),
      createTaxAdjustment({ miraCode: 'ADJ-OTHER', amount: 50000, reason: 'Exempt foreign income', direction: 'DEDUCTION' })
    ];

    const accountingProfit = 1000000;
    const capitalAllowanceTotal = 150000;

    const pipeline = calculateTaxableIncomePipeline(
      accountingProfit,
      adjustments,
      capitalAllowanceTotal,
      { taxYear: 2026, entityId: 'TEST-ENT-01' }
    );

    // Check exact arithmetic step-by-step
    expect(pipeline.accountingProfit).toBe(1000000);
    expect(pipeline.totalAddBacks).toBe(200000);
    expect(pipeline.totalAllowableDeductions).toBe(50000);
    expect(pipeline.adjustedProfitBeforeCapitalAllowance).toBe(1150000);
    expect(pipeline.capitalAllowanceTotal).toBe(150000);
    expect(pipeline.taxableIncomeBeforeLossRelief).toBe(1000000);
    expect(pipeline.isTaxLoss).toBe(false);
    expect(pipeline.taxLossAmount).toBe(0);
  });

  test('Section 6.1: Enforces standard MIRA Adjustment Codes', () => {
    const expectedCodes: MiraAdjustmentCode[] = [
      'ADJ-DEPR',
      'ADJ-FINES',
      'ADJ-DONATION',
      'ADJ-PRIVATE',
      'ADJ-CAPITAL',
      'ADJ-OWNER',
      'ADJ-RELATED',
      'ADJ-OTHER'
    ];

    expectedCodes.forEach(code => {
      expect(MIRA_ADJUSTMENT_CODES[code]).toBeDefined();
      expect(MIRA_ADJUSTMENT_CODES[code].code).toBe(code);
      expect(MIRA_ADJUSTMENT_CODES[code].direction).toBeDefined();
    });
  });

  test('Ignores REJECTED adjustments and handles PENDING status correctly', () => {
    const adjustments = [
      createTaxAdjustment({ miraCode: 'ADJ-FINES', amount: 10000, reviewStatus: 'APPROVED' }),
      createTaxAdjustment({ miraCode: 'ADJ-PRIVATE', amount: 25000, reviewStatus: 'REJECTED' }),
      createTaxAdjustment({ miraCode: 'ADJ-DONATION', amount: 15000, reviewStatus: 'PENDING' })
    ];

    // Default (includePendingAdjustments = false) -> Only APPROVED is included
    const resultStrict = calculateTaxableIncomePipeline(100000, adjustments, 0);
    expect(resultStrict.totalAddBacks).toBe(10000);

    // includePendingAdjustments = true -> APPROVED + PENDING included, REJECTED still ignored
    const resultPendingIncluded = calculateTaxableIncomePipeline(100000, adjustments, 0, {
      includePendingAdjustments: true
    });
    expect(resultPendingIncluded.totalAddBacks).toBe(25000); // 10000 + 15000
  });

  test('Identifies Tax Losses when Capital Allowances exceed Adjusted Profit', () => {
    const accountingProfit = 100000;
    const adjustments = [
      createTaxAdjustment({ miraCode: 'ADJ-DEPR', amount: 20000 })
    ];
    // Adjusted Profit = 100,000 + 20,000 = 120,000
    // Capital Allowance = 180,000
    // Taxable Income = 120,000 - 180,000 = -60,000 (Tax Loss)

    const result = calculateTaxableIncomePipeline(accountingProfit, adjustments, 180000);

    expect(result.adjustedProfitBeforeCapitalAllowance).toBe(120000);
    expect(result.netCapitalAllowanceDeduction).toBe(180000);
    expect(result.taxableIncomeBeforeLossRelief).toBe(0);
    expect(result.isTaxLoss).toBe(true);
    expect(result.taxLossAmount).toBe(60000);
  });

});

