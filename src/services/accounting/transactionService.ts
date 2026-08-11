import {
  TransactionRecord,
  TransactionIdentity,
  TransactionSourceType,
  TransactionAuditEntry,
  TransactionReviewStatus
} from '../../types/taxEngine';
import { ClassifiedTransaction } from '../classificationService';
import { createJournalEntryForTransaction } from './journalService';

let globalTransactionSequence = 1234;

/**
 * Generates a unique transaction identity string in format TX-YYYY-XXXXXXXX
 */
export function generateTransactionId(taxYear?: number): string {
  const year = taxYear || new Date().getFullYear();
  const sequenceStr = String(globalTransactionSequence++).padStart(8, '0');
  return `TX-${year}-${sequenceStr}`;
}

/**
 * Creates a structured Transaction Identity object (Section 2.2)
 */
export function createTransactionIdentity(params: {
  transactionId?: string;
  sourceType?: TransactionSourceType;
  sourceId: string;
  entityId?: string;
  outletId?: string;
  transactionDate?: string;
  accountingCategory: string;
  amount: number;
  gstAmount: number;
  taxYear?: number;
}): TransactionIdentity {
  const dateStr = params.transactionDate || new Date().toISOString().split('T')[0];
  const year = params.taxYear || new Date(dateStr).getFullYear();
  const transactionId = params.transactionId || generateTransactionId(year);

  const amount = Number(params.amount || 0);
  const gstAmount = Number(params.gstAmount || 0);
  const totalAmount = Math.round((amount + gstAmount) * 100) / 100;

  return {
    transactionId,
    sourceType: params.sourceType || 'bill',
    sourceId: params.sourceId,
    entityId: params.entityId || 'COMPANY-001',
    outletId: params.outletId || 'OUTLET-001',
    transactionDate: dateStr,
    accountingCategory: params.accountingCategory,
    amount,
    gstAmount,
    totalAmount
  };
}

/**
 * Transaction Creation Pipeline (Section 2.1)
 * Enforces that raw OCR payloads pass through classification and transaction identity generation
 * before becoming an official TransactionRecord that feeds ledgers and tax engines.
 *
 * @param ocrData Raw OCR / Document payload
 * @param classification ClassifiedTransaction output from classificationService
 * @returns Complete TransactionRecord with double-entry journal entry attached
 */
export function createTransactionFromBill(
  ocrData: any,
  classification: ClassifiedTransaction
): TransactionRecord {
  const rawData = ocrData || {};

  // Resolve source document identity
  const sourceId = String(
    rawData.documentId ||
    rawData.invoiceNumber ||
    rawData.billId ||
    classification.documentId ||
    `BILL-${Date.now().toString().slice(-6)}`
  );

  const transactionDate = String(
    rawData.transactionDate ||
    rawData.issueDate ||
    rawData.date ||
    classification.transactionDate ||
    new Date().toISOString().split('T')[0]
  );

  const year = classification.taxYear || new Date(transactionDate).getFullYear();

  // Create Identity object (Section 2.2)
  const identity = createTransactionIdentity({
    transactionId: rawData.transactionId || classification.transactionId,
    sourceType: 'bill',
    sourceId,
    entityId: rawData.entityId || classification.entityId || 'COMPANY-001',
    outletId: rawData.outletId || classification.outletId || 'OUTLET-001',
    transactionDate,
    accountingCategory: classification.accountingCategory,
    amount: classification.amount,
    gstAmount: classification.gstAmount,
    taxYear: year
  });

  // Determine Accounting Period (Section 1.4 non-calendar support)
  const accountingPeriodStart =
    rawData.accountingPeriodStart ||
    classification.accountingPeriodStart ||
    `${year}-01-01`;

  const accountingPeriodEnd =
    rawData.accountingPeriodEnd ||
    classification.accountingPeriodEnd ||
    `${year}-12-31`;

  // Review Status Determination
  const reviewStatus: TransactionReviewStatus =
    rawData.reviewStatus ||
    classification.reviewStatus ||
    (classification.incomeTaxTreatment === 'REVIEW_REQUIRED' ? 'NEEDS_REVIEW' : 'APPROVED');

  // Audit trail initialization
  const auditHistory: TransactionAuditEntry[] = [
    {
      timestamp: new Date().toISOString(),
      action: 'TRANSACTION_CREATED',
      performedBy: 'CLASSIFICATION_PIPELINE',
      details: `Created transaction ${identity.transactionId} from source ${sourceId}`
    }
  ];

  // Base Transaction Record
  const transactionRecord: TransactionRecord = {
    ...identity,
    supplierOrCustomer:
      rawData.supplierName ||
      rawData.vendorName ||
      classification.supplierOrCustomer ||
      'Unknown Vendor',
    description: classification.description || rawData.description || `Bill ${sourceId}`,
    miraCategory: classification.miraCategory,
    accountingTreatment: classification.accountingClassification || classification.accountingTreatment,
    incomeTaxTreatment: classification.incomeTaxTreatment,
    gstTreatment: classification.gstTreatment,
    taxYear: year,
    accountingPeriodStart,
    accountingPeriodEnd,
    reviewStatus,
    auditHistory,
    createdAt: new Date().toISOString()
  };

  // Generate Double-Entry Journal Entry
  const journalEntry = createJournalEntryForTransaction(transactionRecord);
  transactionRecord.journalEntry = journalEntry;

  return transactionRecord;
}
