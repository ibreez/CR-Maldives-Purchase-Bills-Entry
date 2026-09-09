import Decimal from 'decimal.js';
import { FormFieldDefinition, FormValidationError, FormValidationResult } from '../../types';
import { MIRA604_V25_1_FIELDS } from './fields';

function toDec(val: any): Decimal {
  if (val === undefined || val === null || val === '') return new Decimal(0);
  try {
    return new Decimal(val);
  } catch {
    return new Decimal(0);
  }
}

export const MIRA604_V25_1_VALIDATIONS = {
  /**
   * Validates a complete form instance against v25.1 specifications
   */
  validateForm(
    formValues: Record<string, any>,
    fields: FormFieldDefinition[] = MIRA604_V25_1_FIELDS
  ): FormValidationResult {
    const errors: FormValidationError[] = [];
    const warnings: FormValidationError[] = [];

    const fieldMap = new Map<string, FormFieldDefinition>();
    for (const f of fields) {
      fieldMap.set(f.fieldCode, f);
    }

    // 1. Validate Required Fields & Data Types
    for (const field of fields) {
      const val = formValues[field.fieldCode];
      const isRequired = typeof field.required === 'function' 
        ? field.required(formValues) 
        : field.required;

      if (isRequired && (val === undefined || val === null || val === '')) {
        errors.push({
          fieldCode: field.fieldCode,
          sectionId: field.sectionId,
          severity: 'ERROR',
          message: `Mandatory field '${field.label}' (${field.fieldCode}) is required for MIRA 604 v25.1 filing.`
        });
        continue;
      }

      // Pattern validation if present
      if (val !== undefined && val !== null && val !== '' && field.validation?.pattern) {
        if (!field.validation.pattern.test(String(val))) {
          errors.push({
            fieldCode: field.fieldCode,
            sectionId: field.sectionId,
            severity: 'ERROR',
            message: `Field '${field.label}' value '${val}' does not conform to the required pattern.`
          });
        }
      }

      // Numeric range validations
      if (val !== undefined && val !== null && val !== '' && field.dataType === 'NUMBER') {
        const num = Number(val);
        if (isNaN(num)) {
          errors.push({
            fieldCode: field.fieldCode,
            sectionId: field.sectionId,
            severity: 'ERROR',
            message: `Field '${field.label}' must be a valid number.`
          });
        } else {
          if (field.validation?.min !== undefined && num < field.validation.min) {
            errors.push({
              fieldCode: field.fieldCode,
              sectionId: field.sectionId,
              severity: 'ERROR',
              message: `Field '${field.label}' value ${num} is below minimum allowed ${field.validation.min}.`
            });
          }
          if (field.validation?.max !== undefined && num > field.validation.max) {
            errors.push({
              fieldCode: field.fieldCode,
              sectionId: field.sectionId,
              severity: 'ERROR',
              message: `Field '${field.label}' value ${num} exceeds maximum allowed ${field.validation.max}.`
            });
          }
        }
      }
    }

    // 2. Specific Section A Business Rules
    const taxYear = Number(formValues['F604_A04_TAX_YEAR']);
    if (taxYear && taxYear < 2024) {
      warnings.push({
        fieldCode: 'F604_A04_TAX_YEAR',
        sectionId: 'SECTION_A',
        severity: 'WARNING',
        message: `MIRA 604 form version v25.1 is officially prescribed from tax year 2024 onward. Selected year is ${taxYear}.`
      });
    }

    const startDateStr = formValues['F604_A05_PERIOD_START'];
    const endDateStr = formValues['F604_A06_PERIOD_END'];
    if (startDateStr && endDateStr) {
      const start = new Date(startDateStr);
      const end = new Date(endDateStr);
      if (start > end) {
        errors.push({
          fieldCode: 'F604_A05_PERIOD_START',
          sectionId: 'SECTION_A',
          severity: 'ERROR',
          message: `Accounting period start date (${startDateStr}) cannot be after end date (${endDateStr}).`
        });
      }
    }

    // 3. Section H Declaration Checks
    if (formValues['F604_H05_CONFIRMATION_ACCEPTED'] !== true) {
      errors.push({
        fieldCode: 'F604_H05_CONFIRMATION_ACCEPTED',
        sectionId: 'SECTION_H',
        severity: 'ERROR',
        message: 'The statutory declaration affirmation must be accepted to validate the return.'
      });
    }

    // 4. Arithmetic Consistency Checks
    // Check Gross Profit: Revenue - Cost of Sales
    if (formValues['F604_B01_GROSS_REVENUE'] !== undefined && formValues['F604_B02_COST_OF_SALES'] !== undefined && formValues['F604_B03_GROSS_PROFIT'] !== undefined) {
      const expectedGP = toDec(formValues['F604_B01_GROSS_REVENUE']).minus(toDec(formValues['F604_B02_COST_OF_SALES']));
      const actualGP = toDec(formValues['F604_B03_GROSS_PROFIT']);
      if (!expectedGP.equals(actualGP)) {
        errors.push({
          fieldCode: 'F604_B03_GROSS_PROFIT',
          sectionId: 'SECTION_B',
          severity: 'ERROR',
          message: `Gross Profit discrepancy: Expected ${expectedGP.toFixed(2)} (Revenue ${formValues['F604_B01_GROSS_REVENUE']} - CoS ${formValues['F604_B02_COST_OF_SALES']}), but found ${actualGP.toFixed(2)}.`
        });
      }
    }

    // Check Net Tax Adjustments: Additions - Deductions
    if (formValues['F604_C08_TOTAL_TAX_ADDITIONS'] !== undefined && formValues['F604_C12_TOTAL_TAX_DEDUCTIONS'] !== undefined && formValues['F604_C13_NET_TAX_ADJUSTMENTS'] !== undefined) {
      const expectedNetAdj = toDec(formValues['F604_C08_TOTAL_TAX_ADDITIONS']).minus(toDec(formValues['F604_C12_TOTAL_TAX_DEDUCTIONS']));
      const actualNetAdj = toDec(formValues['F604_C13_NET_TAX_ADJUSTMENTS']);
      if (!expectedNetAdj.equals(actualNetAdj)) {
        errors.push({
          fieldCode: 'F604_C13_NET_TAX_ADJUSTMENTS',
          sectionId: 'SECTION_C',
          severity: 'ERROR',
          message: `Net Tax Adjustments discrepancy: Expected ${expectedNetAdj.toFixed(2)}, found ${actualNetAdj.toFixed(2)}.`
        });
      }
    }

    // Check Net Taxable Income >= 0
    if (formValues['F604_E08_NET_TAXABLE_INCOME'] !== undefined) {
      const netTaxable = toDec(formValues['F604_E08_NET_TAXABLE_INCOME']);
      if (netTaxable.lt(0)) {
        errors.push({
          fieldCode: 'F604_E08_NET_TAXABLE_INCOME',
          sectionId: 'SECTION_E',
          severity: 'ERROR',
          message: `Net Taxable Income cannot be negative (${netTaxable.toFixed(2)}). Loss must be recorded under Current Year Tax Loss.`
        });
      }
    }

    // Check Loss relief not exceeding valid loss or taxable profit
    if (formValues['F604_E05_LOSS_RELIEF_UTILIZED'] !== undefined && formValues['F604_E04_VALID_LOSSES_BROUGHT_FORWARD'] !== undefined) {
      const utilized = toDec(formValues['F604_E05_LOSS_RELIEF_UTILIZED']);
      const validLoss = toDec(formValues['F604_E04_VALID_LOSSES_BROUGHT_FORWARD']);
      if (utilized.gt(validLoss)) {
        errors.push({
          fieldCode: 'F604_E05_LOSS_RELIEF_UTILIZED',
          sectionId: 'SECTION_E',
          severity: 'ERROR',
          message: `Loss relief claimed (${utilized.toFixed(2)}) exceeds eligible losses brought forward (${validLoss.toFixed(2)}).`
        });
      }
    }

    // Check Prepayment reconciliation
    if (formValues['F604_F07_NET_TAX_LIABILITY'] !== undefined && formValues['F604_G07_TOTAL_PREPAYMENTS_AND_WHT'] !== undefined && formValues['F604_G08_NET_BALANCE_DUE_OR_REFUNDABLE'] !== undefined) {
      const expectedBalance = toDec(formValues['F604_F07_NET_TAX_LIABILITY']).minus(toDec(formValues['F604_G07_TOTAL_PREPAYMENTS_AND_WHT']));
      const actualBalance = toDec(formValues['F604_G08_NET_BALANCE_DUE_OR_REFUNDABLE']);
      if (!expectedBalance.equals(actualBalance)) {
        errors.push({
          fieldCode: 'F604_G08_NET_BALANCE_DUE_OR_REFUNDABLE',
          sectionId: 'SECTION_G',
          severity: 'ERROR',
          message: `Net Balance Due / Refundable discrepancy: Expected ${expectedBalance.toFixed(2)}, found ${actualBalance.toFixed(2)}.`
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
};
