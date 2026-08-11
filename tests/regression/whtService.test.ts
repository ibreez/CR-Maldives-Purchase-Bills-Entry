import { describe, test, expect } from 'vitest';
import {
  classifyWhtCategory,
  calculateTransactionWht,
  generateMira302Return,
  exportMira302Json
} from '../../src/services/wht/whtService';
import { WhtPeriod, NonResidentPayee } from '../../src/types/mira302';
import { TransactionRecord } from '../../src/types/taxEngine';

describe('Phase 10 - Non-Resident Withholding Tax (WHT) & MIRA 302 Return Engine Tests', () => {

  const samplePeriod: WhtPeriod = {
    periodId: '2026-M01',
    taxpayerName: 'Male Enterprise Pvt Ltd',
    tin: '1000200300',
    periodStart: '2026-01-01',
    periodEnd: '2026-01-31',
    taxYear: 2026
  };

  const awsTransaction: TransactionRecord = {
    transactionId: 'TX-2026-AWS-001',
    sourceType: 'bill',
    sourceId: 'AWS-INV-101',
    entityId: 'COMPANY-001',
    outletId: 'OUTLET-001',
    transactionDate: '2026-01-15',
    description: 'AWS Cloud Hosting and Server Infrastructure',
    accountingCategory: 'operating.software_cloud',
    miraCategory: 'other_expenses',
    amount: 10000,
    gstAmount: 0,
    totalAmount: 10000,
    accountingTreatment: 'EXPENSE',
    incomeTaxTreatment: 'DEDUCTIBLE',
    gstTreatment: 'NO_INPUT_TAX',
    taxYear: 2026,
    accountingPeriodStart: '2026-01-01',
    accountingPeriodEnd: '2026-12-31',
    reviewStatus: 'APPROVED',
    auditHistory: [],
    createdAt: '2026-01-15T10:00:00Z'
  };

  const adobeTransaction: TransactionRecord = {
    transactionId: 'TX-2026-ADOBE-002',
    sourceType: 'bill',
    sourceId: 'ADOBE-990',
    entityId: 'COMPANY-001',
    outletId: 'OUTLET-001',
    transactionDate: '2026-01-20',
    description: 'Adobe Creative Cloud Enterprise Software Licenses',
    accountingCategory: 'operating.software_licenses',
    miraCategory: 'other_expenses',
    amount: 5000,
    gstAmount: 0,
    totalAmount: 5000,
    accountingTreatment: 'EXPENSE',
    incomeTaxTreatment: 'DEDUCTIBLE',
    gstTreatment: 'NO_INPUT_TAX',
    taxYear: 2026,
    accountingPeriodStart: '2026-01-01',
    accountingPeriodEnd: '2026-12-31',
    reviewStatus: 'APPROVED',
    auditHistory: [],
    createdAt: '2026-01-20T10:00:00Z'
  };

  const consultantTransaction: TransactionRecord = {
    transactionId: 'TX-2026-CONSULT-003',
    sourceType: 'bill',
    sourceId: 'CONSULT-88',
    entityId: 'COMPANY-001',
    outletId: 'OUTLET-001',
    transactionDate: '2026-01-25',
    description: 'Foreign IT Security Advisory Consultancy Fees',
    accountingCategory: 'operating.consultancy',
    miraCategory: 'other_expenses',
    amount: 20000,
    gstAmount: 0,
    totalAmount: 20000,
    accountingTreatment: 'EXPENSE',
    incomeTaxTreatment: 'DEDUCTIBLE',
    gstTreatment: 'NO_INPUT_TAX',
    taxYear: 2026,
    accountingPeriodStart: '2026-01-01',
    accountingPeriodEnd: '2026-12-31',
    reviewStatus: 'APPROVED',
    auditHistory: [],
    createdAt: '2026-01-25T10:00:00Z'
  };

  test('Requirement 1: Payments to foreign vendors (e.g., AWS, Adobe, foreign consultants) automatically trigger WHT withholding at the 10% statutory rate', () => {
    expect(classifyWhtCategory(awsTransaction)).toBe('ROYALTY_SOFTWARE');
    expect(classifyWhtCategory(adobeTransaction)).toBe('ROYALTY_SOFTWARE');
    expect(classifyWhtCategory(consultantTransaction)).toBe('CONSULTANCY');

    const awsWht = calculateTransactionWht(awsTransaction);
    expect(awsWht.contractedAmount).toBe(10000);
    expect(awsWht.whtRatePercentage).toBe(10);
    expect(awsWht.whtAmountWithheld).toBe(1000); // 10,000 * 10%
    expect(awsWht.netAmountPaidToVendor).toBe(9000);

    const adobeWht = calculateTransactionWht(adobeTransaction);
    expect(adobeWht.whtRatePercentage).toBe(10);
    expect(adobeWht.whtAmountWithheld).toBe(500); // 5,000 * 10%

    const consultWht = calculateTransactionWht(consultantTransaction);
    expect(consultWht.whtRatePercentage).toBe(10);
    expect(consultWht.whtAmountWithheld).toBe(2000); // 20,000 * 10%
  });

  test('Requirement 2: Valid DTAA treaty country overrides correctly apply reduced tax rates', () => {
    const treatyPayee: NonResidentPayee = {
      payeeId: 'PAYEE-SG-001',
      payeeName: 'Singapore Tech Advisory Pte Ltd',
      countryCode: 'SG',
      foreignAddress: '1 Raffles Place, Singapore',
      isDtaaReliefEligible: true,
      dtaaTreatyRate: 0.05, // 5% reduced DTAA rate
      dtaaCertificateReference: 'DTAA-SG-2026-991'
    };

    const whtResult = calculateTransactionWht(consultantTransaction, treatyPayee);

    expect(whtResult.whtRatePercentage).toBe(5);
    expect(whtResult.whtAmountWithheld).toBe(1000); // 20,000 * 5% = 1,000
    expect(whtResult.dtaaReliefApplied).toBe(true);
    expect(whtResult.dtaaCertificateRef).toBe('DTAA-SG-2026-991');

    // 0% DTAA Treaty Exemption
    const exemptPayee: NonResidentPayee = {
      ...treatyPayee,
      dtaaTreatyRate: 0.00
    };
    const zeroWhtResult = calculateTransactionWht(consultantTransaction, exemptPayee);
    expect(zeroWhtResult.whtRatePercentage).toBe(0);
    expect(zeroWhtResult.whtAmountWithheld).toBe(0);
    expect(zeroWhtResult.dtaaReliefApplied).toBe(true);
  });

  test('Requirement 3: Gross-up calculation options compute the correct grossed-up payment amount when contract specifies net-of-tax payment terms', () => {
    // Agreed Net Payment to vendor = 18,000
    // WHT Statutory Rate = 10%
    // Gross Amount = Net Payment / (1 - WHT_Rate) = 18,000 / 0.9 = 20,000
    // WHT Withheld = 20,000 * 10% = 2,000
    // Net to Vendor = 18,000
    const netContractTx: TransactionRecord = {
      ...consultantTransaction,
      amount: 18000
    };

    const grossUpResult = calculateTransactionWht(netContractTx, undefined, { isGrossedUp: true });

    expect(grossUpResult.isGrossedUp).toBe(true);
    expect(grossUpResult.contractedAmount).toBe(18000);
    expect(grossUpResult.grossPaymentAmount).toBe(20000);
    expect(grossUpResult.whtRatePercentage).toBe(10);
    expect(grossUpResult.whtAmountWithheld).toBe(2000);
    expect(grossUpResult.netAmountPaidToVendor).toBe(18000);
  });

  test('Requirement 4: MIRA 302 form outputs aggregate gross payments and net tax withheld accurately', () => {
    const transactions = [awsTransaction, adobeTransaction, consultantTransaction];

    // AWS: Gross 10,000, WHT 1,000
    // Adobe: Gross 5,000, WHT 500
    // Consultant: Gross 20,000, WHT 2,000
    // Total Gross = 35,000
    // Total WHT Withheld = 3,500
    // Total Net Payments = 31,500

    const returnObj = generateMira302Return(transactions, samplePeriod);

    expect(returnObj.formId).toBe('MIRA302-2026-2026-M01-1000200300');
    expect(returnObj.formVersion).toBe('V25.1');
    expect(returnObj.submissionStatus).toBe('READY_FOR_FILING');
    expect(returnObj.scheduleOfPayments.length).toBe(3);
    expect(returnObj.totalGrossPayments).toBe(35000);
    expect(returnObj.totalWhtWithheld).toBe(3500);
    expect(returnObj.totalNetPayments).toBe(31500);
    expect(returnObj.itemCount).toBe(3);
  });

  test('Requirement 5: exportMira302Json outputs schema-valid JSON for MIRAconnect', () => {
    const returnObj = generateMira302Return([awsTransaction, adobeTransaction], samplePeriod);
    const jsonString = exportMira302Json(returnObj);

    expect(typeof jsonString).toBe('string');
    const parsed = JSON.parse(jsonString);

    expect(parsed.formId).toBe(returnObj.formId);
    expect(parsed.formVersion).toBe('V25.1');
    expect(parsed.submissionStatus).toBe('READY_FOR_FILING');
    expect(parsed.totalGrossPayments).toBe(15000);
    expect(parsed.totalWhtWithheld).toBe(1500);
    expect(parsed.scheduleOfPayments.length).toBe(2);
    expect(parsed.verificationChecksum).toBeDefined();
  });

  test('Throws explicit validation errors for missing period or taxpayer parameters', () => {
    expect(() => {
      generateMira302Return([awsTransaction], {
        ...samplePeriod,
        tin: ''
      });
    }).toThrow(/Validation Error: Taxpayer TIN is required/i);

    expect(() => {
      generateMira302Return([awsTransaction], {
        ...samplePeriod,
        taxpayerName: ''
      });
    }).toThrow(/Validation Error: Taxpayer name is required/i);
  });

});
