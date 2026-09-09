/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { PreFilingControlEngine } from '../../src/services/filing/preFilingControlEngine';
import { FilingPackageGenerator, PreFilingBlockedError } from '../../src/services/filing/filingPackageGenerator';
import { PreFilingCheckCode, PreFilingStatus } from '../../src/types/preFiling';
import { TaxpayerProfile } from '../../src/types/filingPackage';

describe('Phase 45 — Pre-Filing Control Engine (14 Mandatory Statutory Checks)', () => {
  const compliantTaxpayer: TaxpayerProfile = {
    taxpayerName: 'Dhiguveli Maldives Pvt Ltd',
    tin: '1004567GST001',
    entityType: 'COMPANY',
    accountingPeriodStart: '2026-01-01',
    accountingPeriodEnd: '2026-12-31',
    registeredAddress: 'Boduthakurufaanu Magu, Male, Maldives',
    presentationCurrency: 'MVR',
    businessActivityCode: '5510' // Hotels and restaurants
  };

  const cleanBill = {
    id: 'bill-001',
    outlet_id: 'outlet-1',
    status: 'verified',
    isApproved: true,
    file_name: 'tax_inv_001.pdf',
    created_at: '2026-03-01T10:00:00Z',
    verifiedData: {
      supplier: {
        name: 'Male Commercial Supply Pvt Ltd',
        tin: '1001111GST001',
        gstin: '1001111GST001'
      },
      invoice_info: {
        number: 'INV-2026-001',
        date: '2026-03-01',
        currency: 'MVR'
      },
      expense_category: 'Direct Supplies',
      tax_status: 'TAX_CHARGED',
      totals: {
        taxable_value: 10000,
        gst_amount: 800,
        invoice_total: 10800
      }
    }
  };

  const balancedJournals = [
    {
      id: 'j-01',
      reference: 'JV-2026-001',
      description: 'Monthly operational expense posting',
      status: 'POSTED',
      entryDate: '2026-03-01',
      lines: [
        { accountCode: '5000', accountName: 'Direct Cost', debit: 10000, credit: 0 },
        { accountCode: '1400', accountName: 'GST Input Tax', debit: 800, credit: 0 },
        { accountCode: '2000', accountName: 'Accounts Payable', debit: 0, credit: 10800 }
      ]
    }
  ];

  it('1. should verify all 14 mandatory statutory check codes are registered in the engine', () => {
    const checkCodes = PreFilingControlEngine.getMandatoryCheckCodes();
    expect(checkCodes).toHaveLength(14);

    const requiredCodes: PreFilingCheckCode[] = [
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

    for (const code of requiredCodes) {
      expect(checkCodes).toContain(code);
    }
  });

  it('2. should return READY_FOR_FILING when all statutory conditions are satisfied', () => {
    const result = PreFilingControlEngine.evaluateReadiness({
      period: '2026-Q1',
      periodStatus: 'CLOSED',
      periodApproved: true,
      bills: [cleanBill],
      journals: balancedJournals,
      trialBalance: {
        totalDebits: 10800,
        totalCredits: 10800,
        difference: 0
      },
      gstReconciliation: {
        outputGst: 0,
        inputGst: 800,
        netPayable: -800,
        ledgerBalance: -800,
        variance: 0,
        isReconciled: true
      },
      nwtReconciliation: {
        taxWithheld: 0,
        ledgerBalance: 0,
        variance: 0,
        isReconciled: true
      },
      approvals: {
        preparer: { name: 'Ali Shareef', date: '2026-03-31', role: 'Accountant' },
        reviewer: { name: 'Fathimath Nazim', date: '2026-04-01', role: 'Finance Director' }
      },
      supportingDocumentsCount: 1,
      blockingAuditExceptionsCount: 0
    });

    expect(result.status).toBe('READY_FOR_FILING');
    expect(result.summary.isReady).toBe(true);
    expect(result.summary.blockingIssuesCount).toBe(0);
    expect(result.blockingIssues).toHaveLength(0);
    expect(result.refusalReason).toBeUndefined();
    expect(result.checkList).toHaveLength(14);
  });

  it('3. should refuse and mark NOT_READY when Trial Balance has unequal debits and credits', () => {
    const result = PreFilingControlEngine.evaluateReadiness({
      period: '2026-Q1',
      periodStatus: 'CLOSED',
      periodApproved: true,
      bills: [cleanBill],
      trialBalance: {
        totalDebits: 10800,
        totalCredits: 10200,
        difference: 600
      }
    });

    expect(result.status).toBe('NOT_READY');
    expect(result.summary.isReady).toBe(false);
    expect(result.refusalReason).toContain('Pre-filing package generation refused');
    
    const balanceCheck = result.checks.ACCOUNTING_BALANCES;
    expect(balanceCheck.status).toBe('BLOCKED');
    expect(balanceCheck.issues.some(i => i.code === 'TB_UNBALANCED')).toBe(true);
  });

  it('4. should block readiness when draft or unposted transactions exist in the filing period', () => {
    const draftBill = {
      ...cleanBill,
      id: 'bill-draft-09',
      status: 'pending_review',
      isApproved: false
    };

    const result = PreFilingControlEngine.evaluateReadiness({
      period: '2026-Q1',
      periodStatus: 'CLOSED',
      periodApproved: true,
      bills: [cleanBill, draftBill]
    });

    expect(result.status).toBe('NOT_READY');
    const unpostedCheck = result.checks.NO_UNPOSTED_REQUIRED_TRANSACTIONS;
    expect(unpostedCheck.status).toBe('BLOCKED');
    expect(unpostedCheck.issues.some(i => i.recordId === 'bill-draft-09')).toBe(true);
  });

  it('5. should block readiness when period is still OPEN or lacks final period closing approval', () => {
    const openPeriodResult = PreFilingControlEngine.evaluateReadiness({
      period: '2026-Q1',
      periodStatus: 'OPEN',
      periodApproved: false
    });

    expect(openPeriodResult.status).toBe('NOT_READY');
    expect(openPeriodResult.checks.PERIOD_STATUS_VALID.status).toBe('BLOCKED');
    expect(openPeriodResult.checks.PERIOD_APPROVED.status).toBe('BLOCKED');
  });

  it('6. should block readiness when GST or NWT subledgers have unreconciled variances', () => {
    const result = PreFilingControlEngine.evaluateReadiness({
      period: '2026-Q1',
      periodStatus: 'CLOSED',
      periodApproved: true,
      gstReconciliation: {
        outputGst: 5000,
        inputGst: 1000,
        netPayable: 4000,
        ledgerBalance: 3200,
        variance: 800,
        isReconciled: false
      },
      nwtReconciliation: {
        taxWithheld: 1500,
        ledgerBalance: 1200,
        variance: 300,
        isReconciled: false
      }
    });

    expect(result.status).toBe('NOT_READY');
    expect(result.checks.GST_RECONCILED.status).toBe('BLOCKED');
    expect(result.checks.NWT_RECONCILED.status).toBe('BLOCKED');
    expect(result.checks.GST_RECONCILED.issues[0].code).toBe('GST_RECON_VARIANCE');
    expect(result.checks.NWT_RECONCILED.issues[0].legalReference).toContain('Goods and Services Tax Act');
  });

  it('7. should block readiness when mandatory approvals or tax calculation returns fail verification', () => {
    const result = PreFilingControlEngine.evaluateReadiness({
      period: '2026-Q1',
      periodStatus: 'CLOSED',
      periodApproved: true,
      miraReturnValid: false,
      approvals: {
        preparer: undefined, // Missing preparer
        reviewer: undefined  // Missing reviewer
      }
    });

    expect(result.status).toBe('NOT_READY');
    expect(result.checks.MIRA_RETURN_VALIDATED.status).toBe('BLOCKED');
    expect(result.checks.MANDATORY_APPROVALS_COMPLETE.status).toBe('BLOCKED');
  });

  it('8. should enforce gatekeeping: FilingPackageGenerator refuses to generate ready package when blocking issues exist', async () => {
    // 1. Unbalanced / non-ready input
    const unreadyPackageInput = {
      tenantId: 'tenant-test-01',
      taxpayer: compliantTaxpayer,
      taxYear: 2026,
      period: '2026-Q1',
      periodStatus: 'OPEN' as const, // Blocked!
      periodApproved: false,
      trialBalance: {
        totalDebits: 1000,
        totalCredits: 900,
        difference: 100
      }
    };

    // Strict gatekeeper method MUST throw PreFilingBlockedError
    expect(() => {
      FilingPackageGenerator.generateReadyForFilingPackage(unreadyPackageInput);
    }).toThrow(PreFilingBlockedError);

    // Verify error details
    try {
      FilingPackageGenerator.generateReadyForFilingPackage(unreadyPackageInput);
    } catch (err: any) {
      expect(err).toBeInstanceOf(PreFilingBlockedError);
      expect(err.preFilingResult.status).toBe('NOT_READY');
      expect(err.blockingIssues.length).toBeGreaterThan(0);
      expect(err.message).toContain('Pre-filing package generation refused');
    }
  });

  it('9. should successfully generate authoritative filing package with submissionStatus READY_FOR_FILING when clean', async () => {
    const readyPackageInput = {
      tenantId: 'tenant-test-01',
      taxpayer: compliantTaxpayer,
      taxYear: 2026,
      period: '2026-Q1',
      periodStatus: 'CLOSED' as const,
      periodApproved: true,
      bills: [cleanBill],
      journals: balancedJournals,
      trialBalance: {
        totalDebits: 10800,
        totalCredits: 10800,
        difference: 0
      },
      gstReconciliation: {
        outputGst: 0,
        inputGst: 800,
        netPayable: -800,
        ledgerBalance: -800,
        variance: 0,
        isReconciled: true
      },
      nwtReconciliation: {
        taxWithheld: 0,
        ledgerBalance: 0,
        variance: 0,
        isReconciled: true
      },
      approvals: {
        preparer: { name: 'Hussain Rasheed', date: '2026-03-31', role: 'Senior Tax Officer' },
        reviewer: { name: 'Aminath Laila', date: '2026-04-01', role: 'Managing Partner' }
      },
      supportingDocumentsCount: 1,
      blockingAuditExceptionsCount: 0
    };

    const packageResult = await FilingPackageGenerator.generateReadyForFilingPackage(readyPackageInput);

    expect(packageResult).toBeDefined();
    expect(packageResult.manifest.submissionStatus).toBe('READY_FOR_FILING');
    expect(packageResult.manifest.preFilingCheck.status).toBe('READY_FOR_FILING');
    expect(packageResult.manifest.preFilingCheck.summary.blockingIssuesCount).toBe(0);
    expect(packageResult.files.length).toBeGreaterThan(0);
    expect(packageResult.packageChecksum).toBeDefined();
  });
});
