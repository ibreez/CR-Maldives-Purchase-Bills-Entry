export type EntityType = 'COMPANY' | 'SOLE_PROPRIETOR' | 'PARTNERSHIP';

export interface TaxBracket {
  from: number;
  to: number; // Use Infinity for upper bound
  rate: number; // e.g., 0.05 for 5%
  ratePercentage: number; // e.g., 5 for 5%
  description: string;
}

/**
 * Standard MIRA Section 15 Corporate Tax Rate Constants
 */
export const MIRA_COMPANY_TAX_CONFIG = {
  standardThreshold: 500000, // MVR 500,000 tax-free threshold
  aboveThresholdRate: 0.15,  // 15% tax rate on income above threshold
  aboveThresholdRatePercentage: 15
};

/**
 * MIRA Section 16 Progressive Tax Brackets for Sole Proprietors / Individuals
 * 1. MVR 0 - 720,000 (0%)
 * 2. MVR 720,001 - 1,200,000 (5%)
 * 3. MVR 1,200,001 - 1,800,000 (8%)
 * 4. MVR 1,800,001 - 2,400,000 (12%)
 * 5. Over MVR 2,400,000 (15%)
 */
export const MIRA_SOLE_PROPRIETOR_BRACKETS: TaxBracket[] = [
  {
    from: 0,
    to: 720000,
    rate: 0.00,
    ratePercentage: 0,
    description: 'Up to MVR 720,000 (Tax Free)'
  },
  {
    from: 720000,
    to: 1200000,
    rate: 0.05,
    ratePercentage: 5,
    description: 'MVR 720,001 to MVR 1,200,000 (5%)'
  },
  {
    from: 1200000,
    to: 1800000,
    rate: 0.08,
    ratePercentage: 8,
    description: 'MVR 1,200,001 to MVR 1,800,000 (8%)'
  },
  {
    from: 1800000,
    to: 2400000,
    rate: 0.12,
    ratePercentage: 12,
    description: 'MVR 1,800,001 to MVR 2,400,000 (12%)'
  },
  {
    from: 2400000,
    to: Infinity,
    rate: 0.15,
    ratePercentage: 15,
    description: 'Over MVR 2,400,000 (15%)'
  }
];

/**
 * Calculates pro-rated tax-free threshold for Companies (Section 7.1)
 * Threshold = 500,000 * (Accounting Days / 365) / Group Factor
 */
export function calculateCompanyTaxThreshold(
  accountingDays: number = 365,
  groupFactor: number = 1
): number {
  const days = Math.max(1, Math.min(366, accountingDays));
  const gf = Math.max(1, groupFactor);
  
  const threshold = (MIRA_COMPANY_TAX_CONFIG.standardThreshold * (days / 365)) / gf;
  return Math.round(threshold * 100) / 100;
}
