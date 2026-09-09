import Decimal from 'decimal.js';
import { TaxpayerType } from '../../../../types';
import { FormFieldDefinition, FieldSourceTrace, FormValidationResult, FormValidationError } from '../../../types';
import { Schedule5SourceData, ControlledForeignEntityRecord, ScheduleInstance, ScheduleApplicabilityResult } from '../types';

export const SCHEDULE_5_V25_1_FIELDS: FormFieldDefinition[] = [
  // General Applicability & CFE Status
  {
    fieldCode: 'SCH5_A01_HAS_CFE_INTERESTS',
    label: 'Holds Direct or Indirect Controlling Interests in Foreign Entities',
    dataType: 'BOOLEAN',
    required: true,
    source: 'USER_INPUT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'GENERAL_DISCLOSURE'
  },
  {
    fieldCode: 'SCH5_A02_CFE_RECORDS_COUNT',
    label: 'Total Controlled Foreign Entities Reported',
    dataType: 'NUMBER',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'GENERAL_DISCLOSURE'
  },

  // CFE Financial Totals
  {
    fieldCode: 'SCH5_B01_TOTAL_CFE_ACCOUNTING_PROFIT',
    label: 'Total Accounting Net Profit of Reported CFEs',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'CFE_FINANCIAL_TOTALS'
  },
  {
    fieldCode: 'SCH5_B02_TOTAL_CFE_FOREIGN_TAX_PAID',
    label: 'Total Foreign Income Tax Paid by CFEs',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'CFE_FINANCIAL_TOTALS'
  },

  // Taxable Attributions & Credits
  {
    fieldCode: 'SCH5_C01_TOTAL_ATTRIBUTABLE_CFE_INCOME',
    label: 'Total Attributable CFE Taxable Income (Section 20)',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'CFE_TAX_ATTRIBUTION',
    description: 'Total share of foreign entity taxable profit to be included in Maldives gross income'
  },
  {
    fieldCode: 'SCH5_C02_TOTAL_CFE_FOREIGN_TAX_CREDIT',
    label: 'Total Allowable Foreign Tax Credit on CFE Income (Section 50)',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'CFE_TAX_ATTRIBUTION',
    description: 'Foreign tax credit relief available against Maldives tax on attributable CFE income'
  }
];

export class Schedule5 {
  public static readonly VERSION = 'v25.1';
  public static readonly CODE = 'SCHEDULE_5';
  public static readonly TITLE = 'Schedule 5: Reporting of Share of Taxable Income from Controlled Foreign Entities';

  /**
   * Determines if Schedule 5 is applicable
   */
  public static checkApplicability(
    taxpayerType: TaxpayerType,
    data?: Schedule5SourceData
  ): ScheduleApplicabilityResult {
    const hasFlag = data?.hasControlledForeignEntities === true;
    const hasRecords = !!data?.controlledForeignEntities && data.controlledForeignEntities.length > 0;

    if (hasFlag || hasRecords) {
      return {
        scheduleCode: 'SCHEDULE_5',
        isApplicable: true,
        reason: 'Applicable due to controlling interests held in foreign resident entities (Section 20 of Income Tax Act).'
      };
    }

    return {
      scheduleCode: 'SCHEDULE_5',
      isApplicable: false,
      reason: 'No controlled foreign entities (CFE) reported for this tax year.'
    };
  }

  /**
   * Generates and validates Schedule 5 instance
   */
  public static generate(
    sourceData: Schedule5SourceData | undefined,
    taxpayerType: TaxpayerType,
    taxYear: number
  ): ScheduleInstance<Schedule5SourceData> {
    const startTime = Date.now();
    const applicability = this.checkApplicability(taxpayerType, sourceData);
    const now = new Date().toISOString();
    const values: Record<string, any> = {};
    const traces: Record<string, FieldSourceTrace> = {};

    if (!applicability.isApplicable || !sourceData) {
      return {
        scheduleCode: 'SCHEDULE_5',
        scheduleTitle: this.TITLE,
        version: this.VERSION,
        taxYear,
        isApplicable: false,
        applicabilityReason: applicability.reason,
        values: {},
        items: [],
        traces: {},
        validationResult: { isValid: true, errors: [], warnings: [] },
        status: 'NOT_APPLICABLE',
        metadata: {
          generatedAt: now,
          calculationDurationMs: Date.now() - startTime
        }
      };
    }

    const cfes: ControlledForeignEntityRecord[] = sourceData.controlledForeignEntities || [];
    const d = (n?: number) => new Decimal(n || 0);

    let totalAccountingProfit = new Decimal(0);
    let totalForeignTaxPaid = new Decimal(0);
    let totalAttributableIncome = new Decimal(0);
    let totalForeignTaxCredit = new Decimal(0);

    const processedItems: Array<ControlledForeignEntityRecord & { effectiveForeignTaxRate: number }> = [];

    for (const cfe of cfes) {
      const profit = d(cfe.accountingNetProfit);
      const taxPaid = d(cfe.foreignIncomeTaxPaid);
      const controlPct = d(cfe.totalControlPercentage).dividedBy(100);

      totalAccountingProfit = totalAccountingProfit.plus(profit);
      totalForeignTaxPaid = totalForeignTaxPaid.plus(taxPaid);

      // Effective tax rate
      const effectiveRate = profit.greaterThan(0) 
        ? taxPaid.dividedBy(profit).times(100).toNumber() 
        : 0;

      // Determine attributable income based on statutory exemption tests:
      // Active business exception, minimum tax rate met (>15% / comparable rate), or de minimis threshold
      let attrIncome = new Decimal(0);
      let ftcShare = new Decimal(0);

      if (cfe.exemptionReason === 'NOT_EXEMPT' || !cfe.exemptionReason) {
        // If not exempt, attribute profit proportionally to control percentage
        if (profit.greaterThan(0)) {
          attrIncome = profit.times(controlPct);
          ftcShare = taxPaid.times(controlPct);
        }
      }

      totalAttributableIncome = totalAttributableIncome.plus(attrIncome);
      totalForeignTaxCredit = totalForeignTaxCredit.plus(ftcShare);

      processedItems.push({
        ...cfe,
        effectiveForeignTaxRate: Number(effectiveRate.toFixed(2)),
        attributableTaxableIncome: attrIncome.toNumber(),
        foreignTaxCreditShare: ftcShare.toNumber()
      });
    }

    values['SCH5_A01_HAS_CFE_INTERESTS'] = true;
    values['SCH5_A02_CFE_RECORDS_COUNT'] = cfes.length;
    values['SCH5_B01_TOTAL_CFE_ACCOUNTING_PROFIT'] = totalAccountingProfit.toNumber();
    values['SCH5_B02_TOTAL_CFE_FOREIGN_TAX_PAID'] = totalForeignTaxPaid.toNumber();
    values['SCH5_C01_TOTAL_ATTRIBUTABLE_CFE_INCOME'] = totalAttributableIncome.toNumber();
    values['SCH5_C02_TOTAL_CFE_FOREIGN_TAX_CREDIT'] = totalForeignTaxCredit.toNumber();

    // Source Traces
    const addTrace = (fieldCode: string, srcType: FieldSourceTrace['sourceType'], desc: string, formula?: string, contrib?: string[]) => {
      traces[fieldCode] = {
        fieldCode,
        sourceType: srcType,
        sourceDescription: desc,
        appliedFormula: formula,
        contributingFields: contrib,
        calculationTimestamp: now
      };
    };

    addTrace('SCH5_A01_HAS_CFE_INTERESTS', 'USER_INPUT', 'Affirmation of controlled foreign entity interests');
    addTrace('SCH5_A02_CFE_RECORDS_COUNT', 'CALCULATED', 'Total CFE entities reported', `${cfes.length} entities`);
    addTrace('SCH5_B01_TOTAL_CFE_ACCOUNTING_PROFIT', 'CALCULATED', 'Aggregate accounting profit across all reported CFEs');
    addTrace('SCH5_B02_TOTAL_CFE_FOREIGN_TAX_PAID', 'CALCULATED', 'Aggregate foreign corporate income tax paid by CFEs');
    addTrace('SCH5_C01_TOTAL_ATTRIBUTABLE_CFE_INCOME', 'CALCULATED', 'Total Section 20 taxable income attributed to Maldives taxpayer', `Sum of non-exempt attributable profits = MVR ${totalAttributableIncome.toFixed(2)}`);
    addTrace('SCH5_C02_TOTAL_CFE_FOREIGN_TAX_CREDIT', 'CALCULATED', 'Total Section 50 foreign tax credit relief available on CFE income', `Sum of allowable foreign tax credits = MVR ${totalForeignTaxCredit.toFixed(2)}`);

    // Validation
    const errors: FormValidationError[] = [];
    const warnings: FormValidationError[] = [];

    if (cfes.length === 0) {
      errors.push({
        fieldCode: 'SCH5_A02_CFE_RECORDS_COUNT',
        sectionId: 'GENERAL_DISCLOSURE',
        severity: 'ERROR',
        message: 'Schedule 5 is triggered but no Controlled Foreign Entity records were provided.'
      });
    }

    cfes.forEach((cfe, idx) => {
      if (!cfe.cfeName || cfe.cfeName.trim() === '') {
        errors.push({
          fieldCode: `SCH5_CFE_${idx}_NAME`,
          sectionId: 'CFE_ITEMS',
          severity: 'ERROR',
          message: `CFE entry #${idx + 1}: Entity legal name is mandatory.`
        });
      }

      if (!cfe.countryOfTaxResidence || cfe.countryOfTaxResidence.trim() === '' || cfe.countryOfTaxResidence.toUpperCase() === 'MV' || cfe.countryOfTaxResidence.toUpperCase() === 'MALDIVES') {
        errors.push({
          fieldCode: `SCH5_CFE_${idx}_COUNTRY`,
          sectionId: 'CFE_ITEMS',
          severity: 'ERROR',
          message: `CFE entry #${idx + 1}: Country of tax residence must be a foreign jurisdiction outside Maldives.`
        });
      }

      if (cfe.totalControlPercentage <= 0 || cfe.totalControlPercentage > 100) {
        errors.push({
          fieldCode: `SCH5_CFE_${idx}_CONTROL_PCT`,
          sectionId: 'CFE_ITEMS',
          severity: 'ERROR',
          message: `CFE entry #${idx + 1}: Control percentage (${cfe.totalControlPercentage}%) must be between 1% and 100%.`
        });
      }

      if (cfe.totalControlPercentage <= 50) {
        warnings.push({
          fieldCode: `SCH5_CFE_${idx}_CONTROL_THRESHOLD`,
          sectionId: 'CFE_ITEMS',
          severity: 'WARNING',
          message: `CFE entry #${idx + 1} (${cfe.cfeName}): Total control percentage is ${cfe.totalControlPercentage}% (standard CFE statutory threshold is >50% unless effective economic control exists under Section 20).`
        });
      }

      if (cfe.foreignIncomeTaxPaid < 0) {
        errors.push({
          fieldCode: `SCH5_CFE_${idx}_TAX_PAID`,
          sectionId: 'CFE_ITEMS',
          severity: 'ERROR',
          message: `CFE entry #${idx + 1}: Foreign income tax paid cannot be negative.`
        });
      }
    });

    const validationResult: FormValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings
    };

    return {
      scheduleCode: 'SCHEDULE_5',
      scheduleTitle: this.TITLE,
      version: this.VERSION,
      taxYear,
      isApplicable: true,
      applicabilityReason: applicability.reason,
      values,
      items: processedItems,
      traces,
      validationResult,
      status: validationResult.isValid ? 'VALIDATED' : 'REJECTED',
      metadata: {
        generatedAt: now,
        calculationDurationMs: Date.now() - startTime
      }
    };
  }
}
