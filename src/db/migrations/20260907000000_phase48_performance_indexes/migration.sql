-- Phase 48: High-Volume Performance Composite Indexes
-- Verified against PostgreSQL 15/16 and Prisma Schema

-- 1. Journal Composite Indexes
CREATE INDEX IF NOT EXISTS "Journal_tenantId_status_entryDate_idx" ON "Journal"("tenantId", "status", "entryDate");
CREATE INDEX IF NOT EXISTS "Journal_tenantId_reference_idx" ON "Journal"("tenantId", "reference");

-- 2. JournalLine Composite Indexes
CREATE INDEX IF NOT EXISTS "JournalLine_journalId_accountCode_idx" ON "JournalLine"("journalId", "accountCode");

-- 3. Invoice Composite Indexes
CREATE INDEX IF NOT EXISTS "Invoice_tenantId_invoiceDate_idx" ON "Invoice"("tenantId", "invoiceDate");
CREATE INDEX IF NOT EXISTS "Invoice_tenantId_status_idx" ON "Invoice"("tenantId", "status");

-- 4. InvoiceLine Composite Indexes
CREATE INDEX IF NOT EXISTS "InvoiceLine_invoiceId_lineNumber_idx" ON "InvoiceLine"("invoiceId", "lineNumber");

-- 5. GSTTransaction Composite Indexes
CREATE INDEX IF NOT EXISTS "GSTTransaction_tenantId_sector_transactionDate_idx" ON "GSTTransaction"("tenantId", "sector", "transactionDate");

-- 6. NWTTransaction Composite Indexes
CREATE INDEX IF NOT EXISTS "NWTTransaction_tenantId_transactionDate_idx" ON "NWTTransaction"("tenantId", "transactionDate");
