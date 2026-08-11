import { TransactionRecord, Transaction } from './taxEngine';

export type ValidationSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  field: string;
  message: string;
  suggestedFix?: string;
}

export interface ReconciliationSummary {
  totalRevenueLedger: number;
  totalRevenueReturn: number;
  totalGstOutputLedger: number;
  totalGstOutputReturn: number;
  totalWhtLedger: number;
  totalWhtReturn: number;
  totalAssetAdditionsLedger?: number;
  totalAssetAdditionsSchedule2?: number;
  totalCapitalAllowanceClaimed?: number;
}

export interface ReconciliationReport {
  taxYear: number;
  entityId: string;
  isValid: boolean;
  issues: ValidationIssue[];
  summary: ReconciliationSummary;
  generatedAt: string;
}

export type AnyTransaction = TransactionRecord | Transaction;
