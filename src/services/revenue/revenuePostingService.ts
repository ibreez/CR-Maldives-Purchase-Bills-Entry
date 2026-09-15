import crypto from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../db/client';
import {
  CreateRevenueInput,
  RevenueTransaction,
  RevenueStatus,
  UpdateRevenueInput
} from '../../types/revenue';
import { UserSession } from '../../types/rbac';
import { RevenueValidationService } from './revenueValidationService';
import { RevenueGstService } from './revenueGstService';
import { RevenueAccountMapper } from './revenueAccountMapper';
import { RevenuePersistenceService } from './revenuePersistenceService';
import { JournalPostingService } from '../accounting/journalPostingService';
import { LedgerService } from '../accounting/ledgerService';
import { recordAuditEvent } from '../audit/auditService';
import { AccountingPeriodService } from '../accounting/accountingPeriodService';
import { PeriodControlService } from '../accounting/periodControlService';

export class RevenuePostingService {
  /**
   * Posts an authoritative revenue transaction with double-entry journal,
   * general ledger entries, GST transaction record, and tamper-evident audit trail.
   */
  static async postRevenue(
    input: CreateRevenueInput,
    session?: UserSession,
    prismaClient: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ): Promise<RevenueTransaction> {
    const tenantId = input.tenantId || session?.tenantId || 'COMPANY-001';
    if (!input.transactionDate && (input as any).date) {
      input.transactionDate = (input as any).date;
    }

    // 1. Check idempotency
    if (input.idempotencyKey) {
      const existing = RevenuePersistenceService.findByIdempotencyKey(input.idempotencyKey, tenantId);
      if (existing) {
        return existing;
      }
    }

    if (input.sourceId) {
      const existing = RevenuePersistenceService.findBySourceId(input.sourceId, tenantId);
      if (existing) {
        return existing;
      }
    }

    // 2. Validate input & period status
    const validation = await RevenueValidationService.validateRevenueEntry(input, prismaClient);
    if (!validation.isValid) {
      throw new Error(`Revenue Validation Error: ${validation.errors.join('; ')}`);
    }

    // 3. Compute statutory GST and net/gross amounts safely
    const sector = RevenueGstService.determineSector({
      sector: input.sector,
      category: input.category,
      outletName: input.outletName,
      description: input.description
    });

    const gstCalc = RevenueGstService.calculateGst({
      transactionDate: input.transactionDate,
      grossAmount: input.grossAmount,
      netAmount: input.netAmount,
      amountBasis: input.amountBasis || 'GST_INCLUSIVE',
      sector,
      gstClassification: input.gstClassification || 'TAXABLE'
    });

    // 4. Resolve double-entry accounts
    const paymentMethod = (input.paymentMethod as any) || 'CARD';
    const debitAccount = validation.resolvedDebitAccount || RevenueAccountMapper.resolvePaymentAccount(paymentMethod);
    const revenueAccount = validation.resolvedCreditAccount || RevenueAccountMapper.resolveRevenueAccount(input.category);
    const taxAccount = validation.resolvedTaxAccount || RevenueAccountMapper.resolveGstOutputAccount();

    const txDate = input.transactionDate || (input as any).date || new Date().toISOString().split('T')[0];
    const ym = txDate.slice(0, 7);
    const randSeq = Math.floor(100000 + Math.random() * 900000);
    const revenueId = `REV-${ym}-${randSeq}`;
    const autoPost = input.autoPost !== false;

    // Fallback: If an account cannot be resolved, flag as REVIEW_REQUIRED rather than inventing accounts.
    if (!debitAccount) {
      const reviewRecord: RevenueTransaction = {
        id: revenueId,
        tenantId,
        outletId: input.outletId,
        outletName: input.outletName || `Outlet ${input.outletId}`,
        transactionDate: txDate,
        category: input.category || 'General Sales',
        description: input.description || (input as any).notes || 'Revenue Entry',
        amountBasis: input.amountBasis || 'GST_INCLUSIVE',
        sector: gstCalc.sector,
        grossAmount: Number(gstCalc.grossAmount.toString()) as any,
        netAmount: Number(gstCalc.netAmount.toString()) as any,
        gstAmount: Number(gstCalc.gstAmount.toString()) as any,
        gstClassification: gstCalc.gstClassification,
        gstRate: gstCalc.gstRate,
        gstRatePercentage: gstCalc.gstRatePercentage,
        gstRuleId: gstCalc.gstRuleId,
        gstRegulatoryVersion: gstCalc.gstRegulatoryVersion,
        paymentMethod,
        customerReference: input.customerReference,
        currency: input.currency || 'MVR',
        fxRate: new Prisma.Decimal(input.fxRate ? String(input.fxRate) : '1.0'),
        mvrAmount: Number(gstCalc.grossAmount.toString()) as any,
        status: 'REVIEW_REQUIRED',
        sourceType: 'MANUAL_ENTRY',
        sourceId: input.sourceId,
        idempotencyKey: input.idempotencyKey,
        createdBy: session?.userId || 'SYSTEM',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await RevenuePersistenceService.save(reviewRecord, prismaClient);
      recordAuditEvent(
        {
          tenantId,
          actorId: session?.userId || 'SYSTEM',
          eventType: 'REVENUE_CREATED',
          entityType: 'REVENUE',
          entityId: reviewRecord.id,
          newState: { ...reviewRecord },
          metadata: {
            flag: 'REVIEW_REQUIRED',
            reason: `Payment method "${paymentMethod}" cannot be mapped to a standard GL account.`
          }
        },
        session
      );
      return reviewRecord;
    }

    // Build base RevenueTransaction
    const revenueRecord: RevenueTransaction = {
      id: revenueId,
      tenantId,
      outletId: input.outletId,
      outletName: input.outletName || `Outlet ${input.outletId}`,
      transactionDate: txDate,
      category: input.category || 'General Sales',
      description: input.description || (input as any).notes || 'Revenue Entry',
      amountBasis: input.amountBasis || 'GST_INCLUSIVE',
      sector: gstCalc.sector,
      grossAmount: Number(gstCalc.grossAmount.toString()) as any,
      netAmount: Number(gstCalc.netAmount.toString()) as any,
      gstAmount: Number(gstCalc.gstAmount.toString()) as any,
      gstClassification: gstCalc.gstClassification,
      gstRate: gstCalc.gstRate,
      gstRatePercentage: gstCalc.gstRatePercentage,
      gstRuleId: gstCalc.gstRuleId,
      gstRegulatoryVersion: gstCalc.gstRegulatoryVersion,
      paymentMethod,
      customerReference: input.customerReference,
      currency: input.currency || 'MVR',
      fxRate: new Prisma.Decimal(input.fxRate ? String(input.fxRate) : '1.0'),
      mvrAmount: Number(gstCalc.grossAmount.toString()) as any,
      status: autoPost ? 'POSTED' : 'DRAFT',
      sourceType: 'MANUAL_ENTRY',
      sourceId: input.sourceId,
      idempotencyKey: input.idempotencyKey,
      createdBy: session?.userId || 'SYSTEM',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (!autoPost) {
      // Persist as DRAFT without posting journal
      await RevenuePersistenceService.save(revenueRecord, prismaClient);
      recordAuditEvent(
        {
          tenantId,
          actorId: session?.userId || 'SYSTEM',
          eventType: 'REVENUE_CREATED',
          entityType: 'REVENUE',
          entityId: revenueRecord.id,
          newState: { ...revenueRecord }
        },
        session
      );
      return revenueRecord;
    }

    // Calculate balanced debits and credits with exact Prisma.Decimal:
    // Payment Account: grossAmount (Debit)
    // Operating Revenue: netAmount (Credit)
    // GST Output Tax: gstAmount (omitted if zero/exempt) (Credit)
    const journalLines = [
      {
        accountCode: debitAccount.code,
        accountName: debitAccount.name,
        debit: gstCalc.grossAmount,
        credit: new Prisma.Decimal(0),
        description: `Receipt: ${revenueRecord.description}`
      },
      {
        accountCode: revenueAccount.code,
        accountName: revenueAccount.name,
        debit: new Prisma.Decimal(0),
        credit: gstCalc.netAmount,
        description: `Revenue: ${revenueRecord.description}`
      }
    ];

    if (gstCalc.gstAmount.greaterThan(0)) {
      journalLines.push({
        accountCode: taxAccount.code,
        accountName: taxAccount.name,
        debit: new Prisma.Decimal(0),
        credit: gstCalc.gstAmount,
        description: `GST Output Tax (${gstCalc.gstRatePercentage}%): ${revenueRecord.description}`
      });
    }

    // Assert Sum(Debits) == Sum(Credits) before submission
    let sumDebits = new Prisma.Decimal(0);
    let sumCredits = new Prisma.Decimal(0);
    for (const line of journalLines) {
      sumDebits = sumDebits.plus(new Prisma.Decimal(line.debit.toString()));
      sumCredits = sumCredits.plus(new Prisma.Decimal(line.credit.toString()));
    }

    if (!sumDebits.equals(sumCredits)) {
      throw new Error(
        `Journal Balancing Error: Unbalanced revenue journal rejected. Sum(Debits)=${sumDebits.toString()} != Sum(Credits)=${sumCredits.toString()}`
      );
    }

    // 5. Execute posting in atomic database transaction
    const executePosting = async (tx: Prisma.TransactionClient) => {
      // Ensure tenant exists in DB
      await tx.tenant.upsert({
        where: { id: tenantId },
        update: {},
        create: {
          id: tenantId,
          name: `Tenant ${tenantId}`,
          tin: `TIN-${tenantId.replace(/[^A-Za-z0-9]/g, '').slice(-15)}`
        }
      });

      // 5.1 Post balanced journal via JournalPostingService.postJournal()
      const postedJournal = await JournalPostingService.postJournal(
        {
          tenantId,
          entryDate: input.transactionDate,
          reference: revenueRecord.id,
          description: `Revenue: ${revenueRecord.description}`,
          lines: journalLines,
          session
        },
        tx
      );

      // 5.2 Post to general ledger via LedgerService.postJournalLines()
      await LedgerService.postJournalLines(
        tenantId,
        postedJournal.id,
        journalLines,
        tx
      );

      // 5.3 Create GSTTransaction for regulatory reporting (MIRA 205/206)
      const gstTx = await RevenueGstService.createCanonicalGstTransaction({
        tenantId,
        transactionDate: input.transactionDate,
        sector: gstCalc.sector,
        taxableAmount: gstCalc.netAmount,
        gstRate: gstCalc.gstRate,
        gstAmount: gstCalc.gstAmount,
        prismaClient: tx
      });

      revenueRecord.journalId = postedJournal.id;
      revenueRecord.gstTransactionId = gstTx.id;
      revenueRecord.status = 'POSTED';
      revenueRecord.updatedAt = new Date().toISOString();

      // 5.4 Record immutable cryptographic audit event via auditService.ts (REVENUE_POSTED)
      const auditEvt = recordAuditEvent(
        {
          tenantId,
          actorId: session?.userId || 'SYSTEM',
          eventType: 'REVENUE_POSTED',
          entityType: 'REVENUE',
          entityId: revenueRecord.id,
          newState: { ...revenueRecord },
          metadata: {
            journalId: postedJournal.id,
            gstTransactionId: gstTx.id,
            ruleId: gstCalc.gstRuleId
          }
        },
        session
      );

      revenueRecord.auditEventId = auditEvt.id;

      // 5.5 Persist revenue record (only committed if entire transaction succeeds)
      await RevenuePersistenceService.save(revenueRecord, tx);

      return revenueRecord;
    };

    if ('$transaction' in prismaClient) {
      return await (prismaClient as PrismaClient).$transaction(
        async (tx) => executePosting(tx),
        { maxWait: 15000, timeout: 30000 }
      );
    } else {
      return await executePosting(prismaClient as Prisma.TransactionClient);
    }
  }

  /**
   * Reverses a posted revenue transaction atomically via a reversing journal.
   */
  static async reverseRevenue(
    revenueId: string,
    reason: string,
    session?: UserSession,
    prismaClient: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ): Promise<RevenueTransaction> {
    const tenantId = session?.tenantId || 'COMPANY-001';
    const existing = RevenuePersistenceService.getById(revenueId, tenantId);

    if (!existing) {
      throw new Error(`Revenue Reversal Error: Transaction "${revenueId}" not found.`);
    }

    if (existing.status !== 'POSTED') {
      throw new Error(
        `Revenue Reversal Error: Only POSTED transactions can be reversed. Current status: ${existing.status}`
      );
    }

    if (!existing.journalId) {
      throw new Error(
        `Revenue Reversal Error: Transaction "${revenueId}" has no linked journal to reverse.`
      );
    }

    const executeReversal = async (tx: Prisma.TransactionClient) => {
      // 1. Verify period is not locked
      await PeriodControlService.validateCanMutateTransaction(
        tenantId,
        existing.transactionDate,
        session,
        false,
        tx
      );

      // 2. Reverse the accounting journal atomically
      const reversalJournal = await JournalPostingService.reverseJournal(
        tenantId,
        existing.journalId!,
        new Date(existing.transactionDate),
        reason || `Reversal of revenue ${revenueId}`,
        tx,
        session
      );
      const reversalJournalId = reversalJournal.id;

      // 3. Statutory GST audit trail
      // In accordance with statutory immutability principles, GST transactions are preserved
      // for audit traceability rather than deleted. The reversal journal formally voids the
      // general ledger impact (reversing Account 2100 GST Output Tax Payable).

      // 4. Update Revenue status
      existing.status = 'REVERSED';
      existing.reversalJournalId = reversalJournalId;
      existing.correctionNote = reason;
      existing.updatedAt = new Date().toISOString();

      await RevenuePersistenceService.save(existing, tx);

      // 5. Record Audit
      recordAuditEvent(
        {
          tenantId,
          actorId: session?.userId || 'SYSTEM',
          eventType: 'REVENUE_REVERSED',
          entityType: 'REVENUE',
          entityId: existing.id,
          reason,
          newState: { ...existing },
          metadata: {
            reversalJournalId
          }
        },
        session
      );

      return existing;
    };

    if ('$transaction' in prismaClient) {
      return await (prismaClient as PrismaClient).$transaction(
        async (tx) => executeReversal(tx),
        { maxWait: 15000, timeout: 30000 }
      );
    } else {
      return await executeReversal(prismaClient as Prisma.TransactionClient);
    }
  }

  /**
   * Corrects a posted revenue transaction by reversing the original and posting a replacement.
   */
  static async correctRevenue(
    revenueId: string,
    correctionInput: CreateRevenueInput,
    session?: UserSession,
    prismaClient: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ): Promise<{ original: RevenueTransaction; replacement: RevenueTransaction }> {
    const reason = (correctionInput as any).notes || correctionInput.description || `Correction replacing transaction ${revenueId}`;
    const reversedOriginal = await this.reverseRevenue(revenueId, reason, session, prismaClient);

    const replacement = await this.postRevenue(
      {
        ...correctionInput,
        tenantId: reversedOriginal.tenantId,
        outletId: correctionInput.outletId || reversedOriginal.outletId,
        transactionDate: correctionInput.transactionDate || (correctionInput as any).date || reversedOriginal.transactionDate,
        grossAmount: correctionInput.grossAmount !== undefined ? correctionInput.grossAmount : reversedOriginal.grossAmount,
        notes: `Replacement for ${revenueId}: ${(correctionInput as any).notes || ''}`
      },
      session,
      prismaClient
    );

    reversedOriginal.reversedById = replacement.id;
    replacement.reversalOfId = reversedOriginal.id;

    await RevenuePersistenceService.save(reversedOriginal, prismaClient);
    await RevenuePersistenceService.save(replacement, prismaClient);

    return {
      original: reversedOriginal,
      replacement
    };
  }

  /**
   * Updates an unposted DRAFT revenue transaction.
   * If already POSTED, in-place edit is strictly rejected.
   */
  static async updateDraft(
    revenueId: string,
    updates: UpdateRevenueInput,
    sessionOrTenantId: any = 'COMPANY-001'
  ): Promise<RevenueTransaction> {
    const tenantId = typeof sessionOrTenantId === 'object' && sessionOrTenantId ? sessionOrTenantId.tenantId || 'COMPANY-001' : (sessionOrTenantId || 'COMPANY-001');
    const existing = RevenuePersistenceService.getById(revenueId, tenantId);
    if (!existing) {
      throw new Error(`Revenue Update Error: Transaction "${revenueId}" not found.`);
    }

    if (existing.status !== 'DRAFT' && existing.status !== 'VALIDATED') {
      throw new Error(
        `Revenue Update Error: Cannot edit a posted revenue transaction directly. Transaction "${revenueId}" is ${existing.status}; use reversal and correction workflow.`
      );
    }

    if (updates.transactionDate) existing.transactionDate = updates.transactionDate;
    if (updates.outletId) existing.outletId = updates.outletId;
    if (updates.outletName) existing.outletName = updates.outletName;
    if (updates.category) existing.category = updates.category;
    if (updates.description) existing.description = updates.description;
    if (updates.notes) existing.description = updates.notes;
    if (updates.paymentMethod) existing.paymentMethod = updates.paymentMethod as any;
    if (updates.sector) existing.sector = updates.sector;
    if (updates.gstClassification) existing.gstClassification = updates.gstClassification;

    if (updates.grossAmount !== undefined || updates.netAmount !== undefined) {
      const gstCalc = RevenueGstService.calculateGst({
        transactionDate: existing.transactionDate,
        grossAmount: updates.grossAmount !== undefined ? updates.grossAmount : existing.grossAmount,
        netAmount: updates.netAmount,
        amountBasis: updates.amountBasis || existing.amountBasis,
        sector: existing.sector,
        gstClassification: existing.gstClassification
      });
      existing.grossAmount = gstCalc.grossAmount;
      existing.netAmount = gstCalc.netAmount;
      existing.gstAmount = gstCalc.gstAmount;
      existing.gstRate = gstCalc.gstRate;
      existing.gstRatePercentage = gstCalc.gstRatePercentage;
      existing.gstRuleId = gstCalc.gstRuleId;
    }

    existing.updatedAt = new Date().toISOString();
    await RevenuePersistenceService.save(existing);
    return existing;
  }

  /**
   * Deletes a DRAFT revenue transaction.
   * If POSTED or REVERSED, deletion is strictly prohibited.
   */
  static deleteTransaction(revenueId: string, tenantId = 'COMPANY-001'): boolean {
    const existing = RevenuePersistenceService.getById(revenueId, tenantId);
    if (!existing) {
      return false;
    }

    if (existing.status !== 'DRAFT') {
      throw new Error(
        `Revenue Deletion Error: Cannot delete transaction with status "${existing.status}". Posted financial records are immutable.`
      );
    }

    return RevenuePersistenceService.delete(revenueId);
  }

  /**
   * Posts an existing DRAFT or REVIEW_REQUIRED revenue transaction to the canonical ledger.
   */
  static async postDraft(
    revenueId: string,
    session?: UserSession,
    prismaClient: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ): Promise<RevenueTransaction> {
    const tenantId = session?.tenantId || 'COMPANY-001';
    const draft = RevenuePersistenceService.getById(revenueId, tenantId);
    if (!draft) {
      throw new Error(`Revenue Posting Error: Transaction "${revenueId}" not found.`);
    }

    if (draft.status === 'POSTED') {
      return draft;
    }

    if (draft.status !== 'DRAFT' && draft.status !== 'REVIEW_REQUIRED' && draft.status !== 'VALIDATED') {
      throw new Error(`Revenue Posting Error: Cannot post transaction in "${draft.status}" status.`);
    }

    return await this.postRevenue(
      {
        ...draft,
        autoPost: true
      },
      session,
      prismaClient
    );
  }
}
