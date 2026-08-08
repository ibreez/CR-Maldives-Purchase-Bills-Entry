import React, { useState } from "react";
import {
  FileSpreadsheet,
  Settings,
  FileText,
  PlusCircle,
  CheckCircle2,
  Upload,
  Camera,
  Files,
  ChevronDown,
  Sparkles
} from "lucide-react";
import { DashboardSummary } from "../types";

interface NavbarProps {
  summary: DashboardSummary | null;
  selectedQuarter: string;
  onQuarterChange: (quarter: string) => void;
  onOpenSettings: () => void;
  onOpenUpload: (mode?: "file" | "camera" | "batch") => void;
  onOpenExportExcel: () => void;
  onOpenGoogleSheets: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  summary,
  selectedQuarter,
  onQuarterChange,
  onOpenSettings,
  onOpenUpload,
  onOpenExportExcel,
  onOpenGoogleSheets
}) => {
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const currentYear = new Date().getFullYear();
  const quarters = [
    "ALL",
    `${currentYear}-Q3`,
    `${currentYear}-Q2`,
    `${currentYear}-Q1`,
    `${currentYear - 1}-Q4`,
    `${currentYear - 1}-Q3`
  ];

  return (
    <header className="bg-slate-900/95 backdrop-blur-md text-slate-100 border-b border-slate-800/80 sticky top-0 z-30 shadow-md shadow-black/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Context */}
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 rounded-xl flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-slate-100 tracking-tight flex items-center gap-1.5">
                  <span>CR Maldives</span>
                </h1>
                <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full tracking-wide">
                  GST 8% &bull; MVR
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium hidden md:block">
                Purchase Bills Entry
              </p>
            </div>
          </div>

          {/* Primary Header Controls & Action Toolbar */}
          <div className="flex items-center space-x-2.5">
            {/* Quarter Filter Selector */}
            <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-1.5 shadow-inner">
              <span className="text-[11px] text-slate-400 mr-2 font-medium hidden sm:inline">Quarter:</span>
              <select
                value={selectedQuarter}
                onChange={(e) => onQuarterChange(e.target.value)}
                className="bg-transparent text-xs text-slate-100 font-bold focus:outline-none cursor-pointer"
              >
                {quarters.map((q) => (
                  <option key={q} value={q} className="bg-slate-900 text-slate-100">
                    {q === "ALL" ? "All Quarters" : q}
                  </option>
                ))}
              </select>
            </div>

            {/* Upload Dropdown Split Button */}
            <div className="relative">
              <div className="inline-flex rounded-xl shadow-md overflow-hidden border border-emerald-500/40">
                <button
                  onClick={() => onOpenUpload("file")}
                  className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Upload Bill</span>
                </button>
                <button
                  onClick={() => setShowUploadMenu(!showUploadMenu)}
                  className="px-2 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-emerald-100 border-l border-emerald-500/40 transition-colors cursor-pointer"
                  title="More upload options"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Upload Options Menu */}
              {showUploadMenu && (
                <div
                  className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1 z-50 text-xs"
                  onMouseLeave={() => setShowUploadMenu(false)}
                >
                  <button
                    onClick={() => {
                      setShowUploadMenu(false);
                      onOpenUpload("file");
                    }}
                    className="w-full text-left px-3.5 py-2 text-slate-200 hover:bg-slate-800 flex items-center space-x-2 transition-colors cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-emerald-400" />
                    <span>Upload Single File</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowUploadMenu(false);
                      onOpenUpload("camera");
                    }}
                    className="w-full text-left px-3.5 py-2 text-slate-200 hover:bg-slate-800 flex items-center space-x-2 transition-colors cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-blue-400" />
                    <span>Take Photo (Camera)</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowUploadMenu(false);
                      onOpenUpload("batch");
                    }}
                    className="w-full text-left px-3.5 py-2 text-slate-200 hover:bg-slate-800 flex items-center space-x-2 transition-colors cursor-pointer"
                  >
                    <Files className="w-4 h-4 text-purple-400" />
                    <span>Batch Upload Bills</span>
                  </button>
                </div>
              )}
            </div>

            {/* Export Excel Button */}
            <button
              onClick={onOpenExportExcel}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white border border-slate-700/80 hover:border-emerald-500/50 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer shadow-sm"
              title="Export GST Purchases to Excel with custom column mapping"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline">Export Excel</span>
            </button>

            {/* Google Sheets Sync Button */}
            <button
              onClick={onOpenGoogleSheets}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white border border-slate-700/80 hover:border-blue-500/50 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer shadow-sm"
              title="Sync Verified Bills to Google Sheets"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden md:inline">Sheets Sync</span>
            </button>

            {/* Settings Button */}
            <button
              onClick={onOpenSettings}
              className="p-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl border border-slate-700/80 hover:border-slate-600 transition-all duration-200 cursor-pointer shadow-sm"
              title="Configure TIN & MIRA Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};


