import { describe, test, expect } from 'vitest';
import { reconcileTaxYear, ReconciliationInputData } from '../../src/services/tax/reconciliationService';
import { TaxpayerInfo, TransactionRecord, FixedAssetRecord } from '../../src/types/taxEngine';
import { TaxAdjustment } from '../../src/services/tax/taxAdjustmentService';
import { Mira105GstReturn } from '../../src/types/mira105';
import { Mira302WhtReturn } from '../../src/types/mira302';
import { Mira604TaxReturn } from '../../src/types/mira604';

describe('Phase 13 - Tax Return Reconciliation & Validation Engine Tests', () => {

  const sampleTaxpayer: TaxpayerInfo = {
    tin: '1000200300',
    taxpayerName: 'Male Enterprise Pvt Ltd',
    entityType: 'COMPANY',
    taxYear: 2026,
    accountingPeriodStart: '2026-01-01',
    accountingPeriodEnd: '2026-12-31'
  };

  const sampleRevenueTx: TransactionRecord = {
    transactionId: 'TX-REV-001',
    sourceType: 'invoice',
    sourceId: 'INV-100',
    entityId: 'COMPANY-001',
    outletId: 'OUTLET-001',
    transactionDate: '2026-06-15',
    description: 'Commercial Sales Revenue',
    accountingCategory: 'revenue.sales',
    miraCategory: 'revenue',
    amount: 100000,
    gstAmount: 8000,
    totalAmount: 108000,
    accountingTreatment: 'REVENUE',
    incomeTaxTreatment: 'DEDUCTIBLE',
    gstTreatment: 'STANDARD_RATED',
    taxYear: 2026,
    accountingPeriodStart: '2026-01-01',
    accountingPeriodEnd: '2026-12-31',
    reviewStatus: 'APPROVED',
    auditHistory: [],
    createdAt: '2026-06-15T10:00:00Z'
  };

  const sampleGstReturn: Mira105GstReturn = {
    formId: 'MIRA105-2026-M06-1000200300',
    formVersion: 'V25.1',
    submissionStatus: 'READY_FOR_FILING',
    generatedAt: '2026-12-31T10:00:00Z',
    verificationChecksum: 'CHK-105-99',
    gstPeriod: {
      periodId: '2026-M06',
      taxpayerName: 'Male Enterprise Pvt Ltd',
      tin: '1000200300',
      regime: 'GENERAL_GST',
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
      taxYear: 2026
    },
    outputSales: {
      box1_StandardRatedSales: 100000,
      box2_ZeroRatedSales: 0,
      box3_ExemptSales: 0,
      totalOutputSales: 100000,
      box4_OutputGstCollected: 8000
    },
    inputPurchases: {
      box5_TotalPurchases: 50000,
      box6_TaxablePurchases: 50000,
      box7_GrossInputGstPaid: 4000,
      box8_ClaimableInputGst: 4000,
      nonClaimableInputGst: 0,
      proRataClaimableRatio: 1.0,
      proRataAdjustmentAmount: 0
    },
    capitalPurchases: {
      box10_CapitalPurchasesAmount: 0,
      box10_CapitalPurchasesInputGst: 0
    },
    box9_NetGstPayableOrRefundable: 4000
  };

  test('Requirement 1: Complete and fully reconciled data produces clean report with isValid = true', () => {
    const input: ReconciliationInputData = {
      taxpayerInfo: sampleTaxpayer,
      transactions: [sampleRevenueTx],
      gstReturns: [sampleGstReturn]
    };

    const report = reconcileTaxYear('COMPANY-001', 2026, input);

    expect(report.taxYear).toBe(2026);
    expect(report.entityId).toBe('COMPANY-001');
    expect(report.isValid).toBe(true);
    expect(report.issues.length).toBe(0);
    expect(report.summary.totalRevenueLedger).toBe(100000);
    expect(report.summary.totalRevenueReturn).toBe(100000);
  });

  test('Requirement 2: P&L vs GST Sales revenue mismatch produces REVENUE_GST_MISMATCH error', () => {
    const mismatchedGstReturn: Mira105GstReturn = {
      ...sampleGstReturn,
      outputSales: {
        ...sampleGstReturn.outputSales,
        totalOutputSales: 80000 // Discrepancy of MVR 20,000 vs Ledger MVR 100,000
      }
    };

    const input: ReconciliationInputData = {
      taxpayerInfo: sampleTaxpayer,
      transactions: [sampleRevenueTx],
      gstReturns: [mismatchedGstReturn]
    };

    const report = reconcileTaxYear('COMPANY-001', 2026, input);

    expect(report.isValid).toBe(false);
    const gstIssue = report.issues.find((i) => i.code === 'REVENUE_GST_MISMATCH');
    expect(gstIssue).toBeDefined();
    expect(gstIssue?.severity).toBe('ERROR');
    expect(gstIssue?.message).toContain('Discrepancy: 20000');
  });

  test('Requirement 3: Fixed Asset Register additions vs Schedule 2 additions mismatch produces FIXED_ASSET_ADDITIONS_MISMATCH error', () => {
    const asset: FixedAssetRecord = {
      assetId: 'AST-001',
      entityId: 'COMPANY-001',
      outletId: 'OUTLET-001',
      assetName: 'Dell Server Workstation',
      assetClass: 'Computer software & hardware',
      acquisitionDate: '2026-03-01',
      costPrice: 50000,
      miraCapitalAllowanceRate: 33.33,
      openingWDV: 0,
      additionsInYear: 50000,
      disposalsInYear: 0,
      capitalAllowanceClaimed: 16665,
      closingWDV: 33335,
      taxYear: 2026,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31'
    };

    const mira604: Mira604TaxReturn = {
      formId: 'MIRA604-2026-1000200300',
      formVersion: 'V25.1',
      submissionStatus: 'DRAFT',
      generatedAt: '2026-12-31T10:00:00Z',
      sectionA_TaxpayerInfo: sampleTaxpayer,
      sectionB_Schedule1PnL: {
        grossRevenue: 100000,
        costOfSales: 0,
        grossProfit: 100000,
        otherIncome: 0,
        operatingExpenses: 0,
        accountingProfitBeforeTax: 100000
      },
      sectionC_TaxAdjustments: {
        itemizedAddBacks: [],
        totalAddBacks: 0,
        itemizedDeductions: [],
        totalDeductions: 0,
        netTaxAdjustments: 0
      },
      sectionD_CapitalAllowances: {
        totalClaimableCapitalAllowance: 10000
      },
      sectionE_TaxableIncomeLoss: {
        adjustedTaxableProfitBeforeLoss: 90000,
        priorUnabsorbedLosses: 0,
        lossCarriedForwardApplied: 0,
        remainingUnabsorbedLoss: 0,
        netTaxableIncome: 90000,
        isTaxLoss: false,
        taxLossAmount: 0
      },
      sectionF_TaxComputation: {
        taxByBracket: [],
        totalTaxPayable: 0,
        advanceTaxPaid: 0,
        interimTaxPaid: 0,
        withholdingTaxDeducted: 0,
        totalPrepayments: 0,
        netTaxDueOrRefundable: 0,
        effectiveTaxRate: 0
      }
    };

    const input: ReconciliationInputData = {
      taxpayerInfo: sampleTaxpayer,
      fixedAssets: [asset],
      capitalAllowanceResult: {
        totalQualifyingAdditions: 30000, // Mismatch: 30,000 vs Fixed Asset 50,000
        totalCapitalAllowanceClaimed: 10000
      },
      mira604Return: mira604
    };

    const report = reconcileTaxYear('COMPANY-001', 2026, input);

    expect(report.isValid).toBe(false);
    const assetIssue = report.issues.find((i) => i.code === 'FIXED_ASSET_ADDITIONS_MISMATCH');
    expect(assetIssue).toBeDefined();
    expect(assetIssue?.severity).toBe('ERROR');
  });

  test('Requirement 4: Non-resident ledger payments vs MIRA 302 WHT return mismatch produces WHT_UNREPORTED_PAYMENT warning', () => {
    const foreignTx: TransactionRecord = {
      ...sampleRevenueTx,
      transactionId: 'TX-AWS-001',
      description: 'AWS Cloud Hosting Subscriptions',
      accountingCategory: 'operating.software_cloud',
      amount: 12000,
      accountingTreatment: 'EXPENSE'
    };

    const whtReturn: Mira302WhtReturn = {
      formId: 'MIRA302-2026-2026-M01-1000200300',
      formVersion: 'V25.1',
      submissionStatus: 'READY_FOR_FILING',
      generatedAt: '2026-12-31T10:00:00Z',
      whtPeriod: {
        periodId: '2026-M01',
        taxpayerName: 'Male Enterprise Pvt Ltd',
        tin: '1000200300',
        periodStart: '2026-01-01',
        periodEnd: '2026-12-31',
        taxYear: 2026
      },
      scheduleOfPayments: [],
      totalGrossPayments: 10000, // Discrepancy of 2,000 vs 12,000
      totalWhtWithheld: 1000,
      totalNetPayments: 9000,
      itemCount: 1,
      verificationChecksum: 'CHK-123'
    };

    const input: ReconciliationInputData = {
      taxpayerInfo: sampleTaxpayer,
      transactions: [foreignTx],
      whtReturn
    };

    const report = reconcileTaxYear('COMPANY-001', 2026, input);

    const whtIssue = report.issues.find((i) => i.code === 'WHT_UNREPORTED_PAYMENT');
    expect(whtIssue).toBeDefined();
    expect(whtIssue?.severity).toBe('WARNING');
  });

  test('Requirement 5: Rejected or unbacked tax adjustments trigger integrity issues and missing metadata triggers ENTITY_METADATA_INCOMPLETE errors', () => {
    const rejectedAdjustment: TaxAdjustment = {
      adjustmentId: 'ADJ-001',
      miraCode: 'ADJ-FINES',
      amount: 5000,
      reason: 'Government Traffic Fines',
      reviewStatus: 'REJECTED'
    };

    const input: ReconciliationInputData = {
      taxpayerInfo: {
        tin: '', // Missing TIN
        taxpayerName: 'Male Enterprise',
        periodStart: '', // Missing dates
        periodEnd: ''
      },
      adjustments: [rejectedAdjustment]
    };

    const report = reconcileTaxYear('COMPANY-001', 2026, input);

    expect(report.isValid).toBe(false);

    const metaIssues = report.issues.filter((i) => i.code === 'ENTITY_METADATA_INCOMPLETE');
    expect(metaIssues.length).toBeGreaterThanOrEqual(1);

    const adjIssue = report.issues.find((i) => i.code === 'TAX_ADJUSTMENT_REJECTED');
    expect(adjIssue).toBeDefined();
  });

});
