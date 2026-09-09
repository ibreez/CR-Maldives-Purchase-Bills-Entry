import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';

// Orchestrator & Services
import { runFullTaxPipeline, FullPipelineParams } from '../../src/services/orchestrator/taxEngineOrchestrator';
import { clearDatabaseStore, saveTaxReturn, fetchTaxReturn } from '../../src/services/db/persistenceService';
import { clearApprovalStore, createApprovalRequest, submitForReview, approveTaxReturn, validateForMiraSubmission } from '../../src/services/auth/rbacService';
import { ApprovalWorkflowService } from '../../src/services/approval/approvalWorkflowService';
import {
  AIGovernanceService,
  AIPostingForbiddenError,
  AIApprovalForbiddenError,
  AIRateOverrideForbiddenError,
  AITaxLiabilityCalculationForbiddenError,
  AIMandatoryReviewBypassForbiddenError
} from '../../src/services/ai';
import { resetAuditStore, queryAuditLogs, verifyAuditChain } from '../../src/services/audit/auditService';
import { classifyDocument } from '../../src/services/classificationService';
import { createTransactionFromBill } from '../../src/services/accounting/transactionService';
import { generateSchedule1PnL } from '../../src/services/accounting/pnlService';
import { generateSchedule2CapitalAllowanceSummary } from '../../src/services/tax/capitalAllowanceService';
import { calculateTaxableIncomePipeline, TaxAdjustment } from '../../src/services/tax/taxAdjustmentService';
import { calculateEntityTaxLiability } from '../../src/services/tax/entityTaxService';
import { generateMira604Return } from '../../src/services/tax/mira604Service';
import { generateMira105Return } from '../../src/services/gst/gstService';
import { GstEngineService } from '../../src/services/gst/gstEngineService';
import { generateMira302Return } from '../../src/services/wht/whtService';
import { reconcileTaxYear } from '../../src/services/tax/reconciliationService';
import { runFullReconciliationSuite } from '../../src/services/reconciliation/reconciliationEngine';
import { FilingPackageGenerator } from '../../src/services/filing/filingPackageGenerator';
import { PackageValidator } from '../../src/services/filing/packageValidator';

// Types
import { TaxpayerInfo, FixedAssetRecord, TransactionRecord } from '../../src/types/taxEngine';
import { GstPeriod } from '../../src/types/mira105';
import { WhtPeriod, NonResidentPayee } from '../../src/types/mira302';
import { UserSession } from '../../src/types/rbac';

describe('Phase 40: Master End-to-End Test Engine (tests/e2e/miraTaxEngine.test.ts)', () => {
  const tenantId = 'TENANT-MIRA-E2E-2026';
  const taxYear = 2026;

  const corporateTaxpayer: TaxpayerInfo = {
    tin: '1002938GST001',
    taxpayerName: 'Horizon Dhivehi Enterprises Pvt Ltd',
    entityType: 'COMPANY',
    taxYear,
    accountingPeriodStart: '2026-01-01',
    accountingPeriodEnd: '2026-12-31'
  };

  const gstPeriodQ2: GstPeriod = {
    periodId: '2026-Q2',
    taxpayerName: corporateTaxpayer.taxpayerName,
    periodStart: '2026-04-01',
    periodEnd: '2026-06-30',
    taxYear,
    tin: corporateTaxpayer.tin,
    regime: 'GENERAL_GST'
  };

  const whtPeriodJune: WhtPeriod = {
    periodId: 'WHT-2026-06',
    taxpayerName: corporateTaxpayer.taxpayerName,
    periodStart: '2026-06-01',
    periodEnd: '2026-06-30',
    taxYear,
    tin: corporateTaxpayer.tin
  };

  const foreignPayees: NonResidentPayee[] = [
    {
      payeeId: 'PAYEE-AWS-GLOBAL',
      payeeName: 'Amazon Web Services Inc',
      countryCode: 'USA',
      tinOrTaxId: 'US-EIN-987654321',
      foreignAddress: '410 Terry Avenue North, Seattle, WA 98109, USA'
    }
  ];

  const taxManagerSession: UserSession = {
    userId: 'usr-tax-manager-001',
    tenantId,
    role: 'TAX_MANAGER',
    assignedEntities: [corporateTaxpayer.tin]
  };

  const accountantSession: UserSession = {
    userId: 'usr-senior-accountant-001',
    tenantId,
    role: 'ACCOUNTANT',
    assignedEntities: [corporateTaxpayer.tin]
  };

  const financeManagerSession: UserSession = {
    userId: 'usr-finance-manager-001',
    tenantId,
    role: 'FINANCE_MANAGER',
    assignedEntities: [corporateTaxpayer.tin]
  };

  const aiSession: UserSession = {
    userId: 'bot-gemini-ocr-agent',
    tenantId,
    role: 'DATA_ENTRY',
    assignedEntities: [corporateTaxpayer.tin]
  };

  beforeEach(() => {
    clearDatabaseStore();
    clearApprovalStore();
    resetAuditStore();
  });

  describe('1. Full Lifecycle Pipeline: Tenant -> Taxpayer -> Document -> Classification -> Journal -> GL -> GST -> NWT -> Assets -> Adjustments -> Income Tax -> Reconciliation -> Filing Package', () => {
    it('executes complete deterministic pipeline asserting every major intermediate accounting, tax, and reconciliation value', async () => {
      // Step A: Taxpayer & Tenant Context
      expect(corporateTaxpayer.tin).toBe('1002938GST001');
      expect(corporateTaxpayer.entityType).toBe('COMPANY');
      expect(corporateTaxpayer.taxYear).toBe(2026);

      // Step B: Source Documents & Cryptographic Hashes
      const rawDocuments = [
        // Doc 1: STELCO Electricity Bill (General GST 8%)
        {
          documentId: 'DOC-2026-001',
          supplierName: 'STELCO PLC',
          supplierTin: '1000014GST001',
          invoiceNumber: 'INV-STELCO-2026-8801',
          invoiceDate: '2026-04-15',
          grossAmount: 21600,
          netAmount: 20000,
          gstAmount: 1600,
          gstRate: 8,
          taxStatus: 'TAX_CHARGED',
          isTourism: false,
          extractedText: 'STELCO Malé Power Supply 20000 MVR + 8% GST 1600 MVR = 21600 MVR',
          description: 'Office electricity power utility charge for April 2026'
        },
        // Doc 2: Paperworld Maldives Office Supplies (General GST 8%)
        {
          documentId: 'DOC-2026-002',
          supplierName: 'Paperworld Maldives Pvt Ltd',
          supplierTin: '1002233GST001',
          invoiceNumber: 'INV-PW-4401',
          invoiceDate: '2026-05-10',
          grossAmount: 54000,
          netAmount: 50000,
          gstAmount: 4000,
          gstRate: 8,
          taxStatus: 'TAX_CHARGED',
          isTourism: false,
          extractedText: 'Paperworld Stationery & Office Consumables 50000 MVR + 8% GST 4000 MVR = 54000 MVR',
          description: 'Stationery, printer supplies, and office consumables'
        },
        // Doc 3: Dhivehi Tech Solutions Server Rack Equipment (Capital Asset, Schedule 2)
        {
          documentId: 'DOC-2026-003',
          supplierName: 'Dhivehi Tech Solutions Pvt Ltd',
          supplierTin: '1004455GST001',
          invoiceNumber: 'INV-DTS-9901',
          invoiceDate: '2026-01-15',
          grossAmount: 129600,
          netAmount: 120000,
          gstAmount: 9600,
          gstRate: 8,
          taxStatus: 'TAX_CHARGED',
          isTourism: false,
          extractedText: 'Enterprise Server Rack & Network Hardware 120000 MVR + 8% GST 9600 MVR = 129600 MVR',
          description: 'Enterprise data center server rack and network infrastructure'
        },
        // Doc 4: Salt Restaurant Luxury Dinner (Blocked Input Tax under GST Act Section 21/22 & Non-Deductible ITA Sec 30)
        {
          documentId: 'DOC-2026-004',
          supplierName: 'Salt Café & Restaurant',
          supplierTin: '1006677GST001',
          invoiceNumber: 'INV-SALT-7712',
          invoiceDate: '2026-06-05',
          grossAmount: 8640,
          netAmount: 8000,
          gstAmount: 640,
          gstRate: 8,
          taxStatus: 'TAX_CHARGED',
          isTourism: false,
          extractedText: 'Executive VIP Dinner & Hospitality Entertainment 8000 MVR + 8% GST 640 MVR = 8640 MVR',
          description: 'Executive entertainment dinner and hospitality expenses'
        },
        // Doc 5: Commercial Office Rent (Exempt GST per Section 15 of GST Act)
        {
          documentId: 'DOC-2026-005',
          supplierName: 'Male Properties Landlord',
          supplierTin: '1001122GST001',
          invoiceNumber: 'REC-RENT-2026-01',
          invoiceDate: '2026-04-01',
          grossAmount: 60000,
          netAmount: 60000,
          gstAmount: 0,
          gstRate: 0,
          taxStatus: 'EXEMPT',
          isTourism: false,
          extractedText: 'Commercial Head Office Lease Rent Q2 60000 MVR Exempt from GST',
          description: 'Commercial head office property rental lease'
        },
        // Doc 6: AWS Cloud & Technical Services (Non-Resident, Section 55 NWT @ 10%)
        {
          documentId: 'DOC-2026-006',
          supplierName: 'Amazon Web Services Inc',
          supplierTin: 'US-EIN-987654321',
          invoiceNumber: 'INV-AWS-2026-06',
          invoiceDate: '2026-06-20',
          currency: 'USD',
          foreignAmount: 2000,
          exchangeRate: 15.42,
          grossAmount: 30840,
          netAmount: 30840,
          gstAmount: 0,
          gstRate: 0,
          taxStatus: 'NO_TAX',
          isNonResident: true,
          extractedText: 'AWS Cloud Hosting & Technical Infrastructure Services USD 2000 @ 15.42 = 30840 MVR',
          description: 'Cloud hosting infrastructure and technical management fees'
        },
        // Doc 7: Maldives Transport Authority Regulatory Fine (Non-Deductible Add-Back ITA Sec 30)
        {
          documentId: 'DOC-2026-007',
          supplierName: 'Maldives Transport Authority',
          supplierTin: 'GOV-MVR-001',
          invoiceNumber: 'PEN-2026-09',
          invoiceDate: '2026-05-18',
          grossAmount: 5000,
          netAmount: 5000,
          gstAmount: 0,
          gstRate: 0,
          taxStatus: 'NO_TAX',
          isTourism: false,
          extractedText: 'Regulatory Compliance Penalty Fine 5000 MVR',
          description: 'Statutory late filing administrative penalty'
        },
        // Doc 8: Local Market Staff Welfare Supplies (0% GST Unregistered Vendor)
        {
          documentId: 'DOC-2026-008',
          supplierName: 'Male Local Market Stall 42',
          supplierTin: 'UNREGISTERED',
          invoiceNumber: 'MKT-2026-301',
          invoiceDate: '2026-04-22',
          grossAmount: 12000,
          netAmount: 12000,
          gstAmount: 0,
          gstRate: 0,
          taxStatus: 'NO_TAX',
          isTourism: false,
          extractedText: 'Local fresh provisions and staff kitchen pantry supplies 12000 MVR cash receipt',
          description: 'Pantry provisions and staff welfare supplies'
        },
        // Doc 9: Standard Rated Commercial Sales Revenue (Standard General GST 8%)
        {
          documentId: 'DOC-2026-009',
          supplierName: 'Dhivehi Resort Group',
          supplierTin: '1008899GST501',
          invoiceNumber: 'INV-OUT-2026-01',
          invoiceDate: '2026-06-15',
          grossAmount: 648000,
          netAmount: 600000,
          gstAmount: 48000,
          gstRate: 8,
          taxStatus: 'TAX_CHARGED',
          isTourism: false,
          extractedText: 'IT Consulting & Enterprise Software Delivery 600000 MVR + 8% GST 48000 MVR = 648000 MVR',
          description: 'Commercial enterprise technology integration and software support revenue'
        }
      ];

      // Assert Document Hashing Lineage
      const docHashes = rawDocuments.map((doc) => {
        const hash = crypto.createHash('sha256').update(JSON.stringify(doc)).digest('hex');
        expect(hash).toHaveLength(64);
        return { documentId: doc.documentId, hash };
      });
      expect(docHashes).toHaveLength(9);

      // Step C: AI Extraction, Lineage & Governance Invariants
      const aiExtraction1 = AIGovernanceService.recordAIExtraction({
        documentId: rawDocuments[0].documentId,
        tenantId,
        model: 'gemini-3.6-flash',
        modelVersion: '2026-02-stable',
        promptVersion: 'v2.4-compliance',
        confidence: {
          supplier_name: 98,
          supplier_tin: 99,
          invoice_number: 97,
          invoice_date: 96,
          taxable_value: 99,
          gst_amount: 98,
          invoice_total: 99,
          line_items: 95,
          overall: 97.6
        },
        rawResponseText: rawDocuments[0].extractedText,
        normalizedOutput: {
          supplier: { name: rawDocuments[0].supplierName, tin: rawDocuments[0].supplierTin },
          invoice: { number: rawDocuments[0].invoiceNumber, date: rawDocuments[0].invoiceDate, gst_rate: 8 },
          totals: { taxable_value: 20000, gst_amount: 1600, invoice_total: 21600 },
          tax_status: 'TAX_CHARGED'
        }
      });
      expect(aiExtraction1.metadata.rawOutputHash).toHaveLength(64);
      expect(aiExtraction1.status).toBe('EXTRACTED');

      // AI Risk Assessment
      const riskAssessment1 = AIGovernanceService.generateAISuggestionsAndAssessRisk(aiExtraction1);
      expect(riskAssessment1.riskScore).toBeGreaterThanOrEqual(0);
      expect(riskAssessment1.anomaliesDetected.some((a) => a.type === 'HIGH_VALUE_THRESHOLD')).toBe(true);

      // High-Value Server Rack Capital Asset (Doc 3) Risk Assessment
      const aiExtraction3 = AIGovernanceService.recordAIExtraction({
        documentId: rawDocuments[2].documentId,
        tenantId,
        model: 'gemini-3.6-flash',
        modelVersion: '2026-02-stable',
        promptVersion: 'v2.4-compliance',
        confidence: { overall: 96 },
        rawResponseText: rawDocuments[2].extractedText,
        normalizedOutput: {
          supplier: { name: rawDocuments[2].supplierName, tin: rawDocuments[2].supplierTin },
          invoice: { number: rawDocuments[2].invoiceNumber, date: rawDocuments[2].invoiceDate, gst_rate: 8 },
          totals: { taxable_value: 120000, gst_amount: 9600, invoice_total: 129600 },
          is_capital_asset: true,
          suggested_category: 'COMPUTER_HARDWARE_SOFTWARE',
          tax_status: 'TAX_CHARGED'
        }
      });
      const riskAssessment3 = AIGovernanceService.generateAISuggestionsAndAssessRisk(aiExtraction3);
      expect(riskAssessment3.requiresHumanReview).toBe(true);
      expect(riskAssessment3.anomaliesDetected.some((a) => a.type === 'CAPITAL_ASSET_THRESHOLD' || a.type === 'HIGH_VALUE_THRESHOLD')).toBe(true);

      // Human Override with Immutable Audit Logging
      const humanOverride = AIGovernanceService.recordHumanOverride(
        {
          extractionId: aiExtraction1.metadata.extractionId,
          tenantId,
          field: 'supplier.name',
          originalAiValue: 'STELCO PLC',
          humanVerifiedValue: 'State Electric Company Limited (STELCO)',
          reason: 'Standardizing statutory registered corporate entity name',
          originalConfidence: 98
        },
        accountantSession
      );
      expect(humanOverride.auditEventId).toBeDefined();

      // Verify Audit Chain Integrity
      const auditChain = verifyAuditChain(tenantId);
      expect(auditChain.isValid).toBe(true);

      // Human Approval Invariant: AI Bot cannot approve
      expect(() => {
        AIGovernanceService.approveExtraction(aiExtraction1.metadata.extractionId, aiSession);
      }).toThrow(AIApprovalForbiddenError);

      // High-value anomaly cannot be approved by junior accountant without specialist review role
      expect(() => {
        AIGovernanceService.approveExtraction(aiExtraction1.metadata.extractionId, accountantSession);
      }).toThrow(AIMandatoryReviewBypassForbiddenError);

      // Finance Manager approves high-risk extraction
      const approvedExtraction = AIGovernanceService.approveExtraction(aiExtraction1.metadata.extractionId, financeManagerSession, 'Verified against PDF invoice');
      expect(approvedExtraction.status).toBe('ACCEPTED');

      // AI cannot post directly to GL
      expect(() => {
        AIGovernanceService.validatePostingEligibility(aiExtraction1.metadata.extractionId, aiSession);
      }).toThrow(AIPostingForbiddenError);

      // Authorized user can post
      expect(() => {
        AIGovernanceService.validatePostingEligibility(aiExtraction1.metadata.extractionId, financeManagerSession);
      }).not.toThrow();

      // Step D: Fixed Assets Setup (Schedule 2)
      const fixedAssets: FixedAssetRecord[] = [
        {
          assetId: 'ASSET-2026-SRV-01',
          entityId: corporateTaxpayer.tin,
          outletId: 'OUTLET-MAIN',
          assetName: 'Enterprise Data Center Server Rack & SAN Hardware',
          assetClass: 'Computer software & hardware',
          acquisitionDate: '2026-01-01',
          costPrice: 120000,
          cost: 120000,
          miraCapitalAllowanceRate: 33.33,
          openingWDV: 120000,
          additionsInYear: 120000,
          disposalsInYear: 0,
          capitalAllowanceClaimed: 40000,
          closingWDV: 80000,
          taxYear: 2026,
          accountingPeriodStart: '2026-01-01',
          accountingPeriodEnd: '2026-12-31'
        }
      ];

      // Step E: Tax Adjustments (Add-Backs & Deductions under ITA Sections 10, 11, 20 & 30)
      const taxAdjustments: TaxAdjustment[] = [
        {
          adjustmentId: 'ADJ-2026-001',
          entityId: corporateTaxpayer.tin,
          taxYear,
          miraCode: 'ADJ-DEPR',
          reviewStatus: 'APPROVED',
          reason: 'Add back accounting book depreciation on Server Rack (Schedule 4 Line 2a)',
          amount: 24000
        },
        {
          adjustmentId: 'ADJ-2026-002',
          entityId: corporateTaxpayer.tin,
          taxYear,
          miraCode: 'ADJ-PRIVATE',
          reviewStatus: 'APPROVED',
          reason: 'Disallowed hospitality & executive entertainment expense (Doc 4)',
          amount: 8640
        },
        {
          adjustmentId: 'ADJ-2026-003',
          entityId: corporateTaxpayer.tin,
          taxYear,
          miraCode: 'ADJ-FINES',
          reviewStatus: 'APPROVED',
          reason: 'Disallowed statutory regulatory penalty fine (Doc 7)',
          amount: 5000
        }
      ];

      // Step F: Execute Full Orchestrated Master Tax Pipeline
      const pipelineParams: FullPipelineParams = {
        rawDocuments,
        fixedAssets,
        taxAdjustments,
        taxpayer: corporateTaxpayer,
        gstPeriod: gstPeriodQ2,
        whtPeriod: whtPeriodJune,
        entityType: 'COMPANY',
        priorUnabsorbedLosses: 50000,
        userSession: taxManagerSession,
        autoApproveAndSubmit: true,
        approvalComments: 'Full comprehensive corporate filing verified and approved by Tax Manager',
        nonResidentPayees: foreignPayees
      };

      const result = await runFullTaxPipeline(pipelineParams);

      // ==========================================
      // CRITICAL DETERMINISTIC INTERMEDIATE ASSERTIONS
      // ==========================================

      // 1. Pipeline Completion Status
      expect(result.status).toBe('COMPLETED');
      expect(result.entityId).toBe('1002938GST001');
      expect(result.taxYear).toBe(2026);
      expect(result.rbacValidated).toBe(true);

      // 2. Journal & Double-Entry Balance Invariants
      expect(result.persistedTransactions).toHaveLength(9);
      for (const tx of result.persistedTransactions) {
        if (tx.journalEntry) {
          const totalDebit = tx.journalEntry.lines.reduce((sum, line) => sum + (line.debit || 0), 0);
          const totalCredit = tx.journalEntry.lines.reduce((sum, line) => sum + (line.credit || 0), 0);
          // Assert exact double-entry balance: Debits == Credits (difference === 0)
          expect(Math.abs(totalDebit - totalCredit)).toBeLessThanOrEqual(0.0001);
          expect(totalDebit).toBeGreaterThan(0);
        }
      }

      // 3. P&L Statement (Schedule 1) Assertions
      const pnl = result.pnlReport;
      expect(pnl.totalRevenue).toBe(600000); // Doc 9 Sales
      expect(pnl.totalCostOfSales).toBe(0);
      expect(pnl.grossProfit).toBe(600000);
      expect(pnl.totalOperatingExpenses).toBe(186480); // Sum of operating expenses excluding book depreciation
      expect(pnl.accountingProfitBeforeTax).toBe(413520); // 600,000 - 186,480 = 413,520

      // 4. Fixed Asset Capital Allowance (Schedule 2) Assertions
      const capAllowance = result.capitalAllowanceReport;
      expect(capAllowance.totalCostOfAssets).toBe(120000);
      expect(capAllowance.totalCapitalAllowanceClaimed).toBe(39996); // 120,000 * 33.33% = 39,996
      expect(capAllowance.totalClosingWDV).toBe(80004); // 120,000 - 39,996 = 80,004
      expect(capAllowance.totalBalancingCharge).toBe(0);
      expect(capAllowance.totalBalancingAllowance).toBe(0);

      // 5. Taxable Income Pipeline (Tax Adjustments & Loss Relief)
      const taxPipeline = result.taxableIncomePipeline;
      // Add-Backs: Book Depr (24,000) + Entertainment (8,640) + Fines (5,000) = 37,640
      expect(taxPipeline.totalAddBacks).toBe(37640);
      // Deductions: Capital Allowance = 39,996
      expect(taxPipeline.totalDeductions).toBe(39996);
      // Net Tax Adjustment = 37,640 - 39,996 = -2,356
      expect(taxPipeline.netTaxAdjustment).toBe(-2356);
      // Taxable Income Before Loss Relief = 413,520 - 2,356 = 411,164
      expect(taxPipeline.taxableIncomeBeforeLossRelief).toBe(411164);

      // 6. Entity Tax Liability & Loss Absorption (ITA Section 30)
      const entityTax = result.entityTaxResult;
      expect(entityTax.grossTaxableIncome).toBe(411164);
      expect(entityTax.lossReliefApplied).toBe(50000); // Full 50,000 prior loss absorbed
      expect(entityTax.netTaxableIncome).toBe(361164); // 411,164 - 50,000 = 361,164
      // In Maldives, corporate tax is 15% on taxable income exceeding MVR 500,000 tax-free bracket
      expect(entityTax.taxByBracket[0].taxableInBracket).toBe(361164);
      expect(entityTax.taxByBracket[0].rate).toBe(0); // 0% up to 500,000
      expect(entityTax.totalIncomeTaxDue).toBe(0); // Under MVR 500,000 threshold

      // 7. GST Return (MIRA 105) Assertions
      const mira105 = result.mira105Return;
      expect(mira105).toBeDefined();
      if (mira105) {
        expect(mira105.period.periodId).toBe('2026-Q2');
        expect(mira105.salesSummary.standardRatedSales).toBe(600000);
        expect(mira105.salesSummary.outputGstCollected).toBe(48000); // 600,000 * 8% = 48,000
        expect(mira105.purchasesSummary.taxablePurchases).toBe(190000); // 20,000 (Stelco) + 50,000 (Paperworld) + 120,000 (Server)
        expect(mira105.purchasesSummary.claimableInputGst).toBe(15200); // 1,600 + 4,000 + 9,600 = 15,200 (excludes blocked 640)
        expect(mira105.netTaxPayable).toBe(32800); // 48,000 - 15,200 = 32,800
      }

      // 8. WHT / NWT Return (MIRA 302) Assertions
      const mira302 = result.mira302Return;
      expect(mira302).toBeDefined();
      if (mira302) {
        expect(mira302.period.periodId).toBe('WHT-2026-06');
        expect(mira302.totalGrossPayments).toBe(30840);
        expect(mira302.totalTaxWithheld).toBe(3084); // 30,840 * 10% statutory rate (ITA Sec 55)
        expect(mira302.payeeSchedule).toHaveLength(1);
        expect(mira302.payeeSchedule[0].payeeName).toBe('Amazon Web Services Inc');
        expect(mira302.payeeSchedule[0].taxWithheld).toBe(3084);
      }

      // 9. MIRA 604 Return Assertions
      const mira604 = result.mira604Return;
      expect(mira604).toBeDefined();
      expect(mira604.taxpayer.tin).toBe('1002938GST001');
      expect(mira604.sectionB.grossRevenue).toBe(600000);
      expect(mira604.sectionB.operatingExpenses).toBe(186480);
      expect(mira604.sectionB.accountingProfitBeforeTax).toBe(413520);
      expect(mira604.sectionC.totalAddBacks).toBe(37640);
      expect(mira604.sectionD.totalCapitalAllowanceClaimed).toBe(39996);
      expect(mira604.sectionE.taxableIncomeBeforeLoss).toBe(411164);
      expect(mira604.sectionE.priorUnabsorbedLossClaimed).toBe(50000);
      expect(mira604.sectionE.netTaxableIncome).toBe(361164);
      expect(mira604.sectionF.totalTaxPayable).toBe(0);

      // 10. Multi-Return Reconciliation Suite
      const reconciliation = result.reconciliationReport;
      expect(reconciliation.entityId).toBe('1002938GST001');
      expect(reconciliation.taxYear).toBe(2026);
      expect(reconciliation.isValid).toBe(true);
      expect(reconciliation.issues.filter((i) => i.severity === 'ERROR')).toHaveLength(0);

      // 11. PDF Exports Verification
      expect(result.pdfExports.mira604Pdf).toBeDefined();
      expect(result.pdfExports.pnlPdf).toBeDefined();
      expect(result.pdfExports.assetRegisterPdf).toBeDefined();
      expect(result.pdfExports.mira105Pdf).toBeDefined();
      expect(result.pdfExports.mira302Pdf).toBeDefined();

      // 12. MIRA Offline Filing Package Generation & Validation
      const filingPackage = FilingPackageGenerator.generatePackage({
        tenantId,
        taxpayer: corporateTaxpayer,
        taxYear: 2026,
        sourceData: {
          taxpayer: {
            tin: corporateTaxpayer.tin,
            taxpayerName: corporateTaxpayer.taxpayerName,
            taxpayerType: 'COMPANY',
            taxYear: 2026,
            accountingPeriodStart: '2026-01-01',
            accountingPeriodEnd: '2026-12-31',
            presentationCurrency: 'MVR'
          },
          pnl: {
            grossRevenue: pnl.totalRevenue,
            costOfSales: pnl.totalCostOfSales,
            otherOperatingExpenses: pnl.totalOperatingExpenses
          },
          taxAdjustments: taxAdjustments.map(a => ({
            miraCode: a.miraCode,
            description: a.reason,
            amount: a.amount
          })),
          capitalAllowances: {
            electronicItEquipment: capAllowance.totalCapitalAllowanceClaimed
          }
        },
        mira604Return: mira604,
        fixedAssets,
        taxAdjustments
      });

      expect(filingPackage.manifest).toBeDefined();
      expect(filingPackage.manifest.statutoryNotice).toBe('Generated for taxpayer review and filing.');
      expect(filingPackage.manifest.totalFiles).toBeGreaterThanOrEqual(4);
      expect(filingPackage.manifest.packageSha256).toHaveLength(64);

      // Cryptographic verification: verify every entry in hashes.json matches sha256 of its content
      for (const [relPath, fileEntry] of filingPackage.files.entries()) {
        const computedSha256 = crypto.createHash('sha256').update(fileEntry.content).digest('hex');
        expect(fileEntry.sha256).toBe(computedSha256);
      }

      // Validate package with PackageValidator
      const pkgValidation = PackageValidator.validatePackage(filingPackage);
      expect(pkgValidation.isValid).toBe(true);
      expect(pkgValidation.errors).toHaveLength(0);
    });

    it('asserts profitable high-bracket scenario computes exact 15% corporate tax above threshold deterministically', async () => {
      // Scenario with MVR 1,800,000 revenue
      const highRevenueDoc: TransactionRecord = {
        transactionId: 'TX-HIGH-REV-01',
        sourceType: 'invoice',
        sourceId: 'INV-OUT-LARGE',
        entityId: corporateTaxpayer.tin,
        outletId: 'OUTLET-001',
        transactionDate: '2026-11-20',
        description: 'Large enterprise software license and cloud integration project',
        accountingCategory: 'revenue.operating',
        amount: 1800000,
        gstAmount: 144000,
        totalAmount: 1944000,
        miraCategory: 'REVENUE',
        accountingTreatment: 'REVENUE',
        incomeTaxTreatment: 'TAX_EXEMPT_INCOME',
        gstTreatment: 'STANDARD_RATED',
        taxYear: 2026,
        accountingPeriodStart: '2026-01-01',
        accountingPeriodEnd: '2026-12-31',
        reviewStatus: 'APPROVED',
        auditHistory: [],
        createdAt: new Date().toISOString()
      };

      const highExpenseDoc: TransactionRecord = {
        transactionId: 'TX-HIGH-EXP-01',
        sourceType: 'bill',
        sourceId: 'INV-SUB-LARGE',
        entityId: corporateTaxpayer.tin,
        outletId: 'OUTLET-001',
        transactionDate: '2026-11-25',
        description: 'Direct project sub-contractor delivery costs',
        accountingCategory: 'cost_of_sales.subcontractor',
        amount: 300000,
        gstAmount: 24000,
        totalAmount: 324000,
        miraCategory: 'COST_OF_SALES',
        accountingTreatment: 'COST_OF_SALES',
        incomeTaxTreatment: 'DEDUCTIBLE',
        gstTreatment: 'INPUT_TAX',
        taxYear: 2026,
        accountingPeriodStart: '2026-01-01',
        accountingPeriodEnd: '2026-12-31',
        reviewStatus: 'APPROVED',
        auditHistory: [],
        createdAt: new Date().toISOString()
      };

      const highPnl = generateSchedule1PnL([highRevenueDoc, highExpenseDoc], {
        entityId: corporateTaxpayer.tin,
        taxYear: 2026,
        accountingPeriodStart: '2026-01-01',
        accountingPeriodEnd: '2026-12-31'
      });

      expect(highPnl.totalRevenue).toBe(1800000);
      expect(highPnl.totalCostOfSales).toBe(300000);
      expect(highPnl.accountingProfitBeforeTax).toBe(1500000); // 1,800,000 - 300,000 = 1,500,000

      // Compute Entity Tax Liability:
      // Taxable Income: MVR 1,500,000
      // First MVR 500,000 @ 0% = MVR 0
      // Excess MVR 1,000,000 @ 15% = MVR 150,000.00
      const entityTaxResult = calculateEntityTaxLiability(1500000, 'COMPANY', {
        taxYear: 2026,
        accountingDays: 365,
        groupFactor: 1,
        priorUnabsorbedLosses: 0,
        entityName: corporateTaxpayer.taxpayerName,
        tin: corporateTaxpayer.tin
      });

      expect(entityTaxResult.grossTaxableIncome).toBe(1500000);
      expect(entityTaxResult.netTaxableIncome).toBe(1500000);
      expect(entityTaxResult.taxByBracket[0].bracketName).toContain('Tax Free');
      expect(entityTaxResult.taxByBracket[0].taxableInBracket).toBe(500000);
      expect(entityTaxResult.taxByBracket[0].taxInBracket).toBe(0);

      expect(entityTaxResult.taxByBracket[1].bracketName).toContain('15%');
      expect(entityTaxResult.taxByBracket[1].taxableInBracket).toBe(1000000);
      expect(entityTaxResult.taxByBracket[1].rate).toBe(0.15);
      expect(entityTaxResult.taxByBracket[1].taxInBracket).toBe(150000);

      expect(entityTaxResult.totalIncomeTaxDue).toBe(150000);
    });
  });

  describe('2. Negative Invariants & Intermediate Fault Detection', () => {
    it('fails deterministically if an invalid tax rate is introduced into validation', () => {
      const invalidGstData = {
        supplier: { name: 'Illegal Tax Supplier Ltd', tin: '1009999GST001' },
        invoice: { number: 'INV-BAD-RATE', date: '2026-04-01', gst_rate: 10, taxable_value: 10000, gst_amount: 1000, total: 11000 },
        tax_status: 'TAX_CHARGED' as const
      };

      const result = AIGovernanceService.performDeterministicValidation(invalidGstData, { isTourism: false });
      expect(result.isValid).toBe(false);
      expect(result.issues.some((i) => i.code === 'INVALID_STATUTORY_RATE')).toBe(true);
      expect(result.statutoryGstRateEnforced).toBe(8);
    });

    it('fails deterministically if an AI agent attempts to bypass approval or GL posting', () => {
      const mockExtraction = AIGovernanceService.recordAIExtraction({
        documentId: 'DOC-UNAPPROVED',
        tenantId,
        model: 'gemini-3.6-flash',
        modelVersion: '2026-02-stable',
        promptVersion: 'v2.4-compliance',
        confidence: { overall: 92 },
        rawResponseText: 'Unapproved raw output',
        normalizedOutput: {
          supplier: { name: 'Vendor A', tin: '1001111GST001' },
          invoice: { number: 'INV-1', date: '2026-01-01', gst_rate: 8, taxable_value: 5000, gst_amount: 400, total: 5400 },
          tax_status: 'TAX_CHARGED'
        }
      });

      // Assert AI cannot approve
      expect(() => {
        AIGovernanceService.approveExtraction(mockExtraction.metadata.extractionId, aiSession);
      }).toThrow(AIApprovalForbiddenError);

      // Assert posting is forbidden before approval
      expect(() => {
        AIGovernanceService.validatePostingEligibility(mockExtraction.metadata.extractionId, accountantSession);
      }).toThrow();
    });

    it('fails deterministically if AI session attempts to certify statutory tax liability directly', () => {
      expect(() => {
        AIGovernanceService.validateTaxLiabilityCalculation(361160, aiSession, true);
      }).toThrow(AITaxLiabilityCalculationForbiddenError);
    });
  });
});
