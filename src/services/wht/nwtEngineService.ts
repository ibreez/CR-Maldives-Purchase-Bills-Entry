import { defaultRuleResolver, RuleResolver } from '../../regulatory/resolvers/ruleResolver';
import {
  NwtCategory,
  NwtCalculationInput,
  NwtCalculation,
  NwtPeriod,
  Mira602Return,
  Mira602CategorySummary,
  Mira602PayeeScheduleItem,
  NwtReconciliation,
  WithholdingCertificateRecord
} from '../../types/nwt';
import { createHash } from 'crypto';

/**
 * Maldives Statutory Category Metadata for MIRA 602 Form
 */
export const NWT_CATEGORY_DEFINITIONS: Record<
  NwtCategory,
  { name: string; statutoryRate: number; section: string }
> = {
  RENT_IMMOVABLE_PROPERTY: {
    name: 'Rent of Immovable Property in Maldives',
    statutoryRate: 0.10,
    section: 'Section 55(a)(1)'
  },
  ROYALTY: {
    name: 'Royalty & Intellectual Property / Software Licenses',
    statutoryRate: 0.10,
    section: 'Section 55(a)(2)'
  },
  QUALIFYING_INTEREST: {
    name: 'Qualifying Interest Payments',
    statutoryRate: 0.10,
    section: 'Section 55(a)(3)'
  },
  DIVIDEND: {
    name: 'Dividends Paid to Non-Residents',
    statutoryRate: 0.10,
    section: 'Section 55(a)(4)'
  },
  TECHNICAL_SERVICES: {
    name: 'Fees for Technical, Management & Consultancy Services (FTS)',
    statutoryRate: 0.10,
    section: 'Section 55(a)(5)'
  },
  COMMISSION: {
    name: 'Commissions for Services Supplied in Maldives',
    statutoryRate: 0.10,
    section: 'Section 55(a)(6)'
  },
  PUBLIC_ENTERTAINER: {
    name: 'Public Entertainer & Artist Performances in Maldives',
    statutoryRate: 0.10,
    section: 'Section 55(a)(7)'
  },
  RESEARCH_DEVELOPMENT: {
    name: 'Research & Development (R&D) Fees',
    statutoryRate: 0.10,
    section: 'Section 55(a)(8)'
  },
  INSURANCE_PREMIUM: {
    name: 'Insurance & Reinsurance Premiums',
    statutoryRate: 0.10,
    section: 'Section 55(a)(9)'
  },
  NON_RESIDENT_CONTRACTOR: {
    name: 'Payments to Non-Resident Contractors',
    statutoryRate: 0.05,
    section: 'Section 55(a)(10)'
  },
  EXEMPT_NON_NWT: {
    name: 'Non-NWT / Goods Purchase / Resident / PE',
    statutoryRate: 0.00,
    section: 'Exempt / Not Subject to Section 55'
  }
};

/**
 * Calculates the statutory filing due date for a monthly NWT period.
 * Under Maldives Income Tax Act, MIRA 602 is due on the 15th of the month following the period.
 *
 * @param periodMonth Month (1-12)
 * @param periodYear Tax Year (e.g. 2026)
 * @returns ISO Date string for the 15th of following month (e.g., '2026-02-15')
 */
export function calculateNwtDueDate(periodYear: number, periodMonth: number): string {
  let dueMonth = periodMonth + 1;
  let dueYear = periodYear;
  if (dueMonth > 12) {
    dueMonth = 1;
    dueYear += 1;
  }
  return `${dueYear}-${String(dueMonth).padStart(2, '0')}-15`;
}

/**
 * Determines the statutory withholding date under Section 55:
 * The earlier of payment date or payable date.
 *
 * @param paymentDate ISO Date string (optional)
 * @param payableDate ISO Date string (optional)
 * @returns Withholding date (YYYY-MM-DD)
 */
export function determineWithholdingDate(paymentDate?: string, payableDate?: string): string {
  if (paymentDate && payableDate) {
    return paymentDate < payableDate ? paymentDate : payableDate;
  }
  if (paymentDate) return paymentDate;
  if (payableDate) return payableDate;
  return new Date().toISOString().split('T')[0];
}

/**
 * Resolves the statutory NWT rate for a given category and effective date using RuleResolver.
 */
export function resolveStatutoryNwtRate(
  category: NwtCategory,
  effectiveDate: string
): { rate: number; ruleId: string; legalReference: string } {
  if (category === 'EXEMPT_NON_NWT') {
    return {
      rate: 0.0,
      ruleId: 'RULE-NWT-EXEMPT',
      legalReference: 'Maldives Income Tax Act (Act No. 25/2019) Section 55 - Not Applicable'
    };
  }

  if (category === 'NON_RESIDENT_CONTRACTOR') {
    const contractorRule = defaultRuleResolver.resolveRule({
      taxType: 'NWT',
      ruleCode: 'NWT_CONTRACTOR_5',
      transactionDate: effectiveDate
    });
    const rate = Number(contractorRule?.parameters?.rate ?? 0.05);
    return {
      rate,
      ruleId: contractorRule?.ruleId || 'RULE-NWT-SEC55-CONTRACTOR-5',
      legalReference: contractorRule?.legalReference || 'Income Tax Act (Act No. 25/2019) Section 55(a)'
    };
  }

  // All other Section 55 categories are 10% standard rate
  const standardRule = defaultRuleResolver.resolveRule({
    taxType: 'NWT',
    ruleCode: 'NWT_STANDARD_10',
    transactionDate: effectiveDate
  });
  const rate = Number(standardRule?.parameters?.rate ?? 0.10);
  return {
    rate,
    ruleId: standardRule?.ruleId || 'RULE-NWT-SEC55-GENERAL-10',
    legalReference: standardRule?.legalReference || 'Income Tax Act (Act No. 25/2019) Section 55(a)'
  };
}

/**
 * Validates whether a Double Tax Avoidance Agreement (DTAA) treaty relief certificate
 * is valid for the transaction date and provides documented evidence.
 */
export function validateDtaaCertificate(
  certificate: WithholdingCertificateRecord | null | undefined,
  withholdingDate: string
): { isValid: boolean; reason?: string } {
  if (!certificate) {
    return { isValid: false, reason: 'No treaty relief certificate provided' };
  }

  if (!certificate.certificateNumber || !certificate.certificateNumber.trim()) {
    return { isValid: false, reason: 'Missing certificate reference number' };
  }

  if (!certificate.treatyCountry || !certificate.treatyCountry.trim()) {
    return { isValid: false, reason: 'Missing treaty country in certificate' };
  }

  if (certificate.status === 'REJECTED') {
    return { isValid: false, reason: 'Treaty relief certificate has been rejected by tax authority' };
  }

  if (certificate.status === 'PENDING_VERIFICATION') {
    return { isValid: false, reason: 'Treaty relief certificate is pending verification' };
  }

  if (certificate.expiryDate && certificate.expiryDate < withholdingDate) {
    return { isValid: false, reason: `Treaty certificate expired on ${certificate.expiryDate}` };
  }

  if (certificate.issueDate && certificate.issueDate > withholdingDate) {
    return { isValid: false, reason: `Treaty certificate only valid from ${certificate.issueDate}` };
  }

  return { isValid: true };
}

/**
 * Core Section 55 Non-Resident Withholding Tax Calculator
 *
 * Evaluates:
 * 1. Residency and Permanent Establishment status (do not auto-assume all foreign vendors are NWT)
 * 2. Earlier of payment date and payable date
 * 3. Dynamic statutory rate (10% vs 5% vs 0%)
 * 4. DTAA treaty relief eligibility (requires documented evidence)
 * 5. Gross-up calculations if payment terms are net-of-tax
 * 6. Currency exchange conversion to MVR
 */
export function calculateNwt(input: NwtCalculationInput): NwtCalculation {
  const contractedAmount = Math.max(0, Number(input.contractedAmount || 0));
  const currency = (input.currency || 'MVR').toUpperCase();
  const exchangeRate = Number(input.exchangeRate || 1.0);
  const withholdingDate = determineWithholdingDate(input.paymentDate, input.payableDate);
  const [yearStr, monthStr] = withholdingDate.split('-');
  const reportingPeriod = `${yearStr}-M${monthStr}`;

  const isNonResident = input.isNonResident !== false;
  const hasPeInMaldives = Boolean(input.hasPermanentEstablishmentInMaldives);

  // If resident or has PE in Maldives, or category is EXEMPT_NON_NWT, NWT does not apply
  const isSubjectToNwt = isNonResident && !hasPeInMaldives && input.category !== 'EXEMPT_NON_NWT';

  const category = isSubjectToNwt ? input.category : 'EXEMPT_NON_NWT';
  const { rate: statutoryRate, ruleId, legalReference } = resolveStatutoryNwtRate(category, withholdingDate);

  // Check DTAA treaty relief
  let effectiveRate = statutoryRate;
  let isDtaaReliefApplied = false;
  let dtaaCertificateRef: string | undefined;
  let dtaaReliefReason: string | undefined;

  if (isSubjectToNwt && input.dtaaCertificate) {
    const dtaaValidation = validateDtaaCertificate(input.dtaaCertificate, withholdingDate);
    if (dtaaValidation.isValid) {
      isDtaaReliefApplied = true;
      effectiveRate = Math.max(0, Number(input.dtaaCertificate.reducedRate || 0));
      dtaaCertificateRef = input.dtaaCertificate.certificateNumber;
      dtaaReliefReason = `DTAA Treaty Relief (${input.dtaaCertificate.treatyCountry}) applied at ${(effectiveRate * 100).toFixed(1)}%`;
    } else {
      dtaaReliefReason = `DTAA Relief Denied: ${dtaaValidation.reason}`;
    }
  }

  // Calculate gross amounts and tax withheld
  const isGrossedUp = Boolean(input.isGrossedUp);
  let grossAmount = contractedAmount;
  let nwtAmountWithheld = 0;

  if (isSubjectToNwt && effectiveRate > 0) {
    if (isGrossedUp && effectiveRate < 1.0) {
      // Gross-up: Gross = Contracted Net / (1 - Effective Rate)
      grossAmount = contractedAmount / (1 - effectiveRate);
      nwtAmountWithheld = grossAmount * effectiveRate;
    } else {
      grossAmount = contractedAmount;
      nwtAmountWithheld = grossAmount * effectiveRate;
    }
  }

  const netAmountPaid = grossAmount - nwtAmountWithheld;

  // MVR conversions
  const grossAmountMvr = Math.round(grossAmount * exchangeRate * 100) / 100;
  const nwtAmountWithheldMvr = Math.round(nwtAmountWithheld * exchangeRate * 100) / 100;
  const netAmountPaidMvr = Math.round(netAmountPaid * exchangeRate * 100) / 100;

  const roundOriginalGross = Math.round(grossAmount * 100) / 100;
  const roundOriginalNwt = Math.round(nwtAmountWithheld * 100) / 100;
  const roundOriginalNet = Math.round(netAmountPaid * 100) / 100;

  return {
    transactionId: input.transactionId || `TX-NWT-${Date.now()}`,
    payeeName: input.payeeName,
    payeeCountry: input.payeeCountry || 'US',
    category,
    isNonResident,
    isSubjectToNwt,
    paymentDate: input.paymentDate,
    payableDate: input.payableDate,
    withholdingDate,
    reportingPeriod,
    contractedAmount: Math.round(contractedAmount * 100) / 100,
    currency,
    exchangeRate,
    isGrossedUp,
    grossAmount: roundOriginalGross,
    grossAmountMvr,
    statutoryRate,
    effectiveRate,
    nwtAmountWithheld: roundOriginalNwt,
    nwtAmountWithheldMvr,
    netAmountPaid: roundOriginalNet,
    netAmountPaidMvr,
    isDtaaReliefApplied,
    dtaaCertificateRef,
    dtaaReliefReason,
    ruleId,
    regulatoryCitation: legalReference
  };
}

/**
 * Builds an official NWT Period object with statutory filing due date.
 */
export function buildNwtPeriod(year: number, month: number): NwtPeriod {
  const monthStr = String(month).padStart(2, '0');
  const periodName = `${year}-M${monthStr}`;
  const lastDay = new Date(year, month, 0).getDate();
  const startDate = `${year}-${monthStr}-01`;
  const endDate = `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`;
  const filingDueDate = calculateNwtDueDate(year, month);

  return {
    periodName,
    taxYear: year,
    month,
    startDate,
    endDate,
    filingDueDate,
    status: 'OPEN'
  };
}

/**
 * Generates the Official MIRA 602 Non-Resident Withholding Tax Return
 *
 * @param calculations List of calculated NWT transactions
 * @param period NWT Filing Period
 * @param taxpayer Taxpayer details
 * @returns Mira602Return
 */
export function generateMira602Return(
  calculations: NwtCalculation[],
  period: NwtPeriod,
  taxpayer: {
    tin: string;
    businessName: string;
    contactNumber?: string;
    email?: string;
  }
): Mira602Return {
  // Filter calculations that are subject to NWT and fall within the reporting period
  const eligibleItems = calculations.filter(
    (c) => c.isSubjectToNwt && c.withholdingDate >= period.startDate && c.withholdingDate <= period.endDate
  );

  // Group by Section 55 Category
  const categoryMap = new Map<NwtCategory, { gross: number; tax: number; count: number }>();

  // Initialize standard categories
  const standardCategories: NwtCategory[] = [
    'RENT_IMMOVABLE_PROPERTY',
    'ROYALTY',
    'QUALIFYING_INTEREST',
    'DIVIDEND',
    'TECHNICAL_SERVICES',
    'COMMISSION',
    'PUBLIC_ENTERTAINER',
    'RESEARCH_DEVELOPMENT',
    'INSURANCE_PREMIUM',
    'NON_RESIDENT_CONTRACTOR'
  ];

  for (const cat of standardCategories) {
    categoryMap.set(cat, { gross: 0, tax: 0, count: 0 });
  }

  const scheduleOfPayees: Mira602PayeeScheduleItem[] = [];
  let totalGrossMvr = 0;
  let totalNwtMvr = 0;

  eligibleItems.forEach((item, index) => {
    totalGrossMvr += item.grossAmountMvr;
    totalNwtMvr += item.nwtAmountWithheldMvr;

    const catStats = categoryMap.get(item.category) || { gross: 0, tax: 0, count: 0 };
    catStats.gross += item.grossAmountMvr;
    catStats.tax += item.nwtAmountWithheldMvr;
    catStats.count += 1;
    categoryMap.set(item.category, catStats);

    const catDef = NWT_CATEGORY_DEFINITIONS[item.category];

    scheduleOfPayees.push({
      lineNo: index + 1,
      payeeName: item.payeeName,
      payeeCountry: item.payeeCountry,
      category: item.category,
      categoryDescription: catDef ? catDef.name : item.category,
      paymentDate: item.paymentDate,
      payableDate: item.payableDate,
      withholdingDate: item.withholdingDate,
      grossAmountMvr: item.grossAmountMvr,
      nwtRate: item.effectiveRate,
      nwtWithheldMvr: item.nwtAmountWithheldMvr,
      isGrossedUp: item.isGrossedUp,
      dtaaReliefApplied: item.isDtaaReliefApplied,
      dtaaCertificateRef: item.dtaaCertificateRef
    });
  });

  const categorySummaries: Mira602CategorySummary[] = [];
  for (const cat of standardCategories) {
    const stats = categoryMap.get(cat)!;
    const catDef = NWT_CATEGORY_DEFINITIONS[cat];
    categorySummaries.push({
      category: cat,
      categoryName: catDef.name,
      statutoryRate: catDef.statutoryRate,
      transactionCount: stats.count,
      totalGrossAmountMvr: Math.round(stats.gross * 100) / 100,
      totalNwtWithheldMvr: Math.round(stats.tax * 100) / 100
    });
  }

  totalGrossMvr = Math.round(totalGrossMvr * 100) / 100;
  totalNwtMvr = Math.round(totalNwtMvr * 100) / 100;

  // Form version is versioned according to tax year / rules
  const formVersion = period.taxYear >= 2025 ? 'v25.1' : 'v24.1';
  const cleanTin = taxpayer.tin.replace(/[^A-Z0-9]/gi, '');
  const formId = `MIRA602-${period.taxYear}-${period.periodName}-${cleanTin}`;
  const generatedAt = new Date().toISOString();

  // Regulatory checksum
  const checksumPayload = `${formId}|${totalGrossMvr.toFixed(2)}|${totalNwtMvr.toFixed(2)}|${scheduleOfPayees.length}|${formVersion}`;
  const statutoryChecksum = createHash('sha256').update(checksumPayload).digest('hex');

  return {
    formId,
    formType: 'MIRA602',
    formVersion,
    generatedAt,
    status: 'READY_FOR_FILING',
    filingDueDate: period.filingDueDate,
    taxpayer,
    period,
    categorySummaries,
    scheduleOfPayees,
    totalGrossPaymentsMvr: totalGrossMvr,
    totalNwtWithheldMvr: totalNwtMvr,
    totalTransactions: scheduleOfPayees.length,
    regulatoryTraceability: {
      governingAct: 'Maldives Income Tax Act (Act No. 25/2019) Section 55',
      ruleIds: ['RULE-NWT-SEC55-GENERAL-10', 'RULE-NWT-SEC55-CONTRACTOR-5'],
      statutoryChecksum
    }
  };
}

/**
 * Reconciles NWT Subledger transactions against General Ledger Account 2200 (Withholding Tax Payable).
 *
 * @param calculations List of calculated NWT transactions
 * @param period NWT Period
 * @param glAccount2200Balance Balance of Account 2200 in General Ledger
 * @returns NwtReconciliation
 */
export function reconcileNwtToGl(
  calculations: NwtCalculation[],
  period: NwtPeriod,
  glAccount2200Balance: number
): NwtReconciliation {
  const periodTransactions = calculations.filter(
    (c) => c.isSubjectToNwt && c.withholdingDate >= period.startDate && c.withholdingDate <= period.endDate
  );

  let subledgerTotalNwtWithheld = 0;
  periodTransactions.forEach((tx) => {
    subledgerTotalNwtWithheld += tx.nwtAmountWithheldMvr;
  });

  subledgerTotalNwtWithheld = Math.round(subledgerTotalNwtWithheld * 100) / 100;
  const glBalance = Math.round(glAccount2200Balance * 100) / 100;
  const variance = Math.round((subledgerTotalNwtWithheld - glBalance) * 100) / 100;

  const isReconciled = Math.abs(variance) < 0.01;
  const unreconciledItems = [];

  if (!isReconciled) {
    unreconciledItems.push({
      transactionId: 'GL-VARIANCE',
      payeeName: 'Audit Variance Account 2200',
      amount: variance,
      reason: `Discrepancy of MVR ${variance.toFixed(2)} between NWT Subledger (MVR ${subledgerTotalNwtWithheld.toFixed(2)}) and GL Account 2200 (MVR ${glBalance.toFixed(2)})`
    });
  }

  return {
    period,
    subledgerTotalNwtWithheld,
    glAccount2200WithholdingTaxPayableBalance: glBalance,
    variance,
    isReconciled,
    unreconciledItems
  };
}
