import { describe, test, expect, beforeEach } from 'vitest';
import {
  prepareSubmissionPayload,
  submitTaxReturn,
  processWebhookNotification,
  generateWebhookSignature,
  getSubmissionStatus,
  clearSubmissionStore,
  computePayloadChecksum
} from '../../src/services/api/miraconnectGatewayService';
import { Mira604TaxReturn } from '../../src/types/mira604';
import { Mira105GstReturn } from '../../src/types/mira105';
import { Mira302WhtReturn } from '../../src/types/mira302';
import { WebhookPayload } from '../../src/types/miraconnectGateway';

describe('Phase 15 - MIRAconnect Gateway Service Tests', () => {

  const sampleTin = '1000200300';
  const secretKey = 'mira_webhook_secret_key_2026';

  const sampleMira604: Mira604TaxReturn = {
    formId: 'MIRA604-2026-1000200300',
    formVersion: 'V25.1',
    submissionStatus: 'READY_FOR_FILING',
    generatedAt: '2026-12-31T10:00:00Z',
    sectionA_TaxpayerInfo: {
      tin: sampleTin,
      taxpayerName: 'Male Enterprise Pvt Ltd',
      entityType: 'COMPANY',
      taxYear: 2026,
      accountingPeriodStart: '2026-01-01',
      accountingPeriodEnd: '2026-12-31'
    },
    sectionB_Schedule1PnL: {
      grossRevenue: 500000,
      costOfSales: 100000,
      grossProfit: 400000,
      otherIncome: 0,
      operatingExpenses: 150000,
      accountingProfitBeforeTax: 250000
    },
    sectionC_TaxAdjustments: {
      itemizedAddBacks: [],
      totalAddBacks: 10000,
      itemizedDeductions: [],
      totalDeductions: 0,
      netTaxAdjustments: 10000
    },
    sectionD_CapitalAllowances: {
      totalClaimableCapitalAllowance: 20000
    },
    sectionE_TaxableIncomeLoss: {
      adjustedTaxableProfitBeforeLoss: 240000,
      priorUnabsorbedLosses: 0,
      lossCarriedForwardApplied: 0,
      remainingUnabsorbedLoss: 0,
      netTaxableIncome: 240000,
      isTaxLoss: false,
      taxLossAmount: 0
    },
    sectionF_TaxComputation: {
      taxByBracket: [],
      totalTaxPayable: 36000,
      advanceTaxPaid: 10000,
      interimTaxPaid: 0,
      withholdingTaxDeducted: 0,
      totalPrepayments: 10000,
      netTaxDueOrRefundable: 26000,
      effectiveTaxRate: 15
    }
  };

  const sampleMira105: Mira105GstReturn = {
    formId: 'MIRA105-2026-M06-1000200300',
    formVersion: 'V25.1',
    submissionStatus: 'READY_FOR_FILING',
    generatedAt: '2026-12-31T10:00:00Z',
    verificationChecksum: 'CHK-105',
    gstPeriod: {
      periodId: '2026-M06',
      taxpayerName: 'Male Enterprise Pvt Ltd',
      tin: sampleTin,
      regime: 'GENERAL_GST',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      taxYear: 2026
    },
    outputSales: {
      box1_StandardRatedSales: 100000,
      box2_ZeroRatedSales: 0,
      box3_ExemptSales: 0,
      totalOutputSales: 100000,
      box4_OutputGstCollected: 8000
    },
    inputPurchases: {
      box5_TotalPurchases: 50000,
      box6_TaxablePurchases: 50000,
      box7_GrossInputGstPaid: 4000,
      box8_ClaimableInputGst: 4000,
      nonClaimableInputGst: 0,
      proRataClaimableRatio: 1.0,
      proRataAdjustmentAmount: 0
    },
    capitalPurchases: {
      box10_CapitalPurchasesAmount: 0,
      box10_CapitalPurchasesInputGst: 0
    },
    box9_NetGstPayableOrRefundable: 4000
  };

  const sampleMira302: Mira302WhtReturn = {
    formId: 'MIRA302-2026-M01-1000200300',
    formVersion: 'V25.1',
    submissionStatus: 'READY_FOR_FILING',
    generatedAt: '2026-12-31T10:00:00Z',
    whtPeriod: {
      periodId: '2026-M01',
      taxpayerName: 'Male Enterprise Pvt Ltd',
      tin: sampleTin,
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      taxYear: 2026
    },
    scheduleOfPayments: [],
    totalGrossPayments: 10000,
    totalWhtWithheld: 1000,
    totalNetPayments: 9000,
    itemCount: 1,
    verificationChecksum: 'CHK-302'
  };

  beforeEach(() => {
    clearSubmissionStore();
  });

  test('Requirement 1: prepareSubmissionPayload validates JSON and computes SHA-256 checksum hash', () => {
    const payload = prepareSubmissionPayload('MIRA604', sampleMira604, sampleTin);

    expect(payload.returnType).toBe('MIRA604');
    expect(payload.tin).toBe(sampleTin);
    expect(payload.taxYear).toBe(2026);
    expect(payload.submissionId).toContain('SUB-MIRA604-1000200300');
    expect(payload.payloadJson).toContain('Male Enterprise Pvt Ltd');

    // SHA-256 hash format check
    expect(payload.checksumHash).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.checksumHash).toBe(computePayloadChecksum(payload.payloadJson));
  });

  test('Requirement 2: prepareSubmissionPayload validates GST MIRA105 and WHT MIRA302 returns', () => {
    const payload105 = prepareSubmissionPayload('MIRA105', sampleMira105, sampleTin);
    expect(payload105.returnType).toBe('MIRA105');
    expect(payload105.checksumHash).toMatch(/^[a-f0-9]{64}$/);

    const payload302 = prepareSubmissionPayload('MIRA302', sampleMira302, sampleTin);
    expect(payload302.returnType).toBe('MIRA302');
    expect(payload302.checksumHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('Requirement 3: prepareSubmissionPayload throws schema errors on missing required fields or TIN mismatch', () => {
    expect(() => prepareSubmissionPayload('MIRA604', {}, sampleTin)).toThrow("Missing required 'sectionA_TaxpayerInfo'");

    expect(() => prepareSubmissionPayload('MIRA604', { sectionA_TaxpayerInfo: { tin: '9999999999' } }, sampleTin)).toThrow('TIN mismatch');

    expect(() => prepareSubmissionPayload('MIRA105', {}, sampleTin)).toThrow("Missing required 'gstPeriod'");

    expect(() => prepareSubmissionPayload('MIRA302', {}, sampleTin)).toThrow("Missing required 'whtPeriod'");
  });

  test('Requirement 4: submitTaxReturn returns SUBMITTED status with MIRA reference and acknowledgment receipt URL', async () => {
    const payload = prepareSubmissionPayload('MIRA604', sampleMira604, sampleTin);
    const response = await submitTaxReturn(payload);

    expect(response.status).toBe('SUBMITTED');
    expect(response.miraReferenceNumber).toContain('MIRA-REF-MIRA604-2026');
    expect(response.acknowledgmentReceiptUrl).toContain(`https://miraconnect.mira.gov.mv/receipts/${payload.submissionId}`);
    expect(response.errors).toHaveLength(0);

    const storedStatus = getSubmissionStatus(payload.submissionId);
    expect(storedStatus?.status).toBe('SUBMITTED');
  });

  test('Requirement 5: submitTaxReturn rejects payload if SHA-256 checksum hash is tampered with', async () => {
    const payload = prepareSubmissionPayload('MIRA604', sampleMira604, sampleTin);

    // Tamper payload checksum
    const tamperedPayload = {
      ...payload,
      checksumHash: '0000000000000000000000000000000000000000000000000000000000000000'
    };

    const response = await submitTaxReturn(tamperedPayload);

    expect(response.status).toBe('REJECTED');
    expect(response.errors.some((e) => e.includes('SHA-256 checksum mismatch'))).toBe(true);
  });

  test('Requirement 6: processWebhookNotification verifies HMAC signature and updates return status', async () => {
    const payload = prepareSubmissionPayload('MIRA604', sampleMira604, sampleTin);
    await submitTaxReturn(payload);

    const eventId = 'EVT-WEBHOOK-9988';
    const timestamp = new Date().toISOString();
    const newStatus = 'ACCEPTED';

    const signature = generateWebhookSignature(eventId, payload.submissionId, newStatus, timestamp, secretKey);

    const webhookPayload: WebhookPayload = {
      eventId,
      submissionId: payload.submissionId,
      status: newStatus,
      timestamp,
      signature
    };

    const result = processWebhookNotification(webhookPayload, secretKey);

    expect(result.success).toBe(true);
    expect(result.updatedStatus).toBe('ACCEPTED');

    const updatedSubmission = getSubmissionStatus(payload.submissionId);
    expect(updatedSubmission?.status).toBe('ACCEPTED');
  });

  test('Requirement 7: processWebhookNotification rejects unauthorized webhooks with invalid signature (anti-spoofing)', async () => {
    const payload = prepareSubmissionPayload('MIRA604', sampleMira604, sampleTin);
    await submitTaxReturn(payload);

    const webhookPayload: WebhookPayload = {
      eventId: 'EVT-SPOOF-001',
      submissionId: payload.submissionId,
      status: 'ACCEPTED',
      timestamp: new Date().toISOString(),
      signature: 'invalid_forged_hmac_signature'
    };

    const result = processWebhookNotification(webhookPayload, secretKey);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Unauthorized webhook spoofing attempt blocked');

    // Status should remain SUBMITTED
    const unchangedSubmission = getSubmissionStatus(payload.submissionId);
    expect(unchangedSubmission?.status).toBe('SUBMITTED');
  });

});
