import { describe, it, expect, beforeEach } from 'vitest';
import { TaxLossLotEngine } from '../../src/services/tax/taxLossLotEngine';
import { IncomeTaxEngineService } from '../../src/services/tax/incomeTaxEngineService';
import { defaultRuleResolver } from '../../src/regulatory/resolvers/ruleResolver';
import { TaxLossLot } from '../../src/types/taxLoss';

describe('Phase 31 — Tax Loss Lot Engine & FIFO Loss Relief Regression Suite', () => {
  let engine: TaxLossLotEngine;
  const tenantId = 'TENANT-MIRA-001';

  beforeEach(() => {
    engine = new TaxLossLotEngine(defaultRuleResolver);
    engine.resetStore();
  });

  // --------------------------------------------------------------------------
  // TEST 1: TAX LOSS GENERATED & LOT INITIALIZATION WITH STATUTORY EXPIRY
  // --------------------------------------------------------------------------
  it('correctly creates a TaxLossLot with Section 30 dynamic 5-year expiry calculation', () => {
    const lot = engine.createLossLot({
      tenantId,
      originTaxYear: 2021,
      amount: 250000.50,
      calculationId: 'CALC-2021-FINAL',
      notes: 'Initial operational tax loss'
    });

    expect(lot.id).toBeDefined();
    expect(lot.tenantId).toBe(tenantId);
    expect(lot.originTaxYear).toBe(2021);
    expect(lot.originalAmount).toBe(250000.50);
    expect(lot.utilisedAmount).toBe(0);
    expect(lot.remainingAmount).toBe(250000.50);
    // Act No. 25/2019 Section 30 specifies 5 years: 2021 + 5 = 2026
    expect(lot.expiryTaxYear).toBe(2026);
    expect(lot.status).toBe('ACTIVE');
    expect(lot.ruleId).toBe('RULE-IT-LOSS-RELIEF-SEC30');
    expect(lot.legalReference).toContain('Income Tax Act (Act No. 25/2019) Section 30');
  });

  // --------------------------------------------------------------------------
  // TEST 2: CURRENT YEAR LOSS DETERMINATION
  // --------------------------------------------------------------------------
  it('automatically records current year tax loss lot when a tax year produces a loss', () => {
    const currentLoss = engine.recordCurrentYearLoss(
      tenantId,
      2022,
      120000,
      'CALC-2022-ANNUAL',
      'Tax loss for year 2022'
    );

    expect(currentLoss.originTaxYear).toBe(2022);
    expect(currentLoss.originalAmount).toBe(120000);
    expect(currentLoss.remainingAmount).toBe(120000);
    expect(currentLoss.expiryTaxYear).toBe(2027); // 2022 + 5
    expect(currentLoss.status).toBe('ACTIVE');

    const lots = engine.getLossLots(tenantId);
    expect(lots).toHaveLength(1);
  });

  // --------------------------------------------------------------------------
  // TEST 3: LOSS CARRIED FORWARD & FULL UTILISATION
  // --------------------------------------------------------------------------
  it('carries forward tax loss and absorbs it fully against future taxable profit', () => {
    // 2021 loss: MVR 100,000
    const lot2021 = engine.createLossLot({
      tenantId,
      originTaxYear: 2021,
      amount: 100000,
      calculationId: 'CALC-2021'
    });

    // 2022 profit before loss: MVR 150,000
    const relief = engine.applyLossRelief({
      tenantId,
      taxYear: 2022,
      taxableProfitBeforeLoss: 150000,
      calculationId: 'CALC-2022',
      approvedBy: 'TAX_MANAGER_01'
    });

    expect(relief.taxableProfitBeforeLoss).toBe(150000);
    expect(relief.totalLossReliefApplied).toBe(100000);
    expect(relief.netTaxableIncome).toBe(50000);
    expect(relief.isTaxLoss).toBe(false);

    // Verify utilisation record
    expect(relief.utilisations).toHaveLength(1);
    expect(relief.utilisations[0].lossLotId).toBe(lot2021.id);
    expect(relief.utilisations[0].originTaxYear).toBe(2021);
    expect(relief.utilisations[0].taxYear).toBe(2022);
    expect(relief.utilisations[0].amount).toBe(100000);
    expect(relief.utilisations[0].approvedBy).toBe('TAX_MANAGER_01');

    // Verify lot status is updated to FULLY_UTILISED
    const updatedLot = engine.getLossLotById(lot2021.id);
    expect(updatedLot?.utilisedAmount).toBe(100000);
    expect(updatedLot?.remainingAmount).toBe(0);
    expect(updatedLot?.status).toBe('FULLY_UTILISED');
  });

  // --------------------------------------------------------------------------
  // TEST 4: PARTIAL UTILISATION & REMAINING LOT BALANCE
  // --------------------------------------------------------------------------
  it('accurately executes partial utilisation, updating remaining amount and transitioning status to PARTIALLY_UTILISED', () => {
    // 2021 loss: MVR 300,000
    const lot2021 = engine.createLossLot({
      tenantId,
      originTaxYear: 2021,
      amount: 300000
    });

    // 2022 profit: MVR 100,000 -> partial utilisation of 100k
    const relief2022 = engine.applyLossRelief({
      tenantId,
      taxYear: 2022,
      taxableProfitBeforeLoss: 100000,
      calculationId: 'CALC-2022'
    });

    expect(relief2022.totalLossReliefApplied).toBe(100000);
    expect(relief2022.netTaxableIncome).toBe(0);

    const lotAfter2022 = engine.getLossLotById(lot2021.id);
    expect(lotAfter2022?.utilisedAmount).toBe(100000);
    expect(lotAfter2022?.remainingAmount).toBe(200000);
    expect(lotAfter2022?.status).toBe('PARTIALLY_UTILISED');

    // 2023 profit: MVR 80,000 -> further partial utilisation of 80k
    const relief2023 = engine.applyLossRelief({
      tenantId,
      taxYear: 2023,
      taxableProfitBeforeLoss: 80000,
      calculationId: 'CALC-2023'
    });

    expect(relief2023.totalLossReliefApplied).toBe(80000);
    expect(relief2023.netTaxableIncome).toBe(0);

    const lotAfter2023 = engine.getLossLotById(lot2021.id);
    expect(lotAfter2023?.utilisedAmount).toBe(180000); // 100k + 80k
    expect(lotAfter2023?.remainingAmount).toBe(120000); // 300k - 180k
    expect(lotAfter2023?.status).toBe('PARTIALLY_UTILISED');

    // Verify all utilisations on the lot
    const utilisations = engine.getLotUtilisations(lot2021.id);
    expect(utilisations).toHaveLength(2);
    expect(utilisations[0].amount).toBe(100000);
    expect(utilisations[1].amount).toBe(80000);
  });

  // --------------------------------------------------------------------------
  // TEST 5: MULTIPLE LOSS YEARS & STRICT FIFO UTILISATION ORDERING
  // --------------------------------------------------------------------------
  it('enforces strict statutory FIFO ordering across multiple loss years (earliest loss absorbed first)', () => {
    // 2020 loss: MVR 50,000
    const lot2020 = engine.createLossLot({ tenantId, originTaxYear: 2020, amount: 50000 });
    // 2021 loss: MVR 100,000
    const lot2021 = engine.createLossLot({ tenantId, originTaxYear: 2021, amount: 100000 });
    // 2022 loss: MVR 200,000
    const lot2022 = engine.createLossLot({ tenantId, originTaxYear: 2022, amount: 200000 });

    // 2023 profit before loss: MVR 120,000
    // FIFO expects:
    // 1. All MVR 50,000 from 2020 (remaining: 0, FULLY_UTILISED)
    // 2. MVR 70,000 from 2021 (remaining: 30,000, PARTIALLY_UTILISED)
    // 3. MVR 0 from 2022 (remaining: 200,000, ACTIVE)
    const relief = engine.applyLossRelief({
      tenantId,
      taxYear: 2023,
      taxableProfitBeforeLoss: 120000,
      calculationId: 'CALC-2023-FIFO'
    });

    expect(relief.totalLossReliefApplied).toBe(120000);
    expect(relief.netTaxableIncome).toBe(0);
    expect(relief.utilisations).toHaveLength(2);

    expect(relief.utilisations[0].lossLotId).toBe(lot2020.id);
    expect(relief.utilisations[0].originTaxYear).toBe(2020);
    expect(relief.utilisations[0].amount).toBe(50000);

    expect(relief.utilisations[1].lossLotId).toBe(lot2021.id);
    expect(relief.utilisations[1].originTaxYear).toBe(2021);
    expect(relief.utilisations[1].amount).toBe(70000);

    expect(engine.getLossLotById(lot2020.id)?.remainingAmount).toBe(0);
    expect(engine.getLossLotById(lot2020.id)?.status).toBe('FULLY_UTILISED');

    expect(engine.getLossLotById(lot2021.id)?.remainingAmount).toBe(30000);
    expect(engine.getLossLotById(lot2021.id)?.status).toBe('PARTIALLY_UTILISED');

    expect(engine.getLossLotById(lot2022.id)?.remainingAmount).toBe(200000);
    expect(engine.getLossLotById(lot2022.id)?.status).toBe('ACTIVE');
  });

  // --------------------------------------------------------------------------
  // TEST 6: EXPIRY RULE ENFORCEMENT UNDER SECTION 30 (5 YEARS)
  // --------------------------------------------------------------------------
  it('strictly expires losses older than 5 years and forbids their absorption against taxable profits', () => {
    // 2020 loss: expiry is 2025 (2020 + 5)
    const lot2020 = engine.createLossLot({ tenantId, originTaxYear: 2020, amount: 80000 });
    // 2022 loss: expiry is 2027 (2022 + 5)
    const lot2022 = engine.createLossLot({ tenantId, originTaxYear: 2022, amount: 60000 });

    // In tax year 2026:
    // Lot 2020 is past expiry (2026 > 2025) -> EXPIRED
    // Lot 2022 is valid (2026 <= 2027) -> ACTIVE
    const relief2026 = engine.applyLossRelief({
      tenantId,
      taxYear: 2026,
      taxableProfitBeforeLoss: 100000,
      calculationId: 'CALC-2026'
    });

    expect(relief2026.expiredLossLots).toHaveLength(1);
    expect(relief2026.expiredLossLots[0].id).toBe(lot2020.id);
    expect(relief2026.expiredLossLots[0].status).toBe('EXPIRED');

    // Only valid 2022 loss can be absorbed (MVR 60,000)
    expect(relief2026.totalLossReliefApplied).toBe(60000);
    expect(relief2026.netTaxableIncome).toBe(40000); // 100,000 - 60,000 = 40,000

    const updatedLot2020 = engine.getLossLotById(lot2020.id);
    expect(updatedLot2020?.status).toBe('EXPIRED');
    expect(updatedLot2020?.utilisedAmount).toBe(0);
    expect(updatedLot2020?.remainingAmount).toBe(80000);
  });

  // --------------------------------------------------------------------------
  // TEST 7: NO OVER-UTILISATION INVARIANTS
  // --------------------------------------------------------------------------
  it('guarantees no over-utilisation of loss lots or profit capacity', () => {
    const lot = engine.createLossLot({ tenantId, originTaxYear: 2023, amount: 50000 });

    // Try applying against small profit of MVR 20,000
    const relief = engine.applyLossRelief({
      tenantId,
      taxYear: 2024,
      taxableProfitBeforeLoss: 20000
    });

    expect(relief.totalLossReliefApplied).toBe(20000);
    expect(relief.netTaxableIncome).toBe(0);

    const updated = engine.getLossLotById(lot.id);
    expect(updated?.remainingAmount).toBe(30000);
    expect(updated?.utilisedAmount).toBe(20000);
    expect(updated?.remainingAmount! + updated?.utilisedAmount!).toBe(updated?.originalAmount);
  });

  // --------------------------------------------------------------------------
  // TEST 8: REVERT / ROLLBACK OF UTILISATION (ON REVISED OR REJECTED FILINGS)
  // --------------------------------------------------------------------------
  it('reverts utilisations and restores loss lot balances when a calculation is amended/reverted', () => {
    const lot = engine.createLossLot({ tenantId, originTaxYear: 2022, amount: 150000 });

    // Apply relief in calculation CALC-TEMP
    engine.applyLossRelief({
      tenantId,
      taxYear: 2023,
      taxableProfitBeforeLoss: 90000,
      calculationId: 'CALC-TEMP'
    });

    expect(engine.getLossLotById(lot.id)?.remainingAmount).toBe(60000);
    expect(engine.getLotUtilisations(lot.id)).toHaveLength(1);

    // Revert calculation CALC-TEMP
    const rollback = engine.revertUtilisation('CALC-TEMP', tenantId);
    expect(rollback.revertedCount).toBe(1);
    expect(rollback.restoredLots).toHaveLength(1);

    const restoredLot = engine.getLossLotById(lot.id);
    expect(restoredLot?.utilisedAmount).toBe(0);
    expect(restoredLot?.remainingAmount).toBe(150000);
    expect(restoredLot?.status).toBe('ACTIVE');
    expect(engine.getLotUtilisations(lot.id)).toHaveLength(0);
  });

  // --------------------------------------------------------------------------
  // TEST 9: AUTHORITATIVE MIRA 604 SCHEDULE 3 LOSS CARRY-FORWARD MATRIX
  // --------------------------------------------------------------------------
  it('generates a complete MIRA 604 Schedule 3 tax loss matrix with opening, additions, utilisations, expired, and closing balances', () => {
    // Year 2020: Loss MVR 100,000 (expires 2025)
    engine.createLossLot({ tenantId, originTaxYear: 2020, amount: 100000 });
    // Year 2022: Loss MVR 150,000 (expires 2027)
    engine.createLossLot({ tenantId, originTaxYear: 2022, amount: 150000 });

    // Year 2023: Absorb MVR 60,000 from 2020 lot
    engine.applyLossRelief({
      tenantId,
      taxYear: 2023,
      taxableProfitBeforeLoss: 60000,
      calculationId: 'CALC-2023'
    });

    // Year 2024: Absorb MVR 70,000 (MVR 40,000 remaining from 2020, MVR 30,000 from 2022)
    engine.applyLossRelief({
      tenantId,
      taxYear: 2024,
      taxableProfitBeforeLoss: 70000,
      calculationId: 'CALC-2024'
    });

    const schedule2024 = engine.getLossLotSchedule(tenantId, 2024);
    expect(schedule2024.taxYear).toBe(2024);
    expect(schedule2024.totalBroughtForward).toBe(190000); // (100k - 60k) + 150k = 190,000
    expect(schedule2024.totalUtilised).toBe(70000);
    expect(schedule2024.totalExpired).toBe(0);
    expect(schedule2024.totalCarriedForward).toBe(120000); // 150,000 - 30,000 = 120,000
  });

  // --------------------------------------------------------------------------
  // TEST 10: SEAMLESS INTEGRATION WITH INCOME TAX ENGINE SERVICE
  // --------------------------------------------------------------------------
  it('integrates seamlessly with IncomeTaxEngineService using granular TaxLossLots', () => {
    const itEngine = new IncomeTaxEngineService(defaultRuleResolver, engine);

    const lots: TaxLossLot[] = [
      {
        id: 'LOT-2022',
        tenantId,
        originTaxYear: 2022,
        originalAmount: 120000,
        utilisedAmount: 0,
        remainingAmount: 120000,
        expiryTaxYear: 2027,
        status: 'ACTIVE',
        ruleId: 'RULE-IT-LOSS-RELIEF-SEC30',
        createdAt: '2022-12-31',
        updatedAt: '2022-12-31'
      }
    ];

    const finalResult = itEngine.calculateFinalTaxPayable({
      taxpayerType: 'COMPANY',
      taxYear: 2026,
      tin: tenantId,
      accountingProfit: 800000,
      lossLots: lots
    });

    // 800,000 profit - 120,000 loss relief = 680,000 net taxable income
    expect(finalResult.taxableIncomeCalculation.lossReliefApplied).toBe(120000);
    expect(finalResult.taxableIncomeCalculation.netTaxableIncome).toBe(680000);
    expect(finalResult.taxableIncomeCalculation.lossLotUtilisations).toHaveLength(1);
    expect(finalResult.taxableIncomeCalculation.lossLotUtilisations![0].amount).toBe(120000);

    // Company tax on 680,000: (680,000 - 500,000) * 15% = 27,000
    expect(finalResult.taxLiability.totalGrossTaxLiability).toBe(27000);
  });
});
