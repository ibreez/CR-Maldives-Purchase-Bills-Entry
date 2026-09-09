import React, { useState, useEffect } from "react";
import {
  X,
  FileSpreadsheet,
  Building2,
  Calendar,
  ShieldCheck,
  Download,
  Printer,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Percent,
  Layers,
  ArrowRight,
  TrendingUp,
  Receipt
} from "lucide-react";
import { AuthUser, Outlet } from "../types";
import {
  GstSector,
  Mira205GeneralReturn,
  Mira206TourismReturn,
  GstGlReconciliation
} from "../types/gst";

interface GstReturnModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  outlets: Outlet[];
}

export const GstReturnModal: React.FC<GstReturnModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  outlets
}) => {
  const [sector, setSector] = useState<GstSector>("GENERAL");
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedPeriod, setSelectedPeriod] = useState<string>(`${new Date().getFullYear()}-M01`);
  const [selectedOutlet, setSelectedOutlet] = useState<string>("ALL");
  const [previousExcessCredit, setPreviousExcessCredit] = useState<number>(0);
  
  const [activeTab, setActiveTab] = useState<"return" | "reconciliation" | "rates">("return");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [mira205, setMira205] = useState<Mira205GeneralReturn | null>(null);
  const [mira206, setMira206] = useState<Mira206TourismReturn | null>(null);
  const [reconciliation, setReconciliation] = useState<GstGlReconciliation | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchGstReturn();
      fetchReconciliation();
    }
  }, [isOpen, sector, selectedPeriod, selectedOutlet]);

  const fetchGstReturn = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("cr_auth_token");
      const endpoint = sector === "GENERAL" ? "/api/gst/mira205" : "/api/gst/mira206";

      // Compute start and end dates for selected period
      const [yearStr, periodCode] = selectedPeriod.split("-");
      const year = parseInt(yearStr, 10);
      let startDate = `${year}-01-01`;
      let endDate = `${year}-01-31`;

      if (periodCode.startsWith("M")) {
        const month = parseInt(periodCode.replace("M", ""), 10);
        const lastDay = new Date(year, month, 0).getDate();
        startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      } else if (periodCode.startsWith("Q")) {
        const quarter = parseInt(periodCode.replace("Q", ""), 10);
        const startMonth = (quarter - 1) * 3 + 1;
        const endMonth = quarter * 3;
        const lastDay = new Date(year, endMonth, 0).getDate();
        startDate = `${year}-${String(startMonth).padStart(2, "0")}-01`;
        endDate = `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          period: {
            periodName: selectedPeriod,
            startDate,
            endDate,
            taxYear: year
          },
          taxpayer: {
            tin: sector === "GENERAL" ? "1000200GST001" : "2000300GST001",
            name: sector === "GENERAL" ? "General Trading Enterprise Pvt Ltd" : "Coral Haven Resort & Spa Pvt Ltd",
            tourismEstablishmentName: sector === "TOURISM" ? "Coral Haven Resort" : undefined,
            operatingLicenseNumber: sector === "TOURISM" ? "MOT-2025-089" : undefined
          },
          previousExcessCredit: Number(previousExcessCredit || 0)
        })
      });

      if (!res.ok) throw new Error("Failed to generate GST return");
      const data = await res.json();
      if (sector === "GENERAL") {
        setMira205(data.mira205);
        setMira206(null);
      } else {
        setMira206(data.mira206);
        setMira205(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load statutory GST return.");
    } finally {
      setLoading(false);
    }
  };

  const fetchReconciliation = async () => {
    try {
      const token = localStorage.getItem("cr_auth_token");
      const [yearStr, periodCode] = selectedPeriod.split("-");
      const year = parseInt(yearStr, 10);
      let startDate = `${year}-01-01`;
      let endDate = `${year}-01-31`;

      if (periodCode.startsWith("M")) {
        const month = parseInt(periodCode.replace("M", ""), 10);
        const lastDay = new Date(year, month, 0).getDate();
        startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      }

      const res = await fetch("/api/gst/reconciliation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          periodStart: startDate,
          periodEnd: endDate,
          sector
        })
      });

      if (res.ok) {
        const data = await res.json();
        setReconciliation(data.reconciliation);
      }
    } catch (e) {
      console.warn("Reconciliation fetch error", e);
    }
  };

  const handleExportJSON = () => {
    const payload = sector === "GENERAL" ? mira205 : mira206;
    if (!payload) return;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sector === "GENERAL" ? "MIRA_205_v25.1" : "MIRA_206_v25.1"}_${selectedPeriod}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-6xl my-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-slate-100">
                  {sector === "GENERAL" ? "MIRA 205 (General Sector GST Return)" : "MIRA 206 (Tourism Sector GST Return)"}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold">
                  v25.1 Statutory
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Official Maldives Inland Revenue Authority Versioned GST Engine & Ledger Reconciliation
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Sector Selector */}
            <div className="flex items-center bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <Layers className="w-3.5 h-3.5 text-emerald-400 mr-2" />
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value as GstSector)}
                aria-label="Select GST Sector"
                className="bg-transparent text-emerald-300 font-bold focus:outline-none cursor-pointer"
              >
                <option value="GENERAL" className="bg-slate-900 text-slate-100">General Sector (8% Standard)</option>
                <option value="TOURISM" className="bg-slate-900 text-slate-100">Tourism Sector (16% / 17% TGST)</option>
              </select>
            </div>

            {/* Period Selector */}
            <div className="flex items-center bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400 mr-2" />
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                aria-label="Select Filing Period"
                className="bg-transparent text-slate-100 font-bold focus:outline-none cursor-pointer"
              >
                <option value="2026-M01" className="bg-slate-900">2026 January (M01)</option>
                <option value="2026-M02" className="bg-slate-900">2026 February (M02)</option>
                <option value="2026-M03" className="bg-slate-900">2026 March (M03)</option>
                <option value="2025-Q3" className="bg-slate-900">2025 Q3 (Rate Transition: 16% → 17%)</option>
                <option value="2025-M06" className="bg-slate-900">2025 June (16% Tourism)</option>
                <option value="2025-M07" className="bg-slate-900">2025 July (17% Tourism)</option>
              </select>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center space-x-2 px-6 py-2 border-b border-slate-800 bg-slate-950 text-xs">
          <button
            onClick={() => setActiveTab("return")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              activeTab === "return"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Form Breakdown & Calculation
          </button>
          <button
            onClick={() => setActiveTab("reconciliation")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              activeTab === "reconciliation"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            GL Audit Reconciliation (Accounts 2100 & 1400)
          </button>
          <button
            onClick={() => setActiveTab("rates")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              activeTab === "rates"
                ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Regulatory Rate Engine
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
              <p className="text-sm text-slate-400">Compiling MIRA {sector === "GENERAL" ? "205" : "206"} Statutory Return...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : activeTab === "return" && sector === "GENERAL" && mira205 ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Box 7 — Net Output Tax (Payable)</div>
                  <div className="text-2xl font-mono font-bold text-emerald-400 mt-1">
                    MVR {mira205.sectionA_Supplies.box7_NetOutputTax.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">8% Standard Supplies Output</div>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Box 14 — Net Claimable Input Tax</div>
                  <div className="text-2xl font-mono font-bold text-blue-400 mt-1">
                    MVR {mira205.sectionB_Purchases.box14_NetClaimableInputTax.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Operational + Capital Purchases</div>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Box 17 — Final Amount Payable / (Refundable)</div>
                  <div className={`text-2xl font-mono font-bold mt-1 ${
                    mira205.sectionC_Calculation.box17_FinalAmountPayableOrRefundable >= 0 ? "text-amber-400" : "text-purple-400"
                  }`}>
                    MVR {mira205.sectionC_Calculation.box17_FinalAmountPayableOrRefundable.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Net GST minus Excess Credits</div>
                </div>
              </div>

              {/* Section A: Supplies */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-400" />
                    Section A — Supplies Made in the Taxable Period
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">Rate: 8%</span>
                </div>

                <div className="divide-y divide-slate-800/60 text-xs">
                  <div className="flex justify-between py-2">
                    <span className="text-slate-300">Box 1 — Standard Rated Supplies (8%)</span>
                    <div className="text-right font-mono">
                      <span className="text-slate-400 mr-4">Taxable: MVR {mira205.sectionA_Supplies.box1_StandardRatedSupplies8Pct.taxableValue.toFixed(2)}</span>
                      <span className="text-emerald-400 font-bold">Tax: MVR {mira205.sectionA_Supplies.box1_StandardRatedSupplies8Pct.outputTax.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-300">Box 2 — Zero-Rated Supplies (0%)</span>
                    <span className="font-mono text-slate-200">MVR {mira205.sectionA_Supplies.box2_ZeroRatedSupplies.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-300">Box 3 — Exempt Supplies (0%)</span>
                    <span className="font-mono text-slate-200">MVR {mira205.sectionA_Supplies.box3_ExemptSupplies.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-2 font-bold bg-slate-900/50 px-2 rounded">
                    <span className="text-slate-100">Box 4 — Total Supplies Value (Box 1 + Box 2 + Box 3)</span>
                    <span className="font-mono text-emerald-300">MVR {mira205.sectionA_Supplies.box4_TotalSuppliesValue.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Section B: Purchases & Input Tax */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                    Section B — Purchases & Claimable Input Tax
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">Sec 22(b) Compliant</span>
                </div>

                <div className="divide-y divide-slate-800/60 text-xs">
                  <div className="flex justify-between py-2">
                    <span className="text-slate-300">Box 8 — Standard Rated Purchases (Operational)</span>
                    <div className="text-right font-mono">
                      <span className="text-slate-400 mr-4">Value: MVR {mira205.sectionB_Purchases.box8_StandardRatedPurchases.taxableValue.toFixed(2)}</span>
                      <span className="text-blue-400 font-bold">Input Tax: MVR {mira205.sectionB_Purchases.box8_StandardRatedPurchases.inputTax.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-300">Box 9 — Capital Asset Purchases (Schedule 2)</span>
                    <div className="text-right font-mono">
                      <span className="text-slate-400 mr-4">Value: MVR {mira205.sectionB_Purchases.box9_CapitalPurchases.taxableValue.toFixed(2)}</span>
                      <span className="text-purple-400 font-bold">Capital Tax: MVR {mira205.sectionB_Purchases.box9_CapitalPurchases.inputTax.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-2 bg-rose-950/20 px-2 rounded">
                    <span className="text-rose-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      Box 10 — Blocked Input Tax (Sec 22(b) Non-Claimable Entertainment/Fines)
                    </span>
                    <div className="text-right font-mono text-rose-400">
                      <span>Value: MVR {mira205.sectionB_Purchases.box10_BlockedInputTax.taxableValue.toFixed(2)} | Blocked: MVR {mira205.sectionB_Purchases.box10_BlockedInputTax.blockedTax.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-300">Box 11 — Mixed-Use Apportionment (Turnover Pro-Rata)</span>
                    <span className="font-mono text-slate-200">Claimable: MVR {mira205.sectionB_Purchases.box11_MixedUseApportionment.claimableInputTax.toFixed(2)} (Ratio: {(mira205.sectionB_Purchases.box11_MixedUseApportionment.apportionmentRatio * 100).toFixed(1)}%)</span>
                  </div>
                  <div className="flex justify-between py-2 font-bold bg-slate-900/50 px-2 rounded">
                    <span className="text-slate-100">Box 14 — Net Claimable Input Tax (Box 8 + Box 9 + Box 11)</span>
                    <span className="font-mono text-blue-300">MVR {mira205.sectionB_Purchases.box14_NetClaimableInputTax.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Statutory Traceability Footer */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span className="font-semibold text-slate-200">Statutory Regulatory Checksum:</span>
                  </div>
                  <span className="font-mono text-[11px] text-emerald-400 truncate max-w-md">{mira205.regulatoryTraceability.checksum}</span>
                </div>
                <div className="text-slate-400 text-[11px]">
                  Governing Rule: <span className="text-slate-200 font-mono">{mira205.regulatoryTraceability.ruleId}</span> ({mira205.regulatoryTraceability.legalReference})
                </div>
              </div>
            </div>
          ) : activeTab === "return" && sector === "TOURISM" && mira206 ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Box 7 — Net TGST Output Tax</div>
                  <div className="text-2xl font-mono font-bold text-emerald-400 mt-1">
                    MVR {mira206.sectionA_Supplies.box7_NetTgstOutputTax.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">16% & 17% Tourism Supplies</div>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Box 13 — Net Claimable TGST Input Tax</div>
                  <div className="text-2xl font-mono font-bold text-blue-400 mt-1">
                    MVR {mira206.sectionB_Purchases.box13_NetClaimableTgstInputTax.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Resort Operational & Capital Input</div>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Box 16 — Final TGST Amount Payable</div>
                  <div className="text-2xl font-mono font-bold text-amber-400 mt-1">
                    MVR {mira206.sectionC_Calculation.box16_FinalTgstPayableOrRefundable.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Due under Tourism GST Act</div>
                </div>
              </div>

              {/* Section A: Tourism Supplies */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-emerald-400" />
                    Section A — Tourism Sector Supplies (TGST)
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">16% / 17% Versioned</span>
                </div>

                <div className="divide-y divide-slate-800/60 text-xs">
                  <div className="flex justify-between py-2">
                    <span className="text-slate-300">Box 1A — Tourism Supplies (16% through 2025-06-30)</span>
                    <div className="text-right font-mono">
                      <span className="text-slate-400 mr-4">Taxable: MVR {mira206.sectionA_Supplies.box1A_TourismSupplies16Pct.taxableValue.toFixed(2)}</span>
                      <span className="text-emerald-400 font-bold">TGST: MVR {mira206.sectionA_Supplies.box1A_TourismSupplies16Pct.outputTax.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-300">Box 1B — Tourism Supplies (17% from 2025-07-01)</span>
                    <div className="text-right font-mono">
                      <span className="text-slate-400 mr-4">Taxable: MVR {mira206.sectionA_Supplies.box1B_TourismSupplies17Pct.taxableValue.toFixed(2)}</span>
                      <span className="text-emerald-400 font-bold">TGST: MVR {mira206.sectionA_Supplies.box1B_TourismSupplies17Pct.outputTax.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-300">Box 2 — Zero-Rated Tourism Supplies</span>
                    <span className="font-mono text-slate-200">MVR {mira206.sectionA_Supplies.box2_ZeroRatedTourismSupplies.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-300">Box 3 — Exempt Tourism Supplies</span>
                    <span className="font-mono text-slate-200">MVR {mira206.sectionA_Supplies.box3_ExemptTourismSupplies.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-2 font-bold bg-slate-900/50 px-2 rounded">
                    <span className="text-slate-100">Box 4 — Total Tourism Supplies Value</span>
                    <span className="font-mono text-emerald-300">MVR {mira206.sectionA_Supplies.box4_TotalTourismSuppliesValue.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Section B: Purchases */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                    Section B — Tourism Purchases & TGST Input
                  </h3>
                </div>

                <div className="divide-y divide-slate-800/60 text-xs">
                  <div className="flex justify-between py-2">
                    <span className="text-slate-300">Box 8 — Tourism Operational Purchases</span>
                    <div className="text-right font-mono">
                      <span className="text-slate-400 mr-4">Value: MVR {mira206.sectionB_Purchases.box8_TourismOperationalPurchases.taxableValue.toFixed(2)}</span>
                      <span className="text-blue-400 font-bold">Input Tax: MVR {mira206.sectionB_Purchases.box8_TourismOperationalPurchases.inputTax.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-300">Box 9 — Tourism Capital Asset Purchases</span>
                    <div className="text-right font-mono">
                      <span className="text-slate-400 mr-4">Value: MVR {mira206.sectionB_Purchases.box9_TourismCapitalPurchases.taxableValue.toFixed(2)}</span>
                      <span className="text-purple-400 font-bold">Capital Tax: MVR {mira206.sectionB_Purchases.box9_TourismCapitalPurchases.inputTax.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-between py-2 bg-rose-950/20 px-2 rounded">
                    <span className="text-rose-300">Box 10 — Blocked Input Tax (Sec 22(b))</span>
                    <span className="font-mono text-rose-400">Blocked: MVR {mira206.sectionB_Purchases.box10_BlockedInputTax.blockedTax.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : activeTab === "reconciliation" ? (
            <div className="space-y-6">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    GST Subledger to General Ledger Audit
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    reconciliation?.isReconciled ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                  }`}>
                    {reconciliation?.isReconciled ? "100% RECONCILED" : "DISCREPANCIES DETECTED"}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                    <div className="font-bold text-slate-200">Account 2100 — GST Output Tax Payable</div>
                    <div className="flex justify-between text-slate-400">
                      <span>GST Subledger Total:</span>
                      <span className="font-mono text-slate-100">MVR {(reconciliation?.gstTransactionsTotalOutputTax || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>GL Account 2100 Balance:</span>
                      <span className="font-mono text-slate-100">MVR {(reconciliation?.glOutputTaxBalance || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold pt-2 border-t border-slate-800">
                      <span>Variance:</span>
                      <span className={`font-mono ${reconciliation?.outputTaxVariance === 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        MVR {(reconciliation?.outputTaxVariance || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                    <div className="font-bold text-slate-200">Account 1400 — GST Input Tax Claimable</div>
                    <div className="flex justify-between text-slate-400">
                      <span>GST Subledger Total:</span>
                      <span className="font-mono text-slate-100">MVR {(reconciliation?.gstTransactionsTotalInputTax || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>GL Account 1400 Balance:</span>
                      <span className="font-mono text-slate-100">MVR {(reconciliation?.glInputTaxBalance || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold pt-2 border-t border-slate-800">
                      <span>Variance:</span>
                      <span className={`font-mono ${reconciliation?.inputTaxVariance === 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        MVR {(reconciliation?.inputTaxVariance || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3 text-xs">
                <h3 className="text-sm font-bold text-slate-200">Maldives Statutory GST Rate Governance</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                    <div className="font-bold text-emerald-400">General Sector GST</div>
                    <div className="text-slate-300">Rate: <span className="font-mono font-bold text-white">8%</span></div>
                    <div className="text-slate-400">Effective: 2023-01-01 to Present</div>
                    <div className="text-slate-500 text-[11px]">Governed by Goods and Services Tax Act Amendment (Act No. 20/2022) Section 15(a)</div>
                  </div>

                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                    <div className="font-bold text-amber-400">Tourism Sector GST (TGST)</div>
                    <div className="text-slate-300">Historical Rate: <span className="font-mono font-bold text-white">16%</span> (through 2025-06-30)</div>
                    <div className="text-slate-300">Current Statutory Rate: <span className="font-mono font-bold text-emerald-400">17%</span> (from 2025-07-01)</div>
                    <div className="text-slate-500 text-[11px]">Governed by Goods and Services Tax Act Amendment Section 15(b)</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900">
          <button
            onClick={fetchGstReturn}
            className="flex items-center space-x-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Re-compute Return</span>
          </button>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => window.print()}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Statutory Form</span>
            </button>

            <button
              onClick={handleExportJSON}
              className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download MIRA Payload (JSON)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
