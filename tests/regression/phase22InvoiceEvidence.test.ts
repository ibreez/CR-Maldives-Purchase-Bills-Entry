import { describe, test, expect, beforeEach } from 'vitest';
import { prisma } from '../../src/db/client';
import {
  InvoiceEvidenceService,
  InvoiceValidator
} from '../../src/services/invoice';

describe('Phase 22 — Purchase Invoice / OCR Evidence Suite', { timeout: 30000 }, () => {
  const tenantId = 'TENANT-PHASE22-TEST';

  beforeEach(async () => {
    // Clean up test database records in proper dependency order
    await prisma.journalLine.deleteMany({
      where: { journal: { tenantId } }
    });
    await prisma.journal.deleteMany({
      where: { tenantId }
    });
    await prisma.oCRFieldEvidence.deleteMany({
      where: { tenantId }
    });
    await prisma.invoiceLine.deleteMany({
      where: { invoice: { tenantId } }
    });
    await prisma.invoice.deleteMany({
      where: { tenantId }
    });
    await prisma.documentVersion.deleteMany({
      where: { document: { tenantId } }
    });
    await prisma.document.deleteMany({
      where: { tenantId }
    });
    await prisma.account.deleteMany({
      where: { tenantId }
    });
    await prisma.tenant.deleteMany({
      where: { id: tenantId }
    });
  });

  test('1. Never automatically mark a financial document APPROVED merely because OCR succeeded', async () => {
    const result = await InvoiceEvidenceService.createInvoiceWithEvidence({
      tenantId,
      fileName: 'perfect_bill.pdf',
      fileUrl: '/uploads/perfect_bill.pdf',
      fileType: 'application/pdf',
      invoiceNumber: 'INV-2026-001',
      invoiceDate: '2026-08-10',
      currency: 'MVR',
      taxableAmount: 1000,
      gstAmount: 80,
      totalAmount: 1080,
      invoiceType: 'PURCHASE',
      lines: [
        {
          lineNumber: 1,
          description: 'High Quality Coffee Beans 5kg',
          quantity: 2,
          unitPrice: 500,
          taxableAmount: 1000,
          gstRate: 0.08,
          gstAmount: 80,
          totalAmount: 1080
        }
      ],
      fieldEvidences: {
        invoiceNumber: {
          value: 'INV-2026-001',
          confidence: 99,
          source: 'OCR_MODEL'
        },
        invoiceDate: {
          value: '2026-08-10',
          confidence: 98,
          source: 'OCR_MODEL'
        },
        totalAmount: {
          value: '1080',
          confidence: 99,
          source: 'OCR_MODEL'
        }
      }
    });

    expect(result.invoice).toBeDefined();
    // Status must NOT be APPROVED merely because OCR succeeded!
    expect(result.invoice.status).not.toBe('APPROVED');
    expect(['EXTRACTED', 'ACCOUNTANT_REVIEW', 'VALIDATION_REQUIRED']).toContain(result.invoice.status);
  });

  test('2. OCR values are preserved and corrections preserve original OCR value', async () => {
    const creation = await InvoiceEvidenceService.createInvoiceWithEvidence({
      tenantId,
      fileName: 'scanned_receipt.jpg',
      fileUrl: '/uploads/scanned_receipt.jpg',
      fileType: 'image/jpeg',
      invoiceNumber: 'INV-RAW-999',
      invoiceDate: '2026-08-12',
      currency: 'MVR',
      taxableAmount: 500,
      gstAmount: 40,
      totalAmount: 540,
      fieldEvidences: {
        invoiceNumber: {
          value: 'INV-RAW-999',
          extractedValue: 'INV-RAW-999',
          confidence: 88,
          source: 'OCR_MODEL',
          ocrModel: 'gemini-3.6-flash'
        },
        taxableAmount: {
          value: '500',
          extractedValue: '500',
          confidence: 92,
          source: 'OCR_MODEL',
          ocrModel: 'gemini-3.6-flash'
        }
      }
    });

    const invoiceId = creation.invoice.id;

    // Verify initial stored evidence
    const initialEvidence = await prisma.oCRFieldEvidence.findFirst({
      where: { invoiceId, fieldName: 'invoiceNumber' }
    });
    expect(initialEvidence).toBeDefined();
    expect(initialEvidence?.value).toBe('INV-RAW-999');
    expect(initialEvidence?.extractedValue).toBe('INV-RAW-999');
    expect(initialEvidence?.manuallyCorrected).toBe(false);

    // Apply manual correction by accountant
    const correctedInvoice = await InvoiceEvidenceService.correctFieldEvidence({
      tenantId,
      invoiceId,
      fieldName: 'invoiceNumber',
      newValue: 'INV-CORRECTED-1000',
      correctedBy: 'Accountant Ali',
      correctionReason: 'OCR mistook 1000 as 999 due to ink smudge'
    });

    expect(correctedInvoice?.invoiceNumber).toBe('INV-CORRECTED-1000');

    // Retrieve updated evidence from DB
    const updatedEvidence = await prisma.oCRFieldEvidence.findFirst({
      where: { invoiceId, fieldName: 'invoiceNumber' }
    });

    // Verification: current value is updated, original extracted value is preserved immutably
    expect(updatedEvidence?.value).toBe('INV-CORRECTED-1000');
    expect(updatedEvidence?.extractedValue).toBe('INV-RAW-999');
    expect(updatedEvidence?.manuallyCorrected).toBe(true);
    expect(updatedEvidence?.correctedBy).toBe('Accountant Ali');
    expect(updatedEvidence?.correctionReason).toBe('OCR mistook 1000 as 999 due to ink smudge');
    expect(updatedEvidence?.correctedAt).toBeDefined();
  });

  test('3. Low-confidence extraction reaches review and flags warning', async () => {
    const lowConfData = {
      invoiceNumber: 'INV-BLURRY-01',
      invoiceDate: '2026-08-11',
      supplierName: 'Smudged Supplier Ltd',
      currency: 'MVR',
      taxableAmount: 100,
      gstAmount: 8,
      totalAmount: 108,
      confidences: {
        invoiceNumber: 45, // Low confidence (< 80)
        supplierName: 50,
        totalAmount: 95
      }
    };

    const validation = InvoiceValidator.validate(lowConfData);
    expect(validation.issues.some(i => i.code === 'LOW_CONFIDENCE_EXTRACTION' && i.field === 'invoiceNumber')).toBe(true);
    expect(validation.issues.some(i => i.code === 'LOW_CONFIDENCE_EXTRACTION' && i.field === 'supplierName')).toBe(true);

    const created = await InvoiceEvidenceService.createInvoiceWithEvidence({
      tenantId,
      fileName: 'blurry.jpg',
      fileUrl: '/uploads/blurry.jpg',
      fileType: 'image/jpeg',
      invoiceNumber: lowConfData.invoiceNumber,
      invoiceDate: lowConfData.invoiceDate,
      taxableAmount: lowConfData.taxableAmount,
      gstAmount: lowConfData.gstAmount,
      totalAmount: lowConfData.totalAmount,
      fieldEvidences: {
        invoiceNumber: { value: lowConfData.invoiceNumber, confidence: 45 },
        supplierName: { value: lowConfData.supplierName, confidence: 50 },
        totalAmount: { value: '108', confidence: 95 }
      }
    });

    expect(['ACCOUNTANT_REVIEW', 'VALIDATION_REQUIRED']).toContain(created.invoice.status);
    expect(created.invoice.status).not.toBe('APPROVED');
  });

  test('4. Validation detects missing fields, bad dates, and invalid TIN', async () => {
    // Future date
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 2);

    const valResult = InvoiceValidator.validate({
      invoiceNumber: '',
      invoiceDate: futureDate.toISOString(),
      supplierName: '',
      supplierTin: 'INVALID_TIN_123',
      taxpayerTin: '1000000GST001',
      taxableAmount: -10,
      gstAmount: -2,
      totalAmount: 0
    });

    expect(valResult.isValid).toBe(false);
    expect(valResult.canApprove).toBe(false);
    expect(valResult.issues.some(i => i.code === 'MISSING_INVOICE_NUMBER')).toBe(true);
    expect(valResult.issues.some(i => i.code === 'FUTURE_INVOICE_DATE')).toBe(true);
    expect(valResult.issues.some(i => i.code === 'MISSING_SUPPLIER_NAME')).toBe(true);
    expect(valResult.issues.some(i => i.code === 'INVALID_TIN_FORMAT')).toBe(true);
    expect(valResult.issues.some(i => i.code === 'NEGATIVE_SUBTOTAL')).toBe(true);
  });

  test('5. Validation detects arithmetic inconsistency between subtotal, GST, and total', async () => {
    const valResult = InvoiceValidator.validate({
      invoiceNumber: 'INV-MATH-ERROR',
      invoiceDate: '2026-08-14',
      supplierName: 'Hardware Store',
      currency: 'MVR',
      taxableAmount: 1000,
      gstAmount: 80,
      totalAmount: 1500 // 1000 + 80 != 1500!
    });

    expect(valResult.isValid).toBe(false);
    expect(valResult.canApprove).toBe(false);
    expect(valResult.canPost).toBe(false);
    expect(valResult.arithmeticCheck.passed).toBe(false);
    expect(valResult.issues.some(i => i.code === 'ARITHMETIC_INCONSISTENCY')).toBe(true);
  });

  test('6. Invalid totals cannot be approved or posted', async () => {
    const created = await InvoiceEvidenceService.createInvoiceWithEvidence({
      tenantId,
      fileName: 'broken_math.png',
      fileUrl: '/uploads/broken_math.png',
      fileType: 'image/png',
      invoiceNumber: 'INV-BAD-MATH',
      invoiceDate: '2026-08-14',
      taxableAmount: 1000,
      gstAmount: 80,
      totalAmount: 1200 // Math is broken
    });

    const invoiceId = created.invoice.id;

    // Attempting to approve must fail
    await expect(
      InvoiceEvidenceService.approveInvoice(tenantId, invoiceId, 'Auditor User')
    ).rejects.toThrow(/Cannot approve invoice due to validation errors/);

    // Attempting to post must fail
    await expect(
      InvoiceEvidenceService.postInvoiceToLedger(tenantId, invoiceId, 'Auditor User')
    ).rejects.toThrow(/must be 'APPROVED' prior to posting/);
  });

  test('7. Complete lifecycle: Creation -> Correction -> Approval -> Ledger Posting', async () => {
    // 1. Ingest document with minor math discrepancy
    const created = await InvoiceEvidenceService.createInvoiceWithEvidence({
      tenantId,
      fileName: 'office_supplies.pdf',
      fileUrl: '/uploads/office_supplies.pdf',
      fileType: 'application/pdf',
      invoiceNumber: 'INV-OS-2026-01',
      invoiceDate: '2026-08-15',
      currency: 'MVR',
      taxableAmount: 2000,
      gstAmount: 160,
      totalAmount: 2200, // Discrepancy: should be 2160
      fieldEvidences: {
        supplierName: {
          value: 'City Stationary Supplies',
          confidence: 95,
          source: 'OCR_MODEL'
        },
        totalAmount: {
          value: '2200',
          extractedValue: '2200',
          confidence: 90,
          source: 'OCR_MODEL'
        }
      }
    });

    const invoiceId = created.invoice.id;
    expect(['ACCOUNTANT_REVIEW', 'VALIDATION_REQUIRED']).toContain(created.invoice.status);
    expect(created.invoice.status).not.toBe('APPROVED');

    // 2. Correct the total amount
    const corrected = await InvoiceEvidenceService.correctFieldEvidence({
      tenantId,
      invoiceId,
      fieldName: 'totalAmount',
      newValue: 2160,
      correctedBy: 'Staff Accountant Fathimath',
      correctionReason: 'Corrected total to match taxable 2000 + 8% GST 160'
    });

    expect(Number(corrected?.totalAmount)).toBe(2160);

    // 3. Approve the invoice
    const approved = await InvoiceEvidenceService.approveInvoice(tenantId, invoiceId, 'Staff Accountant Fathimath');
    expect(approved.status).toBe('APPROVED');

    // 4. Post to General Ledger
    const postResult = await InvoiceEvidenceService.postInvoiceToLedger(tenantId, invoiceId, 'Staff Accountant Fathimath');
    expect(postResult.invoice.status).toBe('POSTED');
    expect(postResult.journal).toBeDefined();
    expect(postResult.journal.reference).toBe('INV-OS-2026-01');

    // Verify balanced double entry in GL
    const journalWithLines = await prisma.journal.findUnique({
      where: { id: postResult.journal.id },
      include: { lines: true }
    });

    expect(journalWithLines?.lines.length).toBe(3);
    const totalDebit = journalWithLines?.lines.reduce((sum, l) => sum + Number(l.debit), 0);
    const totalCredit = journalWithLines?.lines.reduce((sum, l) => sum + Number(l.credit), 0);
    expect(totalDebit).toBe(2160);
    expect(totalCredit).toBe(2160);
  });

  test('8. Full evidence retrieval API returns documents, versions, and field evidences', async () => {
    const created = await InvoiceEvidenceService.createInvoiceWithEvidence({
      tenantId,
      fileName: 'vendor_invoice.pdf',
      fileUrl: '/uploads/vendor_invoice.pdf',
      fileType: 'application/pdf',
      invoiceNumber: 'INV-VENDOR-77',
      invoiceDate: '2026-08-16',
      taxableAmount: 500,
      gstAmount: 40,
      totalAmount: 540,
      fieldEvidences: {
        invoiceNumber: { value: 'INV-VENDOR-77', confidence: 95, source: 'OCR_MODEL' },
        taxableAmount: { value: '500', confidence: 95, source: 'OCR_MODEL' },
        gstAmount: { value: '40', confidence: 95, source: 'OCR_MODEL' },
        totalAmount: { value: '540', confidence: 95, source: 'OCR_MODEL' }
      }
    });

    const fullHierarchy = await InvoiceEvidenceService.getInvoiceWithEvidence(tenantId, created.invoice.id);

    expect(fullHierarchy).toBeDefined();
    expect(fullHierarchy?.document).toBeDefined();
    expect(fullHierarchy?.document?.versions.length).toBeGreaterThanOrEqual(1);
    expect(fullHierarchy?.fieldEvidences.length).toBe(4);
  });
});
