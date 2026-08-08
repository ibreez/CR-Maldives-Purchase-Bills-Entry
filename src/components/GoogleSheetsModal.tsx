import React, { useState, useEffect } from "react";
import { X, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, ExternalLink } from "lucide-react";
import { AppSettings } from "../types";

interface GoogleSheetsModalProps {
  isOpen: boolean;
  selectedQuarter: string;
  onClose: () => void;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  selectedQuarter,
  onClose
}) => {
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("GST Purchases");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

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
        const settings: AppSettings = await res.json();
        setSpreadsheetId(settings.googleSheets.spreadsheetId || "");
        setSheetName(settings.googleSheets.sheetName || "GST Purchases");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings");
      const current: AppSettings = await res.json();

      const updated: AppSettings = {
        ...current,
        googleSheets: {
          ...current.googleSheets,
          spreadsheetId: spreadsheetId.trim(),
          sheetName: sheetName.trim(),
          connected: Boolean(spreadsheetId.trim())
        }
      };

      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated)
      });

      setMsg({ type: "success", text: "Google Sheets configuration saved!" });
    } catch (e) {
      setMsg({ type: "error", text: "Failed to save settings." });
    } finally {
      setSaving(false);
    }
  };

  const handleSyncToSheets = async () => {
    if (!spreadsheetId.trim()) {
      setMsg({ type: "error", text: "Please enter a valid Google Spreadsheet ID first." });
      return;
    }

    setSyncing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/export/google-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quarter: selectedQuarter === "ALL" ? undefined : selectedQuarter
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to sync to Google Sheets.");
      }

      const data = await res.json();
      setMsg({ type: "success", text: data.message });
    } catch (err: any) {
      setMsg({ type: "error", text: err.message || "Failed to sync." });
    } finally {
      setSyncing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-slate-900/95 border border-slate-800/90 rounded-2xl shadow-2xl max-w-lg w-full text-slate-100 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/80">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Google Sheets Integration</h2>
              <p className="text-[11px] text-slate-400">Live cloud sync for MIRA tax records</p>
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
            <div
              className={`p-3 rounded-xl border flex items-center space-x-2.5 ${
                msg.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
              }`}
            >
              {msg.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span className="font-medium">{msg.text}</span>
            </div>
          )}

          <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-3.5 shadow-sm">
            <div>
              <label className="block text-slate-300 font-bold mb-1">Google Spreadsheet ID</label>
              <input
                type="text"
                value={spreadsheetId}
                onChange={(e) => setSpreadsheetId(e.target.value)}
                placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
                className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 focus:outline-none transition-all"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Copy the Spreadsheet ID from your Google Sheet URL (between /d/ and /edit).
              </p>
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">Worksheet Tab Name</label>
              <input
                type="text"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                placeholder="e.g. GST Purchases"
                className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-semibold text-xs focus:border-blue-500/80 focus:ring-1 focus:ring-blue-500/30 focus:outline-none transition-all"
              />
            </div>

            <button
              onClick={handleSaveConfig}
              disabled={saving}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              {saving ? "Saving..." : "Save Spreadsheet Details"}
            </button>
          </div>

          <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-blue-300 text-[11px] leading-relaxed font-medium">
            💡 <strong>Verification Rule:</strong> The app strictly sends only <strong>Verified / Approved</strong> records to Google Sheets. Unverified OCR drafts will never be written automatically.
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800/80 bg-slate-900/80">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>

          <button
            onClick={handleSyncToSheets}
            disabled={syncing || !spreadsheetId}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md flex items-center space-x-2 transition-all disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
            <span>{syncing ? "Syncing..." : "Sync Verified Bills to Sheet"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
