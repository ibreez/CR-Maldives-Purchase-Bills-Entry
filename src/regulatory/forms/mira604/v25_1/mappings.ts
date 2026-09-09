import Decimal from 'decimal.js';
import { FieldSourceTrace } from '../../types';
import { TaxpayerType } from '../../../types';
import { 
  Schedule2BalanceSheetData, 
  Schedule3PersonalNetWorthData, 
  Schedule4SourceData, 
  Schedule5SourceData 
} from '../schedules/types';

export interface MIRA604AccountingSourceData {
  taxpayer: {
    tin: string;
    taxpayerName: string;
    taxpayerType: TaxpayerType;
    taxYear: number;
    accountingPeriodStart: string;
    accountingPeriodEnd: string;
    businessActivity?: string;
    presentationCurrency?: 'MVR' | 'USD';
    groupFactor?: number;
    contactEmail?: string;
    contactPhone?: string;
  };
  pnl: {
    grossRevenue: number;
    costOfSales: number;
    dividendIncome?: number;
    interestIncome?: number;
    rentalIncome?: number;
    royaltyIncome?: number;
    capitalGains?: number;
    foreignIncome?: number;
    otherOperatingIncome?: number;
    salariesAndWages?: number;
    rentExpense?: number;
    utilitiesExpense?: number;
    bookDepreciationExpense?: number;
    financeCosts?: number;
    legalProfessionalFees?: number;
    travelEntertainment?: number;
    repairsMaintenance?: number;
    otherOperatingExpenses?: number;
    glAccountReferences?: Record<string, string>;
  };
  taxAdjustments?: Array<{
    miraCode?: string;
    adjustmentType?: string;
    category?: 'ADDITION' | 'DEDUCTION' | 'ADD_BACK' | 'ALLOWABLE_DEDUCTION';
    description: string;
    amount: number;
    statutoryReference?: string;
    referenceId?: string;
  }>;
  capitalAllowances?: {
    buildingsStructures?: number;
    plantMachinery?: number;
    vehiclesVessels?: number;
    electronicItEquipment?: number;
    furnitureFixtures?: number;
    intangiblesRd?: number;
    balancingAllowance?: number;
    balancingCharge?: number;
    assetRegisterReferences?: Record<string, string>;
  };
  lossSchedule?: {
    priorUnabsorbedLosses?: number;
    expiredLosses?: number;
    lossRecords?: Array<{
      taxYear: number;
      initialLoss: number;
      utilizedSoFar: number;
      unabsorbedBalance: number;
      isExpired?: boolean;
    }>;
  };
  taxCredits?: {
    foreignTaxCredit?: number;
    statutoryDonationCredit?: number;
  };
  prepaymentsAndWithholdings?: {
    advanceTaxPaid?: number;
    interimTax1Paid?: number;
    interimTax2Paid?: number;
    employeeWhtCredit?: number;
    nonResidentWhtCredit?: number;
    otherTaxPaidAtSource?: number;
    paymentReferences?: Record<string, string>;
  };
  declaration?: {
    declarantName: string;
    declarantDesignation: 'DIRECTOR' | 'MANAGING_DIRECTOR' | 'PARTNER' | 'SOLE_PROPRIETOR' | 'TRUSTEE' | 'TAX_AGENT' | 'AUTHORISED_OFFICER';
    declarantIdOrPassport: string;
    declarationDate: string;
    confirmationAccepted: boolean;
  };
  // MIRA 604 v25.1 Statutory Schedules Data
  schedule2Data?: Schedule2BalanceSheetData;
  schedule3Data?: Schedule3PersonalNetWorthData;
  schedule4Data?: Schedule4SourceData;
  schedule5Data?: Schedule5SourceData;
}

export interface FormMappingResult {
  mappedValues: Record<string, any>;
  traces: Record<string, FieldSourceTrace>;
}

export const MIRA604_V25_1_MAPPINGS = {
  /**
   * Maps rich accounting domain data into MIRA 604 v25.1 field records with comprehensive source tracing
   */
  mapSourceDataToForm(sourceData: MIRA604AccountingSourceData): FormMappingResult {
    const values: Record<string, any> = {};
    const traces: Record<string, FieldSourceTrace> = {};
    const now = new Date().toISOString();

    const addField = (
      code: string,
      val: any,
      sourceType: FieldSourceTrace['sourceType'],
      desc: string,
      refId?: string,
      raw?: any
    ) => {
      values[code] = val;
      traces[code] = {
        fieldCode: code,
        sourceType,
        sourceReferenceId: refId,
        sourceDescription: desc,
        rawSourceValue: raw !== undefined ? raw : val,
        calculationTimestamp: now
      };
    };

    // ------------------------------------------------------------------------
    // 1. SECTION A: Taxpayer Profile
    // ------------------------------------------------------------------------
    const tp = sourceData.taxpayer;
    addField('F604_A01_TIN', tp.tin, 'USER_INPUT', 'Taxpayer Identification Number from taxpayer record', 'TP_MASTER:TIN');
    addField('F604_A02_TAXPAYER_NAME', tp.taxpayerName, 'USER_INPUT', 'Legal name of taxpayer / registered enterprise', 'TP_MASTER:NAME');
    addField('F604_A03_TAXPAYER_TYPE', tp.taxpayerType, 'USER_INPUT', 'Taxpayer entity classification', 'TP_MASTER:ENTITY_TYPE');
    addField('F604_A04_TAX_YEAR', tp.taxYear, 'USER_INPUT', 'Tax year of filing', 'FILING:TAX_YEAR');
    addField('F604_A05_PERIOD_START', tp.accountingPeriodStart, 'USER_INPUT', 'Start date of basis accounting period', 'PERIOD:START');
    addField('F604_A06_PERIOD_END', tp.accountingPeriodEnd, 'USER_INPUT', 'End date of basis accounting period', 'PERIOD:END');
    addField('F604_A08_BUSINESS_ACTIVITY', tp.businessActivity || 'General Commercial Activity', 'USER_INPUT', 'Principal business activity description');
    addField('F604_A09_PRESENTATION_CURRENCY', tp.presentationCurrency || 'MVR', 'USER_INPUT', 'Presentation currency for filing');
    addField('F604_A10_GROUP_FACTOR', tp.groupFactor || 1, 'USER_INPUT', 'Corporate group factor for Section 15(c) threshold sharing');
    if (tp.contactEmail) addField('F604_A11_CONTACT_EMAIL', tp.contactEmail, 'USER_INPUT', 'Contact email for tax correspondence');
    if (tp.contactPhone) addField('F604_A12_CONTACT_PHONE', tp.contactPhone, 'USER_INPUT', 'Contact phone number');

    // ------------------------------------------------------------------------
    // 2. SECTION B: Statement of Profit or Loss
    // ------------------------------------------------------------------------
    const pnl = sourceData.pnl;
    const glRefs = pnl.glAccountReferences || {};

    addField('F604_B01_GROSS_REVENUE', pnl.grossRevenue || 0, 'PNL_STATEMENT', 'Gross sales turnover from P&L revenue accounts', glRefs['GROSS_REVENUE'] || 'GL:REV_4000');
    addField('F604_B02_COST_OF_SALES', pnl.costOfSales || 0, 'PNL_STATEMENT', 'Direct operational cost of sales from P&L', glRefs['COST_OF_SALES'] || 'GL:COS_5000');

    addField('F604_B04_DIVIDEND_INCOME', pnl.dividendIncome || 0, 'PNL_STATEMENT', 'Dividend income from equity investments', glRefs['DIVIDEND_INCOME'] || 'GL:DIV_4100');
    addField('F604_B05_INTEREST_INCOME', pnl.interestIncome || 0, 'PNL_STATEMENT', 'Interest income on deposits and investments', glRefs['INTEREST_INCOME'] || 'GL:INT_4200');
    addField('F604_B06_RENTAL_INCOME', pnl.rentalIncome || 0, 'PNL_STATEMENT', 'Rental income from commercial and residential property', glRefs['RENTAL_INCOME'] || 'GL:RENT_4300');
    addField('F604_B07_ROYALTY_INCOME', pnl.royaltyIncome || 0, 'PNL_STATEMENT', 'Royalties and licensing receipts', glRefs['ROYALTY_INCOME'] || 'GL:ROY_4400');
    addField('F604_B08_CAPITAL_GAINS', pnl.capitalGains || 0, 'PNL_STATEMENT', 'Realized capital gains on asset disposals', glRefs['CAPITAL_GAINS'] || 'GL:CG_4500');
    addField('F604_B09_FOREIGN_INCOME', pnl.foreignIncome || 0, 'PNL_STATEMENT', 'Foreign sourced revenues', glRefs['FOREIGN_INCOME'] || 'GL:FOR_4600');
    addField('F604_B10_OTHER_OPERATING_INCOME', pnl.otherOperatingIncome || 0, 'PNL_STATEMENT', 'Miscellaneous other operating income', glRefs['OTHER_INCOME'] || 'GL:OTH_4900');

    addField('F604_B12_STAFF_EXPENSES', pnl.salariesAndWages || 0, 'PNL_STATEMENT', 'Salaries, employee allowances and pension contributions', glRefs['STAFF_EXPENSES'] || 'GL:EXP_6000');
    addField('F604_B13_RENT_EXPENSE', pnl.rentExpense || 0, 'PNL_STATEMENT', 'Office, warehouse and commercial rent expense', glRefs['RENT_EXPENSE'] || 'GL:EXP_6100');
    addField('F604_B14_UTILITIES_EXPENSE', pnl.utilitiesExpense || 0, 'PNL_STATEMENT', 'Water, electricity, internet, and communication costs', glRefs['UTILITIES_EXPENSE'] || 'GL:EXP_6200');
    addField('F604_B15_BOOK_DEPRECIATION_EXPENSE', pnl.bookDepreciationExpense || 0, 'PNL_STATEMENT', 'Accounting book depreciation / amortisation expense', glRefs['BOOK_DEPRECIATION_EXPENSE'] || 'GL:EXP_6300');
    addField('F604_B16_FINANCE_COSTS', pnl.financeCosts || 0, 'PNL_STATEMENT', 'Bank charges and borrowing finance costs', glRefs['FINANCE_COSTS'] || 'GL:EXP_6400');
    addField('F604_B17_LEGAL_PROFESSIONAL_FEES', pnl.legalProfessionalFees || 0, 'PNL_STATEMENT', 'Legal, audit, tax, and consulting fees', glRefs['LEGAL_PROFESSIONAL_FEES'] || 'GL:EXP_6500');
    addField('F604_B18_TRAVEL_ENTERTAINMENT', pnl.travelEntertainment || 0, 'PNL_STATEMENT', 'Business travel, hospitality, and entertainment', glRefs['TRAVEL_ENTERTAINMENT'] || 'GL:EXP_6600');
    addField('F604_B19_REPAIRS_MAINTENANCE', pnl.repairsMaintenance || 0, 'PNL_STATEMENT', 'Repairs and servicing of business assets', glRefs['REPAIRS_MAINTENANCE'] || 'GL:EXP_6700');
    addField('F604_B20_OTHER_OPERATING_EXPENSES', pnl.otherOperatingExpenses || 0, 'PNL_STATEMENT', 'Sundry and other operating expenses', glRefs['OTHER_OPERATING_EXPENSES'] || 'GL:EXP_6900');

    // ------------------------------------------------------------------------
    // 3. SECTION C: Tax Adjustments (Additions & Deductions)
    // ------------------------------------------------------------------------
    let addDepr = new Decimal(0);
    let addFines = new Decimal(0);
    let addEnt = new Decimal(0);
    let addDonations = new Decimal(0);
    let addDrawings = new Decimal(0);
    let addProvisions = new Decimal(0);
    let addOther = new Decimal(0);

    let dedExempt = new Decimal(0);
    let dedBadDebts = new Decimal(0);
    let dedOther = new Decimal(0);

    if (sourceData.taxAdjustments && sourceData.taxAdjustments.length > 0) {
      for (const adj of sourceData.taxAdjustments) {
        const amt = new Decimal(adj.amount || 0);
        const code = (adj.miraCode || adj.adjustmentType || '').toUpperCase();
        const cat = (adj.category || '').toUpperCase();

        if (code.includes('DEPR') || code.includes('AMORT')) {
          addDepr = addDepr.plus(amt);
        } else if (code.includes('FINE') || code.includes('PENALTY')) {
          addFines = addFines.plus(amt);
        } else if (code.includes('ENT') || code.includes('HOSPITALITY')) {
          addEnt = addEnt.plus(amt);
        } else if (code.includes('DONATION') || code.includes('GIFT')) {
          addDonations = addDonations.plus(amt);
        } else if (code.includes('DRAW') || code.includes('PERSONAL')) {
          addDrawings = addDrawings.plus(amt);
        } else if (code.includes('PROVISION') || code.includes('CONTINGENCY')) {
          addProvisions = addProvisions.plus(amt);
        } else if (cat === 'ADDITION' || cat === 'ADD_BACK') {
          addOther = addOther.plus(amt);
        } else if (code.includes('EXEMPT') || code.includes('FOREIGN_EXEMPT')) {
          dedExempt = dedExempt.plus(amt);
        } else if (code.includes('BAD_DEBT') || code.includes('WRITE_OFF')) {
          dedBadDebts = dedBadDebts.plus(amt);
        } else if (cat === 'DEDUCTION' || cat === 'ALLOWABLE_DEDUCTION') {
          dedOther = dedOther.plus(amt);
        } else {
          // Default to addition if positive, deduction if negative
          if (amt.gte(0)) addOther = addOther.plus(amt);
          else dedOther = dedOther.plus(amt.abs());
        }
      }
    }

    // Fallback: If book depreciation expense was provided in PnL, ensure it is added back
    if (addDepr.isZero() && pnl.bookDepreciationExpense && pnl.bookDepreciationExpense > 0) {
      addDepr = new Decimal(pnl.bookDepreciationExpense);
    }

    addField('F604_C01_ADD_BOOK_DEPRECIATION', addDepr.toNumber(), 'TAX_ADJUSTMENT', 'Add-back of accounting depreciation per Income Tax Act', 'ADJ:DEPRECIATION');
    addField('F604_C02_ADD_FINES_PENALTIES', addFines.toNumber(), 'TAX_ADJUSTMENT', 'Add-back of non-deductible statutory fines & penalties', 'ADJ:FINES');
    addField('F604_C03_ADD_ENTERTAINMENT_NON_DEDUCTIBLE', addEnt.toNumber(), 'TAX_ADJUSTMENT', 'Add-back of non-deductible entertainment expenses', 'ADJ:ENTERTAINMENT');
    addField('F604_C04_ADD_NON_APPROVED_DONATIONS', addDonations.toNumber(), 'TAX_ADJUSTMENT', 'Add-back of unapproved charitable gifts and donations', 'ADJ:DONATIONS');
    addField('F604_C05_ADD_PERSONAL_DRAWINGS', addDrawings.toNumber(), 'TAX_ADJUSTMENT', 'Add-back of personal drawings and domestic expenses', 'ADJ:DRAWINGS');
    addField('F604_C06_ADD_GENERAL_PROVISIONS', addProvisions.toNumber(), 'TAX_ADJUSTMENT', 'Add-back of general bad debt & contingency provisions', 'ADJ:PROVISIONS');
    addField('F604_C07_ADD_OTHER_STATUTORY_ADDS', addOther.toNumber(), 'TAX_ADJUSTMENT', 'Other statutory add-backs to accounting profit', 'ADJ:OTHER_ADDS');

    addField('F604_C09_DED_EXEMPT_INCOME', dedExempt.toNumber(), 'TAX_ADJUSTMENT', 'Statutory deduction for exempt income / foreign income excluded', 'DED:EXEMPT');
    addField('F604_C10_DED_SPECIFIC_BAD_DEBTS', dedBadDebts.toNumber(), 'TAX_ADJUSTMENT', 'Statutory deduction for specific bad debts written off', 'DED:BAD_DEBTS');
    addField('F604_C11_DED_OTHER_STATUTORY_DEDS', dedOther.toNumber(), 'TAX_ADJUSTMENT', 'Other allowable statutory tax deductions', 'DED:OTHER_DEDS');

    // ------------------------------------------------------------------------
    // 4. SECTION D: Schedule 2 - Capital Allowances
    // ------------------------------------------------------------------------
    const ca = sourceData.capitalAllowances || {};
    const caRefs = ca.assetRegisterReferences || {};

    addField('F604_D01_CA_BUILDINGS_STRUCTURES', ca.buildingsStructures || 0, 'CAPITAL_ALLOWANCE', 'Statutory capital allowance on commercial buildings & structures (4% / 10%)', caRefs['BUILDINGS'] || 'FA_REGISTER:BUILDINGS');
    addField('F604_D02_CA_PLANT_MACHINERY', ca.plantMachinery || 0, 'CAPITAL_ALLOWANCE', 'Statutory capital allowance on plant & machinery (20%)', caRefs['PLANT_MACHINERY'] || 'FA_REGISTER:PLANT_MACHINERY');
    addField('F604_D03_CA_VEHICLES_VESSELS', ca.vehiclesVessels || 0, 'CAPITAL_ALLOWANCE', 'Statutory capital allowance on motor vehicles & marine vessels (20% / 33.3%)', caRefs['VEHICLES'] || 'FA_REGISTER:VEHICLES_VESSELS');
    addField('F604_D04_CA_ELECTRONIC_IT_EQUIPMENT', ca.electronicItEquipment || 0, 'CAPITAL_ALLOWANCE', 'Statutory capital allowance on computers & IT software (33.3%)', caRefs['IT_EQUIPMENT'] || 'FA_REGISTER:IT_EQUIPMENT');
    addField('F604_D05_CA_FURNITURE_FIXTURES', ca.furnitureFixtures || 0, 'CAPITAL_ALLOWANCE', 'Statutory capital allowance on furniture, fixtures & fittings (20%)', caRefs['FURNITURE'] || 'FA_REGISTER:FURNITURE');
    addField('F604_D06_CA_INTANGIBLES_RD', ca.intangiblesRd || 0, 'CAPITAL_ALLOWANCE', 'Statutory capital allowance on intangible intellectual property & R&D', caRefs['INTANGIBLES'] || 'FA_REGISTER:INTANGIBLES');
    addField('F604_D07_CA_BALANCING_ALLOWANCE', ca.balancingAllowance || 0, 'CAPITAL_ALLOWANCE', 'Balancing allowance claimed upon asset disposals', caRefs['BALANCING_ALLOWANCE'] || 'FA_DISPOSAL:BAL_ALLOWANCE');
    addField('F604_D08_CA_BALANCING_CHARGE', ca.balancingCharge || 0, 'CAPITAL_ALLOWANCE', 'Balancing charge on asset disposals reducing total allowance', caRefs['BALANCING_CHARGE'] || 'FA_DISPOSAL:BAL_CHARGE');

    // ------------------------------------------------------------------------
    // 5. SECTION E: Tax Losses Brought Forward
    // ------------------------------------------------------------------------
    const ls = sourceData.lossSchedule || {};
    let priorLoss = new Decimal(ls.priorUnabsorbedLosses || 0);
    let expiredLoss = new Decimal(ls.expiredLosses || 0);

    if (ls.lossRecords && ls.lossRecords.length > 0) {
      priorLoss = new Decimal(0);
      expiredLoss = new Decimal(0);
      for (const rec of ls.lossRecords) {
        const bal = new Decimal(rec.unabsorbedBalance !== undefined ? rec.unabsorbedBalance : (rec.initialLoss - rec.utilizedSoFar));
        if (rec.isExpired || (tp.taxYear - rec.taxYear > 5)) {
          expiredLoss = expiredLoss.plus(bal);
        }
        priorLoss = priorLoss.plus(bal);
      }
    }

    addField('F604_E02_PRIOR_UNABSORBED_LOSSES', priorLoss.toNumber(), 'LOSS_LEDGER', 'Cumulative unabsorbed tax losses brought forward from prior tax years', 'LOSS_LEDGER:PRIOR_TOTAL');
    addField('F604_E03_EXPIRED_TAX_LOSSES', expiredLoss.toNumber(), 'LOSS_LEDGER', 'Tax losses exceeding statutory 5-year relief window (Section 30)', 'LOSS_LEDGER:EXPIRED_TOTAL');

    // ------------------------------------------------------------------------
    // 6. SECTION F: Tax Credits
    // ------------------------------------------------------------------------
    const credits = sourceData.taxCredits || {};
    addField('F604_F04_CREDIT_FOREIGN_TAX', credits.foreignTaxCredit || 0, 'TAX_ADJUSTMENT', 'Section 50 Double taxation foreign tax credit claimed', 'CREDIT:FOREIGN_TAX');
    addField('F604_F05_CREDIT_STATUTORY_DONATIONS', credits.statutoryDonationCredit || 0, 'TAX_ADJUSTMENT', 'Section 50 Approved charitable donations credit claimed', 'CREDIT:STATUTORY_DONATION');

    // ------------------------------------------------------------------------
    // 7. SECTION G: Prepayments & Withholding at Source
    // ------------------------------------------------------------------------
    const prep = sourceData.prepaymentsAndWithholdings || {};
    const prepRefs = prep.paymentReferences || {};

    addField('F604_G01_ADVANCE_TAX_PAID', prep.advanceTaxPaid || 0, 'PREPAYMENT_LEDGER', 'Advance tax payments deposited for tax year', prepRefs['ADVANCE_TAX'] || 'MIRA:ADVANCE_RECEIPT');
    addField('F604_G02_INTERIM_TAX_1_PAID', prep.interimTax1Paid || 0, 'PREPAYMENT_LEDGER', '1st Interim tax installment payment (MIRA 603)', prepRefs['INTERIM_1'] || 'MIRA:INTERIM_1_RECEIPT');
    addField('F604_G03_INTERIM_TAX_2_PAID', prep.interimTax2Paid || 0, 'PREPAYMENT_LEDGER', '2nd Interim tax installment payment (MIRA 603)', prepRefs['INTERIM_2'] || 'MIRA:INTERIM_2_RECEIPT');
    addField('F604_G04_EMPLOYEE_WHT_CREDIT', prep.employeeWhtCredit || 0, 'PREPAYMENT_LEDGER', 'Employee withholding tax deducted at source under Section 54', prepRefs['EMPLOYEE_WHT'] || 'WHT:SEC54_CERTIFICATE');
    addField('F604_G05_NON_RESIDENT_WHT_CREDIT', prep.nonResidentWhtCredit || 0, 'PREPAYMENT_LEDGER', 'Non-resident withholding tax deducted at source under Section 55', prepRefs['NON_RES_WHT'] || 'WHT:SEC55_CERTIFICATE');
    addField('F604_G06_OTHER_TAX_PAID_SOURCE', prep.otherTaxPaidAtSource || 0, 'PREPAYMENT_LEDGER', 'Other statutory taxes paid or deducted at source', prepRefs['OTHER_TAX'] || 'MIRA:OTHER_SOURCE_TAX');

    // ------------------------------------------------------------------------
    // 8. SECTION H: Statutory Declaration
    // ------------------------------------------------------------------------
    const decl = sourceData.declaration || {
      declarantName: tp.taxpayerName,
      declarantDesignation: tp.taxpayerType === 'COMPANY' ? 'DIRECTOR' : 'SOLE_PROPRIETOR',
      declarantIdOrPassport: 'A000000',
      declarationDate: new Date().toISOString().split('T')[0],
      confirmationAccepted: true
    };

    addField('F604_H01_DECLARANT_NAME', decl.declarantName, 'USER_INPUT', 'Full name of declarant');
    addField('F604_H02_DECLARANT_DESIGNATION', decl.declarantDesignation, 'USER_INPUT', 'Designation / Capacity of declarant');
    addField('F604_H03_DECLARANT_ID_PASSPORT', decl.declarantIdOrPassport, 'USER_INPUT', 'National ID or passport of declarant');
    addField('F604_H04_DECLARATION_DATE', decl.declarationDate, 'USER_INPUT', 'Statutory declaration date');
    addField('F604_H05_CONFIRMATION_ACCEPTED', decl.confirmationAccepted, 'USER_INPUT', 'Affirmation of true and complete declaration');

    return {
      mappedValues: values,
      traces
    };
  }
};
