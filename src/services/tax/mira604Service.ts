import {
  Mira604TaxReturn,
  Mira604InputData,
  TaxpayerInfo,
  Schedule1PnLSummary,
  TaxAdjustmentsSummary,
  Schedule2CapitalAllowanceSummary,
  TaxableIncomeAndLossReliefSummary,
  TaxComputationSummary
} from '../../types/mira604';
import { calculateTaxableIncomePipeline, TaxAdjustment } from './taxAdjustmentService';
import { calculateEntityTaxLiability } from './entityTaxService';

/**
 * Generates official MIRA 604 Income Tax Return Form structure.
 *
 * @param params Mira604InputData
 * @returns Mira604TaxReturn
 */
export function generateMira604Return(params: Mira604InputData): Mira604TaxReturn {
  if (!params || !params.taxpayer) {
    throw new Error('Validation Error: Missing taxpayer information');
  }

  const taxpayer: TaxpayerInfo = { ...params.taxpayer };

  if (!taxpayer.tin || !taxpayer.tin.trim()) {
    throw new Error('Validation Error: Taxpayer TIN is required');
  }

  if (!taxpayer.taxpayerName || !taxpayer.taxpayerName.trim()) {
    throw new Error('Validation Error: Taxpayer name is required');
  }

  if (!taxpayer.accountingPeriodStart || !taxpayer.accountingPeriodEnd) {
    throw new Error('Validation Error: Tax accounting period start and end dates are required');
  }

  const taxYear = taxpayer.taxYear || new Date().getFullYear();

  // --- Section B: Schedule 1 Profit & Loss Summary ---
  const grossRevenue = Math.max(0, params.pnl.grossRevenue || 0);
  const costOfSales = Math.max(0, params.pnl.costOfSales || 0);
  const grossProfit = grossRevenue - costOfSales;
  const otherIncome = params.pnl.otherIncome || 0;
  const operatingExpenses = Math.max(0, params.pnl.operatingExpenses || 0);

  const accountingProfitBeforeTax = params.pnl.accountingProfitBeforeTax !== undefined
    ? params.pnl.accountingProfitBeforeTax
    : (grossProfit + otherIncome - operatingExpenses);

  const sectionB: Schedule1PnLSummary = {
    grossRevenue: Math.round(grossRevenue * 100) / 100,
    costOfSales: Math.round(costOfSales * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    otherIncome: Math.round(otherIncome * 100) / 100,
    operatingExpenses: Math.round(operatingExpenses * 100) / 100,
    accountingProfitBeforeTax: Math.round(accountingProfitBeforeTax * 100) / 100
  };

  // --- Section C: Tax Adjustments ---
  const adjustments: TaxAdjustment[] = params.adjustments || [];
  const addBacksList: TaxAdjustment[] = [];
  const deductionsList: TaxAdjustment[] = [];

  let totalAddBacks = 0;
  let totalDeductions = 0;

  for (const adj of adjustments) {
    if (adj.reviewStatus === 'REJECTED') continue;

    if (adj.direction === 'DEDUCTION') {
      deductionsList.push(adj);
      totalDeductions += adj.amount;
    } else {
      addBacksList.push(adj);
      totalAddBacks += adj.amount;
    }
  }

  const sectionC: TaxAdjustmentsSummary = {
    itemizedAddBacks: addBacksList,
    totalAddBacks: Math.round(totalAddBacks * 100) / 100,
    itemizedDeductions: deductionsList,
    totalDeductions: Math.round(totalDeductions * 100) / 100,
    netTaxAdjustments: Math.round((totalAddBacks - totalDeductions) * 100) / 100
  };

  // --- Section D: Schedule 2 Capital Allowances ---
  const capitalAllowanceTotal = Math.max(0, params.capitalAllowanceTotal || 0);
  const sectionD: Schedule2CapitalAllowanceSummary = {
    totalClaimableCapitalAllowance: Math.round(capitalAllowanceTotal * 100) / 100,
    assetClassBreakdown: params.capitalAllowanceBreakdown || []
  };

  // --- Section E: Taxable Income & Loss Relief ---
  // Using pipeline to ensure standard step-by-step arithmetic matches
  const pipelineResult = calculateTaxableIncomePipeline(
    accountingProfitBeforeTax,
    adjustments,
    capitalAllowanceTotal,
    { taxYear }
  );

  const adjustedTaxableProfitBeforeLoss = pipelineResult.taxableIncomeBeforeLossRelief;
  const isTaxLoss = pipelineResult.isTaxLoss;
  const taxLossAmount = pipelineResult.taxLossAmount;

  // Calculate entity tax with loss relief
  const entityTaxCalc = calculateEntityTaxLiability(
    adjustedTaxableProfitBeforeLoss,
    taxpayer.entityType,
    {
      taxYear,
      accountingDays: params.accountingDays || 365,
      groupFactor: params.groupFactor || 1,
      priorUnabsorbedLosses: params.priorUnabsorbedLosses,
      priorLossRecords: params.priorLossRecords,
      entityName: taxpayer.taxpayerName,
      tin: taxpayer.tin
    }
  );

  const sectionE: TaxableIncomeAndLossReliefSummary = {
    adjustedTaxableProfitBeforeLoss: Math.round(adjustedTaxableProfitBeforeLoss * 100) / 100,
    priorUnabsorbedLosses: entityTaxCalc.priorUnabsorbedLosses,
    lossCarriedForwardApplied: entityTaxCalc.lossReliefApplied,
    remainingUnabsorbedLoss: entityTaxCalc.remainingUnabsorbedLoss,
    netTaxableIncome: entityTaxCalc.netTaxableIncome,
    isTaxLoss,
    taxLossAmount
  };

  // --- Section F: Tax Computation ---
  const advanceTaxPaid = Math.max(0, params.advancePayments?.advanceTaxPaid || 0);
  const interimTaxPaid = Math.max(0, params.advancePayments?.interimTaxPaid || 0);
  const withholdingTaxDeducted = Math.max(0, params.advancePayments?.withholdingTaxDeducted || 0);
  const totalPrepayments = Math.round((advanceTaxPaid + interimTaxPaid + withholdingTaxDeducted) * 100) / 100;

  const totalTaxPayable = entityTaxCalc.totalIncomeTaxDue;
  const netTaxDueOrRefundable = Math.round((totalTaxPayable - totalPrepayments) * 100) / 100;

  const sectionF: TaxComputationSummary = {
    taxThreshold: entityTaxCalc.taxThreshold,
    taxByBracket: entityTaxCalc.taxByBracket,
    totalTaxPayable,
    advanceTaxPaid: Math.round(advanceTaxPaid * 100) / 100,
    interimTaxPaid: Math.round(interimTaxPaid * 100) / 100,
    withholdingTaxDeducted: Math.round(withholdingTaxDeducted * 100) / 100,
    totalPrepayments,
    netTaxDueOrRefundable,
    effectiveTaxRate: entityTaxCalc.effectiveTaxRate
  };

  const cleanTin = taxpayer.tin.replace(/[^A-Z0-9]/gi, '');
  const formId = `MIRA604-${taxYear}-${cleanTin || 'DRAFT'}`;
  const timestamp = new Date().toISOString();
  const checksum = `MIRA604-CHK-${taxYear}-${Math.abs(Math.round(netTaxDueOrRefundable))}-${cleanTin}`;

  return {
    formId,
    formVersion: 'V25.1',
    submissionStatus: 'READY_FOR_FILING',
    generatedAt: timestamp,
    sectionA_TaxpayerInfo: taxpayer,
    sectionB_Schedule1PnL: sectionB,
    sectionC_TaxAdjustments: sectionC,
    sectionD_CapitalAllowances: sectionD,
    sectionE_TaxableIncomeLoss: sectionE,
    sectionF_TaxComputation: sectionF,
    verificationChecksum: checksum
  };
}

/**
 * Exports MIRA 604 Income Tax Return into formatted JSON required for MIRAconnect online submission.
 *
 * @param returnObj Mira604TaxReturn
 * @returns Pretty printed JSON string
 */
export function exportMira604Json(returnObj: Mira604TaxReturn): string {
  return JSON.stringify(returnObj, null, 2);
}
