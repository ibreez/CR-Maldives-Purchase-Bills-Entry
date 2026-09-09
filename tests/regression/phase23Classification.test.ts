import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../../src/db/client';
import { CanonicalClassificationEngine } from '../../src/services/classification/canonicalClassificationEngine';
import { InvoiceEvidenceService } from '../../src/services/invoice/invoiceEvidenceService';

describe('Phase 23: Canonical Classification Engine Regression Suite', { timeout: 30000 }, () => {
  const testTenantId = 'TENANT-P23-TEST';

  beforeEach(async () => {
    // Clean up test tenant database records
    await prisma.journalLine.deleteMany({ where: { journal: { tenantId: testTenantId } } });
    await prisma.journalEntry.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.invoiceLine.deleteMany({ where: { invoice: { tenantId: testTenantId } } });
    await prisma.invoice.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.documentVersion.deleteMany({ where: { document: { tenantId: testTenantId } } });
    await prisma.document.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.auditEvent.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.user.deleteMany({ where: { tenantId: testTenantId } });
  });

  afterEach(async () => {
    await prisma.journalLine.deleteMany({ where: { journal: { tenantId: testTenantId } } });
    await prisma.journalEntry.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.invoiceLine.deleteMany({ where: { invoice: { tenantId: testTenantId } } });
    await prisma.invoice.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.documentVersion.deleteMany({ where: { document: { tenantId: testTenantId } } });
    await prisma.document.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.auditEvent.deleteMany({ where: { tenantId: testTenantId } });
    await prisma.user.deleteMany({ where: { tenantId: testTenantId } });
  });

  // TEST 1: Same input produces deterministic classification across all 6 dimensions
  it('TEST 1: Same input produces identical 6-dimensional classification deterministically', () => {
    const input = {
      description: 'Monthly Office Rental for Male Outlet',
      taxableAmount: 25000,
      gstAmount: 2000,
      currency: 'MVR',
      supplierName: 'Male City Properties Pvt Ltd'
    };

    const run1 = CanonicalClassificationEngine.classifyLine(input);
    const run2 = CanonicalClassificationEngine.classifyLine(input);

    expect(run1).toEqual(run2);
    expect(run1.accountingClassification).toBe('EXPENSE');
    expect(run1.gstClassification).toBe('GENERAL_INPUT_TAX');
    expect(run1.incomeTaxClassification).toBe('DEDUCTIBLE');
    expect(run1.nwtClassification).toBe('NONE');
    expect(run1.assetClassification).toBe('NONE');
    expect(run1.miraReportingClassification).toBe('SCHEDULE1_RENTAL_LEASE');
    expect(run1.ruleId).toBe('MIRA-RULE-ITA-SEC11-RENT');
    expect(run1.regulatoryVersion).toBe(CanonicalClassificationEngine.REGULATORY_VERSION);
    expect(run1.source).toBe('DETERMINISTIC_RULE');
    expect(run1.requiresReview).toBe(false);
  });

  // TEST 2: AI suggestions are marked as AI_SUGGESTION and cannot directly post
  it('TEST 2: AI suggestion is marked as AI_SUGGESTION and requires review prior to posting', async () => {
    const input = {
      description: 'Coffee grinder commercial repair parts',
      taxableAmount: 3200,
      gstAmount: 256,
      currency: 'MVR',
      supplierName: 'Espresso Services Maldives'
    };

    const suggestion = await CanonicalClassificationEngine.suggestClassification(input);

    expect(suggestion.source).toBe('AI_SUGGESTION');
    expect(suggestion.confidence).toBeLessThanOrEqual(85);
    expect(suggestion.requiresReview).toBe(true);
    expect(suggestion.isApproved).toBe(false);

    // Validate that unapproved AI suggestions cannot post
    const validation = CanonicalClassificationEngine.validateClassification(suggestion, input);
    expect(validation.canPost).toBe(false);
  });

  // TEST 3: High-risk classifications (Capital Assets) require human approval
  it('TEST 3: Capital assets are flagged as high risk and require human review', () => {
    const laptopInput = {
      description: 'MacBook Pro M3 Max for Senior Accountant',
      taxableAmount: 48000,
      gstAmount: 3840,
      currency: 'MVR',
      supplierName: 'Focus Computers Maldives'
    };

    const result = CanonicalClassificationEngine.classifyLine(laptopInput);

    expect(result.accountingClassification).toBe('ASSET');
    expect(result.gstClassification).toBe('CAPITAL_INPUT_TAX');
    expect(result.incomeTaxClassification).toBe('CAPITAL_ALLOWANCE');
    expect(result.assetClassification).toBe('COMPUTER_SOFTWARE_HARDWARE');
    expect(result.miraReportingClassification).toBe('SCHEDULE2_CAPITAL_ALLOWANCE');
    expect(result.isHighRisk).toBe(true);
    expect(result.highRiskCategory).toBe('CAPITAL_ASSET');
    expect(result.requiresReview).toBe(true);
    expect(result.isApproved).toBe(false);

    // Validation should forbid pre-approval without human reviewer
    const validation = CanonicalClassificationEngine.validateClassification({
      ...result,
      isApproved: true,
      reviewer: null
    });
    expect(validation.isValid).toBe(false);
    expect(validation.errors[0]).toContain('requires an explicit authorized reviewer');
  });

  // TEST 4: Non-deductible fines and penalties correctly classified
  it('TEST 4: Non-deductible statutory fines & penalties are flagged as high-risk', () => {
    const fineInput = {
      description: 'MIRA Late Filing Penalty Fine for Q2 Return',
      taxableAmount: 5000,
      gstAmount: 0,
      currency: 'MVR',
      supplierName: 'Maldives Inland Revenue Authority'
    };

    const result = CanonicalClassificationEngine.classifyLine(fineInput);

    expect(result.accountingClassification).toBe('EXPENSE');
    expect(result.gstClassification).toBe('OUT_OF_SCOPE');
    expect(result.incomeTaxClassification).toBe('NON_DEDUCTIBLE_FINE');
    expect(result.miraReportingClassification).toBe('NON_DEDUCTIBLE');
    expect(result.isHighRisk).toBe(true);
    expect(result.highRiskCategory).toBe('NON_DEDUCTIBLE_EXPENSE');
    expect(result.ruleId).toBe('MIRA-RULE-ITA-SEC18-FINES');
    expect(result.regulatoryCitation).toContain('Section 18(a)(7)');
  });

  // TEST 5: Non-Resident Withholding Tax (NWT) detected on foreign services
  it('TEST 5: Foreign supplier technical services and royalties trigger NWT Section 55', () => {
    const royaltyInput = {
      description: 'Annual Software IP License and Brand Royalty',
      taxableAmount: 10000,
      currency: 'USD',
      isForeignSupplier: true,
      supplierName: 'Global Cloud Systems Pte Ltd'
    };

    const result = CanonicalClassificationEngine.classifyLine(royaltyInput);

    expect(result.nwtClassification).toBe('NWT_10_ROYALTY');
    expect(result.isHighRisk).toBe(true);
    expect(result.highRiskCategory).toBe('NWT_APPLICABLE');
    expect(result.ruleId).toBe('MIRA-RULE-ITA-SEC55-ROYALTY');
    expect(result.regulatoryCitation).toContain('Section 55(a)(2)');
  });

  // TEST 6: Ingestion pipeline persists 6 dimensions & metadata in database
  it('TEST 6: Ingestion pipeline automatically classifies invoice lines with 6 dimensions and metadata', async () => {
    const created = await InvoiceEvidenceService.createInvoiceWithEvidence({
      tenantId: testTenantId,
      invoiceNumber: 'INV-P23-001',
      invoiceDate: '2026-08-15',
      taxableAmount: 15000,
      gstAmount: 1200,
      totalAmount: 16200,
      currency: 'MVR',
      fileName: 'diesel_generator_purchase.pdf',
      fileUrl: '/uploads/diesel_generator.pdf',
      fileType: 'application/pdf',
      fieldEvidences: {
        supplierName: { value: 'State Electric & Diesel Supplies', confidence: 95 },
        supplierTin: { value: '1002345GST001', confidence: 95 }
      },
      lines: [
        {
          lineNumber: 1,
          description: 'Industrial Diesel Generator 50kVA for Outlet Backup',
          quantity: 1,
          unitPrice: 15000,
          taxableAmount: 15000,
          gstRate: 0.08,
          gstAmount: 1200,
          totalAmount: 16200
        }
      ]
    });

    expect(created.invoice).toBeDefined();

    // Verify stored invoice line in DB
    const line = await prisma.invoiceLine.findFirst({
      where: { invoiceId: created.invoice.id }
    });

    expect(line).toBeDefined();
    expect(line?.accountingClassification).toBe('ASSET');
    expect(line?.gstClassification).toBe('CAPITAL_INPUT_TAX');
    expect(line?.incomeTaxClassification).toBe('CAPITAL_ALLOWANCE');
    expect(line?.assetClassification).toBe('PLANT_EQUIPMENT_MACHINERY');
    expect(line?.miraReportingClassification).toBe('SCHEDULE2_CAPITAL_ALLOWANCE');
    expect(line?.ruleId).toBe('MIRA-RULE-ITA-SEC21-MACHINERY');
    expect(line?.regulatoryVersion).toBe(CanonicalClassificationEngine.REGULATORY_VERSION);
    expect(line?.requiresReview).toBe(true);
    expect(line?.isApproved).toBe(false);
  });

  // TEST 7: Human manual override is audited and updates classification
  it('TEST 7: Manual classification override updates dimensions and generates audit trail', async () => {
    const created = await InvoiceEvidenceService.createInvoiceWithEvidence({
      tenantId: testTenantId,
      invoiceNumber: 'INV-P23-002',
      invoiceDate: '2026-08-16',
      taxableAmount: 2000,
      gstAmount: 160,
      totalAmount: 2160,
      currency: 'MVR',
      fileName: 'misc_receipt.pdf',
      fileUrl: '/uploads/misc_receipt.pdf',
      fileType: 'application/pdf',
      lines: [
        {
          lineNumber: 1,
          description: 'Team Dinner and VIP Entertainment Event',
          quantity: 1,
          unitPrice: 2000,
          taxableAmount: 2000,
          gstRate: 0.08,
          gstAmount: 160,
          totalAmount: 2160
        }
      ]
    });

    const line = await prisma.invoiceLine.findFirst({
      where: { invoiceId: created.invoice.id }
    });

    // Override classification to BLOCKED_INPUT_TAX and NON_DEDUCTIBLE_ENTERTAINMENT
    const overridden = await CanonicalClassificationEngine.overrideClassification({
      tenantId: testTenantId,
      invoiceId: created.invoice.id,
      lineId: line!.id,
      overrideValues: {
        accountingClassification: 'EXPENSE',
        gstClassification: 'BLOCKED_INPUT_TAX',
        incomeTaxClassification: 'NON_DEDUCTIBLE_ENTERTAINMENT',
        miraReportingClassification: 'NON_DEDUCTIBLE'
      },
      overrideReason: 'Accountant confirmed VIP dining constitutes non-deductible entertainment under GST Sec 22(b)',
      overriddenBy: 'Ahmed Ali (Lead Tax Accountant)'
    });

    expect(overridden.gstClassification).toBe('BLOCKED_INPUT_TAX');
    expect(overridden.incomeTaxClassification).toBe('NON_DEDUCTIBLE_ENTERTAINMENT');
    expect(overridden.source).toBe('MANUAL_OVERRIDE');
    expect(overridden.reviewer).toBe('Ahmed Ali (Lead Tax Accountant)');

    // Verify audit event log in DB
    const audit = await prisma.auditEvent.findFirst({
      where: { tenantId: testTenantId, recordId: line!.id, action: 'CLASSIFICATION_OVERRIDDEN' }
    });

    expect(audit).toBeDefined();
    expect(audit?.performedBy).toBeDefined();
    expect(audit?.details).toContain('Ahmed Ali (Lead Tax Accountant)');
    expect(audit?.details).toContain('Accountant confirmed VIP dining');
  });

  // TEST 8: Accountant Approval workflow
  it('TEST 8: Classification approval sets isApproved=true and records reviewer metadata', async () => {
    const created = await InvoiceEvidenceService.createInvoiceWithEvidence({
      tenantId: testTenantId,
      invoiceNumber: 'INV-P23-003',
      invoiceDate: '2026-08-17',
      taxableAmount: 1000,
      gstAmount: 80,
      totalAmount: 1080,
      currency: 'MVR',
      fileName: 'supplies.pdf',
      fileUrl: '/uploads/supplies.pdf',
      fileType: 'application/pdf',
      fieldEvidences: {
        supplierName: { value: 'Local Supplies Co', confidence: 90 },
        supplierTin: { value: '1009999GST001', confidence: 90 }
      },
      lines: [
        {
          lineNumber: 1,
          description: 'Takeaway coffee paper cups and lids',
          quantity: 1,
          unitPrice: 1000,
          taxableAmount: 1000,
          gstRate: 0.08,
          gstAmount: 80,
          totalAmount: 1080
        }
      ]
    });

    const line = await prisma.invoiceLine.findFirst({
      where: { invoiceId: created.invoice.id }
    });

    const approved = await CanonicalClassificationEngine.approveClassification({
      tenantId: testTenantId,
      invoiceId: created.invoice.id,
      lineId: line!.id,
      approvedBy: 'Mariyam (Senior Auditor)',
      comments: 'Verified cost of sales packaging'
    });

    expect(approved.isApproved).toBe(true);
    expect(approved.reviewer).toBe('Mariyam (Senior Auditor)');

    // Verify updated line in DB
    const updatedLine = await prisma.invoiceLine.findUnique({
      where: { id: line!.id }
    });
    expect(updatedLine?.isApproved).toBe(true);
    expect(updatedLine?.reviewer).toBe('Mariyam (Senior Auditor)');
    expect(updatedLine?.reviewedAt).toBeDefined();
  });
});
