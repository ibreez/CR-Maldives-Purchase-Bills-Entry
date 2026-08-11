import {
  CurrencyCode,
  ExchangeRateRecord,
  FxConversionResult,
  FxGainLossRecord,
  UnrealizedFxReport,
  OpenForeignTransactionItem,
  AnyTransaction,
  FxClassification
} from '../../types/fx';

/**
 * Standard MMA (Maldives Monetary Authority) reference exchange rates to MVR.
 */
export const DEFAULT_MMA_RATES: Record<string, number> = {
  MVR: 1.0,
  USD: 15.42,
  EUR: 16.80,
  GBP: 19.50,
  AED: 4.20,
  SGD: 11.50
};

// In-memory exchange rate store
const exchangeRateRegistry: Map<string, ExchangeRateRecord> = new Map();

/**
 * Registers an official exchange rate record for a specific date and currency.
 */
export function registerExchangeRate(rate: ExchangeRateRecord): void {
  const key = `${rate.rateDate}_${rate.foreignCurrency.toUpperCase()}`;
  exchangeRateRegistry.set(key, rate);
}

/**
 * Retrieves official MMA exchange rate for currency on given date.
 */
export function getExchangeRate(currency: CurrencyCode, date: string, customRateTable?: ExchangeRateRecord[]): number {
  const code = (currency || 'MVR').toUpperCase();
  if (code === 'MVR') return 1.0;

  // 1. Check custom rate table
  if (customRateTable && customRateTable.length > 0) {
    const match = customRateTable.find(
      (r) => r.rateDate === date && r.foreignCurrency.toUpperCase() === code
    );
    if (match && match.mmaOfficialRate > 0) {
      return match.mmaOfficialRate;
    }
  }

  // 2. Check in-memory registry
  const key = `${date}_${code}`;
  if (exchangeRateRegistry.has(key)) {
    return exchangeRateRegistry.get(key)!.mmaOfficialRate;
  }

  // 3. Fallback to default MMA reference rate
  return DEFAULT_MMA_RATES[code] || 15.42;
}

/**
 * Converts foreign currency amount to MVR using MMA daily official rate.
 */
export function convertAmountToMvr(
  amount: number,
  currency: CurrencyCode,
  transactionDate: string,
  customRateTable?: ExchangeRateRecord[]
): FxConversionResult {
  const code = (currency || 'MVR').toUpperCase();
  const rate = getExchangeRate(code, transactionDate, customRateTable);
  const mvrAmount = Math.round(Number(amount || 0) * rate * 100) / 100;

  return {
    originalAmount: Number(amount || 0),
    originalCurrency: code,
    mvrAmount,
    appliedRate: rate,
    rateDate: transactionDate
  };
}

/**
 * Calculates realized FX Gain or Loss upon payment settlement of a bill or invoice.
 */
export function calculateRealizedFxGainLoss(
  billTransaction: AnyTransaction,
  paymentTransaction: AnyTransaction,
  customRateTable?: ExchangeRateRecord[]
): FxGainLossRecord {
  const foreignCurrency = (billTransaction as unknown as { currency?: string })?.currency || 'USD';
  const originalForeignAmount = Math.max(0, Number(billTransaction.amount || 0));

  const txDate = billTransaction.transactionDate || '2026-01-01';
  const settlementDate = paymentTransaction.transactionDate || txDate;

  // Get spot rates
  const txSpotRate = (billTransaction as unknown as { exchangeRate?: number })?.exchangeRate ||
    getExchangeRate(foreignCurrency, txDate, customRateTable);

  const settlementRate = (paymentTransaction as unknown as { exchangeRate?: number })?.exchangeRate ||
    getExchangeRate(foreignCurrency, settlementDate, customRateTable);

  const transactionMvrAmount = Math.round(originalForeignAmount * txSpotRate * 100) / 100;
  const settlementMvrAmount = Math.round(originalForeignAmount * settlementRate * 100) / 100;

  const isExpenseType =
    billTransaction.accountingTreatment === 'EXPENSE' ||
    billTransaction.accountingTreatment === 'COST_OF_SALES' ||
    billTransaction.accountingTreatment === 'ASSET';

  let gainLossAmount = 0;
  let classification: FxClassification = 'NO_GAIN_LOSS';
  let miraCategory: 'other_income' | 'other_expenses' | 'none' = 'none';

  if (isExpenseType) {
    // For bills/expenses (Payables):
    // If Settlement MVR < Bill MVR: Paid less MVR -> Realized GAIN
    // If Settlement MVR > Bill MVR: Paid more MVR -> Realized LOSS
    gainLossAmount = transactionMvrAmount - settlementMvrAmount;
  } else {
    // For revenue/invoices (Receivables):
    // If Settlement MVR > Invoice MVR: Received more MVR -> Realized GAIN
    // If Settlement MVR < Invoice MVR: Received less MVR -> Realized LOSS
    gainLossAmount = settlementMvrAmount - transactionMvrAmount;
  }

  gainLossAmount = Math.round(gainLossAmount * 100) / 100;

  if (gainLossAmount > 0) {
    classification = 'REALIZED_GAIN';
    miraCategory = 'other_income';
  } else if (gainLossAmount < 0) {
    classification = 'REALIZED_LOSS';
    miraCategory = 'other_expenses';
  }

  const recordId = `FX-REALIZED-${billTransaction.transactionId || Date.now()}`;

  return {
    recordId,
    transactionId: billTransaction.transactionId || '',
    sourceId: (billTransaction as unknown as { sourceId?: string })?.sourceId,
    transactionDate: txDate,
    settlementDate,
    foreignCurrency,
    originalForeignAmount,
    transactionSpotRate: txSpotRate,
    settlementRate,
    transactionMvrAmount,
    settlementMvrAmount,
    gainLossAmount,
    classification,
    miraCategory
  };
}

/**
 * Calculates unrealized FX gain/loss on open foreign currency items at period-end.
 */
export function calculateUnrealizedFxGainLoss(
  openTransactions: AnyTransaction[],
  periodEndDate: string,
  customRateTable?: ExchangeRateRecord[]
): UnrealizedFxReport {
  const items: OpenForeignTransactionItem[] = [];
  let totalUnrealizedGain = 0;
  let totalUnrealizedLoss = 0;

  for (const tx of openTransactions) {
    const foreignCurrency = (tx as unknown as { currency?: string })?.currency || 'USD';
    if (foreignCurrency.toUpperCase() === 'MVR') continue;

    const openForeignAmount = Math.max(0, Number(tx.amount || 0));
    const txDate = tx.transactionDate || periodEndDate;

    const txSpotRate = (tx as unknown as { exchangeRate?: number })?.exchangeRate ||
      getExchangeRate(foreignCurrency, txDate, customRateTable);

    const periodEndSpotRate = getExchangeRate(foreignCurrency, periodEndDate, customRateTable);

    const historicalMvrAmount = Math.round(openForeignAmount * txSpotRate * 100) / 100;
    const revaluedMvrAmount = Math.round(openForeignAmount * periodEndSpotRate * 100) / 100;

    const isExpenseType =
      tx.accountingTreatment === 'EXPENSE' ||
      tx.accountingTreatment === 'COST_OF_SALES' ||
      tx.accountingTreatment === 'ASSET';

    let diff = 0;
    if (isExpenseType) {
      // Payables: Lower revalued MVR = Unrealized Gain
      diff = historicalMvrAmount - revaluedMvrAmount;
    } else {
      // Receivables: Higher revalued MVR = Unrealized Gain
      diff = revaluedMvrAmount - historicalMvrAmount;
    }

    diff = Math.round(diff * 100) / 100;

    let classification: FxClassification = 'NO_GAIN_LOSS';
    if (diff > 0) {
      classification = 'UNREALIZED_GAIN';
      totalUnrealizedGain += diff;
    } else if (diff < 0) {
      classification = 'UNREALIZED_LOSS';
      totalUnrealizedLoss += Math.abs(diff);
    }

    items.push({
      transactionId: tx.transactionId || '',
      sourceId: (tx as unknown as { sourceId?: string })?.sourceId,
      transactionDate: txDate,
      accountingTreatment: tx.accountingTreatment as 'REVENUE' | 'EXPENSE' | 'ASSET' | 'COST_OF_SALES',
      foreignCurrency,
      openForeignAmount,
      transactionSpotRate: txSpotRate,
      historicalMvrAmount,
      periodEndSpotRate,
      revaluedMvrAmount,
      unrealizedGainLoss: diff,
      classification
    });
  }

  totalUnrealizedGain = Math.round(totalUnrealizedGain * 100) / 100;
  totalUnrealizedLoss = Math.round(totalUnrealizedLoss * 100) / 100;
  const netUnrealizedGainLoss = Math.round((totalUnrealizedGain - totalUnrealizedLoss) * 100) / 100;

  return {
    reportDate: new Date().toISOString(),
    periodEndDate,
    totalOpenItemsCount: items.length,
    items,
    totalUnrealizedGain,
    totalUnrealizedLoss,
    netUnrealizedGainLoss
  };
}
