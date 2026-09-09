import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../db/client';
import { PeriodControlService } from './periodControlService';

export interface CreatePeriodParams {
  tenantId: string;
  periodName: string;
  startDate: Date | string;
  endDate: Date | string;
  isClosed?: boolean;
}

/**
 * Service for managing accounting periods and period locking.
 */
export class AccountingPeriodService {
  /**
   * Finds an existing AccountingPeriod or creates a default annual accounting period covering entryDate.
   */
  static async findOrCreatePeriod(
    tenantId: string,
    entryDate: Date | string,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ) {
    const dateObj = new Date(entryDate);
    if (isNaN(dateObj.getTime())) {
      throw new Error(`Invalid entry date: ${entryDate}`);
    }

    // Ensure tenant exists in DB (upsert if needed to avoid FK violation)
    await db.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: {
        id: tenantId,
        name: `Tenant ${tenantId}`,
        tin: `TIN-${tenantId.replace(/[^A-Za-z0-9]/g, '').slice(-15)}`
      }
    });

    const existingPeriod = await db.accountingPeriod.findFirst({
      where: {
        tenantId,
        startDate: { lte: dateObj },
        endDate: { gte: dateObj }
      }
    });

    if (existingPeriod) {
      return existingPeriod;
    }

    const year = dateObj.getFullYear();
    const periodName = `FY${year}`;
    const startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

    return await db.accountingPeriod.create({
      data: {
        tenantId,
        periodName,
        startDate,
        endDate,
        isClosed: false
      }
    });
  }

  /**
   * Checks whether a date falls within a closed accounting period or a locked PeriodLock.
   */
  static async isPeriodLocked(
    tenantId: string,
    entryDate: Date | string,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ): Promise<boolean> {
    const dateObj = new Date(entryDate);

    // 1. Check AccountingPeriod isClosed
    const period = await db.accountingPeriod.findFirst({
      where: {
        tenantId,
        startDate: { lte: dateObj },
        endDate: { gte: dateObj }
      }
    });

    if (period && period.isClosed) {
      return true;
    }

    // 2. Check PeriodLock
    const lock = await db.periodLock.findFirst({
      where: {
        tenantId,
        periodStart: { lte: dateObj },
        periodEnd: { gte: dateObj },
        isLocked: true
      }
    });

    if (lock) {
      return true;
    }

    // 3. Check PeriodControlService in-memory status
    const status = await PeriodControlService.getPeriodStatus(tenantId, entryDate, db);
    return status === 'LOCKED' || status === 'APPROVED';
  }

  /**
   * Create an explicit accounting period.
   */
  static async createPeriod(
    params: CreatePeriodParams,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ) {
    const { tenantId, periodName, startDate, endDate, isClosed = false } = params;

    await db.tenant.upsert({
      where: { id: tenantId },
      update: {},
      create: {
        id: tenantId,
        name: `Tenant ${tenantId}`,
        tin: '1000000GST001'
      }
    });

    const period = await db.accountingPeriod.create({
      data: {
        tenantId,
        periodName,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        isClosed
      }
    });

    await PeriodControlService.createPeriod({
      tenantId,
      periodName,
      startDate: new Date(startDate).toISOString().split('T')[0],
      endDate: new Date(endDate).toISOString().split('T')[0],
      status: isClosed ? 'LOCKED' : 'OPEN'
    }, db);

    return period;
  }

  /**
   * Close / lock an accounting period.
   */
  static async closePeriod(
    tenantId: string,
    periodId: string,
    lockedBy?: string,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ) {
    const period = await db.accountingPeriod.findUnique({
      where: { id: periodId }
    });

    if (!period) {
      throw new Error(`Accounting Period '${periodId}' not found`);
    }

    const updatedPeriod = await db.accountingPeriod.update({
      where: { id: period.id },
      data: { isClosed: true }
    });

    const taxYear = new Date(period.startDate).getFullYear();

    await db.periodLock.create({
      data: {
        tenantId,
        taxYear,
        periodStart: period.startDate,
        periodEnd: period.endDate,
        isLocked: true,
        lockedBy,
        lockedAt: new Date()
      }
    });

    // Update in-memory PeriodControlService
    try {
      await PeriodControlService.createPeriod({
        tenantId,
        periodName: period.periodName,
        startDate: period.startDate.toISOString().split('T')[0],
        endDate: period.endDate.toISOString().split('T')[0],
        status: 'LOCKED'
      }, db);
    } catch {
      // Ignore fallback
    }

    return updatedPeriod;
  }

  /**
   * Reopen an accounting period.
   */
  static async reopenPeriod(
    tenantId: string,
    periodId: string,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ) {
    const period = await db.accountingPeriod.update({
      where: { id: periodId },
      data: { isClosed: false }
    });

    await db.periodLock.updateMany({
      where: {
        tenantId,
        periodStart: { lte: period.endDate },
        periodEnd: { gte: period.startDate }
      },
      data: { isLocked: false }
    });

    // Update in-memory PeriodControlService
    try {
      await PeriodControlService.createPeriod({
        tenantId,
        periodName: period.periodName,
        startDate: period.startDate.toISOString().split('T')[0],
        endDate: period.endDate.toISOString().split('T')[0],
        status: 'OPEN'
      }, db);
    } catch {
      // Ignore fallback
    }

    return period;
  }
}

