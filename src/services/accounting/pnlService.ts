import { TransactionRecord } from '../../types/taxEngine';
import {
  MiraSchedule1LineItem,
  MIRA_SCHEDULE_1_LINE_ITEMS,
  mapToMiraSchedule1LineItem
} from '../../config/miraCategoryMapping';

export interface MiraSchedule1LineSummary {
  lineItem: MiraSchedule1LineItem;
  label: string;
  amount: number;
  transactionCount: number;
  deductibleAmount: number;
  nonDeductibleAmount: number;
  items: TransactionRecord[];
}

export interface MiraSchedule1Report {
  entityId: string;
  taxYear: number;
  accountingPeriodStart: string;
  accountingPeriodEnd: string;

  // High level financial summary
  totalRevenue: number;
  operatingRevenue: number;
  otherRevenue: number;
  totalCostOfSales: number;
  grossProfit: number;
  totalOperatingExpenses: number;
  accountingProfitBeforeTax: number;

  // Tax breakdown
  totalDeductibleExpenses: number;
  totalNonDeductibleExpenses: number;
  capitalAssetPurchasesExcluded: number;

  // Line items dictionary and array
  lineItems: Record<MiraSchedule1LineItem, MiraSchedule1LineSummary>;
  schedule1LineItemsList: MiraSchedule1LineSummary[];

  generatedAt: string;
}

const LINE_ITEM_LABELS: Record<MiraSchedule1LineItem, string> = {
  REVENUE: 'Revenue & Sales',
  COST_OF_SALES: 'Cost of Sales',
  DIVIDEND_INCOME: 'Dividend Income',
  INTEREST_INCOME: 'Interest Income',
  OTHER_INCOME: 'Other Operating Income',
  INSURANCE_PREMIUM: 'Insurance Premiums',
  PROFESSIONAL_CONSULTING_FEES: 'Professional & Consulting Fees',
  RENTAL_LEASE_PAYMENTS: 'Rental & Lease Payments',
  REPAIRS_MAINTENANCE: 'Repairs & Maintenance',
  RELATED_PARTY_EXPENSES: 'Related Party Expenses',
  DIRECTORS_PARTNERS_REMUNERATION: 'Directors & Partners Remuneration',
  SALARIES_WAGES: 'Salaries & Wages',
  SALES_MARKETING: 'Sales & Marketing',
  OTHER_EXPENSES: 'Other Operating Expenses'
};

/**
 * MIRA Schedule 1 & P&L Engine (Section 3.1)
 * Generates an official MIRA Schedule 1 Profit & Loss report from posted transactions.
 * Capital asset purchases are routed to the Fixed Asset Register and excluded from operating expenses.
 *
 * @param transactions Array of posted TransactionRecord items
 * @param options Optional metadata overrides
 * @returns MiraSchedule1Report
 */
export function generateSchedule1PnL(
  transactions: TransactionRecord[],
  options?: {
    entityId?: string;
    taxYear?: number;
    accountingPeriodStart?: string;
    accountingPeriodEnd?: string;
  }
): MiraSchedule1Report {
  const txList = transactions || [];

  const entityId = options?.entityId || (txList[0]?.entityId || 'COMPANY-001');
  const taxYear = options?.taxYear || (txList[0]?.taxYear || new Date().getFullYear());
  const accountingPeriodStart = options?.accountingPeriodStart || (txList[0]?.accountingPeriodStart || `${taxYear}-01-01`);
  const accountingPeriodEnd = options?.accountingPeriodEnd || (txList[0]?.accountingPeriodEnd || `${taxYear}-12-31`);

  // Initialize line items dictionary
  const lineItemsMap = {} as Record<MiraSchedule1LineItem, MiraSchedule1LineSummary>;

  for (const item of MIRA_SCHEDULE_1_LINE_ITEMS) {
    lineItemsMap[item] = {
      lineItem: item,
      label: LINE_ITEM_LABELS[item],
      amount: 0,
      transactionCount: 0,
      deductibleAmount: 0,
      nonDeductibleAmount: 0,
      items: []
    };
  }

  let capitalAssetPurchasesExcluded = 0;

  // Process transactions
  for (const tx of txList) {
    // 1. Check for Capital Asset Routing (Section 1.3 & 3.1)
    // Capital Asset Purchases are excluded from Schedule 1 operating expenses
    if (tx.accountingTreatment === 'ASSET' || tx.incomeTaxTreatment === 'CAPITAL_ALLOWANCE') {
      capitalAssetPurchasesExcluded += tx.amount;
      continue;
    }

    // Determine target MIRA Schedule 1 Line Item
    const lineItem = mapToMiraSchedule1LineItem(tx.accountingCategory, tx.miraCategory, tx.accountingTreatment);
    const summary = lineItemsMap[lineItem];

    if (!summary) continue;

    summary.amount += tx.amount;
    summary.transactionCount += 1;
    summary.items.push(tx);

    // Track tax deductibility
    if (tx.incomeTaxTreatment === 'NON_DEDUCTIBLE') {
      summary.nonDeductibleAmount += tx.amount;
    } else {
      summary.deductibleAmount += tx.amount;
    }
  }

  // Calculate high-level financial summary
  const operatingRevenue = lineItemsMap['REVENUE'].amount;
  const otherRevenue =
    lineItemsMap['DIVIDEND_INCOME'].amount +
    lineItemsMap['INTEREST_INCOME'].amount +
    lineItemsMap['OTHER_INCOME'].amount;

  const totalRevenue = operatingRevenue + otherRevenue;
  const totalCostOfSales = lineItemsMap['COST_OF_SALES'].amount;
  const grossProfit = totalRevenue - totalCostOfSales;

  // Calculate total operating expenses (all expense line items)
  const expenseLineKeys: MiraSchedule1LineItem[] = [
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

  let totalOperatingExpenses = 0;
  let totalDeductibleExpenses = 0;
  let totalNonDeductibleExpenses = 0;

  for (const key of expenseLineKeys) {
    const sum = lineItemsMap[key];
    totalOperatingExpenses += sum.amount;
    totalDeductibleExpenses += sum.deductibleAmount;
    totalNonDeductibleExpenses += sum.nonDeductibleAmount;
  }

  const accountingProfitBeforeTax = grossProfit - totalOperatingExpenses;

  const schedule1LineItemsList = MIRA_SCHEDULE_1_LINE_ITEMS.map(key => lineItemsMap[key]);

  return {
    entityId,
    taxYear,
    accountingPeriodStart,
    accountingPeriodEnd,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    operatingRevenue: Math.round(operatingRevenue * 100) / 100,
    otherRevenue: Math.round(otherRevenue * 100) / 100,
    totalCostOfSales: Math.round(totalCostOfSales * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    totalOperatingExpenses: Math.round(totalOperatingExpenses * 100) / 100,
    accountingProfitBeforeTax: Math.round(accountingProfitBeforeTax * 100) / 100,
    totalDeductibleExpenses: Math.round(totalDeductibleExpenses * 100) / 100,
    totalNonDeductibleExpenses: Math.round(totalNonDeductibleExpenses * 100) / 100,
    capitalAssetPurchasesExcluded: Math.round(capitalAssetPurchasesExcluded * 100) / 100,
    lineItems: lineItemsMap,
    schedule1LineItemsList,
    generatedAt: new Date().toISOString()
  };
}
