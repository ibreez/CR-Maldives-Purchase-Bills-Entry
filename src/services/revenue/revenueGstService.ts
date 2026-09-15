import { Prisma, PrismaClient } from '@prisma/client';
import Decimal from 'decimal.js';
import {
  GstSector,
  GstTransactionInput,
  Mira205GeneralReturn,
  Mira206TourismReturn
} from '../../types/gst';
import {
  RevenueAmountBasis,
  RevenueGstClassification,
  RevenueTransaction
} from '../../types/revenue';
import { canonicalGstEngine } from '../gst/gstEngineService';
import { RevenuePersistenceService } from './revenuePersistenceService';
import { prisma as defaultPrisma } from '../../db/client';

export interface CalculatedRevenueGst {
  grossAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  gstAmount: Prisma.Decimal;
  gstRate: number;
  gstRatePercentage: number;
  gstRuleId: string;
  gstRegulatoryVersion: string;
  gstClassification: RevenueGstClassification;
  sector: GstSector;
}

export class RevenueGstService {
  /**
   * Authoritatively determines the GST sector ('GENERAL' | 'TOURISM') based on explicit input,
   * category, outlet type, or business classification.
   */
  static determineSector(params: {
    sector?: GstSector;
    category?: string;
    outletName?: string;
    description?: string;
  }): GstSector {
    if (params.sector === 'TOURISM' || params.sector === 'GENERAL') {
      return params.sector;
    }

    const text = `${params.category || ''} ${params.outletName || ''} ${params.description || ''}`.toUpperCase();
    if (
      text.includes('TOURISM') ||
      text.includes('RESORT') ||
      text.includes('HOTEL') ||
      text.includes('GUESTHOUSE') ||
      text.includes('GUEST HOUSE') ||
      text.includes('SAFARI') ||
      text.includes('VESSEL') ||
      text.includes('DIVING') ||
      text.includes('TGST')
    ) {
      return 'TOURISM';
    }

    return 'GENERAL';
  }

  /**
   * Computes authoritative, Decimal-safe GST and net/gross amounts based on versioned statutory rules.
   */
  static calculateGst(params: {
    transactionDate: string | Date;
    grossAmount?: number | string | Prisma.Decimal;
    netAmount?: number | string | Prisma.Decimal;
    amountBasis?: RevenueAmountBasis;
    sector?: GstSector;
    gstClassification?: RevenueGstClassification;
  }): CalculatedRevenueGst {
    const {
      transactionDate,
      grossAmount: rawGross,
      netAmount: rawNet,
      amountBasis = 'GST_INCLUSIVE',
      sector = 'GENERAL',
      gstClassification = 'TAXABLE'
    } = params;

    const formattedDate =
      typeof transactionDate === 'string'
        ? transactionDate
        : transactionDate.toISOString().split('T')[0];

    // Resolve versioned statutory rate
    const rateResolution = canonicalGstEngine.resolveGstRate(formattedDate, sector);

    // Non-taxable supplies (EXEMPT, ZERO_RATED, OUT_OF_SCOPE)
    if (gstClassification !== 'TAXABLE') {
      const baseVal = rawGross !== undefined ? new Decimal(String(rawGross)) : new Decimal(String(rawNet || 0));
      const roundedBase = baseVal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      return {
        grossAmount: new Prisma.Decimal(roundedBase.toString()),
        netAmount: new Prisma.Decimal(roundedBase.toString()),
        gstAmount: new Prisma.Decimal('0.00'),
        gstRate: 0,
        gstRatePercentage: 0,
        gstRuleId: rateResolution.ruleId,
        gstRegulatoryVersion: rateResolution.version,
        gstClassification,
        sector
      };
    }

    // Taxable supplies
    const rateDecimal = new Decimal(rateResolution.rate); // e.g. 0.08 or 0.16 or 0.17

    let finalGross: Decimal;
    let finalNet: Decimal;
    let finalGst: Decimal;

    if (amountBasis === 'GST_EXCLUSIVE') {
      // Net is entered, add GST
      if (rawNet !== undefined) {
        finalNet = new Decimal(String(rawNet)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      } else if (rawGross !== undefined) {
        finalNet = new Decimal(String(rawGross)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      } else {
        finalNet = new Decimal('0.00');
      }

      finalGst = finalNet.times(rateDecimal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      finalGross = finalNet.plus(finalGst);
    } else {
      // GST_INCLUSIVE: Gross is entered, back out GST
      if (rawGross !== undefined) {
        finalGross = new Decimal(String(rawGross)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      } else if (rawNet !== undefined) {
        const netD = new Decimal(String(rawNet));
        finalGross = netD.times(new Decimal(1).plus(rateDecimal)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      } else {
        finalGross = new Decimal('0.00');
      }

      const divisor = new Decimal(1).plus(rateDecimal);
      finalNet = finalGross.dividedBy(divisor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      finalGst = finalGross.minus(finalNet);
    }

    return {
      grossAmount: new Prisma.Decimal(finalGross.toFixed(2)),
      netAmount: new Prisma.Decimal(finalNet.toFixed(2)),
      gstAmount: new Prisma.Decimal(finalGst.toFixed(2)),
      gstRate: rateResolution.rate,
      gstRatePercentage: rateResolution.ratePercentage,
      gstRuleId: rateResolution.ruleId,
      gstRegulatoryVersion: rateResolution.version,
      gstClassification: 'TAXABLE',
      sector
    };
  }

  /**
   * Convenience helper for standard revenue GST calculation returning numbers.
   */
  static calculateRevenueGst(
    amount: number,
    sector: GstSector = 'GENERAL',
    basis: RevenueAmountBasis = 'GST_INCLUSIVE',
    date?: string
  ) {
    const effectiveDate = date || (sector === 'TOURISM' ? '2025-01-15' : '2026-03-01');
    const res = this.calculateGst({
      transactionDate: effectiveDate,
      grossAmount: basis === 'GST_INCLUSIVE' ? amount : undefined,
      netAmount: basis === 'GST_EXCLUSIVE' ? amount : undefined,
      amountBasis: basis,
      sector,
      gstClassification: 'TAXABLE'
    });

    return {
      rate: res.gstRate,
      grossAmount: Number(res.grossAmount.toString()),
      netRevenue: Number(res.netAmount.toString()),
      gstAmount: Number(res.gstAmount.toString()),
      boxAssignment: 'BOX_1'
    };
  }

  /**
   * Convenience helper for zero-rated revenue calculation returning numbers.
   */
  static calculateZeroRatedRevenue(amount: number) {
    const res = this.calculateGst({
      transactionDate: '2026-03-01',
      grossAmount: amount,
      netAmount: amount,
      amountBasis: 'GST_INCLUSIVE',
      sector: 'GENERAL',
      gstClassification: 'ZERO_RATED'
    });

    return {
      rate: 0,
      grossAmount: Number(res.grossAmount.toString()),
      netRevenue: Number(res.netAmount.toString()),
      gstAmount: 0,
      boxAssignment: 'BOX_2'
    };
  }

  /**
   * Convenience helper for exempt revenue calculation returning numbers.
   */
  static calculateExemptRevenue(amount: number) {
    const res = this.calculateGst({
      transactionDate: '2026-03-01',
      grossAmount: amount,
      netAmount: amount,
      amountBasis: 'GST_INCLUSIVE',
      sector: 'GENERAL',
      gstClassification: 'EXEMPT'
    });

    return {
      rate: 0,
      grossAmount: Number(res.grossAmount.toString()),
      netRevenue: Number(res.netAmount.toString()),
      gstAmount: 0,
      boxAssignment: 'BOX_3'
    };
  }

  /**
   * Convenience helper for out-of-scope revenue calculation returning numbers.
   */
  static calculateOutOfScopeRevenue(amount: number, sector: GstSector = 'GENERAL', date?: string) {
    const effectiveDate = date || (sector === 'TOURISM' ? '2025-01-15' : '2026-03-01');
    const res = this.calculateGst({
      transactionDate: effectiveDate,
      grossAmount: amount,
      netAmount: amount,
      amountBasis: 'GST_INCLUSIVE',
      sector,
      gstClassification: 'OUT_OF_SCOPE'
    });

    return {
      rate: 0,
      grossAmount: Number(res.grossAmount.toString()),
      netRevenue: Number(res.netAmount.toString()),
      gstAmount: 0,
      boxAssignment: 'BOX_3'
    };
  }

  /**
   * Creates a canonical GSTTransaction record in the database for regulatory reporting.
   */
  static async createCanonicalGstTransaction(params: {
    tenantId: string;
    transactionDate: string | Date;
    sector: GstSector;
    taxableAmount: Prisma.Decimal | number;
    gstRate: number;
    gstAmount: Prisma.Decimal | number;
    prismaClient?: PrismaClient | Prisma.TransactionClient;
  }) {
    const client = params.prismaClient || defaultPrisma;
    return await client.gSTTransaction.create({
      data: {
        tenantId: params.tenantId,
        transactionDate: new Date(params.transactionDate),
        sector: params.sector,
        taxableAmount: new Prisma.Decimal(params.taxableAmount.toString()),
        gstRate: new Prisma.Decimal(params.gstRate.toString()),
        gstAmount: new Prisma.Decimal(params.gstAmount.toString()),
        isInputTaxClaimable: false // Revenue output tax is not claimable input tax
      }
    });
  }

  /**
   * Converts a RevenueTransaction to canonical GstTransactionInput for MIRA 205 / 206 returns.
   */
  static toGstTransactionInput(revenue: RevenueTransaction): GstTransactionInput {
    const isTaxable =
      revenue.gstClassification === 'TAXABLE' ||
      (!revenue.gstClassification && Number(revenue.gstAmount) > 0);
    const isZeroRated = revenue.gstClassification === 'ZERO_RATED';
    const isExempt = revenue.gstClassification === 'EXEMPT';
    const isOutOfScope = revenue.gstClassification === 'OUT_OF_SCOPE';

    let treatment: 'STANDARD_RATED' | 'ZERO_RATED' | 'EXEMPT' | 'OUT_OF_SCOPE' = 'STANDARD_RATED';

    if (isZeroRated) {
      treatment = 'ZERO_RATED';
    } else if (isExempt) {
      treatment = 'EXEMPT';
    } else if (isOutOfScope) {
      treatment = 'OUT_OF_SCOPE';
    } else {
      treatment = 'STANDARD_RATED';
    }

    const netAmount = Number(revenue.netAmount.toString());
    const gstAmount = Number(revenue.gstAmount.toString());

    return {
      tenantId: revenue.tenantId || 'DEFAULT',
      transactionDate: revenue.transactionDate,
      sector: revenue.sector || 'GENERAL',
      transactionType: 'OUTPUT_TAX',
      treatment,
      description: revenue.description || `Revenue: ${revenue.category}`,
      taxableAmount: netAmount,
      gstRate: isTaxable ? revenue.gstRate : 0,
      gstAmount: isTaxable ? gstAmount : 0,
      isInputTaxClaimable: false, // Revenue supplies are Output Tax
      sourceDocumentNumber: revenue.id
    };
  }

  /**
   * Retrieves posted revenue transactions for a tenant and converts them to GstTransactionInput[]
   */
  static getRevenueGstInputs(params: {
    tenantId?: string;
    startDate?: string;
    endDate?: string;
    sector?: GstSector;
  }): GstTransactionInput[] {
    const all = RevenuePersistenceService.getAll(params.tenantId);
    const posted = all.filter((r) => r.status === 'POSTED');

    const filtered = posted.filter((r) => {
      if (params.sector && r.sector !== params.sector) return false;
      if (params.startDate && r.transactionDate < params.startDate) return false;
      if (params.endDate && r.transactionDate > params.endDate) return false;
      return true;
    });

    return filtered.map((r) => this.toGstTransactionInput(r));
  }

  /**
   * Finds the originating RevenueTransaction for a given GSTTransaction ID.
   */
  static getRevenueForGstTransaction(
    gstTransactionId: string,
    tenantId?: string
  ): RevenueTransaction | null {
    return RevenuePersistenceService.findByGstTransactionId(gstTransactionId, tenantId);
  }

  /**
   * Traces a GSTTransaction back to its originating RevenueTransaction, Journal,
   * and verifies cross-subledger consistency.
   */
  static async traceGstTransaction(
    gstTransactionId: string,
    tenantId?: string,
    prismaClient?: PrismaClient | Prisma.TransactionClient
  ) {
    const client = prismaClient || defaultPrisma;
    const gstTx = await client.gSTTransaction.findUnique({
      where: { id: gstTransactionId }
    });

    if (!gstTx) {
      return {
        found: false,
        error: `GSTTransaction ${gstTransactionId} not found in database.`
      };
    }

    const revenueTx = RevenuePersistenceService.findByGstTransactionId(gstTransactionId, tenantId);

    let journal = null;
    if (revenueTx?.journalId) {
      journal = await client.journal.findUnique({
        where: { id: revenueTx.journalId },
        include: { lines: true }
      });
    }

    let isConsistent = true;
    const discrepancies: string[] = [];

    if (revenueTx) {
      const gstAmtFromDb = new Prisma.Decimal(gstTx.gstAmount.toString());
      const gstAmtFromRev = new Prisma.Decimal(revenueTx.gstAmount.toString());
      if (!gstAmtFromDb.equals(gstAmtFromRev)) {
        isConsistent = false;
        discrepancies.push(
          `GST Amount mismatch: GSTTransaction has ${gstAmtFromDb.toString()}, RevenueTransaction has ${gstAmtFromRev.toString()}`
        );
      }

      if (gstTx.sector !== revenueTx.sector) {
        isConsistent = false;
        discrepancies.push(
          `Sector mismatch: GSTTransaction is ${gstTx.sector}, RevenueTransaction is ${revenueTx.sector}`
        );
      }
    }

    return {
      found: true,
      gstTransaction: gstTx,
      revenueTransaction: revenueTx,
      journal,
      isConsistent,
      discrepancies
    };
  }

  /**
   * Generates authoritative MIRA 205 General Sector GST Return combining purchases and revenue output supplies.
   */
  static generateAuthoritativeMira205Return(params: {
    tenantId: string;
    taxpayer: { tin: string; name: string; businessAddress?: string };
    period: { periodName: string; startDate: string; endDate: string; taxYear: number };
    purchaseTransactions?: GstTransactionInput[];
    revenueTransactions?: RevenueTransaction[];
    previousExcessCredit?: number;
  }): Mira205GeneralReturn {
    const purchases = params.purchaseTransactions || [];
    const revenues = params.revenueTransactions
      ? params.revenueTransactions.map((r) => this.toGstTransactionInput(r))
      : this.getRevenueGstInputs({
          tenantId: params.tenantId,
          startDate: params.period.startDate,
          endDate: params.period.endDate,
          sector: 'GENERAL'
        });

    const allTransactions = [...purchases, ...revenues];

    return canonicalGstEngine.generateMira205Return({
      transactions: allTransactions,
      taxpayer: params.taxpayer,
      period: params.period,
      previousExcessCredit: params.previousExcessCredit || 0
    });
  }

  /**
   * Generates authoritative MIRA 206 Tourism Sector GST Return combining tourism purchases and tourism revenue output supplies.
   */
  static generateAuthoritativeMira206Return(params: {
    tenantId: string;
    taxpayer: {
      tin: string;
      name: string;
      tourismEstablishmentName?: string;
      operatingLicenseNumber?: string;
    };
    period: { periodName: string; startDate: string; endDate: string; taxYear: number };
    purchaseTransactions?: GstTransactionInput[];
    revenueTransactions?: RevenueTransaction[];
    previousExcessCredit?: number;
  }): Mira206TourismReturn {
    const purchases = params.purchaseTransactions || [];
    const revenues = params.revenueTransactions
      ? params.revenueTransactions.map((r) => this.toGstTransactionInput(r))
      : this.getRevenueGstInputs({
          tenantId: params.tenantId,
          startDate: params.period.startDate,
          endDate: params.period.endDate,
          sector: 'TOURISM'
        });

    const allTransactions = [...purchases, ...revenues];

    return canonicalGstEngine.generateMira206Return({
      transactions: allTransactions,
      taxpayer: params.taxpayer,
      period: params.period,
      previousExcessCredit: params.previousExcessCredit || 0
    });
  }
}
