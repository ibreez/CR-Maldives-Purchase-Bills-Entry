import { IncomeTaxTreatment } from '../types/taxEngine';

/**
 * Exact MIRA Schedule 1 Line Items (Section 3.1)
 * Enforces a fixed enum and reporting structure for MIRA Schedule 1 filings.
 */
export type MiraSchedule1LineItem =
  | 'REVENUE'
  | 'COST_OF_SALES'
  | 'DIVIDEND_INCOME'
  | 'INTEREST_INCOME'
  | 'OTHER_INCOME'
  | 'INSURANCE_PREMIUM'
  | 'PROFESSIONAL_CONSULTING_FEES'
  | 'RENTAL_LEASE_PAYMENTS'
  | 'REPAIRS_MAINTENANCE'
  | 'RELATED_PARTY_EXPENSES'
  | 'DIRECTORS_PARTNERS_REMUNERATION'
  | 'SALARIES_WAGES'
  | 'SALES_MARKETING'
  | 'OTHER_EXPENSES';

export const MIRA_SCHEDULE_1_LINE_ITEMS: MiraSchedule1LineItem[] = [
  'REVENUE',
  'COST_OF_SALES',
  'DIVIDEND_INCOME',
  'INTEREST_INCOME',
  'OTHER_INCOME',
  'INSURANCE_PREMIUM',
  'PROFESSIONAL_CONSULTING_FEES',
  'RENTAL_LEASE_PAYMENTS',
  'REPAIRS_MAINTENANCE',
  'RELATED_PARTY_EXPENSES',
  'DIRECTORS_PARTNERS_REMUNERATION',
  'SALARIES_WAGES',
  'SALES_MARKETING',
  'OTHER_EXPENSES'
];

export interface MiraCategoryMappingRule {
  accountingCategory: string;
  displayName: string;
  miraSchedule1LineItem: MiraSchedule1LineItem;
  defaultTaxTreatment: IncomeTaxTreatment;
  notes?: string;
}

/**
 * Detailed Category Mapping Configuration (Section 3.2 & 3.3)
 * Maps internal granular subcategories upward to fixed MIRA Schedule 1 line items.
 */
export const MIRA_CATEGORY_MAPPING_RULES: Record<string, MiraCategoryMappingRule> = {
  // Revenue & Income
  'revenue.sales': {
    accountingCategory: 'revenue.sales',
    displayName: 'Sales & Operating Revenue',
    miraSchedule1LineItem: 'REVENUE',
    defaultTaxTreatment: 'TAX_EXEMPT_INCOME'
  },
  'revenue.operating': {
    accountingCategory: 'revenue.operating',
    displayName: 'Operating Revenue',
    miraSchedule1LineItem: 'REVENUE',
    defaultTaxTreatment: 'TAX_EXEMPT_INCOME'
  },
  'revenue.services': {
    accountingCategory: 'revenue.services',
    displayName: 'Service Income',
    miraSchedule1LineItem: 'REVENUE',
    defaultTaxTreatment: 'TAX_EXEMPT_INCOME'
  },
  'income.dividend': {
    accountingCategory: 'income.dividend',
    displayName: 'Dividend Income',
    miraSchedule1LineItem: 'DIVIDEND_INCOME',
    defaultTaxTreatment: 'TAX_EXEMPT_INCOME'
  },
  'income.interest': {
    accountingCategory: 'income.interest',
    displayName: 'Interest Income',
    miraSchedule1LineItem: 'INTEREST_INCOME',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },
  'income.other': {
    accountingCategory: 'income.other',
    displayName: 'Other Income',
    miraSchedule1LineItem: 'OTHER_INCOME',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },

  // Cost of Sales
  'cost_of_sales.ingredients': {
    accountingCategory: 'cost_of_sales.ingredients',
    displayName: 'Food & Beverage Ingredients',
    miraSchedule1LineItem: 'COST_OF_SALES',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },
  'cost_of_sales.local_supplies': {
    accountingCategory: 'cost_of_sales.local_supplies',
    displayName: 'Local Market Purchases',
    miraSchedule1LineItem: 'COST_OF_SALES',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },
  'cost_of_sales.general': {
    accountingCategory: 'cost_of_sales.general',
    displayName: 'Cost of Goods Sold',
    miraSchedule1LineItem: 'COST_OF_SALES',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },

  // Operating Expenses - MIRA Schedule 1 Mapped
  'insurance.premium': {
    accountingCategory: 'insurance.premium',
    displayName: 'Insurance Premium',
    miraSchedule1LineItem: 'INSURANCE_PREMIUM',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },
  'professional.accounting': {
    accountingCategory: 'professional.accounting',
    displayName: 'Accounting & Audit Fees',
    miraSchedule1LineItem: 'PROFESSIONAL_CONSULTING_FEES',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },
  'professional.legal': {
    accountingCategory: 'professional.legal',
    displayName: 'Legal & Consulting Fees',
    miraSchedule1LineItem: 'PROFESSIONAL_CONSULTING_FEES',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },
  'professional_fees': {
    accountingCategory: 'professional_fees',
    displayName: 'Professional & Consulting Fees',
    miraSchedule1LineItem: 'PROFESSIONAL_CONSULTING_FEES',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },
  'occupancy.rent': {
    accountingCategory: 'occupancy.rent',
    displayName: 'Rental & Lease Payments',
    miraSchedule1LineItem: 'RENTAL_LEASE_PAYMENTS',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },
  'rental_repairs': {
    accountingCategory: 'rental_repairs',
    displayName: 'Rental & Premises Expenses',
    miraSchedule1LineItem: 'RENTAL_LEASE_PAYMENTS',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },
  'repairs.maintenance': {
    accountingCategory: 'repairs.maintenance',
    displayName: 'Repairs & Maintenance',
    miraSchedule1LineItem: 'REPAIRS_MAINTENANCE',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },
  'related_party.expenses': {
    accountingCategory: 'related_party.expenses',
    displayName: 'Related Party Expenses',
    miraSchedule1LineItem: 'RELATED_PARTY_EXPENSES',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },
  'directors.remuneration': {
    accountingCategory: 'directors.remuneration',
    displayName: 'Directors & Partners Remuneration',
    miraSchedule1LineItem: 'DIRECTORS_PARTNERS_REMUNERATION',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },
  'salaries.wages': {
    accountingCategory: 'salaries.wages',
    displayName: 'Salaries & Wages',
    miraSchedule1LineItem: 'SALARIES_WAGES',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },
  'marketing.advertising': {
    accountingCategory: 'marketing.advertising',
    displayName: 'Sales & Marketing',
    miraSchedule1LineItem: 'SALES_MARKETING',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },

  // Utilities & Other Expenses
  'utilities.electricity': {
    accountingCategory: 'utilities.electricity',
    displayName: 'Electricity (STELCO)',
    miraSchedule1LineItem: 'OTHER_EXPENSES',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },
  'utilities.water': {
    accountingCategory: 'utilities.water',
    displayName: 'Water (MWSC)',
    miraSchedule1LineItem: 'OTHER_EXPENSES',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },
  'telecommunications': {
    accountingCategory: 'telecommunications',
    displayName: 'Internet & Telephone',
    miraSchedule1LineItem: 'OTHER_EXPENSES',
    defaultTaxTreatment: 'DEDUCTIBLE'
  },
  'operating_expenses.fines_penalties': {
    accountingCategory: 'operating_expenses.fines_penalties',
    displayName: 'Fines & Statutory Penalties',
    miraSchedule1LineItem: 'OTHER_EXPENSES',
    defaultTaxTreatment: 'NON_DEDUCTIBLE'
  },
  'operating_expenses.general': {
    accountingCategory: 'operating_expenses.general',
    displayName: 'Other Operating Expenses',
    miraSchedule1LineItem: 'OTHER_EXPENSES',
    defaultTaxTreatment: 'DEDUCTIBLE'
  }
};

/**
 * Resolves an accountingCategory, miraCategory or accountingTreatment upward to the official MIRA Schedule 1 line item.
 */
export function mapToMiraSchedule1LineItem(
  accountingCategory?: string,
  miraCategory?: string,
  accountingTreatment?: string
): MiraSchedule1LineItem {
  const cat = String(accountingCategory || miraCategory || '').toLowerCase();
  const trt = String(accountingTreatment || '').toUpperCase();

  // If accountingTreatment is explicitly REVENUE or COST_OF_SALES
  if (trt === 'REVENUE') {
    if (cat.includes('dividend')) return 'DIVIDEND_INCOME';
    if (cat.includes('interest')) return 'INTEREST_INCOME';
    if (cat.includes('other')) return 'OTHER_INCOME';
    return 'REVENUE';
  }

  if (trt === 'COST_OF_SALES') {
    return 'COST_OF_SALES';
  }

  // Direct match in rules
  if (MIRA_CATEGORY_MAPPING_RULES[cat]) {
    return MIRA_CATEGORY_MAPPING_RULES[cat].miraSchedule1LineItem;
  }

  // Fallback string pattern matches
  if (cat.startsWith('revenue') || cat.includes('sales')) return 'REVENUE';
  if (cat.startsWith('cost_of_sales') || cat.includes('ingredient') || cat.includes('cogs')) return 'COST_OF_SALES';
  if (cat.includes('dividend')) return 'DIVIDEND_INCOME';
  if (cat.includes('interest')) return 'INTEREST_INCOME';
  if (cat.includes('insurance')) return 'INSURANCE_PREMIUM';
  if (cat.includes('professional') || cat.includes('accounting') || cat.includes('consulting') || cat.includes('audit') || cat.includes('legal')) {
    return 'PROFESSIONAL_CONSULTING_FEES';
  }
  if (cat.includes('rent') || cat.includes('lease') || cat.includes('premises')) return 'RENTAL_LEASE_PAYMENTS';
  if (cat.includes('repair') || cat.includes('maintenance')) return 'REPAIRS_MAINTENANCE';
  if (cat.includes('related_party')) return 'RELATED_PARTY_EXPENSES';
  if (cat.includes('director') || cat.includes('partner')) return 'DIRECTORS_PARTNERS_REMUNERATION';
  if (cat.includes('salary') || cat.includes('wage') || cat.includes('payroll')) return 'SALARIES_WAGES';
  if (cat.includes('marketing') || cat.includes('advertising') || cat.includes('promo')) return 'SALES_MARKETING';

  return 'OTHER_EXPENSES';
}
