import { RegulatorySource } from '../types';

export const MIRA_REGULATORY_SOURCES: Record<string, RegulatorySource> = {
  GST_ACT: {
    sourceId: 'MIRA-SRC-001',
    title: 'Goods and Services Tax Act (Act No. 10/2011 consolidated)',
    legislation: 'Goods and Services Tax Act',
    section: 'Section 15',
    url: 'https://www.mira.gov.mv/Legislations/View/Goods-And-Services-Act-consolidated',
    effectiveDate: '2011-10-02',
    verifiedOn: '2026-08-13',
    notes: 'Primary authority for General and Tourism sector GST rates and input tax claims.'
  },
  GST_AMENDMENT_2022: {
    sourceId: 'MIRA-SRC-002',
    title: 'Goods and Services Tax Act Amendment (Act No. 20/2022)',
    legislation: 'GST Act Amendment 2022',
    section: 'Section 15(a) & 15(b)',
    url: 'https://www.mira.gov.mv/Legislations/View/Goods-And-Services-Act-consolidated',
    effectiveDate: '2023-01-01',
    verifiedOn: '2026-08-13',
    notes: 'Increased General GST to 8% and Tourism GST to 16% effective 1 January 2023.'
  },
  GST_AMENDMENT_2024: {
    sourceId: 'MIRA-SRC-003',
    title: 'Goods and Services Tax Act Amendment (Act No. 12/2024)',
    legislation: 'GST Act Amendment 2024',
    section: 'Section 15(b)',
    url: 'https://www.mira.gov.mv/Legislations/View/Goods-And-Services-Act-consolidated',
    effectiveDate: '2025-07-01',
    verifiedOn: '2026-08-13',
    notes: 'Increased Tourism GST rate from 16% to 17% effective 1 July 2025.'
  },
  INCOME_TAX_ACT: {
    sourceId: 'MIRA-SRC-004',
    title: 'Income Tax Act (Act No. 25/2019)',
    legislation: 'Income Tax Act',
    section: 'Sections 15, 16, 18, 30, 55, 83',
    url: 'https://www.mira.gov.mv/Legislations/View/Incometaxact',
    effectiveDate: '2020-01-01',
    verifiedOn: '2026-08-13',
    notes: 'Primary authority for Corporate Income Tax, Individual Income Tax, Loss Relief, NWT, and Capital Allowance.'
  },
  INCOME_TAX_REGULATION: {
    sourceId: 'MIRA-SRC-005',
    title: 'Income Tax Regulation (Regulation No. 2020/R-21 consolidated)',
    legislation: 'Income Tax Regulation',
    section: 'Part 2 & Schedule 2',
    url: 'https://www.mira.gov.mv/Legislations/View/Income-Tax-Regulation',
    effectiveDate: '2020-01-26',
    verifiedOn: '2026-08-13',
    notes: 'Consolidated regulation detailing MIRA 604 filing, tax adjustment codes, and asset depreciation rates.'
  },
  MIRA_604_V25_1_GUIDE: {
    sourceId: 'MIRA-SRC-006',
    title: 'MIRA 604 Income Tax Return Form v25.1 Specification',
    legislation: 'Income Tax Regulation',
    section: 'Form MIRA 604 v25.1',
    url: 'https://www.mira.gov.mv/Forms/View/mira-604-v25.1',
    effectiveDate: '2024-01-01',
    verifiedOn: '2026-08-13',
    notes: 'Authoritative return definition for tax years 2024 onward.'
  },
  MMA_FX_REGULATION: {
    sourceId: 'MIRA-SRC-007',
    title: 'Maldives Monetary Authority & Income Tax Act Foreign Currency Conversion Framework',
    legislation: 'Income Tax Act & MMA Act',
    section: 'Income Tax Act Section 31 & Income Tax Regulation Section 38',
    url: 'https://www.mma.gov.mv/daily-exchange-rates',
    effectiveDate: '2020-01-01',
    verifiedOn: '2026-08-25',
    notes: 'Authoritative requirement for MVR presentation currency, historical transaction rate locking, and official MMA daily reference rates.'
  },
  MIRA_RECONCILIATION_FRAMEWORK: {
    sourceId: 'MIRA-SRC-008',
    title: 'Maldives Tax Administration Act & Cross-Module Reconciliation Audit Framework',
    legislation: 'Tax Administration Act (Act No. 3/2010), Income Tax Act, and GST Act',
    section: 'Sections 27, 38 & Cross-Return Audit Compliance',
    url: 'https://www.mira.gov.mv/Tax-Administration-Act',
    effectiveDate: '2020-01-01',
    verifiedOn: '2026-08-25',
    notes: 'Authoritative statutory standard for cross-module reconciliation between GL, GST, NWT/WHT, Fixed Assets, P&L, Tax Adjustments, MIRA 604, and Schedules 2-5.'
  }
};
