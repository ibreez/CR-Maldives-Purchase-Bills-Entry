import { FieldSourceTrace } from '../types';
import { MIRA604_V25_1_FORMULAS, FormFormulaContext } from './v25_1/formulas';
import { TaxpayerType } from '../../types';

export interface MIRA604CalculationResult {
  values: Record<string, any>;
  traces: Record<string, FieldSourceTrace>;
  summary: {
    grossRevenue: number;
    accountingProfitBeforeTax: number;
    totalTaxAdditions: number;
    totalTaxDeductions: number;
    netTaxAdjustments: number;
    totalCapitalAllowance: number;
    adjustedTaxableProfit: number;
    lossReliefUtilized: number;
    remainingLossCarriedForward: number;
    netTaxableIncome: number;
    grossTaxLiability: number;
    totalTaxCredits: number;
    netTaxLiability: number;
    totalPrepayments: number;
    netBalanceDueOrRefundable: number;
    finalTaxPayable: number;
    finalRefundClaimable: number;
    effectiveTaxRate: number;
  };
}

export class MIRA604Calculation {
  /**
   * Executes full end-to-end calculation pipeline for MIRA 604 v25.1
   */
  public static calculate(
    inputValues: Record<string, any>,
    initialTraces: Record<string, FieldSourceTrace> = {},
    version: string = 'v25.1'
  ): MIRA604CalculationResult {
    const values: Record<string, any> = { ...inputValues };
    const traces: Record<string, FieldSourceTrace> = { ...initialTraces };

    const taxYear = Number(values['F604_A04_TAX_YEAR'] || 2024);
    const taxpayerType: TaxpayerType = values['F604_A03_TAXPAYER_TYPE'] || 'COMPANY';

    // 1. Accounting Period Days Calculation
    const daysResult = MIRA604_V25_1_FORMULAS.evaluateAccountingDays(
      values['F604_A05_PERIOD_START'],
      values['F604_A06_PERIOD_END']
    );
    values['F604_A07_ACCOUNTING_DAYS'] = daysResult.value;
    traces['F604_A07_ACCOUNTING_DAYS'] = daysResult.trace;

    const context: FormFormulaContext = {
      taxYear,
      taxpayerType,
      accountingDays: daysResult.value,
      groupFactor: Number(values['F604_A10_GROUP_FACTOR'] || 1)
    };

    // 2. Section B P&L Calculations
    // B03: Gross Profit
    const gpResult = MIRA604_V25_1_FORMULAS.evaluateGrossProfit(
      values['F604_B01_GROSS_REVENUE'],
      values['F604_B02_COST_OF_SALES']
    );
    values['F604_B03_GROSS_PROFIT'] = gpResult.value;
    traces['F604_B03_GROSS_PROFIT'] = gpResult.trace;

    // B11: Total Other Income
    const otherIncResult = MIRA604_V25_1_FORMULAS.evaluateTotalOtherIncome(values);
    values['F604_B11_TOTAL_OTHER_INCOME'] = otherIncResult.value;
    traces['F604_B11_TOTAL_OTHER_INCOME'] = otherIncResult.trace;

    // B21: Total Operating Expenses
    const expensesResult = MIRA604_V25_1_FORMULAS.evaluateTotalOperatingExpenses(values);
    values['F604_B21_TOTAL_OPERATING_EXPENSES'] = expensesResult.value;
    traces['F604_B21_TOTAL_OPERATING_EXPENSES'] = expensesResult.trace;

    // B22: Net Profit Before Tax
    const netProfitResult = MIRA604_V25_1_FORMULAS.evaluateNetProfitBeforeTax(
      values['F604_B03_GROSS_PROFIT'],
      values['F604_B11_TOTAL_OTHER_INCOME'],
      values['F604_B21_TOTAL_OPERATING_EXPENSES']
    );
    values['F604_B22_NET_PROFIT_BEFORE_TAX'] = netProfitResult.value;
    traces['F604_B22_NET_PROFIT_BEFORE_TAX'] = netProfitResult.trace;

    // 3. Section C Tax Adjustments Calculations
    // C08: Total Additions
    const addResult = MIRA604_V25_1_FORMULAS.evaluateTotalTaxAdditions(values);
    values['F604_C08_TOTAL_TAX_ADDITIONS'] = addResult.value;
    traces['F604_C08_TOTAL_TAX_ADDITIONS'] = addResult.trace;

    // C12: Total Deductions
    const dedResult = MIRA604_V25_1_FORMULAS.evaluateTotalTaxDeductions(values);
    values['F604_C12_TOTAL_TAX_DEDUCTIONS'] = dedResult.value;
    traces['F604_C12_TOTAL_TAX_DEDUCTIONS'] = dedResult.trace;

    // C13: Net Tax Adjustments
    const netAdjResult = MIRA604_V25_1_FORMULAS.evaluateNetTaxAdjustments(
      values['F604_C08_TOTAL_TAX_ADDITIONS'],
      values['F604_C12_TOTAL_TAX_DEDUCTIONS']
    );
    values['F604_C13_NET_TAX_ADJUSTMENTS'] = netAdjResult.value;
    traces['F604_C13_NET_TAX_ADJUSTMENTS'] = netAdjResult.trace;

    // 4. Section D Capital Allowance Calculation
    // D09: Total Capital Allowance
    const caResult = MIRA604_V25_1_FORMULAS.evaluateTotalCapitalAllowance(values);
    values['F604_D09_TOTAL_CAPITAL_ALLOWANCE'] = caResult.value;
    traces['F604_D09_TOTAL_CAPITAL_ALLOWANCE'] = caResult.trace;

    // 5. Section E Taxable Profit & Loss Relief
    // E01: Adjusted Taxable Profit
    const adjProfitResult = MIRA604_V25_1_FORMULAS.evaluateAdjustedTaxableProfit(
      values['F604_B22_NET_PROFIT_BEFORE_TAX'],
      values['F604_C13_NET_TAX_ADJUSTMENTS'],
      values['F604_D09_TOTAL_CAPITAL_ALLOWANCE']
    );
    values['F604_E01_ADJ_TAXABLE_PROFIT_BEFORE_LOSS'] = adjProfitResult.value;
    traces['F604_E01_ADJ_TAXABLE_PROFIT_BEFORE_LOSS'] = adjProfitResult.trace;

    // Loss relief pipeline (E04, E05, E06, E07, E08)
    const lossPipeline = MIRA604_V25_1_FORMULAS.evaluateLossReliefPipeline(
      values['F604_E01_ADJ_TAXABLE_PROFIT_BEFORE_LOSS'],
      values['F604_E02_PRIOR_UNABSORBED_LOSSES'],
      values['F604_E03_EXPIRED_TAX_LOSSES']
    );
    values['F604_E04_VALID_LOSSES_BROUGHT_FORWARD'] = lossPipeline.validLosses.value;
    traces['F604_E04_VALID_LOSSES_BROUGHT_FORWARD'] = lossPipeline.validLosses.trace;

    values['F604_E05_LOSS_RELIEF_UTILIZED'] = lossPipeline.lossReliefUtilized.value;
    traces['F604_E05_LOSS_RELIEF_UTILIZED'] = lossPipeline.lossReliefUtilized.trace;

    values['F604_E06_CURRENT_YEAR_TAX_LOSS'] = lossPipeline.currentYearTaxLoss.value;
    traces['F604_E06_CURRENT_YEAR_TAX_LOSS'] = lossPipeline.currentYearTaxLoss.trace;

    values['F604_E07_REMAINING_UNABSORBED_LOSS_CF'] = lossPipeline.remainingLossCF.value;
    traces['F604_E07_REMAINING_UNABSORBED_LOSS_CF'] = lossPipeline.remainingLossCF.trace;

    values['F604_E08_NET_TAXABLE_INCOME'] = lossPipeline.netTaxableIncome.value;
    traces['F604_E08_NET_TAXABLE_INCOME'] = lossPipeline.netTaxableIncome.trace;

    // 6. Section F Tax Liability & Brackets via Tax Engine
    const taxLiabilityRes = MIRA604_V25_1_FORMULAS.evaluateGrossTaxLiability(
      values['F604_E08_NET_TAXABLE_INCOME'],
      taxpayerType,
      context
    );
    values['F604_F01_TAX_FREE_THRESHOLD'] = taxLiabilityRes.taxThreshold.value;
    traces['F604_F01_TAX_FREE_THRESHOLD'] = taxLiabilityRes.taxThreshold.trace;

    values['F604_F02_TAX_BRACKET_DETAILS'] = taxLiabilityRes.bracketDetails.value;
    traces['F604_F02_TAX_BRACKET_DETAILS'] = taxLiabilityRes.bracketDetails.trace;

    values['F604_F03_GROSS_TAX_LIABILITY'] = taxLiabilityRes.grossLiability.value;
    traces['F604_F03_GROSS_TAX_LIABILITY'] = taxLiabilityRes.grossLiability.trace;

    // 7. Settlement Pipeline: Credits, Prepayments, Final Balance
    const settlement = MIRA604_V25_1_FORMULAS.evaluateSettlementPipeline(
      values['F604_F03_GROSS_TAX_LIABILITY'],
      values['F604_E08_NET_TAXABLE_INCOME'],
      values['F604_F04_CREDIT_FOREIGN_TAX'],
      values['F604_F05_CREDIT_STATUTORY_DONATIONS'],
      values
    );

    values['F604_F06_TOTAL_TAX_CREDITS'] = settlement.totalCredits.value;
    traces['F604_F06_TOTAL_TAX_CREDITS'] = settlement.totalCredits.trace;

    values['F604_F07_NET_TAX_LIABILITY'] = settlement.netLiability.value;
    traces['F604_F07_NET_TAX_LIABILITY'] = settlement.netLiability.trace;

    values['F604_F08_EFFECTIVE_TAX_RATE'] = settlement.effectiveRate.value;
    traces['F604_F08_EFFECTIVE_TAX_RATE'] = settlement.effectiveRate.trace;

    values['F604_G07_TOTAL_PREPAYMENTS_AND_WHT'] = settlement.totalPrepayments.value;
    traces['F604_G07_TOTAL_PREPAYMENTS_AND_WHT'] = settlement.totalPrepayments.trace;

    values['F604_G08_NET_BALANCE_DUE_OR_REFUNDABLE'] = settlement.netBalance.value;
    traces['F604_G08_NET_BALANCE_DUE_OR_REFUNDABLE'] = settlement.netBalance.trace;

    values['F604_G09_FINAL_TAX_PAYABLE'] = settlement.finalTaxPayable.value;
    traces['F604_G09_FINAL_TAX_PAYABLE'] = settlement.finalTaxPayable.trace;

    values['F604_G10_FINAL_REFUND_CLAIMABLE'] = settlement.finalRefundClaimable.value;
    traces['F604_G10_FINAL_REFUND_CLAIMABLE'] = settlement.finalRefundClaimable.trace;

    return {
      values,
      traces,
      summary: {
        grossRevenue: values['F604_B01_GROSS_REVENUE'] || 0,
        accountingProfitBeforeTax: values['F604_B22_NET_PROFIT_BEFORE_TAX'],
        totalTaxAdditions: values['F604_C08_TOTAL_TAX_ADDITIONS'],
        totalTaxDeductions: values['F604_C12_TOTAL_TAX_DEDUCTIONS'],
        netTaxAdjustments: values['F604_C13_NET_TAX_ADJUSTMENTS'],
        totalCapitalAllowance: values['F604_D09_TOTAL_CAPITAL_ALLOWANCE'],
        adjustedTaxableProfit: values['F604_E01_ADJ_TAXABLE_PROFIT_BEFORE_LOSS'],
        lossReliefUtilized: values['F604_E05_LOSS_RELIEF_UTILIZED'],
        remainingLossCarriedForward: values['F604_E07_REMAINING_UNABSORBED_LOSS_CF'],
        netTaxableIncome: values['F604_E08_NET_TAXABLE_INCOME'],
        grossTaxLiability: values['F604_F03_GROSS_TAX_LIABILITY'],
        totalTaxCredits: values['F604_F06_TOTAL_TAX_CREDITS'],
        netTaxLiability: values['F604_F07_NET_TAX_LIABILITY'],
        totalPrepayments: values['F604_G07_TOTAL_PREPAYMENTS_AND_WHT'],
        netBalanceDueOrRefundable: values['F604_G08_NET_BALANCE_DUE_OR_REFUNDABLE'],
        finalTaxPayable: values['F604_G09_FINAL_TAX_PAYABLE'],
        finalRefundClaimable: values['F604_G10_FINAL_REFUND_CLAIMABLE'],
        effectiveTaxRate: values['F604_F08_EFFECTIVE_TAX_RATE']
      }
    };
  }
}
