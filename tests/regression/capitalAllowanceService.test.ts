import { describe, test, expect } from 'vitest';
import { 
  MIRA_SECTION_83_RATES, 
  getMiraAssetClassRate, 
  createFixedAssetRecord,
  createFixedAssetFromTransaction 
} from '../../src/services/assets/fixedAssetService';
import { 
  calculateCapitalAllowance, 
  generateSchedule2CapitalAllowanceSummary 
} from '../../src/services/tax/capitalAllowanceService';
import { classifyDocument } from '../../src/services/classificationService';
import { createTransactionFromBill } from '../../src/services/accounting/transactionService';
import { generateSchedule1PnL } from '../../src/services/accounting/pnlService';

describe('Phase 4 & 5 - Fixed Asset Register & MIRA Schedule 2 Capital Allowance Engine', () => {

  test('Requirement 1: Asset purchases routed from Phase 1 (incomeTaxTreatment === CAPITAL_ALLOWANCE) populate Fixed Asset Register without affecting Schedule 1 operating expenses', () => {
    const rawAssetBill = {
      invoiceNumber: 'INV-ASSET-2026-99',
      supplierName: 'Apple Store Maldives',
      description: 'MacBook Pro M3 Max Workstations for Engineering Team',
      amount: 120000,
      gstAmount: 9600,
      transactionDate: '2026-03-15'
    };

    // Phase 1: Classification
    const classification = classifyDocument(rawAssetBill);
    expect(classification.incomeTaxTreatment).toBe('CAPITAL_ALLOWANCE');
    expect(classification.accountingTreatment).toBe('ASSET');

    // Phase 2: Create Transaction
    const transaction = createTransactionFromBill(rawAssetBill, classification);
    expect(transaction.incomeTaxTreatment).toBe('CAPITAL_ALLOWANCE');

    // Phase 3: P&L Generation - Verify exclusion from Schedule 1 operating expenses
    const pnlReport = generateSchedule1PnL([transaction], { taxYear: 2026 });
    expect(pnlReport.totalOperatingExpenses).toBe(0);
    expect(pnlReport.capitalAssetPurchasesExcluded).toBe(120000);

    // Phase 4: Populate Fixed Asset Register
    const fixedAsset = createFixedAssetFromTransaction(transaction);
    expect(fixedAsset.assetName).toContain('MacBook Pro');
    expect(fixedAsset.costPrice).toBe(120000);

    // Phase 5: Calculate Capital Allowance
    const allowanceRes = calculateCapitalAllowance(fixedAsset, 2026);
    expect(allowanceRes.cost).toBe(120000);
    expect(allowanceRes.claimableAllowance).toBeGreaterThan(0);
  });

  test('Requirement 2: Capital allowances calculate correctly using exact Section 83 rates', () => {
    expect(MIRA_SECTION_83_RATES.BUILDINGS).toBe(4);
    expect(MIRA_SECTION_83_RATES.AIRCRAFT).toBe(7);
    expect(MIRA_SECTION_83_RATES.WOODEN_MARINE_VESSELS).toBe(7);
    expect(MIRA_SECTION_83_RATES.OTHER_MARINE_VESSELS).toBe(5);
    expect(MIRA_SECTION_83_RATES.FURNITURE_FITTINGS).toBe(10);
    expect(MIRA_SECTION_83_RATES.MOTOR_VEHICLES).toBe(20);
    expect(MIRA_SECTION_83_RATES.EARTH_MOVING_VEHICLES).toBe(20);
    expect(MIRA_SECTION_83_RATES.PLANT_EQUIPMENT).toBe(20);
    expect(MIRA_SECTION_83_RATES.OFFICE_EQUIPMENT).toBe(20);
    expect(MIRA_SECTION_83_RATES.COMPUTER_SOFTWARE).toBe(33.33);
    expect(MIRA_SECTION_83_RATES.LOOSE_TOOLS_UTENSILS).toBe(33.33);

    const computerAsset = createFixedAssetRecord({
      assetName: 'Software System',
      assetClass: 'COMPUTER_SOFTWARE',
      cost: 30000,
      acquisitionDate: '2026-01-01',
      taxYearAcquired: 2026
    });
    expect(computerAsset.miraCapitalAllowanceRate).toBe(33.33);

    const vehicleAsset = createFixedAssetRecord({
      assetName: 'Company Van',
      assetClass: 'MOTOR_VEHICLES',
      cost: 200000,
      acquisitionDate: '2026-01-01',
      taxYearAcquired: 2026
    });
    expect(vehicleAsset.miraCapitalAllowanceRate).toBe(20);

    const buildingAsset = createFixedAssetRecord({
      assetName: 'Commercial Office',
      assetClass: 'BUILDINGS',
      cost: 1000000,
      acquisitionDate: '2026-01-01',
      taxYearAcquired: 2026
    });
    expect(buildingAsset.miraCapitalAllowanceRate).toBe(4);
  });

  test('Requirement 3: Partial-year additions compute accurate pro-rata allowances', () => {
    const vehicle = createFixedAssetRecord({
      assetName: 'Delivery Van',
      assetClass: 'MOTOR_VEHICLES', // 20% rate
      cost: 365000,
      acquisitionDate: '2026-07-01', // Exactly 184 days remaining in year
      daysInServiceThisYear: 184,
      taxYearAcquired: 2026
    });

    const result = calculateCapitalAllowance(vehicle, 2026);

    expect(result.isProRataApplied).toBe(true);
    expect(result.rate).toBe(20);
    expect(result.cost).toBe(365000);

    // Full year allowance = 365,000 * 20% = 73,000
    // Pro-rata allowance = 73,000 * (184 / 365) = 36,800
    expect(result.fullYearAllowance).toBe(73000);
    expect(result.claimableAllowance).toBe(36800);
    expect(result.closingWDV).toBe(365000 - 36800);
  });

  test('Requirement 4: Disposals accurately generate balancing allowances or balancing charges', () => {
    // 4a. Balancing Allowance (Disposal proceeds < WDV)
    const machinery = createFixedAssetRecord({
      assetName: 'Generator Plant',
      assetClass: 'PLANT_EQUIPMENT', // 20%
      cost: 200000,
      acquisitionDate: '2025-01-01',
      taxYearAcquired: 2025,
      isDisposed: true,
      disposalDate: '2026-06-15',
      disposalProceeds: 100000
    });

    const resDisposalLoss = calculateCapitalAllowance(machinery, 2026);
    expect(resDisposalLoss.isDisposed).toBe(true);
    expect(resDisposalLoss.openingWDV).toBe(160000);
    expect(resDisposalLoss.disposalProceeds).toBe(100000);
    expect(resDisposalLoss.balancingAllowance).toBe(60000);
    expect(resDisposalLoss.balancingCharge).toBe(0);
    expect(resDisposalLoss.closingWDV).toBe(0);

    // 4b. Balancing Charge (Disposal proceeds > WDV)
    const pickupTruck = createFixedAssetRecord({
      assetName: 'Toyota Hilux Truck',
      assetClass: 'MOTOR_VEHICLES', // 20%
      cost: 300000,
      acquisitionDate: '2024-01-01',
      taxYearAcquired: 2024,
      isDisposed: true,
      disposalDate: '2026-09-01',
      disposalProceeds: 220000
    });

    const resDisposalGain = calculateCapitalAllowance(pickupTruck, 2026);
    expect(resDisposalGain.isDisposed).toBe(true);
    expect(resDisposalGain.openingWDV).toBe(180000);
    expect(resDisposalGain.disposalProceeds).toBe(220000);
    expect(resDisposalGain.balancingAllowance).toBe(0);
    expect(resDisposalGain.balancingCharge).toBe(40000);
    expect(resDisposalGain.closingWDV).toBe(0);
  });

  test('Requirement 5: Closing WDV never drops below zero', () => {
    const computerServer = createFixedAssetRecord({
      assetName: 'Old Desktop Workstation',
      assetClass: 'COMPUTER_SOFTWARE', // 33.33% rate
      cost: 10000,
      acquisitionDate: '2022-01-01',
      taxYearAcquired: 2022
    });

    // Evaluate over 6 consecutive tax years
    for (let year = 2022; year <= 2027; year++) {
      const res = calculateCapitalAllowance(computerServer, year);
      expect(res.closingWDV).toBeGreaterThanOrEqual(0);
      expect(res.claimableAllowance).toBeGreaterThanOrEqual(0);
    }
  });

  test('Low-Value Assets (<= MVR 10,000 or Loose Tools) receive 100% immediate write-off', () => {
    const lowValLaptop = createFixedAssetRecord({
      assetName: 'Entry Level Monitor',
      assetClass: 'OFFICE_EQUIPMENT',
      cost: 8500,
      acquisitionDate: '2026-04-10',
      taxYearAcquired: 2026
    });

    const result = calculateCapitalAllowance(lowValLaptop, 2026);

    expect(result.isLowValueWriteOff).toBe(true);
    expect(result.cost).toBe(8500);
    expect(result.claimableAllowance).toBe(8500);
    expect(result.closingWDV).toBe(0);
  });

  test('Generates complete MIRA Schedule 2 Capital Allowance Summary Report', () => {
    const assets = [
      createFixedAssetRecord({
        assetName: 'Office Building',
        assetClass: 'BUILDINGS',
        cost: 2000000,
        acquisitionDate: '2026-01-01',
        taxYearAcquired: 2026
      }),
      createFixedAssetRecord({
        assetName: 'MacBook Pro Laptops',
        assetClass: 'COMPUTER_SOFTWARE',
        cost: 60000,
        acquisitionDate: '2026-01-01',
        taxYearAcquired: 2026
      })
    ];

    const report = generateSchedule2CapitalAllowanceSummary(assets, 2026);

    expect(report.taxYear).toBe(2026);
    expect(report.totalCostOfAssets).toBe(2060000);
    expect(report.totalAdditionsInYear).toBe(2060000);

    // Building Allowance (4% of 2M) = 80,000
    // Laptops Allowance (33.33% of 60k) = 19,998
    // Total Capital Allowance = 99,998
    expect(report.totalCapitalAllowanceClaimed).toBe(99998);
    expect(report.totalNetTaxAllowanceDeduction).toBe(99998);
    expect(report.totalClosingWDV).toBe(1960002);
  });

});

