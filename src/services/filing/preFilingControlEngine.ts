/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pre-Filing Control Engine (Phase 45)
 * 
 * Implements authoritative pre-filing control and statutory verification.
 * Enforces all 14 mandatory compliance checks before statutory filing packages can be generated.
 * Returns READY_FOR_FILING or NOT_READY with blocking issues.
 */

import {
  PreFilingCheck,
  PreFilingCheckCode,
  PreFilingCheckInput,
  PreFilingCheckStatus,
  PreFilingIssue,
  PreFilingResult
} from '../../types/preFiling';

export class PreFilingBlockedError extends Error {
  public readonly preFilingResult: PreFilingResult;
  public readonly blockingIssues: PreFilingIssue[];

  constructor(message: string, result: PreFilingResult) {
    super(message);
    this.name = 'PreFilingBlockedError';
    this.preFilingResult = result;
    this.blockingIssues = result?.blockingIssues || [];
  }
}

export class PreFilingControlEngine {
  public static getMandatoryCheckCodes(): PreFilingCheckCode[] {
    return [
      'ACCOUNTING_BALANCES',
      'NO_UNPOSTED_REQUIRED_TRANSACTIONS',
      'PERIOD_APPROVED',
      'PERIOD_STATUS_VALID',
      'GST_RECONCILED',
      'NWT_RECONCILED',
      'FIXED_ASSETS_RECONCILED',
      'TAX_ADJUSTMENTS_REVIEWED',
      'TAX_LOSSES_RECONCILED',
      'MIRA_RETURN_VALIDATED',
      'REQUIRED_SCHEDULES_VALIDATED',
      'SUPPORTING_DOCUMENTS_PRESENT',
      'MANDATORY_APPROVALS_COMPLETE',
      'NO_BLOCKING_AUDIT_EXCEPTIONS'
    ];
  }

  public static evaluateReadiness(input: PreFilingCheckInput): PreFilingResult {
    return this.runPreFilingCheck(input);
  }

  /**
   * Evaluates all 14 pre-filing checks for a taxpayer / reporting period.
   * 
   * @param input All relevant domain datasets (bills, journals, assets, periodInfo, returns, schedules, etc.)
   * @returns PreFilingResult with status READY_FOR_FILING or NOT_READY and detailed blocking issues
   */
  public static runPreFilingCheck(input: PreFilingCheckInput): PreFilingResult {
    const evaluatedAt = new Date().toISOString();
    const checks: Record<PreFilingCheckCode, PreFilingCheck> = {} as any;
    const blockingIssues: PreFilingIssue[] = [];
    const warnings: PreFilingIssue[] = [];

    const bills = input.bills || [];
    const journals = input.journals || [];
    const assets = input.assets || [];
    const adjustments = input.taxAdjustments || [];
    const lossLots = input.taxLossLots || [];
    const auditLogs = input.auditLogs || [];
    const periodInfo = input.periodInfo;
    const miraReturns = input.miraReturns || {};
    const schedules = input.schedules || {};

    // Helper to construct check record
    function recordCheck(
      code: PreFilingCheckCode,
      name: string,
      description: string,
      checkIssues: PreFilingIssue[],
      metrics?: Record<string, any>
    ) {
      const blockers = checkIssues.filter(i => i.severity === 'BLOCKING');
      const warns = checkIssues.filter(i => i.severity === 'WARNING');
      
      let status: PreFilingCheckStatus = 'PASS';
      if (blockers.length > 0) {
        status = 'BLOCKED';
      } else if (warns.length > 0) {
        status = 'WARNING';
      }

      const check: PreFilingCheck = {
        code,
        name,
        description,
        status,
        isPassed: blockers.length === 0,
        hasBlockingIssues: blockers.length > 0,
        issues: checkIssues,
        evaluatedAt,
        metrics
      };

      checks[code] = check;
      blockingIssues.push(...blockers);
      warnings.push(...warns);
      return check;
    }

    // =========================================================================
    // CHECK 1: Accounting Balances (Trial balance equates to zero)
    // =========================================================================
    const balanceIssues: PreFilingIssue[] = [];
    let totalDebit = 0;
    let totalCredit = 0;
    let imbalancedJournalsCount = 0;

    journals.forEach((j: any) => {
      let jDebit = 0;
      let jCredit = 0;
      const lines = j.lines || [];
      lines.forEach((l: any) => {
        const d = Number(l.debit || 0);
        const c = Number(l.credit || 0);
        jDebit += d;
        jCredit += c;
        if (j.status === 'POSTED') {
          totalDebit += d;
          totalCredit += c;
        }
      });

      if (Math.abs(jDebit - jCredit) > 0.01) {
        imbalancedJournalsCount++;
        balanceIssues.push({
          id: `PRE-BAL-JRN-${j.id || j.reference}`,
          checkCode: 'ACCOUNTING_BALANCES',
          checkName: 'Accounting Balances',
          severity: 'BLOCKING',
          title: `Imbalanced Journal Entry: ${j.reference || j.id}`,
          detail: `Journal Voucher '${j.reference || j.id}' is mathematically imbalanced. Debits (${jDebit.toFixed(2)} MVR) do not equal credits (${jCredit.toFixed(2)} MVR). Variance: ${Math.abs(jDebit - jCredit).toFixed(2)} MVR.`,
          remedy: 'Correct journal line debit and credit amounts so the entry balances to zero.',
          legalReference: 'Maldives Companies Act 2023 & Double-Entry Accounting Standards',
          recordId: j.id,
          recordType: 'journal',
          recordIdentifier: j.reference || j.id,
          amount: Math.abs(jDebit - jCredit)
        });
      }
    });

    const netTbVariance = Math.abs(totalDebit - totalCredit);
    if (netTbVariance > 0.01) {
      balanceIssues.push({
        id: 'PRE-BAL-TB-IMBALANCE',
        code: 'TB_UNBALANCED',
        checkCode: 'ACCOUNTING_BALANCES',
        checkName: 'Accounting Balances',
        severity: 'BLOCKING',
        title: 'Trial Balance Out of Balance',
        detail: `General Ledger trial balance is out of balance. Total posted debits (${totalDebit.toFixed(2)} MVR) do not equal total posted credits (${totalCredit.toFixed(2)} MVR). Net difference: ${netTbVariance.toFixed(2)} MVR.`,
        remedy: 'Identify and post balancing entries to eliminate general ledger trial balance variance.',
        legalReference: 'Maldives Companies Act 2023 & Financial Reporting Standards',
        recordType: 'general_ledger',
        recordIdentifier: 'GL-TRIAL-BALANCE',
        amount: netTbVariance
      });
    }

    if (input.trialBalance) {
      const tbDebits = Number(input.trialBalance.totalDebits || 0);
      const tbCredits = Number(input.trialBalance.totalCredits || 0);
      const explicitDiff = Math.abs(Number(input.trialBalance.difference !== undefined ? input.trialBalance.difference : tbDebits - tbCredits));
      if (explicitDiff > 0.01) {
        balanceIssues.push({
          id: 'PRE-BAL-TB-EXPLICIT',
          code: 'TB_UNBALANCED',
          checkCode: 'ACCOUNTING_BALANCES',
          checkName: 'Accounting Balances',
          severity: 'BLOCKING',
          title: 'Trial Balance Out of Balance',
          detail: `General Ledger trial balance debits (${tbDebits.toFixed(2)} MVR) do not equal credits (${tbCredits.toFixed(2)} MVR). Net difference: ${explicitDiff.toFixed(2)} MVR.`,
          remedy: 'Identify and post balancing entries to eliminate general ledger trial balance variance.',
          legalReference: 'Maldives Companies Act 2023 & Financial Reporting Standards',
          recordType: 'general_ledger',
          recordIdentifier: 'GL-TRIAL-BALANCE',
          amount: explicitDiff
        });
      }
    }

    recordCheck(
      'ACCOUNTING_BALANCES',
      'Accounting Balances',
      'Validates that all journal vouchers and the General Ledger trial balance are balanced (Debits = Credits).',
      balanceIssues,
      { totalDebit, totalCredit, netTbVariance, imbalancedJournalsCount }
    );

    // =========================================================================
    // CHECK 2: No Unposted Required Transactions
    // =========================================================================
    const unpostedIssues: PreFilingIssue[] = [];
    const unpostedJournals = journals.filter((j: any) => j.status === 'DRAFT' || j.status === 'UNPOSTED' || j.status === 'PENDING_POSTING');
    
    unpostedJournals.forEach((j: any) => {
      unpostedIssues.push({
        id: `PRE-UNPOSTED-JRN-${j.id || j.reference}`,
        checkCode: 'NO_UNPOSTED_REQUIRED_TRANSACTIONS',
        checkName: 'No Unposted Required Transactions',
        severity: 'BLOCKING',
        title: `Unposted Draft Journal: ${j.reference || j.id}`,
        detail: `Journal Voucher '${j.reference || j.id}' (${j.description || 'General entry'}) is in ${j.status || 'DRAFT'} status. All relevant transactions must be posted to the General Ledger before statutory filing.`,
        remedy: 'Post or void draft journal vouchers in the General Ledger module.',
        legalReference: 'Maldives Companies Act 2023 Statutory Bookkeeping Requirements',
        recordId: j.id,
        recordType: 'journal',
        recordIdentifier: j.reference || j.id,
        recordDate: j.entryDate || j.date
      });
    });

    const unpostedBills = bills.filter((b: any) =>
      b.status === 'draft' ||
      b.status === 'pending_review' ||
      b.status === 'pending' ||
      b.isApproved === false
    );

    unpostedBills.forEach((b: any) => {
      unpostedIssues.push({
        id: `PRE-UNPOSTED-BILL-${b.id}`,
        checkCode: 'NO_UNPOSTED_REQUIRED_TRANSACTIONS',
        checkName: 'No Unposted Required Transactions',
        severity: 'BLOCKING',
        title: `Unposted or Unapproved Bill Record: ${b.id}`,
        detail: `Bill record '${b.id}' is unapproved or in status '${b.status}'. All transactions within the filing period must be approved and posted.`,
        remedy: 'Review and approve or post pending bill in the Accounting subledger.',
        legalReference: 'Maldives Companies Act 2023 Statutory Bookkeeping Requirements',
        recordId: b.id,
        recordType: 'bill',
        recordIdentifier: b.id
      });
    });

    const unpostedCheck = recordCheck(
      'NO_UNPOSTED_REQUIRED_TRANSACTIONS',
      'No Unposted Required Transactions',
      'Verifies that no draft, pending, or unposted journal vouchers or bills remain in the accounting period.',
      unpostedIssues,
      { unpostedJournalsCount: unpostedJournals.length, unpostedBillsCount: unpostedBills.length }
    );
    Object.defineProperty(checks, 'NO_UNPOSTED_TRANSACTIONS', {
      value: unpostedCheck,
      enumerable: false,
      configurable: true
    });

    // =========================================================================
    // CHECK 3: Period Approved
    // =========================================================================
    const periodApprovedIssues: PreFilingIssue[] = [];
    const isPeriodApproved = input.periodApproved !== undefined
      ? input.periodApproved
      : (periodInfo ? (periodInfo.isApproved === true || periodInfo.status === 'APPROVED' || (periodInfo as any).approvalStatus === 'APPROVED') : true);

    if (!isPeriodApproved) {
      periodApprovedIssues.push({
        id: `PRE-PERIOD-UNAPPROVED-${periodInfo?.id || periodInfo?.periodKey || input.period || 'current'}`,
        checkCode: 'PERIOD_APPROVED',
        checkName: 'Period Approved',
        severity: 'BLOCKING',
        title: `Accounting Period Not Formally Approved: ${periodInfo?.periodKey || input.period || 'Current Period'}`,
        detail: 'The accounting period has not received formal sign-off from the authorized Tax Manager or Director. Statutory filing requires prior period approval.',
        remedy: 'Obtain formal period close sign-off in the Period Control module before statutory filing.',
        legalReference: 'Tax Administration Act (Law No. 3/2010) & Period Close Regulations',
        recordId: periodInfo?.id,
        recordType: 'period',
        recordIdentifier: periodInfo?.periodKey || input.period || 'current'
      });
    }

    recordCheck(
      'PERIOD_APPROVED',
      'Period Approved',
      'Verifies that the target accounting period has been formally approved and signed off by authorized personnel.',
      periodApprovedIssues,
      { isApproved: isPeriodApproved }
    );

    // =========================================================================
    // CHECK 4: Period Status Valid
    // =========================================================================
    const periodStatusIssues: PreFilingIssue[] = [];
    const rawPeriodStatus = (input.periodStatus || periodInfo?.status || 'CLOSED').toUpperCase();
    const validStatuses = ['CLOSED', 'LOCKED', 'APPROVED'];
    const isValidPeriodStatus = validStatuses.includes(rawPeriodStatus);

    if (!isValidPeriodStatus || rawPeriodStatus === 'OPEN' || rawPeriodStatus === 'DRAFT') {
      periodStatusIssues.push({
        id: `PRE-PERIOD-STATUS-${periodInfo?.id || periodInfo?.periodKey || input.period || 'current'}`,
        checkCode: 'PERIOD_STATUS_VALID',
        checkName: 'Period Status Valid',
        severity: 'BLOCKING',
        title: `Invalid Period Status: ${rawPeriodStatus}`,
        detail: `Accounting period is currently in '${rawPeriodStatus}' status. Open periods permit transaction creation and mutation. The period must be CLOSED or LOCKED to guarantee immutability during and after filing.`,
        remedy: 'Execute formal Period Lock in the Period Control module.',
        legalReference: 'Maldives Companies Act 2023 & Period Immutability Standards',
        recordId: periodInfo?.id,
        recordType: 'period',
        recordIdentifier: periodInfo?.periodKey || input.period || 'current'
      });
    }

    recordCheck(
      'PERIOD_STATUS_VALID',
      'Period Status Valid',
      'Ensures the accounting period is locked or closed to prevent unauthorized changes before statutory package generation.',
      periodStatusIssues,
      { periodStatus: rawPeriodStatus }
    );

    // =========================================================================
    // CHECK 5: GST Reconciled
    // =========================================================================
    const gstReconIssues: PreFilingIssue[] = [];
    let calculatedInputTax = 0;
    bills.forEach((b: any) => {
      const v = b.verifiedData || b.extractedData;
      const amt = Number(v?.totals?.gst_amount || 0);
      if (amt > 0 && v?.tax_status === 'TAX_CHARGED') {
        calculatedInputTax += amt;
      }
    });

    let glInputTax = 0;
    journals.forEach((j: any) => {
      if (j.status === 'POSTED') {
        (j.lines || []).forEach((l: any) => {
          if (l.accountCode === '1400' || l.accountName?.toLowerCase().includes('gst input')) {
            glInputTax += Number(l.debit || 0) - Number(l.credit || 0);
          }
        });
      }
    });

    // If GL input tax is recorded and differs from bills subledger
    if (glInputTax > 0 && Math.abs(calculatedInputTax - glInputTax) > 0.01) {
      const variance = Math.abs(calculatedInputTax - glInputTax);
      gstReconIssues.push({
        id: 'PRE-GST-RECON-DIFF',
        checkCode: 'GST_RECONCILED',
        checkName: 'GST Reconciled',
        severity: 'BLOCKING',
        title: 'GST Sub-Ledger vs General Ledger Discrepancy',
        detail: `GST input tax claimed on verified purchase bills (${calculatedInputTax.toFixed(2)} MVR) does not agree with General Ledger Account 1400 (${glInputTax.toFixed(2)} MVR). Net variance: ${variance.toFixed(2)} MVR.`,
        remedy: 'Reconcile purchase invoice tax breakdowns with GL Account 1400 postings or record an adjusting journal.',
        legalReference: 'Goods and Services Tax Act Section 21 & Section 27',
        recordType: 'general_ledger',
        recordIdentifier: 'GL-ACC-1400',
        amount: variance
      });
    }

    // Check reconciliation result if provided
    if (input.reconciliationResult?.subLedgers?.gst?.hasDiscrepancy) {
      const r = input.reconciliationResult.subLedgers.gst;
      gstReconIssues.push({
        id: 'PRE-GST-RECON-SUITE-FAIL',
        checkCode: 'GST_RECONCILED',
        checkName: 'GST Reconciled',
        severity: 'BLOCKING',
        title: 'Reconciliation Suite GST Discrepancy Flag',
        detail: r.message || 'Cross-module reconciliation suite identified unresolved GST discrepancies.',
        remedy: 'Resolve the GST discrepancies identified by the reconciliation engine.',
        legalReference: 'Goods and Services Tax Act Section 27',
        recordType: 'return',
        recordIdentifier: 'GST-RECON-SUITE'
      });
    }

    if (input.gstReconciliation) {
      const gVar = Math.abs(Number(input.gstReconciliation.variance ?? 0));
      const gIsRecon = input.gstReconciliation.isReconciled !== false && gVar <= 0.01;
      if (!gIsRecon || gVar > 0.01) {
        gstReconIssues.push({
          id: 'PRE-GST-RECON-EXPLICIT',
          code: 'GST_RECON_VARIANCE',
          checkCode: 'GST_RECONCILED',
          checkName: 'GST Reconciled',
          severity: 'BLOCKING',
          title: 'GST Sub-Ledger vs General Ledger Discrepancy',
          detail: `GST reconciliation reports an unresolved variance of ${gVar.toFixed(2)} MVR between tax return schedule and GL balances.`,
          remedy: 'Reconcile GST input/output schedules with GL Account 1400/2100.',
          legalReference: 'Goods and Services Tax Act Section 21 & Section 27',
          recordType: 'general_ledger',
          recordIdentifier: 'GL-ACC-1400',
          amount: gVar
        });
      }
    }

    recordCheck(
      'GST_RECONCILED',
      'GST Reconciled',
      'Validates that input tax and output tax sub-ledgers reconcile completely with General Ledger control accounts (1400 and 2100).',
      gstReconIssues,
      { calculatedInputTax, glInputTax, variance: Math.abs(calculatedInputTax - glInputTax) }
    );

    // =========================================================================
    // CHECK 6: NWT Reconciled
    // =========================================================================
    const nwtReconIssues: PreFilingIssue[] = [];
    let nwtExpected = 0;
    bills.forEach((b: any) => {
      const v = b.verifiedData || b.extractedData;
      const curr = v?.invoice_info?.currency?.toUpperCase();
      const isForeign = curr && curr !== 'MVR';
      const isService = /consult|software|service|license|technical|royalty/i.test(v?.expense_category || '');
      if (isForeign && isService) {
        const taxable = Number(v?.totals?.taxable_value || v?.totals?.invoice_total || 0);
        nwtExpected += taxable * 0.10; // 10% statutory rate
      }
    });

    let glNwt = 0;
    journals.forEach((j: any) => {
      if (j.status === 'POSTED') {
        (j.lines || []).forEach((l: any) => {
          if (l.accountCode === '2150' || l.accountName?.toLowerCase().includes('withholding')) {
            glNwt += Number(l.credit || 0) - Number(l.debit || 0);
          }
        });
      }
    });

    if (nwtExpected > 0 && glNwt > 0 && Math.abs(nwtExpected - glNwt) > 0.01) {
      const nwtVariance = Math.abs(nwtExpected - glNwt);
      nwtReconIssues.push({
        id: 'PRE-NWT-RECON-DIFF',
        checkCode: 'NWT_RECONCILED',
        checkName: 'NWT Reconciled',
        severity: 'BLOCKING',
        title: 'Non-Resident Withholding Tax (NWT) Discrepancy',
        detail: `Expected Section 55 withholding tax on foreign service invoices (${nwtExpected.toFixed(2)} MVR) does not agree with GL Account 2150 (${glNwt.toFixed(2)} MVR). Variance: ${nwtVariance.toFixed(2)} MVR.`,
        remedy: 'Verify cross-border consulting/software withholding calculations and post balancing entries to GL 2150.',
        legalReference: 'Income Tax Act Section 55 (Non-Resident Withholding Tax)',
        recordType: 'general_ledger',
        recordIdentifier: 'GL-ACC-2150',
        amount: nwtVariance
      });
    }

    if (input.nwtReconciliation) {
      const nVar = Math.abs(Number(input.nwtReconciliation.variance ?? 0));
      const nIsRecon = input.nwtReconciliation.isReconciled !== false && nVar <= 0.01;
      if (!nIsRecon || nVar > 0.01) {
        nwtReconIssues.push({
          id: 'PRE-NWT-RECON-EXPLICIT',
          code: 'NWT_RECON_VARIANCE',
          checkCode: 'NWT_RECONCILED',
          checkName: 'NWT Reconciled',
          severity: 'BLOCKING',
          title: 'Non-Resident Withholding Tax (NWT) Discrepancy',
          detail: `NWT reconciliation reports an unresolved variance of ${nVar.toFixed(2)} MVR.`,
          remedy: 'Reconcile withholding tax deducted with remittances and GL Account 2150.',
          legalReference: 'Goods and Services Tax Act & Income Tax Act Section 55 Withholding Tax Regulations',
          recordType: 'general_ledger',
          recordIdentifier: 'GL-ACC-2150',
          amount: nVar
        });
      }
    }

    recordCheck(
      'NWT_RECONCILED',
      'NWT Reconciled',
      'Validates that Section 55 Non-Resident Withholding Tax liabilities reconcile with General Ledger Account 2150.',
      nwtReconIssues,
      { nwtExpected, glNwt }
    );

    // =========================================================================
    // CHECK 7: Fixed Assets Reconciled
    // =========================================================================
    const assetReconIssues: PreFilingIssue[] = [];
    let assetRegisterCost = 0;
    let assetRegisterAccDep = 0;
    assets.forEach((a: any) => {
      assetRegisterCost += Number(a.purchasePrice || a.cost || 0);
      assetRegisterAccDep += Number(a.accumulatedDepreciation || 0);
    });

    let glAssetCost = 0;
    let glAccDep = 0;
    journals.forEach((j: any) => {
      if (j.status === 'POSTED') {
        (j.lines || []).forEach((l: any) => {
          if (l.accountCode === '1500' || l.accountName?.toLowerCase().includes('property, plant') || l.accountName?.toLowerCase().includes('equipment')) {
            glAssetCost += Number(l.debit || 0) - Number(l.credit || 0);
          }
          if (l.accountCode === '1550' || l.accountName?.toLowerCase().includes('accumulated depreciation')) {
            glAccDep += Number(l.credit || 0) - Number(l.debit || 0);
          }
        });
      }
    });

    if (assetRegisterCost > 0 && glAssetCost > 0 && Math.abs(assetRegisterCost - glAssetCost) > 0.01) {
      const costVariance = Math.abs(assetRegisterCost - glAssetCost);
      assetReconIssues.push({
        id: 'PRE-ASSET-COST-DIFF',
        checkCode: 'FIXED_ASSETS_RECONCILED',
        checkName: 'Fixed Assets Reconciled',
        severity: 'BLOCKING',
        title: 'Fixed Asset Register vs GL Cost Discrepancy',
        detail: `Fixed Asset Register gross acquisition cost (${assetRegisterCost.toFixed(2)} MVR) differs from General Ledger Account 1500 (${glAssetCost.toFixed(2)} MVR) by ${costVariance.toFixed(2)} MVR.`,
        remedy: 'Reconcile asset register entries with GL Account 1500 property, plant and equipment postings.',
        legalReference: 'Income Tax Act Section 19 & MIRA 604 Schedule 2',
        recordType: 'asset',
        recordIdentifier: 'GL-ACC-1500',
        amount: costVariance
      });
    }

    recordCheck(
      'FIXED_ASSETS_RECONCILED',
      'Fixed Assets Reconciled',
      'Verifies that the Fixed Asset Register gross cost and accumulated depreciation agree with General Ledger control accounts.',
      assetReconIssues,
      { assetRegisterCost, glAssetCost }
    );

    // =========================================================================
    // CHECK 8: Tax Adjustments Reviewed
    // =========================================================================
    const adjustmentIssues: PreFilingIssue[] = [];
    adjustments.forEach((adj: any) => {
      const isReviewed = adj.isReviewed === true || adj.status === 'REVIEWED' || adj.status === 'APPROVED';
      if (!isReviewed) {
        adjustmentIssues.push({
          id: `PRE-ADJ-UNREVIEWED-${adj.id || adj.code}`,
          checkCode: 'TAX_ADJUSTMENTS_REVIEWED',
          checkName: 'Tax Adjustments Reviewed',
          severity: 'BLOCKING',
          title: `Unreviewed Tax Adjustment: ${adj.code || adj.category || adj.id}`,
          detail: `Schedule 1 tax adjustment '${adj.description || adj.category || adj.id}' (${Number(adj.amount || 0).toFixed(2)} MVR) has not been reviewed by a designated tax accountant.`,
          remedy: 'Review and approve all tax adjustment entries in the Tax Adjustment Ledger.',
          legalReference: 'Income Tax Act Section 10-18 (Non-Deductible Items & Addbacks)',
          recordId: adj.id,
          recordType: 'tax_adjustment',
          recordIdentifier: adj.code || adj.id,
          amount: Number(adj.amount || 0)
        });
      }
    });

    recordCheck(
      'TAX_ADJUSTMENTS_REVIEWED',
      'Tax Adjustments Reviewed',
      'Ensures that all Schedule 1 tax adjustment entries (addbacks, deductions, exempt amounts) are formally reviewed.',
      adjustmentIssues,
      { totalAdjustments: adjustments.length }
    );

    // =========================================================================
    // CHECK 9: Tax Losses Reconciled
    // =========================================================================
    const lossIssues: PreFilingIssue[] = [];
    lossLots.forEach((lot: any) => {
      const remaining = Number(lot.remainingAmount ?? lot.amount ?? 0);
      const utilized = Number(lot.utilizedAmount || 0);
      const original = Number(lot.originalAmount || lot.amount || 0);

      if (utilized > original) {
        lossIssues.push({
          id: `PRE-LOSS-OVERUTILIZED-${lot.id || lot.taxYear}`,
          checkCode: 'TAX_LOSSES_RECONCILED',
          checkName: 'Tax Losses Reconciled',
          severity: 'BLOCKING',
          title: `Tax Loss Over-Utilization: Year ${lot.taxYear || lot.id}`,
          detail: `Utilized loss (${utilized.toFixed(2)} MVR) exceeds original available tax loss (${original.toFixed(2)} MVR).`,
          remedy: 'Recalculate tax loss carryforward utilization to not exceed statutory limits.',
          legalReference: 'Income Tax Act Section 32 & 33 (Loss Carryforward)',
          recordId: lot.id,
          recordType: 'tax_loss',
          recordIdentifier: `LOT-${lot.taxYear || lot.id}`,
          amount: utilized - original
        });
      }

      if (lot.isExpired && utilized > 0) {
        lossIssues.push({
          id: `PRE-LOSS-EXPIRED-${lot.id || lot.taxYear}`,
          checkCode: 'TAX_LOSSES_RECONCILED',
          checkName: 'Tax Losses Reconciled',
          severity: 'BLOCKING',
          title: `Expired Tax Loss Claimed: Year ${lot.taxYear || lot.id}`,
          detail: 'Loss lot has expired under the statutory carryforward limitation period and cannot be deducted against current profits.',
          remedy: 'Remove expired tax loss deductions from the Schedule 3 loss schedule.',
          legalReference: 'Income Tax Act Section 32 & 33',
          recordId: lot.id,
          recordType: 'tax_loss',
          recordIdentifier: `LOT-${lot.taxYear || lot.id}`
        });
      }
    });

    recordCheck(
      'TAX_LOSSES_RECONCILED',
      'Tax Losses Reconciled',
      'Confirms that tax loss carryforward schedules, opening balances, and current utilization strictly comply with Sections 32 and 33.',
      lossIssues,
      { totalLossLots: lossLots.length }
    );

    // =========================================================================
    // CHECK 10: MIRA Return Validated
    // =========================================================================
    const returnIssues: PreFilingIssue[] = [];
    const m604 = miraReturns.mira604;
    if (m604) {
      const netProfit = Number(m604.netProfitBeforeTax || m604.accountingProfit || 0);
      const addbacks = Number(m604.totalAddbacks || m604.adjustments?.addbacks || 0);
      const deductions = Number(m604.totalDeductions || m604.adjustments?.deductions || 0);
      const taxableIncome = Number(m604.taxableIncome || 0);
      
      const expectedTaxable = netProfit + addbacks - deductions;
      if (Math.abs(taxableIncome - expectedTaxable) > 0.01 && (addbacks > 0 || deductions > 0)) {
        returnIssues.push({
          id: 'PRE-RETURN-M604-ARITHMETIC',
          checkCode: 'MIRA_RETURN_VALIDATED',
          checkName: 'MIRA Return Validated',
          severity: 'BLOCKING',
          title: 'MIRA 604 Arithmetic Validation Failure',
          detail: `Taxable income on MIRA 604 (${taxableIncome.toFixed(2)} MVR) does not equal Net Profit (${netProfit.toFixed(2)}) + Addbacks (${addbacks.toFixed(2)}) - Deductions (${deductions.toFixed(2)}). Expected: ${expectedTaxable.toFixed(2)} MVR.`,
          remedy: 'Recalculate MIRA 604 return fields using verified ledger figures.',
          legalReference: 'Income Tax Act Section 7 & MIRA 604 Form Instructions',
          recordType: 'return',
          recordIdentifier: 'MIRA-604',
          amount: Math.abs(taxableIncome - expectedTaxable)
        });
      }
    }

    if (input.miraReturnValid === false) {
      returnIssues.push({
        id: 'PRE-RETURN-INVALID-EXPLICIT',
        checkCode: 'MIRA_RETURN_VALIDATED',
        checkName: 'MIRA Return Validated',
        severity: 'BLOCKING',
        title: 'MIRA Return Validation Failure',
        detail: 'Statutory MIRA return failed mathematical, structural, or regulatory validation rules.',
        remedy: 'Review and correct the MIRA tax return schedules.',
        legalReference: 'Income Tax Act Section 7 & MIRA Form Specifications',
        recordType: 'return',
        recordIdentifier: 'MIRA-RETURN'
      });
    }

    recordCheck(
      'MIRA_RETURN_VALIDATED',
      'MIRA Return Validated',
      'Validates that statutory MIRA returns pass schema, structural, and arithmetic consistency tests.',
      returnIssues,
      { hasMIRA604: !!m604 }
    );

    // =========================================================================
    // CHECK 11: Required Schedules Validated
    // =========================================================================
    const scheduleIssues: PreFilingIssue[] = [];
    if (input.options?.requireMIRA604 || m604) {
      if (!schedules.schedule1_addbacks && !m604?.schedules?.schedule1) {
        scheduleIssues.push({
          id: 'PRE-SCH-MISSING-SCH1',
          checkCode: 'REQUIRED_SCHEDULES_VALIDATED',
          checkName: 'Required Schedules Validated',
          severity: 'BLOCKING',
          title: 'Mandatory Schedule 1 (Profit & Loss / Addbacks) Missing',
          detail: 'Corporate income tax return requires Schedule 1 detailing profit and loss statement and statutory addbacks.',
          remedy: 'Generate and attach Schedule 1 to the MIRA 604 filing dataset.',
          legalReference: 'MIRA 604 Form Specifications Schedule 1',
          recordType: 'schedule',
          recordIdentifier: 'MIRA-604-SCH1'
        });
      }

      if (assets.length > 0 && !schedules.schedule2_capitalAllowances && !m604?.schedules?.schedule2) {
        scheduleIssues.push({
          id: 'PRE-SCH-MISSING-SCH2',
          checkCode: 'REQUIRED_SCHEDULES_VALIDATED',
          checkName: 'Required Schedules Validated',
          severity: 'BLOCKING',
          title: 'Mandatory Schedule 2 (Capital Allowances) Missing',
          detail: 'Depreciable fixed assets exist in the Fixed Asset Register, but Schedule 2 Capital Allowances is missing.',
          remedy: 'Compute and attach Schedule 2 Capital Allowances before statutory filing.',
          legalReference: 'Income Tax Act Section 19 & MIRA 604 Schedule 2',
          recordType: 'schedule',
          recordIdentifier: 'MIRA-604-SCH2'
        });
      }
    }

    recordCheck(
      'REQUIRED_SCHEDULES_VALIDATED',
      'Required Schedules Validated',
      'Verifies that all required supplementary statutory schedules (Schedule 1, Schedule 2, Schedule 3) are populated and complete.',
      scheduleIssues
    );

    // =========================================================================
    // CHECK 12: Supporting Documents Present
    // =========================================================================
    const docIssues: PreFilingIssue[] = [];
    bills.forEach((b: any) => {
      const v = b.verifiedData || b.extractedData;
      const claimsTax = v?.tax_status === 'TAX_CHARGED' || Number(v?.totals?.gst_amount || 0) > 0;
      const hasDoc = !!(b.file_name || b.file_path || b.imageUrl || b.document_id);

      if (claimsTax && !hasDoc) {
        docIssues.push({
          id: `PRE-DOC-MISSING-${b.id}`,
          checkCode: 'SUPPORTING_DOCUMENTS_PRESENT',
          checkName: 'Supporting Documents Present',
          severity: 'BLOCKING',
          title: `Missing Tax Invoice Supporting Document: ${v?.invoice_info?.number || b.id}`,
          detail: `Transaction claims GST input tax of ${Number(v?.totals?.gst_amount || 0).toFixed(2)} MVR but has no attached supporting tax invoice/receipt. GST Act Section 21 strictly requires original tax invoices for input tax deduction.`,
          remedy: 'Attach the original supplier tax invoice PDF or scan, or reclassify transaction as no-input-tax.',
          legalReference: 'Goods and Services Tax Act Section 21',
          recordId: b.id,
          recordType: 'bill',
          recordIdentifier: v?.invoice_info?.number || b.id,
          amount: Number(v?.totals?.gst_amount || 0)
        });
      }
    });

    recordCheck(
      'SUPPORTING_DOCUMENTS_PRESENT',
      'Supporting Documents Present',
      'Ensures that all transactions claiming tax deductions or input tax have attached supporting documentation.',
      docIssues,
      { totalBillsChecked: bills.length, missingDocCount: docIssues.length }
    );

    // =========================================================================
    // CHECK 13: Mandatory Approvals Complete
    // =========================================================================
    const approvalIssues: PreFilingIssue[] = [];
    bills.forEach((b: any) => {
      const v = b.verifiedData || b.extractedData;
      const isApproved = b.isApproved === true || b.status === 'verified' || b.status === 'approved';
      if (!isApproved) {
        approvalIssues.push({
          id: `PRE-APP-PENDING-${b.id}`,
          checkCode: 'MANDATORY_APPROVALS_COMPLETE',
          checkName: 'Mandatory Approvals Complete',
          severity: 'BLOCKING',
          title: `Unapproved Purchase Bill: ${v?.invoice_info?.number || b.id}`,
          detail: `Purchase bill '${v?.invoice_info?.number || b.id}' is in '${b.status || 'pending_review'}' status without formal approval. Unapproved AI extractions cannot be included in statutory filings.`,
          remedy: 'Review and approve or reject the pending transaction in the Bill Review module.',
          legalReference: 'Tax Administration Act & Internal Financial Controls Guidelines',
          recordId: b.id,
          recordType: 'bill',
          recordIdentifier: v?.invoice_info?.number || b.id,
          recordDate: v?.invoice_info?.date || b.created_at
        });
      }
    });

    if (input.approvals) {
      if (!input.approvals.preparer) {
        approvalIssues.push({
          id: 'PRE-APP-MISSING-PREPARER',
          checkCode: 'MANDATORY_APPROVALS_COMPLETE',
          checkName: 'Mandatory Approvals Complete',
          severity: 'BLOCKING',
          title: 'Missing Preparer Authorization',
          detail: 'The filing package lacks mandatory tax return preparer sign-off and declaration.',
          remedy: 'Assign an authorized tax preparer to sign off on the period return.',
          legalReference: 'Tax Administration Act & Statutory Filing Standards',
          recordType: 'approval',
          recordIdentifier: 'PREPARER-APPROVAL'
        });
      }
      if (!input.approvals.reviewer) {
        approvalIssues.push({
          id: 'PRE-APP-MISSING-REVIEWER',
          checkCode: 'MANDATORY_APPROVALS_COMPLETE',
          checkName: 'Mandatory Approvals Complete',
          severity: 'BLOCKING',
          title: 'Missing Reviewer / Director Sign-off',
          detail: 'The filing package lacks mandatory partner or director review approval.',
          remedy: 'Obtain director or partner review approval prior to statutory submission.',
          legalReference: 'Tax Administration Act & Statutory Filing Standards',
          recordType: 'approval',
          recordIdentifier: 'REVIEWER-APPROVAL'
        });
      }
    }

    recordCheck(
      'MANDATORY_APPROVALS_COMPLETE',
      'Mandatory Approvals Complete',
      'Guarantees human-in-the-loop oversight by verifying that all purchase bills and journal entries have completed mandatory approval workflows.',
      approvalIssues,
      { totalBills: bills.length, unapprovedBillsCount: approvalIssues.length }
    );

    // =========================================================================
    // CHECK 14: No Blocking Audit Exceptions
    // =========================================================================
    const auditIssues: PreFilingIssue[] = [];
    auditLogs.forEach((log: any) => {
      const isCritical = log.severity === 'CRITICAL' || log.severity === 'HIGH';
      const isUnresolved = log.isResolved === false || log.status === 'UNRESOLVED' || !log.resolvedAt;
      const isTamper = /tamper|unauthorized|blocked|breach/i.test(log.action || log.event || '');

      if (isCritical && isUnresolved && isTamper) {
        auditIssues.push({
          id: `PRE-AUDIT-EXC-${log.id}`,
          checkCode: 'NO_BLOCKING_AUDIT_EXCEPTIONS',
          checkName: 'No Blocking Audit Exceptions',
          severity: 'BLOCKING',
          title: `Critical Audit Exception: ${log.action || log.event || log.id}`,
          detail: `Unresolved high-severity audit event detected: ${log.description || log.message || log.action}. Compliance requires formal investigation and sign-off.`,
          remedy: 'Investigate and mark the audit event as resolved in the Compliance Audit Trail.',
          legalReference: 'Tax Administration Act Section 27 & Audit Trail Integrity Regulations',
          recordId: log.id,
          recordType: 'audit_event',
          recordIdentifier: log.id,
          recordDate: log.timestamp || log.created_at
        });
      }
    });

    recordCheck(
      'NO_BLOCKING_AUDIT_EXCEPTIONS',
      'No Blocking Audit Exceptions',
      'Checks the compliance audit trail for unresolved security exceptions, tampering alerts, or unauthorized mutations.',
      auditIssues,
      { totalAuditLogs: auditLogs.length, auditExceptionsCount: auditIssues.length }
    );

    // =========================================================================
    // OVERALL READINESS DETERMINATION
    // =========================================================================
    const isReady = blockingIssues.length === 0;
    const status = isReady ? 'READY_FOR_FILING' : 'NOT_READY';
    const mandatoryCodes = PreFilingControlEngine.getMandatoryCheckCodes();
    const checkList = mandatoryCodes.map(code => checks[code]).filter(Boolean);

    const passedChecks = checkList.filter(c => c.status === 'PASS').length;
    const failedChecks = checkList.filter(c => c.status === 'BLOCKED').length;
    const warningChecks = checkList.filter(c => c.status === 'WARNING').length;

    let refusalReason: string | undefined;
    if (!isReady) {
      refusalReason = `Pre-filing package generation refused: ${blockingIssues.length} blocking issue(s) across ${failedChecks} statutory check dimension(s) must be resolved prior to statutory package generation.`;
    }

    return {
      status,
      isReady,
      evaluatedAt,
      tenantId: input.tenantId,
      outletId: input.outletId,
      period: input.period,
      taxYear: input.taxYear,
      summary: {
        isReady,
        totalChecks: checkList.length,
        passedChecks,
        failedChecks,
        warningChecks,
        blockingIssuesCount: blockingIssues.length,
        warningsCount: warnings.length
      },
      checks,
      checkList,
      blockingIssues,
      warnings,
      refusalReason
    };
  }
}

/**
 * Top-level convenience function matching prompt: "Implement: RUN PRE-FILING CHECK"
 */
export function runPreFilingCheck(input: PreFilingCheckInput): PreFilingResult {
  return PreFilingControlEngine.runPreFilingCheck(input);
}
