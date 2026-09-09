/**
 * Non-Resident Withholding Tax (NWT) Domain Types & MIRA 602 Return Definitions
 *
 * Governed by Maldives Income Tax Act (Act No. 25/2019) Section 55 (Non-Resident Withholding Tax)
 * and MIRA Tax Rulings / Guidelines for Form MIRA 602.
 */

export type NwtCategory =
  | 'RENT_IMMOVABLE_PROPERTY'   // 10% - Rent of Maldivian immovable property
  | 'ROYALTY'                   // 10% - Royalties, IP, software licenses, copyright
  | 'QUALIFYING_INTEREST'       // 10% - Qualifying interest paid to non-residents
  | 'DIVIDEND'                  // 10% - Dividends paid to non-resident shareholders
  | 'TECHNICAL_SERVICES'        // 10% - Fees for Technical Services (FTS), IT, management, engineering
  | 'COMMISSION'                // 10% - Commissions for services provided in Maldives
  | 'PUBLIC_ENTERTAINER'        // 10% - Public entertainer, artist, musician, sports performances
  | 'RESEARCH_DEVELOPMENT'      // 10% - Research & Development payments
  | 'INSURANCE_PREMIUM'         // 10% - Insurance and reinsurance premiums
  | 'NON_RESIDENT_CONTRACTOR'   // 5%  - Payments to non-resident contractors (Sec 55(a))
  | 'EXEMPT_NON_NWT';           // 0%  - Non-NWT foreign purchase (goods import, local resident, PE)

export type NwtResidencyStatus = 'RESIDENT' | 'NON_RESIDENT' | 'UNKNOWN';

export interface WithholdingCertificateRecord {
  id: string;
  tenantId?: string;
  certificateNumber: string;
  payeeName: string;
  payeeCountry: string;
  payeeTin?: string;
  treatyCountry: string;
  treatyArticle?: string;
  reducedRate: number; // e.g. 0.05 or 0.00
  issueDate: string;   // ISO Date
  expiryDate: string;  // ISO Date
  issuingAuthority: string;
  documentUrl?: string;
  status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'EXPIRED' | 'REJECTED';
}

export interface NwtCalculationInput {
  transactionId?: string;
  invoiceId?: string;
  payeeName: string;
  payeeCountry?: string;
  payeeTin?: string;
  isNonResident: boolean;
  hasPermanentEstablishmentInMaldives?: boolean;
  category: NwtCategory;
  description?: string;
  contractedAmount: number; // in transaction currency
  currency?: string;        // default 'MVR'
  exchangeRate?: number;    // default 1.0 (to MVR)
  paymentDate?: string;     // ISO Date (YYYY-MM-DD)
  payableDate?: string;     // ISO Date (YYYY-MM-DD)
  isGrossedUp?: boolean;    // true if contract stipulates net payment
  dtaaCertificate?: WithholdingCertificateRecord | null;
}

export interface NwtCalculation {
  transactionId: string;
  payeeName: string;
  payeeCountry: string;
  category: NwtCategory;
  isNonResident: boolean;
  isSubjectToNwt: boolean;
  paymentDate?: string;
  payableDate?: string;
  withholdingDate: string;  // Earlier of paymentDate or payableDate
  reportingPeriod: string;  // YYYY-MM based on withholdingDate
  contractedAmount: number;
  currency: string;
  exchangeRate: number;
  isGrossedUp: boolean;
  grossAmount: number;      // In original currency
  grossAmountMvr: number;   // In MVR
  statutoryRate: number;    // Standard statutory rate (0.10, 0.05, or 0.00)
  effectiveRate: number;    // Effective rate after DTAA relief if applicable
  nwtAmountWithheld: number; // In original currency
  nwtAmountWithheldMvr: number; // In MVR
  netAmountPaid: number;    // In original currency
  netAmountPaidMvr: number; // In MVR
  isDtaaReliefApplied: boolean;
  dtaaCertificateRef?: string;
  dtaaReliefReason?: string;
  ruleId: string;
  regulatoryCitation: string;
}

export interface NwtTransaction extends NwtCalculation {
  id: string;
  tenantId: string;
  createdAt: string;
  status: 'PENDING' | 'APPROVED' | 'FILED';
}

export interface NwtPeriod {
  id?: string;
  periodName: string;       // e.g. '2026-M01'
  taxYear: number;          // 2026
  month: number;            // 1
  startDate: string;        // '2026-01-01'
  endDate: string;          // '2026-01-31'
  filingDueDate: string;    // 15th of following month, e.g. '2026-02-15'
  status: 'OPEN' | 'FILED' | 'LOCKED';
}

export interface Mira602CategorySummary {
  category: NwtCategory;
  categoryName: string;
  statutoryRate: number;
  transactionCount: number;
  totalGrossAmountMvr: number;
  totalNwtWithheldMvr: number;
}

export interface Mira602PayeeScheduleItem {
  lineNo: number;
  payeeName: string;
  payeeCountry: string;
  payeeAddress?: string;
  payeeTin?: string;
  category: NwtCategory;
  categoryDescription: string;
  paymentDate?: string;
  payableDate?: string;
  withholdingDate: string;
  grossAmountMvr: number;
  nwtRate: number;
  nwtWithheldMvr: number;
  isGrossedUp: boolean;
  dtaaReliefApplied: boolean;
  dtaaCertificateRef?: string;
}

export interface Mira602Return {
  formId: string;
  formType: 'MIRA602';
  formVersion: string;      // Versioned by period, e.g. 'v25.1' or 'v24.1'
  generatedAt: string;
  status: 'DRAFT' | 'READY_FOR_FILING' | 'SUBMITTED';
  filingDueDate: string;    // Always 15th of the month following the reporting period
  
  // Section A: Taxpayer Profile
  taxpayer: {
    tin: string;
    businessName: string;
    contactNumber?: string;
    email?: string;
  };

  // Period Information
  period: NwtPeriod;

  // Section B: Category Breakdown Summary
  categorySummaries: Mira602CategorySummary[];

  // Section C: Line-by-Line Non-Resident Payee Schedule
  scheduleOfPayees: Mira602PayeeScheduleItem[];

  // Section D: Final Tax Liability
  totalGrossPaymentsMvr: number;
  totalNwtWithheldMvr: number;
  totalTransactions: number;
  
  // Traceability & Checksum
  regulatoryTraceability: {
    governingAct: string;
    ruleIds: string[];
    statutoryChecksum: string;
  };
}

export interface NwtReconciliation {
  period: NwtPeriod;
  subledgerTotalNwtWithheld: number;
  glAccount2200WithholdingTaxPayableBalance: number;
  variance: number;
  isReconciled: boolean;
  unreconciledItems: {
    transactionId: string;
    payeeName: string;
    amount: number;
    reason: string;
  }[];
}
