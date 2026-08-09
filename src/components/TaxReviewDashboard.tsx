import React, { useState, useEffect } from "react";
import {
  X,
  FileText,
  DollarSign,
  TrendingUp,
  Building,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Calculator,
  ShieldCheck,
  Receipt,
  PieChart,
  Download,
  Printer,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  HelpCircle,
  Building2,
  ChevronRight,
  Sparkles,
  ArrowDownRight
} from "lucide-react";
import { Mira604Summary, Outlet, AuthUser, MiraSchedule1Category } from "../types";

interface TaxReviewDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  outlets: Outlet[];
}

export const TaxReviewDashboard: React.FC<TaxReviewDashboardProps> = ({
  isOpen,
  onClose,
  currentUser,
  outlets
}) => {
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedOutlet, setSelectedOutlet] = useState<string>("ALL");
  const [summary, setSummary] = useState<Mira604Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "schedule1" | "audit" | "export">("summary");

  const isSuperAdmin = currentUser?.role === "super_admin";

  useEffect(() => {
    if (isOpen) {
      fetchTaxReport();
    }
  }, [isOpen, selectedYear, selectedOutlet]);

  const fetchTaxReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("crmaldives_token");
      let url = `/api/tax-report/${selectedYear}`;
      if (selectedOutlet !== "ALL") {
        url += `?outlet_id=${selectedOutlet}`;
      }
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error("Failed to compile tax report.");
      const data = await res.json();
      setSummary(data);
    } catch (err: any) {
      setError(err.message || "Failed to load tax computation data.");
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!summary) return;
    const rows = [
      ["MIRA 604 INCOME TAX RETURN PACKAGE", `Tax Year: ${summary.year}`],
      ["Taxpayer Profile", summary.taxpayer_profile],
      ["Accounting Basis", summary.accounting_basis],
      ["Outlet Filter", summary.outlet_id],
      [],
      ["EXECUTIVE TAX SUMMARY"],
      ["Gross Revenue", summary.revenue.toFixed(2)],
      ["Cost of Sales", summary.cost_of_sales.toFixed(2)],
      ["Gross Profit", summary.gross_profit.toFixed(2)],
      ["Operating Expenses", summary.operating_expenses.toFixed(2)],
      ["Net Accounting Profit", summary.net_accounting_profit.toFixed(2)],
      ["Non-Deductible Addbacks (+)", summary.non_deductible_addbacks.toFixed(2)],
      ["Capital Allowances (-)", (summary.total_capital_allowances || 0).toFixed(2)],
      ["MIRA Net Taxable Income", summary.taxable_income.toFixed(2)],
      ["Estimated Income Tax Payable", summary.estimated_income_tax.toFixed(2)],
      ["Tax Rules Applied", summary.tax_brackets_applied],
      [],
      ["SCHEDULE 1 EXPENSE BREAKDOWN"],
      ["Category", "Amount (MVR)"]
    ];

    Object.entries(summary.schedule1_breakdown).forEach(([cat, amt]) => {
      rows.push([cat, Number(amt).toFixed(2)]);
    });

    if (summary.audit_checks) {
      rows.push([]);
      rows.push(["AUDIT & COMPLIANCE SUMMARY"]);
      rows.push(["Audit Status", summary.audit_checks.is_audit_passed ? "PASSED" : "ACTION REQUIRED"]);
      rows.push(["Unverified Documents", summary.audit_checks.unverified_documents_count.toString()]);
      rows.push(["Missing Sales Months", summary.audit_checks.missing_revenue_months.join("; ") || "None"]);
      rows.push(["Unclassified Expenses", summary.audit_checks.unclassified_expenses_count.toString()]);
    }

    const csvContent = "data:text/csv;charset=utf-8," + rows.map((e) => e.map((val) => `"${val}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `MIRA_604_Tax_Package_${summary.year}_${summary.taxpayer_profile}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintPackage = () => {
    window.print();
  };

  if (!isOpen) return null;

  const auditPassed = summary?.audit_checks?.is_audit_passed ?? true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto print:p-0 print:static print:bg-white">
      <div className="relative w-full max-w-6xl my-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden print:max-h-none print:shadow-none print:border-none print:bg-white print:text-black">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-10 print:hidden">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-slate-100">MIRA 604 Tax Preparation Center</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold">
                  Schedule 1 Package
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Official Maldives Inland Revenue Authority Income Tax Return Compiler & Statutory Computation Engine
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Year Selector */}
            <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <span className="text-slate-400 font-semibold">Tax Period:</span>
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

            {/* Outlet Selector if admin */}
            {isSuperAdmin && (
              <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={selectedOutlet}
                  onChange={(e) => setSelectedOutlet(e.target.value)}
                  className="bg-transparent text-slate-200 font-medium focus:outline-none cursor-pointer"
                >
                  <option value="ALL">All Outlets</option>
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={fetchTaxReport}
              className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Refresh Tax Compilation"
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
        <div className="flex items-center justify-between border-b border-slate-800/80 px-6 bg-slate-950/60 text-xs font-semibold print:hidden">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setActiveTab("summary")}
              className={`py-3 px-4 border-b-2 transition-colors flex items-center space-x-2 cursor-pointer ${
                activeTab === "summary"
                  ? "border-emerald-500 text-emerald-400 font-bold"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <PieChart className="w-4 h-4" />
              <span>Executive Tax Summary</span>
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
              <span>Schedule 1 Breakdown</span>
            </button>

            <button
              onClick={() => setActiveTab("audit")}
              className={`py-3 px-4 border-b-2 transition-colors flex items-center space-x-2 cursor-pointer ${
                activeTab === "audit"
                  ? "border-emerald-500 text-emerald-400 font-bold"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Audit & Compliance Center</span>
              {!auditPassed && (
                <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-bold">
                  Action Req
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab("export")}
              className={`py-3 px-4 border-b-2 transition-colors flex items-center space-x-2 cursor-pointer ${
                activeTab === "export"
                  ? "border-emerald-500 text-emerald-400 font-bold"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>MIRA Package & Export</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center space-x-1.5 text-xs font-semibold cursor-pointer border border-slate-700"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handlePrintPackage}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg flex items-center space-x-1.5 text-xs font-semibold cursor-pointer shadow-md"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Return</span>
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs custom-scrollbar">

          {loading ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
              <p className="text-slate-400 font-semibold">Compiling MIRA 604 Income Tax Return & Schedule 1 Ledger...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : summary ? (
            <>
              {/* TAB 1: EXECUTIVE TAX SUMMARY */}
              {activeTab === "summary" && (
                <div className="space-y-6">
                  {/* Executive Tax Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-slate-400 font-medium text-[11px] block">Gross Revenue</span>
                      <div className="text-lg font-bold font-mono text-emerald-400">
                        MVR {summary.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <span className="text-[10px] text-slate-500 block">{summary.total_revenue_entries} sales entries</span>
                    </div>

                    <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-slate-400 font-medium text-[11px] block">Schedule 1 Expenses</span>
                      <div className="text-lg font-bold font-mono text-slate-200">
                        MVR {(summary.cost_of_sales + summary.operating_expenses).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <span className="text-[10px] text-slate-500 block">{summary.total_bills_analyzed} bills analyzed</span>
                    </div>

                    <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-slate-400 font-medium text-[11px] block">Net Accounting Profit</span>
                      <div className={`text-lg font-bold font-mono ${summary.net_accounting_profit >= 0 ? "text-slate-100" : "text-amber-400"}`}>
                        MVR {summary.net_accounting_profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <span className="text-[10px] text-slate-500 block">Pre-tax accounting profit</span>
                    </div>

                    <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-slate-400 font-medium text-[11px] block">Tax Adjustments</span>
                      <div className="text-lg font-bold font-mono text-purple-300">
                        MVR {(summary.non_deductible_addbacks - (summary.total_capital_allowances || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <span className="text-[10px] text-purple-300/80 block">Addbacks - Cap Allowances</span>
                    </div>

                    <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-1">
                      <span className="text-slate-400 font-medium text-[11px] block">MIRA Taxable Income</span>
                      <div className="text-lg font-bold font-mono text-blue-300">
                        MVR {summary.taxable_income.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <span className="text-[10px] text-slate-500 block">Final statutory base</span>
                    </div>

                    <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/40 rounded-xl space-y-1 bg-gradient-to-br from-emerald-950/40 to-slate-950">
                      <span className="text-emerald-300 font-bold text-[11px] block">MIRA Tax Payable</span>
                      <div className="text-lg font-bold font-mono text-emerald-400">
                        MVR {summary.estimated_income_tax.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <span className="text-[10px] text-emerald-300/80 block font-mono font-semibold">
                        {summary.taxpayer_profile}
                      </span>
                    </div>
                  </div>

                  {/* Statement of Profit or Loss Box */}
                  <div className="p-5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                      <div className="flex items-center space-x-2 text-slate-100 font-bold text-sm">
                        <Building className="w-4 h-4 text-emerald-400" />
                        <span>MIRA 604 Statement of Profit or Loss (Tax Computation)</span>
                      </div>
                      <div className="flex items-center space-x-2 text-xs font-mono">
                        <span className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-slate-300">
                          Profile: <strong className="text-emerald-400">{summary.taxpayer_profile}</strong>
                        </span>
                        <span className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-slate-300">
                          Basis: <strong className="text-emerald-400">{summary.accounting_basis}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2 font-mono text-xs">
                      <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                        <span className="text-slate-200 font-sans font-semibold">Gross Revenue / Total Sales</span>
                        <span className="text-slate-100 font-bold">MVR {summary.revenue.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between py-1 border-b border-slate-800/60 pl-4">
                        <span className="text-slate-400 font-sans">• Less: Cost of Sales (Direct Purchases)</span>
                        <span className="text-amber-400">- MVR {summary.cost_of_sales.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between py-2 bg-slate-900/60 px-3 rounded-lg border border-slate-800 font-bold">
                        <span className="text-emerald-400 font-sans">Gross Profit</span>
                        <span className="text-emerald-400">MVR {summary.gross_profit.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between py-1 border-b border-slate-800/60 pl-4">
                        <span className="text-slate-400 font-sans">• Less: Schedule 1 Operating Expenses</span>
                        <span className="text-amber-400">- MVR {summary.operating_expenses.toFixed(2)}</span>
                      </div>

                      <div className="flex justify-between py-2 bg-slate-900/80 px-3 rounded-lg border border-slate-800 font-bold">
                        <span className="text-slate-200 font-sans">Net Accounting Profit / (Loss)</span>
                        <span className={summary.net_accounting_profit >= 0 ? "text-slate-100" : "text-amber-400"}>
                          MVR {summary.net_accounting_profit.toFixed(2)}
                        </span>
                      </div>

                      <div className="flex justify-between py-1 border-b border-slate-800/60 pl-4">
                        <span className="text-slate-400 font-sans">+ Tax Add-Back: Non-Deductible Expenses</span>
                        <span className="text-emerald-400">+ MVR {summary.non_deductible_addbacks.toFixed(2)}</span>
                      </div>

                      {summary.total_capital_allowances !== undefined && summary.total_capital_allowances > 0 && (
                        <div className="flex justify-between py-1 border-b border-slate-800/60 pl-4">
                          <span className="text-purple-300 font-sans">- Less: Schedule 2 Capital Allowance Deduction</span>
                          <span className="text-purple-300">- MVR {summary.total_capital_allowances.toFixed(2)}</span>
                        </div>
                      )}

                      <div className="flex justify-between py-2.5 bg-emerald-950/40 px-3.5 rounded-xl border border-emerald-500/40 font-bold text-sm">
                        <span className="text-emerald-300 font-sans">MIRA Statutory Taxable Income</span>
                        <span className="text-emerald-300">MVR {summary.taxable_income.toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Tax Bracket Explanation */}
                    <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5">
                      <div className="text-[11px] font-bold text-emerald-400 flex items-center space-x-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Statutory Tax Rate Engine Applied:</span>
                      </div>
                      <p className="text-xs text-slate-300">{summary.tax_brackets_applied}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: SCHEDULE 1 BREAKDOWN */}
              {activeTab === "schedule1" && (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-950/80 rounded-2xl border border-slate-800 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-slate-100 text-sm">MIRA Schedule 1 Statement Line Items</h3>
                      <p className="text-[11px] text-slate-400">
                        Automated compilation from verified purchase invoices and expense records.
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
                          <th className="py-3 px-4">Tax Classification</th>
                          <th className="py-3 px-4 text-right">Subtotal Amount (MVR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 font-mono">
                        {Object.entries(summary.schedule1_breakdown).map(([category, amount]) => (
                          <tr key={category} className="hover:bg-slate-900/40 transition-colors">
                            <td className="py-3 px-4 font-sans font-semibold text-slate-200">{category}</td>
                            <td className="py-3 px-4 text-slate-400 font-sans text-[11px]">
                              {category === "Cost of Sales"
                                ? "Direct Purchases & Ingredient COGS"
                                : category === "Capital Asset (Schedule 2)"
                                ? "Capital Expenditure (Schedule 2 Rate)"
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

              {/* TAB 3: AUDIT & COMPLIANCE CENTER */}
              {activeTab === "audit" && (
                <div className="space-y-6">
                  {/* Audit Status Banner */}
                  <div className={`p-5 rounded-2xl border flex items-center justify-between ${
                    auditPassed
                      ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
                      : "bg-amber-950/30 border-amber-500/40 text-amber-300"
                  }`}>
                    <div className="flex items-center space-x-3">
                      {auditPassed ? (
                        <CheckCircle className="w-8 h-8 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-8 h-8 text-amber-400 shrink-0" />
                      )}
                      <div>
                        <h3 className="font-bold text-sm">
                          {auditPassed ? "MIRA Audit Status: READY TO FILE" : "MIRA Audit Status: ACTION REQUIRED"}
                        </h3>
                        <p className="text-xs text-slate-300 mt-0.5">
                          {auditPassed
                            ? "All financial records, revenue settlements, and expense classifications pass statutory MIRA verification checks."
                            : "Review the flagged items below to ensure full compliance before filing your return."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Audit Checks Summary */}
                  {summary.audit_checks && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-300 text-xs">Unverified Purchase Bills</span>
                          <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                            summary.audit_checks.unverified_documents_count === 0
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-rose-500/20 text-rose-300"
                          }`}>
                            {summary.audit_checks.unverified_documents_count}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {summary.audit_checks.unverified_documents_count === 0
                            ? "All purchase bills have been verified and approved."
                            : "Some uploaded bills are pending OCR validation or user verification."}
                        </p>
                      </div>

                      <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-300 text-xs">Missing Revenue Months</span>
                          <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                            summary.audit_checks.missing_revenue_months.length === 0
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-amber-500/20 text-amber-300"
                          }`}>
                            {summary.audit_checks.missing_revenue_months.length} Months
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {summary.audit_checks.missing_revenue_months.length === 0
                            ? "Continuous POS sales logged for all months."
                            : `Missing revenue logs for: ${summary.audit_checks.missing_revenue_months.join(", ")}`}
                        </p>
                      </div>

                      <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-300 text-xs">Unclassified Expenses</span>
                          <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                            summary.audit_checks.unclassified_expenses_count === 0
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-blue-500/20 text-blue-300"
                          }`}>
                            {summary.audit_checks.unclassified_expenses_count}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          Expenses requiring manual MIRA Schedule 1 category assignment.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Warnings List */}
                  {summary.audit_checks?.audit_warnings && summary.audit_checks.audit_warnings.length > 0 && (
                    <div className="p-4 bg-slate-950 border border-amber-500/30 rounded-xl space-y-2">
                      <h4 className="font-bold text-amber-400 text-xs flex items-center space-x-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        <span>Audit Findings & Recommendations:</span>
                      </h4>
                      <ul className="space-y-1.5 pl-5 list-disc text-xs text-slate-300">
                        {summary.audit_checks.audit_warnings.map((warn, i) => (
                          <li key={i}>{warn}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: MIRA PACKAGE EXPORT */}
              {activeTab === "export" && (
                <div className="space-y-6">
                  <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-slate-100 text-sm">Ready-to-File MIRA 604 Return Package</h3>
                        <p className="text-xs text-slate-400">
                          Compiled according to MIRA 604 Income Tax Return specifications for tax year {summary.year}.
                        </p>
                      </div>
                      <span className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono font-bold text-xs rounded-lg">
                        MIRA 604 Format Ready
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                      <button
                        onClick={handleExportCSV}
                        className="p-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl flex items-start space-x-3 text-left transition-all cursor-pointer group"
                      >
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl group-hover:scale-105 transition-transform">
                          <FileSpreadsheet className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-200 text-xs">Export MIRA 604 Excel / CSV Package</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Includes complete Schedule 1 expense breakdown and tax adjustment schedule ready for tax filing.
                          </p>
                        </div>
                      </button>

                      <button
                        onClick={handlePrintPackage}
                        className="p-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl flex items-start space-x-3 text-left transition-all cursor-pointer group"
                      >
                        <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl group-hover:scale-105 transition-transform">
                          <Printer className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-200 text-xs">Print Official Return Summary</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Generates a formatted PDF print view suitable for physical archival and tax sign-off.
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-12 text-center text-slate-400">No report data found.</div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950 text-xs text-slate-400 print:hidden">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Statutory MIRA 604 & Schedule 1 Tax Preparation Package Generator</span>
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
