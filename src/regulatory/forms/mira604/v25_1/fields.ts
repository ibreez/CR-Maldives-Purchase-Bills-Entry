import { FormFieldDefinition } from '../../types';

export const MIRA604_V25_1_FIELDS: FormFieldDefinition[] = [
  // ==========================================================================
  // SECTION A: Taxpayer Information & Accounting Profile
  // ==========================================================================
  {
    fieldCode: 'F604_A01_TIN',
    label: 'Taxpayer Identification Number (TIN)',
    dataType: 'STRING',
    required: true,
    source: 'USER_INPUT',
    validation: {
      pattern: /^[A-Za-z0-9-]{7,25}$/
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_A',
    description: 'Official MIRA issued Taxpayer Identification Number'
  },
  {
    fieldCode: 'F604_A02_TAXPAYER_NAME',
    label: 'Legal Name of Taxpayer / Entity',
    dataType: 'STRING',
    required: true,
    source: 'USER_INPUT',
    validation: {
      min: 2,
      max: 200
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_A',
    description: 'Registered legal business name or individual full name'
  },
  {
    fieldCode: 'F604_A03_TAXPAYER_TYPE',
    label: 'Taxpayer Classification',
    dataType: 'ENUM',
    required: true,
    source: 'USER_INPUT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_A',
    description: 'Entity classification: COMPANY, INDIVIDUAL, SOLE_PROPRIETOR, PARTNERSHIP, TRUST, BODY_OF_PERSONS, NON_RESIDENT_COMPANY'
  },
  {
    fieldCode: 'F604_A04_TAX_YEAR',
    label: 'Tax Year',
    dataType: 'NUMBER',
    required: true,
    source: 'USER_INPUT',
    validation: {
      min: 2020,
      max: 2099
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_A',
    description: 'Calendar tax year to which this return applies (2024+ for v25.1)'
  },
  {
    fieldCode: 'F604_A05_PERIOD_START',
    label: 'Accounting Period Start Date',
    dataType: 'DATE',
    required: true,
    source: 'USER_INPUT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_A',
    description: 'Beginning of the basis accounting period (YYYY-MM-DD)'
  },
  {
    fieldCode: 'F604_A06_PERIOD_END',
    label: 'Accounting Period End Date',
    dataType: 'DATE',
    required: true,
    source: 'USER_INPUT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_A',
    description: 'End of the basis accounting period (YYYY-MM-DD)'
  },
  {
    fieldCode: 'F604_A07_ACCOUNTING_DAYS',
    label: 'Number of Accounting Days in Period',
    dataType: 'NUMBER',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_ACC_DAYS',
      expression: 'DATEDIFF_DAYS(PERIOD_END, PERIOD_START) + 1',
      description: 'Calculates the number of days in the accounting period for Section 15(c) threshold pro-rating',
      dependencies: ['F604_A05_PERIOD_START', 'F604_A06_PERIOD_END']
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_A'
  },
  {
    fieldCode: 'F604_A08_BUSINESS_ACTIVITY',
    label: 'Principal Business Activity / Sector',
    dataType: 'STRING',
    required: false,
    source: 'USER_INPUT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_A',
    description: 'Description of principal revenue-generating business operations'
  },
  {
    fieldCode: 'F604_A09_PRESENTATION_CURRENCY',
    label: 'Presentation Currency',
    dataType: 'ENUM',
    required: true,
    source: 'USER_INPUT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_A',
    description: 'Functional/Presentation currency of the financial statements (MVR or approved foreign currency USD)'
  },
  {
    fieldCode: 'F604_A10_GROUP_FACTOR',
    label: 'Group Factor (Section 15(c))',
    dataType: 'NUMBER',
    required: false,
    source: 'USER_INPUT',
    applicability: 'COMPANY',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_A',
    description: 'Number of associated entities in the corporate group for dividing the MVR 500,000 threshold'
  },
  {
    fieldCode: 'F604_A11_CONTACT_EMAIL',
    label: 'Contact Email Address',
    dataType: 'STRING',
    required: false,
    source: 'USER_INPUT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_A'
  },
  {
    fieldCode: 'F604_A12_CONTACT_PHONE',
    label: 'Contact Phone Number',
    dataType: 'STRING',
    required: false,
    source: 'USER_INPUT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_A'
  },

  // ==========================================================================
  // SECTION B: Schedule 1 - Statement of Profit or Loss
  // ==========================================================================
  {
    fieldCode: 'F604_B01_GROSS_REVENUE',
    label: 'Gross Turnover / Revenue',
    dataType: 'DECIMAL',
    required: true,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B',
    description: 'Total revenue and turnover derived from principal commercial business activities'
  },
  {
    fieldCode: 'F604_B02_COST_OF_SALES',
    label: 'Cost of Sales / Direct Operational Costs',
    dataType: 'DECIMAL',
    required: true,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B',
    description: 'Direct materials, direct labour, and direct operational costs attributable to sales'
  },
  {
    fieldCode: 'F604_B03_GROSS_PROFIT',
    label: 'Gross Profit / (Gross Loss)',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_GROSS_PROFIT',
      expression: 'GROSS_REVENUE - COST_OF_SALES',
      description: 'Gross Profit calculated as Gross Revenue minus Cost of Sales',
      dependencies: ['F604_B01_GROSS_REVENUE', 'F604_B02_COST_OF_SALES']
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B04_DIVIDEND_INCOME',
    label: 'Dividend Income',
    dataType: 'DECIMAL',
    required: false,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B05_INTEREST_INCOME',
    label: 'Interest Income',
    dataType: 'DECIMAL',
    required: false,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B06_RENTAL_INCOME',
    label: 'Rental Income',
    dataType: 'DECIMAL',
    required: false,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B07_ROYALTY_INCOME',
    label: 'Royalty & License Income',
    dataType: 'DECIMAL',
    required: false,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B08_CAPITAL_GAINS',
    label: 'Realized Capital Gains on Business Assets',
    dataType: 'DECIMAL',
    required: false,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B09_FOREIGN_INCOME',
    label: 'Foreign Sourced Income',
    dataType: 'DECIMAL',
    required: false,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B10_OTHER_OPERATING_INCOME',
    label: 'Other Operating / Miscellaneous Income',
    dataType: 'DECIMAL',
    required: false,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B11_TOTAL_OTHER_INCOME',
    label: 'Total Other Income',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_TOTAL_OTHER_INCOME',
      expression: 'SUM(DIVIDEND_INCOME, INTEREST_INCOME, RENTAL_INCOME, ROYALTY_INCOME, CAPITAL_GAINS, FOREIGN_INCOME, OTHER_OPERATING_INCOME)',
      description: 'Sum of all non-operational and auxiliary income components',
      dependencies: [
        'F604_B04_DIVIDEND_INCOME',
        'F604_B05_INTEREST_INCOME',
        'F604_B06_RENTAL_INCOME',
        'F604_B07_ROYALTY_INCOME',
        'F604_B08_CAPITAL_GAINS',
        'F604_B09_FOREIGN_INCOME',
        'F604_B10_OTHER_OPERATING_INCOME'
      ]
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B12_STAFF_EXPENSES',
    label: 'Salaries, Wages, Allowances & Pension Costs',
    dataType: 'DECIMAL',
    required: false,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B13_RENT_EXPENSE',
    label: 'Rent & Lease of Premises',
    dataType: 'DECIMAL',
    required: false,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B14_UTILITIES_EXPENSE',
    label: 'Utilities (Electricity, Water, Communications)',
    dataType: 'DECIMAL',
    required: false,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B15_BOOK_DEPRECIATION_EXPENSE',
    label: 'Accounting Depreciation & Amortisation Expense',
    dataType: 'DECIMAL',
    required: false,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B16_FINANCE_COSTS',
    label: 'Finance Costs & Bank Charges',
    dataType: 'DECIMAL',
    required: false,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B17_LEGAL_PROFESSIONAL_FEES',
    label: 'Legal, Audit & Professional Fees',
    dataType: 'DECIMAL',
    required: false,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B18_TRAVEL_ENTERTAINMENT',
    label: 'Travel, Transportation & Entertainment Expenses',
    dataType: 'DECIMAL',
    required: false,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B19_REPAIRS_MAINTENANCE',
    label: 'Repairs & Maintenance Expenses',
    dataType: 'DECIMAL',
    required: false,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B20_OTHER_OPERATING_EXPENSES',
    label: 'Other Operating Expenses',
    dataType: 'DECIMAL',
    required: false,
    source: 'PNL_STATEMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B21_TOTAL_OPERATING_EXPENSES',
    label: 'Total Operating Expenses',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_TOTAL_EXPENSES',
      expression: 'SUM(STAFF_EXPENSES, RENT_EXPENSE, UTILITIES_EXPENSE, BOOK_DEPRECIATION_EXPENSE, FINANCE_COSTS, LEGAL_PROFESSIONAL_FEES, TRAVEL_ENTERTAINMENT, REPAIRS_MAINTENANCE, OTHER_OPERATING_EXPENSES)',
      description: 'Sum of all deductible and non-deductible accounting expense items',
      dependencies: [
        'F604_B12_STAFF_EXPENSES',
        'F604_B13_RENT_EXPENSE',
        'F604_B14_UTILITIES_EXPENSE',
        'F604_B15_BOOK_DEPRECIATION_EXPENSE',
        'F604_B16_FINANCE_COSTS',
        'F604_B17_LEGAL_PROFESSIONAL_FEES',
        'F604_B18_TRAVEL_ENTERTAINMENT',
        'F604_B19_REPAIRS_MAINTENANCE',
        'F604_B20_OTHER_OPERATING_EXPENSES'
      ]
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },
  {
    fieldCode: 'F604_B22_NET_PROFIT_BEFORE_TAX',
    label: 'Accounting Net Profit / (Loss) Before Tax',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_NET_PROFIT_BEFORE_TAX',
      expression: 'GROSS_PROFIT + TOTAL_OTHER_INCOME - TOTAL_OPERATING_EXPENSES',
      description: 'Net accounting profit or loss prior to tax adjustments and capital allowance',
      dependencies: ['F604_B03_GROSS_PROFIT', 'F604_B11_TOTAL_OTHER_INCOME', 'F604_B21_TOTAL_OPERATING_EXPENSES']
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_B'
  },

  // ==========================================================================
  // SECTION C: Tax Adjustments (Additions & Deductions)
  // ==========================================================================
  {
    fieldCode: 'F604_C01_ADD_BOOK_DEPRECIATION',
    label: 'Add: Accounting Depreciation & Amortisation',
    dataType: 'DECIMAL',
    required: false,
    source: 'TAX_ADJUSTMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_C',
    description: 'Mandatory add-back of book depreciation replaced by statutory capital allowance'
  },
  {
    fieldCode: 'F604_C02_ADD_FINES_PENALTIES',
    label: 'Add: Fines & Penalties',
    dataType: 'DECIMAL',
    required: false,
    source: 'TAX_ADJUSTMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_C',
    description: 'Non-deductible statutory fines, penalties, and late fees under Income Tax Act'
  },
  {
    fieldCode: 'F604_C03_ADD_ENTERTAINMENT_NON_DEDUCTIBLE',
    label: 'Add: Non-Deductible Entertainment Expenses',
    dataType: 'DECIMAL',
    required: false,
    source: 'TAX_ADJUSTMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_C'
  },
  {
    fieldCode: 'F604_C04_ADD_NON_APPROVED_DONATIONS',
    label: 'Add: Non-Approved Donations & Gifts',
    dataType: 'DECIMAL',
    required: false,
    source: 'TAX_ADJUSTMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_C'
  },
  {
    fieldCode: 'F604_C05_ADD_PERSONAL_DRAWINGS',
    label: 'Add: Personal / Non-Business Expenditure',
    dataType: 'DECIMAL',
    required: false,
    source: 'TAX_ADJUSTMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_C'
  },
  {
    fieldCode: 'F604_C06_ADD_GENERAL_PROVISIONS',
    label: 'Add: General Contingency & Bad Debt Provisions',
    dataType: 'DECIMAL',
    required: false,
    source: 'TAX_ADJUSTMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_C'
  },
  {
    fieldCode: 'F604_C07_ADD_OTHER_STATUTORY_ADDS',
    label: 'Add: Other Statutory Add-backs',
    dataType: 'DECIMAL',
    required: false,
    source: 'TAX_ADJUSTMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_C'
  },
  {
    fieldCode: 'F604_C08_TOTAL_TAX_ADDITIONS',
    label: 'Total Additions to Accounting Profit',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_TOTAL_ADDITIONS',
      expression: 'SUM(ADD_BOOK_DEPRECIATION, ADD_FINES_PENALTIES, ADD_ENTERTAINMENT_NON_DEDUCTIBLE, ADD_NON_APPROVED_DONATIONS, ADD_PERSONAL_DRAWINGS, ADD_GENERAL_PROVISIONS, ADD_OTHER_STATUTORY_ADDS)',
      description: 'Sum of all non-deductible expenses and statutory additions',
      dependencies: [
        'F604_C01_ADD_BOOK_DEPRECIATION',
        'F604_C02_ADD_FINES_PENALTIES',
        'F604_C03_ADD_ENTERTAINMENT_NON_DEDUCTIBLE',
        'F604_C04_ADD_NON_APPROVED_DONATIONS',
        'F604_C05_ADD_PERSONAL_DRAWINGS',
        'F604_C06_ADD_GENERAL_PROVISIONS',
        'F604_C07_ADD_OTHER_STATUTORY_ADDS'
      ]
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_C'
  },
  {
    fieldCode: 'F604_C09_DED_EXEMPT_INCOME',
    label: 'Less: Exempt & Non-Taxable Income',
    dataType: 'DECIMAL',
    required: false,
    source: 'TAX_ADJUSTMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_C'
  },
  {
    fieldCode: 'F604_C10_DED_SPECIFIC_BAD_DEBTS',
    label: 'Less: Specific Bad Debts Written Off',
    dataType: 'DECIMAL',
    required: false,
    source: 'TAX_ADJUSTMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_C'
  },
  {
    fieldCode: 'F604_C11_DED_OTHER_STATUTORY_DEDS',
    label: 'Less: Other Statutory Allowable Deductions',
    dataType: 'DECIMAL',
    required: false,
    source: 'TAX_ADJUSTMENT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_C'
  },
  {
    fieldCode: 'F604_C12_TOTAL_TAX_DEDUCTIONS',
    label: 'Total Deductions from Accounting Profit',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_TOTAL_DEDUCTIONS',
      expression: 'SUM(DED_EXEMPT_INCOME, DED_SPECIFIC_BAD_DEBTS, DED_OTHER_STATUTORY_DEDS)',
      description: 'Sum of all non-taxable income and statutory deductions',
      dependencies: [
        'F604_C09_DED_EXEMPT_INCOME',
        'F604_C10_DED_SPECIFIC_BAD_DEBTS',
        'F604_C11_DED_OTHER_STATUTORY_DEDS'
      ]
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_C'
  },
  {
    fieldCode: 'F604_C13_NET_TAX_ADJUSTMENTS',
    label: 'Net Tax Adjustments',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_NET_TAX_ADJUSTMENTS',
      expression: 'TOTAL_TAX_ADDITIONS - TOTAL_TAX_DEDUCTIONS',
      description: 'Net adjustment to reconcile accounting profit to taxable basis before capital allowance',
      dependencies: ['F604_C08_TOTAL_TAX_ADDITIONS', 'F604_C12_TOTAL_TAX_DEDUCTIONS']
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_C'
  },

  // ==========================================================================
  // SECTION D: Schedule 2 - Capital Allowances
  // ==========================================================================
  {
    fieldCode: 'F604_D01_CA_BUILDINGS_STRUCTURES',
    label: 'Buildings & Structures Allowance Claimed',
    dataType: 'DECIMAL',
    required: false,
    source: 'CAPITAL_ALLOWANCE',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_D'
  },
  {
    fieldCode: 'F604_D02_CA_PLANT_MACHINERY',
    label: 'Plant, Machinery & Heavy Equipment Allowance Claimed',
    dataType: 'DECIMAL',
    required: false,
    source: 'CAPITAL_ALLOWANCE',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_D'
  },
  {
    fieldCode: 'F604_D03_CA_VEHICLES_VESSELS',
    label: 'Motor Vehicles & Marine Vessels Allowance Claimed',
    dataType: 'DECIMAL',
    required: false,
    source: 'CAPITAL_ALLOWANCE',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_D'
  },
  {
    fieldCode: 'F604_D04_CA_ELECTRONIC_IT_EQUIPMENT',
    label: 'Computers, IT Hardware & Software Allowance Claimed',
    dataType: 'DECIMAL',
    required: false,
    source: 'CAPITAL_ALLOWANCE',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_D'
  },
  {
    fieldCode: 'F604_D05_CA_FURNITURE_FIXTURES',
    label: 'Furniture, Fixtures & Fittings Allowance Claimed',
    dataType: 'DECIMAL',
    required: false,
    source: 'CAPITAL_ALLOWANCE',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_D'
  },
  {
    fieldCode: 'F604_D06_CA_INTANGIBLES_RD',
    label: 'Intangible Assets & R&D Allowance Claimed',
    dataType: 'DECIMAL',
    required: false,
    source: 'CAPITAL_ALLOWANCE',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_D'
  },
  {
    fieldCode: 'F604_D07_CA_BALANCING_ALLOWANCE',
    label: 'Balancing Allowance on Disposed Assets',
    dataType: 'DECIMAL',
    required: false,
    source: 'CAPITAL_ALLOWANCE',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_D'
  },
  {
    fieldCode: 'F604_D08_CA_BALANCING_CHARGE',
    label: 'Balancing Charge on Disposed Assets (Deducted from Allowance)',
    dataType: 'DECIMAL',
    required: false,
    source: 'CAPITAL_ALLOWANCE',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_D'
  },
  {
    fieldCode: 'F604_D09_TOTAL_CAPITAL_ALLOWANCE',
    label: 'Total Net Capital Allowance Claimable',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_TOTAL_CAPITAL_ALLOWANCE',
      expression: 'SUM(CA_BUILDINGS_STRUCTURES, CA_PLANT_MACHINERY, CA_VEHICLES_VESSELS, CA_ELECTRONIC_IT_EQUIPMENT, CA_FURNITURE_FIXTURES, CA_INTANGIBLES_RD, CA_BALANCING_ALLOWANCE) - CA_BALANCING_CHARGE',
      description: 'Total statutory capital allowances claimed for the tax year',
      dependencies: [
        'F604_D01_CA_BUILDINGS_STRUCTURES',
        'F604_D02_CA_PLANT_MACHINERY',
        'F604_D03_CA_VEHICLES_VESSELS',
        'F604_D04_CA_ELECTRONIC_IT_EQUIPMENT',
        'F604_D05_CA_FURNITURE_FIXTURES',
        'F604_D06_CA_INTANGIBLES_RD',
        'F604_D07_CA_BALANCING_ALLOWANCE',
        'F604_D08_CA_BALANCING_CHARGE'
      ]
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_D'
  },

  // ==========================================================================
  // SECTION E: Taxable Income & Loss Relief (Section 30)
  // ==========================================================================
  {
    fieldCode: 'F604_E01_ADJ_TAXABLE_PROFIT_BEFORE_LOSS',
    label: 'Adjusted Taxable Profit / (Loss) Before Loss Relief',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_ADJ_TAXABLE_PROFIT',
      expression: 'NET_PROFIT_BEFORE_TAX + NET_TAX_ADJUSTMENTS - TOTAL_CAPITAL_ALLOWANCE',
      description: 'Taxable profit or current year tax loss before applying loss carry forward',
      dependencies: ['F604_B22_NET_PROFIT_BEFORE_TAX', 'F604_C13_NET_TAX_ADJUSTMENTS', 'F604_D09_TOTAL_CAPITAL_ALLOWANCE']
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_E'
  },
  {
    fieldCode: 'F604_E02_PRIOR_UNABSORBED_LOSSES',
    label: 'Prior Unabsorbed Tax Losses Brought Forward',
    dataType: 'DECIMAL',
    required: false,
    source: 'LOSS_LEDGER',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_E'
  },
  {
    fieldCode: 'F604_E03_EXPIRED_TAX_LOSSES',
    label: 'Expired Tax Losses (> 5 Years under Section 30)',
    dataType: 'DECIMAL',
    required: false,
    source: 'LOSS_LEDGER',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_E'
  },
  {
    fieldCode: 'F604_E04_VALID_LOSSES_BROUGHT_FORWARD',
    label: 'Valid Losses Eligible for Relief',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_VALID_LOSSES',
      expression: 'MAX(0, PRIOR_UNABSORBED_LOSSES - EXPIRED_TAX_LOSSES)',
      description: 'Losses within the 5-year statutory carry forward window under Section 30',
      dependencies: ['F604_E02_PRIOR_UNABSORBED_LOSSES', 'F604_E03_EXPIRED_TAX_LOSSES']
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_E'
  },
  {
    fieldCode: 'F604_E05_LOSS_RELIEF_UTILIZED',
    label: 'Loss Relief Set Off in Current Tax Year',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_LOSS_UTILIZED',
      expression: 'MIN(MAX(0, ADJ_TAXABLE_PROFIT_BEFORE_LOSS), VALID_LOSSES_BROUGHT_FORWARD)',
      description: 'Prior tax loss deducted from current year taxable profit (up to available taxable profit)',
      dependencies: ['F604_E01_ADJ_TAXABLE_PROFIT_BEFORE_LOSS', 'F604_E04_VALID_LOSSES_BROUGHT_FORWARD']
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_E'
  },
  {
    fieldCode: 'F604_E06_CURRENT_YEAR_TAX_LOSS',
    label: 'Current Year Tax Loss',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_CURRENT_TAX_LOSS',
      expression: 'MAX(0, -ADJ_TAXABLE_PROFIT_BEFORE_LOSS)',
      description: 'Tax loss generated in current period eligible for carry forward to next 5 tax years',
      dependencies: ['F604_E01_ADJ_TAXABLE_PROFIT_BEFORE_LOSS']
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_E'
  },
  {
    fieldCode: 'F604_E07_REMAINING_UNABSORBED_LOSS_CF',
    label: 'Remaining Unabsorbed Tax Losses Carried Forward',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_LOSS_CARRIED_FORWARD',
      expression: 'VALID_LOSSES_BROUGHT_FORWARD - LOSS_RELIEF_UTILIZED + CURRENT_YEAR_TAX_LOSS',
      description: 'Total unabsorbed losses available for subsequent tax years',
      dependencies: ['F604_E04_VALID_LOSSES_BROUGHT_FORWARD', 'F604_E05_LOSS_RELIEF_UTILIZED', 'F604_E06_CURRENT_YEAR_TAX_LOSS']
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_E'
  },
  {
    fieldCode: 'F604_E08_NET_TAXABLE_INCOME',
    label: 'Final Taxable Income',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_NET_TAXABLE_INCOME',
      expression: 'MAX(0, ADJ_TAXABLE_PROFIT_BEFORE_LOSS - LOSS_RELIEF_UTILIZED)',
      description: 'Final net statutory taxable income on which tax brackets/rates are computed',
      dependencies: ['F604_E01_ADJ_TAXABLE_PROFIT_BEFORE_LOSS', 'F604_E05_LOSS_RELIEF_UTILIZED']
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_E'
  },

  // ==========================================================================
  // SECTION F: Tax Computation & Credits (Sections 15, 16, 50)
  // ==========================================================================
  {
    fieldCode: 'F604_F01_TAX_FREE_THRESHOLD',
    label: 'Applicable Tax-Free Threshold',
    dataType: 'DECIMAL',
    required: false,
    source: 'CALCULATED',
    applicability: 'COMPANY',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_F',
    description: 'Pro-rated tax-free threshold (MVR 500,000 * accountingDays/365 / groupFactor)'
  },
  {
    fieldCode: 'F604_F02_TAX_BRACKET_DETAILS',
    label: 'Tax Computation Bracket Breakdown',
    dataType: 'ARRAY',
    required: true,
    source: 'CALCULATED',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_F',
    description: 'Itemized bracket tier breakdown with rates and tax amounts'
  },
  {
    fieldCode: 'F604_F03_GROSS_TAX_LIABILITY',
    label: 'Total Gross Income Tax Liability',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_GROSS_TAX_LIABILITY',
      expression: 'CALCULATE_TAX_LIABILITY(NET_TAXABLE_INCOME, TAXPAYER_TYPE, TAX_YEAR, ACCOUNTING_DAYS, GROUP_FACTOR)',
      description: 'Computed tax liability before applying foreign tax and donation credits',
      dependencies: ['F604_E08_NET_TAXABLE_INCOME', 'F604_A03_TAXPAYER_TYPE', 'F604_A04_TAX_YEAR']
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_F'
  },
  {
    fieldCode: 'F604_F04_CREDIT_FOREIGN_TAX',
    label: 'Foreign Tax Credit (Section 50)',
    dataType: 'DECIMAL',
    required: false,
    source: 'USER_INPUT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_F'
  },
  {
    fieldCode: 'F604_F05_CREDIT_STATUTORY_DONATIONS',
    label: 'Statutory Approved Donation Credit (Section 50)',
    dataType: 'DECIMAL',
    required: false,
    source: 'USER_INPUT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_F'
  },
  {
    fieldCode: 'F604_F06_TOTAL_TAX_CREDITS',
    label: 'Total Allowable Tax Credits',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_TOTAL_TAX_CREDITS',
      expression: 'MIN(GROSS_TAX_LIABILITY, CREDIT_FOREIGN_TAX + CREDIT_STATUTORY_DONATIONS)',
      description: 'Total Section 50 tax credits capped at total gross tax liability',
      dependencies: ['F604_F03_GROSS_TAX_LIABILITY', 'F604_F04_CREDIT_FOREIGN_TAX', 'F604_F05_CREDIT_STATUTORY_DONATIONS']
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_F'
  },
  {
    fieldCode: 'F604_F07_NET_TAX_LIABILITY',
    label: 'Net Income Tax Liability After Credits',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_NET_TAX_LIABILITY',
      expression: 'GROSS_TAX_LIABILITY - TOTAL_TAX_CREDITS',
      description: 'Income tax payable after Section 50 statutory tax credits',
      dependencies: ['F604_F03_GROSS_TAX_LIABILITY', 'F604_F06_TOTAL_TAX_CREDITS']
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_F'
  },
  {
    fieldCode: 'F604_F08_EFFECTIVE_TAX_RATE',
    label: 'Effective Tax Rate (%)',
    dataType: 'DECIMAL',
    required: false,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_EFFECTIVE_TAX_RATE',
      expression: 'IF(NET_TAXABLE_INCOME > 0, (NET_TAX_LIABILITY / NET_TAXABLE_INCOME) * 100, 0)',
      description: 'Effective tax rate percentage',
      dependencies: ['F604_F07_NET_TAX_LIABILITY', 'F604_E08_NET_TAXABLE_INCOME']
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_F'
  },

  // ==========================================================================
  // SECTION G: Prepayments, Withholding & Final Settlement (Sections 54, 55, 70)
  // ==========================================================================
  {
    fieldCode: 'F604_G01_ADVANCE_TAX_PAID',
    label: 'Advance Tax Payments Paid',
    dataType: 'DECIMAL',
    required: false,
    source: 'PREPAYMENT_LEDGER',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_G'
  },
  {
    fieldCode: 'F604_G02_INTERIM_TAX_1_PAID',
    label: '1st Interim Tax Payment Paid (MIRA 603)',
    dataType: 'DECIMAL',
    required: false,
    source: 'PREPAYMENT_LEDGER',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_G'
  },
  {
    fieldCode: 'F604_G03_INTERIM_TAX_2_PAID',
    label: '2nd Interim Tax Payment Paid (MIRA 603)',
    dataType: 'DECIMAL',
    required: false,
    source: 'PREPAYMENT_LEDGER',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_G'
  },
  {
    fieldCode: 'F604_G04_EMPLOYEE_WHT_CREDIT',
    label: 'Employee Withholding Tax Deducted (Section 54)',
    dataType: 'DECIMAL',
    required: false,
    source: 'PREPAYMENT_LEDGER',
    applicability: 'INDIVIDUAL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_G'
  },
  {
    fieldCode: 'F604_G05_NON_RESIDENT_WHT_CREDIT',
    label: 'Non-Resident Withholding Tax Deducted at Source (Section 55)',
    dataType: 'DECIMAL',
    required: false,
    source: 'PREPAYMENT_LEDGER',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_G'
  },
  {
    fieldCode: 'F604_G06_OTHER_TAX_PAID_SOURCE',
    label: 'Other Tax Paid / Deducted at Source',
    dataType: 'DECIMAL',
    required: false,
    source: 'PREPAYMENT_LEDGER',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_G'
  },
  {
    fieldCode: 'F604_G07_TOTAL_PREPAYMENTS_AND_WHT',
    label: 'Total Prepayments & Tax Deducted at Source',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_TOTAL_PREPAYMENTS',
      expression: 'SUM(ADVANCE_TAX_PAID, INTERIM_TAX_1_PAID, INTERIM_TAX_2_PAID, EMPLOYEE_WHT_CREDIT, NON_RESIDENT_WHT_CREDIT, OTHER_TAX_PAID_SOURCE)',
      description: 'Sum of all prior payments and tax withheld at source for the tax year',
      dependencies: [
        'F604_G01_ADVANCE_TAX_PAID',
        'F604_G02_INTERIM_TAX_1_PAID',
        'F604_G03_INTERIM_TAX_2_PAID',
        'F604_G04_EMPLOYEE_WHT_CREDIT',
        'F604_G05_NON_RESIDENT_WHT_CREDIT',
        'F604_G06_OTHER_TAX_PAID_SOURCE'
      ]
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_G'
  },
  {
    fieldCode: 'F604_G08_NET_BALANCE_DUE_OR_REFUNDABLE',
    label: 'Net Tax Payable / (Refundable)',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_NET_BALANCE',
      expression: 'NET_TAX_LIABILITY - TOTAL_PREPAYMENTS_AND_WHT',
      description: 'Final balance due to MIRA (positive) or refundable from MIRA (negative)',
      dependencies: ['F604_F07_NET_TAX_LIABILITY', 'F604_G07_TOTAL_PREPAYMENTS_AND_WHT']
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_G'
  },
  {
    fieldCode: 'F604_G09_FINAL_TAX_PAYABLE',
    label: 'Final Tax Payable to MIRA',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_FINAL_TAX_PAYABLE',
      expression: 'MAX(0, NET_BALANCE_DUE_OR_REFUNDABLE)',
      description: 'Positive tax amount due to MIRA upon filing',
      dependencies: ['F604_G08_NET_BALANCE_DUE_OR_REFUNDABLE']
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_G'
  },
  {
    fieldCode: 'F604_G10_FINAL_REFUND_CLAIMABLE',
    label: 'Final Refund Claimable from MIRA',
    dataType: 'DECIMAL',
    required: true,
    source: 'CALCULATED',
    formula: {
      formulaId: 'FORMULA_FINAL_REFUND_CLAIMABLE',
      expression: 'MAX(0, -NET_BALANCE_DUE_OR_REFUNDABLE)',
      description: 'Refund claimable if advance payments and withholding exceed total tax liability',
      dependencies: ['F604_G08_NET_BALANCE_DUE_OR_REFUNDABLE']
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_G'
  },

  // ==========================================================================
  // SECTION H: Declaration & Verification Metadata
  // ==========================================================================
  {
    fieldCode: 'F604_H01_DECLARANT_NAME',
    label: 'Declarant Full Name',
    dataType: 'STRING',
    required: true,
    source: 'USER_INPUT',
    validation: {
      min: 2,
      max: 150
    },
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_H',
    description: 'Name of the authorized person signing the declaration'
  },
  {
    fieldCode: 'F604_H02_DECLARANT_DESIGNATION',
    label: 'Declarant Capacity / Designation',
    dataType: 'ENUM',
    required: true,
    source: 'USER_INPUT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_H',
    description: 'DIRECTOR, MANAGING_DIRECTOR, PARTNER, SOLE_PROPRIETOR, TRUSTEE, TAX_AGENT, AUTHORISED_OFFICER'
  },
  {
    fieldCode: 'F604_H03_DECLARANT_ID_PASSPORT',
    label: 'National ID / Passport Number',
    dataType: 'STRING',
    required: true,
    source: 'USER_INPUT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_H'
  },
  {
    fieldCode: 'F604_H04_DECLARATION_DATE',
    label: 'Declaration Date',
    dataType: 'DATE',
    required: true,
    source: 'USER_INPUT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_H'
  },
  {
    fieldCode: 'F604_H05_CONFIRMATION_ACCEPTED',
    label: 'True & Correct Declaration Confirmation',
    dataType: 'BOOLEAN',
    required: true,
    source: 'USER_INPUT',
    applicability: 'ALL',
    ruleVersion: 'v25.1',
    sectionId: 'SECTION_H',
    description: 'I declare that the information provided in this return and accompanying schedules is true, correct, and complete'
  }
];
