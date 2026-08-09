import React, { useState } from "react";
import {
  Upload,
  Camera,
  Files,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  CheckCircle2,
  Clock,
  Search,
  Trash2,
  Edit3,
  Building2,
  Receipt,
  DollarSign,
  ChevronRight,
  Filter,
  ArrowUpRight,
  ShieldCheck,
  XCircle,
  Sparkles,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Store,
  Users,
  FileImage,
  X
} from "lucide-react";
import { BillRecord, DashboardSummary, AuthUser, Outlet } from "../types";

interface DashboardProps {
  currentUser: AuthUser | null;
  outlets: Outlet[];
  selectedOutlet: string;
  onSelectOutlet: (outletId: string) => void;
  bills: BillRecord[];
  summary: DashboardSummary | null;
  selectedQuarter: string;
  activeTab: "all" | "pending_review" | "verified" | "rejected";
  onTabChange: (tab: "all" | "pending_review" | "verified" | "rejected") => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenUpload: (tab?: "file" | "camera" | "batch") => void;
  onOpenExportExcel: () => void;
  onOpenGoogleSheets: () => void;
  onReviewBill: (bill: BillRecord) => void;
  onDeleteBill: (id: string) => void;
}

type SortField = "outlet" | "supplier" | "date" | "mira_category" | "taxable" | "gst" | "total" | "confidence" | "status";
type SortDirection = "asc" | "desc";

export const Dashboard: React.FC<DashboardProps> = ({
  currentUser,
  outlets,
  selectedOutlet,
  onSelectOutlet,
  bills,
  summary,
  selectedQuarter,
  activeTab,
  onTabChange,
  searchQuery,
  onSearchChange,
  onOpenUpload,
  onOpenExportExcel,
  onOpenGoogleSheets,
  onReviewBill,
  onDeleteBill
}) => {
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [selectedMiraCategory, setSelectedMiraCategory] = useState<string>("ALL");
  const [selectedTaxStatusFilter, setSelectedTaxStatusFilter] = useState<string>("ALL");

  const isSuperAdmin = currentUser?.role === "super_admin";

  const pendingCount = bills.filter((b) => b.status === "pending_review").length;
  const verifiedCount = bills.filter((b) => b.status === "verified").length;
  const rejectedCount = bills.filter((b) => b.status === "rejected").length;

  const avgConfidence =
    bills.length > 0
      ? Math.round(bills.reduce((acc, b) => acc + (b.confidence?.overall || 0), 0) / bills.length)
      : 100;

  // Filter bills by tab & MIRA filters
  const filteredBills = bills.filter((b) => {
    if (activeTab === "pending_review" && b.status !== "pending_review") return false;
    if (activeTab === "verified" && b.status !== "verified") return false;
    if (activeTab === "rejected" && b.status !== "rejected") return false;

    const data = b.verifiedData || b.extractedData;

    if (selectedMiraCategory !== "ALL") {
      const cat = data.mira_schedule1_category || "Other Expenses";
      if (cat !== selectedMiraCategory) return false;
    }

    if (selectedTaxStatusFilter !== "ALL") {
      if (data.tax_status !== selectedTaxStatusFilter) return false;
    }

    return true;
  });

  // Sort bills
  const sortedBills = [...filteredBills].sort((a, b) => {
    const dataA = a.verifiedData || a.extractedData;
    const dataB = b.verifiedData || b.extractedData;

    let valA: any;
    let valB: any;

    switch (sortField) {
      case "outlet":
        valA = (a.outlet_name || "").toLowerCase();
        valB = (b.outlet_name || "").toLowerCase();
        break;
      case "supplier":
        valA = (dataA.supplier.name || "").toLowerCase();
        valB = (dataB.supplier.name || "").toLowerCase();
        break;
      case "date":
        valA = new Date(dataA.invoice.date || a.uploadDate).getTime();
        valB = new Date(dataB.invoice.date || b.uploadDate).getTime();
        break;
      case "mira_category":
        valA = (dataA.mira_schedule1_category || "Other Expenses").toLowerCase();
        valB = (dataB.mira_schedule1_category || "Other Expenses").toLowerCase();
        break;
      case "taxable":
        valA = dataA.totals.taxable_value ?? 0;
        valB = dataB.totals.taxable_value ?? 0;
        break;
      case "gst":
        valA = dataA.totals.gst_amount ?? 0;
        valB = dataB.totals.gst_amount ?? 0;
        break;
      case "total":
        valA = dataA.totals.invoice_total ?? 0;
        valB = dataB.totals.invoice_total ?? 0;
        break;
      case "confidence":
        valA = a.confidence.overall ?? 0;
        valB = b.confidence.overall ?? 0;
        break;
      case "status":
        valA = a.status;
        valB = b.status;
        break;
      default:
        valA = 0;
        valB = 0;
    }

    if (valA < valB) return sortDirection === "asc" ? -1 : 1;
    if (valA > valB) return sortDirection === "asc" ? 1 : -1;
    return 0;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-500 inline ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />;
    }
    return sortDirection === "asc" ? (
      <ChevronUp className="w-3 h-3 text-emerald-400 inline ml-1" />
    ) : (
      <ChevronDown className="w-3 h-3 text-emerald-400 inline ml-1" />
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-6">
      {/* Role Context Banner */}
      {!isSuperAdmin && currentUser && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 shrink-0">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-100">{currentUser.outlet_name}</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full">
                  Assigned Outlet
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Logged in as <span className="text-slate-200 font-semibold">{currentUser?.name || currentUser?.username || "User"}</span> (@{currentUser?.username || "user"}). All uploaded bills are automatically secured under this outlet.
              </p>
            </div>
          </div>

          <button
            onClick={() => onOpenUpload("file")}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow cursor-pointer shrink-0"
          >
            + Upload New Outlet Bill
          </button>
        </div>
      )}

      {/* Super Admin Top Control Bar */}
      {isSuperAdmin && (
        <div className="p-4 bg-slate-900 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <span>Super Admin System Dashboard</span>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full">
                  Consolidated Overview
                </span>
              </h2>
              <p className="text-xs text-slate-400">Viewing multi-outlet aggregate data & performance across all shop branches</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 w-full sm:w-auto">
            <span className="text-xs text-slate-400 font-semibold hidden md:inline">Filter View:</span>
            <select
              value={selectedOutlet}
              onChange={(e) => onSelectOutlet(e.target.value)}
              className="bg-slate-950 text-xs font-bold text-amber-300 border border-amber-500/40 rounded-xl px-3 py-2 focus:outline-none cursor-pointer w-full sm:w-auto"
            >
              <option value="ALL">All Outlets (Consolidated)</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* 1. Primary Metrics KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Purchases */}
        <div className="p-5 bg-slate-900/90 border border-slate-800/90 rounded-2xl flex items-center space-x-4 shadow-md shadow-black/20 relative overflow-hidden">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl shrink-0">
            <DollarSign className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              Total Purchases ({selectedQuarter === "ALL" ? "All Quarters" : selectedQuarter})
            </p>
            <p className="text-xl sm:text-2xl font-black text-slate-100 font-mono tracking-tight mt-1">
              <span className="text-xs text-slate-400 font-sans font-normal mr-1">MVR</span>
              {(summary?.totalPurchases || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Metric 2: Total Input GST Paid */}
        <div className="p-5 bg-slate-900/90 border border-slate-800/90 rounded-2xl flex items-center space-x-4 shadow-md shadow-black/20 relative overflow-hidden">
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl shrink-0">
            <Receipt className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
              Total Input GST (8%)
            </p>
            <p className="text-xl sm:text-2xl font-black text-amber-300 font-mono tracking-tight mt-1">
              <span className="text-xs text-slate-400 font-sans font-normal mr-1">MVR</span>
              {(summary?.totalGst || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Metric 3: Pending Review Count */}
        <div
          onClick={() => onTabChange("pending_review")}
          className={`p-5 bg-slate-900/90 border transition-all duration-200 rounded-2xl flex items-center space-x-4 shadow-md shadow-black/20 cursor-pointer relative overflow-hidden group ${
            pendingCount > 0 ? "border-amber-500/40 hover:border-amber-500/80" : "border-slate-800/90"
          }`}
        >
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl shrink-0 group-hover:scale-105 transition-transform">
            <Clock className="w-6 h-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                Pending Review
              </p>
              {pendingCount > 0 && (
                <span className="px-2 py-0.5 bg-amber-500 text-slate-950 font-black text-[10px] rounded-full animate-pulse">
                  Action Needed
                </span>
              )}
            </div>
            <p className="text-xl sm:text-2xl font-black text-amber-300 tracking-tight mt-1 font-mono">
              {pendingCount} <span className="text-xs text-slate-400 font-normal font-sans">bills pending</span>
            </p>
          </div>
        </div>

        {/* Metric 4: Multi-Outlet or Accuracy */}
        {isSuperAdmin ? (
          <div className="p-5 bg-slate-900/90 border border-slate-800/90 rounded-2xl flex items-center space-x-4 shadow-md shadow-black/20 relative overflow-hidden">
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl shrink-0">
              <Store className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                System Outlets
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xl sm:text-2xl font-black text-blue-300 font-mono tracking-tight">
                  {summary?.totalOutlets || outlets.length}
                </p>
                <span className="text-[10px] text-slate-400 font-medium">active locations</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-5 bg-slate-900/90 border border-slate-800/90 rounded-2xl flex items-center space-x-4 shadow-md shadow-black/20 relative overflow-hidden">
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                OCR Accuracy
              </p>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xl sm:text-2xl font-black text-blue-300 font-mono tracking-tight">
                  {avgConfidence}%
                </p>
                <span className="text-[10px] text-slate-400 font-medium">avg confidence</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Super Admin Outlet Breakdown Grid (ONLY for Super Admin when viewing ALL) */}
      {isSuperAdmin && selectedOutlet === "ALL" && summary?.outletStats && (
        <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-5 space-y-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Building2 className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                Outlet-Wise Purchase Summary
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">
              Click any outlet to filter dashboard bills
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {summary.outletStats.map((stat) => (
              <div
                key={stat.outletId}
                onClick={() => onSelectOutlet(stat.outletId)}
                className="p-4 bg-slate-950/80 hover:bg-slate-950 border border-slate-800 hover:border-emerald-500/50 rounded-xl transition-all cursor-pointer group space-y-2 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-100 group-hover:text-emerald-300 transition-colors">
                    {stat.outletName}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-transform group-hover:translate-x-0.5" />
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/80">
                  <div>
                    <div className="text-[10px] text-slate-400 font-medium">Total Bills</div>
                    <div className="font-mono font-bold text-slate-200">
                      {stat.totalBills} ({stat.verifiedCount} verified)
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 font-medium">Purchases (MVR)</div>
                    <div className="font-mono font-bold text-emerald-400">
                      MVR {stat.totalPurchases.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Status Tab Filters & Table Container */}
      <div className="bg-slate-900/90 border border-slate-800/90 rounded-2xl p-5 space-y-5 shadow-xl shadow-black/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Status Tab Filters */}
          <div className="flex items-center space-x-1.5 bg-slate-950/90 p-1.5 rounded-xl border border-slate-800/80 overflow-x-auto text-xs">
            <button
              onClick={() => onTabChange("all")}
              className={`px-3.5 py-2 rounded-lg font-bold transition-all duration-150 whitespace-nowrap cursor-pointer ${
                activeTab === "all"
                  ? "bg-slate-800 text-slate-100 shadow border border-slate-700/80"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
              }`}
            >
              All Bills ({bills.length})
            </button>

            <button
              onClick={() => onTabChange("pending_review")}
              className={`px-3.5 py-2 rounded-lg font-bold transition-all duration-150 flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
                activeTab === "pending_review"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Requires Review</span>
              {pendingCount > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-500 text-slate-950 font-black rounded-full text-[10px]">
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              onClick={() => onTabChange("verified")}
              className={`px-3.5 py-2 rounded-lg font-bold transition-all duration-150 flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === "verified"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Verified ({verifiedCount})</span>
            </button>

            <button
              onClick={() => onTabChange("rejected")}
              className={`px-3.5 py-2 rounded-lg font-bold transition-all duration-150 flex items-center space-x-1.5 whitespace-nowrap cursor-pointer ${
                activeTab === "rejected"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 shadow"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/50"
              }`}
            >
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>Rejected ({rejectedCount})</span>
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search supplier, TIN, outlet, invoice #..."
              className="w-full bg-slate-950/90 border border-slate-800 rounded-xl pl-10 pr-8 py-2 text-xs text-slate-100 placeholder-slate-500 focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-200 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* MIRA Schedule 1 Category & Tax Status Quick Filters */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
          <div className="flex items-center space-x-1.5 text-emerald-400 font-bold uppercase text-[10px] tracking-wider">
            <Filter className="w-3.5 h-3.5" />
            <span>MIRA Filters:</span>
          </div>

          <select
            value={selectedMiraCategory}
            onChange={(e) => setSelectedMiraCategory(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-emerald-300 font-semibold focus:border-emerald-500 focus:outline-none"
          >
            <option value="ALL">All MIRA Categories</option>
            <option value="Cost of Sales">Cost of Sales</option>
            <option value="Insurance Premium">Insurance Premium</option>
            <option value="Professional & Consulting Fees">Professional & Consulting Fees</option>
            <option value="Rental, Lease & License">Rental, Lease & License</option>
            <option value="Repairs & Maintenance">Repairs & Maintenance</option>
            <option value="Related Party Expenses">Related Party Expenses</option>
            <option value="Salaries & Wages">Salaries & Wages</option>
            <option value="Sales & Marketing">Sales & Marketing</option>
            <option value="Other Expenses">Other Expenses</option>
            <option value="Capital Asset (Schedule 2)">Capital Asset (Schedule 2)</option>
          </select>

          <select
            value={selectedTaxStatusFilter}
            onChange={(e) => setSelectedTaxStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-amber-300 font-semibold focus:border-emerald-500 focus:outline-none"
          >
            <option value="ALL">All Tax Statuses</option>
            <option value="TAX_CHARGED">Tax Charged (Separate Line)</option>
            <option value="TAX_INCLUDED">Tax Included</option>
            <option value="NO_TAX">No Tax / Non-GST</option>
          </select>

          {(selectedMiraCategory !== "ALL" || selectedTaxStatusFilter !== "ALL") && (
            <button
              onClick={() => {
                setSelectedMiraCategory("ALL");
                setSelectedTaxStatusFilter("ALL");
              }}
              className="text-[11px] text-rose-400 hover:text-rose-300 font-bold underline cursor-pointer ml-1"
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800/80 shadow-inner bg-slate-950/40">
          <table className="w-full text-left text-xs text-slate-300 border-collapse">
            <thead className="bg-slate-950/90 text-slate-400 text-[11px] font-bold uppercase tracking-wider border-b border-slate-800/90">
              <tr>
                {isSuperAdmin && (
                  <th
                    onClick={() => handleSort("outlet")}
                    className="p-3 cursor-pointer select-none hover:text-slate-200 group transition-colors"
                  >
                    <span>Outlet</span>
                    {renderSortIcon("outlet")}
                  </th>
                )}
                <th className="p-3">File / Upload</th>
                <th
                  onClick={() => handleSort("supplier")}
                  className="p-3 cursor-pointer select-none hover:text-slate-200 group transition-colors"
                >
                  <span>Supplier & TIN</span>
                  {renderSortIcon("supplier")}
                </th>
                <th
                  onClick={() => handleSort("mira_category")}
                  className="p-3 cursor-pointer select-none hover:text-slate-200 group transition-colors"
                >
                  <span>MIRA Category</span>
                  {renderSortIcon("mira_category")}
                </th>
                <th
                  onClick={() => handleSort("date")}
                  className="p-3 cursor-pointer select-none hover:text-slate-200 group transition-colors"
                >
                  <span>Invoice # & Date</span>
                  {renderSortIcon("date")}
                </th>
                <th
                  onClick={() => handleSort("taxable")}
                  className="p-3 text-right cursor-pointer select-none hover:text-slate-200 group transition-colors"
                >
                  <span>Taxable (MVR)</span>
                  {renderSortIcon("taxable")}
                </th>
                <th
                  onClick={() => handleSort("gst")}
                  className="p-3 text-right cursor-pointer select-none hover:text-slate-200 group transition-colors"
                >
                  <span>GST (MVR)</span>
                  {renderSortIcon("gst")}
                </th>
                <th
                  onClick={() => handleSort("total")}
                  className="p-3 text-right cursor-pointer select-none hover:text-slate-200 group transition-colors"
                >
                  <span>Total (MVR)</span>
                  {renderSortIcon("total")}
                </th>
                <th
                  onClick={() => handleSort("confidence")}
                  className="p-3 text-center cursor-pointer select-none hover:text-slate-200 group transition-colors"
                >
                  <span>Accuracy</span>
                  {renderSortIcon("confidence")}
                </th>
                <th
                  onClick={() => handleSort("status")}
                  className="p-3 text-center cursor-pointer select-none hover:text-slate-200 group transition-colors"
                >
                  <span>Status</span>
                  {renderSortIcon("status")}
                </th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
              {sortedBills.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 11 : 10} className="p-12 text-center text-slate-500 text-xs">
                    <p className="font-semibold text-slate-300">No purchase bills match the selected filter.</p>
                    <p className="text-[11px] mt-1 text-slate-500">
                      Click <button onClick={() => onOpenUpload("file")} className="text-emerald-400 font-bold underline cursor-pointer">Upload Bill</button> to process a new purchase receipt.
                    </p>
                  </td>
                </tr>
              ) : (
                sortedBills.map((bill) => {
                  const data = bill.verifiedData || bill.extractedData;
                  const taxable = data.totals.taxable_value ?? 0;
                  const gst = data.totals.gst_amount ?? 0;
                  const total = data.totals.invoice_total ?? 0;
                  const isPdf = bill.fileType.toLowerCase().includes("pdf") || bill.fileName.toLowerCase().endsWith(".pdf");

                  return (
                    <tr
                      key={bill.id}
                      className={`hover:bg-slate-800/60 transition-colors ${
                        bill.status === "pending_review" ? "bg-amber-500/5" : ""
                      }`}
                    >
                      {/* Outlet Tag (for Super Admin) */}
                      {isSuperAdmin && (
                        <td className="p-3">
                          <span className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded-md text-[10px] font-bold text-amber-300 truncate inline-block max-w-[130px]">
                            {bill.outlet_name || "Branch Outlet"}
                          </span>
                        </td>
                      )}

                      {/* File Label & Icon */}
                      <td className="p-3">
                        <div className="flex items-center space-x-2">
                          <div className="p-1.5 bg-slate-800 border border-slate-700/80 rounded-lg shrink-0 text-slate-400">
                            {isPdf ? <FileText className="w-3.5 h-3.5 text-rose-400" /> : <FileImage className="w-3.5 h-3.5 text-blue-400" />}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-100 truncate max-w-[130px] text-xs" title={bill.fileName}>
                              {bill.fileName}
                            </p>
                            <div className="flex items-center space-x-1.5 mt-0.5">
                              <span className="text-[10px] text-slate-500 font-mono">
                                {new Date(bill.uploadDate).toLocaleDateString()}
                              </span>
                              {data.document_type === "HANDWRITTEN_PURCHASE" && (
                                <span className="px-1.5 py-0.2 bg-purple-500/15 border border-purple-500/30 text-purple-300 rounded text-[9px] font-bold">
                                  Handwritten
                                </span>
                              )}
                              {data.document_type === "RECEIPT" && (
                                <span className="px-1.5 py-0.2 bg-blue-500/15 border border-blue-500/30 text-blue-300 rounded text-[9px] font-bold">
                                  Receipt
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Supplier Name & TIN */}
                      <td className="p-3">
                        <div className="font-bold text-slate-100 truncate max-w-[170px]" title={data.supplier.name || ""}>
                          {data.supplier.name || <span className="text-slate-500 italic font-normal">Unknown Supplier</span>}
                        </div>
                        <div className="flex items-center space-x-2 text-[10px] font-mono mt-0.5">
                          <span className="text-emerald-400">
                            TIN: {data.supplier.gstin ? (
                              <span className="font-semibold">{data.supplier.gstin}</span>
                            ) : (
                              <span className="text-amber-400 italic">No TIN</span>
                            )}
                          </span>
                          {data.expense_category && data.expense_category !== "Other" && (
                            <span className="px-1.5 py-0.2 bg-slate-800 text-slate-300 border border-slate-700 rounded text-[9px] font-sans font-medium">
                              {data.expense_category}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* MIRA Category & Tax Treatment */}
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <span className="px-2 py-0.5 bg-slate-800/90 border border-slate-700/80 text-emerald-300 rounded text-[10px] font-bold truncate max-w-[150px]" title={data.mira_schedule1_category || "Other Expenses"}>
                            {data.mira_schedule1_category || "Other Expenses"}
                          </span>
                          {data.income_tax_treatment === "CAPITAL_ALLOWANCE" || data.mira_schedule1_category === "Capital Asset (Schedule 2)" ? (
                            <span className="text-[9px] text-amber-400 font-mono font-bold flex items-center space-x-0.5">
                              <span>⚡ Schedule 2 Asset</span>
                            </span>
                          ) : data.income_tax_treatment === "NON_DEDUCTIBLE" ? (
                            <span className="text-[9px] text-rose-400 font-mono font-bold flex items-center space-x-0.5">
                              <span>⛔ Non-Deductible</span>
                            </span>
                          ) : (
                            <span className="text-[9px] text-slate-400 font-mono">
                              100% Tax Deductible
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Invoice Number & Date */}
                      <td className="p-3 font-mono">
                        <div className="text-slate-100 font-bold text-xs">
                          {data.invoice.number || <span className="text-rose-400 italic font-normal">Missing #</span>}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {data.invoice.date || "-"}
                        </div>
                      </td>

                      {/* Taxable (Right-Aligned) */}
                      <td className="p-3 text-right font-mono text-slate-200 font-medium">
                        {taxable.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* GST (Right-Aligned) */}
                      <td className="p-3 text-right font-mono text-amber-300 font-bold">
                        {gst.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Total (Right-Aligned) */}
                      <td className="p-3 text-right font-mono text-emerald-400 font-black text-xs">
                        {total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Accuracy Score */}
                      <td className="p-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black font-mono border ${
                            bill.confidence.overall >= 85
                              ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                              : bill.confidence.overall >= 70
                              ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                              : "bg-rose-500/15 text-rose-300 border-rose-500/30"
                          }`}
                        >
                          {bill.confidence.overall}%
                        </span>
                      </td>

                      {/* Status Indicator */}
                      <td className="p-3 text-center">
                        {bill.status === "verified" && (
                          <span className="px-2.5 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full text-[10px] font-bold">
                            Verified
                          </span>
                        )}
                        {bill.status === "pending_review" && (
                          <span className="px-2.5 py-0.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-full text-[10px] font-bold flex items-center justify-center space-x-1 mx-auto">
                            <AlertCircle className="w-3 h-3 text-amber-400" />
                            <span>Review</span>
                          </span>
                        )}
                        {bill.status === "rejected" && (
                          <span className="px-2.5 py-0.5 bg-rose-500/15 text-rose-300 border border-rose-500/30 rounded-full text-[10px] font-bold">
                            Rejected
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => onReviewBill(bill)}
                            className="px-3 py-1 bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white rounded-lg border border-slate-700 hover:border-emerald-500 text-[11px] font-bold transition-all duration-200 flex items-center space-x-1 cursor-pointer shadow-sm"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>Review</span>
                          </button>

                          <button
                            onClick={() => onDeleteBill(bill.id)}
                            className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors cursor-pointer"
                            title="Delete Bill"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
    </div>
  );
};
