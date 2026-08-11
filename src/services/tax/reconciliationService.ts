import { TransactionRecord, TaxpayerInfo, FixedAssetRecord } from '../../types/taxEngine';
import { TaxAdjustment } from '../tax/taxAdjustmentService';
import { Mira105GstReturn } from '../../types/mira105';
import { Mira302WhtReturn } from '../../types/mira302';
import { Mira604TaxReturn } from '../../types/mira604';
import {
  ValidationIssue,
  ReconciliationReport,
  ReconciliationSummary
} from '../../types/reconciliation';

export interface CapitalAllowanceSummary {
  totalQualifyingAdditions?: number;
  totalCapitalAllowanceClaimed?: number;
}

export interface ReconciliationInputData {
  taxpayerInfo?: TaxpayerInfo | { tin?: string; taxpayerName?: string; periodStart?: string; periodEnd?: string; entityType?: string };
  transactions?: TransactionRecord[];
  gstReturns?: Mira105GstReturn[];
  whtReturn?: Mira302WhtReturn;
  fixedAssets?: FixedAssetRecord[];
  capitalAllowanceResult?: CapitalAllowanceSummary;
  mira604Return?: Mira604TaxReturn;
  adjustments?: TaxAdjustment[];
}

/**
 * Executes cross-return tax reconciliation and validation across MIRA 604, MIRA 105 (GST), and MIRA 302 (WHT).
 *
 * @param entityId Legal Entity Identifier
 * @param taxYear Tax Year under audit/review
 * @param input ReconciliationInputData containing ledger and return records
 * @returns ReconciliationReport
 */
export function reconcileTaxYear(
  entityId: string,
  taxYear: number,
  input?: ReconciliationInputData
): ReconciliationReport {
  const issues: ValidationIssue[] = [];

  const taxpayer = input?.taxpayerInfo || input?.mira604Return?.sectionA_TaxpayerInfo;
  const transactions = (input?.transactions || []).filter(
    (tx) => tx.taxYear === taxYear && (tx.reviewStatus as string) !== 'REJECTED'
  );

  // -------------------------------------------------------------
  // 1. Entity Metadata Validation
  // -------------------------------------------------------------
  if (!entityId || !entityId.trim()) {
    issues.push({
      code: 'ENTITY_ID_MISSING',
      severity: 'ERROR',
      field: 'entityId',
      message: 'Entity ID is missing or empty',
      suggestedFix: 'Provide a valid entity identifier'
    });
  }

  const tin = taxpayer?.tin;
  if (!tin || !tin.trim()) {
    issues.push({
      code: 'ENTITY_METADATA_INCOMPLETE',
      severity: 'ERROR',
      field: 'taxpayerInfo.tin',
      message: 'Taxpayer TIN (Tax Identification Number) is missing',
      suggestedFix: 'Enter taxpayer TIN in entity metadata'
    });
  }

  const periodStart = (taxpayer as TaxpayerInfo)?.accountingPeriodStart || (taxpayer as { periodStart?: string })?.periodStart;
  const periodEnd = (taxpayer as TaxpayerInfo)?.accountingPeriodEnd || (taxpayer as { periodEnd?: string })?.periodEnd;

  if (!periodStart || !periodEnd) {
    issues.push({
      code: 'ENTITY_METADATA_INCOMPLETE',
      severity: 'ERROR',
      field: 'taxpayerInfo.accountingPeriodStart/End',
      message: 'Tax period start or end date is missing',
      suggestedFix: 'Specify complete tax period dates (YYYY-MM-DD)'
    });
  }

  if (!taxpayer?.entityType) {
    issues.push({
      code: 'ENTITY_TYPE_MISSING',
      severity: 'WARNING',
      field: 'taxpayerInfo.entityType',
      message: 'Legal entity classification type (COMPANY / INDIVIDUAL) is not specified',
      suggestedFix: 'Set legal entity classification in entity profile'
    });
  }

  // -------------------------------------------------------------
  // 2. P&L Revenue vs. GST Sales Reconciliation
  // -------------------------------------------------------------
  let totalRevenueLedger = 0;
  for (const tx of transactions) {
    if (tx.accountingTreatment === 'REVENUE') {
      totalRevenueLedger += Number(tx.amount || 0);
    }
  }

  let totalRevenueReturn = 0;
  let totalGstOutputLedger = 0;
  let totalGstOutputReturn = 0;

  for (const tx of transactions) {
    if (tx.gstAmount && tx.gstAmount > 0) {
      totalGstOutputLedger += Number(tx.gstAmount);
    }
  }

  const gstReturns = input?.gstReturns || [];
  for (const gst of gstReturns) {
    const salesBox = (gst.outputSales || (gst as unknown as { outputSalesBox?: Record<string, unknown> }).outputSalesBox) as Record<string, unknown> | undefined;
    if (salesBox) {
      const salesVal = (salesBox.totalOutputSales ?? salesBox.totalSalesAndServices ?? 0) as number;
      const gstVal = (salesBox.box4_OutputGstCollected ?? salesBox.totalOutputGst ?? 0) as number;
      totalRevenueReturn += Number(salesVal);
      totalGstOutputReturn += Number(gstVal);
    }
  }

  if (input?.mira604Return?.sectionB_Schedule1PnL) {
    const pnlRevenue = input.mira604Return.sectionB_Schedule1PnL.grossRevenue;
    if (Math.abs(pnlRevenue - totalRevenueLedger) > 1.0) {
      issues.push({
        code: 'PNL_LEDGER_REVENUE_MISMATCH',
        severity: 'WARNING',
        field: 'sectionB_Schedule1PnL.grossRevenue',
        message: `MIRA 604 Schedule 1 revenue (${pnlRevenue}) does not match ledger revenue (${totalRevenueLedger})`,
        suggestedFix: 'Re-run P&L calculation pipeline for tax year'
      });
    }
  }

  if (gstReturns.length > 0) {
    const revenueDiff = Math.abs(totalRevenueLedger - totalRevenueReturn);
    if (revenueDiff > 1.0) {
      issues.push({
        code: 'REVENUE_GST_MISMATCH',
        severity: 'ERROR',
        field: 'totalRevenueReturn',
        message: `Total revenue in ledger (${totalRevenueLedger}) does not reconcile with MIRA 105 GST sales (${totalRevenueReturn}). Discrepancy: ${Math.round(revenueDiff * 100) / 100}`,
        suggestedFix: 'Reconcile GST sales returns against general ledger sales accounts'
      });
    }
  }

  // -------------------------------------------------------------
  // 3. Fixed Asset Register vs. Schedule 2 Capital Allowance Reconciliation
  // -------------------------------------------------------------
  const fixedAssets = input?.fixedAssets || [];
  let totalAssetAdditionsLedger = 0;
  for (const asset of fixedAssets) {
    if (asset.acquisitionDate && asset.acquisitionDate.startsWith(String(taxYear))) {
      totalAssetAdditionsLedger += Number(asset.costPrice || asset.cost || 0);
    }
  }

  let totalAssetAdditionsSchedule2 = 0;
  let totalCapitalAllowanceClaimed = 0;

  if (input?.capitalAllowanceResult) {
    totalCapitalAllowanceClaimed = Number(input.capitalAllowanceResult.totalCapitalAllowanceClaimed || 0);
  }

  if (input?.mira604Return?.sectionD_CapitalAllowances) {
    const sched2 = input.mira604Return.sectionD_CapitalAllowances;
    const claimedInReturn = sched2.totalClaimableCapitalAllowance;
    totalCapitalAllowanceClaimed = claimedInReturn;

    if (input.capitalAllowanceResult && input.capitalAllowanceResult.totalCapitalAllowanceClaimed !== undefined) {
      const caDiff = Math.abs(input.capitalAllowanceResult.totalCapitalAllowanceClaimed - claimedInReturn);
      if (caDiff > 1.0) {
        issues.push({
          code: 'CAPITAL_ALLOWANCE_CLAIM_MISMATCH',
          severity: 'ERROR',
          field: 'sectionD_CapitalAllowances.totalClaimableCapitalAllowance',
          message: `Calculated capital allowance (${input.capitalAllowanceResult.totalCapitalAllowanceClaimed}) does not match Schedule 2 claim (${claimedInReturn})`,
          suggestedFix: 'Update Schedule 2 capital allowance calculations'
        });
      }
    }
  }

  // Check if ledger additions mismatch provided Schedule 2 additions if specified
  if (input?.capitalAllowanceResult?.totalQualifyingAdditions !== undefined) {
    totalAssetAdditionsSchedule2 = input.capitalAllowanceResult.totalQualifyingAdditions;
    const assetAdditionsDiff = Math.abs(totalAssetAdditionsLedger - totalAssetAdditionsSchedule2);
    if (assetAdditionsDiff > 1.0) {
      issues.push({
        code: 'FIXED_ASSET_ADDITIONS_MISMATCH',
        severity: 'ERROR',
        field: 'capitalAllowanceResult.totalQualifyingAdditions',
        message: `Fixed Asset Register additions (${totalAssetAdditionsLedger}) do not match Schedule 2 additions (${totalAssetAdditionsSchedule2})`,
        suggestedFix: 'Ensure all capital asset acquisitions are recorded in the Fixed Asset Register'
      });
    }
  }

  // -------------------------------------------------------------
  // 4. Foreign Expense vs. MIRA 302 WHT Reconciliation
  // -------------------------------------------------------------
  let totalWhtLedger = 0;
  for (const tx of transactions) {
    const cat = (tx.accountingCategory || '').toLowerCase();
    const desc = (tx.description || '').toLowerCase();
    if (
      cat.includes('software') ||
      cat.includes('consultancy') ||
      cat.includes('royalty') ||
      cat.includes('management') ||
      desc.includes('foreign') ||
      desc.includes('aws') ||
      desc.includes('adobe')
    ) {
      totalWhtLedger += Number(tx.amount || 0);
    }
  }

  let totalWhtReturn = 0;
  if (input?.whtReturn) {
    totalWhtReturn = Number(input.whtReturn.totalGrossPayments || 0);

    const whtDiff = Math.abs(totalWhtLedger - totalWhtReturn);
    if (whtDiff > 1.0) {
      issues.push({
        code: 'WHT_UNREPORTED_PAYMENT',
        severity: 'WARNING',
        field: 'whtReturn.totalGrossPayments',
        message: `Non-resident payments in ledger (${totalWhtLedger}) do not match gross payments reported on MIRA 302 WHT return (${totalWhtReturn})`,
        suggestedFix: 'Review foreign vendor expenses and ensure all non-resident transactions are included in MIRA 302 return'
      });
    }
  }

  // -------------------------------------------------------------
  // 5. Tax Adjustment Integrity Check
  // -------------------------------------------------------------
  const adjustments = input?.adjustments || [];
  for (const adj of adjustments) {
    if (adj.reviewStatus === 'REJECTED') {
      issues.push({
        code: 'TAX_ADJUSTMENT_REJECTED',
        severity: 'ERROR',
        field: `adjustments.${adj.miraCode || adj.adjustmentId}`,
        message: `Tax adjustment ${adj.miraCode || adj.adjustmentId} (${adj.amount}) has been rejected but is included in tax computation`,
        suggestedFix: 'Remove rejected tax adjustment from tax pipeline'
      });
    }

    const hasSupportingDoc = adj.sourceTransactionId || adj.supportingDocumentId;
    if (adj.amount > 0 && !hasSupportingDoc) {
      issues.push({
        code: 'TAX_ADJUSTMENT_UNBACKED',
        severity: 'WARNING',
        field: `adjustments.${adj.miraCode || adj.adjustmentId}`,
        message: `Tax adjustment ${adj.miraCode || adj.adjustmentId} (${adj.amount}) is not linked to supporting transaction records`,
        suggestedFix: 'Attach supporting transaction references or audit documentation to tax adjustment'
      });
    }
  }

  // Determine overall validity (valid if no ERROR severity issues)
  const hasErrors = issues.some((i) => i.severity === 'ERROR');

  const summary: ReconciliationSummary = {
    totalRevenueLedger: Math.round(totalRevenueLedger * 100) / 100,
    totalRevenueReturn: Math.round(totalRevenueReturn * 100) / 100,
    totalGstOutputLedger: Math.round(totalGstOutputLedger * 100) / 100,
    totalGstOutputReturn: Math.round(totalGstOutputReturn * 100) / 100,
    totalWhtLedger: Math.round(totalWhtLedger * 100) / 100,
    totalWhtReturn: Math.round(totalWhtReturn * 100) / 100,
    totalAssetAdditionsLedger: Math.round(totalAssetAdditionsLedger * 100) / 100,
    totalAssetAdditionsSchedule2: Math.round(totalAssetAdditionsSchedule2 * 100) / 100,
    totalCapitalAllowanceClaimed: Math.round(totalCapitalAllowanceClaimed * 100) / 100
  };

  return {
    taxYear,
    entityId,
    isValid: !hasErrors,
    issues,
    summary,
    generatedAt: new Date().toISOString()
  };
}
