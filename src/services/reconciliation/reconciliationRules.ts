import { ReconciliationRule, ReconciliationType } from '../../types/reconciliation';

export const AUTHORITATIVE_RECONCILIATION_RULES: Record<ReconciliationType, ReconciliationRule> = {
  GL_GST: {
    ruleId: 'RULE-REC-001-GL-GST',
    name: 'General Ledger to GST Returns (MIRA 105) Reconciliation',
    reconciliationType: 'GL_GST',
    description: 'Reconciles standard-rated, zero-rated, and exempt revenues, gross purchases, and output/input GST in GL accounts against MIRA 105 periodic returns.',
    sourceA: 'General Ledger (Revenue & Tax Accounts)',
    sourceB: 'GST Return Ledger (MIRA 105 Box 1, 2, 3, 4, 5, 6, 7, 8)',
    tolerance: 0.05,
    warningThreshold: 1.00,
    legalReference: 'Goods and Services Tax Act (Act No. 10/2011) Section 27 & Tax Administration Act Section 38',
    active: true
  },
  GL_NWT: {
    ruleId: 'RULE-REC-002-GL-NWT',
    name: 'General Ledger to Non-Resident Withholding Tax (MIRA 302) Reconciliation',
    reconciliationType: 'GL_NWT',
    description: 'Reconciles withholding-applicable expense accounts (e.g. non-resident technical fees, royalties, commissions, management charges) against MIRA 302 filed returns.',
    sourceA: 'General Ledger (Withholding Expense Accounts)',
    sourceB: 'NWT / WHT Return Ledger (MIRA 302 Section B & C)',
    tolerance: 0.05,
    warningThreshold: 1.00,
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 55 & Income Tax Regulation Chapter 7',
    active: true
  },
  AP_NWT: {
    ruleId: 'RULE-REC-003-AP-NWT',
    name: 'Accounts Payable Foreign Vendor Invoices to NWT Withholding Deductions Reconciliation',
    reconciliationType: 'AP_NWT',
    description: 'Reconciles foreign supplier accounts payable disbursements with corresponding statutory NWT deductions and payment certificates.',
    sourceA: 'Accounts Payable Foreign Vendor Ledger / Invoices',
    sourceB: 'NWT Withholding Certificates & Remittances',
    tolerance: 0.05,
    warningThreshold: 1.00,
    legalReference: 'Income Tax Act Section 55(e) & Tax Administration Act Section 27',
    active: true
  },
  FIXED_ASSETS_GL: {
    ruleId: 'RULE-REC-004-FA-GL',
    name: 'Fixed Asset Register to General Ledger PPE Accounts Reconciliation',
    reconciliationType: 'FIXED_ASSETS_GL',
    description: 'Reconciles fixed asset register total acquisition cost, additions, disposals, and accumulated depreciation with GL Property, Plant & Equipment control accounts.',
    sourceA: 'Fixed Asset Register (FAR)',
    sourceB: 'General Ledger PPE & Depreciation Accounts',
    tolerance: 0.05,
    warningThreshold: 1.00,
    legalReference: 'Tax Administration Act Section 27 & IAS 16 Property, Plant and Equipment',
    active: true
  },
  TAX_ASSETS_FIXED_ASSETS: {
    ruleId: 'RULE-REC-005-TAX-FA',
    name: 'Tax Capital Allowance Asset Basis to Book Fixed Assets Reconciliation',
    reconciliationType: 'TAX_ASSETS_FIXED_ASSETS',
    description: 'Reconciles tax written down value (TWDV), qualifying additions, and balancing adjustments under Section 18 against book net book value and book depreciation.',
    sourceA: 'Statutory Capital Allowance Schedule (MIRA Section 18 / Schedule 2)',
    sourceB: 'Fixed Asset Register (Book Net Book Value & Additions)',
    tolerance: 0.05,
    warningThreshold: 1.00,
    legalReference: 'Income Tax Act Section 18 & Income Tax Regulation Schedule 2',
    active: true
  },
  PNL_INCOME_TAX: {
    ruleId: 'RULE-REC-006-PNL-IT',
    name: 'Profit & Loss Statement Net Profit to MIRA 604 Base Net Profit Reconciliation',
    reconciliationType: 'PNL_INCOME_TAX',
    description: 'Reconciles accounting net profit before tax from audited/financial P&L statements with MIRA 604 Box B01 starting accounting profit.',
    sourceA: 'Management / Audited Profit & Loss Statement',
    sourceB: 'MIRA 604 Form Box B01 (Accounting Profit / Loss)',
    tolerance: 0.05,
    warningThreshold: 1.00,
    legalReference: 'Income Tax Act Section 10 & MIRA 604 Specification Box B01',
    active: true
  },
  TAX_ADJUSTMENTS_TAX_CALC: {
    ruleId: 'RULE-REC-007-ADJ-CALC',
    name: 'Tax Adjustment Ledger to Statutory Tax Calculation Reconciliation',
    reconciliationType: 'TAX_ADJUSTMENTS_TAX_CALC',
    description: 'Reconciles granular Section 11 non-deductible addbacks, exempt income deductions, capital allowances, and balancing charges with Section C of MIRA 604.',
    sourceA: 'Tax Adjustment Ledger (Granular Records)',
    sourceB: 'MIRA 604 Form Section C Total Additions (C08) & Total Deductions (C16)',
    tolerance: 0.05,
    warningThreshold: 1.00,
    legalReference: 'Income Tax Act Section 11 & Income Tax Regulation Chapter 3',
    active: true
  },
  MIRA604_TAX_ENGINE: {
    ruleId: 'RULE-REC-008-604-ENG',
    name: 'MIRA 604 Final Output to Core Tax Engine Computation Reconciliation',
    reconciliationType: 'MIRA604_TAX_ENGINE',
    description: 'Reconciles final MIRA 604 tax payable, loss carried forward, and tax credit totals against the primary tax calculation engine results.',
    sourceA: 'Core Tax Calculation Engine Result',
    sourceB: 'MIRA 604 Form Generated Output (Boxes C17, D03, D09, E06)',
    tolerance: 0.05,
    warningThreshold: 1.00,
    legalReference: 'Income Tax Act Section 6 & 7 & MIRA 604 Form Instructions',
    active: true
  },
  SCHEDULE2_BALANCE_SHEET: {
    ruleId: 'RULE-REC-009-SCH2-BS',
    name: 'MIRA 604 Schedule 2 to Financial Balance Sheet Reconciliation',
    reconciliationType: 'SCHEDULE2_BALANCE_SHEET',
    description: 'Reconciles Schedule 2 Statement of Financial Position assets, liabilities, and equity with general ledger balance sheet accounts and verifies balance equation equality.',
    sourceA: 'General Ledger Balance Sheet / Trial Balance',
    sourceB: 'MIRA 604 Schedule 2 (Statement of Financial Position)',
    tolerance: 0.05,
    warningThreshold: 1.00,
    legalReference: 'Income Tax Regulation Chapter 4 & Schedule 2 Rules',
    active: true
  },
  SCHEDULE3_NET_WORTH: {
    ruleId: 'RULE-REC-010-SCH3-NW',
    name: 'MIRA 604 Schedule 3 to Individual Asset / Liability Source Data Reconciliation',
    reconciliationType: 'SCHEDULE3_NET_WORTH',
    description: 'Reconciles Schedule 3 non-business net worth declarations for individuals with declared asset holdings, bank balances, and liabilities.',
    sourceA: 'Individual Asset & Liability Registry',
    sourceB: 'MIRA 604 Schedule 3 (Statement of Net Worth Excluding Business)',
    tolerance: 0.05,
    warningThreshold: 1.00,
    legalReference: 'Income Tax Act Section 33 & Income Tax Regulation Schedule 3 Rules',
    active: true
  },
  SCHEDULE4_RELATED_PARTY: {
    ruleId: 'RULE-REC-011-SCH4-TP',
    name: 'MIRA 604 Schedule 4 to Related-Party Ledger & Transfer Pricing Adjustments Reconciliation',
    reconciliationType: 'SCHEDULE4_RELATED_PARTY',
    description: 'Reconciles international transactions with associates, intercompany sales/purchases/royalties/interest, and Section 67 transfer pricing adjustments.',
    sourceA: 'Intercompany & Related-Party Ledger',
    sourceB: 'MIRA 604 Schedule 4 (International Transactions with Associates)',
    tolerance: 0.05,
    warningThreshold: 1.00,
    legalReference: 'Income Tax Act Section 67 & 68 & MIRA Transfer Pricing Rules',
    active: true
  },
  SCHEDULE5_CFE: {
    ruleId: 'RULE-REC-012-SCH5-CFE',
    name: 'MIRA 604 Schedule 5 to Controlled Foreign Entity Source Data Reconciliation',
    reconciliationType: 'SCHEDULE5_CFE',
    description: 'Reconciles Controlled Foreign Entity (CFE) attributable taxable income and creditable foreign tax amounts against subsidiary financial records.',
    sourceA: 'CFE Subsidiary Financial Statements & Foreign Tax Records',
    sourceB: 'MIRA 604 Schedule 5 (CFE Reporting Schedule)',
    tolerance: 0.05,
    warningThreshold: 1.00,
    legalReference: 'Income Tax Act Section 24 & Income Tax Regulation Schedule 5 Rules',
    active: true
  }
};
