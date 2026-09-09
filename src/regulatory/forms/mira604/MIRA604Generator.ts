import { FormInstance, FormValidationResult, FieldSourceTrace } from '../types';
import { MIRA604AccountingSourceData, MIRA604_V25_1_MAPPINGS } from './v25_1/mappings';
import { MIRA604Calculation, MIRA604CalculationResult } from './MIRA604Calculation';
import { MIRA604Validation } from './MIRA604Validation';
import { MIRA604_V25_1_DEFINITION } from './v25_1/definition';
import { MIRA604ScheduleEngine } from './schedules/MIRA604ScheduleEngine';
import { ScheduleEngineResult } from './schedules/types';

export interface MIRA604FormResult {
  formInstance: FormInstance;
  calculationSummary: MIRA604CalculationResult['summary'];
  schedulesResult: ScheduleEngineResult;
  miraconnectJson: string;
  miraconnectPayload: Record<string, any>;
}

export class MIRA604Generator {
  /**
   * Universal generator helper accepting both structured sourceData and simplified benchmark options
   */
  public static generate(options: any, version: string = 'v25.1'): any {
    if (options.taxpayer && options.pnl) {
      return this.generateForm(options, version);
    }
    const sourceData: any = {
      taxpayer: {
        tin: options.companyInfo?.tin || options.tin || '1000000BPT001',
        name: options.companyInfo?.registeredName || options.name || 'Benchmark Taxpayer',
        taxYear: options.taxYear || 2025,
        accountingStandard: options.accountingStandard || 'IFRS',
        taxpayerType: options.entityType || 'COMPANY',
        businessActivityCode: options.companyInfo?.businessActivityCode || '4711'
      },
      pnl: {
        grossRevenue: options.sourceData?.totalRevenue || 25000000,
        costOfSales: options.sourceData?.costOfSales || 15000000,
        grossProfit: (options.sourceData?.totalRevenue || 25000000) - (options.sourceData?.costOfSales || 15000000),
        totalExpenses: options.sourceData?.operatingExpenses || 4000000,
        netProfitBeforeTax: (options.sourceData?.totalRevenue || 25000000) - (options.sourceData?.costOfSales || 15000000) - (options.sourceData?.operatingExpenses || 4000000)
      },
      balanceSheet: {
        totalAssets: 50000000,
        totalLiabilities: 20000000,
        totalEquity: 30000000
      }
    };
    return this.generateForm(sourceData, version);
  }

  /**
   * Generates a fully populated, calculated, validated MIRA 604 form instance with full source traces and statutory schedules
   */
  public static generateForm(
    sourceData: MIRA604AccountingSourceData,
    version: string = 'v25.1'
  ): MIRA604FormResult {
    const startTime = Date.now();

    // 1. Process MIRA 604 Statutory Schedules (Schedule 2, 3, 4, 5)
    const schedulesResult = MIRA604ScheduleEngine.processSchedules({
      taxpayerType: sourceData.taxpayer.taxpayerType,
      taxYear: sourceData.taxpayer.taxYear,
      grossRevenue: sourceData.pnl.grossRevenue,
      schedule2Data: sourceData.schedule2Data,
      schedule3Data: sourceData.schedule3Data,
      schedule4Data: sourceData.schedule4Data,
      schedule5Data: sourceData.schedule5Data
    });

    // 2. Map input accounting domain records to form fields and generate input source traces
    const mappingResult = MIRA604_V25_1_MAPPINGS.mapSourceDataToForm(sourceData);

    // 3. Perform end-to-end calculations with Decimal precision & build formula traces
    const calcResult = MIRA604Calculation.calculate(
      mappingResult.mappedValues,
      mappingResult.traces,
      version
    );

    // 4. Perform structural, statutory and arithmetic validation on the main return
    const validationResult: FormValidationResult = MIRA604Validation.validate(
      calcResult.values,
      version
    );

    // If schedules have validation errors, reflect in the overall validation state
    if (schedulesResult.validationErrors.length > 0) {
      validationResult.errors.push(...schedulesResult.validationErrors);
      validationResult.isValid = false;
    }

    const formId = `MIRA604-${calcResult.values['F604_A04_TAX_YEAR']}-${calcResult.values['F604_A01_TIN']}`;
    const generatedAt = new Date().toISOString();

    const formInstance: FormInstance = {
      formId,
      formCode: 'MIRA_604',
      version,
      taxYear: Number(calcResult.values['F604_A04_TAX_YEAR']),
      taxpayerId: String(calcResult.values['F604_A01_TIN']),
      taxpayerType: calcResult.values['F604_A03_TAXPAYER_TYPE'],
      generatedAt,
      values: calcResult.values,
      traces: calcResult.traces,
      validationResult,
      status: validationResult.isValid ? 'VALIDATED' : 'REJECTED',
      metadata: {
        ruleResolverVersion: 'v25.1',
        calculationDurationMs: Date.now() - startTime,
        generatorVersion: '2.1.0-phase28'
      }
    };

    // 5. Build MIRAconnect standardized electronic filing JSON payload with embedded statutory schedules
    const schedulesPayload = MIRA604ScheduleEngine.buildMIRAconnectSchedulesPayload(schedulesResult);

    const miraconnectPayload = {
      header: {
        formId,
        formCode: 'MIRA_604',
        formVersion: version.toUpperCase(),
        taxYear: formInstance.taxYear,
        tin: formInstance.taxpayerId,
        filingTimestamp: generatedAt,
        softwareProvider: 'FinTax-Maldives-Core-v28'
      },
      taxpayer: {
        tin: formInstance.taxpayerId,
        taxpayerName: calcResult.values['F604_A02_TAXPAYER_NAME'],
        entityType: formInstance.taxpayerType,
        accountingPeriodStart: calcResult.values['F604_A05_PERIOD_START'],
        accountingPeriodEnd: calcResult.values['F604_A06_PERIOD_END'],
        accountingDays: calcResult.values['F604_A07_ACCOUNTING_DAYS'],
        presentationCurrency: calcResult.values['F604_A09_PRESENTATION_CURRENCY']
      },
      schedule1_ProfitLoss: {
        grossRevenue: calcResult.values['F604_B01_GROSS_REVENUE'],
        costOfSales: calcResult.values['F604_B02_COST_OF_SALES'],
        grossProfit: calcResult.values['F604_B03_GROSS_PROFIT'],
        totalOtherIncome: calcResult.values['F604_B11_TOTAL_OTHER_INCOME'],
        totalOperatingExpenses: calcResult.values['F604_B21_TOTAL_OPERATING_EXPENSES'],
        accountingProfitBeforeTax: calcResult.values['F604_B22_NET_PROFIT_BEFORE_TAX']
      },
      taxAdjustments: {
        totalAdditions: calcResult.values['F604_C08_TOTAL_TAX_ADDITIONS'],
        totalDeductions: calcResult.values['F604_C12_TOTAL_TAX_DEDUCTIONS'],
        netTaxAdjustments: calcResult.values['F604_C13_NET_TAX_ADJUSTMENTS']
      },
      schedule2_CapitalAllowances: {
        totalClaimableCapitalAllowance: calcResult.values['F604_D09_TOTAL_CAPITAL_ALLOWANCE']
      },
      taxableIncomeLoss: {
        adjustedTaxableProfitBeforeLoss: calcResult.values['F604_E01_ADJ_TAXABLE_PROFIT_BEFORE_LOSS'],
        priorLossesBroughtForward: calcResult.values['F604_E04_VALID_LOSSES_BROUGHT_FORWARD'],
        lossReliefUtilized: calcResult.values['F604_E05_LOSS_RELIEF_UTILIZED'],
        currentYearTaxLoss: calcResult.values['F604_E06_CURRENT_YEAR_TAX_LOSS'],
        remainingLossCarriedForward: calcResult.values['F604_E07_REMAINING_UNABSORBED_LOSS_CF'],
        netTaxableIncome: calcResult.values['F604_E08_NET_TAXABLE_INCOME']
      },
      taxComputation: {
        grossTaxLiability: calcResult.values['F604_F03_GROSS_TAX_LIABILITY'],
        totalTaxCredits: calcResult.values['F604_F06_TOTAL_TAX_CREDITS'],
        netTaxLiability: calcResult.values['F604_F07_NET_TAX_LIABILITY'],
        effectiveTaxRate: calcResult.values['F604_F08_EFFECTIVE_TAX_RATE'],
        brackets: calcResult.values['F604_F02_TAX_BRACKET_DETAILS']
      },
      settlement: {
        totalPrepaymentsAndWithholding: calcResult.values['F604_G07_TOTAL_PREPAYMENTS_AND_WHT'],
        netBalanceDueOrRefundable: calcResult.values['F604_G08_NET_BALANCE_DUE_OR_REFUNDABLE'],
        finalTaxPayable: calcResult.values['F604_G09_FINAL_TAX_PAYABLE'],
        finalRefundClaimable: calcResult.values['F604_G10_FINAL_REFUND_CLAIMABLE']
      },
      declaration: {
        declarantName: calcResult.values['F604_H01_DECLARANT_NAME'],
        declarantDesignation: calcResult.values['F604_H02_DECLARANT_DESIGNATION'],
        declarantIdOrPassport: calcResult.values['F604_H03_DECLARANT_ID_PASSPORT'],
        declarationDate: calcResult.values['F604_H04_DECLARATION_DATE'],
        confirmationAccepted: calcResult.values['F604_H05_CONFIRMATION_ACCEPTED']
      },
      // Attached Statutory Schedules
      schedules: schedulesPayload,
      audit: {
        isValid: validationResult.isValid,
        errorCount: validationResult.errors.length,
        warningCount: validationResult.warnings.length,
        tracesCount: Object.keys(calcResult.traces).length,
        schedulesProcessed: {
          schedule2: schedulesResult.schedule2?.isApplicable,
          schedule3: schedulesResult.schedule3?.isApplicable,
          schedule4: schedulesResult.schedule4?.isApplicable,
          schedule5: schedulesResult.schedule5?.isApplicable
        }
      }
    };

    return {
      formInstance,
      calculationSummary: calcResult.summary,
      schedulesResult,
      miraconnectJson: JSON.stringify(miraconnectPayload, null, 2),
      miraconnectPayload
    };
  }
}

