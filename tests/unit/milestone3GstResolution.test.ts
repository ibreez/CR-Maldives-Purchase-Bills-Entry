import { describe, test, expect, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { RevenueGstService } from '../../src/services/revenue/revenueGstService';
import { RevenuePostingService } from '../../src/services/revenue/revenuePostingService';
import { RevenuePersistenceService } from '../../src/services/revenue/revenuePersistenceService';
import { canonicalGstEngine, classifyGstEligibility } from '../../src/services/gst/gstService';
import { GstTransactionInput } from '../../src/types/gst';
import { RevenueTransaction } from '../../src/types/revenue';
import { UserSession } from '../../src/types/rbac';

describe('Milestone 3 - GST Engine & Sector-Aware Resolution', { timeout: 60000 }, () => {
  const testTenant = 'TENANT-M3-GST';
  const mockUser: UserSession = {
    userId: 'USR-M3-001',
    tenantId: testTenant,
    role: 'CLIENT_ADMIN'
  };

  beforeEach(() => {
    RevenuePersistenceService.clear();
  });

  describe('3.1 Server-Side GST Computation & Rate Resolution', () => {
    test('1. GST-inclusive revenue (General Sector, 8%)', () => {
      const result = RevenueGstService.calculateGst({
        transactionDate: '2026-03-15',
        grossAmount: 108.00,
        amountBasis: 'GST_INCLUSIVE',
        sector: 'GENERAL',
        gstClassification: 'TAXABLE'
      });

      expect(result.grossAmount.toFixed(2)).toBe('108.00');
      expect(result.netAmount.toFixed(2)).toBe('100.00');
      expect(result.gstAmount.toFixed(2)).toBe('8.00');
      expect(result.gstRate).toBe(0.08);
      expect(result.gstRatePercentage).toBe(8);
      expect(result.gstRuleId).toBe('RULE-GST-GEN-8');
      expect(result.grossAmount.equals(result.netAmount.plus(result.gstAmount))).toBe(true);
    });

    test('2. GST-exclusive revenue (General Sector, 8%)', () => {
      const result = RevenueGstService.calculateGst({
        transactionDate: '2026-03-15',
        netAmount: 100.00,
        amountBasis: 'GST_EXCLUSIVE',
        sector: 'GENERAL',
        gstClassification: 'TAXABLE'
      });

      expect(result.grossAmount.toFixed(2)).toBe('108.00');
      expect(result.netAmount.toFixed(2)).toBe('100.00');
      expect(result.gstAmount.toFixed(2)).toBe('8.00');
      expect(result.gstRate).toBe(0.08);
      expect(result.gstRuleId).toBe('RULE-GST-GEN-8');
      expect(result.grossAmount.equals(result.netAmount.plus(result.gstAmount))).toBe(true);
    });

    test('3. Exempt revenue yields 0 GST and equals gross to net', () => {
      const result = RevenueGstService.calculateGst({
        transactionDate: '2026-03-15',
        grossAmount: 5000.00,
        amountBasis: 'GST_INCLUSIVE',
        sector: 'GENERAL',
        gstClassification: 'EXEMPT'
      });

      expect(result.grossAmount.toFixed(2)).toBe('5000.00');
      expect(result.netAmount.toFixed(2)).toBe('5000.00');
      expect(result.gstAmount.toFixed(2)).toBe('0.00');
      expect(result.gstRate).toBe(0);
      expect(result.gstRatePercentage).toBe(0);
      expect(result.gstClassification).toBe('EXEMPT');
    });

    test('4. Zero-rated revenue yields 0 GST and equals gross to net', () => {
      const result = RevenueGstService.calculateGst({
        transactionDate: '2026-03-15',
        grossAmount: 2500.00,
        amountBasis: 'GST_INCLUSIVE',
        sector: 'GENERAL',
        gstClassification: 'ZERO_RATED'
      });

      expect(result.grossAmount.toFixed(2)).toBe('2500.00');
      expect(result.netAmount.toFixed(2)).toBe('2500.00');
      expect(result.gstAmount.toFixed(2)).toBe('0.00');
      expect(result.gstRate).toBe(0);
      expect(result.gstRatePercentage).toBe(0);
      expect(result.gstClassification).toBe('ZERO_RATED');
    });

    test('5. Out-of-scope revenue yields 0 GST', () => {
      const result = RevenueGstService.calculateOutOfScopeRevenue(1200.00, 'GENERAL', '2026-03-15');

      expect(result.grossAmount).toBe(1200.00);
      expect(result.netRevenue).toBe(1200.00);
      expect(result.gstAmount).toBe(0);
      expect(result.rate).toBe(0);
      expect(result.boxAssignment).toBe('BOX_3');
    });

    test('6. Tourism sector rate boundary: 2025-06-30 resolves to 16% (pre-change rate)', () => {
      const resolution = canonicalGstEngine.resolveGstRate('2025-06-30', 'TOURISM');
      expect(resolution.rate).toBe(0.16);
      expect(resolution.ratePercentage).toBe(16);
      expect(resolution.ruleId).toBe('RULE-GST-TOU-16');
      expect(resolution.version).toBe('v23.1');

      const calc = RevenueGstService.calculateGst({
        transactionDate: '2025-06-30',
        grossAmount: 1160.00,
        amountBasis: 'GST_INCLUSIVE',
        sector: 'TOURISM',
        gstClassification: 'TAXABLE'
      });

      expect(calc.netAmount.toFixed(2)).toBe('1000.00');
      expect(calc.gstAmount.toFixed(2)).toBe('160.00');
      expect(calc.grossAmount.toFixed(2)).toBe('1160.00');
      expect(calc.gstRate).toBe(0.16);
      expect(calc.gstRuleId).toBe('RULE-GST-TOU-16');
      expect(calc.gstRegulatoryVersion).toBe('v23.1');
    });

    test('7. Tourism sector rate boundary: 2025-07-01 resolves to 17% (post-change rate)', () => {
      const resolution = canonicalGstEngine.resolveGstRate('2025-07-01', 'TOURISM');
      expect(resolution.rate).toBe(0.17);
      expect(resolution.ratePercentage).toBe(17);
      expect(resolution.ruleId).toBe('RULE-GST-TOU-17');
      expect(resolution.version).toBe('v25.1');

      const calc = RevenueGstService.calculateGst({
        transactionDate: '2025-07-01',
        grossAmount: 1170.00,
        amountBasis: 'GST_INCLUSIVE',
        sector: 'TOURISM',
        gstClassification: 'TAXABLE'
      });

      expect(calc.netAmount.toFixed(2)).toBe('1000.00');
      expect(calc.gstAmount.toFixed(2)).toBe('170.00');
      expect(calc.grossAmount.toFixed(2)).toBe('1170.00');
      expect(calc.gstRate).toBe(0.17);
      expect(calc.gstRuleId).toBe('RULE-GST-TOU-17');
      expect(calc.gstRegulatoryVersion).toBe('v25.1');
    });

    test('8. Decimal precision: handles fractional cents without mathematical discrepancy', () => {
      // 33.33 MVR inclusive @ 8%
      const calc = RevenueGstService.calculateGst({
        transactionDate: '2026-03-15',
        grossAmount: 33.33,
        amountBasis: 'GST_INCLUSIVE',
        sector: 'GENERAL'
      });

      // 33.33 / 1.08 = 30.8611... -> 30.86 net, 33.33 - 30.86 = 2.47 gst
      expect(calc.grossAmount.toFixed(2)).toBe('33.33');
      expect(calc.netAmount.toFixed(2)).toBe('30.86');
      expect(calc.gstAmount.toFixed(2)).toBe('2.47');
      expect(calc.grossAmount.equals(calc.netAmount.plus(calc.gstAmount))).toBe(true);
    });

    test('9. Sector determination logic', () => {
      expect(RevenueGstService.determineSector({ sector: 'TOURISM' })).toBe('TOURISM');
      expect(RevenueGstService.determineSector({ sector: 'GENERAL' })).toBe('GENERAL');
      expect(RevenueGstService.determineSector({ category: 'Resort Water Villa' })).toBe('TOURISM');
      expect(RevenueGstService.determineSector({ outletName: 'Safari Boat Lounge' })).toBe('TOURISM');
      expect(RevenueGstService.determineSector({ category: 'Food & Beverage', outletName: 'Main Restaurant' })).toBe('GENERAL');
    });
  });

  describe('3.2 Canonical GSTTransaction Creation & Traceability', () => {
    test('10. Atomic GSTTransaction creation with exact consistency to Journal', async () => {
      const posted = await RevenuePostingService.postRevenue(
        {
          tenantId: testTenant,
          outletId: 'OUT-M3-01',
          outletName: 'Male Retail Boutique',
          transactionDate: '2026-03-20',
          category: 'Retail Sales',
          description: 'High-end watches sale',
          amountBasis: 'GST_INCLUSIVE',
          grossAmount: 10800.00,
          sector: 'GENERAL',
          gstClassification: 'TAXABLE',
          paymentMethod: 'CARD'
        },
        mockUser
      );

      expect(posted.status).toBe('POSTED');
      expect(posted.gstTransactionId).toBeDefined();
      expect(posted.journalId).toBeDefined();

      // Verify trace from GSTTransaction back to RevenueTransaction and Journal
      const trace = await RevenueGstService.traceGstTransaction(posted.gstTransactionId!, testTenant);
      expect(trace.found).toBe(true);
      expect(trace.gstTransaction).toBeDefined();
      expect(trace.revenueTransaction).toBeDefined();
      expect(trace.journal).toBeDefined();
      expect(trace.isConsistent).toBe(true);
      expect(trace.discrepancies.length).toBe(0);

      // Verify amount consistency
      expect(Number(trace.gstTransaction?.gstAmount)).toBe(800);
      expect(Number(trace.revenueTransaction?.gstAmount)).toBe(800);

      // Verify bidirectional lookup
      const foundByGst = RevenueGstService.getRevenueForGstTransaction(posted.gstTransactionId!, testTenant);
      expect(foundByGst?.id).toBe(posted.id);
    });
  });

  describe('3.3 MIRA 205 & MIRA 206 Integration', () => {
    test('11. MIRA 205 (General Sector): correctly classifies Standard, Zero-Rated, and Exempt revenue', async () => {
      // 1. Standard rated revenue: 100,000 net, 8,000 GST
      const stdRev: RevenueTransaction = {
        id: 'REV-202603-STD',
        tenantId: testTenant,
        outletId: 'OUT-M3-GEN',
        transactionDate: '2026-03-10',
        category: 'Retail Sales',
        description: 'Retail Goods',
        amountBasis: 'GST_EXCLUSIVE',
        grossAmount: new Prisma.Decimal('108000.00') as any,
        netAmount: new Prisma.Decimal('100000.00') as any,
        gstAmount: new Prisma.Decimal('8000.00') as any,
        gstClassification: 'TAXABLE',
        gstRate: 0.08,
        gstRatePercentage: 8,
        gstRuleId: 'RULE-GST-GEN-8',
        gstRegulatoryVersion: 'v23.1',
        sector: 'GENERAL',
        paymentMethod: 'CASH',
        currency: 'MVR',
        fxRate: new Prisma.Decimal('1.0'),
        mvrAmount: new Prisma.Decimal('108000.00') as any,
        status: 'POSTED',
        sourceType: 'MANUAL_ENTRY',
        createdBy: mockUser.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // 2. Zero-rated revenue: 20,000
      const zeroRev: RevenueTransaction = {
        id: 'REV-202603-ZERO',
        tenantId: testTenant,
        outletId: 'OUT-M3-GEN',
        transactionDate: '2026-03-12',
        category: 'Export Sales',
        description: 'Export Goods',
        amountBasis: 'GST_INCLUSIVE',
        grossAmount: new Prisma.Decimal('20000.00') as any,
        netAmount: new Prisma.Decimal('20000.00') as any,
        gstAmount: new Prisma.Decimal('0.00') as any,
        gstClassification: 'ZERO_RATED',
        gstRate: 0,
        gstRatePercentage: 0,
        gstRuleId: 'RULE-GST-GEN-8',
        gstRegulatoryVersion: 'v23.1',
        sector: 'GENERAL',
        paymentMethod: 'BANK',
        currency: 'MVR',
        fxRate: new Prisma.Decimal('1.0'),
        mvrAmount: new Prisma.Decimal('20000.00') as any,
        status: 'POSTED',
        sourceType: 'MANUAL_ENTRY',
        createdBy: mockUser.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // 3. Exempt revenue: 10,000
      const exemptRev: RevenueTransaction = {
        id: 'REV-202603-EXEMPT',
        tenantId: testTenant,
        outletId: 'OUT-M3-GEN',
        transactionDate: '2026-03-15',
        category: 'Essential Services',
        description: 'Statutory Exempt Health Supply',
        amountBasis: 'GST_INCLUSIVE',
        grossAmount: new Prisma.Decimal('10000.00') as any,
        netAmount: new Prisma.Decimal('10000.00') as any,
        gstAmount: new Prisma.Decimal('0.00') as any,
        gstClassification: 'EXEMPT',
        gstRate: 0,
        gstRatePercentage: 0,
        gstRuleId: 'RULE-GST-GEN-8',
        gstRegulatoryVersion: 'v23.1',
        sector: 'GENERAL',
        paymentMethod: 'CASH',
        currency: 'MVR',
        fxRate: new Prisma.Decimal('1.0'),
        mvrAmount: new Prisma.Decimal('10000.00') as any,
        status: 'POSTED',
        sourceType: 'MANUAL_ENTRY',
        createdBy: mockUser.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Input tax purchases from vendor bill: 40,000 @ 8% = 3,200 GST
      const purchaseInputs: GstTransactionInput[] = [
        {
          tenantId: testTenant,
          transactionDate: '2026-03-05',
          sector: 'GENERAL',
          transactionType: 'INPUT_TAX',
          treatment: 'GENERAL_INPUT_TAX',
          description: 'Inventory purchase from supplier',
          taxableAmount: 40000,
          gstRate: 0.08,
          gstAmount: 3200,
          isInputTaxClaimable: true
        }
      ];

      // Generate MIRA 205 Return
      const mira205 = RevenueGstService.generateAuthoritativeMira205Return({
        tenantId: testTenant,
        taxpayer: {
          tin: '1000200GST001',
          name: 'Male Trading Enterprise Pvt Ltd'
        },
        period: {
          periodName: 'March 2026',
          startDate: '2026-03-01',
          endDate: '2026-03-31',
          taxYear: 2026
        },
        purchaseTransactions: purchaseInputs,
        revenueTransactions: [stdRev, zeroRev, exemptRev]
      });

      // Assert Section A Supplies
      expect(mira205.sectionA_Supplies.box1_StandardRatedSupplies8Pct.taxableValue).toBe(100000);
      expect(mira205.sectionA_Supplies.box1_StandardRatedSupplies8Pct.outputTax).toBe(8000);
      expect(mira205.sectionA_Supplies.box2_ZeroRatedSupplies).toBe(20000);
      expect(mira205.sectionA_Supplies.box3_ExemptSupplies).toBe(10000);
      expect(mira205.sectionA_Supplies.box4_TotalSuppliesValue).toBe(130000);
      expect(mira205.sectionA_Supplies.box5_TotalOutputTax).toBe(8000);
      expect(mira205.sectionA_Supplies.box7_NetOutputTax).toBe(8000);

      // Assert Section B Purchases
      expect(mira205.sectionB_Purchases.box8_StandardRatedPurchases.taxableValue).toBe(40000);
      expect(mira205.sectionB_Purchases.box8_StandardRatedPurchases.inputTax).toBe(3200);

      // Assert Section C Calculation: 8,000 Output - 3,200 Input = 4,800 Net Payable
      expect(mira205.sectionC_Calculation.box15_NetGstPayableOrRefundable).toBe(4800);
    });

    test('12. MIRA 206 (Tourism Sector): splits 16% (pre-July 2025) and 17% (post-July 2025) correctly', () => {
      // 1. Pre-July 2025 transaction: 100,000 @ 16%
      const preJulyRev: RevenueTransaction = {
        id: 'REV-202506-PRE',
        tenantId: testTenant,
        outletId: 'OUT-RESORT-01',
        transactionDate: '2025-06-30',
        category: 'Accommodation',
        description: 'Resort Villa Booking June 2025',
        amountBasis: 'GST_EXCLUSIVE',
        grossAmount: new Prisma.Decimal('116000.00') as any,
        netAmount: new Prisma.Decimal('100000.00') as any,
        gstAmount: new Prisma.Decimal('16000.00') as any,
        gstClassification: 'TAXABLE',
        gstRate: 0.16,
        gstRatePercentage: 16,
        gstRuleId: 'RULE-GST-TOU-16',
        gstRegulatoryVersion: 'v23.1',
        sector: 'TOURISM',
        paymentMethod: 'CARD',
        currency: 'MVR',
        fxRate: new Prisma.Decimal('1.0'),
        mvrAmount: new Prisma.Decimal('116000.00') as any,
        status: 'POSTED',
        sourceType: 'MANUAL_ENTRY',
        createdBy: mockUser.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // 2. Post-July 2025 transaction: 200,000 @ 17%
      const postJulyRev: RevenueTransaction = {
        id: 'REV-202507-POST',
        tenantId: testTenant,
        outletId: 'OUT-RESORT-01',
        transactionDate: '2025-07-01',
        category: 'Accommodation',
        description: 'Resort Villa Booking July 2025',
        amountBasis: 'GST_EXCLUSIVE',
        grossAmount: new Prisma.Decimal('234000.00') as any,
        netAmount: new Prisma.Decimal('200000.00') as any,
        gstAmount: new Prisma.Decimal('34000.00') as any,
        gstClassification: 'TAXABLE',
        gstRate: 0.17,
        gstRatePercentage: 17,
        gstRuleId: 'RULE-GST-TOU-17',
        gstRegulatoryVersion: 'v25.1',
        sector: 'TOURISM',
        paymentMethod: 'CARD',
        currency: 'MVR',
        fxRate: new Prisma.Decimal('1.0'),
        mvrAmount: new Prisma.Decimal('234000.00') as any,
        status: 'POSTED',
        sourceType: 'MANUAL_ENTRY',
        createdBy: mockUser.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Generate MIRA 206 Return
      const mira206 = RevenueGstService.generateAuthoritativeMira206Return({
        tenantId: testTenant,
        taxpayer: {
          tin: '2000300TGST001',
          name: 'Coral Atoll Resort Maldives Pvt Ltd',
          tourismEstablishmentName: 'Coral Atoll Luxury Resort',
          operatingLicenseNumber: 'TR-2025-998'
        },
        period: {
          periodName: 'Mid-Year 2025',
          startDate: '2025-06-01',
          endDate: '2025-07-31',
          taxYear: 2025
        },
        revenueTransactions: [preJulyRev, postJulyRev]
      });

      // Verify Box 1A (16% through 2025-06-30)
      expect(mira206.sectionA_Supplies.box1A_TourismSupplies16Pct.taxableValue).toBe(100000);
      expect(mira206.sectionA_Supplies.box1A_TourismSupplies16Pct.outputTax).toBe(16000);

      // Verify Box 1B (17% from 2025-07-01)
      expect(mira206.sectionA_Supplies.box1B_TourismSupplies17Pct.taxableValue).toBe(200000);
      expect(mira206.sectionA_Supplies.box1B_TourismSupplies17Pct.outputTax).toBe(34000);

      // Total Tourism Supplies = 100,000 + 200,000 = 300,000
      expect(mira206.sectionA_Supplies.box4_TotalTourismSuppliesValue).toBe(300000);

      // Total TGST Output Tax = 16,000 + 34,000 = 50,000
      expect(mira206.sectionA_Supplies.box5_TotalTgstOutputTax).toBe(50000);
      expect(mira206.sectionA_Supplies.box7_NetTgstOutputTax).toBe(50000);
    });

    test('13. Purchase-bill GST eligibility classification regression', () => {
      const standardPurchase = {
        amount: 1000,
        gstRate: 8,
        gstAmount: 80,
        description: 'Office stationery supplies',
        category: 'Operating Expenses',
        isCapitalAsset: false
      };

      const eligibility = classifyGstEligibility(standardPurchase as any, false);
      expect(eligibility).toBe('CLAIMABLE');

      const entertainmentPurchase = {
        amount: 2000,
        gstRate: 8,
        gstAmount: 160,
        description: 'Staff entertainment food & drinks',
        category: 'Entertainment',
        isCapitalAsset: false
      };
      const blockedEligibility = classifyGstEligibility(entertainmentPurchase as any, false);
      expect(blockedEligibility).toBe('NON_CLAIMABLE');
    });
  });
});
