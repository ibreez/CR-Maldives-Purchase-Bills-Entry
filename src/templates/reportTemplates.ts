import { Mira604TaxReturn } from '../types/mira604';
import { Mira105GstReturn } from '../types/mira105';
import { Mira302WhtReturn } from '../types/mira302';
import { FixedAssetRecord, TransactionRecord } from '../types/taxEngine';

const commonStyles = `
  <style>
    @media print {
      body { margin: 0; padding: 0; font-family: 'Helvetica Neue', Arial, sans-serif; }
      .no-print { display: none; }
      .page-break { page-break-after: always; }
    }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      color: #1a202c;
      background-color: #ffffff;
      margin: 0;
      padding: 30px;
      font-size: 13px;
      line-height: 1.5;
    }
    .header-branding {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .header-title h1 {
      margin: 0;
      font-size: 20px;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .header-title h2 {
      margin: 4px 0 0 0;
      font-size: 13px;
      font-weight: 500;
      color: #475569;
    }
    .header-meta {
      text-align: right;
      font-size: 12px;
      color: #334155;
    }
    .header-meta p {
      margin: 2px 0;
    }
    .section-box {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      margin-bottom: 20px;
      overflow: hidden;
    }
    .section-header {
      background-color: #f1f5f9;
      padding: 8px 14px;
      font-weight: 700;
      font-size: 13px;
      color: #0f172a;
      border-bottom: 1px solid #cbd5e1;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      padding: 12px 14px;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
      padding: 12px 14px;
    }
    .info-label {
      font-size: 11px;
      text-transform: uppercase;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 2px;
    }
    .info-value {
      font-size: 13px;
      color: #0f172a;
      font-weight: 500;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
    }
    table.data-table th {
      background-color: #f8fafc;
      color: #334155;
      font-weight: 600;
      text-align: left;
      padding: 8px 12px;
      font-size: 11px;
      text-transform: uppercase;
      border-bottom: 2px solid #cbd5e1;
    }
    table.data-table td {
      padding: 8px 12px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 12px;
    }
    table.data-table td.number, table.data-table th.number {
      text-align: right;
    }
    .total-row td {
      font-weight: 700;
      background-color: #f1f5f9;
      border-top: 2px solid #0f172a;
    }
    .highlight-box {
      background-color: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 15px;
      font-weight: 700;
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
    }
    .highlight-box.due {
      background-color: #fef2f2;
      border-color: #fecaca;
      color: #991b1b;
    }
    .declaration-block {
      margin-top: 30px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 16px;
      background-color: #fafafa;
    }
    .declaration-title {
      font-weight: 700;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 8px;
      color: #0f172a;
    }
    .signature-grid {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr;
      gap: 20px;
      margin-top: 24px;
    }
    .signature-line {
      border-top: 1px solid #0f172a;
      padding-top: 4px;
      font-size: 11px;
      color: #475569;
      text-align: center;
    }
  </style>
`;

/**
 * Sanitizes untrusted strings to prevent Cross-Site Scripting (HTML injection) in generated reports.
 */
export function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHeader(entityName: string, tin: string, taxYear: number | string, formTitle: string, timestamp?: string): string {
  const ts = timestamp || new Date().toISOString();
  return `
    <div class="header-branding">
      <div class="header-title">
        <h1>MALDIVES INLAND REVENUE AUTHORITY</h1>
        <h2>${formTitle}</h2>
      </div>
      <div class="header-meta">
        <p><strong>Entity:</strong> ${escapeHtml(entityName || 'N/A')}</p>
        <p><strong>TIN:</strong> ${escapeHtml(tin || 'N/A')}</p>
        <p><strong>Tax Year / Period:</strong> ${escapeHtml(taxYear)}</p>
        <p><strong>Generated:</strong> ${escapeHtml(ts)}</p>
      </div>
    </div>
  `;
}

/**
 * Generates styled HTML layout for MIRA 604 Income Tax Return
 */
export function renderMira604Html(data: Mira604TaxReturn | any): string {
  const taxpayer = data.sectionA_TaxpayerInfo || {};
  const pnl = data.sectionB_Schedule1PnL || {};
  const adjustments = data.sectionC_TaxAdjustments || {};
  const ca = data.sectionD_CapitalAllowances || {};
  const taxable = data.sectionE_TaxableIncomeLoss || {};
  const computation = data.sectionF_TaxComputation || {};

  const netTax = computation.netTaxDueOrRefundable ?? 0;
  const isDue = netTax >= 0;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>MIRA 604 Income Tax Return</title>
      ${commonStyles}
    </head>
    <body>
      ${renderHeader(taxpayer.taxpayerName, taxpayer.tin, taxpayer.taxYear, 'MIRA 604 - Corporate & Proprietor Income Tax Return', data.generatedAt)}

      <div class="highlight-box ${isDue ? 'due' : ''}">
        <span>NET INCOME TAX ${isDue ? 'DUE TO MIRA' : 'REFUNDABLE'}</span>
        <span>MVR ${(Math.abs(netTax)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>

      <!-- SECTION A -->
      <div class="section-box">
        <div class="section-header">Section A: Taxpayer & Entity Information</div>
        <div class="grid-3">
          <div>
            <div class="info-label">Taxpayer Name</div>
            <div class="info-value">${escapeHtml(taxpayer.taxpayerName || 'N/A')}</div>
          </div>
          <div>
            <div class="info-label">TIN</div>
            <div class="info-value">${escapeHtml(taxpayer.tin || 'N/A')}</div>
          </div>
          <div>
            <div class="info-label">Legal Entity Type</div>
            <div class="info-value">${escapeHtml(taxpayer.entityType || 'COMPANY')}</div>
          </div>
          <div>
            <div class="info-label">Accounting Period Start</div>
            <div class="info-value">${escapeHtml(taxpayer.accountingPeriodStart || 'N/A')}</div>
          </div>
          <div>
            <div class="info-label">Accounting Period End</div>
            <div class="info-value">${escapeHtml(taxpayer.accountingPeriodEnd || 'N/A')}</div>
          </div>
          <div>
            <div class="info-label">Tax Form ID / Version</div>
            <div class="info-value">${escapeHtml(data.formId || 'MIRA604')} (${escapeHtml(data.formVersion || 'V25.1')})</div>
          </div>
        </div>
      </div>

      <!-- SECTION B -->
      <div class="section-box">
        <div class="section-header">Section B: Schedule 1 Profit & Loss Summary</div>
        <table class="data-table">
          <tr><th>Description</th><th class="number">Amount (MVR)</th></tr>
          <tr><td>Gross Operating Revenue</td><td class="number">${(pnl.grossRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Cost of Sales / Direct Operating Costs</td><td class="number">(${(pnl.costOfSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })})</td></tr>
          <tr class="total-row"><td>Gross Profit</td><td class="number">${(pnl.grossProfit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Other Taxable Income / Dividends / Interest</td><td class="number">${(pnl.otherIncome || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Operating & Administrative Expenses</td><td class="number">(${(pnl.operatingExpenses || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })})</td></tr>
          <tr class="total-row"><td>Accounting Net Profit Before Tax</td><td class="number">${(pnl.accountingProfitBeforeTax || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
        </table>
      </div>

      <!-- SECTION C & D -->
      <div class="section-box">
        <div class="section-header">Section C & D: Tax Adjustments & Capital Allowances</div>
        <table class="data-table">
          <tr><th>Adjustment / Allowance Description</th><th class="number">Amount (MVR)</th></tr>
          <tr><td>Total Non-Deductible Expense Add-Backs</td><td class="number">${(adjustments.totalAddBacks || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Total Allowable Deductions / Special Exemptions</td><td class="number">(${(adjustments.totalDeductions || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })})</td></tr>
          <tr><td>Total Claimable Capital Allowances (Schedule 2)</td><td class="number">(${(ca.totalClaimableCapitalAllowance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })})</td></tr>
          <tr class="total-row"><td>Net Tax Adjustments</td><td class="number">${(adjustments.netTaxAdjustments || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
        </table>
      </div>

      <!-- SECTION E & F -->
      <div class="section-box">
        <div class="section-header">Section E & F: Taxable Income & Tax Computation</div>
        <table class="data-table">
          <tr><th>Computation Line Item</th><th class="number">Amount (MVR)</th></tr>
          <tr><td>Adjusted Taxable Income Before Loss Relief</td><td class="number">${(taxable.adjustedTaxableProfitBeforeLoss || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Prior Tax Losses Applied</td><td class="number">(${(taxable.lossCarriedForwardApplied || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })})</td></tr>
          <tr class="total-row"><td>Net Taxable Income / (Tax Loss Carried Forward)</td><td class="number">${(taxable.netTaxableIncome || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Gross Income Tax Liability</td><td class="number">${(computation.totalTaxPayable || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Total Prepayments & Withholding Taxes Paid</td><td class="number">(${(computation.totalPrepayments || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })})</td></tr>
          <tr class="total-row"><td>Net Tax Payable / (Refundable)</td><td class="number">${netTax.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
        </table>
      </div>

      <!-- DECLARATION BLOCK -->
      <div class="declaration-block">
        <div class="declaration-title">Official Taxpayer Declaration</div>
        <p>I declare to the best of my knowledge and belief that the information given in this tax return is true, correct, and complete in accordance with the Maldives Income Tax Act (Act No. 25/2019).</p>
        <div class="signature-grid">
          <div class="signature-line">Authorized Signatory Name & Signature</div>
          <div class="signature-line">Designation / Title</div>
          <div class="signature-line">Date (DD/MM/YYYY)</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generates styled HTML layout for MIRA 105 GST Return Printout
 */
export function renderMira105Html(data: Mira105GstReturn | any): string {
  const period = data.gstPeriod || {};
  const output = data.outputSales || {};
  const input = data.inputPurchases || {};
  const capital = data.capitalPurchases || {};
  const netGst = data.box9_NetGstPayableOrRefundable ?? 0;
  const isDue = netGst >= 0;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>MIRA 105 GST Return</title>
      ${commonStyles}
    </head>
    <body>
      ${renderHeader(period.taxpayerName, period.tin, period.periodId || period.taxYear, `MIRA 105 - Goods & Services Tax Return (${period.regime || 'GENERAL_GST'})`, data.generatedAt)}

      <div class="highlight-box ${isDue ? 'due' : ''}">
        <span>BOX 9: NET GST ${isDue ? 'PAYABLE TO MIRA' : 'CLAIMABLE REFUND'}</span>
        <span>MVR ${(Math.abs(netGst)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>

      <div class="section-box">
        <div class="section-header">GST Tax Period & Regime Details</div>
        <div class="grid-3">
          <div><div class="info-label">Taxpayer Name</div><div class="info-value">${period.taxpayerName || 'N/A'}</div></div>
          <div><div class="info-label">TIN</div><div class="info-value">${period.tin || 'N/A'}</div></div>
          <div><div class="info-label">GST Regime</div><div class="info-value">${period.regime || 'GENERAL_GST'}</div></div>
          <div><div class="info-label">Period ID</div><div class="info-value">${period.periodId || 'N/A'}</div></div>
          <div><div class="info-label">Period Start</div><div class="info-value">${period.periodStart || 'N/A'}</div></div>
          <div><div class="info-label">Period End</div><div class="info-value">${period.periodEnd || 'N/A'}</div></div>
        </div>
      </div>

      <div class="section-box">
        <div class="section-header">Output Sales & Output GST (Boxes 1 - 4)</div>
        <table class="data-table">
          <tr><th>Box Number & Description</th><th class="number">Sales Amount (MVR)</th><th class="number">Output GST (MVR)</th></tr>
          <tr><td>Box 1: Standard-Rated Supplies / Sales</td><td class="number">${(output.box1_StandardRatedSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">${(output.box4_OutputGstCollected || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Box 2: Zero-Rated Supplies / Exports</td><td class="number">${(output.box2_ZeroRatedSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">0.00</td></tr>
          <tr><td>Box 3: Exempt Supplies</td><td class="number">${(output.box3_ExemptSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">0.00</td></tr>
          <tr class="total-row"><td>Total Output Sales & GST Collected</td><td class="number">${(output.totalOutputSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">${(output.box4_OutputGstCollected || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
        </table>
      </div>

      <div class="section-box">
        <div class="section-header">Input Purchases & Input GST (Boxes 5 - 8)</div>
        <table class="data-table">
          <tr><th>Box Number & Description</th><th class="number">Purchases Amount (MVR)</th><th class="number">Input GST (MVR)</th></tr>
          <tr><td>Box 5: Total Purchases & Expenses</td><td class="number">${(input.box5_TotalPurchases || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">-</td></tr>
          <tr><td>Box 6: Taxable Purchases Subject to GST</td><td class="number">${(input.box6_TaxablePurchases || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">-</td></tr>
          <tr><td>Box 7: Total Gross Input GST Paid</td><td class="number">-</td><td class="number">${(input.box7_GrossInputGstPaid || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr class="total-row"><td>Box 8: Claimable Input GST (After Pro-Rata / Blocking Rules)</td><td class="number">-</td><td class="number">${(input.box8_ClaimableInputGst || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
        </table>
      </div>

      <div class="section-box">
        <div class="section-header">Capital Asset Purchases (Box 10)</div>
        <table class="data-table">
          <tr><th>Description</th><th class="number">Capital Asset Cost (MVR)</th><th class="number">Claimable Input GST (MVR)</th></tr>
          <tr><td>Box 10: Capital Asset Purchases & Capital Input GST</td><td class="number">${(capital.box10_CapitalPurchasesAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">${(capital.box10_CapitalPurchasesInputGst || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
        </table>
      </div>

      <div class="declaration-block">
        <div class="declaration-title">GST Taxpayer Declaration</div>
        <p>I certify that the information provided in this GST Return is correct and represents all taxable, zero-rated, and exempt transactions for the specified period.</p>
        <div class="signature-grid">
          <div class="signature-line">Authorized Signatory</div>
          <div class="signature-line">Designation</div>
          <div class="signature-line">Date</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generates styled HTML layout for MIRA 302 WHT Schedule
 */
export function renderMira302Html(data: Mira302WhtReturn | any): string {
  const period = data.whtPeriod || {};
  const schedule = data.scheduleOfPayments || [];

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>MIRA 302 WHT Schedule</title>
      ${commonStyles}
    </head>
    <body>
      ${renderHeader(period.taxpayerName, period.tin, period.periodId || period.taxYear, 'MIRA 302 - Non-Resident Withholding Tax Return', data.generatedAt)}

      <div class="highlight-box">
        <span>TOTAL WITHHOLDING TAX DEDUCTED</span>
        <span>MVR ${(data.totalWhtWithheld || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>

      <div class="section-box">
        <div class="section-header">Non-Resident Payee Payment Schedule</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Payee Name</th>
              <th>Country</th>
              <th>Category</th>
              <th class="number">Gross Payment (MVR)</th>
              <th class="number">WHT Rate</th>
              <th class="number">Tax Withheld (MVR)</th>
              <th class="number">Net Paid (MVR)</th>
            </tr>
          </thead>
          <tbody>
            ${schedule.map((item: any) => `
              <tr>
                <td>${item.transactionDate || '-'}</td>
                <td>${item.payeeName || 'Non-Resident Vendor'}</td>
                <td>${item.countryCode || 'FOREIGN'}</td>
                <td>${item.paymentCategory || 'CONSULTANCY'}</td>
                <td class="number">${(item.grossPaymentAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td class="number">${(item.whtRatePercentage || 10)}%</td>
                <td class="number">${(item.whtAmountWithheld || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td class="number">${(item.netAmountPaidToVendor || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
            `).join('')}
            ${schedule.length === 0 ? '<tr><td colspan="8" style="text-align:center; color:#94a3b8; padding:16px;">No non-resident payments recorded for this period.</td></tr>' : ''}
            <tr class="total-row">
              <td colspan="4">Total (${data.itemCount || schedule.length} Payees)</td>
              <td class="number">${(data.totalGrossPayments || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              <td class="number">-</td>
              <td class="number">${(data.totalWhtWithheld || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              <td class="number">${(data.totalNetPayments || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generates styled HTML layout for Schedule 2 Fixed Asset & Capital Allowance Register
 */
export function renderAssetRegisterHtml(data: { fixedAssets?: FixedAssetRecord[]; entityName?: string; tin?: string; taxYear?: number; generationTimestamp?: string } | any): string {
  const assets: FixedAssetRecord[] = data.fixedAssets || [];
  const entityName = data.entityName || 'Male Enterprise Pvt Ltd';
  const tin = data.tin || '1000200300';
  const taxYear = data.taxYear || 2026;

  let totalOpening = 0;
  let totalAdditions = 0;
  let totalDisposals = 0;
  let totalAllowance = 0;
  let totalClosing = 0;

  for (const a of assets) {
    totalOpening += Number(a.openingWDV || 0);
    totalAdditions += Number(a.additionsInYear || a.costPrice || 0);
    totalDisposals += Number(a.disposalsInYear || 0);
    totalAllowance += Number(a.capitalAllowanceClaimed || 0);
    totalClosing += Number(a.closingWDV || 0);
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Schedule 2 Fixed Asset & Capital Allowance Register</title>
      ${commonStyles}
    </head>
    <body>
      ${renderHeader(entityName, tin, taxYear, 'Schedule 2 - Fixed Asset & Capital Allowance Register', data.generationTimestamp)}

      <div class="section-box">
        <div class="section-header">Fixed Assets & Capital Allowance Schedule</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Asset Name</th>
              <th>MIRA Asset Class</th>
              <th>Acquired</th>
              <th class="number">Rate</th>
              <th class="number">Opening WDV</th>
              <th class="number">Additions</th>
              <th class="number">Disposals</th>
              <th class="number">Allowance Claimed</th>
              <th class="number">Closing WDV</th>
            </tr>
          </thead>
          <tbody>
            ${assets.map((a) => `
              <tr>
                <td>${a.assetName || 'Asset'}</td>
                <td>${a.assetClass || 'Computer software & hardware'}</td>
                <td>${a.acquisitionDate || '-'}</td>
                <td class="number">${a.miraCapitalAllowanceRate || 20}%</td>
                <td class="number">${(a.openingWDV || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td class="number">${(a.additionsInYear || a.costPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td class="number">${(a.disposalsInYear || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td class="number">${(a.capitalAllowanceClaimed || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td class="number">${(a.closingWDV || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
            `).join('')}
            ${assets.length === 0 ? '<tr><td colspan="9" style="text-align:center; color:#94a3b8; padding:16px;">No fixed assets registered for this tax year.</td></tr>' : ''}
            <tr class="total-row">
              <td colspan="4">Total (${assets.length} Fixed Assets)</td>
              <td class="number">${totalOpening.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              <td class="number">${totalAdditions.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              <td class="number">${totalDisposals.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              <td class="number">${totalAllowance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              <td class="number">${totalClosing.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generates styled HTML layout for Schedule 1 P&L Report
 */
export function renderPnlSchedule1Html(data: any): string {
  const pnl = data.pnl || data.schedule1PnLSummary || {};
  const entityName = data.entityName || 'Male Enterprise Pvt Ltd';
  const tin = data.tin || '1000200300';
  const taxYear = data.taxYear || 2026;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Schedule 1 Profit & Loss Report</title>
      ${commonStyles}
    </head>
    <body>
      ${renderHeader(entityName, tin, taxYear, 'Schedule 1 - Detailed Profit & Loss Statement', data.generationTimestamp)}

      <div class="section-box">
        <div class="section-header">Profit & Loss Breakdown</div>
        <table class="data-table">
          <tr><th>MIRA Schedule 1 Category</th><th class="number">Amount (MVR)</th></tr>
          <tr><td>Gross Operating Revenue / Sales</td><td class="number">${(pnl.grossRevenue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Cost of Goods Sold / Operating Costs</td><td class="number">(${(pnl.costOfSales || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })})</td></tr>
          <tr class="total-row"><td>Gross Operating Profit</td><td class="number">${(pnl.grossProfit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Other Taxable Operating Income</td><td class="number">${(pnl.otherIncome || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Administrative & Operating Expenses</td><td class="number">(${(pnl.operatingExpenses || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })})</td></tr>
          <tr class="total-row"><td>Accounting Profit Before Tax</td><td class="number">${(pnl.accountingProfitBeforeTax || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
        </table>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generates styled HTML layout for MIRA 205 General Sector GST Return
 */
export function renderMira205Html(data: any): string {
  const taxpayer = data.taxpayer || {};
  const period = data.period || {};
  const supplies = data.sectionA_Supplies || {};
  const purchases = data.sectionB_Purchases || {};
  const calc = data.sectionC_Calculation || {};

  const netGst = calc.box17_FinalAmountPayableOrRefundable ?? calc.box15_NetGstPayableOrRefundable ?? 0;
  const isDue = netGst >= 0;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>MIRA 205 - General Sector GST Return</title>
      ${commonStyles}
    </head>
    <body>
      ${renderHeader(taxpayer.name, taxpayer.tin, period.periodName || period.taxYear, 'MIRA 205 - General Sector Goods & Services Tax Return', data.generatedAt)}

      <div class="highlight-box ${isDue ? 'due' : ''}">
        <span>FINAL GST ${isDue ? 'PAYABLE TO MIRA' : 'CLAIMABLE REFUND'} (BOX 17)</span>
        <span>MVR ${(Math.abs(netGst)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>

      <div class="section-box">
        <div class="section-header">Taxpayer & Period Information</div>
        <div class="grid-3">
          <div><div class="info-label">Taxpayer Name</div><div class="info-value">${taxpayer.name || 'N/A'}</div></div>
          <div><div class="info-label">TIN</div><div class="info-value">${taxpayer.tin || 'N/A'}</div></div>
          <div><div class="info-label">Sector</div><div class="info-value">GENERAL (8% GST)</div></div>
          <div><div class="info-label">Tax Period</div><div class="info-value">${period.periodName || 'N/A'}</div></div>
          <div><div class="info-label">Period Start</div><div class="info-value">${period.startDate || 'N/A'}</div></div>
          <div><div class="info-label">Period End</div><div class="info-value">${period.endDate || 'N/A'}</div></div>
        </div>
      </div>

      <div class="section-box">
        <div class="section-header">Section A: Output Supplies (Boxes 1 - 7)</div>
        <table class="data-table">
          <tr><th>Description</th><th class="number">Supplies Amount (MVR)</th><th class="number">Output Tax (MVR)</th></tr>
          <tr><td>Box 1: Standard-Rated Supplies (8%)</td><td class="number">${(supplies.box1_StandardRatedSupplies8Pct?.taxableValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">${(supplies.box1_StandardRatedSupplies8Pct?.outputTax || supplies.box5_TotalOutputTax || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Box 2: Zero-Rated Supplies / Exports</td><td class="number">${(supplies.box2_ZeroRatedSupplies || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">0.00</td></tr>
          <tr><td>Box 3: Exempt Supplies</td><td class="number">${(supplies.box3_ExemptSupplies || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">0.00</td></tr>
          <tr class="total-row"><td>Box 4 & 5: Total Supplies & Total Output Tax</td><td class="number">${(supplies.box4_TotalSuppliesValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">${(supplies.box5_TotalOutputTax || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Box 6: Output Tax Adjustments (Credit/Debit Notes)</td><td class="number">-</td><td class="number">${(supplies.box6_OutputTaxAdjustments || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr class="total-row"><td>Box 7: Net Output Tax Payable</td><td class="number">-</td><td class="number">${(supplies.box7_NetOutputTax || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
        </table>
      </div>

      <div class="section-box">
        <div class="section-header">Section B: Input Purchases (Boxes 8 - 14)</div>
        <table class="data-table">
          <tr><th>Description</th><th class="number">Purchases Amount (MVR)</th><th class="number">Input Tax (MVR)</th></tr>
          <tr><td>Box 8: Standard-Rated Operational Purchases</td><td class="number">${(purchases.box8_StandardRatedPurchases?.taxableValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">${(purchases.box8_StandardRatedPurchases?.inputTax || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Box 9: Capital Asset Purchases</td><td class="number">${(purchases.box9_CapitalPurchases?.taxableValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">${(purchases.box9_CapitalPurchases?.inputTax || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Box 10: Blocked Non-Claimable Input Tax (Sec 22(b))</td><td class="number">${(purchases.box10_BlockedInputTax?.taxableValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">(${(purchases.box10_BlockedInputTax?.blockedTax || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })})</td></tr>
          <tr><td>Box 11: Mixed-Use Apportionment Claimable Tax</td><td class="number">${(purchases.box11_MixedUseApportionment?.totalMixedValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">${(purchases.box11_MixedUseApportionment?.claimableInputTax || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr class="total-row"><td>Box 12: Total Claimable Input Tax</td><td class="number">-</td><td class="number">${(purchases.box12_TotalClaimableInputTax || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Box 13: Input Tax Adjustments</td><td class="number">-</td><td class="number">${(purchases.box13_InputTaxAdjustments || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr class="total-row"><td>Box 14: Net Claimable Input Tax</td><td class="number">-</td><td class="number">${(purchases.box14_NetClaimableInputTax || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
        </table>
      </div>

      <div class="declaration-block">
        <div class="declaration-title">Official Taxpayer Declaration</div>
        <p>I declare to the best of my knowledge and belief that the information given in this MIRA 205 GST return is true, correct, and complete in accordance with the Maldives Goods and Services Tax Act (Act No. 10/2011).</p>
        <div class="signature-grid">
          <div class="signature-line">Authorized Signatory</div>
          <div class="signature-line">Designation</div>
          <div class="signature-line">Date</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generates styled HTML layout for MIRA 206 Tourism Sector GST Return (TGST)
 */
export function renderMira206Html(data: any): string {
  const taxpayer = data.taxpayer || {};
  const period = data.period || {};
  const supplies = data.sectionA_Supplies || {};
  const purchases = data.sectionB_Purchases || {};
  const calc = data.sectionC_Calculation || {};

  const netGst = calc.box16_FinalTgstPayableOrRefundable ?? calc.box14_NetTgstPayableOrRefundable ?? 0;
  const isDue = netGst >= 0;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>MIRA 206 - Tourism Sector GST Return</title>
      ${commonStyles}
    </head>
    <body>
      ${renderHeader(taxpayer.name, taxpayer.tin, period.periodName || period.taxYear, 'MIRA 206 - Tourism Sector GST Return (TGST)', data.generatedAt)}

      <div class="highlight-box ${isDue ? 'due' : ''}">
        <span>FINAL TGST ${isDue ? 'PAYABLE TO MIRA' : 'CLAIMABLE REFUND'} (BOX 16)</span>
        <span>MVR ${(Math.abs(netGst)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>

      <div class="section-box">
        <div class="section-header">Tourism Entity & Period Information</div>
        <div class="grid-3">
          <div><div class="info-label">Establishment Name</div><div class="info-value">${taxpayer.tourismEstablishmentName || taxpayer.name || 'N/A'}</div></div>
          <div><div class="info-label">TIN</div><div class="info-value">${taxpayer.tin || 'N/A'}</div></div>
          <div><div class="info-label">Operating License No</div><div class="info-value">${taxpayer.operatingLicenseNumber || 'MOT-LIC-2026'}</div></div>
          <div><div class="info-label">Tax Period</div><div class="info-value">${period.periodName || 'N/A'}</div></div>
          <div><div class="info-label">Period Start</div><div class="info-value">${period.startDate || 'N/A'}</div></div>
          <div><div class="info-label">Period End</div><div class="info-value">${period.endDate || 'N/A'}</div></div>
        </div>
      </div>

      <div class="section-box">
        <div class="section-header">Section A: Tourism Supplies (Boxes 1 - 7)</div>
        <table class="data-table">
          <tr><th>Description</th><th class="number">Supplies (MVR)</th><th class="number">TGST (MVR)</th></tr>
          <tr><td>Box 1A: Tourism Supplies @ 16% (through 2025-06-30)</td><td class="number">${(supplies.box1A_TourismSupplies16Pct?.taxableValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">${(supplies.box1A_TourismSupplies16Pct?.outputTax || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Box 1B: Tourism Supplies @ 17% (from 2025-07-01)</td><td class="number">${(supplies.box1B_TourismSupplies17Pct?.taxableValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">${(supplies.box1B_TourismSupplies17Pct?.outputTax || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Box 2: Zero-Rated Tourism Supplies</td><td class="number">${(supplies.box2_ZeroRatedTourismSupplies || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">0.00</td></tr>
          <tr><td>Box 3: Exempt Tourism Supplies</td><td class="number">${(supplies.box3_ExemptTourismSupplies || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">0.00</td></tr>
          <tr class="total-row"><td>Box 4 & 5: Total Supplies & Total TGST Output Tax</td><td class="number">${(supplies.box4_TotalTourismSuppliesValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td><td class="number">${(supplies.box5_TotalTgstOutputTax || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Box 6: TGST Output Adjustments</td><td class="number">-</td><td class="number">${(supplies.box6_TgstOutputAdjustments || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr class="total-row"><td>Box 7: Net TGST Output Tax Payable</td><td class="number">-</td><td class="number">${(supplies.box7_NetTgstOutputTax || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
        </table>
      </div>

      <div class="declaration-block">
        <div class="declaration-title">Official Tourism GST Declaration</div>
        <p>I certify that this TGST Return is true and correct in accordance with the Goods and Services Tax Act and Tourism Sector Tax Regulations.</p>
        <div class="signature-grid">
          <div class="signature-line">Authorized Tourism Representative</div>
          <div class="signature-line">Designation</div>
          <div class="signature-line">Date</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generates styled HTML layout for MIRA 602 Non-Resident Withholding Tax Return
 */
export function renderMira602Html(data: any): string {
  const taxpayer = data.taxpayer || {};
  const period = data.period || {};
  const categories = data.categorySummaries || [];
  const payees = data.scheduleOfPayees || [];

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>MIRA 602 - Non-Resident Withholding Tax Return</title>
      ${commonStyles}
    </head>
    <body>
      ${renderHeader(taxpayer.businessName || taxpayer.taxpayerName, taxpayer.tin, period.periodName || period.taxYear, 'MIRA 602 - Non-Resident Withholding Tax Return (Section 55)', data.generatedAt)}

      <div class="highlight-box">
        <span>TOTAL NWT TAX WITHHELD AT SOURCE</span>
        <span>MVR ${(data.totalNwtWithheldMvr || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>

      <div class="section-box">
        <div class="section-header">Section A: Taxpayer & Period Details</div>
        <div class="grid-3">
          <div><div class="info-label">Taxpayer Name</div><div class="info-value">${escapeHtml(taxpayer.businessName || taxpayer.taxpayerName || 'N/A')}</div></div>
          <div><div class="info-label">TIN</div><div class="info-value">${escapeHtml(taxpayer.tin || 'N/A')}</div></div>
          <div><div class="info-label">Period Name</div><div class="info-value">${escapeHtml(period.periodName || 'N/A')}</div></div>
          <div><div class="info-label">Period Start</div><div class="info-value">${escapeHtml(period.startDate || 'N/A')}</div></div>
          <div><div class="info-label">Period End</div><div class="info-value">${escapeHtml(period.endDate || 'N/A')}</div></div>
          <div><div class="info-label">Filing Due Date</div><div class="info-value">${escapeHtml(data.filingDueDate || period.filingDueDate || 'N/A')}</div></div>
        </div>
      </div>

      <div class="section-box">
        <div class="section-header">Section B: Statutory Category Breakdown</div>
        <table class="data-table">
          <thead>
            <tr><th>Statutory Category</th><th class="number">Rate</th><th class="number">Count</th><th class="number">Gross Payments (MVR)</th><th class="number">Tax Withheld (MVR)</th></tr>
          </thead>
          <tbody>
            ${categories.map((c: any) => `
              <tr>
                <td>${escapeHtml(c.categoryName || c.category)}</td>
                <td class="number">${(c.statutoryRate * 100).toFixed(0)}%</td>
                <td class="number">${c.transactionCount || 0}</td>
                <td class="number">${(c.totalGrossAmountMvr || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td class="number">${(c.totalNwtWithheldMvr || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
            `).join('')}
            <tr class="total-row">
              <td colspan="3">Total Summary</td>
              <td class="number">${(data.totalGrossPaymentsMvr || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              <td class="number">${(data.totalNwtWithheldMvr || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="section-box">
        <div class="section-header">Section C: Line-by-Line Non-Resident Payee Schedule</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Payee Name</th>
              <th>Country</th>
              <th>Category</th>
              <th>Withholding Date</th>
              <th class="number">Gross (MVR)</th>
              <th class="number">Rate</th>
              <th class="number">NWT Withheld (MVR)</th>
            </tr>
          </thead>
          <tbody>
            ${payees.map((p: any) => `
              <tr>
                <td>${escapeHtml(p.lineNo || '-')}</td>
                <td>${escapeHtml(p.payeeName)}</td>
                <td>${escapeHtml(p.payeeCountry)}</td>
                <td>${escapeHtml(p.categoryDescription || p.category)}</td>
                <td>${escapeHtml(p.withholdingDate || '-')}</td>
                <td class="number">${(p.grossAmountMvr || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td class="number">${((p.nwtRate || 0.1) * 100).toFixed(0)}%</td>
                <td class="number">${(p.nwtWithheldMvr || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
              </tr>
            `).join('')}
            ${payees.length === 0 ? '<tr><td colspan="8" style="text-align:center; color:#94a3b8; padding:16px;">No non-resident payee transactions recorded.</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generates styled HTML layout for MIRA 604 Schedule 2 (Statement of Financial Position - Balance Sheet)
 */
export function renderSchedule2Html(data: any): string {
  const sch = data.schedule2 || data || {};
  const values = sch.mappedFields || sch.values || sch || {};

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>MIRA 604 Schedule 2 - Statement of Financial Position</title>
      ${commonStyles}
    </head>
    <body>
      ${renderHeader(data.entityName || 'Taxpayer', data.tin || 'N/A', data.taxYear || 2026, 'MIRA 604 Schedule 2 - Statement of Financial Position (Balance Sheet)', data.generatedAt)}

      <div class="section-box">
        <div class="section-header">Assets</div>
        <table class="data-table">
          <tr><th>Description</th><th class="number">Amount (MVR)</th></tr>
          <tr><td>Property, Plant and Equipment (PPE)</td><td class="number">${(values.S2_A01_PPE || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Intangible Assets</td><td class="number">${(values.S2_A02_INTANGIBLES || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Other Non-Current Assets</td><td class="number">${(values.S2_A03_OTHER_NON_CURRENT_ASSETS || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr class="total-row"><td>Total Non-Current Assets</td><td class="number">${(values.S2_A04_TOTAL_NON_CURRENT_ASSETS || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Inventories / Stock</td><td class="number">${(values.S2_A05_INVENTORIES || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Trade and Other Receivables</td><td class="number">${(values.S2_A06_RECEIVABLES || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Cash and Cash Equivalents</td><td class="number">${(values.S2_A07_CASH_EQUIVALENTS || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr class="total-row"><td>Total Current Assets</td><td class="number">${(values.S2_A09_TOTAL_CURRENT_ASSETS || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr class="total-row"><td>TOTAL ASSETS</td><td class="number">${(values.S2_A10_TOTAL_ASSETS || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
        </table>
      </div>

      <div class="section-box">
        <div class="section-header">Equity & Liabilities</div>
        <table class="data-table">
          <tr><th>Description</th><th class="number">Amount (MVR)</th></tr>
          <tr><td>Share Capital / Owner Capital</td><td class="number">${(values.S2_L01_SHARE_CAPITAL || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Retained Earnings / Accumulated Reserves</td><td class="number">${(values.S2_L02_RETAINED_EARNINGS || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr class="total-row"><td>Total Equity</td><td class="number">${(values.S2_L04_TOTAL_EQUITY || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Non-Current Liabilities (Long-term borrowings)</td><td class="number">${(values.S2_L06_NON_CURRENT_LIABILITIES || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Trade and Other Payables (Current liabilities)</td><td class="number">${(values.S2_L07_TRADE_PAYABLES || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr class="total-row"><td>Total Liabilities</td><td class="number">${(values.S2_L09_TOTAL_CURRENT_LIABILITIES || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
          <tr class="total-row"><td>TOTAL EQUITY AND LIABILITIES</td><td class="number">${(values.S2_L10_TOTAL_EQUITY_AND_LIABILITIES || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td></tr>
        </table>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generates styled HTML layout for MIRA Cross-Module Reconciliation Audit Report
 */
export function renderReconciliationReportHtml(data: any): string {
  const results = data.results || [];
  const status = data.overallStatus || (data.isValid ? 'PASS' : 'WARNING');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>MIRA Statutory Cross-Module Reconciliation Audit Report</title>
      ${commonStyles}
    </head>
    <body>
      ${renderHeader(data.taxpayerName || data.entityId || 'Taxpayer', data.tin || 'N/A', data.taxYear || 2026, 'MIRA Cross-Module Reconciliation Audit Report (12 Modules)', data.auditTimestamp || data.generatedAt)}

      <div class="highlight-box ${status === 'PASS' ? '' : 'due'}">
        <span>STATUTORY RECONCILIATION SUITE RESULT</span>
        <span>${status} (${results.filter((r: any) => r.isReconciled).length}/${results.length} MODULES RECONCILED)</span>
      </div>

      <div class="section-box">
        <div class="section-header">12-Module Cross-Subsystem Audit Summary</div>
        <table class="data-table">
          <thead>
            <tr>
              <th>Module Rule ID & Name</th>
              <th class="number">Primary Balance</th>
              <th class="number">Secondary Balance</th>
              <th class="number">Variance (MVR)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${results.map((r: any) => `
              <tr>
                <td><strong>${escapeHtml(r.ruleId)}</strong> - ${escapeHtml(r.moduleName)}</td>
                <td class="number">${(r.primaryBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td class="number">${(r.secondaryBalance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td class="number">${(r.variance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td><span style="color: ${r.isReconciled ? '#166534' : '#991b1b'}; font-weight: 700;">${escapeHtml(r.status || (r.isReconciled ? 'RECONCILED' : 'DISCREPANCY'))}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
}

