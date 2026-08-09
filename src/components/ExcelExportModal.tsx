import React, { useState, useEffect } from "react";
import {
  X,
  FileSpreadsheet,
  Upload,
  Download,
  Check,
  AlertCircle,
  Settings2,
  GripVertical,
  ArrowRight,
  Save,
  Sparkles,
  Table,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal
} from "lucide-react";
import { ExcelTemplateInfo, TemplateColumnMapping, BillRecord } from "../types";

interface ExcelExportModalProps {
  isOpen: boolean;
  selectedQuarter: string;
  authToken?: string;
  selectedOutlet?: string;
  onClose: () => void;
}

const DB_FIELDS: { key: keyof TemplateColumnMapping; label: string; desc: string; sampleValue: string }[] = [
  { key: "supplier_name", label: "Supplier Name", desc: "Name of vendor/seller", sampleValue: "State Trading Organization PLC" },
  { key: "supplier_tin", label: "Supplier TIN", desc: "Vendor GST Identification Number", sampleValue: "1000001GST501" },
  { key: "invoice_number", label: "Invoice Number", desc: "Invoice / Bill reference #", sampleValue: "INV-2026-089" },
  { key: "invoice_date", label: "Invoice Date", desc: "Date in DD MMM YYYY format", sampleValue: "08 AUG 2026" },
  { key: "taxable_value", label: "Subtotal (Excl. GST)", desc: "Taxable amount in MVR", sampleValue: "1,000.00" },
  { key: "gst_amount", label: "GST Amount (8%)", desc: "8% GST tax in MVR", sampleValue: "80.00" },
  { key: "invoice_total", label: "Invoice Total", desc: "Final payable total in MVR", sampleValue: "1,080.00" },
  { key: "quarter", label: "Quarter", desc: "Fiscal period (e.g. 2026-Q3)", sampleValue: "2026-Q3" },
  { key: "notes", label: "Notes", desc: "Remarks / verification status", sampleValue: "Verified" }
];

const DEFAULT_COLUMNS = [
  "Supplier Name",
  "Supplier Tin",
  "Invoice Number",
  "Invoice Date",
  "Subtotal (Excl. GST)",
  "GST Amount (8%)",
  "Invoice Total",
  "Quarter",
  "Notes"
];

export const ExcelExportModal: React.FC<ExcelExportModalProps> = ({
  isOpen,
  selectedQuarter,
  authToken,
  selectedOutlet,
  onClose
}) => {
  const [templateInfo, setTemplateInfo] = useState<ExcelTemplateInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [quarterFilter, setQuarterFilter] = useState(selectedQuarter);
  const [showMapping, setShowMapping] = useState(false);

  const [mapping, setMapping] = useState<TemplateColumnMapping>({
    supplier_name: "Supplier Name",
    supplier_tin: "Supplier Tin",
    invoice_number: "Invoice Number",
    invoice_date: "Invoice Date",
    taxable_value: "Subtotal (Excl. GST)",
    gst_amount: "GST Amount (8%)",
    invoice_total: "Invoice Total",
    quarter: "Quarter",
    notes: "Notes"
  });

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [draggedFieldKey, setDraggedFieldKey] = useState<keyof TemplateColumnMapping | null>(null);
  const [dragOverTargetKey, setDragOverTargetKey] = useState<keyof TemplateColumnMapping | null>(null);

  const [bills, setBills] = useState<BillRecord[]>([]);

  const getAuthHeader = (): Record<string, string> => {
    const token = authToken || localStorage.getItem("cr_auth_token") || localStorage.getItem("crmaldives_token");
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {};
  };

  useEffect(() => {
    if (isOpen) {
      fetchTemplateInfo();
      fetchAllVerifiedBills();
      setQuarterFilter(selectedQuarter);
      setError(null);
      setSuccessMsg(null);
      setHasUnsavedChanges(false);
      setShowMapping(false);
    }
  }, [isOpen, selectedQuarter]);

  const fetchTemplateInfo = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/template/info", {
        headers: getAuthHeader()
      });
      if (res.ok) {
        const data: ExcelTemplateInfo = await res.json();
        setTemplateInfo(data);
        if (data.mapping) {
          setMapping(data.mapping);
        }
      }
    } catch (e) {
      console.error("Error fetching template info", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllVerifiedBills = async () => {
    try {
      const headers: Record<string, string> = {
        ...getAuthHeader()
      };

      const params = new URLSearchParams({ status: "verified" });
      if (selectedOutlet && selectedOutlet !== "ALL") params.append("outletId", selectedOutlet);

      const res = await fetch(`/api/bills?${params.toString()}`, { headers });
      if (res.ok) {
        const data: BillRecord[] = await res.json();
        setBills(data);
      }
    } catch (e) {
      console.error("Error fetching verified bills", e);
    }
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    const formData = new FormData();
    formData.append("templateFile", file);

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/template/upload", {
        method: "POST",
        headers: getAuthHeader(),
        body: formData
      });
      const uploadData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(uploadData.error || "Failed to upload custom Excel template.");
      }
      setSuccessMsg(`Uploaded custom template "${file.name}" successfully!`);

      await fetchTemplateInfo();
      if (uploadData.columns && uploadData.columns.length > 0) {
        autoMapColumns(uploadData.columns);
      }
    } catch (err: any) {
      setError(err.message || "Failed to upload template.");
    } finally {
      setLoading(false);
    }
  };

  const handleMappingChange = (key: keyof TemplateColumnMapping, columnValue: string) => {
    setMapping(prev => ({
      ...prev,
      [key]: columnValue
    }));
    setHasUnsavedChanges(true);
  };

  const autoMapColumns = (colsToUse?: string[]) => {
    const availableCols = colsToUse || templateInfo?.availableColumns || DEFAULT_COLUMNS;
    if (!availableCols || availableCols.length === 0) return;

    const newMapping: TemplateColumnMapping = { ...mapping };

    DB_FIELDS.forEach(field => {
      const fieldKey = field.key;
      const fieldLabel = field.label.toLowerCase();

      const matched = availableCols.find(col => {
        const cLower = col.trim().toLowerCase();
        if (cLower === fieldLabel) return true;

        if (fieldKey === "supplier_name") {
          return cLower === "supplier" || cLower === "vendor" || cLower.includes("supplier name") || cLower.includes("vendor name") || cLower === "supplier name/tin";
        }
        if (fieldKey === "supplier_tin") {
          return cLower.includes("tin") || cLower.includes("gstin") || cLower.includes("gstd");
        }
        if (fieldKey === "invoice_number") {
          return (cLower.includes("invoice") && (cLower.includes("number") || cLower.includes("#") || cLower.includes("no"))) || cLower === "inv #" || cLower === "bill no" || cLower === "invoice no";
        }
        if (fieldKey === "invoice_date") {
          return cLower.includes("date");
        }
        if (fieldKey === "taxable_value") {
          return cLower.includes("subtotal") || cLower.includes("taxable") || cLower.includes("excl");
        }
        if (fieldKey === "gst_amount") {
          if (/gst.*(6|12|16|17)%?/i.test(col)) return false;
          return cLower.includes("8%") || cLower.includes("gst amount") || cLower.includes("gst charged at 8%") || cLower === "gst" || cLower === "gst paid" || cLower === "gst (mvr)";
        }
        if (fieldKey === "invoice_total") {
          return cLower.includes("invoice total") || cLower.includes("total amount") || cLower.includes("grand total") || cLower === "total (mvr)";
        }
        if (fieldKey === "quarter") {
          return cLower.includes("quarter") || cLower.includes("period");
        }
        if (fieldKey === "notes") {
          return cLower.includes("notes") || cLower.includes("remark");
        }
        return false;
      });

      if (matched) {
        newMapping[fieldKey] = matched;
      }
    });

    setMapping(newMapping);
    setHasUnsavedChanges(true);
    setSuccessMsg("Auto-mapped database fields based on column headers.");
  };

  const handleSaveMapping = async () => {
    setSavingMapping(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader()
        },
        body: JSON.stringify({ templateMapping: mapping })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save mapping.");
      }
      setHasUnsavedChanges(false);
      setSuccessMsg("Field mapping saved successfully!");
    } catch (err: any) {
      setError(err.message || "Failed to save mapping.");
    } finally {
      setSavingMapping(false);
    }
  };

  const handleDownloadExcel = async () => {
    setExporting(true);
    setError(null);

    if (hasUnsavedChanges) {
      await handleSaveMapping();
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...getAuthHeader()
      };

      const res = await fetch("/api/export/excel", {
        method: "POST",
        headers,
        body: JSON.stringify({
          quarter: quarterFilter === "ALL" ? undefined : quarterFilter,
          outletId: selectedOutlet === "ALL" ? undefined : selectedOutlet,
          status: "verified"
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to generate Excel file.");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `CR_Maldives_GST_Purchases_${quarterFilter || "All"}_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setSuccessMsg("Excel return exported and downloaded successfully!");
    } catch (err: any) {
      setError(err.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, fieldKey: keyof TemplateColumnMapping) => {
    setDraggedFieldKey(fieldKey);
    e.dataTransfer.setData("text/plain", fieldKey);
  };

  const handleDragOver = (e: React.DragEvent, targetKey: keyof TemplateColumnMapping) => {
    e.preventDefault();
    setDragOverTargetKey(targetKey);
  };

  const handleDragLeave = () => {
    setDragOverTargetKey(null);
  };

  const handleDrop = (e: React.DragEvent, targetKey: keyof TemplateColumnMapping) => {
    e.preventDefault();
    setDragOverTargetKey(null);
    const sourceKey = e.dataTransfer.getData("text/plain") as keyof TemplateColumnMapping;
    if (sourceKey && sourceKey in mapping) {
      const sourceCol = mapping[sourceKey];
      const targetCol = mapping[targetKey];
      setMapping(prev => ({
        ...prev,
        [sourceKey]: targetCol,
        [targetKey]: sourceCol
      }));
      setHasUnsavedChanges(true);
    }
  };

  if (!isOpen) return null;

  const availableColumns = (templateInfo?.availableColumns && templateInfo.availableColumns.length > 0)
    ? templateInfo.availableColumns
    : DEFAULT_COLUMNS;

  // Filter bills by selected quarter
  const filteredBills = bills.filter((b) => {
    if (quarterFilter === "ALL") return true;
    return b.quarter === quarterFilter;
  });

  // Calculate totals across filtered bills
  const totalTaxable = filteredBills.reduce((sum, b) => {
    const data = b.verifiedData || b.extractedData;
    return sum + (data.totals.taxable_value || 0);
  }, 0);

  const totalGst = filteredBills.reduce((sum, b) => {
    const data = b.verifiedData || b.extractedData;
    return sum + (data.totals.gst_amount || 0);
  }, 0);

  const totalInvoice = filteredBills.reduce((sum, b) => {
    const data = b.verifiedData || b.extractedData;
    return sum + (data.totals.invoice_total || 0);
  }, 0);

  const getBillFieldValue = (bill: BillRecord, fieldKey: keyof TemplateColumnMapping): string => {
    const data = bill.verifiedData || bill.extractedData;
    switch (fieldKey) {
      case "supplier_name": return data.supplier.name || "N/A";
      case "supplier_tin": return data.supplier.gstin || "N/A";
      case "invoice_number": return data.invoice.number || "N/A";
      case "invoice_date": return data.invoice.date || "N/A";
      case "taxable_value": return data.totals.taxable_value !== undefined ? data.totals.taxable_value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
      case "gst_amount": return data.totals.gst_amount !== undefined ? data.totals.gst_amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
      case "invoice_total": return data.totals.invoice_total !== undefined ? data.totals.invoice_total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
      case "quarter": return bill.quarter || "2026-Q3";
      case "notes": return data.notes || "Verified";
      default: return "-";
    }
  };

  const isNumericField = (fieldKey: keyof TemplateColumnMapping | undefined) => {
    return fieldKey === "taxable_value" || fieldKey === "gst_amount" || fieldKey === "invoice_total";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-5xl w-full text-slate-100 my-auto overflow-hidden flex flex-col max-h-[92vh]">

        {/* Accent Line */}
        <div className="h-1 shrink-0 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white tracking-tight">Export GST Purchases to Excel</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full whitespace-nowrap">
                  {filteredBills.length} Bill{filteredBills.length === 1 ? "" : "s"} Ready
                </span>
              </div>
              <p className="text-xs text-slate-400">Generate verified purchase tax return file for MIRA filing</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Container */}
        <div className="p-5 sm:p-6 space-y-5 text-xs overflow-y-auto flex-1 bg-slate-900">

          {error && (
            <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 flex items-center gap-3 animate-fadeIn shadow-sm">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-300 flex items-center justify-between gap-3 animate-fadeIn shadow-sm">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-medium">{successMsg}</span>
              </div>
              <button
                onClick={() => setSuccessMsg(null)}
                className="text-emerald-400/80 hover:text-emerald-200 text-[11px] font-bold cursor-pointer shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Summary KPI Bar */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Verified Bills</p>
              <p className="text-lg font-black text-white font-mono mt-1 leading-none">{filteredBills.length}</p>
            </div>
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Subtotal (Excl. GST)</p>
              <p className="text-lg font-black text-white font-mono mt-1 leading-none">
                {totalTaxable.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-[10px] text-slate-400 font-bold ml-1">MVR</span>
              </p>
            </div>
            <div className="bg-slate-950 p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">GST Amount (8%)</p>
              <p className="text-lg font-black text-amber-400 font-mono mt-1 leading-none">
                {totalGst.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-[10px] text-amber-500/70 font-bold ml-1">MVR</span>
              </p>
            </div>
            <div className="bg-slate-950 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">Invoice Total</p>
              <p className="text-lg font-black text-emerald-400 font-mono mt-1 leading-none">
                {totalInvoice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-[10px] text-emerald-500/70 font-bold ml-1">MVR</span>
              </p>
            </div>
          </div>

          {/* Controls Bar */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Export Quarter Filter */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 shadow-sm">
              <div className="flex items-center justify-between">
                <label className="text-slate-200 font-bold">Export Quarter Filter</label>
                <span className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                  Verified Only
                </span>
              </div>
              <select
                value={quarterFilter}
                onChange={(e) => setQuarterFilter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-semibold focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 transition-all cursor-pointer"
              >
                <option value="ALL">All Quarters (All Verified Bills)</option>
                <option value="2026-Q3">2026-Q3 (Jul - Sep 2026)</option>
                <option value="2026-Q2">2026-Q2 (Apr - Jun 2026)</option>
                <option value="2026-Q1">2026-Q1 (Jan - Mar 2026)</option>
                <option value="2025-Q4">2025-Q4 (Oct - Dec 2025)</option>
              </select>
            </div>

            {/* Layout Template Selector & Options Toggle */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col justify-between gap-2 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-200 font-bold">
                  <Settings2 className="w-4 h-4 text-emerald-400" />
                  <span>Excel Layout Template</span>
                </div>
                {templateInfo?.hasCustomTemplate ? (
                  <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded-full text-[10px] font-bold flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Custom Layout</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded-full text-[10px] font-semibold">
                    Standard Layout
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 text-slate-200 border border-slate-800 hover:border-emerald-500/50 rounded-lg cursor-pointer font-bold text-xs transition-all shadow-sm">
                  <Upload className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{templateInfo?.hasCustomTemplate ? "Replace .xlsx" : "Upload Custom .xlsx"}</span>
                  <input type="file" accept=".xlsx" className="hidden" onChange={handleTemplateUpload} />
                </label>

                <button
                  type="button"
                  onClick={() => setShowMapping(!showMapping)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
                    showMapping
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      : "bg-slate-900 hover:bg-slate-850 text-slate-300 border-slate-800"
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{showMapping ? "Hide Field Mapping" : "Customize Mapping"}</span>
                  {showMapping ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Collapsible Database Field Mapping Section */}
          {showMapping && (
            <div className="bg-slate-950 rounded-2xl border border-emerald-500/30 shadow-xl overflow-hidden animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-800 bg-slate-900/60">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <h3 className="font-bold text-white text-sm">Configure Field to Column Mapping</h3>
                  </div>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Match tax fields to your Excel header columns. Drag cards to swap field positions.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => autoMapColumns()}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-800 hover:border-amber-500/40 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                    title="Auto-match columns based on header keywords"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Auto Match</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveMapping}
                    disabled={savingMapping || !hasUnsavedChanges}
                    className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-emerald-300 border border-slate-800 hover:border-emerald-500/40 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingMapping ? "Saving..." : hasUnsavedChanges ? "Save Mapping *" : "Saved"}</span>
                  </button>
                </div>
              </div>

              {/* Mapping Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-5">
                {DB_FIELDS.map((field) => {
                  const currentMappedCol = mapping[field.key] || "";
                  const isOver = dragOverTargetKey === field.key;

                  return (
                    <div
                      key={field.key}
                      onDragOver={(e) => handleDragOver(e, field.key)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, field.key)}
                      className={`p-3 rounded-xl border transition-all ${
                        isOver
                          ? "bg-emerald-500/10 border-emerald-400 ring-2 ring-emerald-500/20"
                          : "bg-slate-900 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5 gap-2">
                        <div
                          draggable
                          onDragStart={(e) => handleDragStart(e, field.key)}
                          className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1 rounded-lg cursor-grab active:cursor-grabbing border border-slate-700/80 shadow-sm group transition-colors hover:border-emerald-500/50"
                          title="Drag card to swap column mapping"
                        >
                          <GripVertical className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-400" />
                          <span className="font-bold text-slate-200 whitespace-nowrap">{field.label}</span>
                        </div>

                        <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />

                        <div className="flex-1 max-w-[200px]">
                          <select
                            value={currentMappedCol}
                            onChange={(e) => handleMappingChange(field.key, e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 rounded-lg px-2.5 py-1 text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer"
                          >
                            <option value="">-- Unmapped --</option>
                            {availableColumns.map((col) => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1">
                        <span className="truncate">{field.desc}</span>
                        <span className="text-slate-400 font-mono text-[10px] shrink-0 ml-2 font-medium">
                          Sample: {field.sampleValue}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Export Layout Live Preview Section */}
          <div className="bg-slate-950 rounded-2xl border border-slate-800 shadow-sm overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 sm:px-5 py-3.5 border-b border-slate-800">
              <div className="flex items-center gap-2 text-slate-200 font-bold">
                <Table className="w-4 h-4 text-emerald-400" />
                <span className="text-sm">Export Layout Live Preview</span>
              </div>
              <div className="flex items-center gap-3 text-xs font-medium text-slate-400">
                <span className="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg font-mono text-emerald-400 font-bold">
                  {filteredBills.length} Bill{filteredBills.length === 1 ? "" : "s"}
                </span>
                <span>
                  Total GST: <strong className="text-amber-300 font-mono">MVR {totalGst.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </span>
              </div>
            </div>

            {/* Scrollable Data Table */}
            <div className="overflow-x-auto max-h-[340px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-900 shadow-sm">
                  <tr className="border-b border-slate-800 text-slate-300 font-bold">
                    <th className="p-2.5 w-10 text-center font-mono text-[10px] text-slate-500 border-r border-slate-800">#</th>
                    {availableColumns.map((col, idx) => {
                      const mappedEntry = DB_FIELDS.find(f => mapping[f.key] === col);
                      const isNumeric = isNumericField(mappedEntry?.key);

                      return (
                        <th
                          key={idx}
                          className={`p-2.5 min-w-[130px] font-bold border-r border-slate-800 last:border-r-0 ${
                            isNumeric ? "text-right" : "text-left"
                          }`}
                        >
                          <div className="text-emerald-400 font-bold truncate">{col}</div>
                          <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                            {mappedEntry ? (
                              <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded font-semibold">
                                ← {mappedEntry.label}
                              </span>
                            ) : (
                              <span className="text-slate-500 italic">(Unmapped)</span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {filteredBills.length === 0 ? (
                    <tr>
                      <td colSpan={availableColumns.length + 1} className="p-8 text-center text-slate-500">
                        <p className="font-semibold text-slate-300">No verified bills found for {quarterFilter === "ALL" ? "any quarter" : quarterFilter}.</p>
                        <p className="text-[11px] text-slate-500 mt-1">Verify uploaded purchase receipts in the dashboard to include them in the export preview.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredBills.map((bill, index) => (
                      <tr key={bill.id || index} className="hover:bg-slate-900/80 transition-colors">
                        <td className="p-2.5 text-center font-mono text-[10px] text-slate-500 border-r border-slate-800/40">
                          {index + 1}
                        </td>
                        {availableColumns.map((col, idx) => {
                          const mappedEntry = DB_FIELDS.find(f => mapping[f.key] === col);
                          const val = mappedEntry ? getBillFieldValue(bill, mappedEntry.key) : "";
                          const isNumeric = isNumericField(mappedEntry?.key);

                          return (
                            <td
                              key={idx}
                              className={`p-2.5 font-mono text-xs border-r border-slate-800/40 last:border-r-0 truncate max-w-[200px] ${
                                isNumeric ? "text-right font-semibold text-slate-100" : "text-slate-300"
                              } ${mappedEntry?.key === "gst_amount" ? "text-amber-300 font-bold" : ""} ${
                                mappedEntry?.key === "invoice_total" ? "text-emerald-300 font-black" : ""
                              }`}
                            >
                              {val || <span className="text-slate-600 italic">-</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
                {/* Summary Totals Footer Row */}
                {filteredBills.length > 0 && (
                  <tfoot className="sticky bottom-0 bg-slate-900 border-t border-slate-800 shadow-inner font-bold">
                    <tr className="text-slate-200">
                      <td className="p-2.5 text-center font-mono text-[10px] text-slate-500 border-r border-slate-800">
                        ∑
                      </td>
                      {availableColumns.map((col, idx) => {
                        const mappedEntry = DB_FIELDS.find(f => mapping[f.key] === col);
                        const isNumeric = isNumericField(mappedEntry?.key);

                        let sumVal = "";
                        if (mappedEntry?.key === "taxable_value") {
                          sumVal = totalTaxable.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        } else if (mappedEntry?.key === "gst_amount") {
                          sumVal = totalGst.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        } else if (mappedEntry?.key === "invoice_total") {
                          sumVal = totalInvoice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        } else if (idx === 0) {
                          sumVal = `TOTAL (${filteredBills.length} Bills)`;
                        }

                        return (
                          <td
                            key={idx}
                            className={`p-2.5 font-mono text-xs border-r border-slate-800 last:border-r-0 truncate ${
                              isNumeric ? "text-right font-black" : "font-bold text-slate-400"
                            } ${mappedEntry?.key === "gst_amount" ? "text-amber-300" : ""} ${
                              mappedEntry?.key === "invoice_total" ? "text-emerald-400" : ""
                            }`}
                          >
                            {sumVal}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800/80 bg-slate-900 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-bold rounded-lg border border-slate-700/80 transition-colors cursor-pointer shadow-sm"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3">
            {hasUnsavedChanges && (
              <span className="text-xs text-amber-400 font-bold hidden sm:inline">
                Unsaved changes will save automatically on export
              </span>
            )}

            <button
              onClick={handleDownloadExcel}
              disabled={exporting}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-lg shadow-emerald-950/50 flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
            >
              {exporting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Generating Excel File...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download Excel File ({filteredBills.length} Bills)</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
