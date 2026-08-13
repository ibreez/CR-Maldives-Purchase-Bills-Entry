import { describe, test, expect, beforeEach } from 'vitest';
import {
  runFullTaxPipeline,
  FullPipelineParams
} from '../../src/services/orchestrator/taxEngineOrchestrator';
import { clearDatabaseStore, fetchTaxReturn } from '../../src/services/db/persistenceService';
import {
  clearApprovalStore,
  approveTaxReturn,
  validateForMiraSubmission,
  ApprovalRequiredError
} from '../../src/services/auth/rbacService';
import { UserSession } from '../../src/types/rbac';
import { TaxpayerInfo, FixedAssetRecord } from '../../src/types/taxEngine';
import { TaxAdjustment } from '../../src/services/tax/taxAdjustmentService';
import { GstPeriod } from '../../src/types/mira105';
import { WhtPeriod, NonResidentPayee } from '../../src/types/mira302';
import { prepareSubmissionPayload, submitTaxReturn } from '../../src/services/api/miraconnectGatewayService';

describe('Phase 18 - Master End-to-End Tax System Orchestrator Integration Tests', () => {

  const tenantId = 'COMPANY-888';
  const taxYear = 2026;

  const taxpayer: TaxpayerInfo = {
    tin: tenantId,
    taxpayerName: 'Apex Maldivian Tech Enterprises Pvt Ltd',
    entityType: 'COMPANY',
    taxYear,
    accountingPeriodStart: '2026-01-01',
    accountingPeriodEnd: '2026-12-31'
  };

  const gstPeriod: GstPeriod = {
    periodId: '2026-Q2',
    taxpayerName: taxpayer.taxpayerName,
    periodStart: '2026-04-01',
    periodEnd: '2026-06-30',
    taxYear,
    tin: tenantId,
    regime: 'GENERAL_GST'
  };

  const whtPeriod: WhtPeriod = {
    periodId: 'WHT-2026-06',
    taxpayerName: taxpayer.taxpayerName,
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    taxYear,
    tin: tenantId
  };

  const nonResidentPayees: NonResidentPayee[] = [
    {
      payeeId: 'PAYEE-AWS',
      payeeName: 'Amazon Web Services Inc',
      countryCode: 'USA',
      tinOrTaxId: 'US-998877',
      foreignAddress: '410 Terry Ave N, Seattle, WA'
    },
    {
      payeeId: 'PAYEE-ADOBE',
      payeeName: 'Adobe Systems Software Ireland Ltd',
      countryCode: 'IRL',
      tinOrTaxId: 'IE-443322',
      foreignAddress: '4-6 Riverwalk, Citywest Business Campus, Dublin'
    }
  ];

  const taxManagerSession: UserSession = {
    userId: 'USR-MGR-88',
    tenantId,
    role: 'TAX_MANAGER',
    assignedEntities: [tenantId]
  };

  const accountantSession: UserSession = {
    userId: 'USR-ACCT-88',
    tenantId,
    role: 'STAFF_ACCOUNTANT',
    assignedEntities: [tenantId]
  };

  beforeEach(() => {
    clearDatabaseStore();
    clearApprovalStore();
  });

  // Realistic annual dataset with OCR raw documents, capital assets, fines, exempt rent, foreign vendor subscriptions
  const realisticRawDocuments = [
    // 1. Standard operating expense - STELCO electricity bill
    {
      documentId: 'DOC-2026-001',
      supplierName: 'STELCO',
      invoiceNumber: 'INV-STELCO-101',
      invoiceDate: '2026-02-15',
      grossAmount: 21600,
      gstAmount: 1600,
      netAmount: 20000,
      extractedText: 'Electricity utility charge STELCO Malé',
      detectedCategory: 'utilities.electricity'
    },
    // 2. Exempt office rent - Male Commercial Spaces
    {
      documentId: 'DOC-2026-002',
      supplierName: 'Male Commercial Properties Pvt Ltd',
      invoiceNumber: 'RENT-2026-04',
      invoiceDate: '2026-04-01',
      grossAmount: 50000,
      gstAmount: 0,
      netAmount: 50000,
      extractedText: 'Office building lease monthly rent exempt GST',
      detectedCategory: 'rent.office'
    },
    // 3. Foreign currency invoice (AWS Web Hosting in USD)
    {
      documentId: 'DOC-2026-003',
      supplierName: 'Amazon Web Services Inc',
      invoiceNumber: 'AWS-990112',
      invoiceDate: '2026-05-10',
      grossAmount: 30840, // Equivalent in MVR (e.g. $2000 USD @ 15.42)
      gstAmount: 0,
      netAmount: 30840,
      currency: 'USD',
      fxRate: 15.42,
      originalAmount: 2000,
      extractedText: 'AWS Cloud infrastructure hosting fees cross-border royalty/service',
      detectedCategory: 'software.cloud_services'
    },
    // 4. Foreign vendor subscription (Adobe Creative Cloud in USD)
    {
      documentId: 'DOC-2026-004',
      supplierName: 'Adobe Systems Software Ireland Ltd',
      invoiceNumber: 'ADOBE-77123',
      invoiceDate: '2026-06-01',
      grossAmount: 15420, // $1000 USD @ 15.42
      gstAmount: 0,
      netAmount: 15420,
      currency: 'USD',
      fxRate: 15.42,
      originalAmount: 1000,
      extractedText: 'Adobe Creative Cloud annual software subscription license fee',
      detectedCategory: 'software.license'
    },
    // 5. Non-deductible traffic and regulatory fines
    {
      documentId: 'DOC-2026-005',
      supplierName: 'Maldives Police Service / Transport Authority',
      invoiceNumber: 'FINE-2026-88',
      invoiceDate: '2026-05-25',
      grossAmount: 5000,
      gstAmount: 0,
      netAmount: 5000,
      extractedText: 'Traffic violation penalty fine company vehicle parking',
      detectedCategory: 'fines.penalties'
    }
  ];

  const fixedAssets: FixedAssetRecord[] = [
    // 1. Laptops / Computer hardware asset
    {
      assetId: 'AST-2026-01',
      entityId: tenantId,
      outletId: 'OUTLET-01',
      assetName: 'MacBook Pro Fleet (5 units)',
      assetClass: 'Computer software & hardware',
      acquisitionDate: '2026-01-01',
      costPrice: 150000,
      miraCapitalAllowanceRate: 33.33,
      openingWDV: 0,
      additionsInYear: 150000,
      disposalsInYear: 0,
      capitalAllowanceClaimed: 49995,
      closingWDV: 100005,
      taxYear,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31'
    },
    // 2. Commercial Vehicle
    {
      assetId: 'AST-2026-02',
      entityId: tenantId,
      outletId: 'OUTLET-01',
      assetName: 'Delivery Van',
      assetClass: 'Motor vehicles',
      acquisitionDate: '2026-01-01',
      costPrice: 300000,
      miraCapitalAllowanceRate: 20.00,
      openingWDV: 0,
      additionsInYear: 300000,
      disposalsInYear: 0,
      capitalAllowanceClaimed: 60000,
      closingWDV: 240000,
      taxYear,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31'
    }
  ];

  const taxAdjustments: TaxAdjustment[] = [
    {
      adjustmentId: 'ADJ-2026-FINES',
      entityId: tenantId,
      taxYear,
      miraCode: 'ADJ-FINES',
      direction: 'ADD_BACK',
      amount: 5000,
      reason: 'Disallowed traffic fine non-deductible expense',
      reviewStatus: 'APPROVED',
      sourceTransactionId: 'DOC-2026-005',
      createdAt: '2026-06-15T10:00:00Z'
    }
  ];

  test('Master E2E Tax Pipeline processes raw OCR documents, computes capital allowances, tax adjustments, and entity tax without manual intervention', async () => {
    const params: FullPipelineParams = {
      rawDocuments: realisticRawDocuments,
      fixedAssets,
      taxAdjustments,
      taxpayer,
      gstPeriod,
      whtPeriod,
      entityType: 'COMPANY',
      userSession: accountantSession,
      autoApproveAndSubmit: false,
      nonResidentPayees
    };

    const result = await runFullTaxPipeline(params);

    // Verify overall pipeline status
    expect(result.status).toBe('NEEDS_APPROVAL');
    expect(result.taxYear).toBe(2026);
    expect(result.entityId).toBe(tenantId);

    // Confirm step 1 & 2: Ingestion, classification, and journaling
    expect(result.classifiedTransactions).toHaveLength(5);
    expect(result.persistedTransactions).toHaveLength(5);

    // Confirm step 3: P&L Aggregation
    expect(result.pnlReport.totalOperatingExpenses).toBeGreaterThan(0);
    expect(result.pnlReport.accountingProfitBeforeTax).toBeDefined();

    // Confirm step 4: Capital Allowance deductions
    expect(result.capitalAllowanceReport.totalCapitalAllowanceClaimed).toBe(109995); // 49995 + 60000

    // Confirm step 5: Tax Adjustments pipeline
    expect(result.taxableIncomePipeline.totalAddBacks).toBe(5000);

    // Confirm step 6: Entity Tax calculation
    expect(result.entityTaxResult).toBeDefined();
    expect(result.entityTaxResult.entityType).toBe('COMPANY');
  });

  test('MIRA 604, MIRA 105, and MIRA 302 returns are generated cleanly and pass cross-check reconciliation audit', async () => {
    const params: FullPipelineParams = {
      rawDocuments: realisticRawDocuments,
      fixedAssets,
      taxAdjustments,
      taxpayer,
      gstPeriod,
      whtPeriod,
      entityType: 'COMPANY',
      userSession: accountantSession,
      autoApproveAndSubmit: false,
      nonResidentPayees
    };

    const result = await runFullTaxPipeline(params);

    // MIRA 604 Return assertions
    expect(result.mira604Return).toBeDefined();
    expect(result.mira604Return.formId).toMatch(/^MIRA604-/);
    expect(result.mira604Return.sectionA_TaxpayerInfo.tin).toBe(tenantId);

    // MIRA 105 GST Return assertions
    expect(result.mira105Return).toBeDefined();
    expect(result.mira105Return?.gstPeriod.tin).toBe(tenantId);

    // MIRA 302 WHT Return assertions
    expect(result.mira302Return).toBeDefined();
    expect(result.mira302Return?.whtPeriod.tin).toBe(tenantId);

    // Step 8 Reconciliation audit checks
    expect(result.reconciliationReport).toBeDefined();
    expect(result.reconciliationReport.isValid).toBe(true);
    expect(result.reconciliationReport.issues).toHaveLength(0);
  });

  test('RBAC approval gate blocks submission when unapproved and permits submission once approved by TAX_MANAGER', async () => {
    // 1. Run pipeline as STAFF_ACCOUNTANT without auto-approve
    const params: FullPipelineParams = {
      rawDocuments: realisticRawDocuments,
      fixedAssets,
      taxAdjustments,
      taxpayer,
      gstPeriod,
      whtPeriod,
      userSession: accountantSession,
      autoApproveAndSubmit: false
    };

    const unapprovedResult = await runFullTaxPipeline(params);
    expect(unapprovedResult.status).toBe('NEEDS_APPROVAL');
    expect(unapprovedResult.approvalRequest).toBeDefined();
    expect(unapprovedResult.approvalRequest?.status).toBe('PENDING_REVIEW');

    // MIRAconnect submission validation should throw ApprovalRequiredError
    const reqId = unapprovedResult.approvalRequest!.requestId;
    expect(() => validateForMiraSubmission(reqId, taxManagerSession)).toThrow(ApprovalRequiredError);

    // 2. TAX_MANAGER approves return
    const approvedRequest = approveTaxReturn(reqId, taxManagerSession, 'Verified by Tax Manager');
    expect(approvedRequest.status).toBe('APPROVED');

    // Validation for MIRA submission now succeeds
    const validation = validateForMiraSubmission(reqId, taxManagerSession);
    expect(validation.canSubmit).toBe(true);

    // 3. Re-run pipeline with TAX_MANAGER session and autoApproveAndSubmit=true
    const managerParams: FullPipelineParams = {
      ...params,
      userSession: taxManagerSession,
      autoApproveAndSubmit: true,
      approvalComments: 'Approved for MIRA transmission'
    };

    const approvedResult = await runFullTaxPipeline(managerParams);
    expect(approvedResult.status).toBe('COMPLETED');
    expect(approvedResult.rbacValidated).toBe(true);
    expect(['SUBMITTED', 'ACCEPTED']).toContain(approvedResult.submissions.mira604Response?.status);
  });

  test('Final MIRAconnect submission payloads include valid SHA-256 checksums and matching PDF exports', async () => {
    const params: FullPipelineParams = {
      rawDocuments: realisticRawDocuments,
      fixedAssets,
      taxAdjustments,
      taxpayer,
      gstPeriod,
      whtPeriod,
      userSession: taxManagerSession,
      autoApproveAndSubmit: true,
      nonResidentPayees
    };

    const result = await runFullTaxPipeline(params);

    // Verify PDF exports are generated
    expect(result.pdfExports.mira604Pdf).toBeDefined();
    expect(result.pdfExports.pnlPdf).toBeDefined();
    expect(result.pdfExports.assetRegisterPdf).toBeDefined();
    expect(result.pdfExports.mira105Pdf).toBeDefined();
    expect(result.pdfExports.mira302Pdf).toBeDefined();

    // Verify MIRAconnect Submission Payloads & Checksums
    const sub604 = result.submissions.mira604Payload;
    expect(sub604).toBeDefined();
    expect(sub604?.returnType).toBe('MIRA604');
    expect(sub604?.checksumHash).toBeDefined();
    expect(sub604?.checksumHash.length).toBe(64); // Valid SHA-256 hex string

    const sub105 = result.submissions.mira105Payload;
    expect(sub105).toBeDefined();
    expect(sub105?.checksumHash.length).toBe(64);

    const sub302 = result.submissions.mira302Payload;
    expect(sub302).toBeDefined();
    expect(sub302?.checksumHash.length).toBe(64);

    // Verify persisted database record matches payload
    const persistedReturn = await fetchTaxReturn(result.mira604Return.formId);
    expect(persistedReturn).toBeDefined();
    expect(persistedReturn.formId).toBe(result.mira604Return.formId);
  });

});
