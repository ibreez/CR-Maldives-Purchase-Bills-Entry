import { describe, test, expect, beforeEach } from 'vitest';
import {
  TaxAdjustmentLedgerEngine,
  defaultTaxAdjustmentLedgerEngine
} from '../../src/services/tax/taxAdjustmentLedgerEngine';
import { defaultRuleResolver } from '../../src/regulatory/resolvers/ruleResolver';
import { UserSession } from '../../src/types/rbac';

describe('Phase 30: Authoritative Tax Adjustment Ledger Engine', () => {
  let engine: TaxAdjustmentLedgerEngine;

  const staffAccountantSession: UserSession = {
    userId: 'USR-ACC-01',
    tenantId: 'CORP-MALE-01',
    role: 'STAFF_ACCOUNTANT',
    assignedEntities: ['CORP-MALE-01']
  };

  const taxManagerSession: UserSession = {
    userId: 'USR-MGR-01',
    tenantId: 'CORP-MALE-01',
    role: 'TAX_MANAGER',
    assignedEntities: ['CORP-MALE-01']
  };

  const clientUserSession: UserSession = {
    userId: 'USR-CLIENT-01',
    tenantId: 'CORP-MALE-01',
    role: 'CLIENT_USER',
    assignedEntities: ['CORP-MALE-01']
  };

  const auditorSession: UserSession = {
    userId: 'USR-AUDIT-01',
    tenantId: 'CORP-MALE-01',
    role: 'AUDITOR',
    assignedEntities: ['CORP-MALE-01']
  };

  const otherTenantManagerSession: UserSession = {
    userId: 'USR-MGR-OTHER',
    tenantId: 'CORP-OTHER-99',
    role: 'TAX_MANAGER',
    assignedEntities: ['CORP-OTHER-99']
  };

  beforeEach(() => {
    engine = new TaxAdjustmentLedgerEngine(defaultRuleResolver);
    engine.clearStore();
  });

  test('Requirement 1: Creates formal tax adjustment with 4-dimensional traceability (document, journal, account, tax rule)', () => {
    const adj = engine.createAdjustment({
      tenantId: 'CORP-MALE-01',
      taxYear: 2026,
      sourceJournalId: 'JNL-2026-0044',
      sourceJournalLineId: 'JNL-LINE-089',
      sourceTransactionId: 'TX-2026-901',
      supportingDocument: 'DOC-MIRA-FINE-2026-01',
      accountCode: 'GL-6520',
      accountName: 'Statutory Penalties & Fines',
      category: 'FINES_PENALTIES',
      description: 'Late GST filing penalty imposed under Tax Administration Act',
      amount: 15000
    });

    expect(adj.id).toBeDefined();
    expect(adj.tenantId).toBe('CORP-MALE-01');
    expect(adj.taxYear).toBe(2026);
    expect(adj.amount).toBe(15000);
    expect(adj.direction).toBe('ADD_BACK');
    expect(adj.reviewStatus).toBe('PENDING');

    // 4-Dimensional Traceability Verification
    expect(adj.supportingDocument).toBe('DOC-MIRA-FINE-2026-01'); // 1. Document
    expect(adj.sourceJournalId).toBe('JNL-2026-0044');             // 2. Journal
    expect(adj.sourceJournalLineId).toBe('JNL-LINE-089');
    expect(adj.accountCode).toBe('GL-6520');                       // 3. Account
    expect(adj.ruleId).toBe('RULE-ADJ-SEC22-FINES');               // 4. Tax Rule
    expect(adj.legalReference).toContain('Income Tax Act (Act No. 25/2019) Section 22');
    expect(adj.ruleVersion).toBe('v25.1');
  });

  test('Requirement 2: Statutory rule resolution across all required Income Tax Act adjustment categories without hardcoding', () => {
    const categories = [
      { cat: 'DEPRECIATION_ADDBACK' as const, expectedRuleId: 'RULE-ADJ-SEC18-DEPRECIATION', expectedDir: 'ADD_BACK', ref: 'Section 11 & Section 18' },
      { cat: 'NON_DEDUCTIBLE_EXPENDITURE' as const, expectedRuleId: 'RULE-ADJ-SEC20-NON-DEDUCTIBLE', expectedDir: 'ADD_BACK', ref: 'Section 20' },
      { cat: 'PRIVATE_EXPENDITURE' as const, expectedRuleId: 'RULE-ADJ-SEC21-PRIVATE', expectedDir: 'ADD_BACK', ref: 'Section 21' },
      { cat: 'FINES_PENALTIES' as const, expectedRuleId: 'RULE-ADJ-SEC22-FINES', expectedDir: 'ADD_BACK', ref: 'Section 22' },
      { cat: 'CAPITAL_EXPENDITURE' as const, expectedRuleId: 'RULE-ADJ-SEC23-CAPITAL', expectedDir: 'ADD_BACK', ref: 'Section 23' },
      { cat: 'RELATED_PARTY_EXCESS' as const, expectedRuleId: 'RULE-ADJ-SEC24-RELATED', expectedDir: 'ADD_BACK', ref: 'Section 24' },
      { cat: 'GENERAL_PROVISIONS' as const, expectedRuleId: 'RULE-ADJ-SEC25-PROVISIONS', expectedDir: 'ADD_BACK', ref: 'Section 25' },
      { cat: 'OWNER_DRAWINGS' as const, expectedRuleId: 'RULE-ADJ-SEC26-OWNER', expectedDir: 'ADD_BACK', ref: 'Section 26' },
      { cat: 'APPROVED_DONATIONS' as const, expectedRuleId: 'RULE-ADJ-SEC12-DONATIONS', expectedDir: 'DEDUCTION', ref: 'Section 12' },
      { cat: 'SPECIFIC_BAD_DEBTS' as const, expectedRuleId: 'RULE-ADJ-SEC11-BAD-DEBTS', expectedDir: 'DEDUCTION', ref: 'Section 11' },
      { cat: 'TAX_EXEMPT_INCOME' as const, expectedRuleId: 'RULE-ADJ-SEC10-EXEMPT', expectedDir: 'DEDUCTION', ref: 'Section 10' }
    ];

    for (let i = 0; i < categories.length; i++) {
      const tc = categories[i];
      const adj = engine.createAdjustment({
        tenantId: 'CORP-MALE-01',
        taxYear: 2026,
        sourceJournalId: `JNL-STAT-${i}`,
        sourceJournalLineId: `LINE-${i}`,
        accountCode: `GL-${7000 + i}`,
        category: tc.cat,
        description: `Statutory adjustment for ${tc.cat}`,
        amount: 10000 + i * 500
      });

      expect(adj.ruleId).toBe(tc.expectedRuleId);
      expect(adj.direction).toBe(tc.expectedDir);
      expect(adj.legalReference).toContain(tc.ref);
    }
  });

  test('Requirement 3: Duplicate adjustment prevention rejects re-posting of same source journal line & category', () => {
    engine.createAdjustment({
      tenantId: 'CORP-MALE-01',
      taxYear: 2026,
      sourceJournalId: 'JNL-UNIQUE-01',
      sourceJournalLineId: 'LINE-UNIQ-A',
      accountCode: 'GL-6900',
      category: 'PRIVATE_EXPENDITURE',
      description: 'Personal grocery charged to company card',
      amount: 4500
    });

    // Attempting duplicate creation on exact same source journal line & category must throw
    expect(() => {
      engine.createAdjustment({
        tenantId: 'CORP-MALE-01',
        taxYear: 2026,
        sourceJournalId: 'JNL-UNIQUE-01',
        sourceJournalLineId: 'LINE-UNIQ-A',
        accountCode: 'GL-6900',
        category: 'PRIVATE_EXPENDITURE',
        description: 'Duplicate attempt of personal grocery',
        amount: 4500
      });
    }).toThrow(/Duplicate adjustment rejected/);
  });

  test('Requirement 4: Strict RBAC governance - Unauthorized users cannot approve or reject adjustments', () => {
    const adj = engine.createAdjustment({
      tenantId: 'CORP-MALE-01',
      taxYear: 2026,
      sourceJournalId: 'JNL-APPROVAL-01',
      sourceJournalLineId: 'LINE-APP-1',
      accountCode: 'GL-6100',
      category: 'NON_DEDUCTIBLE_EXPENDITURE',
      description: 'Business gift without business justification',
      amount: 8000
    });

    expect(adj.reviewStatus).toBe('PENDING');

    // 1. CLIENT_USER cannot approve
    expect(() => {
      engine.approveAdjustment(adj.id, clientUserSession, 'CORP-MALE-01');
    }).toThrow(/RBAC Security Error/);

    // 2. AUDITOR cannot approve
    expect(() => {
      engine.approveAdjustment(adj.id, auditorSession, 'CORP-MALE-01');
    }).toThrow(/RBAC Security Error/);

    // 3. User from different tenant cannot approve
    expect(() => {
      engine.approveAdjustment(adj.id, otherTenantManagerSession, 'CORP-MALE-01');
    }).toThrow(/RBAC Security Error/);

    // 4. Authorized TAX_MANAGER approves successfully
    const approvedAdj = engine.approveAdjustment(adj.id, taxManagerSession, 'CORP-MALE-01');
    expect(approvedAdj.reviewStatus).toBe('APPROVED');
    expect(approvedAdj.approvedBy).toBe('USR-MGR-01');
    expect(approvedAdj.approvedAt).toBeDefined();
  });

  test('Requirement 5: Reversing accounting transaction automatically propagates reversal to the Tax Adjustment Ledger', () => {
    // 1. Post original adjustment linked to JNL-ORIG-999
    const originalAdj = engine.createAdjustment({
      tenantId: 'CORP-MALE-01',
      taxYear: 2026,
      sourceJournalId: 'JNL-ORIG-999',
      sourceJournalLineId: 'LINE-ORIG-01',
      accountCode: 'GL-6300',
      category: 'CAPITAL_EXPENDITURE',
      description: 'Office Laptop erroneously expensed to IT Supplies',
      amount: 32000
    });

    engine.approveAdjustment(originalAdj.id, taxManagerSession, 'CORP-MALE-01');

    // 2. Simulate accounting journal reversal (e.g. error correction in GL)
    const reversedAdjustments = engine.handleJournalReversal({
      tenantId: 'CORP-MALE-01',
      originalJournalId: 'JNL-ORIG-999',
      reversalJournalId: 'JNL-REV-999',
      reason: 'Reclassified to Fixed Asset Register'
    });

    expect(reversedAdjustments.length).toBe(1);
    const revEntry = reversedAdjustments[0];

    // Offsetting entry has opposite direction (DEDUCTION offsets ADD_BACK)
    expect(revEntry.id).toBe(`REV-${originalAdj.id}`);
    expect(revEntry.direction).toBe('DEDUCTION');
    expect(revEntry.amount).toBe(32000);
    expect(revEntry.sourceJournalId).toBe('JNL-REV-999');
    expect(revEntry.reversalOfAdjustmentId).toBe(originalAdj.id);

    // Original entry is marked reversed
    const updatedOriginal = engine.getAdjustmentTrace(originalAdj.id);
    expect(updatedOriginal?.isReversed).toBe(true);
    expect(updatedOriginal?.reversalJournalId).toBe('JNL-REV-999');

    // Bridge calculation with both original + reversal results in net ZERO impact
    const bridge = engine.generateTaxBridge({
      tenantId: 'CORP-MALE-01',
      taxYear: 2026,
      accountingProfit: 500000,
      includePendingAdjustments: true
    });

    expect(bridge.totalAddBacks).toBe(32000);
    expect(bridge.totalAllowableDeductions).toBe(32000);
    expect(bridge.adjustedProfitBeforeCapitalAllowance).toBe(500000); // 500k + 32k - 32k = 500k
  });

  test('Requirement 6: Complete Tax Reconciliation Bridge generates exact Section C & D reconciliation to Taxable Income', () => {
    // Starting Accounting Profit: MVR 1,000,000
    // Adjustments:
    // + Depreciation Addback: MVR 120,000
    // + Fines & Penalties: MVR 25,000
    // + Private Expenses: MVR 15,000
    // + Unapproved Capital Exp: MVR 30,000
    // - Approved Donations (Sec 12): MVR 10,000
    // - Specific Bad Debts (Sec 11): MVR 20,000
    // - Tax-exempt Income (Sec 10): MVR 40,000
    // Subtotal Addbacks = 190,000
    // Subtotal Deductions = 70,000
    // Adjusted Profit = 1,000,000 + 190,000 - 70,000 = 1,120,000
    // Capital Allowances: CA = 80,000, Balancing Allowance = 15,000, Balancing Charge = 5,000
    // Net CA = 80,000 + 15,000 - 5,000 = 90,000
    // Final Taxable Income = 1,120,000 - 90,000 = 1,030,000

    const items = [
      { cat: 'DEPRECIATION_ADDBACK' as const, amt: 120000, code: 'GL-DEP' },
      { cat: 'FINES_PENALTIES' as const, amt: 25000, code: 'GL-FINE' },
      { cat: 'PRIVATE_EXPENDITURE' as const, amt: 15000, code: 'GL-PRIV' },
      { cat: 'CAPITAL_EXPENDITURE' as const, amt: 30000, code: 'GL-CAP' },
      { cat: 'APPROVED_DONATIONS' as const, amt: 10000, code: 'GL-DON' },
      { cat: 'SPECIFIC_BAD_DEBTS' as const, amt: 20000, code: 'GL-DEBT' },
      { cat: 'TAX_EXEMPT_INCOME' as const, amt: 40000, code: 'GL-EXMPT' }
    ];

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const adj = engine.createAdjustment({
        tenantId: 'CORP-MALE-01',
        taxYear: 2026,
        sourceJournalId: `JNL-BRIDGE-${i}`,
        sourceJournalLineId: `LINE-B-${i}`,
        accountCode: it.code,
        category: it.cat,
        description: `Bridge item for ${it.cat}`,
        amount: it.amt
      });
      engine.approveAdjustment(adj.id, taxManagerSession, 'CORP-MALE-01');
    }

    const bridge = engine.generateTaxBridge({
      tenantId: 'CORP-MALE-01',
      taxYear: 2026,
      accountingProfit: 1000000,
      capitalAllowanceTotal: 80000,
      balancingAllowanceTotal: 15000,
      balancingChargeTotal: 5000
    });

    expect(bridge.accountingProfit).toBe(1000000);
    expect(bridge.totalAddBacks).toBe(190000);
    expect(bridge.totalAllowableDeductions).toBe(70000);
    expect(bridge.adjustedProfitBeforeCapitalAllowance).toBe(1120000);
    expect(bridge.netCapitalAllowanceDeduction).toBe(90000);
    expect(bridge.taxableIncomeBeforeLossRelief).toBe(1030000);
    expect(bridge.isTaxLoss).toBe(false);
    expect(bridge.taxLossAmount).toBe(0);
    expect(bridge.lineageSummary.totalAdjustmentsCount).toBe(7);
    expect(bridge.lineageSummary.approvedCount).toBe(7);
  });

  test('Requirement 7: Correctly identifies statutory tax losses when deductions exceed profit', () => {
    const adj = engine.createAdjustment({
      tenantId: 'CORP-MALE-01',
      taxYear: 2026,
      sourceJournalId: 'JNL-LOSS-01',
      sourceJournalLineId: 'LINE-L1',
      accountCode: 'GL-EXMPT',
      category: 'TAX_EXEMPT_INCOME',
      description: 'Foreign qualifying income exempt from domestic tax',
      amount: 150000
    });
    engine.approveAdjustment(adj.id, taxManagerSession, 'CORP-MALE-01');

    // Accounting Profit = 50,000, Deduction = 150,000 -> Adjusted Profit = -100,000
    // Capital Allowance = 40,000 -> Total Tax Loss = 140,000
    const bridge = engine.generateTaxBridge({
      tenantId: 'CORP-MALE-01',
      taxYear: 2026,
      accountingProfit: 50000,
      capitalAllowanceTotal: 40000
    });

    expect(bridge.adjustedProfitBeforeCapitalAllowance).toBe(-100000);
    expect(bridge.taxableIncomeBeforeLossRelief).toBe(0);
    expect(bridge.isTaxLoss).toBe(true);
    expect(bridge.taxLossAmount).toBe(140000);
  });
});
