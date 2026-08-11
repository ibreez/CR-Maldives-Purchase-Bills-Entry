import { TransactionRecord, Transaction } from '../../types/taxEngine';
import {
  GstPeriod,
  Mira105GstReturn,
  InputGstEligibility,
  AnyTransaction,
  Mira105OutputSalesBox,
  Mira105InputPurchasesBox,
  Mira105CapitalPurchasesBox
} from '../../types/mira105';

/**
 * Classifies input GST eligibility for a purchase transaction.
 *
 * @param transaction AnyTransaction
 * @param entityHasMixedSupplies Whether entity has both taxable and exempt sales
 * @returns InputGstEligibility ('CLAIMABLE' | 'NON_CLAIMABLE' | 'BLOCKED' | 'PRO_RATA')
 */
export function classifyGstEligibility(
  transaction: AnyTransaction,
  entityHasMixedSupplies: boolean = false
): InputGstEligibility {
  const category = (transaction.accountingCategory || '').toLowerCase();
  const desc = (transaction.description || '').toLowerCase();
  const treatment = transaction.gstTreatment;

  // 1. Blocked / Non-claimable criteria under MIRA GST Rules
  if (
    treatment === 'NO_INPUT_TAX' ||
    treatment === 'EXEMPT' ||
    treatment === 'OUT_OF_SCOPE' ||
    category.includes('entertainment') ||
    category.includes('fine') ||
    category.includes('penalty') ||
    desc.includes('entertainment') ||
    desc.includes('penalty') ||
    transaction.gstAmount === 0
  ) {
    return 'NON_CLAIMABLE';
  }

  // 2. Pro-Rata overhead criteria (General administrative overheads in mixed-supply entities)
  if (
    entityHasMixedSupplies &&
    (category.includes('utilities') ||
      category.includes('rent') ||
      category.includes('accounting') ||
      category.includes('audit') ||
      category.includes('general_expense') ||
      category.includes('office'))
  ) {
    return 'PRO_RATA';
  }

  // 3. Claimable criteria (Standard rated business purchases directly for taxable supplies)
  if (treatment === 'INPUT_TAX' || treatment === 'STANDARD_RATED' || transaction.gstAmount > 0) {
    return 'CLAIMABLE';
  }

  return 'NON_CLAIMABLE';
}

export interface Mira105GenerationOptions {
  entityHasMixedSupplies?: boolean;
  overrideProRataRatio?: number;
}

/**
 * Generates official MIRA 105 GST Return Form for General or Tourism GST regimes.
 *
 * @param transactions List of Transaction records for the GST period
 * @param period GstPeriod configuration
 * @param options Mira105GenerationOptions
 * @returns Mira105GstReturn
 */
export function generateMira105Return(
  transactions: AnyTransaction[],
  period: GstPeriod,
  options?: Mira105GenerationOptions
): Mira105GstReturn {
  // Validation checks
  if (!period) {
    throw new Error('Validation Error: GST period parameters are required');
  }

  if (!period.tin || !period.tin.trim()) {
    throw new Error('Validation Error: Taxpayer TIN is required');
  }

  if (!period.taxpayerName || !period.taxpayerName.trim()) {
    throw new Error('Validation Error: Taxpayer name is required');
  }

  if (!period.periodStart || !period.periodEnd) {
    throw new Error('Validation Error: GST period start and end dates are required');
  }

  const txList = transactions || [];

  // --- Step 1: Output Sales Calculations (Boxes 1 - 4) ---
  let box1_StandardRatedSales = 0;
  let box2_ZeroRatedSales = 0;
  let box3_ExemptSales = 0;
  let box4_OutputGstCollected = 0;

  const salesTxList = txList.filter(
    (tx) => tx.accountingTreatment === 'REVENUE' && (tx.reviewStatus as string) !== 'REJECTED'
  );

  for (const tx of salesTxList) {
    const amount = Math.max(0, Number(tx.amount || 0));
    const gst = Math.max(0, Number(tx.gstAmount || 0));

    if (tx.gstTreatment === 'ZERO_RATED') {
      box2_ZeroRatedSales += amount;
    } else if (tx.gstTreatment === 'EXEMPT' || tx.gstTreatment === 'OUT_OF_SCOPE') {
      box3_ExemptSales += amount;
    } else {
      // Standard Rated
      box1_StandardRatedSales += amount;
      box4_OutputGstCollected += gst;
    }
  }

  const totalOutputSales = box1_StandardRatedSales + box2_ZeroRatedSales + box3_ExemptSales;

  // --- Step 2: Pro-Rata Claimable Ratio Determination ---
  const taxableSales = box1_StandardRatedSales + box2_ZeroRatedSales;
  let proRataClaimableRatio = 1.0;

  if (options?.overrideProRataRatio !== undefined) {
    proRataClaimableRatio = Math.max(0, Math.min(1, options.overrideProRataRatio));
  } else if (totalOutputSales > 0) {
    proRataClaimableRatio = taxableSales / totalOutputSales;
  }

  const entityHasMixed = options?.entityHasMixedSupplies !== undefined
    ? options.entityHasMixedSupplies
    : (box3_ExemptSales > 0 && taxableSales > 0);

  // --- Step 3: Input Purchases Calculations (Boxes 5 - 8 & 10) ---
  let box5_TotalPurchases = 0;
  let box6_TaxablePurchases = 0;
  let box7_GrossInputGstPaid = 0;
  let box8_ClaimableInputGst = 0;

  let box10_CapitalPurchasesAmount = 0;
  let box10_CapitalPurchasesInputGst = 0;

  const purchaseTxList = txList.filter(
    (tx) =>
      (tx.accountingTreatment === 'EXPENSE' ||
        tx.accountingTreatment === 'COST_OF_SALES' ||
        tx.accountingTreatment === 'ASSET') &&
      (tx.reviewStatus as string) !== 'REJECTED'
  );

  for (const tx of purchaseTxList) {
    const amount = Math.max(0, Number(tx.amount || 0));
    const gst = Math.max(0, Number(tx.gstAmount || 0));

    box5_TotalPurchases += amount;
    box7_GrossInputGstPaid += gst;

    const eligibility = classifyGstEligibility(tx, entityHasMixed);

    if (eligibility === 'CLAIMABLE') {
      box6_TaxablePurchases += amount;
      box8_ClaimableInputGst += gst;
    } else if (eligibility === 'PRO_RATA') {
      box6_TaxablePurchases += amount;
      box8_ClaimableInputGst += gst * proRataClaimableRatio;
    }

    // Capital Purchase Tracking (Box 10)
    if (tx.accountingTreatment === 'ASSET') {
      box10_CapitalPurchasesAmount += amount;
      if (eligibility === 'CLAIMABLE') {
        box10_CapitalPurchasesInputGst += gst;
      } else if (eligibility === 'PRO_RATA') {
        box10_CapitalPurchasesInputGst += gst * proRataClaimableRatio;
      }
    }
  }

  // --- Step 4: Summary & Box 9 Calculation ---
  box1_StandardRatedSales = Math.round(box1_StandardRatedSales * 100) / 100;
  box2_ZeroRatedSales = Math.round(box2_ZeroRatedSales * 100) / 100;
  box3_ExemptSales = Math.round(box3_ExemptSales * 100) / 100;
  box4_OutputGstCollected = Math.round(box4_OutputGstCollected * 100) / 100;

  box5_TotalPurchases = Math.round(box5_TotalPurchases * 100) / 100;
  box6_TaxablePurchases = Math.round(box6_TaxablePurchases * 100) / 100;
  box7_GrossInputGstPaid = Math.round(box7_GrossInputGstPaid * 100) / 100;
  box8_ClaimableInputGst = Math.round(box8_ClaimableInputGst * 100) / 100;

  const nonClaimableInputGst = Math.round((box7_GrossInputGstPaid - box8_ClaimableInputGst) * 100) / 100;
  const box9_NetGstPayableOrRefundable = Math.round((box4_OutputGstCollected - box8_ClaimableInputGst) * 100) / 100;

  const outputBox: Mira105OutputSalesBox = {
    box1_StandardRatedSales,
    box2_ZeroRatedSales,
    box3_ExemptSales,
    totalOutputSales: Math.round(totalOutputSales * 100) / 100,
    box4_OutputGstCollected
  };

  const inputBox: Mira105InputPurchasesBox = {
    box5_TotalPurchases,
    box6_TaxablePurchases,
    box7_GrossInputGstPaid,
    box8_ClaimableInputGst,
    nonClaimableInputGst,
    proRataClaimableRatio: Math.round(proRataClaimableRatio * 10000) / 10000,
    proRataAdjustmentAmount: nonClaimableInputGst
  };

  const capitalBox: Mira105CapitalPurchasesBox = {
    box10_CapitalPurchasesAmount: Math.round(box10_CapitalPurchasesAmount * 100) / 100,
    box10_CapitalPurchasesInputGst: Math.round(box10_CapitalPurchasesInputGst * 100) / 100
  };

  const cleanTin = period.tin.replace(/[^A-Z0-9]/gi, '');
  const cleanPeriodId = period.periodId.replace(/[^A-Z0-9-]/gi, '');
  const formId = `MIRA105-${period.taxYear}-${cleanPeriodId}-${cleanTin}`;
  const timestamp = new Date().toISOString();
  const checksum = `MIRA105-CHK-${period.taxYear}-${cleanPeriodId}-${Math.abs(Math.round(box9_NetGstPayableOrRefundable))}`;

  return {
    formId,
    formVersion: 'V25.1',
    submissionStatus: 'READY_FOR_FILING',
    generatedAt: timestamp,
    gstPeriod: period,
    outputSales: outputBox,
    inputPurchases: inputBox,
    box9_NetGstPayableOrRefundable,
    capitalPurchases: capitalBox,
    verificationChecksum: checksum
  };
}

/**
 * Exports MIRA 105 GST Return into formatted JSON required for MIRAconnect online portal submission.
 *
 * @param gstReturn Mira105GstReturn
 * @returns Pretty printed JSON string
 */
export function exportMira105Json(gstReturn: Mira105GstReturn): string {
  return JSON.stringify(gstReturn, null, 2);
}
