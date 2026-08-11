import { describe, test, expect } from 'vitest';
import { generateTaxReturnPdf, exportLedgerToCsv } from '../../src/services/reports/pdfExportService';
import { TransactionRecord, FixedAssetRecord } from '../../src/types/taxEngine';
import { Mira604TaxReturn } from '../../src/types/mira604';
import { Mira105GstReturn } from '../../src/types/mira105';
import { Mira302WhtReturn } from '../../src/types/mira302';

describe('Phase 14 - PDF & Reporting Export Service Tests', () => {

  const sampleTx: TransactionRecord = {
    transactionId: 'TX-2026-INV-100',
    sourceType: 'invoice',
    sourceId: 'INV-100',
    entityId: 'COMPANY-001',
    outletId: 'OUTLET-001',
    transactionDate: '2026-06-15',
    description: 'Software Consulting Services, "Special" Project',
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

  test('generateTaxReturnPdf produces valid document buffers containing taxpayer TIN, name, and calculation totals', async () => {
    const mira604: Mira604TaxReturn = {
      formId: 'MIRA604-2026-1000200300',
      formVersion: 'V25.1',
      submissionStatus: 'READY_FOR_FILING',
      generatedAt: '2026-12-31T10:00:00Z',
      sectionA_TaxpayerInfo: {
        tin: '1000200300',
        taxpayerName: 'Male Enterprise Pvt Ltd',
        entityType: 'COMPANY',
        taxYear: 2026,
        accountingPeriodStart: '2026-01-01',
        accountingPeriodEnd: '2026-12-31'
      },
      sectionB_Schedule1PnL: {
        grossRevenue: 500000,
        costOfSales: 100000,
        grossProfit: 400000,
        otherIncome: 0,
        operatingExpenses: 150000,
        accountingProfitBeforeTax: 250000
      },
      sectionC_TaxAdjustments: {
        itemizedAddBacks: [],
        totalAddBacks: 10000,
        itemizedDeductions: [],
        totalDeductions: 0,
        netTaxAdjustments: 10000
      },
      sectionD_CapitalAllowances: {
        totalClaimableCapitalAllowance: 20000
      },
      sectionE_TaxableIncomeLoss: {
        adjustedTaxableProfitBeforeLoss: 240000,
        priorUnabsorbedLosses: 0,
        lossCarriedForwardApplied: 0,
        remainingUnabsorbedLoss: 0,
        netTaxableIncome: 240000,
        isTaxLoss: false,
        taxLossAmount: 0
      },
      sectionF_TaxComputation: {
        taxByBracket: [],
        totalTaxPayable: 36000,
        advanceTaxPaid: 10000,
        interimTaxPaid: 0,
        withholdingTaxDeducted: 0,
        totalPrepayments: 10000,
        netTaxDueOrRefundable: 26000,
        effectiveTaxRate: 15
      }
    };

    const pdfBuffer = await generateTaxReturnPdf('MIRA604', mira604);
    expect(Buffer.isBuffer(pdfBuffer) || typeof pdfBuffer === 'string').toBe(true);

    const pdfString = pdfBuffer.toString('utf-8');
    expect(pdfString).toContain('1000200300'); // Taxpayer TIN
    expect(pdfString).toContain('Male Enterprise Pvt Ltd'); // Taxpayer Name
    expect(pdfString).toContain('26,000.00'); // Net Tax Calculation Total
    expect(pdfString).toContain('500,000.00'); // Gross Revenue Total
  });

  test('exportLedgerToCsv generates properly escaped CSV strings matching standard column headers (transactionId, date, category, debit, credit, gst, miraCategory)', () => {
    const csv = exportLedgerToCsv([sampleTx]);

    const firstLine = csv.split('\n')[0];
    expect(firstLine).toContain('transactionId');
    expect(firstLine).toContain('date');
    expect(firstLine).toContain('category');
    expect(firstLine).toContain('debit');
    expect(firstLine).toContain('credit');
    expect(firstLine).toContain('gst');
    expect(firstLine).toContain('miraCategory');

    expect(csv).toContain('TX-2026-INV-100');
    expect(csv).toContain('"Software Consulting Services, ""Special"" Project"'); // Escaped quotes & comma
    expect(csv).toContain('revenue.sales');
    expect(csv).toContain('8000'); // GST Amount
  });

  test('generateTaxReturnPdf for MIRA105, MIRA302, ASSET_REGISTER, and PNL_SCHEDULE1', async () => {
    const mira105: Mira105GstReturn = {
      formId: 'MIRA105-2026-M06-1000200300',
      formVersion: 'V25.1',
      submissionStatus: 'READY_FOR_FILING',
      generatedAt: '2026-12-31T10:00:00Z',
      verificationChecksum: 'CHK-99',
      gstPeriod: {
        periodId: '2026-M06',
        taxpayerName: 'Male Enterprise Pvt Ltd',
        tin: '1000200300',
        regime: 'GENERAL_GST',
        periodStart: '2026-06-01',
        periodEnd: '2026-06-30',
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

    const mira302: Mira302WhtReturn = {
      formId: 'MIRA302-2026-M01-1000200300',
      formVersion: 'V25.1',
      submissionStatus: 'READY_FOR_FILING',
      generatedAt: '2026-12-31T10:00:00Z',
      whtPeriod: {
        periodId: '2026-M01',
        taxpayerName: 'Male Enterprise Pvt Ltd',
        tin: '1000200300',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        taxYear: 2026
      },
      scheduleOfPayments: [
        {
          transactionId: 'TX-AWS-001',
          transactionDate: '2026-01-15',
          payeeName: 'Amazon Web Services Inc.',
          countryCode: 'US',
          foreignAddress: '410 Terry Ave N, Seattle, WA',
          paymentCategory: 'ROYALTY_SOFTWARE',
          description: 'Cloud Infrastructure Hosting',
          contractedAmount: 10000,
          isGrossedUp: false,
          grossPaymentAmount: 10000,
          whtRatePercentage: 10,
          whtAmountWithheld: 1000,
          netAmountPaidToVendor: 9000,
          dtaaReliefApplied: false
        }
      ],
      totalGrossPayments: 10000,
      totalWhtWithheld: 1000,
      totalNetPayments: 9000,
      itemCount: 1,
      verificationChecksum: 'CHK-302'
    };

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

    const bufGst = await generateTaxReturnPdf('MIRA105', mira105);
    expect(bufGst.toString('utf-8')).toContain('MIRA 105 - Goods & Services Tax Return');

    const bufWht = await generateTaxReturnPdf('MIRA302', mira302);
    expect(bufWht.toString('utf-8')).toContain('Amazon Web Services Inc.');

    const bufAsset = await generateTaxReturnPdf('ASSET_REGISTER', { fixedAssets: [asset] });
    expect(bufAsset.toString('utf-8')).toContain('Dell Server Workstation');

    const bufPnl = await generateTaxReturnPdf('PNL_SCHEDULE1', { pnl: { grossRevenue: 500000 } });
    expect(bufPnl.toString('utf-8')).toContain('Schedule 1 - Detailed Profit & Loss Statement');
  });

  test('Missing required report fields raise descriptive formatting errors', async () => {
    await expect(generateTaxReturnPdf('MIRA604', {})).rejects.toThrow("Export Error: Missing required report field 'sectionA_TaxpayerInfo'");

    await expect(generateTaxReturnPdf('MIRA604', { sectionA_TaxpayerInfo: { taxpayerName: 'Company' } })).rejects.toThrow("Export Error: Missing required report field 'tin'");

    await expect(generateTaxReturnPdf('MIRA105', {})).rejects.toThrow("Export Error: Missing required report field 'gstPeriod'");

    await expect(generateTaxReturnPdf('MIRA302', {})).rejects.toThrow("Export Error: Missing required report field 'whtPeriod'");

    await expect(generateTaxReturnPdf('INVALID' as any, {})).rejects.toThrow('Unsupported report type');

    await expect(generateTaxReturnPdf('MIRA604', null)).rejects.toThrow('Report data payload is required');
  });

});

