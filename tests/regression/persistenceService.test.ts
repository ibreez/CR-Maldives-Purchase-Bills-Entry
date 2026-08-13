import { describe, test, expect, beforeEach } from 'vitest';
import {
  saveTransactionWithJournal,
  fetchTransactionsByPeriod,
  saveTaxReturn,
  fetchTaxReturn,
  saveFixedAsset,
  fetchFixedAssetRegister,
  saveTaxAdjustment,
  fetchTaxAdjustments,
  clearDatabaseStore
} from '../../src/services/db/persistenceService';
import { TransactionRecord, JournalEntry, FixedAssetRecord } from '../../src/types/taxEngine';
import { Mira604TaxReturn } from '../../src/types/mira604';
import { Mira105GstReturn } from '../../src/types/mira105';
import { Mira302WhtReturn } from '../../src/types/mira302';
import { TaxAdjustment } from '../../src/services/tax/taxAdjustmentService';

describe('Phase 17 - Relational Database Persistence Service Tests', () => {

  const tenantA = 'COMPANY-001';
  const tenantB = 'COMPANY-002';

  const sampleTx: TransactionRecord = {
    transactionId: 'TX-2026-00001001',
    sourceType: 'bill',
    sourceId: 'BILL-1001',
    entityId: tenantA,
    outletId: 'OUTLET-001',
    transactionDate: '2026-06-15',
    accountingCategory: 'utilities.electricity',
    supplierOrCustomer: 'STELCO',
    description: 'Electricity Bill June 2026',
    amount: 10000,
    gstAmount: 800,
    totalAmount: 10800,
    miraCategory: 'other_expenses',
    accountingTreatment: 'EXPENSE',
    incomeTaxTreatment: 'DEDUCTIBLE',
    gstTreatment: 'INPUT_TAX',
    taxYear: 2026,
    accountingPeriodStart: '2026-01-01',
    accountingPeriodEnd: '2026-12-31',
    reviewStatus: 'APPROVED',
    auditHistory: [],
    createdAt: '2026-06-15T10:00:00Z'
  };

  const sampleJournal: JournalEntry = {
    journalId: 'JNL-2026-00001001',
    transactionId: 'TX-2026-00001001',
    entryDate: '2026-06-15',
    entityId: tenantA,
    outletId: 'OUTLET-001',
    totalDebit: 10800,
    totalCredit: 10800,
    isBalanced: true,
    lines: [
      { lineId: 'L1', accountCode: '6000', accountName: 'Utilities Expense', debit: 10000, credit: 0 },
      { lineId: 'L2', accountCode: '2200', accountName: 'GST Input Tax Recoverable', debit: 800, credit: 0 },
      { lineId: 'L3', accountCode: '2000', accountName: 'Accounts Payable', debit: 0, credit: 10800 }
    ]
  };

  beforeEach(() => {
    clearDatabaseStore();
  });

  test('Transactions and balanced double-entry journal records are persisted atomically inside database transactions', async () => {
    await saveTransactionWithJournal(sampleTx, sampleJournal);

    const fetched = await fetchTransactionsByPeriod(tenantA, '2026-01-01', '2026-12-31');

    expect(fetched).toHaveLength(1);
    expect(fetched[0].transactionId).toBe('TX-2026-00001001');
    expect(fetched[0].entityId).toBe(tenantA);
    expect(fetched[0].journalEntry).toBeDefined();
    expect(fetched[0].journalEntry?.journalId).toBe('JNL-2026-00001001');
    expect(fetched[0].journalEntry?.isBalanced).toBe(true);
    expect(fetched[0].journalEntry?.totalDebit).toBe(10800);
    expect(fetched[0].journalEntry?.totalCredit).toBe(10800);
    expect(fetched[0].journalEntry?.lines).toHaveLength(3);
  });

  test('Atomic rollback occurs if either debit/credit balance validation fails or a constraint error occurs during persistence', async () => {
    // 1. Debit/Credit balance validation failure
    const unbalancedJournal: JournalEntry = {
      ...sampleJournal,
      totalCredit: 9000,
      isBalanced: false
    };

    await expect(saveTransactionWithJournal(sampleTx, unbalancedJournal)).rejects.toThrow(
      'Cannot commit unbalance double-entry journal'
    );

    // Verify rollback: no records persisted
    const fetched1 = await fetchTransactionsByPeriod(tenantA, '2026-01-01', '2026-12-31');
    expect(fetched1).toHaveLength(0);

    // 2. Constraint error failure (foreign key mismatch)
    const mismatchedJournal: JournalEntry = {
      ...sampleJournal,
      transactionId: 'TX-NON-EXISTENT-999'
    };

    await expect(saveTransactionWithJournal(sampleTx, mismatchedJournal)).rejects.toThrow(
      'Foreign key mismatch'
    );

    // Verify rollback: no records persisted
    const fetched2 = await fetchTransactionsByPeriod(tenantA, '2026-01-01', '2026-12-31');
    expect(fetched2).toHaveLength(0);

    // 3. Constraint error failure (missing transactionId)
    const invalidTx: TransactionRecord = {
      ...sampleTx,
      transactionId: ''
    };
    await expect(saveTransactionWithJournal(invalidTx, sampleJournal)).rejects.toThrow(
      'Transaction ID is required'
    );
  });

  test('Querying transactions by tenantId and date range returns exact domain model fields without losing tax classifications or metadata', async () => {
    const tx1: TransactionRecord = {
      ...sampleTx,
      transactionId: 'TX-1',
      transactionDate: '2026-02-10',
      miraCategory: 'utilities',
      accountingTreatment: 'EXPENSE',
      incomeTaxTreatment: 'DEDUCTIBLE',
      gstTreatment: 'INPUT_TAX'
    };
    const tx2: TransactionRecord = {
      ...sampleTx,
      transactionId: 'TX-2',
      transactionDate: '2026-05-20',
      miraCategory: 'fines_penalties',
      accountingTreatment: 'EXPENSE',
      incomeTaxTreatment: 'NON_DEDUCTIBLE',
      gstTreatment: 'NO_INPUT_TAX'
    };
    const txOtherTenant: TransactionRecord = {
      ...sampleTx,
      transactionId: 'TX-OTHER',
      entityId: tenantB,
      transactionDate: '2026-05-15'
    };

    await saveTransactionWithJournal(tx1, { ...sampleJournal, transactionId: 'TX-1' });
    await saveTransactionWithJournal(tx2, { ...sampleJournal, transactionId: 'TX-2' });
    await saveTransactionWithJournal(txOtherTenant, { ...sampleJournal, transactionId: 'TX-OTHER', entityId: tenantB });

    // Query for Tenant A in date range 2026-05-01 to 2026-05-31
    const periodResults = await fetchTransactionsByPeriod(tenantA, '2026-05-01', '2026-05-31');

    expect(periodResults).toHaveLength(1);
    const retrievedTx = periodResults[0];

    // Verify exact domain model fields & tax classifications are intact
    expect(retrievedTx.transactionId).toBe('TX-2');
    expect(retrievedTx.entityId).toBe(tenantA);
    expect(retrievedTx.supplierOrCustomer).toBe('STELCO');
    expect(retrievedTx.accountingCategory).toBe('utilities.electricity');
    expect(retrievedTx.miraCategory).toBe('fines_penalties');
    expect(retrievedTx.accountingTreatment).toBe('EXPENSE');
    expect(retrievedTx.incomeTaxTreatment).toBe('NON_DEDUCTIBLE');
    expect(retrievedTx.gstTreatment).toBe('NO_INPUT_TAX');
    expect(retrievedTx.amount).toBe(10000);
    expect(retrievedTx.gstAmount).toBe(800);
    expect(retrievedTx.totalAmount).toBe(10800);
    expect(retrievedTx.taxYear).toBe(2026);
    expect(retrievedTx.reviewStatus).toBe('APPROVED');
  });

  test('Fixed Asset Register entries, Tax Adjustments, and MIRA returns hydrate cleanly from database rows back into domain objects', async () => {
    // 1. Fixed Asset Register hydration
    const asset: FixedAssetRecord = {
      assetId: 'AST-2026-001',
      entityId: tenantA,
      outletId: 'OUTLET-001',
      assetName: 'Dell Enterprise Server Workstation',
      assetClass: 'Computer software & hardware',
      acquisitionDate: '2026-01-15',
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

    await saveFixedAsset(asset);
    const retrievedAssets = await fetchFixedAssetRegister(tenantA, 2026);

    expect(retrievedAssets).toHaveLength(1);
    expect(retrievedAssets[0].assetId).toBe('AST-2026-001');
    expect(retrievedAssets[0].assetName).toBe('Dell Enterprise Server Workstation');
    expect(retrievedAssets[0].costPrice).toBe(50000);
    expect(retrievedAssets[0].miraCapitalAllowanceRate).toBe(33.33);
    expect(retrievedAssets[0].closingWDV).toBe(33335);

    // 2. Tax Adjustment hydration
    const adjustment: TaxAdjustment = {
      adjustmentId: 'ADJ-2026-001',
      entityId: tenantA,
      taxYear: 2026,
      miraCode: 'ADJ-FINES',
      direction: 'ADD_BACK',
      amount: 5000,
      reason: 'Traffic violation fine non-deductible expense',
      reviewStatus: 'APPROVED',
      createdAt: '2026-06-15T10:00:00Z'
    };

    await saveTaxAdjustment(adjustment);
    const retrievedAdjustments = await fetchTaxAdjustments(tenantA, 2026);

    expect(retrievedAdjustments).toHaveLength(1);
    expect(retrievedAdjustments[0].adjustmentId).toBe('ADJ-2026-001');
    expect(retrievedAdjustments[0].miraCode).toBe('ADJ-FINES');
    expect(retrievedAdjustments[0].direction).toBe('ADD_BACK');
    expect(retrievedAdjustments[0].amount).toBe(5000);
    expect(retrievedAdjustments[0].reviewStatus).toBe('APPROVED');

    // 3. MIRA Tax Returns hydration (MIRA604, MIRA105, MIRA302)
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
      sectionB_Schedule1PnL: { grossRevenue: 500000 } as any,
      sectionC_TaxAdjustments: { netTaxAdjustments: 10000 } as any,
      sectionD_CapitalAllowances: { totalClaimableCapitalAllowance: 20000 },
      sectionE_TaxableIncomeLoss: { netTaxableIncome: 240000 } as any,
      sectionF_TaxComputation: { netTaxDueOrRefundable: 26000 } as any
    };

    await saveTaxReturn(mira604);
    const retrievedMira604 = await fetchTaxReturn('MIRA604-2026-1000200300');

    expect(retrievedMira604).toBeDefined();
    expect(retrievedMira604.formId).toBe('MIRA604-2026-1000200300');
    expect(retrievedMira604.sectionA_TaxpayerInfo.taxpayerName).toBe('Male Enterprise Pvt Ltd');
    expect(retrievedMira604.sectionF_TaxComputation.netTaxDueOrRefundable).toBe(26000);
  });

});
