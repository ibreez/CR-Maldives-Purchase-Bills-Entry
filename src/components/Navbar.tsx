import React, { useState, useRef, useEffect } from "react";
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
  Building2,
  TrendingUp,
  Calculator,
  Menu,
  X,
  Calendar
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
  selectedQuarter,
  onQuarterChange,
  onOpenSettings,
  onOpenUpload,
  onOpenExportExcel,
  onOpenOutletsModal,
  onOpenUsersModal,
  onOpenIncomeTax,
  onOpenRevenue,
  onOpenAssets,
  onLogout
}) => {
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const uploadMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const currentYear = new Date().getFullYear();
  const quarters = [
    "ALL",
    `${currentYear}-Q3`,
    `${currentYear}-Q2`,
    `${currentYear}-Q1`,
    `${currentYear - 1}-Q4`,
    `${currentYear - 1}-Q3`
  ];

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (uploadMenuRef.current && !uploadMenuRef.current.contains(event.target as Node)) {
        setShowUploadMenu(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="bg-slate-900/95 backdrop-blur-md text-slate-100 border-b border-slate-800/80 sticky top-0 z-40 shadow-lg shadow-black/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top Tier: Logo, Filters & Primary Utility Actions */}
        <div className="flex items-center justify-between h-16 border-b border-slate-800/60 lg:border-none">
          
          {/* Brand & Context */}
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/30 rounded-xl flex items-center justify-center shrink-0 shadow-sm">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-100 tracking-tight">CR Maldives</h1>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded-full tracking-wide">
                  GST 8% &bull; MVR
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mt-0.5">
                <Store className="w-3 h-3 text-emerald-400 shrink-0" />
                <span className="text-emerald-400/90 font-semibold truncate max-w-[140px] sm:max-w-[220px]">
                  {currentUser?.role === "super_admin"
                    ? selectedOutlet === "ALL"
                      ? "All Outlets (Consolidated)"
                      : outlets.find((o) => o.id === selectedOutlet)?.name || "Selected Outlet"
                    : currentUser?.outlet_name || "Branch Outlet"}
                </span>
              </div>
            </div>
          </div>

          {/* Desktop Global Filters & Primary Action Group */}
          <div className="hidden lg:flex items-center space-x-3">
            {/* Super Admin Outlet Selector */}
            {currentUser?.role === "super_admin" && (
              <div className="flex items-center bg-slate-950/80 border border-amber-500/30 rounded-lg px-2.5 py-1.5 shadow-inner">
                <Building2 className="w-3.5 h-3.5 text-amber-400 mr-1.5 shrink-0" />
                <span className="text-xs text-amber-300/80 mr-1.5 font-bold">Outlet:</span>
                <select
                  value={selectedOutlet}
                  onChange={(e) => onOutletChange(e.target.value)}
                  aria-label="Select Outlet"
                  className="bg-transparent text-xs text-amber-200 font-bold focus:outline-none cursor-pointer max-w-[150px] truncate"
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

            {/* Quarter Filter */}
            <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5 shadow-inner">
              <Calendar className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
              <span className="text-xs text-slate-400 mr-1.5 font-medium">Period:</span>
              <select
                value={selectedQuarter}
                onChange={(e) => onQuarterChange(e.target.value)}
                aria-label="Select Quarter"
                className="bg-transparent text-xs text-slate-100 font-bold focus:outline-none cursor-pointer"
              >
                {quarters.map((q) => (
                  <option key={q} value={q} className="bg-slate-900 text-slate-100">
                    {q === "ALL" ? "All Quarters" : q}
                  </option>
                ))}
              </select>
            </div>

            {/* Upload Button */}
            <div className="relative" ref={uploadMenuRef}>
              <div className="inline-flex rounded-lg shadow-sm overflow-hidden border border-emerald-500/40">
                <button
                  onClick={() => onOpenUpload("file")}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Upload Bill</span>
                </button>
                <button
                  onClick={() => setShowUploadMenu(!showUploadMenu)}
                  aria-label="More upload options"
                  aria-expanded={showUploadMenu}
                  className="px-2 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-emerald-100 border-l border-emerald-500/40 transition-colors cursor-pointer"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {showUploadMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-800 rounded-lg shadow-xl py-1 z-50 text-xs">
                  <button
                    onClick={() => { setShowUploadMenu(false); onOpenUpload("file"); }}
                    className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 flex items-center space-x-2 transition-colors cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-emerald-400" />
                    <span>Upload Single File</span>
                  </button>
                  <button
                    onClick={() => { setShowUploadMenu(false); onOpenUpload("camera"); }}
                    className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 flex items-center space-x-2 transition-colors cursor-pointer"
                  >
                    <Camera className="w-4 h-4 text-blue-400" />
                    <span>Take Photo</span>
                  </button>
                  <button
                    onClick={() => { setShowUploadMenu(false); onOpenUpload("batch"); }}
                    className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 flex items-center space-x-2 transition-colors cursor-pointer"
                  >
                    <Files className="w-4 h-4 text-purple-400" />
                    <span>Batch Upload Bills</span>
                  </button>
                </div>
              )}
            </div>

            {/* Direct Settings Button */}
            <button
              onClick={onOpenSettings}
              className="p-2 text-slate-400 hover:text-slate-100 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-slate-600 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center space-x-1.5"
              title="Application Settings"
            >
              <Settings className="w-4 h-4 text-emerald-400" />
              <span className="hidden xl:inline text-xs font-semibold text-slate-200">Settings</span>
            </button>

            {/* User Profile */}
            <div className="relative pl-2 border-l border-slate-800" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                aria-expanded={showUserMenu}
                aria-label="User Account Menu"
                className="flex items-center space-x-2.5 px-2 py-1 hover:bg-slate-800/80 border border-transparent hover:border-slate-700/80 rounded-lg text-xs cursor-pointer transition-all"
              >
                <div className="w-7 h-7 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center font-bold text-emerald-300 text-xs">
                  {(currentUser?.name || currentUser?.username || "U").charAt(0).toUpperCase()}
                </div>
                <div className="text-left hidden xl:block">
                  <div className="font-semibold text-slate-100 text-xs max-w-[100px] truncate">
                    {currentUser?.name || currentUser?.username || "User"}
                  </div>
                  <div className="text-[10px] text-slate-400 capitalize">
                    {currentUser?.role === "super_admin" ? "Super Admin" : "Outlet User"}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-52 bg-slate-900 border border-slate-800 rounded-lg shadow-xl py-1 z-50 text-xs">
                  <div className="px-3 py-2 border-b border-slate-800">
                    <div className="font-semibold text-slate-100">{currentUser?.name || "User"}</div>
                    <div className="text-[10px] text-slate-400 font-mono">@{currentUser?.username}</div>
                  </div>

                  {currentUser?.role === "super_admin" && (
                    <>
                      <button
                        onClick={() => { setShowUserMenu(false); onOpenOutletsModal(); }}
                        className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 flex items-center space-x-2 transition-colors cursor-pointer"
                      >
                        <Store className="w-4 h-4 text-emerald-400" />
                        <span>Manage Outlets</span>
                      </button>
                      <button
                        onClick={() => { setShowUserMenu(false); onOpenUsersModal(); }}
                        className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 flex items-center space-x-2 transition-colors cursor-pointer"
                      >
                        <Users className="w-4 h-4 text-blue-400" />
                        <span>Manage Users</span>
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => { setShowUserMenu(false); onOpenSettings(); }}
                    className="w-full text-left px-3 py-2 text-slate-200 hover:bg-slate-800 flex items-center space-x-2 transition-colors cursor-pointer"
                  >
                    <Settings className="w-4 h-4 text-slate-400" />
                    <span>Settings</span>
                  </button>

                  <button
                    onClick={() => { setShowUserMenu(false); onLogout(); }}
                    className="w-full text-left px-3 py-2 text-rose-400 hover:bg-rose-500/10 flex items-center space-x-2 transition-colors cursor-pointer border-t border-slate-800 mt-1"
                  >
                    <LogOut className="w-4 h-4 text-rose-400" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Menu Toggle */}
          <div className="flex lg:hidden items-center space-x-2">
            <button
              onClick={onOpenSettings}
              className="p-2 text-slate-300 hover:text-white bg-slate-800 rounded-lg text-xs cursor-pointer"
              title="Settings"
            >
              <Settings className="w-4 h-4 text-emerald-400" />
            </button>
            <button
              onClick={() => onOpenUpload("file")}
              className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              title="Upload Bill"
            >
              <PlusCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle navigation menu"
              className="p-2 text-slate-300 hover:text-white bg-slate-800 rounded-lg cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Bottom Tier Desktop Navigation Modules */}
        <div className="hidden lg:flex items-center justify-between h-11 border-t border-slate-800/60 py-1">
          <nav className="flex items-center space-x-1">
            <button
              onClick={onOpenExportExcel}
              className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export GST Excel</span>
            </button>

            {onOpenRevenue && (
              <button
                onClick={onOpenRevenue}
                className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>Revenue & Sales</span>
              </button>
            )}

            {onOpenAssets && (
              <button
                onClick={onOpenAssets}
                className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
              >
                <Calculator className="w-3.5 h-3.5 text-purple-400" />
                <span>Asset Register</span>
              </button>
            )}

            {onOpenIncomeTax && (
              <button
                onClick={onOpenIncomeTax}
                className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-lg transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                <span>Income Tax (MIRA 604)</span>
              </button>
            )}
          </nav>

          {/* Quick Management Shortcuts */}
          <div className="flex items-center space-x-1">
            {currentUser?.role === "super_admin" && (
              <>
                <button
                  onClick={onOpenOutletsModal}
                  className="flex items-center space-x-1.5 px-2.5 py-1 text-xs text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
                >
                  <Store className="w-3.5 h-3.5" />
                  <span>Outlets</span>
                </button>
                <button
                  onClick={onOpenUsersModal}
                  className="flex items-center space-x-1.5 px-2.5 py-1 text-xs text-slate-400 hover:text-blue-400 transition-colors cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Users</span>
                </button>
              </>
            )}
            <button
              onClick={onOpenSettings}
              className="flex items-center space-x-1.5 px-2.5 py-1 text-xs text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Settings</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-slate-900 border-b border-slate-800 px-4 pt-3 pb-4 space-y-3">
          {/* Mobile Context Filters */}
          <div className="grid grid-cols-1 gap-2 pt-1 pb-2 border-b border-slate-800">
            {currentUser?.role === "super_admin" && (
              <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-lg border border-amber-500/20">
                <span className="text-xs text-amber-300 font-medium">Outlet:</span>
                <select
                  value={selectedOutlet}
                  onChange={(e) => onOutletChange(e.target.value)}
                  className="bg-transparent text-xs text-amber-200 font-bold focus:outline-none"
                >
                  <option value="ALL" className="bg-slate-900">All Outlets</option>
                  {outlets.map((o) => (
                    <option key={o.id} value={o.id} className="bg-slate-900">{o.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center justify-between bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
              <span className="text-xs text-slate-400 font-medium">Period:</span>
              <select
                value={selectedQuarter}
                onChange={(e) => onQuarterChange(e.target.value)}
                className="bg-transparent text-xs text-slate-200 font-bold focus:outline-none"
              >
                {quarters.map((q) => (
                  <option key={q} value={q} className="bg-slate-900">{q === "ALL" ? "All Quarters" : q}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Nav Items Mobile */}
          <div className="space-y-1">
            <button
              onClick={() => { setMobileMenuOpen(false); onOpenExportExcel(); }}
              className="w-full flex items-center space-x-3 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 rounded-lg"
            >
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>Export GST Excel</span>
            </button>

            {onOpenRevenue && (
              <button
                onClick={() => { setMobileMenuOpen(false); onOpenRevenue(); }}
                className="w-full flex items-center space-x-3 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 rounded-lg"
              >
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>Revenue & Sales</span>
              </button>
            )}

            {onOpenAssets && (
              <button
                onClick={() => { setMobileMenuOpen(false); onOpenAssets(); }}
                className="w-full flex items-center space-x-3 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 rounded-lg"
              >
                <Calculator className="w-4 h-4 text-purple-400" />
                <span>Asset Register</span>
              </button>
            )}

            {onOpenIncomeTax && (
              <button
                onClick={() => { setMobileMenuOpen(false); onOpenIncomeTax(); }}
                className="w-full flex items-center space-x-3 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 rounded-lg"
              >
                <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                <span>Income Tax (MIRA 604)</span>
              </button>
            )}

            <button
              onClick={() => { setMobileMenuOpen(false); onOpenSettings(); }}
              className="w-full flex items-center space-x-3 px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 rounded-lg"
            >
              <Settings className="w-4 h-4 text-slate-400" />
              <span>Settings</span>
            </button>
          </div>

          {/* User Signout in Mobile Menu */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
            <div className="text-xs text-slate-400">
              Signed in as <span className="text-slate-200 font-semibold">{currentUser?.username}</span>
            </div>
            <button
              onClick={() => { setMobileMenuOpen(false); onLogout(); }}
              className="px-3 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg text-xs font-semibold"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </header>
  );
};