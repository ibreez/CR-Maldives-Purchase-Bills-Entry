/**
 * Types & Schemas for Offline MIRA Filing Package Engine (Phase 34)
 * 
 * Maldives Inland Revenue Authority (MIRA) Offline Filing Package Standard
 * Designed strictly for taxpayer review, offline verification, and statutory archival.
 */

import { MIRA604AccountingSourceData } from '../regulatory/forms/mira604/v25_1/mappings';
import { MIRA604SchedulesContext, ScheduleEngineResult } from '../regulatory/forms/mira604/schedules/types';
import { Mira604TaxReturn } from './mira604';
import { Mira205GeneralReturn, Mira206TourismReturn } from './gst';
import { Mira602Return } from './nwt';
import { ReconciliationSuiteResult, ReconciliationReport } from './reconciliation';
import { FixedAssetRecord, TransactionRecord } from './taxEngine';
import { TaxAdjustmentEntry } from './taxAdjustment';
import { TaxLossLot } from './taxLoss';
import { PreFilingResult } from './preFiling';

export type StatutoryFilingNotice = 'Generated for taxpayer review and filing.';

export interface FilingTaxpayerProfile {
  tin: string;
  taxpayerName: string;
  tradeName?: string;
  businessAddress?: string;
  entityType: string;
  contactEmail?: string;
  contactPhone?: string;
  taxYear?: number;
  accountingPeriodStart: string; // YYYY-MM-DD
  accountingPeriodEnd: string;   // YYYY-MM-DD
  accountingDays?: number;
  presentationCurrency?: string; // Default 'MVR'
  sector?: 'GENERAL' | 'TOURISM' | 'MIXED' | 'FINANCIAL' | 'OTHER';
  [key: string]: any;
}

export type TaxpayerProfile = FilingTaxpayerProfile;

export interface FilingManifest {
  schemaVersion: '1.0.0';
  packageVersion: string; // e.g. 'v25.1'
  tenant: string;
  TIN: string;
  taxpayer: {
    taxpayerName: string;
    tin: string;
    entityType: string;
    businessAddress?: string;
    contactEmail?: string;
    contactPhone?: string;
  };
  taxYear: number;
  accountingPeriod: {
    startDate: string;
    endDate: string;
    accountingDays: number;
    presentationCurrency: string;
  };
  formVersions: {
    MIRA604?: string;
    MIRA205?: string;
    MIRA206?: string;
    MIRA602?: string;
    [key: string]: string | undefined;
  };
  regulatoryVersions: string[];
  generatedAt: string; // ISO 8601 UTC timestamp
  
  // Mandatory Statutory Filing Notice
  notice: StatutoryFilingNotice;
  statutoryNotice?: StatutoryFilingNotice; // Alias for test compatibility
  
  // Explicit Non-Transmission Governance
  submissionState: {
    isSubmitted: false;
    transmissionAttempted: false;
    submissionStatus: 'OFFLINE_PACKAGE_GENERATED_FOR_REVIEW' | 'READY_FOR_FILING';
    disclaimer: string;
  };
  submissionStatus?: 'OFFLINE_PACKAGE_GENERATED_FOR_REVIEW' | 'READY_FOR_FILING';

  // Phase 45 Pre-Filing Statutory Check Result
  preFilingCheck?: PreFilingResult;

  // Map of relative file paths inside the package to SHA-256 hashes
  documentHashes: Record<string, string>;

  // Package Root Digest (SHA-256 of canonical sorted documentHashes)
  packageChecksum: string;
  packageSha256?: string; // Alias for test compatibility
  totalFiles?: number; // Alias for test compatibility

  summary: {
    formsIncluded: string[];
    schedulesIncluded: string[];
    reconciliationStatus: 'PASS' | 'WARNING' | 'FAIL' | 'REVIEW_REQUIRED';
    totalFilesCount: number;
    totalSizeBytes: number;
  };
}

export interface PackageFileEntry {
  relativePath: string;
  contentType: 'application/json' | 'application/pdf' | 'text/html' | 'text/csv' | 'text/plain';
  content: Buffer;
  sha256: string;
  sizeBytes: number;
}

export interface FilingPackageInput {
  tenantId?: string;
  taxpayer: FilingTaxpayerProfile | any;
  taxYear?: number;
  fixedTimestamp?: string; // Used for deterministic regeneration tests

  // Source Data
  sourceData?: MIRA604AccountingSourceData;
  mira604Return?: Mira604TaxReturn;
  mira205Return?: Mira205GeneralReturn;
  mira206Return?: Mira206TourismReturn;
  mira602Return?: Mira602Return;

  // Schedules & Computations
  schedulesInput?: MIRA604SchedulesContext;
  schedulesResult?: ScheduleEngineResult;
  fixedAssets?: FixedAssetRecord[];
  taxAdjustments?: TaxAdjustmentEntry[] | any[];
  taxLossLots?: TaxLossLot[];
  transactions?: TransactionRecord[];

  // Reconciliation context
  reconciliationContext?: any;
  reconciliationResult?: ReconciliationSuiteResult | ReconciliationReport;

  // Additional Supporting Documents
  supportingDocuments?: {
    customLedgerCsv?: string;
    auditTrailJson?: Record<string, any>;
    withholdingCertificates?: any[];
  };

  // Phase 45 Pre-Filing Readiness Controls
  targetStatus?: 'READY_FOR_FILING' | 'OFFLINE_PACKAGE_GENERATED_FOR_REVIEW';
  enforcePreFilingReadiness?: boolean;
  preFilingResult?: PreFilingResult;
  bills?: any[];
  journals?: any[];
  periodInfo?: any;
  periodStatus?: string;
  periodApproved?: boolean;
  trialBalance?: {
    totalDebits: number;
    totalCredits: number;
    difference?: number;
    isBalanced?: boolean;
    accounts?: any[];
  };
  gstReconciliation?: {
    isReconciled?: boolean;
    variance?: number;
  };
  nwtReconciliation?: {
    isReconciled?: boolean;
    variance?: number;
  };
  miraReturnValid?: boolean;
  approvals?: {
    preparer?: boolean | { name?: string; date?: string; role?: string };
    reviewer?: boolean | { name?: string; date?: string; role?: string };
    director?: boolean | { name?: string; date?: string; role?: string };
    [key: string]: any;
  };
  auditLogs?: any[];

  options?: {
    regulatoryVersion?: string;
    includeHtmlPdfExports?: boolean;
    customOutputDir?: string;
    requireReadyForFiling?: boolean;
  };
}

export interface PackageValidationIssue {
  field: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface PackageValidationResult {
  isValid: boolean;
  errors: PackageValidationIssue[];
  warnings: PackageValidationIssue[];
}

export interface FilingPackageResult {
  manifest: FilingManifest;
  hashes: {
    algorithm: 'SHA-256';
    generatedAt: string;
    packageChecksum: string;
    files: Record<string, string>;
  };
  packageChecksum?: string;
  files: Map<string, PackageFileEntry> & { length?: number };
  fileList: PackageFileEntry[];
  validationResult: PackageValidationResult;
  outputDirectory?: string;
}
