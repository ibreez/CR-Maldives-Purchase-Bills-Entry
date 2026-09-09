/**
 * Phase 29: Capital Allowance Engine
 * Authoritative implementation of Maldives Capital Allowance rules,
 * Fixed Asset Register lifecycle, Asset Pooling, and Tax Reconciliation.
 */

import { Decimal } from 'decimal.js';
import {
  FixedAsset,
  FixedAssetMovement,
  TaxAssetPool,
  CapitalAllowanceCalculation,
  DisposalCalculation,
  CapitalAllowanceTaxReconciliation,
  TaxAssetClassification,
  AccountingDepreciationMethod
} from '../../types/capitalAllowance';
import { defaultRuleResolver, RuleResolver } from '../../regulatory/resolvers/ruleResolver';
import { RegulatoryRule } from '../../regulatory/types';

export class CapitalAllowanceEngine {
  private resolver: RuleResolver;

  constructor(resolver: RuleResolver = defaultRuleResolver) {
    this.resolver = resolver;
  }

  /**
   * Helper to round financial values to 2 decimal places using Decimal.js
   */
  private round(val: number | Decimal): number {
    return new Decimal(val).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
  }

  /**
   * Calculates days in service within a tax year.
   */
  public calculateDaysInService(
    serviceDate: string,
    taxYear: number,
    disposalDate?: string
  ): { daysInService: number; daysInTaxYear: number; isPartialYear: boolean } {
    const isLeap = (taxYear % 4 === 0 && taxYear % 100 !== 0) || (taxYear % 400 === 0);
    const daysInTaxYear = isLeap ? 366 : 365;

    const startOfYear = new Date(`${taxYear}-01-01T00:00:00Z`);
    const endOfYear = new Date(`${taxYear}-12-31T23:59:59Z`);

    const inDate = new Date(`${serviceDate}T00:00:00Z`);
    const serviceYear = inDate.getUTCFullYear();

    if (serviceYear > taxYear) {
      return { daysInService: 0, daysInTaxYear, isPartialYear: false };
    }

    const effectiveStartDate = inDate > startOfYear ? inDate : startOfYear;
    let effectiveEndDate = endOfYear;

    if (disposalDate) {
      const dispDate = new Date(`${disposalDate}T23:59:59Z`);
      if (dispDate < endOfYear) {
        effectiveEndDate = dispDate;
      }
    }

    const diffTime = effectiveEndDate.getTime() - effectiveStartDate.getTime();
    if (diffTime < 0) {
      return { daysInService: 0, daysInTaxYear, isPartialYear: false };
    }

    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const daysInService = Math.min(daysInTaxYear, Math.max(1, days));
    const isPartialYear = daysInService < daysInTaxYear;

    return { daysInService, daysInTaxYear, isPartialYear };
  }

  /**
   * Creates a new FixedAsset record with resolved RegulatoryRule.
   */
  public createFixedAsset(params: {
    assetId: string;
    entityId: string;
    outletId?: string;
    assetName: string;
    taxClassification: TaxAssetClassification | string;
    cost: number;
    acquisitionDate: string;
    inServiceDate?: string;
    accountingUsefulLifeYears?: number;
    accountingMethod?: AccountingDepreciationMethod;
    salvageValue?: number;
    transactionId?: string;
    documentId?: string;
    notes?: string;
  }): { asset: FixedAsset; movement: FixedAssetMovement } {
    const acquisitionDate = params.acquisitionDate;
    const inServiceDate = params.inServiceDate || acquisitionDate;
    const cost = this.round(params.cost);

    // Resolve statutory rule based on in-service / acquisition date
    const resolvedRule = this.resolver.resolveCapitalAllowanceRule(
      params.taxClassification,
      inServiceDate
    );

    const asset: FixedAsset = {
      assetId: params.assetId,
      entityId: params.entityId,
      outletId: params.outletId,
      assetName: params.assetName,
      taxClassification: params.taxClassification,
      cost,
      taxBasis: cost,
      acquisitionDate,
      inServiceDate,
      applicableRuleId: resolvedRule.rule.ruleId,
      allowanceClaimed: 0,
      closingTaxValue: cost,
      isDisposed: false,
      status: 'ACTIVE',
      accountingUsefulLifeYears: params.accountingUsefulLifeYears,
      accountingMethod: params.accountingMethod || 'STRAIGHT_LINE',
      accountingCarryingAmount: cost,
      accumulatedAccountingDepreciation: 0,
      salvageValue: params.salvageValue || 0,
      transactionId: params.transactionId,
      documentId: params.documentId,
      notes: params.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const taxYear = new Date(acquisitionDate).getFullYear();
    const movement: FixedAssetMovement = {
      movementId: `MOV-${asset.assetId}-ACQ`,
      assetId: asset.assetId,
      entityId: asset.entityId,
      taxYear,
      movementDate: acquisitionDate,
      movementType: 'ACQUISITION',
      costChange: cost,
      taxAllowanceAmount: 0,
      accountingDepreciationAmount: 0,
      taxBasisBefore: 0,
      taxBasisAfter: cost,
      balancingAllowance: 0,
      balancingCharge: 0,
      disposalProceeds: 0,
      ruleId: resolvedRule.rule.ruleId,
      ruleVersion: resolvedRule.rule.version,
      notes: `Asset acquisition at cost MVR ${cost}`,
      timestamp: new Date().toISOString()
    };

    return { asset, movement };
  }

  /**
   * Calculates Annual Accounting Book Depreciation (Separate from Tax Capital Allowance).
   * Note: Book depreciation NEVER directly alters taxBasis (WDV).
   */
  public calculateAccountingDepreciation(
    asset: FixedAsset,
    taxYear: number
  ): {
    depreciationAmount: number;
    carryingAmountAfter: number;
    accumulatedAfter: number;
  } {
    const cost = new Decimal(asset.cost);
    const salvage = new Decimal(asset.salvageValue || 0);
    const depreciableAmount = Decimal.max(0, cost.minus(salvage));
    const usefulLife = asset.accountingUsefulLifeYears || 5;

    if (usefulLife <= 0 || asset.accountingMethod === 'NONE') {
      return {
        depreciationAmount: 0,
        carryingAmountAfter: asset.accountingCarryingAmount,
        accumulatedAfter: asset.accumulatedAccountingDepreciation
      };
    }

    let annualDepreciation = new Decimal(0);
    if (asset.accountingMethod === 'STRAIGHT_LINE') {
      annualDepreciation = depreciableAmount.dividedBy(usefulLife);
    } else if (asset.accountingMethod === 'REDUCING_BALANCE') {
      const rate = 1 - Math.pow(salvage.toNumber() / cost.toNumber() || 0.1, 1 / usefulLife);
      annualDepreciation = new Decimal(asset.accountingCarryingAmount).times(rate);
    } else {
      annualDepreciation = depreciableAmount.dividedBy(usefulLife);
    }

    const currentCarrying = new Decimal(asset.accountingCarryingAmount);
    const maxDepreciable = Decimal.max(0, currentCarrying.minus(salvage));
    const effectiveDepreciation = Decimal.min(annualDepreciation, maxDepreciable);

    const depAmount = this.round(effectiveDepreciation);
    const accumulatedAfter = this.round(
      new Decimal(asset.accumulatedAccountingDepreciation).plus(depAmount)
    );
    const carryingAmountAfter = this.round(
      Decimal.max(salvage, new Decimal(cost).minus(accumulatedAfter))
    );

    return {
      depreciationAmount: depAmount,
      carryingAmountAfter,
      accumulatedAfter
    };
  }

  /**
   * Calculates Capital Allowance for a single Fixed Asset in a specific Tax Year.
   */
  public calculateAssetCapitalAllowance(
    asset: FixedAsset,
    taxYear: number,
    options?: {
      overrideDaysInService?: number;
      simulatePastYears?: boolean;
    }
  ): {
    calculation: CapitalAllowanceCalculation;
    updatedAsset: FixedAsset;
    movement?: FixedAssetMovement;
  } {
    const acqDate = asset.acquisitionDate;
    const acqYear = new Date(acqDate).getFullYear();
    const serviceDate = asset.inServiceDate || acqDate;
    const inServiceYear = new Date(serviceDate).getFullYear();

    // Resolve statutory Capital Allowance rule
    const resolved = this.resolver.resolveCapitalAllowanceRule(
      asset.taxClassification,
      serviceDate
    );
    const statutoryRule = resolved.rule;
    const statutoryRate = resolved.rate; // e.g. 0.20
    const statutoryRatePct = resolved.ratePercentage; // e.g. 20

    // Low Value Asset Write-off check under Section 18(d)
    const lowValueRule = this.resolver.resolveLowValueAssetRule(serviceDate);
    const isLooseTools =
      asset.taxClassification === 'LOOSE_TOOLS_UTENSILS' ||
      asset.taxClassification === 'LOOSE_TOOLS';
    const isLowValueEligible =
      (asset.cost <= lowValueRule.threshold || isLooseTools) && acqYear === taxYear;

    // Days in service calculation
    let daysInService = 365;
    let daysInTaxYear = 365;
    let isPartialYear = false;

    if (options?.overrideDaysInService !== undefined) {
      daysInService = options.overrideDaysInService;
      isPartialYear = daysInService < 365;
    } else if (inServiceYear === taxYear) {
      const daysRes = this.calculateDaysInService(serviceDate, taxYear, asset.disposalDate);
      daysInService = daysRes.daysInService;
      daysInTaxYear = daysRes.daysInTaxYear;
      isPartialYear = daysRes.isPartialYear;
    }

    // Asset acquired in future tax year
    if (taxYear < acqYear) {
      const emptyCalc: CapitalAllowanceCalculation = {
        assetId: asset.assetId,
        assetName: asset.assetName,
        taxYear,
        taxClassification: asset.taxClassification,
        applicableRuleId: statutoryRule.ruleId,
        ruleVersion: statutoryRule.version,
        statutoryRate: statutoryRatePct,
        cost: asset.cost,
        openingTaxBasis: 0,
        additions: 0,
        daysInServiceThisYear: 0,
        daysInTaxYear,
        isPartialYear: false,
        isLowValueWriteOff: false,
        fullYearAllowance: 0,
        calculatedAllowance: 0,
        allowanceClaimed: 0,
        closingTaxBasis: 0,
        isDisposed: false,
        balancingAllowance: 0,
        balancingCharge: 0,
        accountingDepreciationAddback: 0,
        sourceTrace: {
          ruleId: statutoryRule.ruleId,
          ruleCode: statutoryRule.ruleCode,
          legalReference: statutoryRule.legalReference,
          version: statutoryRule.version,
          sourceTitle: statutoryRule.description
        },
        notes: 'Asset not yet acquired in this tax year.'
      };
      return { calculation: emptyCalc, updatedAsset: { ...asset } };
    }

    // If simulating from acquisition to current year
    let openingTaxBasis = 0;
    let priorAllowancesClaimed = 0;

    if (options?.simulatePastYears && acqYear < taxYear) {
      let currentBasis = new Decimal(asset.cost);
      for (let y = acqYear; y < taxYear; y++) {
        const fullAllowance = new Decimal(asset.cost).times(statutoryRate);
        let effAllowance = fullAllowance;
        if (y === inServiceYear) {
          const pastDays = this.calculateDaysInService(serviceDate, y);
          effAllowance = fullAllowance.times(pastDays.daysInService / pastDays.daysInTaxYear);
        }
        const claimable = Decimal.min(effAllowance, currentBasis);
        priorAllowancesClaimed = new Decimal(priorAllowancesClaimed).plus(claimable).toNumber();
        currentBasis = Decimal.max(0, currentBasis.minus(claimable));
      }
      openingTaxBasis = this.round(currentBasis);
    } else {
      openingTaxBasis = acqYear === taxYear ? 0 : asset.taxBasis;
      priorAllowancesClaimed = asset.allowanceClaimed;
    }

    const additions = acqYear === taxYear ? asset.cost : 0;
    const baseForAllowance = new Decimal(openingTaxBasis).plus(additions);

    // Calculate Accounting Depreciation for Tax Adjustment Add-back
    const acctDep = this.calculateAccountingDepreciation(asset, taxYear);

    // Handle Low-Value 100% Write-off
    if (isLowValueEligible) {
      const claim = asset.cost;
      const closingTaxBasis = 0;

      const calc: CapitalAllowanceCalculation = {
        assetId: asset.assetId,
        assetName: asset.assetName,
        taxYear,
        taxClassification: asset.taxClassification,
        applicableRuleId: lowValueRule.rule.ruleId,
        ruleVersion: lowValueRule.rule.version,
        statutoryRate: 100,
        cost: asset.cost,
        openingTaxBasis: 0,
        additions: asset.cost,
        daysInServiceThisYear: daysInTaxYear,
        daysInTaxYear,
        isPartialYear: false,
        isLowValueWriteOff: true,
        fullYearAllowance: asset.cost,
        calculatedAllowance: asset.cost,
        allowanceClaimed: claim,
        closingTaxBasis,
        isDisposed: false,
        balancingAllowance: 0,
        balancingCharge: 0,
        accountingDepreciationAddback: acctDep.depreciationAmount,
        sourceTrace: {
          ruleId: lowValueRule.rule.ruleId,
          ruleCode: lowValueRule.rule.ruleCode,
          legalReference: lowValueRule.rule.legalReference,
          version: lowValueRule.rule.version,
          sourceTitle: lowValueRule.rule.description
        },
        notes: '100% Immediate Write-off for Low Value Asset under Section 18(d).'
      };

      const updatedAsset: FixedAsset = {
        ...asset,
        taxBasis: 0,
        allowanceClaimed: this.round(new Decimal(priorAllowancesClaimed).plus(claim)),
        closingTaxValue: 0,
        status: 'FULLY_ALLOWED',
        accountingCarryingAmount: acctDep.carryingAmountAfter,
        accumulatedAccountingDepreciation: acctDep.accumulatedAfter,
        updatedAt: new Date().toISOString()
      };

      const movement: FixedAssetMovement = {
        movementId: `MOV-${asset.assetId}-${taxYear}-LOWVAL`,
        assetId: asset.assetId,
        entityId: asset.entityId,
        taxYear,
        movementDate: `${taxYear}-12-31`,
        movementType: 'LOW_VALUE_WRITEOFF',
        costChange: 0,
        taxAllowanceAmount: claim,
        accountingDepreciationAmount: acctDep.depreciationAmount,
        taxBasisBefore: baseForAllowance.toNumber(),
        taxBasisAfter: 0,
        balancingAllowance: 0,
        balancingCharge: 0,
        disposalProceeds: 0,
        ruleId: lowValueRule.rule.ruleId,
        ruleVersion: lowValueRule.rule.version,
        notes: '100% immediate tax write-off',
        timestamp: new Date().toISOString()
      };

      return { calculation: calc, updatedAsset, movement };
    }

    // Check if asset is disposed in this tax year
    const isDisposedInYear =
      asset.isDisposed &&
      (asset.disposalDate ? new Date(asset.disposalDate).getFullYear() === taxYear : true);

    if (isDisposedInYear) {
      const dispCalc = this.calculateDisposal(asset, taxYear);

      const calc: CapitalAllowanceCalculation = {
        assetId: asset.assetId,
        assetName: asset.assetName,
        taxYear,
        taxClassification: asset.taxClassification,
        applicableRuleId: statutoryRule.ruleId,
        ruleVersion: statutoryRule.version,
        statutoryRate: statutoryRatePct,
        cost: asset.cost,
        openingTaxBasis,
        additions,
        daysInServiceThisYear: daysInService,
        daysInTaxYear,
        isPartialYear: false,
        isLowValueWriteOff: false,
        fullYearAllowance: 0,
        calculatedAllowance: 0,
        allowanceClaimed: 0,
        closingTaxBasis: 0,
        isDisposed: true,
        balancingAllowance: dispCalc.balancingAllowance,
        balancingCharge: dispCalc.balancingCharge,
        accountingDepreciationAddback: acctDep.depreciationAmount,
        sourceTrace: {
          ruleId: statutoryRule.ruleId,
          ruleCode: statutoryRule.ruleCode,
          legalReference: statutoryRule.legalReference,
          version: statutoryRule.version,
          sourceTitle: statutoryRule.description
        },
        notes: dispCalc.notes
      };

      const updatedAsset: FixedAsset = {
        ...asset,
        taxBasis: 0,
        closingTaxValue: 0,
        status: 'DISPOSED',
        accountingCarryingAmount: 0,
        accumulatedAccountingDepreciation: this.round(
          new Decimal(asset.accumulatedAccountingDepreciation).plus(acctDep.depreciationAmount)
        ),
        updatedAt: new Date().toISOString()
      };

      const movement: FixedAssetMovement = {
        movementId: `MOV-${asset.assetId}-${taxYear}-DISP`,
        assetId: asset.assetId,
        entityId: asset.entityId,
        taxYear,
        movementDate: asset.disposalDate || `${taxYear}-12-31`,
        movementType: 'DISPOSAL',
        costChange: -asset.cost,
        taxAllowanceAmount: 0,
        accountingDepreciationAmount: acctDep.depreciationAmount,
        taxBasisBefore: baseForAllowance.toNumber(),
        taxBasisAfter: 0,
        balancingAllowance: dispCalc.balancingAllowance,
        balancingCharge: dispCalc.balancingCharge,
        disposalProceeds: asset.disposalProceeds || 0,
        ruleId: statutoryRule.ruleId,
        ruleVersion: statutoryRule.version,
        notes: dispCalc.notes,
        timestamp: new Date().toISOString()
      };

      return { calculation: calc, updatedAsset, movement };
    }

    // Standard Annual Capital Allowance Computation
    const fullYearAllowance = this.round(new Decimal(asset.cost).times(statutoryRate));
    const proRataFactor = new Decimal(daysInService).dividedBy(daysInTaxYear);
    const calculatedAllowance = this.round(
      new Decimal(fullYearAllowance).times(proRataFactor)
    );

    // Enforce tax basis never becomes negative: Allowance is capped at remaining basis
    const claimableAllowance = this.round(
      Decimal.min(calculatedAllowance, baseForAllowance)
    );
    const closingTaxBasis = this.round(
      Decimal.max(0, baseForAllowance.minus(claimableAllowance))
    );

    const totalAllowanceClaimed = this.round(
      new Decimal(priorAllowancesClaimed).plus(claimableAllowance)
    );
    const isFullyAllowed = closingTaxBasis === 0;

    const calc: CapitalAllowanceCalculation = {
      assetId: asset.assetId,
      assetName: asset.assetName,
      taxYear,
      taxClassification: asset.taxClassification,
      applicableRuleId: statutoryRule.ruleId,
      ruleVersion: statutoryRule.version,
      statutoryRate: statutoryRatePct,
      cost: asset.cost,
      openingTaxBasis,
      additions,
      daysInServiceThisYear: daysInService,
      daysInTaxYear,
      isPartialYear,
      isLowValueWriteOff: false,
      fullYearAllowance,
      calculatedAllowance,
      allowanceClaimed: claimableAllowance,
      closingTaxBasis,
      isDisposed: false,
      balancingAllowance: 0,
      balancingCharge: 0,
      accountingDepreciationAddback: acctDep.depreciationAmount,
      sourceTrace: {
        ruleId: statutoryRule.ruleId,
        ruleCode: statutoryRule.ruleCode,
        legalReference: statutoryRule.legalReference,
        version: statutoryRule.version,
        sourceTitle: statutoryRule.description
      },
      notes: isFullyAllowed
        ? 'Asset fully allowed for tax purposes (Tax Basis = 0).'
        : isPartialYear
        ? `Pro-rata allowance applied (${daysInService}/${daysInTaxYear} days).`
        : undefined
    };

    const updatedAsset: FixedAsset = {
      ...asset,
      taxBasis: closingTaxBasis,
      allowanceClaimed: totalAllowanceClaimed,
      closingTaxValue: closingTaxBasis,
      status: isFullyAllowed ? 'FULLY_ALLOWED' : 'ACTIVE',
      accountingCarryingAmount: acctDep.carryingAmountAfter,
      accumulatedAccountingDepreciation: acctDep.accumulatedAfter,
      updatedAt: new Date().toISOString()
    };

    const movement: FixedAssetMovement = {
      movementId: `MOV-${asset.assetId}-${taxYear}-ANNUAL`,
      assetId: asset.assetId,
      entityId: asset.entityId,
      taxYear,
      movementDate: `${taxYear}-12-31`,
      movementType: isPartialYear ? 'PARTIAL_YEAR_ALLOWANCE' : 'ANNUAL_ALLOWANCE',
      costChange: 0,
      taxAllowanceAmount: claimableAllowance,
      accountingDepreciationAmount: acctDep.depreciationAmount,
      taxBasisBefore: baseForAllowance.toNumber(),
      taxBasisAfter: closingTaxBasis,
      balancingAllowance: 0,
      balancingCharge: 0,
      disposalProceeds: 0,
      ruleId: statutoryRule.ruleId,
      ruleVersion: statutoryRule.version,
      notes: `Capital Allowance claim for tax year ${taxYear}`,
      timestamp: new Date().toISOString()
    };

    return { calculation: calc, updatedAsset, movement };
  }

  /**
   * Calculates Disposal Balancing Adjustments under Section 18.
   */
  public calculateDisposal(
    asset: FixedAsset,
    taxYear: number,
    disposalParams?: {
      disposalDate?: string;
      disposalProceeds?: number;
      disposalReason?: any;
    }
  ): DisposalCalculation {
    const disposalDate = disposalParams?.disposalDate || asset.disposalDate || `${taxYear}-12-31`;
    const disposalProceeds = this.round(
      disposalParams?.disposalProceeds ?? asset.disposalProceeds ?? 0
    );

    const cost = new Decimal(asset.cost);
    const taxBasisAtDisposal = new Decimal(asset.taxBasis);
    const totalPriorAllowances = Decimal.max(0, cost.minus(taxBasisAtDisposal));

    const gainOrLoss = new Decimal(disposalProceeds).minus(taxBasisAtDisposal);

    let balancingAllowance = 0;
    let balancingCharge = 0;
    let capitalGainExcess = 0;
    let notes = '';

    if (gainOrLoss.isNegative()) {
      // Disposed below tax basis -> Balancing Allowance (deductible)
      balancingAllowance = this.round(gainOrLoss.abs());
      notes = `Disposed below tax basis (WDV). Balancing Allowance of MVR ${balancingAllowance} granted.`;
    } else if (gainOrLoss.isPositive()) {
      // Disposed above tax basis -> Balancing Charge (taxable add-back, capped at prior allowances claimed)
      const cappedCharge = Decimal.min(gainOrLoss, totalPriorAllowances);
      balancingCharge = this.round(cappedCharge);

      if (gainOrLoss.greaterThan(totalPriorAllowances)) {
        capitalGainExcess = this.round(gainOrLoss.minus(totalPriorAllowances));
        notes = `Disposed above original cost. Balancing Charge of MVR ${balancingCharge} (recovery) and Capital Gain of MVR ${capitalGainExcess}.`;
      } else {
        notes = `Disposed above tax basis. Balancing Charge of MVR ${balancingCharge} added to taxable income.`;
      }
    } else {
      notes = 'Disposed at exact tax basis (zero balancing adjustment).';
    }

    const acctCarrying = asset.accountingCarryingAmount;
    const acctGainOrLoss = this.round(new Decimal(disposalProceeds).minus(acctCarrying));

    const resolved = this.resolver.resolveCapitalAllowanceRule(
      asset.taxClassification,
      asset.inServiceDate || asset.acquisitionDate
    );

    return {
      assetId: asset.assetId,
      assetName: asset.assetName,
      taxYear,
      disposalDate,
      disposalProceeds,
      originalCost: asset.cost,
      taxBasisAtDisposal: this.round(taxBasisAtDisposal),
      totalPriorAllowancesClaimed: this.round(totalPriorAllowances),
      gainOrLossOnDisposal: this.round(gainOrLoss),
      balancingAllowance,
      balancingCharge,
      capitalGainExcess,
      closingTaxValue: 0,
      accountingCarryingAmountAtDisposal: acctCarrying,
      accountingGainOrLoss: acctGainOrLoss,
      applicableRuleId: resolved.rule.ruleId,
      legalReference: resolved.rule.legalReference,
      notes
    };
  }

  /**
   * Groups a list of Fixed Assets into Tax Asset Pools by Classification.
   */
  public generateTaxAssetPools(
    assets: FixedAsset[],
    taxYear: number
  ): TaxAssetPool[] {
    const poolsMap = new Map<string, TaxAssetPool>();

    for (const asset of assets) {
      const key = asset.taxClassification;
      const calcResult = this.calculateAssetCapitalAllowance(asset, taxYear, {
        simulatePastYears: true
      });
      const calc = calcResult.calculation;

      if (!poolsMap.has(key)) {
        poolsMap.set(key, {
          poolId: `POOL-${key}-${taxYear}`,
          entityId: asset.entityId,
          taxClassification: key,
          taxYear,
          applicableRuleId: calc.applicableRuleId,
          applicableRate: calc.statutoryRate,
          openingTaxBasis: 0,
          additions: 0,
          disposals: 0,
          disposalProceeds: 0,
          allowanceClaimed: 0,
          balancingAllowance: 0,
          balancingCharge: 0,
          closingTaxBasis: 0,
          assetCount: 0,
          assets: []
        });
      }

      const pool = poolsMap.get(key)!;
      pool.openingTaxBasis = this.round(
        new Decimal(pool.openingTaxBasis).plus(calc.openingTaxBasis)
      );
      pool.additions = this.round(new Decimal(pool.additions).plus(calc.additions));
      pool.disposals = this.round(
        new Decimal(pool.disposals).plus(calc.isDisposed ? calc.openingTaxBasis + calc.additions : 0)
      );
      pool.disposalProceeds = this.round(
        new Decimal(pool.disposalProceeds).plus(asset.disposalProceeds || 0)
      );
      pool.allowanceClaimed = this.round(
        new Decimal(pool.allowanceClaimed).plus(calc.allowanceClaimed)
      );
      pool.balancingAllowance = this.round(
        new Decimal(pool.balancingAllowance).plus(calc.balancingAllowance)
      );
      pool.balancingCharge = this.round(
        new Decimal(pool.balancingCharge).plus(calc.balancingCharge)
      );
      pool.closingTaxBasis = this.round(
        new Decimal(pool.closingTaxBasis).plus(calc.closingTaxBasis)
      );
      pool.assetCount += 1;
      pool.assets.push(calcResult.updatedAsset);
    }

    return Array.from(poolsMap.values());
  }

  /**
   * Generates a complete Capital Allowance Tax Reconciliation for MIRA 604 filing.
   */
  public generateTaxReconciliation(
    assets: FixedAsset[],
    taxYear: number
  ): CapitalAllowanceTaxReconciliation {
    const assetCalculations: CapitalAllowanceCalculation[] = [];
    const pools = this.generateTaxAssetPools(assets, taxYear);

    let totalCostOfAssets = new Decimal(0);
    let totalOpeningTaxBasis = new Decimal(0);
    let totalAdditionsInYear = new Decimal(0);
    let totalDisposalsInYear = new Decimal(0);
    let totalDisposalProceeds = new Decimal(0);
    let totalCapitalAllowanceClaimed = new Decimal(0);
    let totalBalancingAllowance = new Decimal(0);
    let totalBalancingCharge = new Decimal(0);
    let totalClosingTaxBasis = new Decimal(0);
    let totalAccountingDepreciationAddback = new Decimal(0);

    for (const asset of assets) {
      const calcResult = this.calculateAssetCapitalAllowance(asset, taxYear, {
        simulatePastYears: true
      });
      const calc = calcResult.calculation;
      assetCalculations.push(calc);

      totalCostOfAssets = totalCostOfAssets.plus(calc.cost);
      totalOpeningTaxBasis = totalOpeningTaxBasis.plus(calc.openingTaxBasis);
      totalAdditionsInYear = totalAdditionsInYear.plus(calc.additions);
      totalDisposalsInYear = totalDisposalsInYear.plus(
        calc.isDisposed ? calc.openingTaxBasis + calc.additions : 0
      );
      totalDisposalProceeds = totalDisposalProceeds.plus(asset.disposalProceeds || 0);
      totalCapitalAllowanceClaimed = totalCapitalAllowanceClaimed.plus(calc.allowanceClaimed);
      totalBalancingAllowance = totalBalancingAllowance.plus(calc.balancingAllowance);
      totalBalancingCharge = totalBalancingCharge.plus(calc.balancingCharge);
      totalClosingTaxBasis = totalClosingTaxBasis.plus(calc.closingTaxBasis);
      totalAccountingDepreciationAddback = totalAccountingDepreciationAddback.plus(
        calc.accountingDepreciationAddback
      );
    }

    // Total Net Tax Allowance Deduction = Capital Allowance Claimed + Balancing Allowance - Balancing Charge
    const totalNetTaxAllowanceDeduction = totalCapitalAllowanceClaimed
      .plus(totalBalancingAllowance)
      .minus(totalBalancingCharge);

    return {
      taxYear,
      totalCostOfAssets: this.round(totalCostOfAssets),
      totalOpeningTaxBasis: this.round(totalOpeningTaxBasis),
      totalAdditionsInYear: this.round(totalAdditionsInYear),
      totalDisposalsInYear: this.round(totalDisposalsInYear),
      totalDisposalProceeds: this.round(totalDisposalProceeds),
      totalCapitalAllowanceClaimed: this.round(totalCapitalAllowanceClaimed),
      totalBalancingAllowance: this.round(totalBalancingAllowance),
      totalBalancingCharge: this.round(totalBalancingCharge),
      totalNetTaxAllowanceDeduction: this.round(totalNetTaxAllowanceDeduction),
      totalClosingTaxBasis: this.round(totalClosingTaxBasis),
      totalAccountingDepreciationAddback: this.round(totalAccountingDepreciationAddback),
      assetCalculations,
      pools,
      generatedAt: new Date().toISOString()
    };
  }
}

export const defaultCapitalAllowanceEngine = new CapitalAllowanceEngine();
