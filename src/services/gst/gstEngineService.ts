import crypto from 'crypto';
import { RuleResolver } from '../../regulatory/resolvers/ruleResolver';
import { prisma } from '../../db/client';
import {
  GstSector,
  GstTransactionType,
  GstTreatment,
  GstRateResolution,
  GstTransactionInput,
  Mira205GeneralReturn,
  Mira206TourismReturn,
  GstGlReconciliation
} from '../../types/gst';

export class GstEngineService {
  private ruleResolver: RuleResolver;

  constructor(customResolver?: RuleResolver) {
    this.ruleResolver = customResolver ?? new RuleResolver();
  }

  /**
   * Resolves the effective GST rate and regulatory rule for a transaction date and sector.
   * Rates are resolved dynamically from verified regulatory rules:
   * - General Sector: 8% (v23.1)
   * - Tourism Sector: 16% (through 2025-06-30), 17% (from 2025-07-01)
   */
  public resolveGstRate(dateInput: string | Date, sector: GstSector = 'GENERAL'): GstRateResolution {
    const formattedDate = RuleResolver.normalizeDate(dateInput);
    const ruleCode = sector === 'TOURISM' ? 'GST_TOURISM_RATE' : 'GST_GENERAL_RATE';

    const rule = this.ruleResolver.resolveRule({
      transactionDate: formattedDate,
      taxType: 'GST',
      ruleCode,
      sector
    });

    if (!rule || !rule.parameters || typeof rule.parameters.rate !== 'number') {
      // Fallback deterministic defaults per MIRA statutory law
      if (sector === 'TOURISM') {
        const isPostJuly2025 = formattedDate >= '2025-07-01';
        return {
          rate: isPostJuly2025 ? 0.17 : 0.16,
          ratePercentage: isPostJuly2025 ? 17 : 16,
          ruleId: isPostJuly2025 ? 'RULE-GST-TOU-17' : 'RULE-GST-TOU-16',
          version: isPostJuly2025 ? 'v25.1' : 'v23.1',
          legalReference: 'GST Act Amendment (Act No. 20/2022) Section 15(b)',
          effectiveFrom: isPostJuly2025 ? '2025-07-01' : '2023-01-01',
          effectiveTo: isPostJuly2025 ? null : '2025-06-30',
          sector: 'TOURISM'
        };
      } else {
        return {
          rate: 0.08,
          ratePercentage: 8,
          ruleId: 'RULE-GST-GEN-8',
          version: 'v23.1',
          legalReference: 'GST Act Amendment (Act No. 20/2022) Section 15(a)',
          effectiveFrom: '2023-01-01',
          effectiveTo: null,
          sector: 'GENERAL'
        };
      }
    }

    return {
      rate: Number(rule.parameters.rate),
      ratePercentage: Number(rule.parameters.ratePercentage ?? (rule.parameters.rate * 100)),
      ruleId: rule.ruleId,
      version: rule.version,
      legalReference: rule.legalReference,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      sector
    };
  }

  /**
   * Evaluates input tax claimability under MIRA GST Act Section 22(b) & Chapter 4.
   */
  public evaluateInputEligibility(tx: {
    category?: string;
    description?: string;
    treatment?: string;
    isCapitalAsset?: boolean;
    isMixedUse?: boolean;
  }): {
    treatment: GstTreatment;
    isClaimable: boolean;
    reason: string;
  } {
    const desc = (tx.description || '').toLowerCase();
    const category = (tx.category || '').toLowerCase();
    const treatment = tx.treatment?.toUpperCase();

    // 1. Blocked input tax per MIRA GST Act Section 22(b)
    if (
      treatment === 'BLOCKED' ||
      treatment === 'BLOCKED_INPUT_TAX' ||
      category.includes('entertainment') ||
      category.includes('fine') ||
      category.includes('penalty') ||
      category.includes('motor_vehicle_passenger') ||
      desc.includes('entertainment') ||
      desc.includes('fine') ||
      desc.includes('penalty') ||
      desc.includes('personal gift')
    ) {
      return {
        treatment: 'BLOCKED_INPUT_TAX',
        isClaimable: false,
        reason: 'Blocked input tax under MIRA GST Act Section 22(b) (Entertainment/Penalties/Non-business)'
      };
    }

    // 2. Capital asset input tax
    if (tx.isCapitalAsset || category.includes('asset') || category.includes('equipment') || category.includes('machinery')) {
      return {
        treatment: 'CAPITAL_INPUT_TAX',
        isClaimable: true,
        reason: 'Capital Asset Input Tax (separately reported in Return Box 9/10)'
      };
    }

    // 3. Mixed-use pro-rata input tax
    if (tx.isMixedUse || category.includes('utilities') || category.includes('rent') || category.includes('office_overhead')) {
      return {
        treatment: 'MIXED_USE_INPUT_TAX',
        isClaimable: true,
        reason: 'Mixed-use overhead requiring statutory pro-rata turnover apportionment'
      };
    }

    // 4. Zero-rated / Exempt / Out of Scope
    if (treatment === 'EXEMPT' || treatment === 'OUT_OF_SCOPE') {
      return {
        treatment: 'EXEMPT',
        isClaimable: false,
        reason: 'No input tax claimable on exempt or out-of-scope transactions'
      };
    }

    if (treatment === 'ZERO_RATED') {
      return {
        treatment: 'ZERO_RATED',
        isClaimable: false,
        reason: 'Zero-rated supply (0% tax)'
      };
    }

    // 5. Standard claimable input tax
    return {
      treatment: 'GENERAL_INPUT_TAX',
      isClaimable: true,
      reason: 'Claimable general input tax incurred for business purposes'
    };
  }

  /**
   * Computes GST apportionment ratio for mixed supplies.
   * Apportionment Ratio = (Taxable Supplies + Zero-Rated Supplies) / Total Supplies
   */
  public calculateApportionmentRatio(
    taxableSupplies: number,
    zeroRatedSupplies: number,
    exemptSupplies: number
  ): number {
    const totalSupplies = taxableSupplies + zeroRatedSupplies + exemptSupplies;
    if (totalSupplies <= 0) return 1.0;
    const ratio = (taxableSupplies + zeroRatedSupplies) / totalSupplies;
    return Math.min(1.0, Math.max(0.0, Number(ratio.toFixed(4))));
  }

  /**
   * Calculates GST for a single transaction based on sector and date.
   */
  public calculateTransactionGst(input: {
    transactionDate: string | Date;
    sector: GstSector;
    taxableAmount: number;
    transactionType: GstTransactionType;
    treatment?: GstTreatment;
    isCapitalAsset?: boolean;
    apportionmentRatio?: number;
  }): {
    gstRate: number;
    gstAmount: number;
    claimableGstAmount: number;
    ruleResolution: GstRateResolution;
    isClaimable: boolean;
  } {
    const ruleResolution = this.resolveGstRate(input.transactionDate, input.sector);
    const amount = Number(input.taxableAmount || 0);

    // Special treatments with 0% tax
    if (
      input.treatment === 'ZERO_RATED' ||
      input.treatment === 'EXEMPT' ||
      input.treatment === 'OUT_OF_SCOPE' ||
      input.transactionType === 'ZERO_RATED_SUPPLY' ||
      input.transactionType === 'EXEMPT_SUPPLY' ||
      input.transactionType === 'OUT_OF_SCOPE'
    ) {
      return {
        gstRate: 0,
        gstAmount: 0,
        claimableGstAmount: 0,
        ruleResolution,
        isClaimable: false
      };
    }

    const gstRate = ruleResolution.rate;
    const rawGst = amount * gstRate;
    const gstAmount = Number(rawGst.toFixed(2));

    let claimableGstAmount = 0;
    let isClaimable = false;

    if (input.transactionType === 'OUTPUT_TAX' || input.transactionType === 'DEBIT_NOTE_ADJUSTMENT' || input.transactionType === 'CREDIT_NOTE_ADJUSTMENT') {
      claimableGstAmount = 0;
      isClaimable = false;
    } else if (input.transactionType === 'BLOCKED_INPUT_TAX' || input.treatment === 'BLOCKED_INPUT_TAX') {
      claimableGstAmount = 0;
      isClaimable = false;
    } else if (input.transactionType === 'CAPITAL_INPUT_TAX' || input.treatment === 'CAPITAL_INPUT_TAX' || input.isCapitalAsset) {
      claimableGstAmount = gstAmount;
      isClaimable = true;
    } else if (input.treatment === 'MIXED_USE_INPUT_TAX') {
      const ratio = input.apportionmentRatio !== undefined ? input.apportionmentRatio : 1.0;
      claimableGstAmount = Number((gstAmount * ratio).toFixed(2));
      isClaimable = claimableGstAmount > 0;
    } else {
      // General input tax
      claimableGstAmount = gstAmount;
      isClaimable = true;
    }

    return {
      gstRate,
      gstAmount,
      claimableGstAmount,
      ruleResolution,
      isClaimable
    };
  }

  /**
   * Generates official MIRA 205 (General Sector GST Return Form v25.1)
   */
  public generateMira205Return(params: {
    transactions: GstTransactionInput[];
    taxpayer: {
      tin: string;
      name: string;
      businessAddress?: string;
    };
    period: {
      periodName: string;
      startDate: string;
      endDate: string;
      taxYear: number;
    };
    previousExcessCredit?: number;
  }): Mira205GeneralReturn {
    const { transactions, taxpayer, period, previousExcessCredit = 0 } = params;

    // Filter transactions in date range (or all if already filtered)
    const genTxList = transactions.filter((tx) => {
      const txDate = RuleResolver.normalizeDate(tx.transactionDate);
      return txDate >= period.startDate && txDate <= period.endDate && tx.sector === 'GENERAL';
    });

    let box1Taxable = 0;
    let box1Tax = 0;
    let box2ZeroRated = 0;
    let box3Exempt = 0;
    let box6OutputAdjustments = 0;

    let box8TaxablePurchases = 0;
    let box8InputTax = 0;
    let box9CapitalPurchases = 0;
    let box9CapitalTax = 0;
    let box10BlockedPurchases = 0;
    let box10BlockedTax = 0;
    let box11MixedPurchases = 0;
    let box11MixedGrossTax = 0;
    let box11MixedClaimableTax = 0;
    let box13InputAdjustments = 0;

    for (const tx of genTxList) {
      const amount = Number(tx.taxableAmount || 0);
      const calc = this.calculateTransactionGst({
        transactionDate: tx.transactionDate,
        sector: 'GENERAL',
        taxableAmount: amount,
        transactionType: tx.transactionType,
        treatment: tx.treatment,
        isCapitalAsset: tx.isCapitalAsset,
        apportionmentRatio: tx.apportionmentRatio
      });

      const effectiveTax = tx.gstAmount !== undefined ? Number(tx.gstAmount) : calc.gstAmount;

      switch (tx.transactionType) {
        case 'OUTPUT_TAX':
          if (tx.treatment === 'ZERO_RATED') {
            box2ZeroRated += amount;
          } else if (tx.treatment === 'EXEMPT' || tx.treatment === 'OUT_OF_SCOPE') {
            box3Exempt += amount;
          } else {
            box1Taxable += amount;
            box1Tax += effectiveTax;
          }
          break;

        case 'ZERO_RATED_SUPPLY':
          box2ZeroRated += amount;
          break;

        case 'EXEMPT_SUPPLY':
        case 'OUT_OF_SCOPE':
          box3Exempt += amount;
          break;

        case 'DEBIT_NOTE_ADJUSTMENT':
          box6OutputAdjustments += effectiveTax;
          break;

        case 'CREDIT_NOTE_ADJUSTMENT':
          box6OutputAdjustments -= effectiveTax;
          break;

        case 'INPUT_TAX':
          if (tx.treatment === 'CAPITAL_INPUT_TAX' || tx.isCapitalAsset) {
            box9CapitalPurchases += amount;
            box9CapitalTax += effectiveTax;
          } else if (tx.treatment === 'BLOCKED_INPUT_TAX') {
            box10BlockedPurchases += amount;
            box10BlockedTax += effectiveTax;
          } else if (tx.treatment === 'MIXED_USE_INPUT_TAX') {
            box11MixedPurchases += amount;
            box11MixedGrossTax += effectiveTax;
            const ratio = tx.apportionmentRatio ?? 1.0;
            box11MixedClaimableTax += Number((effectiveTax * ratio).toFixed(2));
          } else {
            box8TaxablePurchases += amount;
            box8InputTax += effectiveTax;
          }
          break;

        case 'CAPITAL_INPUT_TAX':
          box9CapitalPurchases += amount;
          box9CapitalTax += effectiveTax;
          break;

        case 'BLOCKED_INPUT_TAX':
          box10BlockedPurchases += amount;
          box10BlockedTax += effectiveTax;
          break;

        default:
          if (tx.treatment === 'GENERAL_INPUT_TAX' || (tx.isInputTaxClaimable && effectiveTax > 0)) {
            box8TaxablePurchases += amount;
            box8InputTax += effectiveTax;
          }
          break;
      }
    }

    // Output totals
    const box4TotalSupplies = Number((box1Taxable + box2ZeroRated + box3Exempt).toFixed(2));
    const box5TotalOutputTax = Number(box1Tax.toFixed(2));
    const box7NetOutputTax = Number((box5TotalOutputTax + box6OutputAdjustments).toFixed(2));

    // Calculate mixed use apportionment ratio if not fixed
    const apportionmentRatio = this.calculateApportionmentRatio(box1Taxable, box2ZeroRated, box3Exempt);
    if (box11MixedPurchases > 0 && box11MixedClaimableTax === 0 && box11MixedGrossTax > 0) {
      box11MixedClaimableTax = Number((box11MixedGrossTax * apportionmentRatio).toFixed(2));
    }

    // Input totals
    const box12TotalClaimableInput = Number(
      (box8InputTax + box9CapitalTax + box11MixedClaimableTax).toFixed(2)
    );
    const box14NetClaimableInput = Number((box12TotalClaimableInput + box13InputAdjustments).toFixed(2));

    // Net payable / refundable
    const box15NetGst = Number((box7NetOutputTax - box14NetClaimableInput).toFixed(2));
    const box17Final = Number((box15NetGst - previousExcessCredit).toFixed(2));

    const formId = `MIRA205-${taxpayer.tin}-${period.periodName}-${Date.now()}`;
    const generatedAt = new Date().toISOString();

    const checksumPayload = JSON.stringify({
      formId,
      tin: taxpayer.tin,
      period: period.periodName,
      netOutput: box7NetOutputTax,
      netInput: box14NetClaimableInput,
      finalPayable: box17Final
    });
    const checksum = crypto.createHash('sha256').update(checksumPayload).digest('hex');

    return {
      formId,
      formType: 'MIRA_205',
      formTitle: 'General Sector GST Return',
      formVersion: 'v25.1',
      generatedAt,
      taxpayer: {
        tin: taxpayer.tin,
        name: taxpayer.name,
        businessAddress: taxpayer.businessAddress,
        sector: 'GENERAL'
      },
      period: {
        periodName: period.periodName,
        startDate: period.startDate,
        endDate: period.endDate,
        taxYear: period.taxYear
      },
      sectionA_Supplies: {
        box1_StandardRatedSupplies8Pct: {
          taxableValue: Number(box1Taxable.toFixed(2)),
          outputTax: box5TotalOutputTax
        },
        box2_ZeroRatedSupplies: Number(box2ZeroRated.toFixed(2)),
        box3_ExemptSupplies: Number(box3Exempt.toFixed(2)),
        box4_TotalSuppliesValue: box4TotalSupplies,
        box5_TotalOutputTax: box5TotalOutputTax,
        box6_OutputTaxAdjustments: Number(box6OutputAdjustments.toFixed(2)),
        box7_NetOutputTax: box7NetOutputTax
      },
      sectionB_Purchases: {
        box8_StandardRatedPurchases: {
          taxableValue: Number(box8TaxablePurchases.toFixed(2)),
          inputTax: Number(box8InputTax.toFixed(2))
        },
        box9_CapitalPurchases: {
          taxableValue: Number(box9CapitalPurchases.toFixed(2)),
          inputTax: Number(box9CapitalTax.toFixed(2))
        },
        box10_BlockedInputTax: {
          taxableValue: Number(box10BlockedPurchases.toFixed(2)),
          blockedTax: Number(box10BlockedTax.toFixed(2))
        },
        box11_MixedUseApportionment: {
          totalMixedValue: Number(box11MixedPurchases.toFixed(2)),
          grossInputTax: Number(box11MixedGrossTax.toFixed(2)),
          apportionmentRatio,
          claimableInputTax: Number(box11MixedClaimableTax.toFixed(2))
        },
        box12_TotalClaimableInputTax: box12TotalClaimableInput,
        box13_InputTaxAdjustments: Number(box13InputAdjustments.toFixed(2)),
        box14_NetClaimableInputTax: box14NetClaimableInput
      },
      sectionC_Calculation: {
        box15_NetGstPayableOrRefundable: box15NetGst,
        box16_PreviousExcessCreditsCarriedForward: Number(previousExcessCredit.toFixed(2)),
        box17_FinalAmountPayableOrRefundable: box17Final
      },
      regulatoryTraceability: {
        ruleId: 'RULE-GST-GEN-8',
        regulatoryVersion: 'v23.1 / v25.1',
        legalReference: 'Maldives GST Act Section 15(a) & MIRA Tax Rulings',
        checksum
      }
    };
  }

  /**
   * Generates official MIRA 206 (Tourism Sector GST Return Form v25.1)
   */
  public generateMira206Return(params: {
    transactions: GstTransactionInput[];
    taxpayer: {
      tin: string;
      name: string;
      tourismEstablishmentName?: string;
      operatingLicenseNumber?: string;
    };
    period: {
      periodName: string;
      startDate: string;
      endDate: string;
      taxYear: number;
    };
    previousExcessCredit?: number;
  }): Mira206TourismReturn {
    const { transactions, taxpayer, period, previousExcessCredit = 0 } = params;

    const touTxList = transactions.filter((tx) => {
      const txDate = RuleResolver.normalizeDate(tx.transactionDate);
      return txDate >= period.startDate && txDate <= period.endDate && tx.sector === 'TOURISM';
    });

    let box1ATaxable16Pct = 0;
    let box1AOutputTax16Pct = 0;
    let box1BTaxable17Pct = 0;
    let box1BOutputTax17Pct = 0;
    let box2ZeroRated = 0;
    let box3Exempt = 0;
    let box6OutputAdjustments = 0;

    let box8OperationalPurchases = 0;
    let box8OperationalTax = 0;
    let box9CapitalPurchases = 0;
    let box9CapitalTax = 0;
    let box10BlockedPurchases = 0;
    let box10BlockedTax = 0;
    let box12InputAdjustments = 0;

    for (const tx of touTxList) {
      const amount = Number(tx.taxableAmount || 0);
      const txDate = RuleResolver.normalizeDate(tx.transactionDate);
      const isPreJuly2025 = txDate <= '2025-06-30';

      const calc = this.calculateTransactionGst({
        transactionDate: tx.transactionDate,
        sector: 'TOURISM',
        taxableAmount: amount,
        transactionType: tx.transactionType,
        treatment: tx.treatment,
        isCapitalAsset: tx.isCapitalAsset,
        apportionmentRatio: tx.apportionmentRatio
      });

      const effectiveTax = tx.gstAmount !== undefined ? Number(tx.gstAmount) : calc.gstAmount;

      switch (tx.transactionType) {
        case 'OUTPUT_TAX':
          if (tx.treatment === 'ZERO_RATED') {
            box2ZeroRated += amount;
          } else if (tx.treatment === 'EXEMPT' || tx.treatment === 'OUT_OF_SCOPE') {
            box3Exempt += amount;
          } else {
            if (isPreJuly2025) {
              box1ATaxable16Pct += amount;
              box1AOutputTax16Pct += effectiveTax;
            } else {
              box1BTaxable17Pct += amount;
              box1BOutputTax17Pct += effectiveTax;
            }
          }
          break;

        case 'ZERO_RATED_SUPPLY':
          box2ZeroRated += amount;
          break;

        case 'EXEMPT_SUPPLY':
        case 'OUT_OF_SCOPE':
          box3Exempt += amount;
          break;

        case 'DEBIT_NOTE_ADJUSTMENT':
          box6OutputAdjustments += effectiveTax;
          break;

        case 'CREDIT_NOTE_ADJUSTMENT':
          box6OutputAdjustments -= effectiveTax;
          break;

        case 'INPUT_TAX':
          if (tx.treatment === 'CAPITAL_INPUT_TAX' || tx.isCapitalAsset) {
            box9CapitalPurchases += amount;
            box9CapitalTax += effectiveTax;
          } else if (tx.treatment === 'BLOCKED_INPUT_TAX') {
            box10BlockedPurchases += amount;
            box10BlockedTax += effectiveTax;
          } else {
            box8OperationalPurchases += amount;
            box8OperationalTax += effectiveTax;
          }
          break;

        case 'CAPITAL_INPUT_TAX':
          box9CapitalPurchases += amount;
          box9CapitalTax += effectiveTax;
          break;

        case 'BLOCKED_INPUT_TAX':
          box10BlockedPurchases += amount;
          box10BlockedTax += effectiveTax;
          break;

        default:
          if (tx.isInputTaxClaimable && effectiveTax > 0) {
            box8OperationalPurchases += amount;
            box8OperationalTax += effectiveTax;
          }
          break;
      }
    }

    const box4TotalSupplies = Number(
      (box1ATaxable16Pct + box1BTaxable17Pct + box2ZeroRated + box3Exempt).toFixed(2)
    );
    const box5TotalTgstOutput = Number((box1AOutputTax16Pct + box1BOutputTax17Pct).toFixed(2));
    const box7NetTgstOutput = Number((box5TotalTgstOutput + box6OutputAdjustments).toFixed(2));

    const box11TotalClaimableInput = Number((box8OperationalTax + box9CapitalTax).toFixed(2));
    const box13NetClaimableInput = Number((box11TotalClaimableInput + box12InputAdjustments).toFixed(2));

    const box14NetTgst = Number((box7NetTgstOutput - box13NetClaimableInput).toFixed(2));
    const box16Final = Number((box14NetTgst - previousExcessCredit).toFixed(2));

    const formId = `MIRA206-${taxpayer.tin}-${period.periodName}-${Date.now()}`;
    const generatedAt = new Date().toISOString();

    const checksumPayload = JSON.stringify({
      formId,
      tin: taxpayer.tin,
      period: period.periodName,
      netOutput: box7NetTgstOutput,
      netInput: box13NetClaimableInput,
      finalPayable: box16Final
    });
    const checksum = crypto.createHash('sha256').update(checksumPayload).digest('hex');

    return {
      formId,
      formType: 'MIRA_206',
      formTitle: 'Tourism Sector GST Return (TGST)',
      formVersion: 'v25.1',
      generatedAt,
      taxpayer: {
        tin: taxpayer.tin,
        name: taxpayer.name,
        tourismEstablishmentName: taxpayer.tourismEstablishmentName,
        operatingLicenseNumber: taxpayer.operatingLicenseNumber,
        sector: 'TOURISM'
      },
      period: {
        periodName: period.periodName,
        startDate: period.startDate,
        endDate: period.endDate,
        taxYear: period.taxYear
      },
      sectionA_Supplies: {
        box1A_TourismSupplies16Pct: {
          taxableValue: Number(box1ATaxable16Pct.toFixed(2)),
          outputTax: Number(box1AOutputTax16Pct.toFixed(2))
        },
        box1B_TourismSupplies17Pct: {
          taxableValue: Number(box1BTaxable17Pct.toFixed(2)),
          outputTax: Number(box1BOutputTax17Pct.toFixed(2))
        },
        box2_ZeroRatedTourismSupplies: Number(box2ZeroRated.toFixed(2)),
        box3_ExemptTourismSupplies: Number(box3Exempt.toFixed(2)),
        box4_TotalTourismSuppliesValue: box4TotalSupplies,
        box5_TotalTgstOutputTax: box5TotalTgstOutput,
        box6_TgstOutputAdjustments: Number(box6OutputAdjustments.toFixed(2)),
        box7_NetTgstOutputTax: box7NetTgstOutput
      },
      sectionB_Purchases: {
        box8_TourismOperationalPurchases: {
          taxableValue: Number(box8OperationalPurchases.toFixed(2)),
          inputTax: Number(box8OperationalTax.toFixed(2))
        },
        box9_TourismCapitalPurchases: {
          taxableValue: Number(box9CapitalPurchases.toFixed(2)),
          inputTax: Number(box9CapitalTax.toFixed(2))
        },
        box10_BlockedInputTax: {
          taxableValue: Number(box10BlockedPurchases.toFixed(2)),
          blockedTax: Number(box10BlockedTax.toFixed(2))
        },
        box11_TotalClaimableTgstInputTax: box11TotalClaimableInput,
        box12_TgstInputAdjustments: Number(box12InputAdjustments.toFixed(2)),
        box13_NetClaimableTgstInputTax: box13NetClaimableInput
      },
      sectionC_Calculation: {
        box14_NetTgstPayableOrRefundable: box14NetTgst,
        box15_PreviousExcessCreditsCarriedForward: Number(previousExcessCredit.toFixed(2)),
        box16_FinalTgstPayableOrRefundable: box16Final
      },
      regulatoryTraceability: {
        applicableRules: ['RULE-GST-TOU-16', 'RULE-GST-TOU-17'],
        regulatoryVersion: 'v23.1 / v25.1',
        legalReference: 'Maldives GST Act Section 15(b) & Act No. 20/2022',
        checksum
      }
    };
  }

  /**
   * Reconciles GST Transactions to the General Ledger (GL) accounts:
   * - Account 2200-GST-OUTPUT-TAX (GST Output Tax Payable)
   * - Account 2100-GST-INPUT-TAX (GST Input Tax Claimable)
   */
  public async reconcileGstToGl(params: {
    tenantId: string;
    periodStart: string;
    periodEnd: string;
    sector?: GstSector;
  }): Promise<GstGlReconciliation> {
    const { tenantId, periodStart, periodEnd, sector = 'GENERAL' } = params;

    // Fetch GST transactions
    const dbGstTxs = await prisma.gSTTransaction.findMany({
      where: {
        tenantId,
        transactionDate: {
          gte: new Date(periodStart),
          lte: new Date(periodEnd)
        },
        sector
      }
    });

    let gstTransactionsTotalOutputTax = 0;
    let gstTransactionsTotalInputTax = 0;

    for (const tx of dbGstTxs) {
      const gstAmt = Number(tx.gstAmount);
      if (tx.isInputTaxClaimable) {
        gstTransactionsTotalInputTax += gstAmt;
      } else {
        gstTransactionsTotalOutputTax += gstAmt;
      }
    }

    // Fetch GL Journal Lines for 2200-GST-OUTPUT-TAX and 2100-GST-INPUT-TAX (including legacy aliases)
    const glLines = await prisma.journalLine.findMany({
      where: {
        journal: {
          tenantId,
          entryDate: {
            gte: new Date(periodStart),
            lte: new Date(periodEnd)
          }
        },
        accountCode: {
          in: ['2200-GST-OUTPUT-TAX', '2100-GST-INPUT-TAX', '2200', '2100', '1400']
        }
      }
    });

    let glOutputTaxBalance = 0; // Credit normal: credit - debit
    let glInputTaxBalance = 0;  // Debit normal: debit - credit

    for (const line of glLines) {
      const debit = Number(line.debit);
      const credit = Number(line.credit);
      if (line.accountCode === '2200-GST-OUTPUT-TAX' || line.accountCode === '2200') {
        glOutputTaxBalance += (credit - debit);
      } else if (line.accountCode === '2100-GST-INPUT-TAX' || line.accountCode === '1400') {
        glInputTaxBalance += (debit - credit);
      } else if (line.accountCode === '2100') {
        // Fallback for legacy 2100 if used as output tax
        glOutputTaxBalance += (credit - debit);
      }
    }

    const outputTaxVariance = Number(Math.abs(gstTransactionsTotalOutputTax - glOutputTaxBalance).toFixed(2));
    const inputTaxVariance = Number(Math.abs(gstTransactionsTotalInputTax - glInputTaxBalance).toFixed(2));

    const isReconciled = outputTaxVariance < 0.05 && inputTaxVariance < 0.05;
    const discrepancies: string[] = [];

    if (outputTaxVariance >= 0.05) {
      discrepancies.push(
        `Output GST variance of MVR ${outputTaxVariance.toFixed(2)} between GST transactions (MVR ${gstTransactionsTotalOutputTax.toFixed(2)}) and GL Account 2200-GST-OUTPUT-TAX (MVR ${glOutputTaxBalance.toFixed(2)})`
      );
    }

    if (inputTaxVariance >= 0.05) {
      discrepancies.push(
        `Input GST variance of MVR ${inputTaxVariance.toFixed(2)} between GST transactions (MVR ${gstTransactionsTotalInputTax.toFixed(2)}) and GL Account 2100-GST-INPUT-TAX (MVR ${glInputTaxBalance.toFixed(2)})`
      );
    }

    return {
      periodStart,
      periodEnd,
      sector,
      gstTransactionsTotalOutputTax: Number(gstTransactionsTotalOutputTax.toFixed(2)),
      gstTransactionsTotalInputTax: Number(gstTransactionsTotalInputTax.toFixed(2)),
      glOutputTaxBalance: Number(glOutputTaxBalance.toFixed(2)),
      glInputTaxBalance: Number(glInputTaxBalance.toFixed(2)),
      outputTaxVariance,
      inputTaxVariance,
      isReconciled,
      discrepancies
    };
  }

  /**
   * Records a GST transaction in the database.
   */
  public async createGstTransaction(input: GstTransactionInput) {
    const calc = this.calculateTransactionGst({
      transactionDate: input.transactionDate,
      sector: input.sector,
      taxableAmount: input.taxableAmount,
      transactionType: input.transactionType,
      treatment: input.treatment,
      isCapitalAsset: input.isCapitalAsset,
      apportionmentRatio: input.apportionmentRatio
    });

    const gstRate = input.gstRate !== undefined ? input.gstRate : calc.gstRate;
    const gstAmount = input.gstAmount !== undefined ? input.gstAmount : calc.gstAmount;
    const isInputTaxClaimable = input.isInputTaxClaimable !== undefined ? input.isInputTaxClaimable : calc.isClaimable;

    return await prisma.gSTTransaction.create({
      data: {
        tenantId: input.tenantId,
        invoiceId: input.invoiceId ?? null,
        gstPeriodId: input.gstPeriodId ?? null,
        transactionDate: new Date(input.transactionDate),
        sector: input.sector,
        taxableAmount: input.taxableAmount,
        gstRate,
        gstAmount,
        isInputTaxClaimable
      }
    });
  }
}

export const canonicalGstEngine = new GstEngineService();
