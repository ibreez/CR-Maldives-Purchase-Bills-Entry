import Decimal from 'decimal.js';
import { TaxpayerType } from '../../../../types';
import { FormFieldDefinition, FieldSourceTrace, FormValidationResult, FormValidationError } from '../../../types';
import { Schedule4SourceData, InternationalAssociateTransaction, ScheduleInstance, ScheduleApplicabilityResult } from '../types';

export const SCHEDULE_4_V25_1_FIELDS: FormFieldDefinition[] = [
  // General Applicability & Documentation
  {
    fieldCode: 'SCH4_A01_HAS_INTL_ASSOCIATE_TX',
    label: 'Engaged in International Transactions with Associates',
    dataType: 'BOOLEAN',
    required: true,
    source: 'USER_INPUT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'GENERAL_DISCLOSURE'
  },
  {
    fieldCode: 'SCH4_A02_ASSOCIATE_RECORDS_COUNT',
    label: 'Total Number of Associate Transaction Entries',
    dataType: 'NUMBER',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'GENERAL_DISCLOSURE'
  },
  {
    fieldCode: 'SCH4_A03_TP_MASTER_FILE_HELD',
    label: 'Transfer Pricing Master File Maintained',
    dataType: 'BOOLEAN',
    required: false,
    source: 'USER_INPUT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'GENERAL_DISCLOSURE'
  },
  {
    fieldCode: 'SCH4_A04_TP_LOCAL_FILE_HELD',
    label: 'Transfer Pricing Local Documentation File Maintained',
    dataType: 'BOOLEAN',
    required: false,
    source: 'USER_INPUT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'GENERAL_DISCLOSURE'
  },

  // Category Totals
  {
    fieldCode: 'SCH4_B01_TOTAL_SALES_OUTBOUND',
    label: 'Total Sale of Tangible Goods to Associates',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'TRANSACTION_TOTALS'
  },
  {
    fieldCode: 'SCH4_B02_TOTAL_PURCHASES_INBOUND',
    label: 'Total Purchase of Tangible Goods from Associates',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'TRANSACTION_TOTALS'
  },
  {
    fieldCode: 'SCH4_B03_TOTAL_SERVICES_PROVIDED',
    label: 'Total Cross-Border Services Provided to Associates',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'TRANSACTION_TOTALS'
  },
  {
    fieldCode: 'SCH4_B04_TOTAL_SERVICES_RECEIVED',
    label: 'Total Cross-Border Services Received from Associates',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'TRANSACTION_TOTALS'
  },
  {
    fieldCode: 'SCH4_B05_TOTAL_ROYALTIES_IP',
    label: 'Total Royalties, License & IP Fees with Associates',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'TRANSACTION_TOTALS'
  },
  {
    fieldCode: 'SCH4_B06_TOTAL_FINANCE_INTEREST',
    label: 'Total Financial Transactions, Loans & Interest with Associates',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'TRANSACTION_TOTALS'
  },
  {
    fieldCode: 'SCH4_B07_TOTAL_MANAGEMENT_GUARANTEES',
    label: 'Total Management Fees, Guarantees & Other Associate Transactions',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'TRANSACTION_TOTALS'
  },
  {
    fieldCode: 'SCH4_B08_TOTAL_GROSS_RECORDED_VALUE',
    label: 'Total Gross Value of Recorded Associate Transactions',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'TRANSACTION_TOTALS',
    formula: {
      formulaId: 'SCH4_F01',
      expression: 'SCH4_B01 + SCH4_B02 + SCH4_B03 + SCH4_B04 + SCH4_B05 + SCH4_B06 + SCH4_B07',
      description: 'Sum of all recorded associate transactions',
      dependencies: ['SCH4_B01_TOTAL_SALES_OUTBOUND', 'SCH4_B02_TOTAL_PURCHASES_INBOUND', 'SCH4_B03_TOTAL_SERVICES_PROVIDED', 'SCH4_B04_TOTAL_SERVICES_RECEIVED', 'SCH4_B05_TOTAL_ROYALTIES_IP', 'SCH4_B06_TOTAL_FINANCE_INTEREST', 'SCH4_B07_TOTAL_MANAGEMENT_GUARANTEES']
    }
  },
  {
    fieldCode: 'SCH4_B09_TOTAL_ARMS_LENGTH_VALUE',
    label: 'Total Arm’s Length Value of Associate Transactions',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'TRANSACTION_TOTALS'
  },
  {
    fieldCode: 'SCH4_C01_TOTAL_TP_TAX_ADJUSTMENT',
    label: 'Net Transfer Pricing Tax Adjustment (Add-Back to Taxable Profit)',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'TP_ADJUSTMENT',
    description: 'Transfer pricing profit adjustment to be reported in MIRA 604 Section C Tax Adjustments'
  }
];

export class Schedule4 {
  public static readonly VERSION = 'v25.1';
  public static readonly CODE = 'SCHEDULE_4';
  public static readonly TITLE = 'Schedule 4: Reporting of International Transactions with Associates';

  /**
   * Determines if Schedule 4 is applicable
   */
  public static checkApplicability(
    taxpayerType: TaxpayerType,
    data?: Schedule4SourceData
  ): ScheduleApplicabilityResult {
    const hasFlag = data?.hasInternationalAssociateTransactions === true;
    const hasRecords = !!data?.transactions && data.transactions.length > 0;

    if (hasFlag || hasRecords) {
      return {
        scheduleCode: 'SCHEDULE_4',
        isApplicable: true,
        reason: 'Applicable due to active cross-border related-party transactions with associated enterprises (Section 67/68 of Income Tax Act).'
      };
    }

    return {
      scheduleCode: 'SCHEDULE_4',
      isApplicable: false,
      reason: 'No international transactions with associates reported for this tax year.'
    };
  }

  /**
   * Generates and calculates Schedule 4 instance
   */
  public static generate(
    sourceData: Schedule4SourceData | undefined,
    taxpayerType: TaxpayerType,
    taxYear: number
  ): ScheduleInstance<Schedule4SourceData> {
    const startTime = Date.now();
    const applicability = this.checkApplicability(taxpayerType, sourceData);
    const now = new Date().toISOString();
    const values: Record<string, any> = {};
    const traces: Record<string, FieldSourceTrace> = {};

    if (!applicability.isApplicable || !sourceData) {
      return {
        scheduleCode: 'SCHEDULE_4',
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

    const txs: InternationalAssociateTransaction[] = sourceData.transactions || [];
    const d = (n?: number) => new Decimal(n || 0);

    let totalSales = new Decimal(0);
    let totalPurchases = new Decimal(0);
    let totalServProvided = new Decimal(0);
    let totalServReceived = new Decimal(0);
    let totalRoyalties = new Decimal(0);
    let totalFinance = new Decimal(0);
    let totalMgmt = new Decimal(0);
    let totalRecorded = new Decimal(0);
    let totalArmsLength = new Decimal(0);
    let totalTpAdjustment = new Decimal(0);

    const processedItems: Array<InternationalAssociateTransaction & { adjustmentAmount: number }> = [];

    for (const tx of txs) {
      const recAmt = d(tx.recordedAmount);
      const armAmt = d(tx.armsLengthAmount);
      totalRecorded = totalRecorded.plus(recAmt);
      totalArmsLength = totalArmsLength.plus(armAmt);

      // Determine Category Aggregation
      switch (tx.transactionCategory) {
        case 'SALE_OF_GOODS':
          totalSales = totalSales.plus(recAmt);
          break;
        case 'PURCHASE_OF_GOODS':
          totalPurchases = totalPurchases.plus(recAmt);
          break;
        case 'SERVICES_PROVIDED':
          totalServProvided = totalServProvided.plus(recAmt);
          break;
        case 'SERVICES_RECEIVED':
          totalServReceived = totalServReceived.plus(recAmt);
          break;
        case 'ROYALTIES_IP_FEES':
          totalRoyalties = totalRoyalties.plus(recAmt);
          break;
        case 'FINANCE_INTEREST_PAID':
        case 'FINANCE_INTEREST_RECEIVED':
          totalFinance = totalFinance.plus(recAmt);
          break;
        case 'MANAGEMENT_FEES':
        case 'GUARANTEE_FEES':
        case 'CAPITAL_TRANSACTION':
        case 'OTHER':
        default:
          totalMgmt = totalMgmt.plus(recAmt);
          break;
      }

      // Compute TP adjustment per transaction category:
      // For sales/income: if recorded < armsLength, adjustment = armsLength - recorded (understated income)
      // For purchases/expenses: if recorded > armsLength, adjustment = recorded - armsLength (overstated expense)
      let itemAdjustment = new Decimal(0);
      const isRevenue = tx.transactionCategory === 'SALE_OF_GOODS' || 
                        tx.transactionCategory === 'SERVICES_PROVIDED' || 
                        tx.transactionCategory === 'FINANCE_INTEREST_RECEIVED';

      if (isRevenue) {
        if (armAmt.greaterThan(recAmt)) {
          itemAdjustment = armAmt.minus(recAmt);
        }
      } else {
        if (recAmt.greaterThan(armAmt)) {
          itemAdjustment = recAmt.minus(armAmt);
        }
      }

      totalTpAdjustment = totalTpAdjustment.plus(itemAdjustment);
      processedItems.push({
        ...tx,
        adjustmentAmount: itemAdjustment.toNumber()
      });
    }

    values['SCH4_A01_HAS_INTL_ASSOCIATE_TX'] = true;
    values['SCH4_A02_ASSOCIATE_RECORDS_COUNT'] = txs.length;
    values['SCH4_A03_TP_MASTER_FILE_HELD'] = !!sourceData.tpMasterFileHeld;
    values['SCH4_A04_TP_LOCAL_FILE_HELD'] = !!sourceData.tpLocalFileHeld;

    values['SCH4_B01_TOTAL_SALES_OUTBOUND'] = totalSales.toNumber();
    values['SCH4_B02_TOTAL_PURCHASES_INBOUND'] = totalPurchases.toNumber();
    values['SCH4_B03_TOTAL_SERVICES_PROVIDED'] = totalServProvided.toNumber();
    values['SCH4_B04_TOTAL_SERVICES_RECEIVED'] = totalServReceived.toNumber();
    values['SCH4_B05_TOTAL_ROYALTIES_IP'] = totalRoyalties.toNumber();
    values['SCH4_B06_TOTAL_FINANCE_INTEREST'] = totalFinance.toNumber();
    values['SCH4_B07_TOTAL_MANAGEMENT_GUARANTEES'] = totalMgmt.toNumber();
    values['SCH4_B08_TOTAL_GROSS_RECORDED_VALUE'] = totalRecorded.toNumber();
    values['SCH4_B09_TOTAL_ARMS_LENGTH_VALUE'] = totalArmsLength.toNumber();
    values['SCH4_C01_TOTAL_TP_TAX_ADJUSTMENT'] = totalTpAdjustment.toNumber();

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

    addTrace('SCH4_A01_HAS_INTL_ASSOCIATE_TX', 'USER_INPUT', 'Affirmation of international associate transactions');
    addTrace('SCH4_A02_ASSOCIATE_RECORDS_COUNT', 'CALCULATED', 'Total associate transaction records submitted', `${txs.length} records`);
    addTrace('SCH4_B01_TOTAL_SALES_OUTBOUND', 'CALCULATED', 'Aggregate outbound sale of tangible goods to associates');
    addTrace('SCH4_B02_TOTAL_PURCHASES_INBOUND', 'CALCULATED', 'Aggregate inbound purchase of tangible goods from associates');
    addTrace('SCH4_B03_TOTAL_SERVICES_PROVIDED', 'CALCULATED', 'Aggregate cross-border services rendered to associates');
    addTrace('SCH4_B04_TOTAL_SERVICES_RECEIVED', 'CALCULATED', 'Aggregate cross-border services procured from associates');
    addTrace('SCH4_B05_TOTAL_ROYALTIES_IP', 'CALCULATED', 'Aggregate royalties and intangible property payments');
    addTrace('SCH4_B06_TOTAL_FINANCE_INTEREST', 'CALCULATED', 'Aggregate intercompany loan finance costs & interest');
    addTrace('SCH4_B07_TOTAL_MANAGEMENT_GUARANTEES', 'CALCULATED', 'Aggregate management, guarantee and capital charges');
    addTrace('SCH4_B08_TOTAL_GROSS_RECORDED_VALUE', 'CALCULATED', 'Sum of all associate transactions recorded value', undefined, ['SCH4_B01_TOTAL_SALES_OUTBOUND', 'SCH4_B02_TOTAL_PURCHASES_INBOUND', 'SCH4_B03_TOTAL_SERVICES_PROVIDED', 'SCH4_B04_TOTAL_SERVICES_RECEIVED', 'SCH4_B05_TOTAL_ROYALTIES_IP', 'SCH4_B06_TOTAL_FINANCE_INTEREST', 'SCH4_B07_TOTAL_MANAGEMENT_GUARANTEES']);
    addTrace('SCH4_B09_TOTAL_ARMS_LENGTH_VALUE', 'CALCULATED', 'Sum of all benchmarked arm’s length values');
    addTrace('SCH4_C01_TOTAL_TP_TAX_ADJUSTMENT', 'CALCULATED', 'Net Section 67/68 transfer pricing taxable add-back adjustment', `Sum of line-item TP adjustments = MVR ${totalTpAdjustment.toFixed(2)}`);

    // Validation
    const errors: FormValidationError[] = [];
    const warnings: FormValidationError[] = [];

    if (txs.length === 0) {
      errors.push({
        fieldCode: 'SCH4_A02_ASSOCIATE_RECORDS_COUNT',
        sectionId: 'GENERAL_DISCLOSURE',
        severity: 'ERROR',
        message: 'Schedule 4 is triggered but no international associate transaction line items were provided.'
      });
    }

    txs.forEach((tx, idx) => {
      if (!tx.associateName || tx.associateName.trim() === '') {
        errors.push({
          fieldCode: `SCH4_TX_${idx}_NAME`,
          sectionId: 'TRANSACTION_ITEMS',
          severity: 'ERROR',
          message: `Transaction line #${idx + 1}: Associate name is mandatory.`
        });
      }

      if (!tx.countryOfResidence || tx.countryOfResidence.trim() === '' || tx.countryOfResidence.toUpperCase() === 'MV' || tx.countryOfResidence.toUpperCase() === 'MALDIVES') {
        errors.push({
          fieldCode: `SCH4_TX_${idx}_COUNTRY`,
          sectionId: 'TRANSACTION_ITEMS',
          severity: 'ERROR',
          message: `Transaction line #${idx + 1}: Associate country must be a valid non-Maldives jurisdiction.`
        });
      }

      if (tx.ownershipPercentage < 0 || tx.ownershipPercentage > 100) {
        errors.push({
          fieldCode: `SCH4_TX_${idx}_OWNERSHIP`,
          sectionId: 'TRANSACTION_ITEMS',
          severity: 'ERROR',
          message: `Transaction line #${idx + 1}: Ownership percentage (${tx.ownershipPercentage}%) must be between 0% and 100%.`
        });
      }

      if (tx.recordedAmount < 0) {
        errors.push({
          fieldCode: `SCH4_TX_${idx}_RECORDED_AMT`,
          sectionId: 'TRANSACTION_ITEMS',
          severity: 'ERROR',
          message: `Transaction line #${idx + 1}: Recorded amount cannot be negative.`
        });
      }

      if (tx.armsLengthAmount < 0) {
        errors.push({
          fieldCode: `SCH4_TX_${idx}_ARMS_LENGTH_AMT`,
          sectionId: 'TRANSACTION_ITEMS',
          severity: 'ERROR',
          message: `Transaction line #${idx + 1}: Arm’s length amount cannot be negative.`
        });
      }

      if (!tx.tpDocumentationHeld) {
        warnings.push({
          fieldCode: `SCH4_TX_${idx}_DOCS`,
          sectionId: 'TRANSACTION_ITEMS',
          severity: 'WARNING',
          message: `Transaction line #${idx + 1} (${tx.associateName}): Transfer pricing documentation is marked as not held. Statutory transfer pricing documentation is required under Maldives Transfer Pricing Regulations.`
        });
      }
    });

    const validationResult: FormValidationResult = {
      isValid: errors.length === 0,
      errors,
      warnings
    };

    return {
      scheduleCode: 'SCHEDULE_4',
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
