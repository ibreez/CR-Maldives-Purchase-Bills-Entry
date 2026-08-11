import { describe, test, expect } from 'vitest';
import { classifyDocument } from '../../src/services/classificationService';
import { 
  createTransactionFromBill, 
  generateTransactionId, 
  createTransactionIdentity 
} from '../../src/services/accounting/transactionService';

describe('transactionService - Phase 2 Verification Suite', () => {

  test('Requirement 1: Passing classified bill data generates a valid TX-YYYY-XXXXXXXX transaction ID', () => {
    const rawBill = {
      invoiceNumber: 'STELCO-FEB-2026',
      supplierName: 'STELCO',
      transactionDate: '2026-02-15',
      amount: 12500,
      gstAmount: 1000,
      entityId: 'ENTITY-MALE-01',
      outletId: 'OUTLET-MAIN'
    };

    const classification = classifyDocument(rawBill);
    const transaction = createTransactionFromBill(rawBill, classification);

    expect(transaction.transactionId).toBeDefined();
    expect(transaction.transactionId).toMatch(/^TX-2026-\d{8}$/);

    // Explicit ID generation check
    const generatedId = generateTransactionId(2027);
    expect(generatedId).toMatch(/^TX-2027-\d{8}$/);
  });

  test('Requirement 2: Debit and Credit amounts in resulting journal entry strictly balance (Total Debits === Total Credits)', () => {
    const sampleBills = [
      {
        supplierName: 'STELCO',
        description: 'Electricity Bill',
        amount: 18450.50,
        gstAmount: 1476.04
      },
      {
        supplierName: 'Apple Store',
        description: 'MacBook Pro M3 Max Workstation',
        fileName: 'macbook.pdf',
        amount: 45000.00,
        gstAmount: 3600.00
      },
      {
        supplierName: 'MIRA',
        description: 'Tax Penalty Notice',
        amount: 2500.00,
        gstAmount: 0.00
      },
      {
        supplierName: 'City Office Properties',
        description: 'Office Rent Premises',
        amount: 55000.00,
        gstAmount: 0.00
      }
    ];

    sampleBills.forEach(rawBill => {
      const classification = classifyDocument(rawBill);
      const transaction = createTransactionFromBill(rawBill, classification);
      const journal = transaction.journalEntry;

      expect(journal).toBeDefined();
      expect(journal?.isBalanced).toBe(true);
      expect(journal?.totalDebit).toEqual(journal?.totalCredit);

      // Verify mathematical balance across lines
      const sumDebits = journal?.lines.reduce((acc, line) => acc + line.debit, 0) || 0;
      const sumCredits = journal?.lines.reduce((acc, line) => acc + line.credit, 0) || 0;

      expect(Math.abs(sumDebits - sumCredits)).toBeLessThan(0.01);
    });
  });

  test('Requirement 3: Modifying a raw bill object does not alter existing ledger entries unless explicitly posted', () => {
    const rawBill = {
      invoiceNumber: 'INV-ORIGINAL-100',
      supplierName: 'MWSC Water',
      amount: 5000,
      gstAmount: 400,
      transactionDate: '2026-03-01'
    };

    const classification = classifyDocument(rawBill);
    const postedTransaction = createTransactionFromBill(rawBill, classification);

    // Store immutable state snapshot before modifying original raw object
    const originalTxId = postedTransaction.transactionId;
    const originalAmount = postedTransaction.amount;
    const originalJournalDebit = postedTransaction.journalEntry?.totalDebit;

    // Mutate the raw OCR bill payload after creation
    rawBill.amount = 999999;
    rawBill.gstAmount = 88888;
    rawBill.supplierName = 'MUTATED SUPPLIER';

    // Verify existing posted transaction and its journal entry remain untouched
    expect(postedTransaction.transactionId).toBe(originalTxId);
    expect(postedTransaction.amount).toBe(originalAmount);
    expect(postedTransaction.supplierOrCustomer).toBe('MWSC Water');
    expect(postedTransaction.journalEntry?.totalDebit).toBe(originalJournalDebit);
    expect(postedTransaction.journalEntry?.lines[0].debit).toBe(5000);

    // Only explicitly calling createTransactionFromBill creates a new ledger entry
    const reprocessedTransaction = createTransactionFromBill(rawBill, classifyDocument(rawBill));
    expect(reprocessedTransaction.amount).toBe(999999);
    expect(reprocessedTransaction.transactionId).not.toBe(originalTxId);
  });

  test('Requirement 4: Output schema is strictly decoupled and ready for future database migrations', () => {
    const rawBill = {
      invoiceNumber: 'BILL-DB-SCHEMA-001',
      supplierName: 'Dhiraagu',
      description: 'Fiber Internet Service',
      amount: 8000,
      gstAmount: 640,
      entityId: 'ENT-99',
      outletId: 'OUT-01',
      transactionDate: '2026-05-10'
    };

    const classification = classifyDocument(rawBill);
    const transaction = createTransactionFromBill(rawBill, classification);

    // Validate key fields required for relational/PostgreSQL database schemas (Phase 17)
    expect(transaction).toHaveProperty('transactionId');
    expect(transaction).toHaveProperty('sourceType');
    expect(transaction).toHaveProperty('sourceId');
    expect(transaction).toHaveProperty('entityId');
    expect(transaction).toHaveProperty('outletId');
    expect(transaction).toHaveProperty('transactionDate');
    expect(transaction).toHaveProperty('accountingCategory');
    expect(transaction).toHaveProperty('miraCategory');
    expect(transaction).toHaveProperty('accountingTreatment');
    expect(transaction).toHaveProperty('incomeTaxTreatment');
    expect(transaction).toHaveProperty('gstTreatment');
    expect(transaction).toHaveProperty('taxYear');
    expect(transaction).toHaveProperty('accountingPeriodStart');
    expect(transaction).toHaveProperty('accountingPeriodEnd');
    expect(transaction).toHaveProperty('reviewStatus');
    expect(transaction).toHaveProperty('auditHistory');
    expect(transaction).toHaveProperty('createdAt');

    // Validate Journal Entry relational structure
    const journal = transaction.journalEntry!;
    expect(journal).toHaveProperty('journalId');
    expect(journal).toHaveProperty('transactionId', transaction.transactionId);
    expect(journal).toHaveProperty('entryDate');
    expect(journal).toHaveProperty('lines');
    expect(Array.isArray(journal.lines)).toBe(true);

    journal.lines.forEach(line => {
      expect(line).toHaveProperty('lineId');
      expect(line).toHaveProperty('accountCode');
      expect(line).toHaveProperty('accountName');
      expect(line).toHaveProperty('debit');
      expect(line).toHaveProperty('credit');
    });
  });

});
