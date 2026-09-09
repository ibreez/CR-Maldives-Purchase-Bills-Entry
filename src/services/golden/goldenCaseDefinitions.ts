import crypto from 'crypto';
import { GoldenTaxCaseFixture, GoldenCaseId } from '../../types/goldenCases';

/**
 * Deterministically stringifies an object by recursively sorting its keys.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }
  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJsonStringify).join(',') + ']';
  }

  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    key => `${JSON.stringify(key)}:${canonicalJsonStringify((obj as Record<string, unknown>)[key])}`
  );
  return '{' + pairs.join(',') + '}';
}

/**
 * Computes the SHA-256 digest of canonicalized JSON.
 */
export function computeFixtureDigest(fixture: Omit<GoldenTaxCaseFixture, 'immutableSha256Checksum'>): string {
  const canonical = canonicalJsonStringify(fixture);
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Authoritative Raw Golden Case Fixture Definitions (GOLDEN-001 through GOLDEN-020)
 */
export const RAW_GOLDEN_CASES: Array<Omit<GoldenTaxCaseFixture, 'immutableSha256Checksum'>> = [
  // -------------------------------------------------------------
  // GOLDEN-001: Simple Purchase
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-001',
    caseNumber: 1,
    title: 'Simple Purchase with Standard-Rated General GST',
    description: 'Standard local business purchase with valid supplier TIN, 8% General GST, deductible expense, balanced double-entry journal and claimable input tax.',
    category: 'GST',
    regulatoryReferences: [
      'GST Act (Law No. 10/2011) Section 15',
      'GST Regulation Section 38 (Tax Invoices)',
      'Income Tax Act (Law No. 25/2019) Section 10 (Allowable Deductions)'
    ],
    effectiveDate: '2026-03-15',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-001',
        tin: '1000001GST001',
        taxpayerName: 'Male Trading Enterprise Pvt Ltd',
        businessType: 'COMPANY',
        sector: 'GENERAL',
        isGstRegistered: true,
        taxYear: 2026
      },
      document: {
        fileName: 'stationery_invoice_2026.pdf',
        documentType: 'SUPPLIER_INVOICE',
        supplierName: 'Copier Plus Maldives',
        supplierTin: '1001234GST001',
        invoiceNumber: 'INV-2026-8891',
        issueDate: '2026-03-15',
        currency: 'MVR',
        subtotal: 5000.00,
        gstAmount: 400.00,
        totalAmount: 5400.00,
        items: [
          { description: 'A4 Printing Paper & Office Supplies', quantity: 10, unitPrice: 500.00, amount: 5000.00 }
        ]
      }
    },
    expectedClassifications: {
      documentType: 'SUPPLIER_INVOICE',
      accountingClassification: 'EXPENSE',
      accountingCategory: 'other_expenses.office_supplies',
      gstTreatment: 'STANDARD_RATED',
      incomeTaxTreatment: 'DEDUCTIBLE',
      miraCategory: 'other_expenses',
      reviewStatus: 'APPROVED',
      taxRate: 0.08
    },
    expectedCalculations: {
      subtotal: 5000.00,
      taxableAmount: 5000.00,
      gstAmount: 400.00,
      totalAmount: 5400.00,
      claimableInputTax: 400.00,
      blockedInputTax: 0.00,
      journalBalanceVariance: 0.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_205',
      boxValues: {
        'box20_taxable_purchases': 5000.00,
        'box21_input_tax_claimed': 400.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-002: General GST (Current 8% Regime)
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-002',
    caseNumber: 2,
    title: 'General Sector GST Return Calculation (8% Standard Rate)',
    description: 'Quarterly general sector calculation balancing standard-rated commercial supplies and allowable input purchases under the 8% general GST regime.',
    category: 'GST',
    regulatoryReferences: [
      'GST Act (Law No. 10/2011) Section 15(a) as amended by Act No. 20/2022',
      'MIRA 205 Instructions v25.1'
    ],
    effectiveDate: '2026-04-10',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-002',
        tin: '1000002GST001',
        taxpayerName: 'Island Hardware Stores Pvt Ltd',
        businessType: 'COMPANY',
        sector: 'GENERAL',
        isGstRegistered: true,
        taxYear: 2026
      },
      parameters: {
        quarter: 'Q1',
        totalTaxableSales: 100000.00,
        totalTaxablePurchases: 40000.00
      }
    },
    expectedClassifications: {
      gstTreatment: 'STANDARD_RATED',
      taxRate: 0.08
    },
    expectedCalculations: {
      taxableAmount: 100000.00,
      outputGst: 8000.00,
      claimableInputTax: 3200.00,
      netGstPayable: 4800.00,
      journalBalanceVariance: 0.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_205',
      boxValues: {
        'box10_taxable_sales': 100000.00,
        'box11_output_tax': 8000.00,
        'box20_taxable_purchases': 40000.00,
        'box21_input_tax_claimed': 3200.00,
        'box30_net_gst_payable': 4800.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-003: Tourism GST Before 2025-07-01 (16% TGST Regime)
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-003',
    caseNumber: 3,
    title: 'Tourism GST 16% Regime (Historical Pre-July 2025)',
    description: 'Tourism sector transaction rendered during the 16% TGST era (between 2023-01-01 and 2025-06-30).',
    category: 'GST',
    regulatoryReferences: [
      'GST Act (Law No. 10/2011) Section 15(b) amended by Act No. 20/2022',
      'MIRA 206 Tourism GST Return Schema'
    ],
    effectiveDate: '2024-11-20',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-003',
        tin: '1000003GST001',
        taxpayerName: 'Velidhoo Ocean Resort Maldives',
        businessType: 'COMPANY',
        sector: 'TOURISM',
        isGstRegistered: true,
        taxYear: 2024
      },
      document: {
        fileName: 'resort_guest_folio_2024.pdf',
        documentType: 'SUPPLIER_INVOICE',
        supplierName: 'Velidhoo Ocean Resort',
        supplierTin: '1000003GST001',
        invoiceNumber: 'FOLIO-2024-9901',
        issueDate: '2024-11-20',
        currency: 'MVR',
        subtotal: 50000.00,
        gstAmount: 8000.00,
        totalAmount: 58000.00
      }
    },
    expectedClassifications: {
      documentType: 'SUPPLIER_INVOICE',
      accountingClassification: 'REVENUE',
      gstTreatment: 'STANDARD_RATED',
      taxRate: 0.16
    },
    expectedCalculations: {
      taxableAmount: 50000.00,
      gstAmount: 8000.00,
      totalAmount: 58000.00,
      outputGst: 8000.00,
      journalBalanceVariance: 0.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_206',
      boxValues: {
        'box10_tgst_taxable_supplies': 50000.00,
        'box11_tgst_rate': 0.16,
        'box12_tgst_output_tax': 8000.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-004: Tourism GST From 2025-07-01 (17% TGST Regime)
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-004',
    caseNumber: 4,
    title: 'Tourism GST 17% Regime (Effective 2025-07-01 Under Act No. 12/2024)',
    description: 'Tourism sector transaction rendered on or after 2025-07-01 asserting automatic statutory transition to 17% TGST rate.',
    category: 'GST',
    regulatoryReferences: [
      'GST Act Amendment (Act No. 12/2024) Section 3',
      'MIRA Ruling on Tourism GST Rate Increase (Effective 1 July 2025)'
    ],
    effectiveDate: '2025-08-15',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-004',
        tin: '1000004GST001',
        taxpayerName: 'Fuvahmulah Dive Sanctuary Retreat',
        businessType: 'COMPANY',
        sector: 'TOURISM',
        isGstRegistered: true,
        taxYear: 2025
      },
      document: {
        fileName: 'villa_stay_august_2025.pdf',
        documentType: 'SUPPLIER_INVOICE',
        supplierName: 'Fuvahmulah Dive Sanctuary Retreat',
        supplierTin: '1000004GST001',
        invoiceNumber: 'INV-2025-7711',
        issueDate: '2025-08-15',
        currency: 'MVR',
        subtotal: 50000.00,
        gstAmount: 8500.00,
        totalAmount: 58500.00
      }
    },
    expectedClassifications: {
      documentType: 'SUPPLIER_INVOICE',
      accountingClassification: 'REVENUE',
      gstTreatment: 'STANDARD_RATED',
      taxRate: 0.17
    },
    expectedCalculations: {
      taxableAmount: 50000.00,
      gstAmount: 8500.00,
      totalAmount: 58500.00,
      outputGst: 8500.00,
      journalBalanceVariance: 0.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_206',
      boxValues: {
        'box10_tgst_taxable_supplies': 50000.00,
        'box11_tgst_rate': 0.17,
        'box12_tgst_output_tax': 8500.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-005: Exempt Purchase
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-005',
    caseNumber: 5,
    title: 'Statutory Exempt Purchase (Rent/Postal/Financial)',
    description: 'Exempt commercial rent invoice with 0.00 GST under GST Act Section 21, deductible for Income Tax but non-claimable for GST input tax.',
    category: 'GST',
    regulatoryReferences: [
      'GST Act (Law No. 10/2011) Section 21 (Exempt Goods and Services)',
      'Income Tax Act (Law No. 25/2019) Section 10'
    ],
    effectiveDate: '2026-02-01',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-005',
        tin: '1000005GST001',
        taxpayerName: 'Apex Advisory Services LLP',
        businessType: 'PARTNERSHIP',
        sector: 'GENERAL',
        isGstRegistered: true,
        taxYear: 2026
      },
      document: {
        fileName: 'office_lease_agreement_feb2026.pdf',
        documentType: 'RENT_INVOICE',
        supplierName: 'Malé Commercial Tower Properties',
        supplierTin: '1005555GST001',
        invoiceNumber: 'RENT-2026-02',
        issueDate: '2026-02-01',
        currency: 'MVR',
        subtotal: 25000.00,
        gstAmount: 0.00,
        totalAmount: 25000.00
      }
    },
    expectedClassifications: {
      documentType: 'RENT_INVOICE',
      accountingClassification: 'EXPENSE',
      accountingCategory: 'rental_repairs.office_rent',
      gstTreatment: 'EXEMPT',
      incomeTaxTreatment: 'DEDUCTIBLE',
      miraCategory: 'rental_repairs',
      taxRate: 0.00
    },
    expectedCalculations: {
      subtotal: 25000.00,
      taxableAmount: 25000.00,
      gstAmount: 0.00,
      totalAmount: 25000.00,
      claimableInputTax: 0.00,
      blockedInputTax: 0.00,
      journalBalanceVariance: 0.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_205',
      boxValues: {
        'box23_exempt_purchases': 25000.00,
        'box21_input_tax_claimed': 0.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-006: Blocked Input Tax & Non-Deductible Entertainment
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-006',
    caseNumber: 6,
    title: 'Blocked Input Tax and Non-Deductible Hospitality Add-Back',
    description: 'Staff hospitality and entertainment expense where GST input tax is statutorily blocked and full gross amount is added back for Income Tax.',
    category: 'GST',
    regulatoryReferences: [
      'GST Regulation Section 43 (Blocked Input Tax on Entertainment & Hospitality)',
      'Income Tax Act (Law No. 25/2019) Section 11(a) (Non-Deductible Hospitality/Entertainment)'
    ],
    effectiveDate: '2026-05-12',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-006',
        tin: '1000006GST001',
        taxpayerName: 'Horizon Financial Group Pvt Ltd',
        businessType: 'COMPANY',
        sector: 'GENERAL',
        isGstRegistered: true,
        taxYear: 2026
      },
      document: {
        fileName: 'luxury_client_dinner_receipt.pdf',
        documentType: 'SUPPLIER_INVOICE',
        supplierName: 'The Pearl Bistro Malé',
        supplierTin: '1009999GST001',
        invoiceNumber: 'DIN-2026-4401',
        issueDate: '2026-05-12',
        currency: 'MVR',
        subtotal: 10000.00,
        gstAmount: 800.00,
        totalAmount: 10800.00
      }
    },
    expectedClassifications: {
      documentType: 'SUPPLIER_INVOICE',
      accountingClassification: 'EXPENSE',
      accountingCategory: 'other_expenses.entertainment',
      gstTreatment: 'NO_INPUT_TAX',
      incomeTaxTreatment: 'NON_DEDUCTIBLE',
      miraCategory: 'other_expenses',
      taxRate: 0.08
    },
    expectedCalculations: {
      subtotal: 10000.00,
      gstAmount: 800.00,
      totalAmount: 10800.00,
      claimableInputTax: 0.00,
      blockedInputTax: 800.00,
      taxAdjustmentsAddBack: 10800.00,
      journalBalanceVariance: 0.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_205',
      boxValues: {
        'box21_input_tax_claimed': 0.00,
        'box22_blocked_input_tax': 800.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-007: Capital Asset & Capital Allowance
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-007',
    caseNumber: 7,
    title: 'Capital Asset Acquisition and Schedule 2 Capital Allowance Pooling',
    description: 'Server equipment acquisition: GST input tax claimable, book depreciation added back (+MVR 30,000), Schedule 2 capital allowance deducted (-MVR 50,000).',
    category: 'CAPITAL_ASSETS',
    regulatoryReferences: [
      'Income Tax Act (Law No. 25/2019) Section 18 & Schedule 2 (Capital Allowances)',
      'Income Tax Regulation Chapter 4'
    ],
    effectiveDate: '2026-01-15',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-007',
        tin: '1000007GST001',
        taxpayerName: 'CloudNet Maldives Solutions Pvt Ltd',
        businessType: 'COMPANY',
        sector: 'GENERAL',
        isGstRegistered: true,
        taxYear: 2026
      },
      document: {
        fileName: 'dell_poweredge_server_inv.pdf',
        documentType: 'ASSET_PURCHASE',
        supplierName: 'Maxcom Technologies Maldives',
        supplierTin: '1002222GST001',
        invoiceNumber: 'ASSET-2026-001',
        issueDate: '2026-01-15',
        currency: 'MVR',
        subtotal: 150000.00,
        gstAmount: 12000.00,
        totalAmount: 162000.00
      },
      parameters: {
        assetCategory: 'COMPUTER_SOFTWARE_AND_ELECTRONIC_EQUIPMENT',
        bookDepreciationRate: 0.20,
        capitalAllowanceRate: 0.333333
      }
    },
    expectedClassifications: {
      documentType: 'ASSET_PURCHASE',
      accountingClassification: 'ASSET',
      accountingCategory: 'capital_asset_schedule2.computer_hardware',
      gstTreatment: 'STANDARD_RATED',
      incomeTaxTreatment: 'CAPITAL_ALLOWANCE',
      miraCategory: 'capital_asset_schedule2'
    },
    expectedCalculations: {
      costBasis: 150000.00,
      claimableInputTax: 12000.00,
      bookDepreciationAddBack: 30000.00,
      capitalAllowanceClaimed: 50000.00,
      netTaxAdjustments: -20000.00,
      journalBalanceVariance: 0.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_604',
      schedulesIncluded: ['Schedule 2 - Capital Allowances', 'Section C - Tax Adjustments'],
      boxValues: {
        'sched2_additions': 150000.00,
        'sched2_allowance_claimed': 50000.00,
        'sched2_closing_wdv': 100000.00,
        'secC_book_depreciation_addback': 30000.00,
        'secC_capital_allowance_deduction': 50000.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-008: Foreign Currency Purchase
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-008',
    caseNumber: 8,
    title: 'Foreign Currency Purchase with MMA Exchange Rate and FX Realization',
    description: 'USD foreign purchase converted at MMA authoritative 15.42 rate with subsequent settlement FX realization.',
    category: 'FX',
    regulatoryReferences: [
      'Maldives Monetary Authority (MMA) Official FX Regulations',
      'Income Tax Act (Law No. 25/2019) Section 10 (Foreign Currency Gains & Losses)'
    ],
    effectiveDate: '2026-03-20',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-008',
        tin: '1000008GST001',
        taxpayerName: 'Global Maritime Logistics Pvt Ltd',
        businessType: 'COMPANY',
        sector: 'GENERAL',
        isGstRegistered: true,
        taxYear: 2026
      },
      document: {
        fileName: 'navigation_software_usd.pdf',
        documentType: 'SUPPLIER_INVOICE',
        supplierName: 'MarineTech Solutions US',
        invoiceNumber: 'US-2026-0992',
        issueDate: '2026-03-20',
        currency: 'USD',
        exchangeRate: 15.42,
        subtotal: 5000.00,
        gstAmount: 0.00,
        totalAmount: 5000.00
      },
      parameters: {
        settlementDate: '2026-04-05',
        settlementRate: 15.45
      }
    },
    expectedClassifications: {
      documentType: 'SUPPLIER_INVOICE',
      accountingClassification: 'EXPENSE',
      gstTreatment: 'NO_INPUT_TAX',
      incomeTaxTreatment: 'DEDUCTIBLE'
    },
    expectedCalculations: {
      subtotal: 77100.00, // $5,000 * 15.42
      taxableAmount: 77100.00,
      totalAmount: 77100.00,
      realizedFxGainLoss: -150.00, // ($5,000 * 15.45) - ($5,000 * 15.42) = 150 loss
      journalBalanceVariance: 0.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_604',
      boxValues: {
        'sched1_operating_expenses': 77100.00,
        'sched1_fx_loss': 150.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-009: NWT Technical / Management Service
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-009',
    caseNumber: 9,
    title: 'Non-Resident Withholding Tax on Technical & Cloud Services (10%)',
    description: 'Offshore technical services fee subject to statutory 10% Non-Resident Withholding Tax deduction under Section 55 ITA.',
    category: 'NWT',
    regulatoryReferences: [
      'Income Tax Act (Law No. 25/2019) Section 55(a)(5) (Technical Fees)',
      'MIRA 302 / MIRA 602 Withholding Tax Return Schema'
    ],
    effectiveDate: '2026-06-10',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-009',
        tin: '1000009GST001',
        taxpayerName: 'Fintech Maldives Innovations Pvt Ltd',
        businessType: 'COMPANY',
        sector: 'GENERAL',
        isGstRegistered: true,
        taxYear: 2026
      },
      document: {
        fileName: 'aws_cloud_management_fee.pdf',
        documentType: 'SUPPLIER_INVOICE',
        supplierName: 'Amazon Web Services Inc.',
        invoiceNumber: 'AWS-2026-9021',
        issueDate: '2026-06-10',
        currency: 'USD',
        exchangeRate: 15.42,
        subtotal: 3000.00,
        gstAmount: 0.00,
        totalAmount: 3000.00
      }
    },
    expectedClassifications: {
      documentType: 'SUPPLIER_INVOICE',
      accountingClassification: 'EXPENSE',
      gstTreatment: 'NO_INPUT_TAX',
      incomeTaxTreatment: 'DEDUCTIBLE'
    },
    expectedCalculations: {
      whtGrossAmount: 46260.00, // $3,000 * 15.42
      whtRate: 0.10,
      whtAmountWithheld: 4626.00,
      whtNetAmountPaid: 41634.00,
      journalBalanceVariance: 0.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_302',
      boxValues: {
        'gross_technical_payments': 46260.00,
        'tax_withheld_at_10pct': 4626.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-010: NWT Foreign Contractor
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-010',
    caseNumber: 10,
    title: 'Non-Resident Contractor Withholding Tax (5%)',
    description: 'Payment to non-resident international engineering contractor subject to statutory 5% Withholding Tax under Section 55 ITA.',
    category: 'NWT',
    regulatoryReferences: [
      'Income Tax Act (Law No. 25/2019) Section 55(a)(4) (Payments to Non-Resident Contractors)',
      'MIRA Withholding Tax Regulations'
    ],
    effectiveDate: '2026-07-20',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-010',
        tin: '1000010GST001',
        taxpayerName: 'Island Power Infrastructure Pvt Ltd',
        businessType: 'COMPANY',
        sector: 'GENERAL',
        isGstRegistered: true,
        taxYear: 2026
      },
      document: {
        fileName: 'singapore_contractor_installation.pdf',
        documentType: 'SUPPLIER_INVOICE',
        supplierName: 'Jurong Marine Engineering Pte Ltd',
        invoiceNumber: 'JURONG-2026-08',
        issueDate: '2026-07-20',
        currency: 'USD',
        exchangeRate: 15.42,
        subtotal: 10000.00,
        gstAmount: 0.00,
        totalAmount: 10000.00
      }
    },
    expectedClassifications: {
      documentType: 'SUPPLIER_INVOICE',
      accountingClassification: 'EXPENSE',
      gstTreatment: 'NO_INPUT_TAX',
      incomeTaxTreatment: 'DEDUCTIBLE'
    },
    expectedCalculations: {
      whtGrossAmount: 154200.00,
      whtRate: 0.05,
      whtAmountWithheld: 7710.00,
      whtNetAmountPaid: 146490.00,
      journalBalanceVariance: 0.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_302',
      boxValues: {
        'contractor_gross_payments': 154200.00,
        'tax_withheld_at_5pct': 7710.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-011: NWT Treaty Relief (DTAA)
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-011',
    caseNumber: 11,
    title: 'Double Tax Avoidance Agreement (DTAA) Treaty Relief Exemption',
    description: 'Payment to UAE tax resident possessing verified Tax Residency Certificate (TRC) exempt from domestic withholding under bilateral tax treaty.',
    category: 'NWT',
    regulatoryReferences: [
      'Maldives-UAE Double Taxation Avoidance Agreement Article 12',
      'Income Tax Act (Law No. 25/2019) Section 55 & Section 71 (Treaty Primacy)'
    ],
    effectiveDate: '2026-08-01',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-011',
        tin: '1000011GST001',
        taxpayerName: 'Emirates-Maldives Hospitality Group Pvt Ltd',
        businessType: 'COMPANY',
        sector: 'TOURISM',
        isGstRegistered: true,
        taxYear: 2026
      },
      document: {
        fileName: 'uae_royalty_invoice_trc.pdf',
        documentType: 'SUPPLIER_INVOICE',
        supplierName: 'Gulf Hospitality Holdings FZE',
        invoiceNumber: 'GULF-2026-112',
        issueDate: '2026-08-01',
        currency: 'MVR',
        subtotal: 100000.00,
        gstAmount: 0.00,
        totalAmount: 100000.00
      },
      parameters: {
        hasValidTRC: true,
        treatyCountry: 'UAE',
        treatyRate: 0.00
      }
    },
    expectedClassifications: {
      documentType: 'SUPPLIER_INVOICE',
      accountingClassification: 'EXPENSE',
      incomeTaxTreatment: 'DEDUCTIBLE'
    },
    expectedCalculations: {
      whtGrossAmount: 100000.00,
      whtRate: 0.00,
      whtAmountWithheld: 0.00,
      whtNetAmountPaid: 100000.00,
      journalBalanceVariance: 0.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_302',
      boxValues: {
        'treaty_exempt_gross_payments': 100000.00,
        'tax_withheld': 0.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-012: Corporate Income Tax (MIRA 604 v25.1)
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-012',
    caseNumber: 12,
    title: 'Company Income Tax (MIRA 604 v25.1 Progressive Calculation)',
    description: 'Corporate income tax on MVR 1,300,000 taxable profit asserting MVR 500,000 threshold @ 0% and remaining MVR 800,000 @ 15% = MVR 120,000.',
    category: 'INCOME_TAX',
    regulatoryReferences: [
      'Income Tax Act (Law No. 25/2019) Section 15(a) (Company Income Tax Rate & Threshold)',
      'MIRA 604 Return Form v25.1 Section F'
    ],
    effectiveDate: '2026-12-31',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-012',
        tin: '1000012GST001',
        taxpayerName: 'Premier Commercial Logistics Pvt Ltd',
        businessType: 'COMPANY',
        sector: 'GENERAL',
        isGstRegistered: true,
        taxYear: 2026
      },
      parameters: {
        grossRevenue: 2500000.00,
        deductibleExpenses: 1200000.00,
        nonDeductibleFines: 10000.00,
        capitalAllowanceAdjustment: -10000.00
      }
    },
    expectedClassifications: {
      accountingClassification: 'REVENUE'
    },
    expectedCalculations: {
      grossRevenue: 2500000.00,
      totalExpenses: 1200000.00,
      accountingProfit: 1300000.00,
      taxAdjustmentsAddBack: 10000.00,
      taxAdjustmentsDeductions: 10000.00,
      netTaxAdjustments: 0.00,
      adjustedTaxableProfit: 1300000.00,
      netTaxableIncome: 1300000.00,
      taxLiability: 1200000.00 * 0.15 - 60000.00 // (1.3M - 500k) * 15% = 120,000.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_604',
      boxValues: {
        'sched1_gross_revenue': 2500000.00,
        'sched1_accounting_profit': 1300000.00,
        'secF_taxable_income': 1300000.00,
        'secF_threshold_exempt': 500000.00,
        'secF_tax_at_15pct': 120000.00,
        'secF_total_tax_payable': 120000.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-013: Individual Income Tax (5-Bracket Progressive)
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-013',
    caseNumber: 13,
    title: 'Individual Income Tax 5-Bracket Progressive Calculation',
    description: 'Individual business taxable income of MVR 3,000,000 calculated across all 5 statutory brackets yielding exact MVR 236,400 liability.',
    category: 'INCOME_TAX',
    regulatoryReferences: [
      'Income Tax Act (Law No. 25/2019) Section 12 & 14 (Individual Income Tax Brackets)',
      'MIRA Individual Tax Return Guidelines'
    ],
    effectiveDate: '2026-12-31',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-013',
        tin: '1000013GST001',
        taxpayerName: 'Ahmed Ali (Sole Proprietorship)',
        businessType: 'INDIVIDUAL',
        sector: 'GENERAL',
        isGstRegistered: true,
        taxYear: 2026
      },
      parameters: {
        netTaxableIncome: 3000000.00
      }
    },
    expectedClassifications: {
      accountingClassification: 'REVENUE'
    },
    expectedCalculations: {
      netTaxableIncome: 3000000.00,
      taxLiability: 236400.00,
      individualBracketBreakdown: [
        { bracketIndex: 1, bracketName: '0 to 720k', rate: 0.00, taxableInBracket: 720000.00, taxForBracket: 0.00 },
        { bracketIndex: 2, bracketName: '720k to 1.2M', rate: 0.055, taxableInBracket: 480000.00, taxForBracket: 26400.00 },
        { bracketIndex: 3, bracketName: '1.2M to 1.8M', rate: 0.08, taxableInBracket: 600000.00, taxForBracket: 48000.00 },
        { bracketIndex: 4, bracketName: '1.8M to 2.4M', rate: 0.12, taxableInBracket: 600000.00, taxForBracket: 72000.00 },
        { bracketIndex: 5, bracketName: 'Above 2.4M', rate: 0.15, taxableInBracket: 600000.00, taxForBracket: 90000.00 }
      ]
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_604',
      boxValues: {
        'individual_taxable_income': 3000000.00,
        'individual_bracket1_tax': 0.00,
        'individual_bracket2_tax': 26400.00,
        'individual_bracket3_tax': 48000.00,
        'individual_bracket4_tax': 72000.00,
        'individual_bracket5_tax': 90000.00,
        'individual_total_tax': 236400.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-014: Prior Tax Loss Relief & Loss Carry-Forward
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-014',
    caseNumber: 14,
    title: 'Prior Year Tax Loss Offset and Carry-Forward Lot Relief',
    description: 'Current taxable profit of MVR 600,000 offset by MVR 400,000 prior unabsorbed loss, resulting in MVR 200,000 net taxable income (below threshold = MVR 0 tax).',
    category: 'INCOME_TAX',
    regulatoryReferences: [
      'Income Tax Act (Law No. 25/2019) Section 29 (Loss Relief & 5-Year Carry Forward)',
      'MIRA 604 Schedule 4 (Tax Losses)'
    ],
    effectiveDate: '2026-12-31',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-014',
        tin: '1000014GST001',
        taxpayerName: 'Pinnacle Ventures Maldives Pvt Ltd',
        businessType: 'COMPANY',
        sector: 'GENERAL',
        isGstRegistered: true,
        taxYear: 2026
      },
      parameters: {
        adjustedTaxableProfit: 600000.00,
        priorUnabsorbedLosses: 400000.00,
        lossYear: 2024
      }
    },
    expectedClassifications: {
      accountingClassification: 'REVENUE'
    },
    expectedCalculations: {
      adjustedTaxableProfit: 600000.00,
      lossReliefApplied: 400000.00,
      remainingLossCarriedForward: 0.00,
      netTaxableIncome: 200000.00,
      taxLiability: 0.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_604',
      schedulesIncluded: ['Schedule 4 - Tax Losses'],
      boxValues: {
        'sched4_opening_loss': 400000.00,
        'sched4_loss_utilized': 400000.00,
        'sched4_closing_loss': 0.00,
        'secF_net_taxable_income': 200000.00,
        'secF_tax_payable': 0.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-015: Related-Party Transaction & Transfer Pricing
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-015',
    caseNumber: 15,
    title: 'Related-Party Transaction and Arm\'s Length Transfer Pricing Add-Back',
    description: 'Management fee of MVR 80,000 paid to related entity where arm\'s length benchmark is MVR 50,000; non-arm\'s length MVR 30,000 added back under Section 27 ITA.',
    category: 'TRANSFER_PRICING',
    regulatoryReferences: [
      'Income Tax Act (Law No. 25/2019) Section 27 & Section 68 (Transfer Pricing & Arm\'s Length)',
      'MIRA 604 Schedule 3 (Related Party Transactions)'
    ],
    effectiveDate: '2026-09-30',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-015',
        tin: '1000015GST001',
        taxpayerName: 'Pacific Holdings Maldives Pvt Ltd',
        businessType: 'COMPANY',
        sector: 'GENERAL',
        isGstRegistered: true,
        taxYear: 2026
      },
      document: {
        fileName: 'parent_management_fee.pdf',
        documentType: 'SUPPLIER_INVOICE',
        supplierName: 'Pacific Group Regional HQ Singapore',
        invoiceNumber: 'HQ-2026-09',
        issueDate: '2026-09-30',
        currency: 'MVR',
        subtotal: 80000.00,
        gstAmount: 0.00,
        totalAmount: 80000.00
      },
      relatedPartyData: {
        isRelatedParty: true,
        relationshipType: 'PARENT_SUBSIDIARY',
        actualPricePaid: 80000.00,
        armsLengthPrice: 50000.00,
        adjustmentRequired: 30000.00
      }
    },
    expectedClassifications: {
      documentType: 'SUPPLIER_INVOICE',
      accountingClassification: 'EXPENSE',
      incomeTaxTreatment: 'SPECIAL_TREATMENT'
    },
    expectedCalculations: {
      totalExpenses: 80000.00,
      taxAdjustmentsAddBack: 30000.00,
      netTaxAdjustments: 30000.00,
      journalBalanceVariance: 0.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_604',
      schedulesIncluded: ['Schedule 3 - Related Party Transactions', 'Section C - Tax Adjustments'],
      boxValues: {
        'sched3_related_party_payments': 80000.00,
        'secC_transfer_pricing_addback': 30000.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-016: Controlled Foreign Entity (CFE) Scenario
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-016',
    caseNumber: 16,
    title: 'Controlled Foreign Entity (CFE) Attributable Income Inclusion',
    description: 'Maldivian parent company with 60% ownership in offshore subsidiary with MVR 200,000 passive income; includes MVR 120,000 in domestic taxable base under Section 31 ITA.',
    category: 'CFE',
    regulatoryReferences: [
      'Income Tax Act (Law No. 25/2019) Section 31 (Controlled Foreign Entity Rules)',
      'Income Tax Regulation Chapter 6'
    ],
    effectiveDate: '2026-12-31',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-016',
        tin: '1000016GST001',
        taxpayerName: 'Apex Capital Maldives Pvt Ltd',
        businessType: 'COMPANY',
        sector: 'FINANCIAL',
        isGstRegistered: true,
        taxYear: 2026
      },
      cfeData: {
        foreignEntityName: 'Apex Offshore Investments Ltd',
        jurisdiction: 'BVI',
        ownershipPercentage: 0.60,
        foreignPassiveIncome: 200000.00,
        foreignTaxPaid: 0.00
      }
    },
    expectedClassifications: {
      accountingClassification: 'REVENUE',
      incomeTaxTreatment: 'DEDUCTIBLE'
    },
    expectedCalculations: {
      grossRevenue: 120000.00,
      adjustedTaxableProfit: 120000.00,
      netTaxableIncome: 120000.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_604',
      boxValues: {
        'secB_foreign_cfe_income': 120000.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-017: Accounting & Tax Period Lock State Machine
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-017',
    caseNumber: 17,
    title: 'Period Lock State Machine Enforcement and Mutation Blocking',
    description: 'Verifies state machine transitions (OPEN -> REVIEW -> APPROVED -> LOCKED) and asserts that LOCKED period strictly rejects all financial mutations.',
    category: 'PERIOD_CONTROL',
    regulatoryReferences: [
      'Tax Administration Regulation (Regulation No. 2013/R-45) Section 18',
      'Maldives Accounting Standards Immutability Standards'
    ],
    effectiveDate: '2026-03-31',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-017',
        tin: '1000017GST001',
        taxpayerName: 'Dhiffushi Coral Logistics Pvt Ltd',
        businessType: 'COMPANY',
        sector: 'GENERAL',
        isGstRegistered: true,
        taxYear: 2026
      },
      parameters: {
        periodKey: '2026-Q1',
        initialState: 'OPEN',
        targetLockState: 'LOCKED',
        attemptedMutationAmount: 15000.00
      },
      sessionUser: {
        userId: 'USER-FINANCE-CONTROLLER',
        role: 'FINANCE_CONTROLLER',
        name: 'Mariyam Nasheed'
      }
    },
    expectedClassifications: {
      reviewStatus: 'APPROVED'
    },
    expectedCalculations: {
      journalBalanceVariance: 0.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_205',
      boxValues: {
        'period_lock_status': 'LOCKED'
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      periodState: 'LOCKED',
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-018: Accounting Reversal & Contra Entry
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-018',
    caseNumber: 18,
    title: 'Immutable Journal Reversal and Balanced Contra Entries',
    description: 'Reverses an incorrect MVR 12,000 posting via a balanced contra entry, preserving the original journal and SHA-256 audit hash chain.',
    category: 'ACCOUNTING_AUDIT',
    regulatoryReferences: [
      'Tax Administration Regulation Section 19 (Record Keeping & Audit Trail)',
      'Double-Entry Accounting Contra-Entry Invariants'
    ],
    effectiveDate: '2026-04-15',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-018',
        tin: '1000018GST001',
        taxpayerName: 'Sunland Marine Logistics Pvt Ltd',
        businessType: 'COMPANY',
        sector: 'GENERAL',
        isGstRegistered: true,
        taxYear: 2026
      },
      parameters: {
        originalJournalId: 'JRN-2026-0044',
        originalAmount: 12000.00,
        reversalReason: 'Duplicate invoice entry correction'
      },
      sessionUser: {
        userId: 'USER-SENIOR-ACCOUNTANT',
        role: 'ACCOUNTANT',
        name: 'Hassan Rasheed'
      }
    },
    expectedClassifications: {
      accountingClassification: 'EXPENSE'
    },
    expectedCalculations: {
      journalBalanceVariance: 0.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_205',
      boxValues: {
        'reversal_status': 'REVERSED',
        'net_period_impact': 0.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-019: OCR Correction & Audit Trail Lineage
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-019',
    caseNumber: 19,
    title: 'OCR Extraction Correction with Full Audit Trail & Lineage Preservation',
    description: 'Human-in-the-loop correction of OCR subtotal error (MVR 1,800 misread -> corrected to MVR 18,000), preserving original raw OCR hash and logging audit event.',
    category: 'OCR_CORRECTION',
    regulatoryReferences: [
      'AI Development Rules Section 4.1 & Section 5',
      'Tax Administration Regulation Section 20 (Integrity of Electronic Records)'
    ],
    effectiveDate: '2026-05-20',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-019',
        tin: '1000019GST001',
        taxpayerName: 'Velana Catering Services Pvt Ltd',
        businessType: 'COMPANY',
        sector: 'GENERAL',
        isGstRegistered: true,
        taxYear: 2026
      },
      document: {
        fileName: 'handwritten_vegetable_bulk_receipt.pdf',
        documentType: 'HANDWRITTEN_RECEIPT',
        supplierName: 'Male Local Produce Market St. 4',
        issueDate: '2026-05-20',
        currency: 'MVR',
        subtotal: 1800.00, // OCR Misread
        gstAmount: 0.00,
        totalAmount: 1800.00,
        rawExtractionText: 'Produce receipt total: 1800 (obscured digit)'
      },
      parameters: {
        correctedSubtotal: 18000.00,
        correctedTotal: 18000.00,
        correctionReason: 'Visual inspection of physical paper receipt shows MVR 18,000 total.'
      },
      sessionUser: {
        userId: 'USER-VERIFIED-ACCOUNTANT',
        role: 'ACCOUNTANT',
        name: 'Fathimath Shifa'
      }
    },
    expectedClassifications: {
      documentType: 'HANDWRITTEN_RECEIPT',
      accountingClassification: 'COST_OF_SALES',
      gstTreatment: 'NO_INPUT_TAX',
      incomeTaxTreatment: 'DEDUCTIBLE',
      reviewStatus: 'APPROVED'
    },
    expectedCalculations: {
      subtotal: 18000.00,
      totalAmount: 18000.00,
      claimableInputTax: 0.00,
      journalBalanceVariance: 0.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_205',
      boxValues: {
        'box24_no_input_tax_purchases': 18000.00
      }
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  },

  // -------------------------------------------------------------
  // GOLDEN-020: Full MIRA Statutory Filing Package
  // -------------------------------------------------------------
  {
    caseId: 'GOLDEN-020',
    caseNumber: 20,
    title: 'Comprehensive MIRA Offline Statutory Filing Package with Cryptographic Manifest',
    description: 'Enterprise annual package generation bundling MIRA 604, MIRA 105, MIRA 302, Schedules 1-4, calculation workpapers, and SHA-256 integrity verification.',
    category: 'FILING_PACKAGE',
    regulatoryReferences: [
      'Income Tax Regulation Chapter 2 (MIRA 604 Return Requirements)',
      'GST Regulation Chapter 3 (GST Return Requirements)',
      'MIRA Offline Filing Package Standard v25.1'
    ],
    effectiveDate: '2026-12-31',
    inputs: {
      taxpayer: {
        tenantId: 'TENANT-GOLDEN-020',
        tin: '1000020GST001',
        taxpayerName: 'Maldives Marine Infrastructure Corp Pvt Ltd',
        businessType: 'COMPANY',
        sector: 'GENERAL',
        isGstRegistered: true,
        taxYear: 2026
      },
      parameters: {
        taxYear: 2026,
        fixedTimestamp: '2026-12-31T23:59:59.000Z'
      }
    },
    expectedClassifications: {
      accountingClassification: 'REVENUE'
    },
    expectedCalculations: {
      journalBalanceVariance: 0.00
    },
    expectedReturnValues: {
      primaryForm: 'MIRA_PACKAGE',
      schedulesIncluded: [
        'MIRA 604 Corporate Return',
        'MIRA 105 / 205 GST Statement',
        'MIRA 302 Withholding Statement',
        'Schedule 1 - P&L Statement',
        'Schedule 2 - Capital Allowances',
        'Section C - Tax Adjustments',
        'Calculation Workpapers',
        'Cryptographic Manifest'
      ],
      totalFormsCount: 8
    },
    expectedReconciliationState: {
      isValid: true,
      discrepanciesCount: 0,
      glBalanced: true,
      auditHashChainValid: true,
      isFilingReady: true
    }
  }
];

/**
 * Build the immutable fixtures with SHA-256 digests.
 */
export function buildAuthoritativeGoldenFixtures(): GoldenTaxCaseFixture[] {
  return RAW_GOLDEN_CASES.map(raw => {
    const checksum = computeFixtureDigest(raw);
    const fixture: GoldenTaxCaseFixture = {
      ...raw,
      immutableSha256Checksum: checksum
    };
    return Object.freeze(fixture);
  });
}
