/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ComplianceDashboardService } from '../../src/services/compliance/complianceDashboardService';
import { ComplianceStatus, ComplianceCategory } from '../../src/types/complianceDashboard';

describe('Phase 44 — Tax Compliance Dashboard Engine', () => {
  const baseValidBill = {
    id: 'bill-valid-01',
    outlet_id: 'outlet-1',
    status: 'verified',
    isApproved: true,
    file_name: 'tax-invoice-001.pdf',
    created_at: '2026-03-15T10:00:00Z',
    verifiedData: {
      supplier: {
        name: 'Lily F&B Suppliers Pvt Ltd',
        tin: '1002345GST001',
        gstin: '1002345GST001'
      },
      invoice_info: {
        number: 'INV-2026-001',
        date: '2026-03-15',
        currency: 'MVR'
      },
      expense_category: 'Food & Beverage Purchases',
      tax_status: 'TAX_CHARGED',
      totals: {
        taxable_value: 1000,
        gst_amount: 80, // 8% standard general rate
        invoice_total: 1080
      }
    }
  };

  const baseValidJournal = {
    id: 'jrn-01',
    reference: 'JV-2026-001',
    description: 'Purchase bill posting',
    status: 'POSTED',
    entryDate: '2026-03-15',
    lines: [
      { accountCode: '5000', accountName: 'Cost of Sales', debit: 1000, credit: 0 },
      { accountCode: '1400', accountName: 'GST Input Tax', debit: 80, credit: 0 },
      { accountCode: '2000', accountName: 'Accounts Payable', debit: 0, credit: 1080 }
    ]
  };

  it('1. should evaluate all 8 required statutory compliance dimensions', () => {
    const result = ComplianceDashboardService.evaluateCompliance({
      bills: [baseValidBill],
      journals: [baseValidJournal],
      assets: []
    });

    const expectedCategories: ComplianceCategory[] = [
      'accounting',
      'gst',
      'nwt',
      'income_tax',
      'mira_returns',
      'reconciliation',
      'approval',
      'period'
    ];

    expectedCategories.forEach(cat => {
      expect(result.categories[cat]).toBeDefined();
      expect(result.categories[cat].category).toBe(cat);
      expect(['PASS', 'WARNING', 'BLOCKED', 'NOT_APPLICABLE']).toContain(
        result.categories[cat].status
      );
    });

    expect(result.overallStatus).toBe('PASS');
    expect(result.filingReadiness.isReadyToFile).toBe(true);
    expect(result.blockingIssues).toHaveLength(0);
  });

  it('2. should detect Missing TIN as a BLOCKED issue under GST Act Section 21', () => {
    const billWithoutTin = {
      ...baseValidBill,
      id: 'bill-no-tin',
      verifiedData: {
        ...baseValidBill.verifiedData,
        supplier: {
          name: 'Unknown Corner Shop',
          tin: '',
          gstin: ''
        },
        invoice_info: {
          number: 'INV-NO-TIN-99',
          date: '2026-03-15',
          currency: 'MVR'
        }
      }
    };

    const result = ComplianceDashboardService.evaluateCompliance({
      bills: [billWithoutTin],
      journals: []
    });

    expect(result.categories.gst.status).toBe('BLOCKED');
    expect(result.overallStatus).toBe('BLOCKED');
    expect(result.filingReadiness.isReadyToFile).toBe(false);

    const tinIssue = result.blockingIssues.find(i => i.code === 'MISSING_TIN');
    expect(tinIssue).toBeDefined();
    expect(tinIssue?.severity).toBe('BLOCKED');
    expect(tinIssue?.recordType).toBe('bill');
    expect(tinIssue?.recordId).toBe('bill-no-tin');
    expect(tinIssue?.recordIdentifier).toBe('INV-NO-TIN-99');
    expect(tinIssue?.legalReference).toContain('Goods and Services Tax Act Section 21');
  });

  it('3. should detect Unapproved Classification as BLOCKED', () => {
    const unapprovedBill = {
      ...baseValidBill,
      id: 'bill-unapproved-101',
      status: 'pending_review',
      isApproved: false,
      verifiedData: {
        ...baseValidBill.verifiedData,
        invoice_info: {
          number: 'INV-PENDING-01',
          date: '2026-03-15',
          currency: 'MVR'
        }
      }
    };

    const result = ComplianceDashboardService.evaluateCompliance({
      bills: [unapprovedBill],
      journals: []
    });

    expect(result.categories.approval.status).toBe('BLOCKED');
    const appIssue = result.blockingIssues.find(i => i.code === 'UNAPPROVED_CLASSIFICATION');
    expect(appIssue).toBeDefined();
    expect(appIssue?.recordId).toBe('bill-unapproved-101');
    expect(appIssue?.recordIdentifier).toBe('INV-PENDING-01');
  });

  it('4. should detect GST Reconciliation Difference as BLOCKED', () => {
    // Bill claims 80 MVR GST, but Account 1400 has only 10 MVR (variance 70 MVR)
    const mismatchedJournal = {
      id: 'jrn-mismatch',
      reference: 'JV-MISMATCH',
      status: 'POSTED',
      lines: [
        { accountCode: '5000', debit: 1070, credit: 0 },
        { accountCode: '1400', debit: 10, credit: 0 }, // Only 10 MVR recorded
        { accountCode: '2000', debit: 0, credit: 1080 }
      ]
    };

    const result = ComplianceDashboardService.evaluateCompliance({
      bills: [baseValidBill],
      journals: [mismatchedJournal]
    });

    expect(result.categories.reconciliation.status).toBe('BLOCKED');
    const reconIssue = result.blockingIssues.find(i => i.code === 'GST_RECONCILIATION_DIFF');
    expect(reconIssue).toBeDefined();
    expect(reconIssue?.recordType).toBe('general_ledger');
    expect(reconIssue?.recordIdentifier).toBe('GL-ACC-1400');
    expect(reconIssue?.amount).toBe(70);
  });

  it('5. should detect Unposted Journals as BLOCKED under Accounting Status', () => {
    const draftJournal = {
      id: 'jrn-draft-99',
      reference: 'JV-DRAFT-099',
      description: 'Accrual entry pending approval',
      status: 'DRAFT',
      lines: [
        { accountCode: '5200', debit: 500, credit: 0 },
        { accountCode: '2000', debit: 0, credit: 500 }
      ]
    };

    const result = ComplianceDashboardService.evaluateCompliance({
      bills: [baseValidBill],
      journals: [baseValidJournal, draftJournal]
    });

    expect(result.categories.accounting.status).toBe('BLOCKED');
    const unpostedIssue = result.blockingIssues.find(i => i.code === 'UNPOSTED_JOURNAL');
    expect(unpostedIssue).toBeDefined();
    expect(unpostedIssue?.recordType).toBe('journal');
    expect(unpostedIssue?.recordId).toBe('jrn-draft-99');
    expect(unpostedIssue?.recordIdentifier).toBe('JV-DRAFT-099');
  });

  it('6. should detect Locked-Period Amendments as BLOCKED', () => {
    const amendedLockedBill = {
      ...baseValidBill,
      id: 'bill-locked-edit',
      isAmendedAfterLock: true,
      verifiedData: {
        ...baseValidBill.verifiedData,
        invoice_info: {
          number: 'INV-LOCKED-01',
          date: '2025-12-31',
          currency: 'MVR'
        }
      }
    };

    const result = ComplianceDashboardService.evaluateCompliance({
      bills: [amendedLockedBill],
      journals: []
    });

    expect(result.categories.period.status).toBe('BLOCKED');
    const lockIssue = result.blockingIssues.find(i => i.code === 'LOCKED_PERIOD_AMENDMENT');
    expect(lockIssue).toBeDefined();
    expect(lockIssue?.recordId).toBe('bill-locked-edit');
    expect(lockIssue?.recordIdentifier).toBe('INV-LOCKED-01');
  });

  it('7. should detect Missing Supporting Document on tax-charged claims as BLOCKED', () => {
    const billWithoutDoc = {
      ...baseValidBill,
      id: 'bill-no-doc',
      file_name: null,
      file_path: null,
      imageUrl: null,
      document_id: null
    };

    const result = ComplianceDashboardService.evaluateCompliance({
      bills: [billWithoutDoc],
      journals: []
    });

    expect(result.categories.gst.status).toBe('BLOCKED');
    const docIssue = result.blockingIssues.find(i => i.code === 'MISSING_SUPPORTING_DOCUMENT');
    expect(docIssue).toBeDefined();
    expect(docIssue?.recordId).toBe('bill-no-doc');
  });

  it('8. should detect Required Schedule Incomplete (e.g. MIRA 604 Schedule 1 Addback)', () => {
    const unadjustedDonation = {
      ...baseValidBill,
      id: 'bill-donation',
      is_tax_adjusted: false,
      verifiedData: {
        ...baseValidBill.verifiedData,
        expense_category: 'Donation',
        invoice_info: {
          number: 'INV-DONATION-55',
          date: '2026-03-15',
          currency: 'MVR'
        }
      }
    };

    const result = ComplianceDashboardService.evaluateCompliance({
      bills: [unadjustedDonation],
      journals: []
    });

    expect(result.categories.mira_returns.status).toBe('BLOCKED');
    const schIssue = result.blockingIssues.find(i => i.code === 'REQUIRED_SCHEDULE_INCOMPLETE');
    expect(schIssue).toBeDefined();
    expect(schIssue?.recordType).toBe('schedule');
    expect(schIssue?.recordIdentifier).toBe('MIRA-604-SCH1');
  });

  it('9. should ensure every warning and blocking issue links to an underlying record', () => {
    const mixedBills = [
      {
        ...baseValidBill,
        id: 'bill-warn-1',
        verifiedData: {
          ...baseValidBill.verifiedData,
          invoice_info: {
            number: 'INV-FOREIGN-01',
            date: '2026-03-15',
            currency: 'USD'
          },
          supplier: {
            name: 'AWS Cloud Services Inc',
            tin: '9999999'
          },
          expense_category: 'Computer Software & Hardware'
        }
      }
    ];

    const result = ComplianceDashboardService.evaluateCompliance({
      bills: mixedBills,
      journals: []
    });

    const allIssues = [...result.blockingIssues, ...result.warnings];
    expect(allIssues.length).toBeGreaterThan(0);

    allIssues.forEach(issue => {
      // Must link to underlying record
      expect(issue.recordId).toBeTruthy();
      expect(typeof issue.recordId).toBe('string');
      expect(issue.recordIdentifier).toBeTruthy();
      expect(typeof issue.recordIdentifier).toBe('string');
      expect(['bill', 'journal', 'asset', 'revenue', 'period', 'return', 'schedule', 'general_ledger']).toContain(
        issue.recordType
      );
    });
  });
});
