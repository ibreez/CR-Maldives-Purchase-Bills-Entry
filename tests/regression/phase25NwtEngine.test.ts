import { describe, it, expect } from 'vitest';
import {
  calculateNwt,
  resolveStatutoryNwtRate,
  determineWithholdingDate,
  calculateNwtDueDate,
  validateDtaaCertificate,
  generateMira602Return,
  reconcileNwtToGl,
  buildNwtPeriod
} from '../../src/services/wht/nwtEngineService';
import { NwtCalculationInput, WithholdingCertificateRecord } from '../../src/types/nwt';

describe('Phase 25 — Non-Resident Withholding Tax (NWT) & MIRA 602 Statutory Engine', () => {

  describe('1. Section 55 Scope & Rate Resolution via RuleResolver', () => {
    it('resolves 10% standard rate for technical services and royalties', () => {
      const techRate = resolveStatutoryNwtRate('TECHNICAL_SERVICES', '2026-01-15');
      expect(techRate.rate).toBe(0.10);
      expect(techRate.ruleId).toBe('RULE-NWT-SEC55-GENERAL-10');
      expect(techRate.legalReference).toContain('Section 55(a)');

      const royaltyRate = resolveStatutoryNwtRate('ROYALTY', '2026-01-15');
      expect(royaltyRate.rate).toBe(0.10);
      expect(royaltyRate.ruleId).toBe('RULE-NWT-SEC55-GENERAL-10');
    });

    it('resolves 5% statutory rate for non-resident contractors under Section 55(a)(10)', () => {
      const contractorRate = resolveStatutoryNwtRate('NON_RESIDENT_CONTRACTOR', '2026-01-15');
      expect(contractorRate.rate).toBe(0.05);
      expect(contractorRate.ruleId).toBe('RULE-NWT-SEC55-CONTRACTOR-5');
      expect(contractorRate.legalReference).toContain('Section 55(a)');
    });

    it('resolves 0% rate for non-NWT foreign goods purchases or exempt items', () => {
      const exemptRate = resolveStatutoryNwtRate('EXEMPT_NON_NWT', '2026-01-15');
      expect(exemptRate.rate).toBe(0.0);
      expect(exemptRate.ruleId).toBe('RULE-NWT-EXEMPT');
    });
  });

  describe('2. Withholding Point Determination (Earlier of Payment vs Payable Date)', () => {
    it('selects payable date when invoice date precedes settlement date', () => {
      const withholdingDate = determineWithholdingDate('2026-02-10', '2026-01-25');
      expect(withholdingDate).toBe('2026-01-25');
    });

    it('selects payment date when advance payment precedes invoice date', () => {
      const withholdingDate = determineWithholdingDate('2026-01-15', '2026-01-30');
      expect(withholdingDate).toBe('2026-01-15');
    });
  });

  describe('3. Residency & Permanent Establishment (PE) Rule Enforcement', () => {
    it('exempts non-resident vendor if they have a registered Permanent Establishment in Maldives', () => {
      const input: NwtCalculationInput = {
        payeeName: 'Global Marine Construction Ltd',
        payeeCountry: 'SG',
        isNonResident: true,
        hasPermanentEstablishmentInMaldives: true,
        category: 'NON_RESIDENT_CONTRACTOR',
        contractedAmount: 500000,
        payableDate: '2026-01-15'
      };

      const result = calculateNwt(input);
      expect(result.isSubjectToNwt).toBe(false);
      expect(result.effectiveRate).toBe(0.0);
      expect(result.nwtAmountWithheld).toBe(0);
      expect(result.netAmountPaid).toBe(500000);
    });

    it('exempts domestic resident vendor from Section 55 non-resident withholding', () => {
      const input: NwtCalculationInput = {
        payeeName: 'Male Engineering Services Pvt Ltd',
        payeeCountry: 'MV',
        isNonResident: false,
        category: 'TECHNICAL_SERVICES',
        contractedAmount: 80000,
        payableDate: '2026-01-15'
      };

      const result = calculateNwt(input);
      expect(result.isSubjectToNwt).toBe(false);
      expect(result.effectiveRate).toBe(0.0);
      expect(result.nwtAmountWithheld).toBe(0);
    });
  });

  describe('4. Standard 10% and 5% NWT Deduction Calculations & FX Conversion', () => {
    it('correctly calculates 10% NWT on foreign software SaaS subscription in USD with MVR conversion', () => {
      const input: NwtCalculationInput = {
        payeeName: 'Atlassian Cloud Services',
        payeeCountry: 'AU',
        isNonResident: true,
        hasPermanentEstablishmentInMaldives: false,
        category: 'ROYALTY',
        contractedAmount: 2000, // USD
        currency: 'USD',
        exchangeRate: 15.42,
        payableDate: '2026-01-05',
        paymentDate: '2026-01-15',
        isGrossedUp: false
      };

      const result = calculateNwt(input);
      expect(result.isSubjectToNwt).toBe(true);
      expect(result.statutoryRate).toBe(0.10);
      expect(result.effectiveRate).toBe(0.10);
      expect(result.grossAmount).toBe(2000);
      expect(result.grossAmountMvr).toBe(30840); // 2000 * 15.42
      expect(result.nwtAmountWithheld).toBe(200); // 10% of 2000
      expect(result.nwtAmountWithheldMvr).toBe(3084); // 200 * 15.42
      expect(result.netAmountPaid).toBe(1800);
      expect(result.netAmountPaidMvr).toBe(27756);
      expect(result.withholdingDate).toBe('2026-01-05');
      expect(result.reportingPeriod).toBe('2026-M01');
    });

    it('correctly calculates 5% NWT for non-resident contractor in MVR', () => {
      const input: NwtCalculationInput = {
        payeeName: 'Colombo Dredging & Port Services',
        payeeCountry: 'LK',
        isNonResident: true,
        hasPermanentEstablishmentInMaldives: false,
        category: 'NON_RESIDENT_CONTRACTOR',
        contractedAmount: 1000000,
        currency: 'MVR',
        exchangeRate: 1.0,
        payableDate: '2026-01-12'
      };

      const result = calculateNwt(input);
      expect(result.isSubjectToNwt).toBe(true);
      expect(result.statutoryRate).toBe(0.05);
      expect(result.effectiveRate).toBe(0.05);
      expect(result.grossAmountMvr).toBe(1000000);
      expect(result.nwtAmountWithheldMvr).toBe(50000);
      expect(result.netAmountPaidMvr).toBe(950000);
    });
  });

  describe('5. Gross-Up Calculations (Net-of-Tax Contract Terms)', () => {
    it('grosses up tax liability when non-resident contract specifies net remittance', () => {
      // Contract states payee must receive exactly $9,000 net, with 10% statutory withholding
      // Gross = 9000 / (1 - 0.10) = 10,000
      // Tax = 10,000 * 0.10 = 1,000
      const input: NwtCalculationInput = {
        payeeName: 'Global Advisory Partners UK',
        payeeCountry: 'GB',
        isNonResident: true,
        category: 'TECHNICAL_SERVICES',
        contractedAmount: 9000,
        currency: 'USD',
        exchangeRate: 15.42,
        payableDate: '2026-01-20',
        isGrossedUp: true
      };

      const result = calculateNwt(input);
      expect(result.isGrossedUp).toBe(true);
      expect(result.grossAmount).toBe(10000);
      expect(result.grossAmountMvr).toBe(154200);
      expect(result.nwtAmountWithheld).toBe(1000);
      expect(result.nwtAmountWithheldMvr).toBe(15420);
      expect(result.netAmountPaid).toBe(9000);
      expect(result.netAmountPaidMvr).toBe(138780);
    });
  });

  describe('6. Double Tax Avoidance Agreement (DTAA) Treaty Relief Verification', () => {
    const validDtaaCert: WithholdingCertificateRecord = {
      id: 'CERT-SG-001',
      certificateNumber: 'SG-IRAS-TRC-2026-99',
      payeeName: 'Singapore Maritime Engineering Pte',
      payeeCountry: 'SG',
      treatyCountry: 'Singapore',
      treatyArticle: 'Article 7 (Business Profits)',
      reducedRate: 0.0,
      issueDate: '2025-01-01',
      expiryDate: '2026-12-31',
      issuingAuthority: 'Inland Revenue Authority of Singapore',
      status: 'VERIFIED'
    };

    it('applies 0% treaty relief when valid DTAA certificate is attached', () => {
      const input: NwtCalculationInput = {
        payeeName: 'Singapore Maritime Engineering Pte',
        payeeCountry: 'SG',
        isNonResident: true,
        category: 'TECHNICAL_SERVICES',
        contractedAmount: 50000,
        currency: 'USD',
        exchangeRate: 15.42,
        payableDate: '2026-01-10',
        dtaaCertificate: validDtaaCert
      };

      const result = calculateNwt(input);
      expect(result.isDtaaReliefApplied).toBe(true);
      expect(result.statutoryRate).toBe(0.10);
      expect(result.effectiveRate).toBe(0.0);
      expect(result.nwtAmountWithheld).toBe(0);
      expect(result.nwtAmountWithheldMvr).toBe(0);
      expect(result.netAmountPaid).toBe(50000);
      expect(result.dtaaCertificateRef).toBe('SG-IRAS-TRC-2026-99');
    });

    it('rejects treaty relief if certificate has expired before withholding date', () => {
      const expiredCert: WithholdingCertificateRecord = {
        ...validDtaaCert,
        expiryDate: '2025-12-31'
      };

      const validation = validateDtaaCertificate(expiredCert, '2026-01-10');
      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('expired');

      const input: NwtCalculationInput = {
        payeeName: 'Singapore Maritime Engineering Pte',
        payeeCountry: 'SG',
        isNonResident: true,
        category: 'TECHNICAL_SERVICES',
        contractedAmount: 50000,
        payableDate: '2026-01-10',
        dtaaCertificate: expiredCert
      };

      const result = calculateNwt(input);
      expect(result.isDtaaReliefApplied).toBe(false);
      expect(result.effectiveRate).toBe(0.10); // Reverts to statutory rate
      expect(result.nwtAmountWithheld).toBe(5000);
    });
  });

  describe('7. Statutory Return Compiler (Form MIRA 602)', () => {
    it('compiles MIRA 602 with Section B category summaries, Section C payee schedule, due date, and checksum', () => {
      const period = buildNwtPeriod(2026, 1);
      expect(period.periodName).toBe('2026-M01');
      expect(period.startDate).toBe('2026-01-01');
      expect(period.endDate).toBe('2026-01-31');
      expect(period.filingDueDate).toBe('2026-02-15'); // Due on 15th of next month

      const tx1 = calculateNwt({
        payeeName: 'Oracle Cloud Services',
        payeeCountry: 'US',
        isNonResident: true,
        category: 'ROYALTY',
        contractedAmount: 10000,
        currency: 'USD',
        exchangeRate: 15.42,
        payableDate: '2026-01-10'
      });

      const tx2 = calculateNwt({
        payeeName: 'BMT Marine Surveyors UK',
        payeeCountry: 'GB',
        isNonResident: true,
        category: 'TECHNICAL_SERVICES',
        contractedAmount: 20000,
        currency: 'USD',
        exchangeRate: 15.42,
        payableDate: '2026-01-15'
      });

      const tx3 = calculateNwt({
        payeeName: 'Dredging International NV',
        payeeCountry: 'BE',
        isNonResident: true,
        category: 'NON_RESIDENT_CONTRACTOR',
        contractedAmount: 500000,
        currency: 'MVR',
        exchangeRate: 1.0,
        payableDate: '2026-01-20'
      });

      const taxpayer = {
        tin: '1000200GST001',
        businessName: 'Maldives Tourism & Logistics Holdings Pvt Ltd'
      };

      const mira602 = generateMira602Return([tx1, tx2, tx3], period, taxpayer);

      expect(mira602.formType).toBe('MIRA602');
      expect(mira602.formVersion).toBe('v25.1');
      expect(mira602.filingDueDate).toBe('2026-02-15');
      expect(mira602.status).toBe('READY_FOR_FILING');

      // Check totals
      // Gross MVR = (10000*15.42) + (20000*15.42) + 500000 = 154200 + 308400 + 500000 = 962600
      // Tax MVR = (1000*15.42) + (2000*15.42) + (500000*0.05) = 15420 + 30840 + 25000 = 71260
      expect(mira602.totalGrossPaymentsMvr).toBe(962600);
      expect(mira602.totalNwtWithheldMvr).toBe(71260);
      expect(mira602.totalTransactions).toBe(3);

      // Section B category checks
      const royaltyCat = mira602.categorySummaries.find(c => c.category === 'ROYALTY');
      expect(royaltyCat?.totalGrossAmountMvr).toBe(154200);
      expect(royaltyCat?.totalNwtWithheldMvr).toBe(15420);
      expect(royaltyCat?.transactionCount).toBe(1);

      const contractorCat = mira602.categorySummaries.find(c => c.category === 'NON_RESIDENT_CONTRACTOR');
      expect(contractorCat?.totalGrossAmountMvr).toBe(500000);
      expect(contractorCat?.totalNwtWithheldMvr).toBe(25000);
      expect(contractorCat?.transactionCount).toBe(1);

      // Section C Schedule checks
      expect(mira602.scheduleOfPayees.length).toBe(3);
      expect(mira602.scheduleOfPayees[0].payeeName).toBe('Oracle Cloud Services');
      expect(mira602.scheduleOfPayees[0].nwtWithheldMvr).toBe(15420);

      // Statutory Checksum
      expect(mira602.regulatoryTraceability.statutoryChecksum).toBeDefined();
      expect(mira602.regulatoryTraceability.statutoryChecksum.length).toBe(64); // SHA-256
    });
  });

  describe('8. NWT Subledger to GL Account 2200 Audit Reconciliation', () => {
    it('confirms 100% reconciliation when subledger matches GL Account 2200 exactly', () => {
      const period = buildNwtPeriod(2026, 1);
      const tx = calculateNwt({
        payeeName: 'Global Cloud Systems',
        payeeCountry: 'US',
        isNonResident: true,
        category: 'TECHNICAL_SERVICES',
        contractedAmount: 100000,
        currency: 'MVR',
        payableDate: '2026-01-15'
      });

      // 10% of 100,000 = 10,000 MVR
      const reconciliation = reconcileNwtToGl([tx], period, 10000);
      expect(reconciliation.isReconciled).toBe(true);
      expect(reconciliation.subledgerTotalNwtWithheld).toBe(10000);
      expect(reconciliation.glAccount2200WithholdingTaxPayableBalance).toBe(10000);
      expect(reconciliation.variance).toBe(0);
      expect(reconciliation.unreconciledItems.length).toBe(0);
    });

    it('detects variance when subledger differs from GL Account 2200 balance', () => {
      const period = buildNwtPeriod(2026, 1);
      const tx = calculateNwt({
        payeeName: 'Global Cloud Systems',
        payeeCountry: 'US',
        isNonResident: true,
        category: 'TECHNICAL_SERVICES',
        contractedAmount: 100000,
        currency: 'MVR',
        payableDate: '2026-01-15'
      });

      const reconciliation = reconcileNwtToGl([tx], period, 8000); // Discrepancy: GL has 8000 instead of 10000
      expect(reconciliation.isReconciled).toBe(false);
      expect(reconciliation.variance).toBe(2000);
      expect(reconciliation.unreconciledItems.length).toBe(1);
      expect(reconciliation.unreconciledItems[0].reason).toContain('Discrepancy');
    });
  });

});
