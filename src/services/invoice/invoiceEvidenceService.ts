import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../db/client';
import {
  CreateEvidenceInvoiceDTO,
  CorrectFieldEvidenceDTO,
  InvoiceLifecycleStatus,
  StoredFieldEvidence
} from '../../types/invoiceEvidence';
import { InvoiceValidator } from './invoiceValidator';
import { JournalPostingService } from '../accounting/journalPostingService';
import { CanonicalClassificationEngine } from '../classification/canonicalClassificationEngine';

export class InvoiceEvidenceService {
  /**
   * Creates a Document, DocumentVersion, Invoice, InvoiceLines, and OCRFieldEvidence records.
   * Enforces: "Never automatically mark a financial document APPROVED merely because OCR succeeded."
   */
  public static async createInvoiceWithEvidence(
    dto: CreateEvidenceInvoiceDTO,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ) {
    // Ensure Tenant exists prior to transaction
    const tenantCheck = await defaultPrisma.tenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenantCheck) {
      await defaultPrisma.tenant.upsert({
        where: { id: dto.tenantId },
        update: {},
        create: {
          id: dto.tenantId,
          name: `Tenant ${dto.tenantId}`,
          tin: `TIN-${dto.tenantId.replace(/[^A-Za-z0-9]/g, '').slice(0, 8)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
        }
      }).catch(() => {});
    }

    const execute = async (tx: PrismaClient | Prisma.TransactionClient) => {
      // 1. Create Document
      const document = await tx.document.create({
        data: {
          tenantId: dto.tenantId,
          taxpayerId: dto.taxpayerId || null,
          supplierId: dto.supplierId || null,
          fileName: dto.fileName,
          fileUrl: dto.fileUrl,
          fileType: dto.fileType,
          ocrStatus: 'PROCESSED',
          extractedData: dto.fieldEvidences ? JSON.stringify(dto.fieldEvidences) : null
        }
      });

      // 2. Create DocumentVersion (v1)
      await tx.documentVersion.create({
        data: {
          documentId: document.id,
          versionNumber: 1,
          fileUrl: dto.fileUrl,
          changeSummary: 'Initial document upload and OCR extraction'
        }
      });

      // 3. Extract Confidences map
      const confidences: Record<string, number> = {};
      if (dto.fieldEvidences) {
        for (const [key, ev] of Object.entries(dto.fieldEvidences)) {
          confidences[key] = ev.confidence;
        }
      }

      // 4. Validate Staged Data
      const validation = InvoiceValidator.validate({
        invoiceNumber: dto.invoiceNumber,
        invoiceDate: dto.invoiceDate,
        taxableAmount: dto.taxableAmount,
        gstAmount: dto.gstAmount,
        totalAmount: dto.totalAmount,
        currency: dto.currency || 'MVR',
        invoiceType: dto.invoiceType || 'PURCHASE',
        lines: dto.lines,
        confidences
      });

      // 5. Determine initial lifecycle status
      // MANDATE: Never automatically mark a financial document APPROVED merely because OCR succeeded.
      let lifecycleStatus: InvoiceLifecycleStatus = dto.status || 'EXTRACTED';
      if (!dto.status || dto.status === 'APPROVED') {
        const hasLowConfidence = Object.values(confidences).some(c => c < 80);
        if (!validation.isValid) {
          lifecycleStatus = 'VALIDATION_REQUIRED';
        } else if (hasLowConfidence) {
          lifecycleStatus = 'ACCOUNTANT_REVIEW';
        } else {
          lifecycleStatus = 'ACCOUNTANT_REVIEW'; // Requires review before approval
        }
      }

      const invNumber = dto.invoiceNumber && dto.invoiceNumber.trim() !== ''
        ? dto.invoiceNumber.trim()
        : `DRAFT-${Date.now()}`;

      const invDate = dto.invoiceDate
        ? new Date(dto.invoiceDate)
        : new Date();

      const taxable = new Prisma.Decimal(dto.taxableAmount ?? 0);
      const gst = new Prisma.Decimal(dto.gstAmount ?? 0);
      const total = new Prisma.Decimal(dto.totalAmount ?? 0);

      // 6. Create Invoice
      const invoice = await tx.invoice.create({
        data: {
          tenantId: dto.tenantId,
          taxpayerId: dto.taxpayerId || null,
          documentId: document.id,
          supplierId: dto.supplierId || null,
          invoiceNumber: invNumber,
          invoiceDate: isNaN(invDate.getTime()) ? new Date() : invDate,
          invoiceType: dto.invoiceType || 'PURCHASE',
          currency: dto.currency || 'MVR',
          taxableAmount: taxable,
          gstAmount: gst,
          totalAmount: total,
          status: lifecycleStatus
        }
      });

      // 7. Create & Classify InvoiceLines
      const rawLines = (dto.lines && dto.lines.length > 0)
        ? dto.lines
        : [{
            lineNumber: 1,
            description: dto.fileName || 'Purchased supplies',
            quantity: 1,
            unitPrice: dto.taxableAmount ?? 0,
            taxableAmount: dto.taxableAmount ?? 0,
            gstRate: dto.taxableAmount ? ((dto.gstAmount ?? 0) / dto.taxableAmount) : 0.08,
            gstAmount: dto.gstAmount ?? 0,
            totalAmount: dto.totalAmount ?? 0
          }];

      for (const line of rawLines) {
        const classification = CanonicalClassificationEngine.classifyLine({
          tenantId: dto.tenantId,
          invoiceId: invoice.id,
          lineNumber: line.lineNumber,
          description: line.description,
          taxableAmount: Number(line.taxableAmount),
          gstAmount: Number(line.gstAmount),
          totalAmount: Number(line.totalAmount),
          currency: dto.currency,
          supplierName: dto.fieldEvidences?.supplierName?.value ? String(dto.fieldEvidences.supplierName.value) : undefined,
          supplierTin: dto.fieldEvidences?.supplierTin?.value ? String(dto.fieldEvidences.supplierTin.value) : undefined
        });

        await tx.invoiceLine.create({
          data: {
            invoiceId: invoice.id,
            lineNumber: line.lineNumber,
            description: line.description,
            quantity: new Prisma.Decimal(line.quantity),
            unitPrice: new Prisma.Decimal(line.unitPrice),
            taxableAmount: new Prisma.Decimal(line.taxableAmount),
            gstRate: new Prisma.Decimal(line.gstRate),
            gstAmount: new Prisma.Decimal(line.gstAmount),
            totalAmount: new Prisma.Decimal(line.totalAmount),
            accountingClassification: classification.accountingClassification,
            gstClassification: classification.gstClassification,
            incomeTaxClassification: classification.incomeTaxClassification,
            nwtClassification: classification.nwtClassification,
            assetClassification: classification.assetClassification,
            miraReportingClassification: classification.miraReportingClassification,
            ruleId: classification.ruleId,
            regulatoryVersion: classification.regulatoryVersion,
            classificationReason: classification.classificationReason,
            confidence: new Prisma.Decimal(classification.confidence),
            source: classification.source,
            requiresReview: classification.requiresReview,
            isApproved: false
          }
        });
      }

      // 8. Create OCRFieldEvidence records
      if (dto.fieldEvidences) {
        for (const [fieldName, ev] of Object.entries(dto.fieldEvidences)) {
          const stringVal = ev.value !== null && ev.value !== undefined ? String(ev.value) : null;
          const originalExtracted = ev.extractedValue !== undefined
            ? (ev.extractedValue !== null ? String(ev.extractedValue) : null)
            : stringVal;

          await tx.oCRFieldEvidence.create({
            data: {
              tenantId: dto.tenantId,
              documentId: document.id,
              invoiceId: invoice.id,
              fieldName,
              value: stringVal,
              extractedValue: originalExtracted,
              confidence: new Prisma.Decimal(ev.confidence ?? 85),
              source: ev.source || 'OCR_MODEL',
              boundingBox: ev.boundingBox ? (typeof ev.boundingBox === 'string' ? ev.boundingBox : JSON.stringify(ev.boundingBox)) : null,
              ocrModel: ev.ocrModel || 'gemini-3.6-flash',
              ocrTimestamp: ev.ocrTimestamp ? new Date(ev.ocrTimestamp) : new Date(),
              manuallyCorrected: false
            }
          });
        }
      }

      return {
        document,
        invoice,
        validation
      };
    };

    if ('$transaction' in db && typeof (db as any).$transaction === 'function') {
      return await (db as PrismaClient).$transaction(async tx => execute(tx), { maxWait: 10000, timeout: 20000 });
    } else {
      return await execute(db as Prisma.TransactionClient);
    }
  }

  /**
   * Corrects an OCR field value while preserving the original extracted OCR value immutably.
   */
  public static async correctFieldEvidence(
    dto: CorrectFieldEvidenceDTO,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ) {
    const execute = async (tx: PrismaClient | Prisma.TransactionClient) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: dto.invoiceId },
        include: { lines: true, fieldEvidences: true }
      });

      if (!invoice) {
        throw new Error(`Invoice '${dto.invoiceId}' not found.`);
      }

      const strNewVal = String(dto.newValue);
      const existingEvidence = invoice.fieldEvidences.find(e => e.fieldName === dto.fieldName);
      const effectiveTenantId = invoice.tenantId;

      if (existingEvidence) {
        // Update existing evidence: PRESERVE original extractedValue
        await tx.oCRFieldEvidence.update({
          where: { id: existingEvidence.id },
          data: {
            value: strNewVal,
            manuallyCorrected: true,
            correctedBy: dto.correctedBy,
            correctedAt: new Date(),
            correctionReason: dto.correctionReason || 'User manual correction'
          }
        });
      } else {
        // Create new evidence record with manual correction flags
        await tx.oCRFieldEvidence.create({
          data: {
            tenantId: effectiveTenantId,
            documentId: invoice.documentId,
            invoiceId: invoice.id,
            fieldName: dto.fieldName,
            value: strNewVal,
            extractedValue: null,
            confidence: new Prisma.Decimal(100),
            source: 'USER_OVERRIDE',
            manuallyCorrected: true,
            correctedBy: dto.correctedBy,
            correctedAt: new Date(),
            correctionReason: dto.correctionReason || 'User manual correction'
          }
        });
      }

      // Sync the field on the Invoice model if it matches core columns
      const invoiceUpdateData: Prisma.InvoiceUpdateInput = {};
      if (dto.fieldName === 'invoiceNumber') {
        invoiceUpdateData.invoiceNumber = strNewVal;
      } else if (dto.fieldName === 'invoiceDate') {
        const parsedDate = new Date(strNewVal);
        if (!isNaN(parsedDate.getTime())) {
          invoiceUpdateData.invoiceDate = parsedDate;
        }
      } else if (dto.fieldName === 'taxableAmount' || dto.fieldName === 'subtotal') {
        const numVal = parseFloat(strNewVal);
        if (!isNaN(numVal)) {
          invoiceUpdateData.taxableAmount = new Prisma.Decimal(numVal);
        }
      } else if (dto.fieldName === 'gstAmount' || dto.fieldName === 'gst') {
        const numVal = parseFloat(strNewVal);
        if (!isNaN(numVal)) {
          invoiceUpdateData.gstAmount = new Prisma.Decimal(numVal);
        }
      } else if (dto.fieldName === 'totalAmount' || dto.fieldName === 'total') {
        const numVal = parseFloat(strNewVal);
        if (!isNaN(numVal)) {
          invoiceUpdateData.totalAmount = new Prisma.Decimal(numVal);
        }
      } else if (dto.fieldName === 'currency') {
        invoiceUpdateData.currency = strNewVal.toUpperCase();
      }

      if (Object.keys(invoiceUpdateData).length > 0) {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: invoiceUpdateData
        });
      }

      // Reload updated invoice
      const updatedInvoice = await tx.invoice.findUnique({
        where: { id: invoice.id },
        include: { lines: true, fieldEvidences: true }
      });

      return updatedInvoice;
    };

    if ('$transaction' in db && typeof (db as any).$transaction === 'function') {
      return await (db as PrismaClient).$transaction(async tx => execute(tx), { maxWait: 10000, timeout: 20000 });
    } else {
      return await execute(db as Prisma.TransactionClient);
    }
  }

  /**
   * Approve an invoice after human/accountant review and arithmetic validation.
   */
  public static async approveInvoice(
    tenantId: string,
    invoiceId: string,
    approvedBy: string,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ) {
    const execute = async (tx: PrismaClient | Prisma.TransactionClient) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { lines: true, fieldEvidences: true }
      });

      if (!invoice) {
        throw new Error(`Invoice '${invoiceId}' not found.`);
      }

      const supplierNameEv = invoice.fieldEvidences.find(e => e.fieldName === 'supplierName')?.value || null;
      const supplierTinEv = invoice.fieldEvidences.find(e => e.fieldName === 'supplierTin')?.value || null;

      // Validate before approving
      const validation = InvoiceValidator.validate({
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        supplierName: supplierNameEv,
        supplierTin: supplierTinEv,
        taxableAmount: Number(invoice.taxableAmount),
        gstAmount: Number(invoice.gstAmount),
        totalAmount: Number(invoice.totalAmount),
        currency: invoice.currency,
        invoiceType: invoice.invoiceType,
        lines: invoice.lines.map(l => ({
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          taxableAmount: Number(l.taxableAmount),
          gstRate: Number(l.gstRate),
          gstAmount: Number(l.gstAmount),
          totalAmount: Number(l.totalAmount)
        }))
      });

      if (!validation.canApprove) {
        const errorSummary = validation.issues.map(i => `[${i.field}] ${i.message}`).join(', ');
        throw new Error(`Cannot approve invoice due to validation errors: ${errorSummary}`);
      }

      // Mark all line items as reviewed and approved by the approving accountant
      await tx.invoiceLine.updateMany({
        where: { invoiceId },
        data: {
          isApproved: true,
          requiresReview: false,
          reviewer: approvedBy,
          reviewedAt: new Date()
        }
      });

      return await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'APPROVED'
        },
        include: { lines: true, fieldEvidences: true }
      });
    };

    if ('$transaction' in db && typeof (db as any).$transaction === 'function') {
      return await (db as PrismaClient).$transaction(async tx => execute(tx), { maxWait: 10000, timeout: 20000 });
    } else {
      return await execute(db as Prisma.TransactionClient);
    }
  }

  /**
   * Post an approved invoice to the authoritative General Ledger.
   * Enforces: "Invalid totals cannot be posted."
   */
  public static async postInvoiceToLedger(
    tenantId: string,
    invoiceId: string,
    postedBy: string,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ) {
    const execute = async (tx: PrismaClient | Prisma.TransactionClient) => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        include: { lines: true, fieldEvidences: true }
      });

      if (!invoice) {
        throw new Error(`Invoice '${invoiceId}' not found.`);
      }

      if (invoice.status !== 'APPROVED') {
        throw new Error(`Cannot post invoice '${invoice.invoiceNumber}' because its status is '${invoice.status}'. Invoice must be 'APPROVED' prior to posting.`);
      }

      const supplierNameEv = invoice.fieldEvidences.find(e => e.fieldName === 'supplierName')?.value || null;
      const supplierTinEv = invoice.fieldEvidences.find(e => e.fieldName === 'supplierTin')?.value || null;

      // Final arithmetic validation check
      const validation = InvoiceValidator.validate({
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        supplierName: supplierNameEv,
        supplierTin: supplierTinEv,
        taxableAmount: Number(invoice.taxableAmount),
        gstAmount: Number(invoice.gstAmount),
        totalAmount: Number(invoice.totalAmount),
        currency: invoice.currency,
        invoiceType: invoice.invoiceType
      });

      if (!validation.canPost) {
        throw new Error(`Cannot post invoice '${invoice.invoiceNumber}': Arithmetic or total amount is invalid.`);
      }

      const taxable = Number(invoice.taxableAmount);
      const gst = Number(invoice.gstAmount);
      const total = Number(invoice.totalAmount);

      const entryDateStr = invoice.invoiceDate.toISOString().split('T')[0];

      // Prepare double-entry journal lines
      const journalLines: Array<{
        accountCode: string;
        accountName: string;
        debit: number;
        credit: number;
        description?: string;
      }> = [];

      // Debit: Operating Purchases / Expense
      journalLines.push({
        accountCode: '5000-PURCHASES',
        accountName: 'Purchases / Cost of Goods',
        debit: taxable,
        credit: 0,
        description: `Invoice ${invoice.invoiceNumber} Subtotal`
      });

      // Debit: Input GST (if tax applied)
      if (gst > 0) {
        journalLines.push({
          accountCode: '2100-GST-INPUT',
          accountName: 'GST Input Tax Receivable',
          debit: gst,
          credit: 0,
          description: `Input GST for Invoice ${invoice.invoiceNumber}`
        });
      }

      // Credit: Accounts Payable
      journalLines.push({
        accountCode: '2000-ACCOUNTS-PAYABLE',
        accountName: 'Accounts Payable',
        debit: 0,
        credit: total,
        description: `Payable for Invoice ${invoice.invoiceNumber}`
      });

      // Post General Ledger Journal atomically
      const journal = await JournalPostingService.postJournal({
        tenantId,
        entryDate: entryDateStr,
        reference: invoice.invoiceNumber,
        description: `Purchase Invoice Posting: ${invoice.invoiceNumber}`,
        lines: journalLines
      }, tx);

      // Transition invoice status to POSTED
      const updatedInvoice = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: 'POSTED'
        },
        include: { lines: true, fieldEvidences: true }
      });

      return {
        invoice: updatedInvoice,
        journal
      };
    };

    if ('$transaction' in db && typeof (db as any).$transaction === 'function') {
      return await (db as PrismaClient).$transaction(async tx => execute(tx), { maxWait: 10000, timeout: 20000 });
    } else {
      return await execute(db as Prisma.TransactionClient);
    }
  }

  /**
   * Reject an invoice.
   */
  public static async rejectInvoice(
    tenantId: string,
    invoiceId: string,
    rejectedBy: string,
    reason: string,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ) {
    const invoice = await db.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'REJECTED'
      },
      include: { lines: true, fieldEvidences: true }
    });

    return invoice;
  }

  /**
   * Fetch an invoice with full evidence hierarchy.
   */
  public static async getInvoiceWithEvidence(
    tenantId: string,
    invoiceId: string,
    db: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ) {
    return await db.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      include: {
        document: {
          include: {
            versions: true
          }
        },
        lines: {
          orderBy: { lineNumber: 'asc' }
        },
        fieldEvidences: {
          orderBy: { fieldName: 'asc' }
        }
      }
    });
  }
}
