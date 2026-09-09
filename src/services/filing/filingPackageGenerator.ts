/**
 * Offline MIRA Filing Package Generator (Phase 34)
 * 
 * Generates an immutable, fully audit-traceable, offline filing package for taxpayer review and statutory archival.
 * 
 * CRITICAL STATUTORY CONSTRAINTS:
 * 1. Do NOT implement MIRAconnect transmission.
 * 2. MIRAconnect is explicitly excluded from this offline production workflow.
 * 3. Mandatory filing notice: "Generated for taxpayer review and filing."
 * 4. NEVER state "Filed with MIRA."
 * 5. Full cryptographic hash verification and deterministic regeneration.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  FilingPackageInput,
  FilingPackageResult,
  FilingManifest,
  PackageFileEntry,
  StatutoryFilingNotice
} from '../../types/filingPackage';
import { PreFilingResult } from '../../types/preFiling';
import { PreFilingControlEngine, PreFilingBlockedError } from './preFilingControlEngine';
import { MIRA604AccountingSourceData } from '../../regulatory/forms/mira604/v25_1/mappings';
import { PackageValidator } from './packageValidator';
import { MIRA604Generator } from '../../regulatory/forms/mira604/MIRA604Generator';
import { MIRA604ScheduleEngine } from '../../regulatory/forms/mira604/schedules/MIRA604ScheduleEngine';
import { generateTaxReturnPdfSync, exportLedgerToCsv } from '../reports/pdfExportService';
import { runFullReconciliationSuite } from '../reconciliation/reconciliationEngine';

export { PreFilingBlockedError };

export class FilingPackageGenerator {
  public static readonly STATUTORY_NOTICE: StatutoryFilingNotice = 'Generated for taxpayer review and filing.';

  /**
   * Generates a complete, offline MIRA statutory filing package.
   *
   * @param input Complete package generation parameters and domain datasets
   * @returns FilingPackageResult containing manifest, hashes.json, virtual filesystem, and file entries
   */
  public static generatePackage(input: FilingPackageInput): FilingPackageResult {
    // 1. Enforce strict validation gates; block if mandatory data is missing
    const validationResult = PackageValidator.validate(input);
    if (!validationResult.isValid) {
      const errorMsg = validationResult.errors.map((e) => `[${e.field}] ${e.message}`).join('; ');
      throw new Error(`Filing Package Generation Blocked: Mandatory form data is missing or invalid. Details: ${errorMsg}`);
    }

    // 1.1 Phase 45 — Pre-Filing Control Engine: Refuse generation if requested ready for filing but blocking issues exist
    const isReadyForFilingRequested =
      input.targetStatus === 'READY_FOR_FILING' ||
      input.enforcePreFilingReadiness === true ||
      input.options?.requireReadyForFiling === true;

    let preFilingResult: PreFilingResult | undefined = input.preFilingResult;
    if (!preFilingResult && (isReadyForFilingRequested || input.bills || input.journals || input.periodInfo || input.trialBalance || input.gstReconciliation || input.nwtReconciliation)) {
      preFilingResult = PreFilingControlEngine.runPreFilingCheck({
        tenantId: input.tenantId,
        outletId: (input as any).outletId,
        period: (input as any).period || `${input.taxYear || input.taxpayer?.taxYear}`,
        periodStatus: input.periodStatus,
        periodApproved: input.periodApproved,
        trialBalance: input.trialBalance,
        gstReconciliation: input.gstReconciliation,
        nwtReconciliation: input.nwtReconciliation,
        miraReturnValid: input.miraReturnValid,
        approvals: input.approvals,
        taxYear: input.taxYear || input.taxpayer?.taxYear,
        bills: input.bills,
        journals: input.journals,
        assets: input.fixedAssets,
        taxAdjustments: input.taxAdjustments,
        taxLossLots: input.taxLossLots,
        auditLogs: input.auditLogs,
        periodInfo: input.periodInfo,
        miraReturns: {
          mira604: input.mira604Return,
          mira205: input.mira205Return,
          mira206: input.mira206Return,
          mira602: input.mira602Return
        },
        reconciliationResult: input.reconciliationResult
      });
    }

    if (isReadyForFilingRequested && preFilingResult) {
      if (preFilingResult.status !== 'READY_FOR_FILING' || preFilingResult.blockingIssues.length > 0) {
        const issueSummary = preFilingResult.blockingIssues
          .map((iss, idx) => `  ${idx + 1}. [${iss.checkCode}] ${iss.title}: ${iss.detail}`)
          .join('\n');
        throw new PreFilingBlockedError(
          `Pre-filing package generation refused: Cannot generate 'READY_FOR_FILING' package. Found ${preFilingResult.blockingIssues.length} blocking issue(s):\n${issueSummary}`,
          preFilingResult
        );
      }
    }

    const tp = input.taxpayer;
    const taxYear = input.taxYear || tp.taxYear;
    const generatedAt = input.fixedTimestamp || new Date().toISOString();
    const regulatoryVersion = input.options?.regulatoryVersion || 'v25.1';

    // File buffer store: relative path -> PackageFileEntry
    const files = new Map<string, PackageFileEntry>();

    function addFile(
      relPath: string,
      contentBuffer: Buffer,
      contentType: PackageFileEntry['contentType']
    ) {
      const normalizedPath = relPath.replace(/\\/g, '/');
      const sha256 = crypto.createHash('sha256').update(contentBuffer).digest('hex');
      const entry: PackageFileEntry = {
        relativePath: normalizedPath,
        contentType,
        content: contentBuffer,
        sha256,
        sizeBytes: contentBuffer.length
      };
      files.set(normalizedPath, entry);
      return entry;
    }

    function addJsonFile(relPath: string, jsonObject: any) {
      const canonicalJson = JSON.stringify(jsonObject, Object.keys(jsonObject).sort(), 2);
      const buf = Buffer.from(canonicalJson, 'utf-8');
      return addFile(relPath, buf, 'application/json');
    }

    // 2. Process MIRA 604 Form & Statutory Schedules
    let mira604Return = input.mira604Return;
    let schedulesResult = input.schedulesResult;

    if (input.sourceData) {
      const sourceDataWithTaxpayer: MIRA604AccountingSourceData = {
        ...input.sourceData,
        taxpayer: input.sourceData.taxpayer || (input.sourceData as any).taxpayerInfo || {
          tin: tp.tin,
          taxpayerName: tp.taxpayerName,
          taxpayerType: (tp.entityType === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'COMPANY') as any,
          taxYear,
          accountingPeriodStart: tp.accountingPeriodStart,
          accountingPeriodEnd: tp.accountingPeriodEnd,
          businessActivity: tp.sector,
          presentationCurrency: (tp.presentationCurrency as any) || 'MVR'
        }
      };

      if (!sourceDataWithTaxpayer.taxpayer.taxpayerType) {
        sourceDataWithTaxpayer.taxpayer.taxpayerType = (tp.entityType === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'COMPANY') as any;
      }
      if (!sourceDataWithTaxpayer.taxpayer.taxYear) {
        sourceDataWithTaxpayer.taxpayer.taxYear = taxYear;
      }
      if (!sourceDataWithTaxpayer.taxpayer.tin) {
        sourceDataWithTaxpayer.taxpayer.tin = tp.tin;
      }
      if (!sourceDataWithTaxpayer.taxpayer.taxpayerName) {
        sourceDataWithTaxpayer.taxpayer.taxpayerName = tp.taxpayerName;
      }

      const formResult = MIRA604Generator.generateForm(sourceDataWithTaxpayer, regulatoryVersion);
      schedulesResult = formResult.schedulesResult;
      
      // Adapt generated form to standard MIRA604 format for report rendering
      const values = formResult.formInstance.values;
      mira604Return = {
        formId: formResult.formInstance.formId,
        formVersion: 'V25.1',
        submissionStatus: 'READY_FOR_FILING',
        generatedAt,
        sectionA_TaxpayerInfo: {
          tin: String(values['F604_A01_TIN'] || tp.tin),
          taxpayerName: String(values['F604_A02_TAXPAYER_NAME'] || tp.taxpayerName),
          entityType: (values['F604_A03_TAXPAYER_TYPE'] || tp.entityType) as any,
          taxYear: Number(values['F604_A04_TAX_YEAR'] || taxYear),
          accountingPeriodStart: String(values['F604_A05_PERIOD_START'] || tp.accountingPeriodStart),
          accountingPeriodEnd: String(values['F604_A06_PERIOD_END'] || tp.accountingPeriodEnd),
          businessActivity: tp.sector
        },
        sectionB_Schedule1PnL: {
          grossRevenue: Number(values['F604_B01_GROSS_REVENUE'] || 0),
          costOfSales: Number(values['F604_B02_COST_OF_SALES'] || 0),
          grossProfit: Number(values['F604_B03_GROSS_PROFIT'] || 0),
          otherIncome: Number(values['F604_B11_TOTAL_OTHER_INCOME'] || 0),
          operatingExpenses: Number(values['F604_B21_TOTAL_OPERATING_EXPENSES'] || 0),
          accountingProfitBeforeTax: Number(values['F604_B22_NET_PROFIT_BEFORE_TAX'] || 0)
        },
        sectionC_TaxAdjustments: {
          itemizedAddBacks: input.taxAdjustments?.filter((a) => (a as any).direction === 'ADD_BACK' || (a as any).category === 'ADD_BACK') || [],
          totalAddBacks: Number(values['F604_C08_TOTAL_TAX_ADDITIONS'] || 0),
          itemizedDeductions: input.taxAdjustments?.filter((a) => (a as any).direction === 'DEDUCTION' || (a as any).category === 'DEDUCTION') || [],
          totalDeductions: Number(values['F604_C12_TOTAL_TAX_DEDUCTIONS'] || 0),
          netTaxAdjustments: Number(values['F604_C13_NET_TAX_ADJUSTMENTS'] || 0)
        },
        sectionD_CapitalAllowances: {
          totalClaimableCapitalAllowance: Number(values['F604_D09_TOTAL_CAPITAL_ALLOWANCE'] || 0)
        },
        sectionE_TaxableIncomeLoss: {
          adjustedTaxableProfitBeforeLoss: Number(values['F604_E01_ADJ_TAXABLE_PROFIT_BEFORE_LOSS'] || 0),
          priorUnabsorbedLosses: Number(values['F604_E04_VALID_LOSSES_BROUGHT_FORWARD'] || 0),
          lossCarriedForwardApplied: Number(values['F604_E05_LOSS_RELIEF_UTILIZED'] || 0),
          remainingUnabsorbedLoss: Number(values['F604_E07_REMAINING_UNABSORBED_LOSS_CF'] || 0),
          netTaxableIncome: Number(values['F604_E08_NET_TAXABLE_INCOME'] || 0),
          isTaxLoss: Number(values['F604_E06_CURRENT_YEAR_TAX_LOSS'] || 0) > 0,
          taxLossAmount: Number(values['F604_E06_CURRENT_YEAR_TAX_LOSS'] || 0)
        },
        sectionF_TaxComputation: {
          taxByBracket: values['F604_F02_TAX_BRACKET_DETAILS'] || [],
          totalTaxPayable: Number(values['F604_F03_GROSS_TAX_LIABILITY'] || 0),
          advanceTaxPaid: Number(values['F604_G01_ADVANCE_TAX_PAID'] || 0),
          interimTaxPaid: Number(values['F604_G02_INTERIM_TAX_PAID'] || 0),
          withholdingTaxDeducted: Number(values['F604_G04_WHT_DEDUCTED'] || 0),
          totalPrepayments: Number(values['F604_G07_TOTAL_PREPAYMENTS_AND_WHT'] || 0),
          netTaxDueOrRefundable: Number(values['F604_G08_NET_BALANCE_DUE_OR_REFUNDABLE'] || 0),
          effectiveTaxRate: Number(values['F604_F08_EFFECTIVE_TAX_RATE'] || 0)
        }
      };
    } else if (input.schedulesInput && !schedulesResult) {
      schedulesResult = MIRA604ScheduleEngine.processSchedules(input.schedulesInput);
    }

    // Add MIRA604 PDF/HTML Document
    if (mira604Return) {
      const htmlOrBuf = generateTaxReturnPdfSync('MIRA604', {
        ...mira604Return,
        generatedAt
      });
      const buf = Buffer.isBuffer(htmlOrBuf) ? htmlOrBuf : Buffer.from(htmlOrBuf as any, 'utf-8');
      addFile('MIRA604.pdf', buf, 'application/pdf');
    }

    // 3. Add MIRA 205 (General Sector GST Return) where applicable
    if (input.mira205Return) {
      const htmlOrBuf = generateTaxReturnPdfSync('MIRA205', {
        ...input.mira205Return,
        generatedAt
      });
      const buf = Buffer.isBuffer(htmlOrBuf) ? htmlOrBuf : Buffer.from(htmlOrBuf as any, 'utf-8');
      addFile('MIRA205.pdf', buf, 'application/pdf');
    }

    // 4. Add MIRA 206 (Tourism Sector TGST Return) where applicable
    if (input.mira206Return) {
      const htmlOrBuf = generateTaxReturnPdfSync('MIRA206', {
        ...input.mira206Return,
        generatedAt
      });
      const buf = Buffer.isBuffer(htmlOrBuf) ? htmlOrBuf : Buffer.from(htmlOrBuf as any, 'utf-8');
      addFile('MIRA206.pdf', buf, 'application/pdf');
    }

    // 5. Add MIRA 602 (Non-Resident Withholding Tax Return) where applicable
    if (input.mira602Return) {
      const htmlOrBuf = generateTaxReturnPdfSync('MIRA602', {
        ...input.mira602Return,
        generatedAt
      });
      const buf = Buffer.isBuffer(htmlOrBuf) ? htmlOrBuf : Buffer.from(htmlOrBuf as any, 'utf-8');
      addFile('MIRA602.pdf', buf, 'application/pdf');
    }

    // 6. Generate Statutory Schedules under /schedules/
    // Schedule 2: Statement of Financial Position (Balance Sheet)
    if (schedulesResult?.schedule2) {
      addJsonFile('schedules/schedule-2-balance-sheet.json', schedulesResult.schedule2);
      const sch2Html = generateTaxReturnPdfSync('SCHEDULE2', {
        schedule2: schedulesResult.schedule2,
        entityName: tp.taxpayerName,
        tin: tp.tin,
        taxYear,
        generatedAt
      });
      addFile('schedules/schedule-2-balance-sheet.pdf', Buffer.from(sch2Html as any, 'utf-8'), 'application/pdf');
    } else {
      // Default empty Schedule 2 placeholder
      addJsonFile('schedules/schedule-2-balance-sheet.json', {
        scheduleId: 'SCHEDULE_2_BALANCE_SHEET',
        isApplicable: false,
        taxYear,
        notice: 'Schedule 2 not required or omitted for individual taxpayers without balance sheet filing requirement.'
      });
    }

    // Schedule 3: Statement of Net Worth / Tax Loss Matrix
    if (schedulesResult?.schedule3) {
      addJsonFile('schedules/schedule-3-net-worth.json', schedulesResult.schedule3);
    } else {
      addJsonFile('schedules/schedule-3-net-worth.json', {
        scheduleId: 'SCHEDULE_3_NET_WORTH',
        isApplicable: false,
        taxYear,
        notice: 'Applicable for individual taxpayers with business income exceeding statutory threshold.'
      });
    }

    // Schedule 4: International Transactions with Associates
    if (schedulesResult?.schedule4) {
      addJsonFile('schedules/schedule-4-related-party.json', schedulesResult.schedule4);
    } else {
      addJsonFile('schedules/schedule-4-related-party.json', {
        scheduleId: 'SCHEDULE_4_RELATED_PARTY_TRANSACTIONS',
        isApplicable: false,
        taxYear,
        notice: 'No international transactions with associates reported.'
      });
    }

    // Schedule 5: Controlled Foreign Entities (CFE)
    if (schedulesResult?.schedule5) {
      addJsonFile('schedules/schedule-5-cfe.json', schedulesResult.schedule5);
    } else {
      addJsonFile('schedules/schedule-5-cfe.json', {
        scheduleId: 'SCHEDULE_5_CFE_INCOME',
        isApplicable: false,
        taxYear,
        notice: 'No controlled foreign entities held by taxpayer.'
      });
    }

    // 7. Generate Tax Calculation under /tax-calculation/
    const taxCalcSummary = {
      taxpayer: {
        tin: tp.tin,
        taxpayerName: tp.taxpayerName,
        taxYear,
        entityType: tp.entityType
      },
      pnlSummary: mira604Return?.sectionB_Schedule1PnL || {},
      taxAdjustmentsSummary: mira604Return?.sectionC_TaxAdjustments || {},
      capitalAllowancesSummary: mira604Return?.sectionD_CapitalAllowances || {},
      taxableIncomeLossSummary: mira604Return?.sectionE_TaxableIncomeLoss || {},
      taxComputationSummary: mira604Return?.sectionF_TaxComputation || {},
      generatedAt
    };
    addJsonFile('tax-calculation/tax-computation.json', taxCalcSummary);

    if (input.taxAdjustments) {
      addJsonFile('tax-calculation/tax-adjustments.json', {
        totalAdjustments: input.taxAdjustments.length,
        adjustments: input.taxAdjustments,
        generatedAt
      });
    }

    if (input.fixedAssets) {
      addJsonFile('tax-calculation/capital-allowance.json', {
        totalAssets: input.fixedAssets.length,
        fixedAssets: input.fixedAssets,
        generatedAt
      });
    }

    if (input.taxLossLots) {
      addJsonFile('tax-calculation/tax-loss-lots.json', {
        totalLots: input.taxLossLots.length,
        lots: input.taxLossLots,
        generatedAt
      });
    }

    // 8. Generate Reconciliation under /reconciliation/
    let reconResult = input.reconciliationResult;
    if (!reconResult && input.reconciliationContext) {
      reconResult = runFullReconciliationSuite(input.reconciliationContext);
    }

    if (reconResult) {
      addJsonFile('reconciliation/reconciliation-report.json', reconResult);
      const reconHtml = generateTaxReturnPdfSync('RECONCILIATION_REPORT', {
        ...reconResult,
        taxpayerName: tp.taxpayerName,
        tin: tp.tin,
        taxYear,
        generatedAt
      });
      addFile('reconciliation/reconciliation-report.pdf', reconHtml, 'application/pdf');
    } else {
      addJsonFile('reconciliation/reconciliation-report.json', {
        status: 'OMITTED',
        notice: 'Cross-module reconciliation audit report not attached to this filing package.'
      });
    }

    // 9. Supporting Documents under /supporting-documents/
    if (input.transactions && input.transactions.length > 0) {
      const csvStr = exportLedgerToCsv(input.transactions);
      addFile('supporting-documents/ledger-extract.csv', Buffer.from(csvStr, 'utf-8'), 'text/csv');
    } else if (input.supportingDocuments?.customLedgerCsv) {
      addFile('supporting-documents/ledger-extract.csv', Buffer.from(input.supportingDocuments.customLedgerCsv, 'utf-8'), 'text/csv');
    }

    if (input.fixedAssets && input.fixedAssets.length > 0) {
      addJsonFile('supporting-documents/fixed-asset-register.json', {
        entityId: tp.tin,
        taxYear,
        fixedAssets: input.fixedAssets
      });
    }

    if (input.supportingDocuments?.withholdingCertificates) {
      addJsonFile('supporting-documents/nwt-withholding-certificates.json', {
        certificates: input.supportingDocuments.withholdingCertificates
      });
    }

    if (input.supportingDocuments?.auditTrailJson) {
      addJsonFile('supporting-documents/audit-trail.json', input.supportingDocuments.auditTrailJson);
    } else {
      addJsonFile('supporting-documents/audit-trail.json', {
        tenantId: input.tenantId,
        tin: tp.tin,
        packageGeneratedAt: generatedAt,
        notice: FilingPackageGenerator.STATUTORY_NOTICE,
        governingLaw: 'Maldives Income Tax Act (Act No. 25/2019) & GST Act (Act No. 10/2011)'
      });
    }

    // 10. Build hashes.json & manifest.json
    // Document hashes map for all generated files (excluding manifest and hashes.json themselves)
    const documentHashes: Record<string, string> = {};
    const sortedFileKeys = Array.from(files.keys()).sort();

    let totalSizeBytes = 0;
    for (const key of sortedFileKeys) {
      const fileEntry = files.get(key)!;
      documentHashes[key] = fileEntry.sha256;
      totalSizeBytes += fileEntry.sizeBytes;
    }

    // Package root checksum: SHA-256 of all canonical document hashes
    const canonicalHashesString = Object.keys(documentHashes)
      .sort()
      .map((k) => `${k}:${documentHashes[k]}`)
      .join('\n');
    const packageChecksum = crypto.createHash('sha256').update(canonicalHashesString).digest('hex');

    // Create hashes.json
    const hashesPayload = {
      algorithm: 'SHA-256' as const,
      generatedAt,
      packageChecksum,
      files: documentHashes
    };
    addJsonFile('hashes.json', hashesPayload);

    // Create manifest.json
    const formsIncluded: string[] = [];
    if (files.has('MIRA604.pdf')) formsIncluded.push('MIRA604');
    if (files.has('MIRA205.pdf')) formsIncluded.push('MIRA205');
    if (files.has('MIRA206.pdf')) formsIncluded.push('MIRA206');
    if (files.has('MIRA602.pdf')) formsIncluded.push('MIRA602');

    const schedulesIncluded: string[] = [];
    if (files.has('schedules/schedule-2-balance-sheet.json')) schedulesIncluded.push('Schedule 2');
    if (files.has('schedules/schedule-3-net-worth.json')) schedulesIncluded.push('Schedule 3');
    if (files.has('schedules/schedule-4-related-party.json')) schedulesIncluded.push('Schedule 4');
    if (files.has('schedules/schedule-5-cfe.json')) schedulesIncluded.push('Schedule 5');

    const formVersions: Record<string, string> = {
      MIRA604: regulatoryVersion,
      ...(input.mira205Return ? { MIRA205: 'v25.1' } : {}),
      ...(input.mira206Return ? { MIRA206: 'v25.1' } : {}),
      ...(input.mira602Return ? { MIRA602: 'v25.1' } : {})
    };

    if (preFilingResult) {
      addJsonFile('controls/pre_filing_readiness_report.json', preFilingResult);
    }

    const effectiveTenant = input.tenantId || (tp as any).tenantId || tp.tin || 'default-tenant';

    const manifest: FilingManifest = {
      schemaVersion: '1.0.0',
      packageVersion: regulatoryVersion,
      tenant: effectiveTenant,
      TIN: tp.tin,
      taxpayer: {
        taxpayerName: tp.taxpayerName,
        tin: tp.tin,
        entityType: tp.entityType,
        businessAddress: tp.businessAddress,
        contactEmail: tp.contactEmail,
        contactPhone: tp.contactPhone
      },
      taxYear,
      accountingPeriod: {
        startDate: tp.accountingPeriodStart,
        endDate: tp.accountingPeriodEnd,
        accountingDays: tp.accountingDays || 365,
        presentationCurrency: tp.presentationCurrency || 'MVR'
      },
      formVersions,
      regulatoryVersions: [regulatoryVersion, 'v24.1', 'v23.1', 'v20.1'],
      generatedAt,
      notice: FilingPackageGenerator.STATUTORY_NOTICE,
      statutoryNotice: FilingPackageGenerator.STATUTORY_NOTICE,
      submissionStatus:
        isReadyForFilingRequested && preFilingResult?.status === 'READY_FOR_FILING'
          ? 'READY_FOR_FILING'
          : 'OFFLINE_PACKAGE_GENERATED_FOR_REVIEW',
      submissionState: {
        isSubmitted: false,
        transmissionAttempted: false,
        submissionStatus:
          isReadyForFilingRequested && preFilingResult?.status === 'READY_FOR_FILING'
            ? 'READY_FOR_FILING'
            : 'OFFLINE_PACKAGE_GENERATED_FOR_REVIEW',
        disclaimer: 'Generated for taxpayer review and filing. This offline package has NOT been transmitted or filed with MIRA.'
      },
      preFilingCheck: preFilingResult,
      documentHashes,
      packageChecksum,
      packageSha256: packageChecksum,
      totalFiles: files.size + 1,
      summary: {
        formsIncluded,
        schedulesIncluded,
        reconciliationStatus: reconResult ? ((reconResult as any).overallStatus || (reconResult as any).status || 'VERIFIED') : 'REVIEW_REQUIRED',
        totalFilesCount: files.size + 1, // Including manifest.json itself
        totalSizeBytes
      }
    };

    addJsonFile('manifest.json', manifest);

    // If custom output directory is requested, export files to disk
    let outputDirectory: string | undefined;
    if (input.options?.customOutputDir) {
      outputDirectory = this.exportToDirectory(files, input.options.customOutputDir);
    }

    // Ensure compatibility with tests checking files.length
    Object.defineProperty(files, 'length', {
      get: () => files.size,
      configurable: true
    });

    return {
      manifest,
      hashes: hashesPayload,
      packageChecksum: manifest.packageChecksum,
      files,
      fileList: Array.from(files.values()),
      validationResult,
      outputDirectory
    };
  }

  /**
   * Phase 45 — Generates an authoritative 'READY_FOR_FILING' statutory package.
   * Strictly enforces pre-filing control and refuses generation if ANY blocking issue exists.
   *
   * @param input Package input parameters
   * @throws PreFilingBlockedError if any pre-filing blocking issue is detected
   */
  public static generateReadyForFilingPackage(input: FilingPackageInput): FilingPackageResult {
    return this.generatePackage({
      ...input,
      targetStatus: 'READY_FOR_FILING',
      enforcePreFilingReadiness: true
    });
  }

  /**
   * Verifies the cryptographic integrity of a generated filing package against its hashes.
   *
   * @param packageResult The filing package result to verify
   * @returns Verification boolean and detailed comparison breakdown
   */
  public static verifyPackageIntegrity(packageResult: FilingPackageResult): {
    isValid: boolean;
    verifiedFilesCount: number;
    mismatches: string[];
  } {
    const mismatches: string[] = [];
    const documentHashes = packageResult.manifest.documentHashes;
    let verifiedCount = 0;

    for (const [relPath, expectedHash] of Object.entries(documentHashes)) {
      const fileEntry = packageResult.files.get(relPath);
      if (!fileEntry) {
        mismatches.push(`File missing in package: ${relPath}`);
        continue;
      }
      const actualHash = crypto.createHash('sha256').update(fileEntry.content).digest('hex');
      if (actualHash !== expectedHash) {
        mismatches.push(`Hash mismatch for ${relPath}: Expected ${expectedHash}, Actual ${actualHash}`);
      } else {
        verifiedCount++;
      }
    }

    // Verify package root checksum
    const canonicalHashesString = Object.keys(documentHashes)
      .sort()
      .map((k) => `${k}:${documentHashes[k]}`)
      .join('\n');
    const calculatedRoot = crypto.createHash('sha256').update(canonicalHashesString).digest('hex');
    if (calculatedRoot !== packageResult.manifest.packageChecksum) {
      mismatches.push(`Package root checksum mismatch: Expected ${packageResult.manifest.packageChecksum}, Actual ${calculatedRoot}`);
    }

    return {
      isValid: mismatches.length === 0,
      verifiedFilesCount: verifiedCount,
      mismatches
    };
  }

  /**
   * Exports all virtual package files to physical disk in directory structure.
   */
  public static exportToDirectory(files: Map<string, PackageFileEntry>, targetDir: string): string {
    const resolvedBase = path.resolve(targetDir);
    if (!fs.existsSync(resolvedBase)) {
      fs.mkdirSync(resolvedBase, { recursive: true });
    }

    for (const [relPath, entry] of files.entries()) {
      const fullPath = path.join(resolvedBase, relPath);
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(fullPath, entry.content);
    }

    return resolvedBase;
  }
}
