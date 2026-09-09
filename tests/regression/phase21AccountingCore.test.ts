import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '../../src/db/client';
import {
  JournalPostingService,
  AccountingPeriodService,
  TrialBalanceService,
  LedgerService
} from '../../src/services/accounting';

describe('Phase 21 — Accounting / General Ledger Core Suite', { timeout: 30000 }, () => {
  let tenantId: string;

  beforeEach(async () => {
    tenantId = `TENANT-P21-${Math.random().toString(36).substring(2, 9)}`;
  });

  test('1. Balanced journal posts successfully', async () => {
    const journal = await JournalPostingService.postJournal({
      tenantId,
      entryDate: '2026-08-15',
      reference: 'INV-2026-001',
      description: 'Office Equipment Purchase',
      lines: [
        {
          accountCode: '1500-FIXED-ASSETS',
          accountName: 'Fixed Assets',
          debit: 10000,
          credit: 0
        },
        {
          accountCode: '2100-GST-INPUT',
          accountName: 'GST Input Tax',
          debit: 800,
          credit: 0
        },
        {
          accountCode: '2000-ACCOUNTS-PAYABLE',
          accountName: 'Accounts Payable',
          debit: 0,
          credit: 10800
        }
      ]
    });

    expect(journal.id).toBeDefined();
    expect(journal.status).toBe('POSTED');
    expect(journal.isBalanced).toBe(true);
    expect(new Prisma.Decimal(journal.totalDebit).toNumber()).toBe(10800);
    expect(new Prisma.Decimal(journal.totalCredit).toNumber()).toBe(10800);
    expect(journal.lines).toHaveLength(3);
  });

  test('2. Unbalanced journal is rejected', async () => {
    await expect(
      JournalPostingService.postJournal({
        tenantId,
        entryDate: '2026-08-15',
        reference: 'INV-2026-UNBALANCED',
        description: 'Unbalanced Journal',
        lines: [
          {
            accountCode: '1500-FIXED-ASSETS',
            debit: 10000,
            credit: 0
          },
          {
            accountCode: '2000-ACCOUNTS-PAYABLE',
            debit: 0,
            credit: 9000 // Short by 1000
          }
        ]
      })
    ).rejects.toThrow(/Unbalanced journal rejected/i);
  });

  test('3. Zero-line journal is rejected', async () => {
    await expect(
      JournalPostingService.postJournal({
        tenantId,
        entryDate: '2026-08-15',
        reference: 'INV-2026-ZERO',
        description: 'Zero Line Journal',
        lines: []
      })
    ).rejects.toThrow(/Zero-line journals are rejected/i);
  });

  test('4. Duplicate posting is rejected', async () => {
    const postParams = {
      tenantId,
      entryDate: '2026-08-15',
      reference: 'REF-DUP-001',
      description: 'First Posting',
      lines: [
        { accountCode: '1000-BANK', debit: 500, credit: 0 },
        { accountCode: '4000-REVENUE', debit: 0, credit: 500 }
      ]
    };

    await JournalPostingService.postJournal(postParams);

    // Attempting to post same reference again should be rejected
    await expect(
      JournalPostingService.postJournal({
        ...postParams,
        description: 'Duplicate Attempt'
      })
    ).rejects.toThrow(/Duplicate posting rejected/i);
  });

  test('5. Reversal balances and reverses original journal', async () => {
    const original = await JournalPostingService.postJournal({
      tenantId,
      entryDate: '2026-08-15',
      reference: 'REF-TO-REVERSE',
      description: 'Original Journal Before Reversal',
      lines: [
        { accountCode: '5200-EXPENSE', debit: 1500, credit: 0 },
        { accountCode: '1000-BANK', debit: 0, credit: 1500 }
      ]
    });

    const reversal = await JournalPostingService.reverseJournal(
      tenantId,
      original.id,
      '2026-08-16',
      'Incorrect Expense Posting'
    );

    expect(reversal.id).toBeDefined();
    expect(reversal.status).toBe('POSTED');
    expect(reversal.isBalanced).toBe(true);
    expect(new Prisma.Decimal(reversal.totalDebit).toNumber()).toBe(1500);
    expect(new Prisma.Decimal(reversal.totalCredit).toNumber()).toBe(1500);

    // Check line reversal: EXPENSE is credited 1500, BANK is debited 1500
    const bankLine = reversal.lines.find(l => l.accountCode === '1000-BANK');
    const expenseLine = reversal.lines.find(l => l.accountCode === '5200-EXPENSE');

    expect(new Prisma.Decimal(bankLine!.debit).toNumber()).toBe(1500);
    expect(new Prisma.Decimal(expenseLine!.credit).toNumber()).toBe(1500);

    // Original journal marked REVERSED
    const updatedOriginal = await prisma.journal.findUnique({ where: { id: original.id } });
    expect(updatedOriginal?.status).toBe('REVERSED');
  });

  test('6. Locked accounting period rejects new posting', async () => {
    const period = await AccountingPeriodService.findOrCreatePeriod(tenantId, '2026-08-01');
    await AccountingPeriodService.closePeriod(tenantId, period.id, 'CHIEF_ACCOUNTANT');

    await expect(
      JournalPostingService.postJournal({
        tenantId,
        entryDate: '2026-08-10',
        reference: 'REF-LOCKED-001',
        description: 'Posting to Locked Period',
        lines: [
          { accountCode: '1000-BANK', debit: 100, credit: 0 },
          { accountCode: '4000-REVENUE', debit: 0, credit: 100 }
        ]
      })
    ).rejects.toThrow(/Accounting period is closed or locked/i);
  });

  test('7. Trial balance balances (Total Debits === Total Credits)', async () => {
    await JournalPostingService.postJournal({
      tenantId,
      entryDate: '2026-08-10',
      reference: 'TX-001',
      description: 'Sales Revenue',
      lines: [
        { accountCode: '1100-AR', debit: 21600, credit: 0 },
        { accountCode: '4000-REVENUE', debit: 0, credit: 20000 },
        { accountCode: '2200-GST-OUTPUT', debit: 0, credit: 1600 }
      ]
    });

    await JournalPostingService.postJournal({
      tenantId,
      entryDate: '2026-08-12',
      reference: 'TX-002',
      description: 'Utilities Payment',
      lines: [
        { accountCode: '5210-UTILITIES', debit: 5000, credit: 0 },
        { accountCode: '2100-GST-INPUT', debit: 400, credit: 0 },
        { accountCode: '1000-BANK', debit: 0, credit: 5400 }
      ]
    });

    const tb = await TrialBalanceService.generateTrialBalance(tenantId, { asOfDate: '2026-08-31' });

    expect(tb.isBalanced).toBe(true);
    expect(tb.totalDebit.equals(tb.totalCredit)).toBe(true);
    expect(tb.accounts.length).toBeGreaterThanOrEqual(5);
  });

  test('8. Database transaction rollback works on unexpected failure', async () => {
    try {
      await prisma.$transaction(async tx => {
        await JournalPostingService.postJournal(
          {
            tenantId,
            entryDate: '2026-08-20',
            reference: 'ROLLBACK-TEST-001',
            description: 'This post will be rolled back',
            lines: [
              { accountCode: '1000-BANK', debit: 5000, credit: 0 },
              { accountCode: '4000-REVENUE', debit: 0, credit: 5000 }
            ]
          },
          tx
        );

        // Force intentional failure in the transaction
        throw new Error('INTENTIONAL_SIMULATED_TRANSACTION_FAILURE');
      });
    } catch (err: any) {
      expect(err.message).toBe('INTENTIONAL_SIMULATED_TRANSACTION_FAILURE');
    }

    // Verify record was NOT created in DB due to transaction rollback
    const rolledBackJournal = await prisma.journal.findFirst({
      where: { tenantId, reference: 'ROLLBACK-TEST-001' }
    });
    expect(rolledBackJournal).toBeNull();
  });

  test('9. Immutability rules: update and delete throw errors', async () => {
    await expect(JournalPostingService.updateJournal()).rejects.toThrow(/Posted journals cannot be edited/i);
    await expect(JournalPostingService.deleteJournal()).rejects.toThrow(/Posted journals cannot be deleted/i);
  });
});
