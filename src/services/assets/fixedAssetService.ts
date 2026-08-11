import { FixedAssetRecord, MiraAssetClass } from '../../types/taxEngine';
import { TransactionRecord } from '../../types/taxEngine';

export type MiraAssetClassCode =
  | 'BUILDINGS'
  | 'AIRCRAFT'
  | 'WOODEN_MARINE_VESSELS'
  | 'OTHER_MARINE_VESSELS'
  | 'FURNITURE_FITTINGS'
  | 'MOTOR_VEHICLES'
  | 'EARTH_MOVING_VEHICLES'
  | 'PLANT_EQUIPMENT'
  | 'OFFICE_EQUIPMENT'
  | 'COMPUTER_SOFTWARE'
  | 'LOOSE_TOOLS_UTENSILS';

/**
 * MIRA Schedule 2 (Section 83) Capital Allowance Rates Matrix
 */
export const MIRA_SECTION_83_RATES: Record<string, number> = {
  // Enum / Upper codes
  BUILDINGS: 4,
  AIRCRAFT: 7,
  WOODEN_MARINE_VESSELS: 7,
  OTHER_MARINE_VESSELS: 5,
  FURNITURE_FITTINGS: 10,
  MOTOR_VEHICLES: 20,
  EARTH_MOVING_VEHICLES: 20,
  PLANT_EQUIPMENT: 20,
  OFFICE_EQUIPMENT: 20,
  COMPUTER_SOFTWARE: 33.33,
  LOOSE_TOOLS_UTENSILS: 33.33,

  // String label mappings
  'Buildings': 4,
  'Aircraft': 7,
  'Marine vessels (Wooden)': 7,
  'Marine vessels (Other)': 5,
  'Furniture & Fittings': 10,
  'Motor vehicles': 20,
  'Earth moving vehicles': 20,
  'Plant & equipment / Machinery': 20,
  'Office equipment': 20,
  'Computer software & hardware': 33.33,
  'Loose tools / Utensils / Crockery': 33.33
};

/**
 * Immediate Write-Off Threshold for Low-Value Assets under MIRA Section 83 rules (MVR 10,000)
 */
export const LOW_VALUE_ASSET_THRESHOLD = 10000;

/**
 * Resolves the MIRA Capital Allowance rate for a given asset class string or code.
 */
export function getMiraAssetClassRate(assetClass: string): number {
  const normalized = String(assetClass || '').trim();
  if (MIRA_SECTION_83_RATES[normalized] !== undefined) {
    return MIRA_SECTION_83_RATES[normalized];
  }

  const upper = normalized.toUpperCase().replace(/[^A_Z0-9]/g, '_');
  if (MIRA_SECTION_83_RATES[upper] !== undefined) {
    return MIRA_SECTION_83_RATES[upper];
  }

  if (upper.includes('BUILDING')) return 4;
  if (upper.includes('AIRCRAFT')) return 7;
  if (upper.includes('WOODEN')) return 7;
  if (upper.includes('VESSEL') || upper.includes('BOAT')) return 5;
  if (upper.includes('FURNITURE')) return 10;
  if (upper.includes('VEHICLE') || upper.includes('CAR') || upper.includes('TRUCK')) return 20;
  if (upper.includes('OFFICE')) return 20;
  if (upper.includes('COMPUTER') || upper.includes('SOFTWARE') || upper.includes('HARDWARE') || upper.includes('LAPTOP')) return 33.33;
  if (upper.includes('TOOL') || upper.includes('CROCKERY')) return 33.33;

  return 20; // Default plant & equipment rate
}

/**
 * Normalizes asset class string to standard MIRA display string
 */
export function normalizeMiraAssetClass(assetClass: string): MiraAssetClass {
  const upper = String(assetClass || '').toUpperCase().replace(/[^A_Z0-9]/g, '_');

  if (upper.includes('BUILDING')) return 'Buildings';
  if (upper.includes('AIRCRAFT')) return 'Aircraft';
  if (upper.includes('WOODEN')) return 'Marine vessels (Wooden)';
  if (upper.includes('VESSEL') || upper.includes('BOAT') || upper.includes('MARINE')) return 'Marine vessels (Other)';
  if (upper.includes('FURNITURE')) return 'Furniture & Fittings';
  if (upper.includes('EARTH')) return 'Earth moving vehicles';
  if (upper.includes('VEHICLE') || upper.includes('MOTOR') || upper.includes('CAR') || upper.includes('TRUCK')) return 'Motor vehicles';
  if (upper.includes('OFFICE')) return 'Office equipment';
  if (upper.includes('COMPUTER') || upper.includes('SOFTWARE') || upper.includes('HARDWARE') || upper.includes('LAPTOP')) return 'Computer software & hardware';
  if (upper.includes('TOOL') || upper.includes('CROCKERY') || upper.includes('UTENSIL')) return 'Loose tools / Utensils / Crockery';

  return 'Plant & equipment / Machinery';
}

let assetSequence = 100;

/**
 * Creates a structured FixedAssetRecord
 */
export function createFixedAssetRecord(params: {
  assetId?: string;
  entityId?: string;
  outletId?: string;
  transactionId?: string;
  documentId?: string;
  assetName: string;
  assetClass: MiraAssetClassCode | MiraAssetClass | string;
  acquisitionDate: string;
  cost?: number;
  costPrice?: number;
  salvageValue?: number;
  taxYearAcquired?: number;
  daysInServiceThisYear?: number;
  isDisposed?: boolean;
  disposalDate?: string;
  disposalValue?: number;
  disposalProceeds?: number;
  notes?: string;
}): FixedAssetRecord {
  const dateStr = params.acquisitionDate || new Date().toISOString().split('T')[0];
  const year = params.taxYearAcquired || new Date(dateStr).getFullYear();
  const assetId = params.assetId || `AST-${year}-${String(assetSequence++).padStart(6, '0')}`;
  const cost = Number(params.cost ?? params.costPrice ?? 0);
  const normalizedClass = normalizeMiraAssetClass(params.assetClass);
  const rate = getMiraAssetClassRate(params.assetClass);

  const disposalValue = params.disposalProceeds ?? params.disposalValue;

  return {
    assetId,
    entityId: params.entityId || 'COMPANY-001',
    outletId: params.outletId || 'OUTLET-001',
    transactionId: params.transactionId,
    documentId: params.documentId,
    assetName: params.assetName,
    assetClass: normalizedClass,
    acquisitionDate: dateStr,
    costPrice: cost,
    miraCapitalAllowanceRate: rate,
    openingWDV: 0,
    additionsInYear: cost,
    disposalsInYear: params.isDisposed ? (disposalValue || 0) : 0,
    capitalAllowanceClaimed: 0,
    closingWDV: cost,
    taxYear: year,
    accountingPeriodStart: `${year}-01-01`,
    accountingPeriodEnd: `${year}-12-31`,
    notes: params.notes,
    isDisposed: params.isDisposed || false,
    disposalDate: params.disposalDate,
    disposalValue,
    // Attach additional alias fields for developer convenience
    ...(params as any),
    cost,
    salvageValue: params.salvageValue || 0,
    taxYearAcquired: year,
    daysInServiceThisYear: params.daysInServiceThisYear,
    disposalProceeds: disposalValue
  } as unknown as FixedAssetRecord;
}

/**
 * Pipeline helper to turn a capital asset purchase transaction into a FixedAssetRecord
 */
export function createFixedAssetFromTransaction(tx: TransactionRecord): FixedAssetRecord {
  const assetClass = (tx as any).miraAssetClass || (tx as any).targetAssetClass || 'Plant & equipment / Machinery';

  return createFixedAssetRecord({
    transactionId: tx.transactionId,
    documentId: tx.sourceId,
    entityId: tx.entityId,
    outletId: tx.outletId,
    assetName: tx.description || 'Capital Asset Purchase',
    assetClass,
    acquisitionDate: tx.transactionDate,
    cost: tx.amount,
    taxYearAcquired: tx.taxYear
  });
}
