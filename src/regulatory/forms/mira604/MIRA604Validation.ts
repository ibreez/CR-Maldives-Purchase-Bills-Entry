import { FormValidationResult } from '../types';
import { MIRA604_V25_1_VALIDATIONS } from './v25_1/validations';
import { MIRA604_V25_1_DEFINITION } from './v25_1/definition';

export class MIRA604Validation {
  /**
   * Validates form values for MIRA 604 against specified version definition
   */
  public static validate(
    formValues: Record<string, any>,
    version: string = 'v25.1'
  ): FormValidationResult {
    if (version === 'v25.1' || version.toLowerCase() === 'v25.1' || version === '25.1') {
      return MIRA604_V25_1_VALIDATIONS.validateForm(
        formValues,
        MIRA604_V25_1_DEFINITION.getAllFields()
      );
    }

    // Default to v25.1
    return MIRA604_V25_1_VALIDATIONS.validateForm(
      formValues,
      MIRA604_V25_1_DEFINITION.getAllFields()
    );
  }
}
