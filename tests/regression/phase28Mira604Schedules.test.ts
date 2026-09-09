import { describe, it, expect } from 'vitest';
import { 
  Schedule2, 
  Schedule3, 
  Schedule4, 
  Schedule5,
  MIRA604ScheduleEngine,
  MIRA604Generator,
  MIRA604AccountingSourceData,
  Schedule2BalanceSheetData,
  Schedule3PersonalNetWorthData,
  Schedule4SourceData,
  Schedule5SourceData
} from '../../src/regulatory/forms/mira604';

describe('Phase 28 — MIRA 604 Schedule Engine (v25.1)', () => {
  // =========================================================================
  // 1. Schedule 2: Statement of Financial Position
  // =========================================================================
  describe('Schedule 2: Statement of Financial Position (v25.1)', () => {
    const validBalanceSheet: Schedule2BalanceSheetData = {
      nonCurrentAssets: {
        propertyPlantEquipment: 1500000,
        investmentProperty: 500000,
        intangibleAssets: 200000,
        longTermInvestments: 300000,
        otherNonCurrentAssets: 50000
      },
      currentAssets: {
        inventories: 450000,
        tradeAndOtherReceivables: 350000,
        cashAndCashEquivalents: 250000,
        shortTermInvestments: 100000,
        prepaymentsAndOtherCurrentAssets: 50000
      },
      equity: {
        shareCapital: 1000000,
        retainedEarnings: 1250000,
        otherReserves: 100000
      },
      nonCurrentLiabilities: {
        longTermBorrowings: 800000,
        deferredTaxLiabilities: 100000,
        otherNonCurrentLiabilities: 50000
      },
      currentLiabilities: {
        tradeAndOtherPayables: 300000,
        shortTermBorrowings: 100000,
        currentTaxPayable: 40000,
        otherCurrentLiabilities: 10000
      },
      glAccountReferences: {
        PPE: 'GL-1500',
        CASH: 'GL-1000',
        SHARE_CAPITAL: 'GL-3000',
        PAYABLES: 'GL-2000'
      }
    };

    it('reconciles to balance sheet and validates balanced financial position', () => {
      const sch2 = Schedule2.generate(validBalanceSheet, 'COMPANY', 2024);

      expect(sch2.isApplicable).toBe(true);
      expect(sch2.version).toBe('v25.1');
      expect(sch2.status).toBe('VALIDATED');
      expect(sch2.validationResult.isValid).toBe(true);

      // Total Non-Current Assets = 1.5M + 500k + 200k + 300k + 50k = 2,550,000
      expect(sch2.values['SCH2_A06_TOTAL_NON_CURRENT_ASSETS']).toBe(2550000);

      // Total Current Assets = 450k + 350k + 250k + 100k + 50k = 1,200,000
      expect(sch2.values['SCH2_A12_TOTAL_CURRENT_ASSETS']).toBe(1200000);

      // Total Assets = 2.55M + 1.2M = 3,750,000
      expect(sch2.values['SCH2_A13_TOTAL_ASSETS']).toBe(3750000);

      // Total Equity = 1M + 1.25M + 100k = 2,350,000
      expect(sch2.values['SCH2_B04_TOTAL_EQUITY']).toBe(2350000);

      // Total Non-Current Liabilities = 800k + 100k + 50k = 950,000
      expect(sch2.values['SCH2_B08_TOTAL_NON_CURRENT_LIABILITIES']).toBe(950000);

      // Total Current Liabilities = 300k + 100k + 40k + 10k = 450,000
      expect(sch2.values['SCH2_B13_TOTAL_CURRENT_LIABILITIES']).toBe(450000);

      // Total Liabilities = 950k + 450k = 1,400,000
      expect(sch2.values['SCH2_B14_TOTAL_LIABILITIES']).toBe(1400000);

      // Total Equity & Liabilities = 2.35M + 1.4M = 3,750,000
      expect(sch2.values['SCH2_B15_TOTAL_EQUITY_AND_LIABILITIES']).toBe(3750000);

      // Variance must be exactly 0
      expect(sch2.values['SCH2_C01_BALANCE_CHECK_VARIANCE']).toBe(0);

      // Verify traces
      expect(sch2.traces['SCH2_A01_PPE'].sourceReferenceId).toBe('GL-1500');
      expect(sch2.traces['SCH2_A13_TOTAL_ASSETS'].sourceType).toBe('CALCULATED');
    });

    it('rejects out-of-balance balance sheet with structured diagnostic error', () => {
      const unbalancedBalanceSheet: Schedule2BalanceSheetData = {
        ...validBalanceSheet,
        equity: {
          ...validBalanceSheet.equity,
          shareCapital: 900000 // Creates a 100k discrepancy
        }
      };

      const sch2 = Schedule2.generate(unbalancedBalanceSheet, 'COMPANY', 2024);

      expect(sch2.status).toBe('REJECTED');
      expect(sch2.validationResult.isValid).toBe(false);
      expect(sch2.values['SCH2_C01_BALANCE_CHECK_VARIANCE']).toBe(100000);
      expect(sch2.validationResult.errors.some(e => e.fieldCode === 'SCH2_C01_BALANCE_CHECK_VARIANCE')).toBe(true);
    });

    it('is not applicable for individual with no balance sheet data submitted', () => {
      const sch2 = Schedule2.generate(undefined, 'INDIVIDUAL', 2024);
      expect(sch2.isApplicable).toBe(false);
      expect(sch2.status).toBe('NOT_APPLICABLE');
    });
  });

  // =========================================================================
  // 2. Schedule 3: Statement of Net Worth Excluding Business
  // =========================================================================
  describe('Schedule 3: Statement of Net Worth Excluding Business (v25.1)', () => {
    const personalNetWorthData: Schedule3PersonalNetWorthData = {
      personalAssets: {
        immovableProperties: 5000000, // Residential apartment in Male'
        vehiclesAndVessels: 450000,   // Personal car & speedboat
        bankDepositsAndCash: 850000,  // Savings accounts
        sharesAndSecurities: 300000,  // Portfolio
        jewelryAndValuables: 150000,  // Jewelry
        personalReceivables: 50000,   // Loan to family
        otherPersonalAssets: 25000
      },
      personalLiabilities: {
        housingMortgages: 1800000,    // Housing development loan
        personalBankLoans: 120000,    // Vehicle auto loan
        creditCardsAndOther: 30000    // Card balance
      },
      previousYearNetWorth: 4500000
    };

    it('handles applicable non-business net worth for individual taxpayer', () => {
      const sch3 = Schedule3.generate(personalNetWorthData, 'INDIVIDUAL', 2024);

      expect(sch3.isApplicable).toBe(true);
      expect(sch3.version).toBe('v25.1');
      expect(sch3.status).toBe('VALIDATED');
      expect(sch3.validationResult.isValid).toBe(true);

      // Total Personal Assets = 5M + 450k + 850k + 300k + 150k + 50k + 25k = 6,825,000
      expect(sch3.values['SCH3_A08_TOTAL_PERSONAL_ASSETS']).toBe(6825000);

      // Total Personal Liabilities = 1.8M + 120k + 30k = 1,950,000
      expect(sch3.values['SCH3_B04_TOTAL_PERSONAL_LIABILITIES']).toBe(1950000);

      // Net Non-Business Worth = 6,825,000 - 1,950,000 = 4,875,000
      expect(sch3.values['SCH3_C01_NET_NON_BUSINESS_WORTH']).toBe(4875000);

      // Movement = 4,875,000 - 4,500,000 = 375,000
      expect(sch3.values['SCH3_C03_NET_WORTH_MOVEMENT']).toBe(375000);

      // Traces
      expect(sch3.traces['SCH3_C01_NET_NON_BUSINESS_WORTH'].sourceType).toBe('CALCULATED');
    });

    it('is not applicable to corporate entities', () => {
      const sch3 = Schedule3.generate(personalNetWorthData, 'COMPANY', 2024);
      expect(sch3.isApplicable).toBe(false);
      expect(sch3.status).toBe('NOT_APPLICABLE');
      expect(sch3.applicabilityReason).toContain('applies only to individual taxpayers');
    });
  });

  // =========================================================================
  // 3. Schedule 4: Reporting of International Transactions with Associates
  // =========================================================================
  describe('Schedule 4: International Transactions with Associates (v25.1)', () => {
    const tpData: Schedule4SourceData = {
      hasInternationalAssociateTransactions: true,
      tpMasterFileHeld: true,
      tpLocalFileHeld: true,
      transactions: [
        {
          associateName: 'Singapore Hospitality Management Pte Ltd',
          associateTinOrRegistration: 'SG-201829102K',
          countryOfResidence: 'SG',
          relationshipType: 'FOREIGN_PARENT',
          ownershipPercentage: 100,
          transactionCategory: 'MANAGEMENT_FEES',
          transferPricingMethod: 'TNMM',
          recordedAmount: 500000,
          armsLengthAmount: 400000, // Overstated expense: recorded 500k vs arm's length 400k -> 100k TP add-back
          tpDocumentationHeld: true
        },
        {
          associateName: 'Dubai Global Resort Supplies FZC',
          associateTinOrRegistration: 'AE-982103',
          countryOfResidence: 'AE',
          relationshipType: 'FELLOW_SUBSIDIARY',
          ownershipPercentage: 100,
          transactionCategory: 'PURCHASE_OF_GOODS',
          transferPricingMethod: 'COST_PLUS',
          recordedAmount: 1200000,
          armsLengthAmount: 1150000, // Overstated purchase: 50k TP add-back
          tpDocumentationHeld: true
        },
        {
          associateName: 'London Marketing & Booking UK Ltd',
          associateTinOrRegistration: 'GB-10293847',
          countryOfResidence: 'GB',
          relationshipType: 'FELLOW_SUBSIDIARY',
          ownershipPercentage: 100,
          transactionCategory: 'SERVICES_PROVIDED',
          transferPricingMethod: 'CUP',
          recordedAmount: 300000,
          armsLengthAmount: 350000, // Understated revenue: recorded 300k vs arm's length 350k -> 50k TP add-back
          tpDocumentationHeld: true
        }
      ]
    };

    it('is triggered by applicable related-party transactions and calculates TP adjustments', () => {
      const sch4 = Schedule4.generate(tpData, 'COMPANY', 2024);

      expect(sch4.isApplicable).toBe(true);
      expect(sch4.version).toBe('v25.1');
      expect(sch4.status).toBe('VALIDATED');
      expect(sch4.validationResult.isValid).toBe(true);

      // Records Count
      expect(sch4.values['SCH4_A02_ASSOCIATE_RECORDS_COUNT']).toBe(3);

      // Purchases = 1,200,000
      expect(sch4.values['SCH4_B02_TOTAL_PURCHASES_INBOUND']).toBe(1200000);

      // Services Provided = 300,000
      expect(sch4.values['SCH4_B03_TOTAL_SERVICES_PROVIDED']).toBe(300000);

      // Management Fees = 500,000
      expect(sch4.values['SCH4_B07_TOTAL_MANAGEMENT_GUARANTEES']).toBe(500000);

      // Total Gross Recorded = 500k + 1.2M + 300k = 2,000,000
      expect(sch4.values['SCH4_B08_TOTAL_GROSS_RECORDED_VALUE']).toBe(2000000);

      // Total Arm's Length = 400k + 1.15M + 350k = 1,900,000
      expect(sch4.values['SCH4_B09_TOTAL_ARMS_LENGTH_VALUE']).toBe(1900000);

      // Total TP Tax Adjustment = (500k - 400k) + (1.2M - 1.15M) + (350k - 300k) = 100k + 50k + 50k = 200,000
      expect(sch4.values['SCH4_C01_TOTAL_TP_TAX_ADJUSTMENT']).toBe(200000);

      // Items detail
      expect(sch4.items?.length).toBe(3);
      expect(sch4.items?.[0].adjustmentAmount).toBe(100000);
      expect(sch4.items?.[1].adjustmentAmount).toBe(50000);
      expect(sch4.items?.[2].adjustmentAmount).toBe(50000);
    });

    it('is not applicable when no international related-party transactions occur', () => {
      const sch4 = Schedule4.generate(undefined, 'COMPANY', 2024);
      expect(sch4.isApplicable).toBe(false);
      expect(sch4.status).toBe('NOT_APPLICABLE');
    });

    it('rejects domestic transaction entries or invalid ownership bounds', () => {
      const invalidTpData: Schedule4SourceData = {
        hasInternationalAssociateTransactions: true,
        transactions: [
          {
            associateName: 'Local Male Branch',
            countryOfResidence: 'MV', // Invalid for international associate schedule
            relationshipType: 'BRANCH_OFFICE',
            ownershipPercentage: 150, // Invalid > 100%
            transactionCategory: 'MANAGEMENT_FEES',
            transferPricingMethod: 'TNMM',
            recordedAmount: 100000,
            armsLengthAmount: 100000,
            tpDocumentationHeld: true
          }
        ]
      };

      const sch4 = Schedule4.generate(invalidTpData, 'COMPANY', 2024);
      expect(sch4.status).toBe('REJECTED');
      expect(sch4.validationResult.isValid).toBe(false);
      expect(sch4.validationResult.errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // 4. Schedule 5: Controlled Foreign Entities (CFE)
  // =========================================================================
  describe('Schedule 5: Share of Taxable Income from Controlled Foreign Entities (v25.1)', () => {
    const cfeData: Schedule5SourceData = {
      hasControlledForeignEntities: true,
      controlledForeignEntities: [
        {
          cfeName: 'Mauritius Holding Subsidiary Ltd',
          countryOfIncorporation: 'MU',
          countryOfTaxResidence: 'MU',
          directOwnershipPercentage: 80,
          totalControlPercentage: 80,
          accountingNetProfit: 1000000,
          foreignIncomeTaxPaid: 30000, // 3% effective rate (low tax jurisdiction)
          exemptionReason: 'NOT_EXEMPT'
        },
        {
          cfeName: 'Colombo Active Trading Operations (Pvt) Ltd',
          countryOfIncorporation: 'LK',
          countryOfTaxResidence: 'LK',
          directOwnershipPercentage: 100,
          totalControlPercentage: 100,
          accountingNetProfit: 500000,
          foreignIncomeTaxPaid: 150000, // 30% tax rate
          exemptionReason: 'ACTIVE_BUSINESS_EXCEPTION' // Exempt
        }
      ]
    };

    it('is triggered by applicable CFE conditions and calculates attributable income and FTC', () => {
      const sch5 = Schedule5.generate(cfeData, 'COMPANY', 2024);

      expect(sch5.isApplicable).toBe(true);
      expect(sch5.version).toBe('v25.1');
      expect(sch5.status).toBe('VALIDATED');
      expect(sch5.validationResult.isValid).toBe(true);

      // Records Count = 2
      expect(sch5.values['SCH5_A02_CFE_RECORDS_COUNT']).toBe(2);

      // Total Accounting Profit = 1M + 500k = 1,500,000
      expect(sch5.values['SCH5_B01_TOTAL_CFE_ACCOUNTING_PROFIT']).toBe(1500000);

      // Total Foreign Tax Paid = 30k + 150k = 180,000
      expect(sch5.values['SCH5_B02_TOTAL_CFE_FOREIGN_TAX_PAID']).toBe(180000);

      // Attributable Taxable Income under Section 20:
      // Entity 1 (Non-exempt): 1,000,000 * 80% = 800,000
      // Entity 2 (Exempt): 0
      // Total Attributable = 800,000
      expect(sch5.values['SCH5_C01_TOTAL_ATTRIBUTABLE_CFE_INCOME']).toBe(800000);

      // Allowable FTC share on non-exempt income: 30,000 * 80% = 24,000
      expect(sch5.values['SCH5_C02_TOTAL_CFE_FOREIGN_TAX_CREDIT']).toBe(24000);

      // Items detail
      expect(sch5.items?.[0].effectiveForeignTaxRate).toBe(3);
      expect(sch5.items?.[0].attributableTaxableIncome).toBe(800000);
      expect(sch5.items?.[1].effectiveForeignTaxRate).toBe(30);
      expect(sch5.items?.[1].attributableTaxableIncome).toBe(0);
    });

    it('is not applicable when no CFEs exist', () => {
      const sch5 = Schedule5.generate(undefined, 'COMPANY', 2024);
      expect(sch5.isApplicable).toBe(false);
      expect(sch5.status).toBe('NOT_APPLICABLE');
    });
  });

  // =========================================================================
  // 5. End-to-End Orchestration & MIRAconnect Payload Integration
  // =========================================================================
  describe('Full Return Generation with Statutory Schedules', () => {
    it('seamlessly integrates all applicable schedules into MIRA 604 return and MIRAconnect payload', () => {
      const completeCorporateSourceData: MIRA604AccountingSourceData = {
        taxpayer: {
          tin: '1004882GST001',
          taxpayerName: 'Velana Horizon Resorts Pvt Ltd',
          taxpayerType: 'COMPANY',
          taxYear: 2024,
          accountingPeriodStart: '2024-01-01',
          accountingPeriodEnd: '2024-12-31',
          businessActivity: 'Luxury Resort & Marine Hospitality Operations',
          presentationCurrency: 'MVR'
        },
        pnl: {
          grossRevenue: 85000000,
          costOfSales: 32000000,
          otherOperatingIncome: 1500000,
          salariesAndWages: 18000000,
          rentExpense: 6000000,
          utilitiesExpense: 3500000,
          bookDepreciationExpense: 4200000,
          financeCosts: 1800000,
          repairsMaintenance: 2000000,
          otherOperatingExpenses: 5000000
        },
        taxAdjustments: [
          {
            description: 'Depreciation add-back',
            amount: 4200000,
            category: 'ADD_BACK'
          }
        ],
        capitalAllowances: {
          buildingsStructures: 2500000,
          plantMachinery: 1200000,
          vehiclesVessels: 800000
        },
        prepaymentsAndWithholdings: {
          advanceTaxPaid: 1000000,
          interimTax1Paid: 1200000,
          interimTax2Paid: 1200000
        },
        declaration: {
          declarantName: 'Ahmed Zahir',
          declarantDesignation: 'MANAGING_DIRECTOR',
          declarantIdOrPassport: 'A089123',
          declarationDate: '2025-06-15',
          confirmationAccepted: true
        },
        // Attached Schedule 2 (Balance Sheet)
        schedule2Data: {
          nonCurrentAssets: { propertyPlantEquipment: 60000000 },
          currentAssets: { cashAndCashEquivalents: 15000000, tradeAndOtherReceivables: 5000000 },
          equity: { shareCapital: 40000000, retainedEarnings: 20000000 },
          nonCurrentLiabilities: { longTermBorrowings: 15000000 },
          currentLiabilities: { tradeAndOtherPayables: 5000000 }
        },
        // Attached Schedule 4 (Transfer Pricing)
        schedule4Data: {
          hasInternationalAssociateTransactions: true,
          tpMasterFileHeld: true,
          tpLocalFileHeld: true,
          transactions: [
            {
              associateName: 'Singa Global Management Pte Ltd',
              countryOfResidence: 'SG',
              relationshipType: 'FOREIGN_PARENT',
              ownershipPercentage: 100,
              transactionCategory: 'MANAGEMENT_FEES',
              transferPricingMethod: 'TNMM',
              recordedAmount: 2000000,
              armsLengthAmount: 1800000, // 200k TP adjustment
              tpDocumentationHeld: true
            }
          ]
        },
        // Attached Schedule 5 (CFE)
        schedule5Data: {
          hasControlledForeignEntities: true,
          controlledForeignEntities: [
            {
              cfeName: 'Seychelles Eco Resorts Ltd',
              countryOfIncorporation: 'SC',
              countryOfTaxResidence: 'SC',
              directOwnershipPercentage: 100,
              totalControlPercentage: 100,
              accountingNetProfit: 2000000,
              foreignIncomeTaxPaid: 60000,
              exemptionReason: 'NOT_EXEMPT'
            }
          ]
        }
      };

      const result = MIRA604Generator.generateForm(completeCorporateSourceData, 'v25.1');

      expect(result.formInstance.status).toBe('VALIDATED');
      expect(result.formInstance.validationResult.isValid).toBe(true);

      // Verify schedule engine execution results
      expect(result.schedulesResult.schedule2?.isApplicable).toBe(true);
      expect(result.schedulesResult.schedule2?.status).toBe('VALIDATED');
      expect(result.schedulesResult.schedule2?.values['SCH2_TOTAL_ASSETS'] || result.schedulesResult.schedule2?.values['SCH2_A13_TOTAL_ASSETS']).toBe(80000000);

      // Schedule 3 not applicable to corporate
      expect(result.schedulesResult.schedule3?.isApplicable).toBe(false);

      // Schedule 4 applicable
      expect(result.schedulesResult.schedule4?.isApplicable).toBe(true);
      expect(result.schedulesResult.schedule4?.values['SCH4_C01_TOTAL_TP_TAX_ADJUSTMENT']).toBe(200000);

      // Schedule 5 applicable
      expect(result.schedulesResult.schedule5?.isApplicable).toBe(true);
      expect(result.schedulesResult.schedule5?.values['SCH5_C01_TOTAL_ATTRIBUTABLE_CFE_INCOME']).toBe(2000000);

      // Verify MIRAconnect payload
      expect(result.miraconnectPayload.schedules.schedule2_FinancialPosition).toBeDefined();
      expect(result.miraconnectPayload.schedules.schedule4_InternationalAssociateTransactions).toBeDefined();
      expect(result.miraconnectPayload.schedules.schedule5_ControlledForeignEntities).toBeDefined();
      expect(result.miraconnectPayload.schedules.schedule3_NetWorthExcludingBusiness).toBeUndefined();

      // JSON parsing test
      const parsedJson = JSON.parse(result.miraconnectJson);
      expect(parsedJson.header.formCode).toBe('MIRA_604');
      expect(parsedJson.schedules.schedule2_FinancialPosition.totalAssets).toBe(80000000);
      expect(parsedJson.schedules.schedule4_InternationalAssociateTransactions.summary.totalTransferPricingAdjustment).toBe(200000);
    });
  });
});
