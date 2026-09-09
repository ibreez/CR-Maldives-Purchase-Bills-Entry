import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { SEEDED_REGULATORY_RULES, MIRA_REGULATORY_VERSIONS } from '../../src/regulatory';

describe('Phase 20 — Database Foundation (PostgreSQL + Prisma)', () => {

  it('Acceptance Criteria 1: Prisma schema exists, is valid, and contains all required models', () => {
    const schemaPath = path.join(process.cwd(), 'src/db/schema.prisma');
    expect(fs.existsSync(schemaPath)).toBe(true);

    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

    const requiredModels = [
      'Tenant',
      'User',
      'Role',
      'Permission',
      'UserTenant',
      'Taxpayer',
      'TaxRegistration',
      'TaxPeriod',
      'Supplier',
      'Customer',
      'Document',
      'DocumentVersion',
      'Invoice',
      'InvoiceLine',
      'Account',
      'AccountingPeriod',
      'Journal',
      'JournalLine',
      'GSTTransaction',
      'GSTPeriod',
      'NWTTransaction',
      'NWTPeriod',
      'FixedAsset',
      'FixedAssetMovement',
      'TaxAdjustment',
      'TaxLoss',
      'TaxLossUtilisation',
      'TaxCalculation',
      'TaxCalculationLine',
      'MIRAReturn',
      'MIRAReturnLine',
      'Reconciliation',
      'Approval',
      'AuditEvent',
      'PeriodLock',
      'RegulatoryRule',
      'RegulatoryVersion'
    ];

    for (const modelName of requiredModels) {
      expect(schemaContent).toContain(`model ${modelName} {`);
    }
  });

  it('Acceptance Criteria 2: Decimal fields are strictly used for monetary amounts', () => {
    const schemaPath = path.join(process.cwd(), 'src/db/schema.prisma');
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

    // Verify key monetary models use Decimal @db.Decimal(18, 4)
    expect(schemaContent).toMatch(/taxableAmount\s+Decimal\s+@db\.Decimal\(18, 4\)/);
    expect(schemaContent).toMatch(/gstAmount\s+Decimal\s+@db\.Decimal\(18, 4\)/);
    expect(schemaContent).toMatch(/totalAmount\s+Decimal\s+@db\.Decimal\(18, 4\)/);
    expect(schemaContent).toMatch(/totalDebit\s+Decimal\s+@db\.Decimal\(18, 4\)/);
    expect(schemaContent).toMatch(/totalCredit\s+Decimal\s+@db\.Decimal\(18, 4\)/);
    expect(schemaContent).toMatch(/debit\s+Decimal\s+@db\.Decimal\(18, 4\)/);
    expect(schemaContent).toMatch(/credit\s+Decimal\s+@db\.Decimal\(18, 4\)/);
    expect(schemaContent).toMatch(/costPrice\s+Decimal\s+@db\.Decimal\(18, 4\)/);
    expect(schemaContent).toMatch(/taxableIncome\s+Decimal\s+@db\.Decimal\(18, 4\)/);
    expect(schemaContent).toMatch(/discrepancyAmount\s+Decimal\s+@db\.Decimal\(18, 4\)/);

    // Verify Prisma exports Decimal class
    const sampleDecimal = new Prisma.Decimal('1234.5678');
    expect(sampleDecimal.toString()).toBe('1234.5678');
    expect(sampleDecimal.plus('10.00').toString()).toBe('1244.5678');
  });

  it('Acceptance Criteria 3: Tenant isolation is represented at schema level across business records', () => {
    const schemaPath = path.join(process.cwd(), 'src/db/schema.prisma');
    const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

    const businessModelsRequiringTenantIsolation = [
      'User',
      'Taxpayer',
      'Supplier',
      'Customer',
      'Document',
      'Invoice',
      'Account',
      'AccountingPeriod',
      'Journal',
      'GSTTransaction',
      'GSTPeriod',
      'NWTTransaction',
      'NWTPeriod',
      'FixedAsset',
      'TaxAdjustment',
      'TaxLoss',
      'TaxCalculation',
      'MIRAReturn',
      'Reconciliation',
      'Approval',
      'AuditEvent',
      'PeriodLock'
    ];

    for (const modelName of businessModelsRequiringTenantIsolation) {
      // Find model block in schema
      const modelRegex = new RegExp(`model ${modelName} {([^}]+)}`, 's');
      const match = schemaContent.match(modelRegex);
      expect(match, `Model ${modelName} should exist`).not.toBeNull();
      if (match) {
        const body = match[1];
        expect(body, `Model ${modelName} must include tenantId`).toContain('tenantId');
        expect(body, `Model ${modelName} must include Tenant relation`).toContain('Tenant');
      }
    }
  });

  it('Acceptance Criteria 4: Database migration files exist and contain full relational SQL DDL', () => {
    const migrationPath = path.join(process.cwd(), 'prisma/migrations/20260813000000_init_phase20_schema/migration.sql');
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sqlContent = fs.readFileSync(migrationPath, 'utf-8');

    // Foreign keys check
    expect(sqlContent).toContain('ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey"');
    expect(sqlContent).toContain('ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalId_fkey"');
    expect(sqlContent).toContain('ALTER TABLE "GSTTransaction" ADD CONSTRAINT "GSTTransaction_tenantId_fkey"');

    // Decimal data types check in Postgres DDL
    expect(sqlContent).toContain('DECIMAL(18,4)');
    expect(sqlContent).toContain('DECIMAL(5,4)');
  });

  it('Acceptance Criteria 5: Database seed payload matches regulatory rules and versions dataset', () => {
    expect(SEEDED_REGULATORY_RULES.length).toBeGreaterThanOrEqual(8);
    expect(Object.keys(MIRA_REGULATORY_VERSIONS).length).toBeGreaterThanOrEqual(4);

    const seedScriptPath = path.join(process.cwd(), 'src/db/seed.ts');
    expect(fs.existsSync(seedScriptPath)).toBe(true);

    const seedContent = fs.readFileSync(seedScriptPath, 'utf-8');
    expect(seedContent).toContain('seedRegulatoryDatabase');
    expect(seedContent).toContain('SEEDED_REGULATORY_RULES');
    expect(seedContent).toContain('MIRA_REGULATORY_VERSIONS');
  });

});
