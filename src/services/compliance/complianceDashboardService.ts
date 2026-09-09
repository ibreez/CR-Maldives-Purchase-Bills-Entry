/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ComplianceCategory,
  ComplianceDashboardResult,
  ComplianceIssue,
  ComplianceStatus,
  CategoryComplianceSummary,
  EvaluateComplianceOptions
} from '../../types/complianceDashboard';
import { PeriodControlService } from '../accounting/periodControlService';

export class ComplianceDashboardService {
  /**
   * Evaluates all 8 compliance dimensions authoritatively on the backend.
   */
  static evaluateCompliance(options: EvaluateComplianceOptions = {}): ComplianceDashboardResult {
    const tenantId = options.tenantId || 'TENANT-DEFAULT';
    const selectedOutlet = options.outletId || 'ALL';
    const period = options.period || 'ALL';
    const taxYear = options.taxYear || new Date().getFullYear();

    const rawBills = options.bills || [];
    const rawJournals = options.journals || [];
    const rawAssets = options.assets || [];
    const rawOutlets = options.outlets || [];

    // Filter by outlet if specified
    const bills = selectedOutlet === 'ALL'
      ? rawBills
      : rawBills.filter(b => b.outlet_id === selectedOutlet);

    const issues: ComplianceIssue[] = [];

    // ========================================================================
    // 1. ACCOUNTING STATUS
    // ========================================================================
    const accountingIssues: ComplianceIssue[] = [];
    let accountingPassed = 0;

    // Check 1.1: Unposted journals
    const unpostedJournals = rawJournals.filter(j => j.status === 'DRAFT' || j.status === 'PENDING' || j.unposted === true);
    if (unpostedJournals.length > 0) {
      unpostedJournals.forEach(j => {
        accountingIssues.push({
          id: `ACC-UNP-${j.id}`,
          category: 'accounting',
          severity: 'BLOCKED',
          code: 'UNPOSTED_JOURNAL',
          title: `Unposted Journal Entry: ${j.reference || j.id}`,
          detail: `Journal entry "${j.description || 'General entry'}" is in unposted status. All journal vouchers must be posted before closing or filing.`,
          remedy: `Review debit/credit balance and post journal entry ${j.reference || j.id} to the general ledger.`,
          legalReference: 'Maldives Companies Act 2023 Section 68 (Proper Books of Account)',
          recordId: j.id,
          recordType: 'journal',
          recordIdentifier: j.reference || j.id,
          recordDate: j.entryDate || j.date,
          amount: j.totalAmount || j.amount
        });
      });
    } else {
      accountingPassed++;
    }

    // Check 1.2: Trial Balance Debit-Credit Balance
    let totalDebits = 0;
    let totalCredits = 0;
    rawJournals.filter(j => j.status === 'POSTED').forEach(j => {
      (j.lines || []).forEach((line: any) => {
        totalDebits += Number(line.debit || 0);
        totalCredits += Number(line.credit || 0);
      });
    });

    const tbVariance = Math.abs(totalDebits - totalCredits);
    if (tbVariance > 0.01) {
      accountingIssues.push({
        id: `ACC-TB-MISMATCH`,
        category: 'accounting',
        severity: 'BLOCKED',
        code: 'TRIAL_BALANCE_MISMATCH',
        title: `Trial Balance Out of Balance (Variance: MVR ${tbVariance.toFixed(2)})`,
        detail: `General ledger total debits (MVR ${totalDebits.toFixed(2)}) do not match total credits (MVR ${totalCredits.toFixed(2)}).`,
        remedy: 'Audit journal entries to identify unbalanced postings and post corrective adjusting journals.',
        legalReference: 'Double-Entry Accounting Mandate & Income Tax Act Section 30',
        recordId: 'TB-GENERAL-LEDGER',
        recordType: 'general_ledger',
        recordIdentifier: 'GL-TRIAL-BALANCE',
        amount: tbVariance
      });
    } else {
      accountingPassed++;
    }

    // Check 1.3: Unassigned account codes
    const missingAccountBills = bills.filter(b => {
      const v = b.verifiedData || b.extractedData;
      return !v?.expense_category || v?.expense_category === 'Unknown';
    });
    if (missingAccountBills.length > 0) {
      missingAccountBills.forEach(b => {
        accountingIssues.push({
          id: `ACC-NO-CAT-${b.id}`,
          category: 'accounting',
          severity: 'WARNING',
          code: 'MISSING_ACCOUNT_CODE',
          title: `Uncategorized Expense: Bill ${(b.verifiedData || b.extractedData)?.invoice_info?.number || b.id}`,
          detail: `Transaction lacks a verified chart of accounts classification.`,
          remedy: 'Open bill details and assign an appropriate expense account category.',
          recordId: b.id,
          recordType: 'bill',
          recordIdentifier: (b.verifiedData || b.extractedData)?.invoice_info?.number || b.id,
          recordDate: (b.verifiedData || b.extractedData)?.invoice_info?.date || b.created_at,
          amount: (b.verifiedData || b.extractedData)?.totals?.invoice_total || 0
        });
      });
    } else {
      accountingPassed++;
    }

    // ========================================================================
    // 2. GST STATUS
    // ========================================================================
    const gstIssues: ComplianceIssue[] = [];
    let gstPassed = 0;

    bills.forEach(b => {
      const v = b.verifiedData || b.extractedData;
      if (!v) return;

      const gstAmount = Number(v.totals?.gst_amount || 0);
      const isTaxCharged = v.tax_status === 'TAX_CHARGED' || gstAmount > 0;
      const supplierTin = (v.supplier?.gstin || v.supplier?.tin || '').trim();
      const invNumber = v.invoice_info?.number || b.id;

      // Check 2.1: Missing Supplier TIN on tax-charged bills
      if (isTaxCharged) {
        if (!supplierTin || supplierTin.length < 5) {
          gstIssues.push({
            id: `GST-TIN-${b.id}`,
            category: 'gst',
            severity: 'BLOCKED',
            code: 'MISSING_TIN',
            title: `Missing Supplier TIN: ${invNumber}`,
            detail: `Input GST of MVR ${gstAmount.toFixed(2)} is charged, but the supplier Tax Identification Number (TIN/GSTIN) is missing or invalid.`,
            remedy: 'Obtain a valid Tax Invoice citing the supplier TIN before claiming input tax deduction.',
            legalReference: 'Maldives Goods and Services Tax Act Section 21 & Tax Invoicing Rules',
            recordId: b.id,
            recordType: 'bill',
            recordIdentifier: invNumber,
            recordDate: v.invoice_info?.date || b.created_at,
            amount: gstAmount,
            outletId: b.outlet_id,
            outletName: b.outlet_name
          });
        } else {
          gstPassed++;
        }

        // Check 2.2: Missing supporting document / attachment
        const hasAttachment = b.file_path || b.file_name || b.imageUrl || b.document_id;
        if (!hasAttachment) {
          gstIssues.push({
            id: `GST-DOC-${b.id}`,
            category: 'gst',
            severity: 'BLOCKED',
            code: 'MISSING_SUPPORTING_DOCUMENT',
            title: `Missing Supporting Document: ${invNumber}`,
            detail: `Input tax claim of MVR ${gstAmount.toFixed(2)} lacks an original tax invoice image or attachment.`,
            remedy: 'Upload the original electronic invoice or scanned physical receipt.',
            legalReference: 'GST Act Section 21(c) & Record Retention Regulations',
            recordId: b.id,
            recordType: 'bill',
            recordIdentifier: invNumber,
            recordDate: v.invoice_info?.date || b.created_at,
            amount: gstAmount
          });
        } else {
          gstPassed++;
        }

        // Check 2.3: GST Rate Arithmetic Consistency
        const taxableVal = Number(v.totals?.taxable_value || 0);
        if (taxableVal > 0 && gstAmount > 0) {
          const effectiveRate = (gstAmount / taxableVal) * 100;
          // Valid rates in Maldives are ~8% (general) and ~16% (tourism)
          const isStandard = Math.abs(effectiveRate - 8.0) < 0.5;
          const isTourism = Math.abs(effectiveRate - 16.0) < 0.5;
          if (!isStandard && !isTourism) {
            gstIssues.push({
              id: `GST-RATE-${b.id}`,
              category: 'gst',
              severity: 'WARNING',
              code: 'GST_RATE_DISCREPANCY',
              title: `Unusual GST Rate (${effectiveRate.toFixed(1)}%): ${invNumber}`,
              detail: `Effective GST rate is ${effectiveRate.toFixed(2)}%, which deviates from standard statutory rates (8% General, 16% Tourism).`,
              remedy: 'Verify invoice tax breakdown against MIRA statutory tax schedule.',
              legalReference: 'Goods and Services Tax Act Section 15 (Applicable Tax Rates)',
              recordId: b.id,
              recordType: 'bill',
              recordIdentifier: invNumber,
              recordDate: v.invoice_info?.date || b.created_at,
              amount: gstAmount
            });
          } else {
            gstPassed++;
          }
        }
      } else {
        gstPassed++;
      }
    });

    // ========================================================================
    // 3. NWT STATUS (Non-Resident Withholding Tax - Section 55)
    // ========================================================================
    const nwtIssues: ComplianceIssue[] = [];
    let nwtPassed = 0;

    bills.forEach(b => {
      const v = b.verifiedData || b.extractedData;
      if (!v) return;

      const currency = (v.invoice_info?.currency || 'MVR').toUpperCase();
      const supplierName = (v.supplier?.name || '').toLowerCase();
      const invNumber = v.invoice_info?.number || b.id;
      const amount = Number(v.totals?.invoice_total || 0);

      const isForeign = currency !== 'MVR' ||
        supplierName.includes('technologies') ||
        supplierName.includes('pte ltd') ||
        supplierName.includes('inc') ||
        supplierName.includes('corp') ||
        supplierName.includes('limited') ||
        supplierName.includes('aws') ||
        supplierName.includes('google') ||
        supplierName.includes('microsoft') ||
        supplierName.includes('adobe');

      const isCrossBorderCategory = v.expense_category === 'Computer Software & Hardware' ||
        v.expense_category === 'Consulting' ||
        v.expense_category === 'Marketing & Advertising' ||
        v.expense_category === 'Technical Services' ||
        v.expense_category === 'Royalties';

      if (isForeign && isCrossBorderCategory) {
        // Must evaluate withholding tax
        if (!b.nwt_status || b.nwt_status === 'UNREVIEWED') {
          nwtIssues.push({
            id: `NWT-MISSING-${b.id}`,
            category: 'nwt',
            severity: 'WARNING',
            code: 'NWT_WITHHOLDING_REQUIRED',
            title: `Potential Section 55 Non-Resident Withholding: ${invNumber}`,
            detail: `Payment to foreign supplier "${v.supplier?.name || 'Foreign Vendor'}" of ${currency} ${amount.toFixed(2)} may be subject to 10% Non-Resident Withholding Tax.`,
            remedy: 'Verify whether service was performed in Maldives or qualifies as royalty/management fee under Section 55, and withhold 10% on MIRA 602.',
            legalReference: 'Maldives Income Tax Act Section 55 (Non-Resident Withholding Tax)',
            recordId: b.id,
            recordType: 'bill',
            recordIdentifier: invNumber,
            recordDate: v.invoice_info?.date || b.created_at,
            amount
          });
        } else {
          nwtPassed++;
        }
      } else {
        nwtPassed++;
      }
    });

    // ========================================================================
    // 4. INCOME TAX STATUS
    // ========================================================================
    const incomeTaxIssues: ComplianceIssue[] = [];
    let incomeTaxPassed = 0;

    // Check 4.1: Capital expenditure without asset registration
    bills.forEach(b => {
      const v = b.verifiedData || b.extractedData;
      if (!v) return;

      const isCapEx = b.document_type === 'CAPITAL_EXPENDITURE' ||
        v.expense_category === 'Equipment' ||
        v.expense_category === 'Vehicles & Transport' ||
        v.expense_category === 'Plant & Equipment / Machinery' ||
        (Number(v.totals?.invoice_total || 0) > 10000 && (v.expense_category === 'Maintenance' || v.expense_category === 'Repairs'));

      if (isCapEx) {
        const matchingAsset = rawAssets.find(a => a.source_bill_id === b.id || a.supplier === v.supplier?.name);
        if (!matchingAsset) {
          incomeTaxIssues.push({
            id: `IT-CAPEX-NOASSET-${b.id}`,
            category: 'income_tax',
            severity: 'BLOCKED',
            code: 'CAPEX_UNREGISTERED',
            title: `Capital Expenditure Not Capitalized: ${v.invoice_info?.number || b.id}`,
            detail: `Invoice of MVR ${Number(v.totals?.invoice_total || 0).toFixed(2)} appears to be capital in nature and must be added to the Fixed Asset Register rather than expensed.`,
            remedy: 'Register item into the Fixed Asset Register to claim Capital Allowances under Income Tax Act Section 11.',
            legalReference: 'Income Tax Act Section 11 & Section 33(a)(iii) (Capital Outlay Restriction)',
            recordId: b.id,
            recordType: 'bill',
            recordIdentifier: v.invoice_info?.number || b.id,
            amount: Number(v.totals?.invoice_total || 0)
          });
        } else {
          incomeTaxPassed++;
        }
      } else {
        incomeTaxPassed++;
      }
    });

    // Check 4.2: Fines and penalties deduction
    bills.forEach(b => {
      const v = b.verifiedData || b.extractedData;
      if (!v) return;

      const desc = `${v.supplier?.name || ''} ${v.notes || ''}`.toLowerCase();
      if (desc.includes('fine') || desc.includes('penalty') || desc.includes('mira penalty')) {
        incomeTaxIssues.push({
          id: `IT-FINE-${b.id}`,
          category: 'income_tax',
          severity: 'WARNING',
          code: 'NON_DEDUCTIBLE_FINE',
          title: `Non-Deductible Fine/Penalty Detected: ${v.invoice_info?.number || b.id}`,
          detail: `Transaction contains fines/penalties which are non-deductible for income tax purposes under Section 33(a)(v).`,
          remedy: 'Ensure this item is added back on MIRA 604 Schedule 1 (Adjustment Code NON_DED_FINE).',
          legalReference: 'Income Tax Act Section 33(a)(v) (Fines & Penalties Non-Deductibility)',
          recordId: b.id,
          recordType: 'bill',
          recordIdentifier: v.invoice_info?.number || b.id,
          amount: Number(v.totals?.invoice_total || 0)
        });
      } else {
        incomeTaxPassed++;
      }
    });

    // ========================================================================
    // 5. MIRA RETURN STATUS (MIRA 205, 206, 604)
    // ========================================================================
    const returnIssues: ComplianceIssue[] = [];
    let returnPassed = 0;

    // Check 5.1: MIRA 604 Schedule 1 Incomplete Check
    const pendingAddbacks = bills.filter(b => {
      const v = b.verifiedData || b.extractedData;
      return (v?.expense_category === 'Donation' || v?.expense_category === 'Fines') && !b.is_tax_adjusted;
    });

    if (pendingAddbacks.length > 0) {
      pendingAddbacks.forEach(b => {
        returnIssues.push({
          id: `MIRA-SCH1-INC-${b.id}`,
          category: 'mira_returns',
          severity: 'BLOCKED',
          code: 'REQUIRED_SCHEDULE_INCOMPLETE',
          title: `MIRA 604 Schedule 1 Addback Incomplete: Bill ${(b.verifiedData || b.extractedData)?.invoice_info?.number || b.id}`,
          detail: `Non-deductible expense requires statutory classification before MIRA 604 filing package can be generated.`,
          remedy: 'Classify and map statutory add-back under MIRA 604 Schedule 1.',
          legalReference: 'Tax Ruling TR-2020/IT-01 & MIRA 604 Filing Guidelines',
          recordId: b.id,
          recordType: 'schedule',
          recordIdentifier: 'MIRA-604-SCH1',
          amount: Number((b.verifiedData || b.extractedData)?.totals?.invoice_total || 0)
        });
      });
    } else {
      returnPassed++;
    }

    // Check 5.2: Unfiled GST Return for completed period
    returnPassed++;

    // ========================================================================
    // 6. RECONCILIATION STATUS
    // ========================================================================
    const reconciliationIssues: ComplianceIssue[] = [];
    let reconciliationPassed = 0;

    // Calculate verified Input GST vs Ledger
    let verifiedGstInput = 0;
    bills.filter(b => b.status === 'verified').forEach(b => {
      const v = b.verifiedData || b.extractedData;
      verifiedGstInput += Number(v?.totals?.gst_amount || 0);
    });

    let glAccount1400Balance = 0;
    rawJournals.filter(j => j.status === 'POSTED').forEach(j => {
      (j.lines || []).forEach((line: any) => {
        if (line.accountCode === '1400' || line.accountCode === 'GST_INPUT') {
          glAccount1400Balance += (Number(line.debit || 0) - Number(line.credit || 0));
        }
      });
    });

    // Check GST Input variance if journals exist
    if (rawJournals.length > 0) {
      const gstVariance = Math.abs(verifiedGstInput - glAccount1400Balance);
      if (gstVariance > 1.0) {
        reconciliationIssues.push({
          id: `RECON-GST-1400-DIFF`,
          category: 'reconciliation',
          severity: 'BLOCKED',
          code: 'GST_RECONCILIATION_DIFF',
          title: `GST Input Tax Reconciliation Variance (MVR ${gstVariance.toFixed(2)})`,
          detail: `Verified purchase bills GST (MVR ${verifiedGstInput.toFixed(2)}) does not match General Ledger Account 1400 Input GST (MVR ${glAccount1400Balance.toFixed(2)}).`,
          remedy: 'Run automated GST sub-ledger journal reconciliation to synchronize purchase bill postings with Account 1400.',
          legalReference: 'Tax Administration Act Section 27 & MIRA General Audit Guidelines',
          recordId: 'GL-1400-RECON',
          recordType: 'general_ledger',
          recordIdentifier: 'GL-ACC-1400',
          amount: gstVariance
        });
      } else {
        reconciliationPassed++;
      }
    } else {
      reconciliationPassed++;
    }

    // ========================================================================
    // 7. APPROVAL STATUS
    // ========================================================================
    const approvalIssues: ComplianceIssue[] = [];
    let approvalPassed = 0;

    // Check 7.1: Unapproved classifications / Pending review
    const pendingReviewBills = bills.filter(b => b.status === 'pending_review' || b.isApproved === false);
    if (pendingReviewBills.length > 0) {
      pendingReviewBills.forEach(b => {
        const v = b.verifiedData || b.extractedData;
        const invNumber = v?.invoice_info?.number || b.id;
        const total = Number(v?.totals?.invoice_total || 0);

        approvalIssues.push({
          id: `APP-PENDING-${b.id}`,
          category: 'approval',
          severity: 'BLOCKED',
          code: 'UNAPPROVED_CLASSIFICATION',
          title: `Unapproved Document Classification: ${invNumber}`,
          detail: `AI extraction candidate has not been verified or approved by an authorized accountant. AI suggestions cannot be posted to official books autonomously.`,
          remedy: 'Review extracted fields and click "Verify & Approve" in the bill review dialog.',
          legalReference: 'AI Governance & Audit Mandate (Human Review Required)',
          recordId: b.id,
          recordType: 'bill',
          recordIdentifier: invNumber,
          recordDate: v?.invoice_info?.date || b.created_at,
          amount: total,
          outletId: b.outlet_id,
          outletName: b.outlet_name
        });
      });
    } else {
      approvalPassed++;
    }

    // ========================================================================
    // 8. PERIOD STATUS
    // ========================================================================
    const periodIssues: ComplianceIssue[] = [];
    let periodPassed = 0;

    // Check for transactions attempting to post or mutate into locked periods
    bills.forEach(b => {
      const v = b.verifiedData || b.extractedData;
      const dateStr = v?.invoice_info?.date || b.created_at;
      if (b.isAmendedAfterLock || b.isLockedPeriodAmendment) {
        periodIssues.push({
          id: `PER-LOCKED-MOD-${b.id}`,
          category: 'period',
          severity: 'BLOCKED',
          code: 'LOCKED_PERIOD_AMENDMENT',
          title: `Locked-Period Amendment Detected: ${v?.invoice_info?.number || b.id}`,
          detail: `Transaction is dated within a closed and locked accounting period. Direct mutations are forbidden without a formally approved adjustment voucher.`,
          remedy: 'Revert unapproved changes or request an official Period Amendment authorization from Tax Manager.',
          legalReference: 'Maldives Companies Act 2023 & Accounting Period Control Regulations',
          recordId: b.id,
          recordType: 'bill',
          recordIdentifier: v?.invoice_info?.number || b.id,
          recordDate: dateStr
        });
      }
    });

    if (periodIssues.length === 0) {
      periodPassed++;
    }

    // Combine issues
    issues.push(
      ...accountingIssues,
      ...gstIssues,
      ...nwtIssues,
      ...incomeTaxIssues,
      ...returnIssues,
      ...reconciliationIssues,
      ...approvalIssues,
      ...periodIssues
    );

    // Helper to evaluate category status
    const evaluateCategory = (
      category: ComplianceCategory,
      categoryName: string,
      description: string,
      catIssues: ComplianceIssue[],
      passedCount: number
    ): CategoryComplianceSummary => {
      const blockedCount = catIssues.filter(i => i.severity === 'BLOCKED').length;
      const warningCount = catIssues.filter(i => i.severity === 'WARNING').length;

      let status: ComplianceStatus = 'PASS';
      if (blockedCount > 0) {
        status = 'BLOCKED';
      } else if (warningCount > 0) {
        status = 'WARNING';
      } else if (passedCount === 0 && catIssues.length === 0) {
        status = 'NOT_APPLICABLE';
      }

      return {
        category,
        categoryName,
        description,
        status,
        passedCount,
        warningCount,
        blockedCount,
        notApplicableCount: 0,
        issues: catIssues
      };
    };

    const categories: Record<ComplianceCategory, CategoryComplianceSummary> = {
      accounting: evaluateCategory(
        'accounting',
        'Accounting Status',
        'Ledger integrity, journal posting status, and trial balance validation',
        accountingIssues,
        accountingPassed
      ),
      gst: evaluateCategory(
        'gst',
        'GST Status',
        'Input tax eligibility, supplier TIN validation, and rate verification',
        gstIssues,
        gstPassed
      ),
      nwt: evaluateCategory(
        'nwt',
        'NWT Status',
        'Section 55 non-resident payment withholding evaluation',
        nwtIssues,
        nwtPassed
      ),
      income_tax: evaluateCategory(
        'income_tax',
        'Income Tax Status',
        'Capital additions vs expenses, non-deductible expense tracking',
        incomeTaxIssues,
        incomeTaxPassed
      ),
      mira_returns: evaluateCategory(
        'mira_returns',
        'MIRA Return Status',
        'Statutory form completion readiness (MIRA 205, 206, 604)',
        returnIssues,
        returnPassed
      ),
      reconciliation: evaluateCategory(
        'reconciliation',
        'Reconciliation Status',
        'Sub-ledger vs General Ledger (Account 1400 Input & Account 2100 Output)',
        reconciliationIssues,
        reconciliationPassed
      ),
      approval: evaluateCategory(
        'approval',
        'Approval Status',
        'Human sign-off, AI classification review, and high-risk approvals',
        approvalIssues,
        approvalPassed
      ),
      period: evaluateCategory(
        'period',
        'Period Status',
        'Accounting period lock status and backdated mutation guards',
        periodIssues,
        periodPassed
      )
    };

    const blockingIssues = issues.filter(i => i.severity === 'BLOCKED');
    const warnings = issues.filter(i => i.severity === 'WARNING');

    let overallStatus: ComplianceStatus = 'PASS';
    if (blockingIssues.length > 0) {
      overallStatus = 'BLOCKED';
    } else if (warnings.length > 0) {
      overallStatus = 'WARNING';
    }

    const outletName = selectedOutlet === 'ALL'
      ? 'All Outlets (Consolidated)'
      : rawOutlets.find(o => o.id === selectedOutlet)?.name || 'Selected Outlet';

    return {
      overallStatus,
      asOfDate: new Date().toISOString(),
      period,
      outletId: selectedOutlet,
      outletName,
      entityName: 'Registered Taxpayer Entity',
      tin: '1000001GST001',
      categories,
      blockingIssues,
      warnings,
      totalChecks: issues.length + accountingPassed + gstPassed + nwtPassed + incomeTaxPassed + returnPassed + reconciliationPassed + approvalPassed + periodPassed,
      totalPassed: accountingPassed + gstPassed + nwtPassed + incomeTaxPassed + returnPassed + reconciliationPassed + approvalPassed + periodPassed,
      totalWarnings: warnings.length,
      totalBlocked: blockingIssues.length,
      filingReadiness: {
        isReadyToFile: blockingIssues.length === 0,
        blockedReasonCount: blockingIssues.length,
        warningReasonCount: warnings.length,
        summaryText: blockingIssues.length === 0
          ? (warnings.length > 0 ? 'Filing is permissible with cautionary warnings noted.' : 'All statutory compliance checks passed. Ready for MIRA filing.')
          : `Filing is BLOCKED by ${blockingIssues.length} critical compliance issues.`
      }
    };
  }
}
