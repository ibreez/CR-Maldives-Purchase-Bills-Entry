export type InvoiceLifecycleStatus =
  | 'UPLOADED'
  | 'OCR_PROCESSING'
  | 'EXTRACTED'
  | 'VALIDATION_REQUIRED'
  | 'CLASSIFICATION_REQUIRED'
  | 'ACCOUNTANT_REVIEW'
  | 'APPROVED'
  | 'POSTED'
  | 'REJECTED';

export type EvidenceSourceType =
  | 'OCR_MODEL'
  | 'USER_OVERRIDE'
  | 'AI_HEURISTIC'
  | 'RULE_ENGINE';

export interface BoundingBoxCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
  page?: number;
}

export interface StoredFieldEvidence {
  id?: string;
  fieldName: string;
  value: string | null;
  extractedValue: string | null;
  confidence: number;
  source: EvidenceSourceType;
  boundingBox?: string | BoundingBoxCoordinates | null;
  ocrModel?: string;
  ocrTimestamp?: string | Date;
  manuallyCorrected: boolean;
  correctedBy?: string | null;
  correctedAt?: string | Date | null;
  correctionReason?: string | null;
}

export interface InvoiceValidationIssue {
  field: string;
  code: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export interface InvoiceValidationOutcome {
  isValid: boolean;
  canApprove: boolean;
  canPost: boolean;
  issues: InvoiceValidationIssue[];
  arithmeticCheck: {
    passed: boolean;
    computedSubtotal: number;
    computedGst: number;
    computedTotal: number;
    statedSubtotal: number;
    statedGst: number;
    statedTotal: number;
    discrepancyAmount: number;
  };
}

export interface CreateEvidenceInvoiceDTO {
  tenantId: string;
  taxpayerId?: string;
  supplierId?: string;
  documentId?: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  invoiceNumber: string | null;
  invoiceDate: string | Date | null;
  currency?: string;
  taxableAmount: number | null;
  gstAmount: number | null;
  totalAmount: number | null;
  invoiceType?: 'PURCHASE' | 'SALES';
  status?: InvoiceLifecycleStatus;
  lines?: {
    lineNumber: number;
    description: string;
    quantity: number;
    unitPrice: number;
    taxableAmount: number;
    gstRate: number;
    gstAmount: number;
    totalAmount: number;
  }[];
  fieldEvidences?: Record<string, {
    value: any;
    extractedValue?: any;
    confidence: number;
    source?: EvidenceSourceType;
    boundingBox?: any;
    ocrModel?: string;
    ocrTimestamp?: string | Date;
  }>;
}

export interface CorrectFieldEvidenceDTO {
  invoiceId: string;
  tenantId: string;
  fieldName: string;
  newValue: string | number;
  correctedBy: string;
  correctionReason?: string;
}
