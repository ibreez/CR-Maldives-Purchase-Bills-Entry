export type MiraReturnType = 'MIRA604' | 'MIRA105' | 'MIRA302';

export type SubmissionStatus = 'SUBMITTED' | 'PROCESSING' | 'ACCEPTED' | 'REJECTED';

export interface SubmissionPayload {
  submissionId: string;
  returnType: MiraReturnType;
  taxYear: number;
  tin: string;
  payloadJson: string;
  checksumHash: string;
  timestamp: string;
}

export interface SubmissionResponse {
  submissionId: string;
  status: SubmissionStatus;
  miraReferenceNumber: string;
  acknowledgmentReceiptUrl: string;
  errors: string[];
  submittedAt?: string;
}

export interface WebhookPayload {
  eventId: string;
  submissionId: string;
  status: SubmissionStatus;
  timestamp: string;
  signature: string;
  message?: string;
}

export interface WebhookProcessResult {
  success: boolean;
  updatedStatus: SubmissionStatus | string;
  message?: string;
  submissionId?: string;
}
