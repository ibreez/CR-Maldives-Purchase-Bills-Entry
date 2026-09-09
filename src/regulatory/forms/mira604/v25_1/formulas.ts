import Decimal from 'decimal.js';
import { FieldSourceTrace } from '../../types';
import { defaultIncomeTaxEngine } from '../../../../services/tax/incomeTaxEngineService';
import { TaxpayerType } from '../../../types';

export interface FormFormulaContext {
  taxYear: number;
  taxpayerType: TaxpayerType;
  accountingDays?: number;
  groupFactor?: number;
  jurisdiction?: string;
}

export interface FormulaEvaluationResult {
  value: any;
  trace: FieldSourceTrace;
}

function toDec(val: any): Decimal {
  if (val === undefined || val === null || val === '') return new Decimal(0);
  try {
    return new Decimal(val);
  } catch {
    return new Decimal(0);
  }
}

export const MIRA604_V25_1_FORMULAS = {
  /**
   * Calculates accounting period days: DATEDIFF_DAYS(PERIOD_END, PERIOD_START) + 1
   */
  evaluateAccountingDays(startDateStr: string, endDateStr: string): FormulaEvaluationResult {
    let days = 365;
    if (startDateStr && endDateStr) {
      const start = new Date(startDateStr);
      const end = new Date(endDateStr);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const diffTime = end.getTime() - start.getTime();
        days = Math.max(1, Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1);
      }
    }

    return {
      value: days,
      trace: {
        fieldCode: 'F604_A07_ACCOUNTING_DAYS',
        sourceType: 'CALCULATED',
        sourceDescription: 'Calculated calendar days in basis accounting period',
        appliedFormula: `(${endDateStr} - ${startDateStr}) + 1 = ${days} days`,
        contributingFields: ['F604_A05_PERIOD_START', 'F604_A06_PERIOD_END'],
        calculationTimestamp: new Date().toISOString()
      }
    };
  },

  /**
   * F604_B03_GROSS_PROFIT = GROSS_REVENUE - COST_OF_SALES
   */
  evaluateGrossProfit(revenue: any, costOfSales: any): FormulaEvaluationResult {
    const revDec = toDec(revenue);
    const cosDec = toDec(costOfSales);
    const gpDec = revDec.minus(cosDec);

    return {
      value: gpDec.toNumber(),
      trace: {
        fieldCode: 'F604_B03_GROSS_PROFIT',
        sourceType: 'CALCULATED',
        sourceDescription: 'Gross profit calculated from revenue minus cost of sales',
        appliedFormula: `${revDec.toFixed(2)} - ${cosDec.toFixed(2)} = ${gpDec.toFixed(2)}`,
        contributingFields: ['F604_B01_GROSS_REVENUE', 'F604_B02_COST_OF_SALES'],
        calculationTimestamp: new Date().toISOString()
      }
    };
  },

  /**
   * F604_B11_TOTAL_OTHER_INCOME = SUM(B04 to B10)
   */
  evaluateTotalOtherIncome(values: Record<string, any>): FormulaEvaluationResult {
    const fields = [
      'F604_B04_DIVIDEND_INCOME',
      'F604_B05_INTEREST_INCOME',
      'F604_B06_RENTAL_INCOME',
      'F604_B07_ROYALTY_INCOME',
      'F604_B08_CAPITAL_GAINS',
      'F604_B09_FOREIGN_INCOME',
      'F604_B10_OTHER_OPERATING_INCOME'
    ];

    let sum = new Decimal(0);
    for (const f of fields) {
      sum = sum.plus(toDec(values[f]));
    }

    return {
      value: sum.toNumber(),
      trace: {
        fieldCode: 'F604_B11_TOTAL_OTHER_INCOME',
        sourceType: 'CALCULATED',
        sourceDescription: 'Sum of all other operating and non-operating income sources',
        appliedFormula: `SUM(${fields.map(f => toDec(values[f]).toFixed(2)).join(' + ')}) = ${sum.toFixed(2)}`,
        contributingFields: fields,
        calculationTimestamp: new Date().toISOString()
      }
    };
  },

  /**
   * F604_B21_TOTAL_OPERATING_EXPENSES = SUM(B12 to B20)
   */
  evaluateTotalOperatingExpenses(values: Record<string, any>): FormulaEvaluationResult {
    const fields = [
      'F604_B12_STAFF_EXPENSES',
      'F604_B13_RENT_EXPENSE',
      'F604_B14_UTILITIES_EXPENSE',
      'F604_B15_BOOK_DEPRECIATION_EXPENSE',
      'F604_B16_FINANCE_COSTS',
      'F604_B17_LEGAL_PROFESSIONAL_FEES',
      'F604_B18_TRAVEL_ENTERTAINMENT',
      'F604_B19_REPAIRS_MAINTENANCE',
      'F604_B20_OTHER_OPERATING_EXPENSES'
    ];

    let sum = new Decimal(0);
    for (const f of fields) {
      sum = sum.plus(toDec(values[f]));
    }

    return {
      value: sum.toNumber(),
      trace: {
        fieldCode: 'F604_B21_TOTAL_OPERATING_EXPENSES',
        sourceType: 'CALCULATED',
        sourceDescription: 'Total accounting expenses itemized in Schedule 1',
        appliedFormula: `SUM(${fields.map(f => toDec(values[f]).toFixed(2)).join(' + ')}) = ${sum.toFixed(2)}`,
        contributingFields: fields,
        calculationTimestamp: new Date().toISOString()
      }
    };
  },

  /**
   * F604_B22_NET_PROFIT_BEFORE_TAX = GROSS_PROFIT + TOTAL_OTHER_INCOME - TOTAL_OPERATING_EXPENSES
   */
  evaluateNetProfitBeforeTax(grossProfit: any, totalOtherIncome: any, totalExpenses: any): FormulaEvaluationResult {
    const gp = toDec(grossProfit);
    const oi = toDec(totalOtherIncome);
    const exp = toDec(totalExpenses);
    const netProfit = gp.plus(oi).minus(exp);

    return {
      value: netProfit.toNumber(),
      trace: {
        fieldCode: 'F604_B22_NET_PROFIT_BEFORE_TAX',
        sourceType: 'CALCULATED',
        sourceDescription: 'Accounting profit before tax from Schedule 1 Statement of Profit or Loss',
        appliedFormula: `${gp.toFixed(2)} + ${oi.toFixed(2)} - ${exp.toFixed(2)} = ${netProfit.toFixed(2)}`,
        contributingFields: ['F604_B03_GROSS_PROFIT', 'F604_B11_TOTAL_OTHER_INCOME', 'F604_B21_TOTAL_OPERATING_EXPENSES'],
        calculationTimestamp: new Date().toISOString()
      }
    };
  },

  /**
   * F604_C08_TOTAL_TAX_ADDITIONS = SUM(C01 to C07)
   */
  evaluateTotalTaxAdditions(values: Record<string, any>): FormulaEvaluationResult {
    const fields = [
      'F604_C01_ADD_BOOK_DEPRECIATION',
      'F604_C02_ADD_FINES_PENALTIES',
      'F604_C03_ADD_ENTERTAINMENT_NON_DEDUCTIBLE',
      'F604_C04_ADD_NON_APPROVED_DONATIONS',
      'F604_C05_ADD_PERSONAL_DRAWINGS',
      'F604_C06_ADD_GENERAL_PROVISIONS',
      'F604_C07_ADD_OTHER_STATUTORY_ADDS'
    ];

    let sum = new Decimal(0);
    for (const f of fields) {
      sum = sum.plus(toDec(values[f]));
    }

    return {
      value: sum.toNumber(),
      trace: {
        fieldCode: 'F604_C08_TOTAL_TAX_ADDITIONS',
        sourceType: 'CALCULATED',
        sourceDescription: 'Total non-deductible add-backs to accounting profit',
        appliedFormula: `SUM(${fields.map(f => toDec(values[f]).toFixed(2)).join(' + ')}) = ${sum.toFixed(2)}`,
        contributingFields: fields,
        calculationTimestamp: new Date().toISOString()
      }
    };
  },

  /**
   * F604_C12_TOTAL_TAX_DEDUCTIONS = SUM(C09 to C11)
   */
  evaluateTotalTaxDeductions(values: Record<string, any>): FormulaEvaluationResult {
    const fields = [
      'F604_C09_DED_EXEMPT_INCOME',
      'F604_C10_DED_SPECIFIC_BAD_DEBTS',
      'F604_C11_DED_OTHER_STATUTORY_DEDS'
    ];

    let sum = new Decimal(0);
    for (const f of fields) {
      sum = sum.plus(toDec(values[f]));
    }

    return {
      value: sum.toNumber(),
      trace: {
        fieldCode: 'F604_C12_TOTAL_TAX_DEDUCTIONS',
        sourceType: 'CALCULATED',
        sourceDescription: 'Total statutory deductions and exempt income excluded from taxable profit',
        appliedFormula: `SUM(${fields.map(f => toDec(values[f]).toFixed(2)).join(' + ')}) = ${sum.toFixed(2)}`,
        contributingFields: fields,
        calculationTimestamp: new Date().toISOString()
      }
    };
  },

  /**
   * F604_C13_NET_TAX_ADJUSTMENTS = TOTAL_TAX_ADDITIONS - TOTAL_TAX_DEDUCTIONS
   */
  evaluateNetTaxAdjustments(totalAdditions: any, totalDeductions: any): FormulaEvaluationResult {
    const add = toDec(totalAdditions);
    const ded = toDec(totalDeductions);
    const net = add.minus(ded);

    return {
      value: net.toNumber(),
      trace: {
        fieldCode: 'F604_C13_NET_TAX_ADJUSTMENTS',
        sourceType: 'CALCULATED',
        sourceDescription: 'Net tax adjustments reconciling accounting profit to tax basis',
        appliedFormula: `${add.toFixed(2)} - ${ded.toFixed(2)} = ${net.toFixed(2)}`,
        contributingFields: ['F604_C08_TOTAL_TAX_ADDITIONS', 'F604_C12_TOTAL_TAX_DEDUCTIONS'],
        calculationTimestamp: new Date().toISOString()
      }
    };
  },

  /**
   * F604_D09_TOTAL_CAPITAL_ALLOWANCE = SUM(D01 to D07) - D08
   */
  evaluateTotalCapitalAllowance(values: Record<string, any>): FormulaEvaluationResult {
    const allowanceFields = [
      'F604_D01_CA_BUILDINGS_STRUCTURES',
      'F604_D02_CA_PLANT_MACHINERY',
      'F604_D03_CA_VEHICLES_VESSELS',
      'F604_D04_CA_ELECTRONIC_IT_EQUIPMENT',
      'F604_D05_CA_FURNITURE_FIXTURES',
      'F604_D06_CA_INTANGIBLES_RD',
      'F604_D07_CA_BALANCING_ALLOWANCE'
    ];
    const balancingChargeField = 'F604_D08_CA_BALANCING_CHARGE';

    let sumAllowance = new Decimal(0);
    for (const f of allowanceFields) {
      sumAllowance = sumAllowance.plus(toDec(values[f]));
    }
    const charge = toDec(values[balancingChargeField]);
    const totalCA = Decimal.max(0, sumAllowance.minus(charge));

    return {
      value: totalCA.toNumber(),
      trace: {
        fieldCode: 'F604_D09_TOTAL_CAPITAL_ALLOWANCE',
        sourceType: 'CALCULATED',
        sourceDescription: 'Total statutory capital allowance claimable under Schedule 2',
        appliedFormula: `${sumAllowance.toFixed(2)} - ${charge.toFixed(2)} = ${totalCA.toFixed(2)}`,
        contributingFields: [...allowanceFields, balancingChargeField],
        calculationTimestamp: new Date().toISOString()
      }
    };
  },

  /**
   * F604_E01_ADJ_TAXABLE_PROFIT_BEFORE_LOSS = NET_PROFIT_BEFORE_TAX + NET_TAX_ADJUSTMENTS - TOTAL_CAPITAL_ALLOWANCE
   */
  evaluateAdjustedTaxableProfit(netProfit: any, netAdjustments: any, totalCA: any): FormulaEvaluationResult {
    const np = toDec(netProfit);
    const adj = toDec(netAdjustments);
    const ca = toDec(totalCA);
    const adjProfit = np.plus(adj).minus(ca);

    return {
      value: adjProfit.toNumber(),
      trace: {
        fieldCode: 'F604_E01_ADJ_TAXABLE_PROFIT_BEFORE_LOSS',
        sourceType: 'CALCULATED',
        sourceDescription: 'Adjusted taxable profit or loss before loss carry forward relief',
        appliedFormula: `${np.toFixed(2)} + ${adj.toFixed(2)} - ${ca.toFixed(2)} = ${adjProfit.toFixed(2)}`,
        contributingFields: ['F604_B22_NET_PROFIT_BEFORE_TAX', 'F604_C13_NET_TAX_ADJUSTMENTS', 'F604_D09_TOTAL_CAPITAL_ALLOWANCE'],
        calculationTimestamp: new Date().toISOString()
      }
    };
  },

  /**
   * Evaluates Section E Loss Relief fields (E04, E05, E06, E07, E08)
   */
  evaluateLossReliefPipeline(
    adjustedTaxableProfit: any,
    priorLosses: any,
    expiredLosses: any
  ): {
    validLosses: FormulaEvaluationResult;
    lossReliefUtilized: FormulaEvaluationResult;
    currentYearTaxLoss: FormulaEvaluationResult;
    remainingLossCF: FormulaEvaluationResult;
    netTaxableIncome: FormulaEvaluationResult;
  } {
    const adjProfit = toDec(adjustedTaxableProfit);
    const prior = toDec(priorLosses);
    const exp = toDec(expiredLosses);

    // E04: Valid Losses
    const valid = Decimal.max(0, prior.minus(exp));

    // E05: Loss relief utilized
    let utilized = new Decimal(0);
    if (adjProfit.gt(0)) {
      utilized = Decimal.min(adjProfit, valid);
    }

    // E06: Current Year Tax Loss
    const currentTaxLoss = adjProfit.lt(0) ? adjProfit.abs() : new Decimal(0);

    // E07: Remaining Unabsorbed Loss Carried Forward
    const remainingCF = valid.minus(utilized).plus(currentTaxLoss);

    // E08: Net Taxable Income
    const netTaxableIncome = Decimal.max(0, adjProfit.minus(utilized));

    const now = new Date().toISOString();

    return {
      validLosses: {
        value: valid.toNumber(),
        trace: {
          fieldCode: 'F604_E04_VALID_LOSSES_BROUGHT_FORWARD',
          sourceType: 'CALCULATED',
          sourceDescription: 'Prior unabsorbed losses eligible under Section 30 5-year rule',
          appliedFormula: `MAX(0, ${prior.toFixed(2)} - ${exp.toFixed(2)}) = ${valid.toFixed(2)}`,
          contributingFields: ['F604_E02_PRIOR_UNABSORBED_LOSSES', 'F604_E03_EXPIRED_TAX_LOSSES'],
          calculationTimestamp: now
        }
      },
      lossReliefUtilized: {
        value: utilized.toNumber(),
        trace: {
          fieldCode: 'F604_E05_LOSS_RELIEF_UTILIZED',
          sourceType: 'CALCULATED',
          sourceDescription: 'Prior tax loss deducted from current year taxable profit',
          appliedFormula: `MIN(MAX(0, ${adjProfit.toFixed(2)}), ${valid.toFixed(2)}) = ${utilized.toFixed(2)}`,
          contributingFields: ['F604_E01_ADJ_TAXABLE_PROFIT_BEFORE_LOSS', 'F604_E04_VALID_LOSSES_BROUGHT_FORWARD'],
          calculationTimestamp: now
        }
      },
      currentYearTaxLoss: {
        value: currentTaxLoss.toNumber(),
        trace: {
          fieldCode: 'F604_E06_CURRENT_YEAR_TAX_LOSS',
          sourceType: 'CALCULATED',
          sourceDescription: 'Current period tax loss generated',
          appliedFormula: `MAX(0, -${adjProfit.toFixed(2)}) = ${currentTaxLoss.toFixed(2)}`,
          contributingFields: ['F604_E01_ADJ_TAXABLE_PROFIT_BEFORE_LOSS'],
          calculationTimestamp: now
        }
      },
      remainingLossCF: {
        value: remainingCF.toNumber(),
        trace: {
          fieldCode: 'F604_E07_REMAINING_UNABSORBED_LOSS_CF',
          sourceType: 'CALCULATED',
          sourceDescription: 'Total unabsorbed losses carried forward to next tax year',
          appliedFormula: `${valid.toFixed(2)} - ${utilized.toFixed(2)} + ${currentTaxLoss.toFixed(2)} = ${remainingCF.toFixed(2)}`,
          contributingFields: ['F604_E04_VALID_LOSSES_BROUGHT_FORWARD', 'F604_E05_LOSS_RELIEF_UTILIZED', 'F604_E06_CURRENT_YEAR_TAX_LOSS'],
          calculationTimestamp: now
        }
      },
      netTaxableIncome: {
        value: netTaxableIncome.toNumber(),
        trace: {
          fieldCode: 'F604_E08_NET_TAXABLE_INCOME',
          sourceType: 'CALCULATED',
          sourceDescription: 'Final net statutory taxable income on which tax brackets are computed',
          appliedFormula: `MAX(0, ${adjProfit.toFixed(2)} - ${utilized.toFixed(2)}) = ${netTaxableIncome.toFixed(2)}`,
          contributingFields: ['F604_E01_ADJ_TAXABLE_PROFIT_BEFORE_LOSS', 'F604_E05_LOSS_RELIEF_UTILIZED'],
          calculationTimestamp: now
        }
      }
    };
  },

  /**
   * Evaluates Section F Gross Tax Liability via Phase 26 dynamic engine
   */
  evaluateGrossTaxLiability(
    netTaxableIncome: any,
    taxpayerType: TaxpayerType,
    context: FormFormulaContext
  ): {
    grossLiability: FormulaEvaluationResult;
    taxThreshold: FormulaEvaluationResult;
    bracketDetails: FormulaEvaluationResult;
  } {
    const netIncome = toDec(netTaxableIncome).toNumber();
    const liabilityResult = defaultIncomeTaxEngine.calculateTaxLiability(
      netIncome,
      taxpayerType,
      {
        taxYear: context.taxYear,
        accountingDays: context.accountingDays || 365,
        groupFactor: context.groupFactor || 1
      }
    );

    const now = new Date().toISOString();

    return {
      grossLiability: {
        value: liabilityResult.totalGrossTaxLiability,
        trace: {
          fieldCode: 'F604_F03_GROSS_TAX_LIABILITY',
          sourceType: 'CALCULATED',
          sourceReferenceId: liabilityResult.ruleIds.join(','),
          sourceDescription: `Computed via Section ${taxpayerType === 'INDIVIDUAL' || taxpayerType === 'SOLE_PROPRIETOR' ? '16' : '15'} brackets`,
          appliedFormula: `Taxable Income MVR ${netIncome.toLocaleString()} -> Gross Tax MVR ${liabilityResult.totalGrossTaxLiability.toFixed(2)}`,
          contributingFields: ['F604_E08_NET_TAXABLE_INCOME', 'F604_A03_TAXPAYER_TYPE', 'F604_A04_TAX_YEAR'],
          calculationTimestamp: now
        }
      },
      taxThreshold: {
        value: liabilityResult.proRatedThreshold ?? 500000,
        trace: {
          fieldCode: 'F604_F01_TAX_FREE_THRESHOLD',
          sourceType: 'CALCULATED',
          sourceReferenceId: liabilityResult.ruleIds.join(','),
          sourceDescription: 'Pro-rated tax-free threshold under Section 15(c)',
          appliedFormula: `Standard 500,000 * (${context.accountingDays || 365} / 365) / ${context.groupFactor || 1} = MVR ${(liabilityResult.proRatedThreshold ?? 500000).toFixed(2)}`,
          contributingFields: ['F604_A07_ACCOUNTING_DAYS', 'F604_A10_GROUP_FACTOR'],
          calculationTimestamp: now
        }
      },
      bracketDetails: {
        value: liabilityResult.brackets,
        trace: {
          fieldCode: 'F604_F02_TAX_BRACKET_DETAILS',
          sourceType: 'CALCULATED',
          sourceDescription: 'Itemized progressive tax bracket tiers calculated',
          appliedFormula: liabilityResult.formula,
          contributingFields: ['F604_E08_NET_TAXABLE_INCOME'],
          calculationTimestamp: now
        }
      }
    };
  },

  /**
   * Evaluates Section F & G final figures: Credits, Prepayments, Final Payable/Refundable
   */
  evaluateSettlementPipeline(
    grossTaxLiability: any,
    netTaxableIncome: any,
    foreignTaxCredit: any,
    donationCredit: any,
    prepaymentValues: Record<string, any>
  ): {
    totalCredits: FormulaEvaluationResult;
    netLiability: FormulaEvaluationResult;
    effectiveRate: FormulaEvaluationResult;
    totalPrepayments: FormulaEvaluationResult;
    netBalance: FormulaEvaluationResult;
    finalTaxPayable: FormulaEvaluationResult;
    finalRefundClaimable: FormulaEvaluationResult;
  } {
    const grossTax = toDec(grossTaxLiability);
    const netIncome = toDec(netTaxableIncome);
    const foreignCred = toDec(foreignTaxCredit);
    const donCred = toDec(donationCredit);

    // F06: Total Allowable Tax Credits
    const sumCred = foreignCred.plus(donCred);
    const totalCredits = Decimal.min(grossTax, sumCred);

    // F07: Net Tax Liability
    const netLiability = Decimal.max(0, grossTax.minus(totalCredits));

    // F08: Effective Tax Rate
    const effRate = netIncome.gt(0) ? netLiability.dividedBy(netIncome).times(100) : new Decimal(0);

    // G07: Total Prepayments
    const prepaymentFields = [
      'F604_G01_ADVANCE_TAX_PAID',
      'F604_G02_INTERIM_TAX_1_PAID',
      'F604_G03_INTERIM_TAX_2_PAID',
      'F604_G04_EMPLOYEE_WHT_CREDIT',
      'F604_G05_NON_RESIDENT_WHT_CREDIT',
      'F604_G06_OTHER_TAX_PAID_SOURCE'
    ];

    let totalPrep = new Decimal(0);
    for (const f of prepaymentFields) {
      totalPrep = totalPrep.plus(toDec(prepaymentValues[f]));
    }

    // G08: Net Balance Due / Refundable
    const netBalance = netLiability.minus(totalPrep);

    // G09 & G10: Final Payable / Refund
    const finalPayable = Decimal.max(0, netBalance);
    const finalRefund = Decimal.max(0, netBalance.negated());

    const now = new Date().toISOString();

    return {
      totalCredits: {
        value: totalCredits.toNumber(),
        trace: {
          fieldCode: 'F604_F06_TOTAL_TAX_CREDITS',
          sourceType: 'CALCULATED',
          sourceDescription: 'Total Section 50 tax credits applied (capped at gross liability)',
          appliedFormula: `MIN(${grossTax.toFixed(2)}, ${sumCred.toFixed(2)}) = ${totalCredits.toFixed(2)}`,
          contributingFields: ['F604_F03_GROSS_TAX_LIABILITY', 'F604_F04_CREDIT_FOREIGN_TAX', 'F604_F05_CREDIT_STATUTORY_DONATIONS'],
          calculationTimestamp: now
        }
      },
      netLiability: {
        value: netLiability.toNumber(),
        trace: {
          fieldCode: 'F604_F07_NET_TAX_LIABILITY',
          sourceType: 'CALCULATED',
          sourceDescription: 'Net tax liability after allowable tax credits',
          appliedFormula: `${grossTax.toFixed(2)} - ${totalCredits.toFixed(2)} = ${netLiability.toFixed(2)}`,
          contributingFields: ['F604_F03_GROSS_TAX_LIABILITY', 'F604_F06_TOTAL_TAX_CREDITS'],
          calculationTimestamp: now
        }
      },
      effectiveRate: {
        value: effRate.toDecimalPlaces(2).toNumber(),
        trace: {
          fieldCode: 'F604_F08_EFFECTIVE_TAX_RATE',
          sourceType: 'CALCULATED',
          sourceDescription: 'Effective tax rate percentage',
          appliedFormula: `(${netLiability.toFixed(2)} / ${netIncome.toFixed(2)}) * 100 = ${effRate.toFixed(2)}%`,
          contributingFields: ['F604_F07_NET_TAX_LIABILITY', 'F604_E08_NET_TAXABLE_INCOME'],
          calculationTimestamp: now
        }
      },
      totalPrepayments: {
        value: totalPrep.toNumber(),
        trace: {
          fieldCode: 'F604_G07_TOTAL_PREPAYMENTS_AND_WHT',
          sourceType: 'CALCULATED',
          sourceDescription: 'Sum of all prior payments and tax withheld at source for the tax year',
          appliedFormula: `SUM(${prepaymentFields.map(f => toDec(prepaymentValues[f]).toFixed(2)).join(' + ')}) = ${totalPrep.toFixed(2)}`,
          contributingFields: prepaymentFields,
          calculationTimestamp: now
        }
      },
      netBalance: {
        value: netBalance.toNumber(),
        trace: {
          fieldCode: 'F604_G08_NET_BALANCE_DUE_OR_REFUNDABLE',
          sourceType: 'CALCULATED',
          sourceDescription: 'Final net balance due to MIRA (positive) or refundable (negative)',
          appliedFormula: `${netLiability.toFixed(2)} - ${totalPrep.toFixed(2)} = ${netBalance.toFixed(2)}`,
          contributingFields: ['F604_F07_NET_TAX_LIABILITY', 'F604_G07_TOTAL_PREPAYMENTS_AND_WHT'],
          calculationTimestamp: now
        }
      },
      finalTaxPayable: {
        value: finalPayable.toNumber(),
        trace: {
          fieldCode: 'F604_G09_FINAL_TAX_PAYABLE',
          sourceType: 'CALCULATED',
          sourceDescription: 'Final tax payable to MIRA upon filing',
          appliedFormula: `MAX(0, ${netBalance.toFixed(2)}) = ${finalPayable.toFixed(2)}`,
          contributingFields: ['F604_G08_NET_BALANCE_DUE_OR_REFUNDABLE'],
          calculationTimestamp: now
        }
      },
      finalRefundClaimable: {
        value: finalRefund.toNumber(),
        trace: {
          fieldCode: 'F604_G10_FINAL_REFUND_CLAIMABLE',
          sourceType: 'CALCULATED',
          sourceDescription: 'Final refund claimable from MIRA',
          appliedFormula: `MAX(0, -${netBalance.toFixed(2)}) = ${finalRefund.toFixed(2)}`,
          contributingFields: ['F604_G08_NET_BALANCE_DUE_OR_REFUNDABLE'],
          calculationTimestamp: now
        }
      }
    };
  }
};
