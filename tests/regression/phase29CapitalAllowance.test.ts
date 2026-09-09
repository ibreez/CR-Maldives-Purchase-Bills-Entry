import { describe, test, expect } from 'vitest';
import {
  CapitalAllowanceEngine,
  defaultCapitalAllowanceEngine
} from '../../src/services/tax/capitalAllowanceEngine';
import {
  calculateCapitalAllowance,
  generateSchedule2CapitalAllowanceSummary
} from '../../src/services/tax/capitalAllowanceService';
import {
  createFixedAssetRecord,
  toAuthoritativeFixedAsset
} from '../../src/services/assets/fixedAssetService';
import { defaultRuleResolver } from '../../src/regulatory/resolvers/ruleResolver';
import { FixedAsset } from '../../src/types/capitalAllowance';

describe('Phase 29: Authoritative Capital Allowance Engine', () => {
  const engine = defaultCapitalAllowanceEngine;

  test('Requirement 1: Asset acquisition creates structured FixedAsset and Movement with resolved RegulatoryRule', () => {
    const { asset, movement } = engine.createFixedAsset({
      assetId: 'AST-2026-001',
      entityId: 'CORP-MALE-01',
      assetName: 'Delivery Van for Logistics',
      taxClassification: 'MOTOR_VEHICLES',
      cost: 250000,
      acquisitionDate: '2026-01-15',
      inServiceDate: '2026-01-15',
      accountingUsefulLifeYears: 5,
      accountingMethod: 'STRAIGHT_LINE'
    });

    expect(asset.assetId).toBe('AST-2026-001');
    expect(asset.cost).toBe(250000);
    expect(asset.taxBasis).toBe(250000);
    expect(asset.allowanceClaimed).toBe(0);
    expect(asset.closingTaxValue).toBe(250000);
    expect(asset.status).toBe('ACTIVE');
    expect(asset.isDisposed).toBe(false);
    expect(asset.accountingCarryingAmount).toBe(250000);
    expect(asset.accumulatedAccountingDepreciation).toBe(0);

    // Rule Resolution without hardcoding
    expect(asset.applicableRuleId).toBe('RULE-CA-VEHICLES-20');

    // Immutable Audit Movement
    expect(movement.movementType).toBe('ACQUISITION');
    expect(movement.costChange).toBe(250000);
    expect(movement.taxBasisBefore).toBe(0);
    expect(movement.taxBasisAfter).toBe(250000);
    expect(movement.ruleId).toBe('RULE-CA-VEHICLES-20');
    expect(movement.ruleVersion).toBe('v25.1');
  });

  test('Requirement 2: Statutory rates resolve dynamically through RegulatoryRule across asset classifications', () => {
    const testCases = [
      { classification: 'BUILDINGS', expectedRate: 4, expectedRuleId: 'RULE-CA-BUILDINGS-4' },
      { classification: 'AIRCRAFT', expectedRate: 7, expectedRuleId: 'RULE-CA-AIRCRAFT-7' },
      { classification: 'WOODEN_MARINE_VESSELS', expectedRate: 7, expectedRuleId: 'RULE-CA-VESSEL-WOOD-7' },
      { classification: 'OTHER_MARINE_VESSELS', expectedRate: 5, expectedRuleId: 'RULE-CA-VESSEL-OTHER-5' },
      { classification: 'FURNITURE_FITTINGS', expectedRate: 10, expectedRuleId: 'RULE-CA-FURNITURE-10' },
      { classification: 'MOTOR_VEHICLES', expectedRate: 20, expectedRuleId: 'RULE-CA-VEHICLES-20' },
      { classification: 'EARTH_MOVING_VEHICLES', expectedRate: 20, expectedRuleId: 'RULE-CA-EARTH-MOVING-20' },
      { classification: 'PLANT_EQUIPMENT', expectedRate: 20, expectedRuleId: 'RULE-CA-PLANT-MACHINERY-20' },
      { classification: 'OFFICE_EQUIPMENT', expectedRate: 20, expectedRuleId: 'RULE-CA-OFFICE-EQUIPMENT-20' },
      { classification: 'COMPUTER_SOFTWARE', expectedRate: 33.33, expectedRuleId: 'RULE-CA-COMPUTERS-IT-33' },
      { classification: 'LOOSE_TOOLS_UTENSILS', expectedRate: 33.33, expectedRuleId: 'RULE-CA-LOOSE-TOOLS-33' }
    ];

    for (const tc of testCases) {
      const resolved = defaultRuleResolver.resolveCapitalAllowanceRule(tc.classification, '2026-01-01');
      expect(resolved.ratePercentage).toBe(tc.expectedRate);
      expect(resolved.rule.ruleId).toBe(tc.expectedRuleId);
      expect(resolved.rule.version).toBe('v25.1');
      expect(resolved.rule.legalReference).toContain('Income Tax Act Section 18');
    }
  });

  test('Requirement 3: Historical rates resolve properly for pre-2020 Business Profit Tax assets', () => {
    // Assets acquired under pre-2020 BPT regime
    const histBuilding = defaultRuleResolver.resolveCapitalAllowanceRule('BUILDINGS', '2018-05-01');
    expect(histBuilding.ratePercentage).toBe(5); // 5% under BPT vs 4% under Income Tax Act
    expect(histBuilding.rule.ruleId).toBe('RULE-CA-HIST-BUILDINGS-5');
    expect(histBuilding.rule.version).toBe('v20.1');
    expect(histBuilding.rule.legalReference).toContain('Business Profit Tax Act');

    const histPlant = defaultRuleResolver.resolveCapitalAllowanceRule('PLANT_EQUIPMENT', '2019-01-01');
    expect(histPlant.ratePercentage).toBe(15); // 15% under BPT vs 20% under Income Tax Act
    expect(histPlant.rule.ruleId).toBe('RULE-CA-HIST-PLANT-15');

    const histVehicle = defaultRuleResolver.resolveCapitalAllowanceRule('MOTOR_VEHICLES', '2017-06-15');
    expect(histVehicle.ratePercentage).toBe(25); // 25% under BPT vs 20% under Income Tax Act
    expect(histVehicle.rule.ruleId).toBe('RULE-CA-HIST-VEHICLES-25');
  });

  test('Requirement 4: Partial-year addition computes accurate pro-rata allowance based on in-service date', () => {
    const { asset } = engine.createFixedAsset({
      assetId: 'AST-2026-PARTIAL',
      entityId: 'CORP-01',
      assetName: 'Commercial Crane',
      taxClassification: 'PLANT_EQUIPMENT', // 20%
      cost: 365000,
      acquisitionDate: '2026-07-01',
      inServiceDate: '2026-07-01' // Exactly 184 days in service in 2026
    });

    const result = engine.calculateAssetCapitalAllowance(asset, 2026);
    const calc = result.calculation;

    expect(calc.isPartialYear).toBe(true);
    expect(calc.statutoryRate).toBe(20);
    expect(calc.cost).toBe(365000);
    expect(calc.fullYearAllowance).toBe(73000); // 365,000 * 20%

    // Pro-rata: 73,000 * (184 / 365) = 36,800
    expect(calc.daysInServiceThisYear).toBe(184);
    expect(calc.allowanceClaimed).toBe(36800);
    expect(calc.closingTaxBasis).toBe(365000 - 36800);
    expect(result.updatedAsset.taxBasis).toBe(328200);
  });

  test('Requirement 5: Asset disposal calculates balancing allowance when proceeds < tax basis', () => {
    // Cost 200,000, Plant 20%, 1 year allowance claimed (40,000), Tax basis = 160,000
    // Disposed in 2026 for 100,000
    const asset: FixedAsset = {
      assetId: 'AST-DISP-LOSS',
      entityId: 'CORP-01',
      assetName: 'Power Generator',
      taxClassification: 'PLANT_EQUIPMENT',
      cost: 200000,
      taxBasis: 160000,
      acquisitionDate: '2025-01-01',
      inServiceDate: '2025-01-01',
      applicableRuleId: 'RULE-CA-PLANT-MACHINERY-20',
      allowanceClaimed: 40000,
      closingTaxValue: 160000,
      isDisposed: true,
      disposalDate: '2026-06-15',
      disposalProceeds: 100000,
      status: 'ACTIVE',
      accountingCarryingAmount: 160000,
      accumulatedAccountingDepreciation: 40000
    };

    const dispCalc = engine.calculateDisposal(asset, 2026);
    expect(dispCalc.gainOrLossOnDisposal).toBe(-60000);
    expect(dispCalc.balancingAllowance).toBe(60000);
    expect(dispCalc.balancingCharge).toBe(0);
    expect(dispCalc.capitalGainExcess).toBe(0);
    expect(dispCalc.closingTaxValue).toBe(0);

    const assetCalc = engine.calculateAssetCapitalAllowance(asset, 2026);
    expect(assetCalc.calculation.balancingAllowance).toBe(60000);
    expect(assetCalc.calculation.balancingCharge).toBe(0);
    expect(assetCalc.calculation.closingTaxBasis).toBe(0);
    expect(assetCalc.updatedAsset.status).toBe('DISPOSED');
    expect(assetCalc.movement?.movementType).toBe('DISPOSAL');
    expect(assetCalc.movement?.balancingAllowance).toBe(60000);
  });

  test('Requirement 6: Asset disposal calculates balancing charge when proceeds > tax basis, capped at prior allowances', () => {
    // Cost 300,000, Vehicle 20%, 2 years allowance claimed (120,000), Tax basis = 180,000
    // Case 6A: Disposed for 220,000 (gain = 40,000 <= 120,000 prior allowance)
    const asset6A: FixedAsset = {
      assetId: 'AST-DISP-GAIN-1',
      entityId: 'CORP-01',
      assetName: 'Executive SUV',
      taxClassification: 'MOTOR_VEHICLES',
      cost: 300000,
      taxBasis: 180000,
      acquisitionDate: '2024-01-01',
      inServiceDate: '2024-01-01',
      applicableRuleId: 'RULE-CA-VEHICLES-20',
      allowanceClaimed: 120000,
      closingTaxValue: 180000,
      isDisposed: true,
      disposalDate: '2026-08-20',
      disposalProceeds: 220000,
      status: 'ACTIVE',
      accountingCarryingAmount: 180000,
      accumulatedAccountingDepreciation: 120000
    };

    const disp6A = engine.calculateDisposal(asset6A, 2026);
    expect(disp6A.gainOrLossOnDisposal).toBe(40000);
    expect(disp6A.balancingAllowance).toBe(0);
    expect(disp6A.balancingCharge).toBe(40000);
    expect(disp6A.capitalGainExcess).toBe(0);

    // Case 6B: Disposed for 350,000 (proceeds exceed original cost 300,000)
    // Excess = 170,000 -> Balancing Charge capped at 120,000 (prior allowance), 50,000 is Capital Gain
    const asset6B: FixedAsset = {
      ...asset6A,
      assetId: 'AST-DISP-GAIN-EXCESS',
      disposalProceeds: 350000
    };

    const disp6B = engine.calculateDisposal(asset6B, 2026);
    expect(disp6B.gainOrLossOnDisposal).toBe(170000);
    expect(disp6B.balancingCharge).toBe(120000);
    expect(disp6B.capitalGainExcess).toBe(50000);
  });

  test('Requirement 7: Tax basis never becomes negative even over multiple subsequent years', () => {
    const { asset } = engine.createFixedAsset({
      assetId: 'AST-LAPTOP-MULTI',
      entityId: 'CORP-01',
      assetName: 'High-End Developer Laptop',
      taxClassification: 'COMPUTER_SOFTWARE', // 33.33%
      cost: 30000,
      acquisitionDate: '2022-01-01',
      inServiceDate: '2022-01-01'
    });

    let currentAsset = asset;

    // Simulate 6 tax years (2022 to 2027)
    for (let year = 2022; year <= 2027; year++) {
      const res = engine.calculateAssetCapitalAllowance(currentAsset, year, { simulatePastYears: true });
      expect(res.calculation.closingTaxBasis).toBeGreaterThanOrEqual(0);
      expect(res.calculation.allowanceClaimed).toBeGreaterThanOrEqual(0);
      expect(res.updatedAsset.taxBasis).toBeGreaterThanOrEqual(0);
      currentAsset = res.updatedAsset;
    }

    // By Year 4+ (2025), asset should be fully allowed with tax basis == 0
    expect(currentAsset.taxBasis).toBe(0);
    expect(currentAsset.status).toBe('FULLY_ALLOWED');
  });

  test('Requirement 8: Accounting depreciation never changes tax basis directly and produces tax add-back', () => {
    const { asset } = engine.createFixedAsset({
      assetId: 'AST-SEPARATION-01',
      entityId: 'CORP-01',
      assetName: 'Office Fitout',
      taxClassification: 'FURNITURE_FITTINGS', // Tax rate 10%
      cost: 100000,
      acquisitionDate: '2026-01-01',
      inServiceDate: '2026-01-01',
      accountingUsefulLifeYears: 4, // Book depreciation 25% (Straight Line)
      accountingMethod: 'STRAIGHT_LINE'
    });

    // Compute Book Depreciation
    const bookDep = engine.calculateAccountingDepreciation(asset, 2026);
    expect(bookDep.depreciationAmount).toBe(25000); // 100,000 / 4
    expect(bookDep.carryingAmountAfter).toBe(75000);

    // Compute Tax Capital Allowance
    const taxRes = engine.calculateAssetCapitalAllowance(asset, 2026);
    expect(taxRes.calculation.fullYearAllowance).toBe(10000); // 100,000 * 10%
    expect(taxRes.calculation.allowanceClaimed).toBe(10000);
    expect(taxRes.calculation.closingTaxBasis).toBe(90000); // 100,000 - 10,000

    // Verify separation: Book depreciation does NOT alter taxBasis
    expect(taxRes.updatedAsset.taxBasis).toBe(90000);
    expect(taxRes.updatedAsset.accountingCarryingAmount).toBe(75000);

    // Accounting depreciation is included as Section C Add-back
    expect(taxRes.calculation.accountingDepreciationAddback).toBe(25000);
  });

  test('Requirement 9: Low-Value Assets (<= MVR 10,000 or Loose Tools) receive 100% immediate write-off under Section 18(d)', () => {
    const { asset: lowValAsset } = engine.createFixedAsset({
      assetId: 'AST-MONITOR-LOWVAL',
      entityId: 'CORP-01',
      assetName: '27-inch Office Monitor',
      taxClassification: 'OFFICE_EQUIPMENT',
      cost: 7500,
      acquisitionDate: '2026-03-01',
      inServiceDate: '2026-03-01'
    });

    const res = engine.calculateAssetCapitalAllowance(lowValAsset, 2026);
    expect(res.calculation.isLowValueWriteOff).toBe(true);
    expect(res.calculation.statutoryRate).toBe(100);
    expect(res.calculation.allowanceClaimed).toBe(7500);
    expect(res.calculation.closingTaxBasis).toBe(0);
    expect(res.updatedAsset.status).toBe('FULLY_ALLOWED');
    expect(res.movement?.movementType).toBe('LOW_VALUE_WRITEOFF');
  });

  test('Requirement 10: Generates grouped Tax Asset Pools and complete MIRA 604 Tax Reconciliation', () => {
    const asset1 = engine.createFixedAsset({
      assetId: 'AST-POOL-BLD',
      entityId: 'CORP-01',
      assetName: 'Commercial HQ Building',
      taxClassification: 'BUILDINGS',
      cost: 2000000,
      acquisitionDate: '2026-01-01'
    }).asset;

    const asset2 = engine.createFixedAsset({
      assetId: 'AST-POOL-VEH',
      entityId: 'CORP-01',
      assetName: 'Company Transport Van',
      taxClassification: 'MOTOR_VEHICLES',
      cost: 250000,
      acquisitionDate: '2026-01-01'
    }).asset;

    const asset3 = engine.createFixedAsset({
      assetId: 'AST-POOL-IT',
      entityId: 'CORP-01',
      assetName: 'Enterprise ERP License',
      taxClassification: 'COMPUTER_SOFTWARE',
      cost: 90000,
      acquisitionDate: '2026-01-01'
    }).asset;

    const assets = [asset1, asset2, asset3];

    // Generate Pools
    const pools = engine.generateTaxAssetPools(assets, 2026);
    expect(pools.length).toBe(3);

    const bldPool = pools.find(p => p.taxClassification === 'BUILDINGS');
    expect(bldPool?.applicableRate).toBe(4);
    expect(bldPool?.allowanceClaimed).toBe(80000); // 2,000,000 * 4%

    const vehPool = pools.find(p => p.taxClassification === 'MOTOR_VEHICLES');
    expect(vehPool?.applicableRate).toBe(20);
    expect(vehPool?.allowanceClaimed).toBe(50000); // 250,000 * 20%

    const itPool = pools.find(p => p.taxClassification === 'COMPUTER_SOFTWARE');
    expect(itPool?.applicableRate).toBe(33.33);
    expect(itPool?.allowanceClaimed).toBe(29997); // 90,000 * 33.33%

    // Generate Reconciliation Report
    const recon = engine.generateTaxReconciliation(assets, 2026);
    expect(recon.taxYear).toBe(2026);
    expect(recon.totalCostOfAssets).toBe(2340000);
    expect(recon.totalCapitalAllowanceClaimed).toBe(80000 + 50000 + 29997);
    expect(recon.totalNetTaxAllowanceDeduction).toBe(159997);
    expect(recon.totalClosingTaxBasis).toBe(2340000 - 159997);
  });

  test('Requirement 11: Backward compatibility with legacy FixedAssetRecord and summary helpers', () => {
    const legacyRecord = createFixedAssetRecord({
      assetName: 'Legacy Workshop Tool',
      assetClass: 'PLANT_EQUIPMENT',
      cost: 50000,
      acquisitionDate: '2026-01-01',
      taxYearAcquired: 2026
    });

    const res = calculateCapitalAllowance(legacyRecord, 2026);
    expect(res.cost).toBe(50000);
    expect(res.rate).toBe(20);
    expect(res.claimableAllowance).toBe(10000);
    expect(res.closingWDV).toBe(40000);

    const authAsset = toAuthoritativeFixedAsset(legacyRecord);
    expect(authAsset.taxClassification).toBe('Plant & equipment / Machinery');
    expect(authAsset.cost).toBe(50000);
  });
});
