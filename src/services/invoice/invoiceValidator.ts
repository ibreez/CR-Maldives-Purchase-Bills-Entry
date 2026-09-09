import {
  InvoiceValidationOutcome,
  InvoiceValidationIssue
} from '../../types/invoiceEvidence';

export interface InvoiceDataToValidate {
  invoiceNumber: string | null;
  invoiceDate: string | Date | null;
  supplierName?: string | null;
  supplierTin?: string | null;
  taxpayerTin?: string | null;
  currency?: string | null;
  taxableAmount: number | null;
  gstAmount: number | null;
  totalAmount: number | null;
  invoiceType?: string;
  lines?: Array<{
    description?: string;
    quantity?: number | null;
    unitPrice?: number | null;
    taxableAmount?: number | null;
    gstRate?: number | null;
    gstAmount?: number | null;
    totalAmount?: number | null;
  }>;
  confidences?: Record<string, number>;
}

export class InvoiceValidator {
  /**
   * Validate invoice data against MIRA compliance and double-entry arithmetic rules.
   */
  public static validate(data: InvoiceDataToValidate): InvoiceValidationOutcome {
    const issues: InvoiceValidationIssue[] = [];

    // 1. Validate Invoice Number
    if (!data.invoiceNumber || data.invoiceNumber.trim() === '') {
      issues.push({
        field: 'invoiceNumber',
        code: 'MISSING_INVOICE_NUMBER',
        message: 'Invoice number is required.',
        severity: 'ERROR'
      });
    }

    // 2. Validate Invoice Date
    if (!data.invoiceDate) {
      issues.push({
        field: 'invoiceDate',
        code: 'MISSING_INVOICE_DATE',
        message: 'Invoice date is required.',
        severity: 'ERROR'
      });
    } else {
      const parsedDate = new Date(data.invoiceDate);
      if (isNaN(parsedDate.getTime())) {
        issues.push({
          field: 'invoiceDate',
          code: 'INVALID_INVOICE_DATE_FORMAT',
          message: 'Invoice date is not a valid date format.',
          severity: 'ERROR'
        });
      } else {
        const futureLimit = new Date();
        futureLimit.setDate(futureLimit.getDate() + 1); // allow today + buffer for timezone
        if (parsedDate > futureLimit) {
          issues.push({
            field: 'invoiceDate',
            code: 'FUTURE_INVOICE_DATE',
            message: 'Invoice date cannot be in the future.',
            severity: 'ERROR'
          });
        }
      }
    }

    // 3. Validate Supplier
    if (!data.supplierName || data.supplierName.trim() === '') {
      issues.push({
        field: 'supplierName',
        code: 'MISSING_SUPPLIER_NAME',
        message: 'Supplier name is required for purchase invoices.',
        severity: 'ERROR'
      });
    }

    // 4. Validate Supplier TIN where applicable
    if (data.supplierTin && data.supplierTin.trim() !== '') {
      const cleanTin = data.supplierTin.trim().toUpperCase();
      // Maldivian TIN pattern: 7 digits + GST/BPT + 3 digits (e.g. 1000000GST001) or 7-8 numeric
      const isValidMaldivianTin = /^[0-9]{7}[A-Z]{3}[0-9]{3}$/.test(cleanTin) || /^[0-9]{7,10}$/.test(cleanTin);
      
      if (!isValidMaldivianTin) {
        issues.push({
          field: 'supplierTin',
          code: 'INVALID_TIN_FORMAT',
          message: `Supplier TIN '${data.supplierTin}' does not match standard MIRA format.`,
          severity: 'WARNING'
        });
      }

      if (data.taxpayerTin && cleanTin === data.taxpayerTin.trim().toUpperCase()) {
        issues.push({
          field: 'supplierTin',
          code: 'SUPPLIER_TIN_MATCHES_BUYER',
          message: 'Supplier TIN matches the taxpayer/buyer TIN. This is likely an extraction error.',
          severity: 'ERROR'
        });
      }
    }

    // 5. Validate Currency
    const currency = (data.currency || 'MVR').trim().toUpperCase();
    if (!['MVR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'LKR', 'INR'].includes(currency)) {
      issues.push({
        field: 'currency',
        code: 'UNSUPPORTED_CURRENCY',
        message: `Currency '${data.currency}' is unrecognized or unsupported.`,
        severity: 'WARNING'
      });
    }

    // 6. Subtotal check
    const statedSubtotal = data.taxableAmount !== null && data.taxableAmount !== undefined ? Number(data.taxableAmount) : null;
    if (statedSubtotal === null || isNaN(statedSubtotal)) {
      issues.push({
        field: 'taxableAmount',
        code: 'MISSING_SUBTOTAL',
        message: 'Taxable subtotal amount is required.',
        severity: 'ERROR'
      });
    } else if (statedSubtotal < 0) {
      issues.push({
        field: 'taxableAmount',
        code: 'NEGATIVE_SUBTOTAL',
        message: 'Taxable amount cannot be negative on standard invoices.',
        severity: 'ERROR'
      });
    }

    // 7. GST check
    const statedGst = data.gstAmount !== null && data.gstAmount !== undefined ? Number(data.gstAmount) : 0;
    if (statedGst < 0) {
      issues.push({
        field: 'gstAmount',
        code: 'NEGATIVE_GST',
        message: 'GST amount cannot be negative.',
        severity: 'ERROR'
      });
    }

    // 8. Total check
    const statedTotal = data.totalAmount !== null && data.totalAmount !== undefined ? Number(data.totalAmount) : null;
    if (statedTotal === null || isNaN(statedTotal)) {
      issues.push({
        field: 'totalAmount',
        code: 'MISSING_TOTAL',
        message: 'Total invoice amount is required.',
        severity: 'ERROR'
      });
    } else if (statedTotal <= 0 && (statedSubtotal ?? 0) > 0) {
      issues.push({
        field: 'totalAmount',
        code: 'INVALID_TOTAL',
        message: 'Total invoice amount must be greater than zero.',
        severity: 'ERROR'
      });
    }

    // 9. Arithmetic Consistency
    const sSub = statedSubtotal ?? 0;
    const sGst = statedGst ?? 0;
    const sTot = statedTotal ?? 0;

    let computedSubtotal = sSub;
    let computedGst = sGst;
    let computedTotal = Math.round((sSub + sGst) * 100) / 100;

    // If lines are provided, verify line item aggregation
    if (data.lines && data.lines.length > 0) {
      let linesSubtotal = 0;
      let linesGst = 0;
      let linesTotal = 0;

      data.lines.forEach((line, idx) => {
        const qty = Number(line.quantity ?? 1);
        const price = Number(line.unitPrice ?? 0);
        const lSub = line.taxableAmount !== null && line.taxableAmount !== undefined ? Number(line.taxableAmount) : qty * price;
        const lGst = line.gstAmount !== null && line.gstAmount !== undefined ? Number(line.gstAmount) : 0;
        const lTot = line.totalAmount !== null && line.totalAmount !== undefined ? Number(line.totalAmount) : lSub + lGst;

        linesSubtotal += lSub;
        linesGst += lGst;
        linesTotal += lTot;

        // Check line level math
        if (price > 0 && qty > 0) {
          const expectedLineSub = Math.round(qty * price * 100) / 100;
          if (Math.abs(expectedLineSub - lSub) > 0.1) {
            issues.push({
              field: `lines[${idx}]`,
              code: 'LINE_ARITHMETIC_MISMATCH',
              message: `Line #${idx + 1} (${line.description || 'Item'}) subtotal ${lSub} differs from quantity × unit price (${qty} × ${price} = ${expectedLineSub}).`,
              severity: 'WARNING'
            });
          }
        }
      });

      computedSubtotal = Math.round(linesSubtotal * 100) / 100;
      computedGst = Math.round(linesGst * 100) / 100;
      computedTotal = Math.round(linesTotal * 100) / 100;

      if (statedSubtotal !== null && Math.abs(computedSubtotal - sSub) > 0.05) {
        issues.push({
          field: 'taxableAmount',
          code: 'LINES_SUBTOTAL_MISMATCH',
          message: `Sum of line item subtotals (${computedSubtotal}) does not equal stated subtotal (${sSub}).`,
          severity: 'ERROR'
        });
      }
    }

    const discrepancy = Math.abs(Math.round(((sSub + sGst) - sTot) * 100) / 100);
    const arithmeticPassed = discrepancy <= 0.05; // 5 laari rounding tolerance

    if (!arithmeticPassed && statedSubtotal !== null && statedTotal !== null) {
      issues.push({
        field: 'totalAmount',
        code: 'ARITHMETIC_INCONSISTENCY',
        message: `Arithmetic inconsistency: Subtotal (${sSub}) + GST (${sGst}) = ${(sSub + sGst).toFixed(2)}, but total is stated as ${sTot.toFixed(2)} (Discrepancy: ${discrepancy}).`,
        severity: 'ERROR'
      });
    }

    // Check low-confidence extractions
    if (data.confidences) {
      for (const [field, conf] of Object.entries(data.confidences)) {
        if (conf < 80) {
          issues.push({
            field,
            code: 'LOW_CONFIDENCE_EXTRACTION',
            message: `Field '${field}' has low OCR confidence (${conf}%). Review is required.`,
            severity: 'WARNING'
          });
        }
      }
    }

    const hasErrors = issues.some(i => i.severity === 'ERROR');
    const isValid = !hasErrors && arithmeticPassed;
    const canApprove = isValid;
    const canPost = isValid && statedTotal !== null && statedTotal > 0;

    return {
      isValid,
      canApprove,
      canPost,
      issues,
      arithmeticCheck: {
        passed: arithmeticPassed,
        computedSubtotal,
        computedGst,
        computedTotal,
        statedSubtotal: sSub,
        statedGst: sGst,
        statedTotal: sTot,
        discrepancyAmount: discrepancy
      }
    };
  }
}
