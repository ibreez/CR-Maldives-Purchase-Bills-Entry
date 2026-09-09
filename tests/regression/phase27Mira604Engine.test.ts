import { describe, test, expect } from 'vitest';
import {
  MIRA604_V25_1_DEFINITION,
  MIRA604_V25_1_FIELDS,
  MIRA604Generator,
  MIRA604Calculation,
  MIRA604Validation,
  MIRA604AccountingSourceData
} from '../../src/regulatory/forms';
import { defaultIncomeTaxEngine } from '../../src/services/tax/incomeTaxEngineService';

describe('Phase 27 - MIRA 604 Versioned Form Engine (v25.1)', () => {

  const sampleSourceData: MIRA604AccountingSourceData = {
    taxpayer: {
      tin: '1000200300',
      taxpayerName: 'Male Trading Enterprise Pvt Ltd',
      taxpayerType: 'COMPANY',
      taxYear: 2026,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31',
      businessActivity: 'Wholesale & Retail Commercial Trading',
      presentationCurrency: 'MVR',
      groupFactor: 1,
      contactEmail: 'tax@maletrading.mv',
      contactPhone: '+9603300000'
    },
    pnl: {
      grossRevenue: 2500000,
      costOfSales: 1200000,
      dividendIncome: 10000,
      interestIncome: 5000,
      rentalIncome: 15000,
      otherOperatingIncome: 20000,
      salariesAndWages: 300000,
      rentExpense: 120000,
      utilitiesExpense: 40000,
      bookDepreciationExpense: 80000,
      financeCosts: 10000,
      legalProfessionalFees: 20000,
      travelEntertainment: 15000,
      repairsMaintenance: 15000,
      otherOperatingExpenses: 50000,
      glAccountReferences: {
        GROSS_REVENUE: 'GL:4000-SALES',
        COST_OF_SALES: 'GL:5000-COS'
      }
    },
    taxAdjustments: [
      {
        miraCode: 'ADJ-DEPR',
        adjustmentType: 'BOOK_DEPRECIATION',
        category: 'ADDITION',
        amount: 80000,
        description: 'Add-back book depreciation'
      },
      {
        miraCode: 'ADJ-FINES',
        adjustmentType: 'STATUTORY_FINE',
        category: 'ADDITION',
        amount: 20000,
        description: 'Statutory late payment fine'
      },
      {
        miraCode: 'ADJ-EXEMPT',
        adjustmentType: 'EXEMPT_INCOME',
        category: 'DEDUCTION',
        amount: 30000,
        description: 'Exempt foreign income'
      }
    ],
    capitalAllowances: {
      plantMachinery: 70000,
      electronicItEquipment: 50000,
      assetRegisterReferences: {
        PLANT_MACHINERY: 'FA:REG-PM-01',
        IT_EQUIPMENT: 'FA:REG-IT-02'
      }
    },
    lossSchedule: {
      priorUnabsorbedLosses: 50000,
      expiredLosses: 0,
      lossRecords: [
        {
          taxYear: 2024,
          initialLoss: 50000,
          utilizedSoFar: 0,
          unabsorbedBalance: 50000
        }
      ]
    },
    prepaymentsAndWithholdings: {
      advanceTaxPaid: 20000,
      interimTax1Paid: 15000,
      employeeWhtCredit: 0,
      nonResidentWhtCredit: 5000
    },
    declaration: {
      declarantName: 'Ahmed Hassan',
      declarantDesignation: 'DIRECTOR',
      declarantIdOrPassport: 'A123456',
      declarationDate: '2027-04-15',
      confirmationAccepted: true
    }
  };

  test('Requirement 1: All required v25.1 sections and fields are represented with full metadata schema', () => {
    expect(MIRA604_V25_1_DEFINITION.formCode).toBe('MIRA_604');
    expect(MIRA604_V25_1_DEFINITION.version).toBe('v25.1');
    expect(MIRA604_V25_1_DEFINITION.effectiveFromTaxYear).toBe(2024);
    expect(MIRA604_V25_1_DEFINITION.sections.length).toBe(8);

    // Verify all fields define required properties
    for (const field of MIRA604_V25_1_FIELDS) {
      expect(field.fieldCode).toBeDefined();
      expect(field.fieldCode.startsWith('F604_')).toBe(true);
      expect(field.label).toBeDefined();
      expect(field.dataType).toBeDefined();
      expect(field.source).toBeDefined();
      expect(field.applicability).toBeDefined();
      expect(field.ruleVersion).toBe('v25.1');
      expect(field.sectionId).toBeDefined();
    }

    // Check specific critical fields
    expect(MIRA604_V25_1_DEFINITION.getField('F604_A01_TIN')).toBeDefined();
    expect(MIRA604_V25_1_DEFINITION.getField('F604_B01_GROSS_REVENUE')).toBeDefined();
    expect(MIRA604_V25_1_DEFINITION.getField('F604_B03_GROSS_PROFIT')).toBeDefined();
    expect(MIRA604_V25_1_DEFINITION.getField('F604_C13_NET_TAX_ADJUSTMENTS')).toBeDefined();
    expect(MIRA604_V25_1_DEFINITION.getField('F604_D09_TOTAL_CAPITAL_ALLOWANCE')).toBeDefined();
    expect(MIRA604_V25_1_DEFINITION.getField('F604_E08_NET_TAXABLE_INCOME')).toBeDefined();
    expect(MIRA604_V25_1_DEFINITION.getField('F604_F03_GROSS_TAX_LIABILITY')).toBeDefined();
    expect(MIRA604_V25_1_DEFINITION.getField('F604_G08_NET_BALANCE_DUE_OR_REFUNDABLE')).toBeDefined();
    expect(MIRA604_V25_1_DEFINITION.getField('F604_H05_CONFIRMATION_ACCEPTED')).toBeDefined();
  });

  test('Requirement 2: Generator populates all Sections A through H correctly and validates successfully', () => {
    const result = MIRA604Generator.generateForm(sampleSourceData, 'v25.1');

    if (!result.formInstance.validationResult.isValid) {
      console.error('Validation errors:', result.formInstance.validationResult.errors);
    }

    expect(result.formInstance).toBeDefined();
    expect(result.formInstance.formId).toBe('MIRA604-2026-1000200300');
    expect(result.formInstance.version).toBe('v25.1');
    expect(result.formInstance.status).toBe('VALIDATED');
    expect(result.formInstance.validationResult.isValid).toBe(true);

    const v = result.formInstance.values;

    // Section A: Taxpayer & Period
    expect(v['F604_A01_TIN']).toBe('1000200300');
    expect(v['F604_A02_TAXPAYER_NAME']).toBe('Male Trading Enterprise Pvt Ltd');
    expect(v['F604_A07_ACCOUNTING_DAYS']).toBe(365);

    // Section B: PnL
    // Gross revenue: 2,500,000, Cost of sales: 1,200,000 => GP: 1,300,000
    expect(v['F604_B03_GROSS_PROFIT']).toBe(1300000);
    // Other income: 10,000 + 5,000 + 15,000 + 20,000 = 50,000
    expect(v['F604_B11_TOTAL_OTHER_INCOME']).toBe(50000);
    // Total expenses: 300k + 120k + 40k + 80k + 10k + 20k + 15k + 15k + 50k = 650,000
    expect(v['F604_B21_TOTAL_OPERATING_EXPENSES']).toBe(650000);
    // Net profit: 1,300,000 + 50,000 - 650,000 = 700,000
    expect(v['F604_B22_NET_PROFIT_BEFORE_TAX']).toBe(700000);

    // Section C: Tax Adjustments
    // Additions: 80,000 (depr) + 20,000 (fines) = 100,000
    expect(v['F604_C08_TOTAL_TAX_ADDITIONS']).toBe(100000);
    // Deductions: 30,000 (exempt income)
    expect(v['F604_C12_TOTAL_TAX_DEDUCTIONS']).toBe(30000);
    // Net adjustments: 100,000 - 30,000 = 70,000
    expect(v['F604_C13_NET_TAX_ADJUSTMENTS']).toBe(70000);

    // Section D: Capital Allowance
    // 70,000 + 50,000 = 120,000
    expect(v['F604_D09_TOTAL_CAPITAL_ALLOWANCE']).toBe(120000);

    // Section E: Taxable Profit & Loss Relief
    // Adjusted taxable profit: 700,000 (NP) + 70,000 (Net Adj) - 120,000 (CA) = 650,000
    expect(v['F604_E01_ADJ_TAXABLE_PROFIT_BEFORE_LOSS']).toBe(650000);
    // Prior loss utilized: 50,000
    expect(v['F604_E05_LOSS_RELIEF_UTILIZED']).toBe(50000);
    // Net taxable income: 650,000 - 50,000 = 600,000
    expect(v['F604_E08_NET_TAXABLE_INCOME']).toBe(600000);

    // Section F: Tax Liability
    // Company standard bracket: 0 - 500,000 @ 0%, (600,000 - 500,000) = 100,000 @ 15% = 15,000
    expect(v['F604_F03_GROSS_TAX_LIABILITY']).toBe(15000);
    expect(v['F604_F07_NET_TAX_LIABILITY']).toBe(15000);

    // Section G: Prepayments & Settlement
    // Total prepayments: 20k (adv) + 15k (interim) + 5k (WHT) = 40,000
    expect(v['F604_G07_TOTAL_PREPAYMENTS_AND_WHT']).toBe(40000);
    // Net balance: 15,000 - 40,000 = -25,000 (Refundable)
    expect(v['F604_G08_NET_BALANCE_DUE_OR_REFUNDABLE']).toBe(-25000);
    expect(v['F604_G09_FINAL_TAX_PAYABLE']).toBe(0);
    expect(v['F604_G10_FINAL_REFUND_CLAIMABLE']).toBe(25000);
  });

  test('Requirement 3: Generated values reconcile exactly with Income Tax Engine (Phase 26 / RuleResolver)', () => {
    const result = MIRA604Generator.generateForm(sampleSourceData, 'v25.1');
    const netTaxableIncome = result.formInstance.values['F604_E08_NET_TAXABLE_INCOME'];

    const engineTax = defaultIncomeTaxEngine.calculateTaxLiability(
      netTaxableIncome,
      'COMPANY',
      {
        taxYear: 2026,
        accountingDays: 365,
        groupFactor: 1
      }
    );

    expect(result.formInstance.values['F604_F03_GROSS_TAX_LIABILITY']).toBe(engineTax.totalGrossTaxLiability);
    expect(result.formInstance.values['F604_F01_TAX_FREE_THRESHOLD']).toBe(engineTax.proRatedThreshold);
    expect(result.formInstance.values['F604_F02_TAX_BRACKET_DETAILS']).toEqual(engineTax.brackets);
  });

  test('Requirement 4: Every generated value has a complete source trace', () => {
    const result = MIRA604Generator.generateForm(sampleSourceData, 'v25.1');
    const traces = result.formInstance.traces;

    // Check that every value field has a corresponding trace entry
    for (const [key, value] of Object.entries(result.formInstance.values)) {
      const trace = traces[key];
      expect(trace, `Missing trace for field ${key}`).toBeDefined();
      expect(trace.fieldCode).toBe(key);
      expect(trace.sourceType).toBeDefined();
      expect(trace.sourceDescription).toBeDefined();
      expect(trace.calculationTimestamp).toBeDefined();

      if (trace.sourceType === 'CALCULATED') {
        expect(trace.appliedFormula).toBeDefined();
      }
    }

    // Verify specific traces
    expect(traces['F604_B01_GROSS_REVENUE'].sourceReferenceId).toBe('GL:4000-SALES');
    expect(traces['F604_D02_CA_PLANT_MACHINERY'].sourceReferenceId).toBe('FA:REG-PM-01');
    expect(traces['F604_F03_GROSS_TAX_LIABILITY'].appliedFormula).toContain('Taxable Income');
  });

  test('Requirement 5: Invalid required fields and arithmetic inconsistencies are rejected', () => {
    // Missing TIN
    const invalidData: MIRA604AccountingSourceData = {
      ...sampleSourceData,
      taxpayer: {
        ...sampleSourceData.taxpayer,
        tin: ''
      }
    };

    const result = MIRA604Generator.generateForm(invalidData, 'v25.1');
    expect(result.formInstance.status).toBe('REJECTED');
    expect(result.formInstance.validationResult.isValid).toBe(false);
    expect(result.formInstance.validationResult.errors.some(e => e.fieldCode === 'F604_A01_TIN')).toBe(true);

    // Invalid date order: start > end
    const invalidDatesData: MIRA604AccountingSourceData = {
      ...sampleSourceData,
      taxpayer: {
        ...sampleSourceData.taxpayer,
        accountingPeriodStart: '2026-12-31',
        accountingPeriodEnd: '2026-01-01'
      }
    };
    const dateResult = MIRA604Generator.generateForm(invalidDatesData, 'v25.1');
    expect(dateResult.formInstance.validationResult.isValid).toBe(false);
    expect(dateResult.formInstance.validationResult.errors.some(e => e.fieldCode === 'F604_A05_PERIOD_START')).toBe(true);

    // Unaccepted declaration
    const unacceptedDeclData: MIRA604AccountingSourceData = {
      ...sampleSourceData,
      declaration: {
        ...sampleSourceData.declaration!,
        confirmationAccepted: false
      }
    };
    const declResult = MIRA604Generator.generateForm(unacceptedDeclData, 'v25.1');
    expect(declResult.formInstance.validationResult.isValid).toBe(false);
    expect(declResult.formInstance.validationResult.errors.some(e => e.fieldCode === 'F604_H05_CONFIRMATION_ACCEPTED')).toBe(true);
  });

  test('Requirement 6: Direct arithmetic discrepancy is caught by MIRA604Validation', () => {
    const rawValues = {
      F604_A01_TIN: '1000200300',
      F604_A02_TAXPAYER_NAME: 'Test Co',
      F604_A03_TAXPAYER_TYPE: 'COMPANY',
      F604_A04_TAX_YEAR: 2026,
      F604_A05_PERIOD_START: '2026-01-01',
      F604_A06_PERIOD_END: '2026-12-31',
      F604_A07_ACCOUNTING_DAYS: 365,
      F604_A09_PRESENTATION_CURRENCY: 'MVR',
      F604_B01_GROSS_REVENUE: 100000,
      F604_B02_COST_OF_SALES: 40000,
      F604_B03_GROSS_PROFIT: 999999, // Intentional mismatch (100k - 40k != 999k)
      F604_B11_TOTAL_OTHER_INCOME: 0,
      F604_B21_TOTAL_OPERATING_EXPENSES: 0,
      F604_B22_NET_PROFIT_BEFORE_TAX: 60000,
      F604_C08_TOTAL_TAX_ADDITIONS: 0,
      F604_C12_TOTAL_TAX_DEDUCTIONS: 0,
      F604_C13_NET_TAX_ADJUSTMENTS: 0,
      F604_D09_TOTAL_CAPITAL_ALLOWANCE: 0,
      F604_E01_ADJ_TAXABLE_PROFIT_BEFORE_LOSS: 60000,
      F604_E04_VALID_LOSSES_BROUGHT_FORWARD: 0,
      F604_E05_LOSS_RELIEF_UTILIZED: 0,
      F604_E06_CURRENT_YEAR_TAX_LOSS: 0,
      F604_E07_REMAINING_UNABSORBED_LOSS_CF: 0,
      F604_E08_NET_TAXABLE_INCOME: 60000,
      F604_F02_TAX_BRACKET_DETAILS: [],
      F604_F03_GROSS_TAX_LIABILITY: 0,
      F604_F06_TOTAL_TAX_CREDITS: 0,
      F604_F07_NET_TAX_LIABILITY: 0,
      F604_G07_TOTAL_PREPAYMENTS_AND_WHT: 0,
      F604_G08_NET_BALANCE_DUE_OR_REFUNDABLE: 0,
      F604_G09_FINAL_TAX_PAYABLE: 0,
      F604_G10_FINAL_REFUND_CLAIMABLE: 0,
      F604_H01_DECLARANT_NAME: 'Ahmed',
      F604_H02_DECLARANT_DESIGNATION: 'DIRECTOR',
      F604_H03_DECLARANT_ID_PASSPORT: 'A123',
      F604_H04_DECLARATION_DATE: '2026-04-01',
      F604_H05_CONFIRMATION_ACCEPTED: true
    };

    const valResult = MIRA604Validation.validate(rawValues, 'v25.1');
    expect(valResult.isValid).toBe(false);
    expect(valResult.errors.some(e => e.fieldCode === 'F604_B03_GROSS_PROFIT')).toBe(true);
  });

  test('Requirement 7: MIRAconnect electronic filing JSON is properly structured and serializable', () => {
    const result = MIRA604Generator.generateForm(sampleSourceData, 'v25.1');

    expect(typeof result.miraconnectJson).toBe('string');
    const parsed = JSON.parse(result.miraconnectJson);

    expect(parsed.header.formId).toBe('MIRA604-2026-1000200300');
    expect(parsed.header.formVersion).toBe('V25.1');
    expect(parsed.taxpayer.tin).toBe('1000200300');
    expect(parsed.schedule1_ProfitLoss.grossProfit).toBe(1300000);
    expect(parsed.taxComputation.grossTaxLiability).toBe(15000);
    expect(parsed.settlement.netBalanceDueOrRefundable).toBe(-25000);
    expect(parsed.audit.isValid).toBe(true);
    expect(parsed.audit.tracesCount).toBeGreaterThan(20);
  });

});
