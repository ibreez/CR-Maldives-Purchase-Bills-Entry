import {
  TaxAdjustmentEntry,
  CreateTaxAdjustmentInput,
  TaxBridgeCalculationParams,
  TaxBridgeResult,
  TaxAdjustmentCategory,
  TaxAdjustmentDirection
} from '../../types/taxAdjustment';
import { defaultRuleResolver, RuleResolver } from '../../regulatory/resolvers/ruleResolver';
import { hasPermission } from '../auth/rbacService';
import { UserSession } from '../../types/rbac';

export class TaxAdjustmentLedgerEngine {
  private adjustments: Map<string, TaxAdjustmentEntry> = new Map();
  private ruleResolver: RuleResolver;

  constructor(ruleResolver: RuleResolver = defaultRuleResolver) {
    this.ruleResolver = ruleResolver;
  }

  /**
   * Resets the in-memory ledger store (useful for clean test runs)
   */
  public clearStore(): void {
    this.adjustments.clear();
  }

  /**
   * Creates a formal Tax Adjustment record with deterministic rule resolution and duplicate prevention.
   */
  public createAdjustment(input: CreateTaxAdjustmentInput): TaxAdjustmentEntry {
    const {
      tenantId,
      taxYear,
      accountCode,
      category,
      description,
      amount,
      sourceJournalId,
      sourceJournalLineId,
      sourceTransactionId,
      supportingDocument
    } = input;

    if (!tenantId || !tenantId.trim()) {
      throw new Error('[TaxAdjustmentError] tenantId is required');
    }

    if (!taxYear || taxYear < 2000 || taxYear > 2100) {
      throw new Error(`[TaxAdjustmentError] Invalid taxYear: ${taxYear}`);
    }

    if (!accountCode || !accountCode.trim()) {
      throw new Error('[TaxAdjustmentError] accountCode is required for tax adjustment traceability');
    }

    if (amount === undefined || amount === null || isNaN(amount) || amount <= 0) {
      throw new Error(`[TaxAdjustmentError] Adjustment amount must be a positive number. Received: ${amount}`);
    }

    if (!category) {
      throw new Error('[TaxAdjustmentError] Tax adjustment category is required');
    }

    // 1. Prevent Duplicate Adjustments
    const existingList = Array.from(this.adjustments.values()).filter(
      adj =>
        adj.tenantId === tenantId &&
        adj.taxYear === taxYear &&
        !adj.isReversed &&
        adj.reviewStatus !== 'REJECTED'
    );

    const isDuplicate = existingList.some(existing => {
      // Check duplicate matching criteria
      const sameSource =
        (sourceJournalLineId && existing.sourceJournalLineId === sourceJournalLineId) ||
        (sourceJournalId && existing.sourceJournalId === sourceJournalId && existing.accountCode === accountCode) ||
        (sourceTransactionId && existing.sourceTransactionId === sourceTransactionId && existing.accountCode === accountCode) ||
        (supportingDocument && existing.supportingDocument === supportingDocument && existing.accountCode === accountCode);

      const sameCategory = existing.category === category;
      return sameSource && sameCategory;
    });

    if (isDuplicate) {
      throw new Error(
        `[TaxAdjustmentError] Duplicate adjustment rejected. An active adjustment for category '${category}', account '${accountCode}', and source already exists in tax year ${taxYear}.`
      );
    }

    // 2. Deterministic Rule Resolution (No hardcoded or guessed tax treatment)
    const resolvedRule = this.ruleResolver.resolveTaxAdjustmentRule(
      input.adjustmentCode || category,
      input.transactionDate || `${taxYear}-01-01`
    );

    const adjustmentCode = input.adjustmentCode || resolvedRule.adjustmentCode;
    const direction: TaxAdjustmentDirection = input.direction || resolvedRule.direction;
    const ruleId = input.ruleId || resolvedRule.rule.ruleId;
    const ruleVersion = input.ruleVersion || resolvedRule.rule.version;
    const legalReference = input.legalReference || resolvedRule.legalReference;

    const id = input.id || `ADJ-${taxYear}-${tenantId.substring(0, 6)}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const now = new Date().toISOString();

    const entry: TaxAdjustmentEntry = {
      id,
      tenantId,
      taxYear,
      sourceJournalId,
      sourceJournalLineId,
      sourceTransactionId,
      supportingDocument,
      accountCode,
      accountName: input.accountName || `Account ${accountCode}`,
      adjustmentCode,
      category,
      description: description || resolvedRule.rule.description,
      amount: Math.round(amount * 100) / 100,
      direction,
      ruleId,
      ruleVersion,
      legalReference,
      reviewStatus: input.reviewStatus || 'PENDING',
      approvedBy: input.approvedBy,
      approvedAt: input.approvedAt || (input.reviewStatus === 'APPROVED' ? now : undefined),
      isReversed: false,
      createdAt: now,
      updatedAt: now
    };

    this.adjustments.set(entry.id, entry);
    return entry;
  }

  /**
   * Approves a pending tax adjustment. Enforces strict RBAC permissions.
   */
  public approveAdjustment(
    adjustmentId: string,
    session: UserSession,
    tenantId: string
  ): TaxAdjustmentEntry {
    const entry = this.adjustments.get(adjustmentId);
    if (!entry) {
      throw new Error(`[TaxAdjustmentError] Adjustment '${adjustmentId}' not found`);
    }

    if (entry.tenantId !== tenantId) {
      throw new Error(`[TaxAdjustmentError] Multi-tenant mismatch: Adjustment belongs to tenant '${entry.tenantId}'`);
    }

    // Anti-AI Rule Check
    if (session.userId && (session.userId.includes('AI') || session.userId.includes('GEMINI') || session.userId.includes('BOT'))) {
      throw new Error(
        `[Anti-AI Governance Error] AI model '${session.userId}' is strictly forbidden from approving tax adjustments. Human authorization is mandatory.`
      );
    }

    // RBAC Security Check: Must have APPROVE_ADJUSTMENTS permission & Tax Reviewer / Finance Manager / Admin role
    const authorizedRoles = ['TAX_REVIEWER', 'TAX_MANAGER', 'FINANCE_MANAGER', 'ADMIN', 'CLIENT_ADMIN'];
    if (!hasPermission(session, 'APPROVE_ADJUSTMENTS', tenantId) || !authorizedRoles.includes(session.role)) {
      throw new Error(
        `[RBAC Security Error] User '${session.userId}' with role '${session.role}' is not authorized to approve tax adjustments for tenant '${tenantId}'. Tax Reviewer, Finance Manager, or Admin role is required.`
      );
    }

    if (entry.isReversed) {
      throw new Error(`[TaxAdjustmentError] Cannot approve reversed adjustment '${adjustmentId}'`);
    }

    const now = new Date().toISOString();
    const updated: TaxAdjustmentEntry = {
      ...entry,
      reviewStatus: 'APPROVED',
      approvedBy: session.userId,
      approvedAt: now,
      updatedAt: now
    };

    this.adjustments.set(adjustmentId, updated);
    return updated;
  }

  /**
   * Rejects a pending tax adjustment with a mandatory audit reason.
   */
  public rejectAdjustment(
    adjustmentId: string,
    session: UserSession,
    tenantId: string,
    rejectionReason: string
  ): TaxAdjustmentEntry {
    const entry = this.adjustments.get(adjustmentId);
    if (!entry) {
      throw new Error(`[TaxAdjustmentError] Adjustment '${adjustmentId}' not found`);
    }

    if (entry.tenantId !== tenantId) {
      throw new Error(`[TaxAdjustmentError] Multi-tenant mismatch: Adjustment belongs to tenant '${entry.tenantId}'`);
    }

    if (!hasPermission(session, 'APPROVE_ADJUSTMENTS', tenantId)) {
      throw new Error(
        `[RBAC Security Error] User '${session.userId}' with role '${session.role}' is not authorized to reject tax adjustments for tenant '${tenantId}'`
      );
    }

    const now = new Date().toISOString();
    const updated: TaxAdjustmentEntry = {
      ...entry,
      reviewStatus: 'REJECTED',
      rejectionReason: rejectionReason || 'Rejected by tax reviewer',
      updatedAt: now
    };

    this.adjustments.set(adjustmentId, updated);
    return updated;
  }

  /**
   * Propagates accounting journal reversals into the tax adjustment ledger.
   * When a source journal is reversed in the General Ledger, linked tax adjustments
   * are automatically reversed to maintain complete accounting-to-tax reconciliation.
   */
  public handleJournalReversal(reversalInfo: {
    originalJournalId: string;
    reversalJournalId: string;
    tenantId: string;
    reversalDate?: string;
    reason?: string;
  }): TaxAdjustmentEntry[] {
    const { originalJournalId, reversalJournalId, tenantId, reason } = reversalInfo;
    const linkedAdjustments = Array.from(this.adjustments.values()).filter(
      adj =>
        adj.tenantId === tenantId &&
        adj.sourceJournalId === originalJournalId &&
        !adj.isReversed &&
        adj.reviewStatus !== 'REJECTED'
    );

    const generatedReversals: TaxAdjustmentEntry[] = [];
    const now = new Date().toISOString();

    for (const original of linkedAdjustments) {
      // 1. Mark original as reversed
      const markedOriginal: TaxAdjustmentEntry = {
        ...original,
        isReversed: true,
        reversalJournalId,
        updatedAt: now
      };
      this.adjustments.set(original.id, markedOriginal);

      // 2. Create the offsetting reversal adjustment entry
      const oppositeDirection: TaxAdjustmentDirection =
        original.direction === 'ADD_BACK' ? 'DEDUCTION' : 'ADD_BACK';

      const reversalId = `REV-${original.id}`;
      const reversalEntry: TaxAdjustmentEntry = {
        id: reversalId,
        tenantId,
        taxYear: original.taxYear,
        sourceJournalId: reversalJournalId,
        sourceJournalLineId: original.sourceJournalLineId ? `REV-${original.sourceJournalLineId}` : undefined,
        sourceTransactionId: original.sourceTransactionId,
        supportingDocument: original.supportingDocument,
        accountCode: original.accountCode,
        accountName: original.accountName,
        adjustmentCode: original.adjustmentCode,
        category: original.category,
        description: `Reversal of [${original.id}] due to Journal Reversal ${reversalJournalId}: ${reason || 'Accounting Reversal'}`,
        amount: original.amount,
        direction: oppositeDirection,
        ruleId: original.ruleId,
        ruleVersion: original.ruleVersion,
        legalReference: original.legalReference,
        reviewStatus: original.reviewStatus, // Inherits review status
        approvedBy: original.approvedBy,
        approvedAt: now,
        isReversed: false,
        reversalOfAdjustmentId: original.id,
        reversalJournalId,
        createdAt: now,
        updatedAt: now
      };

      this.adjustments.set(reversalId, reversalEntry);
      generatedReversals.push(reversalEntry);
    }

    return generatedReversals;
  }

  /**
   * Generates the authoritative Tax Reconciliation Bridge from Accounting Profit to Taxable Income.
   */
  public generateTaxBridge(params: TaxBridgeCalculationParams): TaxBridgeResult {
    const {
      tenantId,
      taxYear,
      accountingProfit,
      capitalAllowanceTotal = 0,
      balancingAllowanceTotal = 0,
      balancingChargeTotal = 0,
      includePendingAdjustments = false
    } = params;

    // Use supplied adjustments or query in-memory store for the tenant & tax year
    const pool = params.adjustments || Array.from(this.adjustments.values()).filter(
      adj => adj.tenantId === tenantId && adj.taxYear === taxYear
    );

    const addBacksBreakdown: Record<string, number> = {};
    const deductionsBreakdown: Record<string, number> = {};
    const validAdjustments: TaxAdjustmentEntry[] = [];

    let totalAddBacks = 0;
    let totalAllowableDeductions = 0;
    let approvedCount = 0;
    let pendingCount = 0;
    let totalAmountBridged = 0;

    for (const adj of pool) {
      if (adj.reviewStatus === 'REJECTED') continue;
      if (adj.reviewStatus === 'PENDING') {
        pendingCount++;
        if (!includePendingAdjustments) continue;
      }
      if (adj.reviewStatus === 'APPROVED') {
        approvedCount++;
      }

      validAdjustments.push(adj);
      totalAmountBridged += adj.amount;

      const codeKey = adj.adjustmentCode || adj.category;

      if (adj.direction === 'ADD_BACK') {
        totalAddBacks += adj.amount;
        addBacksBreakdown[codeKey] = (addBacksBreakdown[codeKey] || 0) + adj.amount;
      } else {
        totalAllowableDeductions += adj.amount;
        deductionsBreakdown[codeKey] = (deductionsBreakdown[codeKey] || 0) + adj.amount;
      }
    }

    // Step 1: Accounting Profit
    const profit = Math.round(Number(accountingProfit || 0) * 100) / 100;

    // Step 2: Adjusted Profit before Capital Allowance
    const adjustedProfitBeforeCA = Math.round((profit + totalAddBacks - totalAllowableDeductions) * 100) / 100;

    // Step 3: Net Capital Allowance Deduction
    const netCA = Math.round(
      (capitalAllowanceTotal + balancingAllowanceTotal - balancingChargeTotal) * 100
    ) / 100;

    // Step 4: Taxable Income Before Loss Relief
    const rawTaxableIncome = Math.round((adjustedProfitBeforeCA - netCA) * 100) / 100;
    const isTaxLoss = rawTaxableIncome < 0;
    const taxableIncomeBeforeLossRelief = isTaxLoss ? 0 : rawTaxableIncome;
    const taxLossAmount = isTaxLoss ? Math.abs(rawTaxableIncome) : 0;

    return {
      tenantId,
      taxYear,
      accountingProfit: profit,
      totalAddBacks: Math.round(totalAddBacks * 100) / 100,
      addBacksBreakdown,
      totalAllowableDeductions: Math.round(totalAllowableDeductions * 100) / 100,
      deductionsBreakdown,
      adjustedProfitBeforeCapitalAllowance: adjustedProfitBeforeCA,
      capitalAllowanceDeduction: Math.round(capitalAllowanceTotal * 100) / 100,
      balancingAllowance: Math.round(balancingAllowanceTotal * 100) / 100,
      balancingCharge: Math.round(balancingChargeTotal * 100) / 100,
      netCapitalAllowanceDeduction: netCA,
      taxableIncomeBeforeLossRelief,
      isTaxLoss,
      taxLossAmount,
      traceableAdjustments: validAdjustments,
      lineageSummary: {
        totalAdjustmentsCount: validAdjustments.length,
        approvedCount,
        pendingCount,
        totalAmountBridged: Math.round(totalAmountBridged * 100) / 100
      },
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Retrieves all adjustments for a given tenant and tax year.
   */
  public getAdjustments(tenantId: string, taxYear?: number): TaxAdjustmentEntry[] {
    return Array.from(this.adjustments.values()).filter(
      adj => adj.tenantId === tenantId && (taxYear === undefined || adj.taxYear === taxYear)
    );
  }

  /**
   * Retrieves full audit trace for a specific adjustment.
   */
  public getAdjustmentTrace(adjustmentId: string): TaxAdjustmentEntry | undefined {
    return this.adjustments.get(adjustmentId);
  }
}

export const defaultTaxAdjustmentLedgerEngine = new TaxAdjustmentLedgerEngine();
