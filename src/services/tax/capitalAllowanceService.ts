import { FixedAssetRecord } from '../../types/taxEngine';
import {
  getMiraAssetClassRate,
  LOW_VALUE_ASSET_THRESHOLD
} from '../assets/fixedAssetService';

export interface CapitalAllowanceResult {
  assetId: string;
  assetName: string;
  assetClass: string;
  taxYear: number;
  rate: number;
  cost: number;
  openingWDV: number;
  additions: number;
  disposals: number;
  disposalProceeds: number;
  isLowValueWriteOff: boolean;
  isProRataApplied: boolean;
  daysInService: number;
  fullYearAllowance: number;
  claimableAllowance: number;
  balancingAllowance: number;
  balancingCharge: number;
  closingWDV: number;
  isDisposed: boolean;
  disposalDate?: string;
  notes?: string;
}

export interface MiraSchedule2SummaryReport {
  taxYear: number;
  totalCostOfAssets: number;
  totalOpeningWDV: number;
  totalAdditionsInYear: number;
  totalDisposalsInYear: number;
  totalCapitalAllowanceClaimed: number;
  totalBalancingAllowance: number;
  totalBalancingCharge: number;
  totalNetTaxAllowanceDeduction: number;
  totalClosingWDV: number;
  assetResults: CapitalAllowanceResult[];
  generatedAt: string;
}

/**
 * Calculates days in service for an acquisition date in a given tax year
 */
function calculateDaysInService(acquisitionDate: string, taxYear: number): number {
  try {
    const acq = new Date(acquisitionDate);
    const acqYear = acq.getFullYear();

    if (acqYear < taxYear) return 365;
    if (acqYear > taxYear) return 0;

    const startOfYear = new Date(`${taxYear}-01-01`);
    const endOfYear = new Date(`${taxYear}-12-31`);

    const startDate = acq < startOfYear ? startOfYear : acq;
    const diffTime = endOfYear.getTime() - startDate.getTime();
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    return Math.min(365, Math.max(1, days));
  } catch {
    return 365;
  }
}

/**
 * Calculates MIRA Schedule 2 Capital Allowance for a single FixedAssetRecord (Section 83 rules).
 *
 * @param asset FixedAssetRecord
 * @param taxYear Current tax year to calculate allowance for
 * @returns CapitalAllowanceResult
 */
export function calculateCapitalAllowance(
  asset: FixedAssetRecord,
  taxYear: number
): CapitalAllowanceResult {
  const cost = Number((asset as any).cost ?? asset.costPrice ?? 0);
  const rate = asset.miraCapitalAllowanceRate || getMiraAssetClassRate(asset.assetClass);

  const acqDate = asset.acquisitionDate || `${asset.taxYear || taxYear}-01-01`;
  const acqYear = (asset as any).taxYearAcquired || asset.taxYear || new Date(acqDate).getFullYear();

  // If asset was acquired after the tax year being evaluated, return zero values
  if (taxYear < acqYear) {
    return {
      assetId: asset.assetId,
      assetName: asset.assetName,
      assetClass: asset.assetClass,
      taxYear,
      rate,
      cost,
      openingWDV: 0,
      additions: 0,
      disposals: 0,
      disposalProceeds: 0,
      isLowValueWriteOff: false,
      isProRataApplied: false,
      daysInService: 0,
      fullYearAllowance: 0,
      claimableAllowance: 0,
      balancingAllowance: 0,
      balancingCharge: 0,
      closingWDV: 0,
      isDisposed: false,
      notes: 'Asset not yet acquired in this tax year.'
    };
  }

  // Low-Value Asset Immediate Write-off Check (Cost <= 10,000 MVR or Loose Tools)
  const isLooseTools = String(asset.assetClass).toUpperCase().includes('TOOL') ||
                       String(asset.assetClass).toUpperCase().includes('CROCKERY') ||
                       String(asset.assetClass).toUpperCase().includes('UTENSIL');

  const isLowValueEligible = (cost <= LOW_VALUE_ASSET_THRESHOLD || isLooseTools) && (acqYear === taxYear);

  if (isLowValueEligible) {
    return {
      assetId: asset.assetId,
      assetName: asset.assetName,
      assetClass: asset.assetClass,
      taxYear,
      rate: 100,
      cost,
      openingWDV: 0,
      additions: cost,
      disposals: 0,
      disposalProceeds: 0,
      isLowValueWriteOff: true,
      isProRataApplied: false,
      daysInService: 365,
      fullYearAllowance: cost,
      claimableAllowance: cost,
      balancingAllowance: 0,
      balancingCharge: 0,
      closingWDV: 0,
      isDisposed: false,
      notes: '100% Immediate Capital Allowance write-off under MIRA Section 83 low-value asset rules.'
    };
  }

  // Calculate prior years opening WDV by simulating past years
  let simulatedWDV = 0;

  for (let year = acqYear; year < taxYear; year++) {
    if (year === acqYear) {
      // First year acquisition
      const daysInYear = asset.daysInServiceThisYear && year === taxYear ? asset.daysInServiceThisYear : calculateDaysInService(acqDate, year);
      const proRata = daysInYear / 365;
      const firstYearAllowance = Math.round(cost * (rate / 100) * proRata * 100) / 100;
      simulatedWDV = Math.max(0, cost - firstYearAllowance);
    } else {
      // Intermediate prior years
      const allowance = Math.round(cost * (rate / 100) * 100) / 100;
      simulatedWDV = Math.max(0, simulatedWDV - allowance);
    }
  }

  const openingWDV = acqYear === taxYear ? 0 : Math.round(simulatedWDV * 100) / 100;
  const additions = acqYear === taxYear ? cost : 0;

  // Check Disposal status
  const disposalDate = asset.disposalDate;
  const disposalYear = disposalDate ? new Date(disposalDate).getFullYear() : undefined;

  const isDisposedInThisYear = asset.isDisposed === true && (
    disposalYear === taxYear || (!disposalYear && taxYear >= acqYear)
  );

  const disposalProceeds = Number(
    (asset as any).disposalProceeds ?? asset.disposalValue ?? asset.disposalsInYear ?? 0
  );

  let balancingAllowance = 0;
  let balancingCharge = 0;
  let claimableAllowance = 0;
  let closingWDV = 0;
  let fullYearAllowance = Math.round(cost * (rate / 100) * 100) / 100;

  // Days in service calculation for current year
  let daysInService = 365;
  if (asset.daysInServiceThisYear !== undefined && asset.daysInServiceThisYear > 0) {
    daysInService = asset.daysInServiceThisYear;
  } else if (acqYear === taxYear) {
    daysInService = calculateDaysInService(acqDate, taxYear);
  }

  const isProRataApplied = daysInService < 365 && acqYear === taxYear;

  if (isDisposedInThisYear) {
    // Section 83: Disposal year replaces regular capital allowance with balancing allowance / charge
    const wdvBeforeDisposal = openingWDV + additions;
    const totalPriorAllowancesClaimed = Math.round((cost - wdvBeforeDisposal) * 100) / 100;

    if (disposalProceeds < wdvBeforeDisposal) {
      // Disposed below WDV -> Balancing Allowance (additional tax deduction)
      balancingAllowance = Math.round((wdvBeforeDisposal - disposalProceeds) * 100) / 100;
      claimableAllowance = balancingAllowance;
      closingWDV = 0;
    } else if (disposalProceeds > wdvBeforeDisposal) {
      // Disposed above WDV -> Balancing Charge (taxable income addition, capped at prior allowances claimed)
      const excessGain = disposalProceeds - wdvBeforeDisposal;
      balancingCharge = Math.round(Math.min(excessGain, totalPriorAllowancesClaimed) * 100) / 100;
      claimableAllowance = 0;
      closingWDV = 0;
    } else {
      balancingAllowance = 0;
      balancingCharge = 0;
      claimableAllowance = 0;
      closingWDV = 0;
    }

    return {
      assetId: asset.assetId,
      assetName: asset.assetName,
      assetClass: asset.assetClass,
      taxYear,
      rate,
      cost,
      openingWDV,
      additions,
      disposals: wdvBeforeDisposal,
      disposalProceeds,
      isLowValueWriteOff: false,
      isProRataApplied: false,
      daysInService,
      fullYearAllowance: 0,
      claimableAllowance,
      balancingAllowance,
      balancingCharge,
      closingWDV: 0,
      isDisposed: true,
      disposalDate,
      notes: balancingAllowance > 0
        ? `Disposed below WDV. Balancing Allowance of MVR ${balancingAllowance} granted.`
        : balancingCharge > 0
        ? `Disposed above WDV. Balancing Charge of MVR ${balancingCharge} added to taxable income.`
        : 'Disposed at exact WDV.'
    };
  }

  // Regular Non-Disposed Capital Allowance Calculation
  const proRataFactor = daysInService / 365;
  const calculatedAllowance = Math.round(fullYearAllowance * proRataFactor * 100) / 100;

  const maxClaimable = openingWDV + additions;
  claimableAllowance = Math.min(calculatedAllowance, maxClaimable);
  closingWDV = Math.round(Math.max(0, maxClaimable - claimableAllowance) * 100) / 100;

  return {
    assetId: asset.assetId,
    assetName: asset.assetName,
    assetClass: asset.assetClass,
    taxYear,
    rate,
    cost,
    openingWDV,
    additions,
    disposals: 0,
    disposalProceeds: 0,
    isLowValueWriteOff: false,
    isProRataApplied,
    daysInService,
    fullYearAllowance,
    claimableAllowance,
    balancingAllowance: 0,
    balancingCharge: 0,
    closingWDV,
    isDisposed: false,
    disposalDate: undefined
  };
}

/**
 * Generates an aggregated MIRA Schedule 2 Capital Allowance Report for a list of fixed assets.
 */
export function generateSchedule2CapitalAllowanceSummary(
  assets: FixedAssetRecord[],
  taxYear: number
): MiraSchedule2SummaryReport {
  const list = assets || [];
  const assetResults: CapitalAllowanceResult[] = [];

  let totalCostOfAssets = 0;
  let totalOpeningWDV = 0;
  let totalAdditionsInYear = 0;
  let totalDisposalsInYear = 0;
  let totalCapitalAllowanceClaimed = 0;
  let totalBalancingAllowance = 0;
  let totalBalancingCharge = 0;
  let totalClosingWDV = 0;

  for (const asset of list) {
    const res = calculateCapitalAllowance(asset, taxYear);
    assetResults.push(res);

    totalCostOfAssets += res.cost;
    totalOpeningWDV += res.openingWDV;
    totalAdditionsInYear += res.additions;
    totalDisposalsInYear += res.disposals;
    totalCapitalAllowanceClaimed += res.claimableAllowance;
    totalBalancingAllowance += res.balancingAllowance;
    totalBalancingCharge += res.balancingCharge;
    totalClosingWDV += res.closingWDV;
  }

  // Net Tax Allowance = Capital Allowance Claimed + Balancing Allowance - Balancing Charge
  const totalNetTaxAllowanceDeduction =
    totalCapitalAllowanceClaimed + totalBalancingAllowance - totalBalancingCharge;

  return {
    taxYear,
    totalCostOfAssets: Math.round(totalCostOfAssets * 100) / 100,
    totalOpeningWDV: Math.round(totalOpeningWDV * 100) / 100,
    totalAdditionsInYear: Math.round(totalAdditionsInYear * 100) / 100,
    totalDisposalsInYear: Math.round(totalDisposalsInYear * 100) / 100,
    totalCapitalAllowanceClaimed: Math.round(totalCapitalAllowanceClaimed * 100) / 100,
    totalBalancingAllowance: Math.round(totalBalancingAllowance * 100) / 100,
    totalBalancingCharge: Math.round(totalBalancingCharge * 100) / 100,
    totalNetTaxAllowanceDeduction: Math.round(totalNetTaxAllowanceDeduction * 100) / 100,
    totalClosingWDV: Math.round(totalClosingWDV * 100) / 100,
    assetResults,
    generatedAt: new Date().toISOString()
  };
}
