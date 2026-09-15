import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../db/client';
import Decimal from 'decimal.js';
import { RevenuePersistenceService } from '../revenue/revenuePersistenceService';
import { RevenueTransaction } from '../../types/revenue';
import { REVENUE_STANDARD_ACCOUNTS } from '../revenue/revenueAccountMapper';
import { logAuditEvent } from '../audit/auditService';

export interface ReconciliationCheckResult {
  checkName: string;
  sourceAmount: number;
  targetAmount: number;
  variance: number;
  status: 'PASS' | 'WARNING' | 'FAIL';
  details: string;
  discrepancyTransactionIds: string[];
}

export interface RevenueFourWayReconciliationReport {
  tenantId: string;
  periodStart?: string;
  periodEnd?: string;
  outletId?: string;
  generatedAt: string;
  overallStatus: 'PASS' | 'WARNING' | 'FAIL';
  checks: {
    revenueToGL: ReconciliationCheckResult;
    gstToGL: ReconciliationCheckResult;
    gstToGstTransactions: ReconciliationCheckResult;
    revenueToPnL: ReconciliationCheckResult;
    // Aliases for Milestone 4 specifications
    subledgerVsGlRevenue?: ReconciliationCheckResult;
    subledgerVsGlGst?: ReconciliationCheckResult;
    subledgerVsGstTransactions?: ReconciliationCheckResult;
    subledgerVsMira?: ReconciliationCheckResult;
    subledgerVsPnl?: ReconciliationCheckResult;
  };
  summary: {
    totalRevenueTransactions: number;
    postedRevenueTransactions: number;
    totalSubledgerNet: number;
    totalSubledgerGross: number;
    totalSubledgerGst: number;
  };
  auditEventId?: string;
}

export interface ReconcileRevenueParams {
  tenantId?: string;
  startDate?: string;
  endDate?: string;
  outletId?: string;
  prismaClient?: PrismaClient | Prisma.TransactionClient;
  revenueTransactions?: RevenueTransaction[];
}

export class RevenueReconciliationService {
  /**
   * Executes the authoritative 4-way revenue reconciliation.
   * 1. Revenue Subledger <-> GL 4000 Operating Revenue Account
   * 2. Revenue GST <-> GL 2200 GST Output Tax Account
   * 3. Revenue GST <-> MIRA 205/206 Output Tax / Canonical GSTTransaction Ledger
   * 4. Revenue Subledger <-> P&L Operating Revenue (derived from GL)
   */
  static async reconcileRevenue(params: ReconcileRevenueParams = {}): Promise<RevenueFourWayReconciliationReport> {
    const {
      tenantId = 'COMPANY-001',
      startDate,
      endDate,
      outletId,
      prismaClient = defaultPrisma,
      revenueTransactions
    } = params;

    // 1. Fetch subledger transactions (support injected transactions for test isolation)
    const allRevenue = revenueTransactions || RevenuePersistenceService.getAll(tenantId);
    const filtered = allRevenue.filter((r) => {
      if (startDate && r.transactionDate < startDate) return false;
      if (endDate && r.transactionDate > endDate) return false;
      if (outletId && outletId !== 'ALL' && r.outletId !== outletId) return false;
      return true;
    });

    const postedOnly = filtered.filter((r) => r.status === 'POSTED');

    let subledgerNet = new Decimal(0);
    let subledgerGross = new Decimal(0);
    let subledgerGst = new Decimal(0);

    for (const r of postedOnly) {
      subledgerNet = subledgerNet.plus(new Decimal(r.netAmount.toString()));
      subledgerGross = subledgerGross.plus(new Decimal(r.grossAmount.toString()));
      subledgerGst = subledgerGst.plus(new Decimal(r.gstAmount.toString()));
    }

    // 2. Query General Ledger lines
    const dateFilter: Prisma.JournalWhereInput = {
      tenantId,
      status: 'POSTED'
    };

    if (startDate || endDate) {
      dateFilter.entryDate = {};
      if (startDate) (dateFilter.entryDate as any).gte = new Date(startDate);
      if (endDate) (dateFilter.entryDate as any).lte = new Date(endDate);
    }

    const journalLines = await prismaClient.journalLine.findMany({
      where: {
        journal: dateFilter
      },
      include: {
        journal: true
      }
    });

    const linkedJournalIds = new Set(postedOnly.map((r) => r.journalId).filter(Boolean) as string[]);
    const linkedGstIds = new Set(postedOnly.map((r) => r.gstTransactionId).filter(Boolean) as string[]);

    // Group journal lines by journalId for per-transaction discrepancy pinpointing
    const journalLinesByJournalId = new Map<string, typeof journalLines>();
    for (const line of journalLines) {
      const existing = journalLinesByJournalId.get(line.journalId) || [];
      existing.push(line);
      journalLinesByJournalId.set(line.journalId, existing);
    }

    // Filter relevant lines
    const relevantJournalLines = linkedJournalIds.size > 0
      ? journalLines.filter((l) => linkedJournalIds.has(l.journalId))
      : journalLines;

    // Sum credits minus debits on 4000-OPERATING-REVENUE
    let glRevenueCredits = new Decimal(0);
    let glRevenueDebits = new Decimal(0);

    // Sum credits minus debits on 2200-GST-OUTPUT-TAX
    let glTaxCredits = new Decimal(0);
    let glTaxDebits = new Decimal(0);

    for (const line of relevantJournalLines) {
      if (line.accountCode === REVENUE_STANDARD_ACCOUNTS.OPERATING_REVENUE.code) {
        glRevenueCredits = glRevenueCredits.plus(new Decimal(line.credit.toString()));
        glRevenueDebits = glRevenueDebits.plus(new Decimal(line.debit.toString()));
      } else if (line.accountCode === REVENUE_STANDARD_ACCOUNTS.GST_OUTPUT_TAX.code) {
        glTaxCredits = glTaxCredits.plus(new Decimal(line.credit.toString()));
        glTaxDebits = glTaxDebits.plus(new Decimal(line.debit.toString()));
      }
    }

    const glNetRevenue = glRevenueCredits.minus(glRevenueDebits);
    const glNetOutputTax = glTaxCredits.minus(glTaxDebits);

    // 3. Query GSTTransaction records
    const gstTxFilter: Prisma.GSTTransactionWhereInput = {
      tenantId,
      isInputTaxClaimable: false // Output tax transactions
    };
    if (startDate || endDate) {
      gstTxFilter.transactionDate = {};
      if (startDate) (gstTxFilter.transactionDate as any).gte = new Date(startDate);
      if (endDate) (gstTxFilter.transactionDate as any).lte = new Date(endDate);
    }

    const gstTransactions = await prismaClient.gSTTransaction.findMany({
      where: gstTxFilter
    });

    const gstTxById = new Map<string, typeof gstTransactions[0]>();
    for (const g of gstTransactions) {
      gstTxById.set(g.id, g);
    }

    const relevantGstTransactions = linkedGstIds.size > 0
      ? gstTransactions.filter((g) => linkedGstIds.has(g.id))
      : (postedOnly.length === 0 ? [] : gstTransactions);

    let totalGstTxTax = new Decimal(0);
    for (const g of relevantGstTransactions) {
      totalGstTxTax = totalGstTxTax.plus(new Decimal(g.gstAmount.toString()));
    }

    // 4. Per-transaction discrepancy identification
    const revToGlDiscrepancies: string[] = [];
    const gstToGlDiscrepancies: string[] = [];
    const gstToMiraDiscrepancies: string[] = [];

    for (const r of postedOnly) {
      const rNet = new Decimal(r.netAmount.toString());
      const rGst = new Decimal(r.gstAmount.toString());

      // Check Journal existence and 4000 line
      if (!r.journalId) {
        revToGlDiscrepancies.push(r.id);
      } else {
        const lines = journalLinesByJournalId.get(r.journalId);
        if (!lines || lines.length === 0) {
          revToGlDiscrepancies.push(r.id);
        } else {
          let lineNetRev = new Decimal(0);
          for (const l of lines) {
            if (l.accountCode === REVENUE_STANDARD_ACCOUNTS.OPERATING_REVENUE.code) {
              lineNetRev = lineNetRev.plus(new Decimal(l.credit.toString())).minus(new Decimal(l.debit.toString()));
            }
          }
          if (lineNetRev.minus(rNet).abs().gt(0.001)) {
            revToGlDiscrepancies.push(r.id);
          }
        }
      }

      // Check GST line on 2200
      if (!rGst.isZero()) {
        if (!r.journalId) {
          gstToGlDiscrepancies.push(r.id);
        } else {
          const lines = journalLinesByJournalId.get(r.journalId);
          if (!lines || lines.length === 0) {
            gstToGlDiscrepancies.push(r.id);
          } else {
            let lineNetGst = new Decimal(0);
            for (const l of lines) {
              if (l.accountCode === REVENUE_STANDARD_ACCOUNTS.GST_OUTPUT_TAX.code) {
                lineNetGst = lineNetGst.plus(new Decimal(l.credit.toString())).minus(new Decimal(l.debit.toString()));
              }
            }
            if (lineNetGst.minus(rGst).abs().gt(0.001)) {
              gstToGlDiscrepancies.push(r.id);
            }
          }
        }

        // Check GST transaction record
        if (!r.gstTransactionId) {
          gstToMiraDiscrepancies.push(r.id);
        } else {
          const gstRecord = gstTxById.get(r.gstTransactionId);
          if (!gstRecord) {
            gstToMiraDiscrepancies.push(r.id);
          } else {
            const recGst = new Decimal(gstRecord.gstAmount.toString());
            if (recGst.minus(rGst).abs().gt(0.001)) {
              gstToMiraDiscrepancies.push(r.id);
            }
          }
        }
      }
    }

    // Check 4 P&L discrepancy is directly tied to GL Operating Revenue
    const revToPnlDiscrepancies = [...revToGlDiscrepancies];

    // Helper for check status
    const evaluateCheck = (
      name: string,
      source: Decimal,
      target: Decimal,
      details: string,
      discrepancyIds: string[]
    ): ReconciliationCheckResult => {
      const varianceDec = source.minus(target).abs();
      const variance = Number(varianceDec.toFixed(2));
      let status: 'PASS' | 'WARNING' | 'FAIL' = 'PASS';

      if (variance > 0.05) {
        status = 'FAIL';
      } else if (variance > 0) {
        status = 'WARNING';
      }

      // If variance exists but no individual transaction discrepancies were flagged,
      // pinpoint all posted transactions as affected
      const finalDiscrepancyIds = (status !== 'PASS' && discrepancyIds.length === 0 && postedOnly.length > 0)
        ? postedOnly.map((r) => r.id)
        : Array.from(new Set(discrepancyIds));

      return {
        checkName: name,
        sourceAmount: Number(source.toFixed(2)),
        targetAmount: Number(target.toFixed(2)),
        variance,
        status,
        details,
        discrepancyTransactionIds: finalDiscrepancyIds
      };
    };

    // Check 1: Revenue Subledger <-> GL Revenue Account (4000)
    const revenueToGL = evaluateCheck(
      'Revenue Subledger <-> GL 4000 Revenue Account',
      subledgerNet,
      glNetRevenue,
      'Compares net sales on posted revenue against net credits on 4000-OPERATING-REVENUE.',
      revToGlDiscrepancies
    );

    // Check 2: Revenue GST <-> GST Output Account (2200)
    const gstToGL = evaluateCheck(
      'Revenue GST <-> GL 2200 Output Tax Account',
      subledgerGst,
      glNetOutputTax,
      'Compares GST collected in revenue subledger against net credits on 2200-GST-OUTPUT-TAX.',
      gstToGlDiscrepancies
    );

    // Check 3: Revenue GST <-> MIRA 205/206 Output Tax (GSTTransaction Records)
    const gstToGstTransactions = evaluateCheck(
      'Revenue GST <-> MIRA 205/206 Output Tax',
      subledgerGst,
      totalGstTxTax,
      'Compares GST collected against registered GST output transactions feeding MIRA 205/206.',
      gstToMiraDiscrepancies
    );

    // Check 4: Revenue Subledger <-> P&L Operating Revenue
    // (P&L reflects General Ledger net revenue)
    const revenueToPnL = evaluateCheck(
      'Revenue Subledger <-> P&L Operating Revenue',
      subledgerNet,
      glNetRevenue,
      'Validates that Profit & Loss Statement reflects net sales rather than gross amounts.',
      revToPnlDiscrepancies
    );

    const checkStatuses = [
      revenueToGL.status,
      gstToGL.status,
      gstToGstTransactions.status,
      revenueToPnL.status
    ];

    let overallStatus: 'PASS' | 'WARNING' | 'FAIL' = 'PASS';
    if (checkStatuses.includes('FAIL')) {
      overallStatus = 'FAIL';
    } else if (checkStatuses.includes('WARNING')) {
      overallStatus = 'WARNING';
    }

    // Record audit event
    let auditEventId: string | undefined = undefined;
    try {
      const auditEvt = logAuditEvent({
        entityType: 'REVENUE' as any,
        entityId: `RECON-${tenantId}-${Date.now()}`,
        action: 'VERIFY' as any,
        actorId: 'SYSTEM',
        tenantId,
        metadata: {
          overallStatus,
          periodStart: startDate,
          periodEnd: endDate,
          outletId,
          subledgerNet: Number(subledgerNet.toFixed(2)),
          subledgerGross: Number(subledgerGross.toFixed(2)),
          subledgerGst: Number(subledgerGst.toFixed(2)),
          glNetRevenue: Number(glNetRevenue.toFixed(2)),
          glNetOutputTax: Number(glNetOutputTax.toFixed(2)),
          miraOutputTax: Number(totalGstTxTax.toFixed(2)),
          checks: {
            revenueToGL: revenueToGL.status,
            gstToGL: gstToGL.status,
            gstToMira: gstToGstTransactions.status,
            revenueToPnL: revenueToPnL.status
          }
        }
      });
      auditEventId = auditEvt.id;
    } catch {
      // Non-fatal if in isolated testing
    }

    const checksObj = {
      revenueToGL,
      gstToGL,
      gstToGstTransactions,
      revenueToPnL,
      subledgerVsGlRevenue: revenueToGL,
      subledgerVsGlGst: gstToGL,
      subledgerVsGstTransactions: gstToGstTransactions,
      subledgerVsMira: gstToGstTransactions,
      subledgerVsPnl: revenueToPnL
    };

    return {
      tenantId,
      periodStart: startDate,
      periodEnd: endDate,
      outletId,
      generatedAt: new Date().toISOString(),
      overallStatus,
      checks: checksObj,
      summary: {
        totalRevenueTransactions: filtered.length,
        postedRevenueTransactions: postedOnly.length,
        totalSubledgerNet: Number(subledgerNet.toFixed(2)),
        totalSubledgerGross: Number(subledgerGross.toFixed(2)),
        totalSubledgerGst: Number(subledgerGst.toFixed(2))
      },
      auditEventId
    };
  }

  /**
   * Convenience alias providing 4-way reconciliation format directly for testing and auditing.
   */
  static async run4WayReconciliation(tenantId = 'COMPANY-001') {
    const report = await this.reconcileRevenue({ tenantId });
    return {
      ...report,
      subledgerGrossTotal: report.summary.totalSubledgerGross,
      subledgerNetTotal: report.summary.totalSubledgerNet,
      subledgerGstTotal: report.summary.totalSubledgerGst,
      checks: {
        ...report.checks,
        subledgerVsGlRevenue: report.checks.revenueToGL,
        subledgerVsGlGst: report.checks.gstToGL,
        subledgerVsGstTransactions: report.checks.gstToGstTransactions,
        subledgerVsMira: report.checks.gstToGstTransactions,
        subledgerVsPnl: report.checks.revenueToPnL
      }
    };
  }
}
