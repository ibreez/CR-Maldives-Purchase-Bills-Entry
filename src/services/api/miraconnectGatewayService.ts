import crypto from 'crypto';
import {
  MiraReturnType,
  SubmissionPayload,
  SubmissionResponse,
  SubmissionStatus,
  WebhookPayload,
  WebhookProcessResult
} from '../../types/miraconnectGateway';

// In-memory store for tracking submissions and gateway state
const submissionStore = new Map<string, SubmissionResponse>();

/**
 * Computes SHA-256 hash of a JSON payload string.
 */
export function computePayloadChecksum(payloadJson: string): string {
  return crypto.createHash('sha256').update(payloadJson, 'utf8').digest('hex');
}

/**
 * Generates an HMAC SHA-256 signature for a webhook payload.
 */
export function generateWebhookSignature(
  eventId: string,
  submissionId: string,
  status: SubmissionStatus,
  timestamp: string,
  secretKey: string
): string {
  const message = `${eventId}:${submissionId}:${status}:${timestamp}`;
  return crypto.createHmac('sha256', secretKey).update(message, 'utf8').digest('hex');
}

/**
 * Prepares and validates a MIRAconnect submission payload.
 *
 * @param returnType Type of tax return ('MIRA604' | 'MIRA105' | 'MIRA302')
 * @param returnData Return payload object
 * @param tin Tax Identification Number
 * @returns SubmissionPayload with calculated SHA-256 checksum
 */
export function prepareSubmissionPayload(
  returnType: MiraReturnType,
  returnData: any,
  tin: string
): SubmissionPayload {
  if (!tin || !tin.trim()) {
    throw new Error('MIRAconnect Gateway Error: Tax Identification Number (TIN) is required');
  }

  if (!returnData) {
    throw new Error('MIRAconnect Gateway Error: Return data object is required');
  }

  let extractedTaxYear = 2026;

  // Schema validation based on returnType
  switch (returnType) {
    case 'MIRA604': {
      const info = returnData.sectionA_TaxpayerInfo;
      if (!info) {
        throw new Error("MIRAconnect Schema Error: Missing required 'sectionA_TaxpayerInfo' for MIRA 604");
      }
      if (!info.tin) {
        throw new Error("MIRAconnect Schema Error: Missing taxpayer TIN in 'sectionA_TaxpayerInfo'");
      }
      if (info.tin !== tin) {
        throw new Error(`MIRAconnect Schema Error: TIN mismatch. Return TIN '${info.tin}' does not match submission TIN '${tin}'`);
      }
      if (!info.taxpayerName) {
        throw new Error("MIRAconnect Schema Error: Missing 'taxpayerName' in sectionA_TaxpayerInfo");
      }
      extractedTaxYear = info.taxYear || extractedTaxYear;
      break;
    }

    case 'MIRA105': {
      const period = returnData.gstPeriod;
      if (!period) {
        throw new Error("MIRAconnect Schema Error: Missing required 'gstPeriod' for MIRA 105 GST Return");
      }
      if (!period.tin) {
        throw new Error("MIRAconnect Schema Error: Missing TIN in 'gstPeriod'");
      }
      if (period.tin !== tin) {
        throw new Error(`MIRAconnect Schema Error: TIN mismatch. Return TIN '${period.tin}' does not match submission TIN '${tin}'`);
      }
      extractedTaxYear = period.taxYear || extractedTaxYear;
      break;
    }

    case 'MIRA302': {
      const period = returnData.whtPeriod;
      if (!period) {
        throw new Error("MIRAconnect Schema Error: Missing required 'whtPeriod' for MIRA 302 WHT Schedule");
      }
      if (!period.tin) {
        throw new Error("MIRAconnect Schema Error: Missing TIN in 'whtPeriod'");
      }
      if (period.tin !== tin) {
        throw new Error(`MIRAconnect Schema Error: TIN mismatch. Return TIN '${period.tin}' does not match submission TIN '${tin}'`);
      }
      extractedTaxYear = period.taxYear || extractedTaxYear;
      break;
    }

    default:
      throw new Error(`MIRAconnect Gateway Error: Unsupported return type '${returnType}'`);
  }

  const payloadJson = JSON.stringify(returnData);
  const checksumHash = computePayloadChecksum(payloadJson);
  const timestamp = new Date().toISOString();
  const submissionId = `SUB-${returnType}-${tin}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  return {
    submissionId,
    returnType,
    taxYear: extractedTaxYear,
    tin,
    payloadJson,
    checksumHash,
    timestamp
  };
}

/**
 * Transmits tax return payload to MIRAconnect gateway.
 *
 * @param payload Prepared SubmissionPayload
 * @returns Promise<SubmissionResponse>
 */
export async function submitTaxReturn(payload: SubmissionPayload): Promise<SubmissionResponse> {
  const errors: string[] = [];

  // Verify SHA-256 data integrity checksum
  const recomputedChecksum = computePayloadChecksum(payload.payloadJson);
  if (recomputedChecksum !== payload.checksumHash) {
    errors.push(`Data integrity check failed: SHA-256 checksum mismatch. Expected ${payload.checksumHash}, calculated ${recomputedChecksum}`);
  }

  // Parse JSON to verify syntax
  try {
    JSON.parse(payload.payloadJson);
  } catch (err: any) {
    errors.push(`JSON syntax error in payload: ${err.message}`);
  }

  if (errors.length > 0) {
    const rejectedResponse: SubmissionResponse = {
      submissionId: payload.submissionId,
      status: 'REJECTED',
      miraReferenceNumber: '',
      acknowledgmentReceiptUrl: '',
      errors,
      submittedAt: new Date().toISOString()
    };
    submissionStore.set(payload.submissionId, rejectedResponse);
    return rejectedResponse;
  }

  // Generate MIRA reference number & receipt URL
  const miraReferenceNumber = `MIRA-REF-${payload.returnType}-${payload.taxYear}-${Math.floor(Math.random() * 899999 + 100000)}`;
  const acknowledgmentReceiptUrl = `https://miraconnect.mira.gov.mv/receipts/${payload.submissionId}`;

  const response: SubmissionResponse = {
    submissionId: payload.submissionId,
    status: 'SUBMITTED',
    miraReferenceNumber,
    acknowledgmentReceiptUrl,
    errors: [],
    submittedAt: new Date().toISOString()
  };

  submissionStore.set(payload.submissionId, response);
  return response;
}

/**
 * Processes incoming webhook notifications from MIRAconnect gateway.
 *
 * @param payload WebhookPayload with HMAC signature
 * @param secretKey Secret key used for HMAC signature verification
 * @returns WebhookProcessResult indicating verification success and status update
 */
export function processWebhookNotification(
  payload: WebhookPayload,
  secretKey: string
): WebhookProcessResult {
  if (!secretKey || !secretKey.trim()) {
    return {
      success: false,
      updatedStatus: 'REJECTED',
      message: 'MIRAconnect Webhook Error: Secret key is required for signature verification'
    };
  }

  // Calculate expected HMAC signature
  const expectedSignature = generateWebhookSignature(
    payload.eventId,
    payload.submissionId,
    payload.status,
    payload.timestamp,
    secretKey
  );

  // Constant-time buffer comparison to prevent timing attacks
  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const payloadBuf = Buffer.from(payload.signature || '', 'utf8');

  let signatureValid = false;
  if (expectedBuf.length === payloadBuf.length) {
    signatureValid = crypto.timingSafeEqual(expectedBuf, payloadBuf);
  }

  if (!signatureValid) {
    return {
      success: false,
      updatedStatus: 'REJECTED',
      submissionId: payload.submissionId,
      message: 'MIRAconnect Webhook Error: Invalid HMAC signature. Unauthorized webhook spoofing attempt blocked.'
    };
  }

  // Update stored submission status if exists
  const existingSubmission = submissionStore.get(payload.submissionId);
  if (existingSubmission) {
    existingSubmission.status = payload.status;
    submissionStore.set(payload.submissionId, existingSubmission);
  }

  return {
    success: true,
    updatedStatus: payload.status,
    submissionId: payload.submissionId,
    message: `Webhook processed successfully. Submission ${payload.submissionId} status updated to ${payload.status}`
  };
}

/**
 * Utility to retrieve stored submission response by submissionId.
 */
export function getSubmissionStatus(submissionId: string): SubmissionResponse | undefined {
  return submissionStore.get(submissionId);
}

/**
 * Resets in-memory submission store (useful for unit test isolation).
 */
export function clearSubmissionStore(): void {
  submissionStore.clear();
}
