import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../../db/client.js';
import { RevenueTransaction, RevenueStatus, RevenuePaymentMethod, RevenueAmountBasis, RevenueGstClassification } from '../../types/revenue';
import { GstSector } from '../../types/gst';

export class RevenuePersistenceService {
  private static memoryStore: Map<string, RevenueTransaction> = new Map();
  private static isInitialized = false;
  private static initPromise: Promise<void> | null = null;

  /**
   * Converts a domain RevenueTransaction into Prisma RevenueTransaction input
   */
  public static toPrismaInput(tx: RevenueTransaction): Prisma.RevenueTransactionCreateInput {
    const txDate = tx.transactionDate ? new Date(tx.transactionDate) : new Date();

    return {
      id: tx.id,
      tenant: { connect: { id: tx.tenantId } },
      outletId: tx.outletId || 'OUTLET-DEFAULT',
      outletName: tx.outletName || null,
      transactionDate: txDate,
      accountingPeriod: tx.accountingPeriodId ? { connect: { id: tx.accountingPeriodId } } : undefined,
      category: tx.category || 'General Revenue',
      description: tx.description || 'Revenue Entry',
      amountBasis: tx.amountBasis || 'GST_INCLUSIVE',
      sector: tx.sector || 'GENERAL',
      grossAmount: new Prisma.Decimal(tx.grossAmount.toString()),
      netAmount: new Prisma.Decimal(tx.netAmount.toString()),
      gstAmount: new Prisma.Decimal(tx.gstAmount.toString()),
      gstClassification: tx.gstClassification || 'TAXABLE',
      gstRate: new Prisma.Decimal(tx.gstRate !== undefined ? String(tx.gstRate) : '0.0800'),
      gstRatePercentage: new Prisma.Decimal(tx.gstRatePercentage !== undefined ? String(tx.gstRatePercentage) : '8.00'),
      gstRuleId: tx.gstRuleId || null,
      gstRegulatoryVersion: tx.gstRegulatoryVersion || null,
      paymentMethod: tx.paymentMethod || 'CASH',
      customerReference: tx.customerReference || null,
      currency: tx.currency || 'MVR',
      fxRate: new Prisma.Decimal(tx.fxRate ? tx.fxRate.toString() : '1.0000'),
      mvrAmount: new Prisma.Decimal(tx.mvrAmount ? tx.mvrAmount.toString() : tx.grossAmount.toString()),
      status: tx.status || 'POSTED',
      sourceType: tx.sourceType || 'MANUAL_ENTRY',
      sourceId: tx.sourceId || null,
      idempotencyKey: tx.idempotencyKey || null,
      journal: tx.journalId ? { connect: { id: tx.journalId } } : undefined,
      gstTransaction: tx.gstTransactionId ? { connect: { id: tx.gstTransactionId } } : undefined,
      auditEventId: tx.auditEventId || null,
      reversalOf: tx.reversalOfId ? { connect: { id: tx.reversalOfId } } : undefined,
      reversalJournalId: tx.reversalJournalId || null,
      reversedById: tx.reversedById || null,
      correctionNote: tx.correctionNote || null,
      reviewNotes: tx.reviewNotes ? JSON.stringify(tx.reviewNotes) : null,
      approvedBy: tx.approvedBy || null,
      approvedAt: tx.approvedAt ? new Date(tx.approvedAt) : null,
      createdBy: tx.createdBy || 'SYSTEM',
      createdAt: tx.createdAt ? new Date(tx.createdAt) : new Date(),
      updatedAt: tx.updatedAt ? new Date(tx.updatedAt) : new Date()
    };
  }

  /**
   * Converts a database row from Prisma into domain RevenueTransaction
   */
  public static fromPrismaRow(row: any): RevenueTransaction {
    let revNotes: string[] | undefined;
    if (row.reviewNotes) {
      try {
        revNotes = JSON.parse(row.reviewNotes);
      } catch {
        revNotes = [row.reviewNotes];
      }
    }

    const txDate = row.transactionDate instanceof Date
      ? row.transactionDate.toISOString().split('T')[0]
      : String(row.transactionDate).split('T')[0];

    return {
      id: row.id,
      tenantId: row.tenantId,
      outletId: row.outletId,
      outletName: row.outletName || undefined,
      transactionDate: txDate,
      accountingPeriodId: row.accountingPeriodId || undefined,
      category: row.category,
      description: row.description,
      amountBasis: row.amountBasis as RevenueAmountBasis,
      sector: row.sector as GstSector,
      grossAmount: new Prisma.Decimal(row.grossAmount.toString()),
      netAmount: new Prisma.Decimal(row.netAmount.toString()),
      gstAmount: new Prisma.Decimal(row.gstAmount.toString()),
      gstClassification: row.gstClassification as RevenueGstClassification,
      gstRate: Number(row.gstRate),
      gstRatePercentage: Number(row.gstRatePercentage),
      gstRuleId: row.gstRuleId || undefined,
      gstRegulatoryVersion: row.gstRegulatoryVersion || undefined,
      paymentMethod: row.paymentMethod as RevenuePaymentMethod,
      customerReference: row.customerReference || undefined,
      currency: row.currency || 'MVR',
      fxRate: new Prisma.Decimal(row.fxRate.toString()),
      mvrAmount: new Prisma.Decimal(row.mvrAmount.toString()),
      status: row.status as RevenueStatus,
      sourceType: row.sourceType || 'MANUAL_ENTRY',
      sourceId: row.sourceId || undefined,
      idempotencyKey: row.idempotencyKey || undefined,
      journalId: row.journalId || undefined,
      gstTransactionId: row.gstTransactionId || undefined,
      auditEventId: row.auditEventId || undefined,
      reversalOfId: row.reversalOfId || undefined,
      reversalJournalId: row.reversalJournalId || undefined,
      reversedById: row.reversedById || undefined,
      correctionNote: row.correctionNote || undefined,
      reviewNotes: revNotes,
      approvedBy: row.approvedBy || undefined,
      approvedAt: row.approvedAt ? (row.approvedAt instanceof Date ? row.approvedAt.toISOString() : String(row.approvedAt)) : undefined,
      createdBy: row.createdBy || 'SYSTEM',
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt)
    };
  }

  /**
   * Initializes or refreshes the in-memory cache from PostgreSQL.
   */
  public static async initFromDb(client?: PrismaClient | Prisma.TransactionClient): Promise<void> {
    const db = client || defaultPrisma;
    try {
      const rows = await db.revenueTransaction.findMany({
        orderBy: { transactionDate: 'desc' }
      });
      this.memoryStore.clear();
      for (const row of rows) {
        const item = this.fromPrismaRow(row);
        this.memoryStore.set(item.id, item);
      }
      this.isInitialized = true;
    } catch (err) {
      console.warn('[RevenuePersistenceService] Failed to load from PostgreSQL, using memory store:', err);
    }
  }

  private static ensureInitialized(): void {
    if (!this.isInitialized && !this.initPromise) {
      this.initPromise = this.initFromDb().then(() => {
        this.initPromise = null;
      });
    }
  }

  /**
   * Synchronous retrieval from in-memory cache.
   */
  static getAll(tenantId?: string): RevenueTransaction[] {
    this.ensureInitialized();
    const all = Array.from(this.memoryStore.values());
    if (tenantId) {
      return all.filter((r) => !r.tenantId || r.tenantId === tenantId);
    }
    return all;
  }

  /**
   * Async database query for all records.
   */
  static async getAllAsync(tenantId?: string, client?: PrismaClient | Prisma.TransactionClient): Promise<RevenueTransaction[]> {
    const db = client || defaultPrisma;
    const rows = await db.revenueTransaction.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { transactionDate: 'desc' }
    });
    const result = rows.map((r) => this.fromPrismaRow(r));
    for (const item of result) {
      this.memoryStore.set(item.id, item);
    }
    return result;
  }

  /**
   * Synchronous retrieval by ID from cache.
   */
  static getById(id: string, tenantId?: string): RevenueTransaction | null {
    this.ensureInitialized();
    const found = this.memoryStore.get(id);
    if (!found) return null;
    if (tenantId && found.tenantId && found.tenantId !== tenantId) return null;
    return found;
  }

  /**
   * Async retrieval by ID directly from PostgreSQL.
   */
  static async getByIdAsync(id: string, tenantId?: string, client?: PrismaClient | Prisma.TransactionClient): Promise<RevenueTransaction | null> {
    const db = client || defaultPrisma;
    const row = await db.revenueTransaction.findUnique({
      where: { id }
    });
    if (!row) return null;
    if (tenantId && row.tenantId && row.tenantId !== tenantId) return null;
    const item = this.fromPrismaRow(row);
    this.memoryStore.set(item.id, item);
    return item;
  }

  static findByIdempotencyKey(key: string, tenantId?: string): RevenueTransaction | null {
    if (!key || !key.trim()) return null;
    this.ensureInitialized();
    const all = this.getAll(tenantId);
    return all.find((r) => r.idempotencyKey === key.trim()) || null;
  }

  static async findByIdempotencyKeyAsync(key: string, tenantId?: string, client?: PrismaClient | Prisma.TransactionClient): Promise<RevenueTransaction | null> {
    if (!key || !key.trim()) return null;
    const db = client || defaultPrisma;
    const row = await db.revenueTransaction.findFirst({
      where: {
        idempotencyKey: key.trim(),
        ...(tenantId ? { tenantId } : {})
      }
    });
    if (!row) return null;
    const item = this.fromPrismaRow(row);
    this.memoryStore.set(item.id, item);
    return item;
  }

  static findBySourceId(sourceId: string, tenantId?: string): RevenueTransaction | null {
    if (!sourceId || !sourceId.trim()) return null;
    this.ensureInitialized();
    const all = this.getAll(tenantId);
    return all.find((r) => r.sourceId === sourceId.trim()) || null;
  }

  static async findBySourceIdAsync(sourceId: string, tenantId?: string, client?: PrismaClient | Prisma.TransactionClient): Promise<RevenueTransaction | null> {
    if (!sourceId || !sourceId.trim()) return null;
    const db = client || defaultPrisma;
    const row = await db.revenueTransaction.findFirst({
      where: {
        sourceId: sourceId.trim(),
        ...(tenantId ? { tenantId } : {})
      }
    });
    if (!row) return null;
    const item = this.fromPrismaRow(row);
    this.memoryStore.set(item.id, item);
    return item;
  }

  static findByGstTransactionId(gstTransactionId: string, tenantId?: string): RevenueTransaction | null {
    if (!gstTransactionId || !gstTransactionId.trim()) return null;
    this.ensureInitialized();
    const all = this.getAll(tenantId);
    return all.find((r) => r.gstTransactionId === gstTransactionId.trim()) || null;
  }

  static async findByGstTransactionIdAsync(gstTransactionId: string, tenantId?: string, client?: PrismaClient | Prisma.TransactionClient): Promise<RevenueTransaction | null> {
    if (!gstTransactionId || !gstTransactionId.trim()) return null;
    const db = client || defaultPrisma;
    const row = await db.revenueTransaction.findFirst({
      where: {
        gstTransactionId: gstTransactionId.trim(),
        ...(tenantId ? { tenantId } : {})
      }
    });
    if (!row) return null;
    const item = this.fromPrismaRow(row);
    this.memoryStore.set(item.id, item);
    return item;
  }

  static findByJournalId(journalId: string, tenantId?: string): RevenueTransaction | null {
    if (!journalId || !journalId.trim()) return null;
    this.ensureInitialized();
    const all = this.getAll(tenantId);
    return all.find((r) => r.journalId === journalId.trim()) || null;
  }

  static async findByJournalIdAsync(journalId: string, tenantId?: string, client?: PrismaClient | Prisma.TransactionClient): Promise<RevenueTransaction | null> {
    if (!journalId || !journalId.trim()) return null;
    const db = client || defaultPrisma;
    const row = await db.revenueTransaction.findFirst({
      where: {
        journalId: journalId.trim(),
        ...(tenantId ? { tenantId } : {})
      }
    });
    if (!row) return null;
    const item = this.fromPrismaRow(row);
    this.memoryStore.set(item.id, item);
    return item;
  }

  /**
   * Authoritatively persists a RevenueTransaction into PostgreSQL.
   * If a transaction client (`client`) is provided, participates in the caller's transaction boundary.
   */
  static async save(
    transaction: RevenueTransaction,
    client?: PrismaClient | Prisma.TransactionClient
  ): Promise<RevenueTransaction> {
    const db = client || defaultPrisma;

    // Ensure tenant exists in DB
    try {
      await db.tenant.upsert({
        where: { id: transaction.tenantId },
        update: {},
        create: {
          id: transaction.tenantId,
          name: `Tenant ${transaction.tenantId}`,
          tin: `TIN-${transaction.tenantId.replace(/[^A-Za-z0-9]/g, '').slice(-15)}`
        }
      });
    } catch {
      // Ignore if concurrent upsert or already exists
    }

    const txDate = transaction.transactionDate ? new Date(transaction.transactionDate) : new Date();

    const updatePayload: Prisma.RevenueTransactionUpdateInput = {
      tenant: { connect: { id: transaction.tenantId } },
      outletId: transaction.outletId || 'OUTLET-DEFAULT',
      outletName: transaction.outletName || null,
      transactionDate: txDate,
      accountingPeriod: transaction.accountingPeriodId ? { connect: { id: transaction.accountingPeriodId } } : undefined,
      category: transaction.category || 'General Revenue',
      description: transaction.description || 'Revenue Entry',
      amountBasis: transaction.amountBasis || 'GST_INCLUSIVE',
      sector: transaction.sector || 'GENERAL',
      grossAmount: new Prisma.Decimal(transaction.grossAmount.toString()),
      netAmount: new Prisma.Decimal(transaction.netAmount.toString()),
      gstAmount: new Prisma.Decimal(transaction.gstAmount.toString()),
      gstClassification: transaction.gstClassification || 'TAXABLE',
      gstRate: new Prisma.Decimal(transaction.gstRate !== undefined ? String(transaction.gstRate) : '0.0800'),
      gstRatePercentage: new Prisma.Decimal(transaction.gstRatePercentage !== undefined ? String(transaction.gstRatePercentage) : '8.00'),
      gstRuleId: transaction.gstRuleId || null,
      gstRegulatoryVersion: transaction.gstRegulatoryVersion || null,
      paymentMethod: transaction.paymentMethod || 'CASH',
      customerReference: transaction.customerReference || null,
      currency: transaction.currency || 'MVR',
      fxRate: new Prisma.Decimal(transaction.fxRate ? transaction.fxRate.toString() : '1.0000'),
      mvrAmount: new Prisma.Decimal(transaction.mvrAmount ? transaction.mvrAmount.toString() : transaction.grossAmount.toString()),
      status: transaction.status || 'POSTED',
      sourceType: transaction.sourceType || 'MANUAL_ENTRY',
      sourceId: transaction.sourceId || null,
      idempotencyKey: transaction.idempotencyKey || null,
      journal: transaction.journalId ? { connect: { id: transaction.journalId } } : undefined,
      gstTransaction: transaction.gstTransactionId ? { connect: { id: transaction.gstTransactionId } } : undefined,
      auditEventId: transaction.auditEventId || null,
      reversalOf: transaction.reversalOfId ? { connect: { id: transaction.reversalOfId } } : undefined,
      reversalJournalId: transaction.reversalJournalId || null,
      reversedById: transaction.reversedById || null,
      correctionNote: transaction.correctionNote || null,
      reviewNotes: transaction.reviewNotes ? JSON.stringify(transaction.reviewNotes) : null,
      approvedBy: transaction.approvedBy || null,
      approvedAt: transaction.approvedAt ? new Date(transaction.approvedAt) : null,
      updatedAt: new Date()
    };

    const createPayload: Prisma.RevenueTransactionCreateInput = {
      ...this.toPrismaInput(transaction)
    };

    await db.revenueTransaction.upsert({
      where: { id: transaction.id },
      create: createPayload,
      update: updatePayload
    });

    // Update in-memory cache
    this.memoryStore.set(transaction.id, transaction);
    return transaction;
  }

  /**
   * Deletes a revenue transaction from PostgreSQL and memory store.
   */
  static delete(id: string, client?: PrismaClient | Prisma.TransactionClient): boolean {
    const db = client || defaultPrisma;
    db.revenueTransaction.delete({
      where: { id }
    }).catch(() => {});
    const exists = this.memoryStore.has(id);
    if (exists) {
      this.memoryStore.delete(id);
    }
    return exists;
  }

  static async deleteAsync(id: string, client?: PrismaClient | Prisma.TransactionClient): Promise<boolean> {
    const db = client || defaultPrisma;
    try {
      await db.revenueTransaction.delete({
        where: { id }
      });
      this.memoryStore.delete(id);
      return true;
    } catch {
      const exists = this.memoryStore.has(id);
      if (exists) {
        this.memoryStore.delete(id);
      }
      return exists;
    }
  }

  /**
   * Clears transactions from database and memory store.
   */
  static clear(tenantId?: string, client?: PrismaClient | Prisma.TransactionClient): void {
    const db = client || defaultPrisma;
    if (tenantId) {
      db.revenueTransaction.deleteMany({ where: { tenantId } }).catch(() => {});
      for (const [key, val] of this.memoryStore.entries()) {
        if (val.tenantId === tenantId) this.memoryStore.delete(key);
      }
    } else {
      db.revenueTransaction.deleteMany({}).catch(() => {});
      this.memoryStore.clear();
    }
  }

  /**
   * Explicit async database clear.
   */
  static async clearAsync(tenantId?: string, client?: PrismaClient | Prisma.TransactionClient): Promise<void> {
    const db = client || defaultPrisma;
    if (tenantId) {
      await db.revenueTransaction.deleteMany({ where: { tenantId } });
      for (const [key, val] of this.memoryStore.entries()) {
        if (val.tenantId === tenantId) this.memoryStore.delete(key);
      }
    } else {
      await db.revenueTransaction.deleteMany({});
      this.memoryStore.clear();
    }
  }
}
