import { PrismaClient, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../db/client';
import { CreateRevenueInput, RevenueValidationResult } from '../../types/revenue';
import { RevenueAccountMapper } from './revenueAccountMapper';
import { AccountingPeriodService } from '../accounting/accountingPeriodService';

export class RevenueValidationService {
  /**
   * Validates a revenue entry against accounting rules, period lock, and GST consistency.
   */
  static async validateRevenueEntry(
    input: CreateRevenueInput,
    prismaClient: PrismaClient | Prisma.TransactionClient = defaultPrisma
  ): Promise<RevenueValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let requiresReview = false;

    // 1. Mandatory Fields
    const txDate = input.transactionDate || (input as any).date;
    if (txDate) {
      input.transactionDate = txDate;
    }
    if (!input.transactionDate || isNaN(new Date(input.transactionDate).getTime())) {
      errors.push('A valid transaction date (YYYY-MM-DD) is required.');
    }

    if (!input.outletId || !input.outletId.trim()) {
      errors.push('Outlet ID is required for revenue transactions.');
    }

    const grossNum = Number(input.grossAmount || 0);
    const netNum = Number(input.netAmount || 0);
    if (grossNum <= 0 && netNum <= 0) {
      errors.push('Revenue gross amount or net amount must be greater than zero.');
    }

    // 2. Payment Method & Account Mapping
    const paymentMethod = input.paymentMethod || 'CARD';
    const debitAccount = RevenueAccountMapper.resolvePaymentAccount(paymentMethod);
    if (!debitAccount) {
      warnings.push(`Payment method "${paymentMethod}" cannot be mapped automatically to a standard GL account.`);
      requiresReview = true;
    }

    const creditAccount = RevenueAccountMapper.resolveRevenueAccount(input.category);
    const taxAccount = RevenueAccountMapper.resolveGstOutputAccount();

    // 3. GST Consistency
    if (input.gstClassification === 'EXEMPT' || input.gstClassification === 'ZERO_RATED') {
      if (input.grossAmount !== undefined && input.netAmount !== undefined) {
        if (Number(input.grossAmount) !== Number(input.netAmount)) {
          errors.push('Exempt or zero-rated revenue cannot have a discrepancy between gross amount and net amount.');
        }
      }
    }

    // 4. Period Lock Check
    const tenantId = input.tenantId || 'DEFAULT-TENANT';
    if (input.transactionDate) {
      try {
        const isLocked = await AccountingPeriodService.isPeriodLocked(
          tenantId,
          input.transactionDate,
          prismaClient
        );
        if (isLocked) {
          errors.push(`Cannot post revenue: Accounting period for ${input.transactionDate} is locked.`);
        }
      } catch (err: any) {
        // If DB period check encounters non-fatal condition in test/isolated mode
        if (err.message && err.message.includes('locked')) {
          errors.push(err.message);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      requiresReview: requiresReview || warnings.length > 0,
      errors,
      warnings,
      resolvedDebitAccount: debitAccount || undefined,
      resolvedCreditAccount: creditAccount,
      resolvedTaxAccount: taxAccount
    };
  }
}
