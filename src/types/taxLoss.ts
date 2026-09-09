/**
 * Authoritative Tax Loss Lot Models & Interfaces (Phase 31)
 * Compliant with Maldives Income Tax Act (Act No. 25/2019) Section 30 & MIRA Regulations
 */

export type TaxLossStatus = 'ACTIVE' | 'PARTIALLY_UTILISED' | 'FULLY_UTILISED' | 'EXPIRED' | 'FORFEITED';

export interface TaxLossLot {
  id: string;
  tenantId: string;
  originTaxYear: number;
  originalAmount: number;
  utilisedAmount: number;
  remainingAmount: number;
  expiryTaxYear: number;
  status: TaxLossStatus;
  
  // Regulatory & Statutory Lineage
  ruleId: string;
  ruleVersion?: string;
  legalReference?: string;
  
  // Audit & Metadata
  calculationId?: string; // Originating calculation or loss determination ID
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaxLossUtilisation {
  id: string;
  tenantId: string;
  lossLotId: string;
  originTaxYear: number;
  taxYear: number;
  amount: number;
  calculationId?: string;
  approvedBy?: string;
  createdAt: string;
}

export interface CreateTaxLossLotInput {
  id?: string;
  tenantId: string;
  originTaxYear: number;
  amount: number;
  calculationId?: string;
  notes?: string;
  ruleId?: string;
  ruleVersion?: string;
  legalReference?: string;
  createdAt?: string;
}

export interface ApplyLossReliefParams {
  tenantId: string;
  taxYear: number;
  taxableProfitBeforeLoss: number;
  calculationId?: string;
  approvedBy?: string;
  applicableRegulatoryVersion?: string;
  lossLots?: TaxLossLot[];
  ordering?: 'FIFO' | 'EXPIRY_FIRST';
}

export interface TaxLossLotAuditEntry {
  lotId: string;
  originTaxYear: number;
  openingRemaining: number;
  utilisedInYear: number;
  closingRemaining: number;
  status: TaxLossStatus;
  isExpired: boolean;
}

export interface LossReliefResult {
  tenantId: string;
  taxYear: number;
  taxableProfitBeforeLoss: number;
  totalLossReliefApplied: number;
  netTaxableIncome: number;
  isTaxLoss: boolean;
  currentYearTaxLossGenerated: number;
  utilisations: TaxLossUtilisation[];
  activeLossLots: TaxLossLot[];
  expiredLossLots: TaxLossLot[];
  auditTrail: TaxLossLotAuditEntry[];
  stepExplanations: string[];
  calculatedAt: string;
}

export interface TaxLossScheduleItem {
  originTaxYear: number;
  originalAmount: number;
  broughtForwardUnutilised: number;
  currentYearAddition: number;
  currentYearUtilisation: number;
  currentYearExpired: number;
  carriedForwardRemaining: number;
  expiryTaxYear: number;
  status: TaxLossStatus;
}

export interface TaxLossSchedule {
  tenantId: string;
  taxYear: number;
  items: TaxLossScheduleItem[];
  totalBroughtForward: number;
  totalAdditions: number;
  totalUtilised: number;
  totalExpired: number;
  totalCarriedForward: number;
  generatedAt: string;
}
