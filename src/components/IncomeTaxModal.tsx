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
  PieChart
} from "lucide-react";
import { Mira604Summary, RevenueRecord, MiraSchedule1Category } from "../types";

interface IncomeTaxModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOutlet?: string;
  authToken?: string;
}

export const IncomeTaxModal: React.FC<IncomeTaxModalProps> = ({
  isOpen,
  onClose,
  selectedOutlet = "ALL",
  authToken
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [summary, setSummary] = useState<Mira604Summary | null>(null);
  const [revenues, setRevenues] = useState<RevenueRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "schedule1" | "revenue">("summary");

  // New Revenue Form State
  const [showRevForm, setShowRevForm] = useState(false);
  const [revDate, setRevDate] = useState(new Date().toISOString().split("T")[0]);
  const [revCategory, setRevCategory] = useState<RevenueRecord["category"]>("POS Sales");
  const [revDescription, setRevDescription] = useState("Daily POS Sales Settlement");
  const [revAmount, setRevAmount] = useState("");
  const [revPaymentMethod, setRevPaymentMethod] = useState<RevenueRecord["payment_method"]>("Card / POS");
  const [savingRev, setSavingRev] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchReportData();
    }
  }, [isOpen, selectedYear, selectedOutlet]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      // Fetch Income Tax MIRA 604 Summary
      const taxRes = await fetch(`/api/reports/income-tax?year=${selectedYear}&outlet_id=${selectedOutlet}`, { headers });
      if (taxRes.ok) {
        const taxData = await taxRes.json();
        setSummary(taxData);
      }

      // Fetch Revenue Entries
      const revRes = await fetch(`/api/revenue`, { headers });
      if (revRes.ok) {
        const revData = await revRes.json();
        setRevenues(revData.filter((r: RevenueRecord) => r.year === selectedYear));
      }
    } catch (e) {
      console.error("Failed to load tax report data", e);
    } finally {
      setLoading(false);
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
        fetchReportData();
      }
    } catch (e) {
      console.error("Failed to save revenue entry", e);
    } finally {
      setSavingRev(false);
    }
  };

  const handleDeleteRevenue = async (id: string) => {
    if (!confirm("Are you sure you want to delete this revenue record?")) return;

    try {
      const headers: Record<string, string> = {};
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const res = await fetch(`/api/revenue/${id}`, { method: "DELETE", headers });
      if (res.ok) {
        fetchReportData();
      }
    } catch (e) {
      console.error("Failed to delete revenue record", e);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-5xl w-full text-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/90">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-slate-100">MIRA 604 Income Tax Return Engine</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                  Version 25.1 Compliant
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Maldives Inland Revenue Authority • Income Tax Act & Schedule 1 Statement of Profit or Loss
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
              onClick={fetchReportData}
              className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Refresh Tax Report"
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
        <div className="flex items-center border-b border-slate-800/80 px-6 bg-slate-950/60 text-xs font-semibold">
          <button
            onClick={() => setActiveTab("summary")}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center space-x-2 cursor-pointer ${
              activeTab === "summary"
                ? "border-emerald-500 text-emerald-400 font-bold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <PieChart className="w-4 h-4" />
            <span>MIRA 604 Summary</span>
          </button>

          <button
            onClick={() => setActiveTab("schedule1")}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center space-x-2 cursor-pointer ${
              activeTab === "schedule1"
                ? "border-emerald-500 text-emerald-400 font-bold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span>Schedule 1 Expense Breakdown</span>
          </button>

          <button
            onClick={() => setActiveTab("revenue")}
            className={`py-3 px-4 border-b-2 transition-colors flex items-center space-x-2 cursor-pointer ${
              activeTab === "revenue"
                ? "border-emerald-500 text-emerald-400 font-bold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Revenue / POS Sales Log</span>
            <span className="ml-1.5 px-2 py-0.2 rounded-full bg-slate-800 text-slate-300 text-[10px]">
              {revenues.length}
            </span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
              <p className="text-slate-400 font-semibold">Calculating MIRA 604 tax adjustments and Schedule 1 figures...</p>
            </div>
          ) : summary ? (
            <>
              {/* TAB 1: MIRA 604 OVERVIEW */}
              {activeTab === "summary" && (
                <div className="space-y-6">
                  {/* Key Metrics Header Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                      <span className="text-slate-400 font-semibold block text-[11px]">Total Revenue</span>
                      <span className="text-xl font-mono font-bold text-emerald-400">
                        MVR {summary.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-slate-500 block">{summary.total_revenue_entries} sales entries</span>
                    </div>

                    <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                      <span className="text-slate-400 font-semibold block text-[11px]">Cost of Sales</span>
                      <span className="text-xl font-mono font-bold text-amber-400">
                        MVR {summary.cost_of_sales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-slate-500 block">Direct ingredients & purchases</span>
                    </div>

                    <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-1">
                      <span className="text-slate-400 font-semibold block text-[11px]">Operating Expenses</span>
                      <span className="text-xl font-mono font-bold text-slate-200">
                        MVR {summary.operating_expenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-slate-500 block">Schedule 1 operating costs</span>
                    </div>

                    <div className="bg-emerald-950/30 p-4 rounded-2xl border border-emerald-500/40 space-y-1">
                      <span className="text-emerald-300 font-bold block text-[11px]">Estimated MIRA Income Tax</span>
                      <span className="text-xl font-mono font-bold text-emerald-400">
                        MVR {summary.estimated_income_tax.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                      <span className="text-[10px] text-emerald-300/80 block font-mono">
                        {summary.taxpayer_profile === "COMPANY" ? "Pvt Ltd 15% Rate" : "Sole Proprietor Brackets"}
                      </span>
                    </div>
                  </div>

                  {/* Tax Computation Breakdown Box */}
                  <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center space-x-2 text-slate-200 font-bold">
                        <Building className="w-4 h-4 text-emerald-400" />
                        <span>MIRA 604 Statement of Profit or Loss (Tax Calculation)</span>
                      </div>
                      <span className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-slate-300 font-mono text-[11px]">
                        Accounting Basis: <strong className="text-emerald-400">{summary.accounting_basis}</strong>
                      </span>
                    </div>

                    <div className="space-y-2.5 text-xs font-mono">
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-300 font-sans">Total Gross Revenue</span>
                        <span className="text-slate-100 font-bold">MVR {summary.revenue.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400 pl-4 font-sans">• Less: Cost of Sales (Direct Purchases / Ingredients)</span>
                        <span className="text-amber-400">- MVR {summary.cost_of_sales.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between py-1.5 bg-slate-900/60 px-3 rounded-lg border border-slate-800 font-bold">
                        <span className="text-emerald-400 font-sans">Gross Profit</span>
                        <span className="text-emerald-400">MVR {summary.gross_profit.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400 pl-4 font-sans">• Less: Schedule 1 Operating Expenses</span>
                        <span className="text-amber-400">- MVR {summary.operating_expenses.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between py-1.5 bg-slate-900/80 px-3 rounded-lg border border-slate-800 font-bold">
                        <span className="text-slate-200 font-sans">Net Accounting Profit / (Loss)</span>
                        <span className={summary.net_accounting_profit >= 0 ? "text-slate-100" : "text-amber-400"}>
                          MVR {summary.net_accounting_profit.toFixed(2)}
                        </span>
                      </div>

                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="text-slate-400 pl-4 font-sans">+ Tax Add-Back: Non-Deductible Expenses / Adjustments</span>
                        <span className="text-emerald-400">+ MVR {summary.non_deductible_addbacks.toFixed(2)}</span>
                      </div>

                      {summary.total_capital_allowances !== undefined && summary.total_capital_allowances > 0 && (
                        <div className="flex justify-between py-1 border-b border-slate-800/60">
                          <span className="text-purple-300 pl-4 font-sans">- Less: Schedule 2 Capital Allowance Deduction</span>
                          <span className="text-purple-300">- MVR {summary.total_capital_allowances.toFixed(2)}</span>
                        </div>
                      )}

                      <div className="flex justify-between py-2 bg-emerald-950/40 px-3 rounded-xl border border-emerald-500/40 font-bold text-sm">
                        <span className="text-emerald-300 font-sans">MIRA Taxable Income</span>
                        <span className="text-emerald-300">MVR {summary.taxable_income.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800/80 text-[11px] text-slate-300 space-y-1">
                      <span className="font-bold text-emerald-400 block">Applied Tax Rule:</span>
                      <p>{summary.tax_brackets_applied}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: SCHEDULE 1 BREAKDOWN */}
              {activeTab === "schedule1" && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-100 text-sm">MIRA Schedule 1 Expense Categories</h3>
                      <p className="text-[11px] text-slate-400">
                        Mapped directly from OCR classified purchase bills and operational expenses.
                      </p>
                    </div>
                    <span className="text-xs font-mono px-3 py-1 bg-slate-900 rounded-lg border border-slate-800 text-emerald-400 font-bold">
                      {summary.total_bills_analyzed} Bills Included
                    </span>
                  </div>

                  <div className="bg-slate-950/80 rounded-2xl border border-slate-800 overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                        <tr>
                          <th className="py-3 px-4">MIRA Schedule 1 Category</th>
                          <th className="py-3 px-4">Income Tax Role</th>
                          <th className="py-3 px-4 text-right">Total Amount (MVR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {Object.entries(summary.schedule1_breakdown).map(([category, amount]) => (
                          <tr key={category} className="hover:bg-slate-900/40 transition-colors">
                            <td className="py-3 px-4 font-sans font-semibold text-slate-200">{category}</td>
                            <td className="py-3 px-4 text-slate-400 font-sans text-[11px]">
                              {category === "Cost of Sales"
                                ? "Direct Cost of Goods Sold"
                                : category === "Capital Asset (Schedule 2)"
                                ? "Capital Expenditure (Schedule 2 Allowance)"
                                : "Deductible Operating Expense"}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-slate-100">
                              MVR {Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: REVENUE LOG MANAGER */}
              {activeTab === "revenue" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-slate-950/80 rounded-2xl border border-slate-800">
                    <div>
                      <h3 className="font-bold text-slate-100 text-sm">Business Revenue & Sales Settlement Log</h3>
                      <p className="text-[11px] text-slate-400">
                        Log daily POS settlements or restaurant sales to compute true MIRA taxable gross profit.
                      </p>
                    </div>

                    <button
                      onClick={() => setShowRevForm(!showRevForm)}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center space-x-1.5 cursor-pointer shadow-md text-xs transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Log Revenue</span>
                    </button>
                  </div>

                  {/* Add Revenue Form */}
                  {showRevForm && (
                    <form onSubmit={handleAddRevenue} className="p-4 bg-slate-900 rounded-2xl border border-emerald-500/40 space-y-3">
                      <h4 className="font-bold text-emerald-400 text-xs">Record Sales / Revenue Entry</h4>
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
                          placeholder="e.g. Daily POS Settlement for Male Branch"
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
                              <td className="py-3 px-4 text-emerald-400 font-sans font-semibold">{rev.category}</td>
                              <td className="py-3 px-4 text-slate-200 font-sans">{rev.description}</td>
                              <td className="py-3 px-4 text-slate-400 font-sans">{rev.outlet_name || "Main Outlet"}</td>
                              <td className="py-3 px-4 text-right font-bold text-emerald-400">
                                MVR {rev.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() => handleDeleteRevenue(rev.id)}
                                  className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                                  title="Delete Record"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
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
            <div className="py-12 text-center text-slate-400">No report data found.</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800/80 bg-slate-900/90 text-xs">
          <div className="flex items-center space-x-2 text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Official MIRA 604 Schedule 1 Tax Preparation Engine</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
