import React, { useState, useEffect } from "react";
import {
  X,
  FileText,
  DollarSign,
  TrendingUp,
  Plus,
  Trash2,
  Building,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Calculator,
  ShieldCheck,
  Receipt,
  PieChart,
  Lock,
  Check,
  Search,
  Scale,
  Hash,
  ArrowRight,
  Info,
  Calendar,
  AlertCircle
} from "lucide-react";
import { RevenueRecord } from "../types";
import { TaxExplainabilityModal } from "./tax/TaxExplainabilityModal";
import { TaxCalculationExplanation } from "../types/explainability";
import {
  IncomeTaxReturnResult,
  TaxReturnLifecycleStatus,
  ReviewRequiredItem,
  TaxReconciliationItem
} from "../services/tax/mira604IntegrationService";

interface IncomeTaxModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOutlet?: string;
  authToken?: string;
  userRole?: string;
}

export const IncomeTaxModal: React.FC<IncomeTaxModalProps> = ({
  isOpen,
  onClose,
  selectedOutlet = "ALL",
  authToken,
  userRole = "CLIENT_ADMIN"
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [taxReturn, setTaxReturn] = useState<IncomeTaxReturnResult | null>(null);
  const [revenues, setRevenues] = useState<RevenueRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<
    "summary" | "mira604" | "schedule1" | "reconciliation" | "trace" | "revenue"
  >("summary");

  // Revenue Form State
  const [showRevForm, setShowRevForm] = useState(false);
  const [revDate, setRevDate] = useState(new Date().toISOString().split("T")[0]);
  const [revCategory, setRevCategory] = useState<RevenueRecord["category"]>("POS Sales");
  const [revDescription, setRevDescription] = useState("Daily POS Sales Settlement");
  const [revAmount, setRevAmount] = useState("");
  const [revPaymentMethod, setRevPaymentMethod] = useState<RevenueRecord["payment_method"]>("Card / POS");
  const [savingRev, setSavingRev] = useState(false);

  // Tax Explainability State
  const [showExplanationModal, setShowExplanationModal] = useState(false);
  const [currentExplanation, setCurrentExplanation] = useState<TaxCalculationExplanation | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchAuthoritativeData();
    }
  }, [isOpen, selectedYear, selectedOutlet]);

  const fetchAuthoritativeData = async () => {
    setLoading(true);
    setActionError(null);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      // 1. Fetch Authoritative Income Tax Return from Backend
      const taxRes = await fetch(`/api/income-tax/${selectedYear}`, { headers });
      if (taxRes.ok) {
        const taxData = await taxRes.json();
        if (taxData.success && taxData.return) {
          setTaxReturn(taxData.return);
        }
      } else {
        const errData = await taxRes.json().catch(() => ({}));
        console.warn("Could not fetch tax return:", errData);
      }

      // 2. Fetch Revenue Entries
      const revRes = await fetch(`/api/revenue`, { headers });
      if (revRes.ok) {
        const revData = await revRes.json();
        setRevenues(revData.filter((r: RevenueRecord) => r.year === selectedYear));
      }
    } catch (e: any) {
      console.error("Failed to load authoritative tax return data:", e);
      setActionError(e.message || "Failed to load tax return data.");
    } finally {
      setLoading(false);
    }
  };

  const handleCalculateReturn = async () => {
    setCalculating(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch(`/api/income-tax/${selectedYear}/calculate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          taxYear: selectedYear,
          isAmendment: taxReturn?.isFinalized ? true : false
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to calculate tax return");
      }

      setTaxReturn(data.return);
      setActionSuccess(`Tax return calculated successfully. Status: ${data.return.status}`);
    } catch (err: any) {
      console.error("Calculation failed:", err);
      setActionError(err.message || "Calculation failed");
    } finally {
      setCalculating(false);
    }
  };

  const handleApproveReturn = async () => {
    if (!taxReturn) return;
    setApproving(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch(`/api/income-tax/${selectedYear}/approve`, {
        method: "POST",
        headers,
        body: JSON.stringify({ notes: "Approved in UI by Tax Officer" })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to approve return");
      }

      setTaxReturn(data.return);
      setActionSuccess("Tax return approved successfully. Ready for final sealing.");
    } catch (err: any) {
      console.error("Approval error:", err);
      setActionError(err.message || "Approval failed");
    } finally {
      setApproving(false);
    }
  };

  const handleFinalizeReturn = async () => {
    if (!taxReturn) return;
    if (
      !confirm(
        `Are you sure you want to finalize the Tax Year ${selectedYear} return? Once finalized, this return becomes IMMUTABLE and cannot be modified without a formal amendment.`
      )
    ) {
      return;
    }

    setFinalizing(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch(`/api/income-tax/${selectedYear}/finalize`, {
        method: "POST",
        headers,
        body: JSON.stringify({ notes: "Finalized and sealed as immutable in UI" })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to finalize return");
      }

      setTaxReturn(data.return);
      setActionSuccess("Tax return finalized and permanently sealed as immutable in PostgreSQL.");
    } catch (err: any) {
      console.error("Finalization error:", err);
      setActionError(err.message || "Finalization failed");
    } finally {
      setFinalizing(false);
    }
  };

  const handleOpenExplanation = async () => {
    if (!taxReturn) return;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch("/api/tax/explain/income-tax", {
        method: "POST",
        headers,
        body: JSON.stringify({
          taxYear: selectedYear,
          tenantId: taxReturn.tenantId,
          accountingProfit: taxReturn.accountingProfitBeforeTax,
          adjustments: taxReturn.mira604.sectionC_AdjustmentsToProfit.items,
          capitalAllowanceClaimed: taxReturn.capitalAllowancesClaimed
        })
      });

      if (res.ok) {
        const data = await res.json();
        setCurrentExplanation(data.explanation);
        setShowExplanationModal(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setActionError(data.error || "Tax explanation not available from backend.");
      }
    } catch (err: any) {
      console.error("Failed to generate tax explanation", err);
      setActionError("Failed to reach server for tax explanation.");
    }
  };

  const handleAddRevenue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!revAmount || isNaN(Number(revAmount))) return;

    setSavingRev(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch("/api/revenue", {
        method: "POST",
        headers,
        body: JSON.stringify({
          outlet_id: selectedOutlet === "ALL" ? undefined : selectedOutlet,
          date: revDate,
          category: revCategory,
          description: revDescription,
          amount: Number(revAmount),
          payment_method: revPaymentMethod
        })
      });

      if (res.ok) {
        setRevAmount("");
        setShowRevForm(false);
        fetchAuthoritativeData();
      }
    } catch (e) {
      console.error("Failed to save revenue entry", e);
    } finally {
      setSavingRev(false);
    }
  };

  const handleDeleteRevenue = async (id: string) => {
    if (taxReturn?.isFinalized) {
      alert("Cannot delete revenue transactions in a finalized tax year period.");
      return;
    }
    if (!confirm("Are you sure you want to delete this revenue record?")) return;

    try {
      const headers: Record<string, string> = {};
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch(`/api/revenue/${id}`, { method: "DELETE", headers });
      if (res.ok) {
        fetchAuthoritativeData();
      }
    } catch (e) {
      console.error("Failed to delete revenue record", e);
    }
  };

  if (!isOpen) return null;

  const isFinalized = Boolean(taxReturn?.isFinalized);
  const lifecycleStatus: TaxReturnLifecycleStatus = taxReturn?.status || "DRAFT";
  const reconStatus = taxReturn?.reconciliation?.overallStatus || "PASS";
  const criticalReviewCount =
    taxReturn?.reviewItems?.filter((r) => r.severity === "CRITICAL").length || 0;
  const canApprove =
    !isFinalized &&
    (lifecycleStatus === "CALCULATED" || lifecycleStatus === "REVIEW_REQUIRED") &&
    criticalReviewCount === 0;
  const canFinalize = !isFinalized && lifecycleStatus === "APPROVED";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-6xl w-full text-slate-100 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-slate-100">
                  MIRA 604 Income Tax Return Engine
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                  v25.1 Compliant
                </span>

                {/* Status Badges */}
                {taxReturn && (
                  <>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center space-x-1 ${
                        lifecycleStatus === "FINALIZED"
                          ? "bg-purple-900/40 border-purple-500/60 text-purple-300"
                          : lifecycleStatus === "APPROVED"
                          ? "bg-emerald-900/40 border-emerald-500/60 text-emerald-300"
                          : lifecycleStatus === "CALCULATED"
                          ? "bg-blue-900/40 border-blue-500/60 text-blue-300"
                          : lifecycleStatus === "REVIEW_REQUIRED"
                          ? "bg-amber-900/40 border-amber-500/60 text-amber-300"
                          : "bg-slate-800 border-slate-700 text-slate-400"
                      }`}
                    >
                      {isFinalized && <Lock className="w-3 h-3 mr-1" />}
                      <span>{lifecycleStatus}</span>
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center space-x-1 ${
                        reconStatus === "PASS"
                          ? "bg-emerald-900/30 border-emerald-500/40 text-emerald-400"
                          : "bg-rose-900/40 border-rose-500/60 text-rose-300"
                      }`}
                    >
                      {reconStatus === "PASS" ? (
                        <Check className="w-3 h-3 mr-0.5" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 mr-0.5" />
                      )}
                      <span>Recon: {reconStatus}</span>
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Maldives Inland Revenue Authority • Income Tax Act & Authoritative GL P&L Subledger
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Year selector */}
            <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-400 font-semibold">Tax Year:</span>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-transparent text-emerald-400 font-mono font-bold focus:outline-none cursor-pointer"
              >
                <option value={2026}>2026</option>
                <option value={2025}>2025</option>
                <option value={2024}>2024</option>
              </select>
            </div>

            <button
              onClick={fetchAuthoritativeData}
              className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Refresh Authoritative Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-800/80 px-6 bg-slate-950/60 text-xs font-semibold overflow-x-auto">
          <button
            onClick={() => setActiveTab("summary")}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              activeTab === "summary"
                ? "border-emerald-500 text-emerald-400 font-bold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <PieChart className="w-4 h-4" />
            <span>Tax Summary & Controls</span>
          </button>

          <button
            onClick={() => setActiveTab("mira604")}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              activeTab === "mira604"
                ? "border-emerald-500 text-emerald-400 font-bold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Official MIRA 604 Schedules</span>
          </button>

          <button
            onClick={() => setActiveTab("schedule1")}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              activeTab === "schedule1"
                ? "border-emerald-500 text-emerald-400 font-bold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Schedule 1 Statement of P&L</span>
          </button>

          <button
            onClick={() => setActiveTab("reconciliation")}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              activeTab === "reconciliation"
                ? "border-emerald-500 text-emerald-400 font-bold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>5-Way Reconciliation</span>
            {taxReturn?.reconciliation?.discrepanciesCount ? (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-rose-900 text-rose-200 text-[10px]">
                {taxReturn.reconciliation.discrepanciesCount}
              </span>
            ) : null}
          </button>

          <button
            onClick={() => setActiveTab("trace")}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              activeTab === "trace"
                ? "border-emerald-500 text-emerald-400 font-bold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Calculation Trace & GL Audit</span>
          </button>

          <button
            onClick={() => setActiveTab("revenue")}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              activeTab === "revenue"
                ? "border-emerald-500 text-emerald-400 font-bold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Revenue Subledger ({revenues.length})</span>
          </button>
        </div>

        {/* Action Error/Success Notifications */}
        {actionError && (
          <div className="mx-6 mt-4 p-3 bg-rose-950/60 border border-rose-500/50 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
        {actionSuccess && (
          <div className="mx-6 mt-4 p-3 bg-emerald-950/60 border border-emerald-500/50 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{actionSuccess}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
              <p className="text-slate-400 font-semibold">
                Retrieving authoritative income tax records and GL balance...
              </p>
            </div>
          ) : taxReturn ? (
            <>
              {/* TAB 1: SUMMARY & LIFECYCLE CONTROLS */}
              {activeTab === "summary" && (
                <div className="space-y-6">
                  {/* Action & Lifecycle Controls Bar */}
                  <div className="p-4 bg-slate-950/90 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-200">Return Lifecycle Status:</span>
                        <span className="font-mono font-bold text-emerald-400 uppercase">
                          {taxReturn.status}
                        </span>
                        {isFinalized && (
                          <span className="px-2 py-0.5 rounded bg-purple-950/80 border border-purple-500 text-purple-300 font-bold text-[10px] flex items-center space-x-1">
                            <Lock className="w-3 h-3 mr-1" />
                            <span>FINALIZED & IMMUTABLE</span>
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {isFinalized
                          ? `Finalized by ${taxReturn.finalizedBy || "User"} on ${
                              taxReturn.finalizedAt?.slice(0, 10) || ""
                            }. No further edits or recalculations allowed.`
                          : taxReturn.status === "APPROVED"
                          ? `Approved by ${taxReturn.approvedBy || "User"} on ${
                              taxReturn.approvedAt?.slice(0, 10) || ""
                            }. Ready for final sealing.`
                          : "Review calculation, audit discrepancies, and approve when satisfied."}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      {!isFinalized ? (
                        <>
                          <button
                            onClick={handleCalculateReturn}
                            disabled={calculating}
                            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold rounded-xl border border-slate-700 flex items-center space-x-1.5 transition cursor-pointer"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${calculating ? "animate-spin" : ""}`} />
                            <span>{calculating ? "Calculating..." : "Recalculate Return"}</span>
                          </button>

                          {canApprove && (
                            <button
                              onClick={handleApproveReturn}
                              disabled={approving}
                              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center space-x-1.5 transition cursor-pointer shadow-md"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{approving ? "Approving..." : "Approve Return"}</span>
                            </button>
                          )}

                          {canFinalize && (
                            <button
                              onClick={handleFinalizeReturn}
                              disabled={finalizing}
                              className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl flex items-center space-x-1.5 transition cursor-pointer shadow-md"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>{finalizing ? "Sealing..." : "Finalize & Seal"}</span>
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="text-slate-500 font-mono text-[11px] flex items-center space-x-1 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                          <Lock className="w-3.5 h-3.5 text-purple-400" />
                          <span>Sealed (Read-Only)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Review Checklist / Blockers */}
                  {taxReturn.reviewItems && taxReturn.reviewItems.length > 0 && (
                    <div className="p-4 bg-amber-950/20 border border-amber-500/40 rounded-2xl space-y-2">
                      <div className="flex items-center space-x-2 text-amber-400 font-bold">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Pre-Approval Review Items ({taxReturn.reviewItems.length})</span>
                      </div>
                      <div className="space-y-1.5">
                        {taxReturn.reviewItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-start justify-between bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 text-[11px]"
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center space-x-2">
                                <span
                                  className={`px-1.5 py-0.2 rounded font-bold text-[9px] ${
                                    item.severity === "CRITICAL"
                                      ? "bg-rose-900/60 text-rose-300 border border-rose-500/50"
                                      : "bg-amber-900/60 text-amber-300 border border-amber-500/50"
                                  }`}
                                >
                                  {item.severity}
                                </span>
                                <span className="font-mono text-slate-300">{item.code}</span>
                              </div>
                              <p className="text-slate-300">{item.message}</p>
                              {item.suggestedAction && (
                                <p className="text-emerald-400/90 font-medium">
                                  Action: {item.suggestedAction}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Key Metrics Header Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                      <span className="text-slate-400 font-semibold block text-[11px]">
                        Accounting Profit Before Tax
                      </span>
                      <span className="text-xl font-mono font-bold text-slate-100">
                        MVR{" "}
                        {taxReturn.accountingProfitBeforeTax.toLocaleString(undefined, {
                          minimumFractionDigits: 2
                        })}
                      </span>
                      <span className="text-[10px] text-slate-500 block">From posted GL journal lines</span>
                    </div>

                    <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                      <span className="text-slate-400 font-semibold block text-[11px]">
                        Taxable Income (Loss)
                      </span>
                      <span className="text-xl font-mono font-bold text-emerald-400">
                        MVR{" "}
                        {taxReturn.finalTaxableIncome.toLocaleString(undefined, {
                          minimumFractionDigits: 2
                        })}
                      </span>
                      <span className="text-[10px] text-slate-500 block">After adjustments & allowances</span>
                    </div>

                    <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                      <span className="text-slate-400 font-semibold block text-[11px]">
                        Gross Income Tax Liability
                      </span>
                      <span className="text-xl font-mono font-bold text-amber-400">
                        MVR{" "}
                        {taxReturn.incomeTaxPayable.toLocaleString(undefined, {
                          minimumFractionDigits: 2
                        })}
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        Effective Rate: {(taxReturn.effectiveTaxRate * 100).toFixed(2)}%
                      </span>
                    </div>

                    <div className="bg-emerald-950/30 p-4 rounded-2xl border border-emerald-500/40 space-y-1">
                      <span className="text-emerald-300 font-bold block text-[11px]">
                        Net Tax Due / (Refundable)
                      </span>
                      <span className="text-xl font-mono font-bold text-emerald-400">
                        MVR{" "}
                        {taxReturn.netTaxDueOrRefundable.toLocaleString(undefined, {
                          minimumFractionDigits: 2
                        })}
                      </span>
                      <span className="text-[10px] text-emerald-300/80 block font-mono">
                        Box 620 Final Settlement
                      </span>
                    </div>
                  </div>

                  {/* Progressive Computation / Breakdown Box */}
                  <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center space-x-2 text-slate-200 font-bold">
                        <Building className="w-4 h-4 text-emerald-400" />
                        <span>MIRA 604 Authoritative Income Tax Derivation</span>
                      </div>
                      <span className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 font-mono text-[11px]">
                        Verification Checksum:{" "}
                        <strong className="text-emerald-400 font-mono text-[10px]">
                          {taxReturn.verificationChecksum.slice(0, 16)}...
                        </strong>
                      </span>
                    </div>

                    <div className="space-y-2.5 text-xs font-mono">
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-300 font-sans">1. Accounting Profit Before Tax (GL Source)</span>
                        <span className="text-slate-100 font-bold">
                          MVR {taxReturn.accountingProfitBeforeTax.toFixed(2)}
                        </span>
                      </div>

                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400 pl-4 font-sans">
                          + Tax Additions (Non-deductible expenses & accounting depreciation)
                        </span>
                        <span className="text-emerald-400">+ MVR {taxReturn.totalAdditions.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400 pl-4 font-sans">
                          - Tax Deductions (Exempt income & non-taxable gains)
                        </span>
                        <span className="text-amber-400">- MVR {taxReturn.totalDeductions.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-purple-300 pl-4 font-sans">
                          - Capital Allowances Claimed (Schedule 2 statutory deduction)
                        </span>
                        <span className="text-purple-300">- MVR {taxReturn.capitalAllowancesClaimed.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400 pl-4 font-sans">
                          - Prior Unabsorbed Loss Relief Applied
                        </span>
                        <span className="text-amber-400">- MVR {taxReturn.lossReliefApplied.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between py-2 bg-emerald-950/40 px-3 rounded-xl border border-emerald-500/40 font-bold text-sm">
                        <span className="text-emerald-300 font-sans">Final Net Taxable Income (Box 530)</span>
                        <span className="text-emerald-300">
                          MVR {taxReturn.finalTaxableIncome.toFixed(2)}
                        </span>
                      </div>

                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-300 font-sans">Gross Tax Liability (Box 600)</span>
                        <span className="text-slate-100 font-bold">
                          MVR {taxReturn.incomeTaxPayable.toFixed(2)}
                        </span>
                      </div>

                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400 pl-4 font-sans">
                          - Less: Total Prepayments / Advance Tax / Withholding Tax (Box 610)
                        </span>
                        <span className="text-amber-400">
                          - MVR{" "}
                          {(
                            taxReturn.incomeTaxPayable - taxReturn.netTaxDueOrRefundable
                          ).toFixed(2)}
                        </span>
                      </div>

                      <div className="flex justify-between py-2 bg-slate-900 px-3 rounded-xl border border-slate-800 font-bold text-sm">
                        <span className="text-slate-200 font-sans">Net Tax Payable / (Refundable) (Box 620)</span>
                        <span className="text-emerald-400 font-mono">
                          MVR {taxReturn.netTaxDueOrRefundable.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={handleOpenExplanation}
                      className="w-full py-2.5 px-4 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-xl flex items-center justify-center space-x-2 font-medium transition cursor-pointer shadow-sm group"
                    >
                      <Calculator className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                      <span>View Statutory Tax Explanation (5-Part Audit Structure)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: OFFICIAL MIRA 604 RETURN SCHEDULES */}
              {activeTab === "mira604" && (
                <div className="space-y-6">
                  {/* Section A & B */}
                  <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-3">
                    <h3 className="font-bold text-slate-100 text-sm border-b border-slate-800 pb-2">
                      Sections A & B: Taxpayer Profile & Information
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                      <div>
                        <span className="text-slate-400 block font-sans">TIN:</span>
                        <span className="text-emerald-400 font-bold">
                          {taxReturn.mira604.sectionA_TaxpayerInfo.tin}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-sans">Taxpayer Name:</span>
                        <span className="text-slate-200 font-bold font-sans">
                          {taxReturn.mira604.sectionA_TaxpayerInfo.taxpayerName}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-sans">Entity Type:</span>
                        <span className="text-slate-200 font-bold">
                          {taxReturn.mira604.sectionA_TaxpayerInfo.entityType}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-sans">Accounting Period:</span>
                        <span className="text-slate-300">
                          {taxReturn.mira604.sectionA_TaxpayerInfo.accountingPeriodStart} to{" "}
                          {taxReturn.mira604.sectionA_TaxpayerInfo.accountingPeriodEnd}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Section C: Adjustments to Profit */}
                  <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <h3 className="font-bold text-slate-100 text-sm">
                        Section C: Adjustments to Accounting Profit (Boxes 200–300)
                      </h3>
                      <span className="text-xs font-mono text-emerald-400 font-bold">
                        Net Adjustments: MVR{" "}
                        {(
                          taxReturn.mira604.sectionC_AdjustmentsToProfit.totalAdditions -
                          taxReturn.mira604.sectionC_AdjustmentsToProfit.totalDeductions
                        ).toFixed(2)}
                      </span>
                    </div>

                    <div className="space-y-1.5 font-mono text-xs">
                      <div className="flex justify-between py-1 bg-slate-900/60 px-3 rounded-lg">
                        <span className="text-slate-300 font-sans">Box 200: Accounting Profit (Loss)</span>
                        <span className="text-slate-100 font-bold">
                          MVR {taxReturn.mira604.sectionC_AdjustmentsToProfit.accountingProfit.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 bg-slate-900/40 px-3 rounded-lg">
                        <span className="text-emerald-400 font-sans">Box 210: Total Additions (Add-Backs)</span>
                        <span className="text-emerald-400 font-bold">
                          + MVR {taxReturn.mira604.sectionC_AdjustmentsToProfit.totalAdditions.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 bg-slate-900/40 px-3 rounded-lg">
                        <span className="text-amber-400 font-sans">Box 220: Total Allowable Deductions</span>
                        <span className="text-amber-400 font-bold">
                          - MVR {taxReturn.mira604.sectionC_AdjustmentsToProfit.totalDeductions.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 bg-slate-900/80 px-3 rounded-lg font-bold">
                        <span className="text-slate-200 font-sans">Box 300: Adjusted Accounting Profit</span>
                        <span className="text-slate-100">
                          MVR {taxReturn.mira604.sectionC_AdjustmentsToProfit.adjustedProfit.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Section D: Capital Allowances */}
                  <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <h3 className="font-bold text-slate-100 text-sm">
                        Section D: Capital Allowances Claimed (Box 400)
                      </h3>
                      <span className="text-xs font-mono text-purple-300 font-bold">
                        Total CA: MVR {taxReturn.mira604.sectionD_CapitalAllowances.totalClaimed.toFixed(2)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {taxReturn.mira604.sectionD_CapitalAllowances.breakdown.map((item, i) => (
                        <div key={i} className="p-2.5 bg-slate-900 rounded-xl border border-slate-800 text-xs">
                          <span className="text-slate-400 block text-[10px]">{item.assetClass}</span>
                          <span className="font-mono font-bold text-purple-300">
                            MVR {item.allowanceClaimed.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section E & F: Tax Computation */}
                  <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-3">
                    <h3 className="font-bold text-slate-100 text-sm border-b border-slate-800 pb-2">
                      Section E & F: Tax Computation & Final Settlement (Boxes 500–620)
                    </h3>
                    <div className="space-y-1.5 font-mono text-xs">
                      <div className="flex justify-between py-1 bg-slate-900/60 px-3 rounded-lg">
                        <span className="text-slate-300 font-sans">Box 500: Profit After Capital Allowances</span>
                        <span className="text-slate-100">
                          MVR {taxReturn.mira604.sectionE_TaxableIncomeLoss.profitAfterCA.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 bg-slate-900/40 px-3 rounded-lg">
                        <span className="text-slate-400 font-sans">Box 510: Prior Unabsorbed Loss Relief</span>
                        <span className="text-amber-400">
                          - MVR {taxReturn.mira604.sectionE_TaxableIncomeLoss.lossDeductionClaimed.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1.5 bg-emerald-950/40 px-3 rounded-lg font-bold border border-emerald-500/40">
                        <span className="text-emerald-300 font-sans">Box 530: Net Taxable Income</span>
                        <span className="text-emerald-300">
                          MVR {taxReturn.mira604.sectionE_TaxableIncomeLoss.netTaxableIncome.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 bg-slate-900/60 px-3 rounded-lg">
                        <span className="text-slate-300 font-sans">Box 600: Total Tax Liability</span>
                        <span className="text-slate-100 font-bold">
                          MVR {taxReturn.mira604.sectionF_TaxComputation.totalTaxPayable.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 bg-slate-900/40 px-3 rounded-lg">
                        <span className="text-slate-400 font-sans">Box 610: Total Prepayments Applied</span>
                        <span className="text-amber-400">
                          - MVR {taxReturn.mira604.sectionF_TaxComputation.totalPrepayments.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1.5 bg-slate-900 px-3 rounded-lg font-bold border border-slate-700">
                        <span className="text-emerald-400 font-sans">Box 620: Balance of Tax Payable / (Refund)</span>
                        <span className="text-emerald-400">
                          MVR {taxReturn.mira604.sectionF_TaxComputation.netTaxDueOrRefund.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: SCHEDULE 1 P&L */}
              {activeTab === "schedule1" && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-100 text-sm">
                        MIRA Schedule 1 Statement of Profit or Loss
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Authoritatively generated from posted General Ledger journal lines.
                      </p>
                    </div>
                    <span className="text-xs font-mono px-3 py-1 bg-slate-900 rounded-lg border border-slate-800 text-emerald-400 font-bold">
                      GL Source: Posted Journals
                    </span>
                  </div>

                  <div className="bg-slate-950/80 rounded-2xl border border-slate-800 overflow-hidden font-mono text-xs">
                    <div className="p-4 border-b border-slate-800 space-y-2">
                      <div className="flex justify-between font-bold text-slate-200">
                        <span className="font-sans">Gross Revenue (Sales & Operating Income)</span>
                        <span className="text-emerald-400">
                          MVR {taxReturn.mira604.sectionB_PnL.grossRevenue.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span className="font-sans pl-4">• Cost of Sales (Direct Materials / COGS)</span>
                        <span className="text-amber-400">
                          - MVR {taxReturn.mira604.sectionB_PnL.costOfSales.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-100 bg-slate-900/70 p-2 rounded-lg">
                        <span className="font-sans">Gross Profit</span>
                        <span className="text-emerald-400">
                          MVR {taxReturn.mira604.sectionB_PnL.grossProfit.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span className="font-sans pl-4">• Operating & Administrative Expenses</span>
                        <span className="text-amber-400">
                          - MVR {taxReturn.mira604.sectionB_PnL.operatingExpenses.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-100 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                        <span className="font-sans">Net Accounting Profit Before Tax</span>
                        <span className="text-slate-100">
                          MVR {taxReturn.mira604.sectionB_PnL.accountingProfitBeforeTax.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: 5-WAY RECONCILIATION */}
              {activeTab === "reconciliation" && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-100 text-sm">
                        5-Way Tax & Accounting Reconciliation
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Strict Decimal verification across GL Profit, Adjustments, Schedule 1, Capital Allowances, and MIRA 604.
                      </p>
                    </div>
                    <span
                      className={`text-xs font-mono px-3 py-1 rounded-lg border font-bold ${
                        reconStatus === "PASS"
                          ? "bg-emerald-950/60 border-emerald-500/50 text-emerald-400"
                          : "bg-rose-950/60 border-rose-500/50 text-rose-300"
                      }`}
                    >
                      Overall Status: {reconStatus}
                    </span>
                  </div>

                  <div className="bg-slate-950/80 rounded-2xl border border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-4">Verification Check</th>
                          <th className="py-3 px-4 text-right">Expected (MVR)</th>
                          <th className="py-3 px-4 text-right">Actual (MVR)</th>
                          <th className="py-3 px-4 text-right">Variance (MVR)</th>
                          <th className="py-3 px-4 text-center">Status</th>
                          <th className="py-3 px-4">Trace Explanation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {taxReturn.reconciliation?.items?.map((item: TaxReconciliationItem, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-900/40 transition-colors">
                            <td className="py-3 px-4 font-sans font-semibold text-slate-200">
                              {item.name}
                            </td>
                            <td className="py-3 px-4 text-right text-slate-300">
                              {item.expectedValue.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right text-slate-300">
                              {item.actualValue.toFixed(2)}
                            </td>
                            <td
                              className={`py-3 px-4 text-right font-bold ${
                                Math.abs(item.variance) > 0.01 ? "text-rose-400" : "text-emerald-400"
                              }`}
                            >
                              {item.variance.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  item.status === "PASS"
                                    ? "bg-emerald-950/80 text-emerald-300 border border-emerald-500/40"
                                    : "bg-rose-950/80 text-rose-300 border border-rose-500/40"
                                }`}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-[11px] text-slate-400 font-sans">
                              {item.explanation}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 5: CALCULATION TRACE & AUDIT TRAIL */}
              {activeTab === "trace" && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-100 text-sm">
                        Full Transaction & Calculation Audit Trace
                      </h3>
                      <span className="text-xs font-mono px-3 py-1 bg-slate-900 rounded-lg border border-slate-800 text-slate-400">
                        Rule Version: {taxReturn.trace.ruleVersion}
                      </span>
                    </div>
                    <div className="p-2.5 bg-slate-900/60 rounded-xl border border-slate-800/80 font-mono text-[11px] text-emerald-400">
                      Formula: {taxReturn.trace.taxableIncomeTrace.formula}
                    </div>
                  </div>

                  {/* GL Account Breakdown */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2">
                      <span className="font-bold text-slate-200 block text-xs">
                        Revenue Accounts Summary
                      </span>
                      <div className="space-y-1 font-mono text-xs max-h-48 overflow-y-auto">
                        {taxReturn.trace.accountingProfitTrace.revenueAccounts.map((acc, i) => (
                          <div key={i} className="flex justify-between py-1 border-b border-slate-800/40">
                            <span className="text-slate-400 font-sans">
                              {acc.code} - {acc.name}
                            </span>
                            <span className="text-emerald-400 font-bold">MVR {acc.amount.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2">
                      <span className="font-bold text-slate-200 block text-xs">
                        Operating Expense Accounts Summary
                      </span>
                      <div className="space-y-1 font-mono text-xs max-h-48 overflow-y-auto">
                        {taxReturn.trace.accountingProfitTrace.expenseAccounts.map((acc, i) => (
                          <div key={i} className="flex justify-between py-1 border-b border-slate-800/40">
                            <span className="text-slate-400 font-sans">
                              {acc.code} - {acc.name}
                            </span>
                            <span className="text-amber-400 font-bold">MVR {acc.amount.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Tax Brackets Table */}
                  <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-2">
                    <span className="font-bold text-slate-200 block text-xs">
                      Statutory Tax Bracket Computation
                    </span>
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="text-slate-500 uppercase text-[10px] border-b border-slate-800">
                        <tr>
                          <th className="py-2">Bracket</th>
                          <th className="py-2 text-right">Taxable Amount (MVR)</th>
                          <th className="py-2 text-right">Rate</th>
                          <th className="py-2 text-right">Tax in Bracket (MVR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/40">
                        {taxReturn.trace.taxComputationTrace.taxBrackets.map((tb, idx) => (
                          <tr key={idx}>
                            <td className="py-2 text-slate-300 font-sans">{tb.bracketName}</td>
                            <td className="py-2 text-right text-slate-300">
                              {tb.taxableInBracket.toFixed(2)}
                            </td>
                            <td className="py-2 text-right text-emerald-400 font-bold">
                              {tb.ratePercentage}%
                            </td>
                            <td className="py-2 text-right text-slate-100 font-bold">
                              {tb.taxInBracket.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 6: REVENUE LOG MANAGER */}
              {activeTab === "revenue" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-950/80 rounded-2xl border border-slate-800">
                    <div>
                      <h3 className="font-bold text-slate-100 text-sm">
                        Authoritative Revenue Subledger (PostgreSQL)
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Persisted in PostgreSQL database with dual double-entry GL journal posting.
                      </p>
                    </div>

                    {!isFinalized && (
                      <button
                        onClick={() => setShowRevForm(!showRevForm)}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center space-x-1.5 cursor-pointer shadow-md text-xs transition-all"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Log Revenue</span>
                      </button>
                    )}
                  </div>

                  {/* Add Revenue Form */}
                  {showRevForm && !isFinalized && (
                    <form
                      onSubmit={handleAddRevenue}
                      className="p-4 bg-slate-900 rounded-2xl border border-emerald-500/40 space-y-3"
                    >
                      <h4 className="font-bold text-emerald-400 text-xs">
                        Record Sales / Revenue Entry
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <label className="block text-slate-400 mb-1 font-semibold">Date</label>
                          <input
                            type="date"
                            value={revDate}
                            onChange={(e) => setRevDate(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono focus:border-emerald-500 focus:outline-none"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-slate-400 mb-1 font-semibold">Category</label>
                          <select
                            value={revCategory}
                            onChange={(e) => setRevCategory(e.target.value as any)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                          >
                            <option value="POS Sales">POS Sales</option>
                            <option value="Dine-In Sales">Dine-In Sales</option>
                            <option value="Takeaway / Delivery">Takeaway / Delivery</option>
                            <option value="Catering">Catering</option>
                            <option value="Wholesale">Wholesale</option>
                            <option value="Other Revenue">Other Revenue</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-slate-400 mb-1 font-semibold">Amount (MVR)</label>
                          <input
                            type="number"
                            step="0.01"
                            value={revAmount}
                            onChange={(e) => setRevAmount(e.target.value)}
                            placeholder="e.g. 15400.00"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold focus:border-emerald-500 focus:outline-none"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-slate-400 mb-1 font-semibold">Payment Method</label>
                          <select
                            value={revPaymentMethod}
                            onChange={(e) => setRevPaymentMethod(e.target.value as any)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                          >
                            <option value="Card / POS">Card / POS</option>
                            <option value="Cash">Cash</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Credit">Credit Account</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1 font-semibold">Description / Reference</label>
                        <input
                          type="text"
                          value={revDescription}
                          onChange={(e) => setRevDescription(e.target.value)}
                          placeholder="e.g. Daily POS Settlement for Branch"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>

                      <div className="flex justify-end space-x-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowRevForm(false)}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingRev}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold cursor-pointer flex items-center space-x-1"
                        >
                          <span>{savingRev ? "Saving..." : "Save Revenue Record"}</span>
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Revenue List */}
                  <div className="bg-slate-950/80 rounded-2xl border border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-4">Date</th>
                          <th className="py-3 px-4">Category</th>
                          <th className="py-3 px-4">Description</th>
                          <th className="py-3 px-4">Outlet</th>
                          <th className="py-3 px-4 text-right">Amount (MVR)</th>
                          <th className="py-3 px-4 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {revenues.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-500 italic">
                              No revenue records logged for {selectedYear} yet.
                            </td>
                          </tr>
                        ) : (
                          revenues.map((rev) => (
                            <tr key={rev.id} className="hover:bg-slate-900/40 transition-colors">
                              <td className="py-3 px-4 text-slate-300">{rev.date}</td>
                              <td className="py-3 px-4 text-emerald-400 font-sans font-semibold">
                                {rev.category}
                              </td>
                              <td className="py-3 px-4 text-slate-200 font-sans">{rev.description}</td>
                              <td className="py-3 px-4 text-slate-400 font-sans">
                                {rev.outlet_name || "Main Outlet"}
                              </td>
                              <td className="py-3 px-4 text-right font-bold text-emerald-400">
                                MVR {rev.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {!isFinalized && (
                                  <button
                                    onClick={() => handleDeleteRevenue(rev.id)}
                                    className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                                    title="Delete Record"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-slate-400 space-y-3">
              <p>No tax return found for Tax Year {selectedYear}.</p>
              <button
                onClick={handleCalculateReturn}
                disabled={calculating}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl inline-flex items-center space-x-2 cursor-pointer shadow-md"
              >
                <Calculator className="w-4 h-4" />
                <span>{calculating ? "Calculating..." : "Calculate MIRA 604 Return"}</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800/80 bg-slate-900/90 text-xs">
          <div className="flex items-center space-x-2 text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Official MIRA 604 v25.1 Subledger Tax Engine • PostgreSQL Authoritative Source</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Tax Explainability Modal */}
      <TaxExplainabilityModal
        isOpen={showExplanationModal}
        onClose={() => setShowExplanationModal(false)}
        explanation={currentExplanation}
      />
    </div>
  );
};
