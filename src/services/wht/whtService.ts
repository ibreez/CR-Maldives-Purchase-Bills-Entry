import { TransactionRecord, Transaction } from '../../types/taxEngine';
import {
  WhtPeriod,
  NonResidentPayee,
  NonResidentPaymentCategory,
  WhtScheduleItem,
  Mira302WhtReturn,
  AnyTransaction
} from '../../types/mira302';

/**
 * Standard statutory WHT rate in Maldives Income Tax Act is 10% (0.10) for non-resident payments.
 */
export const STANDARD_MIRA_WHT_RATE = 0.10;

/**
 * Classifies transaction into Non-Resident WHT Payment Category.
 *
 * @param transaction AnyTransaction
 * @returns NonResidentPaymentCategory
 */
export function classifyWhtCategory(transaction: AnyTransaction): NonResidentPaymentCategory {
  const category = (transaction.accountingCategory || '').toLowerCase();
  const desc = (transaction.description || '').toLowerCase();

  if (
    category.includes('software') ||
    category.includes('royalty') ||
    category.includes('license') ||
    desc.includes('aws') ||
    desc.includes('adobe') ||
    desc.includes('software') ||
    desc.includes('cloud') ||
    desc.includes('subscription') ||
    desc.includes('license')
  ) {
    return 'ROYALTY_SOFTWARE';
  }

  if (
    category.includes('technical') ||
    category.includes('management') ||
    desc.includes('management fee') ||
    desc.includes('technical service')
  ) {
    return 'TECHNICAL_MANAGEMENT';
  }

  if (
    category.includes('consultancy') ||
    category.includes('consulting') ||
    category.includes('professional') ||
    desc.includes('consultant') ||
    desc.includes('advisory')
  ) {
    return 'CONSULTANCY';
  }

  if (category.includes('rent') || desc.includes('lease') || desc.includes('rental')) {
    return 'RENT_PROPERTY';
  }

  if (category.includes('insurance') || desc.includes('premium') || desc.includes('underwriting')) {
    return 'INSURANCE_PREMIUM';
  }

  return 'OTHER_NON_RESIDENT';
}

export interface WhtCalculationOptions {
  isGrossedUp?: boolean;          // True if agreed payment terms are net-of-tax
  overrideCategory?: NonResidentPaymentCategory;
  overridePayee?: NonResidentPayee;
}

/**
 * Calculates WHT liability and gross payment amounts for a non-resident transaction.
 *
 * @param transaction AnyTransaction
 * @param payee NonResidentPayee (optional)
 * @param options WhtCalculationOptions (optional)
 */
export function calculateTransactionWht(
  transaction: AnyTransaction,
  payee?: NonResidentPayee,
  options?: WhtCalculationOptions
): WhtScheduleItem {
  const contractedAmount = Math.max(0, Number(transaction.amount || 0));
  const category = options?.overrideCategory || classifyWhtCategory(transaction);

  // Determine WHT rate
  let whtRateDecimal = STANDARD_MIRA_WHT_RATE;
  let dtaaReliefApplied = false;
  let dtaaCertificateRef: string | undefined;

  const activePayee = options?.overridePayee || payee;

  if (
    activePayee &&
    activePayee.isDtaaReliefEligible &&
    activePayee.dtaaTreatyRate !== undefined &&
    activePayee.dtaaTreatyRate >= 0
  ) {
    whtRateDecimal = activePayee.dtaaTreatyRate;
    dtaaReliefApplied = true;
    dtaaCertificateRef = activePayee.dtaaCertificateReference || 'DTAA-RELIEF-CERT';
  }

  const isGrossedUp = options?.isGrossedUp ?? (transaction as unknown as { isNetOfTax?: boolean })?.isNetOfTax ?? false;

  let grossPaymentAmount = contractedAmount;
  let whtAmountWithheld = 0;

  if (isGrossedUp && whtRateDecimal < 1.0) {
    // Gross-up formula: Gross = Contracted Net / (1 - WHT Rate)
    grossPaymentAmount = contractedAmount / (1 - whtRateDecimal);
    whtAmountWithheld = grossPaymentAmount * whtRateDecimal;
  } else {
    whtAmountWithheld = contractedAmount * whtRateDecimal;
  }

  const netAmountPaidToVendor = grossPaymentAmount - whtAmountWithheld;

  const payeeName = activePayee?.payeeName || (transaction as unknown as { vendorName?: string })?.vendorName || 'Foreign Non-Resident Vendor';
  const countryCode = activePayee?.countryCode || 'US';
  const foreignAddress = activePayee?.foreignAddress || 'International Address';

  return {
    transactionId: transaction.transactionId || `TX-WHT-${Date.now()}`,
    transactionDate: transaction.transactionDate || new Date().toISOString().split('T')[0],
    payeeName,
    countryCode,
    foreignAddress,
    paymentCategory: category,
    description: transaction.description || 'Non-resident service payment',
    contractedAmount: Math.round(contractedAmount * 100) / 100,
    isGrossedUp,
    grossPaymentAmount: Math.round(grossPaymentAmount * 100) / 100,
    whtRatePercentage: Math.round(whtRateDecimal * 100 * 100) / 100, // e.g. 10 or 5 or 0
    whtAmountWithheld: Math.round(whtAmountWithheld * 100) / 100,
    netAmountPaidToVendor: Math.round(netAmountPaidToVendor * 100) / 100,
    dtaaReliefApplied,
    dtaaCertificateRef
  };
}

export interface Mira302GenerationOptions {
  payees?: Record<string, NonResidentPayee> | NonResidentPayee[];
  globalGrossUp?: boolean;
}

/**
 * Generates official MIRA 302 Non-Resident Withholding Tax Return Form.
 *
 * @param transactions List of non-resident transactions
 * @param period WhtPeriod configuration
 * @param options Mira302GenerationOptions
 * @returns Mira302WhtReturn
 */
export function generateMira302Return(
  transactions: AnyTransaction[],
  period: WhtPeriod,
  options?: Mira302GenerationOptions
): Mira302WhtReturn {
  // Parameter validation
  if (!period) {
    throw new Error('Validation Error: WHT period parameters are required');
  }

  if (!period.tin || !period.tin.trim()) {
    throw new Error('Validation Error: Taxpayer TIN is required');
  }

  if (!period.taxpayerName || !period.taxpayerName.trim()) {
    throw new Error('Validation Error: Taxpayer name is required');
  }

  if (!period.periodStart || !period.periodEnd) {
    throw new Error('Validation Error: WHT period start and end dates are required');
  }

  const txList = (transactions || []).filter(
    (tx) => (tx.reviewStatus as string) !== 'REJECTED'
  );

  // Convert payees option to lookup map
  const payeeMap: Record<string, NonResidentPayee> = {};
  if (Array.isArray(options?.payees)) {
    for (const p of options.payees) {
      payeeMap[p.payeeId] = p;
      payeeMap[p.payeeName.toLowerCase()] = p;
    }
  } else if (options?.payees) {
    Object.assign(payeeMap, options.payees);
  }

  const scheduleOfPayments: WhtScheduleItem[] = [];
  let totalGrossPayments = 0;
  let totalWhtWithheld = 0;
  let totalNetPayments = 0;

  for (const tx of txList) {
    const txVendor = (tx as unknown as { vendorName?: string })?.vendorName || '';
    const matchedPayee = payeeMap[txVendor.toLowerCase()] || payeeMap[tx.entityId];

    const isGrossedUp = options?.globalGrossUp !== undefined
      ? options.globalGrossUp
      : ((tx as unknown as { isNetOfTax?: boolean })?.isNetOfTax || false);

    const scheduleItem = calculateTransactionWht(tx, matchedPayee, { isGrossedUp });

    scheduleOfPayments.push(scheduleItem);

    totalGrossPayments += scheduleItem.grossPaymentAmount;
    totalWhtWithheld += scheduleItem.whtAmountWithheld;
    totalNetPayments += scheduleItem.netAmountPaidToVendor;
  }

  totalGrossPayments = Math.round(totalGrossPayments * 100) / 100;
  totalWhtWithheld = Math.round(totalWhtWithheld * 100) / 100;
  totalNetPayments = Math.round(totalNetPayments * 100) / 100;

  const cleanTin = period.tin.replace(/[^A-Z0-9]/gi, '');
  const cleanPeriodId = period.periodId.replace(/[^A-Z0-9-]/gi, '');
  const formId = `MIRA302-${period.taxYear}-${cleanPeriodId}-${cleanTin}`;
  const timestamp = new Date().toISOString();
  const checksum = `MIRA302-CHK-${period.taxYear}-${cleanPeriodId}-${Math.abs(Math.round(totalWhtWithheld))}`;

  return {
    formId,
    formVersion: 'V25.1',
    submissionStatus: 'READY_FOR_FILING',
    generatedAt: timestamp,
    whtPeriod: period,
    scheduleOfPayments,
    totalGrossPayments,
    totalWhtWithheld,
    totalNetPayments,
    itemCount: scheduleOfPayments.length,
    verificationChecksum: checksum
  };
}

/**
 * Exports MIRA 302 WHT Return into formatted JSON required for MIRAconnect online portal submission.
 *
 * @param whtReturn Mira302WhtReturn
 * @returns Pretty printed JSON string
 */
export function exportMira302Json(whtReturn: Mira302WhtReturn): string {
  return JSON.stringify(whtReturn, null, 2);
}
