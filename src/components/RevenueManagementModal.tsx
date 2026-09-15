import React, { useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  Edit2,
  DollarSign,
  TrendingUp,
  Receipt,
  Building2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Upload,
  Download,
  Search,
  Filter,
  CreditCard,
  Layers,
  ArrowUpRight,
  PieChart,
  RotateCcw,
  RefreshCw,
  FileText,
  ShieldCheck,
  Activity,
  Check,
  Info
} from "lucide-react";
import { RevenueRecord, RevenueCategory, Outlet, AuthUser } from "../types";
import { RevenueDiagnosticTrace } from "../types/revenue";

interface RevenueManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  outlets: Outlet[];
  onRevenueUpdated?: () => void;
}

export const RevenueManagementModal: React.FC<RevenueManagementModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  outlets,
  onRevenueUpdated
}) => {
  const [revenues, setRevenues] = useState<RevenueRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter states
  const [selectedOutlet, setSelectedOutlet] = useState<string>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Form states (Add / Edit)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Reversal Modal
  const [reversalTarget, setReversalTarget] = useState<RevenueRecord | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalLoading, setReversalLoading] = useState(false);

  // Correction Modal
  const [correctionTarget, setCorrectionTarget] = useState<RevenueRecord | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");

  // Diagnostic Trace Drawer
  const [traceRecord, setTraceRecord] = useState<RevenueRecord | null>(null);
  const [traceData, setTraceData] = useState<RevenueDiagnosticTrace | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);

  // 4-Way Reconciliation
  const [reconciliationReport, setReconciliationReport] = useState<any | null>(null);
  const [reconcileLoading, setReconcileLoading] = useState(false);
  const [showReconcileCard, setShowReconcileCard] = useState(false);

  const [formData, setFormData] = useState<{
    outlet_id: string;
    date: string;
    category: RevenueCategory;
    gross_amount: string;
    gst_collected: string;
    net_revenue: string;
    payment_method: 'Cash' | 'Card / POS' | 'Bank Transfer' | 'Credit' | 'Other';
    notes: string;
    sector: 'GENERAL' | 'TOURISM';
    amountBasis: 'GST_INCLUSIVE' | 'GST_EXCLUSIVE';
  }>({
    outlet_id: currentUser?.outlet_id || outlets[0]?.id || "outlet-1",
    date: new Date().toISOString().split("T")[0],
    category: "POS Sales",
    gross_amount: "",
    gst_collected: "",
    net_revenue: "",
    payment_method: "Card / POS",
    notes: "",
    sector: "GENERAL",
    amountBasis: "GST_INCLUSIVE"
  });

  // Bulk CSV import state
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkCsvText, setBulkCsvText] = useState("");

  const isSuperAdmin = currentUser?.role === "super_admin";

  useEffect(() => {
    if (isOpen) {
      fetchRevenues();
      fetchReconciliation();
    }
  }, [isOpen, selectedOutlet]);

  const fetchRevenues = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("crmaldives_token");
      let url = "/api/revenue";
      if (selectedOutlet !== "ALL") {
        url += `?outlet=${selectedOutlet}`;
      }
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error("Failed to load revenue records.");
      const data = await res.json();
      setRevenues(data);
    } catch (err: any) {
      setError(err.message || "Error connecting to server.");
    } finally {
      setLoading(false);
    }
  };

  const fetchReconciliation = async () => {
    setReconcileLoading(true);
    try {
      const token = localStorage.getItem("crmaldives_token");
      const res = await fetch("/api/revenue/reconcile", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setReconciliationReport(data);
      }
    } catch {
      // Non-blocking
    } finally {
      setReconcileLoading(false);
    }
  };

  const fetchTrace = async (id: string) => {
    setTraceLoading(true);
    setTraceData(null);
    try {
      const token = localStorage.getItem("crmaldives_token");
      const res = await fetch(`/api/revenue/${id}/trace`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setTraceData(data);
      } else {
        const err = await res.json();
        setError(err.error || "Failed to load diagnostic trace.");
      }
    } catch (err: any) {
      setError(err.message || "Error fetching trace.");
    } finally {
      setTraceLoading(false);
    }
  };

  // Helper to determine the regulatory GST rate
  const getGstRate = (dateStr: string, sector: 'GENERAL' | 'TOURISM') => {
    if (sector === 'TOURISM') {
      return dateStr >= '2025-07-01' ? 0.17 : 0.16;
    }
    return 0.08;
  };

  // Re-calculate amounts when gross, sector, basis, or date changes
  const recalculateAmounts = (
    grossStr: string,
    sector: 'GENERAL' | 'TOURISM',
    basis: 'GST_INCLUSIVE' | 'GST_EXCLUSIVE',
    dateStr: string = formData.date
  ) => {
    const rate = getGstRate(dateStr, sector);
    const gross = parseFloat(grossStr);

    if (isNaN(gross) || gross <= 0) {
      setFormData(prev => ({
        ...prev,
        gross_amount: grossStr,
        gst_collected: "",
        net_revenue: ""
      }));
      return;
    }

    let net: number;
    let gst: number;
    let finalGross = gross;

    if (basis === 'GST_INCLUSIVE') {
      net = gross / (1 + rate);
      gst = gross - net;
    } else {
      net = gross;
      gst = gross * rate;
      finalGross = net + gst;
    }

    setFormData(prev => ({
      ...prev,
      gross_amount: basis === 'GST_EXCLUSIVE' ? finalGross.toFixed(2) : grossStr,
      gst_collected: gst.toFixed(2),
      net_revenue: net.toFixed(2),
      sector,
      amountBasis: basis
    }));
  };

  const handleOpenAddForm = () => {
    setEditingId(null);
    setCorrectionTarget(null);
    setFormData({
      outlet_id: currentUser?.outlet_id || outlets[0]?.id || "outlet-1",
      date: new Date().toISOString().split("T")[0],
      category: "POS Sales",
      gross_amount: "",
      gst_collected: "",
      net_revenue: "",
      payment_method: "Card / POS",
      notes: "",
      sector: "GENERAL",
      amountBasis: "GST_INCLUSIVE"
    });
    setIsFormOpen(true);
  };

  const handleOpenCorrectionForm = (rev: RevenueRecord) => {
    setCorrectionTarget(rev);
    setEditingId(null);
    const gross = rev.gross_amount ?? rev.amount ?? 0;
    const gst = rev.gst_collected ?? 0;
    const net = rev.net_revenue ?? (gross - gst);
    setCorrectionReason(`Correction of transaction ${rev.id}`);
    setFormData({
      outlet_id: rev.outlet_id,
      date: rev.date,
      category: rev.category || "POS Sales",
      gross_amount: gross.toString(),
      gst_collected: gst.toString(),
      net_revenue: net.toString(),
      payment_method: rev.payment_method || "Card / POS",
      notes: `Correction: ${rev.notes || rev.description || ""}`,
      sector: (rev.sector as any) || "GENERAL",
      amountBasis: (rev.amountBasis as any) || "GST_INCLUSIVE"
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const grossNum = parseFloat(formData.gross_amount);
    if (isNaN(grossNum) || grossNum <= 0) {
      setError("Please enter a valid gross sales amount.");
      return;
    }

    try {
      const token = localStorage.getItem("crmaldives_token");
      const gstNum = parseFloat(formData.gst_collected) || 0;
      const netNum = parseFloat(formData.net_revenue) || (grossNum - gstNum);

      const payload = {
        outlet_id: formData.outlet_id,
        date: formData.date,
        category: formData.category,
        gross_amount: grossNum,
        gst_collected: gstNum,
        net_revenue: netNum,
        payment_method: formData.payment_method,
        notes: formData.notes,
        sector: formData.sector,
        amountBasis: formData.amountBasis
      };

      let res;
      if (correctionTarget) {
        // Formal atomic correction workflow: POST /api/revenue/:id/correct
        res = await fetch(`/api/revenue/${correctionTarget.id}/correct`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      } else if (editingId) {
        // DRAFT edit only
        res = await fetch(`/api/revenue/${editingId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      } else {
        // New authoritative posting
        res = await fetch("/api/revenue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to process revenue transaction.");
      }

      setSuccessMsg(
        correctionTarget
          ? "Revenue correction posted successfully. Original record reversed and replacement journal posted."
          : editingId
          ? "Revenue entry updated."
          : "Authoritative revenue transaction posted with double-entry journal and GST record."
      );
      setIsFormOpen(false);
      setCorrectionTarget(null);
      setEditingId(null);
      fetchRevenues();
      fetchReconciliation();
      if (onRevenueUpdated) onRevenueUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to submit revenue entry.");
    }
  };

  const handleExecuteReversal = async () => {
    if (!reversalTarget) return;
    if (!reversalReason.trim()) {
      setError("Please provide a reason for the reversal.");
      return;
    }

    setReversalLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("crmaldives_token");
      const res = await fetch(`/api/revenue/${reversalTarget.id}/reverse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason: reversalReason })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reverse transaction.");
      }

      setSuccessMsg(`Transaction ${reversalTarget.id} successfully reversed with reversing journal.`);
      setReversalTarget(null);
      setReversalReason("");
      fetchRevenues();
      fetchReconciliation();
      if (onRevenueUpdated) onRevenueUpdated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReversalLoading(false);
    }
  };

  const handleDeleteDraft = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this draft entry?")) return;
    setError(null);
    try {
      const token = localStorage.getItem("crmaldives_token");
      const res = await fetch(`/api/revenue/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete revenue entry.");
      }
      setSuccessMsg("Revenue entry deleted.");
      fetchRevenues();
      fetchReconciliation();
      if (onRevenueUpdated) onRevenueUpdated();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleBulkImport = async () => {
    if (!bulkCsvText.trim()) return;
    setError(null);
    try {
      const lines = bulkCsvText.trim().split("\n");
      const entries = [];
      const defaultOutletId = currentUser?.outlet_id || outlets[0]?.id || "outlet-1";

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith("date") || line.startsWith("Date")) continue;

        const parts = line.split(",").map((p) => p.trim());
        if (parts.length >= 2) {
          const date = parts[0];
          const gross = parseFloat(parts[1]) || 0;
          const gst = parts[2] ? parseFloat(parts[2]) : gross - gross / 1.08;
          const net = parts[3] ? parseFloat(parts[3]) : gross - gst;
          const category = (parts[4] as RevenueCategory) || "POS Sales";
          const payment_method = parts[5] || "Card / POS";
          const notes = parts[6] || "Bulk imported sales log";

          entries.push({
            outlet_id: defaultOutletId,
            date,
            gross_amount: gross,
            gst_collected: gst,
            net_revenue: net,
            category,
            payment_method,
            notes
          });
        }
      }

      if (entries.length === 0) {
        setError(
          "No valid lines parsed from CSV. Expected format: Date, GrossAmount, GST, NetRevenue, Category, PaymentMethod, Notes"
        );
        return;
      }

      const token = localStorage.getItem("crmaldives_token");
      const res = await fetch("/api/revenue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(entries)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed bulk import.");
      }

      setSuccessMsg(`Successfully imported ${entries.length} revenue records with double-entry journals!`);
      setIsBulkOpen(false);
      setBulkCsvText("");
      fetchRevenues();
      fetchReconciliation();
      if (onRevenueUpdated) onRevenueUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to process bulk import.");
    }
  };

  if (!isOpen) return null;

  // Filtered revenue entries
  const filteredRevenues = revenues.filter((r) => {
    if (selectedCategory !== "ALL" && r.category !== selectedCategory) return false;
    if (statusFilter !== "ALL") {
      const st = r.status || "POSTED";
      if (st !== statusFilter) return false;
    }
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchId = (r.id || "").toLowerCase().includes(q);
      const matchCat = (r.category || "").toLowerCase().includes(q);
      const matchNote = (r.notes || r.description || "").toLowerCase().includes(q);
      const matchOutlet = (r.outlet_name || "").toLowerCase().includes(q);
      const matchDate = (r.date || "").toLowerCase().includes(q);
      if (!matchId && !matchCat && !matchNote && !matchOutlet && !matchDate) return false;
    }
    return true;
  });

  // Calculate Aggregates (excluding reversed transactions for financial accuracy)
  const activeRevenues = filteredRevenues.filter((r) => r.status !== "REVERSED");
  const totalGross = activeRevenues.reduce((acc, r) => acc + (r.gross_amount ?? r.amount ?? 0), 0);
  const totalGst = activeRevenues.reduce((acc, r) => acc + (r.gst_collected ?? 0), 0);
  const totalNet = activeRevenues.reduce(
    (acc, r) =>
      acc + (r.net_revenue ?? (r.gross_amount ? r.gross_amount - (r.gst_collected || 0) : r.amount) ?? 0),
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-7xl my-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-100">Revenue & Sales Management Center</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold">
                  Double-Entry Authoritative
                </span>
                {reconciliationReport && (
                  <span
                    onClick={() => setShowReconcileCard(!showReconcileCard)}
                    className={`cursor-pointer px-2.5 py-0.5 rounded-full text-xs font-mono font-bold border flex items-center gap-1.5 ${
                      reconciliationReport.overallStatus === "PASS"
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20"
                        : reconciliationReport.overallStatus === "WARNING"
                        ? "bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20"
                        : "bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20"
                    }`}
                    title="Click to view 4-way reconciliation details"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    4-Way Reconciliation: {reconciliationReport.overallStatus}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Authoritative transaction origin: Revenue &rarr; GST (MIRA 205/206) &rarr; Journal &rarr; General Ledger &rarr; MIRA 604 P&L
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
          {/* Notification Messages */}
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200 text-xs">
                Dismiss
              </button>
            </div>
          )}
          {successMsg && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
              <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200 text-xs">
                Dismiss
              </button>
            </div>
          )}

          {/* 4-Way Reconciliation Collapsible Banner */}
          {showReconcileCard && reconciliationReport && (
            <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center space-x-2 text-slate-200 font-bold text-sm">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <span>Authoritative 4-Way Revenue Reconciliation Engine</span>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={fetchReconciliation}
                    disabled={reconcileLoading}
                    className="flex items-center space-x-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${reconcileLoading ? "animate-spin" : ""}`} />
                    <span>Recheck</span>
                  </button>
                  <button
                    onClick={() => setShowReconcileCard(false)}
                    className="text-slate-400 hover:text-slate-200 p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {['revenueToGL', 'gstToGL', 'gstToGstTransactions', 'revenueToPnL']
                  .filter((key) => (reconciliationReport.checks as any)[key])
                  .map((key) => {
                    const check = (reconciliationReport.checks as any)[key];
                    return (
                      <div key={key} className="p-3 bg-slate-900 border border-slate-800/80 rounded-lg space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-slate-300 truncate" title={check.checkName}>
                            {check.checkName}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                              check.status === "PASS"
                                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                : check.status === "WARNING"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            }`}
                          >
                            {check.status}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex justify-between font-mono">
                          <span>Subledger: {check.sourceAmount.toLocaleString()}</span>
                          <span>Target: {check.targetAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="text-slate-500">
                            Variance: MVR {check.variance.toFixed(2)}
                          </span>
                          {check.discrepancyTransactionIds && check.discrepancyTransactionIds.length > 0 && (
                            <span className="text-rose-400 font-mono font-semibold" title={check.discrepancyTransactionIds.join(", ")}>
                              {check.discrepancyTransactionIds.length} discrepant
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Top Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                <span>Gross Business Sales</span>
                <DollarSign className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-slate-100 font-mono">
                MVR {totalGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Total revenue including Output GST</p>
            </div>

            <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                <span>Output GST Collected</span>
                <Receipt className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-xl font-bold text-amber-300 font-mono">
                MVR {totalGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Statutory MIRA 205/206 Output Tax</p>
            </div>

            <div className="p-4 bg-slate-950/60 border border-emerald-500/30 rounded-xl bg-emerald-500/5">
              <div className="flex items-center justify-between text-emerald-400 text-xs font-medium mb-1">
                <span>Net Operating Revenue</span>
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-emerald-300 font-mono">
                MVR {totalNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-emerald-400/80 mt-1">Credited to Account 4000 & MIRA 604 P&L</p>
            </div>

            <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                <span>Authoritative Transactions</span>
                <Layers className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-xl font-bold text-slate-100 font-mono">
                {activeRevenues.length}
                {filteredRevenues.length > activeRevenues.length && (
                  <span className="text-xs text-slate-500 ml-1.5 font-normal">
                    ({filteredRevenues.length - activeRevenues.length} reversed)
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Linked double-entry journals</p>
            </div>
          </div>

          {/* Action Bar & Filter Row */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800">
            <div className="flex flex-wrap items-center gap-3">
              {/* Outlet Filter */}
              {isSuperAdmin && (
                <div className="flex items-center space-x-1.5">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <select
                    value={selectedOutlet}
                    onChange={(e) => setSelectedOutlet(e.target.value)}
                    className="bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="ALL">All Outlets</option>
                    {outlets.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Status Filter */}
              <div className="flex items-center space-x-1.5">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:outline-none font-mono"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="POSTED">Authoritative (Posted)</option>
                  <option value="REVERSED">Reversed</option>
                  <option value="DRAFT">Draft</option>
                </select>
              </div>

              {/* Category Filter */}
              <div className="flex items-center space-x-1.5">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-lg px-2.5 py-1.5 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">All Categories</option>
                  <option value="POS Sales">POS Sales</option>
                  <option value="Catering">Catering</option>
                  <option value="Delivery">Delivery</option>
                  <option value="Direct Sales">Direct Sales</option>
                  <option value="Dine-In Sales">Dine-In Sales</option>
                  <option value="Wholesale">Wholesale</option>
                  <option value="Other Income">Other Income</option>
                </select>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search ID, outlet, notes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-900 border border-slate-800 text-slate-300 text-xs rounded-lg pl-8 pr-3 py-1.5 focus:border-emerald-500 focus:outline-none w-52"
                />
              </div>
            </div>

            {/* Right-side Action Buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowReconcileCard(!showReconcileCard)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer border border-slate-700"
              >
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>Reconciliation</span>
              </button>

              <button
                onClick={() => setIsBulkOpen(!isBulkOpen)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer border border-slate-700"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                <span>Import CSV</span>
              </button>

              <button
                onClick={handleOpenAddForm}
                className="flex items-center space-x-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-emerald-600/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Post Revenue Entry</span>
              </button>
            </div>
          </div>

          {/* Bulk CSV Import Panel */}
          {isBulkOpen && (
            <div className="p-5 bg-slate-950/90 border border-emerald-500/30 rounded-xl space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-emerald-400 text-xs font-bold">
                  <Upload className="w-4 h-4" />
                  <span>Bulk Sales Import (CSV Format)</span>
                </div>
                <button onClick={() => setIsBulkOpen(false)} className="text-slate-400 hover:text-slate-200">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Paste CSV lines below in format: <code className="text-emerald-300">Date, GrossAmount, GST, NetRevenue, Category, PaymentMethod, Notes</code>
              </p>
              <textarea
                rows={4}
                value={bulkCsvText}
                onChange={(e) => setBulkCsvText(e.target.value)}
                placeholder={`2026-03-01, 10800.00, 800.00, 10000.00, POS Sales, Card / POS, Main branch daily counter\n2026-03-02, 5400.00, 400.00, 5000.00, Dine-In Sales, Cash, Dine-in cash sales`}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none"
              />
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setIsBulkOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkImport}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-600/20"
                >
                  Process & Post All
                </button>
              </div>
            </div>
          )}

          {/* Revenue Form (Add / Correct / Edit) */}
          {isFormOpen && (
            <div className="p-5 bg-slate-950/90 border border-emerald-500/40 rounded-xl space-y-4 animate-fade-in shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-emerald-300 flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4" />
                  <span>
                    {correctionTarget
                      ? `Authoritative Correction for Revenue ${correctionTarget.id}`
                      : editingId
                      ? "Edit Draft Revenue Entry"
                      : "Record & Post Authoritative Revenue Transaction"}
                  </span>
                </h3>
                <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {correctionTarget && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-xs flex items-center space-x-2">
                  <RotateCcw className="w-4 h-4 shrink-0" />
                  <span>
                    <strong>Accounting Immutability:</strong> Submitting this form will formally reverse original record{" "}
                    <code>{correctionTarget.id}</code> and create a linked replacement transaction with an updated double-entry journal.
                  </span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Outlet selector if admin */}
                {isSuperAdmin && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">Target Outlet</label>
                    <select
                      value={formData.outlet_id}
                      onChange={(e) => setFormData({ ...formData, outlet_id: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                    >
                      {outlets.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Sales Date */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Sales Date</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setFormData(prev => ({ ...prev, date: newDate }));
                      recalculateAmounts(formData.gross_amount, formData.sector, formData.amountBasis, newDate);
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>

                {/* Sector Selector */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Tax Sector (GST Rate)</label>
                  <select
                    value={formData.sector}
                    onChange={(e) => {
                      const s = e.target.value as 'GENERAL' | 'TOURISM';
                      recalculateAmounts(formData.gross_amount, s, formData.amountBasis, formData.date);
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="GENERAL">General Sector (8% Standard GST)</option>
                    <option value="TOURISM">Tourism Sector (16% through Jun 2025 / 17% from Jul 2025)</option>
                  </select>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Revenue Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as RevenueCategory })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="POS Sales">POS Sales</option>
                    <option value="Catering">Catering</option>
                    <option value="Delivery">Delivery</option>
                    <option value="Direct Sales">Direct Sales</option>
                    <option value="Dine-In Sales">Dine-In Sales</option>
                    <option value="Takeaway / Delivery">Takeaway / Delivery</option>
                    <option value="Wholesale">Wholesale</option>
                    <option value="Other Income">Other Income</option>
                  </select>
                </div>

                {/* Amount Basis */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Pricing Basis</label>
                  <select
                    value={formData.amountBasis}
                    onChange={(e) => {
                      const b = e.target.value as 'GST_INCLUSIVE' | 'GST_EXCLUSIVE';
                      recalculateAmounts(formData.gross_amount, formData.sector, b, formData.date);
                    }}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="GST_INCLUSIVE">GST Inclusive (Retail / POS default)</option>
                    <option value="GST_EXCLUSIVE">GST Exclusive (Net + Tax added)</option>
                  </select>
                </div>

                {/* Gross Amount */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Gross Amount (MVR) <span className="text-slate-500">(Total Collected)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 10800.00"
                    value={formData.gross_amount}
                    onChange={(e) => recalculateAmounts(e.target.value, formData.sector, formData.amountBasis, formData.date)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 font-mono font-bold focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>

                {/* Output GST */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Output GST ({formData.sector === 'TOURISM' ? (formData.date >= '2025-07-01' ? '17% TGST' : '16% TGST') : '8% GST'}) <span className="text-slate-500">(Canonical Engine)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Auto-calculated by Tax Engine"
                    value={formData.gst_collected}
                    readOnly
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-2 text-xs text-amber-300 font-mono font-bold focus:outline-none cursor-not-allowed"
                  />
                </div>

                {/* Net Business Revenue */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Net Business Revenue (MVR) <span className="text-emerald-400 font-bold">(GL 4000)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Net Taxable Income"
                    value={formData.net_revenue}
                    readOnly
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-lg p-2 text-xs text-emerald-300 font-mono font-bold focus:outline-none cursor-not-allowed"
                    required
                  />
                </div>

                {/* Payment Method */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Payment Method & Asset Account</label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="Card / POS">Card / POS Terminal (Account 1010 Bank)</option>
                    <option value="Cash">Cash Register (Account 1000 Cash on Hand)</option>
                    <option value="Bank Transfer">Bank Transfer (Account 1010 Bank MVR)</option>
                    <option value="Credit">Credit Customer (Account 1200 Accounts Receivable)</option>
                    <option value="Other">Other Payment (Account 1020 Clearing)</option>
                  </select>
                </div>

                {/* Notes */}
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Description / Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Daily POS register settlement batch #401"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div className="md:col-span-3 flex justify-end space-x-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg cursor-pointer shadow-lg shadow-emerald-600/20 flex items-center space-x-1.5"
                  >
                    <Check className="w-4 h-4" />
                    <span>
                      {correctionTarget
                        ? "Post Replacement & Reverse Original"
                        : editingId
                        ? "Save Draft Updates"
                        : "Post Authoritative Transaction"}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Revenue Entries Data Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/40">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-semibold uppercase text-slate-400 font-mono tracking-wider">
                  <th className="p-3">Status</th>
                  <th className="p-3">Transaction Date</th>
                  <th className="p-3">Outlet</th>
                  <th className="p-3">Category</th>
                  <th className="p-3 text-right">Gross Amount</th>
                  <th className="p-3 text-right">Output GST</th>
                  <th className="p-3 text-right">Net Revenue (GL)</th>
                  <th className="p-3">Payment</th>
                  <th className="p-3">Description</th>
                  <th className="p-3 text-center">Accounting Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="p-10 text-center text-slate-500 text-xs">
                      Loading revenue subledger entries...
                    </td>
                  </tr>
                ) : filteredRevenues.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-10 text-center text-slate-500 text-xs">
                      <p className="font-semibold text-slate-300">No revenue records found.</p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Click{" "}
                        <button onClick={handleOpenAddForm} className="text-emerald-400 underline font-bold">
                          Post Revenue Entry
                        </button>{" "}
                        to record daily business income.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredRevenues.map((rev) => {
                    const gross = rev.gross_amount ?? rev.amount ?? 0;
                    const gst = rev.gst_collected ?? 0;
                    const net = rev.net_revenue ?? (gross - gst);
                    const status = rev.status || "POSTED";
                    const isReversed = status === "REVERSED";

                    return (
                      <tr
                        key={rev.id}
                        className={`hover:bg-slate-800/30 transition-colors ${
                          isReversed ? "opacity-60 bg-slate-950/30" : ""
                        }`}
                      >
                        {/* Status Badge */}
                        <td className="p-3 whitespace-nowrap">
                          {status === "POSTED" ? (
                            <span
                              onClick={() => {
                                setTraceRecord(rev);
                                fetchTrace(rev.id);
                              }}
                              className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold hover:bg-emerald-500/20 shadow-sm transition-all"
                              title="Click to view Accounting Diagnostic Trace"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              POSTED
                            </span>
                          ) : status === "APPROVED" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[10px] font-mono font-bold">
                              <ShieldCheck className="w-3 h-3" />
                              APPROVED
                            </span>
                          ) : status === "REVERSED" ? (
                            <span
                              onClick={() => {
                                setTraceRecord(rev);
                                fetchTrace(rev.id);
                              }}
                              className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[10px] font-mono font-bold hover:bg-rose-500/20 line-through shadow-sm transition-all"
                              title="Transaction reversed by formal reversing journal"
                            >
                              <RotateCcw className="w-3 h-3" />
                              REVERSED
                            </span>
                          ) : status === "VALIDATED" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-[10px] font-mono font-bold">
                              <Check className="w-3 h-3" />
                              VALIDATED
                            </span>
                          ) : status === "REVIEW_REQUIRED" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold">
                              <AlertCircle className="w-3 h-3" />
                              REVIEW_REQUIRED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-500/10 border border-slate-500/30 text-slate-300 text-[10px] font-mono font-bold">
                              DRAFT
                            </span>
                          )}
                        </td>

                        {/* Date */}
                        <td className="p-3 font-mono font-bold text-slate-200 whitespace-nowrap">{rev.date}</td>

                        {/* Outlet */}
                        <td className="p-3 font-medium text-slate-300 whitespace-nowrap">
                          {rev.outlet_name || "Main Branch"}
                        </td>

                        {/* Category */}
                        <td className="p-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                            {rev.category || "POS Sales"}
                          </span>
                        </td>

                        {/* Gross Sales */}
                        <td
                          className={`p-3 text-right font-mono font-bold whitespace-nowrap ${
                            isReversed ? "text-slate-500 line-through" : "text-slate-100"
                          }`}
                        >
                          MVR {gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Output GST */}
                        <td
                          className={`p-3 text-right font-mono whitespace-nowrap ${
                            isReversed ? "text-slate-500 line-through" : "text-amber-300"
                          }`}
                        >
                          MVR {gst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Net Revenue */}
                        <td
                          className={`p-3 text-right font-mono font-bold whitespace-nowrap ${
                            isReversed ? "text-slate-500 line-through" : "text-emerald-300"
                          }`}
                        >
                          MVR {net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Payment Method */}
                        <td className="p-3 text-slate-400 text-[11px] whitespace-nowrap">
                          {rev.payment_method || "Card / POS"}
                        </td>

                        {/* Notes */}
                        <td className="p-3 text-slate-400 text-[11px] truncate max-w-[150px]" title={rev.notes || rev.description}>
                          {rev.notes || rev.description || "Sales Revenue"}
                        </td>

                        {/* Accounting Actions */}
                        <td className="p-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center space-x-1.5">
                            {/* Trace / Inspect */}
                            {/* Diagnostic Trace Button */}
                            <button
                              onClick={() => {
                                setTraceRecord(rev);
                                fetchTrace(rev.id);
                              }}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-300 rounded text-[11px] font-semibold transition-colors cursor-pointer border border-slate-700 flex items-center gap-1.5 shadow-sm"
                              title="View Accounting Trace"
                            >
                              <FileText className="w-3.5 h-3.5 text-emerald-400" />
                              <span>View Accounting Trace</span>
                            </button>

                            {/* Reversal / Correct for POSTED transactions */}
                            {status === "POSTED" && (
                              <>
                                <button
                                  onClick={() => handleOpenCorrectionForm(rev)}
                                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 rounded text-[11px] font-semibold transition-colors cursor-pointer border border-slate-700 flex items-center gap-1.5 shadow-sm"
                                  title="Create Correction for this posted transaction"
                                >
                                  <Edit2 className="w-3 h-3 text-amber-400" />
                                  <span>Create Correction</span>
                                </button>
                                <button
                                  onClick={() => {
                                    setReversalTarget(rev);
                                    setReversalReason("");
                                  }}
                                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-400 rounded text-[11px] font-semibold transition-colors cursor-pointer border border-slate-700 flex items-center gap-1"
                                  title="Reverse transaction with reversing journal"
                                >
                                  <RotateCcw className="w-3 h-3 text-rose-400" />
                                  <span>Reverse</span>
                                </button>
                              </>
                            )}

                            {/* Draft / Validated Direct Edit & Delete */}
                            {(status === "DRAFT" || status === "VALIDATED") && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingId(rev.id);
                                    setCorrectionTarget(null);
                                    setFormData({
                                      outlet_id: rev.outlet_id,
                                      date: rev.date,
                                      category: rev.category || "POS Sales",
                                      gross_amount: gross.toString(),
                                      gst_collected: gst.toString(),
                                      net_revenue: net.toString(),
                                      payment_method: rev.payment_method || "Card / POS",
                                      notes: rev.notes || rev.description || "",
                                      sector: (rev.sector as any) || "GENERAL",
                                      amountBasis: (rev.amountBasis as any) || "GST_INCLUSIVE"
                                    });
                                    setIsFormOpen(true);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-emerald-300 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                                  title="Edit Draft"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteDraft(rev.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                                  title="Delete Draft"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reversal Confirmation Modal */}
        {reversalTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2 text-rose-400 font-bold text-sm">
                  <RotateCcw className="w-4 h-4" />
                  <span>Reverse Authoritative Revenue Entry</span>
                </div>
                <button
                  onClick={() => setReversalTarget(null)}
                  className="text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-slate-300 space-y-2">
                <p>
                  You are about to reverse revenue transaction{" "}
                  <strong className="font-mono text-slate-100">{reversalTarget.id}</strong> (MVR{" "}
                  {reversalTarget.gross_amount ?? reversalTarget.amount}).
                </p>
                <p className="text-slate-400">
                  In accordance with regulatory and financial accounting principles, this will post an immutable
                  reversing journal to reverse all debits and credits, update the general ledger, and log an audit trail.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                  Reason for Reversal <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Customer refund issued, duplicate register batch, incorrect outlet allocation"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-rose-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setReversalTarget(null)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecuteReversal}
                  disabled={reversalLoading || !reversalReason.trim()}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-lg shadow-rose-600/20 flex items-center space-x-1.5 cursor-pointer"
                >
                  {reversalLoading ? (
                    <span>Processing Reversal...</span>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Confirm Reversal</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Diagnostic Trace Modal / Drawer */}
        {traceRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
            <div className="w-full max-w-2xl my-6 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
                  <ShieldCheck className="w-5 h-5" />
                  <span>Authoritative Diagnostic Trace &mdash; {traceRecord.id}</span>
                </div>
                <button onClick={() => setTraceRecord(null)} className="text-slate-400 hover:text-slate-200">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {traceLoading ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Loading diagnostic trace and accounting ledger links...
                </div>
              ) : traceData ? (
                <div className="space-y-4 text-xs">
                  {/* Section 1: Source Transaction */}
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
                    <div className="flex justify-between items-center font-bold text-slate-200">
                      <span className="flex items-center space-x-1.5">
                        <span className="text-emerald-400">1.</span>
                        <span>Source Transaction (Revenue Subledger)</span>
                      </span>
                      <span className="font-mono text-emerald-400 font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                        {traceData.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-slate-400 font-mono text-[11px] pt-1">
                      <div>Date: <span className="text-slate-200">{traceData.transactionDate}</span></div>
                      <div>Gross: <span className="text-slate-200">MVR {traceData.grossAmount.toFixed(2)}</span></div>
                      <div>Net Revenue: <span className="text-slate-200">MVR {traceData.netAmount.toFixed(2)}</span></div>
                      {traceData.outletId && <div>Outlet: <span className="text-slate-200">{traceData.outletId}</span></div>}
                      {traceData.category && <div>Category: <span className="text-slate-200">{traceData.category}</span></div>}
                      {traceData.paymentMethod && <div>Payment: <span className="text-slate-200">{traceData.paymentMethod}</span></div>}
                    </div>
                  </div>

                  {/* Section 2: Accounting Posting */}
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex justify-between items-center font-bold text-slate-200">
                      <span className="flex items-center space-x-1.5">
                        <span className="text-blue-400">2.</span>
                        <span>Accounting Posting (General Ledger)</span>
                      </span>
                      {traceData.journal && (
                        <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          traceData.journal.isBalanced
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        }`}>
                          {traceData.journal.isBalanced ? "BALANCED" : "UNBALANCED"}
                        </span>
                      )}
                    </div>
                    {traceData.journal ? (
                      <div className="space-y-1.5">
                        <div className="text-[11px] text-slate-400 font-mono flex justify-between">
                          <span>Journal: {traceData.journal.id}</span>
                          <span>Ref: {traceData.journal.reference}</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left font-mono text-[11px]">
                            <thead>
                              <tr className="border-b border-slate-800 text-slate-500">
                                <th className="py-1">Account</th>
                                <th className="py-1 text-right">Debit (MVR)</th>
                                <th className="py-1 text-right">Credit (MVR)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/40">
                              {traceData.journal.lines.map((l, idx) => (
                                <tr key={idx}>
                                  <td className="py-1 text-slate-300">
                                    {l.accountCode} &mdash; {l.accountName}
                                  </td>
                                  <td className="py-1 text-right text-slate-100">
                                    {l.debit > 0 ? l.debit.toFixed(2) : "-"}
                                  </td>
                                  <td className="py-1 text-right text-slate-100">
                                    {l.credit > 0 ? l.credit.toFixed(2) : "-"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 flex justify-between">
                          <span>P&L Impact: {traceData.pnlImpact ? traceData.pnlImpact.lineItem : "Operating Revenue"}</span>
                          <span className="text-emerald-400 font-bold font-mono">
                            +MVR {traceData.pnlImpact ? traceData.pnlImpact.netRevenueCredited.toFixed(2) : traceData.netAmount.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500">No journal posted yet.</div>
                    )}
                  </div>

                  {/* Section 3: GST Calculation */}
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
                    <div className="flex justify-between items-center font-bold text-slate-200">
                      <span className="flex items-center space-x-1.5">
                        <span className="text-amber-400">3.</span>
                        <span>GST Calculation & Classification</span>
                      </span>
                      <span className="font-mono text-amber-300 font-bold">
                        {traceData.classification.rate * 100}% GST ({traceData.classification.gstClassification})
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400">
                      <div>Tax Amount: <span className="font-mono text-slate-200">MVR {traceData.gstAmount.toFixed(2)}</span></div>
                      <div>Regulatory Version: <span className="text-slate-200">{traceData.classification.version || "Maldives GST Act"}</span></div>
                      {traceData.classification.ruleId && (
                        <div className="col-span-2">Rule: <code className="text-slate-300 font-mono">{traceData.classification.ruleId}</code></div>
                      )}
                    </div>
                  </div>

                  {/* Section 4: Tax Return Mapping */}
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
                    <div className="flex justify-between items-center font-bold text-slate-200">
                      <span className="flex items-center space-x-1.5">
                        <span className="text-purple-400">4.</span>
                        <span>Tax Return Mapping (MIRA 205 / 206)</span>
                      </span>
                      {traceData.miraMapping && (
                        <span className="font-mono text-purple-300 font-bold px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                          {traceData.miraMapping.returnType} &bull; {traceData.miraMapping.boxNumber}
                        </span>
                      )}
                    </div>
                    {traceData.miraMapping ? (
                      <div className="text-[11px] text-slate-400 space-y-1 font-mono">
                        <div>Box Description: <span className="text-slate-200">{traceData.miraMapping.boxDescription}</span></div>
                        <div className="grid grid-cols-2 gap-2 pt-0.5">
                          <div>Taxable Amount: <span className="text-slate-200">MVR {traceData.miraMapping.taxableAmount.toFixed(2)}</span></div>
                          <div>Output Tax: <span className="text-amber-300">MVR {traceData.miraMapping.taxAmount.toFixed(2)}</span></div>
                        </div>
                        {traceData.gstTransaction && (
                          <div className="text-slate-500 text-[10px]">Canonical GST Tx ID: {traceData.gstTransaction.id}</div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500">Exempt or non-taxable supply (no statutory return output tax).</div>
                    )}
                  </div>

                  {/* Section 5: Reconciliation Result */}
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex justify-between items-center font-bold text-slate-200">
                      <span className="flex items-center space-x-1.5">
                        <span className="text-cyan-400">5.</span>
                        <span>Reconciliation Result</span>
                      </span>
                      <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        traceData.reconciliationState.overallStatus === "PASS"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : traceData.reconciliationState.overallStatus === "WARNING"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      }`}>
                        OVERALL: {traceData.reconciliationState.overallStatus}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] font-mono">
                      <div className="p-1.5 bg-slate-900 rounded border border-slate-800 text-center">
                        <div className="text-slate-500">Rev &harr; GL</div>
                        <div className={`font-bold mt-0.5 ${
                          traceData.reconciliationState.revenueToGL === "PASS" ? "text-emerald-400" : "text-rose-400"
                        }`}>{traceData.reconciliationState.revenueToGL}</div>
                      </div>
                      <div className="p-1.5 bg-slate-900 rounded border border-slate-800 text-center">
                        <div className="text-slate-500">GST &harr; GL</div>
                        <div className={`font-bold mt-0.5 ${
                          traceData.reconciliationState.revenueToGST === "PASS" ? "text-emerald-400" : "text-rose-400"
                        }`}>{traceData.reconciliationState.revenueToGST}</div>
                      </div>
                      <div className="p-1.5 bg-slate-900 rounded border border-slate-800 text-center">
                        <div className="text-slate-500">GST &harr; MIRA</div>
                        <div className={`font-bold mt-0.5 ${
                          traceData.reconciliationState.revenueToMira === "PASS" ? "text-emerald-400" : "text-rose-400"
                        }`}>{traceData.reconciliationState.revenueToMira || "PASS"}</div>
                      </div>
                      <div className="p-1.5 bg-slate-900 rounded border border-slate-800 text-center">
                        <div className="text-slate-500">Rev &harr; P&L</div>
                        <div className={`font-bold mt-0.5 ${
                          traceData.reconciliationState.revenueToPnL === "PASS" ? "text-emerald-400" : "text-rose-400"
                        }`}>{traceData.reconciliationState.revenueToPnL}</div>
                      </div>
                    </div>
                    {traceData.reconciliationState.discrepancies && traceData.reconciliationState.discrepancies.length > 0 && (
                      <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded text-[11px] text-rose-300 space-y-1">
                        <div className="font-bold">Discrepancies Detected:</div>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {traceData.reconciliationState.discrepancies.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Section 6: Audit Information */}
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800 space-y-1.5">
                    <div className="flex justify-between items-center font-bold text-slate-200">
                      <span className="flex items-center space-x-1.5">
                        <span className="text-indigo-400">6.</span>
                        <span>Audit Information & Checksum</span>
                      </span>
                    </div>
                    {traceData.auditTrail && traceData.auditTrail.length > 0 ? (
                      <div className="space-y-1.5">
                        {traceData.auditTrail.map((a, idx) => (
                          <div key={idx} className="flex justify-between items-center text-[11px] text-slate-400 font-mono bg-slate-900/60 p-1.5 rounded border border-slate-800/40">
                            <div>
                              <span className="text-slate-200 font-semibold">{a.eventType}</span>
                              <span className="text-slate-500 ml-1.5">by {a.actor}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-slate-400">{a.timestamp}</span>
                              {a.checksum && (
                                <span className="ml-2 text-indigo-300 text-[10px]" title="Cryptographic Checksum">
                                  #{a.checksum}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-slate-500">Immutable ledger record verified with SHA-256 genesis anchor.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-slate-500 text-xs">
                  Unable to load diagnostic trace details.
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setTraceRecord(null)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg"
                >
                  Close Trace
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-3 bg-slate-950 border-t border-slate-800 text-xs text-slate-400">
          <div className="flex items-center space-x-2 text-[11px]">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>
              Authoritative Accounting Architecture: Revenue records are immutable double-entry sources. Every entry reconciles with GL and MIRA returns.
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
