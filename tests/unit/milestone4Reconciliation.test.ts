import { describe, test, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '../../src/db/client';
import { RevenuePersistenceService } from '../../src/services/revenue/revenuePersistenceService';
import { RevenuePostingService } from '../../src/services/revenue/revenuePostingService';
import { RevenueReconciliationService } from '../../src/services/reconciliation/revenueReconciliationService';
import { RevenueTraceService } from '../../src/services/revenue/revenueTraceService';
import { generateSchedule1PnL, generateSchedule1PnLFromGeneralLedger, convertRevenueToTransactionRecord } from '../../src/services/accounting/pnlService';
import { UserSession } from '../../src/types/rbac';
import { RevenueTransaction } from '../../src/types/revenue';

describe('Milestone 4 - Reporting, Reconciliations & Transaction Trace', { timeout: 60000 }, () => {
  beforeEach(async () => {
    RevenuePersistenceService.clear();
  });

  describe('4.1 P&L Integration via General Ledger', () => {
    test('1. P&L reflects Net Revenue (100,000) rather than Gross Revenue (108,000)', async () => {
      const pnlTenant = `TENANT-M4-PNL-${Date.now()}`;
      const mockUser: UserSession = {
        userId: 'USR-M4-PNL',
        tenantId: pnlTenant,
        role: 'CLIENT_ADMIN'
      };

      // Create a revenue transaction: Gross 108,000 MVR, 8% General GST
      const revenueTx = await RevenuePostingService.postRevenue({
        tenantId: pnlTenant,
        outletId: 'OUTLET-MAIN',
        transactionDate: '2026-03-20',
        grossAmount: 108000,
        amountBasis: 'GST_INCLUSIVE',
        sector: 'GENERAL',
        gstClassification: 'TAXABLE',
        paymentMethod: 'Bank Transfer',
        category: 'ROOM_REVENUE',
        description: 'Deluxe Suite Booking'
      }, mockUser);

      expect(revenueTx.status).toBe('POSTED');
      expect(Number(revenueTx.grossAmount)).toBe(108000);
      expect(Number(revenueTx.netAmount)).toBe(100000);
      expect(Number(revenueTx.gstAmount)).toBe(8000);

      // Verify GL-derived P&L
      const pnlGl = await generateSchedule1PnLFromGeneralLedger({
        tenantId: pnlTenant,
        taxYear: 2026,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        prismaClient: prisma
      });

      // Operating Revenue must strictly be Net Revenue 100,000, NEVER 108,000
      expect(pnlGl.operatingRevenue).toBe(100000);
      expect(pnlGl.totalRevenue).toBe(100000);
      expect(pnlGl.lineItems.REVENUE.amount).toBe(100000);

      // Also verify convertRevenueToTransactionRecord enforces net amount
      const txRecord = convertRevenueToTransactionRecord(revenueTx);
      expect(txRecord.amount).toBe(100000);
      expect(txRecord.gstAmount).toBe(8000);

      const pnlFromRecord = generateSchedule1PnL([txRecord]);
      expect(pnlFromRecord.operatingRevenue).toBe(100000);
    });
  });

  describe('4.2 Four-Way Revenue Reconciliation Engine', () => {
    test('1. Perfect Four-Way Reconciliation yields PASS across all 4 checks', async () => {
      const reconTenant = `TENANT-M4-RECON-${Date.now()}`;
      const mockUser: UserSession = {
        userId: 'USR-M4-RECON',
        tenantId: reconTenant,
        role: 'CLIENT_ADMIN'
      };

      const revenueTx = await RevenuePostingService.postRevenue({
        tenantId: reconTenant,
        outletId: 'OUTLET-MALE',
        transactionDate: '2026-03-22',
        grossAmount: 54000, // 50,000 net + 4,000 GST
        amountBasis: 'GST_INCLUSIVE',
        sector: 'GENERAL',
        gstClassification: 'TAXABLE',
        paymentMethod: 'Cash',
        category: 'FNB_REVENUE',
        description: 'Restaurant dining sales'
      }, mockUser);

      expect(revenueTx.status).toBe('POSTED');

      const report = await RevenueReconciliationService.reconcileRevenue({
        tenantId: reconTenant,
        startDate: '2026-03-01',
        endDate: '2026-03-31',
        prismaClient: prisma,
        revenueTransactions: [revenueTx]
      });

      expect(report.overallStatus).toBe('PASS');

      // Check 1: Revenue Subledger <-> GL 4000
      expect(report.checks.revenueToGL.status).toBe('PASS');
      expect(report.checks.revenueToGL.sourceAmount).toBe(50000);
      expect(report.checks.revenueToGL.targetAmount).toBe(50000);
      expect(report.checks.revenueToGL.variance).toBe(0);
      expect(report.checks.revenueToGL.discrepancyTransactionIds).toEqual([]);

      // Check 2: Revenue GST <-> GL 2200 Output Tax
      expect(report.checks.gstToGL.status).toBe('PASS');
      expect(report.checks.gstToGL.sourceAmount).toBe(4000);
      expect(report.checks.gstToGL.targetAmount).toBe(4000);
      expect(report.checks.gstToGL.variance).toBe(0);

      // Check 3: Revenue GST <-> MIRA 205/206 Output Tax
      expect(report.checks.gstToGstTransactions.status).toBe('PASS');
      expect(report.checks.gstToGstTransactions.sourceAmount).toBe(4000);
      expect(report.checks.gstToGstTransactions.targetAmount).toBe(4000);
      expect(report.checks.gstToGstTransactions.variance).toBe(0);

      // Check 4: Revenue Subledger <-> P&L
      expect(report.checks.revenueToPnL.status).toBe('PASS');
      expect(report.checks.revenueToPnL.sourceAmount).toBe(50000);
      expect(report.checks.revenueToPnL.targetAmount).toBe(50000);
      expect(report.checks.revenueToPnL.variance).toBe(0);
    });

    test('2. Discrepancy detection: Missing journal linkage flags FAIL and pinpoints transaction ID', async () => {
      const orphanTenant = `TENANT-M4-ORPHAN-${Date.now()}`;
      // Simulate an unposted/tampered subledger record without GL journal linkage
      const orphanedTx: RevenueTransaction = {
        id: 'REV-ORPHAN-001',
        tenantId: orphanTenant,
        outletId: 'OUTLET-ORPHAN',
        transactionDate: '2026-03-25',
        category: 'SERVICE_CHARGE',
        description: 'Orphaned Transaction',
        grossAmount: new Prisma.Decimal(10800),
        netAmount: new Prisma.Decimal(10000),
        gstAmount: new Prisma.Decimal(800),
        gstClassification: 'TAXABLE',
        gstRate: 0.08,
        gstRatePercentage: 8,
        sector: 'GENERAL',
        gstRuleId: 'RULE-GST-GEN-8',
        currency: 'MVR',
        fxRate: new Prisma.Decimal(1),
        mvrAmount: new Prisma.Decimal(10800),
        sourceType: 'MANUAL',
        createdBy: 'SYSTEM',
        paymentMethod: 'CASH',
        amountBasis: 'GST_INCLUSIVE',
        status: 'POSTED', // marked as posted but has no journalId or gstTransactionId
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const report = await RevenueReconciliationService.reconcileRevenue({
        tenantId: orphanTenant,
        prismaClient: prisma,
        revenueTransactions: [orphanedTx]
      });

      expect(report.overallStatus).toBe('FAIL');
      expect(report.checks.revenueToGL.status).toBe('FAIL');
      expect(report.checks.revenueToGL.variance).toBe(10000);
      expect(report.checks.revenueToGL.discrepancyTransactionIds).toContain('REV-ORPHAN-001');

      expect(report.checks.gstToGL.status).toBe('FAIL');
      expect(report.checks.gstToGL.variance).toBe(800);
      expect(report.checks.gstToGL.discrepancyTransactionIds).toContain('REV-ORPHAN-001');

      expect(report.checks.gstToGstTransactions.status).toBe('FAIL');
      expect(report.checks.gstToGstTransactions.discrepancyTransactionIds).toContain('REV-ORPHAN-001');
    });
  });

  describe('4.3 Transaction Diagnostic Trace Service', () => {
    test('1. Authoritative diagnostic trace produces complete 6-section audit hierarchy', async () => {
      const traceTenant = `TENANT-M4-TRACE-${Date.now()}`;
      const mockUser: UserSession = {
        userId: 'USR-M4-TRACE',
        tenantId: traceTenant,
        role: 'CLIENT_ADMIN'
      };

      const revenueTx = await RevenuePostingService.postRevenue({
        tenantId: traceTenant,
        outletId: 'OUTLET-DIVE',
        transactionDate: '2026-03-24',
        grossAmount: 21600, // 20,000 net + 1,600 GST
        amountBasis: 'GST_INCLUSIVE',
        sector: 'GENERAL',
        gstClassification: 'TAXABLE',
        paymentMethod: 'Card / POS',
        category: 'EXCURSIONS',
        description: 'Scuba diving excursion'
      }, mockUser);

      expect(revenueTx.status).toBe('POSTED');

      // Retrieve diagnostic trace
      const trace = await RevenueTraceService.getDiagnosticTrace(revenueTx.id, traceTenant, prisma);
      expect(trace).not.toBeNull();
      if (!trace) return;

      // Section 1: Source transaction
      expect(trace.id).toBe(revenueTx.id);
      expect(trace.status).toBe('POSTED');
      expect(trace.grossAmount).toBe(21600);
      expect(trace.netAmount).toBe(20000);
      expect(trace.gstAmount).toBe(1600);
      expect(trace.outletId).toBe('OUTLET-DIVE');

      // Section 2: Accounting Posting (General Ledger)
      expect(trace.journal).toBeDefined();
      expect(trace.journal?.isBalanced).toBe(true);
      expect(trace.journal?.lines.length).toBeGreaterThanOrEqual(3);

      const debitCard = trace.journal?.lines.find(l => l.accountCode.startsWith('1010') || l.accountCode.startsWith('1020'));
      expect(debitCard?.debit).toBe(21600);

      const creditRev = trace.journal?.lines.find(l => l.accountCode.startsWith('4000'));
      expect(creditRev?.credit).toBe(20000);

      const creditGst = trace.journal?.lines.find(l => l.accountCode.startsWith('2200'));
      expect(creditGst?.credit).toBe(1600);

      // Section 3: GST Calculation
      expect(trace.classification.rate).toBe(0.08);
      expect(trace.classification.gstClassification).toBe('TAXABLE');
      expect(trace.classification.ruleId).toBe('RULE-GST-GEN-8');

      // Section 4: Tax return mapping (MIRA 205 for General Sector)
      expect(trace.miraMapping).toBeDefined();
      expect(trace.miraMapping?.returnType).toBe('MIRA 205');
      expect(trace.miraMapping?.boxNumber).toBe('Box 1');
      expect(trace.miraMapping?.taxableAmount).toBe(20000);
      expect(trace.miraMapping?.taxAmount).toBe(1600);

      // Section 5: Reconciliation Result
      expect(trace.reconciliationState.overallStatus).toBe('PASS');
      expect(trace.reconciliationState.revenueToGL).toBe('PASS');
      expect(trace.reconciliationState.revenueToGST).toBe('PASS');
      expect(trace.reconciliationState.revenueToPnL).toBe('PASS');
      expect(trace.reconciliationState.discrepancies).toEqual([]);

      // Section 6: Audit Information
      expect(trace.auditTrail).toBeDefined();
      expect(trace.auditTrail.length).toBeGreaterThanOrEqual(1);
      expect(trace.auditTrail[0].actor).toBe(mockUser.userId);
      expect(trace.auditTrail[0].checksum).toBeDefined();
    });
  });
});
