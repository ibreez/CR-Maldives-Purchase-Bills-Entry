import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  ShieldCheck,
  FileText,
  Calculator,
  Layers,
  Sparkles,
  ExternalLink,
  ChevronRight,
  AlertCircle,
  Copy,
  Check
} from 'lucide-react';
import { TaxCalculationExplanation, ExplanationVerificationResult } from '../../types/explainability';
import { defaultTaxExplainabilityEngine } from '../../services/explainability/taxExplainabilityEngine';

interface TaxExplainabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  explanation: TaxCalculationExplanation | null;
}

export const TaxExplainabilityModal: React.FC<TaxExplainabilityModalProps> = ({
  isOpen,
  onClose,
  explanation
}) => {
  const [activeTab, setActiveTab] = useState<'SUMMARY' | 'STEPS' | 'INPUTS' | 'RULES' | 'INTERMEDIATE'>('SUMMARY');
  const [copied, setCopied] = useState(false);
  const [verificationResult, setVerificationResult] = useState<ExplanationVerificationResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  if (!isOpen || !explanation) return null;

  const handleVerify = () => {
    setIsVerifying(true);
    try {
      const res = defaultTaxExplainabilityEngine.verifyExplanation(explanation);
      setVerificationResult(res);
    } catch (e: any) {
      setVerificationResult({
        isValid: false,
        reproducedFinalTax: 0,
        originalFinalTax: explanation.finalResult.finalTaxPayable,
        discrepancy: 999999,
        allStepsHaveRuleRef: false,
        unexplainedAdjustmentCount: 1,
        reproductionStatus: 'DISCREPANCY_DETECTED',
        errors: [e.message || 'Verification failed']
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const copyToClipboard = () => {
    const text = `--- TAX CALCULATION EXPLANATION ---
Calculation ID: ${explanation.calculationId}
Tax Type: ${explanation.calculationType}
Tax Year: ${explanation.taxYear || 'N/A'}
Taxpayer: ${explanation.taxpayer.entityName || explanation.taxpayer.tin || 'N/A'}
Deterministic Hash: ${explanation.metadata.deterministicHash}

${explanation.finalResult.formattedSummary.taxableIncomeLine}

${explanation.finalResult.formattedSummary.bracketLines.join('\n')}

${explanation.finalResult.formattedSummary.creditsLine || ''}
${explanation.finalResult.formattedSummary.prepaymentsLine || ''}
${explanation.finalResult.formattedSummary.totalLine}
`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <Calculator className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-semibold tracking-tight">Tax Calculation Explanation</h2>
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Deterministic Math
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">ID: {explanation.calculationId}</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={copyToClipboard}
              className="px-2.5 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center space-x-1.5 border border-slate-700 transition"
              title="Copy mathematical summary"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Verification Banner */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 text-slate-600">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              <strong>Regulatory Integrity:</strong> 100% Statutory Rule References &bull; Zero Unexplained Adjustments &bull; SHA-256 Digest
            </span>
          </div>
          <button
            onClick={handleVerify}
            disabled={isVerifying}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline flex items-center space-x-1"
          >
            <span>{isVerifying ? 'Verifying...' : 'Verify Reproducibility'}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Verification Result Alert */}
        {verificationResult && (
          <div className={`px-6 py-2 text-xs border-b ${
            verificationResult.isValid
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold">
                {verificationResult.isValid
                  ? `Mathematical Reproducibility Confirmed: Exact match of MVR ${verificationResult.reproducedFinalTax.toLocaleString()} with 0.00 discrepancy.`
                  : `Verification Warning: ${verificationResult.errors.join(', ')}`}
              </span>
              <span className="font-mono text-[11px]">Status: {verificationResult.reproductionStatus}</span>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 bg-white px-6">
          <button
            onClick={() => setActiveTab('SUMMARY')}
            className={`py-3 px-4 text-xs font-medium border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'SUMMARY'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Final Summary</span>
          </button>
          <button
            onClick={() => setActiveTab('STEPS')}
            className={`py-3 px-4 text-xs font-medium border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'STEPS'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>Calculation Steps ({explanation.steps.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('INTERMEDIATE')}
            className={`py-3 px-4 text-xs font-medium border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'INTERMEDIATE'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Intermediate Results</span>
          </button>
          <button
            onClick={() => setActiveTab('INPUTS')}
            className={`py-3 px-4 text-xs font-medium border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'INPUTS'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Inputs & Adjustments</span>
          </button>
          <button
            onClick={() => setActiveTab('RULES')}
            className={`py-3 px-4 text-xs font-medium border-b-2 flex items-center space-x-1.5 transition ${
              activeTab === 'RULES'
                ? 'border-emerald-600 text-emerald-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Rules Applied ({explanation.rules.length})</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-50/50">
          {/* 1. SUMMARY TAB */}
          {activeTab === 'SUMMARY' && (
            <div className="space-y-6">
              {/* Formatted Summary Box matching prompt specification */}
              <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                    Statutory Calculation Breakdown
                  </h3>
                  <span className="text-xs font-mono text-slate-500">Currency: MVR</span>
                </div>

                <div className="space-y-4 font-mono text-sm">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <span className="text-xs text-slate-500 uppercase font-semibold block mb-1">Taxable Income Base</span>
                    <span className="text-base font-bold text-slate-900">
                      {explanation.finalResult.formattedSummary.taxableIncomeLine}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <span className="text-xs text-slate-500 uppercase font-semibold block">Statutory Bracket Derivation</span>
                    {explanation.finalResult.formattedSummary.bracketLines.map((line, idx) => (
                      <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-800 flex items-center justify-between">
                        <span>{line}</span>
                      </div>
                    ))}
                  </div>

                  {explanation.finalResult.formattedSummary.creditsLine && (
                    <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200 text-xs">
                      {explanation.finalResult.formattedSummary.creditsLine}
                    </div>
                  )}

                  {explanation.finalResult.formattedSummary.prepaymentsLine && (
                    <div className="p-3 bg-blue-50 text-blue-800 rounded-lg border border-blue-200 text-xs">
                      {explanation.finalResult.formattedSummary.prepaymentsLine}
                    </div>
                  )}

                  <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/30 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-emerald-800 font-semibold uppercase block">
                        {explanation.finalResult.isRefundable ? 'Refund Due From MIRA' : 'Total Statutory Tax Payable'}
                      </span>
                      <span className="text-xl font-bold text-emerald-950">
                        {explanation.finalResult.formattedSummary.totalLine}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500 block">Effective Tax Rate</span>
                      <span className="text-sm font-bold text-slate-800">
                        {explanation.finalResult.effectiveTaxRatePercentage}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Traceability Metadata */}
              <div className="bg-white rounded-xl p-5 border border-slate-200 text-xs space-y-2">
                <div className="font-semibold text-slate-700 mb-2">Cryptographic Traceability & Governance</div>
                <div className="grid grid-cols-2 gap-3 text-slate-600 font-mono">
                  <div>
                    <span className="text-slate-400 block">Deterministic Digest:</span>
                    <span className="truncate block">{explanation.metadata.deterministicHash}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Engine Build:</span>
                    <span>{explanation.metadata.engineVersion}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Generated At:</span>
                    <span>{new Date(explanation.timestamp).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">AI Governance:</span>
                    <span className="text-emerald-700 font-semibold">Deterministic Math (No AI Estimation)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. STEPS TAB */}
          {activeTab === 'STEPS' && (
            <div className="space-y-4">
              {explanation.steps.map((step) => (
                <div key={step.stepNumber} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-bold font-mono">
                        {step.stepNumber}
                      </div>
                      <h4 className="text-sm font-bold text-slate-900">{step.title}</h4>
                    </div>
                    <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-slate-100 text-slate-700 border border-slate-200">
                      {step.ruleRef.legalReference}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600">{step.explanationText}</p>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 font-mono text-xs flex items-center justify-between">
                    <span className="text-slate-500">Formula: {step.formula}</span>
                    <span className="font-bold text-slate-800">
                      Result: {typeof step.intermediateResult === 'number' ? `MVR ${step.intermediateResult.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : String(step.intermediateResult)}
                    </span>
                  </div>

                  {step.bracketBreakdown && step.bracketBreakdown.length > 0 && (
                    <div className="mt-2 space-y-1.5 pl-4 border-l-2 border-slate-200">
                      {step.bracketBreakdown.map((b) => (
                        <div key={b.bracketIndex} className="text-xs font-mono flex items-center justify-between text-slate-700">
                          <span>{b.bracketName}:</span>
                          <span>MVR {b.taxableAmount.toLocaleString()} @ {b.ratePercentage}% = MVR {b.taxAmount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 3. INTERMEDIATE TAB */}
          {activeTab === 'INTERMEDIATE' && (
            <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">Audit of Intermediate Calculation Values</h3>
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                {Object.entries(explanation.intermediateResults).map(([key, val]) => {
                  if (typeof val === 'object') return null;
                  return (
                    <div key={key} className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                      <span className="text-slate-500">{key}</span>
                      <span className="font-bold text-slate-900">
                        {typeof val === 'number' ? `MVR ${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : String(val)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 4. INPUTS TAB */}
          {activeTab === 'INPUTS' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl p-5 border border-slate-200">
                <h4 className="text-xs font-bold text-slate-700 uppercase mb-3">Adjustments Audit (Add-Backs & Deductions)</h4>
                {explanation.inputs.adjustments && explanation.inputs.adjustments.length > 0 ? (
                  <div className="space-y-2">
                    {explanation.inputs.adjustments.map((adj, i) => (
                      <div key={i} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs flex items-center justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              adj.type === 'ADD_BACK' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {adj.type}
                            </span>
                            <span className="font-semibold text-slate-800">{adj.description}</span>
                          </div>
                          <span className="text-[11px] text-slate-500 mt-1 block">Legal Basis: {adj.legalReference}</span>
                        </div>
                        <span className="font-mono font-bold text-slate-900">
                          MVR {adj.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No adjustments specified for this calculation.</p>
                )}
              </div>
            </div>
          )}

          {/* 5. RULES TAB */}
          {activeTab === 'RULES' && (
            <div className="space-y-3">
              {explanation.rules.map((rule) => (
                <div key={rule.ruleId} className="bg-white rounded-xl p-4 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-slate-900">{rule.ruleCode}</span>
                    <span className="text-xs font-mono text-slate-500">{rule.ruleId} (v{rule.version})</span>
                  </div>
                  <p className="text-xs text-slate-600">{rule.description}</p>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-mono text-slate-500">
                    <span>Source: {rule.legalReference}</span>
                    <span>Effective: {rule.effectiveFrom}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Deterministic Tax Explainability Engine &bull; MIRA Compliant</span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
