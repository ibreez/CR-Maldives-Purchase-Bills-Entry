import { TransactionRecord, Transaction } from './taxEngine';

export type GstRegime = 'GENERAL_GST' | 'TOURISM_GST';

export type InputGstEligibility = 'CLAIMABLE' | 'NON_CLAIMABLE' | 'BLOCKED' | 'PRO_RATA';

export interface GstPeriod {
  periodId: string;           // e.g. "2026-M01" or "2026-Q1"
  taxpayerName: string;
  tin: string;
  regime: GstRegime;          // 'GENERAL_GST' (8%) or 'TOURISM_GST' (17%)
  periodStart: string;        // YYYY-MM-DD
  periodEnd: string;          // YYYY-MM-DD
  taxYear: number;
}

export interface Mira105OutputSalesBox {
  box1_StandardRatedSales: number;  // Gross standard-rated sales
  box2_ZeroRatedSales: number;       // Zero-rated sales
  box3_ExemptSales: number;          // Exempt sales
  totalOutputSales: number;          // Box 1 + Box 2 + Box 3
  box4_OutputGstCollected: number;   // Total Output GST collected
}

export interface Mira105InputPurchasesBox {
  box5_TotalPurchases: number;            // Total purchases (taxable + exempt)
  box6_TaxablePurchases: number;          // Purchases with claimable/pro-rata GST
  box7_GrossInputGstPaid: number;         // Total input GST paid on purchases
  box8_ClaimableInputGst: number;         // Claimable input GST after pro-rata & block rules
  nonClaimableInputGst: number;           // Blocked / non-deductible input GST
  proRataClaimableRatio: number;          // Taxable / Total Sales ratio (0.00 to 1.00)
  proRataAdjustmentAmount: number;       // Difference between gross input GST and pro-rata claim
}

export interface Mira105CapitalPurchasesBox {
  box10_CapitalPurchasesAmount: number;   // Total capital asset purchases
  box10_CapitalPurchasesInputGst: number; // Claimable input GST on capital purchases
}

export interface Mira105GstReturn {
  formId: string;             // e.g. MIRA105-2026-M01-1000200300
  formVersion: 'V25.1';
  submissionStatus: 'DRAFT' | 'READY_FOR_FILING' | 'SUBMITTED';
  generatedAt: string;
  gstPeriod: GstPeriod;

  // Box 1–4: Output Sales & Output GST Collected
  outputSales: Mira105OutputSalesBox;

  // Box 5–8: Input Purchases & Claimable Input GST
  inputPurchases: Mira105InputPurchasesBox;

  // Box 9: Net GST Payable or Claimable Refund
  box9_NetGstPayableOrRefundable: number; // Positive = Payable, Negative = Refundable

  // Box 10: Capital Purchase Input GST Breakdown
  capitalPurchases: Mira105CapitalPurchasesBox;

  verificationChecksum: string;
}

export type AnyTransaction = TransactionRecord | Transaction;
