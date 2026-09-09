/**
 * Phase 29: Capital Allowance Engine Types
 * Authoritative types for Fixed Asset Register, Tax Asset Pools, Movements,
 * and Capital Allowance Calculations under Maldives Income Tax Act & Regulations.
 */

export type TaxAssetClassification =
  | 'BUILDINGS'
  | 'AIRCRAFT'
  | 'WOODEN_MARINE_VESSELS'
  | 'OTHER_MARINE_VESSELS'
  | 'FURNITURE_FITTINGS'
  | 'MOTOR_VEHICLES'
  | 'EARTH_MOVING_VEHICLES'
  | 'PLANT_EQUIPMENT'
  | 'OFFICE_EQUIPMENT'
  | 'COMPUTER_SOFTWARE'
  | 'LOOSE_TOOLS_UTENSILS'
  | 'INTANGIBLES'
  | 'OTHER';

export type AccountingDepreciationMethod =
  | 'STRAIGHT_LINE'
  | 'REDUCING_BALANCE'
  | 'UNITS_OF_PRODUCTION'
  | 'NONE';

export type FixedAssetStatus =
  | 'ACTIVE'
  | 'DISPOSED'
  | 'FULLY_ALLOWED'
  | 'WRITTEN_OFF';

export type DisposalReason =
  | 'SOLD'
  | 'SCRAPPED'
  | 'LOST'
  | 'TRADE_IN'
  | 'OTHER';

export type FixedAssetMovementType =
  | 'ACQUISITION'
  | 'ANNUAL_ALLOWANCE'
  | 'PARTIAL_YEAR_ALLOWANCE'
  | 'LOW_VALUE_WRITEOFF'
  | 'DISPOSAL'
  | 'BALANCING_ALLOWANCE'
  | 'BALANCING_CHARGE'
  | 'ACCOUNTING_DEPRECIATION'
  | 'TAX_BASIS_ADJUSTMENT';

/**
 * Fixed Asset Entity
 * Maintains strict separation between Accounting Carrying Amount and Tax Basis (WDV).
 */
export interface FixedAsset {
  assetId: string;
  entityId: string;
  outletId?: string;
  assetName: string;
  taxClassification: TaxAssetClassification | string;
  cost: number;
  taxBasis: number; // Current tax written-down value (WDV), NEVER negative (>= 0)
  acquisitionDate: string; // YYYY-MM-DD
  inServiceDate: string; // YYYY-MM-DD (date asset brought into commercial use)
  applicableRuleId: string; // Resolved RegulatoryRule ID
  allowanceClaimed: number; // Cumulative tax allowances claimed up to current state
  closingTaxValue: number; // Closing tax value for the latest processed tax period
  isDisposed: boolean;
  disposalDate?: string; // YYYY-MM-DD
  disposalProceeds?: number; // Realized consideration or scrap value
  disposalReason?: DisposalReason;
  status: FixedAssetStatus;

  // Accounting Depreciation Separation (Book value only - ZERO impact on taxBasis)
  accountingUsefulLifeYears?: number;
  accountingMethod?: AccountingDepreciationMethod;
  accountingCarryingAmount: number; // Book value = cost - accumulatedAccountingDepreciation
  accumulatedAccountingDepreciation: number; // Cumulative book depreciation
  salvageValue?: number;

  // Traceability & Metadata
  transactionId?: string;
  documentId?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Immutable Audit Movement for Fixed Asset Ledger
 */
export interface FixedAssetMovement {
  movementId: string;
  assetId: string;
  entityId: string;
  taxYear: number;
  movementDate: string; // YYYY-MM-DD
  movementType: FixedAssetMovementType;
  costChange: number;
  taxAllowanceAmount: number;
  accountingDepreciationAmount: number; // Affects book carrying amount ONLY
  taxBasisBefore: number;
  taxBasisAfter: number; // Enforcing taxBasisAfter >= 0
  balancingAllowance: number;
  balancingCharge: number;
  disposalProceeds: number;
  ruleId: string;
  ruleVersion: string;
  notes?: string;
  timestamp: string;
}

/**
 * Grouped Tax Asset Pool
 */
export interface TaxAssetPool {
  poolId: string;
  entityId: string;
  taxClassification: TaxAssetClassification | string;
  taxYear: number;
  applicableRuleId: string;
  applicableRate: number;
  openingTaxBasis: number;
  additions: number;
  disposals: number;
  disposalProceeds: number;
  allowanceClaimed: number;
  balancingAllowance: number;
  balancingCharge: number;
  closingTaxBasis: number;
  assetCount: number;
  assets: FixedAsset[];
}

/**
 * Detailed Capital Allowance Calculation Result for an Asset in a Tax Year
 */
export interface CapitalAllowanceCalculation {
  assetId: string;
  assetName: string;
  taxYear: number;
  taxClassification: string;
  applicableRuleId: string;
  ruleVersion: string;
  statutoryRate: number; // Percentage e.g. 20 for 20%
  cost: number;
  openingTaxBasis: number;
  additions: number;
  daysInServiceThisYear: number;
  daysInTaxYear: number;
  isPartialYear: boolean;
  isLowValueWriteOff: boolean;
  fullYearAllowance: number;
  calculatedAllowance: number;
  allowanceClaimed: number;
  closingTaxBasis: number; // Always >= 0
  isDisposed: boolean;
  balancingAllowance: number;
  balancingCharge: number;
  accountingDepreciationAddback: number; // Accounting book depreciation to add back in Tax Adjustments
  sourceTrace: {
    ruleId: string;
    ruleCode: string;
    legalReference: string;
    version: string;
    sourceTitle: string;
  };
  notes?: string;
}

/**
 * Detailed Disposal Calculation Result for an Asset
 */
export interface DisposalCalculation {
  assetId: string;
  assetName: string;
  taxYear: number;
  disposalDate: string;
  disposalProceeds: number;
  originalCost: number;
  taxBasisAtDisposal: number;
  totalPriorAllowancesClaimed: number;
  gainOrLossOnDisposal: number; // disposalProceeds - taxBasisAtDisposal
  balancingAllowance: number; // Deductible tax allowance if proceeds < taxBasisAtDisposal
  balancingCharge: number; // Taxable add-back if proceeds > taxBasisAtDisposal (capped at totalPriorAllowancesClaimed)
  capitalGainExcess: number; // Any proceeds exceeding original cost (treated as capital gain/receipt)
  closingTaxValue: number; // Always 0 post-disposal
  accountingCarryingAmountAtDisposal: number;
  accountingGainOrLoss: number; // disposalProceeds - accountingCarryingAmount
  applicableRuleId: string;
  legalReference: string;
  notes?: string;
}

/**
 * Tax Adjustment Reconciliation for Capital Allowances in MIRA 604
 */
export interface CapitalAllowanceTaxReconciliation {
  taxYear: number;
  totalCostOfAssets: number;
  totalOpeningTaxBasis: number;
  totalAdditionsInYear: number;
  totalDisposalsInYear: number;
  totalDisposalProceeds: number;
  totalCapitalAllowanceClaimed: number;
  totalBalancingAllowance: number;
  totalBalancingCharge: number;
  totalNetTaxAllowanceDeduction: number; // Capital Allowance + Balancing Allowance - Balancing Charge
  totalClosingTaxBasis: number;
  totalAccountingDepreciationAddback: number;
  assetCalculations: CapitalAllowanceCalculation[];
  pools: TaxAssetPool[];
  generatedAt: string;
}
