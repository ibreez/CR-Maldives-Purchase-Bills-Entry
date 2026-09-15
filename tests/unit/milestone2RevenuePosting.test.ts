import { describe, test, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { RevenueAccountMapper, REVENUE_STANDARD_ACCOUNTS } from '../../src/services/revenue/revenueAccountMapper';
import { RevenuePostingService } from '../../src/services/revenue/revenuePostingService';
import { RevenuePersistenceService } from '../../src/services/revenue/revenuePersistenceService';
import { RevenueTraceService } from '../../src/services/revenue/revenueTraceService';
import { UserSession } from '../../src/types/rbac';

describe('Milestone 2 - Accounting Journal Generation & Posting Core', { timeout: 60000 }, () => {
  const testTenant = 'COMPANY-001';
  const mockUser: UserSession = {
    userId: 'USR-M2-001',
    tenantId: testTenant,
    role: 'CLIENT_ADMIN'
  };

  beforeEach(() => {
    RevenuePersistenceService.clear();
  });

  describe('2.1 Payment Account Mapping', () => {
    test('resolves Cash to Cash on Hand account', () => {
      const mapping = RevenueAccountMapper.resolvePaymentAccount('Cash');
      expect(mapping).toBeDefined();
      expect(mapping?.code).toBe('1000-CASH-ON-HAND');
      expect(mapping?.accountType).toBe('ASSET');

      const explicit1010 = RevenueAccountMapper.resolvePaymentAccount('1010-CASH-ON-HAND');
      expect(explicit1010?.code).toBe('1010-CASH-ON-HAND');
    });

    test('resolves Card / POS to Card clearing or bank clearing', () => {
      const cardDefault = RevenueAccountMapper.resolvePaymentAccount('Card / POS');
      expect(cardDefault).toBeDefined();
      expect(cardDefault?.code).toBe('1010-BANK-MVR');

      const cardClearing = RevenueAccountMapper.resolvePaymentAccount('Card / POS', { useClearingAccounts: true });
      expect(cardClearing?.code).toBe('1020-CARD-CLEARING');
    });

    test('resolves Bank Transfer to Bank account', () => {
      const bank = RevenueAccountMapper.resolvePaymentAccount('Bank Transfer');
      expect(bank?.code).toBe('1000-BANK-ACCOUNT');
    });

    test('resolves Credit to Accounts Receivable', () => {
      const credit = RevenueAccountMapper.resolvePaymentAccount('Credit');
      expect(credit?.code).toBe('1100-ACCOUNTS-RECEIVABLE');
    });

    test('resolves Online to Online Gateway Clearing', () => {
      const online = RevenueAccountMapper.resolvePaymentAccount('Online Payment (BML Gateway)');
      expect(online?.code).toBe('1030-ONLINE-CLEARING');
    });

    test('resolves Output Tax to 2200-GST-OUTPUT-TAX and Revenue to 4000-OPERATING-REVENUE', () => {
      const taxAcc = RevenueAccountMapper.resolveGstOutputAccount();
      expect(taxAcc.code).toBe('2200-GST-OUTPUT-TAX');
      expect(taxAcc.accountType).toBe('LIABILITY');

      const revAcc = RevenueAccountMapper.resolveRevenueAccount('F&B');
      expect(revAcc.code).toBe('4000-OPERATING-REVENUE');
      expect(revAcc.accountType).toBe('REVENUE');
    });

    test('unresolvable payment method returns null and flags as REVIEW_REQUIRED without inventing accounts', async () => {
      const unmappedMethod = 'Cryptocurrency-Custom-Wallet';
      const resolved = RevenueAccountMapper.resolvePaymentAccount(unmappedMethod);
      expect(resolved).toBeNull();

      const result = await RevenuePostingService.postRevenue({
        tenantId: testTenant,
        outletId: 'OUTLET-01',
        transactionDate: '2026-03-10',
        grossAmount: 5000,
        paymentMethod: unmappedMethod as any,
        description: 'Unmapped Crypto Payment'
      }, mockUser);

      expect(result.status).toBe('REVIEW_REQUIRED');
      expect(result.journalId).toBeUndefined(); // Did not invent GL account or post unbalanced journal
    });
  });

  describe('2.2 Atomic Journal Posting Service', () => {
    test('calculates balanced debits and credits with exact Prisma.Decimal', async () => {
      const payload = {
        tenantId: testTenant,
        outletId: 'OUTLET-M2',
        outletName: 'Male Retail Outlet',
        transactionDate: '2026-03-10',
        category: 'Merchandise Sales',
        grossAmount: 10800,
        paymentMethod: 'Card / POS' as const,
        sector: 'GENERAL' as const,
        amountBasis: 'GST_INCLUSIVE' as const,
        description: 'Retail counter sale'
      };

      const record = await RevenuePostingService.postRevenue(payload, mockUser);

      expect(record.status).toBe('POSTED');
      expect(record.grossAmount).toBe(10800);
      expect(record.netAmount).toBe(10000);
      expect(record.gstAmount).toBe(800);
      expect(record.journalId).toBeDefined();
      expect(record.gstTransactionId).toBeDefined();

      // Verify trace confirms double-entry balancing
      const trace = await RevenueTraceService.buildTrace(record.id);
      expect(trace.journal).toBeDefined();
      expect(trace.journal?.isBalanced).toBe(true);
      expect(trace.journal?.totalDebit).toBe(10800);
      expect(trace.journal?.totalCredit).toBe(10800);
    });

    test('zero-rated or exempt revenue omits GST line and balances gross == net', async () => {
      const exemptPayload = {
        tenantId: testTenant,
        outletId: 'OUTLET-MED',
        transactionDate: '2026-03-10',
        grossAmount: 2500,
        gstClassification: 'EXEMPT' as const,
        paymentMethod: 'Bank Transfer' as const,
        description: 'Statutory Exempt Medical Consultation'
      };

      const record = await RevenuePostingService.postRevenue(exemptPayload, mockUser);

      expect(record.status).toBe('POSTED');
      expect(record.gstAmount).toBe(0);
      expect(record.netAmount).toBe(2500);
      expect(record.grossAmount).toBe(2500);

      const trace = await RevenueTraceService.buildTrace(record.id);
      expect(trace.journal?.isBalanced).toBe(true);
      expect(trace.journal?.totalDebit).toBe(2500);
      expect(trace.journal?.totalCredit).toBe(2500);
      // Only 2 lines: Debit Bank, Credit Operating Revenue (no GST line)
      expect(trace.journal?.lines.length).toBe(2);
    });

    test('exact decimal arithmetic preserves fractional cents', async () => {
      // 108.50 inclusive @ 8% GST -> Net 100.46, GST 8.04
      const payload = {
        tenantId: testTenant,
        outletId: 'OUTLET-01',
        transactionDate: '2026-03-10',
        grossAmount: 108.50,
        paymentMethod: 'Cash' as const,
        sector: 'GENERAL' as const,
        amountBasis: 'GST_INCLUSIVE' as const
      };

      const record = await RevenuePostingService.postRevenue(payload, mockUser);
      expect(record.status).toBe('POSTED');

      const sumDebits = new Prisma.Decimal(record.grossAmount);
      const sumCredits = new Prisma.Decimal(record.netAmount).plus(new Prisma.Decimal(record.gstAmount));
      expect(sumDebits.equals(sumCredits)).toBe(true);
    });

    test('draft creation and subsequent posting via postDraft', async () => {
      const draftPayload = {
        tenantId: testTenant,
        outletId: 'OUTLET-DRAFT',
        transactionDate: '2026-03-10',
        grossAmount: 3240,
        paymentMethod: 'Cash' as const,
        autoPost: false,
        description: 'Draft end-of-day register batch'
      };

      const draft = await RevenuePostingService.postRevenue(draftPayload, mockUser);
      expect(draft.status).toBe('DRAFT');
      expect(draft.journalId).toBeUndefined();

      // Now post the draft
      const posted = await RevenuePostingService.postDraft(draft.id, mockUser);
      expect(posted.status).toBe('POSTED');
      expect(posted.journalId).toBeDefined();
    });

    test('posted revenue records are immutable against direct deletion or update', async () => {
      const payload = {
        tenantId: testTenant,
        outletId: 'OUTLET-01',
        transactionDate: '2026-03-10',
        grossAmount: 1000,
        paymentMethod: 'Cash' as const
      };

      const posted = await RevenuePostingService.postRevenue(payload, mockUser);
      expect(posted.status).toBe('POSTED');

      // Attempt direct mutation
      await expect(
        RevenuePostingService.updateDraft(posted.id, { grossAmount: 2000 }, mockUser)
      ).rejects.toThrow(/Cannot edit a posted revenue transaction directly/);

      // Attempt direct deletion
      expect(() => RevenuePostingService.deleteTransaction(posted.id, testTenant)).toThrow(
        /Posted financial records are immutable/
      );
    });
  });
});
