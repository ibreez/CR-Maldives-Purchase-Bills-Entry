import {
  EntityType,
  MIRA_COMPANY_TAX_CONFIG,
  MIRA_SOLE_PROPRIETOR_BRACKETS,
  calculateCompanyTaxThreshold
} from '../../config/miraTaxRates';

export interface PriorTaxLossRecord {
  year: number;
  lossAmount: number;
  utilisedAmount?: number;
}

export interface EntityTaxCalculationOptions {
  taxYear?: number;
  accountingDays?: number; // Default 365
  groupFactor?: number;    // Default 1
  priorUnabsorbedLosses?: number;
  priorLossRecords?: PriorTaxLossRecord[];
  entityName?: string;
  tin?: string;
}

export interface TaxBracketDetail {
  bracketName: string;
  minIncome: number;
  maxIncome: number;
  rate: number;
  ratePercentage: number;
  taxableInBracket: number;
  taxInBracket: number;
}

export interface EntityTaxResult {
  entityType: EntityType;
  taxYear: number;
  entityName?: string;
  tin?: string;

  // Step 1: Gross Taxable Income Before Loss Relief
  grossTaxableIncome: number;

  // Step 2: Loss Relief Application (MIRA Section 30)
  priorUnabsorbedLosses: number;
  lossReliefApplied: number;
  remainingUnabsorbedLoss: number;
  expiredLosses?: number;

  // Step 3: Net Taxable Income
  netTaxableIncome: number;

  // Step 4: Tax Calculation Breakdown
  taxThreshold?: number;
  taxByBracket: TaxBracketDetail[];
  totalIncomeTaxDue: number;

  // Step 5: Tax Ratios
  effectiveTaxRate: number; // Based on Gross Taxable Income (%)
  effectiveTaxRateOnNet: number; // Based on Net Taxable Income (%)

  generatedAt: string;
  notes: string;
}

/**
 * Calculates MIRA Income Tax Liability according to Section 15 (Corporate) and Section 16 (Individual/Sole Proprietor).
 *
 * @param taxableIncome Taxable income before loss relief
 * @param entityType 'COMPANY' | 'SOLE_PROPRIETOR' | 'PARTNERSHIP'
 * @param options Calculation options including tax year, days, group factor, and loss records
 * @returns EntityTaxResult
 */
export function calculateEntityTaxLiability(
  taxableIncome: number,
  entityType: EntityType,
  options?: EntityTaxCalculationOptions
): EntityTaxResult {
  const currentTaxYear = options?.taxYear || new Date().getFullYear();
  const grossTaxableIncome = Math.max(0, Number(taxableIncome || 0));

  // --- Step 1: Loss Relief Calculation (MIRA Section 30 - 5 Year Carry-Forward Rule) ---
  let totalPriorLosses = 0;
  let validPriorLosses = 0;
  let expiredLosses = 0;

  if (options?.priorLossRecords && options.priorLossRecords.length > 0) {
    for (const record of options.priorLossRecords) {
      const lossAge = currentTaxYear - record.year;
      const unabsorbed = Math.max(0, record.lossAmount - (record.utilisedAmount || 0));
      totalPriorLosses += unabsorbed;

      // Losses can be carried forward for maximum 5 consecutive years
      if (lossAge >= 1 && lossAge <= 5) {
        validPriorLosses += unabsorbed;
      } else if (lossAge > 5) {
        expiredLosses += unabsorbed;
      }
    }
  } else if (options?.priorUnabsorbedLosses !== undefined) {
    totalPriorLosses = Math.max(0, options.priorUnabsorbedLosses);
    validPriorLosses = totalPriorLosses; // Assume valid unless explicitly aged out
  }

  const lossReliefApplied = Math.min(grossTaxableIncome, validPriorLosses);
  const netTaxableIncome = Math.round(Math.max(0, grossTaxableIncome - lossReliefApplied) * 100) / 100;
  const remainingUnabsorbedLoss = Math.round(Math.max(0, totalPriorLosses - lossReliefApplied) * 100) / 100;

  const taxByBracket: TaxBracketDetail[] = [];
  let totalIncomeTaxDue = 0;
  let taxThreshold: number | undefined;
  let notes = '';

  // --- Step 2: Entity Specific Tax Calculation ---

  if (entityType === 'COMPANY') {
    const days = options?.accountingDays || 365;
    const gf = options?.groupFactor || 1;
    taxThreshold = calculateCompanyTaxThreshold(days, gf);

    // Bracket 1: 0 to Threshold (0%)
    const taxableInTier1 = Math.min(netTaxableIncome, taxThreshold);
    taxByBracket.push({
      bracketName: `MVR 0 to MVR ${taxThreshold.toLocaleString()} (Tax Free Threshold)`,
      minIncome: 0,
      maxIncome: taxThreshold,
      rate: 0,
      ratePercentage: 0,
      taxableInBracket: Math.round(taxableInTier1 * 100) / 100,
      taxInBracket: 0
    });

    // Bracket 2: Excess over Threshold (15%)
    const taxableInTier2 = Math.max(0, netTaxableIncome - taxThreshold);
    const taxInTier2 = Math.round(taxableInTier2 * MIRA_COMPANY_TAX_CONFIG.aboveThresholdRate * 100) / 100;

    taxByBracket.push({
      bracketName: `Income exceeding MVR ${taxThreshold.toLocaleString()} (15%)`,
      minIncome: taxThreshold,
      maxIncome: Infinity,
      rate: MIRA_COMPANY_TAX_CONFIG.aboveThresholdRate,
      ratePercentage: MIRA_COMPANY_TAX_CONFIG.aboveThresholdRatePercentage,
      taxableInBracket: Math.round(taxableInTier2 * 100) / 100,
      taxInBracket: taxInTier2
    });

    totalIncomeTaxDue = taxInTier2;
    notes = days < 365
      ? `Corporate tax calculated with pro-rated threshold of MVR ${taxThreshold.toLocaleString()} for ${days} days.`
      : `Corporate tax calculated under MIRA Section 15 (15% rate on profit exceeding threshold of MVR ${taxThreshold.toLocaleString()}).`;

  } else if (entityType === 'SOLE_PROPRIETOR') {
    let incomeRemaining = netTaxableIncome;

    for (const b of MIRA_SOLE_PROPRIETOR_BRACKETS) {
      if (netTaxableIncome <= b.from) {
        taxByBracket.push({
          bracketName: b.description,
          minIncome: b.from,
          maxIncome: b.to,
          rate: b.rate,
          ratePercentage: b.ratePercentage,
          taxableInBracket: 0,
          taxInBracket: 0
        });
        continue;
      }

      const bracketRange = b.to === Infinity ? incomeRemaining : (b.to - b.from);
      const taxableInBracket = Math.min(incomeRemaining, bracketRange);
      const taxInBracket = Math.round(taxableInBracket * b.rate * 100) / 100;

      taxByBracket.push({
        bracketName: b.description,
        minIncome: b.from,
        maxIncome: b.to,
        rate: b.rate,
        ratePercentage: b.ratePercentage,
        taxableInBracket: Math.round(taxableInBracket * 100) / 100,
        taxInBracket
      });

      totalIncomeTaxDue += taxInBracket;
      incomeRemaining = Math.max(0, incomeRemaining - taxableInBracket);
    }

    notes = 'Sole Proprietor tax calculated using MIRA Section 16 progressive tax brackets (0% to 15%).';

  } else if (entityType === 'PARTNERSHIP') {
    // Partnerships pass through profits to partners
    taxByBracket.push({
      bracketName: 'Partnership Entity Pass-Through (0%)',
      minIncome: 0,
      maxIncome: Infinity,
      rate: 0,
      ratePercentage: 0,
      taxableInBracket: netTaxableIncome,
      taxInBracket: 0
    });

    totalIncomeTaxDue = 0;
    notes = 'Partnership income tax is 0% at entity level. Profits pass through to individual partners under MIRA Section 18.';
  }

  totalIncomeTaxDue = Math.round(totalIncomeTaxDue * 100) / 100;

  // Step 3: Effective Tax Rates
  const effectiveTaxRate = grossTaxableIncome > 0
    ? Math.round((totalIncomeTaxDue / grossTaxableIncome) * 10000) / 100
    : 0;

  const effectiveTaxRateOnNet = netTaxableIncome > 0
    ? Math.round((totalIncomeTaxDue / netTaxableIncome) * 10000) / 100
    : 0;

  return {
    entityType,
    taxYear: currentTaxYear,
    entityName: options?.entityName,
    tin: options?.tin,
    grossTaxableIncome: Math.round(grossTaxableIncome * 100) / 100,
    priorUnabsorbedLosses: Math.round(totalPriorLosses * 100) / 100,
    lossReliefApplied: Math.round(lossReliefApplied * 100) / 100,
    remainingUnabsorbedLoss: Math.round(remainingUnabsorbedLoss * 100) / 100,
    expiredLosses: expiredLosses > 0 ? Math.round(expiredLosses * 100) / 100 : 0,
    netTaxableIncome,
    taxThreshold,
    taxByBracket,
    totalIncomeTaxDue,
    effectiveTaxRate,
    effectiveTaxRateOnNet,
    generatedAt: new Date().toISOString(),
    notes
  };
}
