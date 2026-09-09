import {
  RegulatoryRule,
  RuleResolverContext,
  BusinessSector,
  TaxpayerType,
  TaxType
} from '../types';
import { SEEDED_REGULATORY_RULES } from '../rules';

export class RuleResolver {
  private rules: RegulatoryRule[];

  constructor(customRules?: RegulatoryRule[]) {
    this.rules = customRules ?? SEEDED_REGULATORY_RULES;
  }

  /**
   * Helper to format a Date or string into ISO YYYY-MM-DD
   */
  public static normalizeDate(dateInput: string | Date): string {
    if (typeof dateInput === 'string') {
      // If full ISO timestamp or simple date string YYYY-MM-DD
      const trimmed = dateInput.trim();
      if (trimmed.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
        return trimmed.slice(0, 10);
      }
      const parsed = new Date(dateInput);
      if (!isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
      }
      return dateInput;
    }
    return dateInput.toISOString().slice(0, 10);
  }

  /**
   * Resolves all rules matching the given context criteria, ordered by effectiveFrom DESC.
   */
  public resolveAllRules(context: RuleResolverContext): RegulatoryRule[] {
    const targetDate = RuleResolver.normalizeDate(context.transactionDate);
    const targetJurisdiction = context.jurisdiction ?? 'MV';

    return this.rules.filter((rule) => {
      // Jurisdiction check
      if (rule.jurisdiction && rule.jurisdiction !== targetJurisdiction) {
        return false;
      }

      // Tax type check
      if (context.taxType && rule.taxType !== context.taxType) {
        return false;
      }

      // Rule code check
      if (context.ruleCode && rule.ruleCode !== context.ruleCode) {
        return false;
      }

      // Tax year check
      if (context.taxYear && rule.taxYear && rule.taxYear !== context.taxYear) {
        return false;
      }

      // Sector check
      if (context.sector && rule.sector && rule.sector !== 'ALL' && rule.sector !== context.sector) {
        return false;
      }

      // Taxpayer type check
      if (context.taxpayerType && rule.taxpayerType && rule.taxpayerType !== 'ALL') {
        // Map INDIVIDUAL <-> SOLE_PROPRIETOR interchangeably if appropriate
        const reqType = context.taxpayerType === 'INDIVIDUAL' ? 'SOLE_PROPRIETOR' : context.taxpayerType;
        const ruleType = rule.taxpayerType === 'INDIVIDUAL' ? 'SOLE_PROPRIETOR' : rule.taxpayerType;
        if (ruleType !== reqType) {
          return false;
        }
      }

      // Applicable regulatory version check
      if (context.applicableRegulatoryVersion && rule.version !== context.applicableRegulatoryVersion) {
        return false;
      }

      // Effective date range check
      if (rule.effectiveFrom > targetDate) {
        return false;
      }
      if (rule.effectiveTo !== null && rule.effectiveTo < targetDate) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      // Sort by effectiveFrom descending (newest effective date first)
      if (b.effectiveFrom !== a.effectiveFrom) {
        return b.effectiveFrom.localeCompare(a.effectiveFrom);
      }
      // Prefer ACTIVE over SUPERSEDED/DRAFT
      if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1;
      if (b.status === 'ACTIVE' && a.status !== 'ACTIVE') return 1;
      return 0;
    });
  }

  /**
   * Resolves the single most specific/latest active rule matching the given context.
   */
  public resolveRule(context: RuleResolverContext): RegulatoryRule | null {
    const matches = this.resolveAllRules(context);
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Resolves statutory GST rate for a given transaction date and sector.
   */
  public resolveGSTRate(
    date: string | Date,
    sector: BusinessSector = 'GENERAL'
  ): { rate: number; ratePercentage: number; rule: RegulatoryRule } {
    const ruleCode = sector === 'TOURISM' ? 'GST_TOURISM_RATE' : 'GST_GENERAL_RATE';
    const rule = this.resolveRule({
      transactionDate: date,
      taxType: 'GST',
      ruleCode,
      sector
    });

    if (!rule) {
      throw new Error(`[RegulatoryError] No GST rule resolved for date ${RuleResolver.normalizeDate(date)} and sector ${sector}`);
    }

    return {
      rate: rule.parameters.rate as number,
      ratePercentage: rule.parameters.ratePercentage as number,
      rule
    };
  }

  /**
   * Resolves Corporate Income Tax rule (Section 15) for companies.
   */
  public resolveCompanyIncomeTaxRule(date: string | Date, taxYear?: number): RegulatoryRule {
    const rule = this.resolveRule({
      transactionDate: date,
      taxYear,
      taxType: 'INCOME_TAX',
      ruleCode: 'INCOME_TAX_COMPANY_THRESHOLD',
      taxpayerType: 'COMPANY'
    });

    if (!rule) {
      throw new Error(`[RegulatoryError] No Corporate Income Tax rule resolved for date ${RuleResolver.normalizeDate(date)}`);
    }

    return rule;
  }

  /**
   * Resolves Individual / Sole Proprietor Progressive Tax Brackets (Section 16).
   */
  public resolveIndividualTaxBrackets(
    date: string | Date,
    taxYear?: number
  ): {
    brackets: Array<{
      from: number;
      to: number | null;
      rate: number;
      ratePercentage: number;
      description: string;
    }>;
    rule: RegulatoryRule;
  } {
    const rule = this.resolveRule({
      transactionDate: date,
      taxYear,
      taxType: 'INCOME_TAX',
      ruleCode: 'INCOME_TAX_INDIVIDUAL_BRACKETS',
      taxpayerType: 'SOLE_PROPRIETOR'
    });

    if (!rule) {
      throw new Error(`[RegulatoryError] No Individual Income Tax rule resolved for date ${RuleResolver.normalizeDate(date)}`);
    }

    return {
      brackets: rule.parameters.brackets,
      rule
    };
  }

  /**
   * Resolves Non-Resident Withholding Tax (NWT - Section 55) rate for a category.
   */
  public resolveNWTRate(
    category: string,
    date: string | Date
  ): { rate: number; ratePercentage: number; rule: RegulatoryRule } {
    const targetCategory = category.toUpperCase().trim();
    const isContractor = targetCategory === 'NON_RESIDENT_CONTRACTOR' || targetCategory === 'CONTRACTOR';

    const ruleCode = isContractor ? 'NWT_CONTRACTOR_5' : 'NWT_STANDARD_10';
    const rule = this.resolveRule({
      transactionDate: date,
      taxType: 'NWT',
      ruleCode
    });

    if (!rule) {
      throw new Error(`[RegulatoryError] No NWT rule resolved for category ${category} on date ${RuleResolver.normalizeDate(date)}`);
    }

    return {
      rate: rule.parameters.rate as number,
      ratePercentage: rule.parameters.ratePercentage as number,
      rule
    };
  }

  /**
   * Resolves statutory Capital Allowance rule for a given asset classification and acquisition/in-service date.
   */
  public resolveCapitalAllowanceRule(
    taxClassification: string,
    date: string | Date
  ): { rate: number; ratePercentage: number; method: string; rule: RegulatoryRule } {
    const classificationCodeMap: Record<string, string> = {
      BUILDINGS: 'CA_RATE_BUILDINGS',
      AIRCRAFT: 'CA_RATE_AIRCRAFT',
      WOODEN_MARINE_VESSELS: 'CA_RATE_WOODEN_VESSELS',
      OTHER_MARINE_VESSELS: 'CA_RATE_OTHER_VESSELS',
      FURNITURE_FITTINGS: 'CA_RATE_FURNITURE',
      MOTOR_VEHICLES: 'CA_RATE_MOTOR_VEHICLES',
      EARTH_MOVING_VEHICLES: 'CA_RATE_EARTH_MOVING',
      PLANT_EQUIPMENT: 'CA_RATE_PLANT_MACHINERY',
      PLANT_MACHINERY: 'CA_RATE_PLANT_MACHINERY',
      OFFICE_EQUIPMENT: 'CA_RATE_OFFICE_EQUIPMENT',
      COMPUTER_SOFTWARE: 'CA_RATE_COMPUTERS_SOFTWARE',
      COMPUTERS_IT: 'CA_RATE_COMPUTERS_SOFTWARE',
      LOOSE_TOOLS_UTENSILS: 'CA_RATE_LOOSE_TOOLS',
      LOOSE_TOOLS: 'CA_RATE_LOOSE_TOOLS'
    };

    const ruleCode = classificationCodeMap[taxClassification.toUpperCase().trim()] || 'CA_RATE_PLANT_MACHINERY';
    const rule = this.resolveRule({
      transactionDate: date,
      taxType: 'CAPITAL_ALLOWANCE',
      ruleCode
    });

    if (!rule) {
      throw new Error(`[RegulatoryError] No Capital Allowance rule resolved for classification ${taxClassification} on date ${RuleResolver.normalizeDate(date)}`);
    }

    return {
      rate: rule.parameters.rate as number,
      ratePercentage: rule.parameters.ratePercentage as number,
      method: (rule.parameters.method as string) || 'STRAIGHT_LINE',
      rule
    };
  }

  /**
   * Resolves statutory low-value asset immediate write-off rule (Section 18(d)).
   */
  public resolveLowValueAssetRule(
    date: string | Date
  ): { threshold: number; writeOffRate: number; rule: RegulatoryRule } {
    const rule = this.resolveRule({
      transactionDate: date,
      taxType: 'CAPITAL_ALLOWANCE',
      ruleCode: 'CA_LOW_VALUE_THRESHOLD'
    });

    if (!rule) {
      throw new Error(`[RegulatoryError] No Low-Value Asset rule resolved for date ${RuleResolver.normalizeDate(date)}`);
    }

    return {
      threshold: rule.parameters.threshold as number,
      writeOffRate: rule.parameters.writeOffRate as number,
      rule
    };
  }

  /**
   * Resolves statutory Tax Adjustment rule for non-deductible add-backs and allowable deductions.
   */
  public resolveTaxAdjustmentRule(
    categoryOrCode: string,
    date: string | Date = '2026-01-01'
  ): {
    adjustmentCode: string;
    direction: 'ADD_BACK' | 'DEDUCTION';
    legalReference: string;
    mira604Field: string;
    rule: RegulatoryRule;
  } {
    const rawKey = categoryOrCode.toUpperCase().trim();
    const codeMap: Record<string, string> = {
      'DEPRECIATION_ADDBACK': 'ADJ_DEPRECIATION_ADDBACK',
      'ADJ-DEPR': 'ADJ_DEPRECIATION_ADDBACK',
      'ADJ_DEPR': 'ADJ_DEPRECIATION_ADDBACK',
      'DEPRECIATION': 'ADJ_DEPRECIATION_ADDBACK',
      'AMORTIZATION': 'ADJ_DEPRECIATION_ADDBACK',

      'NON_DEDUCTIBLE_EXPENDITURE': 'ADJ_NON_DEDUCTIBLE_EXPENDITURE',
      'ADJ-NON-DEDUCTIBLE': 'ADJ_NON_DEDUCTIBLE_EXPENDITURE',
      'ADJ_NON_DEDUCTIBLE': 'ADJ_NON_DEDUCTIBLE_EXPENDITURE',
      'NON_DEDUCTIBLE': 'ADJ_NON_DEDUCTIBLE_EXPENDITURE',

      'PRIVATE_EXPENDITURE': 'ADJ_PRIVATE_EXPENDITURE',
      'ADJ-PRIVATE': 'ADJ_PRIVATE_EXPENDITURE',
      'ADJ_PRIVATE': 'ADJ_PRIVATE_EXPENDITURE',
      'PERSONAL': 'ADJ_PRIVATE_EXPENDITURE',
      'DRAWINGS': 'ADJ_PRIVATE_EXPENDITURE',

      'FINES_PENALTIES': 'ADJ_FINES_PENALTIES',
      'ADJ-FINES': 'ADJ_FINES_PENALTIES',
      'ADJ_FINES': 'ADJ_FINES_PENALTIES',
      'FINES': 'ADJ_FINES_PENALTIES',
      'PENALTIES': 'ADJ_FINES_PENALTIES',

      'CAPITAL_EXPENDITURE': 'ADJ_CAPITAL_EXPENDITURE',
      'ADJ-CAPITAL': 'ADJ_CAPITAL_EXPENDITURE',
      'ADJ_CAPITAL': 'ADJ_CAPITAL_EXPENDITURE',
      'CAPITAL_ASSET_EXPENSE': 'ADJ_CAPITAL_EXPENDITURE',

      'RELATED_PARTY_EXCESS': 'ADJ_RELATED_PARTY_EXCESS',
      'ADJ-RELATED': 'ADJ_RELATED_PARTY_EXCESS',
      'ADJ_RELATED': 'ADJ_RELATED_PARTY_EXCESS',
      'TRANSFER_PRICING_EXCESS': 'ADJ_RELATED_PARTY_EXCESS',

      'GENERAL_PROVISIONS': 'ADJ_GENERAL_PROVISIONS',
      'ADJ-PROVISIONS': 'ADJ_GENERAL_PROVISIONS',
      'ADJ_PROVISIONS': 'ADJ_GENERAL_PROVISIONS',
      'CONTINGENT_PROVISIONS': 'ADJ_GENERAL_PROVISIONS',

      'OWNER_DRAWINGS': 'ADJ_OWNER_DRAWINGS',
      'ADJ-OWNER': 'ADJ_OWNER_DRAWINGS',
      'ADJ_OWNER': 'ADJ_OWNER_DRAWINGS',
      'PARTNER_DRAWINGS': 'ADJ_OWNER_DRAWINGS',

      'APPROVED_DONATIONS': 'ADJ_APPROVED_DONATIONS',
      'ALLOWABLE_TAX_DEDUCTIONS': 'ADJ_APPROVED_DONATIONS',
      'ADJ-DONATION': 'ADJ_APPROVED_DONATIONS',
      'ADJ_DONATION': 'ADJ_APPROVED_DONATIONS',
      'DONATIONS': 'ADJ_APPROVED_DONATIONS',

      'SPECIFIC_BAD_DEBTS': 'ADJ_SPECIFIC_BAD_DEBTS',
      'ADJ-BAD-DEBTS': 'ADJ_SPECIFIC_BAD_DEBTS',
      'ADJ_BAD_DEBTS': 'ADJ_SPECIFIC_BAD_DEBTS',
      'BAD_DEBTS': 'ADJ_SPECIFIC_BAD_DEBTS',

      'TAX_EXEMPT_INCOME': 'ADJ_TAX_EXEMPT_INCOME',
      'ADJ-EXEMPT': 'ADJ_TAX_EXEMPT_INCOME',
      'ADJ_EXEMPT': 'ADJ_TAX_EXEMPT_INCOME',
      'EXEMPT_INCOME': 'ADJ_TAX_EXEMPT_INCOME',

      'OTHER_ADJUSTMENT': 'ADJ_NON_DEDUCTIBLE_EXPENDITURE',
      'ADJ-OTHER': 'ADJ_NON_DEDUCTIBLE_EXPENDITURE',
      'ADJ_OTHER': 'ADJ_NON_DEDUCTIBLE_EXPENDITURE'
    };

    const ruleCode = codeMap[rawKey] || 'ADJ_NON_DEDUCTIBLE_EXPENDITURE';
    const rule = this.resolveRule({
      transactionDate: date,
      taxType: 'INCOME_TAX',
      ruleCode
    });

    if (!rule) {
      throw new Error(`[RegulatoryError] No Tax Adjustment rule resolved for ${categoryOrCode} on date ${RuleResolver.normalizeDate(date)}`);
    }

    return {
      adjustmentCode: (rule.parameters.adjustmentCode as string) || 'ADJ-OTHER',
      direction: (rule.parameters.direction as 'ADD_BACK' | 'DEDUCTION') || 'ADD_BACK',
      legalReference: rule.legalReference,
      mira604Field: (rule.parameters.mira604Field as string) || 'F604_C07_ADD_OTHER_STATUTORY_ADDS',
      rule
    };
  }

  /**
   * Resolves Section 30 Tax Loss Carry Forward Relief rule.
   */
  public resolveLossReliefRule(
    dateOrTaxYear: string | number | Date = '2026-01-01',
    applicableRegulatoryVersion?: string
  ): {
    maxCarryForwardYears: number;
    lossUtilizationCapPercentage: number;
    ordering: 'FIFO' | 'EXPIRY_FIRST';
    legalReference: string;
    rule: RegulatoryRule;
  } {
    const transactionDate =
      typeof dateOrTaxYear === 'number'
        ? `${dateOrTaxYear}-12-31`
        : RuleResolver.normalizeDate(dateOrTaxYear);

    const rule = this.resolveRule({
      transactionDate,
      taxType: 'INCOME_TAX',
      ruleCode: 'INCOME_TAX_LOSS_RELIEF',
      applicableRegulatoryVersion
    });

    if (!rule) {
      throw new Error(`[RegulatoryError] No Income Tax Loss Relief rule resolved for date ${transactionDate}`);
    }

    return {
      maxCarryForwardYears: (rule.parameters.maxCarryForwardYears as number) || 5,
      lossUtilizationCapPercentage: (rule.parameters.lossUtilizationCapPercentage as number) || 100,
      ordering: (rule.parameters.ordering as 'FIFO' | 'EXPIRY_FIRST') || 'FIFO',
      legalReference: rule.legalReference,
      rule
    };
  }

  /**
   * Resolves Section 31 Foreign Currency Conversion and Rate Locking rule.
   */
  public resolveFxConversionRule(
    date: string | Date = '2026-01-01',
    applicableRegulatoryVersion?: string
  ): {
    functionalCurrency: string;
    allowRetroactiveRevaluation: boolean;
    mmaOfficialUsdPegRate: number;
    requireRateApproval: boolean;
    unrealisedGainMIRAField: string;
    unrealisedLossMIRAField: string;
    legalReference: string;
    rule: RegulatoryRule;
  } {
    const transactionDate = RuleResolver.normalizeDate(date);
    const rule = this.resolveRule({
      transactionDate,
      taxType: 'INCOME_TAX',
      ruleCode: 'FX_CURRENCY_CONVERSION',
      applicableRegulatoryVersion
    });

    if (!rule) {
      throw new Error(`[RegulatoryError] No FX Currency Conversion rule resolved for date ${transactionDate}`);
    }

    return {
      functionalCurrency: (rule.parameters.functionalCurrency as string) || 'MVR',
      allowRetroactiveRevaluation: (rule.parameters.allowRetroactiveRevaluation as boolean) || false,
      mmaOfficialUsdPegRate: (rule.parameters.mmaOfficialUsdPegRate as number) || 15.42,
      requireRateApproval: (rule.parameters.requireRateApproval as boolean) || true,
      unrealisedGainMIRAField: (rule.parameters.unrealisedGainMIRAField as string) || 'F604_C09_DED_EXEMPT_INCOME',
      unrealisedLossMIRAField: (rule.parameters.unrealisedLossMIRAField as string) || 'F604_C07_ADD_OTHER_STATUTORY_ADDS',
      legalReference: rule.legalReference,
      rule
    };
  }

  /**
   * Resolves Cross-Module Reconciliation Engine rule.
   */
  public resolveReconciliationRule(
    date: string | Date = '2026-01-01',
    applicableRegulatoryVersion?: string
  ): {
    defaultTolerance: number;
    defaultWarningThreshold: number;
    enforceUnderlyingTransactionTracing: boolean;
    supportedModules: string[];
    legalReference: string;
    rule: RegulatoryRule;
  } {
    const transactionDate = RuleResolver.normalizeDate(date);
    const rule = this.resolveRule({
      transactionDate,
      taxType: 'OTHER',
      ruleCode: 'CROSS_MODULE_RECONCILIATION',
      applicableRegulatoryVersion
    });

    if (!rule) {
      throw new Error(`[RegulatoryError] No Reconciliation rule resolved for date ${transactionDate}`);
    }

    return {
      defaultTolerance: (rule.parameters.defaultTolerance as number) ?? 0.05,
      defaultWarningThreshold: (rule.parameters.defaultWarningThreshold as number) ?? 1.00,
      enforceUnderlyingTransactionTracing: (rule.parameters.enforceUnderlyingTransactionTracing as boolean) ?? true,
      supportedModules: (rule.parameters.supportedModules as string[]) || [],
      legalReference: rule.legalReference,
      rule
    };
  }
}

// Export default singleton instance
export const defaultRuleResolver = new RuleResolver();
