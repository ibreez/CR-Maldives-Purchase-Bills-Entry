export type MiraAdjustmentCode =
  | 'ADJ-DEPR'
  | 'ADJ-FINES'
  | 'ADJ-DONATION'
  | 'ADJ-PRIVATE'
  | 'ADJ-CAPITAL'
  | 'ADJ-OWNER'
  | 'ADJ-RELATED'
  | 'ADJ-OTHER';

export type AdjustmentDirection = 'ADD_BACK' | 'DEDUCTION';

export interface MiraAdjustmentCodeConfig {
  code: MiraAdjustmentCode;
  name: string;
  description: string;
  direction: AdjustmentDirection;
  isStandardAddback: boolean;
}

export const MIRA_ADJUSTMENT_CODES: Record<MiraAdjustmentCode, MiraAdjustmentCodeConfig> = {
  'ADJ-DEPR': {
    code: 'ADJ-DEPR',
    name: 'Accounting Depreciation Add-back',
    description: 'Accounting depreciation and amortization charges added back before capital allowance deduction.',
    direction: 'ADD_BACK',
    isStandardAddback: true
  },
  'ADJ-FINES': {
    code: 'ADJ-FINES',
    name: 'Statutory Fines & Legal Penalties',
    description: 'Statutory fines, late tax filing penalties, interest charges, and legal sanctions.',
    direction: 'ADD_BACK',
    isStandardAddback: true
  },
  'ADJ-DONATION': {
    code: 'ADJ-DONATION',
    name: 'Non-qualifying Donations & Sponsorships',
    description: 'Donations or political/charitable contributions not eligible under MIRA tax deduction guidelines.',
    direction: 'ADD_BACK',
    isStandardAddback: true
  },
  'ADJ-PRIVATE': {
    code: 'ADJ-PRIVATE',
    name: 'Private & Personal Expenses',
    description: 'Personal expenses of owners, directors, or employees not incurred wholly and exclusively for business.',
    direction: 'ADD_BACK',
    isStandardAddback: true
  },
  'ADJ-CAPITAL': {
    code: 'ADJ-CAPITAL',
    name: 'Capital Expenditure Booked as Expense',
    description: 'Capital assets or improvements incorrectly charged to profit & loss operational expenses.',
    direction: 'ADD_BACK',
    isStandardAddback: true
  },
  'ADJ-OWNER': {
    code: 'ADJ-OWNER',
    name: 'Excess Owner Drawings / Non-deductible Perks',
    description: 'Owner/partner drawings, excess non-approved remuneration, or personal tax payments.',
    direction: 'ADD_BACK',
    isStandardAddback: true
  },
  'ADJ-RELATED': {
    code: 'ADJ-RELATED',
    name: 'Related Party Excess Adjustments',
    description: 'Non-arm\'s length transactions with related parties exceeding market rate limits.',
    direction: 'ADD_BACK',
    isStandardAddback: true
  },
  'ADJ-OTHER': {
    code: 'ADJ-OTHER',
    name: 'Other Statutory Non-deductible or Exempt Deductions',
    description: 'Other statutory non-deductible expenses (addback) or statutory tax-exempt income (deduction).',
    direction: 'ADD_BACK',
    isStandardAddback: true
  }
};

export const MIRA_ADJUSTMENT_CODES_LIST: MiraAdjustmentCodeConfig[] = Object.values(MIRA_ADJUSTMENT_CODES);
