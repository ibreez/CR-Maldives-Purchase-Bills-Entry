import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../db/client';
import { LedgerService } from './ledgerService';

export interface TrialBalanceAccountSummary {
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  netBalance: Prisma.Decimal;
}

export interface TrialBalanceReport {
  tenantId: string;
  asOfDate: string;
  startDate?: string;
  endDate?: string;
  accounts: TrialBalanceAccountSummary[];
  totalDebit: Prisma.Decimal;
  totalCredit: Prisma.Decimal;
  isBalanced: boolean;
}

export class TrialBalanceService {
  /**
   * Generates an authoritative Trial Balance report from posted ledger entries.
   */
  static async generateTrialBalance(
    tenantId: string,
    options?: {
      asOfDate?: Date | string;
      startDate?: Date | string;
      endDate?: Date | string;
      useAggregatedMode?: boolean;
      chunkSize?: number;
    },
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ): Promise<TrialBalanceReport> {
    const asOf = options?.asOfDate || options?.endDate || new Date();
    const asOfDateStr = new Date(asOf).toISOString().split('T')[0];

    let accountMap: Map<
      string,
      {
        accountCode: string;
        accountName: string;
        debit: Prisma.Decimal;
        credit: Prisma.Decimal;
      }
    >;

    if (options?.useAggregatedMode) {
      accountMap = await LedgerService.aggregateLedgerBalances(
        tenantId,
        {
          startDate: options?.startDate,
          endDate: options?.asOfDate || options?.endDate,
          chunkSize: options?.chunkSize
        },
        db
      );
    } else {
      const entries = await LedgerService.getLedgerEntries(
        tenantId,
        {
          startDate: options?.startDate,
          endDate: options?.asOfDate || options?.endDate
        },
        db
      );

      accountMap = new Map();

      for (const entry of entries) {
        const code = entry.accountCode;
        if (!accountMap.has(code)) {
          accountMap.set(code, {
            accountCode: code,
            accountName: entry.accountName,
            debit: new Prisma.Decimal(0),
            credit: new Prisma.Decimal(0)
          });
        }

        const rec = accountMap.get(code)!;
        rec.debit = rec.debit.plus(entry.debit);
        rec.credit = rec.credit.plus(entry.credit);
      }
    }

    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);
    const accounts: TrialBalanceAccountSummary[] = [];

    // Sort by account code ascending
    const sortedCodes = Array.from(accountMap.keys()).sort();

    for (const code of sortedCodes) {
      const item = accountMap.get(code)!;
      const accountType = LedgerService.deriveAccountType(code);

      let netBalance: Prisma.Decimal;
      if (accountType === 'ASSET' || accountType === 'EXPENSE') {
        netBalance = item.debit.minus(item.credit);
      } else {
        netBalance = item.credit.minus(item.debit);
      }

      totalDebit = totalDebit.plus(item.debit);
      totalCredit = totalCredit.plus(item.credit);

      accounts.push({
        accountCode: item.accountCode,
        accountName: item.accountName,
        accountType,
        debit: item.debit,
        credit: item.credit,
        netBalance
      });
    }

    const isBalanced = totalDebit.equals(totalCredit);

    return {
      tenantId,
      asOfDate: asOfDateStr,
      startDate: options?.startDate ? new Date(options.startDate).toISOString().split('T')[0] : undefined,
      endDate: options?.endDate ? new Date(options.endDate).toISOString().split('T')[0] : undefined,
      accounts,
      totalDebit,
      totalCredit,
      isBalanced
    };
  }

  /**
   * High-Performance Trial Balance calculation using bounded chunked aggregation.
   * Guarantees 100% mathematical identity with generateTrialBalance while eliminating unbounded queries.
   */
  static async generateTrialBalanceAggregated(
    tenantId: string,
    options?: {
      asOfDate?: Date | string;
      startDate?: Date | string;
      endDate?: Date | string;
      chunkSize?: number;
    },
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ): Promise<TrialBalanceReport> {
    return this.generateTrialBalance(
      tenantId,
      {
        ...options,
        useAggregatedMode: true
      },
      db
    );
  }
}
