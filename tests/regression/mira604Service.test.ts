import { describe, test, expect } from 'vitest';
import { generateMira604Return, exportMira604Json } from '../../src/services/tax/mira604Service';
import { calculateEntityTaxLiability } from '../../src/services/tax/entityTaxService';
import { Mira604InputData } from '../../src/types/mira604';
import { createTaxAdjustment } from '../../src/services/tax/taxAdjustmentService';

describe('Phase 8 - MIRA 604 Income Tax Return Generator Tests', () => {

  const sampleInput: Mira604InputData = {
    taxpayer: {
      tin: '1000200300',
      taxpayerName: 'Male Trading Enterprise Pvt Ltd',
      entityType: 'COMPANY',
      taxYear: 2026,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31',
      contactEmail: 'tax@maletrading.mv',
      businessActivity: 'Wholesale & Retail'
    },
    pnl: {
      grossRevenue: 2500000,
      costOfSales: 1200000,
      otherIncome: 50000,
      operatingExpenses: 600000
    },
    adjustments: [
      createTaxAdjustment({ miraCode: 'ADJ-DEPR', amount: 80000, reason: 'Add-back book depreciation' }),
      createTaxAdjustment({ miraCode: 'ADJ-FINES', amount: 20000, reason: 'Statutory late fine' }),
      createTaxAdjustment({ miraCode: 'ADJ-OTHER', amount: 30000, reason: 'Exempt foreign income', direction: 'DEDUCTION' })
    ],
    capitalAllowanceTotal: 120000,
    capitalAllowanceBreakdown: [
      { assetClass: 'Plant & Equipment', allowanceClaimed: 70000 },
      { assetClass: 'Computer Software', allowanceClaimed: 50000 }
    ],
    priorLossRecords: [
      { year: 2024, lossAmount: 50000, utilisedAmount: 0 } // Carry-forward loss MVR 50,000
    ],
    advancePayments: {
      advanceTaxPaid: 20000,
      interimTaxPaid: 15000,
      withholdingTaxDeducted: 5000
    }
  };

  test('Requirement 1: Passing P&L reports, asset allowances, adjustments, and tax results correctly populates all Sections A through F of the MIRA 604 form', () => {
    const returnObj = generateMira604Return(sampleInput);

    // Section A
    expect(returnObj.formId).toBe('MIRA604-2026-1000200300');
    expect(returnObj.formVersion).toBe('V25.1');
    expect(returnObj.sectionA_TaxpayerInfo.tin).toBe('1000200300');

    // Section B
    expect(returnObj.sectionB_Schedule1PnL.grossRevenue).toBe(2500000);
    expect(returnObj.sectionB_Schedule1PnL.accountingProfitBeforeTax).toBe(750000);

    // Section C
    expect(returnObj.sectionC_TaxAdjustments.totalAddBacks).toBe(100000);
    expect(returnObj.sectionC_TaxAdjustments.totalDeductions).toBe(30000);

    // Section D
    expect(returnObj.sectionD_CapitalAllowances.totalClaimableCapitalAllowance).toBe(120000);

    // Section E
    expect(returnObj.sectionE_TaxableIncomeLoss.netTaxableIncome).toBe(650000);

    // Section F
    expect(returnObj.sectionF_TaxComputation.totalTaxPayable).toBe(22500);
  });

  test('Requirement 2: The net tax due calculated on Form 604 matches the engine\'s calculation from Phase 7', () => {
    // 1. Calculate using Phase 7 calculation engine
    const phase7TaxCalc = calculateEntityTaxLiability(700000, 'COMPANY', {
      taxYear: 2026,
      entityName: 'Male Trading Enterprise Pvt Ltd',
      tin: '1000200300',
      priorLossRecords: sampleInput.priorLossRecords
    });

    // 2. Generate Form 604
    const returnObj = generateMira604Return(sampleInput);

    // Form 604 totalTaxPayable must equal Phase 7 totalIncomeTaxDue
    expect(returnObj.sectionF_TaxComputation.totalTaxPayable).toBe(phase7TaxCalc.totalIncomeTaxDue);
    expect(returnObj.sectionF_TaxComputation.effectiveTaxRate).toBe(phase7TaxCalc.effectiveTaxRate);

    // Check net tax due after prepayments (Tax Payable 22,500 - Prepayments 40,000 = -17,500)
    expect(returnObj.sectionF_TaxComputation.netTaxDueOrRefundable).toBe(-17500);
  });

  test('Requirement 3: JSON exported via exportMira604Json validates against MIRAconnect schema requirements', () => {
    const returnObj = generateMira604Return(sampleInput);
    const jsonString = exportMira604Json(returnObj);

    expect(typeof jsonString).toBe('string');
    const parsed = JSON.parse(jsonString);

    expect(parsed.formId).toBe(returnObj.formId);
    expect(parsed.formVersion).toBe('V25.1');
    expect(parsed.submissionStatus).toBe('READY_FOR_FILING');
    expect(parsed.sectionA_TaxpayerInfo.tin).toBe('1000200300');
    expect(parsed.sectionB_Schedule1PnL.grossRevenue).toBe(2500000);
    expect(parsed.sectionC_TaxAdjustments.totalAddBacks).toBe(100000);
    expect(parsed.sectionD_CapitalAllowances.totalClaimableCapitalAllowance).toBe(120000);
    expect(parsed.sectionE_TaxableIncomeLoss.netTaxableIncome).toBe(650000);
    expect(parsed.sectionF_TaxComputation.netTaxDueOrRefundable).toBe(-17500);
    expect(parsed.verificationChecksum).toBeDefined();
  });

  test('Requirement 4: Incomplete taxpayer metadata (e.g., missing TIN or tax period dates) throws explicit validation errors', () => {
    // Missing TIN
    expect(() => {
      generateMira604Return({
        ...sampleInput,
        taxpayer: {
          ...sampleInput.taxpayer,
          tin: ''
        }
      });
    }).toThrow(/Validation Error: Taxpayer TIN is required/i);

    // Missing Name
    expect(() => {
      generateMira604Return({
        ...sampleInput,
        taxpayer: {
          ...sampleInput.taxpayer,
          taxpayerName: ''
        }
      });
    }).toThrow(/Validation Error: Taxpayer name is required/i);

    // Missing Accounting Period Dates
    expect(() => {
      generateMira604Return({
        ...sampleInput,
        taxpayer: {
          ...sampleInput.taxpayer,
          accountingPeriodStart: ''
        }
      });
    }).toThrow(/Validation Error: Tax accounting period start and end dates are required/i);
  });

});
