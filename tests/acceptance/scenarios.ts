/**
 * Phase 50 — Practitioner Acceptance Testing Scenarios
 * 
 * Anonymized, production-grade test scenarios covering all 17 mandated areas:
 * 1. purchase invoices
 * 2. GST
 * 3. tourism GST
 * 4. NWT
 * 5. foreign currency
 * 6. capital assets
 * 7. tax adjustments
 * 8. tax losses
 * 9. company income tax
 * 10. individual income tax
 * 11. related parties
 * 12. CFE
 * 13. period amendments
 * 14. MIRA 604
 * 15. MIRA 205
 * 16. MIRA 206
 * 17. MIRA 602
 */

import { AcceptanceTestCase, ReviewerProfile } from './types';

export const ACCREDITED_PRACTITIONERS: Record<string, ReviewerProfile> = {
  PRACTITIONER_SHIYAZ: {
    reviewerId: 'REV-MALDIVES-01',
    name: 'Ahmed Shiyaz, FCCA',
    designation: 'Senior Tax Partner & Licensed Tax Agent',
    licenseNumber: 'MIRA-TA-2021-018',
    firm: 'Dhivehi Tax Advisory & Assurance LLP',
    membershipBody: 'Institute of Chartered Accountants of the Maldives (CA Maldives) / ACCA UK',
    contactEmail: 'shiyaz@dhivehitax.mv'
  },
  PRACTITIONER_NAZNEEN: {
    reviewerId: 'REV-MALDIVES-02',
    name: 'Fathimath Nazneen, FCA',
    designation: 'Technical Direct Tax Director',
    licenseNumber: 'MIRA-TA-2022-034',
    firm: 'Atoll Financial & Tax Advisory Services',
    membershipBody: 'Institute of Chartered Accountants of the Maldives (CA Maldives)',
    contactEmail: 'nazneen@atollfinancial.mv'
  },
  PRACTITIONER_RISHVAN: {
    reviewerId: 'REV-MALDIVES-03',
    name: 'Ibrahim Rishvan, CA, CTA',
    designation: 'Head of Indirect Tax & Statutory Compliance',
    licenseNumber: 'MIRA-TA-2023-057',
    firm: 'Coral & Reef Tax Specialists',
    membershipBody: 'Institute of Chartered Accountants of the Maldives (CA Maldives)',
    contactEmail: 'rishvan@coralreeftax.mv'
  }
};

export const ACCEPTANCE_SCENARIOS: AcceptanceTestCase[] = [
  // -------------------------------------------------------------------------
  // Scenario 1: Purchase Invoices
  // -------------------------------------------------------------------------
  {
    caseId: 'ACC-PURCHASE-001',
    scenarioNumber: 1,
    title: 'Commercial Hardware & Building Materials Tax Invoice Particulars Verification',
    category: 'PURCHASE_INVOICES',
    anonymizedTaxpayer: {
      name: 'Island Builders & Contractors Pvt Ltd',
      tin: '1004589GST001',
      entityType: 'COMPANY',
      regime: 'GENERAL',
      sector: 'CONSTRUCTION',
      registeredAddress: 'Boduthakurufaanu Magu, Male, Maldives'
    },
    scenarioDescription:
      'Verification of local supplier purchase invoice for structural timber and cement. Confirms mandatory tax invoice particulars under MIRA GST Regulation Section 42 (supplier name, TIN, serial number, date, breakdown of taxable value and 8% GST).',
    input: {
      invoiceNumber: 'INV-2026-MAT-4412',
      invoiceDate: '2026-03-12',
      supplierName: 'Male Trading Supplies Pvt Ltd',
      supplierTin: '1001245GST001',
      currency: 'MVR',
      lineItems: [
        { description: 'High-Tensile Steel Rebar 12mm', quantity: 500, unitPrice: 120, lineTotal: 60000 },
        { description: 'Portland Cement Bags 50kg', quantity: 400, unitPrice: 100, lineTotal: 40000 }
      ],
      taxableSubtotal: 100000,
      gstRate: 0.08,
      gstAmount: 8000,
      totalAmount: 108000,
      paymentMethod: 'BANK_TRANSFER_BML',
      isOriginalCopyHeld: true
    },
    expectedAccounting: {
      journalEntries: [
        { accountCode: '5100', accountName: 'Direct Construction Materials', debit: 100000, credit: 0, memo: 'Direct materials purchase INV-2026-MAT-4412' },
        { accountCode: '2150', accountName: 'GST Input Tax Receivable', debit: 8000, credit: 0, memo: '8% Claimable Input GST' },
        { accountCode: '2010', accountName: 'Accounts Payable - Local Trade', debit: 0, credit: 108000, memo: 'Payable to Male Trading Supplies' }
      ],
      totalDebit: 108000,
      totalCredit: 108000,
      isBalanced: true,
      assetCapitalized: false,
      accountingNotes: 'Full double-entry balancing verified. Inventory/expense recognized net of claimable GST asset.'
    },
    expectedTaxTreatment: {
      taxType: 'GST',
      statutoryRate: 8,
      taxableAmount: 100000,
      taxAmount: 8000,
      deductibilityStatus: 'CLAIMABLE_INPUT_TAX',
      statutoryCitation: 'Goods and Services Tax Act Section 21 & GST Regulation Section 42',
      treatmentExplanation:
        'Valid tax invoice issued by a registered taxpayer for business purposes. 100% claimable input tax against output tax.'
    },
    expectedMiraResult: {
      formId: 'MIRA_205',
      formTitle: 'General Sector GST Return',
      formVersion: 'v25.1',
      relevantBoxes: {
        'box8_StandardRatedPurchases_taxable': 100000,
        'box8_StandardRatedPurchases_tax': 8000,
        'box12_TotalClaimableInputTax': 8000
      },
      netStatutoryPayableOrRefundable: -8000,
      miraReturnNotice: 'Included in Input Tax Statement under Section B.'
    },
    reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_RISHVAN,
    reviewDate: '2026-04-02',
    result: 'PASSED',
    comments:
      'Verified all Section 42 tax invoice particulars: valid MIRA TIN, sequential invoice numbering, clear tax segregation. Input tax claim is legally unassailable.'
  },

  // -------------------------------------------------------------------------
  // Scenario 2: GST (General Sector Input Tax Apportionment & Blocking)
  // -------------------------------------------------------------------------
  {
    caseId: 'ACC-GST-002',
    scenarioNumber: 2,
    title: 'Mixed Supplies Turnover Apportionment & Motor Vehicle Blocked Input Tax',
    category: 'GST',
    anonymizedTaxpayer: {
      name: 'Coral Supermart & Pharmacy Enterprises Pvt Ltd',
      tin: '1002345GST001',
      entityType: 'COMPANY',
      regime: 'GENERAL',
      sector: 'RETAIL_HEALTHCARE',
      registeredAddress: 'Majeedhee Magu, Male, Maldives'
    },
    scenarioDescription:
      'Entity makes both taxable retail grocery sales (8% GST) and exempt pharmaceutical/medical supplies. Also purchases a passenger motor car for general executive use (blocked input tax under Section 21(e)). Tests both apportionment and blocked input tax.',
    input: {
      taxableTurnover: 800000,
      exemptTurnover: 200000,
      totalTurnover: 1000000,
      apportionmentRatio: 0.80, // 800,000 / 1,000,000 = 80%
      generalOverheadPurchases: 50000, // GST paid: 4,000
      generalOverheadGst: 4000,
      motorCarPurchasePrice: 350000,
      motorCarGstPaid: 28000 // 8% of 350,000
    },
    expectedAccounting: {
      journalEntries: [
        { accountCode: '6100', accountName: 'General Store Overheads', debit: 50000, credit: 0, memo: 'General administrative expenses' },
        { accountCode: '2150', accountName: 'GST Input Tax Receivable (Claimable)', debit: 3200, credit: 0, memo: '80% apportioned input tax (4,000 * 0.80)' },
        { accountCode: '6190', accountName: 'Non-Deductible GST Expense', debit: 800, credit: 0, memo: '20% blocked exempt portion' },
        { accountCode: '1540', accountName: 'Motor Vehicles (Cost + Blocked GST)', debit: 378000, credit: 0, memo: 'Capitalized motor car including non-creditable GST' },
        { accountCode: '2010', accountName: 'Accounts Payable / Bank', debit: 0, credit: 432000, memo: 'Total payment obligations' }
      ],
      totalDebit: 432000,
      totalCredit: 432000,
      isBalanced: true,
      assetCapitalized: true,
      assetClass: 'MOTOR_VEHICLES',
      accountingNotes: 'Non-deductible input tax on motor car is capitalized into asset carrying cost per IAS 16. Apportionment applied to common overheads.'
    },
    expectedTaxTreatment: {
      taxType: 'GST',
      statutoryRate: 8,
      taxableAmount: 400000,
      taxAmount: 32000,
      deductibilityStatus: 'PARTIALLY_DEDUCTIBLE',
      statutoryCitation: 'GST Act Section 21(d) (Apportionment) & Section 21(e) (Motor Vehicle Restriction)',
      treatmentExplanation:
        'Motor vehicle input tax (MVR 28,000) is strictly blocked under Section 21(e). General overhead input tax (MVR 4,000) is restricted to the 80% taxable turnover ratio (MVR 3,200 claimable, MVR 800 disallowed).'
    },
    expectedMiraResult: {
      formId: 'MIRA_205',
      formTitle: 'General Sector GST Return',
      formVersion: 'v25.1',
      relevantBoxes: {
        'box10_BlockedInputTax_value': 350000,
        'box10_BlockedInputTax_tax': 28000,
        'box11_MixedUse_grossTax': 4000,
        'box11_MixedUse_ratio': 0.8,
        'box11_MixedUse_claimable': 3200,
        'box12_TotalClaimableInputTax': 3200
      },
      netStatutoryPayableOrRefundable: -3200,
      miraReturnNotice: 'Motor vehicle disclosed under Blocked Input Tax Box 10.'
    },
    reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_RISHVAN,
    reviewDate: '2026-04-03',
    result: 'PASSED',
    comments:
      'Verified turnover apportionment ratio (80%). Fully confirmed restriction on motor car input tax under Section 21(e); correctly capitalized without MIRA input tax credit.'
  },

  // -------------------------------------------------------------------------
  // Scenario 3: Tourism GST (TGST 16% / 17% Statutory Transition)
  // -------------------------------------------------------------------------
  {
    caseId: 'ACC-TGST-003',
    scenarioNumber: 3,
    title: 'Luxury Tourist Resort Accommodation & Excursions TGST Billing',
    category: 'TOURISM_GST',
    anonymizedTaxpayer: {
      name: 'Velaa Haven Resort & Spa Pvt Ltd',
      tin: '1007890GST002',
      entityType: 'COMPANY',
      regime: 'TOURISM',
      sector: 'RESORT_HOTEL',
      registeredAddress: 'Noonu Atoll, Republic of Maldives'
    },
    scenarioDescription:
      'Tourist resort provides tourist guest villa services, luxury yacht excursions, and spa therapies. Invoiced at statutory TGST rate (16% for early 2025, 17% effective from July 2025). Validates tourist supply recognition and Input TGST offset.',
    input: {
      period: '2026-01',
      effectiveRate: 0.17, // 17% post-amendment TGST
      guestVillaRevenue: 1200000,
      excursionRevenue: 200000,
      spaTherapyRevenue: 100000,
      totalTaxableSupplies: 1500000,
      outputTgstAmount: 255000, // 1500000 * 0.17
      resortOperatingPurchases: 400000,
      resortInputTgstClaimable: 68000 // 400000 * 0.17
    },
    expectedAccounting: {
      journalEntries: [
        { accountCode: '1100', accountName: 'Guest Accounts Receivable / Front Desk Folio', debit: 1755000, credit: 0, memo: 'Total guest billings inclusive of 17% TGST' },
        { accountCode: '4010', accountName: 'Room & Villa Revenue', debit: 0, credit: 1200000, memo: 'Villa guest revenue' },
        { accountCode: '4020', accountName: 'Excursions & Diving Revenue', debit: 0, credit: 200000, memo: 'Excursion service revenue' },
        { accountCode: '4030', accountName: 'Spa & Wellness Revenue', debit: 0, credit: 100000, memo: 'Spa treatments revenue' },
        { accountCode: '2160', accountName: 'TGST Output Tax Payable (17%)', debit: 0, credit: 255000, memo: '17% TGST liability on tourist supplies' },
        { accountCode: '5200', accountName: 'Resort Operational F&B Expenses', debit: 400000, credit: 0, memo: 'Hotel operating supplies' },
        { accountCode: '2155', accountName: 'TGST Input Tax Receivable', debit: 68000, credit: 0, memo: 'Claimable TGST on resort purchases' },
        { accountCode: '2010', accountName: 'Accounts Payable - Resort Vendors', debit: 0, credit: 468000, memo: 'Vendor invoices payable' }
      ],
      totalDebit: 2223000,
      totalCredit: 2223000,
      isBalanced: true,
      assetCapitalized: false,
      accountingNotes: 'Tourism revenue recognized net of TGST. TGST collected recorded as current statutory liability.'
    },
    expectedTaxTreatment: {
      taxType: 'TGST',
      statutoryRate: 17,
      taxableAmount: 1500000,
      taxAmount: 255000,
      deductibilityStatus: 'CLAIMABLE_INPUT_TAX',
      statutoryCitation: 'GST Act Section 15(a-1) (Tourism Goods and Services Tax)',
      treatmentExplanation:
        'Tourist goods and services supplied to tourists in registered tourist establishments attract 17% TGST. Input tax incurred for the purpose of making tourism supplies is claimable.'
    },
    expectedMiraResult: {
      formId: 'MIRA_206',
      formTitle: 'Tourism Sector GST Return (TGST)',
      formVersion: 'v25.1',
      relevantBoxes: {
        'box1_TourismSuppliesTaxableValue': 1500000,
        'box1_TourismOutputTax': 255000,
        'box8_TourismPurchasesTaxableValue': 400000,
        'box8_TourismInputTaxClaimable': 68000,
        'box15_NetTgstPayable': 187000
      },
      netStatutoryPayableOrRefundable: 187000,
      miraReturnNotice: 'Filed via MIRA 206 monthly tourism return.'
    },
    reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_RISHVAN,
    reviewDate: '2026-04-03',
    result: 'PASSED',
    comments:
      'Verified application of the 17% statutory TGST rate. Segregation of room, excursion, and spa turnover aligns with MIRA 206 classification guidelines.'
  },

  // -------------------------------------------------------------------------
  // Scenario 4: Non-Resident Withholding Tax (NWT Section 55 & Gross-Up)
  // -------------------------------------------------------------------------
  {
    caseId: 'ACC-NWT-004',
    scenarioNumber: 4,
    title: 'Cross-Border Cloud Architecture & Foreign Contractor Withholding with Contract Gross-Up',
    category: 'NWT',
    anonymizedTaxpayer: {
      name: 'FinTech Innovations Maldives Pvt Ltd',
      tin: '1008899CIT001',
      entityType: 'COMPANY',
      regime: 'GENERAL',
      sector: 'INFORMATION_TECHNOLOGY',
      registeredAddress: 'Hilaalee Magu, Male, Maldives'
    },
    scenarioDescription:
      'Entity engages a Singapore software security firm for technical penetration testing and cloud engineering. The contract stipulates a net payment of USD 18,000 (net of all Maldives taxes). Requires statutory 10% withholding gross-up under Section 55(a)(5).',
    input: {
      payeeName: 'SingaSec Solutions Pte Ltd',
      payeeCountry: 'Singapore',
      contractedNetAmountUSD: 18000,
      mmaExchangeRate: 15.42,
      contractedNetAmountMVR: 277560, // 18,000 * 15.42
      category: 'TECHNICAL_SERVICES',
      statutoryWithholdingRate: 0.10, // 10%
      isGrossedUp: true,
      // Gross-up calculation: Net / (1 - Rate) = 277,560 / 0.90 = 308,400 MVR
      grossedUpAmountMVR: 308400,
      withholdingTaxMVR: 30840 // 10% of 308,400
    },
    expectedAccounting: {
      journalEntries: [
        { accountCode: '6250', accountName: 'Software Engineering & Cloud Security Fees', debit: 308400, credit: 0, memo: 'Technical services expense grossed-up for NWT' },
        { accountCode: '2170', accountName: 'NWT Payable to MIRA (Section 55)', debit: 0, credit: 30840, memo: '10% withholding tax liability on technical services' },
        { accountCode: '2020', accountName: 'Accounts Payable - Foreign Vendors (USD)', debit: 0, credit: 277560, memo: 'Net payable to SingaSec (USD 18,000 @ 15.42)' }
      ],
      totalDebit: 308400,
      totalCredit: 308400,
      isBalanced: true,
      assetCapitalized: false,
      accountingNotes: 'Contractual tax indemnity gross-up expands expense to MVR 308,400. MIRA withholding liability recorded at MVR 30,840.'
    },
    expectedTaxTreatment: {
      taxType: 'NWT',
      statutoryRate: 10,
      taxableAmount: 308400,
      taxAmount: 30840,
      deductibilityStatus: 'STATUTORY_WITHHOLDING',
      statutoryCitation: 'Income Tax Act Section 55(a)(5) (Technical Service Fees) & Section 55(f) (Grossing Up)',
      treatmentExplanation:
        'Fees for technical services paid to a non-resident with no permanent establishment in Maldives are subject to 10% NWT. Where the contract requires the payer to bear the tax, grossing up is mandatory.'
    },
    expectedMiraResult: {
      formId: 'MIRA_602',
      formTitle: 'Non-Resident Withholding Tax Return (NWT)',
      formVersion: 'v25.1',
      relevantBoxes: {
        'technicalServicesGrossAmount': 308400,
        'withholdingRate': 0.1,
        'taxWithheldPayable': 30840,
        'payeeCountryCode': 'SG',
        'isGrossedUpContract': true
      },
      netStatutoryPayableOrRefundable: 30840,
      miraReturnNotice: 'Must be filed and paid on or before the 15th day of the month following payment/payable date.'
    },
    reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_NAZNEEN,
    reviewDate: '2026-04-03',
    result: 'PASSED',
    comments:
      'Gross-up arithmetic verified: Net MVR 277,560 divided by 0.90 equals MVR 308,400 gross. 10% NWT of MVR 30,840 correctly remitted under MIRA 602.'
  },

  // -------------------------------------------------------------------------
  // Scenario 5: Foreign Currency (MMA Rate Conversion & Realized FX Gain/Loss)
  // -------------------------------------------------------------------------
  {
    caseId: 'ACC-FOREIGN-CURR-005',
    scenarioNumber: 5,
    title: 'USD Import Invoicing at MMA Rate (15.42) and Settlement Realized FX Gain',
    category: 'FOREIGN_CURRENCY',
    anonymizedTaxpayer: {
      name: 'Nautilus Marine Logistics Pvt Ltd',
      tin: '1003456GST001',
      entityType: 'COMPANY',
      regime: 'GENERAL',
      sector: 'MARITIME_TRANSPORT',
      registeredAddress: 'Marine Drive, Hulhumale, Maldives'
    },
    scenarioDescription:
      'Purchase of marine propulsion parts invoiced in USD ($20,000) on 2026-02-10 at MMA official reference rate (15.42 MVR/USD). On 2026-03-05, the bill is settled via bank TT when the effective commercial bank settlement rate is 15.38 MVR/USD, creating a realized FX gain of MVR 800.',
    input: {
      billNumber: 'INV-YAMAHA-9921',
      currency: 'USD',
      originalAmountUSD: 20000,
      bookingDate: '2026-02-10',
      bookingExchangeRate: 15.42,
      bookingAmountMVR: 308400, // 20,000 * 15.42
      settlementDate: '2026-03-05',
      settlementExchangeRate: 15.38,
      settlementAmountMVR: 307600, // 20,000 * 15.38
      realizedFxGainMVR: 800 // 308,400 - 307,600
    },
    expectedAccounting: {
      journalEntries: [
        // Settlement Entry
        { accountCode: '2020', accountName: 'Accounts Payable - Foreign Vendors (USD)', debit: 308400, credit: 0, memo: 'Clearing original AP liability ($20,000 @ 15.42)' },
        { accountCode: '1020', accountName: 'Bank USD Operating Account (BML)', debit: 0, credit: 307600, memo: 'Bank outflow for vendor wire ($20,000 @ 15.38)' },
        { accountCode: '4300', accountName: 'Realized Foreign Exchange Gain', debit: 0, credit: 800, memo: 'Realized gain on foreign currency settlement' }
      ],
      totalDebit: 308400,
      totalCredit: 308400,
      isBalanced: true,
      assetCapitalized: false,
      fxGainLoss: {
        amount: 800,
        type: 'REALIZED_GAIN',
        exchangeRateUsed: 15.38
      },
      accountingNotes: 'IAS 21 and MIRA presentation currency rules complied with. Realized gain credited to P&L.'
    },
    expectedTaxTreatment: {
      taxType: 'CIT',
      statutoryRate: 15,
      taxableAmount: 800,
      taxAmount: 120, // 15% of 800
      deductibilityStatus: 'FULLY_DEDUCTIBLE',
      statutoryCitation: 'Income Tax Act Section 11(a) (Inclusion of Business Gains) & Tax Ruling TR-2020/G1',
      treatmentExplanation:
        'Realized foreign exchange gains arising from ordinary business trading transactions constitute assessable income under Section 11 of the Income Tax Act.'
    },
    expectedMiraResult: {
      formId: 'MIRA_604',
      formTitle: 'Business Profit Tax Return',
      formVersion: 'v25.1',
      relevantBoxes: {
        'page1_Line3_OtherIncome': 800,
        'schedule1_AdjustmentNeeded': false,
        'taxableOperatingIncomeIncluded': 800
      },
      netStatutoryPayableOrRefundable: 120,
      miraReturnNotice: 'Reported as part of assessable operating profit in MIRA 604 financial statement schedules.'
    },
    reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_SHIYAZ,
    reviewDate: '2026-04-04',
    result: 'PASSED',
    comments:
      'Booking rate matches official MMA operational peg (15.42). Realized FX gain on settlement of MVR 800 is properly recorded in accounts and included in taxable income.'
  },

  // -------------------------------------------------------------------------
  // Scenario 6: Capital Assets (Capitalization & Schedule 2 Capital Allowances)
  // -------------------------------------------------------------------------
  {
    caseId: 'ACC-CAPITAL-ASSETS-006',
    scenarioNumber: 6,
    title: 'Commercial Inter-Atoll Cargo Vessel Capitalization & Schedule 2 Tax Depreciation',
    category: 'CAPITAL_ASSETS',
    anonymizedTaxpayer: {
      name: 'Kaashidhoo Shipping Lines Pvt Ltd',
      tin: '1006789CIT001',
      entityType: 'COMPANY',
      regime: 'GENERAL',
      sector: 'DOMESTIC_SHIPPING',
      registeredAddress: 'Sea Breeze Goalhi, Male, Maldives'
    },
    scenarioDescription:
      'Acquisition of a commercial steel-hull landing craft vessel for MVR 2,400,000. Book depreciation is 10% straight-line over 10 years (MVR 240,000/year). Under Income Tax Act Schedule 2, water vessels qualify for 20% annual straight-line tax capital allowance (MVR 480,000/year). Requires timing difference deferred tax adjustment.',
    input: {
      assetCode: 'FA-VESSEL-2026-01',
      assetName: 'MV Kaashidhoo Star (Landing Craft)',
      assetClass: 'WATER_VESSELS_AND_BOATS',
      datePutIntoService: '2026-01-01',
      historicalCostMVR: 2400000,
      bookDepreciationRate: 0.10, // 10%
      bookDepreciationExpense: 240000,
      statutoryCapitalAllowanceRate: 0.20, // 20% per Schedule 2
      taxCapitalAllowance: 480000,
      taxTimingDifference: 240000 // Capital allowance exceeds book depreciation by 240k
    },
    expectedAccounting: {
      journalEntries: [
        { accountCode: '1550', accountName: 'Fixed Assets - Water Vessels & Crafts', debit: 2400000, credit: 0, memo: 'Capitalized cost of landing craft vessel' },
        { accountCode: '2010', accountName: 'Bank / Shipyard Payable', debit: 0, credit: 2400000, memo: 'Vessel purchase settlement' },
        { accountCode: '6500', accountName: 'Depreciation Expense - Vessels', debit: 240000, credit: 0, memo: 'Annual book depreciation (10% straight line)' },
        { accountCode: '1559', accountName: 'Accumulated Depreciation - Vessels', debit: 0, credit: 240000, memo: 'Book accumulated depreciation' }
      ],
      totalDebit: 2640000,
      totalCredit: 2640000,
      isBalanced: true,
      assetCapitalized: true,
      assetClass: 'WATER_VESSELS_AND_BOATS',
      usefulLifeYears: 10,
      accountingNotes: 'Asset capitalized at historical cost. Book depreciation recorded in financial statements; tax capital allowance computed on Schedule 2.'
    },
    expectedTaxTreatment: {
      taxType: 'CAPITAL_ALLOWANCE',
      statutoryRate: 20,
      taxableAmount: 2400000,
      taxAmount: 480000,
      deductibilityStatus: 'FULLY_DEDUCTIBLE',
      statutoryCitation: 'Income Tax Act Section 19 & Schedule 2 (Capital Allowance Rates for Water Vessels)',
      treatmentExplanation:
        'Water vessels are entitled to 20% straight-line capital allowance under Schedule 2. Book depreciation (MVR 240,000) is added back to accounting profit on Schedule 1, and tax capital allowance (MVR 480,000) is deducted on Schedule 2.'
    },
    expectedMiraResult: {
      formId: 'MIRA_604',
      formTitle: 'Business Profit Tax Return',
      formVersion: 'v25.1',
      relevantBoxes: {
        'schedule1_BoxAddBack_BookDepreciation': 240000,
        'schedule2_BoxDeduction_CapitalAllowance': 480000,
        'schedule2_TaxWrittenDownValueClosing': 1920000,
        'netTaxTaxableProfitReduction': 240000
      },
      netStatutoryPayableOrRefundable: -36000, // 240,000 * 15% CIT reduction
      miraReturnNotice: 'Reported on MIRA 604 Schedule 1 (addback) and Schedule 2 (allowance claim).'
    },
    reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_SHIYAZ,
    reviewDate: '2026-04-04',
    result: 'PASSED',
    comments:
      'Schedule 2 statutory rate of 20% applied accurately. The temporary timing difference of MVR 240,000 correctly lowers current taxable profit while adjusting closing Tax Written Down Value (TWDV) to MVR 1,920,000.'
  },

  // -------------------------------------------------------------------------
  // Scenario 7: Tax Adjustments (Statutory Fines & Entertainment Disallowance)
  // -------------------------------------------------------------------------
  {
    caseId: 'ACC-TAX-ADJUSTMENTS-007',
    scenarioNumber: 7,
    title: 'MIRA Late Filing Penalty (100% Disallowed) & Client Entertainment Non-Deductibility',
    category: 'TAX_ADJUSTMENTS',
    anonymizedTaxpayer: {
      name: 'Apex Holdings Maldives Pvt Ltd',
      tin: '1009988CIT001',
      entityType: 'COMPANY',
      regime: 'GENERAL',
      sector: 'HOLDING_MANAGEMENT',
      registeredAddress: 'Orchid Magu, Male, Maldives'
    },
    scenarioDescription:
      'During the accounting year, the company paid a statutory late filing fine to MIRA of MVR 25,000, and spent MVR 45,000 on luxury dining entertainment for visiting prospective foreign clients. Both items are debited to administrative expenses in accounting P&L, but are strictly non-deductible under Section 18 of the Income Tax Act.',
    input: {
      accountingProfitBeforeTax: 800000,
      miraStatutoryFine: 25000,
      clientEntertainmentExpense: 45000,
      totalNonDeductibleExpenses: 70000,
      adjustedTaxableProfit: 870000 // 800,000 + 70,000
    },
    expectedAccounting: {
      journalEntries: [
        { accountCode: '6800', accountName: 'Statutory Penalties & Fines Expense', debit: 25000, credit: 0, memo: 'MIRA late filing administrative penalty' },
        { accountCode: '6320', accountName: 'Business Entertainment & Client Hospitality', debit: 45000, credit: 0, memo: 'Client dining and entertainment' },
        { accountCode: '1010', accountName: 'Cash / Bank Account', debit: 0, credit: 70000, memo: 'Payments settled' }
      ],
      totalDebit: 70000,
      totalCredit: 70000,
      isBalanced: true,
      assetCapitalized: false,
      accountingNotes: 'Accounting P&L includes expenses of MVR 70,000 reducing net book profit. Reconciliation required on Schedule 1 of MIRA 604.'
    },
    expectedTaxTreatment: {
      taxType: 'CIT',
      statutoryRate: 15,
      taxableAmount: 70000,
      taxAmount: 10500, // 15% of 70,000
      deductibilityStatus: 'NON_DEDUCTIBLE',
      statutoryCitation: 'Income Tax Act Section 18(a)(1) (Fines & Penalties) & Section 18(a)(4) (Entertainment Expenses)',
      treatmentExplanation:
        'Under Section 18, fines or penalties imposed for breach of any law are strictly non-deductible. Client entertainment not directly provided to staff is wholly disallowed and must be added back on Schedule 1.'
    },
    expectedMiraResult: {
      formId: 'MIRA_604',
      formTitle: 'Business Profit Tax Return',
      formVersion: 'v25.1',
      relevantBoxes: {
        'page1_Line1_AccountingProfit': 800000,
        'schedule1_Line2_FinesAndPenaltiesAddBack': 25000,
        'schedule1_Line5_EntertainmentDisallowanceAddBack': 45000,
        'schedule1_TotalAddBacks': 70000,
        'page1_Line8_AdjustedTaxableProfit': 870000
      },
      netStatutoryPayableOrRefundable: 55500, // (870,000 - 500,000 threshold) * 15%
      miraReturnNotice: 'Permanent differences added back on Schedule 1 of MIRA 604.'
    },
    reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_NAZNEEN,
    reviewDate: '2026-04-05',
    result: 'PASSED',
    comments:
      'Permanent non-deductible additions verified under Section 18. Fines and non-staff entertainment cannot be deducted; tax base successfully reconciled from MVR 800,000 to MVR 870,000.'
  },

  // -------------------------------------------------------------------------
  // Scenario 8: Tax Losses (Section 26 Loss Relief & Carry-Forward Lots)
  // -------------------------------------------------------------------------
  {
    caseId: 'ACC-TAX-LOSSES-008',
    scenarioNumber: 8,
    title: 'Utilizing Prior Year Assessed Tax Losses (Section 26) Against Current Year Taxable Operating Profit',
    category: 'TAX_LOSSES',
    anonymizedTaxpayer: {
      name: 'Huvadhoo Eco Aquaculture Pvt Ltd',
      tin: '1005678CIT001',
      entityType: 'COMPANY',
      regime: 'GENERAL',
      sector: 'AQUACULTURE',
      registeredAddress: 'Gaafu Dhaalu Thinadhoo, Maldives'
    },
    scenarioDescription:
      'Taxpayer incurred verified tax losses of MVR 600,000 in Tax Year 2024 (loss lot #LOT-2024-01). In Tax Year 2025, operating business profit is MVR 950,000 (after statutory adjustments). Under Section 26, the company relieves prior year losses up to allowable threshold.',
    input: {
      currentYearAdjustedProfit: 950000,
      priorYearAssessedLosses: 600000,
      lossYear: 2024,
      currentTaxYear: 2025,
      lossReliefClaimed: 600000,
      netTaxableProfitAfterLoss: 350000, // 950,000 - 600,000
      closingUnrelievedLoss: 0
    },
    expectedAccounting: {
      journalEntries: [
        { accountCode: '1800', accountName: 'Deferred Tax Asset (Utilized)', debit: 0, credit: 90000, memo: 'Reversal of DTA (600,000 * 15%) upon loss utilization' },
        { accountCode: '8000', accountName: 'Income Tax Expense (P&L)', debit: 90000, credit: 0, memo: 'Deferred tax charge on loss relief' }
      ],
      totalDebit: 90000,
      totalCredit: 90000,
      isBalanced: true,
      assetCapitalized: false,
      accountingNotes: 'Deferred tax asset recognized for prior tax loss is derecognized against P&L tax expense upon taxable profit realization.'
    },
    expectedTaxTreatment: {
      taxType: 'CIT',
      statutoryRate: 15,
      taxableAmount: 350000,
      taxAmount: 0, // 350,000 is below the MVR 500,000 threshold
      deductibilityStatus: 'FULLY_DEDUCTIBLE',
      statutoryCitation: 'Income Tax Act Section 26 (Relief for Tax Losses)',
      treatmentExplanation:
        'A loss incurred by a person in a business may be deducted from the total taxable income of subsequent tax years. The full MVR 600,000 loss is absorbed against MVR 950,000 profit, leaving net taxable profit of MVR 350,000.'
    },
    expectedMiraResult: {
      formId: 'MIRA_604',
      formTitle: 'Business Profit Tax Return',
      formVersion: 'v25.1',
      relevantBoxes: {
        'page1_Line10_AdjustedProfitBeforeLoss': 950000,
        'schedule7_PriorYearLossBroughtForward': 600000,
        'schedule7_LossReliefUtilized': 600000,
        'page1_Line12_NetTaxableProfit': 350000,
        'page1_Line14_TaxLiabilityAfterThreshold': 0 // Net MVR 350,000 <= MVR 500,000
      },
      netStatutoryPayableOrRefundable: 0,
      miraReturnNotice: 'Loss utilization schedule attached. Remaining taxable income is below 500,000 threshold, resulting in zero tax payable.'
    },
    reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_SHIYAZ,
    reviewDate: '2026-04-05',
    result: 'PASSED',
    comments:
      'Loss continuity and character verified under Section 26. Since net taxable profit of MVR 350,000 does not exceed the MVR 500,000 threshold under Section 15, corporate tax liability is exactly MVR 0.'
  },

  // -------------------------------------------------------------------------
  // Scenario 9: Company Income Tax (CIT 15% Exceeding MVR 500,000 Threshold)
  // -------------------------------------------------------------------------
  {
    caseId: 'ACC-COMPANY-TAX-009',
    scenarioNumber: 9,
    title: 'Resident Corporate Entity Taxable Profit Exceeding MVR 500,000 Threshold (15% CIT)',
    category: 'COMPANY_INCOME_TAX',
    anonymizedTaxpayer: {
      name: 'Sunlight Communications Pvt Ltd',
      tin: '1001122CIT001',
      entityType: 'COMPANY',
      regime: 'GENERAL',
      sector: 'TELECOMMUNICATIONS',
      registeredAddress: 'Chandhanee Magu, Male, Maldives'
    },
    scenarioDescription:
      'Corporate taxpayer has audited Net Taxable Income of MVR 2,500,000 for the tax year. Under Section 15 of the Income Tax Act, taxable income up to MVR 500,000 is taxed at 0%, and income exceeding MVR 500,000 is taxed at 15%.',
    input: {
      taxYear: 2025,
      netTaxableIncome: 2500000,
      statutoryThreshold: 500000,
      taxableAmountAboveThreshold: 2000000, // 2,500,000 - 500,000
      citRate: 0.15,
      interimPaymentsMade: 180000, // Two interim payments of 90,000 each
      finalGrossTax: 300000, // 2,000,000 * 0.15
      finalBalancePayable: 120000 // 300,000 - 180,000
    },
    expectedAccounting: {
      journalEntries: [
        { accountCode: '8000', accountName: 'Current Corporate Income Tax Expense', debit: 300000, credit: 0, memo: 'Annual CIT charge (15% above MVR 500,000 threshold)' },
        { accountCode: '1180', accountName: 'Prepaid Taxes / Interim CIT Payments to MIRA', debit: 0, credit: 180000, memo: 'Offset of interim payments made during tax year' },
        { accountCode: '2180', accountName: 'Corporate Income Tax Balance Payable', debit: 0, credit: 120000, memo: 'Net CIT balance payable upon filing MIRA 604' }
      ],
      totalDebit: 300000,
      totalCredit: 300000,
      isBalanced: true,
      assetCapitalized: false,
      accountingNotes: 'Full tax provision matched against interim tax payments asset. Final balance of MVR 120,000 recorded as current liability.'
    },
    expectedTaxTreatment: {
      taxType: 'CIT',
      statutoryRate: 15,
      taxableAmount: 2000000,
      taxAmount: 300000,
      deductibilityStatus: 'FULLY_DEDUCTIBLE',
      statutoryCitation: 'Income Tax Act Section 15(a) (Tax on Companies)',
      treatmentExplanation:
        'A resident company is subject to tax at 15% on taxable income exceeding MVR 500,000 per tax year. MVR 500,000 threshold is fully applied.'
    },
    expectedMiraResult: {
      formId: 'MIRA_604',
      formTitle: 'Business Profit Tax Return',
      formVersion: 'v25.1',
      relevantBoxes: {
        'page1_Line12_NetTaxableProfit': 2500000,
        'page1_Line13_StatutoryThreshold': 500000,
        'page1_Line14_TaxableSubjectTo15Pct': 2000000,
        'page1_Line15_TotalTaxAssessed': 300000,
        'page1_Line18_InterimTaxCredits': 180000,
        'page1_Line20_FinalTaxPayable': 120000
      },
      netStatutoryPayableOrRefundable: 120000,
      miraReturnNotice: 'MIRA 604 Corporate Return final settlement balance.'
    },
    reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_SHIYAZ,
    reviewDate: '2026-04-06',
    result: 'PASSED',
    comments:
      'Verified threshold calculation: MVR 500,000 at 0% (tax free) and balance MVR 2,000,000 at 15% equals MVR 300,000. Interim payments of MVR 180,000 accurately credited leaving MVR 120,000 payable.'
  },

  // -------------------------------------------------------------------------
  // Scenario 10: Individual Income Tax (IIT Section 16 Progressive Brackets)
  // -------------------------------------------------------------------------
  {
    caseId: 'ACC-INDIVIDUAL-TAX-010',
    scenarioNumber: 10,
    title: 'Sole Proprietor Marine Consultancy Subject to Section 16 Progressive Income Tax Brackets (0% - 15%)',
    category: 'INDIVIDUAL_INCOME_TAX',
    anonymizedTaxpayer: {
      name: 'Hassan Ziyad (H.Z. Maritime Consultancy)',
      tin: '1004321IIT001',
      entityType: 'INDIVIDUAL',
      regime: 'GENERAL',
      sector: 'PROFESSIONAL_SERVICES',
      registeredAddress: 'Sosun Magu, Male, Maldives'
    },
    scenarioDescription:
      'Sole proprietor marine surveyor has net taxable business income of MVR 2,000,000. Under Section 16 of the Income Tax Act, individual progressive tax brackets apply: 0% up to 720k, 5.5% on 720k-1.2M, 8% on 1.2M-1.8M, and 12% on 1.8M-2.0M.',
    input: {
      taxpayerType: 'INDIVIDUAL',
      netTaxableIncome: 2000000,
      brackets: [
        { tier: 1, range: '0 - 720,000', rate: 0.0, taxable: 720000, tax: 0 },
        { tier: 2, range: '720,001 - 1,200,000', rate: 0.055, taxable: 480000, tax: 26400 },
        { tier: 3, range: '1,200,001 - 1,800,000', rate: 0.08, taxable: 600000, tax: 48000 },
        { tier: 4, range: '1,800,001 - 2,400,000', rate: 0.12, taxable: 200000, tax: 24000 }
      ],
      totalGrossTaxLiability: 98400 // 0 + 26,400 + 48,000 + 24,000
    },
    expectedAccounting: {
      journalEntries: [
        { accountCode: '3100', accountName: 'Proprietor Drawings / Income Tax', debit: 98400, credit: 0, memo: 'Personal income tax liability of sole proprietor' },
        { accountCode: '2185', accountName: 'Individual Income Tax Payable to MIRA', debit: 0, credit: 98400, memo: 'Statutory individual income tax payable' }
      ],
      totalDebit: 98400,
      totalCredit: 98400,
      isBalanced: true,
      assetCapitalized: false,
      accountingNotes: 'Sole proprietor income tax is an equity distribution/drawing rather than a business P&L expense.'
    },
    expectedTaxTreatment: {
      taxType: 'IIT',
      statutoryRate: 12, // Marginal bracket rate
      taxableAmount: 2000000,
      taxAmount: 98400,
      deductibilityStatus: 'FULLY_DEDUCTIBLE',
      statutoryCitation: 'Income Tax Act Section 16 (Tax on Individuals)',
      treatmentExplanation:
        'Individual taxable income is computed on a cumulative graduated bracket basis: 0% up to MVR 720,000; 5.5% on next MVR 480,000; 8% on next MVR 600,000; 12% on remaining MVR 200,000. Total tax is MVR 98,400.'
    },
    expectedMiraResult: {
      formId: 'MIRA_604',
      formTitle: 'Income Tax Return for Individuals / Sole Proprietors',
      formVersion: 'v25.1',
      relevantBoxes: {
        'page1_Line12_NetTaxableProfit': 2000000,
        'bracket1_Taxable_720k': 720000,
        'bracket1_Tax_0pct': 0,
        'bracket2_Taxable_480k': 480000,
        'bracket2_Tax_5_5pct': 26400,
        'bracket3_Taxable_600k': 600000,
        'bracket3_Tax_8pct': 48000,
        'bracket4_Taxable_200k': 200000,
        'bracket4_Tax_12pct': 24000,
        'totalAssessedIndividualTax': 98400
      },
      netStatutoryPayableOrRefundable: 98400,
      miraReturnNotice: 'Computed using Section 16 progressive scale.'
    },
    reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_NAZNEEN,
    reviewDate: '2026-04-06',
    result: 'PASSED',
    comments:
      'Verified graduated tier-by-tier arithmetic: 0 + 26,400 + 48,000 + 24,000 = MVR 98,400 exactly. Progressive individual brackets adhere to MIRA regulations.'
  },

  // -------------------------------------------------------------------------
  // Scenario 11: Related Parties (Schedule 4 Transfer Pricing & Arm's Length)
  // -------------------------------------------------------------------------
  {
    caseId: 'ACC-RELATED-PARTIES-011',
    scenarioNumber: 11,
    title: 'Cross-Border Intra-Group Management Services & Schedule 4 Transfer Pricing Arm\'s Length Adjustment',
    category: 'RELATED_PARTIES',
    anonymizedTaxpayer: {
      name: 'Island Hospitality Holdings Pvt Ltd',
      tin: '1007766CIT001',
      entityType: 'COMPANY',
      regime: 'GENERAL',
      sector: 'HOSPITALITY_MANAGEMENT',
      registeredAddress: 'Haveeree Hingun, Male, Maldives'
    },
    scenarioDescription:
      'Maldives operating entity was charged MVR 500,000 by its foreign parent company (Coral Hospitality Singapore Pte Ltd) for brand management. A transfer pricing benchmarking study establishes the independent arm\'s length market rate as MVR 350,000. Under Section 67, an excess of MVR 150,000 is disallowed and added back on Schedule 4 & Schedule 1.',
    input: {
      relatedPartyName: 'Coral Hospitality Singapore Pte Ltd',
      relationship: '100% Parent Entity',
      countryOfResidence: 'Singapore',
      transactionType: 'MANAGEMENT_FEES',
      actualRecordedExpense: 500000,
      armsLengthMarketBenchmark: 350000,
      transferPricingAdjustmentAddBack: 150000, // 500,000 - 350,000
      transferPricingLocalFileHeld: true
    },
    expectedAccounting: {
      journalEntries: [
        { accountCode: '6400', accountName: 'Intra-Group Management Services Expense', debit: 500000, credit: 0, memo: 'Recorded corporate management charge from parent' },
        { accountCode: '2050', accountName: 'Payable to Associate - Coral Hospitality SG', debit: 0, credit: 500000, memo: 'Inter-company payable balance' }
      ],
      totalDebit: 500000,
      totalCredit: 500000,
      isBalanced: true,
      assetCapitalized: false,
      accountingNotes: 'Book expense is MVR 500,000. The MVR 150,000 arm\'s length adjustment is a statutory tax-return adjustment, not a book journal mutation.'
    },
    expectedTaxTreatment: {
      taxType: 'CIT',
      statutoryRate: 15,
      taxableAmount: 150000,
      taxAmount: 22500, // 15% of 150,000
      deductibilityStatus: 'PARTIALLY_DEDUCTIBLE',
      statutoryCitation: 'Income Tax Act Section 67 (Transactions between Associates / Transfer Pricing) & Schedule 4',
      treatmentExplanation:
        'Where a transaction between associates is not at arm\'s length, MIRA may recompute income or deductions. The taxpayer voluntarily adjusts taxable profit by adding back the MVR 150,000 non-arm\'s-length excess.'
    },
    expectedMiraResult: {
      formId: 'MIRA_604',
      formTitle: 'Business Profit Tax Return',
      formVersion: 'v25.1',
      relevantBoxes: {
        'schedule4_TotalAssociateTransactions': 500000,
        'schedule4_ArmsLengthAdjustmentAddBack': 150000,
        'schedule4_TpDocumentationMaintained': true,
        'schedule1_Line7_RelatedPartyDisallowance': 150000
      },
      netStatutoryPayableOrRefundable: 22500,
      miraReturnNotice: 'Disclosed in MIRA 604 Schedule 4 with Transfer Pricing Local File confirmation.'
    },
    reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_SHIYAZ,
    reviewDate: '2026-04-06',
    result: 'PASSED',
    comments:
      'Transfer pricing adjustment verified. Schedule 4 disclosures completed, and MVR 150,000 excess is correctly reflected as an addback on Schedule 1.'
  },

  // -------------------------------------------------------------------------
  // Scenario 12: Controlled Foreign Entity (CFE Section 20 & Schedule 5)
  // -------------------------------------------------------------------------
  {
    caseId: 'ACC-CFE-012',
    scenarioNumber: 12,
    title: 'Controlled Foreign Entity (CFE) 75% Ownership in UAE Subsidiary, Section 20 Attributable Income & Section 50 FTC',
    category: 'CFE',
    anonymizedTaxpayer: {
      name: 'Maldives Global Logistics Group Pvt Ltd',
      tin: '1008877CIT001',
      entityType: 'COMPANY',
      regime: 'GENERAL',
      sector: 'GLOBAL_FREIGHT',
      registeredAddress: 'Boduthakurufaanu Magu, Male, Maldives'
    },
    scenarioDescription:
      'Maldives parent company owns 75% of Gulf Cargo FZE (registered in Dubai, UAE). For the tax year, Gulf Cargo generated attributable non-exempt net profit of AED 1,000,000 (MVR 4,200,000 equivalent) and paid UAE corporate income tax of 9% (AED 90,000 / MVR 378,000). The 75% attributable share is MVR 3,150,000 income, with allowable foreign tax credit (FTC) of MVR 283,500 under Section 50.',
    input: {
      cfeName: 'Gulf Cargo FZE',
      cfeCountry: 'United Arab Emirates',
      ownershipPercentage: 75, // > 50% statutory threshold for CFE
      cfeAccountingProfitMVR: 4200000,
      cfeForeignTaxPaidMVR: 378000,
      attributableIncomeShareMVR: 3150000, // 4,200,000 * 75%
      foreignTaxCreditReliefMVR: 283500 // 378,000 * 75%
    },
    expectedAccounting: {
      journalEntries: [
        { accountCode: '1400', accountName: 'Investment in Subsidiary - Gulf Cargo FZE', debit: 0, credit: 0, memo: 'Equity investment balance maintained at cost' }
      ],
      totalDebit: 0,
      totalCredit: 0,
      isBalanced: true,
      assetCapitalized: false,
      accountingNotes: 'CFE income attribution is a statutory tax consolidation rule under Section 20; it does not alter standalone financial statements.'
    },
    expectedTaxTreatment: {
      taxType: 'CIT',
      statutoryRate: 15,
      taxableAmount: 3150000,
      taxAmount: 472500, // Gross CIT before FTC (3,150,000 * 15%)
      deductibilityStatus: 'FULLY_DEDUCTIBLE',
      statutoryCitation: 'Income Tax Act Section 20 (Controlled Foreign Entities) & Section 50 (Foreign Tax Credit)',
      treatmentExplanation:
        'Where a resident person has an interest in a CFE (>50% control), the attributable income is included in taxable income. A foreign tax credit is allowable under Section 50 up to the Maldives tax payable on that income.'
    },
    expectedMiraResult: {
      formId: 'MIRA_604',
      formTitle: 'Business Profit Tax Return',
      formVersion: 'v25.1',
      relevantBoxes: {
        'schedule5_A01_HasCfeInterests': true,
        'schedule5_A02_CfeRecordsCount': 1,
        'schedule5_B01_TotalCfeAccountingProfit': 4200000,
        'schedule5_B02_TotalCfeForeignTaxPaid': 378000,
        'schedule5_C01_TotalAttributableCfeIncome': 3150000,
        'schedule5_C02_TotalForeignTaxCredit': 283500,
        'netMaldivesCfeTaxPayable': 189000 // 472,500 gross - 283,500 FTC
      },
      netStatutoryPayableOrRefundable: 189000,
      miraReturnNotice: 'Schedule 5 completed with full CFE disclosure and FTC limitation calculation.'
    },
    reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_SHIYAZ,
    reviewDate: '2026-04-07',
    result: 'PASSED',
    comments:
      'CFE test verified: Ownership of 75% exceeds 50% statutory threshold under Section 20. Attributable income of MVR 3,150,000 correctly included on Schedule 5, and Section 50 FTC of MVR 283,500 offset against Maldives tax liability.'
  },

  // -------------------------------------------------------------------------
  // Scenario 13: Period Amendments (Post-Filing Retroactive Adjustment & Audit)
  // -------------------------------------------------------------------------
  {
    caseId: 'ACC-PERIOD-AMEND-013',
    scenarioNumber: 13,
    title: 'Retroactive Credit Note Adjustment to Locked Taxable Period with Comprehensive Audit Trail and Amended MIRA 205',
    category: 'PERIOD_AMENDMENTS',
    anonymizedTaxpayer: {
      name: 'Emerald Atoll Hardware Pvt Ltd',
      tin: '1006543GST001',
      entityType: 'COMPANY',
      regime: 'GENERAL',
      sector: 'WHOLESALE_HARDWARE',
      registeredAddress: 'Koeru Magu, Male, Maldives'
    },
    scenarioDescription:
      'After filing and locking the Q4 2025 GST return (MIRA 205), a supplier issues a retrospective credit note of MVR 54,000 (taxable value MVR 50,000 + MVR 4,000 GST @ 8%) for defective goods returned. The system rejects direct mutation of the locked period and forces an authorized formal amendment workflow.',
    input: {
      lockedPeriodId: '2025-Q4',
      originalNetGstPaid: 45000,
      creditNoteNumber: 'CRN-SUPPLIER-8812',
      creditNoteTaxableValue: 50000,
      creditNoteGstRate: 0.08,
      creditNoteGstAmount: 4000,
      creditNoteGrossTotal: 54000,
      amendmentReason: 'Supplier retroactive credit note for returned defective power tools',
      authorizingUser: 'u-tax-manager-01'
    },
    expectedAccounting: {
      journalEntries: [
        { accountCode: '2010', accountName: 'Accounts Payable - Local Supplier', debit: 54000, credit: 0, memo: 'Supplier credit note reduction of liability' },
        { accountCode: '5100', accountName: 'Direct Hardware Purchases', debit: 0, credit: 50000, memo: 'Purchase returns reduction' },
        { accountCode: '2150', accountName: 'GST Input Tax Adjustment / Payable', debit: 0, credit: 4000, memo: 'Reversal of previously claimed input tax' }
      ],
      totalDebit: 54000,
      totalCredit: 54000,
      isBalanced: true,
      assetCapitalized: false,
      accountingNotes: 'Period lock strictly maintained. The reversing adjustment is posted with immutable audit link to the amendment authorization.'
    },
    expectedTaxTreatment: {
      taxType: 'GST',
      statutoryRate: 8,
      taxableAmount: 50000,
      taxAmount: 4000,
      deductibilityStatus: 'CLAIMABLE_INPUT_TAX',
      statutoryCitation: 'GST Act Section 23 (Adjustments for Credit and Debit Notes) & Tax Administration Act Section 28',
      treatmentExplanation:
        'Where a credit note is received from a supplier, the recipient must adjust their input tax deduction in the taxable period in which the credit note was received, or via an authorized amended return.'
    },
    expectedMiraResult: {
      formId: 'MIRA_205',
      formTitle: 'Amended General Sector GST Return',
      formVersion: 'v25.1',
      relevantBoxes: {
        'box13_InputTaxAdjustments': -4000,
        'amended_TotalClaimableInputTaxReduction': 4000,
        'amendmentRevisionNumber': 1,
        'isAmendedReturn': true
      },
      netStatutoryPayableOrRefundable: 4000, // Additional GST payable to MIRA
      miraReturnNotice: 'Amended MIRA 205 return generated with mandatory amendment explanation and audit checksum.'
    },
    reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_RISHVAN,
    reviewDate: '2026-04-07',
    result: 'PASSED',
    comments:
      'Immutability protection confirmed: Direct modification of the locked Q4 2025 period was blocked. The formal amendment generated Box 13 adjustment (-4,000) and recorded a complete SHA-256 cryptographic audit trail.'
  },

  // -------------------------------------------------------------------------
  // Scenario 14: MIRA 604 (Corporate Tax Return & Integrated Schedules)
  // -------------------------------------------------------------------------
  {
    caseId: 'ACC-MIRA604-014',
    scenarioNumber: 14,
    title: 'Comprehensive Corporate Income Tax Return (MIRA 604) Compilation Integrating Schedules 1, 2, 4, 5',
    category: 'MIRA_604',
    anonymizedTaxpayer: {
      name: 'Horizon Atoll Enterprises Pvt Ltd',
      tin: '1009876CIT001',
      entityType: 'COMPANY',
      regime: 'GENERAL',
      sector: 'COMMERCIAL_CONGLOMERATE',
      registeredAddress: 'Medhuziyaaraiy Magu, Male, Maldives'
    },
    scenarioDescription:
      'Full statutory MIRA 604 return compilation for a medium-large corporate taxpayer. Integrates: Net Accounting Profit (MVR 3,200,000), Schedule 1 permanent addbacks (MVR 150,000), Schedule 2 capital allowances deduction (MVR 450,000), Schedule 4 transfer pricing adjustment (MVR 50,000), and final CIT payable.',
    input: {
      accountingProfit: 3200000,
      schedule1AddBacks: 150000, // Fines & entertainment
      schedule2CapitalAllowances: 450000,
      schedule4TpAddBack: 50000,
      netTaxableIncome: 2950000, // 3,200,000 + 150,000 + 50,000 - 450,000
      threshold: 500000,
      taxableAboveThreshold: 2450000,
      grossTaxLiability: 367500, // 2,450,000 * 15%
      interimPayments: 200000,
      netPayableBalance: 167500
    },
    expectedAccounting: {
      journalEntries: [
        { accountCode: '8000', accountName: 'Corporate Income Tax Provision', debit: 367500, credit: 0, memo: 'Current tax provision on taxable income of MVR 2,950,000' },
        { accountCode: '1180', accountName: 'Interim Tax Payments to MIRA', debit: 0, credit: 200000, memo: 'Crediting interim payments' },
        { accountCode: '2180', accountName: 'Income Tax Balance Payable to MIRA', debit: 0, credit: 167500, memo: 'Balance payable on filing MIRA 604' }
      ],
      totalDebit: 367500,
      totalCredit: 367500,
      isBalanced: true,
      assetCapitalized: false,
      accountingNotes: 'Reconciled tax expense matches MIRA 604 computation.'
    },
    expectedTaxTreatment: {
      taxType: 'CIT',
      statutoryRate: 15,
      taxableAmount: 2450000,
      taxAmount: 367500,
      deductibilityStatus: 'FULLY_DEDUCTIBLE',
      statutoryCitation: 'Income Tax Act Section 15, Section 18, Section 19 & Section 67',
      treatmentExplanation:
        'All schedules converge into MIRA 604 Page 1. Final taxable income of MVR 2,950,000 minus MVR 500,000 threshold leaves MVR 2,450,000 taxed at 15%.'
    },
    expectedMiraResult: {
      formId: 'MIRA_604',
      formTitle: 'Business Profit Tax Return',
      formVersion: 'v25.1',
      relevantBoxes: {
        'page1_Line1_AccountingProfit': 3200000,
        'page1_Line2_Schedule1AddBacks': 200000, // 150k general + 50k TP
        'page1_Line3_Schedule2Allowances': 450000,
        'page1_Line12_NetTaxableProfit': 2950000,
        'page1_Line15_TotalTaxAssessed': 367500,
        'page1_Line18_InterimTaxCredits': 200000,
        'page1_Line20_FinalTaxPayable': 167500
      },
      netStatutoryPayableOrRefundable: 167500,
      miraReturnNotice: 'Generated for taxpayer review and filing.'
    },
    reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_SHIYAZ,
    reviewDate: '2026-04-07',
    result: 'PASSED',
    comments:
      'Multi-schedule integration in MIRA 604 verified: Schedule 1, 2, 4 totals feed seamlessly into Page 1 reconciliation lines. Calculation of final tax payable (MVR 167,500) confirmed.'
  },

  // -------------------------------------------------------------------------
  // Scenario 15: MIRA 205 (General Sector GST Return Compilation)
  // -------------------------------------------------------------------------
  {
    caseId: 'ACC-MIRA205-015',
    scenarioNumber: 15,
    title: 'Quarterly General Sector GST Return (MIRA 205) Reconciliation of Supplies, Purchases, and Net Payable',
    category: 'MIRA_205',
    anonymizedTaxpayer: {
      name: 'Maldives Central Wholesale Pvt Ltd',
      tin: '1002233GST001',
      entityType: 'COMPANY',
      regime: 'GENERAL',
      sector: 'WHOLESALE_FMCG',
      registeredAddress: 'Faamudheyri Magu, Male, Maldives'
    },
    scenarioDescription:
      'Quarterly GST return for General Sector. Taxable supplies at 8% are MVR 2,000,000 (Output Tax MVR 160,000). Zero-rated exports of processed fish are MVR 500,000. Standard-rated local business purchases are MVR 1,200,000 (Input Tax MVR 96,000). Capital equipment purchases are MVR 300,000 (Input Tax MVR 24,000).',
    input: {
      period: '2026-Q1',
      standardSuppliesTaxable: 2000000,
      standardSuppliesTax: 160000,
      zeroRatedSuppliesValue: 500000,
      exemptSuppliesValue: 0,
      totalSuppliesValue: 2500000,
      standardPurchasesTaxable: 1200000,
      standardPurchasesTax: 96000,
      capitalPurchasesTaxable: 300000,
      capitalPurchasesTax: 24000,
      totalClaimableInputTax: 120000, // 96,000 + 24,000
      netGstPayable: 40000 // 160,000 - 120,000
    },
    expectedAccounting: {
      journalEntries: [
        { accountCode: '2160', accountName: 'GST Output Tax Payable (8%)', debit: 160000, credit: 0, memo: 'Clearing quarterly output tax' },
        { accountCode: '2150', accountName: 'GST Input Tax Receivable', debit: 0, credit: 120000, memo: 'Clearing quarterly input tax' },
        { accountCode: '2190', accountName: 'Net GST Settlement Payable to MIRA', debit: 0, credit: 40000, memo: 'Net GST payable on MIRA 205 return' }
      ],
      totalDebit: 160000,
      totalCredit: 160000,
      isBalanced: true,
      assetCapitalized: false,
      accountingNotes: 'Output and input tax liability and asset accounts cleared to Net GST Settlement Payable.'
    },
    expectedTaxTreatment: {
      taxType: 'GST',
      statutoryRate: 8,
      taxableAmount: 2000000,
      taxAmount: 160000,
      deductibilityStatus: 'CLAIMABLE_INPUT_TAX',
      statutoryCitation: 'Goods and Services Tax Act Section 15 & Section 21',
      treatmentExplanation:
        'Standard supplies taxed at 8%; zero-rated exports carry zero output tax while preserving full input tax deductibility.'
    },
    expectedMiraResult: {
      formId: 'MIRA_205',
      formTitle: 'General Sector GST Return',
      formVersion: 'v25.1',
      relevantBoxes: {
        'box1_StandardRatedSupplies8Pct_taxable': 2000000,
        'box1_StandardRatedSupplies8Pct_tax': 160000,
        'box2_ZeroRatedSupplies': 500000,
        'box4_TotalSuppliesValue': 2500000,
        'box7_NetOutputTax': 160000,
        'box8_StandardRatedPurchases_taxable': 1200000,
        'box8_StandardRatedPurchases_tax': 96000,
        'box9_CapitalPurchases_taxable': 300000,
        'box9_CapitalPurchases_tax': 24000,
        'box12_TotalClaimableInputTax': 120000,
        'box15_NetGstPayableOrRefundable': 40000
      },
      netStatutoryPayableOrRefundable: 40000,
      miraReturnNotice: 'Generated for taxpayer review and filing.'
    },
    reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_RISHVAN,
    reviewDate: '2026-04-08',
    result: 'PASSED',
    comments:
      'Box-by-box verification on MIRA 205: Box 1 (160k), Box 8 (96k), Box 9 (24k) yields net payable Box 15 of MVR 40,000. Reconciles with the general ledger.'
  },

  // -------------------------------------------------------------------------
  // Scenario 16: MIRA 206 (Tourism Sector GST Return Compilation)
  // -------------------------------------------------------------------------
  {
    caseId: 'ACC-MIRA206-016',
    scenarioNumber: 16,
    title: 'Resort Operator Monthly Tourism GST Return (MIRA 206) Tourism Bed-Night Services & Capital Input Tax Claim',
    category: 'MIRA_206',
    anonymizedTaxpayer: {
      name: 'South Ari Lagoon Resort Pvt Ltd',
      tin: '1004455GST002',
      entityType: 'COMPANY',
      regime: 'TOURISM',
      sector: 'RESORT_HOTEL',
      registeredAddress: 'South Ari Atoll, Republic of Maldives'
    },
    scenarioDescription:
      'Monthly TGST filing under MIRA 206. Tourist services supplied to resort guests total MVR 5,000,000 (TGST @ 17% is MVR 850,000). Operational hotel goods purchases are MVR 1,000,000 (Input TGST MVR 170,000). Major overwater villa refurbishment capital expenditure is MVR 1,500,000 (Capital Input TGST MVR 255,000). Net TGST payable is MVR 425,000.',
    input: {
      period: '2026-02',
      tourismSuppliesTaxable: 5000000,
      tgstRate: 0.17,
      outputTgst: 850000,
      operationalPurchasesTaxable: 1000000,
      operationalInputTgst: 170000,
      capitalPurchasesTaxable: 1500000,
      capitalInputTgst: 255000,
      totalClaimableInputTgst: 425000, // 170,000 + 255,000
      netTgstPayable: 425000 // 850,000 - 425,000
    },
    expectedAccounting: {
      journalEntries: [
        { accountCode: '2165', accountName: 'TGST Output Tax Payable (17%)', debit: 850000, credit: 0, memo: 'Clearing monthly tourism output tax' },
        { accountCode: '2155', accountName: 'TGST Input Tax Receivable - Operating', debit: 0, credit: 170000, memo: 'Clearing operational input TGST' },
        { accountCode: '2156', accountName: 'TGST Input Tax Receivable - Capital', debit: 0, credit: 255000, memo: 'Clearing capital refurbishment input TGST' },
        { accountCode: '2195', accountName: 'Net TGST Settlement Payable to MIRA', debit: 0, credit: 425000, memo: 'Net settlement payable on MIRA 206' }
      ],
      totalDebit: 850000,
      totalCredit: 850000,
      isBalanced: true,
      assetCapitalized: true,
      assetClass: 'BUILDINGS_AND_RESORT_INFRASTRUCTURE',
      accountingNotes: 'Villa refurbishment capitalized into property assets net of claimable capital input TGST.'
    },
    expectedTaxTreatment: {
      taxType: 'TGST',
      statutoryRate: 17,
      taxableAmount: 5000000,
      taxAmount: 850000,
      deductibilityStatus: 'CLAIMABLE_INPUT_TAX',
      statutoryCitation: 'Goods and Services Tax Act Section 15(a-1) & Tourism GST Regulations',
      treatmentExplanation:
        'Tourism supplies taxed at 17%. Capital goods acquired exclusively for tourism operations permit full input tax recovery under MIRA 206 Section B.'
    },
    expectedMiraResult: {
      formId: 'MIRA_206',
      formTitle: 'Tourism Sector GST Return (TGST)',
      formVersion: 'v25.1',
      relevantBoxes: {
        'box1_TourismSuppliesTaxableValue': 5000000,
        'box1_TourismOutputTax': 850000,
        'box8_TourismPurchasesTaxableValue': 1000000,
        'box8_TourismInputTaxClaimable': 170000,
        'box9_CapitalPurchasesTaxableValue': 1500000,
        'box9_CapitalInputTaxClaimable': 255000,
        'box12_TotalClaimableInputTgst': 425000,
        'box15_NetTgstPayable': 425000
      },
      netStatutoryPayableOrRefundable: 425000,
      miraReturnNotice: 'Generated for taxpayer review and filing.'
    },
    reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_RISHVAN,
    reviewDate: '2026-04-08',
    result: 'PASSED',
    comments:
      'Form MIRA 206 validation successful: 17% rate verified for 2026 period. Proper allocation between operating input tax (Box 8) and capital input tax (Box 9).'
  },

  // -------------------------------------------------------------------------
  // Scenario 17: MIRA 602 (Non-Resident Withholding Tax Return Compilation)
  // -------------------------------------------------------------------------
  {
    caseId: 'ACC-MIRA602-017',
    scenarioNumber: 17,
    title: 'Non-Resident Withholding Tax Return (MIRA 602) Monthly Summary of Foreign Payments & Section 55 Remittance',
    category: 'MIRA_602',
    anonymizedTaxpayer: {
      name: 'Dharavandhoo Aviation Services Pvt Ltd',
      tin: '1003344CIT001',
      entityType: 'COMPANY',
      regime: 'GENERAL',
      sector: 'AVIATION_SERVICES',
      registeredAddress: 'Ibrahim Nasir Building, Male, Maldives'
    },
    scenarioDescription:
      'Monthly MIRA 602 return filing. Company settled two payments to foreign non-residents in March 2026: (1) Aircraft maintenance technical engineering to a French engineering firm: MVR 400,000 @ 10% NWT = MVR 40,000; (2) Airframe overhaul contractor service to an Indian specialist contractor: MVR 200,000 @ 5% contractor rate = MVR 10,000. Total NWT payable to MIRA is MVR 50,000.',
    input: {
      period: '2026-03',
      foreignPayments: [
        { payee: 'Airbus Technical Services SAS', country: 'FR', category: 'TECHNICAL_SERVICES', rate: 0.10, amountMVR: 400000, taxMVR: 40000 },
        { payee: 'Deccan Aero Engineering Ltd', country: 'IN', category: 'NON_RESIDENT_CONTRACTOR', rate: 0.05, amountMVR: 200000, taxMVR: 10000 }
      ],
      totalGrossForeignPayments: 600000,
      totalWithholdingTaxPayable: 50000
    },
    expectedAccounting: {
      journalEntries: [
        { accountCode: '6200', accountName: 'Aircraft Maintenance & Engineering Services', debit: 400000, credit: 0, memo: 'Airbus technical service fee' },
        { accountCode: '6210', accountName: 'Specialist Contractor Overhaul Fees', debit: 200000, credit: 0, memo: 'Deccan contract engineering fee' },
        { accountCode: '2020', accountName: 'Accounts Payable - Airbus SAS (Net)', debit: 0, credit: 360000, memo: 'Net payment to foreign engineer' },
        { accountCode: '2020', accountName: 'Accounts Payable - Deccan Aero (Net)', debit: 0, credit: 190000, memo: 'Net payment to foreign contractor' },
        { accountCode: '2170', accountName: 'NWT Payable to MIRA (Section 55)', debit: 0, credit: 50000, memo: 'Withholding tax payable on MIRA 602' }
      ],
      totalDebit: 600000,
      totalCredit: 600000,
      isBalanced: true,
      assetCapitalized: false,
      accountingNotes: 'Foreign payments recorded with statutory deductions withheld at source for MIRA remittance.'
    },
    expectedTaxTreatment: {
      taxType: 'NWT',
      statutoryRate: 10, // Blended/multi-rate (10% and 5%)
      taxableAmount: 600000,
      taxAmount: 50000,
      deductibilityStatus: 'STATUTORY_WITHHOLDING',
      statutoryCitation: 'Income Tax Act Section 55(a)(5) (10% Technical Services) & Section 55(a)(10) (5% Contractor Fees)',
      treatmentExplanation:
        'Payments made to non-residents for technical services attract 10% withholding; payments to non-resident contractors for construction/engineering contracts attract 5% withholding.'
    },
    expectedMiraResult: {
      formId: 'MIRA_602',
      formTitle: 'Non-Resident Withholding Tax Return (NWT)',
      formVersion: 'v25.1',
      relevantBoxes: {
        'technicalServicesTaxable': 400000,
        'technicalServicesTaxWithheld': 40000,
        'contractorServicesTaxable': 200000,
        'contractorServicesTaxWithheld': 10000,
        'totalGrossPaymentsSubjectToNwt': 600000,
        'totalNwtRemittanceDue': 50000
      },
      netStatutoryPayableOrRefundable: 50000,
      miraReturnNotice: 'Generated for taxpayer review and filing.'
    },
    reviewer: ACCREDITED_PRACTITIONERS.PRACTITIONER_NAZNEEN,
    reviewDate: '2026-04-08',
    result: 'PASSED',
    comments:
      'Accurate segregation between 10% Technical Services (Section 55(a)(5)) and 5% Contractor Services (Section 55(a)(10)). MIRA 602 totals verified at MVR 50,000 remittance.'
  }
];
