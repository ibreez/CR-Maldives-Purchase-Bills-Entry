import { describe, test, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  FilingPackageGenerator,
  PackageValidator,
  FilingPackageInput,
  FilingTaxpayerProfile
} from '../../src/services/filing';
import { MIRA604AccountingSourceData } from '../../src/regulatory/forms/mira604/v25_1/mappings';
import { Mira205GeneralReturn, Mira206TourismReturn } from '../../src/types/gst';
import { Mira602Return } from '../../src/types/nwt';
import { FixedAssetRecord, TransactionRecord } from '../../src/types/taxEngine';
import { TaxAdjustmentEntry } from '../../src/types/taxAdjustment';
import { TaxLossLot } from '../../src/types/taxLoss';
import * as miraconnectGatewayService from '../../src/services/api/miraconnectGatewayService';

describe('Phase 34 — Offline MIRA Filing Package Generator Acceptance Suite', () => {

  const sampleTaxpayer: FilingTaxpayerProfile = {
    tin: '1002003001',
    taxpayerName: 'Maldives Marine Logistics Pvt Ltd',
    tradeName: 'MML Express',
    businessAddress: 'H. Starry Sky, 4th Floor, Boduthakurufaanu Magu, Male, Maldives',
    entityType: 'COMPANY',
    contactEmail: 'tax@mml.mv',
    contactPhone: '+960 330 1122',
    taxYear: 2026,
    accountingPeriodStart: '2026-01-01',
    accountingPeriodEnd: '2026-12-31',
    accountingDays: 365,
    presentationCurrency: 'MVR',
    sector: 'GENERAL'
  };

  const sampleSourceData: MIRA604AccountingSourceData = {
    taxpayer: {
      tin: sampleTaxpayer.tin,
      taxpayerName: sampleTaxpayer.taxpayerName,
      taxpayerType: 'COMPANY',
      taxYear: 2026,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31',
      businessActivity: 'Marine Logistics',
      presentationCurrency: 'MVR'
    },
    pnl: {
      grossRevenue: 5000000,
      costOfSales: 2000000,
      otherOperatingIncome: 150000,
      otherOperatingExpenses: 1200000
    },
    schedule2Data: {
      nonCurrentAssets: {
        propertyPlantEquipment: 1500000,
        intangibleAssets: 100000,
        otherNonCurrentAssets: 50000
      },
      currentAssets: {
        inventories: 400000,
        tradeAndOtherReceivables: 600000,
        cashAndCashEquivalents: 850000
      },
      equity: {
        shareCapital: 1000000,
        retainedEarnings: 1500000
      },
      nonCurrentLiabilities: {
        longTermBorrowings: 500000
      },
      currentLiabilities: {
        tradeAndOtherPayables: 500000
      }
    },
    taxAdjustments: [
      {
        description: 'Non-business entertainment and fines',
        amount: 50000,
        statutoryReference: 'Section 20(a)',
        category: 'ADD_BACK'
      }
    ],
    capitalAllowances: {
      plantMachinery: 180000
    },
    lossSchedule: {
      priorUnabsorbedLosses: 0,
      lossRecords: []
    },
    prepaymentsAndWithholdings: {
      advanceTaxPaid: 100000,
      interimTax1Paid: 50000,
      nonResidentWhtCredit: 25000
    }
  };

  const sampleMira205: Mira205GeneralReturn = {
    formId: 'RET-2026-205-01',
    formType: 'MIRA_205',
    formTitle: 'General Sector GST Return',
    formVersion: 'v25.1',
    generatedAt: '2026-04-10T10:00:00Z',
    taxpayer: {
      tin: sampleTaxpayer.tin,
      name: sampleTaxpayer.taxpayerName,
      sector: 'GENERAL'
    },
    period: {
      taxYear: 2026,
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      periodName: '2026 Q1'
    },
    sectionA_Supplies: {
      box1_StandardRatedSupplies8Pct: { taxableValue: 1250000, outputTax: 100000 },
      box2_ZeroRatedSupplies: 0,
      box3_ExemptSupplies: 0,
      box4_TotalSuppliesValue: 1250000,
      box5_TotalOutputTax: 100000,
      box6_OutputTaxAdjustments: 0,
      box7_NetOutputTax: 100000
    },
    sectionB_Purchases: {
      box8_StandardRatedPurchases: { taxableValue: 500000, inputTax: 40000 },
      box9_CapitalPurchases: { taxableValue: 100000, inputTax: 8000 },
      box10_BlockedInputTax: { taxableValue: 0, blockedTax: 0 },
      box11_MixedUseApportionment: { totalMixedValue: 0, grossInputTax: 0, apportionmentRatio: 1, claimableInputTax: 0 },
      box12_TotalClaimableInputTax: 48000,
      box13_InputTaxAdjustments: 0,
      box14_NetClaimableInputTax: 48000
    },
    sectionC_Calculation: {
      box15_NetGstPayableOrRefundable: 52000,
      box16_PreviousExcessCreditsCarriedForward: 0,
      box17_FinalAmountPayableOrRefundable: 52000
    },
    regulatoryTraceability: {
      ruleId: 'RULE-GST-GENERAL-V25.1',
      regulatoryVersion: 'v25.1',
      legalReference: 'Maldives Goods and Services Tax Act',
      checksum: 'abc123'
    }
  };

  const sampleMira206: Mira206TourismReturn = {
    formId: 'RET-2026-206-01',
    formType: 'MIRA_206',
    formTitle: 'Tourism Sector GST Return (TGST)',
    formVersion: 'v25.1',
    generatedAt: '2026-02-15T10:00:00Z',
    taxpayer: {
      tin: sampleTaxpayer.tin,
      name: sampleTaxpayer.taxpayerName,
      operatingLicenseNumber: 'MOT-LIC-2026-09',
      sector: 'TOURISM'
    },
    period: {
      taxYear: 2026,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      periodName: '2026 January'
    },
    sectionA_Supplies: {
      box1A_TourismSupplies16Pct: { taxableValue: 0, outputTax: 0 },
      box1B_TourismSupplies17Pct: { taxableValue: 200000, outputTax: 34000 },
      box2_ZeroRatedTourismSupplies: 0,
      box3_ExemptTourismSupplies: 0,
      box4_TotalTourismSuppliesValue: 200000,
      box5_TotalTgstOutputTax: 34000,
      box6_TgstOutputAdjustments: 0,
      box7_NetTgstOutputTax: 34000
    },
    sectionB_Purchases: {
      box8_TourismOperationalPurchases: { taxableValue: 50000, inputTax: 8500 },
      box9_TourismCapitalPurchases: { taxableValue: 0, inputTax: 0 },
      box10_BlockedInputTax: { taxableValue: 0, blockedTax: 0 },
      box11_TotalClaimableTgstInputTax: 8500,
      box12_TgstInputAdjustments: 0,
      box13_NetClaimableTgstInputTax: 8500
    },
    sectionC_Calculation: {
      box14_NetTgstPayableOrRefundable: 25500,
      box15_PreviousExcessCreditsCarriedForward: 0,
      box16_FinalTgstPayableOrRefundable: 25500
    },
    regulatoryTraceability: {
      applicableRules: ['RULE-TGST-V25.1'],
      regulatoryVersion: 'v25.1',
      legalReference: 'Maldives Goods and Services Tax Act (Tourism Sector)',
      checksum: 'tgst123'
    }
  };

  const sampleMira602: Mira602Return = {
    formId: 'MIRA602-2026-02',
    formType: 'MIRA602',
    formVersion: 'v25.1',
    generatedAt: '2026-03-01T10:00:00Z',
    status: 'READY_FOR_FILING',
    filingDueDate: '2026-03-15',
    taxpayer: {
      tin: sampleTaxpayer.tin,
      businessName: sampleTaxpayer.taxpayerName
    },
    period: {
      taxYear: 2026,
      month: 2,
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      periodName: '2026 February',
      filingDueDate: '2026-03-15',
      status: 'OPEN'
    },
    totalGrossPaymentsMvr: 100000,
    totalNwtWithheldMvr: 10000,
    totalTransactions: 1,
    categorySummaries: [
      {
        category: 'TECHNICAL_SERVICES',
        categoryName: 'Management & Technical Fees',
        statutoryRate: 0.10,
        transactionCount: 1,
        totalGrossAmountMvr: 100000,
        totalNwtWithheldMvr: 10000
      }
    ],
    scheduleOfPayees: [
      {
        lineNo: 1,
        payeeName: 'Global Maritime Advisory Pte Ltd',
        payeeCountry: 'Singapore',
        category: 'TECHNICAL_SERVICES',
        categoryDescription: 'Technical Services',
        withholdingDate: '2026-02-15',
        grossAmountMvr: 100000,
        nwtRate: 0.10,
        nwtWithheldMvr: 10000,
        isGrossedUp: false,
        dtaaReliefApplied: false
      }
    ],
    regulatoryTraceability: {
      governingAct: 'Maldives Income Tax Act (Act No. 25/2019) Section 55',
      ruleIds: ['RULE-NWT-TECH-SERVICES'],
      statutoryChecksum: 'nwt-chk-123'
    }
  };

  const sampleFixedAssets: FixedAssetRecord[] = [
    {
      assetId: 'FA-2026-01',
      entityId: sampleTaxpayer.tin,
      outletId: 'MAIN',
      assetName: 'Heavy Transport Vessel Engine',
      assetClass: 'Plant & equipment / Machinery',
      acquisitionDate: '2026-01-10',
      costPrice: 500000,
      cost: 500000,
      miraCapitalAllowanceRate: 20,
      openingWDV: 0,
      additionsInYear: 500000,
      disposalsInYear: 0,
      capitalAllowanceClaimed: 100000,
      closingWDV: 400000,
      taxYear: 2026,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31'
    }
  ];

  const sampleTaxAdjustments: TaxAdjustmentEntry[] = [
    {
      id: 'ADJ-2026-01',
      tenantId: 'TENANT-MALDIVES-CORP',
      taxYear: 2026,
      sourceJournalId: 'JRN-2026-88',
      sourceJournalLineId: 'LINE-1',
      supportingDocument: 'PORT-PENALTY-2026-01',
      accountCode: 'EXP-8010',
      accountName: 'Fines & Penalties',
      adjustmentCode: 'ADJ-FINES',
      category: 'FINES_PENALTIES',
      direction: 'ADD_BACK',
      ruleId: 'RULE-ADJ-SEC22-FINES',
      legalReference: 'Section 22(a)',
      description: 'Traffic violation and maritime port penalty',
      amount: 25000,
      reviewStatus: 'APPROVED',
      approvedBy: 'CHIEF_TAX_OFFICER',
      approvedAt: '2026-03-01T12:00:00Z',
      createdAt: '2026-03-01T10:00:00Z',
      updatedAt: '2026-03-01T12:00:00Z'
    }
  ];

  const sampleLossLots: TaxLossLot[] = [
    {
      id: 'LOT-2024-001',
      tenantId: 'TENANT-MALDIVES-CORP',
      originTaxYear: 2024,
      originalAmount: 150000,
      utilisedAmount: 50000,
      remainingAmount: 100000,
      expiryTaxYear: 2029,
      status: 'ACTIVE',
      ruleId: 'RULE-SEC30-LOSS-RELIEF',
      legalReference: 'Maldives Income Tax Act (Act No. 25/2019) Section 30',
      createdAt: '2025-01-15T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    }
  ];

  const sampleTransactions: TransactionRecord[] = [
    {
      transactionId: 'TX-2026-001',
      sourceType: 'invoice',
      sourceId: 'INV-2026-001',
      entityId: sampleTaxpayer.tin,
      outletId: 'MAIN',
      transactionDate: '2026-03-15',
      description: 'Marine freight transport fee',
      accountingCategory: 'revenue.freight',
      miraCategory: 'revenue',
      amount: 1250000,
      gstAmount: 100000,
      totalAmount: 1350000,
      accountingTreatment: 'REVENUE',
      incomeTaxTreatment: 'DEDUCTIBLE',
      gstTreatment: 'STANDARD_RATED',
      taxYear: 2026,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31',
      reviewStatus: 'APPROVED',
      auditHistory: [],
      createdAt: '2026-03-15T00:00:00Z'
    }
  ];

  const sampleReconContext = {
    entityId: sampleTaxpayer.tin,
    taxYear: 2026,
    glTransactions: sampleTransactions,
    gstReturns: [],
    fixedAssets: sampleFixedAssets,
    taxAdjustments: sampleTaxAdjustments,
    schedulesInput: {
      taxpayerType: 'COMPANY' as const,
      taxYear: 2026,
      schedule2Data: sampleSourceData.schedule2Data
    }
  };

  test('Acceptance Test 1: Package Generates with complete directory structure & manifest', () => {
    const input: FilingPackageInput = {
      tenantId: 'TENANT-MALDIVES-CORP',
      taxpayer: sampleTaxpayer,
      taxYear: 2026,
      fixedTimestamp: '2026-08-25T12:00:00.000Z',
      sourceData: sampleSourceData,
      mira205Return: sampleMira205,
      mira206Return: sampleMira206,
      mira602Return: sampleMira602,
      fixedAssets: sampleFixedAssets,
      taxAdjustments: sampleTaxAdjustments,
      taxLossLots: sampleLossLots,
      transactions: sampleTransactions,
      reconciliationContext: sampleReconContext
    };

    const pkg = FilingPackageGenerator.generatePackage(input);

    expect(pkg).toBeDefined();
    expect(pkg.manifest).toBeDefined();
    expect(pkg.hashes).toBeDefined();
    expect(pkg.files).toBeDefined();

    // 1. Check Root Manifest Attributes
    const manifest = pkg.manifest;
    expect(manifest.tenant).toBe('TENANT-MALDIVES-CORP');
    expect(manifest.TIN).toBe('1002003001');
    expect(manifest.taxpayer.taxpayerName).toBe('Maldives Marine Logistics Pvt Ltd');
    expect(manifest.taxYear).toBe(2026);
    expect(manifest.accountingPeriod.startDate).toBe('2026-01-01');
    expect(manifest.accountingPeriod.endDate).toBe('2026-12-31');
    expect(manifest.accountingPeriod.presentationCurrency).toBe('MVR');

    // 2. Check Form Versions & Regulatory Versions
    expect(manifest.formVersions.MIRA604).toBe('v25.1');
    expect(manifest.formVersions.MIRA205).toBe('v25.1');
    expect(manifest.formVersions.MIRA206).toBe('v25.1');
    expect(manifest.formVersions.MIRA602).toBe('v25.1');
    expect(manifest.regulatoryVersions).toContain('v25.1');

    // 3. Mandatory Statutory Filing Notice Checks
    expect(manifest.notice).toBe('Generated for taxpayer review and filing.');
    expect(manifest.submissionState.isSubmitted).toBe(false);
    expect(manifest.submissionState.disclaimer).toContain('Generated for taxpayer review and filing.');
    expect(manifest.submissionState.disclaimer).not.toContain('Filed with MIRA');
    expect(manifest.submissionState.submissionStatus).toBe('OFFLINE_PACKAGE_GENERATED_FOR_REVIEW');

    // 4. Verify Files Structure
    expect(pkg.files.has('manifest.json')).toBe(true);
    expect(pkg.files.has('hashes.json')).toBe(true);
    expect(pkg.files.has('MIRA604.pdf')).toBe(true);
    expect(pkg.files.has('MIRA205.pdf')).toBe(true);
    expect(pkg.files.has('MIRA206.pdf')).toBe(true);
    expect(pkg.files.has('MIRA602.pdf')).toBe(true);

    // Schedules
    expect(pkg.files.has('schedules/schedule-2-balance-sheet.json')).toBe(true);
    expect(pkg.files.has('schedules/schedule-2-balance-sheet.pdf')).toBe(true);
    expect(pkg.files.has('schedules/schedule-3-net-worth.json')).toBe(true);
    expect(pkg.files.has('schedules/schedule-4-related-party.json')).toBe(true);
    expect(pkg.files.has('schedules/schedule-5-cfe.json')).toBe(true);

    // Tax calculation
    expect(pkg.files.has('tax-calculation/tax-computation.json')).toBe(true);
    expect(pkg.files.has('tax-calculation/tax-adjustments.json')).toBe(true);
    expect(pkg.files.has('tax-calculation/capital-allowance.json')).toBe(true);
    expect(pkg.files.has('tax-calculation/tax-loss-lots.json')).toBe(true);

    // Reconciliation
    expect(pkg.files.has('reconciliation/reconciliation-report.json')).toBe(true);
    expect(pkg.files.has('reconciliation/reconciliation-report.pdf')).toBe(true);

    // Supporting Documents
    expect(pkg.files.has('supporting-documents/ledger-extract.csv')).toBe(true);
    expect(pkg.files.has('supporting-documents/fixed-asset-register.json')).toBe(true);
    expect(pkg.files.has('supporting-documents/audit-trail.json')).toBe(true);
  });

  test('Acceptance Test 2: Hashes Verify & Cryptographic Integrity', () => {
    const input: FilingPackageInput = {
      tenantId: 'TENANT-MALDIVES-CORP',
      taxpayer: sampleTaxpayer,
      taxYear: 2026,
      fixedTimestamp: '2026-08-25T12:00:00.000Z',
      sourceData: sampleSourceData,
      mira205Return: sampleMira205,
      mira206Return: sampleMira206,
      mira602Return: sampleMira602,
      fixedAssets: sampleFixedAssets,
      taxAdjustments: sampleTaxAdjustments,
      taxLossLots: sampleLossLots,
      transactions: sampleTransactions
    };

    const pkg = FilingPackageGenerator.generatePackage(input);

    // Every file hash in manifest.documentHashes must strictly equal SHA-256 of the buffer
    for (const [relPath, expectedHash] of Object.entries(pkg.manifest.documentHashes)) {
      const fileEntry = pkg.files.get(relPath);
      expect(fileEntry).toBeDefined();
      const actualHash = crypto.createHash('sha256').update(fileEntry!.content).digest('hex');
      expect(actualHash).toBe(expectedHash);
    }

    // Hashes in hashes.json must match
    const hashesJsonEntry = pkg.files.get('hashes.json')!;
    const parsedHashes = JSON.parse(hashesJsonEntry.content.toString('utf-8'));
    expect(parsedHashes.algorithm).toBe('SHA-256');
    expect(parsedHashes.packageChecksum).toBe(pkg.manifest.packageChecksum);

    // Run verification utility
    const verification = FilingPackageGenerator.verifyPackageIntegrity(pkg);
    expect(verification.isValid).toBe(true);
    expect(verification.mismatches).toHaveLength(0);
    expect(verification.verifiedFilesCount).toBeGreaterThan(10);
  });

  test('Acceptance Test 3: Package can be regenerated deterministically for same data and version', () => {
    const fixedTimestamp = '2026-08-25T14:30:00.000Z';

    const input1: FilingPackageInput = {
      tenantId: 'TENANT-MALDIVES-CORP',
      taxpayer: sampleTaxpayer,
      taxYear: 2026,
      fixedTimestamp,
      sourceData: sampleSourceData,
      mira205Return: sampleMira205,
      mira206Return: sampleMira206,
      mira602Return: sampleMira602,
      fixedAssets: sampleFixedAssets,
      taxAdjustments: sampleTaxAdjustments,
      taxLossLots: sampleLossLots,
      transactions: sampleTransactions
    };

    const input2: FilingPackageInput = {
      ...input1
    };

    const pkg1 = FilingPackageGenerator.generatePackage(input1);
    const pkg2 = FilingPackageGenerator.generatePackage(input2);

    // Check root packageChecksum equality
    expect(pkg1.manifest.packageChecksum).toBe(pkg2.manifest.packageChecksum);
    expect(pkg1.hashes.packageChecksum).toBe(pkg2.hashes.packageChecksum);

    // Check individual file hashes equality
    expect(pkg1.manifest.documentHashes).toEqual(pkg2.manifest.documentHashes);

    // Check byte-for-byte content equality
    for (const [relPath, file1] of pkg1.files.entries()) {
      const file2 = pkg2.files.get(relPath);
      expect(file2).toBeDefined();
      expect(file1.content.equals(file2!.content)).toBe(true);
      expect(file1.sha256).toBe(file2!.sha256);
    }
  });

  test('Acceptance Test 4: Missing mandatory form data blocks package generation', () => {
    // 1. Missing TIN
    const invalidInput1: FilingPackageInput = {
      tenantId: 'TENANT-001',
      taxpayer: {
        ...sampleTaxpayer,
        tin: ''
      },
      taxYear: 2026
    };
    expect(() => FilingPackageGenerator.generatePackage(invalidInput1)).toThrow(/Mandatory statutory field missing.*TIN/i);

    // 2. Missing Taxpayer Name
    const invalidInput2: FilingPackageInput = {
      tenantId: 'TENANT-001',
      taxpayer: {
        ...sampleTaxpayer,
        taxpayerName: '   '
      },
      taxYear: 2026
    };
    expect(() => FilingPackageGenerator.generatePackage(invalidInput2)).toThrow(/Mandatory statutory field missing.*Legal Entity Name/i);

    // 3. Missing Tenant ID
    const invalidInput3: FilingPackageInput = {
      tenantId: '',
      taxpayer: sampleTaxpayer,
      taxYear: 2026
    };
    expect(() => FilingPackageGenerator.generatePackage(invalidInput3)).toThrow(/Mandatory field missing.*Tenant ID/i);

    // 4. Invalid Accounting Period Dates
    const invalidInput4: FilingPackageInput = {
      tenantId: 'TENANT-001',
      taxpayer: {
        ...sampleTaxpayer,
        accountingPeriodStart: '2026-12-31',
        accountingPeriodEnd: '2026-01-01'
      },
      taxYear: 2026
    };
    expect(() => FilingPackageGenerator.generatePackage(invalidInput4)).toThrow(/Accounting period start date.*cannot be later than end date/i);

    // 5. Missing mandatory P&L revenue in source data
    const invalidInput5: FilingPackageInput = {
      tenantId: 'TENANT-001',
      taxpayer: sampleTaxpayer,
      taxYear: 2026,
      sourceData: {
        ...sampleSourceData,
        pnl: {
          ...sampleSourceData.pnl!,
          grossRevenue: undefined as any
        }
      }
    };
    expect(() => FilingPackageGenerator.generatePackage(invalidInput5)).toThrow(/Mandatory financial field missing.*Gross Revenue/i);
  });

  test('Acceptance Test 5: MIRAconnect is NOT called anywhere during offline filing package generation', () => {
    // Spy on MIRAconnect gateway methods to guarantee zero transmission attempts
    const submitTaxReturnSpy = vi.spyOn(miraconnectGatewayService, 'submitTaxReturn');
    const preparePayloadSpy = vi.spyOn(miraconnectGatewayService, 'prepareSubmissionPayload');

    const input: FilingPackageInput = {
      tenantId: 'TENANT-MALDIVES-CORP',
      taxpayer: sampleTaxpayer,
      taxYear: 2026,
      fixedTimestamp: '2026-08-25T12:00:00.000Z',
      sourceData: sampleSourceData,
      mira205Return: sampleMira205,
      mira206Return: sampleMira206,
      mira602Return: sampleMira602,
      fixedAssets: sampleFixedAssets,
      taxAdjustments: sampleTaxAdjustments,
      taxLossLots: sampleLossLots,
      transactions: sampleTransactions
    };

    const pkg = FilingPackageGenerator.generatePackage(input);

    expect(pkg).toBeDefined();

    // Verify zero invocations to MIRAconnect
    expect(submitTaxReturnSpy).not.toHaveBeenCalled();
    expect(preparePayloadSpy).not.toHaveBeenCalled();

    // Ensure manifest guarantees offline state
    expect(pkg.manifest.submissionState.isSubmitted).toBe(false);
    expect(pkg.manifest.submissionState.transmissionAttempted).toBe(false);
    expect(pkg.manifest.submissionState.submissionStatus).toBe('OFFLINE_PACKAGE_GENERATED_FOR_REVIEW');
  });

  test('Acceptance Test 6: Physical Export to Disk writes all files correctly', () => {
    const tempExportDir = path.join(process.cwd(), 'temp-test-filing-package');

    const input: FilingPackageInput = {
      tenantId: 'TENANT-MALDIVES-CORP',
      taxpayer: sampleTaxpayer,
      taxYear: 2026,
      fixedTimestamp: '2026-08-25T12:00:00.000Z',
      sourceData: sampleSourceData,
      mira205Return: sampleMira205,
      options: {
        customOutputDir: tempExportDir
      }
    };

    try {
      const pkg = FilingPackageGenerator.generatePackage(input);

      expect(pkg.outputDirectory).toBe(path.resolve(tempExportDir));
      expect(fs.existsSync(tempExportDir)).toBe(true);
      expect(fs.existsSync(path.join(tempExportDir, 'manifest.json'))).toBe(true);
      expect(fs.existsSync(path.join(tempExportDir, 'hashes.json'))).toBe(true);
      expect(fs.existsSync(path.join(tempExportDir, 'MIRA604.pdf'))).toBe(true);
      expect(fs.existsSync(path.join(tempExportDir, 'MIRA205.pdf'))).toBe(true);
      expect(fs.existsSync(path.join(tempExportDir, 'schedules', 'schedule-2-balance-sheet.json'))).toBe(true);
      expect(fs.existsSync(path.join(tempExportDir, 'tax-calculation', 'tax-computation.json'))).toBe(true);
    } finally {
      // Clean up test temp files
      if (fs.existsSync(tempExportDir)) {
        fs.rmSync(tempExportDir, { recursive: true, force: true });
      }
    }
  });

});
