import {
  ApprovalRiskAssessment,
  ApprovalRiskCategory,
  ApprovalWorkflowError,
  ApprovalWorkflowItem,
  CreateWorkflowItemInput,
  InvalidWorkflowTransitionError,
  RejectedItemPostingError,
  RequiredApprovalRole,
  UnauthorizedApprovalError,
  AIApprovalForbiddenError,
  WorkflowStatus
} from '../../types/approvalWorkflow';
import { Role, UserSession } from '../../types/rbac';
import { hasPermission } from '../auth/rbacService';
import { recordAuditEvent } from '../audit/auditService';

export const CAPITALIZATION_THRESHOLD_MVR = 10000;

// In-memory workflow item store
const workflowStore = new Map<string, ApprovalWorkflowItem>();

/**
 * Checks if an actor ID or session represents an automated AI model, bot, or OCR agent.
 * The AI model cannot approve or reject accounting transactions or tax returns.
 */
export function isAIActor(sessionOrActorId: UserSession | string | undefined | null): boolean {
  if (!sessionOrActorId) return false;
  
  const actorStr = typeof sessionOrActorId === 'string'
    ? sessionOrActorId.toUpperCase()
    : `${sessionOrActorId.userId || ''} ${(sessionOrActorId as any).role || ''} ${(sessionOrActorId as any).actorType || ''}`.toUpperCase();

  const aiSignatures = [
    'AI_MODEL',
    'GEMINI',
    'GPT',
    'CLAUDE',
    'LLM',
    'OCR_ENGINE',
    'OCR_MODEL',
    'AUTO_BOT',
    'SYSTEM_AI',
    'AGENT_ROBOT'
  ];

  return aiSignatures.some(sig => actorStr.includes(sig));
}

/**
 * Maps any system role (including legacy role names) to a canonical approval role level.
 */
export function getRoleApprovalLevel(role: Role): number {
  switch (role) {
    case 'DATA_ENTRY':
    case 'CLIENT_USER':
      return 1;
    case 'ACCOUNTANT':
    case 'STAFF_ACCOUNTANT':
      return 2;
    case 'TAX_REVIEWER':
    case 'TAX_MANAGER':
      return 3;
    case 'FINANCE_MANAGER':
      return 4;
    case 'ADMIN':
    case 'CLIENT_ADMIN':
      return 5;
    case 'AUDITOR':
      return 0; // Read-only, no approval rights
    default:
      return 0;
  }
}

/**
 * Assesses the risk of a transaction, document, adjustment, or tax return.
 * Determines the required review role and triggers according to Phase 37 mandates.
 */
export function assessRisk(input: CreateWorkflowItemInput): ApprovalRiskAssessment {
  const triggers: string[] = [];
  let riskCategory: ApprovalRiskCategory = 'NONE';
  let requiredRole: RequiredApprovalRole = 'ACCOUNTANT';
  let requiresSpecialistReview = false;
  let riskScore = 0;

  // 1. Tax Return Approval (Highest statutory impact)
  if (input.isTaxReturn || input.itemType === 'TAX_RETURN') {
    riskCategory = 'TAX_RETURN_APPROVAL';
    requiredRole = 'TAX_REVIEWER';
    requiresSpecialistReview = true;
    riskScore += 100;
    triggers.push('Statutory tax return filing package requires Tax Reviewer or Finance Manager sign-off');
  }

  // 2. Tax Adjustments (Add-backs, deductions, fines, donations, private expenses)
  if (input.isTaxAdjustment || input.itemType === 'TAX_ADJUSTMENT') {
    riskCategory = 'TAX_ADJUSTMENTS';
    requiredRole = 'TAX_REVIEWER';
    requiresSpecialistReview = true;
    riskScore += 80;
    triggers.push('Statutory tax adjustment affecting taxable profit requires Tax Reviewer approval');
  }

  // 3. Blocked GST Claims (Section 21/22 of GST Act)
  if (input.isBlockedGst) {
    riskCategory = 'BLOCKED_GST';
    requiredRole = 'TAX_REVIEWER';
    requiresSpecialistReview = true;
    riskScore += 75;
    triggers.push('Blocked input tax claim or non-deductible GST classification requires Tax Reviewer review');
  }

  // 4. Non-Resident Withholding Tax (NWT) under Section 55 ITA
  if (input.isNwtApplicable) {
    riskCategory = 'NWT';
    requiredRole = 'TAX_REVIEWER';
    requiresSpecialistReview = true;
    riskScore += 75;
    triggers.push('Non-resident withholding tax (NWT) applies under Section 55 of Income Tax Act');
  }

  // 5. Related-Party Transactions (Section 67 / Schedule 4 Transfer Pricing)
  if (input.isRelatedParty) {
    riskCategory = 'RELATED_PARTY';
    requiredRole = 'FINANCE_MANAGER';
    requiresSpecialistReview = true;
    riskScore += 70;
    triggers.push('Related-party transaction subject to arm\'s length transfer pricing verification');
  }

  // 6. Foreign Currency Exceptions (Rate variance or non-standard FX)
  if (input.isForeignCurrencyException || (input.currency && input.currency !== 'MVR' && (input.exchangeRateVariance || 0) > 0.025)) {
    if (riskCategory === 'NONE' || riskScore < 70) {
      riskCategory = 'FOREIGN_CURRENCY_EXCEPTIONS';
      requiredRole = 'FINANCE_MANAGER';
      requiresSpecialistReview = true;
      riskScore = Math.max(riskScore, 70);
    }
    triggers.push('Foreign currency transaction with exchange rate variance requiring treasury review');
  }

  // 7. Capital Assets & Capital Allowances (Schedule 2)
  if (
    input.isCapitalAsset ||
    input.itemType === 'CAPITAL_ASSET' ||
    (input.amount >= CAPITALIZATION_THRESHOLD_MVR && !input.isForeignCurrencyException)
  ) {
    if (riskCategory === 'NONE' || riskScore < 65) {
      riskCategory = 'CAPITAL_ASSETS';
      requiredRole = 'FINANCE_MANAGER';
      requiresSpecialistReview = true;
      riskScore = Math.max(riskScore, 65);
    }
    triggers.push(`Capital asset acquisition / expenditure (>= MVR ${CAPITALIZATION_THRESHOLD_MVR.toLocaleString()}) requiring capital allowance & Schedule 2 assessment`);
  }

  // 8. Manual OCR Corrections affecting tax
  if (input.hasManualOcrCorrection) {
    if (riskCategory === 'NONE') {
      riskCategory = 'MANUAL_OCR_CORRECTIONS';
      requiredRole = 'ACCOUNTANT';
      requiresSpecialistReview = true;
      riskScore = Math.max(riskScore, 40);
    }
    triggers.push('Manual correction of OCR fields affecting tax or financial amounts requires secondary review');
  }

  // Apply manual overrides if explicitly supplied
  if (input.riskOverrides) {
    if (input.riskOverrides.riskCategory) riskCategory = input.riskOverrides.riskCategory;
    if (input.riskOverrides.requiredRole) requiredRole = input.riskOverrides.requiredRole;
    if (input.riskOverrides.requiresSpecialistReview !== undefined) {
      requiresSpecialistReview = input.riskOverrides.requiresSpecialistReview;
    }
    if (input.riskOverrides.riskTriggers) {
      triggers.push(...input.riskOverrides.riskTriggers);
    }
  }

  return {
    riskCategory,
    requiresSpecialistReview,
    requiredRole,
    riskTriggers: Array.from(new Set(triggers)),
    riskScore
  };
}

export class ApprovalWorkflowService {
  /**
   * Clears the in-memory store (for test isolation)
   */
  public static clearStore(): void {
    workflowStore.clear();
  }

  /**
   * Retrieves a single workflow item by ID
   */
  public static getItem(id: string): ApprovalWorkflowItem | undefined {
    return workflowStore.get(id);
  }

  /**
   * Lists workflow items for a tenant, optionally filtered by status, itemType, or riskCategory
   */
  public static listItems(
    tenantId: string,
    filters?: {
      status?: WorkflowStatus;
      itemType?: string;
      riskCategory?: ApprovalRiskCategory;
    }
  ): ApprovalWorkflowItem[] {
    return Array.from(workflowStore.values()).filter(item => {
      if (item.tenantId !== tenantId) return false;
      if (filters?.status && item.status !== filters.status) return false;
      if (filters?.itemType && item.itemType !== filters.itemType) return false;
      if (filters?.riskCategory && item.riskAssessment.riskCategory !== filters.riskCategory) return false;
      return true;
    });
  }

  /**
   * Creates a new approval workflow item, runs risk assessment, and logs audit event.
   */
  public static createWorkflowItem(
    input: CreateWorkflowItemInput,
    session?: UserSession
  ): ApprovalWorkflowItem {
    if (!input.tenantId || !input.tenantId.trim()) {
      throw new ApprovalWorkflowError('tenantId is required to create workflow item');
    }
    if (!input.itemId || !input.itemId.trim()) {
      throw new ApprovalWorkflowError('itemId is required to create workflow item');
    }
    if (!input.title || !input.title.trim()) {
      throw new ApprovalWorkflowError('title is required to create workflow item');
    }

    if (session && !hasPermission(session, 'CREATE_TRANSACTIONS', input.tenantId)) {
      throw new UnauthorizedApprovalError(
        `RBAC Security Error: User '${session.userId}' is not authorized to create workflow items for tenant '${input.tenantId}'`
      );
    }

    const riskAssessment = assessRisk(input);
    const now = new Date().toISOString();
    const id = input.id || `WF-${input.itemType}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    let status: WorkflowStatus = input.initialStatus || 'DRAFT';
    if (status === 'SUBMITTED' && riskAssessment.requiresSpecialistReview) {
      status = 'REVIEW_REQUIRED';
    }

    const item: ApprovalWorkflowItem = {
      id,
      tenantId: input.tenantId,
      itemType: input.itemType,
      itemId: input.itemId,
      title: input.title,
      description: input.description,
      amount: input.amount || 0,
      currency: input.currency || 'MVR',
      taxYear: input.taxYear || new Date().getFullYear(),
      status,
      riskAssessment,
      submittedBy: session ? session.userId : 'DATA_ENTRY',
      submittedAt: now,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now
    };

    workflowStore.set(id, item);

    // Record audit event
    recordAuditEvent(
      {
        tenantId: item.tenantId,
        actorId: session ? session.userId : 'DATA_ENTRY',
        eventType: 'APPROVAL_SUBMIT',
        entityType: 'WORKFLOW_ITEM',
        entityId: item.id,
        newState: item,
        reason: `Created workflow item '${item.title}' in state '${item.status}'`,
        metadata: {
          itemType: item.itemType,
          riskCategory: item.riskAssessment.riskCategory,
          requiredRole: item.riskAssessment.requiredRole
        }
      },
      session
    );

    return item;
  }

  /**
   * Submits a DRAFT or REJECTED workflow item for review.
   */
  public static submitForReview(
    itemId: string,
    session: UserSession
  ): ApprovalWorkflowItem {
    const item = workflowStore.get(itemId);
    if (!item) {
      throw new ApprovalWorkflowError(`Workflow item '${itemId}' not found`);
    }

    if (!hasPermission(session, 'READ_TRANSACTIONS', item.tenantId)) {
      throw new UnauthorizedApprovalError(
        `RBAC Security Error: User cannot access workflow item for tenant '${item.tenantId}'`
      );
    }

    if (item.status !== 'DRAFT' && item.status !== 'REJECTED') {
      throw new InvalidWorkflowTransitionError(
        `Workflow Error: Cannot submit item in '${item.status}' state. Status must be DRAFT or REJECTED.`
      );
    }

    const previousState = { ...item };
    const now = new Date().toISOString();

    const nextStatus: WorkflowStatus = item.riskAssessment.requiresSpecialistReview
      ? 'REVIEW_REQUIRED'
      : 'SUBMITTED';

    const updatedItem: ApprovalWorkflowItem = {
      ...item,
      status: nextStatus,
      submittedBy: session.userId,
      submittedAt: now,
      updatedAt: now
    };

    workflowStore.set(itemId, updatedItem);

    recordAuditEvent(
      {
        tenantId: item.tenantId,
        actorId: session.userId,
        eventType: 'APPROVAL_SUBMIT',
        entityType: 'WORKFLOW_ITEM',
        entityId: item.id,
        beforeState: previousState,
        newState: updatedItem,
        reason: `Submitted workflow item '${item.title}' for review (Transitioned to ${updatedItem.status})`
      },
      session
    );

    return updatedItem;
  }

  /**
   * Approves a workflow item. Enforces strict human-only check and role hierarchy validation.
   */
  public static approveItem(
    itemId: string,
    session: UserSession,
    comments?: string
  ): ApprovalWorkflowItem {
    // 1. Critical AI Safety Rule: The AI model cannot approve
    if (isAIActor(session)) {
      throw new AIApprovalForbiddenError(
        `Anti-AI Governance Error: AI model '${session.userId}' is strictly forbidden from approving transactions or tax adjustments. Human authorization is mandatory.`
      );
    }

    const item = workflowStore.get(itemId);
    if (!item) {
      throw new ApprovalWorkflowError(`Workflow item '${itemId}' not found`);
    }

    // 2. Tenant Isolation Check
    if (!hasPermission(session, 'READ_TRANSACTIONS', item.tenantId)) {
      throw new UnauthorizedApprovalError(
        `RBAC Security Error: User '${session.userId}' is not authorized for tenant '${item.tenantId}'`
      );
    }

    // 3. Status Transition Check
    if (item.status === 'APPROVED' || item.status === 'POSTED') {
      throw new InvalidWorkflowTransitionError(
        `Workflow Error: Item '${itemId}' is already ${item.status}`
      );
    }

    // 4. Role Hierarchy & Permission Validation
    const userRoleLevel = getRoleApprovalLevel(session.role);
    const requiredRole = item.riskAssessment.requiredRole;

    // Minimum required levels:
    // ACCOUNTANT -> Level 2
    // TAX_REVIEWER -> Level 3
    // FINANCE_MANAGER -> Level 4
    // ADMIN -> Level 5
    let minRequiredLevel = 2; // Default for standard classifications
    if (requiredRole === 'TAX_REVIEWER') minRequiredLevel = 3;
    else if (requiredRole === 'FINANCE_MANAGER') minRequiredLevel = 4;
    else if (requiredRole === 'ADMIN') minRequiredLevel = 5;

    // Explicit check for Auditor / Data Entry (Level 0 or 1)
    if (userRoleLevel < minRequiredLevel) {
      throw new UnauthorizedApprovalError(
        `Unauthorized Approval Error: User '${session.userId}' with role '${session.role}' lacks sufficient authorization to approve '${item.riskAssessment.riskCategory}' item. Required role: '${requiredRole}' (or higher).`
      );
    }

    // Explicit check for Tax Adjustment approval permission
    if (item.riskAssessment.riskCategory === 'TAX_ADJUSTMENTS') {
      if (!hasPermission(session, 'APPROVE_TAX_ADJUSTMENTS', item.tenantId) && !hasPermission(session, 'APPROVE_ADJUSTMENTS', item.tenantId)) {
        throw new UnauthorizedApprovalError(
          `Unauthorized Approval Error: User '${session.userId}' with role '${session.role}' lacks 'APPROVE_TAX_ADJUSTMENTS' permission for tax adjustments`
        );
      }
      // Re-affirm: Tax reviewer or higher required
      if (userRoleLevel < 3) {
        throw new UnauthorizedApprovalError(
          `Unauthorized Approval Error: Tax adjustments strictly require TAX_REVIEWER, FINANCE_MANAGER, or ADMIN approval. Current role: '${session.role}'`
        );
      }
    }

    // Explicit check for Tax Returns
    if (item.riskAssessment.riskCategory === 'TAX_RETURN_APPROVAL') {
      if (!hasPermission(session, 'APPROVE_TAX_RETURNS', item.tenantId) && !hasPermission(session, 'SUBMIT_TAX_RETURNS', item.tenantId)) {
        throw new UnauthorizedApprovalError(
          `Unauthorized Approval Error: User '${session.userId}' lacks 'APPROVE_TAX_RETURNS' permission for statutory tax returns`
        );
      }
      if (userRoleLevel < 3) {
        throw new UnauthorizedApprovalError(
          `Unauthorized Approval Error: Statutory tax returns require TAX_REVIEWER, FINANCE_MANAGER, or ADMIN approval`
        );
      }
    }

    // 5. Apply Approval
    const previousState = { ...item };
    const now = new Date().toISOString();

    const updatedItem: ApprovalWorkflowItem = {
      ...item,
      status: 'APPROVED',
      reviewedBy: session.userId,
      reviewedAt: now,
      approvalComments: comments || 'Approved in accordance with accounting and tax review standards',
      updatedAt: now
    };

    workflowStore.set(itemId, updatedItem);

    // 6. Record Tamper-Evident Audit Event
    recordAuditEvent(
      {
        tenantId: item.tenantId,
        actorId: session.userId,
        eventType: 'APPROVAL_APPROVE',
        action: 'TRANSACTION_APPROVAL',
        entityType: 'WORKFLOW_ITEM',
        entityId: item.id,
        beforeState: previousState,
        newState: updatedItem,
        reason: `Approved workflow item '${item.title}' (${item.riskAssessment.riskCategory}). ${comments || ''}`.trim(),
        metadata: {
          approverRole: session.role,
          riskCategory: item.riskAssessment.riskCategory,
          amount: item.amount
        }
      },
      session
    );

    return updatedItem;
  }

  /**
   * Rejects a workflow item with a mandatory rejection reason.
   */
  public static rejectItem(
    itemId: string,
    rejectionReason: string,
    session: UserSession
  ): ApprovalWorkflowItem {
    // 1. Critical AI Safety Rule
    if (isAIActor(session)) {
      throw new AIApprovalForbiddenError(
        'Anti-AI Governance Error: AI models cannot reject or alter accounting records. Human review is mandatory.'
      );
    }

    const item = workflowStore.get(itemId);
    if (!item) {
      throw new ApprovalWorkflowError(`Workflow item '${itemId}' not found`);
    }

    if (!hasPermission(session, 'READ_TRANSACTIONS', item.tenantId)) {
      throw new UnauthorizedApprovalError(
        `RBAC Security Error: User cannot access workflow item for tenant '${item.tenantId}'`
      );
    }

    if (!rejectionReason || !rejectionReason.trim()) {
      throw new ApprovalWorkflowError(
        'Approval Workflow Error: A non-empty rejectionReason is mandatory when rejecting a workflow item.'
      );
    }

    const userRoleLevel = getRoleApprovalLevel(session.role);
    if (userRoleLevel < 2) {
      throw new UnauthorizedApprovalError(
        `Unauthorized Action Error: Role '${session.role}' is not authorized to reject workflow items.`
      );
    }

    if (item.status === 'POSTED') {
      throw new InvalidWorkflowTransitionError(
        `Workflow Error: Cannot reject item '${itemId}' because it is already POSTED to the general ledger.`
      );
    }

    const previousState = { ...item };
    const now = new Date().toISOString();

    const updatedItem: ApprovalWorkflowItem = {
      ...item,
      status: 'REJECTED',
      reviewedBy: session.userId,
      reviewedAt: now,
      rejectionReason: rejectionReason.trim(),
      updatedAt: now
    };

    workflowStore.set(itemId, updatedItem);

    recordAuditEvent(
      {
        tenantId: item.tenantId,
        actorId: session.userId,
        eventType: 'APPROVAL_REJECT',
        entityType: 'WORKFLOW_ITEM',
        entityId: item.id,
        beforeState: previousState,
        newState: updatedItem,
        reason: `Rejected workflow item '${item.title}'. Reason: ${rejectionReason}`,
        metadata: {
          reviewerRole: session.role,
          rejectionReason
        }
      },
      session
    );

    return updatedItem;
  }

  /**
   * Validates if a workflow item can be posted to the general ledger.
   * Enforces: Rejected records cannot post. Unapproved items cannot post.
   */
  public static validateCanPostToLedger(
    itemId: string,
    tenantId: string
  ): { canPost: boolean; item: ApprovalWorkflowItem } {
    const item = workflowStore.get(itemId);
    if (!item) {
      throw new ApprovalWorkflowError(`Workflow item '${itemId}' not found`);
    }

    if (item.tenantId !== tenantId) {
      throw new UnauthorizedApprovalError(
        `Tenant Isolation Violation: Item belongs to tenant '${item.tenantId}', not '${tenantId}'`
      );
    }

    if (item.status === 'REJECTED') {
      throw new RejectedItemPostingError(
        `General Ledger Posting Blocked: Workflow item '${itemId}' has status 'REJECTED' (Reason: '${item.rejectionReason}'). Rejected records cannot post to the general ledger.`
      );
    }

    if (item.status !== 'APPROVED') {
      throw new ApprovalWorkflowError(
        `General Ledger Posting Blocked: Workflow item '${itemId}' is in '${item.status}' state. Items must be APPROVED prior to posting.`
      );
    }

    return { canPost: true, item };
  }

  /**
   * Marks an approved item as POSTED upon successful double-entry ledger commitment.
   */
  public static markItemAsPosted(
    itemId: string,
    postedJournalId: string,
    session?: UserSession
  ): ApprovalWorkflowItem {
    const item = workflowStore.get(itemId);
    if (!item) {
      throw new ApprovalWorkflowError(`Workflow item '${itemId}' not found`);
    }

    if (item.status === 'REJECTED') {
      throw new RejectedItemPostingError(
        `Posting Error: Cannot post rejected workflow item '${itemId}'`
      );
    }

    if (item.status !== 'APPROVED' && item.status !== 'POSTED') {
      throw new ApprovalWorkflowError(
        `Posting Error: Cannot mark item as posted when in '${item.status}' state. Must be APPROVED first.`
      );
    }

    const previousState = { ...item };
    const now = new Date().toISOString();

    const updatedItem: ApprovalWorkflowItem = {
      ...item,
      status: 'POSTED',
      postedJournalId,
      postedAt: now,
      updatedAt: now
    };

    workflowStore.set(itemId, updatedItem);

    recordAuditEvent(
      {
        tenantId: item.tenantId,
        actorId: session ? session.userId : item.reviewedBy || 'SYSTEM',
        eventType: 'JOURNAL_POSTING',
        entityType: 'WORKFLOW_ITEM',
        entityId: item.id,
        beforeState: previousState,
        newState: updatedItem,
        reason: `Committed approved workflow item '${item.title}' to general ledger (Journal: ${postedJournalId})`,
        metadata: {
          journalId: postedJournalId
        }
      },
      session
    );

    return updatedItem;
  }
}
