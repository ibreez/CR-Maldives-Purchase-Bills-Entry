import {
  TransactionRecord,
  JournalEntry,
  FixedAssetRecord
} from '../../types/taxEngine';
import { Mira604TaxReturn } from '../../types/mira604';
import { Mira105GstReturn } from '../../types/mira105';
import { Mira302WhtReturn } from '../../types/mira302';
import { TaxAdjustment } from '../tax/taxAdjustmentService';
import { MiraReturnType, SubmissionStatus } from '../../types/miraconnectGateway';

/**
 * In-memory relational database state for simulation and persistence operations.
 */
interface DatabaseStore {
  transactions: Map<string, TransactionRecord>;
  journals: Map<string, JournalEntry>;
  fixedAssets: Map<string, FixedAssetRecord>;
  taxAdjustments: Map<string, TaxAdjustment>;
  taxReturns: Map<string, {
    id: string;
    entityId: string;
    formId: string;
    returnType: MiraReturnType;
    taxYear: number;
    formVersion: string;
    submissionStatus: SubmissionStatus | string;
    miraReferenceNumber?: string;
    acknowledgmentReceiptUrl?: string;
    verificationChecksum?: string;
    payloadJson: string;
    createdAt: string;
  }>;
}

const dbStore: DatabaseStore = {
  transactions: new Map(),
  journals: new Map(),
  fixedAssets: new Map(),
  taxAdjustments: new Map(),
  taxReturns: new Map()
};

/**
 * Saves a TransactionRecord and its corresponding JournalEntry inside an atomic database transaction.
 * If either transaction or journal entry validation fails, the entire transaction rolls back.
 */
export async function saveTransactionWithJournal(
  transaction: TransactionRecord,
  journal: JournalEntry
): Promise<void> {
  if (!transaction || !transaction.transactionId) {
    throw new Error("Persistence Error: Transaction ID is required");
  }

  if (!journal || !journal.journalId) {
    throw new Error("Persistence Error: Journal Entry ID is required");
  }

  if (journal.transactionId !== transaction.transactionId) {
    throw new Error(
      `Persistence Transaction Error: Foreign key mismatch. Journal transactionId '${journal.transactionId}' does not match Transaction ID '${transaction.transactionId}'`
    );
  }

  if (!journal.isBalanced) {
    throw new Error(
      `Persistence Transaction Error: Cannot commit unbalance double-entry journal (Total Debit: ${journal.totalDebit}, Total Credit: ${journal.totalCredit})`
    );
  }

  // Create transactional snapshots for atomic rollback guarantee
  const txSnapshot = new Map(dbStore.transactions);
  const jnlSnapshot = new Map(dbStore.journals);

  try {
    const txCopy: TransactionRecord = JSON.parse(JSON.stringify(transaction));
    const jnlCopy: JournalEntry = JSON.parse(JSON.stringify(journal));

    txCopy.journalEntry = jnlCopy;

    dbStore.transactions.set(txCopy.transactionId, txCopy);
    dbStore.journals.set(jnlCopy.journalId, jnlCopy);
  } catch (err: any) {
    // Atomic rollback on failure
    dbStore.transactions = txSnapshot;
    dbStore.journals = jnlSnapshot;
    throw new Error(`Persistence Atomic Transaction Failed: ${err.message}`);
  }
}

/**
 * Fetches transactions belonging to a specific tenant ID between a start date and end date (inclusive).
 */
export async function fetchTransactionsByPeriod(
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<TransactionRecord[]> {
  if (!tenantId || !tenantId.trim()) {
    throw new Error("Persistence Error: tenantId is required");
  }

  const results: TransactionRecord[] = [];

  for (const tx of dbStore.transactions.values()) {
    if (tx.entityId === tenantId) {
      if (tx.transactionDate >= startDate && tx.transactionDate <= endDate) {
        results.push(JSON.parse(JSON.stringify(tx)));
      }
    }
  }

  // Sort by transactionDate ascending
  return results.sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
}

/**
 * Saves a MIRA tax return payload (MIRA604, MIRA105, or MIRA302) to database storage.
 */
export async function saveTaxReturn(
  taxReturn: Mira604TaxReturn | Mira105GstReturn | Mira302WhtReturn
): Promise<void> {
  if (!taxReturn || !taxReturn.formId) {
    throw new Error("Persistence Error: Tax return formId is required");
  }

  let returnType: MiraReturnType = 'MIRA604';
  let entityId = '';
  let taxYear = 2026;
  let verificationChecksum = '';

  if ('sectionA_TaxpayerInfo' in taxReturn) {
    returnType = 'MIRA604';
    entityId = taxReturn.sectionA_TaxpayerInfo?.tin || '';
    taxYear = taxReturn.sectionA_TaxpayerInfo?.taxYear || 2026;
  } else if ('gstPeriod' in taxReturn) {
    returnType = 'MIRA105';
    entityId = taxReturn.gstPeriod?.tin || '';
    taxYear = taxReturn.gstPeriod?.taxYear || 2026;
    verificationChecksum = taxReturn.verificationChecksum || '';
  } else if ('whtPeriod' in taxReturn) {
    returnType = 'MIRA302';
    entityId = taxReturn.whtPeriod?.tin || '';
    taxYear = taxReturn.whtPeriod?.taxYear || 2026;
    verificationChecksum = taxReturn.verificationChecksum || '';
  }

  const record = {
    id: taxReturn.formId,
    entityId,
    formId: taxReturn.formId,
    returnType,
    taxYear,
    formVersion: taxReturn.formVersion || 'V25.1',
    submissionStatus: taxReturn.submissionStatus || 'DRAFT',
    verificationChecksum,
    payloadJson: JSON.stringify(taxReturn),
    createdAt: taxReturn.generatedAt || new Date().toISOString()
  };

  dbStore.taxReturns.set(taxReturn.formId, record);
}

/**
 * Fetches the Fixed Asset Register records for a given tenant ID and tax year.
 */
export async function fetchFixedAssetRegister(
  tenantId: string,
  taxYear: number
): Promise<FixedAssetRecord[]> {
  if (!tenantId) {
    throw new Error("Persistence Error: tenantId is required");
  }

  const assets: FixedAssetRecord[] = [];

  for (const asset of dbStore.fixedAssets.values()) {
    if (asset.entityId === tenantId && asset.taxYear === taxYear) {
      assets.push(JSON.parse(JSON.stringify(asset)));
    }
  }

  return assets;
}

/**
 * Saves a FixedAssetRecord to database storage.
 */
export async function saveFixedAsset(asset: FixedAssetRecord): Promise<void> {
  if (!asset || !asset.assetId) {
    throw new Error("Persistence Error: Fixed asset assetId is required");
  }
  dbStore.fixedAssets.set(asset.assetId, JSON.parse(JSON.stringify(asset)));
}

/**
 * Saves a TaxAdjustment record to database storage.
 */
export async function saveTaxAdjustment(adj: TaxAdjustment): Promise<void> {
  if (!adj || !adj.adjustmentId) {
    throw new Error("Persistence Error: TaxAdjustment adjustmentId is required");
  }
  dbStore.taxAdjustments.set(adj.adjustmentId, JSON.parse(JSON.stringify(adj)));
}

/**
 * Fetches TaxAdjustments for a given tenant ID and tax year.
 */
export async function fetchTaxAdjustments(
  tenantId: string,
  taxYear: number
): Promise<TaxAdjustment[]> {
  const results: TaxAdjustment[] = [];
  for (const adj of dbStore.taxAdjustments.values()) {
    if (adj.entityId === tenantId && adj.taxYear === taxYear) {
      results.push(JSON.parse(JSON.stringify(adj)));
    }
  }
  return results;
}

/**
 * Fetches a saved tax return record by formId.
 */
export async function fetchTaxReturn(formId: string): Promise<any | undefined> {
  const record = dbStore.taxReturns.get(formId);
  if (!record) return undefined;
  return JSON.parse(record.payloadJson);
}

/**
 * Clears the database store (useful for test resets).
 */
export function clearDatabaseStore(): void {
  dbStore.transactions.clear();
  dbStore.journals.clear();
  dbStore.fixedAssets.clear();
  dbStore.taxAdjustments.clear();
  dbStore.taxReturns.clear();
}
