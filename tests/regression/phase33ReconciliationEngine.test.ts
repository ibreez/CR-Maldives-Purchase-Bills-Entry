import { describe, test, expect } from 'vitest';
import {
  reconcileGlGst,
  reconcileGlNwt,
  reconcileApNwt,
  reconcileFixedAssetsGl,
  reconcileTaxAssetsFixedAssets,
  reconcilePnlIncomeTax,
  reconcileTaxAdjustmentsTaxCalc,
  reconcileMira604TaxEngine,
  reconcileSchedule2BalanceSheet,
  reconcileSchedule3NetWorth,
  reconcileSchedule4RelatedParty,
  reconcileSchedule5Cfe,
  runFullReconciliationSuite,
  computeStatus,
  ComprehensiveReconciliationContext,
  AUTHORITATIVE_RECONCILIATION_RULES
} from '../../src/services/reconciliation';
import { TransactionRecord, FixedAssetRecord } from '../../src/types/taxEngine';
import { Mira105GstReturn } from '../../src/types/mira105';
import { TaxAdjustment } from '../../src/services/tax/taxAdjustmentService';

describe('Phase 33 — Authoritative Reconciliation Engine & Framework Tests', () => {

  const entityId = 'MVR-CORP-001';
  const taxYear = 2026;

  const sampleRevenueTx1: TransactionRecord = {
    transactionId: 'TX-REV-101',
    sourceType: 'invoice',
    sourceId: 'INV-2026-001',
    entityId,
    outletId: 'MAIN',
    transactionDate: '2026-03-15',
    description: 'Corporate Consulting Revenue',
    accountingCategory: 'revenue.services',
    miraCategory: 'revenue',
    amount: 100000,
    gstAmount: 8000,
    totalAmount: 108000,
    accountingTreatment: 'REVENUE',
    incomeTaxTreatment: 'DEDUCTIBLE',
    gstTreatment: 'STANDARD_RATED',
    taxYear,
    accountingPeriodStart: '2026-01-01',
    accountingPeriodEnd: '2026-12-31',
    reviewStatus: 'APPROVED',
    auditHistory: [],
    createdAt: '2026-03-15T10:00:00Z'
  };

  const sampleGstReturn: Mira105GstReturn = {
    formId: 'MIRA105-2026-001',
    formVersion: 'V25.1',
    submissionStatus: 'READY_FOR_FILING',
    generatedAt: '2026-04-20T00:00:00Z',
    verificationChecksum: 'CHK-105-001',
    gstPeriod: {
      periodId: '2026-Q1',
      taxpayerName: 'Maldives Marine Corp Pvt Ltd',
      tin: '1002003001',
      regime: 'GENERAL_GST',
      periodStart: '2026-01-01',
      periodEnd: '2026-03-31',
      taxYear
    },
    outputSales: {
      box1_StandardRatedSales: 100000,
      box2_ZeroRatedSales: 0,
      box3_ExemptSales: 0,
      totalOutputSales: 100000,
      box4_OutputGstCollected: 8000
    },
    inputPurchases: {
      box5_TotalPurchases: 20000,
      box6_TaxablePurchases: 20000,
      box7_GrossInputGstPaid: 1600,
      box8_ClaimableInputGst: 1600,
      nonClaimableInputGst: 0,
      proRataClaimableRatio: 1.0,
      proRataAdjustmentAmount: 0
    },
    capitalPurchases: {
      box10_CapitalPurchasesAmount: 0,
      box10_CapitalPurchasesInputGst: 0
    },
    box9_NetGstPayableOrRefundable: 6400
  };

  const sampleFixedAsset: FixedAssetRecord = {
    assetId: 'ASSET-2026-01',
    entityId,
    outletId: 'MAIN',
    assetName: 'Server Infrastructure',
    assetClass: 'Computer software & hardware',
    acquisitionDate: '2026-02-01',
    costPrice: 50000,
    cost: 50000,
    miraCapitalAllowanceRate: 33.33,
    openingWDV: 50000,
    additionsInYear: 50000,
    disposalsInYear: 0,
    capitalAllowanceClaimed: 16665,
    closingWDV: 33335,
    accountingPeriodStart: '2026-01-01',
    accountingPeriodEnd: '2026-12-31',
    taxYear
  };

  const sampleAdjustment: TaxAdjustment = {
    adjustmentId: 'ADJ-2026-001',
    miraCode: 'ADJ-FINES',
    amount: 15000,
    reason: 'Statutory government late fine addback',
    direction: 'ADD_BACK',
    taxYear,
    reviewStatus: 'APPROVED',
    sourceTransactionId: 'TX-EXP-999'
  };

  // ---------------------------------------------------------------------------
  // ACCEPTANCE TEST 1: PERFECT RECONCILIATION RETURNS PASS
  // ---------------------------------------------------------------------------
  test('Acceptance Test 1: Perfect reconciliation across all datasets returns PASS', () => {
    const perfectContext: ComprehensiveReconciliationContext = {
      entityId,
      taxYear,
      transactions: [sampleRevenueTx1],
      gstReturns: [sampleGstReturn],
      fixedAssets: [sampleFixedAsset],
      capitalAllowanceSummary: {
        totalQualifyingAdditions: 50000,
        totalCapitalAllowanceClaimed: 16665
      },
      pnlReport: {
        totalRevenue: 100000,
        totalOperatingExpenses: 20000,
        netProfitBeforeTax: 80000
      },
      taxAdjustments: [sampleAdjustment],
      taxEngineResult: {
        accountingProfit: 80000,
        totalAdditions: 15000,
        totalDeductions: 0,
        taxableIncome: 95000,
        taxPayable: 14250,
        lossCarriedForward: 0,
        foreignTaxCredit: 0
      },
      mira604Return: {
        formId: 'MIRA604-2026-01',
        formVersion: 'V25.1',
        submissionStatus: 'READY_FOR_FILING',
        generatedAt: '2026-05-01T00:00:00Z',
        sectionA_TaxpayerInfo: {
          tin: '1002003',
          taxpayerName: 'Maldives Marine Corp Pvt Ltd',
          entityType: 'COMPANY',
          taxYear,
          accountingPeriodStart: '2026-01-01',
          accountingPeriodEnd: '2026-12-31'
        },
        sectionB_Schedule1PnL: {
          grossRevenue: 100000,
          costOfSales: 0,
          grossProfit: 100000,
          otherIncome: 0,
          operatingExpenses: 20000,
          accountingProfitBeforeTax: 80000
        },
        sectionC_TaxAdjustments: {
          itemizedAddBacks: [sampleAdjustment],
          totalAddBacks: 15000,
          itemizedDeductions: [],
          totalDeductions: 0,
          netTaxAdjustments: 15000
        },
        sectionD_CapitalAllowances: {
          totalClaimableCapitalAllowance: 16665
        },
        sectionE_TaxableIncomeLoss: {
          adjustedTaxableProfitBeforeLoss: 95000,
          priorUnabsorbedLosses: 0,
          lossCarriedForwardApplied: 0,
          remainingUnabsorbedLoss: 0,
          netTaxableIncome: 95000,
          isTaxLoss: false,
          taxLossAmount: 0
        },
        sectionF_TaxComputation: {
          taxByBracket: [],
          totalTaxPayable: 14250,
          advanceTaxPaid: 0,
          interimTaxPaid: 0,
          withholdingTaxDeducted: 0,
          totalPrepayments: 0,
          netTaxDueOrRefundable: 14250,
          effectiveTaxRate: 15
        }
      },
      schedule2Data: {
        totalAssets: 500000,
        totalEquityAndLiabilities: 500000
      },
      glBalanceSheet: {
        ppe: 33335,
        totalAssets: 500000,
        totalEquityAndLiabilities: 500000
      },
      schedule3Data: {
        netNonBusinessWorth: 250000
      },
      personalAssetRegistry: {
        netNonBusinessWorth: 250000
      },
      schedule4Data: {
        totalRelatedPartyTransactions: 120000,
        totalTpTaxAdjustments: 5000
      },
      relatedPartyLedger: {
        totalRelatedPartyTransactions: 120000,
        totalTpAdjustments: 5000
      },
      schedule5Data: {
        attributableCfeIncome: 30000,
        claimedForeignTaxCredit: 3000
      },
      cfeSourceData: {
        totalAttributableIncome: 30000,
        claimedForeignTaxCredit: 3000
      }
    };

    const suiteResult = runFullReconciliationSuite(perfectContext);

    expect(suiteResult.overallStatus).toBe('PASS');
    expect(suiteResult.passedCount).toBe(12);
    expect(suiteResult.warningCount).toBe(0);
    expect(suiteResult.failedCount).toBe(0);
    expect(suiteResult.allDiscrepancies.length).toBe(0);

    // Verify individual modules
    expect(suiteResult.reconciliations.GL_GST.status).toBe('PASS');
    expect(suiteResult.reconciliations.GL_NWT.status).toBe('PASS');
    expect(suiteResult.reconciliations.AP_NWT.status).toBe('PASS');
    expect(suiteResult.reconciliations.FIXED_ASSETS_GL.status).toBe('PASS');
    expect(suiteResult.reconciliations.TAX_ASSETS_FIXED_ASSETS.status).toBe('PASS');
    expect(suiteResult.reconciliations.PNL_INCOME_TAX.status).toBe('PASS');
    expect(suiteResult.reconciliations.TAX_ADJUSTMENTS_TAX_CALC.status).toBe('PASS');
    expect(suiteResult.reconciliations.MIRA604_TAX_ENGINE.status).toBe('PASS');
    expect(suiteResult.reconciliations.SCHEDULE2_BALANCE_SHEET.status).toBe('PASS');
    expect(suiteResult.reconciliations.SCHEDULE3_NET_WORTH.status).toBe('PASS');
    expect(suiteResult.reconciliations.SCHEDULE4_RELATED_PARTY.status).toBe('PASS');
    expect(suiteResult.reconciliations.SCHEDULE5_CFE.status).toBe('PASS');
  });

  // ---------------------------------------------------------------------------
  // ACCEPTANCE TEST 2: ONE TRANSACTION DIFFERENCE RETURNS FAIL
  // ---------------------------------------------------------------------------
  test('Acceptance Test 2: One transaction difference in GL ↔ GST returns FAIL and identifies underlying transaction', () => {
    const unrecordedRevenueTx: TransactionRecord = {
      transactionId: 'TX-REV-UNRECORDED-99',
      sourceType: 'invoice',
      sourceId: 'INV-2026-999',
      entityId,
      outletId: 'MAIN',
      transactionDate: '2026-05-10',
      description: 'Unrecorded direct cash invoice',
      accountingCategory: 'revenue.sales',
      miraCategory: 'revenue',
      amount: 45000,
      gstAmount: 3600,
      totalAmount: 48600,
      accountingTreatment: 'REVENUE',
      incomeTaxTreatment: 'DEDUCTIBLE',
      gstTreatment: 'OUT_OF_SCOPE', // Excluded from return
      taxYear,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31',
      reviewStatus: 'APPROVED',
      auditHistory: [],
      createdAt: '2026-05-10T10:00:00Z'
    };

    const contextWithDiff: ComprehensiveReconciliationContext = {
      entityId,
      taxYear,
      transactions: [sampleRevenueTx1, unrecordedRevenueTx],
      gstReturns: [sampleGstReturn] // Return only has 100,000 sales instead of 145,000
    };

    const rec = reconcileGlGst(contextWithDiff);

    expect(rec.status).toBe('FAIL');
    expect(rec.totalSourceA).toBe(145000 + (8000 + 3600)); // GL Revenue + Output GST
    expect(rec.totalSourceB).toBe(100000 + 8000);          // Return Sales + Output GST
    expect(rec.totalDifference).toBe(45000 + 3600);

    // Must identify the underlying transaction
    expect(rec.underlyingTransactions.length).toBeGreaterThan(0);
    const offendingTx = rec.underlyingTransactions.find((t) => t.transactionId === 'TX-REV-UNRECORDED-99');
    expect(offendingTx).toBeDefined();
    expect(offendingTx?.amount).toBe(45000);
    expect(offendingTx?.discrepancyReason).toContain('GL Revenue of 45000 MVR not mirrored in GST Return');
    expect(offendingTx?.side).toBe('SOURCE_A');
  });

  // ---------------------------------------------------------------------------
  // ACCEPTANCE TEST 3: ROUNDING-ONLY DIFFERENCE FOLLOWS CONFIGURED TOLERANCE
  // ---------------------------------------------------------------------------
  test('Acceptance Test 3: Rounding-only difference follows configured tolerance (PASS vs WARNING vs FAIL)', () => {
    // 0.03 difference with default tolerance 0.05
    const status1 = computeStatus(0.03, 0.05, 1.00);
    expect(status1).toBe('PASS');

    // 0.50 difference with tolerance 0.05 and warningThreshold 1.00
    const status2 = computeStatus(0.50, 0.05, 1.00);
    expect(status2).toBe('WARNING');

    // 5.00 difference with tolerance 0.05 and warningThreshold 1.00
    const status3 = computeStatus(5.00, 0.05, 1.00);
    expect(status3).toBe('FAIL');

    // Test with custom tolerance configuration on GL ↔ GST
    const customToleranceContext: ComprehensiveReconciliationContext = {
      entityId,
      taxYear,
      transactions: [{
        ...sampleRevenueTx1,
        amount: 100000.04 // 4 cents rounding difference
      }],
      gstReturns: [sampleGstReturn] // 100000.00
    };

    // With standard 0.05 tolerance -> PASS
    const recStandard = reconcileGlGst(customToleranceContext, { tolerance: 0.05 });
    expect(recStandard.status).toBe('PASS');

    // With strict 0.01 tolerance -> WARNING / FAIL
    const recStrict = reconcileGlGst(customToleranceContext, { tolerance: 0.01, warningThreshold: 0.02 });
    expect(recStrict.status).toBe('FAIL');
  });

  // ---------------------------------------------------------------------------
  // ACCEPTANCE TEST 4: DRILL-DOWN FROM RECONCILIATION DIFFERENCE TO SOURCE TRANSACTION
  // ---------------------------------------------------------------------------
  test('Acceptance Test 4: User can drill from reconciliation difference to source transaction across modules', () => {
    // 1. AP ↔ NWT Discrepancy
    const foreignApInvoiceWithNoWht = {
      invoiceId: 'AP-INV-FOR-888',
      vendorName: 'Global Cloud Services Pte Ltd',
      isForeignVendor: true,
      currency: 'USD',
      amountMvr: 75000,
      whtDeducted: 0, // No withholding deducted!
      whtApplicable: true,
      reference: 'PO-2026-CLOUD-9',
      date: '2026-06-20'
    };

    const apContext: ComprehensiveReconciliationContext = {
      entityId,
      taxYear,
      apInvoices: [foreignApInvoiceWithNoWht]
    };

    const apRec = reconcileApNwt(apContext);
    expect(apRec.status).toBe('FAIL');
    expect(apRec.underlyingTransactions.length).toBe(1);
    const drilldown = apRec.underlyingTransactions[0];
    expect(drilldown.transactionId).toBe('AP-INV-FOR-888');
    expect(drilldown.amount).toBe(75000);
    expect(drilldown.discrepancyReason).toContain('Missing statutory NWT deduction');
    expect(drilldown.reference).toBe('PO-2026-CLOUD-9');

    // 2. Fixed Assets ↔ GL Discrepancy
    const unrecordedAssetTx: TransactionRecord = {
      transactionId: 'TX-FA-NEW-77',
      sourceType: 'invoice',
      sourceId: 'INV-MACH-01',
      entityId,
      outletId: 'FACTORY',
      transactionDate: '2026-07-15',
      description: 'Factory Generator Acquisition',
      accountingCategory: 'asset.plant_equipment',
      miraCategory: 'capital_asset',
      amount: 180000,
      gstAmount: 0,
      totalAmount: 180000,
      accountingTreatment: 'ASSET',
      incomeTaxTreatment: 'CAPITAL_ALLOWANCE',
      gstTreatment: 'INPUT_TAX',
      taxYear,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31',
      reviewStatus: 'APPROVED',
      auditHistory: [],
      createdAt: '2026-07-15T00:00:00Z'
    };

    const faContext: ComprehensiveReconciliationContext = {
      entityId,
      taxYear,
      transactions: [unrecordedAssetTx],
      fixedAssets: [] // FAR has 0 assets
    };

    const faRec = reconcileFixedAssetsGl(faContext);
    expect(faRec.status).toBe('FAIL');
    const faDrilldown = faRec.underlyingTransactions[0];
    expect(faDrilldown.transactionId).toBe('TX-FA-NEW-77');
    expect(faDrilldown.amount).toBe(180000);
    expect(faDrilldown.discrepancyReason).toContain('GL Asset addition of 180000 MVR not mirrored in FAR');
  });

  // ---------------------------------------------------------------------------
  // MODULE-SPECIFIC ACCEPTANCE TESTS
  // ---------------------------------------------------------------------------
  test('Module 6: P&L ↔ Income Tax detects base profit variance', () => {
    const pnlContext: ComprehensiveReconciliationContext = {
      entityId,
      taxYear,
      pnlReport: {
        netProfitBeforeTax: 250000
      },
      mira604Return: {
        formId: 'MIRA604-2026-01',
        formVersion: 'V25.1',
        submissionStatus: 'READY_FOR_FILING',
        generatedAt: '2026-05-01T00:00:00Z',
        sectionA_TaxpayerInfo: {
          tin: '1002003',
          taxpayerName: 'Test Corp',
          entityType: 'COMPANY',
          taxYear,
          accountingPeriodStart: '2026-01-01',
          accountingPeriodEnd: '2026-12-31'
        },
        sectionB_Schedule1PnL: {
          grossRevenue: 200000,
          costOfSales: 0,
          grossProfit: 200000,
          otherIncome: 0,
          operatingExpenses: 0,
          accountingProfitBeforeTax: 200000 // Discrepancy of 50,000 MVR
        },
        sectionC_TaxAdjustments: {
          itemizedAddBacks: [],
          totalAddBacks: 0,
          itemizedDeductions: [],
          totalDeductions: 0,
          netTaxAdjustments: 0
        },
        sectionD_CapitalAllowances: {
          totalClaimableCapitalAllowance: 0
        },
        sectionE_TaxableIncomeLoss: {
          adjustedTaxableProfitBeforeLoss: 200000,
          priorUnabsorbedLosses: 0,
          lossCarriedForwardApplied: 0,
          remainingUnabsorbedLoss: 0,
          netTaxableIncome: 200000,
          isTaxLoss: false,
          taxLossAmount: 0
        },
        sectionF_TaxComputation: {
          taxByBracket: [],
          totalTaxPayable: 30000,
          advanceTaxPaid: 0,
          interimTaxPaid: 0,
          withholdingTaxDeducted: 0,
          totalPrepayments: 0,
          netTaxDueOrRefundable: 30000,
          effectiveTaxRate: 15
        }
      }
    };

    const rec = reconcilePnlIncomeTax(pnlContext);
    expect(rec.status).toBe('FAIL');
    expect(rec.items[0].difference).toBe(50000);
    expect(rec.underlyingTransactions[0].discrepancyReason).toContain('P&L Net Profit before tax (250000.00) differs from MIRA 604 starting base Box B01');
  });

  test('Module 7: Tax Adjustments ↔ Tax Calculation detects omitted addbacks', () => {
    const adjContext: ComprehensiveReconciliationContext = {
      entityId,
      taxYear,
      taxAdjustments: [sampleAdjustment], // 15,000 addback
      mira604Return: {
        formId: 'MIRA604-2026-01',
        formVersion: 'V25.1',
        submissionStatus: 'READY_FOR_FILING',
        generatedAt: '2026-05-01T00:00:00Z',
        sectionA_TaxpayerInfo: {
          tin: '1002003',
          taxpayerName: 'Test Corp',
          entityType: 'COMPANY',
          taxYear,
          accountingPeriodStart: '2026-01-01',
          accountingPeriodEnd: '2026-12-31'
        },
        sectionB_Schedule1PnL: {
          grossRevenue: 100000,
          costOfSales: 0,
          grossProfit: 100000,
          otherIncome: 0,
          operatingExpenses: 0,
          accountingProfitBeforeTax: 100000
        },
        sectionC_TaxAdjustments: {
          itemizedAddBacks: [],
          totalAddBacks: 0, // 0 in form
          itemizedDeductions: [],
          totalDeductions: 0,
          netTaxAdjustments: 0
        },
        sectionD_CapitalAllowances: {
          totalClaimableCapitalAllowance: 0
        },
        sectionE_TaxableIncomeLoss: {
          adjustedTaxableProfitBeforeLoss: 100000,
          priorUnabsorbedLosses: 0,
          lossCarriedForwardApplied: 0,
          remainingUnabsorbedLoss: 0,
          netTaxableIncome: 100000,
          isTaxLoss: false,
          taxLossAmount: 0
        },
        sectionF_TaxComputation: {
          taxByBracket: [],
          totalTaxPayable: 15000,
          advanceTaxPaid: 0,
          interimTaxPaid: 0,
          withholdingTaxDeducted: 0,
          totalPrepayments: 0,
          netTaxDueOrRefundable: 15000,
          effectiveTaxRate: 15
        }
      }
    };

    const rec = reconcileTaxAdjustmentsTaxCalc(adjContext);
    expect(rec.status).toBe('FAIL');
    expect(rec.items[0].difference).toBe(15000);
    expect(rec.underlyingTransactions[0].transactionId).toBe('ADJ-2026-001');
  });

  test('Module 9: Schedule 2 ↔ Balance Sheet detects unbalance equation failure', () => {
    const sch2Context: ComprehensiveReconciliationContext = {
      entityId,
      taxYear,
      schedule2Data: {
        totalAssets: 1000000,
        totalEquityAndLiabilities: 950000 // Unbalanced by 50,000 MVR
      }
    };

    const rec = reconcileSchedule2BalanceSheet(sch2Context);
    expect(rec.status).toBe('FAIL');
    expect(rec.items[0].difference).toBe(50000);
    expect(rec.underlyingTransactions[0].discrepancyReason).toContain('Schedule 2 Balance Equation failure');
  });

  test('Module 11: Schedule 4 ↔ Related-Party detects transfer pricing volume variance', () => {
    const sch4Context: ComprehensiveReconciliationContext = {
      entityId,
      taxYear,
      schedule4Data: {
        totalRelatedPartyTransactions: 500000,
        totalTpTaxAdjustments: 20000
      },
      relatedPartyLedger: {
        totalRelatedPartyTransactions: 400000, // 100k difference
        totalTpAdjustments: 20000,
        transactions: [
          {
            transactionId: 'RP-TX-001',
            partyName: 'Holding Co Ltd',
            jurisdiction: 'Singapore',
            transactionType: 'Management Services',
            amount: 100000
          }
        ]
      }
    };

    const rec = reconcileSchedule4RelatedParty(sch4Context);
    expect(rec.status).toBe('FAIL');
    expect(rec.items[0].difference).toBe(100000);
    expect(rec.underlyingTransactions[0].transactionId).toBe('RP-TX-001');
  });

  test('Module 12: Schedule 5 ↔ CFE detects unapportioned CFE income', () => {
    const sch5Context: ComprehensiveReconciliationContext = {
      entityId,
      taxYear,
      schedule5Data: {
        attributableCfeIncome: 80000,
        claimedForeignTaxCredit: 8000
      },
      cfeSourceData: {
        totalAttributableIncome: 120000, // 40k variance
        claimedForeignTaxCredit: 8000,
        subsidiaries: [
          {
            entityName: 'Dubai Logistics FZE',
            country: 'UAE',
            shareholdingPct: 100,
            accountingProfit: 120000,
            attributableIncome: 120000,
            foreignTaxPaid: 8000
          }
        ]
      }
    };

    const rec = reconcileSchedule5Cfe(sch5Context);
    expect(rec.status).toBe('FAIL');
    expect(rec.items[0].difference).toBe(-40000);
    expect(rec.underlyingTransactions[0].transactionId).toBe('CFE-Dubai Logistics FZE');
  });

  test('Authoritative rules registry contains all 12 modules with statutory references', () => {
    const modules = Object.keys(AUTHORITATIVE_RECONCILIATION_RULES);
    expect(modules).toHaveLength(12);
    expect(modules).toContain('GL_GST');
    expect(modules).toContain('GL_NWT');
    expect(modules).toContain('AP_NWT');
    expect(modules).toContain('FIXED_ASSETS_GL');
    expect(modules).toContain('TAX_ASSETS_FIXED_ASSETS');
    expect(modules).toContain('PNL_INCOME_TAX');
    expect(modules).toContain('TAX_ADJUSTMENTS_TAX_CALC');
    expect(modules).toContain('MIRA604_TAX_ENGINE');
    expect(modules).toContain('SCHEDULE2_BALANCE_SHEET');
    expect(modules).toContain('SCHEDULE3_NET_WORTH');
    expect(modules).toContain('SCHEDULE4_RELATED_PARTY');
    expect(modules).toContain('SCHEDULE5_CFE');

    for (const key of modules) {
      const rule = AUTHORITATIVE_RECONCILIATION_RULES[key as any];
      expect(rule.ruleId).toBeDefined();
      expect(rule.name).toBeDefined();
      expect(rule.legalReference).toBeDefined();
      expect(rule.tolerance).toBeGreaterThan(0);
      expect(rule.active).toBe(true);
    }
  });
});
