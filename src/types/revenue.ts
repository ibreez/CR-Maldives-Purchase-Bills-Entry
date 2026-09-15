import { Prisma } from '@prisma/client';
import { GstSector } from './gst';

export type RevenueStatus =
  | 'DRAFT'
  | 'VALIDATED'
  | 'REVIEW_REQUIRED'
  | 'APPROVED'
  | 'POSTED'
  | 'REVERSED';

export type RevenuePaymentMethod =
  | 'CASH'
  | 'CARD'
  | 'BANK'
  | 'ONLINE'
  | 'CREDIT'
  | 'OTHER';

export type RevenueAmountBasis = 'GST_INCLUSIVE' | 'GST_EXCLUSIVE';

export type RevenueGstClassification =
  | 'TAXABLE'
  | 'ZERO_RATED'
  | 'EXEMPT'
  | 'OUT_OF_SCOPE';

export interface RevenueTransaction {
  id: string;
  tenantId: string;
  outletId: string;
  outletName?: string;
  transactionDate: string; // YYYY-MM-DD
  accountingPeriodId?: string;
  category: string;
  description: string;
  amountBasis: RevenueAmountBasis;
  sector: GstSector;

  // Authoritative Decimal-safe financial values
  grossAmount: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  gstAmount: Prisma.Decimal;

  // GST Resolution & Traceability
  gstClassification: RevenueGstClassification;
  gstRate: number; // e.g. 0.08, 0.16, 0.17, 0
  gstRatePercentage: number; // e.g. 8, 16, 17, 0
  gstRuleId?: string;
  gstRegulatoryVersion?: string;

  // Payment & Source tracking
  paymentMethod: RevenuePaymentMethod;
  customerReference?: string;
  currency: string; // 'MVR', 'USD', etc.
  fxRate: Prisma.Decimal;
  mvrAmount: Prisma.Decimal;

  // Lifecycle & Linking
  status: RevenueStatus;
  sourceType: string; // 'MANUAL_ENTRY' | 'CSV_IMPORT' | 'POS_INTEGRATION'
  sourceId?: string;
  idempotencyKey?: string;
  journalId?: string;
  gstTransactionId?: string;
  auditEventId?: string;

  // Reversal / Correction tracking
  reversalOfId?: string;
  reversalJournalId?: string;
  reversedById?: string;
  correctionNote?: string;

  // Review & Approval
  reviewNotes?: string[];
  approvedBy?: string;
  approvedAt?: string;

  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRevenueInput {
  tenantId?: string;
  outletId: string;
  outletName?: string;
  transactionDate?: string;
  date?: string;
  category?: string;
  description?: string;
  grossAmount?: number | string | Prisma.Decimal;
  netAmount?: number | string | Prisma.Decimal;
  amountBasis?: RevenueAmountBasis;
  sector?: GstSector;
  gstClassification?: RevenueGstClassification;
  paymentMethod?: RevenuePaymentMethod | string;
  customerReference?: string;
  currency?: string;
  fxRate?: number | string | Prisma.Decimal;
  idempotencyKey?: string;
  sourceId?: string;
  notes?: string;
  autoPost?: boolean;
}

export interface UpdateRevenueInput {
  transactionDate?: string;
  date?: string;
  outletId?: string;
  outletName?: string;
  category?: string;
  description?: string;
  grossAmount?: number | string | Prisma.Decimal;
  netAmount?: number | string | Prisma.Decimal;
  amountBasis?: RevenueAmountBasis;
  sector?: GstSector;
  gstClassification?: RevenueGstClassification;
  paymentMethod?: RevenuePaymentMethod | string;
  customerReference?: string;
  notes?: string;
}

export interface RevenueValidationResult {
  isValid: boolean;
  requiresReview: boolean;
  errors: string[];
  warnings: string[];
  resolvedRuleId?: string;
  resolvedGstRate?: number;
  resolvedDebitAccount?: { code: string; name: string };
  resolvedCreditAccount?: { code: string; name: string };
  resolvedTaxAccount?: { code: string; name: string };
}

export interface RevenueDiagnosticTrace {
  id: string;
  revenueId: string;
  status: RevenueStatus;
  transactionDate: string;
  grossAmount: number;
  netAmount: number;
  gstAmount: number;
  outletId?: string;
  category?: string;
  paymentMethod?: string;
  amountBasis?: string;
  classification: {
    gstClassification: RevenueGstClassification;
    rate: number;
    ruleId?: string;
    version?: string;
  };
  gstTransaction?: {
    id: string;
    sector: string;
    boxNumber?: string;
    taxableAmount: number;
    taxAmount: number;
    ruleId?: string;
    rate?: number;
  };
  journal?: {
    id: string;
    reference: string;
    entryDate: string;
    isBalanced: boolean;
    totalDebit: number;
    totalCredit: number;
    lines: Array<{
      id?: string;
      accountCode: string;
      accountName: string;
      debit: number;
      credit: number;
      description?: string;
    }>;
  };
  generalLedgerPostings?: Array<{
    id?: string;
    accountCode: string;
    accountName: string;
    debit: number;
    credit: number;
    description?: string;
    entryDate?: string;
  }>;
  pnlImpact?: {
    accountCode: string;
    lineItem: string;
    netRevenueCredited: number;
    period: string;
    schedule1Box?: string;
  };
  miraMapping?: {
    returnType: 'MIRA 205' | 'MIRA 206';
    boxNumber: string;
    boxDescription: string;
    taxableAmount: number;
    taxAmount: number;
  };
  auditTrail?: Array<{
    eventId?: string;
    eventType: string;
    timestamp: string;
    actor: string;
    checksum?: string;
  }>;
  reconciliationState: {
    revenueToGL: 'PASS' | 'WARNING' | 'FAIL';
    revenueToGST: 'PASS' | 'WARNING' | 'FAIL';
    revenueToPnL: 'PASS' | 'WARNING' | 'FAIL';
    revenueToMira: 'PASS' | 'WARNING' | 'FAIL';
    overallStatus: 'PASS' | 'WARNING' | 'FAIL';
    discrepancies?: string[];
  };
}
