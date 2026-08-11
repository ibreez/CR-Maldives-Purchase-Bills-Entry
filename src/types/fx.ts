import { TransactionRecord, Transaction } from './taxEngine';

export type CurrencyCode = 'MVR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'SGD' | string;

export interface ExchangeRateRecord {
  rateId?: string;
  rateDate: string;           // YYYY-MM-DD
  baseCurrency: 'MVR';        // Reporting currency in Maldives
  foreignCurrency: CurrencyCode;
  mmaOfficialRate: number;    // Official MMA rate (e.g. 15.42 for USD)
  bankBuyRate?: number;       // e.g. 15.35
  bankSellRate?: number;      // e.g. 15.42
  source?: string;
}

export type FxClassification = 'REALIZED_GAIN' | 'REALIZED_LOSS' | 'UNREALIZED_GAIN' | 'UNREALIZED_LOSS' | 'NO_GAIN_LOSS';

export interface FxConversionResult {
  originalAmount: number;
  originalCurrency: CurrencyCode;
  mvrAmount: number;
  appliedRate: number;
  rateDate: string;
}

export interface FxGainLossRecord {
  recordId: string;
  transactionId: string;
  sourceId?: string;
  transactionDate: string;
  settlementDate?: string;
  foreignCurrency: CurrencyCode;
  originalForeignAmount: number;
  transactionSpotRate: number;   // Rate on invoice/bill date
  settlementRate: number;        // Rate on payment/settlement date
  transactionMvrAmount: number;
  settlementMvrAmount: number;
  gainLossAmount: number;        // Positive = Gain, Negative = Loss
  classification: FxClassification;
  miraCategory: 'other_income' | 'other_expenses' | 'none';
}

export interface OpenForeignTransactionItem {
  transactionId: string;
  sourceId?: string;
  transactionDate: string;
  accountingTreatment: 'REVENUE' | 'EXPENSE' | 'ASSET' | 'COST_OF_SALES';
  foreignCurrency: CurrencyCode;
  openForeignAmount: number;
  transactionSpotRate: number;
  historicalMvrAmount: number;
  periodEndSpotRate: number;
  revaluedMvrAmount: number;
  unrealizedGainLoss: number;
  classification: FxClassification;
}

export interface UnrealizedFxReport {
  reportDate: string;
  periodEndDate: string;
  totalOpenItemsCount: number;
  items: OpenForeignTransactionItem[];
  totalUnrealizedGain: number;
  totalUnrealizedLoss: number;
  netUnrealizedGainLoss: number; // Positive = Net Gain, Negative = Net Loss
}

export type AnyTransaction = TransactionRecord | Transaction;
