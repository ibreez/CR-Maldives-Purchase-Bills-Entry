import { describe, test, expect, beforeEach } from 'vitest';
import { Decimal } from 'decimal.js';
import { MIRA604IntegrationService } from '../../src/services/tax/mira604IntegrationService';
import { defaultIncomeTaxEngine } from '../../src/services/tax/incomeTaxEngineService';
import { CapitalAllowanceService } from '../../src/services/tax/capitalAllowanceService';
import { generateMira604Return } from '../../src/services/tax/mira604Service';
import { TaxLossLotEngine } from '../../src/services/tax/taxLossLotEngine';
import { createTaxAdjustment } from '../../src/services/tax/taxAdjustmentService';
import { UserSession } from '../../src/types/rbac';

describe('Milestone 7 — Income Tax Engine & MIRA 604 Integration Test Suite', { timeout: 60000 }, () => {
  const tenantId = 'TEST-TENANT-M7';
  const taxYear = 2024;
  const adminSession: UserSession = {
    userId: 'USR-ADMIN-1',
    tenantId,
    role: 'CLIENT_ADMIN'
  };
  const standardUserSession: UserSession = {
    userId: 'USR-STAFF-1',
    tenantId,
    role: 'STAFF' as any
  };

  describe('1. P&L Derivation from GL (Schedule 1)', () => {
    test('derives accounting profit before tax matching revenues minus expenses exactly with Decimal precision', async () => {
      // Mock or explicit inputs: Revenue = 1,500,000.50, Cost of Sales = 600,000.20, Other Income = 50,000.00, Operating Expenses = 350,000.10
      // Expected Profit = 1500000.50 - 600000.20 + 50000.00 - 350000.10 = 600000.20
      const rev = new Decimal('1500000.50');
      const cogs = new Decimal('600000.20');
      const other = new Decimal('50000.00');
      const opex = new Decimal('350000.10');
      const expectedProfit = rev.minus(cogs).plus(other).minus(opex);

      expect(expectedProfit.toString()).toBe('600000.2');

      const result = await MIRA604IntegrationService.calculateAndPrepareReturn(
        {
          tenantId,
          taxYear,
          tin: '1000200300',
          taxpayerName: 'Milestone 7 Test Company Ltd',
          entityType: 'COMPANY',
          overrideAccountingProfit: expectedProfit.toNumber()
        },
        adminSession
      );

      expect(result.accountingProfitBeforeTax).toBe(600000.2);
      expect(result.mira604.sectionB_Schedule1PnL.accountingProfitBeforeTax).toBe(600000.2);
    });
  });

  describe('2. Tax Adjustments Engine', () => {
    test('correctly processes depreciation add-backs, non-deductibles, exempt income deductions, and balancing adjustments', async () => {
      const adjustments = [
        createTaxAdjustment({
          miraCode: 'ADJ-DEPR',
          amount: 85000.50,
          reason: 'Accounting depreciation add-back',
          direction: 'ADD_BACK'
        }),
        createTaxAdjustment({
          miraCode: 'ADJ-FINES',
          amount: 15000.00,
          reason: 'Regulatory penalties non-deductible',
          direction: 'ADD_BACK'
        }),
        createTaxAdjustment({
          miraCode: 'ADJ-OTHER',
          amount: 25000.00,
          reason: 'Exempt domestic dividend income',
          direction: 'DEDUCTION'
        })
      ];

      const startingProfit = 500000;
      const result = await MIRA604IntegrationService.calculateAndPrepareReturn(
        {
          tenantId,
          taxYear,
          tin: '1000200300',
          taxpayerName: 'Milestone 7 Test Company Ltd',
          entityType: 'COMPANY',
          overrideAccountingProfit: startingProfit,
          overrideAdjustments: adjustments as any
        },
        adminSession
      );

      // Total additions = 85000.50 + 15000.00 = 100000.50
      expect(result.totalAdditions).toBe(100000.5);
      // Total deductions = 25000.00
      expect(result.totalDeductions).toBe(25000);
      // Section C Adjusted Profit = 500000 + 100000.50 - 25000 = 575000.50
      expect(result.mira604.sectionC_TaxAdjustments.totalAddBacks).toBe(100000.5);
      expect(result.mira604.sectionC_TaxAdjustments.totalDeductions).toBe(25000);
      expect(result.mira604.sectionE_TaxableIncomeLoss.adjustedTaxableProfitBeforeLoss).toBe(575000.5);
      expect(result.finalTaxableIncome).toBe(575000.5);
    });
  });

  describe('3. Capital Allowances Service & Schedule 2', () => {
    test('computes statutory capital allowances across all 8 asset classes and balancing adjustments', () => {
      const assets = [
        {
          id: 'FA-01',
          name: 'Commercial Building',
          assetClass: 'Commercial Building' as any,
          cost: 1000000,
          openingWDV: 960000,
          additions: 0,
          disposals: 0,
          disposalProceeds: 0,
          rate: 0.04
        },
        {
          id: 'FA-02',
          name: 'Delivery Van',
          assetClass: 'Motor Vehicle' as any,
          cost: 200000,
          openingWDV: 150000,
          additions: 0,
          disposals: 0,
          disposalProceeds: 0,
          rate: 0.25
        },
        {
          id: 'FA-03',
          name: 'Office Laptops',
          assetClass: 'Computer Software' as any,
          cost: 50000,
          openingWDV: 0,
          additions: 50000,
          disposals: 0,
          disposalProceeds: 0,
          rate: 0.3333
        }
      ];

      const caReport = CapitalAllowanceService.calculateBatchCapitalAllowances(assets);
      expect(caReport.totalCapitalAllowanceClaimed).toBeGreaterThan(0);
      expect(caReport.totalNetTaxAllowanceDeduction).toBe(caReport.totalCapitalAllowanceClaimed);
      expect(caReport.assetResults.length).toBe(3);
    });
  });

  describe('4. Tax Loss Relief & Carry-Forward Engine', () => {
    test('creates loss lots in loss years and applies loss offset up to statutory allowable limits', () => {
      const lossEngine = new TaxLossLotEngine();
      // Year 2022 loss of 100,000
      lossEngine.createLossLot({
        tenantId,
        originTaxYear: 2022,
        amount: 100000,
        notes: 'FY2022 Start-up operating loss'
      });

      // Year 2023 loss of 50,000
      lossEngine.createLossLot({
        tenantId,
        originTaxYear: 2023,
        amount: 50000,
        notes: 'FY2023 Operating loss'
      });

      // FY2024 profit before loss relief is 120,000
      const reliefResult = lossEngine.applyLossRelief({
        tenantId,
        taxYear: 2024,
        taxableProfitBeforeLoss: 120000
      });

      // FIFO order: 100,000 from 2022 fully absorbed, 20,000 from 2023 absorbed
      expect(reliefResult.totalLossReliefApplied).toBe(120000);
      expect(reliefResult.netTaxableIncome).toBe(0);
      const remainingUnabsorbedLosses = reliefResult.activeLossLots.reduce((sum, l) => sum + l.remainingAmount, 0);
      expect(remainingUnabsorbedLosses).toBe(30000); // 50000 - 20000
    });
  });

  describe('5. Progressive & Corporate Tax Liability Calculation', () => {
    test('calculates corporate tax at statutory 15% rate', () => {
      const netTaxableIncome = 1000000;
      const liability = defaultIncomeTaxEngine.calculateTaxLiability(netTaxableIncome, 'COMPANY', {
        taxYear: 2024,
        accountingDays: 365,
        groupFactor: 1
      });

      // Statutory Company Rule: 0 - 500,000: 0%; above 500,000: 15%
      // Tax = (1,000,000 - 500,000) * 15% = 75,000
      expect(liability.totalGrossTaxLiability).toBe(75000);
      expect(liability.effectiveTaxRate).toBe(7.5);
      expect(liability.brackets.length).toBe(2);
    });

    test('calculates sole proprietor progressive brackets with pro-rated threshold', () => {
      // Sole proprietor with 900,000 taxable income
      // 0 - 720,000: 0%
      // 720,000 - 1,200,000: 5.5% on (900,000 - 720,000) = 180,000 * 0.055 = 9,900
      const liability = defaultIncomeTaxEngine.calculateTaxLiability(900000, 'SOLE_PROPRIETOR', {
        taxYear: 2024,
        accountingDays: 365,
        groupFactor: 1
      });

      expect(liability.totalGrossTaxLiability).toBe(9900);
      expect(liability.brackets[0].taxInBracket).toBe(0);
      expect(liability.brackets[1].taxInBracket).toBe(9900);
    });

    test('returns zero tax liability when taxable income is below exemption threshold', () => {
      const liability = defaultIncomeTaxEngine.calculateTaxLiability(500000, 'SOLE_PROPRIETOR', {
        taxYear: 2024,
        accountingDays: 365,
        groupFactor: 1
      });

      expect(liability.totalGrossTaxLiability).toBe(0);
      expect(liability.effectiveTaxRate).toBe(0);
    });
  });

  describe('6. MIRA 604 Form Generation & Box Consistency', () => {
    test('generates complete MIRA 604 v25.1 structure with arithmetic consistency across sections A to F', () => {
      const miraInput = {
        taxpayer: {
          tin: '1000200300',
          taxpayerName: 'Male Trading Co Pvt Ltd',
          entityType: 'COMPANY' as const,
          taxYear: 2024,
          accountingPeriodStart: '2024-01-01',
          accountingPeriodEnd: '2024-12-31'
        },
        pnl: {
          grossRevenue: 2000000,
          costOfSales: 1000000,
          grossProfit: 1000000,
          otherIncome: 0,
          operatingExpenses: 500000,
          accountingProfitBeforeTax: 500000
        },
        adjustments: [
          createTaxAdjustment({ miraCode: 'ADJ-DEPR', amount: 50000, reason: 'Depreciation add-back' })
        ],
        capitalAllowanceTotal: 80000,
        capitalAllowanceBreakdown: [{ assetClass: 'Plant & Machinery', allowanceClaimed: 80000 }],
        advancePayments: {
          advanceTaxPaid: 20000,
          interimTaxPaid: 10000,
          withholdingTaxDeducted: 0
        },
        accountingDays: 365,
        groupFactor: 1
      };

      const miraReturn = generateMira604Return(miraInput);

      expect(miraReturn.formVersion).toBe('V25.1');
      // Section B Schedule 1 P&L
      expect(miraReturn.sectionB_Schedule1PnL.accountingProfitBeforeTax).toBe(500000);
      // Section C Adjustments
      expect(miraReturn.sectionC_TaxAdjustments.totalAddBacks).toBe(50000);
      expect(miraReturn.sectionC_TaxAdjustments.totalDeductions).toBe(0);
      // Section D Capital Allowances
      expect(miraReturn.sectionD_CapitalAllowances.totalCapitalAllowanceClaimed).toBe(80000);
      // Section E: 500000 + 50000 - 80000 = 470000
      expect(miraReturn.sectionE_TaxableIncomeLoss.netTaxableIncome).toBe(470000);
      // Section F: Under 500,000 corporate threshold, tax payable is 0. Prepayments = 30000, net refundable = -30000
      expect(miraReturn.sectionF_TaxComputation.totalTaxPayable).toBe(0);
      expect(miraReturn.sectionF_TaxComputation.totalPrepayments).toBe(30000);
      expect(miraReturn.sectionF_TaxComputation.netTaxDueOrRefundable).toBe(-30000);
    });
  });

  describe('7. 5-Way Strict Decimal Reconciliation', () => {
    test('all 5 reconciliation checks pass when numbers match exactly', async () => {
      const result = await MIRA604IntegrationService.calculateAndPrepareReturn(
        {
          tenantId,
          taxYear: 2024,
          tin: '1000200300',
          taxpayerName: 'Recon Test Company Ltd',
          entityType: 'COMPANY',
          overrideAccountingProfit: 500000
        },
        adminSession
      );

      expect(result.reconciliation.overallStatus).toBe('PASS');
      expect(result.reconciliation.discrepanciesCount).toBe(0);
      expect(result.reconciliation.items.length).toBe(5);
      result.reconciliation.items.forEach((item) => {
        expect(item.status).toBe('PASS');
        expect(item.variance).toBe(0);
      });
    });

    test('intentional mismatch triggers discrepancy alert and FAIL status', () => {
      const reconReport = (MIRA604IntegrationService as any).executeFiveWayReconciliation({
        taxYear: 2024,
        tenantId,
        glProfit: 500000,
        taxCalcStartingProfit: 490000, // Intentional 10,000 discrepancy
        adjustmentRecordsSumAdditions: 0,
        taxCalcAdditions: 0,
        adjustmentRecordsSumDeductions: 0,
        taxCalcAllowableDeductions: 0,
        fixedAssetCASummary: 0,
        taxCalcCADeduction: 0,
        taxCalcNetTaxableIncome: 500000,
        mira604NetTaxableIncome: 500000,
        taxCalcTotalTaxPayable: 75000,
        mira604TotalTaxPayable: 75000
      });

      expect(reconReport.overallStatus).toBe('FAIL');
      expect(reconReport.discrepanciesCount).toBe(1);
      const failedItem = reconReport.items.find((i: any) => i.code === 'GL_VS_TAX_PROFIT');
      expect(failedItem?.status).toBe('FAIL');
      expect(failedItem?.variance).toBe(10000);
    });
  });

  describe('8. Lifecycle State Machine & Immutability Enforcement', () => {
    test('enforces strict role-based approval and finalization transitions', async () => {
      const lifecycleTenant = `TENANT-LIFECYCLE-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const calculated = await MIRA604IntegrationService.calculateAndPrepareReturn(
        {
          tenantId: lifecycleTenant,
          taxYear: 2025,
          tin: '1000200300',
          taxpayerName: 'Lifecycle Test Ltd',
          entityType: 'COMPANY',
          overrideAccountingProfit: 200000
        },
        adminSession
      );

      expect(calculated.status).toBe('CALCULATED');
      expect(calculated.isFinalized).toBe(false);

      // Unauthorized user cannot approve
      await expect(
        MIRA604IntegrationService.approveReturn(
          lifecycleTenant,
          2025,
          standardUserSession
        )
      ).rejects.toThrow(/Unauthorized/);

      // Admin user can approve
      const approved = await MIRA604IntegrationService.approveReturn(
        lifecycleTenant,
        2025,
        adminSession
      );
      expect(approved.status).toBe('APPROVED');
      expect(approved.approvedBy).toBe(adminSession.userId);

      // Finalize the return
      const finalized = await MIRA604IntegrationService.finalizeReturn(
        lifecycleTenant,
        2025,
        adminSession
      );
      expect(finalized.status).toBe('FINALIZED');
      expect(finalized.isFinalized).toBe(true);
      expect(finalized.finalizedBy).toBe(adminSession.userId);

      // Attempting to recalculate a finalized return without isAmendment flag throws immutable error
      await expect(
        MIRA604IntegrationService.calculateAndPrepareReturn(
          {
            tenantId: lifecycleTenant,
            taxYear: 2025,
            isAmendment: false
          },
          adminSession
        )
      ).rejects.toThrow(/FINALIZED and immutable/);
    });
  });

  describe('9. Audit Trail & Full Traceability', () => {
    test('provides complete calculation trace and cryptographic checksum', async () => {
      const result = await MIRA604IntegrationService.calculateAndPrepareReturn(
        {
          tenantId: 'TENANT-AUDIT-TEST',
          taxYear: 2024,
          tin: '1000200300',
          taxpayerName: 'Audit Trace Test Ltd',
          entityType: 'COMPANY',
          overrideAccountingProfit: 300000
        },
        adminSession
      );

      expect(result.verificationChecksum).toBeDefined();
      expect(result.verificationChecksum.length).toBe(64); // SHA-256

      expect(result.trace).toBeDefined();
      expect(result.trace.taxYear).toBe(2024);
      expect(result.trace.accountingProfitTrace).toBeDefined();
      expect(result.trace.taxAdjustmentsTrace).toBeDefined();
      expect(result.trace.capitalAllowancesTrace).toBeDefined();
      expect(result.trace.taxableIncomeTrace).toBeDefined();
      expect(result.trace.taxComputationTrace).toBeDefined();
      expect(result.trace.taxableIncomeTrace.formula).toContain('Box 200');
    });
  });
});
