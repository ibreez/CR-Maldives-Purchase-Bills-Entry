import { TransactionRecord } from '../../types/taxEngine';
import {
  renderMira604Html,
  renderMira105Html,
  renderMira302Html,
  renderAssetRegisterHtml,
  renderPnlSchedule1Html
} from '../../templates/reportTemplates';

export type TaxReturnType =
  | 'MIRA604'
  | 'MIRA105'
  | 'MIRA302'
  | 'ASSET_REGISTER'
  | 'PNL_SCHEDULE1';

/**
 * Generates print-ready HTML/PDF content buffer for MIRA tax returns and schedules.
 *
 * @param returnType Type of tax return or report
 * @param data Tax return or register payload
 * @returns Promise<Buffer | string>
 */
export async function generateTaxReturnPdf(
  returnType: TaxReturnType,
  data: any
): Promise<Buffer | string> {
  if (!data) {
    throw new Error('Export Error: Report data payload is required');
  }

  let htmlString = '';

  switch (returnType) {
    case 'MIRA604':
      if (!data.sectionA_TaxpayerInfo) {
        throw new Error("Export Error: Missing required report field 'sectionA_TaxpayerInfo'");
      }
      if (!data.sectionA_TaxpayerInfo.tin) {
        throw new Error("Export Error: Missing required report field 'tin'");
      }
      if (!data.sectionA_TaxpayerInfo.taxpayerName) {
        throw new Error("Export Error: Missing required report field 'taxpayerName'");
      }
      htmlString = renderMira604Html(data);
      break;
    case 'MIRA105':
      if (!data.gstPeriod) {
        throw new Error("Export Error: Missing required report field 'gstPeriod'");
      }
      if (!data.gstPeriod.tin) {
        throw new Error("Export Error: Missing required report field 'tin'");
      }
      if (!data.gstPeriod.taxpayerName) {
        throw new Error("Export Error: Missing required report field 'taxpayerName'");
      }
      htmlString = renderMira105Html(data);
      break;
    case 'MIRA302':
      if (!data.whtPeriod) {
        throw new Error("Export Error: Missing required report field 'whtPeriod'");
      }
      if (!data.whtPeriod.tin) {
        throw new Error("Export Error: Missing required report field 'tin'");
      }
      if (!data.whtPeriod.taxpayerName) {
        throw new Error("Export Error: Missing required report field 'taxpayerName'");
      }
      htmlString = renderMira302Html(data);
      break;
    case 'ASSET_REGISTER':
      htmlString = renderAssetRegisterHtml(data);
      break;
    case 'PNL_SCHEDULE1':
      htmlString = renderPnlSchedule1Html(data);
      break;
    default:
      throw new Error(`Export Error: Unsupported report type '${returnType}'`);
  }

  return Buffer.from(htmlString, 'utf-8');
}

/**
 * Helper to escape CSV cell values securely.
 */
function escapeCsvValue(val: any): string {
  if (val === null || val === undefined) {
    return '""';
  }
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports transaction ledger records to standard CSV format for audit and accounting software compatibility.
 * Standard column headers: transactionId, date, category, debit, credit, gst, miraCategory, description, amount, taxYear, reviewStatus
 *
 * @param transactions List of TransactionRecord items
 * @returns Standard CSV formatted string
 */
export function exportLedgerToCsv(transactions: TransactionRecord[]): string {
  const headers = [
    'transactionId',
    'date',
    'category',
    'debit',
    'credit',
    'gst',
    'miraCategory',
    'description',
    'sourceType',
    'sourceId',
    'entityId',
    'outletId',
    'amount',
    'taxYear',
    'reviewStatus'
  ];

  const rows: string[] = [headers.join(',')];

  for (const tx of transactions || []) {
    const isExpenseOrAsset = tx.accountingTreatment === 'EXPENSE' || tx.accountingTreatment === 'ASSET' || tx.accountingCategory?.startsWith('expense') || tx.accountingCategory?.startsWith('asset');
    const isRevenueOrLiability = tx.accountingTreatment === 'REVENUE' || tx.accountingTreatment === 'LIABILITY' || tx.accountingTreatment === 'EQUITY' || tx.accountingCategory?.startsWith('revenue');

    const debit = isExpenseOrAsset ? tx.amount : (isRevenueOrLiability ? 0 : tx.amount);
    const credit = isRevenueOrLiability ? tx.amount : 0;

    const row = [
      escapeCsvValue(tx.transactionId),
      escapeCsvValue(tx.transactionDate),
      escapeCsvValue(tx.accountingCategory),
      escapeCsvValue(debit),
      escapeCsvValue(credit),
      escapeCsvValue(tx.gstAmount || 0),
      escapeCsvValue(tx.miraCategory),
      escapeCsvValue(tx.description),
      escapeCsvValue(tx.sourceType),
      escapeCsvValue(tx.sourceId),
      escapeCsvValue(tx.entityId),
      escapeCsvValue(tx.outletId),
      escapeCsvValue(tx.amount),
      escapeCsvValue(tx.taxYear),
      escapeCsvValue(tx.reviewStatus)
    ];
    rows.push(row.join(','));
  }

  return rows.join('\n');
}
