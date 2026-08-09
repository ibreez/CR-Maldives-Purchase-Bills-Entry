export interface ClassificationInput {
  fileName?: string;
  supplierName?: string;
  supplierTin?: string;
  invoiceNumber?: string;
  issueDate?: string;
  currency?: string;
  subtotal?: number;
  gstAmount?: number;
  totalAmount?: number;
  gstRate?: number;
  rawText?: string;
}

export interface ClassificationOutput {
  documentType:
    | 'UTILITY_BILL'
    | 'TELECOM_INVOICE'
    | 'SUPPLIER_INVOICE'
    | 'HANDWRITTEN_RECEIPT'
    | 'ASSET_PURCHASE'
    | 'RENT_INVOICE'
    | 'FINE_PENALTY'
    | 'TAX_PAYMENT';
  accountingCategory: string;
  subcategory: string;
  gstTreatment:
    | 'STANDARD_RATED_8'
    | 'STANDARD_RATED_16'
    | 'ZERO_RATED'
    | 'EXEMPT'
    | 'OUT_OF_SCOPE'
    | 'NO_INPUT_TAX';
  miraCategory:
    | 'other_expenses'
    | 'cost_of_sales'
    | 'professional_fees'
    | 'rental_repairs'
    | 'salaries_wages'
    | 'capital_asset_schedule2'
    | 'non_deductible_tax_payment'
    | 'non_deductible_fine';
  incomeTaxTreatment:
    | 'DEDUCTIBLE'
    | 'NON_DEDUCTIBLE'
    | 'CAPITAL_ALLOWANCE'
    | 'EXEMPT';
  reviewRequired: boolean;
  adjustmentCode?: string;
  miraAssetClass?: string;
}

/**
 * Mock / Rules-based Classification Pipeline for Phase 0.3 Baseline Testing
 */
export function processDocument(input: ClassificationInput): ClassificationOutput {
  const name = (input.supplierName || '').toLowerCase();
  const file = (input.fileName || '').toLowerCase();
  const tin = (input.supplierTin || '').trim();
  const subtotal = input.subtotal ?? 0;
  const gstAmount = input.gstAmount ?? 0;

  // 1. STELCO Electricity Bill
  if (name.includes('stelco') || name.includes('state electric') || file.includes('stelco')) {
    return {
      documentType: 'UTILITY_BILL',
      accountingCategory: 'utilities.electricity',
      subcategory: 'electricity',
      gstTreatment: 'STANDARD_RATED_8',
      miraCategory: 'other_expenses',
      incomeTaxTreatment: 'DEDUCTIBLE',
      reviewRequired: false,
      adjustmentCode: 'NONE'
    };
  }

  // 2. MWSC Water Bill
  if (name.includes('mwsc') || name.includes('water & sewerage') || file.includes('mwsc')) {
    return {
      documentType: 'UTILITY_BILL',
      accountingCategory: 'utilities.water',
      subcategory: 'water',
      gstTreatment: 'STANDARD_RATED_8',
      miraCategory: 'other_expenses',
      incomeTaxTreatment: 'DEDUCTIBLE',
      reviewRequired: false,
      adjustmentCode: 'NONE'
    };
  }

  // 3. Dhiraagu / Ooredoo Telecom / Internet Invoice
  if (name.includes('dhiraagu') || name.includes('ooredoo') || file.includes('dhiraagu') || file.includes('internet')) {
    return {
      documentType: 'TELECOM_INVOICE',
      accountingCategory: 'telecommunications',
      subcategory: 'internet_data',
      gstTreatment: 'STANDARD_RATED_8',
      miraCategory: 'other_expenses',
      incomeTaxTreatment: 'DEDUCTIBLE',
      reviewRequired: false,
      adjustmentCode: 'NONE'
    };
  }

  // 4. MIRA Tax Payment or Penalty Fine
  if (name.includes('maldives inland revenue authority') || name.includes('mira') || file.includes('mira')) {
    if (file.includes('penalty') || file.includes('fine') || (input.invoiceNumber || '').includes('PEN')) {
      return {
        documentType: 'FINE_PENALTY',
        accountingCategory: 'operating_expenses.fines_penalties',
        subcategory: 'late_filing_penalty',
        gstTreatment: 'OUT_OF_SCOPE',
        miraCategory: 'non_deductible_fine',
        incomeTaxTreatment: 'NON_DEDUCTIBLE',
        reviewRequired: true,
        adjustmentCode: 'ADJ-FINES'
      };
    }
    return {
      documentType: 'TAX_PAYMENT',
      accountingCategory: 'statutory_payments.mira_tax',
      subcategory: 'income_tax_settlement',
      gstTreatment: 'OUT_OF_SCOPE',
      miraCategory: 'non_deductible_tax_payment',
      incomeTaxTreatment: 'NON_DEDUCTIBLE',
      reviewRequired: false,
      adjustmentCode: 'ADJ-OTHER'
    };
  }

  // 5. Office / Commercial Premises Rent
  if (name.includes('properties') || file.includes('rent') || name.includes('lease')) {
    return {
      documentType: 'RENT_INVOICE',
      accountingCategory: 'occupancy.rent',
      subcategory: 'office_lease',
      gstTreatment: 'EXEMPT',
      miraCategory: 'rental_repairs',
      incomeTaxTreatment: 'DEDUCTIBLE',
      reviewRequired: false,
      adjustmentCode: 'NONE'
    };
  }

  // 6. Assets & Equipment (Laptop, Pickup Vehicle, Kitchen Oven)
  if (file.includes('macbook') || file.includes('laptop') || name.includes('personal computers')) {
    return {
      documentType: 'ASSET_PURCHASE',
      accountingCategory: 'capital_assets.computer_equipment',
      subcategory: 'laptops',
      gstTreatment: 'STANDARD_RATED_8',
      miraCategory: 'capital_asset_schedule2',
      incomeTaxTreatment: 'CAPITAL_ALLOWANCE',
      reviewRequired: false,
      adjustmentCode: 'ADJ-CAPITAL',
      miraAssetClass: 'Computer software & equipment'
    };
  }

  if (file.includes('pickup') || file.includes('truck') || file.includes('van') || name.includes('motors')) {
    return {
      documentType: 'ASSET_PURCHASE',
      accountingCategory: 'capital_assets.motor_vehicles',
      subcategory: 'commercial_delivery_van',
      gstTreatment: 'STANDARD_RATED_8',
      miraCategory: 'capital_asset_schedule2',
      incomeTaxTreatment: 'CAPITAL_ALLOWANCE',
      reviewRequired: false,
      adjustmentCode: 'ADJ-CAPITAL',
      miraAssetClass: 'Motor vehicles'
    };
  }

  if (file.includes('kitchen') || file.includes('oven') || file.includes('equipment') || name.includes('astron')) {
    return {
      documentType: 'ASSET_PURCHASE',
      accountingCategory: 'capital_assets.machinery',
      subcategory: 'commercial_ovens',
      gstTreatment: 'STANDARD_RATED_8',
      miraCategory: 'capital_asset_schedule2',
      incomeTaxTreatment: 'CAPITAL_ALLOWANCE',
      reviewRequired: false,
      adjustmentCode: 'ADJ-CAPITAL',
      miraAssetClass: 'Plant & equipment'
    };
  }

  // 7. Local Market Handwritten Receipt (unregistered vendor, no TIN)
  if (file.includes('handwritten') || file.includes('produce') || name.includes('market') || tin === '') {
    return {
      documentType: 'HANDWRITTEN_RECEIPT',
      accountingCategory: 'cost_of_sales.local_supplies',
      subcategory: 'fresh_produce',
      gstTreatment: 'NO_INPUT_TAX',
      miraCategory: 'cost_of_sales',
      incomeTaxTreatment: 'DEDUCTIBLE',
      reviewRequired: true,
      adjustmentCode: 'NONE'
    };
  }

  // 8. Default Supplier Invoice (e.g. Restaurant Ingredients)
  return {
    documentType: 'SUPPLIER_INVOICE',
    accountingCategory: 'cost_of_sales.ingredients',
    subcategory: 'food_beverage_ingredients',
    gstTreatment: gstAmount > 0 ? 'STANDARD_RATED_8' : 'ZERO_RATED',
    miraCategory: 'cost_of_sales',
    incomeTaxTreatment: 'DEDUCTIBLE',
    reviewRequired: false,
    adjustmentCode: 'NONE'
  };
}
