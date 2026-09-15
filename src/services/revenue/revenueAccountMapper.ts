import { RevenuePaymentMethod } from '../../types/revenue';

export interface AccountMapping {
  code: string;
  name: string;
  accountType: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
}

export const REVENUE_STANDARD_ACCOUNTS = {
  CASH: {
    code: '1000-CASH-ON-HAND',
    name: 'Cash on Hand',
    accountType: 'ASSET' as const
  },
  CASH_1010: {
    code: '1010-CASH-ON-HAND',
    name: 'Cash on Hand',
    accountType: 'ASSET' as const
  },
  CARD: {
    code: '1010-BANK-MVR',
    name: 'Bank MVR Account',
    accountType: 'ASSET' as const
  },
  CARD_CLEARING: {
    code: '1020-CARD-CLEARING',
    name: 'Card / POS Clearing',
    accountType: 'ASSET' as const
  },
  BANK: {
    code: '1000-BANK-ACCOUNT',
    name: 'Cash and Bank',
    accountType: 'ASSET' as const
  },
  ONLINE: {
    code: '1030-ONLINE-CLEARING',
    name: 'Online Gateway Clearing',
    accountType: 'ASSET' as const
  },
  CREDIT: {
    code: '1100-ACCOUNTS-RECEIVABLE',
    name: 'Accounts Receivable',
    accountType: 'ASSET' as const
  },
  OTHER: {
    code: '1000-BANK-ACCOUNT',
    name: 'Cash and Bank',
    accountType: 'ASSET' as const
  },
  OPERATING_REVENUE: {
    code: '4000-OPERATING-REVENUE',
    name: 'Operating Revenue',
    accountType: 'REVENUE' as const
  },
  GST_OUTPUT_TAX: {
    code: '2200-GST-OUTPUT-TAX',
    name: 'GST Output Tax Payable',
    accountType: 'LIABILITY' as const
  }
};

export class RevenueAccountMapper {
  /**
   * Resolves the debit asset account for a given payment method.
   * If mapping cannot be resolved, returns null so caller can mark REVIEW_REQUIRED.
   */
  static resolvePaymentAccount(
    paymentMethod: RevenuePaymentMethod | string,
    options?: { useClearingAccounts?: boolean }
  ): AccountMapping | null {
    const norm = String(paymentMethod || '').trim().toUpperCase();

    if (!norm) {
      return null;
    }

    // Explicit clearing account requests
    if (norm === 'CARD_CLEARING' || norm === '1020-CARD-CLEARING' || (options?.useClearingAccounts && (norm.includes('CARD') || norm.includes('POS')))) {
      return REVENUE_STANDARD_ACCOUNTS.CARD_CLEARING;
    }

    if (norm === '1010-CASH-ON-HAND') {
      return REVENUE_STANDARD_ACCOUNTS.CASH_1010;
    }

    if (norm === 'CASH' || norm.includes('CASH')) {
      return REVENUE_STANDARD_ACCOUNTS.CASH;
    }

    if (norm === 'CARD' || norm.includes('CARD') || norm.includes('POS')) {
      return REVENUE_STANDARD_ACCOUNTS.CARD;
    }

    if (norm === 'BANK' || norm.includes('BANK') || norm.includes('TRANSFER')) {
      return REVENUE_STANDARD_ACCOUNTS.BANK;
    }

    if (norm === 'ONLINE' || norm.includes('GATEWAY') || norm.includes('BML')) {
      return REVENUE_STANDARD_ACCOUNTS.ONLINE;
    }

    if (norm === 'CREDIT' || norm.includes('RECEIVABLE')) {
      return REVENUE_STANDARD_ACCOUNTS.CREDIT;
    }

    if (norm === 'OTHER') {
      return REVENUE_STANDARD_ACCOUNTS.OTHER;
    }

    // Fallback: If an account cannot be resolved, flag as REVIEW_REQUIRED rather than inventing accounts.
    return null;
  }

  /**
   * Resolves all double-entry accounts (debit payment, credit revenue, credit tax).
   */
  static resolveAccounts(params: {
    paymentMethod?: RevenuePaymentMethod | string;
    category?: string;
    sector?: string;
    useClearingAccounts?: boolean;
  }): {
    debitAccount: AccountMapping;
    creditRevenueAccount: AccountMapping;
    creditGstAccount: AccountMapping;
  } {
    const debitAccount =
      this.resolvePaymentAccount(params.paymentMethod || 'CARD', { useClearingAccounts: params.useClearingAccounts }) ||
      REVENUE_STANDARD_ACCOUNTS.BANK;
    const creditRevenueAccount = this.resolveRevenueAccount(params.category);
    const creditGstAccount = this.resolveGstOutputAccount();
    return { debitAccount, creditRevenueAccount, creditGstAccount };
  }

  /**
   * Resolves the operating revenue credit account.
   */
  static resolveRevenueAccount(_category?: string): AccountMapping {
    return REVENUE_STANDARD_ACCOUNTS.OPERATING_REVENUE;
  }

  /**
   * Resolves the GST output tax credit account.
   */
  static resolveGstOutputAccount(): AccountMapping {
    return REVENUE_STANDARD_ACCOUNTS.GST_OUTPUT_TAX;
  }
}
