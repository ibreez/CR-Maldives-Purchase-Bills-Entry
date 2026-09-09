import { RegulatoryRule } from '../types';
import { MIRA_REGULATORY_SOURCES } from '../sources';

export const SEEDED_REGULATORY_RULES: RegulatoryRule[] = [
  // --------------------------------------------------------------------------
  // HISTORICAL GST RULES
  // --------------------------------------------------------------------------
  {
    ruleId: 'RULE-GST-GEN-HIST-6',
    taxType: 'GST',
    ruleCode: 'GST_GENERAL_RATE',
    description: 'Historical General Sector GST Rate (6%)',
    effectiveFrom: '2011-10-02',
    effectiveTo: '2022-12-31',
    taxYear: null,
    version: 'v20.1',
    legalReference: 'Goods and Services Tax Act Section 15(a)',
    sourceId: 'MIRA-SRC-001',
    sourceURL: MIRA_REGULATORY_SOURCES.GST_ACT.url,
    parameters: {
      rate: 0.06,
      ratePercentage: 6
    },
    status: 'SUPERSEDED',
    sector: 'GENERAL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-GST-HIST-01',
        name: 'General GST 2022 at 6%',
        description: 'Verify 6% statutory general GST rate before 2023 rate hike',
        input: { transactionDate: '2022-06-15', taxType: 'GST', sector: 'GENERAL', amount: 1000 },
        expected: { ruleId: 'RULE-GST-GEN-HIST-6', rate: 0.06, calculatedTax: 60 }
      }
    ]
  },
  {
    ruleId: 'RULE-GST-TOU-HIST-12',
    taxType: 'GST',
    ruleCode: 'GST_TOURISM_RATE',
    description: 'Historical Tourism Sector GST Rate (12%)',
    effectiveFrom: '2014-11-01',
    effectiveTo: '2022-12-31',
    taxYear: null,
    version: 'v20.1',
    legalReference: 'Goods and Services Tax Act Section 15(b)',
    sourceId: 'MIRA-SRC-001',
    sourceURL: MIRA_REGULATORY_SOURCES.GST_ACT.url,
    parameters: {
      rate: 0.12,
      ratePercentage: 12
    },
    status: 'SUPERSEDED',
    sector: 'TOURISM',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-GST-TOU-HIST-01',
        name: 'Tourism GST 2022 at 12%',
        description: 'Verify 12% statutory tourism GST rate before 2023 rate hike',
        input: { transactionDate: '2022-11-20', taxType: 'GST', sector: 'TOURISM', amount: 1000 },
        expected: { ruleId: 'RULE-GST-TOU-HIST-12', rate: 0.12, calculatedTax: 120 }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // CURRENT & EFFECTIVE GST RULES
  // --------------------------------------------------------------------------
  {
    ruleId: 'RULE-GST-GEN-8',
    taxType: 'GST',
    ruleCode: 'GST_GENERAL_RATE',
    description: 'Current General Sector GST Rate (8%)',
    effectiveFrom: '2023-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v23.1',
    legalReference: 'GST Act Amendment (Act No. 20/2022) Section 15(a)',
    sourceId: 'MIRA-SRC-002',
    sourceURL: MIRA_REGULATORY_SOURCES.GST_AMENDMENT_2022.url,
    parameters: {
      rate: 0.08,
      ratePercentage: 8
    },
    status: 'ACTIVE',
    sector: 'GENERAL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-GST-GEN-8-01',
        name: 'General GST 2023 at 8%',
        description: 'Verify 8% statutory general GST rate from 1 Jan 2023',
        input: { transactionDate: '2023-01-01', taxType: 'GST', sector: 'GENERAL', amount: 1000 },
        expected: { ruleId: 'RULE-GST-GEN-8', rate: 0.08, calculatedTax: 80 }
      },
      {
        testCaseId: 'TC-GST-GEN-8-02',
        name: 'General GST 2026 at 8%',
        description: 'Verify 8% statutory general GST rate remains active in 2026',
        input: { transactionDate: '2026-08-15', taxType: 'GST', sector: 'GENERAL', amount: 5000 },
        expected: { ruleId: 'RULE-GST-GEN-8', rate: 0.08, calculatedTax: 400 }
      }
    ]
  },
  {
    ruleId: 'RULE-GST-TOU-16',
    taxType: 'GST',
    ruleCode: 'GST_TOURISM_RATE',
    description: 'Tourism Sector GST Rate (16%) prior to 1 July 2025 increase',
    effectiveFrom: '2023-01-01',
    effectiveTo: '2025-06-30',
    taxYear: null,
    version: 'v23.1',
    legalReference: 'GST Act Amendment (Act No. 20/2022) Section 15(b)',
    sourceId: 'MIRA-SRC-002',
    sourceURL: MIRA_REGULATORY_SOURCES.GST_AMENDMENT_2022.url,
    parameters: {
      rate: 0.16,
      ratePercentage: 16
    },
    status: 'SUPERSEDED',
    sector: 'TOURISM',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-GST-TOU-16-01',
        name: 'Tourism GST 2024 at 16%',
        description: 'Verify 16% tourism GST rate for calendar year 2024',
        input: { transactionDate: '2024-05-10', taxType: 'GST', sector: 'TOURISM', amount: 1000 },
        expected: { ruleId: 'RULE-GST-TOU-16', rate: 0.16, calculatedTax: 160 }
      },
      {
        testCaseId: 'TC-GST-TOU-16-02',
        name: 'Tourism GST June 2025 at 16%',
        description: 'Verify 16% tourism GST rate on last effective day 2025-06-30',
        input: { transactionDate: '2025-06-30', taxType: 'GST', sector: 'TOURISM', amount: 2000 },
        expected: { ruleId: 'RULE-GST-TOU-16', rate: 0.16, calculatedTax: 320 }
      }
    ]
  },
  {
    ruleId: 'RULE-GST-TOU-17',
    taxType: 'GST',
    ruleCode: 'GST_TOURISM_RATE',
    description: 'Current Tourism Sector GST Rate (17%) effective 1 July 2025',
    effectiveFrom: '2025-07-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'GST Act Amendment (Act No. 12/2024) Section 15(b)',
    sourceId: 'MIRA-SRC-003',
    sourceURL: MIRA_REGULATORY_SOURCES.GST_AMENDMENT_2024.url,
    parameters: {
      rate: 0.17,
      ratePercentage: 17
    },
    status: 'ACTIVE',
    sector: 'TOURISM',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-GST-TOU-17-01',
        name: 'Tourism GST 1 July 2025 at 17%',
        description: 'Verify 17% tourism GST rate effective from 1 July 2025',
        input: { transactionDate: '2025-07-01', taxType: 'GST', sector: 'TOURISM', amount: 1000 },
        expected: { ruleId: 'RULE-GST-TOU-17', rate: 0.17, calculatedTax: 170 }
      },
      {
        testCaseId: 'TC-GST-TOU-17-02',
        name: 'Tourism GST 2026 at 17%',
        description: 'Verify 17% tourism GST rate remains effective in 2026',
        input: { transactionDate: '2026-08-15', taxType: 'GST', sector: 'TOURISM', amount: 3000 },
        expected: { ruleId: 'RULE-GST-TOU-17', rate: 0.17, calculatedTax: 510 }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // INCOME TAX - CORPORATE & ENTITY (SECTION 15)
  // --------------------------------------------------------------------------
  {
    ruleId: 'RULE-IT-COMPANY-500K',
    taxType: 'INCOME_TAX',
    ruleCode: 'INCOME_TAX_COMPANY_THRESHOLD',
    description: 'Company Tax Threshold MVR 500,000 at 0% and excess at 15%',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v24.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 15',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      standardThreshold: 500000,
      belowThresholdRate: 0.0,
      aboveThresholdRate: 0.15,
      aboveThresholdRatePercentage: 15
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'COMPANY',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-IT-CO-01',
        name: 'Company Tax 2024 Above Threshold',
        description: 'Verify 0% on first MVR 500,000 and 15% on excess MVR 100,000',
        input: { transactionDate: '2024-12-31', taxType: 'INCOME_TAX', taxpayerType: 'COMPANY', amount: 600000 },
        expected: { ruleId: 'RULE-IT-COMPANY-500K', threshold: 500000, calculatedTax: 15000 }
      },
      {
        testCaseId: 'TC-IT-CO-02',
        name: 'Company Tax 2026 Below Threshold',
        description: 'Verify 0% on MVR 400,000 profit below MVR 500,000 threshold',
        input: { transactionDate: '2026-12-31', taxType: 'INCOME_TAX', taxpayerType: 'COMPANY', amount: 400000 },
        expected: { ruleId: 'RULE-IT-COMPANY-500K', threshold: 500000, calculatedTax: 0 }
      }
    ]
  },
  {
    ruleId: 'RULE-IT-PARTNERSHIP-500K',
    taxType: 'INCOME_TAX',
    ruleCode: 'INCOME_TAX_COMPANY_THRESHOLD',
    description: 'Partnership Tax Threshold MVR 500,000 at 0% and excess at 15%',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v24.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 15',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      standardThreshold: 500000,
      belowThresholdRate: 0.0,
      aboveThresholdRate: 0.15,
      aboveThresholdRatePercentage: 15
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'PARTNERSHIP',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-IT-PART-01',
        name: 'Partnership Tax Threshold',
        input: { transactionDate: '2025-12-31', taxType: 'INCOME_TAX', taxpayerType: 'PARTNERSHIP', amount: 700000 },
        expected: { ruleId: 'RULE-IT-PARTNERSHIP-500K', threshold: 500000, calculatedTax: 30000 }
      }
    ]
  },
  {
    ruleId: 'RULE-IT-TRUST-500K',
    taxType: 'INCOME_TAX',
    ruleCode: 'INCOME_TAX_COMPANY_THRESHOLD',
    description: 'Trust Tax Threshold MVR 500,000 at 0% and excess at 15%',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v24.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 15',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      standardThreshold: 500000,
      belowThresholdRate: 0.0,
      aboveThresholdRate: 0.15,
      aboveThresholdRatePercentage: 15
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'TRUST',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-IT-TRUST-01',
        name: 'Trust Tax Threshold',
        input: { transactionDate: '2025-12-31', taxType: 'INCOME_TAX', taxpayerType: 'TRUST', amount: 500000 },
        expected: { ruleId: 'RULE-IT-TRUST-500K', threshold: 500000, calculatedTax: 0 }
      }
    ]
  },
  {
    ruleId: 'RULE-IT-BODY-OF-PERSONS-500K',
    taxType: 'INCOME_TAX',
    ruleCode: 'INCOME_TAX_COMPANY_THRESHOLD',
    description: 'Body of Persons Tax Threshold MVR 500,000 at 0% and excess at 15%',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v24.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 15',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      standardThreshold: 500000,
      belowThresholdRate: 0.0,
      aboveThresholdRate: 0.15,
      aboveThresholdRatePercentage: 15
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'BODY_OF_PERSONS',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-IT-BOP-01',
        name: 'Body of Persons Tax Threshold',
        input: { transactionDate: '2025-12-31', taxType: 'INCOME_TAX', taxpayerType: 'BODY_OF_PERSONS', amount: 800000 },
        expected: { ruleId: 'RULE-IT-BODY-OF-PERSONS-500K', threshold: 500000, calculatedTax: 45000 }
      }
    ]
  },
  {
    ruleId: 'RULE-IT-NON-RESIDENT-CO-500K',
    taxType: 'INCOME_TAX',
    ruleCode: 'INCOME_TAX_COMPANY_THRESHOLD',
    description: 'Non-Resident Company / Permanent Establishment Tax Threshold MVR 500,000 at 0% and excess at 15%',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v24.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 15',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      standardThreshold: 500000,
      belowThresholdRate: 0.0,
      aboveThresholdRate: 0.15,
      aboveThresholdRatePercentage: 15
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'NON_RESIDENT_COMPANY',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-IT-NRCO-01',
        name: 'Non-Resident Company Tax Threshold',
        input: { transactionDate: '2025-12-31', taxType: 'INCOME_TAX', taxpayerType: 'NON_RESIDENT_COMPANY', amount: 1000000 },
        expected: { ruleId: 'RULE-IT-NON-RESIDENT-CO-500K', threshold: 500000, calculatedTax: 75000 }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // INCOME TAX - LOSS RELIEF (SECTION 30)
  // --------------------------------------------------------------------------
  {
    ruleId: 'RULE-IT-LOSS-RELIEF-SEC30',
    taxType: 'INCOME_TAX',
    ruleCode: 'INCOME_TAX_LOSS_RELIEF',
    description: 'Section 30 Tax Loss Carry Forward Relief (Max 5 consecutive tax years, FIFO ordering)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 30',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      maxCarryForwardYears: 5,
      lossUtilizationCapPercentage: 100,
      ordering: 'FIFO'
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-IT-LOSS-01',
        name: 'Section 30 Loss Carryforward Parameters',
        input: { transactionDate: '2026-01-01', taxType: 'INCOME_TAX', ruleCode: 'INCOME_TAX_LOSS_RELIEF' },
        expected: { ruleId: 'RULE-IT-LOSS-RELIEF-SEC30' }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // INCOME TAX - INDIVIDUAL / SOLE PROPRIETOR
  // --------------------------------------------------------------------------
  {
    ruleId: 'RULE-IT-INDIVIDUAL-BRACKETS',
    taxType: 'INCOME_TAX',
    ruleCode: 'INCOME_TAX_INDIVIDUAL_BRACKETS',
    description: 'Individual Progressive Income Tax Brackets (0%, 5.5%, 8%, 12%, 15%)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v24.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 16',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      brackets: [
        {
          from: 0,
          to: 720000,
          rate: 0.00,
          ratePercentage: 0,
          description: 'Up to MVR 720,000 (0% Tax Free)'
        },
        {
          from: 720000,
          to: 1200000,
          rate: 0.055,
          ratePercentage: 5.5,
          description: 'MVR 720,001 to MVR 1,200,000 (5.5%)'
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
          to: null, // Unlimited upper bound
          rate: 0.15,
          ratePercentage: 15,
          description: 'Over MVR 2,400,000 (15%)'
        }
      ]
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'SOLE_PROPRIETOR',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-IT-IND-01',
        name: 'Individual Progressive Brackets 2024',
        input: { transactionDate: '2024-01-01', taxType: 'INCOME_TAX', taxpayerType: 'SOLE_PROPRIETOR' },
        expected: { ruleId: 'RULE-IT-INDIVIDUAL-BRACKETS' }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // NON-RESIDENT WITHHOLDING TAX (NWT - SECTION 55)
  // --------------------------------------------------------------------------
  {
    ruleId: 'RULE-NWT-SEC55-GENERAL-10',
    taxType: 'NWT',
    ruleCode: 'NWT_STANDARD_10',
    description: 'Non-Resident Withholding Tax Section 55(a) Standard Rate (10%)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v24.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 55(a)',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      rate: 0.10,
      ratePercentage: 10,
      applicableCategories: [
        'ROYALTY',
        'RENT_IMMOVABLE_PROPERTY',
        'QUALIFYING_INTEREST',
        'DIVIDEND',
        'TECHNICAL_SERVICES',
        'COMMISSION',
        'PUBLIC_ENTERTAINER',
        'RESEARCH_DEVELOPMENT',
        'INSURANCE_PREMIUM'
      ]
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-NWT-GEN-01',
        name: 'Standard NWT 10% on Services',
        input: { transactionDate: '2024-06-01', taxType: 'NWT', ruleCode: 'NWT_STANDARD_10', amount: 1000 },
        expected: { ruleId: 'RULE-NWT-SEC55-GENERAL-10', rate: 0.10, calculatedTax: 100 }
      }
    ]
  },
  {
    ruleId: 'RULE-NWT-SEC55-CONTRACTOR-5',
    taxType: 'NWT',
    ruleCode: 'NWT_CONTRACTOR_5',
    description: 'Non-Resident Withholding Tax Section 55(a) Contractor Rate (5%)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v24.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 55(a)',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      rate: 0.05,
      ratePercentage: 5,
      applicableCategories: [
        'NON_RESIDENT_CONTRACTOR'
      ]
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-NWT-CON-01',
        name: 'Contractor NWT 5%',
        input: { transactionDate: '2024-06-01', taxType: 'NWT', ruleCode: 'NWT_CONTRACTOR_5', amount: 1000 },
        expected: { ruleId: 'RULE-NWT-SEC55-CONTRACTOR-5', rate: 0.05, calculatedTax: 50 }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // CAPITAL ALLOWANCE - STATUTORY RATES (SECTION 18 & INCOME TAX REGULATION)
  // --------------------------------------------------------------------------
  {
    ruleId: 'RULE-CA-BUILDINGS-4',
    taxType: 'CAPITAL_ALLOWANCE',
    ruleCode: 'CA_RATE_BUILDINGS',
    description: 'Capital Allowance for Buildings & Structures (4% Straight-Line)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act Section 18 & Income Tax Regulation Schedule 2',
    sourceId: 'MIRA-SRC-005',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_REGULATION.url,
    parameters: {
      assetClass: 'BUILDINGS',
      assetClassLabel: 'Buildings',
      rate: 0.04,
      ratePercentage: 4,
      statutoryLifeYears: 25,
      method: 'STRAIGHT_LINE'
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-CA-BLDG-01',
        name: 'Buildings 4% Straight-Line',
        input: { transactionDate: '2024-01-01', taxType: 'CAPITAL_ALLOWANCE', ruleCode: 'CA_RATE_BUILDINGS' },
        expected: { ruleId: 'RULE-CA-BUILDINGS-4', rate: 0.04 }
      }
    ]
  },
  {
    ruleId: 'RULE-CA-AIRCRAFT-7',
    taxType: 'CAPITAL_ALLOWANCE',
    ruleCode: 'CA_RATE_AIRCRAFT',
    description: 'Capital Allowance for Aircraft (7% Straight-Line)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act Section 18 & Income Tax Regulation Schedule 2',
    sourceId: 'MIRA-SRC-005',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_REGULATION.url,
    parameters: {
      assetClass: 'AIRCRAFT',
      assetClassLabel: 'Aircraft',
      rate: 0.07,
      ratePercentage: 7,
      statutoryLifeYears: 14.28,
      method: 'STRAIGHT_LINE'
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-CA-AIR-01',
        name: 'Aircraft 7% Straight-Line',
        input: { transactionDate: '2024-01-01', taxType: 'CAPITAL_ALLOWANCE', ruleCode: 'CA_RATE_AIRCRAFT' },
        expected: { ruleId: 'RULE-CA-AIRCRAFT-7', rate: 0.07 }
      }
    ]
  },
  {
    ruleId: 'RULE-CA-VESSEL-WOOD-7',
    taxType: 'CAPITAL_ALLOWANCE',
    ruleCode: 'CA_RATE_WOODEN_VESSELS',
    description: 'Capital Allowance for Wooden Marine Vessels (7% Straight-Line)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act Section 18 & Income Tax Regulation Schedule 2',
    sourceId: 'MIRA-SRC-005',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_REGULATION.url,
    parameters: {
      assetClass: 'WOODEN_MARINE_VESSELS',
      assetClassLabel: 'Marine vessels (Wooden)',
      rate: 0.07,
      ratePercentage: 7,
      statutoryLifeYears: 14.28,
      method: 'STRAIGHT_LINE'
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-CA-WOOD-01',
        name: 'Wooden Marine Vessels 7%',
        input: { transactionDate: '2024-01-01', taxType: 'CAPITAL_ALLOWANCE', ruleCode: 'CA_RATE_WOODEN_VESSELS' },
        expected: { ruleId: 'RULE-CA-VESSEL-WOOD-7', rate: 0.07 }
      }
    ]
  },
  {
    ruleId: 'RULE-CA-VESSEL-OTHER-5',
    taxType: 'CAPITAL_ALLOWANCE',
    ruleCode: 'CA_RATE_OTHER_VESSELS',
    description: 'Capital Allowance for Other Marine Vessels (5% Straight-Line)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act Section 18 & Income Tax Regulation Schedule 2',
    sourceId: 'MIRA-SRC-005',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_REGULATION.url,
    parameters: {
      assetClass: 'OTHER_MARINE_VESSELS',
      assetClassLabel: 'Marine vessels (Other)',
      rate: 0.05,
      ratePercentage: 5,
      statutoryLifeYears: 20,
      method: 'STRAIGHT_LINE'
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-CA-VESSEL-01',
        name: 'Other Marine Vessels 5%',
        input: { transactionDate: '2024-01-01', taxType: 'CAPITAL_ALLOWANCE', ruleCode: 'CA_RATE_OTHER_VESSELS' },
        expected: { ruleId: 'RULE-CA-VESSEL-OTHER-5', rate: 0.05 }
      }
    ]
  },
  {
    ruleId: 'RULE-CA-FURNITURE-10',
    taxType: 'CAPITAL_ALLOWANCE',
    ruleCode: 'CA_RATE_FURNITURE',
    description: 'Capital Allowance for Furniture & Fittings (10% Straight-Line)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act Section 18 & Income Tax Regulation Schedule 2',
    sourceId: 'MIRA-SRC-005',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_REGULATION.url,
    parameters: {
      assetClass: 'FURNITURE_FITTINGS',
      assetClassLabel: 'Furniture & Fittings',
      rate: 0.10,
      ratePercentage: 10,
      statutoryLifeYears: 10,
      method: 'STRAIGHT_LINE'
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-CA-FURN-01',
        name: 'Furniture 10%',
        input: { transactionDate: '2024-01-01', taxType: 'CAPITAL_ALLOWANCE', ruleCode: 'CA_RATE_FURNITURE' },
        expected: { ruleId: 'RULE-CA-FURNITURE-10', rate: 0.10 }
      }
    ]
  },
  {
    ruleId: 'RULE-CA-VEHICLES-20',
    taxType: 'CAPITAL_ALLOWANCE',
    ruleCode: 'CA_RATE_MOTOR_VEHICLES',
    description: 'Capital Allowance for Motor Vehicles (20% Straight-Line)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act Section 18 & Income Tax Regulation Schedule 2',
    sourceId: 'MIRA-SRC-005',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_REGULATION.url,
    parameters: {
      assetClass: 'MOTOR_VEHICLES',
      assetClassLabel: 'Motor vehicles',
      rate: 0.20,
      ratePercentage: 20,
      statutoryLifeYears: 5,
      method: 'STRAIGHT_LINE'
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-CA-VEH-01',
        name: 'Motor Vehicles 20%',
        input: { transactionDate: '2024-01-01', taxType: 'CAPITAL_ALLOWANCE', ruleCode: 'CA_RATE_MOTOR_VEHICLES' },
        expected: { ruleId: 'RULE-CA-VEHICLES-20', rate: 0.20 }
      }
    ]
  },
  {
    ruleId: 'RULE-CA-EARTH-MOVING-20',
    taxType: 'CAPITAL_ALLOWANCE',
    ruleCode: 'CA_RATE_EARTH_MOVING',
    description: 'Capital Allowance for Earth Moving Vehicles (20% Straight-Line)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act Section 18 & Income Tax Regulation Schedule 2',
    sourceId: 'MIRA-SRC-005',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_REGULATION.url,
    parameters: {
      assetClass: 'EARTH_MOVING_VEHICLES',
      assetClassLabel: 'Earth moving vehicles',
      rate: 0.20,
      ratePercentage: 20,
      statutoryLifeYears: 5,
      method: 'STRAIGHT_LINE'
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-CA-EARTH-01',
        name: 'Earth Moving Vehicles 20%',
        input: { transactionDate: '2024-01-01', taxType: 'CAPITAL_ALLOWANCE', ruleCode: 'CA_RATE_EARTH_MOVING' },
        expected: { ruleId: 'RULE-CA-EARTH-MOVING-20', rate: 0.20 }
      }
    ]
  },
  {
    ruleId: 'RULE-CA-PLANT-MACHINERY-20',
    taxType: 'CAPITAL_ALLOWANCE',
    ruleCode: 'CA_RATE_PLANT_MACHINERY',
    description: 'Capital Allowance for Plant & Equipment / Machinery (20% Straight-Line)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act Section 18 & Income Tax Regulation Schedule 2',
    sourceId: 'MIRA-SRC-005',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_REGULATION.url,
    parameters: {
      assetClass: 'PLANT_EQUIPMENT',
      assetClassLabel: 'Plant & equipment / Machinery',
      rate: 0.20,
      ratePercentage: 20,
      statutoryLifeYears: 5,
      method: 'STRAIGHT_LINE'
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-CA-PLANT-01',
        name: 'Plant & Equipment 20%',
        input: { transactionDate: '2024-01-01', taxType: 'CAPITAL_ALLOWANCE', ruleCode: 'CA_RATE_PLANT_MACHINERY' },
        expected: { ruleId: 'RULE-CA-PLANT-MACHINERY-20', rate: 0.20 }
      }
    ]
  },
  {
    ruleId: 'RULE-CA-OFFICE-EQUIPMENT-20',
    taxType: 'CAPITAL_ALLOWANCE',
    ruleCode: 'CA_RATE_OFFICE_EQUIPMENT',
    description: 'Capital Allowance for Office Equipment (20% Straight-Line)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act Section 18 & Income Tax Regulation Schedule 2',
    sourceId: 'MIRA-SRC-005',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_REGULATION.url,
    parameters: {
      assetClass: 'OFFICE_EQUIPMENT',
      assetClassLabel: 'Office equipment',
      rate: 0.20,
      ratePercentage: 20,
      statutoryLifeYears: 5,
      method: 'STRAIGHT_LINE'
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-CA-OFFICE-01',
        name: 'Office Equipment 20%',
        input: { transactionDate: '2024-01-01', taxType: 'CAPITAL_ALLOWANCE', ruleCode: 'CA_RATE_OFFICE_EQUIPMENT' },
        expected: { ruleId: 'RULE-CA-OFFICE-EQUIPMENT-20', rate: 0.20 }
      }
    ]
  },
  {
    ruleId: 'RULE-CA-COMPUTERS-IT-33',
    taxType: 'CAPITAL_ALLOWANCE',
    ruleCode: 'CA_RATE_COMPUTERS_SOFTWARE',
    description: 'Capital Allowance for Computer Software & Hardware (33.33% Straight-Line)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act Section 18 & Income Tax Regulation Schedule 2',
    sourceId: 'MIRA-SRC-005',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_REGULATION.url,
    parameters: {
      assetClass: 'COMPUTER_SOFTWARE',
      assetClassLabel: 'Computer software & hardware',
      rate: 0.3333,
      ratePercentage: 33.33,
      statutoryLifeYears: 3,
      method: 'STRAIGHT_LINE'
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-CA-COMP-01',
        name: 'Computer Software & Hardware 33.33%',
        input: { transactionDate: '2024-01-01', taxType: 'CAPITAL_ALLOWANCE', ruleCode: 'CA_RATE_COMPUTERS_SOFTWARE' },
        expected: { ruleId: 'RULE-CA-COMPUTERS-IT-33', rate: 0.3333 }
      }
    ]
  },
  {
    ruleId: 'RULE-CA-LOOSE-TOOLS-33',
    taxType: 'CAPITAL_ALLOWANCE',
    ruleCode: 'CA_RATE_LOOSE_TOOLS',
    description: 'Capital Allowance for Loose Tools / Utensils / Crockery (33.33% Straight-Line)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act Section 18 & Income Tax Regulation Schedule 2',
    sourceId: 'MIRA-SRC-005',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_REGULATION.url,
    parameters: {
      assetClass: 'LOOSE_TOOLS_UTENSILS',
      assetClassLabel: 'Loose tools / Utensils / Crockery',
      rate: 0.3333,
      ratePercentage: 33.33,
      statutoryLifeYears: 3,
      method: 'STRAIGHT_LINE'
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-CA-TOOLS-01',
        name: 'Loose Tools 33.33%',
        input: { transactionDate: '2024-01-01', taxType: 'CAPITAL_ALLOWANCE', ruleCode: 'CA_RATE_LOOSE_TOOLS' },
        expected: { ruleId: 'RULE-CA-LOOSE-TOOLS-33', rate: 0.3333 }
      }
    ]
  },
  {
    ruleId: 'RULE-CA-LOW-VALUE-10K',
    taxType: 'CAPITAL_ALLOWANCE',
    ruleCode: 'CA_LOW_VALUE_THRESHOLD',
    description: 'Immediate 100% Write-off for Low-Value Assets (Cost <= MVR 10,000)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act Section 18(d) & Income Tax Regulation',
    sourceId: 'MIRA-SRC-005',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_REGULATION.url,
    parameters: {
      threshold: 10000,
      writeOffRate: 1.0,
      writeOffRatePercentage: 100
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-CA-LOWVAL-01',
        name: 'Low Value Immediate Write-off Threshold',
        input: { transactionDate: '2024-01-01', taxType: 'CAPITAL_ALLOWANCE', ruleCode: 'CA_LOW_VALUE_THRESHOLD' },
        expected: { ruleId: 'RULE-CA-LOW-VALUE-10K', threshold: 10000 }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // HISTORICAL CAPITAL ALLOWANCE RULES (PRE-2020 BUSINESS PROFIT TAX REGIME)
  // --------------------------------------------------------------------------
  {
    ruleId: 'RULE-CA-HIST-BUILDINGS-5',
    taxType: 'CAPITAL_ALLOWANCE',
    ruleCode: 'CA_RATE_BUILDINGS',
    description: 'Historical BPT Capital Allowance for Buildings (5% Straight-Line)',
    effectiveFrom: '2011-10-02',
    effectiveTo: '2019-12-31',
    taxYear: null,
    version: 'v20.1',
    legalReference: 'Business Profit Tax Act (Act No. 5/2011) Section 10 & BPT Regulation',
    sourceId: 'MIRA-SRC-001',
    sourceURL: 'https://www.mira.gov.mv/Legislations/View/Business-Profit-Tax-Act',
    parameters: {
      assetClass: 'BUILDINGS',
      assetClassLabel: 'Buildings',
      rate: 0.05,
      ratePercentage: 5,
      statutoryLifeYears: 20,
      method: 'STRAIGHT_LINE'
    },
    status: 'SUPERSEDED',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-CA-HIST-BLDG-01',
        name: 'Historical Buildings 5% BPT Rate',
        input: { transactionDate: '2018-05-01', taxType: 'CAPITAL_ALLOWANCE', ruleCode: 'CA_RATE_BUILDINGS' },
        expected: { ruleId: 'RULE-CA-HIST-BUILDINGS-5', rate: 0.05 }
      }
    ]
  },
  {
    ruleId: 'RULE-CA-HIST-PLANT-15',
    taxType: 'CAPITAL_ALLOWANCE',
    ruleCode: 'CA_RATE_PLANT_MACHINERY',
    description: 'Historical BPT Capital Allowance for Plant & Machinery (15% Straight-Line)',
    effectiveFrom: '2011-10-02',
    effectiveTo: '2019-12-31',
    taxYear: null,
    version: 'v20.1',
    legalReference: 'Business Profit Tax Act (Act No. 5/2011) Section 10 & BPT Regulation',
    sourceId: 'MIRA-SRC-001',
    sourceURL: 'https://www.mira.gov.mv/Legislations/View/Business-Profit-Tax-Act',
    parameters: {
      assetClass: 'PLANT_EQUIPMENT',
      assetClassLabel: 'Plant & equipment / Machinery',
      rate: 0.15,
      ratePercentage: 15,
      statutoryLifeYears: 6.67,
      method: 'STRAIGHT_LINE'
    },
    status: 'SUPERSEDED',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-CA-HIST-PLANT-01',
        name: 'Historical Plant 15% BPT Rate',
        input: { transactionDate: '2018-05-01', taxType: 'CAPITAL_ALLOWANCE', ruleCode: 'CA_RATE_PLANT_MACHINERY' },
        expected: { ruleId: 'RULE-CA-HIST-PLANT-15', rate: 0.15 }
      }
    ]
  },
  {
    ruleId: 'RULE-CA-HIST-VEHICLES-25',
    taxType: 'CAPITAL_ALLOWANCE',
    ruleCode: 'CA_RATE_MOTOR_VEHICLES',
    description: 'Historical BPT Capital Allowance for Motor Vehicles (25% Straight-Line)',
    effectiveFrom: '2011-10-02',
    effectiveTo: '2019-12-31',
    taxYear: null,
    version: 'v20.1',
    legalReference: 'Business Profit Tax Act (Act No. 5/2011) Section 10 & BPT Regulation',
    sourceId: 'MIRA-SRC-001',
    sourceURL: 'https://www.mira.gov.mv/Legislations/View/Business-Profit-Tax-Act',
    parameters: {
      assetClass: 'MOTOR_VEHICLES',
      assetClassLabel: 'Motor vehicles',
      rate: 0.25,
      ratePercentage: 25,
      statutoryLifeYears: 4,
      method: 'STRAIGHT_LINE'
    },
    status: 'SUPERSEDED',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-CA-HIST-VEH-01',
        name: 'Historical Vehicles 25% BPT Rate',
        input: { transactionDate: '2018-05-01', taxType: 'CAPITAL_ALLOWANCE', ruleCode: 'CA_RATE_MOTOR_VEHICLES' },
        expected: { ruleId: 'RULE-CA-HIST-VEHICLES-25', rate: 0.25 }
      }
    ]
  },

  // --------------------------------------------------------------------------
  // STATUTORY TAX ADJUSTMENT RULES (INCOME TAX ACT ACT NO. 25/2019 & REGULATIONS)
  // --------------------------------------------------------------------------
  {
    ruleId: 'RULE-ADJ-SEC18-DEPRECIATION',
    taxType: 'INCOME_TAX',
    ruleCode: 'ADJ_DEPRECIATION_ADDBACK',
    description: 'Accounting Depreciation & Amortization Add-back (Non-deductible under Section 11/18)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 11 & Section 18',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      adjustmentCode: 'ADJ-DEPR',
      category: 'DEPRECIATION_ADDBACK',
      direction: 'ADD_BACK',
      mira604Field: 'F604_C01_ADD_BOOK_DEPRECIATION',
      isStandardAddback: true
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-ADJ-DEPR-01',
        name: 'Depreciation Add-back',
        input: { transactionDate: '2024-01-01', taxType: 'INCOME_TAX', ruleCode: 'ADJ_DEPRECIATION_ADDBACK' },
        expected: { ruleId: 'RULE-ADJ-SEC18-DEPRECIATION' }
      }
    ]
  },
  {
    ruleId: 'RULE-ADJ-SEC20-NON-DEDUCTIBLE',
    taxType: 'INCOME_TAX',
    ruleCode: 'ADJ_NON_DEDUCTIBLE_EXPENDITURE',
    description: 'General Non-Deductible Expenditure not wholly & exclusively incurred for income generation',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 20',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      adjustmentCode: 'ADJ-NON-DEDUCTIBLE',
      category: 'NON_DEDUCTIBLE_EXPENDITURE',
      direction: 'ADD_BACK',
      mira604Field: 'F604_C07_ADD_OTHER_STATUTORY_ADDS',
      isStandardAddback: true
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-ADJ-NON-DED-01',
        name: 'Non-Deductible Add-back',
        input: { transactionDate: '2024-01-01', taxType: 'INCOME_TAX', ruleCode: 'ADJ_NON_DEDUCTIBLE_EXPENDITURE' },
        expected: { ruleId: 'RULE-ADJ-SEC20-NON-DEDUCTIBLE' }
      }
    ]
  },
  {
    ruleId: 'RULE-ADJ-SEC21-PRIVATE',
    taxType: 'INCOME_TAX',
    ruleCode: 'ADJ_PRIVATE_EXPENDITURE',
    description: 'Private, Personal and Domestic Expenses Add-back',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 21',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      adjustmentCode: 'ADJ-PRIVATE',
      category: 'PRIVATE_EXPENDITURE',
      direction: 'ADD_BACK',
      mira604Field: 'F604_C05_ADD_PERSONAL_DRAWINGS',
      isStandardAddback: true
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-ADJ-PRIV-01',
        name: 'Private Expenses Add-back',
        input: { transactionDate: '2024-01-01', taxType: 'INCOME_TAX', ruleCode: 'ADJ_PRIVATE_EXPENDITURE' },
        expected: { ruleId: 'RULE-ADJ-SEC21-PRIVATE' }
      }
    ]
  },
  {
    ruleId: 'RULE-ADJ-SEC22-FINES',
    taxType: 'INCOME_TAX',
    ruleCode: 'ADJ_FINES_PENALTIES',
    description: 'Statutory Fines, Penalties, Late Surcharges & Legal Sanctions Add-back',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 22',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      adjustmentCode: 'ADJ-FINES',
      category: 'FINES_PENALTIES',
      direction: 'ADD_BACK',
      mira604Field: 'F604_C02_ADD_FINES_PENALTIES',
      isStandardAddback: true
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-ADJ-FINES-01',
        name: 'Fines & Penalties Add-back',
        input: { transactionDate: '2024-01-01', taxType: 'INCOME_TAX', ruleCode: 'ADJ_FINES_PENALTIES' },
        expected: { ruleId: 'RULE-ADJ-SEC22-FINES' }
      }
    ]
  },
  {
    ruleId: 'RULE-ADJ-SEC23-CAPITAL',
    taxType: 'INCOME_TAX',
    ruleCode: 'ADJ_CAPITAL_EXPENDITURE',
    description: 'Capital Expenditure Incorrectly Charged as Revenue Expense Add-back',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 23',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      adjustmentCode: 'ADJ-CAPITAL',
      category: 'CAPITAL_EXPENDITURE',
      direction: 'ADD_BACK',
      mira604Field: 'F604_C07_ADD_OTHER_STATUTORY_ADDS',
      isStandardAddback: true
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-ADJ-CAP-01',
        name: 'Capital Expenditure Add-back',
        input: { transactionDate: '2024-01-01', taxType: 'INCOME_TAX', ruleCode: 'ADJ_CAPITAL_EXPENDITURE' },
        expected: { ruleId: 'RULE-ADJ-SEC23-CAPITAL' }
      }
    ]
  },
  {
    ruleId: 'RULE-ADJ-SEC24-RELATED',
    taxType: 'INCOME_TAX',
    ruleCode: 'ADJ_RELATED_PARTY_EXCESS',
    description: 'Non-Arm’s Length Related Party Excess Expenditure Add-back',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 24 & Section 68 (Transfer Pricing)',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      adjustmentCode: 'ADJ-RELATED',
      category: 'RELATED_PARTY_EXCESS',
      direction: 'ADD_BACK',
      mira604Field: 'F604_C07_ADD_OTHER_STATUTORY_ADDS',
      isStandardAddback: true
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-ADJ-REL-01',
        name: 'Related Party Excess Add-back',
        input: { transactionDate: '2024-01-01', taxType: 'INCOME_TAX', ruleCode: 'ADJ_RELATED_PARTY_EXCESS' },
        expected: { ruleId: 'RULE-ADJ-SEC24-RELATED' }
      }
    ]
  },
  {
    ruleId: 'RULE-ADJ-SEC25-PROVISIONS',
    taxType: 'INCOME_TAX',
    ruleCode: 'ADJ_GENERAL_PROVISIONS',
    description: 'General Contingent Provisions & General Bad Debt Reserves Add-back',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 25 & Section 11',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      adjustmentCode: 'ADJ-PROVISIONS',
      category: 'GENERAL_PROVISIONS',
      direction: 'ADD_BACK',
      mira604Field: 'F604_C06_ADD_GENERAL_PROVISIONS',
      isStandardAddback: true
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-ADJ-PROV-01',
        name: 'General Provisions Add-back',
        input: { transactionDate: '2024-01-01', taxType: 'INCOME_TAX', ruleCode: 'ADJ_GENERAL_PROVISIONS' },
        expected: { ruleId: 'RULE-ADJ-SEC25-PROVISIONS' }
      }
    ]
  },
  {
    ruleId: 'RULE-ADJ-SEC26-OWNER',
    taxType: 'INCOME_TAX',
    ruleCode: 'ADJ_OWNER_DRAWINGS',
    description: 'Excess Owner / Partner Drawings and Non-Approved Remuneration Add-back',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 26 & Section 21',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      adjustmentCode: 'ADJ-OWNER',
      category: 'OWNER_DRAWINGS',
      direction: 'ADD_BACK',
      mira604Field: 'F604_C05_ADD_PERSONAL_DRAWINGS',
      isStandardAddback: true
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-ADJ-OWN-01',
        name: 'Owner Drawings Add-back',
        input: { transactionDate: '2024-01-01', taxType: 'INCOME_TAX', ruleCode: 'ADJ_OWNER_DRAWINGS' },
        expected: { ruleId: 'RULE-ADJ-SEC26-OWNER' }
      }
    ]
  },
  {
    ruleId: 'RULE-ADJ-SEC12-DONATIONS',
    taxType: 'INCOME_TAX',
    ruleCode: 'ADJ_APPROVED_DONATIONS',
    description: 'Approved Statutory Charitable & Government Donations (Allowable Deduction)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 12',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      adjustmentCode: 'ADJ-DONATION',
      category: 'APPROVED_DONATIONS',
      direction: 'DEDUCTION',
      mira604Field: 'F604_C11_DED_OTHER_STATUTORY_DEDS',
      isStandardAddback: false
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-ADJ-DON-01',
        name: 'Approved Donations Deduction',
        input: { transactionDate: '2024-01-01', taxType: 'INCOME_TAX', ruleCode: 'ADJ_APPROVED_DONATIONS' },
        expected: { ruleId: 'RULE-ADJ-SEC12-DONATIONS' }
      }
    ]
  },
  {
    ruleId: 'RULE-ADJ-SEC11-BAD-DEBTS',
    taxType: 'INCOME_TAX',
    ruleCode: 'ADJ_SPECIFIC_BAD_DEBTS',
    description: 'Specific Bad Debts Incurred & Written Off (Allowable Deduction under Section 11)',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 11(a)(5)',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      adjustmentCode: 'ADJ-BAD-DEBTS',
      category: 'SPECIFIC_BAD_DEBTS',
      direction: 'DEDUCTION',
      mira604Field: 'F604_C10_DED_SPECIFIC_BAD_DEBTS',
      isStandardAddback: false
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-ADJ-BAD-01',
        name: 'Specific Bad Debts Deduction',
        input: { transactionDate: '2024-01-01', taxType: 'INCOME_TAX', ruleCode: 'ADJ_SPECIFIC_BAD_DEBTS' },
        expected: { ruleId: 'RULE-ADJ-SEC11-BAD-DEBTS' }
      }
    ]
  },
  {
    ruleId: 'RULE-ADJ-SEC10-EXEMPT',
    taxType: 'INCOME_TAX',
    ruleCode: 'ADJ_TAX_EXEMPT_INCOME',
    description: 'Statutory Tax-Exempt Income & Foreign Source Exclusion Deduction',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 10 & Section 13',
    sourceId: 'MIRA-SRC-004',
    sourceURL: MIRA_REGULATORY_SOURCES.INCOME_TAX_ACT.url,
    parameters: {
      adjustmentCode: 'ADJ-EXEMPT',
      category: 'TAX_EXEMPT_INCOME',
      direction: 'DEDUCTION',
      mira604Field: 'F604_C09_DED_EXEMPT_INCOME',
      isStandardAddback: false
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-ADJ-EXEMPT-01',
        name: 'Tax-Exempt Income Deduction',
        input: { transactionDate: '2024-01-01', taxType: 'INCOME_TAX', ruleCode: 'ADJ_TAX_EXEMPT_INCOME' },
        expected: { ruleId: 'RULE-ADJ-SEC10-EXEMPT' }
      }
    ]
  },
  {
    ruleId: 'RULE-FX-MMA-SEC31',
    taxType: 'INCOME_TAX',
    ruleCode: 'FX_CURRENCY_CONVERSION',
    description: 'Foreign Currency Conversion & Historical Rate Locking under Section 31',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Income Tax Act (Act No. 25/2019) Section 31 & Income Tax Regulation Section 38',
    sourceId: 'MIRA-SRC-007',
    sourceURL: MIRA_REGULATORY_SOURCES.MMA_FX_REGULATION.url,
    parameters: {
      functionalCurrency: 'MVR',
      allowRetroactiveRevaluation: false,
      mmaOfficialUsdPegRate: 15.42,
      requireRateApproval: true,
      unrealisedGainMIRAField: 'F604_C09_DED_EXEMPT_INCOME',
      unrealisedLossMIRAField: 'F604_C07_ADD_OTHER_STATUTORY_ADDS'
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-FX-01',
        name: 'Section 31 FX Conversion Parameters',
        input: { transactionDate: '2024-01-01', taxType: 'INCOME_TAX', ruleCode: 'FX_CURRENCY_CONVERSION' },
        expected: { ruleId: 'RULE-FX-MMA-SEC31' }
      }
    ]
  },
  {
    ruleId: 'RULE-RECONCILIATION-FRAMEWORK',
    taxType: 'OTHER',
    ruleCode: 'CROSS_MODULE_RECONCILIATION',
    description: 'Mandatory Cross-Module Reconciliation Engine across GL, GST, NWT, Assets, P&L, Tax Calculations, and Schedules 2-5',
    effectiveFrom: '2020-01-01',
    effectiveTo: null,
    taxYear: null,
    version: 'v25.1',
    legalReference: 'Tax Administration Act (Act No. 3/2010) Section 27, 38 & Income Tax Act',
    sourceId: 'MIRA-SRC-008',
    sourceURL: MIRA_REGULATORY_SOURCES.MIRA_RECONCILIATION_FRAMEWORK.url,
    parameters: {
      defaultTolerance: 0.05,
      defaultWarningThreshold: 1.00,
      enforceUnderlyingTransactionTracing: true,
      supportedModules: [
        'GL_GST',
        'GL_NWT',
        'AP_NWT',
        'FIXED_ASSETS_GL',
        'TAX_ASSETS_FIXED_ASSETS',
        'PNL_INCOME_TAX',
        'TAX_ADJUSTMENTS_TAX_CALC',
        'MIRA604_TAX_ENGINE',
        'SCHEDULE2_BALANCE_SHEET',
        'SCHEDULE3_NET_WORTH',
        'SCHEDULE4_RELATED_PARTY',
        'SCHEDULE5_CFE'
      ]
    },
    status: 'ACTIVE',
    sector: 'ALL',
    taxpayerType: 'ALL',
    jurisdiction: 'MV',
    testCases: [
      {
        testCaseId: 'TC-RECON-01',
        name: 'Reconciliation Engine Parameters',
        input: { transactionDate: '2024-01-01', taxType: 'OTHER', ruleCode: 'CROSS_MODULE_RECONCILIATION' },
        expected: { ruleId: 'RULE-RECONCILIATION-FRAMEWORK' }
      }
    ]
  }
];
