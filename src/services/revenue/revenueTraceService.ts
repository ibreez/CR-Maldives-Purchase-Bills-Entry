import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../db/client';
import Decimal from 'decimal.js';
import { RevenueDiagnosticTrace } from '../../types/revenue';
import { RevenuePersistenceService } from './revenuePersistenceService';
import { getAuditHistoryForEntity } from '../audit/auditService';
import { REVENUE_STANDARD_ACCOUNTS } from './revenueAccountMapper';

export class RevenueTraceService {
  /**
   * Builds the comprehensive diagnostic trace for a given revenue transaction.
   * Follows: Revenue -> GST Transaction -> Journal -> Journal Lines -> Ledger Postings -> P&L -> MIRA Return -> Audit information.
   */
  static async getDiagnosticTrace(
    revenueId: string,
    tenantId = 'COMPANY-001',
    prismaClient: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ): Promise<RevenueDiagnosticTrace | null> {
    const tx = RevenuePersistenceService.getById(revenueId, tenantId);
    if (!tx) {
      return null;
    }

    const discrepancies: string[] = [];
    const grossNum = Number(new Decimal(tx.grossAmount.toString()).toFixed(2));
    const netNum = Number(new Decimal(tx.netAmount.toString()).toFixed(2));
    const gstNum = Number(new Decimal(tx.gstAmount.toString()).toFixed(2));

    // 1. Linked GST Transaction & MIRA Return Mapping
    let gstTxData: any = undefined;
    let miraMapping: any = undefined;
    let isGstMatched = false;
    let isMiraMatched = false;

    // Determine expected MIRA reporting box
    const isTourism = tx.sector === 'TOURISM';
    let expectedReturnType: 'MIRA 205' | 'MIRA 206' = isTourism ? 'MIRA 206' : 'MIRA 205';
    let expectedBoxNumber = 'Box 1';
    let expectedBoxDesc = 'Standard-Rated Supplies (8% GST)';

    if (isTourism) {
      if (tx.transactionDate < '2025-07-01') {
        expectedBoxNumber = 'Box 1A';
        expectedBoxDesc = 'Tourism Goods & Services (16% TGST)';
      } else {
        expectedBoxNumber = 'Box 1B';
        expectedBoxDesc = 'Tourism Goods & Services (17% TGST)';
      }
    } else {
      if (tx.gstClassification === 'ZERO_RATED') {
        expectedBoxNumber = 'Box 2';
        expectedBoxDesc = 'Zero-Rated Supplies';
      } else if (tx.gstClassification === 'EXEMPT' || tx.gstClassification === 'OUT_OF_SCOPE') {
        expectedBoxNumber = 'Box 3';
        expectedBoxDesc = 'Exempt Supplies';
      }
    }

    if (tx.gstTransactionId) {
      const gstRecord = await prismaClient.gSTTransaction.findUnique({
        where: { id: tx.gstTransactionId }
      });
      if (gstRecord) {
        const gstRecTax = Number(new Decimal(gstRecord.gstAmount.toString()).toFixed(2));
        const gstRecTaxable = Number(new Decimal(gstRecord.taxableAmount.toString()).toFixed(2));

        gstTxData = {
          id: gstRecord.id,
          sector: gstRecord.sector,
          boxNumber: expectedBoxNumber,
          taxableAmount: gstRecTaxable,
          taxAmount: gstRecTax,
          ruleId: (gstRecord as any).gstRuleId || tx.gstRuleId,
          rate: (gstRecord as any).gstRate !== undefined ? Number((gstRecord as any).gstRate) : tx.gstRate
        };

        miraMapping = {
          returnType: expectedReturnType,
          boxNumber: expectedBoxNumber,
          boxDescription: expectedBoxDesc,
          taxableAmount: gstRecTaxable,
          taxAmount: gstRecTax
        };

        // Check if GST amounts match
        const gstDiff = Math.abs(gstRecTax - gstNum);
        if (gstDiff <= 0.05) {
          isGstMatched = true;
          isMiraMatched = true;
        } else {
          discrepancies.push(`GST transaction amount (MVR ${gstRecTax}) differs from revenue GST amount (MVR ${gstNum})`);
        }
      } else {
        discrepancies.push(`Linked GST transaction ID "${tx.gstTransactionId}" not found in database`);
      }
    } else if (gstNum > 0 && tx.status === 'POSTED') {
      discrepancies.push('Posted revenue transaction has positive GST amount but no linked GST transaction');
    } else {
      // For exempt or zero-rated, lack of GST transaction is normal or 0 tax
      isGstMatched = true;
      isMiraMatched = true;
      miraMapping = {
        returnType: expectedReturnType,
        boxNumber: expectedBoxNumber,
        boxDescription: expectedBoxDesc,
        taxableAmount: netNum,
        taxAmount: 0
      };
    }

    // 2. Linked Journal & Lines
    let journalData: any = undefined;
    let glPostings: any[] = [];
    let isJournalBalanced = false;
    let isRevenueMatched = false;

    if (tx.journalId) {
      const journal = await prismaClient.journal.findUnique({
        where: { id: tx.journalId },
        include: { lines: true }
      });

      if (journal) {
        journalData = {
          id: journal.id,
          reference: journal.reference,
          entryDate: journal.entryDate.toISOString().split('T')[0],
          isBalanced: journal.isBalanced,
          totalDebit: Number(new Decimal(journal.totalDebit.toString()).toFixed(2)),
          totalCredit: Number(new Decimal(journal.totalCredit.toString()).toFixed(2)),
          lines: journal.lines.map((l) => ({
            id: l.id,
            accountCode: l.accountCode,
            accountName: l.accountName,
            debit: Number(new Decimal(l.debit.toString()).toFixed(2)),
            credit: Number(new Decimal(l.credit.toString()).toFixed(2)),
            description: l.description || undefined
          }))
        };

        glPostings = journal.lines.map((l) => ({
          id: l.id,
          accountCode: l.accountCode,
          accountName: l.accountName,
          debit: Number(new Decimal(l.debit.toString()).toFixed(2)),
          credit: Number(new Decimal(l.credit.toString()).toFixed(2)),
          entryDate: journal.entryDate.toISOString().split('T')[0],
          description: l.description || undefined
        }));

        isJournalBalanced = journal.isBalanced && journal.totalDebit.equals(journal.totalCredit);
        if (!isJournalBalanced) {
          discrepancies.push('Journal is unbalanced (debits do not equal credits)');
        }

        // Check Operating Revenue credit (4000)
        let credit4000 = new Decimal(0);
        let debit4000 = new Decimal(0);
        for (const l of journal.lines) {
          if (l.accountCode === REVENUE_STANDARD_ACCOUNTS.OPERATING_REVENUE.code) {
            credit4000 = credit4000.plus(new Decimal(l.credit.toString()));
            debit4000 = debit4000.plus(new Decimal(l.debit.toString()));
          }
        }
        const netCredit4000 = credit4000.minus(debit4000);
        const revDiff = netCredit4000.minus(new Decimal(netNum)).abs();
        if (revDiff.lte(0.05)) {
          isRevenueMatched = true;
        } else {
          discrepancies.push(`GL Operating Revenue credit (MVR ${netCredit4000.toFixed(2)}) does not match subledger net revenue (MVR ${netNum.toFixed(2)})`);
        }
      } else {
        discrepancies.push(`Linked journal ID "${tx.journalId}" not found in database`);
      }
    } else if (tx.status === 'POSTED') {
      discrepancies.push('Posted revenue transaction has no linked journal ID');
    } else {
      // Drafts may not have journals yet
      isRevenueMatched = true;
      isJournalBalanced = true;
    }

    // 3. Audit Trail
    let auditTrail: Array<{ eventId?: string; eventType: string; timestamp: string; actor: string; checksum?: string }> = [];
    try {
      const events = getAuditHistoryForEntity(tx.id);
      auditTrail = events.map((e) => ({
        eventId: e.id,
        eventType: e.eventType,
        timestamp: e.timestamp,
        actor: e.actorId,
        checksum: e.eventHash ? e.eventHash.slice(0, 16) : undefined
      }));
    } catch {
      // Non-fatal if in memory store is isolated
    }

    // 4. Evaluate Reconciliation States
    const revenueToGL: 'PASS' | 'WARNING' | 'FAIL' =
      tx.status !== 'POSTED' ? 'PASS' : (isJournalBalanced && isRevenueMatched ? 'PASS' : 'FAIL');

    const revenueToGST: 'PASS' | 'WARNING' | 'FAIL' =
      tx.status !== 'POSTED' ? 'PASS' : (isGstMatched ? 'PASS' : 'FAIL');

    const revenueToPnL: 'PASS' | 'WARNING' | 'FAIL' =
      tx.status !== 'POSTED' ? 'PASS' : (isRevenueMatched ? 'PASS' : 'FAIL');

    const revenueToMira: 'PASS' | 'WARNING' | 'FAIL' =
      tx.status !== 'POSTED' ? 'PASS' : (isMiraMatched ? 'PASS' : 'FAIL');

    const statuses: ('PASS' | 'WARNING' | 'FAIL')[] = [revenueToGL, revenueToGST, revenueToPnL, revenueToMira];
    let overallStatus: 'PASS' | 'WARNING' | 'FAIL' = 'PASS';
    if (statuses.includes('FAIL')) {
      overallStatus = 'FAIL';
    } else if (statuses.includes('WARNING')) {
      overallStatus = 'WARNING';
    }

    return {
      id: tx.id,
      revenueId: tx.id,
      status: tx.status,
      transactionDate: tx.transactionDate,
      grossAmount: grossNum,
      netAmount: netNum,
      gstAmount: gstNum,
      outletId: tx.outletId,
      category: tx.category,
      paymentMethod: tx.paymentMethod,
      amountBasis: tx.amountBasis,
      classification: {
        gstClassification: tx.gstClassification,
        rate: tx.gstRate,
        ruleId: tx.gstRuleId,
        version: tx.gstRegulatoryVersion
      },
      gstTransaction: gstTxData,
      journal: journalData,
      generalLedgerPostings: glPostings,
      pnlImpact: {
        accountCode: REVENUE_STANDARD_ACCOUNTS.OPERATING_REVENUE.code,
        lineItem: 'Operating Revenue (REVENUE)',
        netRevenueCredited: tx.status === 'REVERSED' ? 0 : netNum,
        period: tx.transactionDate.slice(0, 7),
        schedule1Box: 'REVENUE'
      },
      miraMapping,
      auditTrail,
      reconciliationState: {
        revenueToGL,
        revenueToGST,
        revenueToPnL,
        revenueToMira,
        overallStatus,
        discrepancies: discrepancies
      }
    };
  }

  /**
   * Alias for getDiagnosticTrace to build complete diagnostic audit trace.
   */
  static async buildTrace(revenueId: string, tenantId = 'COMPANY-001') {
    const trace = await this.getDiagnosticTrace(revenueId, tenantId);
    if (!trace) {
      throw new Error(`Diagnostic Trace Error: Revenue record "${revenueId}" not found`);
    }
    return trace;
  }
}

