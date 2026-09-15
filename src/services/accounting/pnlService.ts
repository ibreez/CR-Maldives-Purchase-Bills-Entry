import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../db/client';
import Decimal from 'decimal.js';
import { TransactionRecord } from '../../types/taxEngine';
import { RevenueTransaction } from '../../types/revenue';
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

    // Milestone 4: Guarantee that P&L Operating Revenue reflects net revenue (e.g. 100,000), never gross (108,000)
    const effectiveAmount = (lineItem === 'REVENUE' || tx.accountingCategory === 'REVENUE') && (tx as any).netAmount !== undefined
      ? Number((tx as any).netAmount)
      : tx.amount;

    summary.amount += effectiveAmount;
    summary.transactionCount += 1;
    summary.items.push(tx);

    // Track tax deductibility
    if (tx.incomeTaxTreatment === 'NON_DEDUCTIBLE') {
      summary.nonDeductibleAmount += effectiveAmount;
    } else {
      summary.deductibleAmount += effectiveAmount;
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

/**
 * Converts an authoritative RevenueTransaction to a TransactionRecord
 * for P&L consumption, ensuring the amount is net revenue, never gross.
 */
export function convertRevenueToTransactionRecord(
  revenue: RevenueTransaction,
  options?: { entityId?: string; taxYear?: number }
): TransactionRecord {
  const dateStr = revenue.transactionDate || new Date().toISOString().split('T')[0];
  const year = options?.taxYear || parseInt(dateStr.slice(0, 4), 10) || new Date().getFullYear();

  return {
    id: revenue.id,
    entityId: options?.entityId || revenue.tenantId || 'COMPANY-001',
    taxYear: year,
    accountingPeriodStart: `${year}-01-01`,
    accountingPeriodEnd: `${year}-12-31`,
    transactionDate: dateStr,
    accountingCategory: 'REVENUE',
    miraCategory: 'OPERATING_REVENUE',
    accountingTreatment: 'EXPENSE_REVENUE',
    incomeTaxTreatment: 'DEDUCTIBLE', // Standard revenue
    amount: Number(revenue.netAmount.toString()),
    gstAmount: Number(revenue.gstAmount.toString()),
    totalAmount: Number(revenue.grossAmount.toString()),
    netAmount: Number(revenue.netAmount.toString()),
    grossAmount: Number(revenue.grossAmount.toString()),
    description: revenue.description || `Revenue - ${revenue.category || 'Sales'}`
  } as any;
}

/**
 * Generates an authoritative MIRA Schedule 1 P&L report directly from the
 * General Ledger / posted Journal entries.
 *
 * The authoritative chain is:
 * Revenue Transaction -> Journal -> Ledger -> Trial Balance -> P&L
 * Operating Revenue is derived from net credits on account 4000-OPERATING-REVENUE.
 */
export async function generateSchedule1PnLFromGeneralLedger(
  tenantIdOrParams: string | {
    tenantId?: string;
    taxYear?: number;
    startDate?: string;
    endDate?: string;
    accountingPeriodStart?: string;
    accountingPeriodEnd?: string;
    prismaClient?: PrismaClient | Prisma.TransactionClient;
  },
  options?: {
    taxYear?: number;
    startDate?: string;
    endDate?: string;
    accountingPeriodStart?: string;
    accountingPeriodEnd?: string;
  },
  db: PrismaClient | Prisma.TransactionClient = defaultPrisma
): Promise<MiraSchedule1Report> {
  let tenantId = 'COMPANY-001';
  let mergedOptions = options;
  let prismaClient = db;

  if (typeof tenantIdOrParams === 'string') {
    tenantId = tenantIdOrParams;
  } else if (tenantIdOrParams && typeof tenantIdOrParams === 'object') {
    tenantId = tenantIdOrParams.tenantId || 'COMPANY-001';
    mergedOptions = tenantIdOrParams;
    if (tenantIdOrParams.prismaClient) {
      prismaClient = tenantIdOrParams.prismaClient;
    }
  }

  const taxYear = mergedOptions?.taxYear || new Date().getFullYear();
  const startDate = mergedOptions?.startDate || mergedOptions?.accountingPeriodStart || `${taxYear}-01-01`;
  const endDate = mergedOptions?.endDate || mergedOptions?.accountingPeriodEnd || `${taxYear}-12-31`;

  // Query all POSTED journal lines in the period
  const dateFilter: Prisma.JournalWhereInput = {
    tenantId,
    status: 'POSTED'
  };

  if (startDate || endDate) {
    dateFilter.entryDate = {};
    if (startDate) (dateFilter.entryDate as any).gte = new Date(startDate);
    if (endDate) (dateFilter.entryDate as any).lte = new Date(endDate);
  }

  const lines = await prismaClient.journalLine.findMany({
    where: {
      journal: dateFilter
    },
    include: {
      journal: true
    }
  });

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

  // Aggregate by account code
  let totalNetRevenueCredits = new Decimal(0);

  for (const line of lines) {
    const debit = new Decimal(line.debit.toString());
    const credit = new Decimal(line.credit.toString());

    // Revenue accounts (4000 series): Revenue = Credit - Debit
    if (line.accountCode.startsWith('4')) {
      const netCredit = credit.minus(debit);
      totalNetRevenueCredits = totalNetRevenueCredits.plus(netCredit);

      const fakeTx: TransactionRecord = {
        transactionId: `TX-REV-${line.id}`,
        sourceType: 'journal',
        sourceId: line.journalId,
        entityId: tenantId,
        outletId: 'OUTLET-MAIN',
        taxYear,
        accountingPeriodStart: startDate,
        accountingPeriodEnd: endDate,
        transactionDate: line.journal.entryDate.toISOString().split('T')[0],
        accountingCategory: 'REVENUE',
        miraCategory: 'OPERATING_REVENUE',
        accountingTreatment: 'REVENUE',
        gstTreatment: 'STANDARD_RATED',
        incomeTaxTreatment: 'DEDUCTIBLE',
        reviewStatus: 'APPROVED',
        amount: Number(netCredit.toFixed(2)),
        gstAmount: 0,
        totalAmount: Number(netCredit.toFixed(2)),
        description: line.description || line.accountName,
        auditHistory: [],
        createdAt: line.journal.createdAt?.toISOString() || new Date().toISOString()
      };

      lineItemsMap['REVENUE'].transactionCount += 1;
      lineItemsMap['REVENUE'].items.push(fakeTx);
    }
    // Expense accounts (5000 series): Expense = Debit - Credit
    else if (line.accountCode.startsWith('5')) {
      const netDebit = debit.minus(credit);
      if (netDebit.isZero()) continue;

      let category: MiraSchedule1LineItem = 'OTHER_EXPENSES';
      if (line.accountCode === '5000' || line.accountName.toLowerCase().includes('cost of sales')) {
        category = 'COST_OF_SALES';
      } else if (line.accountName.toLowerCase().includes('salary') || line.accountName.toLowerCase().includes('wage')) {
        category = 'SALARIES_WAGES';
      } else if (line.accountName.toLowerCase().includes('rent') || line.accountName.toLowerCase().includes('lease')) {
        category = 'RENTAL_LEASE_PAYMENTS';
      } else if (line.accountName.toLowerCase().includes('marketing') || line.accountName.toLowerCase().includes('sales')) {
        category = 'SALES_MARKETING';
      } else if (line.accountName.toLowerCase().includes('insurance')) {
        category = 'INSURANCE_PREMIUM';
      } else if (line.accountName.toLowerCase().includes('repair') || line.accountName.toLowerCase().includes('maintenance')) {
        category = 'REPAIRS_MAINTENANCE';
      }

      const summary = lineItemsMap[category];
      const amountNum = Number(netDebit.toFixed(2));
      summary.amount += amountNum;
      summary.deductibleAmount += amountNum;
      summary.transactionCount += 1;
    }
  }

  // Operating Revenue reflects net revenue credits from GL
  lineItemsMap['REVENUE'].amount = Number(totalNetRevenueCredits.toFixed(2));
  lineItemsMap['REVENUE'].deductibleAmount = lineItemsMap['REVENUE'].amount;

  const operatingRevenue = lineItemsMap['REVENUE'].amount;
  const otherRevenue =
    lineItemsMap['DIVIDEND_INCOME'].amount +
    lineItemsMap['INTEREST_INCOME'].amount +
    lineItemsMap['OTHER_INCOME'].amount;

  const totalRevenue = operatingRevenue + otherRevenue;
  const totalCostOfSales = lineItemsMap['COST_OF_SALES'].amount;
  const grossProfit = totalRevenue - totalCostOfSales;

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
    entityId: tenantId,
    taxYear,
    accountingPeriodStart: startDate,
    accountingPeriodEnd: endDate,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    operatingRevenue: Math.round(operatingRevenue * 100) / 100,
    otherRevenue: Math.round(otherRevenue * 100) / 100,
    totalCostOfSales: Math.round(totalCostOfSales * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    totalOperatingExpenses: Math.round(totalOperatingExpenses * 100) / 100,
    accountingProfitBeforeTax: Math.round(accountingProfitBeforeTax * 100) / 100,
    totalDeductibleExpenses: Math.round(totalDeductibleExpenses * 100) / 100,
    totalNonDeductibleExpenses: Math.round(totalNonDeductibleExpenses * 100) / 100,
    capitalAssetPurchasesExcluded: 0,
    lineItems: lineItemsMap,
    schedule1LineItemsList,
    generatedAt: new Date().toISOString()
  };
}
