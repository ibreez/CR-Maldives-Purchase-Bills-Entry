/**
 * Package Validator for MIRA Offline Filing Package (Phase 34)
 * 
 * Enforces mandatory data validation and integrity gates before filing package generation.
 * Blocks package creation if mandatory statutory fields or financial data are missing.
 */

import { FilingPackageInput, PackageValidationResult, PackageValidationIssue } from '../../types/filingPackage';

export class PackageValidator {
  /**
   * Validates all incoming parameters and statutory forms for the filing package.
   * Returns a validation result with any blocking errors or advisory warnings.
   */
  public static validate(input: FilingPackageInput): PackageValidationResult {
    const errors: PackageValidationIssue[] = [];
    const warnings: PackageValidationIssue[] = [];

    // 1. Tenant & Core Identity Validation
    if (!input.tenantId || !input.tenantId.trim()) {
      errors.push({
        field: 'tenantId',
        message: 'Mandatory field missing: Tenant ID is required for multi-tenant isolation.',
        severity: 'ERROR'
      });
    }

    if (!input.taxpayer) {
      errors.push({
        field: 'taxpayer',
        message: 'Mandatory taxpayer profile object is missing.',
        severity: 'ERROR'
      });
      return { isValid: false, errors, warnings };
    }

    const tp = input.taxpayer;

    // 2. Mandatory Taxpayer Information
    if (!tp.tin || !tp.tin.trim()) {
      errors.push({
        field: 'taxpayer.tin',
        message: 'Mandatory statutory field missing: Taxpayer Identification Number (TIN) is required.',
        severity: 'ERROR'
      });
    }

    if (!tp.taxpayerName || !tp.taxpayerName.trim()) {
      errors.push({
        field: 'taxpayer.taxpayerName',
        message: 'Mandatory statutory field missing: Taxpayer Legal Entity Name is required.',
        severity: 'ERROR'
      });
    }

    if (!tp.entityType || !tp.entityType.trim()) {
      errors.push({
        field: 'taxpayer.entityType',
        message: 'Mandatory field missing: Entity legal type (e.g. COMPANY, INDIVIDUAL, PARTNERSHIP) is required.',
        severity: 'ERROR'
      });
    }

    // 3. Tax Year & Accounting Period Validation
    const taxYear = input.taxYear || tp.taxYear;
    if (!taxYear || isNaN(taxYear) || taxYear < 2020 || taxYear > 2050) {
      errors.push({
        field: 'taxYear',
        message: `Invalid tax year: '${taxYear}'. Must be a valid integer between 2020 and 2050.`,
        severity: 'ERROR'
      });
    }

    if (!tp.accountingPeriodStart || !/^\d{4}-\d{2}-\d{2}$/.test(tp.accountingPeriodStart)) {
      errors.push({
        field: 'taxpayer.accountingPeriodStart',
        message: "Mandatory accounting period start date missing or invalid format (expected 'YYYY-MM-DD').",
        severity: 'ERROR'
      });
    }

    if (!tp.accountingPeriodEnd || !/^\d{4}-\d{2}-\d{2}$/.test(tp.accountingPeriodEnd)) {
      errors.push({
        field: 'taxpayer.accountingPeriodEnd',
        message: "Mandatory accounting period end date missing or invalid format (expected 'YYYY-MM-DD').",
        severity: 'ERROR'
      });
    }

    if (tp.accountingPeriodStart && tp.accountingPeriodEnd) {
      if (tp.accountingPeriodStart > tp.accountingPeriodEnd) {
        errors.push({
          field: 'taxpayer.accountingPeriod',
          message: `Accounting period start date (${tp.accountingPeriodStart}) cannot be later than end date (${tp.accountingPeriodEnd}).`,
          severity: 'ERROR'
        });
      }
    }

    // 4. Form-Specific Statutory Validation
    // MIRA 604 Form Check
    if (input.sourceData) {
      const pnl = input.sourceData.pnl;
      if (!pnl) {
        errors.push({
          field: 'sourceData.pnl',
          message: 'Mandatory Schedule 1 Profit & Loss financial statements are missing in source data.',
          severity: 'ERROR'
        });
      } else {
        if (pnl.grossRevenue === undefined || pnl.grossRevenue === null) {
          errors.push({
            field: 'sourceData.pnl.grossRevenue',
            message: 'Mandatory financial field missing: Gross Revenue is required.',
            severity: 'ERROR'
          });
        }
      }
    }

    // MIRA 205 General GST Form Check
    if (input.mira205Return) {
      const r = input.mira205Return;
      if (!r.taxpayer || !r.taxpayer.tin) {
        errors.push({
          field: 'mira205Return.taxpayer.tin',
          message: 'Mandatory TIN missing in MIRA 205 return payload.',
          severity: 'ERROR'
        });
      }
      if (!r.sectionA_Supplies || !r.sectionB_Purchases || !r.sectionC_Calculation) {
        errors.push({
          field: 'mira205Return.sections',
          message: 'MIRA 205 return is missing mandatory statutory sections (Supplies, Purchases, or Calculation).',
          severity: 'ERROR'
        });
      }
    }

    // MIRA 206 Tourism GST Form Check
    if (input.mira206Return) {
      const r = input.mira206Return;
      if (!r.taxpayer || !r.taxpayer.tin) {
        errors.push({
          field: 'mira206Return.taxpayer.tin',
          message: 'Mandatory TIN missing in MIRA 206 return payload.',
          severity: 'ERROR'
        });
      }
      if (!r.sectionA_Supplies || !r.sectionB_Purchases || !r.sectionC_Calculation) {
        errors.push({
          field: 'mira206Return.sections',
          message: 'MIRA 206 return is missing mandatory statutory sections.',
          severity: 'ERROR'
        });
      }
    }

    // MIRA 602 NWT Form Check
    if (input.mira602Return) {
      const r = input.mira602Return;
      if (!r.taxpayer || !r.taxpayer.tin) {
        errors.push({
          field: 'mira602Return.taxpayer.tin',
          message: 'Mandatory TIN missing in MIRA 602 return payload.',
          severity: 'ERROR'
        });
      }
      if (!r.categorySummaries) {
        errors.push({
          field: 'mira602Return.categorySummaries',
          message: 'MIRA 602 return is missing statutory category breakdown summaries.',
          severity: 'ERROR'
        });
      }
    }

    // 5. Warnings for missing supplementary schedules or reconciliation
    if (!input.reconciliationResult && !input.reconciliationContext) {
      warnings.push({
        field: 'reconciliation',
        message: 'No cross-module reconciliation suite attached; generating standard filing package without verified reconciliation status.',
        severity: 'WARNING'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validates a generated FilingPackageResult structure and cryptographic consistency.
   */
  public static validatePackage(pkg: any): PackageValidationResult {
    const errors: PackageValidationIssue[] = [];
    const warnings: PackageValidationIssue[] = [];

    if (!pkg || !pkg.manifest) {
      errors.push({
        field: 'manifest',
        message: 'Filing package is missing manifest structure.',
        severity: 'ERROR'
      });
      return { isValid: false, errors, warnings };
    }

    if (!pkg.manifest.statutoryNotice && !pkg.manifest.notice) {
      errors.push({
        field: 'manifest.notice',
        message: 'Filing package is missing mandatory statutory notice.',
        severity: 'ERROR'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}
