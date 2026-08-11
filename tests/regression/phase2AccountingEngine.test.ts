import { describe, test, expect } from 'vitest';
import { classifyDocument } from '../../src/services/classificationService';
import { createTransactionFromBill, createTransactionIdentity } from '../../src/services/accounting/transactionService';
import { createJournalEntryForTransaction, STANDARD_ACCOUNTS } from '../../src/services/accounting/journalService';

describe('Phase 2 - Accounting Transaction Engine & Double-Entry Journal Tests', () => {

  test('Section 2.1 & 2.2: Pipeline creates a valid TransactionRecord with structured Identity from raw OCR', () => {
    const rawOcr = {
      invoiceNumber: 'INV-STELCO-9921',
      supplierName: 'STELCO',
      transactionDate: '2026-08-01',
      amount: 15000,
      gstAmount: 1200,
      entityId: 'COMPANY-MALE-01',
      outletId: 'OUTLET-MAIN'
    };

    const classification = classifyDocument(rawOcr);
    const txRecord = createTransactionFromBill(rawOcr, classification);

    // 1. Transaction Identity verification
    expect(txRecord.transactionId).toMatch(/^TX-2026-\d{8}$/);
    expect(txRecord.sourceType).toBe('bill');
    expect(txRecord.sourceId).toBe('INV-STELCO-9921');
    expect(txRecord.entityId).toBe('COMPANY-MALE-01');
    expect(txRecord.outletId).toBe('OUTLET-MAIN');
    expect(txRecord.transactionDate).toBe('2026-08-01');
    expect(txRecord.accountingCategory).toBe('utilities.electricity');
    expect(txRecord.amount).toBe(15000);
    expect(txRecord.gstAmount).toBe(1200);
    expect(txRecord.totalAmount).toBe(16200);

    // 2. Double-entry Journal Entry attached and balanced
    expect(txRecord.journalEntry).toBeDefined();
    expect(txRecord.journalEntry?.isBalanced).toBe(true);
    expect(txRecord.journalEntry?.totalDebit).toBe(16200);
    expect(txRecord.journalEntry?.totalCredit).toBe(16200);
  });

  test('Section 2.1: Double-Entry Journal Balancing enforces Debit == Credit for standard bill', () => {
    const rawOcr = {
      invoiceNumber: 'BILL-8812',
      supplierName: 'Office World',
      description: 'Laptops and Computer Monitors',
      amount: 50000,
      gstAmount: 4000
    };

    const classification = classifyDocument(rawOcr);
    const txRecord = createTransactionFromBill(rawOcr, classification);
    const journal = txRecord.journalEntry!;

    // Debits: Fixed Assets ($50,000) + Input GST ($4,000) = $54,000
    // Credit: Accounts Payable ($54,000)
    expect(journal.isBalanced).toBe(true);
    expect(journal.totalDebit).toBe(54000);
    expect(journal.totalCredit).toBe(54000);

    const assetLine = journal.lines.find(l => l.accountCode === STANDARD_ACCOUNTS.FIXED_ASSETS.code);
    const gstLine = journal.lines.find(l => l.accountCode === STANDARD_ACCOUNTS.GST_INPUT_TAX.code);
    const apLine = journal.lines.find(l => l.accountCode === STANDARD_ACCOUNTS.ACCOUNTS_PAYABLE.code);

    expect(assetLine?.debit).toBe(50000);
    expect(gstLine?.debit).toBe(4000);
    expect(apLine?.credit).toBe(54000);
  });

  test('Section 2.1: Handles non-claimable / exempt GST transactions with balanced double-entry', () => {
    const rentOcr = {
      invoiceNumber: 'RENT-AUG-2026',
      supplierName: 'Male Realty',
      description: 'Monthly Shop Rent',
      amount: 30000,
      gstAmount: 0
    };

    const classification = classifyDocument(rentOcr);
    const txRecord = createTransactionFromBill(rentOcr, classification);
    const journal = txRecord.journalEntry!;

    expect(journal.isBalanced).toBe(true);
    expect(journal.totalDebit).toBe(30000);
    expect(journal.totalCredit).toBe(30000);

    const rentLine = journal.lines.find(l => l.accountCode === STANDARD_ACCOUNTS.RENT_EXPENSE.code);
    const apLine = journal.lines.find(l => l.accountCode === STANDARD_ACCOUNTS.ACCOUNTS_PAYABLE.code);

    expect(rentLine?.debit).toBe(30000);
    expect(apLine?.credit).toBe(30000);
  });

  test('Section 2.2: Directly tests createJournalEntryForTransaction with custom identity', () => {
    const identity = createTransactionIdentity({
      sourceType: 'invoice',
      sourceId: 'INV-SALES-101',
      accountingCategory: 'sales.restaurant',
      amount: 20000,
      gstAmount: 1600,
      transactionDate: '2026-08-05'
    });

    const journal = createJournalEntryForTransaction({
      ...identity,
      description: 'Restaurant Sales Invoice',
      miraCategory: 'revenue',
      accountingTreatment: 'REVENUE',
      incomeTaxTreatment: 'TAX_EXEMPT_INCOME',
      gstTreatment: 'STANDARD_RATED',
      taxYear: 2026,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31',
      reviewStatus: 'APPROVED',
      auditHistory: [],
      createdAt: new Date().toISOString()
    });

    // Debit AR (21,600), Credit Revenue (20,000), Credit Output GST (1,600)
    expect(journal.isBalanced).toBe(true);
    expect(journal.totalDebit).toBe(21600);
    expect(journal.totalCredit).toBe(21600);

    const arLine = journal.lines.find(l => l.accountCode === STANDARD_ACCOUNTS.ACCOUNTS_RECEIVABLE.code);
    const revLine = journal.lines.find(l => l.accountCode === STANDARD_ACCOUNTS.REVENUE.code);
    const outputGstLine = journal.lines.find(l => l.accountCode === STANDARD_ACCOUNTS.GST_OUTPUT_TAX.code);

    expect(arLine?.debit).toBe(21600);
    expect(revLine?.credit).toBe(20000);
    expect(outputGstLine?.credit).toBe(1600);
  });

});
