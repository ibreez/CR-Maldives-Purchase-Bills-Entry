import React, { useState } from "react";
import {
  FileSpreadsheet,
  Settings,
  FileText,
  PlusCircle,
  Upload,
  Camera,
  Files,
  ChevronDown,
  Store,
  Users,
  LogOut,
  Shield,
  User as UserIcon,
  Building2,
  TrendingUp,
  Calculator
} from "lucide-react";
import { DashboardSummary, AuthUser, Outlet } from "../types";

interface NavbarProps {
  currentUser: AuthUser | null;
  outlets: Outlet[];
  selectedOutlet: string;
  onOutletChange: (outletId: string) => void;
  summary: DashboardSummary | null;
  selectedQuarter: string;
  onQuarterChange: (quarter: string) => void;
  onOpenSettings: () => void;
  onOpenUpload: (mode?: "file" | "camera" | "batch") => void;
  onOpenExportExcel: () => void;
  onOpenGoogleSheets: () => void;
  onOpenOutletsModal: () => void;
  onOpenUsersModal: () => void;
  onOpenIncomeTax?: () => void;
  onOpenRevenue?: () => void;
  onOpenAssets?: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  outlets,
  selectedOutlet,
  onOutletChange,
  summary,
  selectedQuarter,
  onQuarterChange,
  onOpenSettings,
  onOpenUpload,
  onOpenExportExcel,
  onOpenGoogleSheets,
  onOpenOutletsModal,
  onOpenUsersModal,
  onOpenIncomeTax,
  onOpenRevenue,
  onOpenAssets,
  onLogout
}) => {
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

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
          {/* Brand Logo & Outlet Context */}
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
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                <Store className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="text-emerald-300 font-bold truncate max-w-[150px] sm:max-w-[200px]">
                  {currentUser?.role === "super_admin"
                    ? selectedOutlet === "ALL"
                      ? "All Outlets (Super Admin)"
                      : outlets.find((o) => o.id === selectedOutlet)?.name || "Selected Outlet"
                    : currentUser?.outlet_name || "Branch Outlet"}
                </span>
              </div>
            </div>
          </div>

          {/* Primary Header Controls & Action Toolbar */}
          <div className="flex items-center space-x-2.5">
            {/* Super Admin Outlet Selector Filter */}
            {currentUser?.role === "super_admin" && (
              <div className="hidden lg:flex items-center bg-slate-950/80 border border-amber-500/30 rounded-xl px-2.5 py-1.5 shadow-inner">
                <Building2 className="w-3.5 h-3.5 text-amber-400 mr-1.5" />
                <span className="text-[11px] text-amber-300/80 mr-1.5 font-bold">Outlet:</span>
                <select
                  value={selectedOutlet}
                  onChange={(e) => onOutletChange(e.target.value)}
                  className="bg-transparent text-xs text-amber-200 font-bold focus:outline-none cursor-pointer max-w-[160px] truncate"
                >
                  <option value="ALL" className="bg-slate-900 text-slate-100">
                    All Outlets (Consolidated)
                  </option>
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id} className="bg-slate-900 text-slate-100">
                      {o.name} ({o.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

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

            {/* Upload Split Button */}
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
              title="Export GST Purchases to Excel"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline">Export Excel</span>
            </button>

            {/* Revenue & Sales Button */}
            {onOpenRevenue && (
              <button
                onClick={onOpenRevenue}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer shadow-sm"
                title="Revenue & Sales Management Center"
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden md:inline">Revenue & Sales</span>
              </button>
            )}

            {/* Fixed Asset Register Button */}
            {onOpenAssets && (
              <button
                onClick={onOpenAssets}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-purple-950/60 hover:bg-purple-900/80 text-purple-300 border border-purple-500/40 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer shadow-sm"
                title="Fixed Asset Register & MIRA Capital Allowance Calculator"
              >
                <Calculator className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden lg:inline">Asset Register</span>
              </button>
            )}

            {/* Income Tax MIRA 604 Button */}
            {onOpenIncomeTax && (
              <button
                onClick={onOpenIncomeTax}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 hover:text-white border border-slate-700/80 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer shadow-sm"
                title="MIRA 604 Income Tax Return & Schedule 1"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden lg:inline">Income Tax 604</span>
              </button>
            )}

            {/* Super Admin Nav Shortcuts */}
            {currentUser?.role === "super_admin" && (
              <div className="flex items-center space-x-1.5 pl-1 border-l border-slate-800">
                <button
                  onClick={onOpenOutletsModal}
                  className="p-1.5 bg-slate-800 hover:bg-slate-750 text-emerald-400 hover:text-emerald-300 rounded-xl border border-slate-700/80 transition-all cursor-pointer"
                  title="Manage Outlets"
                >
                  <Store className="w-4 h-4" />
                </button>
                <button
                  onClick={onOpenUsersModal}
                  className="p-1.5 bg-slate-800 hover:bg-slate-750 text-blue-400 hover:text-blue-300 rounded-xl border border-slate-700/80 transition-all cursor-pointer"
                  title="Manage Users"
                >
                  <Users className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Settings Button */}
            <button
              onClick={onOpenSettings}
              className="p-1.5 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white rounded-xl border border-slate-700/80 hover:border-slate-600 transition-all cursor-pointer shadow-sm"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* User Profile Menu */}
            <div className="relative pl-1 border-l border-slate-800">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center space-x-2 px-2.5 py-1 bg-slate-800/90 hover:bg-slate-750 border border-slate-700 rounded-xl text-xs cursor-pointer transition-colors"
              >
                <div className="w-6 h-6 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center font-bold text-emerald-300 text-[11px]">
                  {(currentUser?.name || currentUser?.username || "U").charAt(0).toUpperCase()}
                </div>
                <div className="text-left hidden sm:block">
                  <div className="font-bold text-slate-100 text-[11px] max-w-[100px] truncate">
                    {currentUser?.name || currentUser?.username || "User"}
                  </div>
                  <div className="text-[9px] text-slate-400 font-medium">
                    {currentUser?.role === "super_admin" ? "Super Admin" : "Outlet User"}
                  </div>
                </div>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              {showUserMenu && (
                <div
                  className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-2 z-50 text-xs"
                  onMouseLeave={() => setShowUserMenu(false)}
                >
                  <div className="px-3.5 py-2 border-b border-slate-800">
                    <div className="font-bold text-slate-100">{currentUser?.name || currentUser?.username || "User"}</div>
                    <div className="text-[11px] text-slate-400 font-mono">@{currentUser?.username}</div>
                    <div className="text-[10px] text-emerald-400 font-semibold mt-1">
                      {currentUser?.outlet_name}
                    </div>
                  </div>

                  {currentUser?.role === "super_admin" && (
                    <>
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          onOpenOutletsModal();
                        }}
                        className="w-full text-left px-3.5 py-2 text-slate-200 hover:bg-slate-800 flex items-center space-x-2 transition-colors cursor-pointer"
                      >
                        <Store className="w-4 h-4 text-emerald-400" />
                        <span>Manage Outlets</span>
                      </button>
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          onOpenUsersModal();
                        }}
                        className="w-full text-left px-3.5 py-2 text-slate-200 hover:bg-slate-800 flex items-center space-x-2 transition-colors cursor-pointer"
                      >
                        <Users className="w-4 h-4 text-blue-400" />
                        <span>Manage Users</span>
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                    className="w-full text-left px-3.5 py-2 text-rose-400 hover:bg-rose-500/10 flex items-center space-x-2 transition-colors cursor-pointer border-t border-slate-800/80 mt-1"
                  >
                    <LogOut className="w-4 h-4 text-rose-400" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
