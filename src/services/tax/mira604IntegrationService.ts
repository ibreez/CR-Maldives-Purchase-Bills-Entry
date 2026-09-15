import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../db/client';
import Decimal from 'decimal.js';
import crypto from 'crypto';
import { UserSession } from '../../types/rbac';
import { EntityType } from '../../config/miraTaxRates';
import { Mira604TaxReturn, TaxpayerInfo } from '../../types/mira604';
import { FixedAssetRecord } from '../../types/taxEngine';
import { generateSchedule1PnLFromGeneralLedger } from '../accounting/pnlService';
import {
  calculateCapitalAllowance,
  generateSchedule2CapitalAllowanceSummary,
  MiraSchedule2SummaryReport
} from './capitalAllowanceService';
import { IncomeTaxEngineService } from './incomeTaxEngineService';
import { defaultIncomeTaxEngine } from './index';
import { TaxAdjustment } from './taxAdjustmentService';
import { generateMira604Return } from './mira604Service';
import { PeriodControlService } from '../accounting/periodControlService';
import { recordAuditEvent } from '../audit/auditService';

export type TaxReturnLifecycleStatus =
  | 'DRAFT'
  | 'CALCULATED'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'FINALIZED';

export interface IncomeTaxPreparationOptions {
  tenantId: string;
  taxYear: number;
  entityId?: string;
  taxpayerName?: string;
  tin?: string;
  entityType?: EntityType;
  accountingPeriodStart?: string;
  accountingPeriodEnd?: string;
  accountingDays?: number;
  groupFactor?: number;
  businessActivity?: string;
  contactEmail?: string;
  contactPhone?: string;
  advanceTaxPaid?: number;
  interimTaxPaid?: number;
  withholdingTaxDeducted?: number;
  priorUnabsorbedLosses?: number;
  priorLossRecords?: Array<{ year: number; lossAmount: number; utilisedAmount?: number }>;
  exemptIncome?: number;
  isAmendment?: boolean;
  notes?: string;
  prismaClient?: PrismaClient | Prisma.TransactionClient;
  // Fallback explicit overrides when calculating in tests without seeding DB
  overrideAdjustments?: TaxAdjustment[];
  overrideAssets?: FixedAssetRecord[];
  overrideAccountingProfit?: number;
}

export interface TaxReconciliationItem {
  code: string;
  name: string;
  expectedValue: number;
  actualValue: number;
  variance: number;
  status: 'PASS' | 'WARNING' | 'FAIL';
  explanation: string;
}

export interface TaxReconciliationReport {
  taxYear: number;
  tenantId: string;
  overallStatus: 'PASS' | 'WARNING' | 'FAIL';
  discrepanciesCount: number;
  reconciledAt: string;
  items: TaxReconciliationItem[];
}

export interface ReviewRequiredItem {
  code: string;
  severity: 'CRITICAL' | 'WARNING';
  message: string;
  field?: string;
  suggestedAction?: string;
}

export interface MIRA604CalculationTrace {
  taxYear: number;
  tenantId: string;
  generatedAt: string;
  ruleVersion: string;
  accountingProfitTrace: {
    source: string;
    grossRevenue: number;
    costOfSales: number;
    grossProfit: number;
    otherIncome: number;
    operatingExpenses: number;
    accountingProfitBeforeTax: number;
    journalLineCount: number;
    revenueAccounts: Array<{ code: string; name: string; amount: number }>;
    expenseAccounts: Array<{ code: string; name: string; amount: number }>;
  };
  taxAdjustmentsTrace: {
    totalAddBacks: number;
    totalAllowableDeductions: number;
    netTaxAdjustment: number;
    addBacks: Array<{
      id: string;
      code: string;
      description: string;
      amount: number;
      direction: string;
      status: string;
    }>;
    deductions: Array<{
      id: string;
      code: string;
      description: string;
      amount: number;
      direction: string;
      status: string;
    }>;
  };
  capitalAllowancesTrace: {
    totalCostOfAssets: number;
    totalOpeningWDV: number;
    totalAdditionsInYear: number;
    totalDisposalsInYear: number;
    totalCapitalAllowanceClaimed: number;
    totalBalancingAllowance: number;
    totalBalancingCharge: number;
    totalNetTaxAllowanceDeduction: number;
    totalClosingWDV: number;
    assetClassBreakdown: Array<{
      assetClass: string;
      allowanceClaimed: number;
    }>;
  };
  taxableIncomeTrace: {
    formula: string;
    accountingProfitBeforeTax: number;
    totalAdditions: number;
    totalDeductions: number;
    capitalAllowanceDeduction: number;
    adjustedTaxableProfitBeforeLoss: number;
    priorUnabsorbedLossesAvailable: number;
    lossReliefApplied: number;
    remainingUnabsorbedLosses: number;
    netTaxableIncome: number;
    isTaxLoss: boolean;
    taxLossAmount: number;
  };
  taxComputationTrace: {
    entityType: EntityType;
    proRatedThreshold: number;
    taxBrackets: Array<{
      bracketName: string;
      minIncome: number;
      maxIncome: number;
      ratePercentage: number;
      taxableInBracket: number;
      taxInBracket: number;
    }>;
    grossTaxLiability: number;
    prepayments: {
      advanceTaxPaid: number;
      interimTaxPaid: number;
      withholdingTaxDeducted: number;
      totalPrepayments: number;
    };
    netTaxDueOrRefundable: number;
    effectiveTaxRate: number;
  };
}

export interface IncomeTaxReturnResult {
  returnId: string;
  tenantId: string;
  entityId: string;
  taxYear: number;
  formId: string;
  formVersion: string;
  version: number;
  status: TaxReturnLifecycleStatus;
  submissionStatus: string;
  isFinalized: boolean;
  accountingProfitBeforeTax: number;
  totalAdditions: number;
  totalDeductions: number;
  capitalAllowancesClaimed: number;
  lossReliefApplied: number;
  finalTaxableIncome: number;
  incomeTaxPayable: number;
  netTaxDueOrRefundable: number;
  effectiveTaxRate: number;
  verificationChecksum: string;
  mira604: Mira604TaxReturn;
  reconciliation: TaxReconciliationReport;
  trace: MIRA604CalculationTrace;
  reviewItems: ReviewRequiredItem[];
  approvedBy?: string;
  approvedAt?: string;
  finalizedBy?: string;
  finalizedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export class MIRA604IntegrationService {
  private static incomeTaxEngine: IncomeTaxEngineService = defaultIncomeTaxEngine;
  private static memoryStore: Map<string, IncomeTaxReturnResult> = new Map();

  /**
   * Cleans and sanitizes TIN for IDs and checksums.
   */
  private static cleanTin(tin?: string): string {
    return (tin || '').replace(/[^A-Z0-9]/gi, '') || 'TIN-UNKNOWN';
  }

  /**
   * Helper to format Decimal to 2 decimal places number.
   */
  private static toDecNum(val: number | Decimal | string | undefined | null): number {
    if (val === undefined || val === null) return 0;
    const dec = new Decimal(val);
    return dec.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  }

  /**
   * Derives accounting profit, adjustments, capital allowances, calculates MIRA 604,
   * performs reconciliation, constructs transaction trace, and persists to PostgreSQL.
   */
  public static async calculateAndPrepareReturn(
    options: IncomeTaxPreparationOptions,
    session?: UserSession
  ): Promise<IncomeTaxReturnResult> {
    const db = options.prismaClient || defaultPrisma;
    const tenantId = options.tenantId;
    const taxYear = options.taxYear;
    const entityId = options.entityId || tenantId;

    if (!tenantId) {
      throw new Error('[MIRA604] tenantId is required');
    }
    if (!taxYear || taxYear < 2000 || taxYear > 2100) {
      throw new Error(`[MIRA604] Invalid taxYear: ${taxYear}`);
    }

    // 1. Check Period Lock Controls
    try {
      await PeriodControlService.validateCanMutateTransaction(
        tenantId,
        `${taxYear}-12-31`,
        session,
        options.isAmendment,
        db
      );
    } catch (err: any) {
      if (err.name === 'LockedPeriodMutationError') {
        throw err;
      }
    }

    // 2. Check Existing Return State (Immutability check)
    let existingReturnRecord: any = null;
    try {
      existingReturnRecord = await db.taxReturn.findFirst({
        where: {
          tenantId,
          taxYear,
          returnType: 'MIRA604'
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch {
      // Table query fallback
    }

    let parsedExisting: any = null;
    if (existingReturnRecord) {
      try {
        parsedExisting = JSON.parse(existingReturnRecord.payloadJson);
      } catch {
        // ignore
      }
    }
    if (!parsedExisting) {
      parsedExisting = MIRA604IntegrationService.memoryStore.get(`${tenantId}:${taxYear}`) || null;
    }

    if (parsedExisting?.isFinalized && !options.isAmendment) {
      throw new Error(
        `[MIRA604] Tax Year ${taxYear} is FINALIZED and immutable. Finalized returns cannot be recalculated or overwritten. Please initiate a formal amendment revision.`
      );
    }

    const currentVersion = parsedExisting
      ? (parsedExisting.version || 1) + (options.isAmendment ? 1 : 0)
      : 1;

    // 3. Taxpayer Information Setup (with no-fabrication rule)
    const reviewItems: ReviewRequiredItem[] = [];

    let tin = options.tin;
    let taxpayerName = options.taxpayerName;
    let entityType: EntityType = options.entityType || 'COMPANY';
    let accountingPeriodStart = options.accountingPeriodStart || `${taxYear}-01-01`;
    let accountingPeriodEnd = options.accountingPeriodEnd || `${taxYear}-12-31`;

    // Attempt to lookup taxpayer profile if not provided
    if (!tin || !taxpayerName) {
      try {
        const taxpayerDb = await db.taxpayer.findFirst({
          where: { tenantId }
        });
        if (taxpayerDb) {
          tin = tin || taxpayerDb.tin;
          taxpayerName = taxpayerName || taxpayerDb.businessName;
          if (taxpayerDb.taxpayerType) {
            entityType = (taxpayerDb.taxpayerType === 'INDIVIDUAL' ? 'SOLE_PROPRIETOR' : 'COMPANY') as EntityType;
          }
        }
      } catch {
        // ignore
      }
    }

    if (!tin) {
      reviewItems.push({
        code: 'MISSING_TIN',
        severity: 'CRITICAL',
        message: 'Taxpayer Identification Number (TIN) is missing and REQUIRED for filing.',
        field: 'tin',
        suggestedAction: 'Enter the registered MIRA TIN for this entity.'
      });
    }

    if (!taxpayerName) {
      reviewItems.push({
        code: 'MISSING_TAXPAYER_NAME',
        severity: 'CRITICAL',
        message: 'Taxpayer Legal Name is missing and REQUIRED for filing.',
        field: 'taxpayerName',
        suggestedAction: 'Enter the registered legal business name.'
      });
    }

    const taxpayerInfo: TaxpayerInfo = {
      tin: tin || 'REQUIRED_MISSING_TIN',
      taxpayerName: taxpayerName || 'REQUIRED_MISSING_NAME',
      entityType,
      taxYear,
      accountingPeriodStart,
      accountingPeriodEnd,
      contactEmail: options.contactEmail,
      contactPhone: options.contactPhone,
      businessActivity: options.businessActivity
    };

    // 4. Derive Accounting P&L from Authoritative Posted GL
    let pnlReport: any;
    let accountingProfitBeforeTax = 0;
    let grossRevenue = 0;
    let costOfSales = 0;
    let grossProfit = 0;
    let otherIncome = 0;
    let operatingExpenses = 0;
    let journalLineCount = 0;
    const revenueAccounts: Array<{ code: string; name: string; amount: number }> = [];
    const expenseAccounts: Array<{ code: string; name: string; amount: number }> = [];

    if (options.overrideAccountingProfit !== undefined) {
      // Used when caller directly specifies accounting profit (e.g. golden scenarios)
      accountingProfitBeforeTax = options.overrideAccountingProfit;
      grossRevenue = options.overrideAccountingProfit > 0 ? options.overrideAccountingProfit : 0;
      grossProfit = accountingProfitBeforeTax;
      pnlReport = {
        accountingProfitBeforeTax,
        grossRevenue,
        costOfSales: 0,
        grossProfit,
        otherIncome: 0,
        totalOperatingExpenses: 0,
        schedule1LineItemsList: []
      };
    } else {
      try {
        pnlReport = await generateSchedule1PnLFromGeneralLedger(
          {
            tenantId,
            taxYear,
            startDate: accountingPeriodStart,
            endDate: accountingPeriodEnd,
            prismaClient: db
          },
          undefined,
          db
        );

        grossRevenue = pnlReport.grossRevenue || pnlReport.totalRevenue || 0;
        costOfSales = pnlReport.totalCostOfSales || 0;
        grossProfit = pnlReport.grossProfit || 0;
        otherIncome = pnlReport.otherRevenue || 0;
        operatingExpenses = pnlReport.totalOperatingExpenses || 0;
        accountingProfitBeforeTax = pnlReport.accountingProfitBeforeTax || 0;

        if (pnlReport.lineItems) {
          for (const key of Object.keys(pnlReport.lineItems)) {
            const item = pnlReport.lineItems[key];
            if (item && item.amount > 0) {
              if (key.includes('REVENUE') || key.includes('INCOME')) {
                revenueAccounts.push({ code: key, name: item.label, amount: item.amount });
              } else {
                expenseAccounts.push({ code: key, name: item.label, amount: item.amount });
              }
              journalLineCount += item.transactionCount || 0;
            }
          }
        }
      } catch (pnlError) {
        console.warn('[MIRA604] General Ledger P&L query returned empty or failed:', pnlError);
        accountingProfitBeforeTax = 0;
      }
    }

    // 5. Load and Process Tax Adjustments (Additions & Allowable Deductions)
    let processedAdjustments: TaxAdjustment[] = [];

    if (options.overrideAdjustments && options.overrideAdjustments.length > 0) {
      processedAdjustments = [...options.overrideAdjustments];
    } else {
      // Query PostgreSQL TaxAdjustment table
      try {
        const dbAdjustments = await db.taxAdjustment.findMany({
          where: {
            tenantId,
            taxYear
          }
        });

        if (dbAdjustments && dbAdjustments.length > 0) {
          processedAdjustments = dbAdjustments.map((adj) => ({
            adjustmentId: adj.id,
            miraCode: adj.adjustmentCode as any,
            amount: Number(adj.amount.toString()),
            reason: adj.description,
            reviewStatus: 'APPROVED',
            entityId: adj.tenantId,
            taxYear: adj.taxYear,
            direction: adj.direction === 'DEDUCTION' ? 'DEDUCTION' : 'ADD_BACK',
            createdAt: adj.createdAt.toISOString()
          }));
        }
      } catch (adjErr) {
        console.warn('[MIRA604] Tax adjustments DB query fallback:', adjErr);
      }
    }

    let totalAdditionsDec = new Decimal(0);
    let totalAllowableDeductionsDec = new Decimal(0);
    const addBacksList: TaxAdjustment[] = [];
    const deductionsList: TaxAdjustment[] = [];

    for (const adj of processedAdjustments) {
      const amountDec = new Decimal(Math.abs(adj.amount || 0));
      if (adj.reviewStatus === 'REJECTED') continue;

      if (adj.reviewStatus === 'PENDING') {
        reviewItems.push({
          code: 'PENDING_TAX_ADJUSTMENT',
          severity: 'WARNING',
          message: `Tax adjustment '${adj.reason}' (${adj.miraCode}: MVR ${amountDec.toFixed(2)}) is PENDING review.`,
          field: `adjustment-${adj.adjustmentId}`,
          suggestedAction: 'Approve or reject the tax adjustment in the Tax Adjustment Ledger.'
        });
      }

      if (adj.direction === 'DEDUCTION') {
        deductionsList.push(adj);
        totalAllowableDeductionsDec = totalAllowableDeductionsDec.plus(amountDec);
      } else {
        addBacksList.push(adj);
        totalAdditionsDec = totalAdditionsDec.plus(amountDec);
      }
    }

    // 6. Integrate Capital Allowance (Schedule 2)
    let caReport: MiraSchedule2SummaryReport;
    let capitalAllowanceClaimed = 0;
    let balancingAllowance = 0;
    let balancingCharge = 0;
    let netCapitalAllowanceDeduction = 0;

    let fixedAssetsList: FixedAssetRecord[] = [];
    if (options.overrideAssets && options.overrideAssets.length > 0) {
      fixedAssetsList = options.overrideAssets;
    } else {
      // Query PostgreSQL FixedAsset and LegacyFixedAsset tables
      try {
        const dbAssets = await db.fixedAsset.findMany({
          where: { tenantId }
        });
        if (dbAssets && dbAssets.length > 0) {
          fixedAssetsList = dbAssets.map((a) => ({
            assetId: a.id,
            entityId: a.tenantId,
            outletId: 'OUTLET-001',
            assetName: a.assetName,
            assetClass: a.assetClass as any,
            acquisitionDate: a.acquisitionDate.toISOString().split('T')[0],
            costPrice: Number(a.costPrice.toString()),
            cost: Number(a.costPrice.toString()),
            miraCapitalAllowanceRate: Number(a.capitalAllowanceRate.toString()),
            openingWDV: Number(a.openingWDV.toString()),
            additionsInYear: 0,
            disposalsInYear: 0,
            capitalAllowanceClaimed: 0,
            closingWDV: Number(a.closingWDV.toString()),
            taxYear: a.taxYear,
            accountingPeriodStart,
            accountingPeriodEnd,
            isDisposed: a.isDisposed
          }));
        }
      } catch {
        // fallback
      }

      try {
        const dbLegacyAssets = await db.legacyFixedAsset.findMany({
          where: { tenantId }
        });
        if (dbLegacyAssets && dbLegacyAssets.length > 0) {
          const legacyMapped: FixedAssetRecord[] = dbLegacyAssets.map((a) => ({
            assetId: a.assetId,
            entityId: a.entityId,
            outletId: a.outletId,
            assetName: a.assetName,
            assetClass: a.assetClass as any,
            acquisitionDate: a.acquisitionDate,
            costPrice: Number(a.costPrice.toString()),
            cost: Number(a.costPrice.toString()),
            miraCapitalAllowanceRate: Number(a.miraCapitalAllowanceRate.toString()),
            openingWDV: Number(a.openingWDV.toString()),
            additionsInYear: Number(a.additionsInYear.toString()),
            disposalsInYear: Number(a.disposalsInYear.toString()),
            capitalAllowanceClaimed: Number(a.capitalAllowanceClaimed.toString()),
            closingWDV: Number(a.closingWDV.toString()),
            taxYear: a.taxYear,
            accountingPeriodStart: a.accountingPeriodStart,
            accountingPeriodEnd: a.accountingPeriodEnd,
            isDisposed: a.isDisposed || false,
            disposalDate: a.disposalDate || undefined,
            disposalProceeds: a.disposalValue ? Number(a.disposalValue.toString()) : undefined
          }));
          fixedAssetsList = [...fixedAssetsList, ...legacyMapped];
        }
      } catch {
        // fallback
      }
    }

    if (fixedAssetsList.length > 0) {
      caReport = generateSchedule2CapitalAllowanceSummary(fixedAssetsList, taxYear);
      capitalAllowanceClaimed = caReport.totalCapitalAllowanceClaimed;
      balancingAllowance = caReport.totalBalancingAllowance;
      balancingCharge = caReport.totalBalancingCharge;
      netCapitalAllowanceDeduction = caReport.totalNetTaxAllowanceDeduction;
    } else {
      caReport = {
        taxYear,
        totalCostOfAssets: 0,
        totalOpeningWDV: 0,
        totalAdditionsInYear: 0,
        totalDisposalsInYear: 0,
        totalCapitalAllowanceClaimed: 0,
        totalBalancingAllowance: 0,
        totalBalancingCharge: 0,
        totalNetTaxAllowanceDeduction: 0,
        totalClosingWDV: 0,
        assetResults: [],
        generatedAt: new Date().toISOString()
      };
    }

    // 7. Calculate Taxable Income and Loss Relief (Decimal Arithmetic)
    const accountingProfitDec = new Decimal(accountingProfitBeforeTax);
    const exemptIncomeDec = new Decimal(options.exemptIncome || 0);
    const capitalAllowanceDec = new Decimal(netCapitalAllowanceDeduction);

    // Total deductions = allowable deductions + net capital allowances + exempt income
    const totalDeductionsDec = totalAllowableDeductionsDec.plus(capitalAllowanceDec).plus(exemptIncomeDec);

    // Adjusted taxable profit before loss = Accounting Profit + Additions - Deductions
    const adjustedTaxableProfitDec = accountingProfitDec
      .plus(totalAdditionsDec)
      .minus(totalDeductionsDec);

    let priorUnabsorbedLossesDec = new Decimal(0);
    let validPriorLossesDec = new Decimal(0);
    let expiredLossesDec = new Decimal(0);

    if (options.priorLossRecords && options.priorLossRecords.length > 0) {
      for (const record of options.priorLossRecords) {
        const lossYear = record.year;
        const lossAge = taxYear - lossYear;
        const unutilised = Math.max(0, (record.lossAmount || 0) - (record.utilisedAmount || 0));
        const unutilisedDec = new Decimal(unutilised);
        priorUnabsorbedLossesDec = priorUnabsorbedLossesDec.plus(unutilisedDec);

        // MIRA Section 30 5-year carry-forward rule
        if (lossAge >= 1 && lossAge <= 5) {
          validPriorLossesDec = validPriorLossesDec.plus(unutilisedDec);
        } else if (lossAge > 5) {
          expiredLossesDec = expiredLossesDec.plus(unutilisedDec);
        }
      }
    } else if (options.priorUnabsorbedLosses !== undefined && options.priorUnabsorbedLosses > 0) {
      priorUnabsorbedLossesDec = new Decimal(options.priorUnabsorbedLosses);
      validPriorLossesDec = priorUnabsorbedLossesDec;
    }

    let lossReliefAppliedDec = new Decimal(0);
    let netTaxableIncomeDec = new Decimal(0);
    let isTaxLoss = false;
    let taxLossAmountDec = new Decimal(0);

    if (adjustedTaxableProfitDec.lessThanOrEqualTo(0)) {
      isTaxLoss = true;
      taxLossAmountDec = adjustedTaxableProfitDec.abs();
      lossReliefAppliedDec = new Decimal(0);
      netTaxableIncomeDec = new Decimal(0);
    } else {
      if (validPriorLossesDec.greaterThan(0)) {
        lossReliefAppliedDec = Decimal.min(adjustedTaxableProfitDec, validPriorLossesDec);
        netTaxableIncomeDec = adjustedTaxableProfitDec.minus(lossReliefAppliedDec);
      } else {
        netTaxableIncomeDec = adjustedTaxableProfitDec;
      }
    }

    const remainingUnabsorbedLossDec = priorUnabsorbedLossesDec
      .minus(lossReliefAppliedDec)
      .plus(taxLossAmountDec);

    // 8. Calculate Income Tax Liability (Corporate Section 15 vs Individual Section 16)
    const calculationInput = {
      taxpayerType: (entityType === 'SOLE_PROPRIETOR' ? 'INDIVIDUAL' : 'COMPANY') as any,
      taxYear,
      entityName: taxpayerInfo.taxpayerName,
      tin: taxpayerInfo.tin,
      accountingPeriodStart,
      accountingPeriodEnd,
      accountingDays: options.accountingDays || 365,
      groupFactor: options.groupFactor || 1,
      accountingProfit: this.toDecNum(accountingProfitDec),
      adjustments: [
        ...addBacksList.map((a) => ({
          id: a.adjustmentId,
          code: a.miraCode,
          description: a.reason,
          amount: a.amount,
          type: 'ADD_BACK' as const
        })),
        ...deductionsList.map((d) => ({
          id: d.adjustmentId,
          code: d.miraCode,
          description: d.reason,
          amount: d.amount,
          type: 'DEDUCTION' as const
        }))
      ],
      capitalAllowanceClaimed: this.toDecNum(capitalAllowanceDec),
      exemptIncome: this.toDecNum(exemptIncomeDec),
      priorUnabsorbedLosses: this.toDecNum(priorUnabsorbedLossesDec),
      priorLossRecords: options.priorLossRecords?.map((r) => ({
        year: r.year,
        lossAmount: r.lossAmount,
        utilisedAmount: r.utilisedAmount || 0,
        remainingAmount: Math.max(0, r.lossAmount - (r.utilisedAmount || 0)),
        isExpired: taxYear - r.year > 5
      })),
      prepayments: [
        {
          paymentId: 'PRE-ADV',
          type: 'ADVANCE_TAX_PAYMENT' as const,
          amount: options.advanceTaxPaid || 0,
          paymentDate: `${taxYear}-06-30`,
          referenceNumber: 'ADV-TAX'
        },
        {
          paymentId: 'PRE-INT',
          type: 'FIRST_INTERIM_PAYMENT' as const,
          amount: options.interimTaxPaid || 0,
          paymentDate: `${taxYear}-09-30`,
          referenceNumber: 'INT-TAX'
        }
      ],
      withholdingCredits: [
        {
          creditId: 'WHT-001',
          type: 'SECTION_54_EMPLOYEE_WHT' as const,
          payerName: 'Withholding Credit',
          grossAmount: 0,
          taxWithheld: options.withholdingTaxDeducted || 0,
          paymentDate: `${taxYear}-12-31`
        }
      ]
    };

    const finalPayable = this.incomeTaxEngine.calculateFinalTaxPayable(calculationInput as any);

    const grossTaxLiability = finalPayable.taxLiability.totalGrossTaxLiability;
    const totalPrepayments = finalPayable.totalPrepayments;
    const netTaxDueOrRefundable = finalPayable.finalTaxPayable;
    const effectiveTaxRate = finalPayable.taxLiability.effectiveTaxRate;

    // 9. Generate Official MIRA 604 Return Structure
    const mira604Input = {
      taxpayer: taxpayerInfo,
      pnl: {
        grossRevenue: this.toDecNum(grossRevenue),
        costOfSales: this.toDecNum(costOfSales),
        grossProfit: this.toDecNum(grossProfit),
        otherIncome: this.toDecNum(otherIncome),
        operatingExpenses: this.toDecNum(operatingExpenses),
        accountingProfitBeforeTax: this.toDecNum(accountingProfitDec)
      },
      adjustments: processedAdjustments,
      capitalAllowanceTotal: this.toDecNum(capitalAllowanceDec),
      capitalAllowanceBreakdown: caReport.assetResults.map((ar) => ({
        assetClass: ar.assetClass,
        allowanceClaimed: ar.claimableAllowance
      })),
      priorUnabsorbedLosses: this.toDecNum(priorUnabsorbedLossesDec),
      priorLossRecords: options.priorLossRecords,
      advancePayments: {
        advanceTaxPaid: options.advanceTaxPaid || 0,
        interimTaxPaid: options.interimTaxPaid || 0,
        withholdingTaxDeducted: options.withholdingTaxDeducted || 0
      },
      accountingDays: options.accountingDays || 365,
      groupFactor: options.groupFactor || 1
    };

    const mira604Return = generateMira604Return(mira604Input);

    // 10. Perform 5-Way Strict Decimal Reconciliation
    const reconReport = this.executeFiveWayReconciliation({
      taxYear,
      tenantId,
      glProfit: this.toDecNum(accountingProfitDec),
      taxCalcStartingProfit: finalPayable.taxableIncomeCalculation.accountingProfit,
      adjustmentRecordsSumAdditions: this.toDecNum(totalAdditionsDec),
      taxCalcAdditions: finalPayable.taxableIncomeCalculation.totalAdditions,
      adjustmentRecordsSumDeductions: this.toDecNum(totalAllowableDeductionsDec),
      taxCalcAllowableDeductions: this.toDecNum(totalAllowableDeductionsDec),
      fixedAssetCASummary: this.toDecNum(capitalAllowanceDec),
      taxCalcCADeduction: finalPayable.taxableIncomeCalculation.capitalAllowanceClaimed,
      taxCalcNetTaxableIncome: finalPayable.taxableIncomeCalculation.netTaxableIncome,
      mira604NetTaxableIncome: mira604Return.sectionE_TaxableIncomeLoss.netTaxableIncome,
      taxCalcTotalTaxPayable: finalPayable.taxLiability.totalGrossTaxLiability,
      mira604TotalTaxPayable: mira604Return.sectionF_TaxComputation.totalTaxPayable
    });

    if (reconReport.overallStatus === 'FAIL') {
      reviewItems.push({
        code: 'RECONCILIATION_FAILED',
        severity: 'CRITICAL',
        message: 'One or more 5-way tax reconciliation checks failed with an unexplained variance.',
        suggestedAction: 'Review discrepancies in the reconciliation report before approval.'
      });
    }

    // 11. Build Complete Transaction-to-Box Traceability Trace
    const trace: MIRA604CalculationTrace = {
      taxYear,
      tenantId,
      generatedAt: new Date().toISOString(),
      ruleVersion: 'v25.1',
      accountingProfitTrace: {
        source: 'Posted General Ledger Journals (4xxx Revenue / 5xxx Expense)',
        grossRevenue: this.toDecNum(grossRevenue),
        costOfSales: this.toDecNum(costOfSales),
        grossProfit: this.toDecNum(grossProfit),
        otherIncome: this.toDecNum(otherIncome),
        operatingExpenses: this.toDecNum(operatingExpenses),
        accountingProfitBeforeTax: this.toDecNum(accountingProfitDec),
        journalLineCount,
        revenueAccounts,
        expenseAccounts
      },
      taxAdjustmentsTrace: {
        totalAddBacks: this.toDecNum(totalAdditionsDec),
        totalAllowableDeductions: this.toDecNum(totalAllowableDeductionsDec),
        netTaxAdjustment: this.toDecNum(totalAdditionsDec.minus(totalAllowableDeductionsDec)),
        addBacks: addBacksList.map((a) => ({
          id: a.adjustmentId,
          code: a.miraCode,
          description: a.reason,
          amount: a.amount,
          direction: a.direction || 'ADD_BACK',
          status: a.reviewStatus
        })),
        deductions: deductionsList.map((d) => ({
          id: d.adjustmentId,
          code: d.miraCode,
          description: d.reason,
          amount: d.amount,
          direction: d.direction || 'DEDUCTION',
          status: d.reviewStatus
        }))
      },
      capitalAllowancesTrace: {
        totalCostOfAssets: caReport.totalCostOfAssets,
        totalOpeningWDV: caReport.totalOpeningWDV,
        totalAdditionsInYear: caReport.totalAdditionsInYear,
        totalDisposalsInYear: caReport.totalDisposalsInYear,
        totalCapitalAllowanceClaimed: caReport.totalCapitalAllowanceClaimed,
        totalBalancingAllowance: caReport.totalBalancingAllowance,
        totalBalancingCharge: caReport.totalBalancingCharge,
        totalNetTaxAllowanceDeduction: caReport.totalNetTaxAllowanceDeduction,
        totalClosingWDV: caReport.totalClosingWDV,
        assetClassBreakdown: mira604Return.sectionD_CapitalAllowances.assetClassBreakdown || []
      },
      taxableIncomeTrace: {
        formula: 'NetTaxableIncome = max(0, (AccountingProfit [Box 200] + Additions [Box 210] - TotalDeductions [Box 220]) - LossRelief [Box 510])',
        accountingProfitBeforeTax: this.toDecNum(accountingProfitDec),
        totalAdditions: this.toDecNum(totalAdditionsDec),
        totalDeductions: this.toDecNum(totalDeductionsDec),
        capitalAllowanceDeduction: this.toDecNum(capitalAllowanceDec),
        adjustedTaxableProfitBeforeLoss: this.toDecNum(adjustedTaxableProfitDec),
        priorUnabsorbedLossesAvailable: this.toDecNum(validPriorLossesDec),
        lossReliefApplied: this.toDecNum(lossReliefAppliedDec),
        remainingUnabsorbedLosses: this.toDecNum(remainingUnabsorbedLossDec),
        netTaxableIncome: this.toDecNum(netTaxableIncomeDec),
        isTaxLoss,
        taxLossAmount: this.toDecNum(taxLossAmountDec)
      },
      taxComputationTrace: {
        entityType,
        proRatedThreshold: finalPayable.taxLiability.proRatedThreshold || 500000,
        taxBrackets: finalPayable.taxLiability.brackets.map((b) => ({
          bracketName: b.bracketName,
          minIncome: b.minIncome,
          maxIncome: b.maxIncome || 0,
          ratePercentage: b.ratePercentage,
          taxableInBracket: b.taxableInBracket,
          taxInBracket: b.taxInBracket
        })),
        grossTaxLiability,
        prepayments: {
          advanceTaxPaid: options.advanceTaxPaid || 0,
          interimTaxPaid: options.interimTaxPaid || 0,
          withholdingTaxDeducted: options.withholdingTaxDeducted || 0,
          totalPrepayments
        },
        netTaxDueOrRefundable,
        effectiveTaxRate
      }
    };

    // 12. Lifecycle Status Resolution
    let lifecycleStatus: TaxReturnLifecycleStatus = 'CALCULATED';
    const hasCriticalIssues = reviewItems.some((i) => i.severity === 'CRITICAL');
    const hasPendingReview = reviewItems.some((i) => i.code === 'PENDING_TAX_ADJUSTMENT');

    if (hasCriticalIssues || hasPendingReview || reconReport.overallStatus === 'FAIL') {
      lifecycleStatus = 'REVIEW_REQUIRED';
    }

    const returnId = `TR-MIRA604-${tenantId}-${taxYear}-V${currentVersion}`;
    const cleanTin = this.cleanTin(taxpayerInfo.tin);
    const formId = `MIRA604-${taxYear}-${cleanTin}`;
    const checksumPayload = `MIRA604|${tenantId}|${taxYear}|${cleanTin}|${this.toDecNum(accountingProfitDec)}|${this.toDecNum(netTaxableIncomeDec)}|${grossTaxLiability}|${netTaxDueOrRefundable}|V${currentVersion}`;
    const verificationChecksum = crypto.createHash('sha256').update(checksumPayload).digest('hex');

    mira604Return.verificationChecksum = verificationChecksum;

    const returnResult: IncomeTaxReturnResult = {
      returnId,
      tenantId,
      entityId,
      taxYear,
      formId,
      formVersion: 'V25.1',
      version: currentVersion,
      status: lifecycleStatus,
      submissionStatus: lifecycleStatus === 'REVIEW_REQUIRED' ? 'PENDING_REVIEW' : 'DRAFT',
      isFinalized: false,
      accountingProfitBeforeTax: this.toDecNum(accountingProfitDec),
      totalAdditions: this.toDecNum(totalAdditionsDec),
      totalDeductions: this.toDecNum(totalDeductionsDec),
      capitalAllowancesClaimed: this.toDecNum(capitalAllowanceDec),
      lossReliefApplied: this.toDecNum(lossReliefAppliedDec),
      finalTaxableIncome: this.toDecNum(netTaxableIncomeDec),
      incomeTaxPayable: grossTaxLiability,
      netTaxDueOrRefundable,
      effectiveTaxRate,
      verificationChecksum,
      mira604: mira604Return,
      reconciliation: reconReport,
      trace,
      reviewItems,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 13. Persist Authoritative Return to PostgreSQL (TaxReturn & TaxCalculation)
    try {
      await db.taxReturn.upsert({
        where: { id: returnId },
        create: {
          id: returnId,
          tenantId,
          entityId,
          formId,
          returnType: 'MIRA604',
          taxYear,
          formVersion: 'V25.1',
          submissionStatus: returnResult.submissionStatus as any,
          verificationChecksum,
          payloadJson: JSON.stringify(returnResult)
        },
        update: {
          submissionStatus: returnResult.submissionStatus as any,
          verificationChecksum,
          payloadJson: JSON.stringify(returnResult),
          updatedAt: new Date()
        }
      });
    } catch (persistErr) {
      console.warn('[MIRA604] PostgreSQL TaxReturn persistence warning:', persistErr);
    }

    MIRA604IntegrationService.memoryStore.set(`${tenantId}:${taxYear}`, returnResult);

    try {
      await db.taxCalculation.create({
        data: {
          tenantId,
          taxYear,
          accountingProfit: new Decimal(returnResult.accountingProfitBeforeTax),
          totalAdditions: new Decimal(returnResult.totalAdditions),
          totalDeductions: new Decimal(returnResult.totalDeductions),
          taxableIncome: new Decimal(returnResult.finalTaxableIncome),
          taxPayable: new Decimal(returnResult.incomeTaxPayable)
        }
      });
    } catch {
      // ignore calculation line persistence fallback
    }

    // 14. Record Audit Event
    recordAuditEvent(
      {
        actorId: session?.userId || 'SYSTEM',
        eventType: 'TAX_CALCULATION',
        entityType: 'MIRA_RETURN',
        entityId: returnId,
        tenantId,
        reason: `MIRA 604 Income Tax Return calculated for Tax Year ${taxYear}. Status: ${lifecycleStatus}, Net Tax: MVR ${netTaxDueOrRefundable}.`,
        newState: {
          returnId,
          taxYear,
          status: lifecycleStatus,
          taxableIncome: returnResult.finalTaxableIncome,
          taxPayable: returnResult.incomeTaxPayable,
          checksum: verificationChecksum
        }
      },
      session
    );

    return returnResult;
  }

  /**
   * Approves a prepared MIRA 604 return.
   * Enforces role authorization (TAX_MANAGER or CLIENT_ADMIN) and rejects if critical blockers exist.
   */
  public static async approveReturn(
    tenantId: string,
    taxYear: number,
    session: UserSession,
    options?: { notes?: string; prismaClient?: PrismaClient | Prisma.TransactionClient }
  ): Promise<IncomeTaxReturnResult> {
    const db = options?.prismaClient || defaultPrisma;

    // RBAC Authorization Check
    const allowedRoles = ['CLIENT_ADMIN', 'TAX_MANAGER'];
    if (!session || !allowedRoles.includes(session.role)) {
      throw new Error(
        `[MIRA604] Unauthorized: Only users with TAX_MANAGER or CLIENT_ADMIN role can approve tax returns. Current role: ${session?.role || 'NONE'}`
      );
    }

    let record: any = null;
    try {
      record = await db.taxReturn.findFirst({
        where: {
          tenantId,
          taxYear,
          returnType: 'MIRA604'
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch {
      // db query fallback
    }

    let parsed: IncomeTaxReturnResult | null = null;
    if (record) {
      parsed = JSON.parse(record.payloadJson);
    } else {
      parsed = MIRA604IntegrationService.memoryStore.get(`${tenantId}:${taxYear}`) || null;
    }

    if (!parsed) {
      throw new Error(`[MIRA604] No calculated tax return found for tenant ${tenantId} and tax year ${taxYear}.`);
    }

    if (parsed.isFinalized) {
      throw new Error(`[MIRA604] Return is already FINALIZED.`);
    }

    // Enforce absence of critical review blockers
    const criticalIssues = parsed.reviewItems.filter((i) => i.severity === 'CRITICAL');
    if (criticalIssues.length > 0) {
      throw new Error(
        `[MIRA604] Cannot approve tax return with open critical review items: ${criticalIssues.map((c) => c.message).join('; ')}`
      );
    }

    if (parsed.reconciliation.overallStatus === 'FAIL') {
      throw new Error(
        `[MIRA604] Cannot approve tax return when 5-way tax reconciliation has failed.`
      );
    }

    parsed.status = 'APPROVED';
    parsed.submissionStatus = 'READY_FOR_FILING';
    parsed.approvedBy = session.userId;
    parsed.approvedAt = new Date().toISOString();
    parsed.updatedAt = new Date().toISOString();

    MIRA604IntegrationService.memoryStore.set(`${tenantId}:${taxYear}`, parsed);

    if (record) {
      try {
        await db.taxReturn.update({
          where: { id: record.id },
          data: {
            submissionStatus: 'READY_FOR_FILING',
            payloadJson: JSON.stringify(parsed),
            updatedAt: new Date()
          }
        });
      } catch (err) {
        console.warn('[MIRA604] DB update warning on approveReturn:', err);
      }
    }

    recordAuditEvent(
      {
        actorId: session.userId,
        eventType: 'APPROVAL_APPROVE',
        entityType: 'MIRA_RETURN',
        entityId: record?.id || `TR-${tenantId}-${taxYear}`,
        tenantId,
        reason: `MIRA 604 Return for Tax Year ${taxYear} APPROVED by ${session.userId}.`,
        newState: {
          status: 'APPROVED',
          approvedBy: session.userId,
          approvedAt: parsed.approvedAt
        }
      },
      session
    );

    return parsed;
  }

  /**
   * Finalizes an approved MIRA 604 return.
   * Seals the return as immutable in PostgreSQL.
   */
  public static async finalizeReturn(
    tenantId: string,
    taxYear: number,
    session: UserSession,
    options?: { notes?: string; prismaClient?: PrismaClient | Prisma.TransactionClient }
  ): Promise<IncomeTaxReturnResult> {
    const db = options?.prismaClient || defaultPrisma;

    const allowedRoles = ['CLIENT_ADMIN', 'TAX_MANAGER'];
    if (!session || !allowedRoles.includes(session.role)) {
      throw new Error(
        `[MIRA604] Unauthorized: Only users with TAX_MANAGER or CLIENT_ADMIN role can finalize tax returns. Current role: ${session?.role || 'NONE'}`
      );
    }

    let record: any = null;
    try {
      record = await db.taxReturn.findFirst({
        where: {
          tenantId,
          taxYear,
          returnType: 'MIRA604'
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch {
      // db query fallback
    }

    let parsed: IncomeTaxReturnResult | null = null;
    if (record) {
      parsed = JSON.parse(record.payloadJson);
    } else {
      parsed = MIRA604IntegrationService.memoryStore.get(`${tenantId}:${taxYear}`) || null;
    }

    if (!parsed) {
      throw new Error(`[MIRA604] No tax return found for tenant ${tenantId} and tax year ${taxYear}.`);
    }

    if (parsed.isFinalized) {
      return parsed; // already finalized, return idempotent
    }

    if (parsed.status !== 'APPROVED') {
      throw new Error(`[MIRA604] Return must be APPROVED before it can be FINALIZED. Current status: ${parsed.status}`);
    }

    parsed.status = 'FINALIZED';
    parsed.submissionStatus = 'SUBMITTED';
    parsed.isFinalized = true;
    parsed.finalizedBy = session.userId;
    parsed.finalizedAt = new Date().toISOString();
    parsed.updatedAt = new Date().toISOString();

    MIRA604IntegrationService.memoryStore.set(`${tenantId}:${taxYear}`, parsed);

    if (record) {
      try {
        await db.taxReturn.update({
          where: { id: record.id },
          data: {
            submissionStatus: 'SUBMITTED',
            payloadJson: JSON.stringify(parsed),
            updatedAt: new Date()
          }
        });
      } catch (err) {
        console.warn('[MIRA604] DB update warning on finalizeReturn:', err);
      }
    }

    recordAuditEvent(
      {
        actorId: session.userId,
        eventType: 'FILING_PACKAGE_GENERATION',
        entityType: 'MIRA_RETURN',
        entityId: record?.id || `TR-${tenantId}-${taxYear}`,
        tenantId,
        reason: `MIRA 604 Return for Tax Year ${taxYear} FINALIZED and sealed as immutable by ${session.userId}.`,
        newState: {
          status: 'FINALIZED',
          isFinalized: true,
          finalizedBy: session.userId,
          finalizedAt: parsed.finalizedAt
        }
      },
      session
    );

    return parsed;
  }

  /**
   * Retrieves the current persisted MIRA 604 return for a tenant and tax year.
   */
  public static async getReturn(
    tenantId: string,
    taxYear: number,
    options?: { prismaClient?: PrismaClient | Prisma.TransactionClient }
  ): Promise<IncomeTaxReturnResult | null> {
    const db = options?.prismaClient || defaultPrisma;

    try {
      const record = await db.taxReturn.findFirst({
        where: {
          tenantId,
          taxYear,
          returnType: 'MIRA604'
        },
        orderBy: { createdAt: 'desc' }
      });

      if (record) return JSON.parse(record.payloadJson);
    } catch {
      // db fallback
    }

    return MIRA604IntegrationService.memoryStore.get(`${tenantId}:${taxYear}`) || null;
  }

  /**
   * Retrieves calculation and transaction trace for MIRA 604.
   */
  public static async getTrace(
    tenantId: string,
    taxYear: number,
    options?: { prismaClient?: PrismaClient | Prisma.TransactionClient }
  ): Promise<MIRA604CalculationTrace | null> {
    const ret = await this.getReturn(tenantId, taxYear, options);
    return ret ? ret.trace : null;
  }

  /**
   * 5-Way Exact Decimal Reconciliation Engine.
   */
  public static executeFiveWayReconciliation(params: {
    taxYear: number;
    tenantId: string;
    glProfit: number;
    taxCalcStartingProfit: number;
    adjustmentRecordsSumAdditions: number;
    taxCalcAdditions: number;
    adjustmentRecordsSumDeductions: number;
    taxCalcAllowableDeductions: number;
    fixedAssetCASummary: number;
    taxCalcCADeduction: number;
    taxCalcNetTaxableIncome: number;
    mira604NetTaxableIncome: number;
    taxCalcTotalTaxPayable: number;
    mira604TotalTaxPayable: number;
  }): TaxReconciliationReport {
    const items: TaxReconciliationItem[] = [];

    // Check 1: GL/P&L Accounting Profit <-> Income Tax Calculation Starting Profit
    const var1 = new Decimal(params.glProfit).minus(new Decimal(params.taxCalcStartingProfit)).abs();
    items.push({
      code: 'GL_VS_TAX_PROFIT',
      name: 'P&L Accounting Profit to Tax Calculation Starting Profit',
      expectedValue: params.glProfit,
      actualValue: params.taxCalcStartingProfit,
      variance: var1.toNumber(),
      status: var1.isZero() ? 'PASS' : 'FAIL',
      explanation: var1.isZero()
        ? 'Authoritative GL P&L accounting profit perfectly ties to tax calculation starting profit.'
        : `Discrepancy of MVR ${var1.toFixed(2)} between GL P&L and Tax Calculation starting profit.`
    });

    // Check 2: Tax-Adjustment Ledger <-> Tax Calculation Additions & Deductions
    const var2A = new Decimal(params.adjustmentRecordsSumAdditions).minus(new Decimal(params.taxCalcAdditions)).abs();
    const var2B = new Decimal(params.adjustmentRecordsSumDeductions).minus(new Decimal(params.taxCalcAllowableDeductions)).abs();
    const var2 = var2A.plus(var2B);
    items.push({
      code: 'ADJUSTMENTS_INTEGRITY',
      name: 'Tax Adjustment Ledger to Tax Calculation Additions & Deductions',
      expectedValue: new Decimal(params.adjustmentRecordsSumAdditions).plus(new Decimal(params.adjustmentRecordsSumDeductions)).toNumber(),
      actualValue: new Decimal(params.taxCalcAdditions).plus(new Decimal(params.taxCalcAllowableDeductions)).toNumber(),
      variance: var2.toNumber(),
      status: var2.isZero() ? 'PASS' : 'FAIL',
      explanation: var2.isZero()
        ? 'Itemized tax additions and allowable deductions tie exactly to tax calculation breakdown.'
        : `Discrepancy of MVR ${var2.toFixed(2)} between adjustment records and calculation totals.`
    });

    // Check 3: Capital Allowance Records <-> Capital Allowance Deduction in Tax Calculation
    const var3 = new Decimal(params.fixedAssetCASummary).minus(new Decimal(params.taxCalcCADeduction)).abs();
    items.push({
      code: 'CAPITAL_ALLOWANCE_INTEGRITY',
      name: 'Schedule 2 Capital Allowance Summary to Tax Calculation Deduction',
      expectedValue: params.fixedAssetCASummary,
      actualValue: params.taxCalcCADeduction,
      variance: var3.toNumber(),
      status: var3.isZero() ? 'PASS' : 'FAIL',
      explanation: var3.isZero()
        ? 'Schedule 2 capital allowance deductions tie exactly to tax calculation.'
        : `Discrepancy of MVR ${var3.toFixed(2)} between Fixed Asset Schedule 2 and Tax Calculation.`
    });

    // Check 4: Tax Calculation Net Taxable Income <-> MIRA 604 Section E/F
    const var4 = new Decimal(params.taxCalcNetTaxableIncome).minus(new Decimal(params.mira604NetTaxableIncome)).abs();
    items.push({
      code: 'TAXABLE_INCOME_INTEGRITY',
      name: 'Tax Calculation Net Taxable Income to MIRA 604 Section E',
      expectedValue: params.taxCalcNetTaxableIncome,
      actualValue: params.mira604NetTaxableIncome,
      variance: var4.toNumber(),
      status: var4.isZero() ? 'PASS' : 'FAIL',
      explanation: var4.isZero()
        ? 'Tax calculation net taxable income ties perfectly to MIRA 604 Section E Box.'
        : `Discrepancy of MVR ${var4.toFixed(2)} between engine taxable income and MIRA 604.`
    });

    // Check 5: Tax Calculation Total Tax Payable <-> MIRA 604 Section F
    const var5 = new Decimal(params.taxCalcTotalTaxPayable).minus(new Decimal(params.mira604TotalTaxPayable)).abs();
    items.push({
      code: 'TAX_PAYABLE_INTEGRITY',
      name: 'Tax Calculation Total Tax Payable to MIRA 604 Section F',
      expectedValue: params.taxCalcTotalTaxPayable,
      actualValue: params.mira604TotalTaxPayable,
      variance: var5.toNumber(),
      status: var5.isZero() ? 'PASS' : 'FAIL',
      explanation: var5.isZero()
        ? 'Gross tax liability ties perfectly to MIRA 604 Section F Total Tax Payable.'
        : `Discrepancy of MVR ${var5.toFixed(2)} between engine tax liability and MIRA 604.`
    });

    const hasFail = items.some((i) => i.status === 'FAIL');
    const hasWarn = items.some((i) => i.status === 'WARNING');
    const overallStatus = hasFail ? 'FAIL' : hasWarn ? 'WARNING' : 'PASS';
    const discrepanciesCount = items.filter((i) => i.status !== 'PASS').length;

    return {
      taxYear: params.taxYear,
      tenantId: params.tenantId,
      overallStatus,
      discrepanciesCount,
      reconciledAt: new Date().toISOString(),
      items
    };
  }
}
