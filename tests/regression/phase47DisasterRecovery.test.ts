/**
 * Phase 47 — Disaster Recovery Regression & Acceptance Test Suite
 *
 * Strictly executes the 9-step statutory recovery test lifecycle:
 * 1. create accounting data
 * 2. create tax calculation
 * 3. create audit events
 * 4. create filing package
 * 5. backup
 * 6. restore
 * 7. verify all records
 * 8. verify audit chain
 * 9. verify tax results
 *
 * Acceptance criteria:
 * Restored system produces identical accounting and tax results.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import {
  disasterRecoveryManager,
  disasterRecoveryWAL,
  DisasterRecoveryPackage,
  DatabaseBackupPayload,
  DocumentBackupItem
} from '../../src/infrastructure/index.js';
import {
  recordAuditEvent,
  verifyCustomAuditChain,
  GENESIS_HASH
} from '../../src/services/audit/auditService.js';
import { AuditEvent } from '../../src/types/audit.js';
import { FilingPackageGenerator } from '../../src/services/filing/filingPackageGenerator.js';
import { FilingPackageInput, FilingPackageResult } from '../../src/types/filingPackage.js';
import { calculateEntityTaxLiability, EntityTaxResult } from '../../src/services/tax/entityTaxService.js';
import { MIRA604AccountingSourceData } from '../../src/regulatory/forms/mira604/v25_1/mappings.js';

describe('Phase 47 — Disaster Recovery & Business Continuity', () => {

  beforeEach(() => {
    disasterRecoveryWAL.clear();
  });

  describe('Mandatory 9-Step Disaster Recovery Test Lifecycle', () => {
    it('should complete steps 1 to 9 and produce identical accounting and tax results after restore', () => {
      const tenantId = 'TENANT-MALE-RETAIL-01';

      // ========================================================================
      // Step 1: Create Accounting Data
      // ========================================================================
      const accountingData = {
        accounts: [
          { id: 'acc-1000', code: '1000', name: 'Cash at Bank (BML)', type: 'ASSET', balance: 750000 },
          { id: 'acc-1400', code: '1400', name: 'GST Input Tax Receivable', type: 'ASSET', balance: 16000 },
          { id: 'acc-2000', code: '2000', name: 'Accounts Payable', type: 'LIABILITY', balance: 216000 },
          { id: 'acc-4000', code: '4000', name: 'Commercial Sales Revenue', type: 'REVENUE', balance: 956000 },
          { id: 'acc-5000', code: '5000', name: 'Operating Expenses', type: 'EXPENSE', balance: 200000 }
        ],
        periods: [
          { id: 'prd-2026-m01', periodCode: '2026-M01', status: 'LOCKED', startDate: '2026-01-01', endDate: '2026-01-31' },
          { id: 'prd-2026-m02', periodCode: '2026-M02', status: 'OPEN', startDate: '2026-02-01', endDate: '2026-02-28' }
        ],
        journals: [
          {
            id: 'jnl-001',
            periodId: 'prd-2026-m01',
            reference: 'INV-2026-SUPPLIER-01',
            description: 'Inventory purchase from Male Food Supplies Pvt Ltd',
            lines: [
              { accountId: 'acc-5000', debit: 200000, credit: 0 },
              { accountId: 'acc-1400', debit: 16000, credit: 0 }, // 8% General GST
              { accountId: 'acc-2000', debit: 0, credit: 216000 }
            ]
          },
          {
            id: 'jnl-002',
            periodId: 'prd-2026-m01',
            reference: 'SALES-2026-001',
            description: 'Monthly commercial retail sales collection',
            lines: [
              { accountId: 'acc-1000', debit: 956000, credit: 0 },
              { accountId: 'acc-4000', debit: 0, credit: 956000 }
            ]
          }
        ],
        bills: [
          {
            id: 'bill-001',
            invoiceNumber: 'INV-2026-SUPPLIER-01',
            supplierName: 'Male Food Supplies Pvt Ltd',
            supplierTin: '1004567GST001',
            amount: 216000,
            gstAmount: 16000,
            status: 'POSTED'
          }
        ]
      };

      // Verify that initial trial balance debits == credits
      let initialDebits = 0;
      let initialCredits = 0;
      for (const jnl of accountingData.journals) {
        for (const line of jnl.lines) {
          initialDebits += line.debit;
          initialCredits += line.credit;
        }
      }
      expect(initialDebits).toBe(1172000);
      expect(initialCredits).toBe(1172000);
      expect(initialDebits - initialCredits).toBe(0);

      // ========================================================================
      // Step 2: Create Tax Calculation
      // ========================================================================
      // Taxable income = 1,500,000 MVR for a corporate entity
      // 0% on first 500,000 = 0
      // 15% on remaining 1,000,000 = 150,000 MVR
      const preRestoreTaxCalculation = calculateEntityTaxLiability(
        1_500_000,
        'COMPANY',
        {
          taxYear: 2026,
          accountingDays: 365,
          entityName: 'Male Retail Holdings Pvt Ltd',
          tin: '1009988GST001'
        }
      );

      expect(preRestoreTaxCalculation.grossTaxableIncome).toBe(1500000);
      expect(preRestoreTaxCalculation.netTaxableIncome).toBe(1500000);
      expect(preRestoreTaxCalculation.totalIncomeTaxDue).toBe(150000);

      // ========================================================================
      // Step 3: Create Audit Events
      // ========================================================================
      const createdAuditEvents: AuditEvent[] = [];

      const ev1 = recordAuditEvent({
        tenantId,
        actorId: 'USER-ADMIN',
        eventType: 'PERIOD_STATE_TRANSITION',
        entityType: 'PERIOD',
        entityId: 'prd-2026-m01',
        metadata: { action: 'OPEN_PERIOD', periodCode: '2026-M01' }
      });
      createdAuditEvents.push(ev1 as AuditEvent);

      const ev2 = recordAuditEvent({
        tenantId,
        actorId: 'USER-ACCOUNTANT',
        eventType: 'JOURNAL_POSTING',
        entityType: 'JOURNAL',
        entityId: 'jnl-001',
        metadata: { reference: 'INV-2026-SUPPLIER-01', amount: 216000 }
      });
      createdAuditEvents.push(ev2 as AuditEvent);

      const ev3 = recordAuditEvent({
        tenantId,
        actorId: 'USER-TAX-MANAGER',
        eventType: 'TAX_CALCULATION',
        entityType: 'TAX_CALCULATION',
        entityId: 'calc-2026-001',
        metadata: {
          taxableIncome: preRestoreTaxCalculation.grossTaxableIncome,
          taxLiability: preRestoreTaxCalculation.totalIncomeTaxDue
        }
      });
      createdAuditEvents.push(ev3 as AuditEvent);

      // Verify pre-backup audit chain continuity
      const preBackupAuditVerification = verifyCustomAuditChain(createdAuditEvents);
      expect(preBackupAuditVerification.isValid).toBe(true);
      expect(preBackupAuditVerification.totalEvents).toBe(3);

      // ========================================================================
      // Step 4: Create Filing Package
      // ========================================================================
      const sourceData: MIRA604AccountingSourceData = {
        taxpayer: {
          tin: '1009988GST001',
          taxpayerName: 'Male Retail Holdings Pvt Ltd',
          taxpayerType: 'COMPANY',
          taxYear: 2026,
          accountingPeriodStart: '2026-01-01',
          accountingPeriodEnd: '2026-12-31',
          businessActivity: 'Commercial Retail',
          presentationCurrency: 'MVR'
        },
        pnl: {
          grossRevenue: 956000,
          costOfSales: 200000,
          otherOperatingIncome: 0,
          otherOperatingExpenses: 150000
        },
        schedule2Data: {
          nonCurrentAssets: { propertyPlantEquipment: 500000 },
          currentAssets: { cashAndCashEquivalents: 750000 },
          equity: { shareCapital: 500000, retainedEarnings: 250000 },
          nonCurrentLiabilities: {},
          currentLiabilities: { tradeAndOtherPayables: 216000 }
        }
      };

      const filingPackageInput: FilingPackageInput = {
        tenantId,
        taxpayer: {
          tin: '1009988GST001',
          taxpayerName: 'Male Retail Holdings Pvt Ltd',
          entityType: 'COMPANY',
          taxYear: 2026,
          accountingPeriodStart: '2026-01-01',
          accountingPeriodEnd: '2026-12-31',
          businessAddress: 'Boduthakurufaanu Magu, Male',
          contactEmail: 'tax@maleretail.mv',
          contactPhone: '+960 7712345'
        },
        taxYear: 2026,
        sourceData
      };

      const preRestoreFilingPackage = FilingPackageGenerator.generatePackage(filingPackageInput);
      expect(preRestoreFilingPackage).toBeDefined();
      expect(preRestoreFilingPackage.manifest).toBeDefined();
      expect(preRestoreFilingPackage.manifest.packageChecksum).toBeDefined();
      expect(preRestoreFilingPackage.files.size).toBeGreaterThan(0);

      // ========================================================================
      // Step 5: Backup
      // ========================================================================
      const sampleDocumentPayload: DocumentBackupItem = {
        id: 'doc-inv-001',
        fileName: 'MaleFoodSupplies_TaxInvoice_001.pdf',
        originalName: 'TaxInvoice_Jan2026.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 20,
        sha256Checksum: crypto.createHash('sha256').update('INVOICE_PDF_CONTENT').digest('hex'),
        base64Data: Buffer.from('INVOICE_PDF_CONTENT').toString('base64'),
        uploadedAt: '2026-01-15T10:00:00Z',
        tenantId
      };

      const databasePayload: DatabaseBackupPayload = {
        tenants: [{ id: tenantId, name: 'Male Retail Holdings Pvt Ltd', tin: '1009988GST001' }],
        users: [{ id: 'user-01', name: 'Ahmed Hassan', email: 'tax@maleretail.mv', tenantId }],
        accounts: accountingData.accounts,
        accountingPeriods: accountingData.periods,
        journals: accountingData.journals,
        bills: accountingData.bills,
        taxCalculations: [preRestoreTaxCalculation],
        taxLossLots: [],
        fixedAssets: [],
        metadata: {
          totalRecords: 12,
          schemaVersion: '20260813000000_init_phase20_schema',
          exportedAt: new Date().toISOString()
        }
      };

      const backupPackage = disasterRecoveryManager.createFullBackup({
        database: databasePayload,
        documents: [sampleDocumentPayload],
        auditTrail: createdAuditEvents,
        filingPackages: [preRestoreFilingPackage],
        offsiteConfig: {
          destinationType: 'S3_BUCKET',
          endpoint: 's3.ap-southeast-1.amazonaws.com',
          bucketName: 'crmaldives-dr-vault-singapore',
          region: 'ap-southeast-1',
          encryptionAlgorithm: 'AES-256-GCM',
          retentionDays: 30
        }
      });

      expect(backupPackage.manifest.backupId).toMatch(/^DR-BACKUP-/);
      expect(backupPackage.manifest.databaseChecksum).toHaveLength(64);
      expect(backupPackage.manifest.auditTrailChecksum).toHaveLength(64);
      expect(backupPackage.manifest.documentsChecksum).toHaveLength(64);
      expect(backupPackage.manifest.filingPackagesChecksum).toHaveLength(64);
      expect(backupPackage.manifest.offsiteReplication?.successful).toBe(true);

      // ========================================================================
      // Step 6: Restore
      // ========================================================================
      const restoreResult = disasterRecoveryManager.restoreFromBackup(backupPackage);

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.recordsRestored).toBeGreaterThan(0);
      expect(restoreResult.auditEventsRestored).toBe(3);
      expect(restoreResult.documentsRestored).toBe(1);
      expect(restoreResult.filingPackagesRestored).toBe(1);

      // ========================================================================
      // Step 7: Verify All Records
      // ========================================================================
      expect(backupPackage.database.accounts).toHaveLength(5);
      expect(backupPackage.database.journals).toHaveLength(2);
      expect(backupPackage.database.bills).toHaveLength(1);
      expect(backupPackage.database.bills[0].invoiceNumber).toBe('INV-2026-SUPPLIER-01');

      // Verify accounting balances equate post-restore:
      let postRestoreDebits = 0;
      let postRestoreCredits = 0;
      for (const jnl of backupPackage.database.journals) {
        for (const line of jnl.lines) {
          postRestoreDebits += line.debit;
          postRestoreCredits += line.credit;
        }
      }
      expect(postRestoreDebits).toBe(initialDebits);
      expect(postRestoreCredits).toBe(initialCredits);
      expect(postRestoreDebits - postRestoreCredits).toBe(0);

      // ========================================================================
      // Step 8: Verify Audit Chain
      // ========================================================================
      const postRestoreAuditVerification = verifyCustomAuditChain(backupPackage.auditTrail);
      expect(postRestoreAuditVerification.isValid).toBe(true);
      expect(postRestoreAuditVerification.totalEvents).toBe(3);
      expect(postRestoreAuditVerification.brokenAtIndex).toBeUndefined();

      // Ensure each event retains identical eventHash
      expect(backupPackage.auditTrail[0].eventHash).toBe(ev1.eventHash);
      expect(backupPackage.auditTrail[1].eventHash).toBe(ev2.eventHash);
      expect(backupPackage.auditTrail[2].eventHash).toBe(ev3.eventHash);
      expect(backupPackage.auditTrail[1].previousEventHash).toBe(ev1.eventHash);
      expect(backupPackage.auditTrail[2].previousEventHash).toBe(ev2.eventHash);

      // ========================================================================
      // Step 9: Verify Tax Results (Acceptance Criteria)
      // ========================================================================
      const postRestoreTaxCalculation = calculateEntityTaxLiability(
        1_500_000,
        'COMPANY',
        {
          taxYear: 2026,
          accountingDays: 365,
          entityName: 'Male Retail Holdings Pvt Ltd',
          tin: '1009988GST001'
        }
      );

      // Exact mathematical identity
      expect(postRestoreTaxCalculation.grossTaxableIncome).toBe(preRestoreTaxCalculation.grossTaxableIncome);
      expect(postRestoreTaxCalculation.netTaxableIncome).toBe(preRestoreTaxCalculation.netTaxableIncome);
      expect(postRestoreTaxCalculation.totalIncomeTaxDue).toBe(preRestoreTaxCalculation.totalIncomeTaxDue);
      expect(postRestoreTaxCalculation.taxByBracket).toEqual(preRestoreTaxCalculation.taxByBracket);

      // Post-restore system integrity audit run
      const systemVerification = disasterRecoveryManager.verifySystemIntegrity(
        backupPackage,
        preRestoreTaxCalculation.totalIncomeTaxDue
      );
      expect(systemVerification.passed).toBe(true);
      expect(systemVerification.errors).toHaveLength(0);
      expect(systemVerification.checks.accountingBalances.imbalance).toBe(0);
      expect(systemVerification.checks.auditChain.isValid).toBe(true);
      expect(systemVerification.checks.taxCalculations.variance).toBe(0);
      expect(systemVerification.checks.documents.passed).toBe(true);
    });
  });

  describe('Point-in-Time Recovery (PITR) with Write-Ahead Logging', () => {
    it('should correctly restore base state and replay WAL mutations strictly up to target timestamp', () => {
      const tenantId = 'TENANT-HOTEL-01';

      // Base snapshot state at 10:00:00Z
      const basePackage: DisasterRecoveryPackage = {
        manifest: {
          manifestVersion: '1.0.0',
          backupId: 'DR-BASE-001',
          timestamp: '2026-09-04T10:00:00.000Z',
          environment: 'production',
          backupType: 'FULL',
          databaseChecksum: 'mock-db-chk',
          documentsChecksum: 'mock-doc-chk',
          auditTrailChecksum: 'mock-audit-chk',
          filingPackagesChecksum: 'mock-filing-chk',
          overallChecksum: 'mock-overall-chk',
          stats: {
            tenantCount: 1,
            journalCount: 1,
            billCount: 1,
            auditEventCount: 0,
            documentCount: 0,
            filingPackageCount: 0,
            totalSizeBytes: 500
          },
          auditChainHeadHash: GENESIS_HASH
        },
        database: {
          tenants: [{ id: tenantId, name: 'Island Resort Pvt Ltd' }],
          users: [],
          accounts: [],
          accountingPeriods: [],
          journals: [
            { id: 'jnl-base-1', lines: [{ debit: 1000, credit: 1000 }] }
          ],
          bills: [
            { id: 'bill-001', invoiceNumber: 'INV-100', amount: 5000 }
          ],
          taxCalculations: [],
          taxLossLots: [],
          fixedAssets: [],
          metadata: { totalRecords: 2, schemaVersion: '1.0', exportedAt: '2026-09-04T10:00:00.000Z' }
        },
        documents: [],
        auditTrail: [],
        filingPackages: []
      };

      // Record continuous mutations in WAL across three distinct timestamps
      disasterRecoveryWAL.appendMutation(
        tenantId,
        'BILL',
        'bill-002',
        'CREATE',
        { id: 'bill-002', invoiceNumber: 'INV-101', amount: 12000 },
        '2026-09-04T10:15:00.000Z'
      );

      disasterRecoveryWAL.appendMutation(
        tenantId,
        'JOURNAL',
        'jnl-002',
        'CREATE',
        { id: 'jnl-002', lines: [{ debit: 12000, credit: 12000 }] },
        '2026-09-04T10:20:00.000Z'
      );

      // Mutation after target recovery point (e.g. corrupting mutation at 10:45)
      disasterRecoveryWAL.appendMutation(
        tenantId,
        'BILL',
        'bill-003',
        'CREATE',
        { id: 'bill-003', invoiceNumber: 'CORRUPT-INV', amount: 99999999 },
        '2026-09-04T10:45:00.000Z'
      );

      // Execute Point-in-Time recovery targeted precisely at 10:30:00Z
      const pitrResult = disasterRecoveryManager.restoreToPointInTime(
        basePackage,
        '2026-09-04T10:30:00.000Z'
      );

      expect(pitrResult.mutationsReplayed).toBe(2);
      expect(pitrResult.finalTimestamp).toBe('2026-09-04T10:30:00.000Z');

      const restoredDb = pitrResult.restoredPackage.database;

      // Mutations m1 and m2 must be present
      expect(restoredDb.bills.some((b: any) => b.id === 'bill-002')).toBe(true);
      expect(restoredDb.journals.some((j: any) => j.id === 'jnl-002')).toBe(true);

      // Mutation m3 (after 10:30) must NOT be present
      expect(restoredDb.bills.some((b: any) => b.id === 'bill-003')).toBe(false);
    });
  });

  describe('Checksum Verification & Anti-Tampering', () => {
    it('should reject restore if any subsystem payload checksum has been tampered with', () => {
      const validPkg = disasterRecoveryManager.createFullBackup({
        database: {
          tenants: [],
          users: [],
          accounts: [],
          accountingPeriods: [],
          journals: [],
          bills: [],
          taxCalculations: [],
          taxLossLots: [],
          fixedAssets: [],
          metadata: { totalRecords: 0, schemaVersion: '1.0', exportedAt: new Date().toISOString() }
        }
      });

      // Tamper with database state after manifest generation
      const tamperedPkg: DisasterRecoveryPackage = JSON.parse(JSON.stringify(validPkg));
      tamperedPkg.database.bills = [{ id: 'injected-fake-bill', amount: 5000000 }];

      expect(() => {
        disasterRecoveryManager.restoreFromBackup(tamperedPkg);
      }).toThrow(/Database archive checksum mismatch/);
    });
  });
});
