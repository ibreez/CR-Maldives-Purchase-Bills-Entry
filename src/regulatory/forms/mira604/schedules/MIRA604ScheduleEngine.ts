import { TaxpayerType } from '../../../types';
import { FormValidationError } from '../../types';
import { 
  MIRA604SchedulesContext, 
  ScheduleEngineResult,
  MIRA604ScheduleCode
} from './types';
import { Schedule2, Schedule3, Schedule4, Schedule5 } from './v25_1';

export class MIRA604ScheduleEngine {
  /**
   * Processes all MIRA 604 statutory schedules based on taxpayer context and applicability rules
   */
  public static processSchedules(context: MIRA604SchedulesContext): ScheduleEngineResult {
    const { taxpayerType, taxYear, schedule2Data, schedule3Data, schedule4Data, schedule5Data } = context;

    // 1. Process Schedule 2: Statement of Financial Position
    const sch2 = Schedule2.generate(schedule2Data, taxpayerType, taxYear);

    // 2. Process Schedule 3: Statement of Net Worth Excluding Business
    const sch3 = Schedule3.generate(schedule3Data, taxpayerType, taxYear);

    // 3. Process Schedule 4: Reporting of International Transactions with Associates
    const sch4 = Schedule4.generate(schedule4Data, taxpayerType, taxYear);

    // 4. Process Schedule 5: Reporting of Share of Taxable Income from Controlled Foreign Entities
    const sch5 = Schedule5.generate(schedule5Data, taxpayerType, taxYear);

    // 5. Aggregate validation errors across all active schedules
    const allErrors: FormValidationError[] = [];
    const allWarnings: FormValidationError[] = [];

    const collectDiagnostics = (sch: { isApplicable: boolean; validationResult: { errors: FormValidationError[]; warnings: FormValidationError[] } }) => {
      if (sch.isApplicable) {
        allErrors.push(...sch.validationResult.errors);
        allWarnings.push(...sch.validationResult.warnings);
      }
    };

    collectDiagnostics(sch2);
    collectDiagnostics(sch3);
    collectDiagnostics(sch4);
    collectDiagnostics(sch5);

    // 6. Build reconciliation summary
    const reconciliationSummary = {
      schedule2BalanceVariance: sch2.isApplicable ? (sch2.values['SCH2_C01_BALANCE_CHECK_VARIANCE'] || 0) : 0,
      schedule3NetWorth: sch3.isApplicable ? (sch3.values['SCH3_C01_NET_NON_BUSINESS_WORTH'] || 0) : 0,
      schedule4TotalAdjustment: sch4.isApplicable ? (sch4.values['SCH4_C01_TOTAL_TP_TAX_ADJUSTMENT'] || 0) : 0,
      schedule5TotalAttributableIncome: sch5.isApplicable ? (sch5.values['SCH5_C01_TOTAL_ATTRIBUTABLE_CFE_INCOME'] || 0) : 0,
      schedule5TotalForeignTaxCredit: sch5.isApplicable ? (sch5.values['SCH5_C02_TOTAL_CFE_FOREIGN_TAX_CREDIT'] || 0) : 0
    };

    let overallStatus: ScheduleEngineResult['overallStatus'] = 'VALIDATED';
    if (allErrors.length > 0) {
      overallStatus = 'REJECTED';
    } else if (allWarnings.length > 0) {
      overallStatus = 'WARNINGS';
    }

    return {
      schedule2: sch2,
      schedule3: sch3,
      schedule4: sch4,
      schedule5: sch5,
      reconciliationSummary,
      overallStatus,
      validationErrors: allErrors
    };
  }

  /**
   * Generates formatted MIRAconnect payload segment for all applicable schedules
   */
  public static buildMIRAconnectSchedulesPayload(result: ScheduleEngineResult): Record<string, any> {
    const payload: Record<string, any> = {};

    if (result.schedule2?.isApplicable) {
      payload.schedule2_FinancialPosition = {
        version: result.schedule2.version,
        status: result.schedule2.status,
        nonCurrentAssets: {
          propertyPlantEquipment: result.schedule2.values['SCH2_A01_PPE'],
          investmentProperty: result.schedule2.values['SCH2_A02_INVESTMENT_PROPERTY'],
          intangibles: result.schedule2.values['SCH2_A03_INTANGIBLES'],
          longTermInvestments: result.schedule2.values['SCH2_A04_LONG_TERM_INVESTMENTS'],
          otherNonCurrentAssets: result.schedule2.values['SCH2_A05_OTHER_NON_CURRENT_ASSETS'],
          totalNonCurrentAssets: result.schedule2.values['SCH2_A06_TOTAL_NON_CURRENT_ASSETS']
        },
        currentAssets: {
          inventories: result.schedule2.values['SCH2_A07_INVENTORIES'],
          tradeReceivables: result.schedule2.values['SCH2_A08_TRADE_RECEIVABLES'],
          cashAndCashEquivalents: result.schedule2.values['SCH2_A09_CASH_EQUIVALENTS'],
          shortTermInvestments: result.schedule2.values['SCH2_A10_SHORT_TERM_INVESTMENTS'],
          prepaymentsAndOther: result.schedule2.values['SCH2_A11_PREPAYMENTS_OTHER_CURRENT'],
          totalCurrentAssets: result.schedule2.values['SCH2_A12_TOTAL_CURRENT_ASSETS']
        },
        totalAssets: result.schedule2.values['SCH2_A13_TOTAL_ASSETS'],
        equity: {
          shareCapital: result.schedule2.values['SCH2_B01_SHARE_CAPITAL'],
          retainedEarnings: result.schedule2.values['SCH2_B02_RETAINED_EARNINGS'],
          otherReserves: result.schedule2.values['SCH2_B03_OTHER_RESERVES'],
          totalEquity: result.schedule2.values['SCH2_B04_TOTAL_EQUITY']
        },
        nonCurrentLiabilities: {
          longTermBorrowings: result.schedule2.values['SCH2_B05_LONG_TERM_BORROWINGS'],
          deferredTaxLiabilities: result.schedule2.values['SCH2_B06_DEFERRED_TAX_LIABILITY'],
          otherNonCurrentLiabilities: result.schedule2.values['SCH2_B07_OTHER_NON_CURRENT_LIABILITIES'],
          totalNonCurrentLiabilities: result.schedule2.values['SCH2_B08_TOTAL_NON_CURRENT_LIABILITIES']
        },
        currentLiabilities: {
          tradePayables: result.schedule2.values['SCH2_B09_TRADE_PAYABLES'],
          shortTermBorrowings: result.schedule2.values['SCH2_B10_SHORT_TERM_BORROWINGS'],
          currentTaxPayable: result.schedule2.values['SCH2_B11_CURRENT_TAX_LIABILITY'],
          otherCurrentLiabilities: result.schedule2.values['SCH2_B12_OTHER_CURRENT_LIABILITIES'],
          totalCurrentLiabilities: result.schedule2.values['SCH2_B13_TOTAL_CURRENT_LIABILITIES']
        },
        totalLiabilities: result.schedule2.values['SCH2_B14_TOTAL_LIABILITIES'],
        totalEquityAndLiabilities: result.schedule2.values['SCH2_B15_TOTAL_EQUITY_AND_LIABILITIES'],
        balanceCheckVariance: result.schedule2.values['SCH2_C01_BALANCE_CHECK_VARIANCE']
      };
    }

    if (result.schedule3?.isApplicable) {
      payload.schedule3_NetWorthExcludingBusiness = {
        version: result.schedule3.version,
        status: result.schedule3.status,
        personalAssets: {
          immovableProperty: result.schedule3.values['SCH3_A01_IMMOVABLE_PROPERTY'],
          vehiclesAndVessels: result.schedule3.values['SCH3_A02_VEHICLES_VESSELS'],
          bankDepositsAndCash: result.schedule3.values['SCH3_A03_BANK_DEPOSITS_CASH'],
          sharesAndSecurities: result.schedule3.values['SCH3_A04_SHARES_SECURITIES'],
          jewelryAndValuables: result.schedule3.values['SCH3_A05_JEWELRY_VALUABLES'],
          personalReceivables: result.schedule3.values['SCH3_A06_PERSONAL_RECEIVABLES'],
          otherPersonalAssets: result.schedule3.values['SCH3_A07_OTHER_PERSONAL_ASSETS'],
          totalPersonalAssets: result.schedule3.values['SCH3_A08_TOTAL_PERSONAL_ASSETS']
        },
        personalLiabilities: {
          housingMortgages: result.schedule3.values['SCH3_B01_HOUSING_MORTGAGES'],
          personalBankLoans: result.schedule3.values['SCH3_B02_PERSONAL_BANK_LOANS'],
          creditCardsAndOther: result.schedule3.values['SCH3_B03_CREDIT_CARDS_OTHER'],
          totalPersonalLiabilities: result.schedule3.values['SCH3_B04_TOTAL_PERSONAL_LIABILITIES']
        },
        netNonBusinessWorth: result.schedule3.values['SCH3_C01_NET_NON_BUSINESS_WORTH'],
        previousYearNetWorth: result.schedule3.values['SCH3_C02_PREVIOUS_YEAR_NET_WORTH'],
        netWorthMovement: result.schedule3.values['SCH3_C03_NET_WORTH_MOVEMENT']
      };
    }

    if (result.schedule4?.isApplicable) {
      payload.schedule4_InternationalAssociateTransactions = {
        version: result.schedule4.version,
        status: result.schedule4.status,
        summary: {
          hasInternationalTransactions: result.schedule4.values['SCH4_A01_HAS_INTL_ASSOCIATE_TX'],
          totalRecordsCount: result.schedule4.values['SCH4_A02_ASSOCIATE_RECORDS_COUNT'],
          tpMasterFileHeld: result.schedule4.values['SCH4_A03_TP_MASTER_FILE_HELD'],
          tpLocalFileHeld: result.schedule4.values['SCH4_A04_TP_LOCAL_FILE_HELD'],
          totalSalesOutbound: result.schedule4.values['SCH4_B01_TOTAL_SALES_OUTBOUND'],
          totalPurchasesInbound: result.schedule4.values['SCH4_B02_TOTAL_PURCHASES_INBOUND'],
          totalServicesProvided: result.schedule4.values['SCH4_B03_TOTAL_SERVICES_PROVIDED'],
          totalServicesReceived: result.schedule4.values['SCH4_B04_TOTAL_SERVICES_RECEIVED'],
          totalRoyaltiesIp: result.schedule4.values['SCH4_B05_TOTAL_ROYALTIES_IP'],
          totalFinanceInterest: result.schedule4.values['SCH4_B06_TOTAL_FINANCE_INTEREST'],
          totalManagementGuarantees: result.schedule4.values['SCH4_B07_TOTAL_MANAGEMENT_GUARANTEES'],
          totalGrossRecordedValue: result.schedule4.values['SCH4_B08_TOTAL_GROSS_RECORDED_VALUE'],
          totalArmsLengthValue: result.schedule4.values['SCH4_B09_TOTAL_ARMS_LENGTH_VALUE'],
          totalTransferPricingAdjustment: result.schedule4.values['SCH4_C01_TOTAL_TP_TAX_ADJUSTMENT']
        },
        transactions: result.schedule4.items || []
      };
    }

    if (result.schedule5?.isApplicable) {
      payload.schedule5_ControlledForeignEntities = {
        version: result.schedule5.version,
        status: result.schedule5.status,
        summary: {
          hasControlledForeignEntities: result.schedule5.values['SCH5_A01_HAS_CFE_INTERESTS'],
          totalRecordsCount: result.schedule5.values['SCH5_A02_CFE_RECORDS_COUNT'],
          totalCfeAccountingProfit: result.schedule5.values['SCH5_B01_TOTAL_CFE_ACCOUNTING_PROFIT'],
          totalCfeForeignTaxPaid: result.schedule5.values['SCH5_B02_TOTAL_CFE_FOREIGN_TAX_PAID'],
          totalAttributableCfeIncome: result.schedule5.values['SCH5_C01_TOTAL_ATTRIBUTABLE_CFE_INCOME'],
          totalAllowableForeignTaxCredit: result.schedule5.values['SCH5_C02_TOTAL_CFE_FOREIGN_TAX_CREDIT']
        },
        entities: result.schedule5.items || []
      };
    }

    return payload;
  }
}
