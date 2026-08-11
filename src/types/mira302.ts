import { TransactionRecord, Transaction } from './taxEngine';

export type NonResidentPaymentCategory =
  | 'ROYALTY_SOFTWARE'
  | 'TECHNICAL_MANAGEMENT'
  | 'CONSULTANCY'
  | 'RENT_PROPERTY'
  | 'INSURANCE_PREMIUM'
  | 'OTHER_NON_RESIDENT';

export interface WhtPeriod {
  periodId: string;             // e.g. "2026-M01"
  taxpayerName: string;
  tin: string;
  periodStart: string;          // YYYY-MM-DD
  periodEnd: string;            // YYYY-MM-DD
  taxYear: number;
}

export interface NonResidentPayee {
  payeeId: string;
  payeeName: string;            // e.g. "Amazon Web Services Inc.", "Adobe Systems", "Foreign Consultant Ltd"
  tinOrTaxId?: string;
  countryCode: string;          // e.g. "US", "SG", "IN", "AE", "GB"
  foreignAddress: string;
  isDtaaReliefEligible?: boolean;
  dtaaTreatyRate?: number;      // e.g. 0.05 (5%) or 0.00 (0%) override
  dtaaCertificateReference?: string;
}

export interface WhtScheduleItem {
  transactionId: string;
  transactionDate: string;
  payeeName: string;
  countryCode: string;
  foreignAddress: string;
  paymentCategory: NonResidentPaymentCategory;
  description: string;
  contractedAmount: number;     // Amount paid or agreed
  isGrossedUp: boolean;         // True if net-of-tax payment terms
  grossPaymentAmount: number;   // Base gross amount for WHT calculation
  whtRatePercentage: number;    // Statutory rate (10%) or DTAA rate percentage (e.g. 5%)
  whtAmountWithheld: number;    // Calculated WHT amount
  netAmountPaidToVendor: number;
  dtaaReliefApplied: boolean;
  dtaaCertificateRef?: string;
}

export interface Mira302WhtReturn {
  formId: string;               // e.g. MIRA302-2026-M01-1000200300
  formVersion: 'V25.1';
  submissionStatus: 'DRAFT' | 'READY_FOR_FILING' | 'SUBMITTED';
  generatedAt: string;
  whtPeriod: WhtPeriod;

  // Itemized schedule of payments made to non-residents
  scheduleOfPayments: WhtScheduleItem[];

  // Aggregates
  totalGrossPayments: number;
  totalWhtWithheld: number;
  totalNetPayments: number;
  itemCount: number;

  verificationChecksum: string;
}

export type AnyTransaction = TransactionRecord | Transaction;
