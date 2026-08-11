import {
  JournalEntry,
  JournalLine,
  TransactionIdentity,
  TransactionRecord
} from '../../types/taxEngine';

/**
 * Standard Chart of Accounts Mapping Helpers
 */
export const STANDARD_ACCOUNTS = {
  BANK: { code: '1000-BANK-ACCOUNT', name: 'Cash and Bank' },
  ACCOUNTS_RECEIVABLE: { code: '1100-ACCOUNTS-RECEIVABLE', name: 'Accounts Receivable' },
  FIXED_ASSETS: { code: '1500-FIXED-ASSET-REGISTER', name: 'Fixed Assets Register' },
  ACCOUNTS_PAYABLE: { code: '2000-ACCOUNTS-PAYABLE', name: 'Accounts Payable' },
  GST_INPUT_TAX: { code: '2100-GST-INPUT-TAX', name: 'GST Input Tax Recoverable' },
  GST_OUTPUT_TAX: { code: '2200-GST-OUTPUT-TAX', name: 'GST Output Tax Payable' },
  REVENUE: { code: '4000-OPERATING-REVENUE', name: 'Operating Revenue' },
  COST_OF_SALES: { code: '5000-COST-OF-SALES', name: 'Cost of Sales' },
  GENERAL_EXPENSE: { code: '5200-OPERATING-EXPENSES', name: 'Operating Expenses' },
  UTILITIES_EXPENSE: { code: '5210-UTILITIES-EXPENSE', name: 'Utilities Expense' },
  RENT_EXPENSE: { code: '5220-RENT-EXPENSE', name: 'Rent & Premises Expense' },
  FINES_PENALTIES: { code: '5290-FINES-AND-PENALTIES', name: 'Fines & Statutory Penalties' }
};

/**
 * Determines the target debit account for an expense/asset transaction based on category
 */
function resolveDebitAccount(category: string, treatment?: string): { code: string; name: string } {
  const cat = String(category || '').toLowerCase();
  const trt = String(treatment || '').toUpperCase();

  if (trt === 'ASSET' || cat.startsWith('capital_assets')) {
    return STANDARD_ACCOUNTS.FIXED_ASSETS;
  }
  if (trt === 'COST_OF_SALES' || cat.startsWith('cost_of_sales')) {
    return STANDARD_ACCOUNTS.COST_OF_SALES;
  }
  if (cat.includes('electricity') || cat.includes('water') || cat.includes('utilities')) {
    return STANDARD_ACCOUNTS.UTILITIES_EXPENSE;
  }
  if (cat.includes('rent') || cat.includes('occupancy')) {
    return STANDARD_ACCOUNTS.RENT_EXPENSE;
  }
  if (cat.includes('fines') || cat.includes('penalties')) {
    return STANDARD_ACCOUNTS.FINES_PENALTIES;
  }

  return STANDARD_ACCOUNTS.GENERAL_EXPENSE;
}

/**
 * Generates a balanced double-entry Journal Entry for any given transaction record.
 * Guarantees totalDebit === totalCredit.
 *
 * @param tx TransactionRecord or TransactionIdentity
 * @returns JournalEntry
 */
export function createJournalEntryForTransaction(
  tx: TransactionRecord | (TransactionIdentity & { 
    accountingTreatment?: string; 
    gstTreatment?: string; 
    description?: string; 
    supplierOrCustomer?: string;
  })
): JournalEntry {
  const lines: JournalLine[] = [];
  const sourceType = tx.sourceType || 'bill';
  const amount = Number(tx.amount || 0);
  const gstAmount = Number(tx.gstAmount || 0);
  const totalAmount = Number(tx.totalAmount || (amount + gstAmount));
  const desc = tx.description || `${sourceType.toUpperCase()} - ${tx.sourceId}`;

  // Journal ID generation
  const year = tx.transactionDate ? new Date(tx.transactionDate).getFullYear() : 2026;
  const rawIdNum = tx.transactionId ? tx.transactionId.replace(/[^0-9]/g, '').slice(-8) : '00000001';
  const journalId = `JNL-${year}-${rawIdNum.padStart(8, '0')}`;

  if (sourceType === 'invoice') {
    // -------------------------------------------------------------
    // Sales Invoice Flow (Accounts Receivable Debit, Revenue Credit)
    // -------------------------------------------------------------
    // Debit: Accounts Receivable (Gross Total)
    lines.push({
      lineId: `${journalId}-L1`,
      accountCode: STANDARD_ACCOUNTS.ACCOUNTS_RECEIVABLE.code,
      accountName: STANDARD_ACCOUNTS.ACCOUNTS_RECEIVABLE.name,
      debit: totalAmount,
      credit: 0,
      description: `AR: ${desc}`
    });

    // Credit: Operating Revenue (Net Amount)
    lines.push({
      lineId: `${journalId}-L2`,
      accountCode: STANDARD_ACCOUNTS.REVENUE.code,
      accountName: STANDARD_ACCOUNTS.REVENUE.name,
      debit: 0,
      credit: amount,
      description: `Revenue: ${desc}`
    });

    // Credit: Output GST (if GST applicable)
    if (gstAmount > 0) {
      lines.push({
        lineId: `${journalId}-L3`,
        accountCode: STANDARD_ACCOUNTS.GST_OUTPUT_TAX.code,
        accountName: STANDARD_ACCOUNTS.GST_OUTPUT_TAX.name,
        debit: 0,
        credit: gstAmount,
        description: `Output GST on ${desc}`
      });
    }
  } else if (sourceType === 'payment') {
    // -------------------------------------------------------------
    // Payment Flow (Accounts Payable Debit, Bank Credit)
    // -------------------------------------------------------------
    lines.push({
      lineId: `${journalId}-L1`,
      accountCode: STANDARD_ACCOUNTS.ACCOUNTS_PAYABLE.code,
      accountName: STANDARD_ACCOUNTS.ACCOUNTS_PAYABLE.name,
      debit: totalAmount,
      credit: 0,
      description: `Payment to ${tx.supplierOrCustomer || 'Vendor'}`
    });

    lines.push({
      lineId: `${journalId}-L2`,
      accountCode: STANDARD_ACCOUNTS.BANK.code,
      accountName: STANDARD_ACCOUNTS.BANK.name,
      debit: 0,
      credit: totalAmount,
      description: `Bank Outflow for ${desc}`
    });
  } else {
    // -------------------------------------------------------------
    // Bill / Purchase Flow (Expense/Asset Debit, AP Credit)
    // -------------------------------------------------------------
    const debitAcc = resolveDebitAccount(tx.accountingCategory, (tx as any).accountingTreatment);

    // If GST is input deductible, separate Net & GST.
    // If NO_INPUT_TAX or OUT_OF_SCOPE or EXEMPT, the GST (if any) is included in the expense/asset debit.
    const isGstInputClaimable = tx.gstTreatment !== 'NO_INPUT_TAX' && tx.gstTreatment !== 'OUT_OF_SCOPE';

    if (gstAmount > 0 && isGstInputClaimable) {
      // Net Amount -> Debit Expense / Asset Account
      lines.push({
        lineId: `${journalId}-L1`,
        accountCode: debitAcc.code,
        accountName: debitAcc.name,
        debit: amount,
        credit: 0,
        description: desc
      });

      // Input GST -> Debit Input GST Account
      lines.push({
        lineId: `${journalId}-L2`,
        accountCode: STANDARD_ACCOUNTS.GST_INPUT_TAX.code,
        accountName: STANDARD_ACCOUNTS.GST_INPUT_TAX.name,
        debit: gstAmount,
        credit: 0,
        description: `Input GST Recoverable - ${desc}`
      });
    } else {
      // Combined Gross Amount -> Debit Expense / Asset Account
      lines.push({
        lineId: `${journalId}-L1`,
        accountCode: debitAcc.code,
        accountName: debitAcc.name,
        debit: totalAmount,
        credit: 0,
        description: desc
      });
    }

    // Credit: Accounts Payable (Gross Total)
    lines.push({
      lineId: `${journalId}-L3`,
      accountCode: STANDARD_ACCOUNTS.ACCOUNTS_PAYABLE.code,
      accountName: STANDARD_ACCOUNTS.ACCOUNTS_PAYABLE.name,
      debit: 0,
      credit: totalAmount,
      description: `AP: ${tx.supplierOrCustomer || 'Vendor'} (${desc})`
    });
  }

  // Calculate totals and verify balance
  const totalDebit = Math.round(lines.reduce((sum, line) => sum + line.debit, 0) * 100) / 100;
  const totalCredit = Math.round(lines.reduce((sum, line) => sum + line.credit, 0) * 100) / 100;
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return {
    journalId,
    transactionId: tx.transactionId,
    entryDate: tx.transactionDate || new Date().toISOString().split('T')[0],
    entityId: tx.entityId || 'COMPANY-001',
    outletId: tx.outletId || 'OUTLET-001',
    lines,
    totalDebit,
    totalCredit,
    isBalanced,
    notes: `Auto-generated double-entry journal for ${sourceType} ${tx.sourceId}`
  };
}
