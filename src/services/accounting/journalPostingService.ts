import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../db/client';
import { AccountingPeriodService } from './accountingPeriodService';
import { PeriodControlService } from './periodControlService';
import { LedgerService } from './ledgerService';
import { UserSession } from '../../types/rbac';
import { hasPermission } from '../auth/rbacService';
import { UnauthorizedPeriodActionError } from '../../types/period';
import { recordJournalPostingAudit, recordJournalReversalAudit } from '../audit/auditService';
import { ApprovalWorkflowService } from '../approval/approvalWorkflowService';

export interface JournalLineItemInput {
  accountCode: string;
  accountName?: string;
  debit: number | string | Prisma.Decimal;
  credit: number | string | Prisma.Decimal;
  description?: string;
}

export interface PostJournalInput {
  tenantId: string;
  entryDate: Date | string;
  reference: string; // Mandatory source document or event reference
  description: string;
  lines: JournalLineItemInput[];
  accountingPeriodId?: string;
  session?: UserSession;
  correlationId?: string;
  workflowItemId?: string;
}

export class JournalPostingService {
  /**
   * Posts a journal entry atomically to the general ledger after enforcing all 10 accounting rules.
   */
  static async postJournal(
    input: PostJournalInput,
    prismaClient: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ) {
    const { tenantId, entryDate, reference, description, lines, accountingPeriodId, session, correlationId } = input;

    // Rule 8: Every posting must identify source document/event reference
    if (!reference || !reference.trim()) {
      throw new Error('Journal Posting Error: Every posting must identify a source document or event reference');
    }

    // Zero-line check
    if (!lines || lines.length === 0) {
      throw new Error('Journal Posting Error: Zero-line journals are rejected');
    }

    if (!description || !description.trim()) {
      throw new Error('Journal Posting Error: Description is required');
    }

    // Rule 9: All monetary calculations use Prisma.Decimal
    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);

    const convertedLines = lines.map((line, idx) => {
      if (!line.accountCode || !line.accountCode.trim()) {
        throw new Error(`Journal Posting Error: Line ${idx + 1} must specify accountCode`);
      }

      const d = new Prisma.Decimal(line.debit || 0);
      const c = new Prisma.Decimal(line.credit || 0);

      if (d.isNegative() || c.isNegative()) {
        throw new Error(`Journal Posting Error: Line ${idx + 1} debit/credit cannot be negative`);
      }

      totalDebit = totalDebit.plus(d);
      totalCredit = totalCredit.plus(c);

      return {
        accountCode: line.accountCode,
        accountName: line.accountName || `Account ${line.accountCode}`,
        debit: d,
        credit: c,
        description: line.description || description
      };
    });

    // Rule 1 & 2: Every posted journal must balance; Debit total must equal Credit total
    if (!totalDebit.equals(totalCredit)) {
      throw new Error(
        `Journal Posting Error: Unbalanced journal rejected. Total Debit (${totalDebit}) does not equal Total Credit (${totalCredit})`
      );
    }

    // Execute atomic validation & DB transaction
    const executePosting = async (tx: Prisma.TransactionClient) => {
      // Validate Phase 37 Workflow Approval status if workflow item is referenced
      const targetWorkflowId = input.workflowItemId || (ApprovalWorkflowService.getItem(reference.trim()) ? reference.trim() : undefined);
      if (targetWorkflowId) {
        ApprovalWorkflowService.validateCanPostToLedger(targetWorkflowId, tenantId);
      }

      // Check duplicate posting (Rule: duplicate posting is rejected)
      const existingJournal = await tx.journal.findFirst({
        where: {
          tenantId,
          reference: reference.trim(),
          status: 'POSTED'
        }
      });

      if (existingJournal) {
        throw new Error(
          `Journal Posting Error: Duplicate posting rejected. Journal with reference '${reference}' is already posted`
        );
      }

      // Validate Phase 36 Period State (OPEN, REVIEW, APPROVED, LOCKED, AMENDED)
      await PeriodControlService.validateCanPostToPeriod(tenantId, entryDate, session, tx);

      // Rule 6 & 7: Check accounting period & locked period via PeriodControlService & AccountingPeriodService
      const isLocked = await AccountingPeriodService.isPeriodLocked(tenantId, entryDate, tx);
      if (isLocked) {
        throw new Error('Journal Posting Error: Cannot post journal. Accounting period is closed or locked');
      }

      let periodId = accountingPeriodId;
      if (!periodId) {
        const period = await AccountingPeriodService.findOrCreatePeriod(tenantId, entryDate, tx);
        periodId = period.id;
      }

      // Ensure all accounts exist in chart of accounts (batched to eliminate N+1 queries)
      await LedgerService.ensureAccountsExistBatch(
        tenantId,
        convertedLines.map(l => ({
          accountCode: l.accountCode,
          accountName: l.accountName
        })),
        tx
      );

      // Create Journal & Lines atomically
      const createdJournal = await tx.journal.create({
        data: {
          tenantId,
          accountingPeriodId: periodId,
          entryDate: new Date(entryDate),
          reference: reference.trim(),
          description,
          totalDebit,
          totalCredit,
          isBalanced: true,
          status: 'POSTED',
          lines: {
            create: convertedLines.map(l => ({
              accountCode: l.accountCode,
              accountName: l.accountName,
              debit: l.debit,
              credit: l.credit,
              description: l.description
            }))
          }
        },
        include: {
          lines: true,
          accountingPeriod: true
        }
      });

      // Mark referenced workflow item as POSTED
      if (targetWorkflowId) {
        try {
          ApprovalWorkflowService.markItemAsPosted(targetWorkflowId, createdJournal.id, session);
        } catch {
          // Continue if workflow store was cleared or state is managed externally
        }
      }

      // Record audit event for journal posting
      try {
        recordJournalPostingAudit(
          tenantId,
          session?.userId || 'SYSTEM',
          createdJournal.id,
          {
            reference: createdJournal.reference,
            entryDate: createdJournal.entryDate,
            totalDebit: createdJournal.totalDebit.toString(),
            totalCredit: createdJournal.totalCredit.toString(),
            description: createdJournal.description
          },
          correlationId
        );
      } catch {
        // Audit recording in memory
      }

      return createdJournal;
    };

    // Rule 10: Atomic transaction execution
    if ('$transaction' in prismaClient && typeof (prismaClient as any).$transaction === 'function') {
      return await (prismaClient as PrismaClient).$transaction(async tx => {
        return await executePosting(tx);
      }, { maxWait: 10000, timeout: 20000 });
    } else {
      return await executePosting(prismaClient as Prisma.TransactionClient);
    }
  }

  /**
   * Rule 3 & 4: Posted journals cannot be edited or deleted.
   */
  static async updateJournal() {
    throw new Error('Journal Error: Posted journals cannot be edited');
  }

  static async deleteJournal() {
    throw new Error('Journal Error: Posted journals cannot be deleted');
  }

  /**
   * Rule 5: Corrections require reversal journals.
   * Generates a new reversal journal entry with inverted debits and credits.
   */
  static async reverseJournal(
    tenantId: string,
    journalId: string,
    reversalDate?: Date | string,
    reason?: string,
    prismaClient: PrismaClient | Prisma.TransactionClient = defaultPrisma,
    session?: UserSession,
    correlationId?: string
  ) {
    if (session) {
      if (session.tenantId !== tenantId && (!session.assignedEntities || !session.assignedEntities.includes(tenantId))) {
        throw new UnauthorizedPeriodActionError(
          `Multi-Tenant Isolation Error: User '${session.userId}' is not authorized for tenant '${tenantId}'`
        );
      }

      const canReverse =
        hasPermission(session, 'REVERSE_TRANSACTIONS', tenantId) ||
        session.role === 'STAFF_ACCOUNTANT' ||
        session.role === 'TAX_MANAGER' ||
        session.role === 'CLIENT_ADMIN';

      if (!canReverse) {
        throw new UnauthorizedPeriodActionError(
          `RBAC Security Error: User '${session.userId}' with role '${session.role}' is not authorized to reverse journals. Required: REVERSE_TRANSACTIONS`
        );
      }
    }

    const executeReversal = async (tx: Prisma.TransactionClient) => {
      const originalJournal = await tx.journal.findUnique({
        where: { id: journalId },
        include: { lines: true }
      });

      if (!originalJournal) {
        throw new Error(`Journal Reversal Error: Journal '${journalId}' not found`);
      }

      if (originalJournal.tenantId !== tenantId) {
        throw new Error(`Journal Reversal Error: Tenant mismatch for journal '${journalId}'`);
      }

      if (originalJournal.status === 'REVERSED') {
        throw new Error(`Journal Reversal Error: Journal '${journalId}' is already reversed`);
      }

      // Check period lock for original journal
      await PeriodControlService.validateCanMutateTransaction(
        tenantId,
        originalJournal.entryDate,
        session,
        false,
        tx
      );

      const revDate = reversalDate || originalJournal.entryDate;
      const revReference = `REV-${originalJournal.reference || originalJournal.id}`;

      // Invert debits and credits for all lines
      const reversalLines: JournalLineItemInput[] = originalJournal.lines.map(line => ({
        accountCode: line.accountCode,
        accountName: line.accountName,
        debit: line.credit, // Debit becomes Credit
        credit: line.debit, // Credit becomes Debit
        description: `Reversal of ${line.description || originalJournal.description}: ${reason || 'Correction'}`
      }));

      // Post the reversal journal
      const reversalJournal = await JournalPostingService.postJournal(
        {
          tenantId,
          entryDate: revDate,
          reference: revReference,
          description: `Reversal of Journal ${originalJournal.id}: ${reason || 'Correction'}`,
          lines: reversalLines,
          session,
          correlationId
        },
        tx
      );

      // Update original journal status to REVERSED
      await tx.journal.update({
        where: { id: originalJournal.id },
        data: { status: 'REVERSED' }
      });

      // Record reversal audit
      try {
        recordJournalReversalAudit(
          tenantId,
          session?.userId || 'SYSTEM',
          originalJournal.id,
          {
            reversalJournalId: reversalJournal.id,
            reversalReference: revReference,
            reversalDate: revDate,
            reason: reason || 'Correction'
          },
          reason || 'Correction',
          correlationId
        );
      } catch {
        // In-memory fallback
      }

      return reversalJournal;
    };

    if ('$transaction' in prismaClient && typeof (prismaClient as any).$transaction === 'function') {
      return await (prismaClient as PrismaClient).$transaction(async tx => {
        return await executeReversal(tx);
      }, { maxWait: 10000, timeout: 20000 });
    } else {
      return await executeReversal(prismaClient as Prisma.TransactionClient);
    }
  }
}

