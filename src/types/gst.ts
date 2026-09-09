import { Decimal } from '@prisma/client/runtime/library';

export type GstSector = 'GENERAL' | 'TOURISM';

export type GstTransactionType =
  | 'OUTPUT_TAX'
  | 'INPUT_TAX'
  | 'CAPITAL_INPUT_TAX'
  | 'BLOCKED_INPUT_TAX'
  | 'EXEMPT_SUPPLY'
  | 'ZERO_RATED_SUPPLY'
  | 'OUT_OF_SCOPE'
  | 'CREDIT_NOTE_ADJUSTMENT'
  | 'DEBIT_NOTE_ADJUSTMENT';

export type GstTreatment =
  | 'STANDARD_RATED'
  | 'ZERO_RATED'
  | 'EXEMPT'
  | 'OUT_OF_SCOPE'
  | 'GENERAL_INPUT_TAX'
  | 'CAPITAL_INPUT_TAX'
  | 'BLOCKED_INPUT_TAX'
  | 'MIXED_USE_INPUT_TAX';

export interface GstRateResolution {
  rate: number;
  ratePercentage: number;
  ruleId: string;
  version: string;
  legalReference: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  sector: GstSector;
}

export interface GstTransactionInput {
  tenantId: string;
  invoiceId?: string;
  gstPeriodId?: string;
  transactionDate: string | Date;
  sector: GstSector;
  transactionType: GstTransactionType;
  treatment: GstTreatment;
  description: string;
  taxableAmount: number;
  gstRate?: number;
  gstAmount?: number;
  isInputTaxClaimable?: boolean;
  isCapitalAsset?: boolean;
  apportionmentRatio?: number; // 0.0 to 1.0 for mixed use
  sourceDocumentNumber?: string;
}

export interface GstPeriodSummary {
  periodId: string;
  tenantId: string;
  sector: GstSector;
  periodName: string;
  startDate: string;
  endDate: string;
  taxYear: number;
  taxpayerName: string;
  taxpayerTin: string;
  status: 'OPEN' | 'FILED' | 'LOCKED';
}

export interface Mira205GeneralReturn {
  formId: string;
  formType: 'MIRA_205';
  formTitle: 'General Sector GST Return';
  formVersion: 'v25.1';
  generatedAt: string;
  taxpayer: {
    tin: string;
    name: string;
    businessAddress?: string;
    sector: 'GENERAL';
  };
  period: {
    periodName: string;
    startDate: string;
    endDate: string;
    taxYear: number;
  };
  // Section A: Supplies (Output Tax)
  sectionA_Supplies: {
    box1_StandardRatedSupplies8Pct: {
      taxableValue: number;
      outputTax: number;
    };
    box2_ZeroRatedSupplies: number;
    box3_ExemptSupplies: number;
    box4_TotalSuppliesValue: number; // Box 1 + Box 2 + Box 3
    box5_TotalOutputTax: number;    // Output Tax from Box 1
    box6_OutputTaxAdjustments: number; // Debit / Credit note adjustments
    box7_NetOutputTax: number;       // Box 5 + Box 6
  };
  // Section B: Purchases (Input Tax)
  sectionB_Purchases: {
    box8_StandardRatedPurchases: {
      taxableValue: number;
      inputTax: number;
    };
    box9_CapitalPurchases: {
      taxableValue: number;
      inputTax: number;
    };
    box10_BlockedInputTax: {
      taxableValue: number;
      blockedTax: number;
    };
    box11_MixedUseApportionment: {
      totalMixedValue: number;
      grossInputTax: number;
      apportionmentRatio: number; // Taxable / Total turnover ratio
      claimableInputTax: number;
    };
    box12_TotalClaimableInputTax: number; // Box 8 + Box 9 + Box 11 claimable
    box13_InputTaxAdjustments: number;
    box14_NetClaimableInputTax: number; // Box 12 + Box 13
  };
  // Section C: Net GST Payable / (Refundable)
  sectionC_Calculation: {
    box15_NetGstPayableOrRefundable: number; // Box 7 - Box 14 (Positive = Payable, Negative = Refundable)
    box16_PreviousExcessCreditsCarriedForward: number;
    box17_FinalAmountPayableOrRefundable: number; // Box 15 - Box 16
  };
  regulatoryTraceability: {
    ruleId: string;
    regulatoryVersion: string;
    legalReference: string;
    checksum: string;
  };
}

export interface Mira206TourismReturn {
  formId: string;
  formType: 'MIRA_206';
  formTitle: 'Tourism Sector GST Return (TGST)';
  formVersion: 'v25.1';
  generatedAt: string;
  taxpayer: {
    tin: string;
    name: string;
    tourismEstablishmentName?: string;
    operatingLicenseNumber?: string;
    sector: 'TOURISM';
  };
  period: {
    periodName: string;
    startDate: string;
    endDate: string;
    taxYear: number;
  };
  // Section A: Tourism Sector Supplies (TGST Output)
  sectionA_Supplies: {
    box1A_TourismSupplies16Pct: {
      taxableValue: number;
      outputTax: number;
    }; // Applied through 2025-06-30
    box1B_TourismSupplies17Pct: {
      taxableValue: number;
      outputTax: number;
    }; // Applied from 2025-07-01
    box2_ZeroRatedTourismSupplies: number;
    box3_ExemptTourismSupplies: number;
    box4_TotalTourismSuppliesValue: number;
    box5_TotalTgstOutputTax: number; // Tax(1A) + Tax(1B)
    box6_TgstOutputAdjustments: number;
    box7_NetTgstOutputTax: number;
  };
  // Section B: Tourism Sector Purchases (Input Tax)
  sectionB_Purchases: {
    box8_TourismOperationalPurchases: {
      taxableValue: number;
      inputTax: number;
    };
    box9_TourismCapitalPurchases: {
      taxableValue: number;
      inputTax: number;
    };
    box10_BlockedInputTax: {
      taxableValue: number;
      blockedTax: number;
    };
    box11_TotalClaimableTgstInputTax: number; // Box 8 + Box 9
    box12_TgstInputAdjustments: number;
    box13_NetClaimableTgstInputTax: number;
  };
  // Section C: Net TGST Payable / (Refundable)
  sectionC_Calculation: {
    box14_NetTgstPayableOrRefundable: number; // Box 7 - Box 13
    box15_PreviousExcessCreditsCarriedForward: number;
    box16_FinalTgstPayableOrRefundable: number;
  };
  regulatoryTraceability: {
    applicableRules: string[];
    regulatoryVersion: string;
    legalReference: string;
    checksum: string;
  };
}

export interface GstGlReconciliation {
  periodStart: string;
  periodEnd: string;
  sector: GstSector;
  gstTransactionsTotalOutputTax: number;
  gstTransactionsTotalInputTax: number;
  glOutputTaxBalance: number; // Account 2100 (Credit normal)
  glInputTaxBalance: number;  // Account 1400 (Debit normal)
  outputTaxVariance: number;
  inputTaxVariance: number;
  isReconciled: boolean;
  discrepancies: string[];
}
