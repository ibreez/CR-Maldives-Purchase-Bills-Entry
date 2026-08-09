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
  PieChart
} from "lucide-react";
import { RevenueRecord, RevenueCategory, Outlet, AuthUser } from "../types";

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
  const [searchQuery, setSearchQuery] = useState("");

  // Form states (Add / Edit)
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<{
    outlet_id: string;
    date: string;
    category: RevenueCategory;
    gross_amount: string;
    gst_collected: string;
    net_revenue: string;
    payment_method: 'Cash' | 'Card / POS' | 'Bank Transfer' | 'Credit' | 'Other';
    notes: string;
  }>({
    outlet_id: currentUser?.outlet_id || outlets[0]?.id || "outlet-1",
    date: new Date().toISOString().split("T")[0],
    category: "POS Sales",
    gross_amount: "",
    gst_collected: "",
    net_revenue: "",
    payment_method: "Card / POS",
    notes: ""
  });

  // Bulk CSV import state
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [bulkCsvText, setBulkCsvText] = useState("");

  const isSuperAdmin = currentUser?.role === "super_admin";

  useEffect(() => {
    if (isOpen) {
      fetchRevenues();
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

  // Auto calculate GST and Net when Gross amount changes
  const handleGrossAmountChange = (val: string) => {
    const gross = parseFloat(val);
    if (!isNaN(gross) && gross > 0) {
      // Standard 8% GST inclusive calculation or separate:
      // Assuming gross is tax inclusive: net = gross / 1.08, gst = gross - net
      const net = gross / 1.08;
      const gst = gross - net;
      setFormData(prev => ({
        ...prev,
        gross_amount: val,
        gst_collected: gst.toFixed(2),
        net_revenue: net.toFixed(2)
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        gross_amount: val,
        gst_collected: "",
        net_revenue: ""
      }));
    }
  };

  // Manual GST change
  const handleGstChange = (val: string) => {
    const gross = parseFloat(formData.gross_amount) || 0;
    const gst = parseFloat(val) || 0;
    const net = gross - gst;
    setFormData(prev => ({
      ...prev,
      gst_collected: val,
      net_revenue: net >= 0 ? net.toFixed(2) : "0.00"
    }));
  };

  const handleOpenAddForm = () => {
    setEditingId(null);
    setFormData({
      outlet_id: currentUser?.outlet_id || outlets[0]?.id || "outlet-1",
      date: new Date().toISOString().split("T")[0],
      category: "POS Sales",
      gross_amount: "",
      gst_collected: "",
      net_revenue: "",
      payment_method: "Card / POS",
      notes: ""
    });
    setIsFormOpen(true);
  };

  const handleEdit = (rev: RevenueRecord) => {
    setEditingId(rev.id);
    const gross = rev.gross_amount ?? rev.amount ?? 0;
    const gst = rev.gst_collected ?? 0;
    const net = rev.net_revenue ?? (gross - gst);
    setFormData({
      outlet_id: rev.outlet_id,
      date: rev.date,
      category: rev.category || "POS Sales",
      gross_amount: gross.toString(),
      gst_collected: gst.toString(),
      net_revenue: net.toString(),
      payment_method: rev.payment_method || "Card / POS",
      notes: rev.notes || rev.description || ""
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
        notes: formData.notes
      };

      let res;
      if (editingId) {
        res = await fetch(`/api/revenue/${editingId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      } else {
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
        throw new Error(errData.error || "Failed to save revenue record.");
      }

      setSuccessMsg(editingId ? "Revenue entry updated successfully." : "Revenue entry added successfully.");
      setIsFormOpen(false);
      fetchRevenues();
      if (onRevenueUpdated) onRevenueUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to submit revenue entry.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this revenue entry?")) return;
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
        if (!line || line.startsWith("date") || line.startsWith("Date")) continue; // header skip

        const parts = line.split(",").map(p => p.trim());
        if (parts.length >= 2) {
          const date = parts[0];
          const gross = parseFloat(parts[1]) || 0;
          const gst = parts[2] ? parseFloat(parts[2]) : (gross - (gross / 1.08));
          const net = parts[3] ? parseFloat(parts[3]) : (gross - gst);
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
        setError("No valid lines parsed from CSV. Expected format: Date, GrossAmount, GST, NetRevenue, Category, PaymentMethod, Notes");
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

      setSuccessMsg(`Successfully imported ${entries.length} revenue records!`);
      setIsBulkOpen(false);
      setBulkCsvText("");
      fetchRevenues();
      if (onRevenueUpdated) onRevenueUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to process bulk import.");
    }
  };

  if (!isOpen) return null;

  // Filtered revenue entries
  const filteredRevenues = revenues.filter((r) => {
    if (selectedCategory !== "ALL" && r.category !== selectedCategory) return false;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchCat = (r.category || "").toLowerCase().includes(q);
      const matchNote = (r.notes || r.description || "").toLowerCase().includes(q);
      const matchOutlet = (r.outlet_name || "").toLowerCase().includes(q);
      const matchDate = (r.date || "").toLowerCase().includes(q);
      if (!matchCat && !matchNote && !matchOutlet && !matchDate) return false;
    }
    return true;
  });

  // Calculate Aggregates
  const totalGross = filteredRevenues.reduce((acc, r) => acc + (r.gross_amount ?? r.amount ?? 0), 0);
  const totalGst = filteredRevenues.reduce((acc, r) => acc + (r.gst_collected ?? 0), 0);
  const totalNet = filteredRevenues.reduce((acc, r) => acc + (r.net_revenue ?? (r.gross_amount ? r.gross_amount - (r.gst_collected || 0) : r.amount) ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-6xl my-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                Revenue & Sales Management Center
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono font-bold">
                  MIRA 604
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Log daily POS sales summaries, catering income, and gross revenue to generate complete MIRA Profit & Loss statements.
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
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
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
                <span>Output GST Collected (8%)</span>
                <Receipt className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-xl font-bold text-amber-300 font-mono">
                MVR {totalGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">MIRA 205 Sales Tax Payable</p>
            </div>

            <div className="p-4 bg-slate-950/60 border border-emerald-500/30 rounded-xl bg-emerald-500/5">
              <div className="flex items-center justify-between text-emerald-400 text-xs font-medium mb-1">
                <span>Net Business Income</span>
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-emerald-300 font-mono">
                MVR {totalNet.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-emerald-400/80 mt-1">MIRA 604 Taxable Revenue Base</p>
            </div>

            <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                <span>Total Entries</span>
                <Layers className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-xl font-bold text-slate-100 font-mono">
                {filteredRevenues.length}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Recorded sales logs</p>
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
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-medium focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="ALL">All Outlets</option>
                    {outlets.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Category Filter */}
              <div className="flex items-center space-x-1.5">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-medium focus:border-emerald-500 focus:outline-none"
                >
                  <option value="ALL">All Categories</option>
                  <option value="POS Sales">POS Sales</option>
                  <option value="Catering">Catering</option>
                  <option value="Delivery">Delivery</option>
                  <option value="Direct Sales">Direct Sales</option>
                  <option value="Other Income">Other Income</option>
                  <option value="Dine-In Sales">Dine-In Sales</option>
                  <option value="Takeaway / Delivery">Takeaway / Delivery</option>
                  <option value="Wholesale">Wholesale</option>
                </select>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search sales logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-emerald-500 focus:outline-none w-44"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsBulkOpen(!isBulkOpen)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                <span>Bulk Import CSV</span>
              </button>

              <button
                onClick={handleOpenAddForm}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg flex items-center space-x-1.5 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Revenue Entry</span>
              </button>
            </div>
          </div>

          {/* Bulk Import Drawer Form */}
          {isBulkOpen && (
            <div className="p-4 bg-slate-950 border border-amber-500/30 rounded-xl space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-amber-300 flex items-center space-x-1.5">
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Bulk Import POS Revenue CSV/Excel</span>
                </h3>
                <button onClick={() => setIsBulkOpen(false)} className="text-slate-400 hover:text-slate-200">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Paste CSV data in format: <code className="text-amber-200 font-mono">Date, GrossAmount, GST, NetRevenue, Category, PaymentMethod, Notes</code>
              </p>
              <textarea
                value={bulkCsvText}
                onChange={(e) => setBulkCsvText(e.target.value)}
                placeholder={`2026-08-01, 10800.00, 800.00, 10000.00, POS Sales, Card / POS, Daily Male' Branch Sales\n2026-08-02, 5400.00, 400.00, 5000.00, Catering, Bank Transfer, Resort Event Catering`}
                className="w-full h-28 bg-slate-900 border border-slate-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:border-amber-500 focus:outline-none"
              />
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => setIsBulkOpen(false)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkImport}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg cursor-pointer flex items-center space-x-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Process Bulk Revenue Logs</span>
                </button>
              </div>
            </div>
          )}

          {/* Add / Edit Form Modal Drawer */}
          {isFormOpen && (
            <div className="p-5 bg-slate-950 border border-emerald-500/30 rounded-xl space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-emerald-300 flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4" />
                  <span>{editingId ? "Edit Revenue Entry" : "Record Daily Business Revenue"}</span>
                </h3>
                <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

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
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Date */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Sales Date</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Revenue Stream Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value as RevenueCategory })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="POS Sales">POS Sales</option>
                    <option value="Catering">Catering</option>
                    <option value="Delivery">Delivery</option>
                    <option value="Direct Sales">Direct Sales</option>
                    <option value="Other Income">Other Income</option>
                    <option value="Dine-In Sales">Dine-In Sales</option>
                    <option value="Takeaway / Delivery">Takeaway / Delivery</option>
                    <option value="Wholesale">Wholesale</option>
                  </select>
                </div>

                {/* Gross Amount */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Gross Amount (MVR) <span className="text-slate-500">(Tax Inclusive)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 10800.00"
                    value={formData.gross_amount}
                    onChange={(e) => handleGrossAmountChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 font-mono font-bold focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>

                {/* Output GST Collected */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Output GST (8% MVR)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Auto-calculated (e.g. 800.00)"
                    value={formData.gst_collected}
                    onChange={(e) => handleGstChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-amber-300 font-mono font-bold focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Net Business Revenue */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Net Business Revenue (MVR) <span className="text-emerald-400 font-bold">(P&L Base)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Net Taxable Income"
                    value={formData.net_revenue}
                    onChange={(e) => setFormData({ ...formData, net_revenue: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-emerald-300 font-mono font-bold focus:border-emerald-500 focus:outline-none"
                    required
                  />
                </div>

                {/* Payment Method */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Payment Method</label>
                  <select
                    value={formData.payment_method}
                    onChange={(e) => setFormData({ ...formData, payment_method: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="Card / POS">Card / POS Terminal</option>
                    <option value="Cash">Cash Register</option>
                    <option value="Bank Transfer">Bank Transfer (BML / MIB)</option>
                    <option value="Credit">Credit / Account</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* Notes */}
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Notes / Description</label>
                  <input
                    type="text"
                    placeholder="e.g. Daily POS Z-Report sales summary"
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
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg cursor-pointer shadow-lg shadow-emerald-600/20"
                  >
                    {editingId ? "Update Revenue Entry" : "Save Revenue Entry"}
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
                  <th className="p-3">Sales Date</th>
                  <th className="p-3">Outlet</th>
                  <th className="p-3">Category</th>
                  <th className="p-3 text-right">Gross Sales (MVR)</th>
                  <th className="p-3 text-right">Output GST (8%)</th>
                  <th className="p-3 text-right">Net Revenue (P&L)</th>
                  <th className="p-3">Payment Method</th>
                  <th className="p-3">Notes</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-10 text-center text-slate-500 text-xs">
                      Loading revenue entries...
                    </td>
                  </tr>
                ) : filteredRevenues.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-10 text-center text-slate-500 text-xs">
                      <p className="font-semibold text-slate-300">No revenue records found.</p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Click <button onClick={handleOpenAddForm} className="text-emerald-400 underline font-bold">Add Revenue Entry</button> to record daily business income.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredRevenues.map((rev) => {
                    const gross = rev.gross_amount ?? rev.amount ?? 0;
                    const gst = rev.gst_collected ?? 0;
                    const net = rev.net_revenue ?? (gross - gst);

                    return (
                      <tr key={rev.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-200">{rev.date}</td>
                        <td className="p-3 font-medium text-slate-300">{rev.outlet_name || "Main Branch"}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                            {rev.category || "POS Sales"}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-slate-100">
                          MVR {gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right font-mono text-amber-300">
                          MVR {gst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-emerald-300">
                          MVR {net.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 text-slate-400 text-[11px]">
                          {rev.payment_method || "Card / POS"}
                        </td>
                        <td className="p-3 text-slate-400 text-[11px] truncate max-w-[180px]" title={rev.notes || rev.description}>
                          {rev.notes || rev.description || "Sales Revenue"}
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center space-x-1">
                            <button
                              onClick={() => handleEdit(rev)}
                              className="p-1.5 text-slate-400 hover:text-emerald-300 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                              title="Edit Entry"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(rev.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                              title="Delete Entry"
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

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-t border-slate-800 text-xs text-slate-400">
          <div className="flex items-center space-x-2 text-[11px]">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>MIRA 604 Compliance: Revenue recorded here automatically populates Profit & Loss gross income.</span>
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
