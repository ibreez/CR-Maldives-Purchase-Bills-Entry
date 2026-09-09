import { TransactionRecord, Transaction } from './taxEngine';

export type CurrencyCode = 'MVR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'SGD' | 'INR' | 'LKR' | 'JPY' | 'CNY' | 'AUD' | 'CAD' | string;

export type FxRateStatus = 'APPROVED' | 'PENDING_APPROVAL' | 'REVIEW_REQUIRED';

export type FxClassification =
  | 'REALIZED_GAIN'
  | 'REALIZED_LOSS'
  | 'UNREALIZED_GAIN'
  | 'UNREALIZED_LOSS'
  | 'NO_GAIN_LOSS';

/**
 * Authoritative FX Rate record as specified in Phase 32.
 */
export interface FXRate {
  id: string;
  currency: CurrencyCode;
  date: string;               // YYYY-MM-DD
  rate: number;               // Spot exchange rate against MVR (e.g. 15.42 for USD)
  source: string;             // e.g. 'MMA', 'BML', 'MANUAL', 'CUSTOM', 'CENTRAL_BANK'
  retrievedAt: string;        // ISO datetime string
  approved: boolean;          // Whether rate is verified and approved for accounting
  status: FxRateStatus;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
}

export interface CreateFXRateInput {
  currency: CurrencyCode;
  date: string;               // YYYY-MM-DD
  rate: number;
  source?: string;
  retrievedAt?: string;
  approved?: boolean;
  status?: FxRateStatus;
  approvedBy?: string;
  notes?: string;
}

/**
 * Authoritative Foreign Currency Transaction snapshot.
 * Stores all required fields with historical rate lock.
 */
export interface ForeignCurrencyTransaction {
  transactionId: string;
  tenantId?: string;
  sourceId?: string;
  transactionDate: string;     // YYYY-MM-DD
  transactionCurrency: CurrencyCode;
  functionalCurrency: string;  // Always 'MVR' in Maldives compliance
  sourceAmount: number;        // Nominal foreign currency amount
  fxRate: number;              // Historical spot FX rate locked at recognition
  rateDate: string;            // Date of the FX rate used
  rateSource: string;          // Source of the FX rate (e.g. 'MMA')
  MVRAmount: number;           // Converted amount (sourceAmount * fxRate)
  isHistoricalLocked: boolean; // INVARIANT: Never recalculate historical transactions using current FX rates
  accountingTreatment?: 'REVENUE' | 'EXPENSE' | 'ASSET' | 'COST_OF_SALES' | 'LIABILITY';
  description?: string;
  reviewStatus?: 'APPROVED' | 'REVIEW_REQUIRED';
  reviewReason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Invoice Recognition input parameters.
 */
export interface InvoiceRecognitionInput {
  tenantId?: string;
  invoiceId: string;
  invoiceNumber?: string;
  invoiceDate: string;         // YYYY-MM-DD
  currency: CurrencyCode;
  sourceAmount: number;
  accountingTreatment?: 'REVENUE' | 'EXPENSE' | 'ASSET' | 'COST_OF_SALES' | 'LIABILITY';
  customRate?: number;
  rateSource?: string;
  description?: string;
  allowUnapprovedRate?: boolean;
}

/**
 * Invoice Recognition output result.
 */
export interface InvoiceRecognitionResult {
  transaction: ForeignCurrencyTransaction;
  status: 'APPROVED' | 'REVIEW_REQUIRED';
  reviewReason?: string;
  journalEntry?: FxJournalEntry;
  ruleId: string;
  legalReference: string;
}

/**
 * Settlement input parameters.
 */
export interface SettlementInput {
  tenantId?: string;
  settlementId: string;
  settlementDate: string;      // YYYY-MM-DD
  originalTransaction: ForeignCurrencyTransaction | InvoiceRecognitionInput | AnyTransaction;
  settlementAmount: number;    // Foreign nominal amount being settled
  settlementCurrency?: CurrencyCode;
  settlementFxRate?: number;
  rateSource?: string;
  approvedBy?: string;
  allowUnapprovedRate?: boolean;
}

/**
 * Realised FX Gain/Loss calculation result.
 */
export interface RealisedFxResult {
  settlementId: string;
  originalTransactionId: string;
  settlementDate: string;
  foreignCurrency: CurrencyCode;
  settlementForeignAmount: number;
  originalTransactionSpotRate: number;
  settlementFxRate: number;
  originalMvrAmount: number;
  settlementMvrAmount: number;
  realisedGainLoss: number;     // Positive = Realised Gain, Negative = Realised Loss
  classification: 'REALIZED_GAIN' | 'REALIZED_LOSS' | 'NO_GAIN_LOSS';
  miraCategory: 'other_income' | 'other_expenses' | 'none';
  miraField?: string;
  journalEntry?: FxJournalEntry;
  status: 'APPROVED' | 'REVIEW_REQUIRED';
  reviewReason?: string;
  ruleId: string;
  legalReference: string;
}

/**
 * Period-End Revaluation parameters.
 */
export interface PeriodEndRevaluationParams {
  tenantId?: string;
  periodEndDate: string;       // YYYY-MM-DD
  openMonetaryItems: Array<{
    transactionId: string;
    sourceId?: string;
    description?: string;
    accountingTreatment: 'REVENUE' | 'EXPENSE' | 'ASSET' | 'COST_OF_SALES' | 'LIABILITY';
    foreignCurrency: CurrencyCode;
    openForeignAmount: number;
    historicalSpotRate: number;
    historicalMvrAmount: number;
    rateDate?: string;
  }>;
  closingRates?: Record<CurrencyCode, number>;
  rateSource?: string;
  allowUnapprovedRate?: boolean;
}

export interface RevaluationItem {
  transactionId: string;
  sourceId?: string;
  description?: string;
  accountingTreatment: 'REVENUE' | 'EXPENSE' | 'ASSET' | 'COST_OF_SALES' | 'LIABILITY';
  foreignCurrency: CurrencyCode;
  openForeignAmount: number;
  historicalSpotRate: number;
  historicalMvrAmount: number;
  periodEndClosingRate: number;
  revaluedMvrAmount: number;
  unrealisedGainLoss: number;
  classification: 'UNREALIZED_GAIN' | 'UNREALIZED_LOSS' | 'NO_GAIN_LOSS';
  status: 'APPROVED' | 'REVIEW_REQUIRED';
  reviewReason?: string;
}

export interface PeriodEndRevaluationResult {
  revaluationId: string;
  tenantId?: string;
  periodEndDate: string;
  items: RevaluationItem[];
  totalOpenItemsCount: number;
  totalUnrealisedGain: number;
  totalUnrealisedLoss: number;
  netUnrealisedGainLoss: number;
  hasReviewRequiredItems: boolean;
  journalEntry?: FxJournalEntry;
  miraTaxAdjustment?: {
    addbackAmount: number;     // MIRA C07 unrealised loss (not deductible until realised)
    deductionAmount: number;   // MIRA C09 unrealised gain (not taxable until realised)
  };
  ruleId: string;
  legalReference: string;
}

/**
 * Reversal of Previous Period Revaluation parameters.
 */
export interface RevaluationReversalParams {
  revaluationResult: PeriodEndRevaluationResult;
  reversalDate: string;        // e.g. Day 1 of subsequent period (YYYY-MM-DD)
  reversalReference?: string;
  tenantId?: string;
}

export interface RevaluationReversalResult {
  reversalId: string;
  originalRevaluationId: string;
  reversalDate: string;
  reversedTotalUnrealisedGain: number;
  reversedTotalUnrealisedLoss: number;
  reversedNetUnrealisedGainLoss: number;
  reversalJournalEntry: FxJournalEntry;
}

export interface FxJournalLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description?: string;
}

export interface FxJournalEntry {
  reference: string;
  entryDate: string;
  description: string;
  lines: FxJournalLine[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}

export interface FxRateResolutionResult {
  currency: CurrencyCode;
  date: string;
  rate: number | null;
  rateSource: string;
  isApproved: boolean;
  status: FxRateStatus;
  reviewRequired: boolean;
  reviewReason?: string;
  rateRecord?: FXRate;
}

// -----------------------------------------------------------------------------
// LEGACY COMPATIBILITY TYPES
// -----------------------------------------------------------------------------

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
  unrealisedGainLoss?: number;
  classification: FxClassification;
}

export interface UnrealizedFxReport {
  reportDate: string;
  periodEndDate: string;
  totalOpenItemsCount: number;
  items: OpenForeignTransactionItem[];
  totalUnrealizedGain: number;
  totalUnrealizedLoss: number;
  netUnrealizedGainLoss: number;
}

export type AnyTransaction = TransactionRecord | Transaction;

