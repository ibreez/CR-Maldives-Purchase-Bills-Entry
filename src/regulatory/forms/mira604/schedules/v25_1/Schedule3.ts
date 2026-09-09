import Decimal from 'decimal.js';
import { TaxpayerType } from '../../../../types';
import { FormFieldDefinition, FieldSourceTrace, FormValidationResult, FormValidationError } from '../../../types';
import { Schedule3PersonalNetWorthData, ScheduleInstance, ScheduleApplicabilityResult } from '../types';

export const SCHEDULE_3_V25_1_FIELDS: FormFieldDefinition[] = [
  // Personal Assets
  {
    fieldCode: 'SCH3_A01_IMMOVABLE_PROPERTY',
    label: 'Immovable Property (Personal Real Estate & Land)',
    dataType: 'DECIMAL',
    required: false,
    source: 'USER_INPUT',
    applicability: 'INDIVIDUAL',
    ruleVersion: 'v25.1',
    sectionId: 'PERSONAL_ASSETS'
  },
  {
    fieldCode: 'SCH3_A02_VEHICLES_VESSELS',
    label: 'Vehicles, Vessels and Aircraft',
    dataType: 'DECIMAL',
    required: false,
    source: 'USER_INPUT',
    applicability: 'INDIVIDUAL',
    ruleVersion: 'v25.1',
    sectionId: 'PERSONAL_ASSETS'
  },
  {
    fieldCode: 'SCH3_A03_BANK_DEPOSITS_CASH',
    label: 'Bank Deposits, Savings and Cash Balances',
    dataType: 'DECIMAL',
    required: false,
    source: 'USER_INPUT',
    applicability: 'INDIVIDUAL',
    ruleVersion: 'v25.1',
    sectionId: 'PERSONAL_ASSETS'
  },
  {
    fieldCode: 'SCH3_A04_SHARES_SECURITIES',
    label: 'Shares, Bonds and Securities (Non-Business Portfolio)',
    dataType: 'DECIMAL',
    required: false,
    source: 'USER_INPUT',
    applicability: 'INDIVIDUAL',
    ruleVersion: 'v25.1',
    sectionId: 'PERSONAL_ASSETS'
  },
  {
    fieldCode: 'SCH3_A05_JEWELRY_VALUABLES',
    label: 'Precious Metals, Jewelry and High-Value Collectibles',
    dataType: 'DECIMAL',
    required: false,
    source: 'USER_INPUT',
    applicability: 'INDIVIDUAL',
    ruleVersion: 'v25.1',
    sectionId: 'PERSONAL_ASSETS'
  },
  {
    fieldCode: 'SCH3_A06_PERSONAL_RECEIVABLES',
    label: 'Personal Loans Receivable & Recoverable Debts',
    dataType: 'DECIMAL',
    required: false,
    source: 'USER_INPUT',
    applicability: 'INDIVIDUAL',
    ruleVersion: 'v25.1',
    sectionId: 'PERSONAL_ASSETS'
  },
  {
    fieldCode: 'SCH3_A07_OTHER_PERSONAL_ASSETS',
    label: 'Other Personal Assets',
    dataType: 'DECIMAL',
    required: false,
    source: 'USER_INPUT',
    applicability: 'INDIVIDUAL',
    ruleVersion: 'v25.1',
    sectionId: 'PERSONAL_ASSETS'
  },
  {
    fieldCode: 'SCH3_A08_TOTAL_PERSONAL_ASSETS',
    label: 'Total Personal Assets',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'INDIVIDUAL',
    ruleVersion: 'v25.1',
    sectionId: 'PERSONAL_ASSETS',
    formula: {
      formulaId: 'SCH3_F01',
      expression: 'SCH3_A01 + SCH3_A02 + SCH3_A03 + SCH3_A04 + SCH3_A05 + SCH3_A06 + SCH3_A07',
      description: 'Sum of all non-business personal assets',
      dependencies: ['SCH3_A01_IMMOVABLE_PROPERTY', 'SCH3_A02_VEHICLES_VESSELS', 'SCH3_A03_BANK_DEPOSITS_CASH', 'SCH3_A04_SHARES_SECURITIES', 'SCH3_A05_JEWELRY_VALUABLES', 'SCH3_A06_PERSONAL_RECEIVABLES', 'SCH3_A07_OTHER_PERSONAL_ASSETS']
    }
  },

  // Personal Liabilities
  {
    fieldCode: 'SCH3_B01_HOUSING_MORTGAGES',
    label: 'Housing Mortgages and Real Estate Loans',
    dataType: 'DECIMAL',
    required: false,
    source: 'USER_INPUT',
    applicability: 'INDIVIDUAL',
    ruleVersion: 'v25.1',
    sectionId: 'PERSONAL_LIABILITIES'
  },
  {
    fieldCode: 'SCH3_B02_PERSONAL_BANK_LOANS',
    label: 'Personal Bank Loans and Auto Loans',
    dataType: 'DECIMAL',
    required: false,
    source: 'USER_INPUT',
    applicability: 'INDIVIDUAL',
    ruleVersion: 'v25.1',
    sectionId: 'PERSONAL_LIABILITIES'
  },
  {
    fieldCode: 'SCH3_B03_CREDIT_CARDS_OTHER',
    label: 'Credit Cards, Personal Borrowings & Other Debts',
    dataType: 'DECIMAL',
    required: false,
    source: 'USER_INPUT',
    applicability: 'INDIVIDUAL',
    ruleVersion: 'v25.1',
    sectionId: 'PERSONAL_LIABILITIES'
  },
  {
    fieldCode: 'SCH3_B04_TOTAL_PERSONAL_LIABILITIES',
    label: 'Total Personal Liabilities',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'INDIVIDUAL',
    ruleVersion: 'v25.1',
    sectionId: 'PERSONAL_LIABILITIES',
    formula: {
      formulaId: 'SCH3_F02',
      expression: 'SCH3_B01 + SCH3_B02 + SCH3_B03',
      description: 'Sum of all non-business personal liabilities',
      dependencies: ['SCH3_B01_HOUSING_MORTGAGES', 'SCH3_B02_PERSONAL_BANK_LOANS', 'SCH3_B03_CREDIT_CARDS_OTHER']
    }
  },

  // Net Worth & Movements
  {
    fieldCode: 'SCH3_C01_NET_NON_BUSINESS_WORTH',
    label: 'Net Non-Business Worth',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'INDIVIDUAL',
    ruleVersion: 'v25.1',
    sectionId: 'NET_WORTH_SUMMARY',
    formula: {
      formulaId: 'SCH3_F03',
      expression: 'SCH3_A08_TOTAL_PERSONAL_ASSETS - SCH3_B04_TOTAL_PERSONAL_LIABILITIES',
      description: 'Total Personal Assets less Total Personal Liabilities',
      dependencies: ['SCH3_A08_TOTAL_PERSONAL_ASSETS', 'SCH3_B04_TOTAL_PERSONAL_LIABILITIES']
    }
  },
  {
    fieldCode: 'SCH3_C02_PREVIOUS_YEAR_NET_WORTH',
    label: 'Previous Year Net Non-Business Worth',
    dataType: 'DECIMAL',
    required: false,
    source: 'USER_INPUT',
    applicability: 'INDIVIDUAL',
    ruleVersion: 'v25.1',
    sectionId: 'NET_WORTH_SUMMARY'
  },
  {
    fieldCode: 'SCH3_C03_NET_WORTH_MOVEMENT',
    label: 'Annual Movement in Net Non-Business Worth',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'INDIVIDUAL',
    ruleVersion: 'v25.1',
    sectionId: 'NET_WORTH_SUMMARY',
    formula: {
      formulaId: 'SCH3_F04',
      expression: 'SCH3_C01_NET_NON_BUSINESS_WORTH - SCH3_C02_PREVIOUS_YEAR_NET_WORTH',
      description: 'Year-on-year increase or decrease in non-business net worth',
      dependencies: ['SCH3_C01_NET_NON_BUSINESS_WORTH', 'SCH3_C02_PREVIOUS_YEAR_NET_WORTH']
    }
  }
];

export class Schedule3 {
  public static readonly VERSION = 'v25.1';
  public static readonly CODE = 'SCHEDULE_3';
  public static readonly TITLE = 'Schedule 3: Statement of Net Worth Excluding Business';

  /**
   * Determines if Schedule 3 is applicable for this taxpayer profile
   */
  public static checkApplicability(
    taxpayerType: TaxpayerType,
    data?: Schedule3PersonalNetWorthData
  ): ScheduleApplicabilityResult {
    // Schedule 3 applies exclusively to individuals / sole proprietors
    const isIndividual = taxpayerType === 'INDIVIDUAL' || taxpayerType === 'SOLE_PROPRIETOR';

    if (!isIndividual) {
      return {
        scheduleCode: 'SCHEDULE_3',
        isApplicable: false,
        reason: `Schedule 3 applies only to individual taxpayers. Corporate/entity type (${taxpayerType}) is excluded.`
      };
    }

    const hasData = !!data && (
      Object.values(data.personalAssets || {}).some(v => (v || 0) > 0) ||
      Object.values(data.personalLiabilities || {}).some(v => (v || 0) > 0) ||
      (data.previousYearNetWorth || 0) > 0
    );

    if (hasData) {
      return {
        scheduleCode: 'SCHEDULE_3',
        isApplicable: true,
        reason: 'Applicable to individual taxpayer with non-business personal assets or liabilities reported.'
      };
    }

    return {
      scheduleCode: 'SCHEDULE_3',
      isApplicable: false,
      reason: 'No non-business personal assets or liabilities submitted for reporting.'
    };
  }

  /**
   * Generates and validates Schedule 3 instance
   */
  public static generate(
    sourceData: Schedule3PersonalNetWorthData | undefined,
    taxpayerType: TaxpayerType,
    taxYear: number
  ): ScheduleInstance<Schedule3PersonalNetWorthData> {
    const startTime = Date.now();
    const applicability = this.checkApplicability(taxpayerType, sourceData);
    const now = new Date().toISOString();
    const values: Record<string, any> = {};
    const traces: Record<string, FieldSourceTrace> = {};

    const d = (n?: number) => new Decimal(n || 0);

    if (!applicability.isApplicable || !sourceData) {
      return {
        scheduleCode: 'SCHEDULE_3',
        scheduleTitle: this.TITLE,
        version: this.VERSION,
        taxYear,
        isApplicable: false,
        applicabilityReason: applicability.reason,
        values: {},
        traces: {},
        validationResult: { isValid: true, errors: [], warnings: [] },
        status: 'NOT_APPLICABLE',
        metadata: {
          generatedAt: now,
          calculationDurationMs: Date.now() - startTime
        }
      };
    }

    // 1. Map Personal Assets
    const immovable = d(sourceData.personalAssets?.immovableProperties);
    const vehicles = d(sourceData.personalAssets?.vehiclesAndVessels);
    const bankCash = d(sourceData.personalAssets?.bankDepositsAndCash);
    const shares = d(sourceData.personalAssets?.sharesAndSecurities);
    const jewelry = d(sourceData.personalAssets?.jewelryAndValuables);
    const receivables = d(sourceData.personalAssets?.personalReceivables);
    const otherAst = d(sourceData.personalAssets?.otherPersonalAssets);
    const totalAssets = immovable.plus(vehicles).plus(bankCash).plus(shares).plus(jewelry).plus(receivables).plus(otherAst);

    values['SCH3_A01_IMMOVABLE_PROPERTY'] = immovable.toNumber();
    values['SCH3_A02_VEHICLES_VESSELS'] = vehicles.toNumber();
    values['SCH3_A03_BANK_DEPOSITS_CASH'] = bankCash.toNumber();
    values['SCH3_A04_SHARES_SECURITIES'] = shares.toNumber();
    values['SCH3_A05_JEWELRY_VALUABLES'] = jewelry.toNumber();
    values['SCH3_A06_PERSONAL_RECEIVABLES'] = receivables.toNumber();
    values['SCH3_A07_OTHER_PERSONAL_ASSETS'] = otherAst.toNumber();
    values['SCH3_A08_TOTAL_PERSONAL_ASSETS'] = totalAssets.toNumber();

    // 2. Map Personal Liabilities
    const mortgages = d(sourceData.personalLiabilities?.housingMortgages);
    const bankLoans = d(sourceData.personalLiabilities?.personalBankLoans);
    const cardsOther = d(sourceData.personalLiabilities?.creditCardsAndOther);
    const totalLiabilities = mortgages.plus(bankLoans).plus(cardsOther);

    values['SCH3_B01_HOUSING_MORTGAGES'] = mortgages.toNumber();
    values['SCH3_B02_PERSONAL_BANK_LOANS'] = bankLoans.toNumber();
    values['SCH3_B03_CREDIT_CARDS_OTHER'] = cardsOther.toNumber();
    values['SCH3_B04_TOTAL_PERSONAL_LIABILITIES'] = totalLiabilities.toNumber();

    // 3. Compute Net Worth & Movement
    const netWorth = totalAssets.minus(totalLiabilities);
    const priorNetWorth = d(sourceData.previousYearNetWorth);
    const movement = netWorth.minus(priorNetWorth);

    values['SCH3_C01_NET_NON_BUSINESS_WORTH'] = netWorth.toNumber();
    values['SCH3_C02_PREVIOUS_YEAR_NET_WORTH'] = priorNetWorth.toNumber();
    values['SCH3_C03_NET_WORTH_MOVEMENT'] = movement.toNumber();

    // 4. Build Source Traces
    const refs = sourceData.assetValuationReferences || {};
    const addTrace = (fieldCode: string, srcType: FieldSourceTrace['sourceType'], desc: string, refKey?: string, formula?: string, contrib?: string[]) => {
      traces[fieldCode] = {
        fieldCode,
        sourceType: srcType,
        sourceReferenceId: refKey ? refs[refKey] : undefined,
        sourceDescription: desc,
        appliedFormula: formula,
        contributingFields: contrib,
        calculationTimestamp: now
      };
    };

    addTrace('SCH3_A01_IMMOVABLE_PROPERTY', 'USER_INPUT', 'Personal real estate and residential land', 'IMMOVABLE_PROP');
    addTrace('SCH3_A02_VEHICLES_VESSELS', 'USER_INPUT', 'Personal motor vehicles, boats and vessels', 'VEHICLES');
    addTrace('SCH3_A03_BANK_DEPOSITS_CASH', 'USER_INPUT', 'Personal bank balances and deposits', 'BANK_DEPOSITS');
    addTrace('SCH3_A04_SHARES_SECURITIES', 'USER_INPUT', 'Personal portfolio stocks and bonds', 'SHARES');
    addTrace('SCH3_A05_JEWELRY_VALUABLES', 'USER_INPUT', 'Gold, jewelry and high-value collectibles', 'JEWELRY');
    addTrace('SCH3_A06_PERSONAL_RECEIVABLES', 'USER_INPUT', 'Personal loans given to third parties', 'RECEIVABLES');
    addTrace('SCH3_A07_OTHER_PERSONAL_ASSETS', 'USER_INPUT', 'Other miscellaneous personal assets', 'OTHER_ASSETS');
    addTrace('SCH3_A08_TOTAL_PERSONAL_ASSETS', 'CALCULATED', 'Total Non-Business Personal Assets', undefined, `${immovable} + ${vehicles} + ${bankCash} + ${shares} + ${jewelry} + ${receivables} + ${otherAst} = ${totalAssets}`, ['SCH3_A01_IMMOVABLE_PROPERTY', 'SCH3_A02_VEHICLES_VESSELS', 'SCH3_A03_BANK_DEPOSITS_CASH', 'SCH3_A04_SHARES_SECURITIES', 'SCH3_A05_JEWELRY_VALUABLES', 'SCH3_A06_PERSONAL_RECEIVABLES', 'SCH3_A07_OTHER_PERSONAL_ASSETS']);

    addTrace('SCH3_B01_HOUSING_MORTGAGES', 'USER_INPUT', 'Personal residential housing mortgages', 'MORTGAGES');
    addTrace('SCH3_B02_PERSONAL_BANK_LOANS', 'USER_INPUT', 'Personal bank and automobile borrowings', 'BANK_LOANS');
    addTrace('SCH3_B03_CREDIT_CARDS_OTHER', 'USER_INPUT', 'Personal credit cards and other debts', 'CREDIT_CARDS');
    addTrace('SCH3_B04_TOTAL_PERSONAL_LIABILITIES', 'CALCULATED', 'Total Non-Business Personal Liabilities', undefined, `${mortgages} + ${bankLoans} + ${cardsOther} = ${totalLiabilities}`, ['SCH3_B01_HOUSING_MORTGAGES', 'SCH3_B02_PERSONAL_BANK_LOANS', 'SCH3_B03_CREDIT_CARDS_OTHER']);

    addTrace('SCH3_C01_NET_NON_BUSINESS_WORTH', 'CALCULATED', 'Net Non-Business Worth', undefined, `${totalAssets} - ${totalLiabilities} = ${netWorth}`, ['SCH3_A08_TOTAL_PERSONAL_ASSETS', 'SCH3_B04_TOTAL_PERSONAL_LIABILITIES']);
    addTrace('SCH3_C02_PREVIOUS_YEAR_NET_WORTH', 'USER_INPUT', 'Comparative prior year personal net worth', 'PRIOR_NET_WORTH');
    addTrace('SCH3_C03_NET_WORTH_MOVEMENT', 'CALCULATED', 'Year-on-year net worth delta', undefined, `${netWorth} - ${priorNetWorth} = ${movement}`, ['SCH3_C01_NET_NON_BUSINESS_WORTH', 'SCH3_C02_PREVIOUS_YEAR_NET_WORTH']);

    // 5. Validation
    const errors: FormValidationError[] = [];
    const warnings: FormValidationError[] = [];

    if (totalAssets.lessThan(0)) {
      errors.push({
        fieldCode: 'SCH3_A08_TOTAL_PERSONAL_ASSETS',
        sectionId: 'PERSONAL_ASSETS',
        severity: 'ERROR',
        message: `Total Personal Assets cannot be negative (MVR ${totalAssets.toFixed(2)}).`
      });
    }

    if (totalLiabilities.lessThan(0)) {
      errors.push({
        fieldCode: 'SCH3_B04_TOTAL_PERSONAL_LIABILITIES',
        sectionId: 'PERSONAL_LIABILITIES',
        severity: 'ERROR',
        message: `Total Personal Liabilities cannot be negative (MVR ${totalLiabilities.toFixed(2)}).`
      });
    }

    const validationResult: FormValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings
    };

    return {
      scheduleCode: 'SCHEDULE_3',
      scheduleTitle: this.TITLE,
      version: this.VERSION,
      taxYear,
      isApplicable: true,
      applicabilityReason: applicability.reason,
      values,
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
