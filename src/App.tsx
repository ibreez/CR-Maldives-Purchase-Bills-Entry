/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Navbar } from "./components/Navbar";
import { Dashboard } from "./components/Dashboard";
import { UploadModal } from "./components/UploadModal";
import { BillReviewModal } from "./components/BillReviewModal";
import { ExcelExportModal } from "./components/ExcelExportModal";
import { GoogleSheetsModal } from "./components/GoogleSheetsModal";
import { SettingsModal } from "./components/SettingsModal";
import { BillRecord, DashboardSummary } from "./types";

export default function App() {
  const [bills, setBills] = useState<BillRecord[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState<string>("ALL");
  const [activeTab, setActiveTab] = useState<"all" | "pending_review" | "verified" | "rejected">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Modal controls
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadInitialTab, setUploadInitialTab] = useState<"file" | "camera" | "batch">("file");
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [activeReviewBill, setActiveReviewBill] = useState<BillRecord | null>(null);
  const [isExportExcelOpen, setIsExportExcelOpen] = useState(false);
  const [isGoogleSheetsOpen, setIsGoogleSheetsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleOpenUpload = (mode: "file" | "camera" | "batch" = "file") => {
    setUploadInitialTab(mode);
    setIsUploadOpen(true);
  };

  useEffect(() => {
    fetchBills();
    fetchSummary();
  }, [selectedQuarter, searchQuery]);

  const fetchSummary = async () => {
    try {
      const res = await fetch("/api/dashboard/summary");
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (e) {
      console.error("Error fetching summary", e);
    }
  };

  const fetchBills = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedQuarter !== "ALL") params.append("quarter", selectedQuarter);
      if (searchQuery.trim()) params.append("search", searchQuery.trim());

      const res = await fetch(`/api/bills?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setBills(data);
      }
    } catch (e) {
      console.error("Error fetching bills", e);
    }
  };

  const handleUploadSuccess = (newBill: BillRecord) => {
    setBills((prev) => [newBill, ...prev]);
    fetchSummary();
    // Auto-open review modal if bill needs review
    if (newBill.status === "pending_review") {
      setActiveReviewBill(newBill);
      setIsReviewOpen(true);
    }
  };

  const handleSaveBill = async (updatedBill: BillRecord, status: "verified" | "pending_review" | "rejected") => {
    try {
      const res = await fetch(`/api/bills/${updatedBill.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verifiedData: updatedBill.verifiedData,
          status
        })
      });

      if (res.ok) {
        const savedRecord = await res.json();
        setBills((prev) => prev.map((b) => (b.id === savedRecord.id ? savedRecord : b)));
        fetchSummary();
      }
    } catch (e) {
      console.error("Failed to save bill updates", e);
    }
  };

  const handleDeleteBill = async (id: string) => {
    try {
      const res = await fetch(`/api/bills/${id}`, { method: "DELETE" });
      if (res.ok) {
        setBills((prev) => prev.filter((b) => b.id !== id));
        fetchSummary();
        if (activeReviewBill?.id === id) {
          setIsReviewOpen(false);
          setActiveReviewBill(null);
        }
      }
    } catch (e) {
      console.error("Failed to delete bill", e);
    }
  };

  const handleReviewBill = (bill: BillRecord) => {
    setActiveReviewBill(bill);
    setIsReviewOpen(true);
  };

  const pendingBills = bills.filter((b) => b.status === "pending_review");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        summary={summary}
        selectedQuarter={selectedQuarter}
        onQuarterChange={setSelectedQuarter}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenUpload={(mode) => handleOpenUpload(mode || "file")}
        onOpenExportExcel={() => setIsExportExcelOpen(true)}
        onOpenGoogleSheets={() => setIsGoogleSheetsOpen(true)}
      />

      {/* Main Dashboard */}
      <main className="flex-1">
        <Dashboard
          bills={bills}
          summary={summary}
          selectedQuarter={selectedQuarter}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenUpload={(mode) => handleOpenUpload(mode || "file")}
          onOpenExportExcel={() => setIsExportExcelOpen(true)}
          onOpenGoogleSheets={() => setIsGoogleSheetsOpen(true)}
          onReviewBill={handleReviewBill}
          onDeleteBill={handleDeleteBill}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Maldivian GST Purchase Bill Entry Assistant &bull; MVR Currency</span>
          <span className="font-mono text-[11px]">Default Tax Rate: 8% | Business TIN: 1133533GST501</span>
        </div>
      </footer>

      {/* Modals */}
      {isUploadOpen && (
        <UploadModal
          isOpen={isUploadOpen}
          initialTab={uploadInitialTab}
          onClose={() => setIsUploadOpen(false)}
          onUploadSuccess={handleUploadSuccess}
        />
      )}

      {isReviewOpen && activeReviewBill && (
        <BillReviewModal
          isOpen={isReviewOpen}
          bill={activeReviewBill}
          pendingBills={pendingBills}
          onClose={() => setIsReviewOpen(false)}
          onSave={handleSaveBill}
          onDelete={handleDeleteBill}
          onSelectNextBill={(nextBill) => setActiveReviewBill(nextBill)}
        />
      )}

      {isExportExcelOpen && (
        <ExcelExportModal
          isOpen={isExportExcelOpen}
          selectedQuarter={selectedQuarter}
          onClose={() => setIsExportExcelOpen(false)}
        />
      )}

      {isGoogleSheetsOpen && (
        <GoogleSheetsModal
          isOpen={isGoogleSheetsOpen}
          selectedQuarter={selectedQuarter}
          onClose={() => setIsGoogleSheetsOpen(false)}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          onSettingsSaved={() => {
            fetchSummary();
            fetchBills();
          }}
        />
      )}
    </div>
  );
}
