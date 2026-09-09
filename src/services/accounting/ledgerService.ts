import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../db/client';
import { STANDARD_ACCOUNTS } from './journalService';

export interface EnsureAccountParams {
  tenantId: string;
  accountCode: string;
  accountName?: string;
  accountType?: string; // 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'
  miraCategory?: string;
}

export class LedgerService {
  /**
   * Helper to derive account type from account code or standard accounts map.
   */
  static deriveAccountType(accountCode: string): string {
    if (accountCode.startsWith('1')) return 'ASSET';
    if (accountCode.startsWith('2')) return 'LIABILITY';
    if (accountCode.startsWith('3')) return 'EQUITY';
    if (accountCode.startsWith('4')) return 'REVENUE';
    if (accountCode.startsWith('5')) return 'EXPENSE';
    return 'EXPENSE';
  }

  /**
   * Ensures an Account record exists in the database for the given tenantId and accountCode.
   */
  static async ensureAccountExists(
    params: EnsureAccountParams,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ) {
    const { tenantId, accountCode, accountName, accountType, miraCategory } = params;

    // Find standard account name fallback
    let name = accountName;
    if (!name) {
      const match = Object.values(STANDARD_ACCOUNTS).find(a => a.code === accountCode);
      name = match ? match.name : `Account ${accountCode}`;
    }

    const type = accountType || LedgerService.deriveAccountType(accountCode);

    return await db.account.upsert({
      where: {
        tenantId_accountCode: {
          tenantId,
          accountCode
        }
      },
      update: {
        accountName: name,
        accountType: type,
        ...(miraCategory ? { miraCategory } : {})
      },
      create: {
        tenantId,
        accountCode,
        accountName: name,
        accountType: type,
        miraCategory
      }
    });
  }

  /**
   * Retrieves account detail by account code.
   */
  static async getAccount(
    tenantId: string,
    accountCode: string,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ) {
    return await db.account.findUnique({
      where: {
        tenantId_accountCode: {
          tenantId,
          accountCode
        }
      }
    });
  }

  /**
   * Fetches ledger postings (JournalLines) for a tenant within an optional date range / account.
   */
  static async getLedgerEntries(
    tenantId: string,
    options?: {
      accountCode?: string;
      startDate?: Date | string;
      endDate?: Date | string;
    },
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ) {
    const where: Prisma.JournalLineWhereInput = {
      journal: {
        tenantId,
        status: 'POSTED',
        ...(options?.startDate || options?.endDate
          ? {
              entryDate: {
                ...(options.startDate ? { gte: new Date(options.startDate) } : {}),
                ...(options.endDate ? { lte: new Date(options.endDate) } : {})
              }
            }
          : {})
      },
      ...(options?.accountCode ? { accountCode: options.accountCode } : {})
    };

    return await db.journalLine.findMany({
      where,
      include: {
        journal: true,
        account: true
      },
      orderBy: {
        journal: {
          entryDate: 'asc'
        }
      }
    });
  }

  /**
   * Calculates total debit, total credit, and net balance for a specific account.
   */
  static async getAccountBalance(
    tenantId: string,
    accountCode: string,
    asOfDate?: Date | string,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ) {
    const entries = await LedgerService.getLedgerEntries(
      tenantId,
      {
        accountCode,
        endDate: asOfDate
      },
      db
    );

    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);

    for (const entry of entries) {
      totalDebit = totalDebit.plus(entry.debit);
      totalCredit = totalCredit.plus(entry.credit);
    }

    const account = await LedgerService.getAccount(tenantId, accountCode, db);
    const accountType = account?.accountType || LedgerService.deriveAccountType(accountCode);

    // Normal debit balance for ASSET & EXPENSE; normal credit balance for LIABILITY, EQUITY & REVENUE
    let netBalance: Prisma.Decimal;
    if (accountType === 'ASSET' || accountType === 'EXPENSE') {
      netBalance = totalDebit.minus(totalCredit);
    } else {
      netBalance = totalCredit.minus(totalDebit);
    }

    return {
      tenantId,
      accountCode,
      accountName: account?.accountName || `Account ${accountCode}`,
      accountType,
      totalDebit,
      totalCredit,
      netBalance
    };
  }

  /**
   * Batched account existence verification.
   * Eliminates N+1 query loops when posting journals or importing transactions.
   */
  static async ensureAccountsExistBatch(
    tenantId: string,
    accounts: Array<{ accountCode: string; accountName?: string; accountType?: string; miraCategory?: string }>,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ) {
    if (!accounts || accounts.length === 0) return;

    // Deduplicate by accountCode
    const uniqueCodesMap = new Map<string, { accountName?: string; accountType?: string; miraCategory?: string }>();
    for (const a of accounts) {
      if (!uniqueCodesMap.has(a.accountCode)) {
        uniqueCodesMap.set(a.accountCode, a);
      }
    }

    const uniqueCodes = Array.from(uniqueCodesMap.keys());

    // Single query to check which accounts already exist
    const existingAccounts = await db.account.findMany({
      where: {
        tenantId,
        accountCode: { in: uniqueCodes }
      },
      select: { accountCode: true }
    });

    const existingSet = new Set(existingAccounts.map(a => a.accountCode));
    const missingCodes = uniqueCodes.filter(c => !existingSet.has(c));

    for (const code of missingCodes) {
      const info = uniqueCodesMap.get(code)!;
      await LedgerService.ensureAccountExists(
        {
          tenantId,
          accountCode: code,
          accountName: info.accountName,
          accountType: info.accountType,
          miraCategory: info.miraCategory
        },
        db
      );
    }
  }

  /**
   * Memory-bounded streaming / chunked aggregation of account balances.
   * Eliminates unbounded findMany queries when aggregating up to 1,000,000 journal lines.
   * Keeps peak heap memory bounded to O(accounts) instead of O(lines).
   */
  static async aggregateLedgerBalances(
    tenantId: string,
    options?: {
      startDate?: Date | string;
      endDate?: Date | string;
      chunkSize?: number;
    },
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ): Promise<Map<string, { accountCode: string; accountName: string; debit: Prisma.Decimal; credit: Prisma.Decimal }>> {
    const chunkSize = options?.chunkSize || 5000;
    const accountMap = new Map<
      string,
      {
        accountCode: string;
        accountName: string;
        debit: Prisma.Decimal;
        credit: Prisma.Decimal;
      }
    >();

    const where: Prisma.JournalLineWhereInput = {
      journal: {
        tenantId,
        status: 'POSTED',
        ...(options?.startDate || options?.endDate
          ? {
              entryDate: {
                ...(options.startDate ? { gte: new Date(options.startDate) } : {}),
                ...(options.endDate ? { lte: new Date(options.endDate) } : {})
              }
            }
          : {})
      }
    };

    let cursorId: string | undefined = undefined;
    let hasMore = true;

    while (hasMore) {
      const chunk = await db.journalLine.findMany({
        where,
        take: chunkSize,
        ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
        select: {
          id: true,
          accountCode: true,
          accountName: true,
          debit: true,
          credit: true
        },
        orderBy: { id: 'asc' }
      });

      if (chunk.length === 0) {
        hasMore = false;
        break;
      }

      for (const entry of chunk) {
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

      if (chunk.length < chunkSize) {
        hasMore = false;
      } else {
        cursorId = chunk[chunk.length - 1].id;
      }
    }

    return accountMap;
  }

  /**
   * Fetches all accounts and their accumulated balances for a tenant as of a specific date.
   */
  static async getAccountBalances(
    tenantId: string,
    asOfDate?: Date | string,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ) {
    const entries = await LedgerService.getLedgerEntries(
      tenantId,
      { endDate: asOfDate },
      db
    );

    const balanceMap = new Map<
      string,
      {
        accountCode: string;
        accountName: string;
        debit: Prisma.Decimal;
        credit: Prisma.Decimal;
      }
    >();

    for (const entry of entries) {
      const code = entry.accountCode;
      if (!balanceMap.has(code)) {
        balanceMap.set(code, {
          accountCode: code,
          accountName: entry.accountName,
          debit: new Prisma.Decimal(0),
          credit: new Prisma.Decimal(0)
        });
      }

      const rec = balanceMap.get(code)!;
      rec.debit = rec.debit.plus(entry.debit);
      rec.credit = rec.credit.plus(entry.credit);
    }

    const results = [];
    for (const rec of balanceMap.values()) {
      const accountType = LedgerService.deriveAccountType(rec.accountCode);
      let netBalance: Prisma.Decimal;
      if (accountType === 'ASSET' || accountType === 'EXPENSE') {
        netBalance = rec.debit.minus(rec.credit);
      } else {
        netBalance = rec.credit.minus(rec.debit);
      }

      results.push({
        tenantId,
        accountCode: rec.accountCode,
        accountName: rec.accountName,
        accountType,
        totalDebit: rec.debit,
        totalCredit: rec.credit,
        netBalance
      });
    }

    return results;
  }
}
