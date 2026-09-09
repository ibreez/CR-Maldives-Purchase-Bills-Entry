import Decimal from 'decimal.js';
import { TaxpayerType } from '../../../../types';
import { FormFieldDefinition, FieldSourceTrace, FormValidationResult, FormValidationError } from '../../../types';
import { Schedule2BalanceSheetData, ScheduleInstance, ScheduleApplicabilityResult } from '../types';

export const SCHEDULE_2_V25_1_FIELDS: FormFieldDefinition[] = [
  // Non-Current Assets
  {
    fieldCode: 'SCH2_A01_PPE',
    label: 'Property, Plant and Equipment',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'NON_CURRENT_ASSETS'
  },
  {
    fieldCode: 'SCH2_A02_INVESTMENT_PROPERTY',
    label: 'Investment Property',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'NON_CURRENT_ASSETS'
  },
  {
    fieldCode: 'SCH2_A03_INTANGIBLES',
    label: 'Intangible Assets and Goodwill',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'NON_CURRENT_ASSETS'
  },
  {
    fieldCode: 'SCH2_A04_LONG_TERM_INVESTMENTS',
    label: 'Long-Term Financial Investments',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'NON_CURRENT_ASSETS'
  },
  {
    fieldCode: 'SCH2_A05_OTHER_NON_CURRENT_ASSETS',
    label: 'Other Non-Current Assets',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'NON_CURRENT_ASSETS'
  },
  {
    fieldCode: 'SCH2_A06_TOTAL_NON_CURRENT_ASSETS',
    label: 'Total Non-Current Assets',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'NON_CURRENT_ASSETS',
    formula: {
      formulaId: 'SCH2_F01',
      expression: 'SCH2_A01 + SCH2_A02 + SCH2_A03 + SCH2_A04 + SCH2_A05',
      description: 'Sum of all non-current asset classes',
      dependencies: ['SCH2_A01_PPE', 'SCH2_A02_INVESTMENT_PROPERTY', 'SCH2_A03_INTANGIBLES', 'SCH2_A04_LONG_TERM_INVESTMENTS', 'SCH2_A05_OTHER_NON_CURRENT_ASSETS']
    }
  },

  // Current Assets
  {
    fieldCode: 'SCH2_A07_INVENTORIES',
    label: 'Inventories & Work in Progress',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'CURRENT_ASSETS'
  },
  {
    fieldCode: 'SCH2_A08_TRADE_RECEIVABLES',
    label: 'Trade and Other Receivables',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'CURRENT_ASSETS'
  },
  {
    fieldCode: 'SCH2_A09_CASH_EQUIVALENTS',
    label: 'Cash and Cash Equivalents',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'CURRENT_ASSETS'
  },
  {
    fieldCode: 'SCH2_A10_SHORT_TERM_INVESTMENTS',
    label: 'Short-Term Liquid Investments',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'CURRENT_ASSETS'
  },
  {
    fieldCode: 'SCH2_A11_PREPAYMENTS_OTHER_CURRENT',
    label: 'Prepayments and Other Current Assets',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'CURRENT_ASSETS'
  },
  {
    fieldCode: 'SCH2_A12_TOTAL_CURRENT_ASSETS',
    label: 'Total Current Assets',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'CURRENT_ASSETS',
    formula: {
      formulaId: 'SCH2_F02',
      expression: 'SCH2_A07 + SCH2_A08 + SCH2_A09 + SCH2_A10 + SCH2_A11',
      description: 'Sum of all current asset classes',
      dependencies: ['SCH2_A07_INVENTORIES', 'SCH2_A08_TRADE_RECEIVABLES', 'SCH2_A09_CASH_EQUIVALENTS', 'SCH2_A10_SHORT_TERM_INVESTMENTS', 'SCH2_A11_PREPAYMENTS_OTHER_CURRENT']
    }
  },
  {
    fieldCode: 'SCH2_A13_TOTAL_ASSETS',
    label: 'Total Assets',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'BALANCE_SHEET_TOTALS',
    formula: {
      formulaId: 'SCH2_F03',
      expression: 'SCH2_A06_TOTAL_NON_CURRENT_ASSETS + SCH2_A12_TOTAL_CURRENT_ASSETS',
      description: 'Sum of Total Non-Current Assets and Total Current Assets',
      dependencies: ['SCH2_A06_TOTAL_NON_CURRENT_ASSETS', 'SCH2_A12_TOTAL_CURRENT_ASSETS']
    }
  },

  // Equity / Net Worth
  {
    fieldCode: 'SCH2_B01_SHARE_CAPITAL',
    label: 'Issued Share Capital / Owner Equity',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'EQUITY'
  },
  {
    fieldCode: 'SCH2_B02_RETAINED_EARNINGS',
    label: 'Retained Earnings / Accumulated Profit (Loss)',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'EQUITY'
  },
  {
    fieldCode: 'SCH2_B03_OTHER_RESERVES',
    label: 'Other Reserves & Statutory Surplus',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'EQUITY'
  },
  {
    fieldCode: 'SCH2_B04_TOTAL_EQUITY',
    label: 'Total Equity',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'EQUITY',
    formula: {
      formulaId: 'SCH2_F04',
      expression: 'SCH2_B01 + SCH2_B02 + SCH2_B03',
      description: 'Sum of share capital, retained earnings and other reserves',
      dependencies: ['SCH2_B01_SHARE_CAPITAL', 'SCH2_B02_RETAINED_EARNINGS', 'SCH2_B03_OTHER_RESERVES']
    }
  },

  // Non-Current Liabilities
  {
    fieldCode: 'SCH2_B05_LONG_TERM_BORROWINGS',
    label: 'Long-Term Borrowings & Loans',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'NON_CURRENT_LIABILITIES'
  },
  {
    fieldCode: 'SCH2_B06_DEFERRED_TAX_LIABILITY',
    label: 'Deferred Tax Liabilities',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'NON_CURRENT_LIABILITIES'
  },
  {
    fieldCode: 'SCH2_B07_OTHER_NON_CURRENT_LIABILITIES',
    label: 'Other Non-Current Liabilities',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'NON_CURRENT_LIABILITIES'
  },
  {
    fieldCode: 'SCH2_B08_TOTAL_NON_CURRENT_LIABILITIES',
    label: 'Total Non-Current Liabilities',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'NON_CURRENT_LIABILITIES',
    formula: {
      formulaId: 'SCH2_F05',
      expression: 'SCH2_B05 + SCH2_B06 + SCH2_B07',
      description: 'Sum of non-current liabilities',
      dependencies: ['SCH2_B05_LONG_TERM_BORROWINGS', 'SCH2_B06_DEFERRED_TAX_LIABILITY', 'SCH2_B07_OTHER_NON_CURRENT_LIABILITIES']
    }
  },

  // Current Liabilities
  {
    fieldCode: 'SCH2_B09_TRADE_PAYABLES',
    label: 'Trade and Other Payables',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'CURRENT_LIABILITIES'
  },
  {
    fieldCode: 'SCH2_B10_SHORT_TERM_BORROWINGS',
    label: 'Short-Term Borrowings & Bank Overdrafts',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'CURRENT_LIABILITIES'
  },
  {
    fieldCode: 'SCH2_B11_CURRENT_TAX_LIABILITY',
    label: 'Current Tax Liabilities',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'CURRENT_LIABILITIES'
  },
  {
    fieldCode: 'SCH2_B12_OTHER_CURRENT_LIABILITIES',
    label: 'Other Current Liabilities',
    dataType: 'DECIMAL',
    required: false,
    source: 'ACCOUNTING_GL',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'CURRENT_LIABILITIES'
  },
  {
    fieldCode: 'SCH2_B13_TOTAL_CURRENT_LIABILITIES',
    label: 'Total Current Liabilities',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'CURRENT_LIABILITIES',
    formula: {
      formulaId: 'SCH2_F06',
      expression: 'SCH2_B09 + SCH2_B10 + SCH2_B11 + SCH2_B12',
      description: 'Sum of current liabilities',
      dependencies: ['SCH2_B09_TRADE_PAYABLES', 'SCH2_B10_SHORT_TERM_BORROWINGS', 'SCH2_B11_CURRENT_TAX_LIABILITY', 'SCH2_B12_OTHER_CURRENT_LIABILITIES']
    }
  },
  {
    fieldCode: 'SCH2_B14_TOTAL_LIABILITIES',
    label: 'Total Liabilities',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'BALANCE_SHEET_TOTALS',
    formula: {
      formulaId: 'SCH2_F07',
      expression: 'SCH2_B08_TOTAL_NON_CURRENT_LIABILITIES + SCH2_B13_TOTAL_CURRENT_LIABILITIES',
      description: 'Sum of Non-Current and Current Liabilities',
      dependencies: ['SCH2_B08_TOTAL_NON_CURRENT_LIABILITIES', 'SCH2_B13_TOTAL_CURRENT_LIABILITIES']
    }
  },
  {
    fieldCode: 'SCH2_B15_TOTAL_EQUITY_AND_LIABILITIES',
    label: 'Total Equity and Liabilities',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'BALANCE_SHEET_TOTALS',
    formula: {
      formulaId: 'SCH2_F08',
      expression: 'SCH2_B04_TOTAL_EQUITY + SCH2_B14_TOTAL_LIABILITIES',
      description: 'Sum of Total Equity and Total Liabilities',
      dependencies: ['SCH2_B04_TOTAL_EQUITY', 'SCH2_B14_TOTAL_LIABILITIES']
    }
  },
  {
    fieldCode: 'SCH2_C01_BALANCE_CHECK_VARIANCE',
    label: 'Balance Sheet Out-of-Balance Variance',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'BALANCE_SHEET_TOTALS',
    formula: {
      formulaId: 'SCH2_F09',
      expression: 'SCH2_A13_TOTAL_ASSETS - SCH2_B15_TOTAL_EQUITY_AND_LIABILITIES',
      description: 'Equation check: Assets minus (Equity + Liabilities)',
      dependencies: ['SCH2_A13_TOTAL_ASSETS', 'SCH2_B15_TOTAL_EQUITY_AND_LIABILITIES']
    }
  }
];

export class Schedule2 {
  public static readonly VERSION = 'v25.1';
  public static readonly CODE = 'SCHEDULE_2';
  public static readonly TITLE = 'Schedule 2: Statement of Financial Position';

  /**
   * Determines if Schedule 2 is applicable for this taxpayer profile
   */
  public static checkApplicability(
    taxpayerType: TaxpayerType,
    data?: Schedule2BalanceSheetData
  ): ScheduleApplicabilityResult {
    const isCorporate = taxpayerType === 'COMPANY' || 
                        taxpayerType === 'NON_RESIDENT_COMPANY' || 
                        taxpayerType === 'PARTNERSHIP' || 
                        taxpayerType === 'TRUST' || 
                        taxpayerType === 'BODY_OF_PERSONS';

    const hasData = !!data && (
      Object.values(data.nonCurrentAssets || {}).some(v => (v || 0) > 0) ||
      Object.values(data.currentAssets || {}).some(v => (v || 0) > 0) ||
      Object.values(data.equity || {}).some(v => (v || 0) > 0) ||
      Object.values(data.nonCurrentLiabilities || {}).some(v => (v || 0) > 0) ||
      Object.values(data.currentLiabilities || {}).some(v => (v || 0) > 0)
    );

    if (isCorporate || hasData) {
      return {
        scheduleCode: 'SCHEDULE_2',
        isApplicable: true,
        reason: isCorporate 
          ? `Mandatory for corporate and entity taxpayer type (${taxpayerType}) under Income Tax Regulation.` 
          : 'Applicable due to active business balance sheet data submitted.'
      };
    }

    return {
      scheduleCode: 'SCHEDULE_2',
      isApplicable: false,
      reason: `Not required for non-corporate taxpayer type (${taxpayerType}) with no balance sheet balances submitted.`
    };
  }

  /**
   * Generates and validates Schedule 2 instance from source balance sheet data
   */
  public static generate(
    sourceData: Schedule2BalanceSheetData | undefined,
    taxpayerType: TaxpayerType,
    taxYear: number
  ): ScheduleInstance<Schedule2BalanceSheetData> {
    const startTime = Date.now();
    const applicability = this.checkApplicability(taxpayerType, sourceData);
    const now = new Date().toISOString();
    const values: Record<string, any> = {};
    const traces: Record<string, FieldSourceTrace> = {};

    const d = (n?: number) => new Decimal(n || 0);

    if (!applicability.isApplicable || !sourceData) {
      return {
        scheduleCode: 'SCHEDULE_2',
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

    // 1. Map Non-Current Assets
    const ppe = d(sourceData.nonCurrentAssets?.propertyPlantEquipment);
    const invProp = d(sourceData.nonCurrentAssets?.investmentProperty);
    const intangibles = d(sourceData.nonCurrentAssets?.intangibleAssets);
    const ltInv = d(sourceData.nonCurrentAssets?.longTermInvestments);
    const otherNca = d(sourceData.nonCurrentAssets?.otherNonCurrentAssets);
    const totalNca = ppe.plus(invProp).plus(intangibles).plus(ltInv).plus(otherNca);

    values['SCH2_A01_PPE'] = ppe.toNumber();
    values['SCH2_A02_INVESTMENT_PROPERTY'] = invProp.toNumber();
    values['SCH2_A03_INTANGIBLES'] = intangibles.toNumber();
    values['SCH2_A04_LONG_TERM_INVESTMENTS'] = ltInv.toNumber();
    values['SCH2_A05_OTHER_NON_CURRENT_ASSETS'] = otherNca.toNumber();
    values['SCH2_A06_TOTAL_NON_CURRENT_ASSETS'] = totalNca.toNumber();

    // 2. Map Current Assets
    const inv = d(sourceData.currentAssets?.inventories);
    const rec = d(sourceData.currentAssets?.tradeAndOtherReceivables);
    const cash = d(sourceData.currentAssets?.cashAndCashEquivalents);
    const stInv = d(sourceData.currentAssets?.shortTermInvestments);
    const prepay = d(sourceData.currentAssets?.prepaymentsAndOtherCurrentAssets);
    const totalCa = inv.plus(rec).plus(cash).plus(stInv).plus(prepay);
    const totalAssets = totalNca.plus(totalCa);

    values['SCH2_A07_INVENTORIES'] = inv.toNumber();
    values['SCH2_A08_TRADE_RECEIVABLES'] = rec.toNumber();
    values['SCH2_A09_CASH_EQUIVALENTS'] = cash.toNumber();
    values['SCH2_A10_SHORT_TERM_INVESTMENTS'] = stInv.toNumber();
    values['SCH2_A11_PREPAYMENTS_OTHER_CURRENT'] = prepay.toNumber();
    values['SCH2_A12_TOTAL_CURRENT_ASSETS'] = totalCa.toNumber();
    values['SCH2_A13_TOTAL_ASSETS'] = totalAssets.toNumber();

    // 3. Map Equity
    const cap = d(sourceData.equity?.shareCapital);
    const re = d(sourceData.equity?.retainedEarnings);
    const res = d(sourceData.equity?.otherReserves);
    const totalEquity = cap.plus(re).plus(res);

    values['SCH2_B01_SHARE_CAPITAL'] = cap.toNumber();
    values['SCH2_B02_RETAINED_EARNINGS'] = re.toNumber();
    values['SCH2_B03_OTHER_RESERVES'] = res.toNumber();
    values['SCH2_B04_TOTAL_EQUITY'] = totalEquity.toNumber();

    // 4. Map Non-Current Liabilities
    const ltBorrow = d(sourceData.nonCurrentLiabilities?.longTermBorrowings);
    const defTax = d(sourceData.nonCurrentLiabilities?.deferredTaxLiabilities);
    const otherNcl = d(sourceData.nonCurrentLiabilities?.otherNonCurrentLiabilities);
    const totalNcl = ltBorrow.plus(defTax).plus(otherNcl);

    values['SCH2_B05_LONG_TERM_BORROWINGS'] = ltBorrow.toNumber();
    values['SCH2_B06_DEFERRED_TAX_LIABILITY'] = defTax.toNumber();
    values['SCH2_B07_OTHER_NON_CURRENT_LIABILITIES'] = otherNcl.toNumber();
    values['SCH2_B08_TOTAL_NON_CURRENT_LIABILITIES'] = totalNcl.toNumber();

    // 5. Map Current Liabilities
    const pay = d(sourceData.currentLiabilities?.tradeAndOtherPayables);
    const stBorrow = d(sourceData.currentLiabilities?.shortTermBorrowings);
    const curTax = d(sourceData.currentLiabilities?.currentTaxPayable);
    const otherCl = d(sourceData.currentLiabilities?.otherCurrentLiabilities);
    const totalCl = pay.plus(stBorrow).plus(curTax).plus(otherCl);

    values['SCH2_B09_TRADE_PAYABLES'] = pay.toNumber();
    values['SCH2_B10_SHORT_TERM_BORROWINGS'] = stBorrow.toNumber();
    values['SCH2_B11_CURRENT_TAX_LIABILITY'] = curTax.toNumber();
    values['SCH2_B12_OTHER_CURRENT_LIABILITIES'] = otherCl.toNumber();
    values['SCH2_B13_TOTAL_CURRENT_LIABILITIES'] = totalCl.toNumber();

    const totalLiabilities = totalNcl.plus(totalCl);
    const totalEqAndLiab = totalEquity.plus(totalLiabilities);
    const variance = totalAssets.minus(totalEqAndLiab);

    values['SCH2_B14_TOTAL_LIABILITIES'] = totalLiabilities.toNumber();
    values['SCH2_B15_TOTAL_EQUITY_AND_LIABILITIES'] = totalEqAndLiab.toNumber();
    values['SCH2_C01_BALANCE_CHECK_VARIANCE'] = variance.toNumber();

    // 6. Build Traces
    const refs = sourceData.glAccountReferences || {};
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

    addTrace('SCH2_A01_PPE', 'ACCOUNTING_GL', 'Property, Plant and Equipment net book value', 'PPE');
    addTrace('SCH2_A02_INVESTMENT_PROPERTY', 'ACCOUNTING_GL', 'Investment Property carrying value', 'INV_PROP');
    addTrace('SCH2_A03_INTANGIBLES', 'ACCOUNTING_GL', 'Intangibles & Goodwill carrying value', 'INTANGIBLES');
    addTrace('SCH2_A04_LONG_TERM_INVESTMENTS', 'ACCOUNTING_GL', 'Long-term financial investments', 'LT_INVESTMENTS');
    addTrace('SCH2_A05_OTHER_NON_CURRENT_ASSETS', 'ACCOUNTING_GL', 'Other non-current assets', 'OTHER_NCA');
    addTrace('SCH2_A06_TOTAL_NON_CURRENT_ASSETS', 'CALCULATED', 'Total Non-Current Assets', undefined, `${ppe} + ${invProp} + ${intangibles} + ${ltInv} + ${otherNca} = ${totalNca}`, ['SCH2_A01_PPE', 'SCH2_A02_INVESTMENT_PROPERTY', 'SCH2_A03_INTANGIBLES', 'SCH2_A04_LONG_TERM_INVESTMENTS', 'SCH2_A05_OTHER_NON_CURRENT_ASSETS']);

    addTrace('SCH2_A07_INVENTORIES', 'ACCOUNTING_GL', 'Inventory closing balance', 'INVENTORIES');
    addTrace('SCH2_A08_TRADE_RECEIVABLES', 'ACCOUNTING_GL', 'Trade & other receivables balance', 'RECEIVABLES');
    addTrace('SCH2_A09_CASH_EQUIVALENTS', 'ACCOUNTING_GL', 'Cash & bank accounts balance', 'CASH');
    addTrace('SCH2_A10_SHORT_TERM_INVESTMENTS', 'ACCOUNTING_GL', 'Short-term liquid investments', 'ST_INVESTMENTS');
    addTrace('SCH2_A11_PREPAYMENTS_OTHER_CURRENT', 'ACCOUNTING_GL', 'Prepayments and other current assets', 'PREPAYMENTS');
    addTrace('SCH2_A12_TOTAL_CURRENT_ASSETS', 'CALCULATED', 'Total Current Assets', undefined, `${inv} + ${rec} + ${cash} + ${stInv} + ${prepay} = ${totalCa}`, ['SCH2_A07_INVENTORIES', 'SCH2_A08_TRADE_RECEIVABLES', 'SCH2_A09_CASH_EQUIVALENTS', 'SCH2_A10_SHORT_TERM_INVESTMENTS', 'SCH2_A11_PREPAYMENTS_OTHER_CURRENT']);
    addTrace('SCH2_A13_TOTAL_ASSETS', 'CALCULATED', 'Total Assets', undefined, `${totalNca} + ${totalCa} = ${totalAssets}`, ['SCH2_A06_TOTAL_NON_CURRENT_ASSETS', 'SCH2_A12_TOTAL_CURRENT_ASSETS']);

    addTrace('SCH2_B01_SHARE_CAPITAL', 'ACCOUNTING_GL', 'Issued share capital balance', 'SHARE_CAPITAL');
    addTrace('SCH2_B02_RETAINED_EARNINGS', 'ACCOUNTING_GL', 'Retained earnings closing balance', 'RETAINED_EARNINGS');
    addTrace('SCH2_B03_OTHER_RESERVES', 'ACCOUNTING_GL', 'Other equity reserves balance', 'RESERVES');
    addTrace('SCH2_B04_TOTAL_EQUITY', 'CALCULATED', 'Total Equity', undefined, `${cap} + ${re} + ${res} = ${totalEquity}`, ['SCH2_B01_SHARE_CAPITAL', 'SCH2_B02_RETAINED_EARNINGS', 'SCH2_B03_OTHER_RESERVES']);

    addTrace('SCH2_B05_LONG_TERM_BORROWINGS', 'ACCOUNTING_GL', 'Long-term bank loans and notes', 'LT_BORROWINGS');
    addTrace('SCH2_B06_DEFERRED_TAX_LIABILITY', 'ACCOUNTING_GL', 'Deferred tax liability balance', 'DEFERRED_TAX');
    addTrace('SCH2_B07_OTHER_NON_CURRENT_LIABILITIES', 'ACCOUNTING_GL', 'Other non-current liabilities', 'OTHER_NCL');
    addTrace('SCH2_B08_TOTAL_NON_CURRENT_LIABILITIES', 'CALCULATED', 'Total Non-Current Liabilities', undefined, `${ltBorrow} + ${defTax} + ${otherNcl} = ${totalNcl}`, ['SCH2_B05_LONG_TERM_BORROWINGS', 'SCH2_B06_DEFERRED_TAX_LIABILITY', 'SCH2_B07_OTHER_NON_CURRENT_LIABILITIES']);

    addTrace('SCH2_B09_TRADE_PAYABLES', 'ACCOUNTING_GL', 'Trade & other payables balance', 'PAYABLES');
    addTrace('SCH2_B10_SHORT_TERM_BORROWINGS', 'ACCOUNTING_GL', 'Short-term borrowings balance', 'ST_BORROWINGS');
    addTrace('SCH2_B11_CURRENT_TAX_LIABILITY', 'ACCOUNTING_GL', 'Current tax payable balance', 'CURRENT_TAX');
    addTrace('SCH2_B12_OTHER_CURRENT_LIABILITIES', 'ACCOUNTING_GL', 'Other current liabilities balance', 'OTHER_CL');
    addTrace('SCH2_B13_TOTAL_CURRENT_LIABILITIES', 'CALCULATED', 'Total Current Liabilities', undefined, `${pay} + ${stBorrow} + ${curTax} + ${otherCl} = ${totalCl}`, ['SCH2_B09_TRADE_PAYABLES', 'SCH2_B10_SHORT_TERM_BORROWINGS', 'SCH2_B11_CURRENT_TAX_LIABILITY', 'SCH2_B12_OTHER_CURRENT_LIABILITIES']);
    addTrace('SCH2_B14_TOTAL_LIABILITIES', 'CALCULATED', 'Total Liabilities', undefined, `${totalNcl} + ${totalCl} = ${totalLiabilities}`, ['SCH2_B08_TOTAL_NON_CURRENT_LIABILITIES', 'SCH2_B13_TOTAL_CURRENT_LIABILITIES']);
    addTrace('SCH2_B15_TOTAL_EQUITY_AND_LIABILITIES', 'CALCULATED', 'Total Equity and Liabilities', undefined, `${totalEquity} + ${totalLiabilities} = ${totalEqAndLiab}`, ['SCH2_B04_TOTAL_EQUITY', 'SCH2_B14_TOTAL_LIABILITIES']);
    addTrace('SCH2_C01_BALANCE_CHECK_VARIANCE', 'CALCULATED', 'Balance Sheet Balancing Variance', undefined, `${totalAssets} - ${totalEqAndLiab} = ${variance}`, ['SCH2_A13_TOTAL_ASSETS', 'SCH2_B15_TOTAL_EQUITY_AND_LIABILITIES']);

    // 7. Validate
    const errors: FormValidationError[] = [];
    const warnings: FormValidationError[] = [];

    // Balance Sheet must balance exactly: Assets == Equity + Liabilities
    if (Math.abs(variance.toNumber()) > 0.01) {
      errors.push({
        fieldCode: 'SCH2_C01_BALANCE_CHECK_VARIANCE',
        sectionId: 'BALANCE_SHEET_TOTALS',
        severity: 'ERROR',
        message: `Statement of Financial Position out-of-balance discrepancy: Total Assets (MVR ${totalAssets.toFixed(2)}) must equal Total Equity & Liabilities (MVR ${totalEqAndLiab.toFixed(2)}). Difference is MVR ${variance.toFixed(2)}.`
      });
    }

    if (totalAssets.lessThan(0)) {
      errors.push({
        fieldCode: 'SCH2_A13_TOTAL_ASSETS',
        sectionId: 'BALANCE_SHEET_TOTALS',
        severity: 'ERROR',
        message: `Total Assets cannot be negative (calculated MVR ${totalAssets.toFixed(2)}).`
      });
    }

    const validationResult: FormValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings
    };

    return {
      scheduleCode: 'SCHEDULE_2',
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
