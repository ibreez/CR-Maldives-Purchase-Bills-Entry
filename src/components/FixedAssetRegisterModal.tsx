import React, { useState, useEffect } from "react";
import {
  X,
  Plus,
  Trash2,
  Edit2,
  Building2,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Download,
  Percent,
  Calculator,
  RefreshCw,
  HardDrive,
  Truck,
  Armchair,
  Wrench,
  Building,
  Layers,
  ArrowDownRight
} from "lucide-react";
import { FixedAssetRecord, AssetClass, Outlet, AuthUser } from "../types";

interface FixedAssetRegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  outlets: Outlet[];
  onAssetUpdated?: () => void;
}

const MIRA_CLASS_RATES: Record<AssetClass, { rate: number; icon: React.ReactNode; desc: string }> = {
  'Buildings': { rate: 4, icon: <Building className="w-4 h-4 text-blue-400" />, desc: '4% Straight line' },
  'Plant & Equipment / Machinery': { rate: 10, icon: <Wrench className="w-4 h-4 text-emerald-400" />, desc: '10% Annual allowance' },
  'Vehicles & Transport': { rate: 20, icon: <Truck className="w-4 h-4 text-amber-400" />, desc: '20% Transport assets' },
  'Computer Software & Hardware': { rate: 33.33, icon: <HardDrive className="w-4 h-4 text-purple-400" />, desc: '33.33% IT Equipment' },
  'Loose Tools / Utensils / Crockery': { rate: 33.33, icon: <Wrench className="w-4 h-4 text-cyan-400" />, desc: '33.33% Utensils & tools' },
  'Furniture & Fittings': { rate: 10, icon: <Armchair className="w-4 h-4 text-rose-400" />, desc: '10% Fittings & decor' }
};

export const FixedAssetRegisterModal: React.FC<FixedAssetRegisterModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  outlets,
  onAssetUpdated
}) => {
  const [assets, setAssets] = useState<FixedAssetRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [selectedOutlet, setSelectedOutlet] = useState<string>("ALL");
  const [selectedClass, setSelectedClass] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState<{
    outlet_id: string;
    asset_name: string;
    asset_class: AssetClass;
    purchase_date: string;
    cost_price: string;
    mira_rate: string;
    opening_wdv: string;
    supplier: string;
    notes: string;
  }>({
    outlet_id: currentUser?.outlet_id || outlets[0]?.id || "outlet-1",
    asset_name: "",
    asset_class: "Plant & Equipment / Machinery",
    purchase_date: new Date().toISOString().split("T")[0],
    cost_price: "",
    mira_rate: "10",
    opening_wdv: "",
    supplier: "",
    notes: ""
  });

  const isSuperAdmin = currentUser?.role === "super_admin";

  useEffect(() => {
    if (isOpen) {
      fetchAssets();
    }
  }, [isOpen, selectedOutlet]);

  const fetchAssets = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("crmaldives_token");
      let url = "/api/assets";
      if (selectedOutlet !== "ALL") {
        url += `?outlet=${selectedOutlet}`;
      }
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) throw new Error("Failed to load fixed asset register.");
      const data = await res.json();
      setAssets(data);
    } catch (err: any) {
      setError(err.message || "Error connecting to server.");
    } finally {
      setLoading(false);
    }
  };

  const handleAssetClassChange = (newClass: AssetClass) => {
    const defaultRate = MIRA_CLASS_RATES[newClass]?.rate || 10;
    setFormData((prev) => ({
      ...prev,
      asset_class: newClass,
      mira_rate: defaultRate.toString()
    }));
  };

  const handleCostPriceChange = (val: string) => {
    setFormData((prev) => ({
      ...prev,
      cost_price: val,
      opening_wdv: prev.opening_wdv === "" || prev.opening_wdv === prev.cost_price ? val : prev.opening_wdv
    }));
  };

  const handleOpenAddForm = () => {
    setEditingId(null);
    setFormData({
      outlet_id: currentUser?.outlet_id || outlets[0]?.id || "outlet-1",
      asset_name: "",
      asset_class: "Plant & Equipment / Machinery",
      purchase_date: new Date().toISOString().split("T")[0],
      cost_price: "",
      mira_rate: "10",
      opening_wdv: "",
      supplier: "",
      notes: ""
    });
    setIsFormOpen(true);
  };

  const handleEdit = (ast: FixedAssetRecord) => {
    setEditingId(ast.id);
    setFormData({
      outlet_id: ast.outlet_id,
      asset_name: ast.asset_name,
      asset_class: ast.asset_class,
      purchase_date: ast.purchase_date,
      cost_price: ast.cost_price.toString(),
      mira_rate: ast.mira_rate.toString(),
      opening_wdv: ast.opening_wdv.toString(),
      supplier: ast.supplier || "",
      notes: ast.notes || ""
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const costNum = parseFloat(formData.cost_price);
    if (isNaN(costNum) || costNum <= 0) {
      setError("Please enter a valid cost price.");
      return;
    }

    try {
      const token = localStorage.getItem("crmaldives_token");
      const openWdvNum = parseFloat(formData.opening_wdv) || costNum;
      const rateNum = parseFloat(formData.mira_rate) || MIRA_CLASS_RATES[formData.asset_class]?.rate || 10;

      const payload = {
        outlet_id: formData.outlet_id,
        asset_name: formData.asset_name,
        asset_class: formData.asset_class,
        purchase_date: formData.purchase_date,
        cost_price: costNum,
        mira_rate: rateNum,
        opening_wdv: openWdvNum,
        supplier: formData.supplier,
        notes: formData.notes
      };

      let res;
      if (editingId) {
        res = await fetch(`/api/assets/${editingId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch("/api/assets", {
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
        throw new Error(errData.error || "Failed to save asset entry.");
      }

      setSuccessMsg(editingId ? "Fixed asset updated successfully." : "Fixed asset registered successfully.");
      setIsFormOpen(false);
      fetchAssets();
      if (onAssetUpdated) onAssetUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to save fixed asset entry.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this asset from the register?")) return;
    setError(null);
    try {
      const token = localStorage.getItem("crmaldives_token");
      const res = await fetch(`/api/assets/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete asset record.");
      }
      setSuccessMsg("Asset deleted from register.");
      fetchAssets();
      if (onAssetUpdated) onAssetUpdated();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleImportFromBills = async () => {
    setImporting(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const token = localStorage.getItem("crmaldives_token");
      const res = await fetch("/api/assets/import-from-bills", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to import CapEx bills.");
      }
      const data = await res.json();
      if (data.count === 0) {
        setSuccessMsg("All Capital Expenditure bills are already registered.");
      } else {
        setSuccessMsg(`Successfully imported ${data.count} new capital asset purchase(s) into the register!`);
        fetchAssets();
        if (onAssetUpdated) onAssetUpdated();
      }
    } catch (err: any) {
      setError(err.message || "Error importing CapEx bills.");
    } finally {
      setImporting(false);
    }
  };

  if (!isOpen) return null;

  // Filtered Assets
  const filteredAssets = assets.filter((a) => {
    if (selectedClass !== "ALL" && a.asset_class !== selectedClass) return false;
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const matchName = (a.asset_name || "").toLowerCase().includes(q);
      const matchSupplier = (a.supplier || "").toLowerCase().includes(q);
      const matchOutlet = (a.outlet_name || "").toLowerCase().includes(q);
      const matchNotes = (a.notes || "").toLowerCase().includes(q);
      if (!matchName && !matchSupplier && !matchOutlet && !matchNotes) return false;
    }
    return true;
  });

  // Calculate Metrics
  const totalCost = filteredAssets.reduce((sum, a) => sum + (a.cost_price || 0), 0);
  const totalOpeningWdv = filteredAssets.reduce((sum, a) => sum + (a.opening_wdv || 0), 0);
  const totalCapitalAllowance = filteredAssets.reduce((sum, a) => sum + (a.capital_allowance || 0), 0);
  const totalClosingWdv = filteredAssets.reduce((sum, a) => sum + (a.closing_wdv || 0), 0);

  // Live calculation inside form
  const formCost = parseFloat(formData.cost_price) || 0;
  const formOpening = parseFloat(formData.opening_wdv) || formCost;
  const formRate = parseFloat(formData.mira_rate) || MIRA_CLASS_RATES[formData.asset_class]?.rate || 10;
  const formAllowance = Math.min(formOpening, Number((formOpening * (formRate / 100)).toFixed(2)));
  const formClosing = Math.max(0, Number((formOpening - formAllowance).toFixed(2)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-6xl my-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-400">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                Fixed Asset Register & MIRA Capital Allowance Calculator
                <span className="px-2.5 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-mono font-bold">
                  Schedule 2
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Register company capital purchases, calculate statutory MIRA Capital Allowance deductions, and track Written-Down Values (WDV).
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

          {/* Alert Messages */}
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

          {/* Key Metrics Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                <span>Total Capital Investment</span>
                <HardDrive className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-xl font-bold text-slate-100 font-mono">
                MVR {totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Historical cost of all assets</p>
            </div>

            <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                <span>Opening WDV Total</span>
                <Layers className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-xl font-bold text-slate-200 font-mono">
                MVR {totalOpeningWdv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Value at start of tax period</p>
            </div>

            <div className="p-4 bg-slate-950/60 border border-purple-500/30 rounded-xl bg-purple-500/5">
              <div className="flex items-center justify-between text-purple-400 text-xs font-medium mb-1">
                <span>Annual Capital Allowance</span>
                <ArrowDownRight className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-xl font-bold text-purple-300 font-mono">
                MVR {totalCapitalAllowance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-purple-300/80 mt-1">Tax deduction subtracted from Profit</p>
            </div>

            <div className="p-4 bg-slate-950/60 border border-slate-800/80 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
                <span>Closing WDV Total</span>
                <Calculator className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-emerald-300 font-mono">
                MVR {totalClosingWdv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">Carried forward to next year</p>
            </div>
          </div>

          {/* MIRA Rate Reference Cards */}
          <div className="p-4 bg-slate-950/40 border border-slate-800 rounded-xl space-y-2">
            <h3 className="text-xs font-bold text-slate-300 flex items-center space-x-2">
              <Percent className="w-3.5 h-3.5 text-purple-400" />
              <span>MIRA Standard Capital Allowance Tax Rates</span>
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              {Object.entries(MIRA_CLASS_RATES).map(([cls, info]) => (
                <div key={cls} className="p-2.5 bg-slate-900 border border-slate-800/80 rounded-lg flex flex-col justify-between">
                  <div className="flex items-center space-x-1.5 mb-1">
                    {info.icon}
                    <span className="text-[10px] font-bold text-slate-200 truncate" title={cls}>
                      {cls.split('/')[0]}
                    </span>
                  </div>
                  <div className="text-sm font-extrabold text-purple-300 font-mono">
                    {info.rate}%
                  </div>
                  <div className="text-[9px] text-slate-500 mt-0.5">
                    {info.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Filter Bar & Action Buttons */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-950/40 p-3.5 rounded-xl border border-slate-800">
            <div className="flex flex-wrap items-center gap-3">
              {/* Outlet Filter */}
              {isSuperAdmin && (
                <div className="flex items-center space-x-1.5">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <select
                    value={selectedOutlet}
                    onChange={(e) => setSelectedOutlet(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-medium focus:border-purple-500 focus:outline-none"
                  >
                    <option value="ALL">All Outlets</option>
                    {outlets.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Asset Class Filter */}
              <div className="flex items-center space-x-1.5">
                <Filter className="w-4 h-4 text-slate-400" />
                <select
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-medium focus:border-purple-500 focus:outline-none"
                >
                  <option value="ALL">All Asset Classes</option>
                  <option value="Buildings">Buildings (4%)</option>
                  <option value="Plant & Equipment / Machinery">Plant & Equipment (10%)</option>
                  <option value="Vehicles & Transport">Vehicles & Transport (20%)</option>
                  <option value="Computer Software & Hardware">IT & Software (33.33%)</option>
                  <option value="Loose Tools / Utensils / Crockery">Utensils & Tools (33.33%)</option>
                  <option value="Furniture & Fittings">Furniture & Fittings (10%)</option>
                </select>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search assets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-purple-500 focus:outline-none w-44"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handleImportFromBills}
                disabled={importing}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
                title="Automatically scan uploaded bills for Capital Expenditure items"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${importing ? "animate-spin" : ""}`} />
                <span>Auto-Import CapEx Invoices</span>
              </button>

              <button
                onClick={handleOpenAddForm}
                className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg flex items-center space-x-1.5 shadow-lg shadow-purple-600/20 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Register Capital Asset</span>
              </button>
            </div>
          </div>

          {/* Add / Edit Asset Form */}
          {isFormOpen && (
            <div className="p-5 bg-slate-950 border border-purple-500/30 rounded-xl space-y-4 animate-fade-in">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-purple-300 flex items-center space-x-2">
                  <Calculator className="w-4 h-4" />
                  <span>{editingId ? "Edit Fixed Asset Record" : "Register New Capital Purchase Asset"}</span>
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
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-purple-500 focus:outline-none"
                    >
                      {outlets.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Asset Name */}
                <div className="md:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Asset Description / Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Commercial Espresso Machine, Delivery Scooter, Server Hardware"
                    value={formData.asset_name}
                    onChange={(e) => setFormData({ ...formData, asset_name: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 font-medium focus:border-purple-500 focus:outline-none"
                    required
                  />
                </div>

                {/* Asset Class */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">MIRA Asset Class</label>
                  <select
                    value={formData.asset_class}
                    onChange={(e) => handleAssetClassChange(e.target.value as AssetClass)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-purple-500 focus:outline-none"
                  >
                    <option value="Buildings">Buildings (4%)</option>
                    <option value="Plant & Equipment / Machinery">Plant & Equipment / Machinery (10%)</option>
                    <option value="Vehicles & Transport">Vehicles & Transport (20%)</option>
                    <option value="Computer Software & Hardware">Computer Software & Hardware (33.33%)</option>
                    <option value="Loose Tools / Utensils / Crockery">Loose Tools / Utensils / Crockery (33.33%)</option>
                    <option value="Furniture & Fittings">Furniture & Fittings (10%)</option>
                  </select>
                </div>

                {/* Purchase Date */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Purchase Date</label>
                  <input
                    type="date"
                    value={formData.purchase_date}
                    onChange={(e) => setFormData({ ...formData, purchase_date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-purple-500 focus:outline-none"
                    required
                  />
                </div>

                {/* MIRA Rate % */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">MIRA Rate (%)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 10"
                    value={formData.mira_rate}
                    onChange={(e) => setFormData({ ...formData, mira_rate: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-purple-300 font-mono font-bold focus:border-purple-500 focus:outline-none"
                    required
                  />
                </div>

                {/* Cost Price */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Cost Price (MVR)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 50000.00"
                    value={formData.cost_price}
                    onChange={(e) => handleCostPriceChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-100 font-mono font-bold focus:border-purple-500 focus:outline-none"
                    required
                  />
                </div>

                {/* Opening WDV */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Opening WDV (MVR) <span className="text-slate-500">(Tax Period Base)</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Opening Written-Down Value"
                    value={formData.opening_wdv}
                    onChange={(e) => setFormData({ ...formData, opening_wdv: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-blue-300 font-mono font-bold focus:border-purple-500 focus:outline-none"
                  />
                </div>

                {/* Supplier */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Supplier / Vendor</label>
                  <input
                    type="text"
                    placeholder="e.g. Maldives Kitchen Pvt Ltd"
                    value={formData.supplier}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-purple-500 focus:outline-none"
                  />
                </div>

                {/* Real-time Calculation Summary Box */}
                <div className="md:col-span-3 p-3 bg-slate-900 border border-purple-500/20 rounded-lg flex flex-wrap items-center justify-between text-xs gap-3">
                  <div className="flex items-center space-x-2">
                    <Calculator className="w-4 h-4 text-purple-400" />
                    <span className="font-semibold text-slate-300">Live MIRA Capital Allowance Preview:</span>
                  </div>
                  <div className="flex items-center space-x-6 font-mono text-xs">
                    <div>
                      <span className="text-slate-500 text-[10px] block">Opening WDV</span>
                      <span className="text-blue-300 font-bold">MVR {formOpening.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-purple-400 text-[10px] block">Annual Allowance ({formRate}%)</span>
                      <span className="text-purple-300 font-extrabold">- MVR {formAllowance.toFixed(2)}</span>
                    </div>
                    <div>
                      <span className="text-emerald-400 text-[10px] block">Closing WDV</span>
                      <span className="text-emerald-300 font-bold">MVR {formClosing.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className="md:col-span-3">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">Notes / Bill Reference</label>
                  <input
                    type="text"
                    placeholder="e.g. Purchased under tax invoice #INV-2026-88"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 focus:border-purple-500 focus:outline-none"
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
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg cursor-pointer shadow-lg shadow-purple-600/20"
                  >
                    {editingId ? "Update Asset" : "Register Capital Asset"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Fixed Assets Data Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/40">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-semibold uppercase text-slate-400 font-mono tracking-wider">
                  <th className="p-3">Purchase Date</th>
                  <th className="p-3">Outlet</th>
                  <th className="p-3">Asset & Supplier</th>
                  <th className="p-3">Asset Class</th>
                  <th className="p-3 text-center">Rate %</th>
                  <th className="p-3 text-right">Cost Price (MVR)</th>
                  <th className="p-3 text-right">Opening WDV</th>
                  <th className="p-3 text-right text-purple-400">Capital Allowance</th>
                  <th className="p-3 text-right text-emerald-400">Closing WDV</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="p-10 text-center text-slate-500 text-xs">
                      Loading fixed asset ledger...
                    </td>
                  </tr>
                ) : filteredAssets.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-10 text-center text-slate-500 text-xs">
                      <p className="font-semibold text-slate-300">No fixed asset records found.</p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Click <button onClick={handleOpenAddForm} className="text-purple-400 underline font-bold">Register Capital Asset</button> or <button onClick={handleImportFromBills} className="text-purple-400 underline font-bold">Auto-Import CapEx Invoices</button> to populate.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((ast) => (
                    <tr key={ast.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3 font-mono text-slate-300">{ast.purchase_date}</td>
                      <td className="p-3 font-medium text-slate-300">{ast.outlet_name || "Main Branch"}</td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-100">{ast.asset_name}</div>
                        {ast.supplier && (
                          <div className="text-[10px] text-slate-400">{ast.supplier}</div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] font-bold">
                          {ast.asset_class}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono font-bold text-purple-300">
                        {ast.mira_rate}%
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-100">
                        MVR {ast.cost_price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-mono text-slate-300">
                        MVR {ast.opening_wdv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-purple-300">
                        MVR {ast.capital_allowance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-300">
                        MVR {ast.closing_wdv.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => handleEdit(ast)}
                            className="p-1.5 text-slate-400 hover:text-purple-300 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                            title="Edit Asset"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(ast.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                            title="Delete Asset"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-t border-slate-800 text-xs text-slate-400">
          <div className="flex items-center space-x-2 text-[11px]">
            <CheckCircle2 className="w-4 h-4 text-purple-400" />
            <span>MIRA Schedule 2 Compliance: Annual capital allowances calculated here automatically reduce statutory income tax liability.</span>
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
