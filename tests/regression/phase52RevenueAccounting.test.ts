import { describe, test, expect, beforeEach } from 'vitest';
import { RevenueGstService } from '../../src/services/revenue/revenueGstService';
import { RevenueAccountMapper } from '../../src/services/revenue/revenueAccountMapper';
import { RevenueValidationService } from '../../src/services/revenue/revenueValidationService';
import { RevenuePostingService } from '../../src/services/revenue/revenuePostingService';
import { RevenuePersistenceService } from '../../src/services/revenue/revenuePersistenceService';
import { RevenueReconciliationService } from '../../src/services/reconciliation/revenueReconciliationService';
import { RevenueTraceService } from '../../src/services/revenue/revenueTraceService';
import { AccountingPeriodService } from '../../src/services/accounting/accountingPeriodService';
import { STANDARD_ACCOUNTS } from '../../src/services/accounting/journalService';
import { AuthUser } from '../../src/types';

describe('Phase 52 - Authoritative Revenue & Sales Accounting Integration', { timeout: 120000 }, () => {
  const mockAdminUser = {
    userId: 'user-admin-1',
    email: 'admin@crmaldives.mv',
    name: 'Lead Accountant',
    role: 'CLIENT_ADMIN' as const,
    tenantId: 'COMPANY-001',
    permissions: ['POST_JOURNAL', 'CREATE_TRANSACTIONS', 'REVERSE_TRANSACTIONS', 'VIEW_REPORTS', 'EXPORT_DATA'] as any
  };

  beforeEach(() => {
    RevenuePersistenceService.clear();
  });

  describe('5.1 & 5.2: GST Calculation & Precision', () => {
    test('Standard 8% GST Inclusive calculation accurately extracts net revenue and tax', () => {
      // MVR 10,800 gross -> Net 10,000, GST 800
      const calc = RevenueGstService.calculateRevenueGst(10800, 'GENERAL', 'GST_INCLUSIVE');
      expect(calc.rate).toBe(0.08);
      expect(calc.grossAmount).toBe(10800);
      expect(calc.netRevenue).toBe(10000);
      expect(calc.gstAmount).toBe(800);
      expect(calc.boxAssignment).toBe('BOX_1');
    });

    test('Standard 8% GST Exclusive calculation adds tax onto net revenue', () => {
      // Net MVR 10,000 -> GST 800, Gross 10,800
      const calc = RevenueGstService.calculateRevenueGst(10000, 'GENERAL', 'GST_EXCLUSIVE');
      expect(calc.rate).toBe(0.08);
      expect(calc.netRevenue).toBe(10000);
      expect(calc.gstAmount).toBe(800);
      expect(calc.grossAmount).toBe(10800);
      expect(calc.boxAssignment).toBe('BOX_1');
    });

    test('Tourism sector 16% TGST correctly applies statutory rate', () => {
      // MVR 11,600 inclusive -> Net 10,000, GST 1,600
      const calc = RevenueGstService.calculateRevenueGst(11600, 'TOURISM', 'GST_INCLUSIVE');
      expect(calc.rate).toBe(0.16);
      expect(calc.netRevenue).toBe(10000);
      expect(calc.gstAmount).toBe(1600);
      expect(calc.grossAmount).toBe(11600);
    });

    test('Zero-rated sales yield 0 GST and map to Box 2', () => {
      const calc = RevenueGstService.calculateZeroRatedRevenue(5000);
      expect(calc.rate).toBe(0);
      expect(calc.gstAmount).toBe(0);
      expect(calc.netRevenue).toBe(5000);
      expect(calc.grossAmount).toBe(5000);
      expect(calc.boxAssignment).toBe('BOX_2');
    });

    test('Exempt sales yield 0 GST and map to Box 3', () => {
      const calc = RevenueGstService.calculateExemptRevenue(7500);
      expect(calc.rate).toBe(0);
      expect(calc.gstAmount).toBe(0);
      expect(calc.netRevenue).toBe(7500);
      expect(calc.grossAmount).toBe(7500);
      expect(calc.boxAssignment).toBe('BOX_3');
    });
  });

  describe('5.3: Account Mapping & Double-Entry Integrity', () => {
    test('Cash payment correctly maps to Cash on Hand (1000) and Revenue (4000) + GST (2200)', () => {
      const accounts = RevenueAccountMapper.resolveAccounts({
        paymentMethod: 'Cash',
        category: 'POS Sales',
        sector: 'GENERAL'
      });
      expect(accounts.debitAccount.code).toBe(STANDARD_ACCOUNTS.CASH.code);
      expect(accounts.creditRevenueAccount.code).toBe(STANDARD_ACCOUNTS.REVENUE.code);
      expect(accounts.creditGstAccount.code).toBe(STANDARD_ACCOUNTS.GST_OUTPUT.code);
    });

    test('Card / POS payment maps to Bank MVR (1010)', () => {
      const accounts = RevenueAccountMapper.resolveAccounts({
        paymentMethod: 'Card / POS',
        category: 'Dine-In Sales',
        sector: 'GENERAL'
      });
      expect(accounts.debitAccount.code).toBe(STANDARD_ACCOUNTS.BANK_MVR.code);
    });

    test('Credit sales map to Accounts Receivable (1200)', () => {
      const accounts = RevenueAccountMapper.resolveAccounts({
        paymentMethod: 'Credit',
        category: 'Wholesale',
        sector: 'GENERAL'
      });
      expect(accounts.debitAccount.code).toBe(STANDARD_ACCOUNTS.ACCOUNTS_RECEIVABLE.code);
    });
  });

  describe('5.4: Authoritative Posting, Immutability & Reversal Workflow', () => {
    test('Posting a revenue entry creates a balanced double-entry journal and GST transaction', async () => {
      const payload = {
        outletId: 'OUTLET-01',
        outletName: 'Male Central',
        date: '2026-03-10',
        category: 'POS Sales' as const,
        grossAmount: 10800,
        paymentMethod: 'Card / POS' as const,
        sector: 'GENERAL' as const,
        amountBasis: 'GST_INCLUSIVE' as const,
        notes: 'Counter POS settlement'
      };

      const tx = await RevenuePostingService.postRevenue(payload, mockAdminUser);

      expect(tx.id).toMatch(/^REV-2026-03-\d{6}$/);
      expect(tx.status).toBe('POSTED');
      expect(tx.journalId).toBeDefined();
      expect(tx.gstTransactionId).toBeDefined();
      expect(tx.grossAmount).toBe(10800);
      expect(tx.gstAmount).toBe(800);
      expect(tx.netAmount).toBe(10000);

      // Verify diagnostic trace
      const trace = await RevenueTraceService.buildTrace(tx.id);
      expect(trace.status).toBe('POSTED');
      expect(trace.journal).toBeDefined();
      expect(trace.journal?.isBalanced).toBe(true);
      expect(trace.journal?.totalDebit).toBe(10800);
      expect(trace.journal?.totalCredit).toBe(10800);
      expect(trace.gstTransaction).toBeDefined();
      expect(trace.gstTransaction?.taxAmount).toBe(800);
      expect(trace.pnlImpact.netRevenueCredited).toBe(10000);
    });

    test('Idempotency prevents double posting of identical transactions', async () => {
      const payload = {
        outletId: 'OUTLET-01',
        date: '2026-03-11',
        category: 'POS Sales' as const,
        grossAmount: 5400,
        paymentMethod: 'Cash' as const,
        idempotencyKey: 'IDEMP-POS-20260311-001'
      };

      const first = await RevenuePostingService.postRevenue(payload, mockAdminUser);
      expect(first.status).toBe('POSTED');

      // Duplicate submission must return original without duplicating ledger
      const duplicate = await RevenuePostingService.postRevenue(payload, mockAdminUser);
      expect(duplicate.id).toBe(first.id);
      expect(RevenuePersistenceService.getAll().length).toBe(1);
    });

    test('Reversing a posted transaction creates an inverse double-entry journal and marks it REVERSED', async () => {
      const payload = {
        outletId: 'OUTLET-01',
        date: '2026-03-12',
        category: 'POS Sales' as const,
        grossAmount: 2160,
        paymentMethod: 'Card / POS' as const
      };

      const original = await RevenuePostingService.postRevenue(payload, mockAdminUser);
      expect(original.status).toBe('POSTED');

      // Execute reversal
      const reversed = await RevenuePostingService.reverseRevenue(
        original.id,
        'Customer refunded in full',
        mockAdminUser
      );

      expect(reversed.status).toBe('REVERSED');
      expect(reversed.reversalJournalId).toBeDefined();

      // Diagnostic trace of reversed transaction
      const trace = await RevenueTraceService.buildTrace(original.id);
      expect(trace.status).toBe('REVERSED');
      expect(trace.pnlImpact.netRevenueCredited).toBe(0); // P&L impact zeroed out
    });

    test('Correcting a posted transaction performs an atomic reversal and posts a replacement', async () => {
      const originalPayload = {
        outletId: 'OUTLET-01',
        date: '2026-03-13',
        category: 'POS Sales' as const,
        grossAmount: 1080,
        paymentMethod: 'Cash' as const
      };

      const original = await RevenuePostingService.postRevenue(originalPayload, mockAdminUser);

      // Correction: amount was actually 1620
      const replacementPayload = {
        outletId: 'OUTLET-01',
        date: '2026-03-13',
        category: 'POS Sales' as const,
        grossAmount: 1620,
        paymentMethod: 'Cash' as const,
        notes: 'Corrected amount per till audit'
      };

      const result = await RevenuePostingService.correctRevenue(
        original.id,
        replacementPayload,
        mockAdminUser
      );

      expect(result.original.status).toBe('REVERSED');
      expect(result.replacement.status).toBe('POSTED');
      expect(result.replacement.reversalOfId).toBe(original.id);
      expect(result.original.reversedById).toBe(result.replacement.id);
      expect(result.replacement.grossAmount).toBe(1620);
    });

    test('Direct update on a POSTED transaction is rejected to enforce audit immutability', async () => {
      const original = await RevenuePostingService.postRevenue({
        outletId: 'OUTLET-01',
        date: '2026-03-14',
        category: 'POS Sales' as const,
        grossAmount: 500
      }, mockAdminUser);

      await expect(
        RevenuePostingService.updateDraft(original.id, { grossAmount: 900 }, mockAdminUser)
      ).rejects.toThrow(/Cannot edit a posted revenue transaction directly/);
    });
  });

  describe('5.5: 4-Way Reconciliation Engine', () => {
    test('4-Way Reconciliation verifies subledger matches GL, GST, and P&L', async () => {
      // Post 2 transactions
      await RevenuePostingService.postRevenue({
        outletId: 'OUTLET-01',
        date: '2026-03-15',
        category: 'POS Sales' as const,
        grossAmount: 10800,
        paymentMethod: 'Card / POS' as const
      }, mockAdminUser);

      await RevenuePostingService.postRevenue({
        outletId: 'OUTLET-02',
        date: '2026-03-15',
        category: 'Catering' as const,
        grossAmount: 5400,
        paymentMethod: 'Bank Transfer' as const
      }, mockAdminUser);

      const report = await RevenueReconciliationService.run4WayReconciliation();

      expect(report.overallStatus).toBe('PASS');
      expect(report.subledgerGrossTotal).toBe(16200);
      expect(report.subledgerNetTotal).toBe(15000);
      expect(report.subledgerGstTotal).toBe(1200);

      // Check subledger vs GL Revenue
      expect(report.checks.subledgerVsGlRevenue.status).toBe('PASS');
      expect(report.checks.subledgerVsGlRevenue.variance).toBe(0);

      // Check subledger vs GL GST
      expect(report.checks.subledgerVsGlGst.status).toBe('PASS');
      expect(report.checks.subledgerVsGlGst.variance).toBe(0);

      // Check subledger vs GST Transactions
      expect(report.checks.subledgerVsGstTransactions.status).toBe('PASS');

      // Check subledger vs P&L
      expect(report.checks.subledgerVsPnl.status).toBe('PASS');
    });
  });
});
