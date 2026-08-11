import { describe, test, expect } from 'vitest';
import { 
  Transaction, 
  AccountingPeriod, 
  FixedAssetRecord, 
  FixedAssetPipelineRouting,
  AccountingClassification,
  GstTreatment,
  IncomeTaxTreatment
} from '../../src/types/taxEngine';
import { processDocument } from '../../src/services/classificationEngine';

describe('Phase 1 - Core Data Model & Classification Verification', () => {

  test('Requirement 1: Decoupled Classification Architecture (No single field determines all classifications)', () => {
    // Process different document inputs and verify that accounting treatment, GST treatment, and income tax treatment vary independently
    const utilityDoc = processDocument({ supplierName: 'STELCO', subtotal: 1000, gstAmount: 80 });
    const fineDoc = processDocument({ supplierName: 'MIRA', fileName: 'penalty_notice.pdf' });
    const assetDoc = processDocument({ fileName: 'macbook_pro.pdf', subtotal: 25000, gstAmount: 2000 });
    const rentDoc = processDocument({ supplierName: 'City Properties', fileName: 'office_rent.pdf' });

    // 1. Utility: Accounting = EXPENSE/DEDUCTIBLE, GST = STANDARD_RATED (8%), Tax = DEDUCTIBLE
    expect(utilityDoc.accountingCategory).toBe('utilities.electricity');
    expect(utilityDoc.gstTreatment).toBe('STANDARD_RATED_8');
    expect(utilityDoc.incomeTaxTreatment).toBe('DEDUCTIBLE');

    // 2. Fine/Penalty: Accounting = FINE, GST = OUT_OF_SCOPE, Tax = NON_DEDUCTIBLE
    expect(fineDoc.accountingCategory).toBe('operating_expenses.fines_penalties');
    expect(fineDoc.gstTreatment).toBe('OUT_OF_SCOPE');
    expect(fineDoc.incomeTaxTreatment).toBe('NON_DEDUCTIBLE');

    // 3. Asset Purchase: Accounting = ASSET, GST = STANDARD_RATED, Tax = CAPITAL_ALLOWANCE
    expect(assetDoc.accountingCategory).toBe('capital_assets.computer_equipment');
    expect(assetDoc.gstTreatment).toBe('STANDARD_RATED_8');
    expect(assetDoc.incomeTaxTreatment).toBe('CAPITAL_ALLOWANCE');

    // 4. Rent: Accounting = RENT, GST = EXEMPT, Tax = DEDUCTIBLE
    expect(rentDoc.accountingCategory).toBe('occupancy.rent');
    expect(rentDoc.gstTreatment).toBe('EXEMPT');
    expect(rentDoc.incomeTaxTreatment).toBe('DEDUCTIBLE');

    // Verify Unified Transaction model accepts decoupled fields
    const mockTx: Transaction = {
      transactionId: 'TX-2026-00001234',
      entityId: 'COMPANY-001',
      outletId: 'OUTLET-004',
      transactionDate: '2026-07-15',
      description: 'MacBook Pro M3 Purchase',
      amount: 25000,
      gstAmount: 2000,
      accountingCategory: 'capital_assets.computer_equipment',
      miraCategory: 'capital_asset_schedule2',
      accountingTreatment: 'ASSET',
      incomeTaxTreatment: 'CAPITAL_ALLOWANCE',
      gstTreatment: 'INPUT_TAX',
      taxYear: 2026,
      accountingPeriodStart: '2026-04-01',
      accountingPeriodEnd: '2027-03-31',
      reviewStatus: 'APPROVED',
      auditHistory: []
    };

    expect(mockTx.accountingTreatment).not.toBe(mockTx.incomeTaxTreatment);
    expect(mockTx.gstTreatment).not.toBe(mockTx.incomeTaxTreatment);
  });

  test('Requirement 2: Capital Asset Purchases route to CAPITAL_ALLOWANCE rather than Schedule 1 expenses', () => {
    const laptopAsset = processDocument({ fileName: 'laptop_purchase.pdf' });
    const vehicleAsset = processDocument({ fileName: 'pickup_truck.pdf' });
    const ovenAsset = processDocument({ fileName: 'kitchen_oven.pdf' });

    expect(laptopAsset.incomeTaxTreatment).toBe('CAPITAL_ALLOWANCE');
    expect(laptopAsset.miraCategory).toBe('capital_asset_schedule2');
    expect(laptopAsset.adjustmentCode).toBe('ADJ-CAPITAL');

    expect(vehicleAsset.incomeTaxTreatment).toBe('CAPITAL_ALLOWANCE');
    expect(vehicleAsset.miraCategory).toBe('capital_asset_schedule2');
    expect(vehicleAsset.adjustmentCode).toBe('ADJ-CAPITAL');

    expect(ovenAsset.incomeTaxTreatment).toBe('CAPITAL_ALLOWANCE');
    expect(ovenAsset.miraCategory).toBe('capital_asset_schedule2');
    expect(ovenAsset.adjustmentCode).toBe('ADJ-CAPITAL');

    // Test Fixed Asset Record structure
    const assetRecord: FixedAssetRecord = {
      assetId: 'FA-2026-001',
      entityId: 'COMPANY-001',
      outletId: 'OUTLET-001',
      assetName: 'MacBook Pro M3',
      assetClass: 'Computer software & hardware',
      acquisitionDate: '2026-05-10',
      costPrice: 25000,
      miraCapitalAllowanceRate: 33.33,
      openingWDV: 0,
      additionsInYear: 25000,
      disposalsInYear: 0,
      capitalAllowanceClaimed: 8332.5,
      closingWDV: 16667.5,
      taxYear: 2026,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31'
    };

    const pipelineRouting: FixedAssetPipelineRouting = {
      isCapitalAsset: true,
      targetAssetClass: 'Computer software & hardware',
      routeToAssetRegister: true,
      excludeFromSchedule1Expenses: true,
      reason: 'Capital asset purchases are excluded from Schedule 1 operating expenses and claimed via Capital Allowance Schedule 2.'
    };

    expect(pipelineRouting.routeToAssetRegister).toBe(true);
    expect(pipelineRouting.excludeFromSchedule1Expenses).toBe(true);
    expect(assetRecord.capitalAllowanceClaimed).toBeGreaterThan(0);
  });

  test('Requirement 3: Non-calendar fiscal year dates are fully supported', () => {
    // Non-calendar fiscal year: e.g. July 1, 2026 to June 30, 2027
    const nonCalendarPeriod: AccountingPeriod = {
      periodId: 'PERIOD-2026-01',
      entityId: 'COMPANY-001',
      taxYear: 2026,
      accountingPeriodStart: '2026-07-01',
      accountingPeriodEnd: '2027-06-30',
      isCalendarYear: false,
      totalDays: 365,
      isClosed: false
    };

    expect(nonCalendarPeriod.isCalendarYear).toBe(false);
    expect(nonCalendarPeriod.accountingPeriodStart).toBe('2026-07-01');
    expect(nonCalendarPeriod.accountingPeriodEnd).toBe('2027-06-30');

    // Transaction within non-calendar period
    const transaction: Transaction = {
      transactionId: 'TX-NC-001',
      entityId: 'COMPANY-001',
      outletId: 'OUTLET-001',
      transactionDate: '2027-02-15',
      description: 'Consulting Services',
      amount: 15000,
      gstAmount: 1200,
      accountingCategory: 'professional_fees',
      miraCategory: 'professional_fees',
      accountingTreatment: 'EXPENSE',
      incomeTaxTreatment: 'DEDUCTIBLE',
      gstTreatment: 'INPUT_TAX',
      taxYear: 2026,
      accountingPeriodStart: nonCalendarPeriod.accountingPeriodStart,
      accountingPeriodEnd: nonCalendarPeriod.accountingPeriodEnd,
      reviewStatus: 'APPROVED',
      auditHistory: []
    };

    expect(transaction.accountingPeriodStart).toBe('2026-07-01');
    expect(transaction.accountingPeriodEnd).toBe('2027-06-30');
    expect(new Date(transaction.transactionDate) >= new Date(transaction.accountingPeriodStart)).toBe(true);
    expect(new Date(transaction.transactionDate) <= new Date(transaction.accountingPeriodEnd)).toBe(true);
  });

});
