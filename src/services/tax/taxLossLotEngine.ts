import { Prisma } from '@prisma/client';
import { defaultRuleResolver, RuleResolver } from '../../regulatory/resolvers/ruleResolver';
import {
  TaxLossLot,
  TaxLossUtilisation,
  CreateTaxLossLotInput,
  ApplyLossReliefParams,
  LossReliefResult,
  TaxLossLotAuditEntry,
  TaxLossSchedule,
  TaxLossScheduleItem,
  TaxLossStatus
} from '../../types/taxLoss';

const Decimal = Prisma.Decimal;

export class TaxLossLotEngine {
  private ruleResolver: RuleResolver;
  private lossLots: Map<string, TaxLossLot> = new Map();
  private utilisations: Map<string, TaxLossUtilisation> = new Map();

  constructor(ruleResolver?: RuleResolver) {
    this.ruleResolver = ruleResolver ?? defaultRuleResolver;
  }

  /**
   * Helper to round Decimals to standard 2 decimal places.
   */
  private roundDec(val: Prisma.Decimal): number {
    return Number(val.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString());
  }

  /**
   * Generates a deterministic or random unique ID.
   */
  private generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  }

  /**
   * Step 1: Create a TaxLossLot when a tax loss is incurred in a tax year.
   * Enforces Section 30 dynamic rule resolution, non-negative amounts, and duplicate lot prevention.
   */
  public createLossLot(input: CreateTaxLossLotInput): TaxLossLot {
    if (!input.tenantId || typeof input.tenantId !== 'string') {
      throw new Error('[TaxLossError] tenantId is required to create a TaxLossLot.');
    }

    if (!input.originTaxYear || typeof input.originTaxYear !== 'number' || input.originTaxYear < 2000) {
      throw new Error(`[TaxLossError] Invalid originTaxYear: ${input.originTaxYear}. Must be a valid tax year >= 2000.`);
    }

    if (input.amount <= 0) {
      throw new Error(`[TaxLossError] Loss amount must be strictly greater than 0. Received: ${input.amount}`);
    }

    // Check for existing active lot for same tenant and tax year
    const existing = Array.from(this.lossLots.values()).find(
      (lot) => lot.tenantId === input.tenantId && lot.originTaxYear === input.originTaxYear
    );

    if (existing) {
      // If it exists with no utilisations, update it; otherwise throw to prevent duplicate lots
      if (existing.utilisedAmount > 0) {
        throw new Error(
          `[TaxLossError] A TaxLossLot already exists for tenant ${input.tenantId} and tax year ${input.originTaxYear} with existing utilisations.`
        );
      }
    }

    // Resolve Section 30 statutory carry-forward duration
    const lossRule = this.ruleResolver.resolveLossReliefRule(
      input.originTaxYear,
      input.ruleVersion
    );

    const maxYears = lossRule.maxCarryForwardYears;
    const expiryTaxYear = input.originTaxYear + maxYears;
    const now = new Date().toISOString();
    const id = input.id ?? existing?.id ?? this.generateId('TLL');

    const lot: TaxLossLot = {
      id,
      tenantId: input.tenantId,
      originTaxYear: input.originTaxYear,
      originalAmount: this.roundDec(new Decimal(input.amount)),
      utilisedAmount: 0,
      remainingAmount: this.roundDec(new Decimal(input.amount)),
      expiryTaxYear,
      status: 'ACTIVE',
      ruleId: input.ruleId ?? lossRule.rule.ruleId,
      ruleVersion: input.ruleVersion ?? lossRule.rule.version,
      legalReference: input.legalReference ?? lossRule.legalReference,
      calculationId: input.calculationId,
      notes: input.notes,
      createdAt: input.createdAt ?? existing?.createdAt ?? now,
      updatedAt: now
    };

    this.lossLots.set(lot.id, lot);
    return { ...lot };
  }

  /**
   * Step 2: Apply Loss Relief against current year taxable profit before loss relief.
   * Follows statutory FIFO ordering (earliest tax losses absorbed first).
   * Prevents over-utilisation and enforces statutory expiry.
   */
  public applyLossRelief(params: ApplyLossReliefParams): LossReliefResult {
    const { tenantId, taxYear } = params;
    const effectiveDate = `${taxYear}-12-31`;
    const stepExplanations: string[] = [];
    const auditTrail: TaxLossLotAuditEntry[] = [];
    const newUtilisations: TaxLossUtilisation[] = [];

    const profitDec = new Decimal(params.taxableProfitBeforeLoss || 0);

    stepExplanations.push(
      `1. Taxable Profit Before Loss Relief for Tax Year ${taxYear}: MVR ${profitDec.toFixed(2)}.`
    );

    // Resolve current statutory loss relief rule
    const lossRule = this.ruleResolver.resolveLossReliefRule(
      effectiveDate,
      params.applicableRegulatoryVersion
    );

    stepExplanations.push(
      `2. Statutory Rule Applied: ${lossRule.rule.ruleId} (${lossRule.legalReference}). Max carry forward: ${lossRule.maxCarryForwardYears} years. Ordering: ${params.ordering ?? lossRule.ordering}.`
    );

    // Retrieve lots: either from parameters or from stored lots
    let candidateLots: TaxLossLot[] = [];
    if (params.lossLots && params.lossLots.length > 0) {
      candidateLots = params.lossLots.map((l) => ({ ...l }));
    } else {
      candidateLots = Array.from(this.lossLots.values())
        .filter((l) => l.tenantId === tenantId)
        .map((l) => ({ ...l }));
    }

    // Step A: Evaluate Expiry for lots
    const activeLots: TaxLossLot[] = [];
    const expiredLots: TaxLossLot[] = [];

    for (const lot of candidateLots) {
      const isPastExpiry = taxYear > lot.expiryTaxYear;
      if (isPastExpiry && lot.remainingAmount > 0) {
        lot.status = 'EXPIRED';
        lot.updatedAt = new Date().toISOString();
        this.lossLots.set(lot.id, lot);
        expiredLots.push({ ...lot });
        stepExplanations.push(
          `• Tax Loss Lot ${lot.id} (Tax Year ${lot.originTaxYear}, Unutilised: MVR ${lot.remainingAmount.toFixed(2)}) has EXPIRED as of Tax Year ${taxYear} (Expiry Year: ${lot.expiryTaxYear}).`
        );
      } else if (lot.originTaxYear < taxYear && lot.remainingAmount > 0) {
        activeLots.push(lot);
      }
    }

    // Step B: Sort eligible active lots by FIFO (earliest originTaxYear first) or custom ordering
    const ordering = params.ordering ?? lossRule.ordering ?? 'FIFO';
    if (ordering === 'FIFO') {
      activeLots.sort((a, b) => a.originTaxYear - b.originTaxYear);
    } else {
      // EXPIRY_FIRST
      activeLots.sort((a, b) => a.expiryTaxYear - b.expiryTaxYear || a.originTaxYear - b.originTaxYear);
    }

    // Step C: If current year is in a loss position or zero profit
    if (profitDec.lessThanOrEqualTo(0)) {
      const isTaxLoss = profitDec.lessThan(0);
      const taxLossGenerated = isTaxLoss ? this.roundDec(profitDec.abs()) : 0;

      if (isTaxLoss) {
        stepExplanations.push(
          `3. Current Tax Year ${taxYear} incurred a tax loss of MVR ${taxLossGenerated.toFixed(2)}. No prior loss relief applied.`
        );
      } else {
        stepExplanations.push(
          `3. Taxable profit before loss relief is MVR 0.00. No prior loss relief applied.`
        );
      }

      return {
        tenantId,
        taxYear,
        taxableProfitBeforeLoss: this.roundDec(profitDec),
        totalLossReliefApplied: 0,
        netTaxableIncome: 0,
        isTaxLoss,
        currentYearTaxLossGenerated: taxLossGenerated,
        utilisations: [],
        activeLossLots: activeLots,
        expiredLossLots: expiredLots,
        auditTrail: activeLots.map((l) => ({
          lotId: l.id,
          originTaxYear: l.originTaxYear,
          openingRemaining: l.remainingAmount,
          utilisedInYear: 0,
          closingRemaining: l.remainingAmount,
          status: l.status,
          isExpired: false
        })),
        stepExplanations,
        calculatedAt: new Date().toISOString()
      };
    }

    // Step D: Positive profit - absorb available losses
    let remainingProfitToAbsorbDec = profitDec;
    let totalLossReliefAppliedDec = new Decimal(0);

    for (const lot of activeLots) {
      if (remainingProfitToAbsorbDec.lessThanOrEqualTo(0)) {
        auditTrail.push({
          lotId: lot.id,
          originTaxYear: lot.originTaxYear,
          openingRemaining: lot.remainingAmount,
          utilisedInYear: 0,
          closingRemaining: lot.remainingAmount,
          status: lot.status,
          isExpired: false
        });
        continue;
      }

      const openingRemainingDec = new Decimal(lot.remainingAmount);
      if (openingRemainingDec.lessThanOrEqualTo(0)) {
        continue;
      }

      // Absorb minimum of available profit or lot remaining
      const toUtiliseDec = Decimal.min(remainingProfitToAbsorbDec, openingRemainingDec);
      const utilisedAmountNum = this.roundDec(toUtiliseDec);

      if (utilisedAmountNum > 0) {
        const utilisationId = this.generateId('TLU');
        const utilisation: TaxLossUtilisation = {
          id: utilisationId,
          tenantId,
          lossLotId: lot.id,
          originTaxYear: lot.originTaxYear,
          taxYear,
          amount: utilisedAmountNum,
          calculationId: params.calculationId,
          approvedBy: params.approvedBy,
          createdAt: new Date().toISOString()
        };

        this.utilisations.set(utilisation.id, utilisation);
        newUtilisations.push(utilisation);

        // Update lot state
        const newUtilisedDec = new Decimal(lot.utilisedAmount).plus(toUtiliseDec);
        const newRemainingDec = new Decimal(lot.originalAmount).minus(newUtilisedDec);

        lot.utilisedAmount = this.roundDec(newUtilisedDec);
        lot.remainingAmount = this.roundDec(newRemainingDec);
        lot.status = newRemainingDec.isZero() ? 'FULLY_UTILISED' : 'PARTIALLY_UTILISED';
        lot.updatedAt = new Date().toISOString();

        // Update internal store
        this.lossLots.set(lot.id, lot);

        totalLossReliefAppliedDec = totalLossReliefAppliedDec.plus(toUtiliseDec);
        remainingProfitToAbsorbDec = remainingProfitToAbsorbDec.minus(toUtiliseDec);

        stepExplanations.push(
          `• Utilised MVR ${utilisedAmountNum.toFixed(2)} from Tax Year ${lot.originTaxYear} Lot (Lot ID: ${lot.id}). Remaining unutilised: MVR ${lot.remainingAmount.toFixed(2)} (Status: ${lot.status}).`
        );

        auditTrail.push({
          lotId: lot.id,
          originTaxYear: lot.originTaxYear,
          openingRemaining: this.roundDec(openingRemainingDec),
          utilisedInYear: utilisedAmountNum,
          closingRemaining: lot.remainingAmount,
          status: lot.status,
          isExpired: false
        });
      }
    }

    const netTaxableIncomeDec = profitDec.minus(totalLossReliefAppliedDec);
    const netTaxableIncome = this.roundDec(netTaxableIncomeDec);
    const totalLossReliefApplied = this.roundDec(totalLossReliefAppliedDec);

    stepExplanations.push(
      `3. Total Section 30 Loss Relief Applied: MVR ${totalLossReliefApplied.toFixed(2)}.`
    );
    stepExplanations.push(
      `4. Net Taxable Income after Loss Relief = MVR ${profitDec.toFixed(2)} - MVR ${totalLossReliefApplied.toFixed(2)} = MVR ${netTaxableIncome.toFixed(2)}.`
    );

    return {
      tenantId,
      taxYear,
      taxableProfitBeforeLoss: this.roundDec(profitDec),
      totalLossReliefApplied,
      netTaxableIncome,
      isTaxLoss: false,
      currentYearTaxLossGenerated: 0,
      utilisations: newUtilisations,
      activeLossLots: activeLots,
      expiredLossLots: expiredLots,
      auditTrail,
      stepExplanations,
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * Step 3: Record a tax loss generated in the current tax year as a new TaxLossLot.
   */
  public recordCurrentYearLoss(
    tenantId: string,
    taxYear: number,
    lossAmount: number,
    calculationId?: string,
    notes?: string
  ): TaxLossLot {
    if (lossAmount <= 0) {
      throw new Error(`[TaxLossError] Cannot record current year tax loss with non-positive amount: ${lossAmount}`);
    }

    return this.createLossLot({
      tenantId,
      originTaxYear: taxYear,
      amount: lossAmount,
      calculationId,
      notes: notes ?? `Current year tax loss generated in Tax Year ${taxYear} via calculation ${calculationId ?? 'N/A'}`
    });
  }

  /**
   * Step 4: Revert utilisations for a specific calculationId (e.g. when a tax calculation is revised, rejected, or amended).
   */
  public revertUtilisation(calculationId: string, tenantId: string): { revertedCount: number; restoredLots: TaxLossLot[] } {
    const toRevert = Array.from(this.utilisations.values()).filter(
      (u) => u.tenantId === tenantId && u.calculationId === calculationId
    );

    const affectedLotIds = new Set<string>();

    for (const u of toRevert) {
      const lot = this.lossLots.get(u.lossLotId);
      if (lot) {
        const revertedUtilisedDec = new Decimal(lot.utilisedAmount).minus(new Decimal(u.amount));
        const safeUtilisedDec = Decimal.max(0, revertedUtilisedDec);
        const newRemainingDec = new Decimal(lot.originalAmount).minus(safeUtilisedDec);

        lot.utilisedAmount = this.roundDec(safeUtilisedDec);
        lot.remainingAmount = this.roundDec(newRemainingDec);
        lot.status = safeUtilisedDec.isZero() ? 'ACTIVE' : 'PARTIALLY_UTILISED';
        lot.updatedAt = new Date().toISOString();
        this.lossLots.set(lot.id, lot);
        affectedLotIds.add(lot.id);
      }
      this.utilisations.delete(u.id);
    }

    const restoredLots = Array.from(affectedLotIds).map((id) => this.lossLots.get(id)!);
    return {
      revertedCount: toRevert.length,
      restoredLots
    };
  }

  /**
   * Step 5: Authoritative MIRA 604 Schedule 3 Loss Carry-Forward Ledger.
   */
  public getLossLotSchedule(tenantId: string, asOfTaxYear: number): TaxLossSchedule {
    const lots = Array.from(this.lossLots.values())
      .filter((l) => l.tenantId === tenantId && l.originTaxYear <= asOfTaxYear)
      .sort((a, b) => a.originTaxYear - b.originTaxYear);

    const scheduleItems: TaxLossScheduleItem[] = [];

    let totalBroughtForwardDec = new Decimal(0);
    let totalAdditionsDec = new Decimal(0);
    let totalUtilisedDec = new Decimal(0);
    let totalExpiredDec = new Decimal(0);
    let totalCarriedForwardDec = new Decimal(0);

    for (const lot of lots) {
      const isCurrentYearAddition = lot.originTaxYear === asOfTaxYear;
      const utilisationsInYear = Array.from(this.utilisations.values()).filter(
        (u) => u.lossLotId === lot.id && u.taxYear === asOfTaxYear
      );
      const yearUtilisedDec = utilisationsInYear.reduce(
        (sum, u) => sum.plus(new Decimal(u.amount)),
        new Decimal(0)
      );

      const utilisationsPriorToYear = Array.from(this.utilisations.values()).filter(
        (u) => u.lossLotId === lot.id && u.taxYear < asOfTaxYear
      );
      const priorUtilisedDec = utilisationsPriorToYear.reduce(
        (sum, u) => sum.plus(new Decimal(u.amount)),
        new Decimal(0)
      );

      const broughtForwardDec = isCurrentYearAddition
        ? new Decimal(0)
        : new Decimal(lot.originalAmount).minus(priorUtilisedDec);

      const isExpiredInYear = asOfTaxYear > lot.expiryTaxYear && !isCurrentYearAddition;
      const expiredAmountDec = isExpiredInYear ? Decimal.max(0, broughtForwardDec.minus(yearUtilisedDec)) : new Decimal(0);

      const carriedForwardDec = isExpiredInYear
        ? new Decimal(0)
        : isCurrentYearAddition
        ? new Decimal(lot.originalAmount)
        : Decimal.max(0, broughtForwardDec.minus(yearUtilisedDec));

      totalBroughtForwardDec = totalBroughtForwardDec.plus(broughtForwardDec);
      if (isCurrentYearAddition) {
        totalAdditionsDec = totalAdditionsDec.plus(new Decimal(lot.originalAmount));
      }
      totalUtilisedDec = totalUtilisedDec.plus(yearUtilisedDec);
      totalExpiredDec = totalExpiredDec.plus(expiredAmountDec);
      totalCarriedForwardDec = totalCarriedForwardDec.plus(carriedForwardDec);

      scheduleItems.push({
        originTaxYear: lot.originTaxYear,
        originalAmount: lot.originalAmount,
        broughtForwardUnutilised: this.roundDec(broughtForwardDec),
        currentYearAddition: isCurrentYearAddition ? lot.originalAmount : 0,
        currentYearUtilisation: this.roundDec(yearUtilisedDec),
        currentYearExpired: this.roundDec(expiredAmountDec),
        carriedForwardRemaining: this.roundDec(carriedForwardDec),
        expiryTaxYear: lot.expiryTaxYear,
        status: isExpiredInYear ? 'EXPIRED' : carriedForwardDec.isZero() ? 'FULLY_UTILISED' : 'ACTIVE'
      });
    }

    return {
      tenantId,
      taxYear: asOfTaxYear,
      items: scheduleItems,
      totalBroughtForward: this.roundDec(totalBroughtForwardDec),
      totalAdditions: this.roundDec(totalAdditionsDec),
      totalUtilised: this.roundDec(totalUtilisedDec),
      totalExpired: this.roundDec(totalExpiredDec),
      totalCarriedForward: this.roundDec(totalCarriedForwardDec),
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Retrieve all TaxLossLots for a tenant.
   */
  public getLossLots(
    tenantId: string,
    options?: { asOfTaxYear?: number; includeExpired?: boolean; includeFullyUtilised?: boolean }
  ): TaxLossLot[] {
    let lots = Array.from(this.lossLots.values()).filter((l) => l.tenantId === tenantId);

    if (options?.asOfTaxYear !== undefined) {
      lots = lots.filter((l) => l.originTaxYear <= options.asOfTaxYear!);
    }

    if (!options?.includeExpired) {
      lots = lots.filter((l) => l.status !== 'EXPIRED');
    }

    if (!options?.includeFullyUtilised) {
      lots = lots.filter((l) => l.remainingAmount > 0);
    }

    return lots.sort((a, b) => a.originTaxYear - b.originTaxYear).map((l) => ({ ...l }));
  }

  /**
   * Retrieve all utilisations for a specific lot.
   */
  public getLotUtilisations(lossLotId: string): TaxLossUtilisation[] {
    return Array.from(this.utilisations.values())
      .filter((u) => u.lossLotId === lossLotId)
      .sort((a, b) => a.taxYear - b.taxYear);
  }

  /**
   * Retrieve a specific lot by ID.
   */
  public getLossLotById(id: string): TaxLossLot | null {
    const lot = this.lossLots.get(id);
    return lot ? { ...lot } : null;
  }

  /**
   * Reset engine store for isolated unit testing.
   */
  public resetStore(): void {
    this.lossLots.clear();
    this.utilisations.clear();
  }
}

// Export singleton instance
export const defaultTaxLossLotEngine = new TaxLossLotEngine();
