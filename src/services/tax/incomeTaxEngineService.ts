import { Prisma } from '@prisma/client';
import { defaultRuleResolver, RuleResolver } from '../../regulatory/resolvers/ruleResolver';
import {
  TaxpayerType,
  IncomeTaxCalculationInput,
  TaxableIncomeCalculation,
  TaxBracketCalculation,
  TaxLiability,
  FinalTaxPayable,
  PriorTaxLoss,
  TaxCreditItem,
  PrepaymentItem,
  WithholdingCreditItem,
  TaxLossLot,
  TaxLossUtilisation
} from '../../types/incomeTax';
import { TaxLossLotEngine, defaultTaxLossLotEngine } from './taxLossLotEngine';
import { TaxExplainabilityEngine, defaultTaxExplainabilityEngine } from '../explainability/taxExplainabilityEngine';
import { TaxCalculationExplanation } from '../../types/explainability';

const Decimal = Prisma.Decimal;

export class IncomeTaxEngineService {
  private ruleResolver: RuleResolver;
  private taxLossLotEngine: TaxLossLotEngine;
  private explainabilityEngine: TaxExplainabilityEngine;

  constructor(
    ruleResolver?: RuleResolver,
    taxLossLotEngine?: TaxLossLotEngine,
    explainabilityEngine?: TaxExplainabilityEngine
  ) {
    this.ruleResolver = ruleResolver ?? defaultRuleResolver;
    this.taxLossLotEngine = taxLossLotEngine ?? new TaxLossLotEngine(this.ruleResolver);
    this.explainabilityEngine = explainabilityEngine ?? new TaxExplainabilityEngine(this.ruleResolver);
  }

  /**
   * Helper to format Decimal to standard 2 decimal places string or number.
   */
  private roundDec(val: Prisma.Decimal): number {
    return Number(val.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString());
  }

  /**
   * Step 1: Calculate Taxable Income & Loss Relief under MIRA Income Tax Act Sections 10, 11, 20 & 30
   */
  public calculateTaxableIncome(input: IncomeTaxCalculationInput): TaxableIncomeCalculation {
    const taxYear = input.taxYear;
    const effectiveDate = `${taxYear}-12-31`;
    const ruleIds: string[] = [];
    const stepExplanations: string[] = [];

    const accountingProfitDec = new Decimal(input.accountingProfit || 0);

    // Sum additions/add-backs
    let totalAdditionsDec = new Decimal(0);
    if (input.adjustments && input.adjustments.length > 0) {
      for (const adj of input.adjustments) {
        if (adj.type === 'ADD_BACK') {
          totalAdditionsDec = totalAdditionsDec.plus(new Decimal(adj.amount || 0));
        }
      }
    }

    // Sum deductions
    let totalDeductionsDec = new Decimal(0);
    const capitalAllowanceDec = new Decimal(input.capitalAllowanceClaimed || 0);
    const exemptIncomeDec = new Decimal(input.exemptIncome || 0);
    totalDeductionsDec = totalDeductionsDec.plus(capitalAllowanceDec).plus(exemptIncomeDec);

    if (input.adjustments && input.adjustments.length > 0) {
      for (const adj of input.adjustments) {
        if (adj.type === 'DEDUCTION') {
          totalDeductionsDec = totalDeductionsDec.plus(new Decimal(adj.amount || 0));
        }
      }
    }

    stepExplanations.push(
      `1. Accounting Profit Before Tax: MVR ${accountingProfitDec.toFixed(2)}.`
    );
    if (totalAdditionsDec.greaterThan(0)) {
      stepExplanations.push(
        `2. Total Non-Deductible Additions / Add-Backs: MVR ${totalAdditionsDec.toFixed(2)}.`
      );
    }
    if (totalDeductionsDec.greaterThan(0)) {
      stepExplanations.push(
        `3. Total Allowable Deductions (Capital Allowances MVR ${capitalAllowanceDec.toFixed(2)}, Exempt Income MVR ${exemptIncomeDec.toFixed(2)}, Other Deductions): MVR ${totalDeductionsDec.toFixed(2)}.`
      );
    }

    // Adjusted Taxable Profit Before Loss Relief = Accounting Profit + Additions - Deductions
    const adjustedTaxableProfitDec = accountingProfitDec.plus(totalAdditionsDec).minus(totalDeductionsDec);
    stepExplanations.push(
      `4. Adjusted Taxable Profit Before Loss Relief = MVR ${accountingProfitDec.toFixed(2)} + MVR ${totalAdditionsDec.toFixed(2)} - MVR ${totalDeductionsDec.toFixed(2)} = MVR ${adjustedTaxableProfitDec.toFixed(2)}.`
    );

    // Section 30 Loss Relief Resolution
    const lossRule = this.ruleResolver.resolveRule({
      taxType: 'INCOME_TAX',
      ruleCode: 'INCOME_TAX_LOSS_RELIEF',
      transactionDate: effectiveDate,
      applicableRegulatoryVersion: input.applicableRegulatoryVersion
    });
    if (lossRule) {
      ruleIds.push(lossRule.ruleId);
    }

    const maxCarryForwardYears = Number(lossRule?.parameters?.maxCarryForwardYears ?? 5);

    let totalPriorLossesDec = new Decimal(0);
    let validPriorLossesDec = new Decimal(0);
    let expiredLossesDec = new Decimal(0);
    const lossDetails: PriorTaxLoss[] = [];
    let lossLotUtilisations: TaxLossUtilisation[] | undefined = undefined;
    let activeLossLots: TaxLossLot[] | undefined = undefined;

    if (input.lossLots && input.lossLots.length > 0) {
      const reliefResult = this.taxLossLotEngine.applyLossRelief({
        tenantId: input.tin ?? 'DEFAULT_TENANT',
        taxYear,
        taxableProfitBeforeLoss: this.roundDec(adjustedTaxableProfitDec),
        applicableRegulatoryVersion: input.applicableRegulatoryVersion,
        lossLots: input.lossLots
      });

      lossLotUtilisations = reliefResult.utilisations;
      activeLossLots = reliefResult.activeLossLots;

      let priorAvail = new Decimal(0);
      for (const lot of input.lossLots) {
        const remaining = new Decimal(lot.remainingAmount);
        totalPriorLossesDec = totalPriorLossesDec.plus(remaining);
        if (lot.originTaxYear < taxYear && taxYear <= lot.expiryTaxYear) {
          priorAvail = priorAvail.plus(remaining);
        } else if (taxYear > lot.expiryTaxYear) {
          expiredLossesDec = expiredLossesDec.plus(remaining);
        }
        lossDetails.push({
          year: lot.originTaxYear,
          lossAmount: lot.originalAmount,
          utilisedAmount: lot.utilisedAmount,
          remainingAmount: lot.remainingAmount,
          isExpired: taxYear > lot.expiryTaxYear
        });
      }
      validPriorLossesDec = priorAvail;
    } else if (input.priorLossRecords && input.priorLossRecords.length > 0) {
      for (const record of input.priorLossRecords) {
        const lossYear = record.year;
        const lossAge = taxYear - lossYear;
        const unutilised = Math.max(0, (record.lossAmount || 0) - (record.utilisedAmount || 0));
        const unutilisedDec = new Decimal(unutilised);
        totalPriorLossesDec = totalPriorLossesDec.plus(unutilisedDec);

        const isExpired = lossAge > maxCarryForwardYears || lossAge < 1;
        if (!isExpired) {
          validPriorLossesDec = validPriorLossesDec.plus(unutilisedDec);
        } else {
          expiredLossesDec = expiredLossesDec.plus(unutilisedDec);
        }

        lossDetails.push({
          year: lossYear,
          lossAmount: record.lossAmount,
          utilisedAmount: record.utilisedAmount || 0,
          remainingAmount: unutilised,
          isExpired
        });
      }
    } else if (input.priorUnabsorbedLosses !== undefined && input.priorUnabsorbedLosses > 0) {
      const priorDec = new Decimal(input.priorUnabsorbedLosses);
      totalPriorLossesDec = priorDec;
      validPriorLossesDec = priorDec;
      lossDetails.push({
        year: taxYear - 1,
        lossAmount: input.priorUnabsorbedLosses,
        utilisedAmount: 0,
        remainingAmount: input.priorUnabsorbedLosses,
        isExpired: false
      });
    }

    let lossReliefAppliedDec = new Decimal(0);
    let netTaxableIncomeDec = new Decimal(0);
    let isTaxLoss = false;
    let taxLossAmountDec = new Decimal(0);

    if (adjustedTaxableProfitDec.lessThanOrEqualTo(0)) {
      // It's a current year tax loss
      isTaxLoss = true;
      taxLossAmountDec = adjustedTaxableProfitDec.abs();
      lossReliefAppliedDec = new Decimal(0);
      netTaxableIncomeDec = new Decimal(0);
      stepExplanations.push(
        `5. Current Year Tax Loss: MVR ${taxLossAmountDec.toFixed(2)}. Net Taxable Income is MVR 0.00. Tax loss of MVR ${taxLossAmountDec.toFixed(2)} is available for carry forward under Section 30.`
      );
    } else {
      // Positive taxable profit: apply valid prior losses
      if (validPriorLossesDec.greaterThan(0)) {
        lossReliefAppliedDec = Decimal.min(adjustedTaxableProfitDec, validPriorLossesDec);
        netTaxableIncomeDec = adjustedTaxableProfitDec.minus(lossReliefAppliedDec);
        stepExplanations.push(
          `5. Section 30 Loss Relief Applied: MVR ${lossReliefAppliedDec.toFixed(2)} from available valid prior losses of MVR ${validPriorLossesDec.toFixed(2)}.`
        );
      } else {
        netTaxableIncomeDec = adjustedTaxableProfitDec;
      }
      stepExplanations.push(
        `6. Net Taxable Income = MVR ${adjustedTaxableProfitDec.toFixed(2)} - MVR ${lossReliefAppliedDec.toFixed(2)} = MVR ${netTaxableIncomeDec.toFixed(2)}.`
      );
    }

    const remainingUnabsorbedLossDec = totalPriorLossesDec.minus(lossReliefAppliedDec).plus(taxLossAmountDec);

    return {
      accountingProfit: this.roundDec(accountingProfitDec),
      totalAdditions: this.roundDec(totalAdditionsDec),
      totalDeductions: this.roundDec(totalDeductionsDec),
      capitalAllowanceClaimed: this.roundDec(capitalAllowanceDec),
      exemptIncome: this.roundDec(exemptIncomeDec),
      adjustedTaxableProfitBeforeLoss: this.roundDec(adjustedTaxableProfitDec),
      priorLossesAvailable: this.roundDec(validPriorLossesDec),
      lossReliefApplied: this.roundDec(lossReliefAppliedDec),
      remainingUnabsorbedLosses: this.roundDec(remainingUnabsorbedLossDec),
      expiredLosses: this.roundDec(expiredLossesDec),
      netTaxableIncome: this.roundDec(netTaxableIncomeDec),
      isTaxLoss,
      taxLossAmount: this.roundDec(taxLossAmountDec),
      lossDetails,
      lossLotUtilisations,
      activeLossLots,
      ruleIds,
      formula: 'NetTaxableIncome = max(0, (AccountingProfit + Additions - Deductions) - LossReliefApplied)',
      stepExplanations
    };
  }

  /**
   * Step 2 & 3: Calculate Progressive/Entity Tax Brackets and Gross Tax Liability
   */
  public calculateTaxLiability(
    netTaxableIncome: number,
    taxpayerType: TaxpayerType,
    options: {
      taxYear?: number;
      accountingDays?: number;
      groupFactor?: number;
      applicableRegulatoryVersion?: string;
      grossTaxableIncome?: number;
    } = {}
  ): TaxLiability {
    const taxYear = options.taxYear || new Date().getFullYear();
    const effectiveDate = `${taxYear}-12-31`;
    const accountingDays = Math.max(1, Math.min(366, options.accountingDays || 365));
    const groupFactor = Math.max(1, options.groupFactor || 1);
    const grossIncome = options.grossTaxableIncome ?? netTaxableIncome;

    const netTaxableIncomeDec = new Decimal(Math.max(0, netTaxableIncome));
    const brackets: TaxBracketCalculation[] = [];
    const ruleIds: string[] = [];
    const stepExplanations: string[] = [];

    let totalGrossTaxDec = new Decimal(0);
    let proRatedThreshold: number | undefined;

    // Check if Corporate/Entity Taxpayer (Section 15) vs Individual (Section 16)
    const isEntityTaxpayer = [
      'COMPANY',
      'PARTNERSHIP',
      'TRUST',
      'BODY_OF_PERSONS',
      'NON_RESIDENT_COMPANY'
    ].includes(taxpayerType);

    if (isEntityTaxpayer) {
      // Section 15 Entity Rule Resolution
      const companyRule = this.ruleResolver.resolveRule({
        taxType: 'INCOME_TAX',
        ruleCode: 'INCOME_TAX_COMPANY_THRESHOLD',
        taxpayerType,
        transactionDate: effectiveDate,
        applicableRegulatoryVersion: options.applicableRegulatoryVersion
      });

      const ruleId = companyRule?.ruleId || 'RULE-IT-COMPANY-500K';
      ruleIds.push(ruleId);

      const standardThreshold = Number(companyRule?.parameters?.standardThreshold ?? 500000);
      const aboveRate = Number(companyRule?.parameters?.aboveThresholdRate ?? 0.15);
      const abovePercentage = Number(companyRule?.parameters?.aboveThresholdRatePercentage ?? 15);

      // Statutory Pro-rating under Section 15(c): (standardThreshold * (days / 365)) / groupFactor
      const standardThresholdDec = new Decimal(standardThreshold);
      const proRatedThresholdDec = standardThresholdDec
        .times(new Decimal(accountingDays))
        .dividedBy(new Decimal(365))
        .dividedBy(new Decimal(groupFactor));

      proRatedThreshold = this.roundDec(proRatedThresholdDec);

      stepExplanations.push(
        `Section 15 Corporate/Entity Rule (${ruleId}): Standard threshold MVR ${standardThreshold.toLocaleString()} pro-rated for ${accountingDays} days with group factor ${groupFactor} = MVR ${proRatedThreshold.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
      );

      // Bracket 1: 0 to Pro-rated Threshold @ 0%
      const bracket1TaxableDec = Decimal.min(netTaxableIncomeDec, proRatedThresholdDec);
      const bracket1TaxDec = new Decimal(0);
      brackets.push({
        bracketIndex: 1,
        bracketName: `Up to MVR ${proRatedThreshold.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Tax Free)`,
        minIncome: 0,
        maxIncome: proRatedThreshold,
        rate: 0,
        ratePercentage: 0,
        taxableInBracket: this.roundDec(bracket1TaxableDec),
        taxInBracket: 0,
        ruleId,
        formula: `min(NetTaxableIncome, Threshold) * 0%`,
        stepExplanation: `Bracket 1 (0%): Taxable MVR ${bracket1TaxableDec.toFixed(2)} -> Tax MVR 0.00`
      });

      // Bracket 2: Above Pro-rated Threshold @ 15%
      let bracket2TaxableDec = new Decimal(0);
      let bracket2TaxDec = new Decimal(0);
      if (netTaxableIncomeDec.greaterThan(proRatedThresholdDec)) {
        bracket2TaxableDec = netTaxableIncomeDec.minus(proRatedThresholdDec);
        bracket2TaxDec = bracket2TaxableDec.times(new Decimal(aboveRate));
      }

      brackets.push({
        bracketIndex: 2,
        bracketName: `Excess above MVR ${proRatedThreshold.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${abovePercentage}%)`,
        minIncome: proRatedThreshold,
        maxIncome: null,
        rate: aboveRate,
        ratePercentage: abovePercentage,
        taxableInBracket: this.roundDec(bracket2TaxableDec),
        taxInBracket: this.roundDec(bracket2TaxDec),
        ruleId,
        formula: `max(0, NetTaxableIncome - Threshold) * ${abovePercentage}%`,
        stepExplanation: `Bracket 2 (${abovePercentage}%): Taxable MVR ${bracket2TaxableDec.toFixed(2)} -> Tax MVR ${bracket2TaxDec.toFixed(2)}`
      });

      totalGrossTaxDec = bracket1TaxDec.plus(bracket2TaxDec);
      stepExplanations.push(
        `Total Section 15 Income Tax Liability = MVR ${totalGrossTaxDec.toFixed(2)}.`
      );
    } else {
      // Section 16 Individual / Sole Proprietor Progressive Brackets
      const individualRule = this.ruleResolver.resolveRule({
        taxType: 'INCOME_TAX',
        ruleCode: 'INCOME_TAX_INDIVIDUAL_BRACKETS',
        taxpayerType: 'SOLE_PROPRIETOR',
        transactionDate: effectiveDate,
        applicableRegulatoryVersion: options.applicableRegulatoryVersion
      });

      const ruleId = individualRule?.ruleId || 'RULE-IT-INDIVIDUAL-BRACKETS';
      ruleIds.push(ruleId);

      const rawBrackets = individualRule?.parameters?.brackets || [
        { from: 0, to: 720000, rate: 0.00, ratePercentage: 0, description: 'Up to MVR 720,000 (0% Tax Free)' },
        { from: 720000, to: 1200000, rate: 0.055, ratePercentage: 5.5, description: 'MVR 720,001 to MVR 1,200,000 (5.5%)' },
        { from: 1200000, to: 1800000, rate: 0.08, ratePercentage: 8, description: 'MVR 1,200,001 to MVR 1,800,000 (8%)' },
        { from: 1800000, to: 2400000, rate: 0.12, ratePercentage: 12, description: 'MVR 1,800,001 to MVR 2,400,000 (12%)' },
        { from: 2400000, to: null, rate: 0.15, ratePercentage: 15, description: 'Over MVR 2,400,000 (15%)' }
      ];

      stepExplanations.push(
        `Section 16 Individual Progressive Brackets (${ruleId}): 5 tiers applied dynamically.`
      );

      for (let i = 0; i < rawBrackets.length; i++) {
        const b = rawBrackets[i];
        const fromDec = new Decimal(b.from);
        const toDec = b.to !== null ? new Decimal(b.to) : null;
        const rateDec = new Decimal(b.rate);

        let taxableInBracketDec = new Decimal(0);

        if (netTaxableIncomeDec.greaterThan(fromDec)) {
          if (toDec !== null) {
            taxableInBracketDec = Decimal.min(netTaxableIncomeDec, toDec).minus(fromDec);
          } else {
            taxableInBracketDec = netTaxableIncomeDec.minus(fromDec);
          }
        }

        const taxInBracketDec = taxableInBracketDec.times(rateDec);
        totalGrossTaxDec = totalGrossTaxDec.plus(taxInBracketDec);

        brackets.push({
          bracketIndex: i + 1,
          bracketName: b.description || `Tier ${i + 1} (${b.ratePercentage}%)`,
          minIncome: b.from,
          maxIncome: b.to,
          rate: b.rate,
          ratePercentage: b.ratePercentage,
          taxableInBracket: this.roundDec(taxableInBracketDec),
          taxInBracket: this.roundDec(taxInBracketDec),
          ruleId,
          formula: `Taxable amount in bracket [${b.from} - ${b.to ?? 'inf'}] * ${b.ratePercentage}%`,
          stepExplanation: `Tier ${i + 1} (${b.ratePercentage}%): Taxable MVR ${taxableInBracketDec.toFixed(2)} -> Tax MVR ${taxInBracketDec.toFixed(2)}`
        });
      }

      stepExplanations.push(
        `Total Section 16 Progressive Income Tax Liability = MVR ${totalGrossTaxDec.toFixed(2)}.`
      );
    }

    const grossTaxAmount = this.roundDec(totalGrossTaxDec);
    const effectiveTaxRate = grossIncome > 0 ? (grossTaxAmount / grossIncome) * 100 : 0;
    const effectiveTaxRateOnNet = netTaxableIncome > 0 ? (grossTaxAmount / netTaxableIncome) * 100 : 0;

    return {
      taxpayerType,
      taxYear,
      accountingDays,
      groupFactor,
      proRatedThreshold,
      grossTaxableIncome: this.roundDec(new Decimal(grossIncome)),
      netTaxableIncome: this.roundDec(netTaxableIncomeDec),
      brackets,
      totalGrossTaxLiability: grossTaxAmount,
      effectiveTaxRate: Number(effectiveTaxRate.toFixed(2)),
      effectiveTaxRateOnNet: Number(effectiveTaxRateOnNet.toFixed(2)),
      ruleIds,
      formula: 'TotalTaxLiability = Sum(TaxByBracket)',
      stepExplanations
    };
  }

  /**
   * Complete Income Tax Calculation Pipeline:
   * 1. Taxable Income Calculation (Sections 10, 11, 20 & 30)
   * 2. Tax Liability by Progressive/Corporate Brackets (Sections 15 & 16)
   * 3. Tax Credits Application (Sections 50-53)
   * 4. Prepayments & Withholding Deductions (Sections 54, 55, 70)
   * 5. Final Tax Payable / Refundable Determination
   */
  public calculateFinalTaxPayable(input: IncomeTaxCalculationInput): FinalTaxPayable {
    const timestamp = new Date().toISOString();

    // 1. Taxable Income & Loss Relief
    const taxableIncomeCalc = this.calculateTaxableIncome(input);

    // 2. Gross Tax Liability
    const taxLiability = this.calculateTaxLiability(
      taxableIncomeCalc.netTaxableIncome,
      input.taxpayerType,
      {
        taxYear: input.taxYear,
        accountingDays: input.accountingDays,
        groupFactor: input.groupFactor,
        applicableRegulatoryVersion: input.applicableRegulatoryVersion,
        grossTaxableIncome: taxableIncomeCalc.adjustedTaxableProfitBeforeLoss
      }
    );

    // 3. Tax Credits (Foreign Tax Credits, Donation Credits, etc.)
    let totalTaxCreditsDec = new Decimal(0);
    if (input.taxCredits && input.taxCredits.length > 0) {
      for (const credit of input.taxCredits) {
        totalTaxCreditsDec = totalTaxCreditsDec.plus(new Decimal(credit.amount || 0));
      }
    }

    const grossTaxDec = new Decimal(taxLiability.totalGrossTaxLiability);
    // Tax credits cannot exceed gross tax liability
    const taxCreditsAppliedDec = Decimal.min(grossTaxDec, totalTaxCreditsDec);
    const taxCreditsCarriedForwardDec = totalTaxCreditsDec.minus(taxCreditsAppliedDec);
    const netTaxAfterCreditsDec = grossTaxDec.minus(taxCreditsAppliedDec);

    // 4. Prepayments & Withholding Tax Deductions
    let totalPrepaymentsDec = new Decimal(0);
    if (input.prepayments && input.prepayments.length > 0) {
      for (const prepay of input.prepayments) {
        totalPrepaymentsDec = totalPrepaymentsDec.plus(new Decimal(prepay.amount || 0));
      }
    }

    let totalWithholdingCreditsDec = new Decimal(0);
    if (input.withholdingCredits && input.withholdingCredits.length > 0) {
      for (const wht of input.withholdingCredits) {
        totalWithholdingCreditsDec = totalWithholdingCreditsDec.plus(new Decimal(wht.taxWithheld || 0));
      }
    }

    const totalDeductionsAtSourceDec = totalPrepaymentsDec.plus(totalWithholdingCreditsDec);

    // 5. Final Tax Payable / Refundable
    // Final = NetTaxAfterCredits - TotalPrepayments - TotalWithholdingCredits
    const finalTaxPayableDec = netTaxAfterCreditsDec.minus(totalDeductionsAtSourceDec);
    const finalTaxNum = this.roundDec(finalTaxPayableDec);

    const isRefundable = finalTaxNum < 0;
    const refundAmount = isRefundable ? Math.abs(finalTaxNum) : 0;
    const payableAmount = finalTaxNum > 0 ? finalTaxNum : 0;

    // Build comprehensive step explanations
    const auditExplanations: string[] = [
      ...taxableIncomeCalc.stepExplanations,
      ...taxLiability.stepExplanations,
      `Step 4 (Tax Credits): Total tax credits MVR ${totalTaxCreditsDec.toFixed(2)}. Applied against liability MVR ${taxCreditsAppliedDec.toFixed(2)}. Net Tax After Credits = MVR ${netTaxAfterCreditsDec.toFixed(2)}.`,
      `Step 5 (Prepayments & Withholding): Total advance/interim prepayments MVR ${totalPrepaymentsDec.toFixed(2)} + Total withholding tax credits MVR ${totalWithholdingCreditsDec.toFixed(2)} = Total Deductions at Source MVR ${totalDeductionsAtSourceDec.toFixed(2)}.`,
      isRefundable
        ? `Step 6 (Final Determination): Refund due from MIRA = MVR ${refundAmount.toFixed(2)} (Tax after credits MVR ${netTaxAfterCreditsDec.toFixed(2)} - Deductions at Source MVR ${totalDeductionsAtSourceDec.toFixed(2)}).`
        : `Step 6 (Final Determination): Final Income Tax Payable to MIRA = MVR ${payableAmount.toFixed(2)} (Tax after credits MVR ${netTaxAfterCreditsDec.toFixed(2)} - Deductions at Source MVR ${totalDeductionsAtSourceDec.toFixed(2)}).`
    ];

    const allRuleIds = Array.from(new Set([...taxableIncomeCalc.ruleIds, ...taxLiability.ruleIds]));

    const result: FinalTaxPayable = {
      taxpayerType: input.taxpayerType,
      taxYear: input.taxYear,
      entityName: input.entityName,
      tin: input.tin,
      accountingDays: taxLiability.accountingDays,
      groupFactor: taxLiability.groupFactor,

      taxableIncomeCalculation: taxableIncomeCalc,
      taxLiability,

      taxCredits: input.taxCredits || [],
      totalTaxCredits: this.roundDec(totalTaxCreditsDec),
      taxCreditsApplied: this.roundDec(taxCreditsAppliedDec),
      taxCreditsCarriedForward: this.roundDec(taxCreditsCarriedForwardDec),
      netTaxAfterCredits: this.roundDec(netTaxAfterCreditsDec),

      prepayments: input.prepayments || [],
      totalPrepayments: this.roundDec(totalPrepaymentsDec),
      withholdingCredits: input.withholdingCredits || [],
      totalWithholdingCredits: this.roundDec(totalWithholdingCreditsDec),
      totalDeductionsAtSource: this.roundDec(totalDeductionsAtSourceDec),

      finalTaxPayable: finalTaxNum,
      isRefundable,
      refundAmount,
      payableAmount,

      calculationTimestamp: timestamp,
      auditSummary: {
        inputs: {
          taxpayerType: input.taxpayerType,
          taxYear: input.taxYear,
          accountingProfit: input.accountingProfit,
          accountingDays: input.accountingDays,
          groupFactor: input.groupFactor,
          adjustmentsCount: input.adjustments?.length || 0,
          priorLossRecordsCount: input.priorLossRecords?.length || 0,
          taxCreditsCount: input.taxCredits?.length || 0,
          prepaymentsCount: input.prepayments?.length || 0,
          withholdingCreditsCount: input.withholdingCredits?.length || 0
        },
        ruleIds: allRuleIds,
        intermediateValues: {
          adjustedTaxableProfitBeforeLoss: taxableIncomeCalc.adjustedTaxableProfitBeforeLoss,
          lossReliefApplied: taxableIncomeCalc.lossReliefApplied,
          netTaxableIncome: taxableIncomeCalc.netTaxableIncome,
          proRatedThreshold: taxLiability.proRatedThreshold,
          totalGrossTaxLiability: taxLiability.totalGrossTaxLiability,
          taxCreditsApplied: this.roundDec(taxCreditsAppliedDec),
          netTaxAfterCredits: this.roundDec(netTaxAfterCreditsDec),
          totalDeductionsAtSource: this.roundDec(totalDeductionsAtSourceDec)
        },
        formula: 'FinalTaxPayable = max(0, GrossTaxLiability - TaxCreditsApplied) - TotalPrepayments - TotalWithholdingCredits',
        stepExplanations: auditExplanations
      }
    };

    result.explanation = this.explainabilityEngine.generateIncomeTaxExplanation(input, result);
    return result;
  }

  /**
   * Directly produces a standalone TaxCalculationExplanation for an income tax calculation.
   */
  public explainTaxCalculation(input: IncomeTaxCalculationInput): TaxCalculationExplanation {
    const calc = this.calculateFinalTaxPayable(input);
    return calc.explanation || this.explainabilityEngine.generateIncomeTaxExplanation(input, calc);
  }
}

export const defaultIncomeTaxEngine = new IncomeTaxEngineService();
