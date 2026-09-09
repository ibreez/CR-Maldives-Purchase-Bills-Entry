import { FormDefinition, FormFieldDefinition, FormSectionDefinition } from '../../types';
import { MIRA604_V25_1_FIELDS } from './fields';

export const MIRA604_V25_1_SECTIONS: FormSectionDefinition[] = [
  {
    sectionId: 'SECTION_A',
    sectionCode: 'SEC_A_TAXPAYER_INFO',
    title: 'Section A: Taxpayer Information & Accounting Profile',
    description: 'General taxpayer identification, legal classification, tax year, and accounting period parameters.',
    fields: MIRA604_V25_1_FIELDS.filter(f => f.sectionId === 'SECTION_A'),
    order: 1
  },
  {
    sectionId: 'SECTION_B',
    sectionCode: 'SEC_B_SCHEDULE_1_PNL',
    title: 'Section B: Schedule 1 - Statement of Profit or Loss',
    description: 'Itemized operational revenue, cost of sales, other income streams, operating expenses, and accounting net profit before tax.',
    fields: MIRA604_V25_1_FIELDS.filter(f => f.sectionId === 'SECTION_B'),
    order: 2
  },
  {
    sectionId: 'SECTION_C',
    sectionCode: 'SEC_C_TAX_ADJUSTMENTS',
    title: 'Section C: Tax Adjustments (Additions & Deductions)',
    description: 'Reconciliation of accounting profit to tax basis via non-deductible add-backs and allowable statutory tax deductions.',
    fields: MIRA604_V25_1_FIELDS.filter(f => f.sectionId === 'SECTION_C'),
    order: 3
  },
  {
    sectionId: 'SECTION_D',
    sectionCode: 'SEC_D_SCHEDULE_2_CAPITAL_ALLOWANCES',
    title: 'Section D: Schedule 2 - Capital Allowances',
    description: 'Statutory capital allowances claimed across qualified asset classes, including balancing adjustments.',
    fields: MIRA604_V25_1_FIELDS.filter(f => f.sectionId === 'SECTION_D'),
    order: 4
  },
  {
    sectionId: 'SECTION_E',
    sectionCode: 'SEC_E_TAXABLE_INCOME_LOSS',
    title: 'Section E: Taxable Income & Loss Relief (Section 30)',
    description: 'Computation of adjusted taxable profit/loss, set-off of 5-year unabsorbed tax loss relief, and final statutory taxable income.',
    fields: MIRA604_V25_1_FIELDS.filter(f => f.sectionId === 'SECTION_E'),
    order: 5
  },
  {
    sectionId: 'SECTION_F',
    sectionCode: 'SEC_F_TAX_COMPUTATION_CREDITS',
    title: 'Section F: Tax Computation & Statutory Credits',
    description: 'Gross tax liability computation, progressive rate brackets, Section 50 foreign tax credits, and net tax liability.',
    fields: MIRA604_V25_1_FIELDS.filter(f => f.sectionId === 'SECTION_F'),
    order: 6
  },
  {
    sectionId: 'SECTION_G',
    sectionCode: 'SEC_G_PREPAYMENTS_SETTLEMENT',
    title: 'Section G: Prepayments, Withholding & Settlement',
    description: 'Reconciliation of advance tax, interim installments, withholding tax deducted at source, and final net balance payable or refundable.',
    fields: MIRA604_V25_1_FIELDS.filter(f => f.sectionId === 'SECTION_G'),
    order: 7
  },
  {
    sectionId: 'SECTION_H',
    sectionCode: 'SEC_H_DECLARATION_VERIFICATION',
    title: 'Section H: Declaration & Statutory Verification',
    description: 'Formal declaration, authorized signatory credentials, and submission timestamp.',
    fields: MIRA604_V25_1_FIELDS.filter(f => f.sectionId === 'SECTION_H'),
    order: 8
  }
];

export const MIRA604_V25_1_DEFINITION: FormDefinition = {
  formCode: 'MIRA_604',
  formTitle: 'MIRA 604 - Income Tax Return',
  version: 'v25.1',
  effectiveFromTaxYear: 2024,
  effectiveToTaxYear: null,
  legalReference: 'Maldives Income Tax Act (Law No. 25/2019) & Income Tax Regulation (Regulation No. 2020/R-21)',
  sourceURL: 'https://www.mira.gov.mv/Forms/Details/mira-604-v25-1',
  sections: MIRA604_V25_1_SECTIONS,

  getField(fieldCode: string): FormFieldDefinition | undefined {
    return MIRA604_V25_1_FIELDS.find(f => f.fieldCode === fieldCode);
  },

  getFieldsBySection(sectionId: string): FormFieldDefinition[] {
    return MIRA604_V25_1_FIELDS.filter(f => f.sectionId === sectionId);
  },

  getAllFields(): FormFieldDefinition[] {
    return MIRA604_V25_1_FIELDS;
  }
};
