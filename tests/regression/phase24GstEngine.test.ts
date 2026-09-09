import { describe, it, expect, beforeEach } from 'vitest';
import { canonicalGstEngine, GstEngineService } from '../../src/services/gst/gstEngineService';
import { GstTransactionInput } from '../../src/types/gst';
import { prisma } from '../../src/db/client';

describe('Phase 24 — Versioned GST Engine & MIRA 205/206 Statutory Returns', () => {
  const engine = new GstEngineService();

  describe('Regulatory Rate Resolution via RegulatoryRule', () => {
    it('resolves General Sector rate to 8% with active statutory citation', () => {
      const rateRes = engine.resolveGstRate('2026-01-15', 'GENERAL');
      expect(rateRes.rate).toBe(0.08);
      expect(rateRes.ratePercentage).toBe(8);
      expect(rateRes.sector).toBe('GENERAL');
      expect(rateRes.ruleId).toBe('RULE-GST-GEN-8');
      expect(rateRes.legalReference).toContain('Section 15(a)');
    });

    it('resolves Tourism Sector rate to 16% for transactions on or before 2025-06-30', () => {
      const rateRes = engine.resolveGstRate('2025-06-30', 'TOURISM');
      expect(rateRes.rate).toBe(0.16);
      expect(rateRes.ratePercentage).toBe(16);
      expect(rateRes.sector).toBe('TOURISM');
      expect(rateRes.ruleId).toBe('RULE-GST-TOU-16');
      expect(rateRes.effectiveTo).toBe('2025-06-30');
    });

    it('resolves Tourism Sector rate to 17% for transactions on or after 2025-07-01', () => {
      const rateRes = engine.resolveGstRate('2025-07-01', 'TOURISM');
      expect(rateRes.rate).toBe(0.17);
      expect(rateRes.ratePercentage).toBe(17);
      expect(rateRes.sector).toBe('TOURISM');
      expect(rateRes.ruleId).toBe('RULE-GST-TOU-17');
      expect(rateRes.effectiveFrom).toBe('2025-07-01');
    });
  });

  describe('Input Eligibility & Taxability Evaluation', () => {
    it('exempt supply creates no output or input GST', () => {
      const calc = engine.calculateTransactionGst({
        transactionDate: '2026-02-01',
        sector: 'GENERAL',
        taxableAmount: 50000,
        transactionType: 'EXEMPT_SUPPLY',
        treatment: 'EXEMPT'
      });
      expect(calc.gstRate).toBe(0);
      expect(calc.gstAmount).toBe(0);
      expect(calc.claimableGstAmount).toBe(0);
      expect(calc.isClaimable).toBe(false);
    });

    it('zero-rated supply creates 0% output GST', () => {
      const calc = engine.calculateTransactionGst({
        transactionDate: '2026-02-01',
        sector: 'GENERAL',
        taxableAmount: 100000,
        transactionType: 'ZERO_RATED_SUPPLY',
        treatment: 'ZERO_RATED'
      });
      expect(calc.gstRate).toBe(0);
      expect(calc.gstAmount).toBe(0);
      expect(calc.claimableGstAmount).toBe(0);
    });

    it('blocked input tax cannot be claimed under Section 22(b)', () => {
      const eligibility = engine.evaluateInputEligibility({
        category: 'Client Entertainment',
        description: 'Luxury dinner for visiting delegates',
        treatment: 'BLOCKED_INPUT_TAX'
      });
      expect(eligibility.treatment).toBe('BLOCKED_INPUT_TAX');
      expect(eligibility.isClaimable).toBe(false);
      expect(eligibility.reason).toContain('Section 22(b)');

      const calc = engine.calculateTransactionGst({
        transactionDate: '2026-02-01',
        sector: 'GENERAL',
        taxableAmount: 5000,
        transactionType: 'BLOCKED_INPUT_TAX',
        treatment: 'BLOCKED_INPUT_TAX'
      });
      expect(calc.gstAmount).toBe(400); // 8% of 5,000
      expect(calc.claimableGstAmount).toBe(0); // Cannot claim
      expect(calc.isClaimable).toBe(false);
    });

    it('capital input tax is fully tracked and claimable', () => {
      const eligibility = engine.evaluateInputEligibility({
        category: 'Plant & Equipment',
        description: 'Commercial refrigeration unit',
        isCapitalAsset: true
      });
      expect(eligibility.treatment).toBe('CAPITAL_INPUT_TAX');
      expect(eligibility.isClaimable).toBe(true);

      const calc = engine.calculateTransactionGst({
        transactionDate: '2026-02-01',
        sector: 'GENERAL',
        taxableAmount: 100000,
        transactionType: 'CAPITAL_INPUT_TAX',
        treatment: 'CAPITAL_INPUT_TAX',
        isCapitalAsset: true
      });
      expect(calc.gstAmount).toBe(8000);
      expect(calc.claimableGstAmount).toBe(8000);
      expect(calc.isClaimable).toBe(true);
    });

    it('mixed-use pro-rata turnover apportionment calculates correctly', () => {
      // Taxable sales: 80,000, Zero-rated: 10,000, Exempt: 10,000 => Total = 100,000 => Ratio = 90%
      const ratio = engine.calculateApportionmentRatio(80000, 10000, 10000);
      expect(ratio).toBe(0.9);

      const calc = engine.calculateTransactionGst({
        transactionDate: '2026-02-01',
        sector: 'GENERAL',
        taxableAmount: 10000,
        transactionType: 'INPUT_TAX',
        treatment: 'MIXED_USE_INPUT_TAX',
        apportionmentRatio: ratio
      });
      expect(calc.gstAmount).toBe(800); // 8% of 10,000
      expect(calc.claimableGstAmount).toBe(720); // 90% of 800
      expect(calc.isClaimable).toBe(true);
    });
  });

  describe('MIRA 205 (General Sector GST Return Form v25.1)', () => {
    const generalTxs: GstTransactionInput[] = [
      // Output: 100,000 Standard rated @ 8% = 8,000 GST
      {
        tenantId: 'TENANT-001',
        transactionDate: '2026-01-10',
        sector: 'GENERAL',
        transactionType: 'OUTPUT_TAX',
        treatment: 'STANDARD_RATED',
        description: 'Retail goods sales',
        taxableAmount: 100000
      },
      // Output: 20,000 Zero-rated = 0 GST
      {
        tenantId: 'TENANT-001',
        transactionDate: '2026-01-15',
        sector: 'GENERAL',
        transactionType: 'ZERO_RATED_SUPPLY',
        treatment: 'ZERO_RATED',
        description: 'Export sales',
        taxableAmount: 20000
      },
      // Output: 10,000 Exempt = 0 GST
      {
        tenantId: 'TENANT-001',
        transactionDate: '2026-01-20',
        sector: 'GENERAL',
        transactionType: 'EXEMPT_SUPPLY',
        treatment: 'EXEMPT',
        description: 'Exempt postal services',
        taxableAmount: 10000
      },
      // Input: 40,000 Standard Purchases @ 8% = 3,200 GST (Claimable)
      {
        tenantId: 'TENANT-001',
        transactionDate: '2026-01-12',
        sector: 'GENERAL',
        transactionType: 'INPUT_TAX',
        treatment: 'GENERAL_INPUT_TAX',
        description: 'Inventory purchases',
        taxableAmount: 40000
      },
      // Capital Input: 50,000 Capital Asset @ 8% = 4,000 GST (Claimable)
      {
        tenantId: 'TENANT-001',
        transactionDate: '2026-01-18',
        sector: 'GENERAL',
        transactionType: 'CAPITAL_INPUT_TAX',
        treatment: 'CAPITAL_INPUT_TAX',
        description: 'POS server hardware',
        taxableAmount: 50000,
        isCapitalAsset: true
      },
      // Blocked Input: 5,000 Entertainment @ 8% = 400 GST (Blocked)
      {
        tenantId: 'TENANT-001',
        transactionDate: '2026-01-22',
        sector: 'GENERAL',
        transactionType: 'BLOCKED_INPUT_TAX',
        treatment: 'BLOCKED_INPUT_TAX',
        description: 'Staff entertainment',
        taxableAmount: 5000
      }
    ];

    it('generates full MIRA 205 return with accurate Section A, B, and C boxes', () => {
      const mira205 = engine.generateMira205Return({
        transactions: generalTxs,
        taxpayer: {
          tin: '1000200GST001',
          name: 'Male Trading Enterprise Pvt Ltd'
        },
        period: {
          periodName: '2026-M01',
          startDate: '2026-01-01',
          endDate: '2026-01-31',
          taxYear: 2026
        },
        previousExcessCredit: 500
      });

      expect(mira205.formType).toBe('MIRA_205');
      expect(mira205.formVersion).toBe('v25.1');
      expect(mira205.taxpayer.tin).toBe('1000200GST001');

      // Section A
      expect(mira205.sectionA_Supplies.box1_StandardRatedSupplies8Pct.taxableValue).toBe(100000);
      expect(mira205.sectionA_Supplies.box1_StandardRatedSupplies8Pct.outputTax).toBe(8000);
      expect(mira205.sectionA_Supplies.box2_ZeroRatedSupplies).toBe(20000);
      expect(mira205.sectionA_Supplies.box3_ExemptSupplies).toBe(10000);
      expect(mira205.sectionA_Supplies.box4_TotalSuppliesValue).toBe(130000);
      expect(mira205.sectionA_Supplies.box5_TotalOutputTax).toBe(8000);
      expect(mira205.sectionA_Supplies.box7_NetOutputTax).toBe(8000);

      // Section B
      expect(mira205.sectionB_Purchases.box8_StandardRatedPurchases.taxableValue).toBe(40000);
      expect(mira205.sectionB_Purchases.box8_StandardRatedPurchases.inputTax).toBe(3200);
      expect(mira205.sectionB_Purchases.box9_CapitalPurchases.taxableValue).toBe(50000);
      expect(mira205.sectionB_Purchases.box9_CapitalPurchases.inputTax).toBe(4000);
      expect(mira205.sectionB_Purchases.box10_BlockedInputTax.taxableValue).toBe(5000);
      expect(mira205.sectionB_Purchases.box10_BlockedInputTax.blockedTax).toBe(400);
      expect(mira205.sectionB_Purchases.box12_TotalClaimableInputTax).toBe(7200); // 3200 + 4000
      expect(mira205.sectionB_Purchases.box14_NetClaimableInputTax).toBe(7200);

      // Section C: Net GST = 8000 - 7200 = 800; Final = 800 - 500 = 300
      expect(mira205.sectionC_Calculation.box15_NetGstPayableOrRefundable).toBe(800);
      expect(mira205.sectionC_Calculation.box16_PreviousExcessCreditsCarriedForward).toBe(500);
      expect(mira205.sectionC_Calculation.box17_FinalAmountPayableOrRefundable).toBe(300);

      // Verifiable Checksum
      expect(mira205.regulatoryTraceability.checksum).toBeDefined();
      expect(mira205.regulatoryTraceability.ruleId).toBe('RULE-GST-GEN-8');
    });
  });

  describe('MIRA 206 (Tourism Sector GST Return Form v25.1)', () => {
    const tourismTxs: GstTransactionInput[] = [
      // Output pre-July 2025: 100,000 @ 16% = 16,000 TGST
      {
        tenantId: 'TENANT-TOU-01',
        transactionDate: '2025-06-25',
        sector: 'TOURISM',
        transactionType: 'OUTPUT_TAX',
        treatment: 'STANDARD_RATED',
        description: 'Villa accommodation pre-rate change',
        taxableAmount: 100000
      },
      // Output post-July 2025: 100,000 @ 17% = 17,000 TGST
      {
        tenantId: 'TENANT-TOU-01',
        transactionDate: '2025-07-05',
        sector: 'TOURISM',
        transactionType: 'OUTPUT_TAX',
        treatment: 'STANDARD_RATED',
        description: 'Villa accommodation post-rate change',
        taxableAmount: 100000
      },
      // Tourism Input: 50,000 @ 16% = 8,000 TGST
      {
        tenantId: 'TENANT-TOU-01',
        transactionDate: '2025-06-20',
        sector: 'TOURISM',
        transactionType: 'INPUT_TAX',
        treatment: 'GENERAL_INPUT_TAX',
        description: 'Food & Beverage supply for resort',
        taxableAmount: 50000
      },
      // Tourism Capital Input: 80,000 @ 17% = 13,600 TGST
      {
        tenantId: 'TENANT-TOU-01',
        transactionDate: '2025-07-10',
        sector: 'TOURISM',
        transactionType: 'CAPITAL_INPUT_TAX',
        treatment: 'CAPITAL_INPUT_TAX',
        description: 'Speedboat engine replacement',
        taxableAmount: 80000,
        isCapitalAsset: true
      }
    ];

    it('generates MIRA 206 separating Box 1A (16%) and Box 1B (17%) TGST', () => {
      const mira206 = engine.generateMira206Return({
        transactions: tourismTxs,
        taxpayer: {
          tin: '2000300GST001',
          name: 'Coral Reef Resort & Spa Pvt Ltd',
          tourismEstablishmentName: 'Coral Reef Resort',
          operatingLicenseNumber: 'MOT-RES-2025-042'
        },
        period: {
          periodName: '2025-Q3',
          startDate: '2025-06-01',
          endDate: '2025-07-31',
          taxYear: 2025
        }
      });

      expect(mira206.formType).toBe('MIRA_206');
      expect(mira206.taxpayer.sector).toBe('TOURISM');
      expect(mira206.taxpayer.operatingLicenseNumber).toBe('MOT-RES-2025-042');

      // Box 1A (16%) and Box 1B (17%)
      expect(mira206.sectionA_Supplies.box1A_TourismSupplies16Pct.taxableValue).toBe(100000);
      expect(mira206.sectionA_Supplies.box1A_TourismSupplies16Pct.outputTax).toBe(16000);

      expect(mira206.sectionA_Supplies.box1B_TourismSupplies17Pct.taxableValue).toBe(100000);
      expect(mira206.sectionA_Supplies.box1B_TourismSupplies17Pct.outputTax).toBe(17000);

      expect(mira206.sectionA_Supplies.box5_TotalTgstOutputTax).toBe(33000); // 16,000 + 17,000
      expect(mira206.sectionA_Supplies.box7_NetTgstOutputTax).toBe(33000);

      // Section B: Input Purchases
      expect(mira206.sectionB_Purchases.box8_TourismOperationalPurchases.taxableValue).toBe(50000);
      expect(mira206.sectionB_Purchases.box8_TourismOperationalPurchases.inputTax).toBe(8000);

      expect(mira206.sectionB_Purchases.box9_TourismCapitalPurchases.taxableValue).toBe(80000);
      expect(mira206.sectionB_Purchases.box9_TourismCapitalPurchases.inputTax).toBe(13600);

      expect(mira206.sectionB_Purchases.box11_TotalClaimableTgstInputTax).toBe(21600); // 8,000 + 13,600
      expect(mira206.sectionB_Purchases.box13_NetClaimableTgstInputTax).toBe(21600);

      // Section C: Net TGST = 33,000 - 21,600 = 11,400
      expect(mira206.sectionC_Calculation.box14_NetTgstPayableOrRefundable).toBe(11400);
      expect(mira206.sectionC_Calculation.box16_FinalTgstPayableOrRefundable).toBe(11400);

      expect(mira206.regulatoryTraceability.applicableRules).toContain('RULE-GST-TOU-16');
      expect(mira206.regulatoryTraceability.applicableRules).toContain('RULE-GST-TOU-17');
    });
  });

  describe('General Ledger Reconciliation', () => {
    const testTenantId = `TEST-TENANT-RECON-${Date.now()}`;
    const testTin = `TIN-GST-${Date.now()}`;

    beforeEach(async (context) => {
      try {
        // Create test tenant
        await prisma.tenant.upsert({
          where: { id: testTenantId },
          update: {},
          create: {
            id: testTenantId,
            name: 'GST Recon Tenant',
            tin: testTin
          }
        });
      } catch (err) {
        console.warn('PostgreSQL database unreachable in test environment. Skipping GL integration test.');
        context.skip();
      }
    });

    it('reconciles GST transactions against GL accounts 2100 (Output) and 1400 (Input)', async () => {
      // 1. Create GST Transactions
      await prisma.gSTTransaction.create({
        data: {
          tenantId: testTenantId,
          transactionDate: new Date('2026-03-10'),
          sector: 'GENERAL',
          taxableAmount: 100000,
          gstRate: 0.08,
          gstAmount: 8000,
          isInputTaxClaimable: false // Output tax
        }
      });

      await prisma.gSTTransaction.create({
        data: {
          tenantId: testTenantId,
          transactionDate: new Date('2026-03-12'),
          sector: 'GENERAL',
          taxableAmount: 50000,
          gstRate: 0.08,
          gstAmount: 4000,
          isInputTaxClaimable: true // Claimable input tax
        }
      });

      // 2. Create matching GL Journal & Lines
      const journal = await prisma.journal.create({
        data: {
          tenantId: testTenantId,
          reference: `JRN-RECON-${Date.now()}`,
          entryDate: new Date('2026-03-15'),
          description: 'March GST posting',
          totalDebit: 12000,
          totalCredit: 12000,
          isBalanced: true,
          status: 'POSTED'
        }
      });

      // Credit 2100 (Output GST) = 8000
      await prisma.journalLine.create({
        data: {
          journalId: journal.id,
          accountCode: '2100',
          accountName: 'GST Output Tax Payable',
          description: 'GST Output Payable',
          debit: 0,
          credit: 8000
        }
      });

      // Debit 1400 (Input GST) = 4000
      await prisma.journalLine.create({
        data: {
          journalId: journal.id,
          accountCode: '1400',
          accountName: 'GST Input Tax Claimable',
          description: 'GST Input Claimable',
          debit: 4000,
          credit: 0
        }
      });

      // Debit Bank 8000, Credit Revenue 4000 for balancing
      await prisma.journalLine.create({
        data: {
          journalId: journal.id,
          accountCode: '1000',
          accountName: 'Bank Account',
          description: 'Bank balance',
          debit: 8000,
          credit: 4000
        }
      });

      // 3. Perform Reconciliation
      const recon = await engine.reconcileGstToGl({
        tenantId: testTenantId,
        periodStart: '2026-03-01',
        periodEnd: '2026-03-31',
        sector: 'GENERAL'
      });

      expect(recon.gstTransactionsTotalOutputTax).toBe(8000);
      expect(recon.gstTransactionsTotalInputTax).toBe(4000);
      expect(recon.glOutputTaxBalance).toBe(8000);
      expect(recon.glInputTaxBalance).toBe(4000);
      expect(recon.outputTaxVariance).toBe(0);
      expect(recon.inputTaxVariance).toBe(0);
      expect(recon.isReconciled).toBe(true);
      expect(recon.discrepancies.length).toBe(0);
    });
  });
});
