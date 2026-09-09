import { describe, it, expect, beforeEach } from 'vitest';
import {
  ForeignExchangeEngine,
  defaultForeignExchangeEngine,
  STANDARD_FX_ACCOUNTS,
  DEFAULT_MMA_RATES
} from '../../src/services/fx/foreignExchangeEngine';
import { defaultRuleResolver } from '../../src/regulatory/resolvers/ruleResolver';
import {
  FXRate,
  InvoiceRecognitionInput,
  SettlementInput,
  PeriodEndRevaluationParams
} from '../../src/types/fx';

describe('Phase 32 — Foreign Exchange Engine & Accounting', () => {
  let engine: ForeignExchangeEngine;

  beforeEach(() => {
    engine = new ForeignExchangeEngine(defaultRuleResolver);
    engine.resetStore();
  });

  describe('1. FX Rate Table Management & Missing Rate Invariant', () => {
    it('seeds default MMA official reference rates', () => {
      const usdRate = engine.getFxRate('USD', '2026-01-01');
      expect(usdRate.rate).toBe(15.42);
      expect(usdRate.isApproved).toBe(true);
      expect(usdRate.status).toBe('APPROVED');
      expect(usdRate.reviewRequired).toBe(false);
    });

    it('returns 1.0 for domestic currency (MVR) without lookup friction', () => {
      const mvrRate = engine.getFxRate('MVR', '2026-03-15');
      expect(mvrRate.rate).toBe(1.0);
      expect(mvrRate.currency).toBe('MVR');
      expect(mvrRate.isApproved).toBe(true);
      expect(mvrRate.status).toBe('APPROVED');
      expect(mvrRate.reviewRequired).toBe(false);
    });

    it('allows registering and approving custom exchange rates', () => {
      const newRate = engine.upsertFxRate({
        currency: 'EUR',
        date: '2026-04-01',
        rate: 16.95,
        source: 'BML',
        approved: false,
        status: 'PENDING_APPROVAL'
      });

      expect(newRate.status).toBe('PENDING_APPROVAL');

      // Attempting to resolve without allowUnapproved flags review required
      const resolvedBefore = engine.getFxRate('EUR', '2026-04-01');
      expect(resolvedBefore.reviewRequired).toBe(true);
      expect(resolvedBefore.status).toBe('REVIEW_REQUIRED');

      // Approve rate
      const approved = engine.approveFxRate('EUR', '2026-04-01', 'CFO_USER');
      expect(approved.approved).toBe(true);
      expect(approved.status).toBe('APPROVED');

      // Now resolves as approved
      const resolvedAfter = engine.getFxRate('EUR', '2026-04-01');
      expect(resolvedAfter.reviewRequired).toBe(false);
      expect(resolvedAfter.rate).toBe(16.95);
      expect(resolvedAfter.isApproved).toBe(true);
    });

    it('INVARIANT: Missing rate results in REVIEW_REQUIRED rather than an invented rate', () => {
      // Currency with no MMA benchmark or custom rate (e.g. ZAR - South African Rand)
      const missingRes = engine.getFxRate('ZAR', '2026-05-10');
      expect(missingRes.rate).toBeNull();
      expect(missingRes.status).toBe('REVIEW_REQUIRED');
      expect(missingRes.reviewRequired).toBe(true);
      expect(missingRes.reviewReason).toContain('Missing exchange rate for foreign currency ZAR');
    });
  });

  describe('2. Invoice Recognition & Historical Rate Locking', () => {
    it('recognizes a foreign USD invoice with historical rate lock', () => {
      const recognitionInput: InvoiceRecognitionInput = {
        invoiceId: 'INV-2026-USD-001',
        invoiceNumber: 'US-INV-9921',
        invoiceDate: '2026-02-15',
        currency: 'USD',
        sourceAmount: 10000,
        accountingTreatment: 'EXPENSE',
        customRate: 15.42,
        description: 'Cloud Server Infrastructure Subscription'
      };

      const result = engine.recognizeForeignTransaction(recognitionInput);

      expect(result.status).toBe('APPROVED');
      expect(result.transaction.transactionCurrency).toBe('USD');
      expect(result.transaction.functionalCurrency).toBe('MVR');
      expect(result.transaction.sourceAmount).toBe(10000);
      expect(result.transaction.fxRate).toBe(15.42);
      expect(result.transaction.rateDate).toBe('2026-02-15');
      expect(result.transaction.MVRAmount).toBe(154200);
      expect(result.transaction.isHistoricalLocked).toBe(true);
      expect(result.ruleId).toBe('RULE-FX-MMA-SEC31');

      // Verifies balanced double entry journal
      expect(result.journalEntry).toBeDefined();
      expect(result.journalEntry?.isBalanced).toBe(true);
      expect(result.journalEntry?.totalDebit).toBe(154200);
      expect(result.journalEntry?.totalCredit).toBe(154200);
      expect(result.journalEntry?.lines[0].accountCode).toBe(STANDARD_FX_ACCOUNTS.GENERAL_EXPENSE.code);
      expect(result.journalEntry?.lines[1].accountCode).toBe(STANDARD_FX_ACCOUNTS.ACCOUNTS_PAYABLE.code);
    });

    it('recognizes foreign revenue invoice (Accounts Receivable)', () => {
      const salesInput: InvoiceRecognitionInput = {
        invoiceId: 'INV-2026-SALES-EUR',
        invoiceDate: '2026-03-01',
        currency: 'EUR',
        sourceAmount: 5000,
        accountingTreatment: 'REVENUE',
        customRate: 16.80,
        description: 'International IT Consulting Services'
      };

      const result = engine.recognizeForeignTransaction(salesInput);

      expect(result.status).toBe('APPROVED');
      expect(result.transaction.MVRAmount).toBe(84000); // 5,000 * 16.80
      expect(result.journalEntry?.isBalanced).toBe(true);
      expect(result.journalEntry?.lines[0].accountCode).toBe(STANDARD_FX_ACCOUNTS.ACCOUNTS_RECEIVABLE.code);
      expect(result.journalEntry?.lines[0].debit).toBe(84000);
      expect(result.journalEntry?.lines[1].accountCode).toBe(STANDARD_FX_ACCOUNTS.REVENUE.code);
      expect(result.journalEntry?.lines[1].credit).toBe(84000);
    });

    it('MVR transactions do not require unnecessary FX conversion', () => {
      const mvrInput: InvoiceRecognitionInput = {
        invoiceId: 'INV-MVR-LOCAL-01',
        invoiceDate: '2026-02-20',
        currency: 'MVR',
        sourceAmount: 25000,
        accountingTreatment: 'EXPENSE'
      };

      const result = engine.recognizeForeignTransaction(mvrInput);
      expect(result.status).toBe('APPROVED');
      expect(result.transaction.fxRate).toBe(1.0);
      expect(result.transaction.MVRAmount).toBe(25000);
      expect(result.transaction.rateSource).toBe('MMA_BASE');
    });

    it('flags REVIEW_REQUIRED when invoice currency exchange rate is missing', () => {
      const missingInput: InvoiceRecognitionInput = {
        invoiceId: 'INV-UNKNOWN-001',
        invoiceDate: '2026-03-01',
        currency: 'CHF', // Swiss Franc (not in seed)
        sourceAmount: 1200
      };

      const result = engine.recognizeForeignTransaction(missingInput);
      expect(result.status).toBe('REVIEW_REQUIRED');
      expect(result.reviewReason).toBeDefined();
    });
  });

  describe('3. Settlement & Realised FX Gain/Loss', () => {
    it('calculates Realised Gain on payable settlement when settlement rate is lower (favorable currency movement)', () => {
      // Original bill: $10,000 recognized @ 15.42 = MVR 154,200 (Accounts Payable)
      const recognized = engine.recognizeForeignTransaction({
        invoiceId: 'BILL-USD-001',
        invoiceDate: '2026-01-15',
        currency: 'USD',
        sourceAmount: 10000,
        customRate: 15.42,
        accountingTreatment: 'EXPENSE'
      }).transaction;

      // Settlement: Paid $10,000 on 2026-02-15 @ 15.35 = MVR 153,500
      const settlementInput: SettlementInput = {
        settlementId: 'SETTLE-001',
        settlementDate: '2026-02-15',
        originalTransaction: recognized,
        settlementAmount: 10000,
        settlementFxRate: 15.35
      };

      const settleRes = engine.settleTransaction(settlementInput);

      expect(settleRes.status).toBe('APPROVED');
      expect(settleRes.classification).toBe('REALIZED_GAIN');
      expect(settleRes.originalMvrAmount).toBe(154200);
      expect(settleRes.settlementMvrAmount).toBe(153500);
      expect(settleRes.realisedGainLoss).toBe(700); // 154,200 - 153,500 = +700 MVR Gain
      expect(settleRes.miraCategory).toBe('other_income');
      expect(settleRes.miraField).toBe('F604_C03_REV_OTHER_INCOME');

      // Balanced Double-Entry Journal check
      expect(settleRes.journalEntry).toBeDefined();
      expect(settleRes.journalEntry?.isBalanced).toBe(true);
      expect(settleRes.journalEntry?.totalDebit).toBe(154200);
      expect(settleRes.journalEntry?.totalCredit).toBe(154200);

      // Debit AP 154,200, Credit Bank 153,500, Credit Realised FX Gain 700
      const apLine = settleRes.journalEntry?.lines.find(l => l.accountCode === STANDARD_FX_ACCOUNTS.ACCOUNTS_PAYABLE.code);
      const bankLine = settleRes.journalEntry?.lines.find(l => l.accountCode === STANDARD_FX_ACCOUNTS.BANK.code);
      const gainLine = settleRes.journalEntry?.lines.find(l => l.accountCode === STANDARD_FX_ACCOUNTS.REALISED_FX_GAIN.code);

      expect(apLine?.debit).toBe(154200);
      expect(bankLine?.credit).toBe(153500);
      expect(gainLine?.credit).toBe(700);
    });

    it('calculates Realised Loss on payable settlement when settlement rate is higher (adverse currency movement)', () => {
      // Original bill: $10,000 recognized @ 15.42 = MVR 154,200
      const recognized = engine.recognizeForeignTransaction({
        invoiceId: 'BILL-USD-002',
        invoiceDate: '2026-01-15',
        currency: 'USD',
        sourceAmount: 10000,
        customRate: 15.42,
        accountingTreatment: 'EXPENSE'
      }).transaction;

      // Settlement: Paid $10,000 on 2026-03-01 @ 15.50 = MVR 155,000
      const settlementInput: SettlementInput = {
        settlementId: 'SETTLE-002',
        settlementDate: '2026-03-01',
        originalTransaction: recognized,
        settlementAmount: 10000,
        settlementFxRate: 15.50
      };

      const settleRes = engine.settleTransaction(settlementInput);

      expect(settleRes.status).toBe('APPROVED');
      expect(settleRes.classification).toBe('REALIZED_LOSS');
      expect(settleRes.originalMvrAmount).toBe(154200);
      expect(settleRes.settlementMvrAmount).toBe(155000);
      expect(settleRes.realisedGainLoss).toBe(-800); // 154,200 - 155,000 = -800 MVR Loss
      expect(settleRes.miraCategory).toBe('other_expenses');
      expect(settleRes.miraField).toBe('F604_C05_EXP_OTHER_EXPENSES');

      // Balanced Double-Entry Journal check
      expect(settleRes.journalEntry?.isBalanced).toBe(true);
      expect(settleRes.journalEntry?.totalDebit).toBe(155000);
      expect(settleRes.journalEntry?.totalCredit).toBe(155000);

      // Debit AP 154,200, Debit Realised FX Loss 800, Credit Bank 155,000
      const apLine = settleRes.journalEntry?.lines.find(l => l.accountCode === STANDARD_FX_ACCOUNTS.ACCOUNTS_PAYABLE.code);
      const lossLine = settleRes.journalEntry?.lines.find(l => l.accountCode === STANDARD_FX_ACCOUNTS.REALISED_FX_LOSS.code);
      const bankLine = settleRes.journalEntry?.lines.find(l => l.accountCode === STANDARD_FX_ACCOUNTS.BANK.code);

      expect(apLine?.debit).toBe(154200);
      expect(lossLine?.debit).toBe(800);
      expect(bankLine?.credit).toBe(155000);
    });

    it('calculates Realised Gain on receivable collection when collection rate is higher', () => {
      // Sales invoice: €5,000 recognized @ 16.80 = MVR 84,000 (Accounts Receivable)
      const salesTx = engine.recognizeForeignTransaction({
        invoiceId: 'SALES-EUR-001',
        invoiceDate: '2026-02-01',
        currency: 'EUR',
        sourceAmount: 5000,
        customRate: 16.80,
        accountingTreatment: 'REVENUE'
      }).transaction;

      // Collection: Received €5,000 @ 17.00 = MVR 85,000
      const settleRes = engine.settleTransaction({
        settlementId: 'RECEIPT-001',
        settlementDate: '2026-03-01',
        originalTransaction: salesTx,
        settlementAmount: 5000,
        settlementFxRate: 17.00
      });

      expect(settleRes.classification).toBe('REALIZED_GAIN');
      expect(settleRes.realisedGainLoss).toBe(1000); // 85,000 - 84,000 = +1,000 Gain
      expect(settleRes.journalEntry?.isBalanced).toBe(true);

      // Debit Bank 85,000, Credit AR 84,000, Credit Realised FX Gain 1,000
      const bankLine = settleRes.journalEntry?.lines.find(l => l.accountCode === STANDARD_FX_ACCOUNTS.BANK.code);
      const arLine = settleRes.journalEntry?.lines.find(l => l.accountCode === STANDARD_FX_ACCOUNTS.ACCOUNTS_RECEIVABLE.code);
      const gainLine = settleRes.journalEntry?.lines.find(l => l.accountCode === STANDARD_FX_ACCOUNTS.REALISED_FX_GAIN.code);

      expect(bankLine?.debit).toBe(85000);
      expect(arLine?.credit).toBe(84000);
      expect(gainLine?.credit).toBe(1000);
    });
  });

  describe('4. Period-End Unrealised FX Revaluation & Reversal', () => {
    it('performs period-end revaluation on open monetary items and computes MIRA adjustments', () => {
      const openItems: PeriodEndRevaluationParams['openMonetaryItems'] = [
        {
          transactionId: 'OPEN-PAYABLE-USD',
          accountingTreatment: 'EXPENSE',
          foreignCurrency: 'USD',
          openForeignAmount: 20000,
          historicalSpotRate: 15.42,
          historicalMvrAmount: 308400
        },
        {
          transactionId: 'OPEN-RECEIVABLE-EUR',
          accountingTreatment: 'REVENUE',
          foreignCurrency: 'EUR',
          openForeignAmount: 10000,
          historicalSpotRate: 16.80,
          historicalMvrAmount: 168000
        }
      ];

      // Closing rates at 2026-12-31:
      // USD moved to 15.50 (Payable: 20,000 * 15.50 = 310,000 -> Unrealised Loss = -1,600 MVR)
      // EUR moved to 17.10 (Receivable: 10,000 * 17.10 = 171,000 -> Unrealised Gain = +3,000 MVR)
      const revalRes = engine.revaluePeriodEndMonetaryItems({
        periodEndDate: '2026-12-31',
        openMonetaryItems: openItems,
        closingRates: {
          USD: 15.50,
          EUR: 17.10
        }
      });

      expect(revalRes.totalOpenItemsCount).toBe(2);
      expect(revalRes.totalUnrealisedGain).toBe(3000);
      expect(revalRes.totalUnrealisedLoss).toBe(1600);
      expect(revalRes.netUnrealisedGainLoss).toBe(1400); // 3,000 - 1,600 = +1,400 Net Gain

      // MIRA 604 adjustments:
      // Unrealised loss is not deductible -> Addback Box C07: 1,600
      // Unrealised gain is not taxable until realised -> Deduction Box C09: 3,000
      expect(revalRes.miraTaxAdjustment?.addbackAmount).toBe(1600);
      expect(revalRes.miraTaxAdjustment?.deductionAmount).toBe(3000);

      // Period-end journal entry balanced
      expect(revalRes.journalEntry).toBeDefined();
      expect(revalRes.journalEntry?.isBalanced).toBe(true);
      expect(revalRes.journalEntry?.totalDebit).toBe(1400);
      expect(revalRes.journalEntry?.totalCredit).toBe(1400);
    });

    it('performs reversal of previous period revaluation on Day 1 of subsequent period', () => {
      const openItems: PeriodEndRevaluationParams['openMonetaryItems'] = [
        {
          transactionId: 'OPEN-PAYABLE-001',
          accountingTreatment: 'EXPENSE',
          foreignCurrency: 'USD',
          openForeignAmount: 10000,
          historicalSpotRate: 15.42,
          historicalMvrAmount: 154200
        }
      ];

      // Closing rate at 2026-12-31: USD @ 15.50 (Unrealised Loss of 800 MVR)
      const revalRes = engine.revaluePeriodEndMonetaryItems({
        periodEndDate: '2026-12-31',
        openMonetaryItems: openItems,
        closingRates: { USD: 15.50 }
      });

      expect(revalRes.netUnrealisedGainLoss).toBe(-800);
      expect(revalRes.journalEntry?.lines[0].debit).toBe(800); // Dr Unrealised Loss
      expect(revalRes.journalEntry?.lines[1].credit).toBe(800); // Cr FX Reserve

      // Reversal on 2027-01-01
      const reversalRes = engine.reversePeriodEndRevaluation({
        revaluationResult: revalRes,
        reversalDate: '2027-01-01'
      });

      expect(reversalRes.reversalDate).toBe('2027-01-01');
      expect(reversalRes.reversedNetUnrealisedGainLoss).toBe(-800);
      expect(reversalRes.reversalJournalEntry.isBalanced).toBe(true);

      // Reversal journal lines: Dr FX Reserve 800, Cr Unrealised Loss 800
      expect(reversalRes.reversalJournalEntry.lines[0].debit).toBe(0);
      expect(reversalRes.reversalJournalEntry.lines[0].credit).toBe(800);
      expect(reversalRes.reversalJournalEntry.lines[1].debit).toBe(800);
      expect(reversalRes.reversalJournalEntry.lines[1].credit).toBe(0);
    });
  });
});
