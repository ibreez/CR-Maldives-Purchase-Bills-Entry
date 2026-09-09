-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('SUPER_ADMIN', 'TENANT_ADMIN', 'TAX_MANAGER', 'STAFF_ACCOUNTANT', 'OUTLET_USER', 'AUDITOR');

-- CreateEnum
CREATE TYPE "ReturnType" AS ENUM ('MIRA604', 'MIRA105', 'MIRA302');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'READY_FOR_FILING', 'SUBMITTED', 'PROCESSING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleId" TEXT,
    "tenantId" TEXT NOT NULL,
    "assignedEntities" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTenant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Taxpayer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tin" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "taxpayerType" TEXT NOT NULL,
    "sector" TEXT NOT NULL DEFAULT 'GENERAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Taxpayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRegistration" (
    "id" TEXT NOT NULL,
    "taxpayerId" TEXT NOT NULL,
    "taxType" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxPeriod" (
    "id" TEXT NOT NULL,
    "taxpayerId" TEXT NOT NULL,
    "taxType" TEXT NOT NULL,
    "periodName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tin" TEXT,
    "isRegisteredGst" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT NOT NULL DEFAULT 'MV',
    "isNonResident" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tin" TEXT,
    "isRegisteredGst" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT NOT NULL DEFAULT 'MV',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taxpayerId" TEXT,
    "supplierId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "ocrStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "extractedData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "changeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taxpayerId" TEXT,
    "documentId" TEXT,
    "supplierId" TEXT,
    "customerId" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "invoiceType" TEXT NOT NULL,
    "taxableAmount" DECIMAL(18,4) NOT NULL,
    "gstAmount" DECIMAL(18,4) NOT NULL,
    "totalAmount" DECIMAL(18,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "taxableAmount" DECIMAL(18,4) NOT NULL,
    "gstRate" DECIMAL(5,4) NOT NULL,
    "gstAmount" DECIMAL(18,4) NOT NULL,
    "totalAmount" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "miraCategory" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "periodName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Journal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountingPeriodId" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "totalDebit" DECIMAL(18,4) NOT NULL,
    "totalCredit" DECIMAL(18,4) NOT NULL,
    "isBalanced" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "accountId" TEXT,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "debit" DECIMAL(18,4) NOT NULL,
    "credit" DECIMAL(18,4) NOT NULL,
    "description" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GSTTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "gstPeriodId" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "sector" TEXT NOT NULL,
    "taxableAmount" DECIMAL(18,4) NOT NULL,
    "gstRate" DECIMAL(5,4) NOT NULL,
    "gstAmount" DECIMAL(18,4) NOT NULL,
    "isInputTaxClaimable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GSTTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GSTPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taxPeriodId" TEXT,
    "periodName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalOutputTax" DECIMAL(18,4) NOT NULL,
    "totalInputTax" DECIMAL(18,4) NOT NULL,
    "netGstPayable" DECIMAL(18,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GSTPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NWTTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nwtPeriodId" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "payeeName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "grossAmount" DECIMAL(18,4) NOT NULL,
    "nwtRate" DECIMAL(5,4) NOT NULL,
    "nwtAmount" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NWTTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NWTPeriod" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taxPeriodId" TEXT,
    "periodName" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalGross" DECIMAL(18,4) NOT NULL,
    "totalNwtWithheld" DECIMAL(18,4) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NWTPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "acquisitionDate" TIMESTAMP(3) NOT NULL,
    "costPrice" DECIMAL(18,4) NOT NULL,
    "salvageValue" DECIMAL(18,4),
    "capitalAllowanceRate" DECIMAL(5,4) NOT NULL,
    "openingWDV" DECIMAL(18,4) NOT NULL,
    "closingWDV" DECIMAL(18,4) NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "isDisposed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAssetMovement" (
    "id" TEXT NOT NULL,
    "fixedAssetId" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "movementDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedAssetMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxAdjustment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "adjustmentCode" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxLoss" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taxYearIncurred" INTEGER NOT NULL,
    "initialLossAmount" DECIMAL(18,4) NOT NULL,
    "remainingLossAmount" DECIMAL(18,4) NOT NULL,
    "expiryTaxYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxLoss_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxLossUtilisation" (
    "id" TEXT NOT NULL,
    "taxLossId" TEXT NOT NULL,
    "taxYearUtilised" INTEGER NOT NULL,
    "utilisedAmount" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxLossUtilisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCalculation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "accountingProfit" DECIMAL(18,4) NOT NULL,
    "totalAdditions" DECIMAL(18,4) NOT NULL,
    "totalDeductions" DECIMAL(18,4) NOT NULL,
    "taxableIncome" DECIMAL(18,4) NOT NULL,
    "taxPayable" DECIMAL(18,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCalculationLine" (
    "id" TEXT NOT NULL,
    "taxCalculationId" TEXT NOT NULL,
    "lineCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "TaxCalculationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MIRAReturn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taxPeriodId" TEXT,
    "formId" TEXT NOT NULL,
    "returnType" "ReturnType" NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "formVersion" TEXT NOT NULL,
    "submissionStatus" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "miraReferenceNumber" TEXT,
    "verificationChecksum" TEXT,
    "payloadJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MIRAReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MIRAReturnLine" (
    "id" TEXT NOT NULL,
    "miraReturnId" TEXT NOT NULL,
    "lineNumber" TEXT NOT NULL,
    "boxCode" TEXT NOT NULL,
    "boxDescription" TEXT NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "MIRAReturnLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reconciliation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reconciliationType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "discrepancyAmount" DECIMAL(18,4) NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "performedBy" TEXT,
    "details" TEXT,
    "previousState" TEXT,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodLock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT true,
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryRule" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "taxType" TEXT NOT NULL,
    "ruleCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT,
    "taxYear" INTEGER,
    "version" TEXT NOT NULL,
    "legalReference" TEXT NOT NULL,
    "sourceURL" TEXT NOT NULL,
    "parametersJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sector" TEXT,
    "taxpayerType" TEXT,
    "jurisdiction" TEXT NOT NULL DEFAULT 'MV',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryVersion" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "versionNumber" TEXT NOT NULL,
    "effectiveTaxYear" INTEGER NOT NULL,
    "releaseDate" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "miraNoticeReference" TEXT,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "transactionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "entityId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "transactionDate" TEXT NOT NULL,
    "supplierOrCustomer" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,4) NOT NULL,
    "gstAmount" DECIMAL(18,4) NOT NULL,
    "totalAmount" DECIMAL(18,4) NOT NULL,
    "accountingCategory" TEXT NOT NULL,
    "miraCategory" TEXT NOT NULL,
    "accountingTreatment" TEXT NOT NULL,
    "incomeTaxTreatment" TEXT NOT NULL,
    "gstTreatment" TEXT NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "accountingPeriodStart" TEXT NOT NULL,
    "accountingPeriodEnd" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("transactionId")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "journalId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "transactionId" TEXT NOT NULL,
    "entryDate" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "totalDebit" DECIMAL(18,4) NOT NULL,
    "totalCredit" DECIMAL(18,4) NOT NULL,
    "isBalanced" BOOLEAN NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("journalId")
);

-- CreateTable
CREATE TABLE "LegacyJournalLine" (
    "lineId" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "debit" DECIMAL(18,4) NOT NULL,
    "credit" DECIMAL(18,4) NOT NULL,
    "description" TEXT,

    CONSTRAINT "LegacyJournalLine_pkey" PRIMARY KEY ("lineId")
);

-- CreateTable
CREATE TABLE "LegacyFixedAsset" (
    "assetId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "entityId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "transactionId" TEXT,
    "documentId" TEXT,
    "assetName" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "acquisitionDate" TEXT NOT NULL,
    "costPrice" DECIMAL(18,4) NOT NULL,
    "salvageValue" DECIMAL(18,4),
    "miraCapitalAllowanceRate" DECIMAL(5,4) NOT NULL,
    "openingWDV" DECIMAL(18,4) NOT NULL,
    "additionsInYear" DECIMAL(18,4) NOT NULL,
    "disposalsInYear" DECIMAL(18,4) NOT NULL,
    "capitalAllowanceClaimed" DECIMAL(18,4) NOT NULL,
    "closingWDV" DECIMAL(18,4) NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "accountingPeriodStart" TEXT NOT NULL,
    "accountingPeriodEnd" TEXT NOT NULL,
    "notes" TEXT,
    "isDisposed" BOOLEAN,
    "disposalDate" TEXT,
    "disposalValue" DECIMAL(18,4),
    "balancingAllowanceOrCharge" DECIMAL(18,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyFixedAsset_pkey" PRIMARY KEY ("assetId")
);

-- CreateTable
CREATE TABLE "TaxReturn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default_tenant',
    "entityId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "returnType" "ReturnType" NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "formVersion" TEXT NOT NULL,
    "submissionStatus" "SubmissionStatus" NOT NULL,
    "miraReferenceNumber" TEXT,
    "acknowledgmentReceiptUrl" TEXT,
    "verificationChecksum" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxReturn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_tin_key" ON "Tenant"("tin");

-- CreateIndex
CREATE INDEX "Tenant_tin_idx" ON "Tenant"("tin");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE INDEX "Permission_roleId_idx" ON "Permission"("roleId");

-- CreateIndex
CREATE INDEX "Permission_userId_idx" ON "Permission"("userId");

-- CreateIndex
CREATE INDEX "UserTenant_userId_idx" ON "UserTenant"("userId");

-- CreateIndex
CREATE INDEX "UserTenant_tenantId_idx" ON "UserTenant"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTenant_userId_tenantId_key" ON "UserTenant"("userId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Taxpayer_tin_key" ON "Taxpayer"("tin");

-- CreateIndex
CREATE INDEX "Taxpayer_tenantId_idx" ON "Taxpayer"("tenantId");

-- CreateIndex
CREATE INDEX "Taxpayer_tin_idx" ON "Taxpayer"("tin");

-- CreateIndex
CREATE INDEX "TaxRegistration_taxpayerId_idx" ON "TaxRegistration"("taxpayerId");

-- CreateIndex
CREATE INDEX "TaxRegistration_taxType_idx" ON "TaxRegistration"("taxType");

-- CreateIndex
CREATE INDEX "TaxPeriod_taxpayerId_idx" ON "TaxPeriod"("taxpayerId");

-- CreateIndex
CREATE INDEX "TaxPeriod_taxType_idx" ON "TaxPeriod"("taxType");

-- CreateIndex
CREATE INDEX "TaxPeriod_taxYear_idx" ON "TaxPeriod"("taxYear");

-- CreateIndex
CREATE INDEX "Supplier_tenantId_idx" ON "Supplier"("tenantId");

-- CreateIndex
CREATE INDEX "Supplier_tin_idx" ON "Supplier"("tin");

-- CreateIndex
CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");

-- CreateIndex
CREATE INDEX "Customer_tin_idx" ON "Customer"("tin");

-- CreateIndex
CREATE INDEX "Document_tenantId_idx" ON "Document"("tenantId");

-- CreateIndex
CREATE INDEX "Document_taxpayerId_idx" ON "Document"("taxpayerId");

-- CreateIndex
CREATE INDEX "Document_supplierId_idx" ON "Document"("supplierId");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");

-- CreateIndex
CREATE INDEX "Invoice_tenantId_idx" ON "Invoice"("tenantId");

-- CreateIndex
CREATE INDEX "Invoice_taxpayerId_idx" ON "Invoice"("taxpayerId");

-- CreateIndex
CREATE INDEX "Invoice_invoiceNumber_idx" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE INDEX "Invoice_invoiceDate_idx" ON "Invoice"("invoiceDate");

-- CreateIndex
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "Account_tenantId_idx" ON "Account"("tenantId");

-- CreateIndex
CREATE INDEX "Account_accountCode_idx" ON "Account"("accountCode");

-- CreateIndex
CREATE UNIQUE INDEX "Account_tenantId_accountCode_key" ON "Account"("tenantId", "accountCode");

-- CreateIndex
CREATE INDEX "AccountingPeriod_tenantId_idx" ON "AccountingPeriod"("tenantId");

-- CreateIndex
CREATE INDEX "AccountingPeriod_startDate_endDate_idx" ON "AccountingPeriod"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "Journal_tenantId_idx" ON "Journal"("tenantId");

-- CreateIndex
CREATE INDEX "Journal_entryDate_idx" ON "Journal"("entryDate");

-- CreateIndex
CREATE INDEX "JournalLine_journalId_idx" ON "JournalLine"("journalId");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE INDEX "JournalLine_accountCode_idx" ON "JournalLine"("accountCode");

-- CreateIndex
CREATE INDEX "GSTTransaction_tenantId_idx" ON "GSTTransaction"("tenantId");

-- CreateIndex
CREATE INDEX "GSTTransaction_transactionDate_idx" ON "GSTTransaction"("transactionDate");

-- CreateIndex
CREATE INDEX "GSTTransaction_gstPeriodId_idx" ON "GSTTransaction"("gstPeriodId");

-- CreateIndex
CREATE INDEX "GSTPeriod_tenantId_idx" ON "GSTPeriod"("tenantId");

-- CreateIndex
CREATE INDEX "GSTPeriod_startDate_endDate_idx" ON "GSTPeriod"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "NWTTransaction_tenantId_idx" ON "NWTTransaction"("tenantId");

-- CreateIndex
CREATE INDEX "NWTTransaction_transactionDate_idx" ON "NWTTransaction"("transactionDate");

-- CreateIndex
CREATE INDEX "NWTTransaction_nwtPeriodId_idx" ON "NWTTransaction"("nwtPeriodId");

-- CreateIndex
CREATE INDEX "NWTPeriod_tenantId_idx" ON "NWTPeriod"("tenantId");

-- CreateIndex
CREATE INDEX "NWTPeriod_startDate_endDate_idx" ON "NWTPeriod"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "FixedAsset_tenantId_idx" ON "FixedAsset"("tenantId");

-- CreateIndex
CREATE INDEX "FixedAsset_taxYear_idx" ON "FixedAsset"("taxYear");

-- CreateIndex
CREATE INDEX "FixedAsset_assetClass_idx" ON "FixedAsset"("assetClass");

-- CreateIndex
CREATE INDEX "FixedAssetMovement_fixedAssetId_idx" ON "FixedAssetMovement"("fixedAssetId");

-- CreateIndex
CREATE INDEX "TaxAdjustment_tenantId_idx" ON "TaxAdjustment"("tenantId");

-- CreateIndex
CREATE INDEX "TaxAdjustment_taxYear_idx" ON "TaxAdjustment"("taxYear");

-- CreateIndex
CREATE INDEX "TaxLoss_tenantId_idx" ON "TaxLoss"("tenantId");

-- CreateIndex
CREATE INDEX "TaxLoss_taxYearIncurred_idx" ON "TaxLoss"("taxYearIncurred");

-- CreateIndex
CREATE INDEX "TaxLossUtilisation_taxLossId_idx" ON "TaxLossUtilisation"("taxLossId");

-- CreateIndex
CREATE INDEX "TaxLossUtilisation_taxYearUtilised_idx" ON "TaxLossUtilisation"("taxYearUtilised");

-- CreateIndex
CREATE INDEX "TaxCalculation_tenantId_idx" ON "TaxCalculation"("tenantId");

-- CreateIndex
CREATE INDEX "TaxCalculation_taxYear_idx" ON "TaxCalculation"("taxYear");

-- CreateIndex
CREATE INDEX "TaxCalculationLine_taxCalculationId_idx" ON "TaxCalculationLine"("taxCalculationId");

-- CreateIndex
CREATE UNIQUE INDEX "MIRAReturn_formId_key" ON "MIRAReturn"("formId");

-- CreateIndex
CREATE INDEX "MIRAReturn_tenantId_idx" ON "MIRAReturn"("tenantId");

-- CreateIndex
CREATE INDEX "MIRAReturn_returnType_idx" ON "MIRAReturn"("returnType");

-- CreateIndex
CREATE INDEX "MIRAReturn_taxYear_idx" ON "MIRAReturn"("taxYear");

-- CreateIndex
CREATE INDEX "MIRAReturnLine_miraReturnId_idx" ON "MIRAReturnLine"("miraReturnId");

-- CreateIndex
CREATE INDEX "MIRAReturnLine_boxCode_idx" ON "MIRAReturnLine"("boxCode");

-- CreateIndex
CREATE INDEX "Reconciliation_tenantId_idx" ON "Reconciliation"("tenantId");

-- CreateIndex
CREATE INDEX "Reconciliation_periodStart_periodEnd_idx" ON "Reconciliation"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "Approval_tenantId_idx" ON "Approval"("tenantId");

-- CreateIndex
CREATE INDEX "Approval_entityType_entityId_idx" ON "Approval"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_idx" ON "AuditEvent"("tenantId");

-- CreateIndex
CREATE INDEX "AuditEvent_timestamp_idx" ON "AuditEvent"("timestamp");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_recordId_idx" ON "AuditEvent"("entityType", "recordId");

-- CreateIndex
CREATE INDEX "PeriodLock_tenantId_idx" ON "PeriodLock"("tenantId");

-- CreateIndex
CREATE INDEX "PeriodLock_taxYear_idx" ON "PeriodLock"("taxYear");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryRule_ruleId_key" ON "RegulatoryRule"("ruleId");

-- CreateIndex
CREATE INDEX "RegulatoryRule_taxType_idx" ON "RegulatoryRule"("taxType");

-- CreateIndex
CREATE INDEX "RegulatoryRule_ruleCode_idx" ON "RegulatoryRule"("ruleCode");

-- CreateIndex
CREATE INDEX "RegulatoryRule_effectiveFrom_idx" ON "RegulatoryRule"("effectiveFrom");

-- CreateIndex
CREATE INDEX "RegulatoryRule_status_idx" ON "RegulatoryRule"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryVersion_versionId_key" ON "RegulatoryVersion"("versionId");

-- CreateIndex
CREATE INDEX "RegulatoryVersion_versionNumber_idx" ON "RegulatoryVersion"("versionNumber");

-- CreateIndex
CREATE INDEX "RegulatoryVersion_effectiveTaxYear_idx" ON "RegulatoryVersion"("effectiveTaxYear");

-- CreateIndex
CREATE INDEX "Transaction_tenantId_idx" ON "Transaction"("tenantId");

-- CreateIndex
CREATE INDEX "Transaction_entityId_idx" ON "Transaction"("entityId");

-- CreateIndex
CREATE INDEX "Transaction_transactionDate_idx" ON "Transaction"("transactionDate");

-- CreateIndex
CREATE INDEX "Transaction_taxYear_idx" ON "Transaction"("taxYear");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_transactionId_key" ON "JournalEntry"("transactionId");

-- CreateIndex
CREATE INDEX "JournalEntry_tenantId_idx" ON "JournalEntry"("tenantId");

-- CreateIndex
CREATE INDEX "JournalEntry_entityId_idx" ON "JournalEntry"("entityId");

-- CreateIndex
CREATE INDEX "JournalEntry_transactionId_idx" ON "JournalEntry"("transactionId");

-- CreateIndex
CREATE INDEX "LegacyJournalLine_journalId_idx" ON "LegacyJournalLine"("journalId");

-- CreateIndex
CREATE INDEX "LegacyJournalLine_accountCode_idx" ON "LegacyJournalLine"("accountCode");

-- CreateIndex
CREATE INDEX "LegacyFixedAsset_tenantId_idx" ON "LegacyFixedAsset"("tenantId");

-- CreateIndex
CREATE INDEX "LegacyFixedAsset_entityId_idx" ON "LegacyFixedAsset"("entityId");

-- CreateIndex
CREATE INDEX "LegacyFixedAsset_taxYear_idx" ON "LegacyFixedAsset"("taxYear");

-- CreateIndex
CREATE INDEX "TaxReturn_tenantId_idx" ON "TaxReturn"("tenantId");

-- CreateIndex
CREATE INDEX "TaxReturn_entityId_idx" ON "TaxReturn"("entityId");

-- CreateIndex
CREATE INDEX "TaxReturn_returnType_idx" ON "TaxReturn"("returnType");

-- CreateIndex
CREATE INDEX "TaxReturn_taxYear_idx" ON "TaxReturn"("taxYear");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Permission" ADD CONSTRAINT "Permission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTenant" ADD CONSTRAINT "UserTenant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTenant" ADD CONSTRAINT "UserTenant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Taxpayer" ADD CONSTRAINT "Taxpayer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRegistration" ADD CONSTRAINT "TaxRegistration_taxpayerId_fkey" FOREIGN KEY ("taxpayerId") REFERENCES "Taxpayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxPeriod" ADD CONSTRAINT "TaxPeriod_taxpayerId_fkey" FOREIGN KEY ("taxpayerId") REFERENCES "Taxpayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_taxpayerId_fkey" FOREIGN KEY ("taxpayerId") REFERENCES "Taxpayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_taxpayerId_fkey" FOREIGN KEY ("taxpayerId") REFERENCES "Taxpayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journal" ADD CONSTRAINT "Journal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Journal" ADD CONSTRAINT "Journal_accountingPeriodId_fkey" FOREIGN KEY ("accountingPeriodId") REFERENCES "AccountingPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "Journal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GSTTransaction" ADD CONSTRAINT "GSTTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GSTTransaction" ADD CONSTRAINT "GSTTransaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GSTTransaction" ADD CONSTRAINT "GSTTransaction_gstPeriodId_fkey" FOREIGN KEY ("gstPeriodId") REFERENCES "GSTPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GSTPeriod" ADD CONSTRAINT "GSTPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GSTPeriod" ADD CONSTRAINT "GSTPeriod_taxPeriodId_fkey" FOREIGN KEY ("taxPeriodId") REFERENCES "TaxPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NWTTransaction" ADD CONSTRAINT "NWTTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NWTTransaction" ADD CONSTRAINT "NWTTransaction_nwtPeriodId_fkey" FOREIGN KEY ("nwtPeriodId") REFERENCES "NWTPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NWTPeriod" ADD CONSTRAINT "NWTPeriod_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NWTPeriod" ADD CONSTRAINT "NWTPeriod_taxPeriodId_fkey" FOREIGN KEY ("taxPeriodId") REFERENCES "TaxPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAssetMovement" ADD CONSTRAINT "FixedAssetMovement_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES "FixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxAdjustment" ADD CONSTRAINT "TaxAdjustment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxLoss" ADD CONSTRAINT "TaxLoss_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxLossUtilisation" ADD CONSTRAINT "TaxLossUtilisation_taxLossId_fkey" FOREIGN KEY ("taxLossId") REFERENCES "TaxLoss"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCalculation" ADD CONSTRAINT "TaxCalculation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCalculationLine" ADD CONSTRAINT "TaxCalculationLine_taxCalculationId_fkey" FOREIGN KEY ("taxCalculationId") REFERENCES "TaxCalculation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MIRAReturn" ADD CONSTRAINT "MIRAReturn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MIRAReturn" ADD CONSTRAINT "MIRAReturn_taxPeriodId_fkey" FOREIGN KEY ("taxPeriodId") REFERENCES "TaxPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MIRAReturnLine" ADD CONSTRAINT "MIRAReturnLine_miraReturnId_fkey" FOREIGN KEY ("miraReturnId") REFERENCES "MIRAReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_performedBy_fkey" FOREIGN KEY ("performedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodLock" ADD CONSTRAINT "PeriodLock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("transactionId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyJournalLine" ADD CONSTRAINT "LegacyJournalLine_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "JournalEntry"("journalId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyFixedAsset" ADD CONSTRAINT "LegacyFixedAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReturn" ADD CONSTRAINT "TaxReturn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

