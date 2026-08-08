import React, { useState, useEffect } from "react";
import { X, Settings, Save, CheckCircle2, AlertCircle, Building, Percent } from "lucide-react";
import { AppSettings } from "../types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved
}) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
      setMsg(null);
    }
  }, [isOpen]);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (e) {
      console.error("Failed to load settings", e);
    }
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        setMsg("Settings saved successfully!");
        if (onSettingsSaved) onSettingsSaved();
      }
    } catch (e) {
      console.error("Error saving settings", e);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !settings) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-slate-900/95 border border-slate-800/90 rounded-2xl shadow-2xl max-w-lg w-full text-slate-100 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/80">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Application Settings</h2>
              <p className="text-[11px] text-slate-400">Configure business TIN & MIRA compliance defaults</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {msg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 flex items-center space-x-2.5 shadow-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-semibold">{msg}</span>
            </div>
          )}

          {/* Our Business TIN */}
          <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-2.5 shadow-sm">
            <label className="block text-slate-200 font-bold flex items-center space-x-2">
              <Building className="w-4 h-4 text-emerald-400" />
              <span>Our Business TIN Number</span>
            </label>
            <input
              type="text"
              value={settings.myTin}
              onChange={(e) => setSettings({ ...settings, myTin: e.target.value.toUpperCase() })}
              placeholder="e.g. 1133533GST501"
              className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold uppercase focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
            />
            <p className="text-[11px] text-slate-400">
              Used by AI extraction to distinguish OUR TIN from the Supplier's TIN on incoming invoices.
            </p>
          </div>

          {/* Default GST Rate */}
          <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-2.5 shadow-sm">
            <label className="block text-slate-200 font-bold flex items-center space-x-2">
              <Percent className="w-4 h-4 text-emerald-400" />
              <span>Default Maldivian GST Rate (%)</span>
            </label>
            <input
              type="number"
              value={settings.defaultGstRate}
              onChange={(e) => setSettings({ ...settings, defaultGstRate: parseFloat(e.target.value) || 8 })}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono font-bold focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
            />
            <p className="text-[11px] text-slate-400">
              Standard local Maldivian GST rate is 8% (TGST is 16%).
            </p>
          </div>

          {/* Auto approve setting */}
          <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 flex items-center justify-between gap-3 shadow-sm">
            <div>
              <span className="block text-slate-200 font-bold">Auto-Approve High Confidence Bills</span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Automatically verify bills with &gt;95% confidence and zero validation errors.
              </p>
            </div>
            <input
              type="checkbox"
              checked={settings.autoApproveHighConfidence}
              onChange={(e) => setSettings({ ...settings, autoApproveHighConfidence: e.target.checked })}
              className="w-5 h-5 accent-emerald-500 rounded cursor-pointer shrink-0"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800/80 bg-slate-900/80">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center space-x-2 transition-all disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? "Saving..." : "Save Settings"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
