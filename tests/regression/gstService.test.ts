import { describe, test, expect } from 'vitest';
import {
  classifyGstEligibility,
  generateMira105Return,
  exportMira105Json
} from '../../src/services/gst/gstService';
import { GstPeriod } from '../../src/types/mira105';
import { TransactionRecord } from '../../src/types/taxEngine';

describe('Phase 9 - GST Processing & MIRA 105 Return Engine Tests', () => {

  const samplePeriod: GstPeriod = {
    periodId: '2026-M01',
    taxpayerName: 'Island Trading Pvt Ltd',
    tin: '1000500600',
    regime: 'GENERAL_GST',
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
    taxYear: 2026
  };

  const sampleTransactions: TransactionRecord[] = [
    // 1. Standard Rated Output Sales (MVR 100,000 net, MVR 8,000 GST @ 8%)
    {
      transactionId: 'TX-2026-REV-001',
      sourceType: 'invoice',
      sourceId: 'INV-101',
      entityId: 'COMPANY-001',
      outletId: 'OUTLET-001',
      transactionDate: '2026-01-10',
      description: 'Standard retail sales',
      accountingCategory: 'sales.retail',
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
      createdAt: '2026-01-10T10:00:00Z'
    },

    // 2. Zero-Rated Output Sales (MVR 50,000 net, MVR 0 GST)
    {
      transactionId: 'TX-2026-REV-002',
      sourceType: 'invoice',
      sourceId: 'INV-102',
      entityId: 'COMPANY-001',
      outletId: 'OUTLET-001',
      transactionDate: '2026-01-15',
      description: 'Export sales to foreign buyer',
      accountingCategory: 'sales.export',
      miraCategory: 'revenue',
      amount: 50000,
      gstAmount: 0,
      totalAmount: 50000,
      accountingTreatment: 'REVENUE',
      incomeTaxTreatment: 'DEDUCTIBLE',
      gstTreatment: 'ZERO_RATED',
      taxYear: 2026,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31',
      reviewStatus: 'APPROVED',
      auditHistory: [],
      createdAt: '2026-01-15T10:00:00Z'
    },

    // 3. Exempt Output Sales (MVR 25,000 net, MVR 0 GST)
    {
      transactionId: 'TX-2026-REV-003',
      sourceType: 'invoice',
      sourceId: 'INV-103',
      entityId: 'COMPANY-001',
      outletId: 'OUTLET-001',
      transactionDate: '2026-01-20',
      description: 'Exempt postal services revenue',
      accountingCategory: 'sales.exempt',
      miraCategory: 'revenue',
      amount: 25000,
      gstAmount: 0,
      totalAmount: 25000,
      accountingTreatment: 'REVENUE',
      incomeTaxTreatment: 'DEDUCTIBLE',
      gstTreatment: 'EXEMPT',
      taxYear: 2026,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31',
      reviewStatus: 'APPROVED',
      auditHistory: [],
      createdAt: '2026-01-20T10:00:00Z'
    },

    // 4. Fully Claimable Input Purchase (Inventory purchase MVR 40,000 net, MVR 3,200 GST)
    {
      transactionId: 'TX-2026-EXP-001',
      sourceType: 'bill',
      sourceId: 'BILL-201',
      entityId: 'COMPANY-001',
      outletId: 'OUTLET-001',
      transactionDate: '2026-01-12',
      description: 'Wholesale inventory goods',
      accountingCategory: 'inventory.purchases',
      miraCategory: 'cost_of_sales',
      amount: 40000,
      gstAmount: 3200,
      totalAmount: 43200,
      accountingTreatment: 'COST_OF_SALES',
      incomeTaxTreatment: 'DEDUCTIBLE',
      gstTreatment: 'INPUT_TAX',
      taxYear: 2026,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31',
      reviewStatus: 'APPROVED',
      auditHistory: [],
      createdAt: '2026-01-12T10:00:00Z'
    },

    // 5. Blocked / Non-Claimable Input Purchase (Client entertainment dinner MVR 5,000 net, MVR 400 GST)
    {
      transactionId: 'TX-2026-EXP-002',
      sourceType: 'bill',
      sourceId: 'BILL-202',
      entityId: 'COMPANY-001',
      outletId: 'OUTLET-001',
      transactionDate: '2026-01-18',
      description: 'Client entertainment dinner at restaurant',
      accountingCategory: 'operating.entertainment',
      miraCategory: 'other_expenses',
      amount: 5000,
      gstAmount: 400,
      totalAmount: 5400,
      accountingTreatment: 'EXPENSE',
      incomeTaxTreatment: 'NON_DEDUCTIBLE',
      gstTreatment: 'NO_INPUT_TAX',
      taxYear: 2026,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31',
      reviewStatus: 'APPROVED',
      auditHistory: [],
      createdAt: '2026-01-18T10:00:00Z'
    },

    // 6. Capital Asset Purchase (Machinery equipment MVR 60,000 net, MVR 4,800 GST)
    {
      transactionId: 'TX-2026-AST-001',
      sourceType: 'bill',
      sourceId: 'BILL-203',
      entityId: 'COMPANY-001',
      outletId: 'OUTLET-001',
      transactionDate: '2026-01-22',
      description: 'New warehouse forklift equipment',
      accountingCategory: 'assets.plant_machinery',
      miraCategory: 'capital_assets',
      amount: 60000,
      gstAmount: 4800,
      totalAmount: 64800,
      accountingTreatment: 'ASSET',
      incomeTaxTreatment: 'CAPITAL_ALLOWANCE',
      gstTreatment: 'INPUT_TAX',
      taxYear: 2026,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31',
      reviewStatus: 'APPROVED',
      auditHistory: [],
      createdAt: '2026-01-22T10:00:00Z'
    }
  ];

  test('Requirement 1: Output GST calculates accurately across 8% general rate and 17% tourism rate', () => {
    // 1. General Rate (8%): Sales MVR 100,000 -> GST MVR 8,000
    const generalReturn = generateMira105Return([sampleTransactions[0]], samplePeriod);
    expect(generalReturn.gstPeriod.regime).toBe('GENERAL_GST');
    expect(generalReturn.outputSales.box1_StandardRatedSales).toBe(100000);
    expect(generalReturn.outputSales.box4_OutputGstCollected).toBe(8000);

    // 2. Tourism Rate (17%): Resort room sales MVR 100,000 -> GST MVR 17,000
    const tourismTx: TransactionRecord = {
      ...sampleTransactions[0],
      transactionId: 'TX-TOURISM-01',
      description: 'Resort villa nightstay booking',
      amount: 100000,
      gstAmount: 17000
    };

    const tourismPeriod: GstPeriod = {
      ...samplePeriod,
      regime: 'TOURISM_GST'
    };

    const tourismReturn = generateMira105Return([tourismTx], tourismPeriod);
    expect(tourismReturn.gstPeriod.regime).toBe('TOURISM_GST');
    expect(tourismReturn.outputSales.box1_StandardRatedSales).toBe(100000);
    expect(tourismReturn.outputSales.box4_OutputGstCollected).toBe(17000);
  });

  test('Requirement 2: Input GST on blocked expenses (e.g., entertainment, fine/penalty receipts) is marked non-claimable and added to expense cost', () => {
    const entertainmentTx = sampleTransactions[4]; // Entertainment MVR 5000, GST MVR 400
    const fineTx: TransactionRecord = {
      ...sampleTransactions[4],
      transactionId: 'TX-FINE-01',
      description: 'Late statutory filing fine',
      accountingCategory: 'operating.fines',
      amount: 2000,
      gstAmount: 160
    };

    // Check classification handlers
    expect(classifyGstEligibility(entertainmentTx, false)).toBe('NON_CLAIMABLE');
    expect(classifyGstEligibility(fineTx, false)).toBe('NON_CLAIMABLE');

    // Run return generation with blocked expenses
    const returnObj = generateMira105Return([sampleTransactions[3], entertainmentTx, fineTx], samplePeriod);
    // Claimable inventory GST = 3,200
    // Non-claimable GST = 400 + 160 = 560
    expect(returnObj.inputPurchases.box8_ClaimableInputGst).toBe(3200);
    expect(returnObj.inputPurchases.nonClaimableInputGst).toBe(560);
  });

  test('Requirement 3: Pro-rata apportionment accurately scales input tax for businesses with mixed exempt/taxable sales', () => {
    // Taxable sales = 100,000; Exempt sales = 100,000 -> Total sales = 200,000
    // Pro-rata ratio = 100,000 / 200,000 = 0.5 (50%)
    const mixedSales: TransactionRecord[] = [
      sampleTransactions[0], // Standard taxable 100,000 (GST 8,000)
      {
        ...sampleTransactions[2],
        amount: 100000 // Exempt sales 100,000
      }
    ];

    const overheadBill: TransactionRecord = {
      ...sampleTransactions[3],
      transactionId: 'TX-OVERHEAD-01',
      description: 'Electricity utility bill for shared office',
      accountingCategory: 'utilities.electricity',
      amount: 10000,
      gstAmount: 800
    };

    const mixedTxList = [...mixedSales, overheadBill];

    const returnObj = generateMira105Return(mixedTxList, samplePeriod, { entityHasMixedSupplies: true });

    // Output Sales Total = 200,000 (50% Taxable)
    expect(returnObj.outputSales.totalOutputSales).toBe(200000);
    expect(returnObj.inputPurchases.proRataClaimableRatio).toBe(0.5);

    // Overhead input GST = MVR 800 * 50% = MVR 400 claimable
    expect(returnObj.inputPurchases.box8_ClaimableInputGst).toBe(400);
    expect(returnObj.inputPurchases.nonClaimableInputGst).toBe(400);
  });

  test('Requirement 4: Net GST Due = Total Output Tax - Total Claimable Input Tax', () => {
    // Payable scenario: Output GST 8,000, Claimable Input GST 3,200 -> Net GST Payable = 4,800
    const payableReturn = generateMira105Return([sampleTransactions[0], sampleTransactions[3]], samplePeriod);
    expect(payableReturn.outputSales.box4_OutputGstCollected).toBe(8000);
    expect(payableReturn.inputPurchases.box8_ClaimableInputGst).toBe(3200);
    expect(payableReturn.box9_NetGstPayableOrRefundable).toBe(4800);

    // Refundable scenario: Output GST 8,000, Claimable Input GST 12,000 -> Net GST Refundable = -4,000
    const highInputTransactions: TransactionRecord[] = [
      sampleTransactions[0], // Output GST = 8,000
      sampleTransactions[3], // Input GST = 3,200
      sampleTransactions[5], // Asset Input GST = 4,800
      {
        ...sampleTransactions[3],
        transactionId: 'TX-EXTRA-01',
        amount: 50000,
        gstAmount: 4000 // Additional claimable input GST = 4,000
      }
    ];

    const refundableReturn = generateMira105Return(highInputTransactions, samplePeriod);
    expect(refundableReturn.outputSales.box4_OutputGstCollected).toBe(8000);
    expect(refundableReturn.inputPurchases.box8_ClaimableInputGst).toBe(12000);
    expect(refundableReturn.box9_NetGstPayableOrRefundable).toBe(-4000); // 8,000 - 12,000
  });

  test('Requirement 5: exportMira105Json outputs valid JSON structures matching MIRAconnect schema', () => {
    const returnObj = generateMira105Return(sampleTransactions, samplePeriod);
    const jsonString = exportMira105Json(returnObj);

    expect(typeof jsonString).toBe('string');
    const parsed = JSON.parse(jsonString);

    expect(parsed.formId).toBe(returnObj.formId);
    expect(parsed.formVersion).toBe('V25.1');
    expect(parsed.submissionStatus).toBe('READY_FOR_FILING');
    expect(parsed.outputSales.box1_StandardRatedSales).toBe(100000);
    expect(parsed.outputSales.box4_OutputGstCollected).toBe(8000);
    expect(parsed.inputPurchases.box5_TotalPurchases).toBe(105000);
    expect(parsed.inputPurchases.box8_ClaimableInputGst).toBe(8000);
    expect(parsed.box9_NetGstPayableOrRefundable).toBe(0);
    expect(parsed.capitalPurchases.box10_CapitalPurchasesAmount).toBe(60000);
    expect(parsed.verificationChecksum).toBeDefined();
  });

});
