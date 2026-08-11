import { describe, test, expect } from 'vitest';
import { 
  MIRA_SCHEDULE_1_LINE_ITEMS, 
  mapToMiraSchedule1LineItem,
  MiraSchedule1LineItem 
} from '../../src/config/miraCategoryMapping';
import { generateSchedule1PnL } from '../../src/services/accounting/pnlService';
import { classifyDocument } from '../../src/services/classificationService';
import { createTransactionFromBill } from '../../src/services/accounting/transactionService';

describe('Phase 3 - MIRA Schedule 1 & P&L Engine Tests', () => {

  test('Section 3.1: Enforces fixed 14 MIRA Schedule 1 Line Items', () => {
    expect(MIRA_SCHEDULE_1_LINE_ITEMS).toHaveLength(14);
    expect(MIRA_SCHEDULE_1_LINE_ITEMS).toContain('REVENUE');
    expect(MIRA_SCHEDULE_1_LINE_ITEMS).toContain('COST_OF_SALES');
    expect(MIRA_SCHEDULE_1_LINE_ITEMS).toContain('DIVIDEND_INCOME');
    expect(MIRA_SCHEDULE_1_LINE_ITEMS).toContain('INTEREST_INCOME');
    expect(MIRA_SCHEDULE_1_LINE_ITEMS).toContain('OTHER_INCOME');
    expect(MIRA_SCHEDULE_1_LINE_ITEMS).toContain('INSURANCE_PREMIUM');
    expect(MIRA_SCHEDULE_1_LINE_ITEMS).toContain('PROFESSIONAL_CONSULTING_FEES');
    expect(MIRA_SCHEDULE_1_LINE_ITEMS).toContain('RENTAL_LEASE_PAYMENTS');
    expect(MIRA_SCHEDULE_1_LINE_ITEMS).toContain('REPAIRS_MAINTENANCE');
    expect(MIRA_SCHEDULE_1_LINE_ITEMS).toContain('RELATED_PARTY_EXPENSES');
    expect(MIRA_SCHEDULE_1_LINE_ITEMS).toContain('DIRECTORS_PARTNERS_REMUNERATION');
    expect(MIRA_SCHEDULE_1_LINE_ITEMS).toContain('SALARIES_WAGES');
    expect(MIRA_SCHEDULE_1_LINE_ITEMS).toContain('SALES_MARKETING');
    expect(MIRA_SCHEDULE_1_LINE_ITEMS).toContain('OTHER_EXPENSES');
  });

  test('Section 3.2 & 3.3: Maps granular accounting subcategories upward correctly', () => {
    expect(mapToMiraSchedule1LineItem('utilities.electricity')).toBe('OTHER_EXPENSES');
    expect(mapToMiraSchedule1LineItem('professional.accounting')).toBe('PROFESSIONAL_CONSULTING_FEES');
    expect(mapToMiraSchedule1LineItem('occupancy.rent')).toBe('RENTAL_LEASE_PAYMENTS');
    expect(mapToMiraSchedule1LineItem('repairs.maintenance')).toBe('REPAIRS_MAINTENANCE');
    expect(mapToMiraSchedule1LineItem('salaries.wages')).toBe('SALARIES_WAGES');
    expect(mapToMiraSchedule1LineItem('directors.remuneration')).toBe('DIRECTORS_PARTNERS_REMUNERATION');
    expect(mapToMiraSchedule1LineItem('marketing.advertising')).toBe('SALES_MARKETING');
    expect(mapToMiraSchedule1LineItem('insurance.premium')).toBe('INSURANCE_PREMIUM');
    expect(mapToMiraSchedule1LineItem('revenue.sales')).toBe('REVENUE');
    expect(mapToMiraSchedule1LineItem('income.dividend')).toBe('DIVIDEND_INCOME');
    expect(mapToMiraSchedule1LineItem('income.interest')).toBe('INTEREST_INCOME');
    expect(mapToMiraSchedule1LineItem('cost_of_sales.ingredients')).toBe('COST_OF_SALES');
  });

  test('Section 3.1 & 3.4: Generates accurate Schedule 1 P&L Report with Revenue, Cost of Sales, Expenses, and Accounting Profit', () => {
    // Build test transactions
    const rawDocs = [
      // Operating Revenue
      { invoiceNumber: 'INV-101', supplierName: 'Customer A', description: 'Restaurant Sales', amount: 150000, gstAmount: 12000, sourceType: 'invoice' },
      
      // Cost of Sales
      { invoiceNumber: 'BILL-01', supplierName: 'Food Wholesalers', description: 'Raw Ingredients', amount: 40000, gstAmount: 3200 },
      
      // Expenses
      { invoiceNumber: 'RENT-01', supplierName: 'Male Properties', description: 'Office Rent Premises', amount: 20000, gstAmount: 0 },
      { invoiceNumber: 'STELCO-01', supplierName: 'STELCO', description: 'Electricity', amount: 12000, gstAmount: 960 },
      { invoiceNumber: 'AUDIT-01', supplierName: 'KPMG Maldives', description: 'Audit & Tax Fees', amount: 15000, gstAmount: 1200 },
      
      // Non-Deductible Fine
      { invoiceNumber: 'MIRA-FINE', supplierName: 'MIRA', description: 'Late Tax Filing Penalty', amount: 3000, gstAmount: 0 },

      // Capital Asset Purchase (Laptop) -> Should be excluded from Schedule 1 Expenses!
      { invoiceNumber: 'ASSET-01', supplierName: 'Personal Computers', description: 'MacBook Pro Workstation', amount: 35000, gstAmount: 2800 }
    ];

    const transactions = rawDocs.map(doc => {
      const cls = classifyDocument(doc);
      if (doc.sourceType === 'invoice') {
        cls.accountingClassification = 'REVENUE';
        cls.accountingTreatment = 'REVENUE';
      }
      return createTransactionFromBill(doc, cls);
    });

    const report = generateSchedule1PnL(transactions, { taxYear: 2026, entityId: 'TEST-ENT-01' });

    expect(report.entityId).toBe('TEST-ENT-01');
    expect(report.taxYear).toBe(2026);

    // Revenue = 150,000
    expect(report.operatingRevenue).toBe(150000);
    expect(report.totalRevenue).toBe(150000);

    // Cost of Sales = 40,000
    expect(report.totalCostOfSales).toBe(40000);

    // Gross Profit = 150,000 - 40,000 = 110,000
    expect(report.grossProfit).toBe(110000);

    // Operating Expenses = Rent (20,000) + Utilities (12,000) + Professional (15,000) + Fine (3,000) = 50,000
    expect(report.totalOperatingExpenses).toBe(50000);

    // Accounting Profit Before Tax = Gross Profit (110,000) - Operating Expenses (50,000) = 60,000
    expect(report.accountingProfitBeforeTax).toBe(60000);

    // Non-deductible expenses = 3,000 (Fine)
    expect(report.totalNonDeductibleExpenses).toBe(3000);
    expect(report.totalDeductibleExpenses).toBe(47000);

    // Capital Asset Purchases Excluded = 35,000 (Laptop)
    expect(report.capitalAssetPurchasesExcluded).toBe(35000);

    // Line item breakdown checks
    expect(report.lineItems.RENTAL_LEASE_PAYMENTS.amount).toBe(20000);
    expect(report.lineItems.PROFESSIONAL_CONSULTING_FEES.amount).toBe(15000);
    expect(report.lineItems.OTHER_EXPENSES.amount).toBe(15000); // STELCO (12,000) + Fine (3,000)
    expect(report.lineItems.OTHER_EXPENSES.nonDeductibleAmount).toBe(3000);
    expect(report.lineItems.OTHER_EXPENSES.deductibleAmount).toBe(12000);
  });

});
