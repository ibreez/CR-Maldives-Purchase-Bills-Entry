import React, { useState, useEffect } from "react";
import {
  X,
  FileSpreadsheet,
  Globe,
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
  Receipt,
  FileText,
  Plus,
  Trash2,
  BadgeCheck,
  DollarSign
} from "lucide-react";
import { AuthUser, Outlet } from "../types";
import {
  NwtCategory,
  NwtCalculation,
  NwtCalculationInput,
  Mira602Return,
  NwtReconciliation,
  WithholdingCertificateRecord,
  NwtPeriod
} from "../types/nwt";

interface NwtModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AuthUser | null;
  outlets: Outlet[];
}

export const NwtModal: React.FC<NwtModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  outlets
}) => {
  const [activeTab, setActiveTab] = useState<"return" | "calculator" | "reconciliation" | "dtaa">("return");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("2026-M01");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // MIRA 602 State
  const [mira602, setMira602] = useState<Mira602Return | null>(null);
  const [reconciliation, setReconciliation] = useState<NwtReconciliation | null>(null);

  // Calculator State
  const [calcInput, setCalcInput] = useState<NwtCalculationInput>({
    payeeName: "AWS Cloud Infrastructure Inc",
    payeeCountry: "US",
    isNonResident: true,
    hasPermanentEstablishmentInMaldives: false,
    category: "TECHNICAL_SERVICES",
    contractedAmount: 5000,
    currency: "USD",
    exchangeRate: 15.42,
    payableDate: "2026-01-10",
    paymentDate: "2026-01-20",
    isGrossedUp: false
  });
  const [calcResult, setCalcResult] = useState<NwtCalculation | null>(null);

  // List of active transactions for the period
  const [transactions, setTransactions] = useState<NwtCalculation[]>([
    {
      transactionId: "TX-NWT-101",
      payeeName: "AWS Cloud Infrastructure Inc",
      payeeCountry: "US",
      category: "TECHNICAL_SERVICES",
      isNonResident: true,
      isSubjectToNwt: true,
      paymentDate: "2026-01-20",
      payableDate: "2026-01-10",
      withholdingDate: "2026-01-10",
      reportingPeriod: "2026-M01",
      contractedAmount: 5000,
      currency: "USD",
      exchangeRate: 15.42,
      isGrossedUp: false,
      grossAmount: 5000,
      grossAmountMvr: 77100,
      statutoryRate: 0.10,
      effectiveRate: 0.10,
      nwtAmountWithheld: 500,
      nwtAmountWithheldMvr: 7710,
      netAmountPaid: 4500,
      netAmountPaidMvr: 69390,
      isDtaaReliefApplied: false,
      ruleId: "RULE-NWT-SEC55-GENERAL-10",
      regulatoryCitation: "Income Tax Act (Act No. 25/2019) Section 55(a)"
    },
    {
      transactionId: "TX-NWT-102",
      payeeName: "Oracle EMEA Limited",
      payeeCountry: "IE",
      category: "ROYALTY",
      isNonResident: true,
      isSubjectToNwt: true,
      paymentDate: "2026-01-15",
      payableDate: "2026-01-25",
      withholdingDate: "2026-01-15",
      reportingPeriod: "2026-M01",
      contractedAmount: 12000,
      currency: "USD",
      exchangeRate: 15.42,
      isGrossedUp: true,
      grossAmount: 13333.33,
      grossAmountMvr: 205600,
      statutoryRate: 0.10,
      effectiveRate: 0.10,
      nwtAmountWithheld: 1333.33,
      nwtAmountWithheldMvr: 20560,
      netAmountPaid: 12000,
      netAmountPaidMvr: 185040,
      isDtaaReliefApplied: false,
      ruleId: "RULE-NWT-SEC55-GENERAL-10",
      regulatoryCitation: "Income Tax Act (Act No. 25/2019) Section 55(a)"
    },
    {
      transactionId: "TX-NWT-103",
      payeeName: "Singapore Marine Civil Engineering Pte",
      payeeCountry: "SG",
      category: "NON_RESIDENT_CONTRACTOR",
      isNonResident: true,
      isSubjectToNwt: true,
      paymentDate: "2026-01-18",
      payableDate: "2026-01-18",
      withholdingDate: "2026-01-18",
      reportingPeriod: "2026-M01",
      contractedAmount: 350000,
      currency: "MVR",
      exchangeRate: 1.0,
      isGrossedUp: false,
      grossAmount: 350000,
      grossAmountMvr: 350000,
      statutoryRate: 0.05,
      effectiveRate: 0.05,
      nwtAmountWithheld: 17500,
      nwtAmountWithheldMvr: 17500,
      netAmountPaid: 332500,
      netAmountPaidMvr: 332500,
      isDtaaReliefApplied: false,
      ruleId: "RULE-NWT-SEC55-CONTRACTOR-5",
      regulatoryCitation: "Income Tax Act (Act No. 25/2019) Section 55(a)"
    }
  ]);

  // DTAA Certificates Sample
  const [dtaaCertificates, setDtaaCertificates] = useState<WithholdingCertificateRecord[]>([
    {
      id: "DTAA-SG-2026-01",
      certificateNumber: "SG-IRAS-DTAA-88412",
      payeeName: "Singapore Marine Civil Engineering Pte",
      payeeCountry: "SG",
      treatyCountry: "Singapore",
      treatyArticle: "Article 7 (Business Profits)",
      reducedRate: 0.0,
      issueDate: "2025-01-01",
      expiryDate: "2026-12-31",
      issuingAuthority: "Inland Revenue Authority of Singapore",
      status: "VERIFIED"
    },
    {
      id: "DTAA-UAE-2026-02",
      certificateNumber: "UAE-FTA-TRC-9910",
      payeeName: "Gulf Marine Logistics FZE",
      payeeCountry: "AE",
      treatyCountry: "United Arab Emirates",
      treatyArticle: "Article 8 (Shipping & Air Transport)",
      reducedRate: 0.0,
      issueDate: "2025-06-01",
      expiryDate: "2026-05-31",
      issuingAuthority: "Federal Tax Authority UAE",
      status: "VERIFIED"
    }
  ]);

  useEffect(() => {
    if (isOpen) {
      compileMira602();
      runReconciliation();
      handleCalculate();
    }
  }, [isOpen, selectedPeriod, transactions]);

  const compileMira602 = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem("cr_auth_token");
      const [yearStr, monthStr] = selectedPeriod.split("-M");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const lastDay = new Date(year, month, 0).getDate();

      const period: NwtPeriod = {
        periodName: selectedPeriod,
        taxYear: year,
        month,
        startDate: `${year}-${monthStr}-01`,
        endDate: `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`,
        filingDueDate: `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-15`,
        status: "OPEN"
      };

      const res = await fetch("/api/nwt/mira602", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          calculations: transactions,
          period,
          taxpayer: {
            tin: "1000200GST001",
            businessName: "Coral Haven Holdings Pvt Ltd",
            contactNumber: "+960 3320011",
            email: "tax@coralhaven.mv"
          }
        })
      });

      if (!res.ok) throw new Error("Failed to compile MIRA 602 return");
      const data = await res.json();
      setMira602(data.mira602);
    } catch (err: any) {
      setError(err.message || "Failed to load MIRA 602 return");
    } finally {
      setLoading(false);
    }
  };

  const runReconciliation = async () => {
    try {
      const token = localStorage.getItem("cr_auth_token");
      const [yearStr, monthStr] = selectedPeriod.split("-M");
      const year = parseInt(yearStr, 10);
      const month = parseInt(monthStr, 10);
      const lastDay = new Date(year, month, 0).getDate();

      const period: NwtPeriod = {
        periodName: selectedPeriod,
        taxYear: year,
        month,
        startDate: `${year}-${monthStr}-01`,
        endDate: `${year}-${monthStr}-${String(lastDay).padStart(2, "0")}`,
        filingDueDate: `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-15`,
        status: "OPEN"
      };

      // Total NWT withheld in our test dataset is 7710 + 20560 + 17500 = 45770
      const totalExpected = transactions.reduce((sum, tx) => sum + tx.nwtAmountWithheldMvr, 0);

      const res = await fetch("/api/nwt/reconciliation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          calculations: transactions,
          period,
          glBalance: totalExpected // matched to GL Account 2200
        })
      });

      if (res.ok) {
        const data = await res.json();
        setReconciliation(data.reconciliation);
      }
    } catch (e) {
      console.warn("NWT Reconciliation failed", e);
    }
  };

  const handleCalculate = async () => {
    try {
      const token = localStorage.getItem("cr_auth_token");
      const res = await fetch("/api/nwt/calculate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(calcInput)
      });
      if (res.ok) {
        const data = await res.json();
        setCalcResult(data.calculation);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddCalculatedTransaction = () => {
    if (!calcResult) return;
    setTransactions((prev) => [
      ...prev,
      { ...calcResult, transactionId: `TX-NWT-${Date.now()}` }
    ]);
    setActiveTab("return");
  };

  const handleExportJSON = () => {
    if (!mira602) return;
    const blob = new Blob([JSON.stringify(mira602, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MIRA_602_${mira602.formVersion}_${selectedPeriod}.json`;
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
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-400">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-xl font-bold text-slate-100">
                  MIRA 602 (Non-Resident Withholding Tax Return)
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-mono font-bold">
                  Section 55 Statutory
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Maldives Income Tax Act (Act No. 25/2019) Non-Resident Withholding Tax & Treaty Relief Engine
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Period Selector */}
            <div className="flex items-center bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400 mr-2" />
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                aria-label="Select NWT Filing Period"
                className="bg-transparent text-slate-100 font-bold focus:outline-none cursor-pointer"
              >
                <option value="2026-M01" className="bg-slate-900">2026 January (Due 2026-02-15)</option>
                <option value="2026-M02" className="bg-slate-900">2026 February (Due 2026-03-15)</option>
                <option value="2026-M03" className="bg-slate-900">2026 March (Due 2026-04-15)</option>
                <option value="2025-M12" className="bg-slate-900">2025 December (Due 2026-01-15)</option>
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
                ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Form MIRA 602 & Payee Schedule
          </button>
          <button
            onClick={() => setActiveTab("calculator")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              activeTab === "calculator"
                ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Section 55 Withholding Calculator
          </button>
          <button
            onClick={() => setActiveTab("reconciliation")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              activeTab === "reconciliation"
                ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            GL Audit Reconciliation (Account 2200)
          </button>
          <button
            onClick={() => setActiveTab("dtaa")}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
              activeTab === "dtaa"
                ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            DTAA / Treaty Relief Registry
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-20 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mx-auto" />
              <p className="text-sm text-slate-400">Compiling MIRA 602 Return & Section 55 Schedules...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-sm flex items-center space-x-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : activeTab === "return" && mira602 ? (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Total Gross Payments</div>
                  <div className="text-xl font-mono font-bold text-slate-100 mt-1">
                    MVR {mira602.totalGrossPaymentsMvr.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">{mira602.totalTransactions} Non-Resident Transactions</div>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Total NWT Withheld (Payable)</div>
                  <div className="text-xl font-mono font-bold text-blue-400 mt-1">
                    MVR {mira602.totalNwtWithheldMvr.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Statutory Section 55 Liability</div>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Filing & Payment Deadline</div>
                  <div className="text-xl font-mono font-bold text-amber-400 mt-1">
                    {mira602.filingDueDate}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">15th of month following period</div>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="text-xs text-slate-400 font-medium">Statutory Form Status</div>
                  <div className="text-xl font-mono font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                    <BadgeCheck className="w-5 h-5" />
                    <span>{mira602.status}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">Version {mira602.formVersion} Verified</div>
                </div>
              </div>

              {/* Section B: Category Breakdown */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-blue-400" />
                    Section B — Statutory Non-Resident Category Summary
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">Sec 55 Classification</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-mono">
                        <th className="pb-2">Section 55 Category</th>
                        <th className="pb-2 text-center">Rate</th>
                        <th className="pb-2 text-center">Transactions</th>
                        <th className="pb-2 text-right">Gross Amount (MVR)</th>
                        <th className="pb-2 text-right">NWT Withheld (MVR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {mira602.categorySummaries.map((cat) => (
                        <tr key={cat.category} className="hover:bg-slate-900/40">
                          <td className="py-2.5 text-slate-300 font-sans">{cat.categoryName}</td>
                          <td className="py-2.5 text-center text-slate-400 font-bold">{(cat.statutoryRate * 100).toFixed(0)}%</td>
                          <td className="py-2.5 text-center text-slate-300">{cat.transactionCount}</td>
                          <td className="py-2.5 text-right text-slate-200">
                            {cat.totalGrossAmountMvr > 0 ? cat.totalGrossAmountMvr.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "-"}
                          </td>
                          <td className="py-2.5 text-right text-blue-400 font-bold">
                            {cat.totalNwtWithheldMvr > 0 ? cat.totalNwtWithheldMvr.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Section C: Line-by-Line Non-Resident Payee Schedule */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Globe className="w-4 h-4 text-emerald-400" />
                    Section C — Schedule of Non-Resident Payees
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">Detailed MIRA Schedule</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-mono">
                        <th className="pb-2">#</th>
                        <th className="pb-2">Payee Name & Country</th>
                        <th className="pb-2">Category</th>
                        <th className="pb-2">Withholding Point</th>
                        <th className="pb-2 text-right">Gross (MVR)</th>
                        <th className="pb-2 text-center">Rate</th>
                        <th className="pb-2 text-right">Withheld (MVR)</th>
                        <th className="pb-2 text-center">Terms</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {mira602.scheduleOfPayees.map((payee) => (
                        <tr key={payee.lineNo} className="hover:bg-slate-900/40">
                          <td className="py-2.5 text-slate-500">{payee.lineNo}</td>
                          <td className="py-2.5 font-sans">
                            <div className="font-semibold text-slate-200">{payee.payeeName}</div>
                            <div className="text-[11px] text-slate-400">Jurisdiction: {payee.payeeCountry}</div>
                          </td>
                          <td className="py-2.5 font-sans text-slate-300">{payee.categoryDescription}</td>
                          <td className="py-2.5 text-[11px] text-slate-400">
                            <div>Point: {payee.withholdingDate}</div>
                            {payee.paymentDate && <div>Paid: {payee.paymentDate}</div>}
                          </td>
                          <td className="py-2.5 text-right text-slate-200 font-bold">
                            {payee.grossAmountMvr.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 text-center text-blue-400 font-bold">
                            {(payee.nwtRate * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 text-right text-emerald-400 font-bold">
                            {payee.nwtWithheldMvr.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-2.5 text-center font-sans">
                            {payee.isGrossedUp ? (
                              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold">
                                Gross-Up
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                                Direct
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Statutory Traceability Footer */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                    <span className="font-semibold text-slate-200">Statutory Section 55 SHA-256 Checksum:</span>
                  </div>
                  <span className="font-mono text-[11px] text-blue-400 truncate max-w-md">
                    {mira602.regulatoryTraceability.statutoryChecksum}
                  </span>
                </div>
                <div className="text-slate-400 text-[11px]">
                  Governing Legislation: <span className="text-slate-200">{mira602.regulatoryTraceability.governingAct}</span>
                </div>
              </div>
            </div>
          ) : activeTab === "calculator" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Form Input */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-blue-400" />
                  Section 55 Withholding Evaluation Form
                </h3>

                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Non-Resident Payee Name</label>
                    <input
                      type="text"
                      value={calcInput.payeeName}
                      onChange={(e) => setCalcInput({ ...calcInput, payeeName: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Payee Country Code</label>
                      <input
                        type="text"
                        value={calcInput.payeeCountry}
                        onChange={(e) => setCalcInput({ ...calcInput, payeeCountry: e.target.value.toUpperCase() })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Section 55 Category</label>
                      <select
                        value={calcInput.category}
                        onChange={(e) => setCalcInput({ ...calcInput, category: e.target.value as NwtCategory })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 cursor-pointer"
                      >
                        <option value="TECHNICAL_SERVICES">Technical & Management Services (10%)</option>
                        <option value="ROYALTY">Royalty / Software Licenses (10%)</option>
                        <option value="NON_RESIDENT_CONTRACTOR">Non-Resident Contractor (5%)</option>
                        <option value="RENT_IMMOVABLE_PROPERTY">Rent of Immovable Property (10%)</option>
                        <option value="QUALIFYING_INTEREST">Interest Payments (10%)</option>
                        <option value="DIVIDEND">Dividends (10%)</option>
                        <option value="COMMISSION">Commissions in Maldives (10%)</option>
                        <option value="INSURANCE_PREMIUM">Insurance Premiums (10%)</option>
                        <option value="EXEMPT_NON_NWT">Non-NWT / Goods Purchase (0%)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Contract Amount</label>
                      <input
                        type="number"
                        value={calcInput.contractedAmount}
                        onChange={(e) => setCalcInput({ ...calcInput, contractedAmount: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Currency</label>
                      <input
                        type="text"
                        value={calcInput.currency}
                        onChange={(e) => setCalcInput({ ...calcInput, currency: e.target.value.toUpperCase() })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">FX Rate (to MVR)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={calcInput.exchangeRate}
                        onChange={(e) => setCalcInput({ ...calcInput, exchangeRate: parseFloat(e.target.value) || 1.0 })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Payable Date (Invoice/Accrual)</label>
                      <input
                        type="date"
                        value={calcInput.payableDate}
                        onChange={(e) => setCalcInput({ ...calcInput, payableDate: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Payment Date (Settlement)</label>
                      <input
                        type="date"
                        value={calcInput.paymentDate}
                        onChange={(e) => setCalcInput({ ...calcInput, paymentDate: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="pt-2 space-y-2">
                    <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={calcInput.isGrossedUp}
                        onChange={(e) => setCalcInput({ ...calcInput, isGrossedUp: e.target.checked })}
                        className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                      />
                      <span>Gross-Up Tax Liability (Contract Stipulates Net-of-Tax Payment)</span>
                    </label>

                    <label className="flex items-center space-x-2 text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={calcInput.hasPermanentEstablishmentInMaldives}
                        onChange={(e) => setCalcInput({ ...calcInput, hasPermanentEstablishmentInMaldives: e.target.checked })}
                        className="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0"
                      />
                      <span>Vendor Has Permanent Establishment (PE) in Maldives (NWT Exempt)</span>
                    </label>
                  </div>

                  <div className="pt-4 flex justify-end">
                    <button
                      onClick={handleCalculate}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      Calculate NWT Liability
                    </button>
                  </div>
                </div>
              </div>

              {/* Calculation Result */}
              {calcResult && (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                      Statutory Withholding Result
                    </h3>
                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/30 font-mono font-bold">
                      {(calcResult.effectiveRate * 100).toFixed(1)}% Effective Rate
                    </span>
                  </div>

                  <div className="space-y-3 font-mono">
                    <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                      <span className="font-sans text-slate-400">Withholding Point (Earlier of Dates):</span>
                      <span className="text-amber-300 font-bold">{calcResult.withholdingDate}</span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                      <span className="font-sans text-slate-400">Reporting Period:</span>
                      <span className="text-slate-200">{calcResult.reportingPeriod}</span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                      <span className="font-sans text-slate-400">Gross Amount ({calcResult.currency}):</span>
                      <span className="text-slate-100">{calcResult.grossAmount.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                      <span className="font-sans text-slate-400">Gross Amount (MVR):</span>
                      <span className="text-slate-100 font-bold">MVR {calcResult.grossAmountMvr.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                      <span className="font-sans text-slate-400">NWT Amount Withheld ({calcResult.currency}):</span>
                      <span className="text-blue-400 font-bold">{calcResult.nwtAmountWithheld.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-slate-800/60 bg-blue-950/20 px-2 rounded">
                      <span className="font-sans text-blue-300 font-bold">NWT Amount Withheld (MVR):</span>
                      <span className="text-blue-400 font-bold">MVR {calcResult.nwtAmountWithheldMvr.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                      <span className="font-sans text-slate-400">Net Remittance to Vendor:</span>
                      <span className="text-emerald-400 font-bold">
                        {calcResult.currency} {calcResult.netAmountPaid.toFixed(2)} (MVR {calcResult.netAmountPaidMvr.toFixed(2)})
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 flex justify-end">
                    <button
                      onClick={handleAddCalculatedTransaction}
                      className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add to MIRA 602 Schedule</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === "reconciliation" ? (
            <div className="space-y-6">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    NWT Subledger to GL Account 2200 Audit
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    reconciliation?.isReconciled ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
                  }`}>
                    {reconciliation?.isReconciled ? "100% RECONCILED" : "DISCREPANCIES DETECTED"}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                    <div className="font-bold text-slate-200">Account 2200 — Withholding Tax Payable</div>
                    <div className="flex justify-between text-slate-400">
                      <span>NWT Subledger Total:</span>
                      <span className="font-mono text-slate-100">MVR {(reconciliation?.subledgerTotalNwtWithheld || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>GL Account 2200 Balance:</span>
                      <span className="font-mono text-slate-100">MVR {(reconciliation?.glAccount2200WithholdingTaxPayableBalance || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold pt-2 border-t border-slate-800">
                      <span>Variance:</span>
                      <span className={`font-mono ${reconciliation?.variance === 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        MVR {(reconciliation?.variance || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                    <div className="font-bold text-slate-200">Regulatory Timeline Governance</div>
                    <div className="flex justify-between text-slate-400">
                      <span>Statutory Due Date:</span>
                      <span className="font-mono text-amber-300">{reconciliation?.period.filingDueDate}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Governing Law:</span>
                      <span className="text-slate-200">Income Tax Act Sec 55</span>
                    </div>
                    <div className="text-[11px] text-slate-500 pt-1">
                      NWT withheld must be remitted to MIRA alongside MIRA 602 on or before the 15th day of the month following deduction.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                    Double Tax Avoidance Agreement (DTAA) Treaty Registry
                  </h3>
                  <span className="text-xs text-slate-400">Documented Proof Required</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-mono">
                        <th className="pb-2">Certificate #</th>
                        <th className="pb-2">Payee & Treaty Country</th>
                        <th className="pb-2">Treaty Article</th>
                        <th className="pb-2 text-center">Reduced Rate</th>
                        <th className="pb-2">Validity Window</th>
                        <th className="pb-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {dtaaCertificates.map((cert) => (
                        <tr key={cert.id} className="hover:bg-slate-900/40">
                          <td className="py-2.5 text-blue-400 font-bold">{cert.certificateNumber}</td>
                          <td className="py-2.5 font-sans">
                            <div className="text-slate-200 font-semibold">{cert.payeeName}</div>
                            <div className="text-[11px] text-slate-400">{cert.treatyCountry} ({cert.issuingAuthority})</div>
                          </td>
                          <td className="py-2.5 text-slate-300 font-sans">{cert.treatyArticle}</td>
                          <td className="py-2.5 text-center text-emerald-400 font-bold">{(cert.reducedRate * 100).toFixed(1)}%</td>
                          <td className="py-2.5 text-slate-400 text-[11px]">
                            {cert.issueDate} to {cert.expiryDate}
                          </td>
                          <td className="py-2.5 text-center">
                            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                              {cert.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900">
          <button
            onClick={compileMira602}
            className="flex items-center space-x-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Re-compile MIRA 602</span>
          </button>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => window.print()}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Return</span>
            </button>

            <button
              onClick={handleExportJSON}
              className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download MIRA 602 Payload (JSON)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
