/**
 * Migration Script: data/revenue.json -> PostgreSQL RevenueTransaction
 *
 * Safely and idempotently imports historical revenue records from data/revenue.json
 * into the PostgreSQL RevenueTransaction table.
 */

import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from './client.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const REVENUE_FILE = path.join(DATA_DIR, 'revenue.json');

export interface RevenueMigrationResult {
  totalInJson: number;
  migratedCount: number;
  skippedCount: number;
  failedCount: number;
  errors: string[];
}

export async function migrateRevenueJsonToPostgres(): Promise<RevenueMigrationResult> {
  const result: RevenueMigrationResult = {
    totalInJson: 0,
    migratedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    errors: []
  };

  if (!fs.existsSync(REVENUE_FILE)) {
    return result;
  }

  try {
    const rawData = fs.readFileSync(REVENUE_FILE, 'utf-8');
    const records = JSON.parse(rawData);

    if (!Array.isArray(records) || records.length === 0) {
      return result;
    }

    result.totalInJson = records.length;

    for (const r of records) {
      try {
        if (!r.id || !r.tenantId) {
          result.skippedCount++;
          result.errors.push(`Record missing ID or tenantId: ${JSON.stringify(r)}`);
          continue;
        }

        // Ensure tenant exists in DB to prevent foreign key violation
        const tenantExists = await prisma.tenant.findUnique({
          where: { id: r.tenantId }
        });

        if (!tenantExists) {
          await prisma.tenant.create({
            data: {
              id: r.tenantId,
              name: `Tenant ${r.tenantId}`,
              tin: `TIN-${r.tenantId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 16)}`
            }
          });
        }

        // Check if journalId or gstTransactionId exist in DB before linking
        let validJournalId: string | null = null;
        if (r.journalId) {
          const j = await prisma.journal.findUnique({ where: { id: r.journalId } });
          if (j) validJournalId = r.journalId;
        }

        let validGstTxId: string | null = null;
        if (r.gstTransactionId) {
          const g = await prisma.gSTTransaction.findUnique({ where: { id: r.gstTransactionId } });
          if (g) validGstTxId = r.gstTransactionId;
        }

        const txDate = r.transactionDate ? new Date(r.transactionDate) : new Date();

        await prisma.revenueTransaction.upsert({
          where: { id: r.id },
          create: {
            id: r.id,
            tenantId: r.tenantId,
            outletId: r.outletId || 'OUTLET-DEFAULT',
            outletName: r.outletName || null,
            transactionDate: txDate,
            accountingPeriodId: r.accountingPeriodId || null,
            category: r.category || 'General Revenue',
            description: r.description || 'Imported Revenue Entry',
            amountBasis: r.amountBasis || 'GST_INCLUSIVE',
            sector: r.sector || 'GENERAL',
            grossAmount: new Prisma.Decimal(r.grossAmount ? r.grossAmount.toString() : '0'),
            netAmount: new Prisma.Decimal(r.netAmount ? r.netAmount.toString() : '0'),
            gstAmount: new Prisma.Decimal(r.gstAmount ? r.gstAmount.toString() : '0'),
            gstClassification: r.gstClassification || 'TAXABLE',
            gstRate: new Prisma.Decimal(r.gstRate !== undefined ? String(r.gstRate) : '0.0800'),
            gstRatePercentage: new Prisma.Decimal(r.gstRatePercentage !== undefined ? String(r.gstRatePercentage) : '8.00'),
            gstRuleId: r.gstRuleId || null,
            gstRegulatoryVersion: r.gstRegulatoryVersion || null,
            paymentMethod: r.paymentMethod || 'CASH',
            customerReference: r.customerReference || null,
            currency: r.currency || 'MVR',
            fxRate: new Prisma.Decimal(r.fxRate ? r.fxRate.toString() : '1.0000'),
            mvrAmount: new Prisma.Decimal(r.mvrAmount ? r.mvrAmount.toString() : (r.grossAmount ? r.grossAmount.toString() : '0')),
            status: r.status || 'POSTED',
            sourceType: r.sourceType || 'MANUAL_ENTRY',
            sourceId: r.sourceId || null,
            idempotencyKey: r.idempotencyKey || null,
            journalId: validJournalId,
            gstTransactionId: validGstTxId,
            auditEventId: r.auditEventId || null,
            reversalOfId: r.reversalOfId || null,
            reversalJournalId: r.reversalJournalId || null,
            reversedById: r.reversedById || null,
            correctionNote: r.correctionNote || null,
            reviewNotes: r.reviewNotes ? JSON.stringify(r.reviewNotes) : null,
            approvedBy: r.approvedBy || null,
            approvedAt: r.approvedAt ? new Date(r.approvedAt) : null,
            createdBy: r.createdBy || 'SYSTEM',
            createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
            updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date()
          },
          update: {
            tenantId: r.tenantId,
            outletId: r.outletId || 'OUTLET-DEFAULT',
            outletName: r.outletName || null,
            transactionDate: txDate,
            accountingPeriodId: r.accountingPeriodId || null,
            category: r.category || 'General Revenue',
            description: r.description || 'Imported Revenue Entry',
            amountBasis: r.amountBasis || 'GST_INCLUSIVE',
            sector: r.sector || 'GENERAL',
            grossAmount: new Prisma.Decimal(r.grossAmount ? r.grossAmount.toString() : '0'),
            netAmount: new Prisma.Decimal(r.netAmount ? r.netAmount.toString() : '0'),
            gstAmount: new Prisma.Decimal(r.gstAmount ? r.gstAmount.toString() : '0'),
            gstClassification: r.gstClassification || 'TAXABLE',
            gstRate: new Prisma.Decimal(r.gstRate !== undefined ? String(r.gstRate) : '0.0800'),
            gstRatePercentage: new Prisma.Decimal(r.gstRatePercentage !== undefined ? String(r.gstRatePercentage) : '8.00'),
            gstRuleId: r.gstRuleId || null,
            gstRegulatoryVersion: r.gstRegulatoryVersion || null,
            paymentMethod: r.paymentMethod || 'CASH',
            customerReference: r.customerReference || null,
            currency: r.currency || 'MVR',
            fxRate: new Prisma.Decimal(r.fxRate ? r.fxRate.toString() : '1.0000'),
            mvrAmount: new Prisma.Decimal(r.mvrAmount ? r.mvrAmount.toString() : (r.grossAmount ? r.grossAmount.toString() : '0')),
            status: r.status || 'POSTED',
            sourceType: r.sourceType || 'MANUAL_ENTRY',
            sourceId: r.sourceId || null,
            idempotencyKey: r.idempotencyKey || null,
            journalId: validJournalId,
            gstTransactionId: validGstTxId,
            auditEventId: r.auditEventId || null,
            reversalOfId: r.reversalOfId || null,
            reversalJournalId: r.reversalJournalId || null,
            reversedById: r.reversedById || null,
            correctionNote: r.correctionNote || null,
            reviewNotes: r.reviewNotes ? JSON.stringify(r.reviewNotes) : null,
            approvedBy: r.approvedBy || null,
            approvedAt: r.approvedAt ? new Date(r.approvedAt) : null,
            updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date()
          }
        });

        result.migratedCount++;
      } catch (err: any) {
        result.failedCount++;
        result.errors.push(`Failed to migrate ${r.id}: ${err.message}`);
      }
    }

    // Create a safety backup
    fs.copyFileSync(REVENUE_FILE, path.join(DATA_DIR, 'revenue.json.migrated.bak'));

  } catch (err: any) {
    result.errors.push(`Error reading ${REVENUE_FILE}: ${err.message}`);
  }

  return result;
}

// Allow CLI execution: npx tsx src/db/migrateRevenueJsonToPostgres.ts
if (process.argv[1]?.endsWith('migrateRevenueJsonToPostgres.ts')) {
  migrateRevenueJsonToPostgres().then((res) => {
    console.log('Revenue JSON to Postgres Migration Result:', res);
    process.exit(res.failedCount > 0 ? 1 : 0);
  });
}
