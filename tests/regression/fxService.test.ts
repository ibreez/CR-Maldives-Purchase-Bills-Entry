import { describe, test, expect } from 'vitest';
import {
  convertAmountToMvr,
  calculateRealizedFxGainLoss,
  calculateUnrealizedFxGainLoss,
  getExchangeRate,
  DEFAULT_MMA_RATES
} from '../../src/services/fx/fxService';
import { ExchangeRateRecord } from '../../src/types/fx';
import { TransactionRecord } from '../../src/types/taxEngine';

describe('Phase 11 - Multi-Currency and Foreign Exchange (FX) Engine Tests', () => {

  const customRateTable: ExchangeRateRecord[] = [
    { rateDate: '2026-01-10', foreignCurrency: 'USD', baseCurrency: 'MVR', mmaOfficialRate: 15.42 },
    { rateDate: '2026-01-10', foreignCurrency: 'EUR', baseCurrency: 'MVR', mmaOfficialRate: 16.80 },
    { rateDate: '2026-01-10', foreignCurrency: 'GBP', baseCurrency: 'MVR', mmaOfficialRate: 19.50 },
    { rateDate: '2026-02-15', foreignCurrency: 'USD', baseCurrency: 'MVR', mmaOfficialRate: 15.80 }, // USD appreciated
    { rateDate: '2026-03-01', foreignCurrency: 'USD', baseCurrency: 'MVR', mmaOfficialRate: 15.10 }, // USD depreciated
    { rateDate: '2026-12-31', foreignCurrency: 'USD', baseCurrency: 'MVR', mmaOfficialRate: 16.00 }, // Year-end rate
  ];

  const sampleUsdBill: TransactionRecord = {
    transactionId: 'TX-USD-BILL-001',
    sourceType: 'bill',
    sourceId: 'INV-USD-100',
    entityId: 'COMPANY-001',
    outletId: 'OUTLET-001',
    transactionDate: '2026-01-10',
    description: 'Foreign IT Server Hosting Fee',
    accountingCategory: 'operating.hosting',
    miraCategory: 'other_expenses',
    amount: 1000, // $1,000 USD
    gstAmount: 0,
    totalAmount: 1000,
    accountingTreatment: 'EXPENSE',
    incomeTaxTreatment: 'DEDUCTIBLE',
    gstTreatment: 'NO_INPUT_TAX',
    taxYear: 2026,
    accountingPeriodStart: '2026-01-01',
    accountingPeriodEnd: '2026-12-31',
    reviewStatus: 'APPROVED',
    auditHistory: [],
    createdAt: '2026-01-10T10:00:00Z'
  };

  test('Requirement 1: Currency conversion converts foreign amounts (USD, EUR, GBP, SGD, AED) to MVR accurately', () => {
    // Standard USD conversion at 15.42
    const usdConv = convertAmountToMvr(100, 'USD', '2026-01-10', customRateTable);
    expect(usdConv.mvrAmount).toBe(1542); // $100 * 15.42
    expect(usdConv.appliedRate).toBe(15.42);

    // EUR conversion at 16.80
    const eurConv = convertAmountToMvr(100, 'EUR', '2026-01-10', customRateTable);
    expect(eurConv.mvrAmount).toBe(1680); // €100 * 16.80

    // Default rate lookup fallback
    const gbpConv = convertAmountToMvr(100, 'GBP', '2026-01-01');
    expect(gbpConv.mvrAmount).toBe(1950); // £100 * 19.50 (default MMA rate)

    // Local MVR conversion (1:1)
    const mvrConv = convertAmountToMvr(500, 'MVR', '2026-01-10');
    expect(mvrConv.mvrAmount).toBe(500);
    expect(mvrConv.appliedRate).toBe(1.0);
  });

  test('Requirement 2: Realized FX Losses compute accurately upon bill settlement when rate increases', () => {
    // Bill recorded on 2026-01-10 at USD spot rate 15.42 -> MVR 15,420
    // Payment settled on 2026-02-15 at USD spot rate 15.80 -> MVR 15,800
    // Realized FX Loss = MVR 15,420 - 15,800 = -380 (Paid MVR 380 more)

    const billTx = { ...sampleUsdBill, currency: 'USD', exchangeRate: 15.42 };
    const paymentTx: TransactionRecord = {
      ...sampleUsdBill,
      transactionId: 'TX-PAYMENT-001',
      transactionDate: '2026-02-15',
      currency: 'USD',
      exchangeRate: 15.80
    } as TransactionRecord;

    const fxRecord = calculateRealizedFxGainLoss(billTx, paymentTx, customRateTable);

    expect(fxRecord.transactionSpotRate).toBe(15.42);
    expect(fxRecord.settlementRate).toBe(15.80);
    expect(fxRecord.transactionMvrAmount).toBe(15420);
    expect(fxRecord.settlementMvrAmount).toBe(15800);
    expect(fxRecord.gainLossAmount).toBe(-380); // MVR -380 (Loss)
    expect(fxRecord.classification).toBe('REALIZED_LOSS');
    expect(fxRecord.miraCategory).toBe('other_expenses');
  });

  test('Requirement 3: Realized FX Gains compute accurately upon bill settlement when rate decreases', () => {
    // Bill recorded on 2026-01-10 at USD spot rate 15.42 -> MVR 15,420
    // Payment settled on 2026-03-01 at USD spot rate 15.10 -> MVR 15,100
    // Realized FX Gain = MVR 15,420 - 15,100 = +320 (Paid MVR 320 less)

    const billTx = { ...sampleUsdBill, currency: 'USD', exchangeRate: 15.42 };
    const paymentTx: TransactionRecord = {
      ...sampleUsdBill,
      transactionId: 'TX-PAYMENT-002',
      transactionDate: '2026-03-01',
      currency: 'USD',
      exchangeRate: 15.10
    } as TransactionRecord;

    const fxRecord = calculateRealizedFxGainLoss(billTx, paymentTx, customRateTable);

    expect(fxRecord.gainLossAmount).toBe(320); // MVR +320 (Gain)
    expect(fxRecord.classification).toBe('REALIZED_GAIN');
    expect(fxRecord.miraCategory).toBe('other_income');
  });

  test('Requirement 4: Period-end unrealized FX revaluation computes unrealized gains and losses on open items', () => {
    // Open Payable 1: $1,000 USD recorded at 15.42 (MVR 15,420). Year-end rate 16.00 (MVR 16,000) -> Loss MVR -580
    // Open Receivable 2: $2,000 USD revenue invoice recorded at 15.42 (MVR 30,840). Year-end rate 16.00 (MVR 32,000) -> Gain MVR +1,160

    const openPayable = { ...sampleUsdBill, currency: 'USD', exchangeRate: 15.42 };
    const openReceivable: TransactionRecord = {
      ...sampleUsdBill,
      transactionId: 'TX-USD-REV-001',
      accountingTreatment: 'REVENUE',
      amount: 2000,
      currency: 'USD',
      exchangeRate: 15.42
    } as TransactionRecord;

    const report = calculateUnrealizedFxGainLoss([openPayable, openReceivable], '2026-12-31', customRateTable);

    expect(report.totalOpenItemsCount).toBe(2);

    // Item 1 (Payable): Revalued at 16.00 -> MVR 16,000 vs 15,420 = -580 (Unrealized Loss)
    expect(report.items[0].unrealizedGainLoss).toBe(-580);
    expect(report.items[0].classification).toBe('UNREALIZED_LOSS');

    // Item 2 (Receivable): Revalued at 16.00 -> MVR 32,000 vs 30,840 = +1160 (Unrealized Gain)
    expect(report.items[1].unrealizedGainLoss).toBe(1160);
    expect(report.items[1].classification).toBe('UNREALIZED_GAIN');

    // Net Unrealized FX = Gain 1,160 - Loss 580 = Net Gain MVR +580
    expect(report.totalUnrealizedGain).toBe(1160);
    expect(report.totalUnrealizedLoss).toBe(580);
    expect(report.netUnrealizedGainLoss).toBe(580);
  });

});
