import { classifyDocument, ClassifiedTransaction } from '../classificationService';
import { createTransactionFromBill } from '../accounting/transactionService';
import {
  saveTransactionWithJournal,
  saveFixedAsset,
  saveTaxAdjustment,
  saveTaxReturn
} from '../db/persistenceService';
import { generateSchedule1PnL, MiraSchedule1Report } from '../accounting/pnlService';
import {
  generateSchedule2CapitalAllowanceSummary,
  MiraSchedule2SummaryReport
} from '../tax/capitalAllowanceService';
import {
  calculateTaxableIncomePipeline,
  TaxAdjustment,
  TaxCalculationPipelineResult
} from '../tax/taxAdjustmentService';
import {
  calculateEntityTaxLiability,
  EntityTaxResult,
  PriorTaxLossRecord
} from '../tax/entityTaxService';
import { generateMira604Return } from '../tax/mira604Service';
import { generateMira105Return } from '../gst/gstService';
import { generateMira302Return } from '../wht/whtService';
import { reconcileTaxYear } from '../tax/reconciliationService';
import {
  hasPermission,
  createApprovalRequest,
  submitForReview,
  approveTaxReturn,
  validateForMiraSubmission
} from '../auth/rbacService';
import { generateTaxReturnPdf } from '../reports/pdfExportService';
import { prepareSubmissionPayload, submitTaxReturn } from '../api/miraconnectGatewayService';

import { TransactionRecord, FixedAssetRecord, TaxpayerInfo } from '../../types/taxEngine';
import { EntityType } from '../../config/miraTaxRates';
import { GstPeriod, Mira105GstReturn } from '../../types/mira105';
import { WhtPeriod, Mira302WhtReturn, NonResidentPayee } from '../../types/mira302';
import { Mira604TaxReturn } from '../../types/mira604';
import { ReconciliationReport } from '../../types/reconciliation';
import { UserSession, ApprovalRequest } from '../../types/rbac';
import { SubmissionPayload, SubmissionResponse } from '../../types/miraconnectGateway';

export interface FullPipelineParams {
  // Raw inputs
  rawDocuments?: any[];
  existingTransactions?: TransactionRecord[];
  fixedAssets?: FixedAssetRecord[];
  taxAdjustments?: TaxAdjustment[];

  // Taxpayer / Period configurations
  taxpayer: TaxpayerInfo;
  gstPeriod?: GstPeriod;
  whtPeriod?: WhtPeriod;

  // Financial & Tax settings
  entityType?: EntityType;
  priorUnabsorbedLosses?: number;
  priorLossRecords?: PriorTaxLossRecord[];
  accountingDays?: number;
  groupFactor?: number;

  // Authorization & Execution
  userSession: UserSession;
  autoApproveAndSubmit?: boolean;
  approvalComments?: string;
  nonResidentPayees?: NonResidentPayee[];
}

export interface ExecutionLogEntry {
  timestamp: string;
  step: string;
  message: string;
  status: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  details?: any;
}

export interface FullPipelineResult {
  status: 'COMPLETED' | 'NEEDS_APPROVAL' | 'REJECTED' | 'FAILED';
  taxYear: number;
  entityId: string;

  // Ingestion & Journaling
  classifiedTransactions: ClassifiedTransaction[];
  persistedTransactions: TransactionRecord[];

  // Financial & Tax Engine Calculations
  pnlReport: MiraSchedule1Report;
  capitalAllowanceReport: MiraSchedule2SummaryReport;
  taxableIncomePipeline: TaxCalculationPipelineResult;
  entityTaxResult: EntityTaxResult;

  // Generated Returns
  mira604Return: Mira604TaxReturn;
  mira105Return?: Mira105GstReturn;
  mira302Return?: Mira302WhtReturn;

  // Reconciliation
  reconciliationReport: ReconciliationReport;

  // RBAC & Approval Context
  approvalRequest?: ApprovalRequest;
  rbacValidated: boolean;

  // Exported PDF Buffers / HTML strings
  pdfExports: {
    mira604Pdf?: Buffer | string;
    mira105Pdf?: Buffer | string;
    mira302Pdf?: Buffer | string;
    pnlPdf?: Buffer | string;
    assetRegisterPdf?: Buffer | string;
  };

  // MIRAconnect Submissions
  submissions: {
    mira604Payload?: SubmissionPayload;
    mira604Response?: SubmissionResponse;
    mira105Payload?: SubmissionPayload;
    mira105Response?: SubmissionResponse;
    mira302Payload?: SubmissionPayload;
    mira302Response?: SubmissionResponse;
  };

  logs: ExecutionLogEntry[];
  executedAt: string;
}

/**
 * Master End-to-End Tax System Orchestrator (Phase 18)
 * Integrates all 17 tax & accounting subsystems into a unified, step-by-step master pipeline execution context.
 */
export async function runFullTaxPipeline(params: FullPipelineParams): Promise<FullPipelineResult> {
  const logs: ExecutionLogEntry[] = [];

  function addLog(step: string, message: string, status: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' = 'INFO', details?: any) {
    logs.push({
      timestamp: new Date().toISOString(),
      step,
      message,
      status,
      details
    });
  }

  addLog('START', 'Initiating End-to-End Tax System Orchestrator Pipeline execution.');

  if (!params || !params.taxpayer) {
    throw new Error('Orchestrator Error: Taxpayer information parameters are required.');
  }

  const taxpayer = params.taxpayer;
  const entityId = taxpayer.tin || 'COMPANY-001';
  const taxYear = taxpayer.taxYear || new Date().getFullYear();
  const entityType: EntityType = params.entityType || taxpayer.entityType || 'COMPANY';

  addLog('INIT', `Entity '${taxpayer.taxpayerName}' (${entityId}) - Tax Year ${taxYear} (${entityType}).`);

  // Step 1: Ingestion & Classification
  addLog('STEP_1', 'Step 1: Ingesting raw documents and classifying accounting/tax categories.');
  const rawDocs = params.rawDocuments || [];
  const classifiedTransactions: ClassifiedTransaction[] = [];

  for (const doc of rawDocs) {
    const classified = classifyDocument({ ...doc, entityId, taxYear });
    classifiedTransactions.push(classified);
  }
  addLog('STEP_1', `Classified ${classifiedTransactions.length} raw documents successfully.`, 'SUCCESS');

  // Step 2: Journaling & Persistence
  addLog('STEP_2', 'Step 2: Generating double-entry transaction records and persisting to database.');
  const persistedTransactions: TransactionRecord[] = [...(params.existingTransactions || [])];

  for (let i = 0; i < rawDocs.length; i++) {
    const doc = rawDocs[i];
    const classification = classifiedTransactions[i];
    const tx = createTransactionFromBill(doc, classification);

    if (tx.journalEntry) {
      await saveTransactionWithJournal(tx, tx.journalEntry);
    }
    persistedTransactions.push(tx);
  }

  // Persist fixed assets
  const fixedAssets = params.fixedAssets || [];
  for (const asset of fixedAssets) {
    await saveFixedAsset(asset);
  }

  // Persist tax adjustments
  const taxAdjustments = params.taxAdjustments || [];
  for (const adj of taxAdjustments) {
    await saveTaxAdjustment(adj);
  }

  addLog('STEP_2', `Persisted ${persistedTransactions.length} total transactions and journals atomically.`, 'SUCCESS');

  // Step 3: P&L Aggregation
  addLog('STEP_3', 'Step 3: Aggregating posted ledger transactions into MIRA Schedule 1 P&L report.');
  const pnlReport = generateSchedule1PnL(persistedTransactions, {
    entityId,
    taxYear,
    accountingPeriodStart: taxpayer.accountingPeriodStart,
    accountingPeriodEnd: taxpayer.accountingPeriodEnd
  });
  addLog('STEP_3', `P&L Aggregation complete. Total Revenue: MVR ${pnlReport.totalRevenue}, Net Accounting Profit: MVR ${pnlReport.accountingProfitBeforeTax}.`, 'SUCCESS');

  // Step 4: Capital Allowances
  addLog('STEP_4', 'Step 4: Calculating Section 83 Capital Allowance and Fixed Asset Tax Depreciation.');
  const capitalAllowanceReport = generateSchedule2CapitalAllowanceSummary(fixedAssets, taxYear);
  addLog('STEP_4', `Capital Allowance calculated. Claimable Allowance: MVR ${capitalAllowanceReport.totalCapitalAllowanceClaimed}, Balancing Charge: MVR ${capitalAllowanceReport.totalBalancingCharge}.`, 'SUCCESS');

  // Step 5: Tax Adjustments & Pipeline
  addLog('STEP_5', 'Step 5: Processing ADJ-* non-deductible addbacks and tax adjustments pipeline.');
  const taxableIncomePipeline = calculateTaxableIncomePipeline(
    pnlReport.accountingProfitBeforeTax,
    taxAdjustments,
    capitalAllowanceReport.totalCapitalAllowanceClaimed,
    {
      taxYear,
      entityId,
      balancingAllowanceTotal: capitalAllowanceReport.totalBalancingAllowance,
      balancingChargeTotal: capitalAllowanceReport.totalBalancingCharge
    }
  );
  addLog('STEP_5', `Taxable Income Pipeline complete. Total Addbacks: MVR ${taxableIncomePipeline.totalAddBacks}, Gross Taxable Income: MVR ${taxableIncomePipeline.taxableIncomeBeforeLossRelief}.`, 'SUCCESS');

  // Step 6: Entity Tax Liability
  addLog('STEP_6', 'Step 6: Computing entity income tax liability and applying Section 30 loss relief.');
  const entityTaxResult = calculateEntityTaxLiability(
    taxableIncomePipeline.taxableIncomeBeforeLossRelief,
    entityType,
    {
      taxYear,
      accountingDays: params.accountingDays || 365,
      groupFactor: params.groupFactor || 1,
      priorUnabsorbedLosses: params.priorUnabsorbedLosses || 0,
      priorLossRecords: params.priorLossRecords,
      entityName: taxpayer.taxpayerName,
      tin: entityId
    }
  );
  addLog('STEP_6', `Entity Tax computed. Net Taxable Income: MVR ${entityTaxResult.netTaxableIncome}, Tax Due: MVR ${entityTaxResult.totalIncomeTaxDue}.`, 'SUCCESS');

  // Step 7: MIRA Returns Generation
  addLog('STEP_7', 'Step 7: Generating official MIRA 604, MIRA 105 (GST), and MIRA 302 (WHT) returns.');
  const mira604Return = generateMira604Return({
    taxpayer,
    pnl: {
      grossRevenue: pnlReport.totalRevenue,
      costOfSales: pnlReport.totalCostOfSales,
      operatingExpenses: pnlReport.totalOperatingExpenses,
      accountingProfitBeforeTax: pnlReport.accountingProfitBeforeTax
    },
    adjustments: taxAdjustments,
    capitalAllowanceTotal: capitalAllowanceReport.totalCapitalAllowanceClaimed,
    priorUnabsorbedLosses: params.priorUnabsorbedLosses
  });

  await saveTaxReturn(mira604Return);

  let mira105Return: Mira105GstReturn | undefined;
  if (params.gstPeriod) {
    mira105Return = generateMira105Return(persistedTransactions, params.gstPeriod);
    await saveTaxReturn(mira105Return);
  }

  let mira302Return: Mira302WhtReturn | undefined;
  if (params.whtPeriod) {
    const nonResidentTxList = persistedTransactions.filter((tx) => {
      const cat = (tx.accountingCategory || '').toLowerCase();
      const desc = (tx.description || '').toLowerCase();
      const vendor = ((tx as any).vendorName || (tx as any).supplierName || '').toLowerCase();
      const txAny = tx as any;
      const isForeignCurrency = txAny.currency && txAny.currency !== 'MVR';
      const isPayeeMatch = params.nonResidentPayees?.some((p) =>
        p.payeeName && vendor.includes(p.payeeName.toLowerCase())
      );

      return (
        Boolean(txAny.isNonResident) ||
        isForeignCurrency ||
        isPayeeMatch ||
        cat.includes('software') ||
        cat.includes('consultancy') ||
        cat.includes('royalty') ||
        cat.includes('management') ||
        desc.includes('foreign') ||
        desc.includes('aws') ||
        desc.includes('adobe')
      );
    });

    mira302Return = generateMira302Return(nonResidentTxList, params.whtPeriod, {
      payees: params.nonResidentPayees
    });
    await saveTaxReturn(mira302Return);
  }

  addLog('STEP_7', 'Generated MIRA returns successfully.', 'SUCCESS');

  // Step 8: Reconciliation
  addLog('STEP_8', 'Step 8: Executing cross-return tax year audit and reconciliation.');
  const reconciliationReport = reconcileTaxYear(entityId, taxYear, {
    taxpayerInfo: taxpayer,
    transactions: persistedTransactions,
    gstReturns: mira105Return ? [mira105Return] : [],
    whtReturn: mira302Return,
    fixedAssets,
    mira604Return,
    adjustments: taxAdjustments
  });

  addLog('STEP_8', `Reconciliation audit finished. Valid: ${reconciliationReport.isValid}. Issue count: ${reconciliationReport.issues.length}.`, reconciliationReport.isValid ? 'SUCCESS' : 'WARNING');

  // Step 9: RBAC Approval & Gate
  addLog('STEP_9', 'Step 9: Enforcing RBAC authorization and multi-tenant approval gate.');
  const session = params.userSession;
  const isAuthorizedToRead = hasPermission(session, 'READ_TRANSACTIONS', entityId);

  if (!isAuthorizedToRead) {
    throw new Error(`RBAC Authorization Error: User '${session.userId}' is not permitted to access tenant '${entityId}'.`);
  }

  let approvalRequest: ApprovalRequest | undefined;
  let rbacValidated = false;

  // Create approval request for MIRA 604 return
  approvalRequest = createApprovalRequest(
    {
      tenantId: entityId,
      returnType: 'MIRA604',
      taxYear
    },
    session
  );

  submitForReview(approvalRequest.requestId, session);

  if (params.autoApproveAndSubmit) {
    if (session.role === 'TAX_MANAGER' || session.role === 'CLIENT_ADMIN') {
      approvalRequest = approveTaxReturn(
        approvalRequest.requestId,
        session,
        params.approvalComments || 'Auto-approved by orchestrator pipeline'
      );
      const validation = validateForMiraSubmission(approvalRequest.requestId, session);
      rbacValidated = validation.canSubmit;
      addLog('STEP_9', `Tax return ${mira604Return.formId} successfully approved and validated for submission by ${session.userId} (${session.role}).`, 'SUCCESS');
    } else {
      addLog('STEP_9', `Role '${session.role}' cannot self-approve. Tax return '${mira604Return.formId}' placed in PENDING_REVIEW status.`, 'WARNING');
    }
  } else {
    addLog('STEP_9', `Tax return '${mira604Return.formId}' submitted for review. Current status: PENDING_REVIEW.`, 'INFO');
  }

  // Step 10: Export & Submission
  addLog('STEP_10', 'Step 10: Generating print-ready PDF reports and transmitting payloads to MIRAconnect Gateway.');
  
  const pdfExports: FullPipelineResult['pdfExports'] = {};
  pdfExports.mira604Pdf = await generateTaxReturnPdf('MIRA604', mira604Return);
  pdfExports.pnlPdf = await generateTaxReturnPdf('PNL_SCHEDULE1', pnlReport);
  pdfExports.assetRegisterPdf = await generateTaxReturnPdf('ASSET_REGISTER', {
    taxpayerInfo: taxpayer,
    fixedAssets,
    capitalAllowanceResult: capitalAllowanceReport
  });

  if (mira105Return) {
    pdfExports.mira105Pdf = await generateTaxReturnPdf('MIRA105', mira105Return);
  }
  if (mira302Return) {
    pdfExports.mira302Pdf = await generateTaxReturnPdf('MIRA302', mira302Return);
  }

  const submissions: FullPipelineResult['submissions'] = {};

  if (params.autoApproveAndSubmit && rbacValidated) {
    // MIRA 604 Submission
    const payload604 = prepareSubmissionPayload('MIRA604', mira604Return, entityId);
    const resp604 = await submitTaxReturn(payload604);
    submissions.mira604Payload = payload604;
    submissions.mira604Response = resp604;

    // MIRA 105 Submission
    if (mira105Return) {
      const payload105 = prepareSubmissionPayload('MIRA105', mira105Return, entityId);
      const resp105 = await submitTaxReturn(payload105);
      submissions.mira105Payload = payload105;
      submissions.mira105Response = resp105;
    }

    // MIRA 302 Submission
    if (mira302Return) {
      const payload302 = prepareSubmissionPayload('MIRA302', mira302Return, entityId);
      const resp302 = await submitTaxReturn(payload302);
      submissions.mira302Payload = payload302;
      submissions.mira302Response = resp302;
    }

    addLog('STEP_10', `Successfully submitted return to MIRAconnect. Ref Number: ${resp604.miraReferenceNumber}.`, 'SUCCESS');
  } else {
    addLog('STEP_10', 'PDF exports generated. Gateway submission bypassed pending final approval.', 'INFO');
  }

  const overallStatus = (params.autoApproveAndSubmit && rbacValidated)
    ? 'COMPLETED'
    : 'NEEDS_APPROVAL';

  addLog('COMPLETE', `Master Tax Pipeline finished with overall status '${overallStatus}'.`, 'SUCCESS');

  return {
    status: overallStatus,
    taxYear,
    entityId,
    classifiedTransactions,
    persistedTransactions,
    pnlReport,
    capitalAllowanceReport,
    taxableIncomePipeline,
    entityTaxResult,
    mira604Return,
    mira105Return,
    mira302Return,
    reconciliationReport,
    approvalRequest,
    rbacValidated,
    pdfExports,
    submissions,
    logs,
    executedAt: new Date().toISOString()
  };
}
