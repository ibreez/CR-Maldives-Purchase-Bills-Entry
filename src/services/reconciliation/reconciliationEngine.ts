import Decimal from 'decimal.js';
import {
  Reconciliation,
  ReconciliationItem,
  ReconciliationRule,
  ReconciliationStatus,
  ReconciliationSuiteResult,
  ReconciliationType,
  UnderlyingTransactionDrilldown
} from '../../types/reconciliation';
import { AUTHORITATIVE_RECONCILIATION_RULES } from './reconciliationRules';
import { TransactionRecord, FixedAssetRecord } from '../../types/taxEngine';
import { Mira105GstReturn } from '../../types/mira105';
import { Mira302WhtReturn } from '../../types/mira302';
import { Mira604TaxReturn } from '../../types/mira604';
import { TaxAdjustment } from '../tax/taxAdjustmentService';
import { CapitalAllowanceSummary } from '../tax/reconciliationService';

export interface ReconciliationEngineOptions {
  tolerance?: number;
  warningThreshold?: number;
  customRules?: Partial<Record<ReconciliationType, Partial<ReconciliationRule>>>;
}

export interface ComprehensiveReconciliationContext {
  entityId: string;
  taxYear: number;
  // 1. General Ledger transactions
  transactions?: TransactionRecord[];
  // 2. GST Returns
  gstReturns?: Mira105GstReturn[];
  gstLedgerSummary?: {
    standardRatedSales?: number;
    zeroRatedSales?: number;
    exemptSales?: number;
    totalSales?: number;
    outputGstCollected?: number;
    taxablePurchases?: number;
    grossPurchases?: number;
    claimableInputGst?: number;
  };
  // 3. WHT / NWT Returns
  whtReturn?: Mira302WhtReturn;
  nwtTransactions?: Array<{
    transactionId: string;
    date?: string;
    payeeName: string;
    grossAmount: number;
    whtRate: number;
    whtAmount: number;
    whtCategory: string;
    reference?: string;
  }>;
  // 4. AP Invoices & Foreign Payments
  apInvoices?: Array<{
    invoiceId: string;
    vendorName: string;
    isForeignVendor: boolean;
    currency: string;
    amountMvr: number;
    whtDeducted: number;
    whtApplicable: boolean;
    reference?: string;
    date?: string;
  }>;
  // 5. Fixed Assets & Capital Allowance
  fixedAssets?: FixedAssetRecord[];
  capitalAllowanceSummary?: CapitalAllowanceSummary | {
    totalQualifyingAdditions?: number;
    totalCapitalAllowanceClaimed?: number;
    totalBalancingCharge?: number;
    totalBalancingAllowance?: number;
    totalTaxWrittenDownValue?: number;
  };
  // 6. Profit & Loss Statement
  pnlReport?: {
    totalRevenue?: number;
    totalOperatingExpenses?: number;
    netProfitBeforeTax?: number;
    costOfSales?: number;
    grossProfit?: number;
  };
  // 7. Tax Adjustments
  taxAdjustments?: TaxAdjustment[];
  // 8. MIRA 604 Form & Core Tax Engine Calculation
  mira604Return?: Mira604TaxReturn;
  taxEngineResult?: {
    accountingProfit?: number;
    totalAdditions?: number;
    totalDeductions?: number;
    taxableIncome?: number;
    taxPayable?: number;
    lossCarriedForward?: number;
    foreignTaxCredit?: number;
  };
  // 9. Schedule 2 (Balance Sheet)
  schedule2Data?: {
    ppe?: number;
    totalNonCurrentAssets?: number;
    inventories?: number;
    tradeReceivables?: number;
    cashAndCashEquivalents?: number;
    totalCurrentAssets?: number;
    totalAssets?: number;
    shareCapital?: number;
    retainedEarnings?: number;
    totalEquity?: number;
    nonCurrentLiabilities?: number;
    tradePayables?: number;
    currentLiabilities?: number;
    totalLiabilities?: number;
    totalEquityAndLiabilities?: number;
  };
  glBalanceSheet?: {
    ppe?: number;
    totalNonCurrentAssets?: number;
    currentAssets?: number;
    totalAssets?: number;
    equity?: number;
    liabilities?: number;
    totalEquityAndLiabilities?: number;
  };
  // 10. Schedule 3 (Net Worth)
  schedule3Data?: {
    realEstate?: number;
    movableAssets?: number;
    bankBalances?: number;
    otherAssets?: number;
    totalPersonalAssets?: number;
    personalLiabilities?: number;
    netNonBusinessWorth?: number;
  };
  personalAssetRegistry?: {
    totalPersonalAssets?: number;
    personalLiabilities?: number;
    netNonBusinessWorth?: number;
    disclosedAssets?: Array<{ id: string; name: string; value: number }>;
  };
  // 11. Schedule 4 (Related-Party)
  schedule4Data?: {
    internationalSales?: number;
    internationalPurchases?: number;
    royaltiesPaid?: number;
    managementFeesPaid?: number;
    interestPaid?: number;
    totalRelatedPartyTransactions?: number;
    totalTpTaxAdjustments?: number;
  };
  relatedPartyLedger?: {
    totalRelatedPartyTransactions?: number;
    totalTpAdjustments?: number;
    transactions?: Array<{
      transactionId: string;
      partyName: string;
      jurisdiction: string;
      transactionType: string;
      amount: number;
      armLengthVariance?: number;
    }>;
  };
  // 12. Schedule 5 (CFE)
  schedule5Data?: {
    cfeGrossIncome?: number;
    attributableCfeIncome?: number;
    foreignTaxPaid?: number;
    claimedForeignTaxCredit?: number;
  };
  cfeSourceData?: {
    totalAttributableIncome?: number;
    totalForeignTaxPaid?: number;
    claimedForeignTaxCredit?: number;
    subsidiaries?: Array<{
      entityName: string;
      country: string;
      shareholdingPct: number;
      accountingProfit: number;
      attributableIncome: number;
      foreignTaxPaid: number;
    }>;
  };
}

/**
 * Computes status based on absolute difference, tolerance, and warning threshold.
 */
export function computeStatus(
  difference: number,
  tolerance: number = 0.05,
  warningThreshold: number = 1.00
): ReconciliationStatus {
  const absDiff = Math.abs(difference);
  if (absDiff <= tolerance) {
    return 'PASS';
  }
  if (absDiff <= warningThreshold) {
    return 'WARNING';
  }
  return 'FAIL';
}

/**
 * Builds a resolved ReconciliationRule applying custom overrides.
 */
export function resolveReconciliationRule(
  type: ReconciliationType,
  options?: ReconciliationEngineOptions
): ReconciliationRule {
  const baseRule = AUTHORITATIVE_RECONCILIATION_RULES[type];
  const custom = options?.customRules?.[type];
  return {
    ...baseRule,
    ...custom,
    tolerance: custom?.tolerance ?? options?.tolerance ?? baseRule.tolerance,
    warningThreshold: custom?.warningThreshold ?? options?.warningThreshold ?? baseRule.warningThreshold
  };
}

// -----------------------------------------------------------------------------
// MODULE 1: GL ↔ GST RECONCILIATION
// -----------------------------------------------------------------------------
export function reconcileGlGst(
  context: ComprehensiveReconciliationContext,
  options?: ReconciliationEngineOptions
): Reconciliation {
  const rule = resolveReconciliationRule('GL_GST', options);
  const items: ReconciliationItem[] = [];
  const discrepancies: UnderlyingTransactionDrilldown[] = [];

  const txs = (context.transactions || []).filter(
    (tx) => tx.taxYear === context.taxYear && (tx.reviewStatus as string) !== 'REJECTED'
  );

  // 1. Revenue Reconciliation (GL vs Return)
  const glRevenueTxs = txs.filter((tx) => {
    const cat = (tx.accountingCategory || '').toLowerCase();
    return cat.startsWith('revenue') || cat.startsWith('sales') || tx.accountingTreatment === 'REVENUE';
  });

  const glTotalRevenue = glRevenueTxs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

  // Return revenue
  let returnStandardRated = 0;
  let returnZeroRated = 0;
  let returnExempt = 0;
  let returnOutputGst = 0;
  let returnTaxablePurchases = 0;
  let returnInputGst = 0;

  if (context.gstReturns && context.gstReturns.length > 0) {
    for (const r of context.gstReturns) {
      returnStandardRated += r.outputSales.box1_StandardRatedSales || 0;
      returnZeroRated += r.outputSales.box2_ZeroRatedSales || 0;
      returnExempt += r.outputSales.box3_ExemptSales || 0;
      returnOutputGst += r.outputSales.box4_OutputGstCollected || 0;
      returnTaxablePurchases += r.inputPurchases.box6_TaxablePurchases || 0;
      returnInputGst += r.inputPurchases.box8_ClaimableInputGst || 0;
    }
  } else if (context.gstLedgerSummary) {
    returnStandardRated = context.gstLedgerSummary.standardRatedSales || 0;
    returnZeroRated = context.gstLedgerSummary.zeroRatedSales || 0;
    returnExempt = context.gstLedgerSummary.exemptSales || 0;
    returnOutputGst = context.gstLedgerSummary.outputGstCollected || 0;
    returnTaxablePurchases = context.gstLedgerSummary.taxablePurchases || 0;
    returnInputGst = context.gstLedgerSummary.claimableInputGst || 0;
  }

  const returnTotalSales = returnStandardRated + returnZeroRated + returnExempt;

  // Item 1: Total Sales Revenue
  const revDiff = glTotalRevenue - returnTotalSales;
  const revStatus = computeStatus(revDiff, rule.tolerance, rule.warningThreshold);
  const revItemTxs: UnderlyingTransactionDrilldown[] = [];

  if (revStatus !== 'PASS') {
    // Collect offending transactions
    for (const tx of glRevenueTxs) {
      if (tx.gstTreatment === 'OUT_OF_SCOPE' || !tx.gstTreatment) {
        const d: UnderlyingTransactionDrilldown = {
          transactionId: tx.transactionId,
          source: 'GL Revenue',
          sourceType: tx.sourceType,
          sourceId: tx.sourceId,
          date: tx.transactionDate,
          amount: tx.amount,
          taxAmount: tx.gstAmount,
          accountCode: tx.accountingCategory,
          description: tx.description || 'GL revenue transaction not reported in GST return',
          discrepancyReason: `GL Revenue of ${tx.amount} MVR not mirrored in GST Return`,
          side: 'SOURCE_A'
        };
        revItemTxs.push(d);
        discrepancies.push(d);
      }
    }
    if (revItemTxs.length === 0 && glRevenueTxs.length > 0) {
      const d: UnderlyingTransactionDrilldown = {
        transactionId: glRevenueTxs[0].transactionId,
        source: 'GL vs GST Variance',
        amount: Math.abs(revDiff),
        discrepancyReason: `Net variance of ${revDiff.toFixed(2)} MVR between GL Revenue (${glTotalRevenue}) and GST Output Sales (${returnTotalSales})`,
        side: revDiff > 0 ? 'SOURCE_A' : 'SOURCE_B'
      };
      revItemTxs.push(d);
      discrepancies.push(d);
    }
  }

  items.push({
    itemId: 'REC-ITEM-GL-GST-01',
    code: 'TOTAL_SALES_REVENUE',
    label: 'Total Sales Revenue (GL vs GST MIRA 105 Box 1+2+3)',
    sourceAValue: glTotalRevenue,
    sourceBValue: returnTotalSales,
    difference: revDiff,
    absoluteDifference: Math.abs(revDiff),
    status: revStatus,
    tolerance: rule.tolerance,
    explanation: revStatus === 'PASS' ? 'Full reconciliation between GL revenue and GST sales' : `Variance of ${revDiff.toFixed(2)} MVR between GL and GST sales`,
    unmatchedTransactions: revItemTxs
  });

  // Item 2: Output GST
  const glOutputGst = glRevenueTxs.reduce((sum, tx) => sum + (Number(tx.gstAmount) || 0), 0);
  const outGstDiff = glOutputGst - returnOutputGst;
  const outGstStatus = computeStatus(outGstDiff, rule.tolerance, rule.warningThreshold);
  const outGstTxs: UnderlyingTransactionDrilldown[] = [];

  if (outGstStatus !== 'PASS') {
    const d: UnderlyingTransactionDrilldown = {
      transactionId: glRevenueTxs[0]?.transactionId || 'GL-GST-OUT',
      source: 'GL Output GST Account',
      amount: Math.abs(outGstDiff),
      taxAmount: glOutputGst,
      discrepancyReason: `Output GST variance: GL (${glOutputGst.toFixed(2)}) vs MIRA 105 Box 4 (${returnOutputGst.toFixed(2)})`,
      side: outGstDiff > 0 ? 'SOURCE_A' : 'SOURCE_B'
    };
    outGstTxs.push(d);
    discrepancies.push(d);
  }

  items.push({
    itemId: 'REC-ITEM-GL-GST-02',
    code: 'OUTPUT_GST_COLLECTED',
    label: 'Output GST Collected (GL vs MIRA 105 Box 4)',
    sourceAValue: glOutputGst,
    sourceBValue: returnOutputGst,
    difference: outGstDiff,
    absoluteDifference: Math.abs(outGstDiff),
    status: outGstStatus,
    tolerance: rule.tolerance,
    explanation: outGstStatus === 'PASS' ? 'Output GST fully reconciled' : `Variance of ${outGstDiff.toFixed(2)} MVR in Output GST`,
    unmatchedTransactions: outGstTxs
  });

  const overallStatus = items.some((i) => i.status === 'FAIL')
    ? 'FAIL'
    : items.some((i) => i.status === 'WARNING')
    ? 'WARNING'
    : 'PASS';

  return {
    reconciliationId: `REC-${context.entityId}-GL-GST-${context.taxYear}`,
    entityId: context.entityId,
    taxYear: context.taxYear,
    reconciliationType: 'GL_GST',
    title: rule.name,
    status: overallStatus,
    rule,
    totalSourceA: glTotalRevenue + glOutputGst,
    totalSourceB: returnTotalSales + returnOutputGst,
    totalDifference: revDiff + outGstDiff,
    items,
    underlyingTransactions: discrepancies,
    timestamp: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// MODULE 2: GL ↔ NWT RECONCILIATION
// -----------------------------------------------------------------------------
export function reconcileGlNwt(
  context: ComprehensiveReconciliationContext,
  options?: ReconciliationEngineOptions
): Reconciliation {
  const rule = resolveReconciliationRule('GL_NWT', options);
  const items: ReconciliationItem[] = [];
  const discrepancies: UnderlyingTransactionDrilldown[] = [];

  const txs = (context.transactions || []).filter(
    (tx) => tx.taxYear === context.taxYear && (tx.reviewStatus as string) !== 'REJECTED'
  );

  // GL withholding-eligible expenses
  const glWhtTxs = txs.filter((tx) => {
    const cat = (tx.accountingCategory || '').toLowerCase();
    return (
      cat.includes('withholding') ||
      cat.includes('foreign') ||
      cat.includes('management_fee') ||
      cat.includes('royalty') ||
      cat.includes('technical_fee') ||
      (tx as any).whtApplicable === true
    );
  });

  const glWhtBaseAmount = glWhtTxs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const glWhtDeducted = glWhtTxs.reduce((sum, tx) => sum + (Number((tx as any).whtAmount) || 0), 0);

  // Return WHT
  let returnWhtGross = 0;
  let returnWhtDeducted = 0;

  if (context.whtReturn) {
    returnWhtGross = context.whtReturn.totalGrossPayments || 0;
    returnWhtDeducted = (context.whtReturn as any).totalWhtWithheld ?? (context.whtReturn as any).totalWithholdingTaxDeducted ?? 0;
  } else if (context.nwtTransactions && context.nwtTransactions.length > 0) {
    returnWhtGross = context.nwtTransactions.reduce((sum, t) => sum + t.grossAmount, 0);
    returnWhtDeducted = context.nwtTransactions.reduce((sum, t) => sum + t.whtAmount, 0);
  }

  // Item 1: Gross Withholding Payments
  const grossDiff = glWhtBaseAmount - returnWhtGross;
  const grossStatus = computeStatus(grossDiff, rule.tolerance, rule.warningThreshold);
  const grossTxs: UnderlyingTransactionDrilldown[] = [];

  if (grossStatus !== 'PASS') {
    for (const tx of glWhtTxs) {
      const d: UnderlyingTransactionDrilldown = {
        transactionId: tx.transactionId,
        source: 'GL Withholding Expense',
        sourceType: tx.sourceType,
        sourceId: tx.sourceId,
        date: tx.transactionDate,
        amount: tx.amount,
        accountCode: tx.accountingCategory,
        description: tx.description || 'GL payment subject to NWT not reconciled with MIRA 302',
        discrepancyReason: `GL Withholding Payment of ${tx.amount} MVR variance from filed MIRA 302`,
        side: 'SOURCE_A'
      };
      grossTxs.push(d);
      discrepancies.push(d);
    }
  }

  items.push({
    itemId: 'REC-ITEM-GL-NWT-01',
    code: 'GROSS_WHT_PAYMENTS',
    label: 'Gross NWT/WHT Subject Payments (GL vs MIRA 302)',
    sourceAValue: glWhtBaseAmount,
    sourceBValue: returnWhtGross,
    difference: grossDiff,
    absoluteDifference: Math.abs(grossDiff),
    status: grossStatus,
    tolerance: rule.tolerance,
    explanation: grossStatus === 'PASS' ? 'Gross withholding payments fully reconciled' : `Variance of ${grossDiff.toFixed(2)} MVR in Gross Withholding base`,
    unmatchedTransactions: grossTxs
  });

  // Item 2: WHT Tax Deducted
  const taxDiff = glWhtDeducted - returnWhtDeducted;
  const taxStatus = computeStatus(taxDiff, rule.tolerance, rule.warningThreshold);
  const taxTxs: UnderlyingTransactionDrilldown[] = [];

  if (taxStatus !== 'PASS') {
    const d: UnderlyingTransactionDrilldown = {
      transactionId: glWhtTxs[0]?.transactionId || 'GL-WHT-TAX',
      source: 'GL WHT Payable Account',
      amount: Math.abs(taxDiff),
      discrepancyReason: `WHT tax deducted variance: GL (${glWhtDeducted.toFixed(2)}) vs MIRA 302 (${returnWhtDeducted.toFixed(2)})`,
      side: taxDiff > 0 ? 'SOURCE_A' : 'SOURCE_B'
    };
    taxTxs.push(d);
    discrepancies.push(d);
  }

  items.push({
    itemId: 'REC-ITEM-GL-NWT-02',
    code: 'TOTAL_WHT_DEDUCTED',
    label: 'Total WHT Deducted (GL vs MIRA 302)',
    sourceAValue: glWhtDeducted,
    sourceBValue: returnWhtDeducted,
    difference: taxDiff,
    absoluteDifference: Math.abs(taxDiff),
    status: taxStatus,
    tolerance: rule.tolerance,
    explanation: taxStatus === 'PASS' ? 'WHT deductions fully reconciled' : `Variance of ${taxDiff.toFixed(2)} MVR in WHT deductions`,
    unmatchedTransactions: taxTxs
  });

  const overallStatus = items.some((i) => i.status === 'FAIL')
    ? 'FAIL'
    : items.some((i) => i.status === 'WARNING')
    ? 'WARNING'
    : 'PASS';

  return {
    reconciliationId: `REC-${context.entityId}-GL-NWT-${context.taxYear}`,
    entityId: context.entityId,
    taxYear: context.taxYear,
    reconciliationType: 'GL_NWT',
    title: rule.name,
    status: overallStatus,
    rule,
    totalSourceA: glWhtBaseAmount + glWhtDeducted,
    totalSourceB: returnWhtGross + returnWhtDeducted,
    totalDifference: grossDiff + taxDiff,
    items,
    underlyingTransactions: discrepancies,
    timestamp: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// MODULE 3: AP ↔ NWT RECONCILIATION
// -----------------------------------------------------------------------------
export function reconcileApNwt(
  context: ComprehensiveReconciliationContext,
  options?: ReconciliationEngineOptions
): Reconciliation {
  const rule = resolveReconciliationRule('AP_NWT', options);
  const items: ReconciliationItem[] = [];
  const discrepancies: UnderlyingTransactionDrilldown[] = [];

  const apInvoices = context.apInvoices || [];
  const foreignApInvoices = apInvoices.filter((inv) => inv.isForeignVendor);

  const totalApForeignAmount = foreignApInvoices.reduce((sum, inv) => sum + inv.amountMvr, 0);
  const totalApWhtDeducted = foreignApInvoices.reduce((sum, inv) => sum + inv.whtDeducted, 0);

  // Return WHT from MIRA 302 or NWT records
  let returnNwtGross = 0;
  let returnNwtDeducted = 0;

  if (context.whtReturn) {
    returnNwtGross = context.whtReturn.totalGrossPayments || 0;
    returnNwtDeducted = (context.whtReturn as any).totalWhtWithheld ?? (context.whtReturn as any).totalWithholdingTaxDeducted ?? 0;
  } else if (context.nwtTransactions) {
    returnNwtGross = context.nwtTransactions.reduce((sum, t) => sum + t.grossAmount, 0);
    returnNwtDeducted = context.nwtTransactions.reduce((sum, t) => sum + t.whtAmount, 0);
  } else {
    returnNwtGross = totalApForeignAmount;
    returnNwtDeducted = totalApWhtDeducted;
  }

  // AP Foreign Invoices without WHT check
  const diffGross = totalApForeignAmount - returnNwtGross;
  const diffGrossStatus = computeStatus(diffGross, rule.tolerance, rule.warningThreshold);
  const apDiscrepancies: UnderlyingTransactionDrilldown[] = [];

  for (const inv of foreignApInvoices) {
    if (inv.whtApplicable && inv.whtDeducted === 0) {
      const d: UnderlyingTransactionDrilldown = {
        transactionId: inv.invoiceId,
        source: 'Accounts Payable Foreign Invoice',
        sourceId: inv.invoiceId,
        reference: inv.reference,
        date: inv.date,
        amount: inv.amountMvr,
        taxAmount: 0,
        description: `Foreign invoice ${inv.invoiceId} from ${inv.vendorName} is subject to NWT but has zero withholding deducted`,
        discrepancyReason: `Missing statutory NWT deduction on foreign vendor invoice ${inv.invoiceId}`,
        side: 'SOURCE_A'
      };
      apDiscrepancies.push(d);
      discrepancies.push(d);
    }
  }

  if (diffGrossStatus !== 'PASS' && apDiscrepancies.length === 0 && foreignApInvoices.length > 0) {
    const d: UnderlyingTransactionDrilldown = {
      transactionId: foreignApInvoices[0].invoiceId,
      source: 'AP Foreign Invoices',
      amount: Math.abs(diffGross),
      discrepancyReason: `AP foreign purchases (${totalApForeignAmount.toFixed(2)}) exceed filed NWT base (${returnNwtGross.toFixed(2)})`,
      side: diffGross > 0 ? 'SOURCE_A' : 'SOURCE_B'
    };
    apDiscrepancies.push(d);
    discrepancies.push(d);
  }

  items.push({
    itemId: 'REC-ITEM-AP-NWT-01',
    code: 'AP_FOREIGN_INVOICES_VS_NWT',
    label: 'Foreign AP Invoices to NWT Reported Gross',
    sourceAValue: totalApForeignAmount,
    sourceBValue: returnNwtGross,
    difference: diffGross,
    absoluteDifference: Math.abs(diffGross),
    status: apDiscrepancies.length > 0 ? 'FAIL' : diffGrossStatus,
    tolerance: rule.tolerance,
    explanation: diffGrossStatus === 'PASS' ? 'AP foreign vendor invoices match NWT records' : `Discrepancy in foreign AP invoice withholding base`,
    unmatchedTransactions: apDiscrepancies
  });

  const diffWht = totalApWhtDeducted - returnNwtDeducted;
  const diffWhtStatus = computeStatus(diffWht, rule.tolerance, rule.warningThreshold);

  items.push({
    itemId: 'REC-ITEM-AP-NWT-02',
    code: 'AP_WHT_DEDUCTIONS_VS_NWT',
    label: 'AP Withheld Deductions vs NWT Remittances',
    sourceAValue: totalApWhtDeducted,
    sourceBValue: returnNwtDeducted,
    difference: diffWht,
    absoluteDifference: Math.abs(diffWht),
    status: diffWhtStatus,
    tolerance: rule.tolerance,
    explanation: diffWhtStatus === 'PASS' ? 'AP withholding deductions match NWT return' : `Variance of ${diffWht.toFixed(2)} MVR in AP withholding deductions`,
    unmatchedTransactions: []
  });

  const overallStatus = items.some((i) => i.status === 'FAIL')
    ? 'FAIL'
    : items.some((i) => i.status === 'WARNING')
    ? 'WARNING'
    : 'PASS';

  return {
    reconciliationId: `REC-${context.entityId}-AP-NWT-${context.taxYear}`,
    entityId: context.entityId,
    taxYear: context.taxYear,
    reconciliationType: 'AP_NWT',
    title: rule.name,
    status: overallStatus,
    rule,
    totalSourceA: totalApForeignAmount,
    totalSourceB: returnNwtGross,
    totalDifference: diffGross + diffWht,
    items,
    underlyingTransactions: discrepancies,
    timestamp: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// MODULE 4: FIXED ASSETS ↔ GL RECONCILIATION
// -----------------------------------------------------------------------------
export function reconcileFixedAssetsGl(
  context: ComprehensiveReconciliationContext,
  options?: ReconciliationEngineOptions
): Reconciliation {
  const rule = resolveReconciliationRule('FIXED_ASSETS_GL', options);
  const items: ReconciliationItem[] = [];
  const discrepancies: UnderlyingTransactionDrilldown[] = [];

  const fixedAssets = context.fixedAssets || [];
  const txs = (context.transactions || []).filter(
    (tx) => tx.taxYear === context.taxYear && (tx.reviewStatus as string) !== 'REJECTED'
  );

  // Asset Register Additions
  const farAdditions = fixedAssets.reduce((sum, fa) => sum + (Number(fa.costPrice ?? fa.cost ?? fa.additionsInYear) || 0), 0);
  const farDepreciation = fixedAssets.reduce((sum, fa) => sum + (Number(fa.capitalAllowanceClaimed) || 0), 0);
  const farNetBookValue = fixedAssets.reduce((sum, fa) => sum + (Number(fa.closingWDV) || (Number(fa.costPrice ?? fa.cost) - Number(fa.capitalAllowanceClaimed)) || 0), 0);

  // GL Capital Additions
  const glAssetTxs = txs.filter((tx) => {
    const cat = (tx.accountingCategory || '').toLowerCase();
    return (
      cat.includes('asset') ||
      cat.includes('ppe') ||
      cat.includes('equipment') ||
      cat.includes('building') ||
      cat.includes('vehicle') ||
      cat.includes('software') ||
      tx.accountingTreatment === 'ASSET'
    );
  });

  const glAssetAdditions = glAssetTxs.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const glPpeBalance = context.glBalanceSheet?.ppe ?? farNetBookValue;

  // Item 1: Asset Additions (FAR vs GL)
  const addDiff = farAdditions - (glAssetAdditions > 0 ? glAssetAdditions : farAdditions);
  const addStatus = computeStatus(addDiff, rule.tolerance, rule.warningThreshold);
  const addTxs: UnderlyingTransactionDrilldown[] = [];

  if (addStatus !== 'PASS') {
    for (const tx of glAssetTxs) {
      const d: UnderlyingTransactionDrilldown = {
        transactionId: tx.transactionId,
        source: 'GL Asset Addition',
        sourceType: tx.sourceType,
        sourceId: tx.sourceId,
        date: tx.transactionDate,
        amount: tx.amount,
        accountCode: tx.accountingCategory,
        description: tx.description || 'GL asset addition unrecorded in Fixed Asset Register',
        discrepancyReason: `GL Asset addition of ${tx.amount} MVR not mirrored in FAR`,
        side: 'SOURCE_A'
      };
      addTxs.push(d);
      discrepancies.push(d);
    }
  }

  items.push({
    itemId: 'REC-ITEM-FA-GL-01',
    code: 'ASSET_ADDITIONS_FAR_VS_GL',
    label: 'Asset Additions (Fixed Asset Register vs GL Asset Accounts)',
    sourceAValue: farAdditions,
    sourceBValue: glAssetAdditions > 0 ? glAssetAdditions : farAdditions,
    difference: addDiff,
    absoluteDifference: Math.abs(addDiff),
    status: addStatus,
    tolerance: rule.tolerance,
    explanation: addStatus === 'PASS' ? 'Asset additions fully reconciled' : `Variance of ${addDiff.toFixed(2)} MVR in asset additions`,
    unmatchedTransactions: addTxs
  });

  // Item 2: Net Book Value vs Balance Sheet PPE Control Account
  const nbvDiff = farNetBookValue - glPpeBalance;
  const nbvStatus = computeStatus(nbvDiff, rule.tolerance, rule.warningThreshold);

  items.push({
    itemId: 'REC-ITEM-FA-GL-02',
    code: 'NET_BOOK_VALUE_FAR_VS_GL',
    label: 'PPE Net Book Value (FAR vs GL Balance Sheet PPE)',
    sourceAValue: farNetBookValue,
    sourceBValue: glPpeBalance,
    difference: nbvDiff,
    absoluteDifference: Math.abs(nbvDiff),
    status: nbvStatus,
    tolerance: rule.tolerance,
    explanation: nbvStatus === 'PASS' ? 'PPE Net Book Value matches GL PPE Account' : `Variance of ${nbvDiff.toFixed(2)} MVR in PPE Net Book Value`,
    unmatchedTransactions: []
  });

  const overallStatus = items.some((i) => i.status === 'FAIL')
    ? 'FAIL'
    : items.some((i) => i.status === 'WARNING')
    ? 'WARNING'
    : 'PASS';

  return {
    reconciliationId: `REC-${context.entityId}-FA-GL-${context.taxYear}`,
    entityId: context.entityId,
    taxYear: context.taxYear,
    reconciliationType: 'FIXED_ASSETS_GL',
    title: rule.name,
    status: overallStatus,
    rule,
    totalSourceA: farAdditions + farNetBookValue,
    totalSourceB: (glAssetAdditions > 0 ? glAssetAdditions : farAdditions) + glPpeBalance,
    totalDifference: addDiff + nbvDiff,
    items,
    underlyingTransactions: discrepancies,
    timestamp: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// MODULE 5: TAX ASSETS ↔ FIXED ASSETS RECONCILIATION
// -----------------------------------------------------------------------------
export function reconcileTaxAssetsFixedAssets(
  context: ComprehensiveReconciliationContext,
  options?: ReconciliationEngineOptions
): Reconciliation {
  const rule = resolveReconciliationRule('TAX_ASSETS_FIXED_ASSETS', options);
  const items: ReconciliationItem[] = [];
  const discrepancies: UnderlyingTransactionDrilldown[] = [];

  const fixedAssets = context.fixedAssets || [];
  const bookAdditions = fixedAssets.reduce((sum, fa) => sum + (Number(fa.costPrice ?? fa.cost ?? fa.additionsInYear) || 0), 0);

  const caSummary = context.capitalAllowanceSummary || {};
  const taxQualifyingAdditions = caSummary.totalQualifyingAdditions ?? bookAdditions;
  const capitalAllowanceClaimed = caSummary.totalCapitalAllowanceClaimed ?? 0;

  // Item 1: Qualifying Additions (Tax Basis vs Book Basis)
  const addDiff = taxQualifyingAdditions - bookAdditions;
  const addStatus = computeStatus(addDiff, rule.tolerance, rule.warningThreshold);
  const addTxs: UnderlyingTransactionDrilldown[] = [];

  if (addStatus !== 'PASS') {
    for (const fa of fixedAssets) {
      if ((fa as any).isNonQualifying === true) {
        const d: UnderlyingTransactionDrilldown = {
          transactionId: fa.assetId,
          source: 'Fixed Asset Register (Non-qualifying)',
          sourceId: fa.assetId,
          amount: fa.costPrice ?? fa.cost ?? 0,
          description: `Asset ${fa.assetName} excluded from statutory capital allowances under Section 18`,
          discrepancyReason: `Asset ${fa.assetId} not recognized for tax capital allowances`,
          side: 'SOURCE_B'
        };
        addTxs.push(d);
        discrepancies.push(d);
      }
    }
  }

  items.push({
    itemId: 'REC-ITEM-TAX-FA-01',
    code: 'QUALIFYING_ADDITIONS_TAX_VS_BOOK',
    label: 'Qualifying Additions (Tax Capital Allowance vs Book FAR Additions)',
    sourceAValue: taxQualifyingAdditions,
    sourceBValue: bookAdditions,
    difference: addDiff,
    absoluteDifference: Math.abs(addDiff),
    status: addStatus,
    tolerance: rule.tolerance,
    explanation: addStatus === 'PASS' ? 'Qualifying tax additions match book additions' : `Tax vs Book additions variance of ${addDiff.toFixed(2)} MVR`,
    unmatchedTransactions: addTxs
  });

  // Item 2: Capital Allowance vs Book Depreciation Tracking
  const bookDepreciation = fixedAssets.reduce((sum, fa) => sum + (Number(fa.capitalAllowanceClaimed) || 0), 0);
  const timingDiff = capitalAllowanceClaimed - bookDepreciation;

  items.push({
    itemId: 'REC-ITEM-TAX-FA-02',
    code: 'CAPITAL_ALLOWANCE_VS_BOOK_DEPRECIATION',
    label: 'Capital Allowance Claimed vs Accounting Book Depreciation',
    sourceAValue: capitalAllowanceClaimed,
    sourceBValue: bookDepreciation,
    difference: timingDiff,
    absoluteDifference: Math.abs(timingDiff),
    status: 'PASS',
    tolerance: rule.tolerance,
    explanation: `Timing difference: Capital Allowance (${capitalAllowanceClaimed.toFixed(2)}) vs Accounting Depreciation (${bookDepreciation.toFixed(2)})`,
    unmatchedTransactions: []
  });

  const overallStatus = items.some((i) => i.status === 'FAIL')
    ? 'FAIL'
    : items.some((i) => i.status === 'WARNING')
    ? 'WARNING'
    : 'PASS';

  return {
    reconciliationId: `REC-${context.entityId}-TAX-FA-${context.taxYear}`,
    entityId: context.entityId,
    taxYear: context.taxYear,
    reconciliationType: 'TAX_ASSETS_FIXED_ASSETS',
    title: rule.name,
    status: overallStatus,
    rule,
    totalSourceA: taxQualifyingAdditions,
    totalSourceB: bookAdditions,
    totalDifference: addDiff,
    items,
    underlyingTransactions: discrepancies,
    timestamp: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// MODULE 6: P&L ↔ INCOME TAX RECONCILIATION
// -----------------------------------------------------------------------------
export function reconcilePnlIncomeTax(
  context: ComprehensiveReconciliationContext,
  options?: ReconciliationEngineOptions
): Reconciliation {
  const rule = resolveReconciliationRule('PNL_INCOME_TAX', options);
  const items: ReconciliationItem[] = [];
  const discrepancies: UnderlyingTransactionDrilldown[] = [];

  // P&L Net Profit before Tax
  let pnlNetProfit = 0;
  if (context.pnlReport?.netProfitBeforeTax !== undefined) {
    pnlNetProfit = context.pnlReport.netProfitBeforeTax;
  } else if (context.transactions && context.transactions.length > 0) {
    const txs = context.transactions.filter(
      (tx) => tx.taxYear === context.taxYear && (tx.reviewStatus as string) !== 'REJECTED'
    );
    const revenue = txs
      .filter((t) => (t.accountingCategory || '').toLowerCase().startsWith('revenue') || t.accountingTreatment === 'REVENUE')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const expenses = txs
      .filter((t) => (t.accountingCategory || '').toLowerCase().startsWith('expense') || t.accountingTreatment === 'EXPENSE')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    pnlNetProfit = revenue - expenses;
  }

  // MIRA 604 starting net profit
  let mira604BoxB01 = 0;
  if ((context.mira604Return as any)?.sectionB_CalculationOfInterimTaxableIncome?.boxB01_AccountingProfitOrLoss !== undefined) {
    mira604BoxB01 = (context.mira604Return as any).sectionB_CalculationOfInterimTaxableIncome.boxB01_AccountingProfitOrLoss;
  } else if (context.mira604Return?.sectionB_Schedule1PnL?.accountingProfitBeforeTax !== undefined) {
    mira604BoxB01 = context.mira604Return.sectionB_Schedule1PnL.accountingProfitBeforeTax;
  } else if (context.taxEngineResult?.accountingProfit !== undefined) {
    mira604BoxB01 = context.taxEngineResult.accountingProfit;
  } else {
    mira604BoxB01 = pnlNetProfit;
  }

  const profitDiff = pnlNetProfit - mira604BoxB01;
  const profitStatus = computeStatus(profitDiff, rule.tolerance, rule.warningThreshold);
  const profitTxs: UnderlyingTransactionDrilldown[] = [];

  if (profitStatus !== 'PASS') {
    const d: UnderlyingTransactionDrilldown = {
      transactionId: 'PNL-TAX-BASE-DIFF',
      source: 'P&L Statement vs MIRA 604 Box B01',
      amount: Math.abs(profitDiff),
      discrepancyReason: `P&L Net Profit before tax (${pnlNetProfit.toFixed(2)}) differs from MIRA 604 starting base Box B01 (${mira604BoxB01.toFixed(2)})`,
      side: profitDiff > 0 ? 'SOURCE_A' : 'SOURCE_B'
    };
    profitTxs.push(d);
    discrepancies.push(d);
  }

  items.push({
    itemId: 'REC-ITEM-PNL-IT-01',
    code: 'NET_PROFIT_PNL_VS_MIRA604_B01',
    label: 'Accounting Net Profit (P&L vs MIRA 604 Box B01)',
    sourceAValue: pnlNetProfit,
    sourceBValue: mira604BoxB01,
    difference: profitDiff,
    absoluteDifference: Math.abs(profitDiff),
    status: profitStatus,
    tolerance: rule.tolerance,
    explanation: profitStatus === 'PASS' ? 'P&L profit matches MIRA 604 starting base Box B01' : `Variance of ${profitDiff.toFixed(2)} MVR in starting profit base`,
    unmatchedTransactions: profitTxs
  });

  const overallStatus = profitStatus;

  return {
    reconciliationId: `REC-${context.entityId}-PNL-IT-${context.taxYear}`,
    entityId: context.entityId,
    taxYear: context.taxYear,
    reconciliationType: 'PNL_INCOME_TAX',
    title: rule.name,
    status: overallStatus,
    rule,
    totalSourceA: pnlNetProfit,
    totalSourceB: mira604BoxB01,
    totalDifference: profitDiff,
    items,
    underlyingTransactions: discrepancies,
    timestamp: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// MODULE 7: TAX ADJUSTMENTS ↔ TAX CALCULATION RECONCILIATION
// -----------------------------------------------------------------------------
export function reconcileTaxAdjustmentsTaxCalc(
  context: ComprehensiveReconciliationContext,
  options?: ReconciliationEngineOptions
): Reconciliation {
  const rule = resolveReconciliationRule('TAX_ADJUSTMENTS_TAX_CALC', options);
  const items: ReconciliationItem[] = [];
  const discrepancies: UnderlyingTransactionDrilldown[] = [];

  const adjustments = context.taxAdjustments || [];

  // Granular adjustments total additions and deductions
  const ledgerAdditions = adjustments
    .filter((a) => a.direction === 'ADD_BACK' || (a as any).direction === 'ADDBACK' || a.amount > 0)
    .reduce((s, a) => s + Math.abs(Number(a.amount) || 0), 0);

  const ledgerDeductions = adjustments
    .filter((a) => a.direction === 'DEDUCTION' || a.amount < 0)
    .reduce((s, a) => s + Math.abs(Number(a.amount) || 0), 0);

  // Return values from MIRA 604 Section C or Tax Engine
  let formTotalAdditions = 0;
  let formTotalDeductions = 0;

  if ((context.mira604Return as any)?.sectionC_CalculationOfTaxableIncome) {
    const secC = (context.mira604Return as any).sectionC_CalculationOfTaxableIncome;
    formTotalAdditions = secC.boxC08_TotalAdditions || 0;
    formTotalDeductions = secC.boxC16_TotalDeductions || 0;
  } else if (context.mira604Return?.sectionC_TaxAdjustments) {
    formTotalAdditions = context.mira604Return.sectionC_TaxAdjustments.totalAddBacks || 0;
    formTotalDeductions = context.mira604Return.sectionC_TaxAdjustments.totalDeductions || 0;
  } else if (context.taxEngineResult) {
    formTotalAdditions = context.taxEngineResult.totalAdditions ?? ledgerAdditions;
    formTotalDeductions = context.taxEngineResult.totalDeductions ?? ledgerDeductions;
  } else {
    formTotalAdditions = ledgerAdditions;
    formTotalDeductions = ledgerDeductions;
  }

  // Item 1: Total Additions
  const addDiff = ledgerAdditions - formTotalAdditions;
  const addStatus = computeStatus(addDiff, rule.tolerance, rule.warningThreshold);
  const addTxs: UnderlyingTransactionDrilldown[] = [];

  if (addStatus !== 'PASS') {
    for (const adj of adjustments) {
      if (adj.direction === 'ADD_BACK' || (adj as any).direction === 'ADDBACK') {
        const d: UnderlyingTransactionDrilldown = {
          transactionId: adj.adjustmentId || 'ADJ-ADD',
          source: 'Tax Adjustment Ledger (Addback)',
          sourceId: adj.adjustmentId,
          amount: adj.amount,
          description: adj.reason || adj.adjustmentName || `Section 11 Non-deductible addback (${adj.miraCode})`,
          discrepancyReason: `Tax addback ${adj.miraCode} of ${adj.amount} MVR not reflected in Form Box C08`,
          side: 'SOURCE_A'
        };
        addTxs.push(d);
        discrepancies.push(d);
      }
    }
  }

  items.push({
    itemId: 'REC-ITEM-ADJ-CALC-01',
    code: 'TAX_ADDBACKS_LEDGER_VS_FORM',
    label: 'Statutory Additions / Addbacks (Tax Ledger vs MIRA 604 Box C08)',
    sourceAValue: ledgerAdditions,
    sourceBValue: formTotalAdditions,
    difference: addDiff,
    absoluteDifference: Math.abs(addDiff),
    status: addStatus,
    tolerance: rule.tolerance,
    explanation: addStatus === 'PASS' ? 'Tax addbacks fully reconciled' : `Variance of ${addDiff.toFixed(2)} MVR in tax addbacks`,
    unmatchedTransactions: addTxs
  });

  // Item 2: Total Deductions
  const dedDiff = ledgerDeductions - formTotalDeductions;
  const dedStatus = computeStatus(dedDiff, rule.tolerance, rule.warningThreshold);
  const dedTxs: UnderlyingTransactionDrilldown[] = [];

  if (dedStatus !== 'PASS') {
    for (const adj of adjustments) {
      if (adj.direction === 'DEDUCTION') {
        const d: UnderlyingTransactionDrilldown = {
          transactionId: adj.adjustmentId || 'ADJ-DED',
          source: 'Tax Adjustment Ledger (Deduction)',
          sourceId: adj.adjustmentId,
          amount: adj.amount,
          description: adj.reason || adj.adjustmentName || `Statutory tax deduction (${adj.miraCode})`,
          discrepancyReason: `Tax deduction ${adj.miraCode} of ${adj.amount} MVR not reflected in Form Box C16`,
          side: 'SOURCE_A'
        };
        dedTxs.push(d);
        discrepancies.push(d);
      }
    }
  }

  items.push({
    itemId: 'REC-ITEM-ADJ-CALC-02',
    code: 'TAX_DEDUCTIONS_LEDGER_VS_FORM',
    label: 'Statutory Deductions (Tax Ledger vs MIRA 604 Box C16)',
    sourceAValue: ledgerDeductions,
    sourceBValue: formTotalDeductions,
    difference: dedDiff,
    absoluteDifference: Math.abs(dedDiff),
    status: dedStatus,
    tolerance: rule.tolerance,
    explanation: dedStatus === 'PASS' ? 'Tax deductions fully reconciled' : `Variance of ${dedDiff.toFixed(2)} MVR in tax deductions`,
    unmatchedTransactions: dedTxs
  });

  const overallStatus = items.some((i) => i.status === 'FAIL')
    ? 'FAIL'
    : items.some((i) => i.status === 'WARNING')
    ? 'WARNING'
    : 'PASS';

  return {
    reconciliationId: `REC-${context.entityId}-ADJ-CALC-${context.taxYear}`,
    entityId: context.entityId,
    taxYear: context.taxYear,
    reconciliationType: 'TAX_ADJUSTMENTS_TAX_CALC',
    title: rule.name,
    status: overallStatus,
    rule,
    totalSourceA: ledgerAdditions + ledgerDeductions,
    totalSourceB: formTotalAdditions + formTotalDeductions,
    totalDifference: addDiff + dedDiff,
    items,
    underlyingTransactions: discrepancies,
    timestamp: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// MODULE 8: MIRA 604 ↔ TAX ENGINE RECONCILIATION
// -----------------------------------------------------------------------------
export function reconcileMira604TaxEngine(
  context: ComprehensiveReconciliationContext,
  options?: ReconciliationEngineOptions
): Reconciliation {
  const rule = resolveReconciliationRule('MIRA604_TAX_ENGINE', options);
  const items: ReconciliationItem[] = [];
  const discrepancies: UnderlyingTransactionDrilldown[] = [];

  const engineTaxableIncome = context.taxEngineResult?.taxableIncome ?? ((context.mira604Return as any)?.sectionC_CalculationOfTaxableIncome?.boxC17_TaxableIncomeOrLoss || context.mira604Return?.sectionE_TaxableIncomeLoss?.netTaxableIncome || 0);
  const engineTaxPayable = context.taxEngineResult?.taxPayable ?? ((context.mira604Return as any)?.sectionD_CalculationOfTaxPayable?.boxD09_TotalTaxPayable || context.mira604Return?.sectionF_TaxComputation?.totalTaxPayable || 0);

  const formTaxableIncome = (context.mira604Return as any)?.sectionC_CalculationOfTaxableIncome?.boxC17_TaxableIncomeOrLoss ?? context.mira604Return?.sectionE_TaxableIncomeLoss?.netTaxableIncome ?? engineTaxableIncome;
  const formTaxPayable = (context.mira604Return as any)?.sectionD_CalculationOfTaxPayable?.boxD09_TotalTaxPayable ?? context.mira604Return?.sectionF_TaxComputation?.totalTaxPayable ?? engineTaxPayable;

  // Item 1: Taxable Income
  const tiDiff = engineTaxableIncome - formTaxableIncome;
  const tiStatus = computeStatus(tiDiff, rule.tolerance, rule.warningThreshold);
  const tiTxs: UnderlyingTransactionDrilldown[] = [];

  if (tiStatus !== 'PASS') {
    const d: UnderlyingTransactionDrilldown = {
      transactionId: 'TAX-ENGINE-604-TI-DIFF',
      source: 'Tax Engine vs MIRA 604 Box C17',
      amount: Math.abs(tiDiff),
      discrepancyReason: `Taxable Income mismatch: Engine (${engineTaxableIncome}) vs MIRA 604 (${formTaxableIncome})`,
      side: tiDiff > 0 ? 'SOURCE_A' : 'SOURCE_B'
    };
    tiTxs.push(d);
    discrepancies.push(d);
  }

  items.push({
    itemId: 'REC-ITEM-604-ENG-01',
    code: 'TAXABLE_INCOME_ENGINE_VS_FORM',
    label: 'Final Taxable Income (Tax Engine vs MIRA 604 Box C17)',
    sourceAValue: engineTaxableIncome,
    sourceBValue: formTaxableIncome,
    difference: tiDiff,
    absoluteDifference: Math.abs(tiDiff),
    status: tiStatus,
    tolerance: rule.tolerance,
    explanation: tiStatus === 'PASS' ? 'Taxable Income is identical' : `Variance of ${tiDiff.toFixed(2)} MVR in Taxable Income`,
    unmatchedTransactions: tiTxs
  });

  // Item 2: Tax Payable
  const tpDiff = engineTaxPayable - formTaxPayable;
  const tpStatus = computeStatus(tpDiff, rule.tolerance, rule.warningThreshold);
  const tpTxs: UnderlyingTransactionDrilldown[] = [];

  if (tpStatus !== 'PASS') {
    const d: UnderlyingTransactionDrilldown = {
      transactionId: 'TAX-ENGINE-604-TP-DIFF',
      source: 'Tax Engine vs MIRA 604 Box D09',
      amount: Math.abs(tpDiff),
      discrepancyReason: `Tax Payable mismatch: Engine (${engineTaxPayable}) vs MIRA 604 (${formTaxPayable})`,
      side: tpDiff > 0 ? 'SOURCE_A' : 'SOURCE_B'
    };
    tpTxs.push(d);
    discrepancies.push(d);
  }

  items.push({
    itemId: 'REC-ITEM-604-ENG-02',
    code: 'TAX_PAYABLE_ENGINE_VS_FORM',
    label: 'Total Tax Payable (Tax Engine vs MIRA 604 Box D09)',
    sourceAValue: engineTaxPayable,
    sourceBValue: formTaxPayable,
    difference: tpDiff,
    absoluteDifference: Math.abs(tpDiff),
    status: tpStatus,
    tolerance: rule.tolerance,
    explanation: tpStatus === 'PASS' ? 'Tax Payable is identical' : `Variance of ${tpDiff.toFixed(2)} MVR in Tax Payable`,
    unmatchedTransactions: tpTxs
  });

  const overallStatus = items.some((i) => i.status === 'FAIL')
    ? 'FAIL'
    : items.some((i) => i.status === 'WARNING')
    ? 'WARNING'
    : 'PASS';

  return {
    reconciliationId: `REC-${context.entityId}-604-ENG-${context.taxYear}`,
    entityId: context.entityId,
    taxYear: context.taxYear,
    reconciliationType: 'MIRA604_TAX_ENGINE',
    title: rule.name,
    status: overallStatus,
    rule,
    totalSourceA: engineTaxableIncome + engineTaxPayable,
    totalSourceB: formTaxableIncome + formTaxPayable,
    totalDifference: tiDiff + tpDiff,
    items,
    underlyingTransactions: discrepancies,
    timestamp: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// MODULE 9: SCHEDULE 2 ↔ BALANCE SHEET RECONCILIATION
// -----------------------------------------------------------------------------
export function reconcileSchedule2BalanceSheet(
  context: ComprehensiveReconciliationContext,
  options?: ReconciliationEngineOptions
): Reconciliation {
  const rule = resolveReconciliationRule('SCHEDULE2_BALANCE_SHEET', options);
  const items: ReconciliationItem[] = [];
  const discrepancies: UnderlyingTransactionDrilldown[] = [];

  const sch2 = context.schedule2Data || {};
  const glBs = context.glBalanceSheet || {};

  const totalAssets = sch2.totalAssets ?? (glBs.totalAssets ?? ((sch2.totalNonCurrentAssets || 0) + (sch2.totalCurrentAssets || 0)));
  const totalEquityAndLiabilities = sch2.totalEquityAndLiabilities ?? (glBs.totalEquityAndLiabilities ?? ((sch2.totalEquity || 0) + (sch2.totalLiabilities || 0)));

  // Item 1: Balance Sheet Equation Equality (Total Assets = Total Equity + Liabilities)
  const balanceVariance = totalAssets - totalEquityAndLiabilities;
  const balanceStatus = computeStatus(balanceVariance, rule.tolerance, rule.warningThreshold);
  const balTxs: UnderlyingTransactionDrilldown[] = [];

  if (balanceStatus !== 'PASS') {
    const d: UnderlyingTransactionDrilldown = {
      transactionId: 'SCH2-BALANCE-EQUATION-VARIANCE',
      source: 'MIRA 604 Schedule 2 Financial Position',
      amount: Math.abs(balanceVariance),
      discrepancyReason: `Schedule 2 Balance Equation failure: Total Assets (${totalAssets.toFixed(2)}) != Total Equity & Liabilities (${totalEquityAndLiabilities.toFixed(2)})`,
      side: balanceVariance > 0 ? 'SOURCE_A' : 'SOURCE_B'
    };
    balTxs.push(d);
    discrepancies.push(d);
  }

  items.push({
    itemId: 'REC-ITEM-SCH2-BS-01',
    code: 'SCHEDULE2_BALANCE_CHECK',
    label: 'Balance Sheet Equation Equality (Total Assets vs Total Equity + Liabilities)',
    sourceAValue: totalAssets,
    sourceBValue: totalEquityAndLiabilities,
    difference: balanceVariance,
    absoluteDifference: Math.abs(balanceVariance),
    status: balanceStatus,
    tolerance: rule.tolerance,
    explanation: balanceStatus === 'PASS' ? 'Balance Sheet Equation is balanced (Assets = Equity + Liabilities)' : `Balance variance of ${balanceVariance.toFixed(2)} MVR in Schedule 2`,
    unmatchedTransactions: balTxs
  });

  // Item 2: GL Total Assets vs Schedule 2 Total Assets
  const glAssets = glBs.totalAssets ?? totalAssets;
  const glAssetDiff = glAssets - totalAssets;
  const glAssetStatus = computeStatus(glAssetDiff, rule.tolerance, rule.warningThreshold);

  items.push({
    itemId: 'REC-ITEM-SCH2-BS-02',
    code: 'SCHEDULE2_TOTAL_ASSETS_VS_GL',
    label: 'Total Assets (General Ledger vs Schedule 2)',
    sourceAValue: glAssets,
    sourceBValue: totalAssets,
    difference: glAssetDiff,
    absoluteDifference: Math.abs(glAssetDiff),
    status: glAssetStatus,
    tolerance: rule.tolerance,
    explanation: glAssetStatus === 'PASS' ? 'Total Assets match GL Balance Sheet' : `Variance of ${glAssetDiff.toFixed(2)} MVR in Total Assets`,
    unmatchedTransactions: []
  });

  const overallStatus = items.some((i) => i.status === 'FAIL')
    ? 'FAIL'
    : items.some((i) => i.status === 'WARNING')
    ? 'WARNING'
    : 'PASS';

  return {
    reconciliationId: `REC-${context.entityId}-SCH2-BS-${context.taxYear}`,
    entityId: context.entityId,
    taxYear: context.taxYear,
    reconciliationType: 'SCHEDULE2_BALANCE_SHEET',
    title: rule.name,
    status: overallStatus,
    rule,
    totalSourceA: totalAssets,
    totalSourceB: totalEquityAndLiabilities,
    totalDifference: balanceVariance,
    items,
    underlyingTransactions: discrepancies,
    timestamp: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// MODULE 10: SCHEDULE 3 ↔ APPLICABLE SOURCE DATA RECONCILIATION
// -----------------------------------------------------------------------------
export function reconcileSchedule3NetWorth(
  context: ComprehensiveReconciliationContext,
  options?: ReconciliationEngineOptions
): Reconciliation {
  const rule = resolveReconciliationRule('SCHEDULE3_NET_WORTH', options);
  const items: ReconciliationItem[] = [];
  const discrepancies: UnderlyingTransactionDrilldown[] = [];

  const sch3 = context.schedule3Data || {};
  const registry = context.personalAssetRegistry || {};

  const declaredNetWorth = sch3.netNonBusinessWorth ?? ((sch3.totalPersonalAssets || 0) - (sch3.personalLiabilities || 0));
  const registryNetWorth = registry.netNonBusinessWorth ?? ((registry.totalPersonalAssets || 0) - (registry.personalLiabilities || 0));

  const nwDiff = declaredNetWorth - registryNetWorth;
  const nwStatus = computeStatus(nwDiff, rule.tolerance, rule.warningThreshold);
  const nwTxs: UnderlyingTransactionDrilldown[] = [];

  if (nwStatus !== 'PASS') {
    for (const asset of registry.disclosedAssets || []) {
      const d: UnderlyingTransactionDrilldown = {
        transactionId: asset.id,
        source: 'Personal Asset Registry',
        sourceId: asset.id,
        amount: asset.value,
        description: `Personal asset ${asset.name} variance from Schedule 3 declaration`,
        discrepancyReason: `Asset ${asset.id} worth ${asset.value} MVR variance from Schedule 3`,
        side: 'SOURCE_B'
      };
      nwTxs.push(d);
      discrepancies.push(d);
    }
  }

  items.push({
    itemId: 'REC-ITEM-SCH3-NW-01',
    code: 'SCHEDULE3_NET_WORTH_VS_REGISTRY',
    label: 'Non-Business Net Worth (Schedule 3 vs Personal Asset Registry)',
    sourceAValue: declaredNetWorth,
    sourceBValue: registryNetWorth,
    difference: nwDiff,
    absoluteDifference: Math.abs(nwDiff),
    status: nwStatus,
    tolerance: rule.tolerance,
    explanation: nwStatus === 'PASS' ? 'Schedule 3 Net Worth matches declared individual registry' : `Net worth variance of ${nwDiff.toFixed(2)} MVR`,
    unmatchedTransactions: nwTxs
  });

  const overallStatus = nwStatus;

  return {
    reconciliationId: `REC-${context.entityId}-SCH3-NW-${context.taxYear}`,
    entityId: context.entityId,
    taxYear: context.taxYear,
    reconciliationType: 'SCHEDULE3_NET_WORTH',
    title: rule.name,
    status: overallStatus,
    rule,
    totalSourceA: declaredNetWorth,
    totalSourceB: registryNetWorth,
    totalDifference: nwDiff,
    items,
    underlyingTransactions: discrepancies,
    timestamp: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// MODULE 11: SCHEDULE 4 ↔ RELATED-PARTY LEDGER RECONCILIATION
// -----------------------------------------------------------------------------
export function reconcileSchedule4RelatedParty(
  context: ComprehensiveReconciliationContext,
  options?: ReconciliationEngineOptions
): Reconciliation {
  const rule = resolveReconciliationRule('SCHEDULE4_RELATED_PARTY', options);
  const items: ReconciliationItem[] = [];
  const discrepancies: UnderlyingTransactionDrilldown[] = [];

  const sch4 = context.schedule4Data || {};
  const rpLedger = context.relatedPartyLedger || {};

  const sch4TotalTransactions = sch4.totalRelatedPartyTransactions ?? (
    (sch4.internationalSales || 0) +
    (sch4.internationalPurchases || 0) +
    (sch4.royaltiesPaid || 0) +
    (sch4.managementFeesPaid || 0) +
    (sch4.interestPaid || 0)
  );

  const ledgerTotalTransactions = rpLedger.totalRelatedPartyTransactions ?? sch4TotalTransactions;

  const txDiff = sch4TotalTransactions - ledgerTotalTransactions;
  const txStatus = computeStatus(txDiff, rule.tolerance, rule.warningThreshold);
  const rpTxs: UnderlyingTransactionDrilldown[] = [];

  if (txStatus !== 'PASS') {
    for (const tx of rpLedger.transactions || []) {
      const d: UnderlyingTransactionDrilldown = {
        transactionId: tx.transactionId,
        source: 'Related-Party Ledger',
        sourceId: tx.transactionId,
        amount: tx.amount,
        description: `International transaction with associate ${tx.partyName} (${tx.jurisdiction})`,
        discrepancyReason: `Related-party transaction ${tx.transactionId} variance from Schedule 4`,
        side: 'SOURCE_B'
      };
      rpTxs.push(d);
      discrepancies.push(d);
    }
  }

  items.push({
    itemId: 'REC-ITEM-SCH4-TP-01',
    code: 'SCHEDULE4_TRANSACTIONS_VS_LEDGER',
    label: 'Associate Transactions Volume (Schedule 4 vs Intercompany Ledger)',
    sourceAValue: sch4TotalTransactions,
    sourceBValue: ledgerTotalTransactions,
    difference: txDiff,
    absoluteDifference: Math.abs(txDiff),
    status: txStatus,
    tolerance: rule.tolerance,
    explanation: txStatus === 'PASS' ? 'Associate transactions volume fully reconciled' : `Variance of ${txDiff.toFixed(2)} MVR in related-party volume`,
    unmatchedTransactions: rpTxs
  });

  // Transfer pricing tax adjustments check
  const sch4TpAdj = sch4.totalTpTaxAdjustments || 0;
  const ledgerTpAdj = rpLedger.totalTpAdjustments ?? sch4TpAdj;
  const tpDiff = sch4TpAdj - ledgerTpAdj;
  const tpStatus = computeStatus(tpDiff, rule.tolerance, rule.warningThreshold);

  items.push({
    itemId: 'REC-ITEM-SCH4-TP-02',
    code: 'SCHEDULE4_TP_ADJUSTMENTS_VS_LEDGER',
    label: 'Transfer Pricing Tax Adjustments (Schedule 4 vs Section 67 Computation)',
    sourceAValue: sch4TpAdj,
    sourceBValue: ledgerTpAdj,
    difference: tpDiff,
    absoluteDifference: Math.abs(tpDiff),
    status: tpStatus,
    tolerance: rule.tolerance,
    explanation: tpStatus === 'PASS' ? 'Transfer pricing tax adjustments reconciled' : `Variance of ${tpDiff.toFixed(2)} MVR in TP adjustments`,
    unmatchedTransactions: []
  });

  const overallStatus = items.some((i) => i.status === 'FAIL')
    ? 'FAIL'
    : items.some((i) => i.status === 'WARNING')
    ? 'WARNING'
    : 'PASS';

  return {
    reconciliationId: `REC-${context.entityId}-SCH4-TP-${context.taxYear}`,
    entityId: context.entityId,
    taxYear: context.taxYear,
    reconciliationType: 'SCHEDULE4_RELATED_PARTY',
    title: rule.name,
    status: overallStatus,
    rule,
    totalSourceA: sch4TotalTransactions + sch4TpAdj,
    totalSourceB: ledgerTotalTransactions + ledgerTpAdj,
    totalDifference: txDiff + tpDiff,
    items,
    underlyingTransactions: discrepancies,
    timestamp: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// MODULE 12: SCHEDULE 5 ↔ CFE DATA RECONCILIATION
// -----------------------------------------------------------------------------
export function reconcileSchedule5Cfe(
  context: ComprehensiveReconciliationContext,
  options?: ReconciliationEngineOptions
): Reconciliation {
  const rule = resolveReconciliationRule('SCHEDULE5_CFE', options);
  const items: ReconciliationItem[] = [];
  const discrepancies: UnderlyingTransactionDrilldown[] = [];

  const sch5 = context.schedule5Data || {};
  const cfeSource = context.cfeSourceData || {};

  const sch5AttributableIncome = sch5.attributableCfeIncome || 0;
  const sourceAttributableIncome = cfeSource.totalAttributableIncome ?? sch5AttributableIncome;

  const incDiff = sch5AttributableIncome - sourceAttributableIncome;
  const incStatus = computeStatus(incDiff, rule.tolerance, rule.warningThreshold);
  const incTxs: UnderlyingTransactionDrilldown[] = [];

  if (incStatus !== 'PASS') {
    for (const sub of cfeSource.subsidiaries || []) {
      const d: UnderlyingTransactionDrilldown = {
        transactionId: `CFE-${sub.entityName}`,
        source: 'CFE Subsidiary Financials',
        amount: sub.attributableIncome,
        description: `Controlled Foreign Entity ${sub.entityName} (${sub.country}) attributable income`,
        discrepancyReason: `CFE attributable income variance for ${sub.entityName}`,
        side: 'SOURCE_B'
      };
      incTxs.push(d);
      discrepancies.push(d);
    }
  }

  items.push({
    itemId: 'REC-ITEM-SCH5-CFE-01',
    code: 'SCHEDULE5_CFE_ATTRIBUTABLE_INCOME',
    label: 'CFE Attributable Taxable Income (Schedule 5 vs Subsidiary Statements)',
    sourceAValue: sch5AttributableIncome,
    sourceBValue: sourceAttributableIncome,
    difference: incDiff,
    absoluteDifference: Math.abs(incDiff),
    status: incStatus,
    tolerance: rule.tolerance,
    explanation: incStatus === 'PASS' ? 'CFE attributable taxable income reconciled' : `Variance of ${incDiff.toFixed(2)} MVR in CFE income`,
    unmatchedTransactions: incTxs
  });

  // Foreign tax credit
  const sch5Ftc = sch5.claimedForeignTaxCredit || 0;
  const sourceFtc = cfeSource.claimedForeignTaxCredit ?? sch5Ftc;
  const ftcDiff = sch5Ftc - sourceFtc;
  const ftcStatus = computeStatus(ftcDiff, rule.tolerance, rule.warningThreshold);

  items.push({
    itemId: 'REC-ITEM-SCH5-CFE-02',
    code: 'SCHEDULE5_CFE_FOREIGN_TAX_CREDIT',
    label: 'CFE Foreign Tax Credit (Schedule 5 vs Withholding/Payment Slips)',
    sourceAValue: sch5Ftc,
    sourceBValue: sourceFtc,
    difference: ftcDiff,
    absoluteDifference: Math.abs(ftcDiff),
    status: ftcStatus,
    tolerance: rule.tolerance,
    explanation: ftcStatus === 'PASS' ? 'CFE foreign tax credit reconciled' : `Variance of ${ftcDiff.toFixed(2)} MVR in foreign tax credit`,
    unmatchedTransactions: []
  });

  const overallStatus = items.some((i) => i.status === 'FAIL')
    ? 'FAIL'
    : items.some((i) => i.status === 'WARNING')
    ? 'WARNING'
    : 'PASS';

  return {
    reconciliationId: `REC-${context.entityId}-SCH5-CFE-${context.taxYear}`,
    entityId: context.entityId,
    taxYear: context.taxYear,
    reconciliationType: 'SCHEDULE5_CFE',
    title: rule.name,
    status: overallStatus,
    rule,
    totalSourceA: sch5AttributableIncome + sch5Ftc,
    totalSourceB: sourceAttributableIncome + sourceFtc,
    totalDifference: incDiff + ftcDiff,
    items,
    underlyingTransactions: discrepancies,
    timestamp: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// MASTER SUITE: EXECUTES ALL 12 RECONCILIATIONS
// -----------------------------------------------------------------------------
export function runFullReconciliationSuite(
  context: ComprehensiveReconciliationContext,
  options?: ReconciliationEngineOptions
): ReconciliationSuiteResult {
  const recGlGst = reconcileGlGst(context, options);
  const recGlNwt = reconcileGlNwt(context, options);
  const recApNwt = reconcileApNwt(context, options);
  const recFixedAssetsGl = reconcileFixedAssetsGl(context, options);
  const recTaxAssetsFa = reconcileTaxAssetsFixedAssets(context, options);
  const recPnlIt = reconcilePnlIncomeTax(context, options);
  const recTaxAdjCalc = reconcileTaxAdjustmentsTaxCalc(context, options);
  const recMira604Engine = reconcileMira604TaxEngine(context, options);
  const recSch2Bs = reconcileSchedule2BalanceSheet(context, options);
  const recSch3Nw = reconcileSchedule3NetWorth(context, options);
  const recSch4Tp = reconcileSchedule4RelatedParty(context, options);
  const recSch5Cfe = reconcileSchedule5Cfe(context, options);

  const reconciliations: Record<ReconciliationType, Reconciliation> = {
    GL_GST: recGlGst,
    GL_NWT: recGlNwt,
    AP_NWT: recApNwt,
    FIXED_ASSETS_GL: recFixedAssetsGl,
    TAX_ASSETS_FIXED_ASSETS: recTaxAssetsFa,
    PNL_INCOME_TAX: recPnlIt,
    TAX_ADJUSTMENTS_TAX_CALC: recTaxAdjCalc,
    MIRA604_TAX_ENGINE: recMira604Engine,
    SCHEDULE2_BALANCE_SHEET: recSch2Bs,
    SCHEDULE3_NET_WORTH: recSch3Nw,
    SCHEDULE4_RELATED_PARTY: recSch4Tp,
    SCHEDULE5_CFE: recSch5Cfe
  };

  const list = Object.values(reconciliations);
  const passedCount = list.filter((r) => r.status === 'PASS').length;
  const warningCount = list.filter((r) => r.status === 'WARNING').length;
  const failedCount = list.filter((r) => r.status === 'FAIL').length;

  let overallStatus: ReconciliationStatus = 'PASS';
  if (failedCount > 0) {
    overallStatus = 'FAIL';
  } else if (warningCount > 0) {
    overallStatus = 'WARNING';
  }

  const allDiscrepancies: UnderlyingTransactionDrilldown[] = [];
  for (const r of list) {
    allDiscrepancies.push(...r.underlyingTransactions);
  }

  return {
    suiteId: `SUITE-${context.entityId}-${context.taxYear}-${Date.now()}`,
    entityId: context.entityId,
    taxYear: context.taxYear,
    overallStatus,
    passedCount,
    warningCount,
    failedCount,
    reconciliations,
    reconciliationList: list,
    allDiscrepancies,
    generatedAt: new Date().toISOString(),
    ruleId: 'RULE-RECONCILIATION-FRAMEWORK',
    legalReference: 'Tax Administration Act (Act No. 3/2010) Section 27, 38 & Income Tax Act'
  };
}
