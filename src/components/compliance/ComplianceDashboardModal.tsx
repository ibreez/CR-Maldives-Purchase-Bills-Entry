/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CheckCircle2,
  MinusCircle,
  RefreshCw,
  X,
  ExternalLink,
  BookOpen,
  Filter,
  FileSpreadsheet,
  Building2,
  Calendar,
  Layers,
  Globe,
  Calculator,
  Lock,
  UserCheck,
  GitPullRequest
} from "lucide-react";
import {
  ComplianceCategory,
  ComplianceDashboardResult,
  ComplianceIssue,
  ComplianceStatus,
  CategoryComplianceSummary
} from "../../types/complianceDashboard";
import {
  PreFilingResult,
  PreFilingCheck,
  PreFilingIssue,
  PreFilingCheckCode
} from "../../types/preFiling";
import { AuthUser, BillRecord, Outlet } from "../../types";

interface ComplianceDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  outlets: Outlet[];
  selectedOutlet: string;
  selectedQuarter: string;
  authToken?: string | null;
  onNavigateToBill?: (billId: string) => void;
}

export const ComplianceDashboardModal: React.FC<ComplianceDashboardModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  outlets,
  selectedOutlet,
  selectedQuarter,
  authToken,
  onNavigateToBill
}) => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ComplianceDashboardResult | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<ComplianceCategory | "ALL">("ALL");
  const [severityFilter, setSeverityFilter] = useState<"ALL" | "BLOCKED" | "WARNING">("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  // Phase 45 — Pre-Filing Control Engine State
  const [activeTab, setActiveTab] = useState<"DIMENSIONS" | "PRE_FILING">("DIMENSIONS");
  const [preFilingResult, setPreFilingResult] = useState<PreFilingResult | null>(null);
  const [preFilingLoading, setPreFilingLoading] = useState(false);
  const [preFilingFilter, setPreFilingFilter] = useState<"ALL" | "BLOCKED" | "WARNING" | "PASS">("ALL");
  const [generatingPackage, setGeneratingPackage] = useState(false);
  const [packageFeedback, setPackageFeedback] = useState<{
    type: "success" | "error";
    message: string;
    details?: any;
  } | null>(null);

  const fetchPreFilingCheck = async () => {
    setPreFilingLoading(true);
    setPackageFeedback(null);
    try {
      const token = authToken || localStorage.getItem("cr_auth_token");
      const res = await fetch("/api/compliance/pre-filing/check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          period: selectedQuarter !== "ALL" ? selectedQuarter : "2026-Q1",
          outletId: selectedOutlet !== "ALL" ? selectedOutlet : "ALL"
        })
      });

      if (res.ok) {
        const data = await res.json();
        setPreFilingResult(data.result);
      }
    } catch (err) {
      console.error("Error fetching pre-filing check:", err);
    } finally {
      setPreFilingLoading(false);
    }
  };

  const handleGeneratePackage = async () => {
    setGeneratingPackage(true);
    setPackageFeedback(null);
    try {
      const token = authToken || localStorage.getItem("cr_auth_token");
      const res = await fetch("/api/filing/package/ready-for-filing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          taxpayer: {
            taxpayerName: "Maldives Corporate Taxpayer Ltd",
            tin: "1001234GST001",
            entityType: "COMPANY",
            accountingPeriodStart: "2026-01-01",
            accountingPeriodEnd: "2026-12-31",
            presentationCurrency: "MVR"
          },
          taxYear: 2026,
          period: selectedQuarter !== "ALL" ? selectedQuarter : "2026-Q1"
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setPackageFeedback({
          type: "error",
          message: data.error || "Package generation was refused by the pre-filing control engine.",
          details: data.preFilingResult
        });
        if (data.preFilingResult) {
          setPreFilingResult(data.preFilingResult);
        }
      } else {
        setPackageFeedback({
          type: "success",
          message: `Statutory Filing Package Generated Successfully! Root Checksum: ${data.packageChecksum?.substring(0, 16)}... (${data.totalFiles} files verified)`
        });
      }
    } catch (err: any) {
      setPackageFeedback({
        type: "error",
        message: err.message || "Failed to communicate with filing package generator."
      });
    } finally {
      setGeneratingPackage(false);
    }
  };

  const fetchCompliance = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedQuarter !== "ALL") params.append("period", selectedQuarter);
      if (selectedOutlet !== "ALL") params.append("outletId", selectedOutlet);

      const token = authToken || localStorage.getItem("cr_auth_token");
      const res = await fetch(`/api/compliance/dashboard?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (res.ok) {
        const data: ComplianceDashboardResult = await res.json();
        setResult(data);
      } else {
        console.error("Failed to fetch compliance dashboard:", await res.text());
      }
    } catch (err) {
      console.error("Error fetching compliance dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCompliance();
    }
  }, [isOpen, selectedOutlet, selectedQuarter]);

  if (!isOpen) return null;

  // Status Badge Component
  const renderStatusBadge = (status: ComplianceStatus, size: "sm" | "md" = "sm") => {
    const textClass = size === "md" ? "text-xs px-2.5 py-1" : "text-[10px] px-2 py-0.5";
    switch (status) {
      case "PASS":
        return (
          <span className={`inline-flex items-center gap-1 font-bold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 ${textClass}`}>
            <CheckCircle2 className="w-3 h-3" />
            <span>PASS</span>
          </span>
        );
      case "WARNING":
        return (
          <span className={`inline-flex items-center gap-1 font-bold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 ${textClass}`}>
            <AlertTriangle className="w-3 h-3" />
            <span>WARNING</span>
          </span>
        );
      case "BLOCKED":
        return (
          <span className={`inline-flex items-center gap-1 font-bold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 ${textClass}`}>
            <XCircle className="w-3 h-3" />
            <span>BLOCKED</span>
          </span>
        );
      case "NOT_APPLICABLE":
      default:
        return (
          <span className={`inline-flex items-center gap-1 font-bold rounded-full bg-slate-800 text-slate-400 border border-slate-700 ${textClass}`}>
            <MinusCircle className="w-3 h-3" />
            <span>N/A</span>
          </span>
        );
    }
  };

  // Category Icon Resolver
  const getCategoryIcon = (cat: ComplianceCategory) => {
    switch (cat) {
      case "accounting":
        return <BookOpen className="w-4 h-4 text-sky-400" />;
      case "gst":
        return <Layers className="w-4 h-4 text-emerald-400" />;
      case "nwt":
        return <Globe className="w-4 h-4 text-blue-400" />;
      case "income_tax":
        return <Calculator className="w-4 h-4 text-amber-400" />;
      case "mira_returns":
        return <FileSpreadsheet className="w-4 h-4 text-purple-400" />;
      case "reconciliation":
        return <GitPullRequest className="w-4 h-4 text-teal-400" />;
      case "approval":
        return <UserCheck className="w-4 h-4 text-indigo-400" />;
      case "period":
        return <Lock className="w-4 h-4 text-rose-400" />;
      default:
        return <ShieldCheck className="w-4 h-4 text-emerald-400" />;
    }
  };

  // Filter Issues
  const allIssues = result ? [...result.blockingIssues, ...result.warnings] : [];
  const filteredIssues = allIssues.filter((issue) => {
    if (activeCategoryFilter !== "ALL" && issue.category !== activeCategoryFilter) {
      return false;
    }
    if (severityFilter !== "ALL" && issue.severity !== severityFilter) {
      return false;
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      return (
        issue.title.toLowerCase().includes(term) ||
        issue.detail.toLowerCase().includes(term) ||
        issue.recordIdentifier.toLowerCase().includes(term) ||
        issue.code.toLowerCase().includes(term) ||
        (issue.legalReference && issue.legalReference.toLowerCase().includes(term))
      );
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100 font-sans">
        
        {/* Top Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-900/90 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 rounded-xl">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-100 tracking-tight">
                  Tax Compliance & Pre-Filing Dashboard
                </h2>
                {result && renderStatusBadge(result.overallStatus, "md")}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Authoritative 8-Dimension Statutory Compliance, Sub-ledger Reconciliation & Blocker Verification
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchCompliance}
              disabled={loading}
              className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
              title="Refresh Compliance Status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-emerald-400" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Close Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 py-2.5 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setActiveTab("DIMENSIONS")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === "DIMENSIONS"
                  ? "bg-slate-800 text-slate-100 border border-slate-700 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Statutory Dimensions (8/8)</span>
            </button>

            <button
              onClick={() => {
                setActiveTab("PRE_FILING");
                if (!preFilingResult) fetchPreFilingCheck();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === "PRE_FILING"
                  ? "bg-slate-800 text-slate-100 border border-slate-700 shadow-sm"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Pre-Filing Control Engine (14 Checks)</span>
              {preFilingResult && (
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    preFilingResult.status === "READY_FOR_FILING"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                  }`}
                >
                  {preFilingResult.status}
                </span>
              )}
            </button>
          </div>

          {activeTab === "PRE_FILING" && (
            <button
              onClick={fetchPreFilingCheck}
              disabled={preFilingLoading}
              className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${preFilingLoading ? "animate-spin text-emerald-400" : ""}`} />
              <span>Re-evaluate</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {activeTab === "PRE_FILING" ? (
            /* ========================================================================= */
            /* PHASE 45 — PRE-FILING CONTROL ENGINE VIEW (14 STATUTORY CHECKS)          */
            /* ========================================================================= */
            <div className="space-y-6">
              {/* Package Generation Refusal / Success Feedback Banner */}
              {packageFeedback && (
                <div
                  className={`p-4 rounded-xl border flex items-start gap-3 animate-in fade-in duration-200 ${
                    packageFeedback.type === "error"
                      ? "bg-rose-950/40 border-rose-500/50 text-rose-200"
                      : "bg-emerald-950/40 border-emerald-500/50 text-emerald-200"
                  }`}
                >
                  {packageFeedback.type === "error" ? (
                    <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 text-xs space-y-1">
                    <div className="font-bold text-sm">
                      {packageFeedback.type === "error"
                        ? "Pre-Filing Control Gate: Filing Package Generation Refused"
                        : "Statutory Package Ready for Submission"}
                    </div>
                    <p className="opacity-90">{packageFeedback.message}</p>
                    {packageFeedback.details?.blockingIssues && (
                      <div className="mt-2 pt-2 border-t border-rose-500/20 text-[11px] text-rose-300">
                        <strong>Mandatory Remediation Required:</strong> All {packageFeedback.details.blockingIssues.length} blocking issue(s) must be cleared prior to package generation.
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setPackageFeedback(null)}
                    className="text-slate-400 hover:text-white p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Pre-Filing Readiness Hero Card */}
              {preFilingResult ? (
                <div
                  className={`p-5 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                    preFilingResult.status === "READY_FOR_FILING"
                      ? "bg-gradient-to-r from-emerald-950/30 via-slate-900 to-slate-900 border-emerald-500/30"
                      : "bg-gradient-to-r from-rose-950/30 via-slate-900 to-slate-900 border-rose-500/30"
                  }`}
                >
                  <div className="space-y-1.5 max-w-2xl">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Pre-Filing Status:
                      </span>
                      <span
                        className={`font-black text-sm px-2.5 py-0.5 rounded-full border ${
                          preFilingResult.status === "READY_FOR_FILING"
                            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                            : "bg-rose-500/20 text-rose-400 border-rose-500/40"
                        }`}
                      >
                        {preFilingResult.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300">
                      {preFilingResult.status === "READY_FOR_FILING"
                        ? "All 14 statutory pre-filing control checks have passed. Accounting balances, reconciliation, and audit integrity are verified."
                        : preFilingResult.refusalReason ||
                          "Statutory filing is blocked. The filing package generator refuses to build a 'ready for filing' package while blocking issues exist."}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
                      <span>Period: <strong className="text-slate-200">{preFilingResult.period || selectedQuarter}</strong></span>
                      <span>&bull;</span>
                      <span>Evaluated: <strong className="text-slate-200">{new Date(preFilingResult.evaluatedAt).toLocaleTimeString()}</strong></span>
                      <span>&bull;</span>
                      <span className="text-amber-400/90 font-medium">Statutory Refusal Enforcement: ACTIVE</span>
                    </div>
                  </div>

                  {/* Actions & Metrics */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                    <div className="flex items-center gap-2 justify-around">
                      <div className="px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-lg text-center min-w-[70px]">
                        <div className="text-[10px] text-slate-400 font-medium uppercase">Passed</div>
                        <div className="text-sm font-bold text-emerald-400">
                          {preFilingResult.summary.passedChecks}/14
                        </div>
                      </div>
                      <div className="px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-lg text-center min-w-[70px]">
                        <div className="text-[10px] text-slate-400 font-medium uppercase">Warnings</div>
                        <div className="text-sm font-bold text-amber-400">
                          {preFilingResult.summary.warningsCount}
                        </div>
                      </div>
                      <div className="px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-lg text-center min-w-[70px]">
                        <div className="text-[10px] text-slate-400 font-medium uppercase">Blockers</div>
                        <div className="text-sm font-bold text-rose-400">
                          {preFilingResult.summary.blockingIssuesCount}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleGeneratePackage}
                      disabled={generatingPackage}
                      className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer ${
                        preFilingResult.status === "READY_FOR_FILING"
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                          : "bg-slate-800 hover:bg-slate-700 text-rose-400 border border-rose-500/30"
                      }`}
                      title={
                        preFilingResult.status === "READY_FOR_FILING"
                          ? "Generate Authoritative Filing Package"
                          : "Attempting generation will trigger statutory refusal gate"
                      }
                    >
                      {generatingPackage ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : preFilingResult.status === "READY_FOR_FILING" ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Lock className="w-3.5 h-3.5 text-rose-400" />
                      )}
                      <span>
                        {generatingPackage
                          ? "Verifying Gate..."
                          : preFilingResult.status === "READY_FOR_FILING"
                          ? "Generate Filing Package"
                          : "Test Refusal Gate"}
                      </span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-8 rounded-xl border border-slate-800 bg-slate-900/50 text-center space-y-3">
                  <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto" />
                  <div className="text-sm font-semibold text-slate-200">
                    Pre-Filing Control Engine Not Yet Run
                  </div>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Execute the authoritative 14-check statutory pre-filing control engine to verify balance, reconciliation, and statutory schedules.
                  </p>
                  <button
                    onClick={fetchPreFilingCheck}
                    disabled={preFilingLoading}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${preFilingLoading ? "animate-spin" : ""}`} />
                    <span>Run Pre-Filing Check (14 Checks)</span>
                  </button>
                </div>
              )}

              {/* 14 Checks Filter Bar */}
              {preFilingResult && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      14 Statutory Checks
                    </span>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
                    {(["ALL", "BLOCKED", "WARNING", "PASS"] as const).map(f => (
                      <button
                        key={f}
                        onClick={() => setPreFilingFilter(f)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                          preFilingFilter === f
                            ? "bg-slate-800 text-slate-100 shadow-sm"
                            : "text-slate-400 hover:text-slate-300"
                        }`}
                      >
                        {f === "ALL" && `All (14)`}
                        {f === "BLOCKED" && `Blocked (${preFilingResult.summary.failedChecks})`}
                        {f === "WARNING" && `Warnings (${preFilingResult.summary.warningChecks})`}
                        {f === "PASS" && `Passed (${preFilingResult.summary.passedChecks})`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 14 Checks Grid */}
              {preFilingResult && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {preFilingResult.checkList
                    .filter(c => {
                      if (preFilingFilter === "BLOCKED") return c.status === "BLOCKED";
                      if (preFilingFilter === "WARNING") return c.status === "WARNING";
                      if (preFilingFilter === "PASS") return c.status === "PASS";
                      return true;
                    })
                    .map((chk, idx) => {
                      const isBlocked = chk.status === "BLOCKED";
                      const isWarn = chk.status === "WARNING";

                      return (
                        <div
                          key={chk.code}
                          className={`p-4 rounded-xl border transition-all ${
                            isBlocked
                              ? "bg-rose-950/15 border-rose-500/30"
                              : isWarn
                              ? "bg-amber-950/15 border-amber-500/30"
                              : "bg-slate-900/60 border-slate-800"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="space-y-0.5">
                              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                                Check {idx + 1} &bull; {chk.code}
                              </div>
                              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                                <span>{chk.name}</span>
                              </h4>
                            </div>

                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                isBlocked
                                  ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                                  : isWarn
                                  ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                                  : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                              }`}
                            >
                              {chk.status}
                            </span>
                          </div>

                          <p className="text-xs text-slate-400 leading-relaxed mb-3">
                            {chk.description}
                          </p>

                          {/* Issues List for this check */}
                          {chk.issues.length > 0 && (
                            <div className="space-y-2 pt-2 border-t border-slate-800/60">
                              {chk.issues.map((iss, iIdx) => (
                                <div
                                  key={iss.id || iIdx}
                                  className={`p-2.5 rounded-lg border text-xs space-y-1 ${
                                    iss.severity === "BLOCKING"
                                      ? "bg-rose-950/30 border-rose-500/40 text-rose-200"
                                      : "bg-amber-950/30 border-amber-500/40 text-amber-200"
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2 font-bold">
                                    <span className="flex items-center gap-1.5">
                                      {iss.severity === "BLOCKING" ? (
                                        <XCircle className="w-3.5 h-3.5 text-rose-400" />
                                      ) : (
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                      )}
                                      <span>{iss.title}</span>
                                    </span>
                                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-black/40">
                                      {iss.severity}
                                    </span>
                                  </div>
                                  <p className="text-[11px] opacity-90 leading-relaxed">
                                    {iss.detail}
                                  </p>
                                  <div className="text-[10px] opacity-80 pt-1">
                                    <strong>Statutory Remedy:</strong> {iss.remedy}
                                  </div>
                                  {iss.legalReference && (
                                    <div className="text-[10px] font-mono text-slate-400">
                                      Ref: {iss.legalReference}
                                    </div>
                                  )}
                                  {iss.recordId && onNavigateToBill && (
                                    <button
                                      onClick={() => {
                                        onClose();
                                        onNavigateToBill(iss.recordId!);
                                      }}
                                      className="mt-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                                    >
                                      Inspect Record &rarr;
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          ) : (
            /* ========================================================================= */
            /* PHASE 44 — STATUTORY COMPLIANCE 8-DIMENSION DASHBOARD                     */
            /* ========================================================================= */
            <>
          
          {/* Top Status & Filing Readiness Banner */}
          {result && (
            <div
              className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                result.overallStatus === "BLOCKED"
                  ? "bg-rose-950/20 border-rose-500/30"
                  : result.overallStatus === "WARNING"
                  ? "bg-amber-950/20 border-amber-500/30"
                  : "bg-emerald-950/20 border-emerald-500/30"
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Filing Readiness Control:
                  </span>
                  <span
                    className={`font-bold text-sm ${
                      result.overallStatus === "BLOCKED"
                        ? "text-rose-400"
                        : result.overallStatus === "WARNING"
                        ? "text-amber-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {result.filingReadiness.isReadyToFile
                      ? "READY FOR MIRA SUBMISSION"
                      : "BLOCKED — RESOLUTION REQUIRED"}
                  </span>
                </div>
                <p className="text-xs text-slate-300 max-w-2xl">
                  {result.filingReadiness.summaryText}
                </p>
                <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1">
                  <span>
                    Scope: <strong className="text-slate-200">{result.outletName}</strong>
                  </span>
                  <span>&bull;</span>
                  <span>
                    Period: <strong className="text-slate-200">{result.period}</strong>
                  </span>
                  <span>&bull;</span>
                  <span>
                    As of:{" "}
                    <strong className="text-slate-200">
                      {new Date(result.asOfDate).toLocaleTimeString()}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Metrics Counters */}
              <div className="flex items-center gap-2 self-stretch md:self-auto justify-between md:justify-end">
                <div className="px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-lg text-center min-w-[75px]">
                  <div className="text-xs text-slate-400 font-medium">Passed</div>
                  <div className="text-base font-bold text-emerald-400">{result.totalPassed}</div>
                </div>
                <div className="px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-lg text-center min-w-[75px]">
                  <div className="text-xs text-slate-400 font-medium">Warnings</div>
                  <div className="text-base font-bold text-amber-400">{result.totalWarnings}</div>
                </div>
                <div className="px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-lg text-center min-w-[75px]">
                  <div className="text-xs text-slate-400 font-medium">Blockers</div>
                  <div className="text-base font-bold text-rose-400">{result.totalBlocked}</div>
                </div>
              </div>
            </div>
          )}

          {/* 8 Compliance Dimensions Grid */}
          {result && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Statutory Compliance Dimensions (8/8 Checks)
                </h3>
                <span className="text-[11px] text-slate-500">
                  Click any category to filter underlying issues
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {(Object.entries(result.categories) as [ComplianceCategory, CategoryComplianceSummary][]).map(([catKey, summary]) => {
                  const isSelected = activeCategoryFilter === catKey;
                  const cat = catKey as ComplianceCategory;
                  return (
                    <div
                      key={catKey}
                      onClick={() => setActiveCategoryFilter(isSelected ? "ALL" : cat)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none ${
                        isSelected
                          ? "bg-slate-800/90 border-emerald-500/60 shadow-md ring-1 ring-emerald-500/30"
                          : "bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-850"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-slate-800 rounded-lg">
                            {getCategoryIcon(cat)}
                          </div>
                          <span className="text-xs font-bold text-slate-200">
                            {summary.categoryName}
                          </span>
                        </div>
                        {renderStatusBadge(summary.status)}
                      </div>

                      <p className="text-[11px] text-slate-400 line-clamp-2 mb-2 leading-relaxed">
                        {summary.description}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-2 border-t border-slate-800/60">
                        <span>
                          {summary.blockedCount > 0 ? (
                            <strong className="text-rose-400">{summary.blockedCount} Blocker{summary.blockedCount > 1 ? 's' : ''}</strong>
                          ) : summary.warningCount > 0 ? (
                            <strong className="text-amber-400">{summary.warningCount} Warning{summary.warningCount > 1 ? 's' : ''}</strong>
                          ) : (
                            <span className="text-emerald-400 font-medium">All clear</span>
                          )}
                        </span>
                        <span>{summary.passedCount} check{summary.passedCount > 1 ? 's' : ''} passed</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Issues Audit & Record Linking Section */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Compliance Audit Issues ({filteredIssues.length})
                </h3>
                {activeCategoryFilter !== "ALL" && (
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-800 text-emerald-400 border border-slate-700 rounded-md">
                    Filtered by: {result?.categories[activeCategoryFilter]?.categoryName}
                  </span>
                )}
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Search issues, records, or rules..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 w-full sm:w-48"
                />

                <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-lg p-0.5">
                  <button
                    onClick={() => setSeverityFilter("ALL")}
                    className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                      severityFilter === "ALL"
                        ? "bg-slate-800 text-white"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setSeverityFilter("BLOCKED")}
                    className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                      severityFilter === "BLOCKED"
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        : "text-slate-400 hover:text-rose-400"
                    }`}
                  >
                    Blockers
                  </button>
                  <button
                    onClick={() => setSeverityFilter("WARNING")}
                    className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                      severityFilter === "WARNING"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        : "text-slate-400 hover:text-amber-400"
                    }`}
                  >
                    Warnings
                  </button>
                </div>

                {activeCategoryFilter !== "ALL" && (
                  <button
                    onClick={() => setActiveCategoryFilter("ALL")}
                    className="px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-white bg-slate-800/80 rounded-md cursor-pointer"
                  >
                    Clear Filter
                  </button>
                )}
              </div>
            </div>

            {/* Issue Cards */}
            {filteredIssues.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/40 border border-slate-800/60 rounded-xl space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-semibold text-slate-200">No Compliance Issues Found</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  {searchTerm || activeCategoryFilter !== "ALL" || severityFilter !== "ALL"
                    ? "No issues match the selected filter criteria."
                    : "All statutory checks, invoice validations, and reconciliation gates are satisfied for this period."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className={`p-4 rounded-xl border transition-all ${
                      issue.severity === "BLOCKED"
                        ? "bg-rose-950/10 border-rose-500/30 hover:border-rose-500/50"
                        : "bg-amber-950/10 border-amber-500/30 hover:border-amber-500/50"
                    }`}
                  >
                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                            issue.severity === "BLOCKED"
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                          }`}
                        >
                          {issue.severity}
                        </span>
                        <span className="text-xs font-mono text-slate-400 font-semibold">
                          [{issue.code}]
                        </span>
                        <h4 className="text-xs sm:text-sm font-bold text-slate-100">
                          {issue.title}
                        </h4>
                      </div>

                      {/* Underlying Record Badge & Link */}
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono bg-slate-950 border border-slate-800 px-2 py-0.5 rounded text-slate-300">
                          {issue.recordType.toUpperCase()}: <strong>{issue.recordIdentifier}</strong>
                        </span>

                        {issue.recordType === "bill" && onNavigateToBill && (
                          <button
                            onClick={() => {
                              onNavigateToBill(issue.recordId);
                              onClose();
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>View Record</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-slate-300 mb-2 leading-relaxed">
                      {issue.detail}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-2 border-t border-slate-800/60 text-slate-400">
                      <div>
                        <strong className="text-slate-300">Required Remedy: </strong>
                        <span className="text-slate-300">{issue.remedy}</span>
                      </div>
                      {issue.legalReference && (
                        <div>
                          <strong className="text-slate-300">Regulatory Citation: </strong>
                          <span className="text-amber-300/90 font-mono text-[10px]">
                            {issue.legalReference}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800/80 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-2">
            <span>Authoritative Engine:</span>
            <strong className="text-slate-200">Maldives Tax Compliance Service</strong>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Close Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};
