import React, { useState, useEffect } from "react";
import {
  X,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Plus,
  Trash2,
  Save,
  ArrowRight,
  Calculator,
  Building2,
  Receipt,
  DollarSign,
  Info,
  ChevronLeft,
  ChevronRight,
  FileText,
  History
} from "lucide-react";
import { BillRecord, ExtractedBillData, InvoiceLineItem } from "../types";

interface BillReviewModalProps {
  isOpen: boolean;
  bill: BillRecord | null;
  pendingBills: BillRecord[];
  onClose: () => void;
  onSave: (updatedBill: BillRecord, status: "verified" | "pending_review" | "rejected") => void;
  onDelete: (id: string) => void;
  onSelectNextBill?: (nextBill: BillRecord) => void;
}

export const BillReviewModal: React.FC<BillReviewModalProps> = ({
  isOpen,
  bill,
  pendingBills,
  onClose,
  onSave,
  onDelete,
  onSelectNextBill
}) => {
  // Local state for editable verified data
  const [formData, setFormData] = useState<ExtractedBillData | null>(
    bill ? JSON.parse(JSON.stringify(bill.verifiedData || bill.extractedData)) : null
  );

  // Re-extract state
  const [reExtracting, setReExtracting] = useState(false);
  const [reExtractError, setReExtractError] = useState<string | null>(null);

  // Document preview transform states
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (bill) {
      setFormData(JSON.parse(JSON.stringify(bill.verifiedData || bill.extractedData)));
      setZoom(1);
      setRotation(0);
      setReExtractError(null);
    } else {
      setFormData(null);
    }
  }, [bill]);

  if (!isOpen || !bill || !formData) return null;

  const handleReExtract = async () => {
    setReExtracting(true);
    setReExtractError(null);
    try {
      const token = localStorage.getItem("cr_auth_token") || localStorage.getItem("crmaldives_token");
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/bills/${bill.id}/re-extract`, {
        method: "POST",
        headers
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Re-extraction failed.");
      }

      const updatedBill: BillRecord = data;
      setFormData(JSON.parse(JSON.stringify(updatedBill.verifiedData || updatedBill.extractedData)));
      onSave(updatedBill, updatedBill.status);
    } catch (err: any) {
      console.error("Re-extract error:", err);
      setReExtractError(err.message || "Failed to re-extract bill.");
    } finally {
      setReExtracting(false);
    }
  };

  // Recalculate Totals Helper
  const handleRecalculateTotals = () => {
    let subtotal = 0;
    let totalGst = 0;

    formData.items.forEach((item) => {
      const qty = item.quantity ?? 1;
      const rate = item.rate ?? 0;
      const itemTaxable = item.taxable_value ?? (qty * rate);
      const gstRate = (item.gst_rate ?? 8) / 100;
      const itemGst = item.gst_amount ?? (itemTaxable * gstRate);

      subtotal += itemTaxable;
      totalGst += itemGst;
    });

    const roundOff = formData.totals.round_off ?? 0;
    const invoiceTotal = subtotal + totalGst + roundOff;

    setFormData((prev) => ({
      ...prev,
      totals: {
        ...prev.totals,
        taxable_value: Math.round(subtotal * 100) / 100,
        gst_amount: Math.round(totalGst * 100) / 100,
        invoice_total: Math.round(invoiceTotal * 100) / 100
      }
    }));
  };

  // Line Items Handlers
  const handleItemChange = (index: number, field: keyof InvoiceLineItem, value: any) => {
    setFormData((prev) => {
      const newItems = [...prev.items];
      const item = { ...newItems[index], [field]: value };

      // Auto update row taxable and total
      if (field === "quantity" || field === "rate" || field === "gst_rate") {
        const q = item.quantity ?? 1;
        const r = item.rate ?? 0;
        item.taxable_value = Math.round(q * r * 100) / 100;
        const gRate = (item.gst_rate ?? 8) / 100;
        item.gst_amount = Math.round((item.taxable_value * gRate) * 100) / 100;
        item.total = Math.round((item.taxable_value + item.gst_amount) * 100) / 100;
      }

      newItems[index] = item;
      return { ...prev, items: newItems };
    });
  };

  const handleAddItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: `item-${Date.now()}`,
          description: "",
          quantity: 1,
          unit: "Pcs",
          rate: 0,
          discount: 0,
          taxable_value: 0,
          gst_rate: 8,
          gst_amount: 0,
          total: 0
        }
      ]
    }));
  };

  const handleRemoveItem = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  // Actions
  const handleSaveVerified = () => {
    const updatedRecord: BillRecord = {
      ...bill,
      verifiedData: formData,
      status: "verified"
    };
    onSave(updatedRecord, "verified");
  };

  const handleSaveAndNext = () => {
    handleSaveVerified();
    // Find next pending bill
    const nextBill = pendingBills.find((b) => b.id !== bill.id && b.status === "pending_review");
    if (nextBill && onSelectNextBill) {
      onSelectNextBill(nextBill);
    } else {
      onClose();
    }
  };

  const handleReject = () => {
    const updatedRecord: BillRecord = {
      ...bill,
      verifiedData: formData,
      status: "rejected"
    };
    onSave(updatedRecord, "rejected");
    onClose();
  };

  const isPdf = bill.fileType.toLowerCase().includes("pdf") || bill.fileName.toLowerCase().endsWith(".pdf");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4">
      <div className="bg-slate-900/95 border border-slate-800/90 rounded-2xl shadow-2xl w-full max-w-7xl h-[94vh] flex flex-col text-slate-100 overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-800/80 bg-slate-950/80">
          <div className="flex items-center space-x-3">
            <span className="p-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl font-mono text-xs font-black tracking-wider">
              REVIEW
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <span>{bill.fileName}</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 font-normal">
                  Uploaded {new Date(bill.uploadDate).toLocaleDateString()}
                </span>
              </h2>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Re-extract Button */}
            <button
              type="button"
              onClick={handleReExtract}
              disabled={reExtracting}
              className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              title="Re-run Gemini AI extraction on this bill"
            >
              <RotateCw className={`w-3.5 h-3.5 ${reExtracting ? "animate-spin" : ""}`} />
              <span>{reExtracting ? "Extracting..." : "Retry AI Extraction"}</span>
            </button>

            {/* Confidence Badge */}
            <div className="flex items-center space-x-2 text-xs bg-slate-950/80 px-3.5 py-1.5 rounded-xl border border-slate-800">
              <span className="text-slate-400 font-medium">Confidence:</span>
              <span
                className={`font-black font-mono px-2 py-0.5 rounded-full text-[11px] border ${
                  bill.confidence.overall >= 85
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : bill.confidence.overall >= 70
                    ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                    : "bg-rose-500/15 text-rose-300 border-rose-500/30"
                }`}
              >
                {bill.confidence.overall}%
              </span>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-100 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

            {reExtractError && (
              <div className="bg-rose-950/60 border-b border-rose-800/80 px-6 py-2.5 text-xs text-rose-200 flex items-center justify-between">
                <span>{reExtractError}</span>
                <button onClick={() => setReExtractError(null)} className="text-rose-400 hover:text-rose-100 text-xs font-bold">Dismiss</button>
              </div>
            )}

            {/* Validation Banners / Review Reason */}
            {(bill.needs_review || bill.validation.issues.length > 0 || bill.review_reason) && (
              <div className="bg-amber-950/50 border-b border-amber-800/60 px-6 py-3 flex items-center justify-between text-xs text-amber-200">
                <div className="flex items-center space-x-3 overflow-x-auto">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <div className="space-y-0.5">
                    <span className="font-bold text-amber-300 block">Needs Review: {bill.review_reason || "Please verify extracted numbers before approving."}</span>
                    {bill.validation.issues.length > 0 && (
                      <div className="flex flex-wrap gap-2 text-[11px] text-amber-200/80">
                        {bill.validation.issues.map((issue, idx) => (
                          <span key={idx} className="bg-amber-900/40 px-2 py-0.5 rounded border border-amber-700/50">
                            • {issue.message}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {bill.ocr_attempts > 1 && (
                  <span className="text-[10px] font-mono px-2.5 py-1 bg-slate-900/80 text-emerald-400 border border-slate-700 rounded-lg shrink-0 ml-3">
                    OCR Attempt #{bill.ocr_attempts}
                  </span>
                )}
              </div>
            )}

        {/* Split View Container */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          {/* LEFT SIDE: Original Document Preview */}
          <div className="lg:col-span-5 bg-slate-950 border-r border-slate-800 flex flex-col relative overflow-hidden">
            {/* Document Controls */}
            <div className="p-2.5 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between text-xs text-slate-400">
              <span className="font-bold text-slate-300 px-2 uppercase tracking-wider text-[11px]">Invoice Document</span>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-mono w-10 text-center">{Math.round(zoom * 100)}%</span>
                <button
                  onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-300 transition-colors cursor-pointer"
                  title="Rotate"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Document Canvas / Iframe */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-slate-950/80">
              {isPdf ? (
                <iframe
                  src={bill.fileUrl}
                  className="w-full h-full border-0 rounded-xl min-h-[400px]"
                  title="PDF Bill Preview"
                />
              ) : (
                <img
                  src={bill.fileUrl}
                  alt="Invoice Bill"
                  style={{
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                    transition: "transform 0.2s ease-in-out"
                  }}
                  className="max-w-full max-h-full object-contain rounded-xl shadow-xl border border-slate-800"
                />
              )}
            </div>
          </div>

          {/* RIGHT SIDE: Extracted & Editable Fields */}
          <div className="lg:col-span-7 bg-slate-900/60 overflow-y-auto p-6 space-y-6">
            {/* 0. Document Classification & Tax Status */}
            <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                  <FileText className="w-4 h-4" />
                  <span>Document & Tax Classification</span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800">
                  {formData.document_type || "TAX_INVOICE"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Document Type</label>
                  <select
                    value={formData.document_type || "TAX_INVOICE"}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        document_type: e.target.value as any
                      }))
                    }
                    className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-semibold focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
                  >
                    <option value="TAX_INVOICE">Tax Invoice (GST Formal)</option>
                    <option value="INVOICE">Invoice (No Tax Breakdown)</option>
                    <option value="RECEIPT">Store / POS Receipt</option>
                    <option value="HANDWRITTEN_PURCHASE">Handwritten Purchase Slip</option>
                    <option value="CASH_PURCHASE">Cash Purchase Voucher</option>
                    <option value="OTHER">Other / Misc Document</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Tax Status</label>
                  <select
                    value={formData.tax_status || "TAX_CHARGED"}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        tax_status: e.target.value as any,
                        totals: e.target.value === "NO_TAX" ? { ...p.totals, gst_amount: 0 } : p.totals
                      }))
                    }
                    className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-semibold focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
                  >
                    <option value="TAX_CHARGED">Tax Charged (Separate Line)</option>
                    <option value="TAX_INCLUDED">Tax Included in Prices</option>
                    <option value="NO_TAX">No Tax / Tax Exempt</option>
                    <option value="UNKNOWN">Unknown / Unclear</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Expense Category</label>
                  <select
                    value={formData.expense_category || "Other"}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        expense_category: e.target.value as any
                      }))
                    }
                    className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-semibold focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
                  >
                    <option value="Food Ingredients">Food Ingredients</option>
                    <option value="Beverages">Beverages</option>
                    <option value="Cleaning Supplies">Cleaning Supplies</option>
                    <option value="Packaging">Packaging & Consumables</option>
                    <option value="Stationery">Stationery & Office</option>
                    <option value="Maintenance">Maintenance & Operations</option>
                    <option value="Equipment">Equipment & Assets</option>
                    <option value="Repairs">Repairs & Servicing</option>
                    <option value="Transportation">Transportation & Freight</option>
                    <option value="Utilities">Utilities & Rent</option>
                    <option value="Other">Other Expenses</option>
                  </select>
                </div>
              </div>

              {/* MIRA Schedule 1 & Income Tax Classification */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-800/60">
                <div>
                  <label className="block text-emerald-400 mb-1 font-semibold flex items-center justify-between">
                    <span>MIRA Schedule 1 Tax Line</span>
                    <span className="text-[10px] font-mono text-slate-400">Income Tax Form 604</span>
                  </label>
                  <select
                    value={formData.mira_schedule1_category || "Other Expenses"}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        mira_schedule1_category: e.target.value as any
                      }))
                    }
                    className="w-full bg-slate-900/90 border border-emerald-500/40 rounded-xl px-3 py-2 text-slate-100 font-semibold focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
                  >
                    <option value="Cost of Sales">Cost of Sales (Direct Purchases / Ingredients)</option>
                    <option value="Insurance Premium">Insurance Premium</option>
                    <option value="Professional & Consulting Fees">Professional & Consulting Fees</option>
                    <option value="Rental, Lease & License">Rental, Lease & License Payments</option>
                    <option value="Repairs & Maintenance">Repairs & Maintenance</option>
                    <option value="Related Party Expenses">Related Party Expenses</option>
                    <option value="Salaries & Wages">Salaries & Wages</option>
                    <option value="Sales & Marketing">Sales & Marketing</option>
                    <option value="Other Expenses">Other Operating Expenses</option>
                    <option value="Capital Asset (Schedule 2)">Capital Asset (Schedule 2 Capital Allowance)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-emerald-400 mb-1 font-semibold flex items-center justify-between">
                    <span>Tax Deductibility</span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {(formData.deductible_percentage ?? 100) === 100 ? "100% Tax Deductible" : "Non-Deductible"}
                    </span>
                  </label>
                  <select
                    value={formData.income_tax_treatment || "DEDUCTIBLE_EXPENSE"}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        income_tax_treatment: e.target.value as any,
                        deductible_percentage: e.target.value === "NON_DEDUCTIBLE" || e.target.value === "EXCLUDED" ? 0 : 100
                      }))
                    }
                    className="w-full bg-slate-900/90 border border-emerald-500/40 rounded-xl px-3 py-2 text-slate-100 font-semibold focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
                  >
                    <option value="DEDUCTIBLE_EXPENSE">Deductible Business Expense (100% Deductible)</option>
                    <option value="CAPITAL_ALLOWANCE">Capital Asset (Subject to Capital Allowance)</option>
                    <option value="NON_DEDUCTIBLE">Non-Deductible (Fines, Income Tax, Personal)</option>
                    <option value="EXCLUDED">Excluded / Non-Operating</option>
                  </select>
                </div>
              </div>

              {/* Visual Tax Routing Badges */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60 text-[11px] font-mono">
                <span className="text-slate-400 font-sans font-semibold">MIRA Tax Destination:</span>
                {(formData.totals?.gst_amount || 0) > 0 || formData.tax_status === "TAX_CHARGED" || formData.tax_status === "TAX_INCLUDED" ? (
                  <span className="px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold flex items-center space-x-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>MIRA 205 GST Claim</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-slate-400">
                    Non-GST
                  </span>
                )}

                {formData.income_tax_treatment === "CAPITAL_ALLOWANCE" || formData.document_type === "CAPITAL_EXPENDITURE" || formData.mira_schedule1_category === "Capital Asset (Schedule 2)" ? (
                  <span className="px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold flex items-center space-x-1">
                    <Building2 className="w-3 h-3 text-amber-400" />
                    <span>Fixed Asset Register (Schedule 2)</span>
                  </span>
                ) : formData.income_tax_treatment === "NON_DEDUCTIBLE" ? (
                  <span className="px-2.5 py-1 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300 font-bold flex items-center space-x-1">
                    <AlertTriangle className="w-3 h-3 text-rose-400" />
                    <span>Tax Add-Back (Non-Deductible)</span>
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold flex items-center space-x-1">
                    <FileText className="w-3 h-3 text-emerald-400" />
                    <span>Schedule 1 ({formData.mira_schedule1_category || "Other Expenses"})</span>
                  </span>
                )}
              </div>
            </div>

            {/* 1. Supplier Information */}
            <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                  <Building2 className="w-4 h-4" />
                  <span>Supplier Details</span>
                </div>
                {bill.confidence.supplier_tin < 80 && (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 bg-amber-500/15 text-amber-300 rounded-full border border-amber-500/30">
                    Verify TIN
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Supplier Name</label>
                  <input
                    type="text"
                    value={formData.supplier.name || ""}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        supplier: { ...p.supplier, name: e.target.value }
                      }))
                    }
                    placeholder="Supplier / Business Name"
                    className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-medium focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Supplier TIN</label>
                  <input
                    type="text"
                    value={formData.supplier.gstin || ""}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        supplier: { ...p.supplier, gstin: e.target.value.toUpperCase() }
                      }))
                    }
                    placeholder="e.g. 1133533GST501"
                    className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono font-bold uppercase focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* 2. Invoice Information */}
            <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                  <Receipt className="w-4 h-4" />
                  <span>Invoice Information</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Invoice Number</label>
                  <input
                    type="text"
                    value={formData.invoice.number || ""}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        invoice: { ...p.invoice, number: e.target.value }
                      }))
                    }
                    placeholder="Invoice #"
                    className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono font-bold focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Invoice Date (DD MMM YYYY)</label>
                  <input
                    type="text"
                    value={formData.invoice.date || ""}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        invoice: { ...p.invoice, date: e.target.value }
                      }))
                    }
                    placeholder="e.g. 08 AUG 2026"
                    className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Tax Type</label>
                  <select
                    value={formData.invoice.gst_type || "GST 8%"}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        invoice: { ...p.invoice, gst_type: e.target.value }
                      }))
                    }
                    className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-semibold focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
                  >
                    <option value="GST 8%">GST 8% (General)</option>
                    <option value="TGST 16%">TGST 16% (Tourism)</option>
                    <option value="Zero-Rated">Zero-Rated (0%)</option>
                    <option value="Exempt">Exempt</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 3. Line Items Table */}
            <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <span className="text-emerald-400 font-bold text-xs uppercase tracking-wider">
                  Line Items ({formData.items.length})
                </span>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800 rounded-lg text-xs font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Line Item</span>
                </button>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-800/80">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/90 text-slate-400 text-[11px] font-bold uppercase tracking-wider border-b border-slate-800">
                    <tr>
                      <th className="p-2.5 min-w-[160px]">Description</th>
                      <th className="p-2.5 w-16 text-right">Qty</th>
                      <th className="p-2.5 w-24 text-right">Rate</th>
                      <th className="p-2.5 w-28 text-right">Taxable</th>
                      <th className="p-2.5 w-24 text-right">GST (8%)</th>
                      <th className="p-2.5 w-28 text-right">Total</th>
                      <th className="p-2.5 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {formData.items.map((item, idx) => (
                      <tr key={item.id || idx} className="hover:bg-slate-800/40 transition-colors">
                        <td className="p-2">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => handleItemChange(idx, "description", e.target.value)}
                            placeholder="Item description"
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-100 text-xs focus:border-emerald-500/80 focus:outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            value={item.quantity ?? ""}
                            onChange={(e) => handleItemChange(idx, "quantity", parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-100 text-xs text-right font-mono focus:border-emerald-500/80 focus:outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.rate ?? ""}
                            onChange={(e) => handleItemChange(idx, "rate", parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-100 text-xs text-right font-mono focus:border-emerald-500/80 focus:outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.taxable_value ?? ""}
                            onChange={(e) => handleItemChange(idx, "taxable_value", parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-100 text-xs text-right font-mono focus:border-emerald-500/80 focus:outline-none font-semibold"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.gst_amount ?? ""}
                            onChange={(e) => handleItemChange(idx, "gst_amount", parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-right font-mono text-amber-300 font-semibold focus:border-emerald-500/80 focus:outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            value={item.total ?? ""}
                            onChange={(e) => handleItemChange(idx, "total", parseFloat(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-right font-mono font-black text-emerald-400 focus:border-emerald-500/80 focus:outline-none"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. Totals & Financial Summary */}
            <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-3.5 shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                  <DollarSign className="w-4 h-4" />
                  <span>GST Financial Totals (MVR)</span>
                </div>
                <button
                  type="button"
                  onClick={handleRecalculateTotals}
                  className="px-3 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Calculator className="w-3.5 h-3.5" />
                  <span>Auto Sum Totals</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Subtotal (Excl. GST)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.totals.taxable_value ?? ""}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        totals: { ...p.totals, taxable_value: parseFloat(e.target.value) || 0 }
                      }))
                    }
                    className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono font-bold focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">GST Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.totals.gst_amount ?? ""}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        totals: { ...p.totals, gst_amount: parseFloat(e.target.value) || 0 }
                      }))
                    }
                    className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-mono font-bold focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Round Off</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.totals.round_off ?? ""}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        totals: { ...p.totals, round_off: parseFloat(e.target.value) || 0 }
                      }))
                    }
                    className="w-full bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 font-mono focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1 font-semibold">Invoice Total</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.totals.invoice_total ?? ""}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        totals: { ...p.totals, invoice_total: parseFloat(e.target.value) || 0 }
                      }))
                    }
                    className="w-full bg-slate-900/90 border border-emerald-500/50 rounded-xl px-3 py-2 text-emerald-400 font-mono font-extrabold text-sm focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-slate-400 text-xs mb-1 font-semibold">Remarks / Verification Notes</label>
              <textarea
                value={formData.notes || ""}
                onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                placeholder="Optional notes for GST audit record..."
                className="w-full bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 text-xs text-slate-100 focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 focus:outline-none transition-all"
              />
            </div>

            {/* Audit Trail & History Log */}
            {bill.audit_trail && bill.audit_trail.length > 0 && (
              <div className="bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 space-y-2.5">
                <div className="flex items-center space-x-2 text-slate-400 font-bold text-xs uppercase tracking-wider border-b border-slate-800/80 pb-2">
                  <History className="w-4 h-4 text-emerald-400" />
                  <span>Audit Trail & Activity Log</span>
                </div>
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {bill.audit_trail.map((entry, idx) => (
                    <div key={idx} className="flex items-start justify-between text-[11px] bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
                      <div className="space-y-0.5">
                        <span className="font-bold text-slate-200 block">{entry.action}</span>
                        <span className="text-slate-400 block">{entry.details}</span>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <span className="text-emerald-400 font-mono block">{entry.performedBy}</span>
                        <span className="text-slate-500 text-[10px] block">{new Date(entry.date).toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Review Action Bar */}
        <div className="px-6 py-3.5 border-t border-slate-800/80 bg-slate-950/90 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onDelete(bill.id)}
            className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete Bill</span>
          </button>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={handleReject}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Reject Bill
            </button>

            <button
              type="button"
              onClick={handleSaveVerified}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save Verified</span>
            </button>

            {pendingBills.length > 1 && (
              <button
                type="button"
                onClick={handleSaveAndNext}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-lg flex items-center space-x-2 transition-transform active:scale-95 cursor-pointer"
              >
                <span>Save & Review Next</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
