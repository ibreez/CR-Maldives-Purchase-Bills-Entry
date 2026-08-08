import React, { useState, useEffect } from "react";
import {
  Store,
  Plus,
  Edit2,
  X,
  CheckCircle2,
  XCircle,
  Phone,
  MapPin,
  FileText,
  Users,
  ShieldAlert,
  Search,
  Building2
} from "lucide-react";
import { Outlet } from "../types";

interface OutletManagementModalProps {
  isOpen: boolean;
  authToken: string;
  onClose: () => void;
  onOutletsUpdated: () => void;
}

export const OutletManagementModal: React.FC<OutletManagementModalProps> = ({
  isOpen,
  authToken,
  onClose,
  onOutletsUpdated
}) => {
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Form modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<Outlet | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    tin: "",
    address: "",
    phone: "",
    status: "active" as "active" | "inactive"
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchOutlets();
    }
  }, [isOpen]);

  const fetchOutlets = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/outlets", {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setOutlets(data);
      } else {
        const err = await res.json();
        setError(err.error || "Failed to load outlets.");
      }
    } catch (e) {
      setError("Network error loading outlets.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingOutlet(null);
    setFormData({
      name: "",
      code: `OUT-${Math.floor(100 + Math.random() * 900)}`,
      tin: "100000" + Math.floor(10 + Math.random() * 90) + "GST501",
      address: "",
      phone: "+960 ",
      status: "active"
    });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (outlet: Outlet) => {
    setEditingOutlet(outlet);
    setFormData({
      name: outlet.name,
      code: outlet.code,
      tin: outlet.tin || "",
      address: outlet.address || "",
      phone: outlet.phone || "",
      status: outlet.status
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) {
      setError("Outlet Name and Code are required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const url = editingOutlet ? `/api/outlets/${editingOutlet.id}` : "/api/outlets";
      const method = editingOutlet ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify(formData)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save outlet.");
      }

      setIsFormOpen(false);
      fetchOutlets();
      onOutletsUpdated();
    } catch (err: any) {
      setError(err.message || "Failed to save outlet.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (outlet: Outlet) => {
    const newStatus = outlet.status === "active" ? "inactive" : "active";
    try {
      const res = await fetch(`/api/outlets/${outlet.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (res.ok) {
        fetchOutlets();
        onOutletsUpdated();
      }
    } catch (e) {
      console.error("Failed to toggle status", e);
    }
  };

  if (!isOpen) return null;

  const filteredOutlets = outlets.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.code.toLowerCase().includes(search.toLowerCase()) ||
      (o.tin || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <Store className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>Outlet Management</span>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full">
                  Super Admin
                </span>
              </h2>
              <p className="text-xs text-slate-400">Manage shop locations, assign user permissions, and track outlets</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Toolbar */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search outlets by name, code, TIN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
            />
          </div>

          <button
            onClick={handleOpenAdd}
            className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Outlet</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs">Loading outlet records...</div>
          ) : filteredOutlets.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">No outlets found matching your criteria.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredOutlets.map((outlet) => (
                <div
                  key={outlet.id}
                  className={`p-4 bg-slate-950/90 border rounded-2xl transition-all ${
                    outlet.status === "active"
                      ? "border-slate-800 hover:border-slate-700"
                      : "border-slate-800/50 opacity-60 bg-slate-950/40"
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-2.5">
                      <div className="p-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-300">
                        <Building2 className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-100">{outlet.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700/80 rounded-md">
                            {outlet.code}
                          </span>
                          {outlet.tin && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              TIN: {outlet.tin}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleOpenEdit(outlet)}
                        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                        title="Edit Outlet"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(outlet)}
                        className={`px-2 py-1 text-[10px] font-bold rounded-lg border transition-colors cursor-pointer ${
                          outlet.status === "active"
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30"
                            : "bg-slate-800 text-slate-400 border-slate-700 hover:bg-emerald-500/10 hover:text-emerald-400"
                        }`}
                      >
                        {outlet.status === "active" ? "Active" : "Inactive"}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                    {outlet.address && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="truncate">{outlet.address}</span>
                      </div>
                    )}
                    {outlet.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{outlet.phone}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Nested Form Modal for Add/Edit Outlet */}
      {isFormOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-slate-100">
                {editingOutlet ? "Edit Outlet" : "Create New Outlet"}
              </h3>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Outlet Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hulhumale' Beach Outlet"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Outlet Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HLM-02"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Business TIN</label>
                  <input
                    type="text"
                    placeholder="e.g. 1000002GST502"
                    value={formData.tin}
                    onChange={(e) => setFormData({ ...formData, tin: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Address / Location</label>
                <input
                  type="text"
                  placeholder="e.g. Nirolhu Magu, Hulhumale', Maldives"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="+960 335 1122"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Outlet Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold cursor-pointer"
                >
                  {submitting ? "Saving..." : editingOutlet ? "Update Outlet" : "Create Outlet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
