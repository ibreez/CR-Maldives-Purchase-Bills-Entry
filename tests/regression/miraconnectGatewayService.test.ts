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

describe('Phase 15 - MIRAconnect API Payload & Webhook Gateway Integration Tests', () => {

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

  test('prepareSubmissionPayload generates valid JSON, attaching an accurate SHA-256 checksum', () => {
    const payload = prepareSubmissionPayload('MIRA604', sampleMira604, sampleTin);

    expect(payload.returnType).toBe('MIRA604');
    expect(payload.tin).toBe(sampleTin);
    expect(payload.taxYear).toBe(2026);
    expect(payload.submissionId).toMatch(/^SUB-MIRA604-1000200300-/);

    // Verify valid JSON
    const parsedData = JSON.parse(payload.payloadJson);
    expect(parsedData.sectionA_TaxpayerInfo.taxpayerName).toBe('Male Enterprise Pvt Ltd');

    // Verify accurate SHA-256 checksum
    const expectedChecksum = computePayloadChecksum(payload.payloadJson);
    expect(payload.checksumHash).toBe(expectedChecksum);
    expect(payload.checksumHash).toMatch(/^[a-f0-9]{64}$/);
  });

  test('submitTaxReturn handles success responses and captures error arrays on rejection', async () => {
    // 1. Successful submission
    const validPayload = prepareSubmissionPayload('MIRA105', sampleMira105, sampleTin);
    const successResponse = await submitTaxReturn(validPayload);

    expect(successResponse.status).toBe('SUBMITTED');
    expect(successResponse.submissionId).toBe(validPayload.submissionId);
    expect(successResponse.miraReferenceNumber).toContain('MIRA-REF-MIRA105-2026-');
    expect(successResponse.acknowledgmentReceiptUrl).toContain(`https://miraconnect.mira.gov.mv/receipts/${validPayload.submissionId}`);
    expect(successResponse.errors).toHaveLength(0);

    // Verify stored state
    const storedStatus = getSubmissionStatus(validPayload.submissionId);
    expect(storedStatus?.status).toBe('SUBMITTED');

    // 2. Rejection due to tampered SHA-256 checksum
    const tamperedPayload = {
      ...validPayload,
      checksumHash: 'f'.repeat(64)
    };

    const rejectedResponse = await submitTaxReturn(tamperedPayload);
    expect(rejectedResponse.status).toBe('REJECTED');
    expect(rejectedResponse.errors.length).toBeGreaterThan(0);
    expect(rejectedResponse.errors[0]).toContain('Data integrity check failed: SHA-256 checksum mismatch');
  });

  test('processWebhookNotification validates HMAC signatures and correctly updates filing status (ACCEPTED/REJECTED)', async () => {
    const payload = prepareSubmissionPayload('MIRA302', sampleMira302, sampleTin);
    await submitTaxReturn(payload);

    const eventId = 'EVT-WEBHOOK-2026-001';
    const timestamp = new Date().toISOString();

    // Test ACCEPTED status webhook
    const acceptedStatus = 'ACCEPTED';
    const validSignature = generateWebhookSignature(
      eventId,
      payload.submissionId,
      acceptedStatus,
      timestamp,
      secretKey
    );

    const webhookPayload: WebhookPayload = {
      eventId,
      submissionId: payload.submissionId,
      status: acceptedStatus,
      timestamp,
      signature: validSignature
    };

    const result = processWebhookNotification(webhookPayload, secretKey);

    expect(result.success).toBe(true);
    expect(result.updatedStatus).toBe('ACCEPTED');

    const updatedSubmission = getSubmissionStatus(payload.submissionId);
    expect(updatedSubmission?.status).toBe('ACCEPTED');

    // Test REJECTED status webhook
    const rejectedStatus = 'REJECTED';
    const rejectedSignature = generateWebhookSignature(
      'EVT-WEBHOOK-2026-002',
      payload.submissionId,
      rejectedStatus,
      timestamp,
      secretKey
    );

    const rejectedWebhookPayload: WebhookPayload = {
      eventId: 'EVT-WEBHOOK-2026-002',
      submissionId: payload.submissionId,
      status: rejectedStatus,
      timestamp,
      signature: rejectedSignature
    };

    const resultRejected = processWebhookNotification(rejectedWebhookPayload, secretKey);
    expect(resultRejected.success).toBe(true);
    expect(resultRejected.updatedStatus).toBe('REJECTED');

    const updatedSubmissionRejected = getSubmissionStatus(payload.submissionId);
    expect(updatedSubmissionRejected?.status).toBe('REJECTED');
  });

  test('Invalid HMAC signatures raise an unauthorized webhook error', () => {
    const payload = prepareSubmissionPayload('MIRA604', sampleMira604, sampleTin);

    const spoofedWebhookPayload: WebhookPayload = {
      eventId: 'EVT-SPOOFED-99',
      submissionId: payload.submissionId,
      status: 'ACCEPTED',
      timestamp: new Date().toISOString(),
      signature: 'invalid_forged_hmac_signature_hash'
    };

    const result = processWebhookNotification(spoofedWebhookPayload, secretKey);

    expect(result.success).toBe(false);
    expect(result.updatedStatus).toBe('REJECTED');
    expect(result.message).toContain('MIRAconnect Webhook Error: Invalid HMAC signature. Unauthorized webhook spoofing attempt blocked.');
  });

});
