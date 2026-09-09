import { TransactionRecord } from '../../types/taxEngine';
import {
  renderMira604Html,
  renderMira105Html,
  renderMira302Html,
  renderMira205Html,
  renderMira206Html,
  renderMira602Html,
  renderSchedule2Html,
  renderReconciliationReportHtml,
  renderAssetRegisterHtml,
  renderPnlSchedule1Html
} from '../../templates/reportTemplates';

export type TaxReturnType =
  | 'MIRA604'
  | 'MIRA105'
  | 'MIRA302'
  | 'MIRA205'
  | 'MIRA206'
  | 'MIRA602'
  | 'SCHEDULE2'
  | 'RECONCILIATION_REPORT'
  | 'ASSET_REGISTER'
  | 'PNL_SCHEDULE1';

/**
 * Generates print-ready HTML/PDF content buffer for MIRA tax returns and schedules synchronously.
 *
 * @param returnType Type of tax return or report
 * @param data Tax return or register payload
 * @returns Buffer
 */
export function generateTaxReturnPdfSync(
  returnType: TaxReturnType,
  data: any
): Buffer {
  if (!data) {
    throw new Error('Export Error: Report data payload is required');
  }

  let htmlString = '';

  switch (returnType) {
    case 'MIRA604':
      if (!data.sectionA_TaxpayerInfo && !data.taxpayer && !data.values) {
        throw new Error("Export Error: Missing required report field 'sectionA_TaxpayerInfo'");
      }
      if (data.sectionA_TaxpayerInfo && !data.sectionA_TaxpayerInfo.tin) {
        throw new Error("Export Error: Missing required report field 'tin'");
      }
      htmlString = renderMira604Html(data);
      break;
    case 'MIRA105':
      if (!data.gstPeriod) {
        throw new Error("Export Error: Missing required report field 'gstPeriod'");
      }
      htmlString = renderMira105Html(data);
      break;
    case 'MIRA205':
      if (!data.taxpayer) {
        throw new Error("Export Error: Missing required report field 'taxpayer' for MIRA 205");
      }
      htmlString = renderMira205Html(data);
      break;
    case 'MIRA206':
      if (!data.taxpayer) {
        throw new Error("Export Error: Missing required report field 'taxpayer' for MIRA 206");
      }
      htmlString = renderMira206Html(data);
      break;
    case 'MIRA302':
      if (!data.whtPeriod) {
        throw new Error("Export Error: Missing required report field 'whtPeriod'");
      }
      htmlString = renderMira302Html(data);
      break;
    case 'MIRA602':
      if (!data.taxpayer) {
        throw new Error("Export Error: Missing required report field 'taxpayer' for MIRA 602");
      }
      htmlString = renderMira602Html(data);
      break;
    case 'SCHEDULE2':
      htmlString = renderSchedule2Html(data);
      break;
    case 'RECONCILIATION_REPORT':
      htmlString = renderReconciliationReportHtml(data);
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
 * Generates print-ready HTML/PDF content buffer for MIRA tax returns and schedules.
 *
 * @param returnType Type of tax return or report
 * @param data Tax return or register payload
 * @returns Promise<Buffer>
 */
export async function generateTaxReturnPdf(
  returnType: TaxReturnType,
  data: any
): Promise<Buffer> {
  return generateTaxReturnPdfSync(returnType, data);
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
