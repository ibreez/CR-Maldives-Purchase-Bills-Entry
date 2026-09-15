import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '../../src/db/client';
import { RevenuePostingService } from '../../src/services/revenue/revenuePostingService';
import { RevenuePersistenceService } from '../../src/services/revenue/revenuePersistenceService';
import { RevenueGstService } from '../../src/services/revenue/revenueGstService';
import { RevenueReconciliationService } from '../../src/services/reconciliation/revenueReconciliationService';
import { PeriodControlService } from '../../src/services/accounting/periodControlService';
import { AccountingPeriodService } from '../../src/services/accounting/accountingPeriodService';
import { UserSession } from '../../src/types/rbac';

describe('Milestone 6 - Automated Test Suite & Acceptance Verification', { timeout: 60000 }, () => {
  const tenantId = 'COMPANY-001';
  const outletId = 'OUTLET-001';
  const mockSession: UserSession = {
    userId: 'USR-ACCP-001',
    tenantId,
    role: 'CLIENT_ADMIN'
  };

  beforeEach(() => {
    RevenuePersistenceService.clear();
    PeriodControlService.resetStore();
    vi.restoreAllMocks();
  });

  describe('6.1 Acceptance Tests (Golden Scenarios)', () => {
    test('GOLDEN-REV-001: General Sector sale (MVR 108,000 gross -> MVR 100,000 net, MVR 8,000 GST, balanced journal, GSTTransaction created)', async () => {
      const result = await RevenuePostingService.postRevenue(
        {
          tenantId,
          outletId,
          transactionDate: '2025-05-15',
          category: 'POS Sales',
          description: 'GOLDEN-REV-001 General Sale',
          grossAmount: 108000,
          amountBasis: 'GST_INCLUSIVE',
          sector: 'GENERAL',
          gstClassification: 'TAXABLE',
          paymentMethod: 'Cash'
        },
        mockSession,
        prisma
      );

      expect(result.status).toBe('POSTED');
      expect(Number(result.grossAmount)).toBe(108000);
      expect(Number(result.netAmount)).toBe(100000);
      expect(Number(result.gstAmount)).toBe(8000);
      expect(result.gstRate).toBe(0.08);
      expect(result.gstRatePercentage).toBe(8);
      expect(result.gstRuleId).toBe('RULE-GST-GEN-8');
      expect(result.journalId).toBeDefined();
      expect(result.gstTransactionId).toBeDefined();

      // Verify journal is balanced
      const journal = await prisma.journal.findUnique({
        where: { id: result.journalId },
        include: { lines: true }
      });
      expect(journal).toBeDefined();
      expect(journal?.lines.length).toBe(3); // Cash debit, Revenue credit, GST liability credit

      let totalDebits = new Prisma.Decimal(0);
      let totalCredits = new Prisma.Decimal(0);
      for (const line of journal!.lines) {
        totalDebits = totalDebits.plus(line.debit);
        totalCredits = totalCredits.plus(line.credit);
      }
      expect(totalDebits.toString()).toBe('108000');
      expect(totalCredits.toString()).toBe('108000');
      expect(totalDebits.equals(totalCredits)).toBe(true);

      // Verify GSTTransaction is created
      const gstTx = await prisma.gSTTransaction.findUnique({
        where: { id: result.gstTransactionId }
      });
      expect(gstTx).toBeDefined();
      expect(Number(gstTx?.taxableAmount)).toBe(100000);
      expect(Number(gstTx?.gstAmount)).toBe(8000);
      expect(Number(gstTx?.gstRate)).toBe(0.08);
    });

    test('GOLDEN-REV-002: GST-exclusive sale (MVR 100,000 net + 8% -> identical accounting & GST)', async () => {
      const result = await RevenuePostingService.postRevenue(
        {
          tenantId,
          outletId,
          transactionDate: '2025-05-16',
          category: 'POS Sales',
          description: 'GOLDEN-REV-002 Exclusive Sale',
          netAmount: 100000,
          amountBasis: 'GST_EXCLUSIVE',
          sector: 'GENERAL',
          gstClassification: 'TAXABLE',
          paymentMethod: 'Card / POS'
        },
        mockSession,
        prisma
      );

      expect(result.status).toBe('POSTED');
      expect(Number(result.grossAmount)).toBe(108000);
      expect(Number(result.netAmount)).toBe(100000);
      expect(Number(result.gstAmount)).toBe(8000);
      expect(result.gstRate).toBe(0.08);
      expect(result.journalId).toBeDefined();
      expect(result.gstTransactionId).toBeDefined();

      const journal = await prisma.journal.findUnique({
        where: { id: result.journalId },
        include: { lines: true }
      });
      let totalDebits = new Prisma.Decimal(0);
      let totalCredits = new Prisma.Decimal(0);
      for (const line of journal!.lines) {
        totalDebits = totalDebits.plus(line.debit);
        totalCredits = totalCredits.plus(line.credit);
      }
      expect(totalDebits.toString()).toBe('108000');
      expect(totalCredits.toString()).toBe('108000');
    });

    test('GOLDEN-REV-003: Exempt sale (MVR 100,000 gross -> MVR 100,000 net, 0 GST, no GST output credit)', async () => {
      const result = await RevenuePostingService.postRevenue(
        {
          tenantId,
          outletId,
          transactionDate: '2025-05-17',
          category: 'POS Sales',
          description: 'GOLDEN-REV-003 Exempt Sale',
          grossAmount: 100000,
          netAmount: 100000,
          amountBasis: 'GST_INCLUSIVE',
          sector: 'GENERAL',
          gstClassification: 'EXEMPT',
          paymentMethod: 'Bank Transfer'
        },
        mockSession,
        prisma
      );

      expect(result.status).toBe('POSTED');
      expect(Number(result.grossAmount)).toBe(100000);
      expect(Number(result.netAmount)).toBe(100000);
      expect(Number(result.gstAmount)).toBe(0);
      expect(result.gstRate).toBe(0);

      // Verify journal only has 2 lines (debit Bank, credit Revenue) and NO GST liability line
      const journal = await prisma.journal.findUnique({
        where: { id: result.journalId },
        include: { lines: true }
      });
      expect(journal?.lines.length).toBe(2);
      expect(journal?.lines.some(l => l.accountCode.includes('2200'))).toBe(false);

      let totalDebits = new Prisma.Decimal(0);
      let totalCredits = new Prisma.Decimal(0);
      for (const line of journal!.lines) {
        totalDebits = totalDebits.plus(line.debit);
        totalCredits = totalCredits.plus(line.credit);
      }
      expect(totalDebits.toString()).toBe('100000');
      expect(totalCredits.toString()).toBe('100000');
    });

    test('GOLDEN-REV-004: Tourism historical rate (2025-06-30 -> 16% TGST)', async () => {
      const result = await RevenuePostingService.postRevenue(
        {
          tenantId,
          outletId,
          transactionDate: '2025-06-30',
          category: 'POS Sales',
          description: 'GOLDEN-REV-004 Tourism June 2025',
          grossAmount: 116000,
          amountBasis: 'GST_INCLUSIVE',
          sector: 'TOURISM',
          gstClassification: 'TAXABLE',
          paymentMethod: 'Card / POS'
        },
        mockSession,
        prisma
      );

      expect(result.status).toBe('POSTED');
      expect(Number(result.grossAmount)).toBe(116000);
      expect(Number(result.netAmount)).toBe(100000);
      expect(Number(result.gstAmount)).toBe(16000);
      expect(result.gstRate).toBe(0.16);
      expect(result.gstRatePercentage).toBe(16);
      expect(result.gstRuleId).toBe('RULE-GST-TOU-16');
    });

    test('GOLDEN-REV-005: Tourism current rate (2025-07-01 -> 17% TGST)', async () => {
      const result = await RevenuePostingService.postRevenue(
        {
          tenantId,
          outletId,
          transactionDate: '2025-07-01',
          category: 'POS Sales',
          description: 'GOLDEN-REV-005 Tourism July 2025',
          grossAmount: 117000,
          amountBasis: 'GST_INCLUSIVE',
          sector: 'TOURISM',
          gstClassification: 'TAXABLE',
          paymentMethod: 'Card / POS'
        },
        mockSession,
        prisma
      );

      expect(result.status).toBe('POSTED');
      expect(Number(result.grossAmount)).toBe(117000);
      expect(Number(result.netAmount)).toBe(100000);
      expect(Number(result.gstAmount)).toBe(17000);
      expect(result.gstRate).toBe(0.17);
      expect(result.gstRatePercentage).toBe(17);
      expect(result.gstRuleId).toBe('RULE-GST-TOU-17');
    });
  });

  describe('6.2 Workflow & Failure Mode Tests', () => {
    test('test_edit_draft_allowed() vs. test_edit_posted_rejected()', async () => {
      // 1. Create a draft
      const draft = await RevenuePostingService.postRevenue(
        {
          tenantId,
          outletId,
          transactionDate: '2025-08-01',
          category: 'POS Sales',
          description: 'Draft Entry',
          grossAmount: 5400,
          amountBasis: 'GST_INCLUSIVE',
          paymentMethod: 'Cash',
          autoPost: false
        },
        mockSession,
        prisma
      );

      expect(draft.status).toBe('DRAFT');

      // Edit draft allowed
      const updatedDraft = await RevenuePostingService.updateDraft(
        draft.id,
        {
          description: 'Updated Draft Entry',
          category: 'Catering'
        },
        tenantId
      );
      expect(updatedDraft.description).toBe('Updated Draft Entry');
      expect(updatedDraft.category).toBe('Catering');

      // 2. Post a revenue transaction
      const posted = await RevenuePostingService.postDraft(draft.id, mockSession, prisma);
      expect(posted.status).toBe('POSTED');

      // Edit posted transaction rejected
      await expect(
        RevenuePostingService.updateDraft(
          posted.id,
          { description: 'Attempted modification of posted entry' },
          tenantId
        )
      ).rejects.toThrow(/Cannot edit a posted revenue transaction directly/i);

      // Direct deletion of posted rejected
      expect(() => {
        RevenuePostingService.deleteTransaction(posted.id, tenantId);
      }).toThrow(/Cannot delete transaction with status "POSTED"/);
    });

    test('test_duplicate_post_idempotent() (same payload submitted twice -> only 1 transaction, 1 journal)', async () => {
      const idempotencyKey = 'IDEMP-TEST-KEY-999';

      const firstCall = await RevenuePostingService.postRevenue(
        {
          tenantId,
          outletId,
          transactionDate: '2025-08-05',
          category: 'POS Sales',
          description: 'Idempotent Sale',
          grossAmount: 21600,
          amountBasis: 'GST_INCLUSIVE',
          paymentMethod: 'Cash',
          idempotencyKey
        },
        mockSession,
        prisma
      );

      const secondCall = await RevenuePostingService.postRevenue(
        {
          tenantId,
          outletId,
          transactionDate: '2025-08-05',
          category: 'POS Sales',
          description: 'Idempotent Sale',
          grossAmount: 21600,
          amountBasis: 'GST_INCLUSIVE',
          paymentMethod: 'Cash',
          idempotencyKey
        },
        mockSession,
        prisma
      );

      expect(secondCall.id).toBe(firstCall.id);
      expect(secondCall.journalId).toBe(firstCall.journalId);
      expect(secondCall.gstTransactionId).toBe(firstCall.gstTransactionId);

      const allRecords = RevenuePersistenceService.getAll(tenantId);
      const matching = allRecords.filter(r => r.idempotencyKey === idempotencyKey);
      expect(matching.length).toBe(1);
    });

    test('test_locked_period_rejected() (posting to locked accounting period is blocked)', async () => {
      const lockedDate = '2024-12-15';

      // Create closed accounting period in database
      await AccountingPeriodService.createPeriod(
        {
          tenantId,
          periodName: 'FY2024-Closed',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          isClosed: true
        },
        prisma
      );

      await expect(
        RevenuePostingService.postRevenue(
          {
            tenantId,
            outletId,
            transactionDate: lockedDate,
            category: 'POS Sales',
            description: 'Sale in locked year',
            grossAmount: 10800,
            amountBasis: 'GST_INCLUSIVE',
            paymentMethod: 'Cash'
          },
          mockSession,
          prisma
        )
      ).rejects.toThrow(/locked/i);
    });

    test('test_atomic_rollback() (simulated failure during GST record generation rolls back journal and revenue)', async () => {
      // Mock createCanonicalGstTransaction to simulate transient failure
      vi.spyOn(RevenueGstService, 'createCanonicalGstTransaction').mockRejectedValueOnce(
        new Error('SIMULATED_GST_SERVICE_UNAVAILABLE')
      );

      const initialRevenueCount = RevenuePersistenceService.getAll(tenantId).length;

      await expect(
        RevenuePostingService.postRevenue(
          {
            tenantId,
            outletId,
            transactionDate: '2025-09-01',
            category: 'POS Sales',
            description: 'Failed GST Generation Sale',
            grossAmount: 108000,
            amountBasis: 'GST_INCLUSIVE',
            paymentMethod: 'Cash'
          },
          mockSession,
          prisma
        )
      ).rejects.toThrow('SIMULATED_GST_SERVICE_UNAVAILABLE');

      // Ensure no revenue record was persisted in state
      const postRevenueCount = RevenuePersistenceService.getAll(tenantId).length;
      expect(postRevenueCount).toBe(initialRevenueCount);
    });

    test('test_revenue_reconciliation() (verify GL, GST, and P&L reconcile with zero variance)', async () => {
      // Post two clean transactions
      await RevenuePostingService.postRevenue(
        {
          tenantId,
          outletId,
          transactionDate: '2025-09-10',
          category: 'POS Sales',
          description: 'Reconciliation Tx 1',
          grossAmount: 108000,
          amountBasis: 'GST_INCLUSIVE',
          sector: 'GENERAL',
          paymentMethod: 'Cash'
        },
        mockSession,
        prisma
      );

      await RevenuePostingService.postRevenue(
        {
          tenantId,
          outletId,
          transactionDate: '2025-09-11',
          category: 'POS Sales',
          description: 'Reconciliation Tx 2',
          grossAmount: 54000,
          amountBasis: 'GST_INCLUSIVE',
          sector: 'GENERAL',
          paymentMethod: 'Cash'
        },
        mockSession,
        prisma
      );

      const report = await RevenueReconciliationService.reconcileRevenue({
        tenantId,
        startDate: '2025-09-01',
        endDate: '2025-09-30',
        prismaClient: prisma
      });

      expect(report.overallStatus).toBe('PASS');
      expect(report.checks.revenueToGL.status).toBe('PASS');
      expect(report.checks.revenueToGL.variance).toBe(0);
      expect(report.checks.gstToGL.status).toBe('PASS');
      expect(report.checks.gstToGL.variance).toBe(0);
      expect(report.checks.gstToGstTransactions.status).toBe('PASS');
      expect(report.checks.revenueToPnL.status).toBe('PASS');
      expect(report.checks.revenueToPnL.variance).toBe(0);
    });
  });
});
