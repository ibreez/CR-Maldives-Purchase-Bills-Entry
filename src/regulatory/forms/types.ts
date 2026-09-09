import { TaxpayerType } from '../types';

export type FormFieldDataType = 
  | 'STRING' 
  | 'NUMBER' 
  | 'DECIMAL' 
  | 'DATE' 
  | 'BOOLEAN' 
  | 'ENUM' 
  | 'ARRAY' 
  | 'OBJECT';

export type FormFieldSourceType = 
  | 'USER_INPUT' 
  | 'ACCOUNTING_GL' 
  | 'PNL_STATEMENT' 
  | 'TAX_ADJUSTMENT' 
  | 'CAPITAL_ALLOWANCE' 
  | 'LOSS_LEDGER' 
  | 'PREPAYMENT_LEDGER' 
  | 'CALCULATED' 
  | 'SYSTEM';

export interface FieldSourceTrace {
  fieldCode: string;
  sourceType: FormFieldSourceType;
  sourceReferenceId?: string;
  sourceDescription: string;
  rawSourceValue?: any;
  appliedFormula?: string;
  contributingFields?: string[];
  calculationTimestamp: string;
}

export interface FormFieldDefinition {
  fieldCode: string;
  label: string;
  dataType: FormFieldDataType;
  required: boolean | ((context: any) => boolean);
  source: FormFieldSourceType;
  formula?: {
    formulaId: string;
    expression: string;
    description: string;
    dependencies: string[];
  };
  validation?: {
    validatorName?: string;
    pattern?: RegExp;
    min?: number;
    max?: number;
    customValidator?: (value: any, formValues: Record<string, any>, context: any) => { isValid: boolean; message?: string };
  };
  applicability: TaxpayerType | 'ALL';
  ruleVersion: string;
  sectionId: string;
  description?: string;
}

export interface FormSectionDefinition {
  sectionId: string;
  sectionCode: string;
  title: string;
  description: string;
  fields: FormFieldDefinition[];
  order: number;
}

export interface FormValidationError {
  fieldCode: string;
  sectionId: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
  ruleId?: string;
}

export interface FormValidationResult {
  isValid: boolean;
  errors: FormValidationError[];
  warnings: FormValidationError[];
}

export interface FormDefinition {
  formCode: string; // e.g. "MIRA_604"
  formTitle: string;
  version: string;  // e.g. "v25.1"
  effectiveFromTaxYear: number; // e.g. 2024
  effectiveToTaxYear?: number | null;
  legalReference: string;
  sourceURL: string;
  sections: FormSectionDefinition[];
  getField(fieldCode: string): FormFieldDefinition | undefined;
  getFieldsBySection(sectionId: string): FormFieldDefinition[];
  getAllFields(): FormFieldDefinition[];
}

export interface FormInstance {
  formId: string;
  formCode: string;
  version: string;
  taxYear: number;
  taxpayerId: string;
  taxpayerType: TaxpayerType;
  generatedAt: string;
  values: Record<string, any>;
  traces: Record<string, FieldSourceTrace>;
  validationResult: FormValidationResult;
  status: 'DRAFT' | 'VALIDATED' | 'READY_FOR_FILING' | 'REJECTED';
  metadata: {
    ruleResolverVersion?: string;
    calculationDurationMs?: number;
    generatorVersion: string;
  };
}
