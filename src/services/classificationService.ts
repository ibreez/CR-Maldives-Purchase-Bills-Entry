import {
  AccountingClassification,
  GstTreatment,
  IncomeTaxTreatment,
  TransactionReviewStatus,
  MiraAssetClass
} from '../types/taxEngine';

/**
 * Result of the classification service for a raw OCR or document payload.
 */
export interface ClassifiedTransaction {
  transactionId?: string;
  entityId?: string;
  outletId?: string;
  transactionDate?: string;
  documentId?: string;
  supplierOrCustomer?: string;
  description: string;
  amount: number;
  gstAmount: number;
  accountingCategory: string;
  miraCategory: string;
  accountingClassification: AccountingClassification;
  accountingTreatment: AccountingClassification; // Alias for consistency with Transaction
  gstTreatment: GstTreatment;
  incomeTaxTreatment: IncomeTaxTreatment;
  taxYear?: number;
  accountingPeriodStart?: string;
  accountingPeriodEnd?: string;
  reviewStatus: TransactionReviewStatus;
  isCapitalAsset: boolean;
  miraAssetClass?: MiraAssetClass;
  adjustmentCode?: string;
  reviewReason?: string;
}

/**
 * Capital Asset Keywords and mapping rules
 */
const CAPITAL_ASSET_RULES: Array<{
  keywords: string[];
  miraAssetClass: MiraAssetClass;
  accountingCategory: string;
}> = [
  {
    keywords: ['laptop', 'macbook', 'computer', 'server', 'desktop', 'software', 'hardware', 'monitor'],
    miraAssetClass: 'Computer software & hardware',
    accountingCategory: 'capital_assets.computer_equipment'
  },
  {
    keywords: ['vehicle', 'pickup', 'truck', 'van', 'car', 'motorcycle', 'vessel', 'boat', 'speedboat'],
    miraAssetClass: 'Motor vehicles',
    accountingCategory: 'capital_assets.motor_vehicles'
  },
  {
    keywords: ['equipment', 'oven', 'machinery', 'generator', 'compressor', 'refrigerator', 'freezer', 'chiller', 'plant'],
    miraAssetClass: 'Plant & equipment / Machinery',
    accountingCategory: 'capital_assets.machinery'
  },
  {
    keywords: ['printer', 'copier', 'scanner', 'projector', 'pabx', 'office equipment'],
    miraAssetClass: 'Office equipment',
    accountingCategory: 'capital_assets.office_equipment'
  },
  {
    keywords: ['furniture', 'desk', 'chair', 'table', 'sofa', 'cabinet', 'fittings', 'shelf'],
    miraAssetClass: 'Furniture & Fittings',
    accountingCategory: 'capital_assets.furniture_fittings'
  }
];

/**
 * Classifies a raw document or OCR payload into a standardized ClassifiedTransaction
 * applying Phase 1 decoupled classifications.
 *
 * @param ocrData Raw document / OCR data payload
 * @returns ClassifiedTransaction
 */
export function classifyDocument(ocrData: any): ClassifiedTransaction {
  const data = ocrData || {};

  // Normalize textual fields
  const supplierName = String(
    data.supplierName || data.vendorName || data.vendor || data.supplier || ''
  ).toLowerCase();

  const fileName = String(data.fileName || data.file || '').toLowerCase();

  const rawText = String(
    data.rawText || data.description || data.itemDescription || data.text || ''
  ).toLowerCase();

  const supplierTin = String(data.supplierTin || data.tin || '').trim();

  const fullSearchText = `${supplierName} ${fileName} ${rawText}`;

  // Extract financial amounts
  const amount = Number(data.subtotal ?? data.netAmount ?? data.amount ?? data.totalAmount ?? 0);
  const gstAmount = Number(data.gstAmount ?? data.taxAmount ?? data.gst ?? 0);
  const totalAmount = Number(data.totalAmount ?? data.total ?? (amount + gstAmount));

  // Default fields
  let accountingClassification: AccountingClassification = 'EXPENSE';
  let gstTreatment: GstTreatment = gstAmount > 0 ? 'STANDARD_RATED' : 'ZERO_RATED';
  let incomeTaxTreatment: IncomeTaxTreatment = 'DEDUCTIBLE';
  let miraCategory = 'other_expenses';
  let accountingCategory = 'operating_expenses.general';
  let isCapitalAsset = false;
  let miraAssetClass: MiraAssetClass | undefined;
  let adjustmentCode = 'NONE';
  let reviewStatus: TransactionReviewStatus = 'APPROVED';
  let reviewReason: string | undefined;

  // 1. Check for Capital Asset Keywords (Equipment, Vehicles, Software, Laptops, Furniture, etc.)
  let matchedAssetRule: (typeof CAPITAL_ASSET_RULES)[0] | undefined;

  for (const rule of CAPITAL_ASSET_RULES) {
    if (rule.keywords.some(kw => fullSearchText.includes(kw))) {
      matchedAssetRule = rule;
      break;
    }
  }

  // Also check explicit OCR classification hints or documentType
  const isAssetHint = 
    data.documentType === 'ASSET_PURCHASE' || 
    data.isCapitalAsset === true || 
    matchedAssetRule !== undefined;

  if (isAssetHint) {
    isCapitalAsset = true;
    accountingClassification = 'ASSET';
    incomeTaxTreatment = 'CAPITAL_ALLOWANCE';
    miraCategory = 'capital_asset_schedule2';
    adjustmentCode = 'ADJ-CAPITAL';
    
    if (matchedAssetRule) {
      miraAssetClass = matchedAssetRule.miraAssetClass;
      accountingCategory = matchedAssetRule.accountingCategory;
    } else {
      miraAssetClass = 'Plant & equipment / Machinery';
      accountingCategory = 'capital_assets.general_equipment';
    }

    if (gstAmount > 0) {
      gstTreatment = 'STANDARD_RATED';
    } else if (supplierTin) {
      gstTreatment = 'STANDARD_RATED';
    } else {
      gstTreatment = 'NO_INPUT_TAX';
    }
  } else if (fullSearchText.includes('penalty') || fullSearchText.includes('fine') || fullSearchText.includes('mira') && fullSearchText.includes('late')) {
    // 2. Fines and Penalties
    accountingClassification = 'EXPENSE';
    incomeTaxTreatment = 'NON_DEDUCTIBLE';
    gstTreatment = 'OUT_OF_SCOPE';
    miraCategory = 'non_deductible_fine';
    accountingCategory = 'operating_expenses.fines_penalties';
    adjustmentCode = 'ADJ-FINES';
    reviewStatus = 'NEEDS_REVIEW';
    reviewReason = 'Statutory fine or penalty detected - non-deductible for income tax.';
  } else if (fullSearchText.includes('rent') || fullSearchText.includes('lease') || fullSearchText.includes('premises')) {
    // 3. Rent & Lease (Exempt from GST in Maldives)
    accountingClassification = 'EXPENSE';
    incomeTaxTreatment = 'DEDUCTIBLE';
    gstTreatment = 'EXEMPT';
    miraCategory = 'rental_repairs';
    accountingCategory = 'occupancy.rent';
  } else if (fullSearchText.includes('stelco') || fullSearchText.includes('electricity') || fullSearchText.includes('mwsc') || fullSearchText.includes('water')) {
    // 4. Utilities
    accountingClassification = 'EXPENSE';
    incomeTaxTreatment = 'DEDUCTIBLE';
    gstTreatment = 'STANDARD_RATED';
    miraCategory = 'other_expenses';
    accountingCategory = fullSearchText.includes('electricity') || fullSearchText.includes('stelco')
      ? 'utilities.electricity'
      : 'utilities.water';
  } else if (fullSearchText.includes('dhiraagu') || fullSearchText.includes('ooredoo') || fullSearchText.includes('internet')) {
    // 5. Telecom / Internet
    accountingClassification = 'EXPENSE';
    incomeTaxTreatment = 'DEDUCTIBLE';
    gstTreatment = 'STANDARD_RATED';
    miraCategory = 'other_expenses';
    accountingCategory = 'telecommunications';
  } else if (fullSearchText.includes('audit') || fullSearchText.includes('accounting') || fullSearchText.includes('legal') || fullSearchText.includes('consulting') || fullSearchText.includes('advisory')) {
    // Professional / Accounting / Legal / Consulting Fees
    accountingClassification = 'EXPENSE';
    incomeTaxTreatment = 'DEDUCTIBLE';
    gstTreatment = gstAmount > 0 ? 'STANDARD_RATED' : 'ZERO_RATED';
    miraCategory = 'professional_fees';
    accountingCategory = fullSearchText.includes('legal')
      ? 'professional.legal'
      : 'professional.accounting';
  } else if (!supplierTin && gstAmount === 0 && (fullSearchText.includes('handwritten') || fullSearchText.includes('market') || fullSearchText.includes('receipt'))) {
    // 6. Unregistered Vendor / Local Receipt
    accountingClassification = 'COST_OF_SALES';
    incomeTaxTreatment = 'DEDUCTIBLE';
    gstTreatment = 'NO_INPUT_TAX';
    miraCategory = 'cost_of_sales';
    accountingCategory = 'cost_of_sales.local_supplies';
    reviewStatus = 'NEEDS_REVIEW';
    reviewReason = 'Unregistered vendor receipt without TIN - review input tax eligibility.';
  } else {
    // 7. General Cost of Sales / Expense Default
    const isCostOfSales = fullSearchText.includes('ingredient') || fullSearchText.includes('food') || fullSearchText.includes('beverage') || fullSearchText.includes('supply');
    accountingClassification = isCostOfSales ? 'COST_OF_SALES' : 'EXPENSE';
    incomeTaxTreatment = 'DEDUCTIBLE';
    miraCategory = isCostOfSales ? 'cost_of_sales' : 'other_expenses';
    accountingCategory = isCostOfSales ? 'cost_of_sales.ingredients' : 'operating_expenses.general';
    gstTreatment = gstAmount > 0 ? 'STANDARD_RATED' : (supplierTin ? 'STANDARD_RATED' : 'ZERO_RATED');
  }

  // Build result
  const description = data.description || data.itemDescription || (
    isCapitalAsset ? `Capital Asset Purchase - ${miraAssetClass || 'Equipment'}` : 'General Expense Item'
  );

  return {
    transactionId: data.transactionId,
    entityId: data.entityId,
    outletId: data.outletId,
    transactionDate: data.transactionDate || data.issueDate || data.date,
    documentId: data.documentId || data.invoiceNumber,
    supplierOrCustomer: data.supplierName || data.vendorName || data.vendor || data.supplier,
    description,
    amount,
    gstAmount,
    accountingCategory,
    miraCategory,
    accountingClassification,
    accountingTreatment: accountingClassification,
    gstTreatment,
    incomeTaxTreatment,
    taxYear: data.taxYear ? Number(data.taxYear) : undefined,
    accountingPeriodStart: data.accountingPeriodStart,
    accountingPeriodEnd: data.accountingPeriodEnd,
    reviewStatus: data.reviewStatus || reviewStatus,
    isCapitalAsset,
    miraAssetClass,
    adjustmentCode,
    reviewReason
  };
}
