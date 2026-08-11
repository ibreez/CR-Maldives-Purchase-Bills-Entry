import { describe, test, expect } from 'vitest';
import { 
  MIRA_COMPANY_TAX_CONFIG, 
  MIRA_SOLE_PROPRIETOR_BRACKETS, 
  calculateCompanyTaxThreshold 
} from '../../src/config/miraTaxRates';
import { calculateEntityTaxLiability } from '../../src/services/tax/entityTaxService';

describe('Phase 7 - Corporate & Sole Proprietor Income Tax Engine Tests', () => {

  test('Requirement 1: Companies with taxable income under MVR 500,000 incur MVR 0 tax', () => {
    const resLow = calculateEntityTaxLiability(450000, 'COMPANY', { taxYear: 2026 });
    expect(resLow.grossTaxableIncome).toBe(450000);
    expect(resLow.taxThreshold).toBe(500000);
    expect(resLow.totalIncomeTaxDue).toBe(0);
    expect(resLow.effectiveTaxRate).toBe(0);

    const resExactThreshold = calculateEntityTaxLiability(500000, 'COMPANY', { taxYear: 2026 });
    expect(resExactThreshold.totalIncomeTaxDue).toBe(0);
    expect(resExactThreshold.effectiveTaxRate).toBe(0);
  });

  test('Requirement 2: Companies with taxable income over MVR 500,000 pay exactly 15% only on the amount exceeding MVR 500,000', () => {
    // Taxable Income = MVR 1,200,000 -> Excess = 700,000 * 15% = MVR 105,000
    const resHigh = calculateEntityTaxLiability(1200000, 'COMPANY', { taxYear: 2026 });
    expect(resHigh.grossTaxableIncome).toBe(1200000);
    expect(resHigh.netTaxableIncome).toBe(1200000);
    expect(resHigh.taxThreshold).toBe(500000);
    expect(resHigh.totalIncomeTaxDue).toBe(105000); // (1,200,000 - 500,000) * 0.15
    expect(resHigh.effectiveTaxRate).toBe(8.75); // (105,000 / 1,200,000) * 100

    // Additional check: MVR 2,000,000 -> Excess = 1,500,000 * 15% = MVR 225,000
    const res2M = calculateEntityTaxLiability(2000000, 'COMPANY', { taxYear: 2026 });
    expect(res2M.totalIncomeTaxDue).toBe(225000);
    expect(res2M.effectiveTaxRate).toBe(11.25);
  });

  test('Requirement 3: Sole Proprietors are evaluated against progressive individual tax bands', () => {
    // Verify Progressive Bands configuration
    expect(MIRA_SOLE_PROPRIETOR_BRACKETS[0].ratePercentage).toBe(0);   // 0 - 720k
    expect(MIRA_SOLE_PROPRIETOR_BRACKETS[1].ratePercentage).toBe(5);   // 720k - 1.2M
    expect(MIRA_SOLE_PROPRIETOR_BRACKETS[2].ratePercentage).toBe(8);   // 1.2M - 1.8M
    expect(MIRA_SOLE_PROPRIETOR_BRACKETS[3].ratePercentage).toBe(12);  // 1.8M - 2.4M
    expect(MIRA_SOLE_PROPRIETOR_BRACKETS[4].ratePercentage).toBe(15);  // Over 2.4M

    // Income = MVR 3,000,000
    // Bracket 1: 0 to 720,000 (0%) -> Tax = 0
    // Bracket 2: 720,001 to 1,200,000 (480,000 @ 5%) -> Tax = 24,000
    // Bracket 3: 1,200,001 to 1,800,000 (600,000 @ 8%) -> Tax = 48,000
    // Bracket 4: 1,800,001 to 2,400,000 (600,000 @ 12%) -> Tax = 72,000
    // Bracket 5: Over 2,400,000 (600,000 @ 15%) -> Tax = 90,000
    // Total Tax Due = 234,000
    const resSoleProp = calculateEntityTaxLiability(3000000, 'SOLE_PROPRIETOR', { taxYear: 2026 });

    expect(resSoleProp.grossTaxableIncome).toBe(3000000);
    expect(resSoleProp.taxByBracket[0].taxInBracket).toBe(0);
    expect(resSoleProp.taxByBracket[1].taxInBracket).toBe(24000);
    expect(resSoleProp.taxByBracket[2].taxInBracket).toBe(48000);
    expect(resSoleProp.taxByBracket[3].taxInBracket).toBe(72000);
    expect(resSoleProp.taxByBracket[4].taxInBracket).toBe(90000);

    expect(resSoleProp.totalIncomeTaxDue).toBe(234000);
  });

  test('Requirement 4: Business tax losses carry forward up to 5 consecutive years and reduce taxable profit correctly', () => {
    // Current Tax Year = 2026
    const lossRecords = [
      { year: 2024, lossAmount: 100000, utilisedAmount: 0 },    // Age 2 years -> VALID (Carry-forward)
      { year: 2022, lossAmount: 150000, utilisedAmount: 50000 },  // Age 4 years -> VALID (100k remaining)
      { year: 2019, lossAmount: 200000, utilisedAmount: 0 }     // Age 7 years -> EXPIRED (> 5 years limit)
    ];

    // Valid loss relief available = 100,000 + 100,000 = 200,000
    // Expired loss = 200,000

    const resLossRelief = calculateEntityTaxLiability(500000, 'COMPANY', {
      taxYear: 2026,
      priorLossRecords: lossRecords
    });

    expect(resLossRelief.grossTaxableIncome).toBe(500000);
    expect(resLossRelief.priorUnabsorbedLosses).toBe(400000); // 100k + 100k + 200k
    expect(resLossRelief.lossReliefApplied).toBe(200000);
    expect(resLossRelief.expiredLosses).toBe(200000);

    // Net Taxable Income = 500,000 - 200,000 = 300,000
    expect(resLossRelief.netTaxableIncome).toBe(300000);

    // Corporate Tax on Net Taxable Income 300,000 (below 500,000 threshold) = MVR 0
    expect(resLossRelief.totalIncomeTaxDue).toBe(0);
  });

  test('Requirement 5: Effective tax rate calculations are accurate across all entity types', () => {
    // 1. Company (Gross 1,200,000, Tax 105,000) -> 8.75%
    const companyRes = calculateEntityTaxLiability(1200000, 'COMPANY', { taxYear: 2026 });
    expect(companyRes.effectiveTaxRate).toBe(8.75);

    // 2. Sole Proprietor (Gross 3,000,000, Tax 234,000) -> 7.8%
    const solePropRes = calculateEntityTaxLiability(3000000, 'SOLE_PROPRIETOR', { taxYear: 2026 });
    expect(solePropRes.effectiveTaxRate).toBe(7.8);

    // 3. Partnership (Pass-through 0%) -> 0%
    const partnerRes = calculateEntityTaxLiability(800000, 'PARTNERSHIP', { taxYear: 2026 });
    expect(partnerRes.effectiveTaxRate).toBe(0);

    // 4. Company with Loss Relief (Gross 1,000,000, Loss Relief 200,000 -> Net 800,000, Tax (800k - 500k)*15% = 45,000)
    // Effective tax rate on gross = (45,000 / 1,000,000) * 100 = 4.5%
    // Effective tax rate on net = (45,000 / 800,000) * 100 = 5.625% -> 5.63%
    const companyLossRes = calculateEntityTaxLiability(1000000, 'COMPANY', {
      taxYear: 2026,
      priorUnabsorbedLosses: 200000
    });
    expect(companyLossRes.totalIncomeTaxDue).toBe(45000);
    expect(companyLossRes.effectiveTaxRate).toBe(4.5);
    expect(companyLossRes.effectiveTaxRateOnNet).toBe(5.63);
  });

  test('Section 7.1: Pro-rated Corporate Tax Threshold for partial accounting years', () => {
    // 182.5 days (approx half year) -> Threshold = 500,000 * (182.5 / 365) = 250,000
    const thresholdProRata = calculateCompanyTaxThreshold(182.5, 1);
    expect(thresholdProRata).toBe(250000);

    const resProRata = calculateEntityTaxLiability(600000, 'COMPANY', {
      taxYear: 2026,
      accountingDays: 182.5
    });

    expect(resProRata.taxThreshold).toBe(250000);
    // Tax = (600,000 - 250,000) * 15% = 350,000 * 0.15 = 52,500
    expect(resProRata.totalIncomeTaxDue).toBe(52500);
  });

  test('Full Tax Liability breakdown matches requirements', () => {
    const result = calculateEntityTaxLiability(2000000, 'COMPANY', {
      taxYear: 2026,
      entityName: 'BML Trading Pvt Ltd',
      tin: '1000200300'
    });

    expect(result.entityType).toBe('COMPANY');
    expect(result.taxYear).toBe(2026);
    expect(result.entityName).toBe('BML Trading Pvt Ltd');
    expect(result.tin).toBe('1000200300');
    expect(result.grossTaxableIncome).toBe(2000000);
    expect(result.netTaxableIncome).toBe(2000000);
    expect(result.taxThreshold).toBe(500000);
    expect(result.totalIncomeTaxDue).toBe(225000); // (2M - 500k) * 15%
    expect(result.effectiveTaxRate).toBe(11.25);
    expect(result.taxByBracket.length).toBe(2);
  });

});
