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
import { LoginModal } from "./components/LoginModal";
import { OutletManagementModal } from "./components/OutletManagementModal";
import { UserManagementModal } from "./components/UserManagementModal";
import { IncomeTaxModal } from "./components/IncomeTaxModal";
import { RevenueManagementModal } from "./components/RevenueManagementModal";
import { FixedAssetRegisterModal } from "./components/FixedAssetRegisterModal";
import { TaxReviewDashboard } from "./components/TaxReviewDashboard";
import { BillRecord, DashboardSummary, AuthUser, Outlet } from "./types";

export default function App() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(
    localStorage.getItem("cr_auth_token")
  );
  const [authLoading, setAuthLoading] = useState(true);

  // Multi-outlet State
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [selectedOutlet, setSelectedOutlet] = useState<string>("ALL");

  // Dashboard Data State
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
  const [isOutletsModalOpen, setIsOutletsModalOpen] = useState(false);
  const [isUsersModalOpen, setIsUsersModalOpen] = useState(false);
  const [isIncomeTaxOpen, setIsIncomeTaxOpen] = useState(false);
  const [isRevenueOpen, setIsRevenueOpen] = useState(false);
  const [isAssetsOpen, setIsAssetsOpen] = useState(false);

  // Check initial authentication status
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    setAuthLoading(true);
    const token = localStorage.getItem("cr_auth_token");
    if (!token) {
      setCurrentUser(null);
      setAuthLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        setAuthToken(token);
      } else {
        localStorage.removeItem("cr_auth_token");
        setCurrentUser(null);
        setAuthToken(null);
      }
    } catch (e) {
      console.error("Auth verify error", e);
      setCurrentUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLoginSuccess = (user: AuthUser, token: string) => {
    setCurrentUser(user);
    setAuthToken(token);
    localStorage.setItem("cr_auth_token", token);
    if (user.role === "outlet_user" && user.outlet_id) {
      setSelectedOutlet(user.outlet_id);
    } else {
      setSelectedOutlet("ALL");
    }
  };

  const handleLogout = async () => {
    if (authToken) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` }
      }).catch(() => {});
    }
    localStorage.removeItem("cr_auth_token");
    setCurrentUser(null);
    setAuthToken(null);
  };

  // Fetch Outlets list
  useEffect(() => {
    if (currentUser && authToken) {
      fetchOutlets();
    }
  }, [currentUser, authToken]);

  const fetchOutlets = async () => {
    if (!authToken) return;
    try {
      const res = await fetch("/api/outlets", {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setOutlets(data);
      }
    } catch (e) {
      console.error("Error fetching outlets", e);
    }
  };

  // Fetch Bills and Summary whenever quarter, searchQuery, selectedOutlet, or auth changes
  useEffect(() => {
    if (currentUser && authToken) {
      fetchBills();
      fetchSummary();
    }
  }, [currentUser, authToken, selectedQuarter, searchQuery, selectedOutlet]);

  const fetchSummary = async () => {
    if (!authToken) return;
    try {
      const params = new URLSearchParams();
      if (selectedQuarter !== "ALL") params.append("quarter", selectedQuarter);
      if (selectedOutlet !== "ALL") params.append("outletId", selectedOutlet);

      const res = await fetch(`/api/dashboard/summary?${params.toString()}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (e) {
      console.error("Error fetching summary", e);
    }
  };

  const fetchBills = async () => {
    if (!authToken) return;
    try {
      const params = new URLSearchParams();
      if (selectedQuarter !== "ALL") params.append("quarter", selectedQuarter);
      if (selectedOutlet !== "ALL") params.append("outletId", selectedOutlet);
      if (searchQuery.trim()) params.append("search", searchQuery.trim());

      const res = await fetch(`/api/bills?${params.toString()}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setBills(data);
      }
    } catch (e) {
      console.error("Error fetching bills", e);
    }
  };

  const handleOpenUpload = (mode: "file" | "camera" | "batch" = "file") => {
    setUploadInitialTab(mode);
    setIsUploadOpen(true);
  };

  const handleUploadSuccess = (newBill: BillRecord) => {
    setBills((prev) => [newBill, ...prev]);
    fetchSummary();
    if (newBill.status === "pending_review") {
      setActiveReviewBill(newBill);
      setIsReviewOpen(true);
    }
  };

  const handleSaveBill = async (updatedBill: BillRecord, status: "verified" | "pending_review" | "rejected") => {
    if (!authToken) return;
    try {
      const res = await fetch(`/api/bills/${updatedBill.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
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
    if (!authToken) return;
    try {
      const res = await fetch(`/api/bills/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${authToken}` }
      });
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

  // If loading auth session
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center font-sans">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400 font-medium">Loading Multi-Outlet GST System...</p>
        </div>
      </div>
    );
  }

  // If user is not authenticated, show Login Modal
  if (!currentUser || !authToken) {
    return <LoginModal onLoginSuccess={handleLoginSuccess} />;
  }

  const pendingBills = bills.filter((b) => b.status === "pending_review");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        outlets={outlets}
        selectedOutlet={selectedOutlet}
        onOutletChange={setSelectedOutlet}
        summary={summary}
        selectedQuarter={selectedQuarter}
        onQuarterChange={setSelectedQuarter}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenUpload={(mode) => handleOpenUpload(mode || "file")}
        onOpenExportExcel={() => setIsExportExcelOpen(true)}
        onOpenGoogleSheets={() => setIsGoogleSheetsOpen(true)}
        onOpenOutletsModal={() => setIsOutletsModalOpen(true)}
        onOpenUsersModal={() => setIsUsersModalOpen(true)}
        onOpenRevenue={() => setIsRevenueOpen(true)}
        onOpenAssets={() => setIsAssetsOpen(true)}
        onOpenIncomeTax={() => setIsIncomeTaxOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Dashboard */}
      <main className="flex-1">
        <Dashboard
          currentUser={currentUser}
          outlets={outlets}
          selectedOutlet={selectedOutlet}
          onSelectOutlet={setSelectedOutlet}
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
          <span>Maldivian GST Multi-Outlet Purchase Entry Portal &bull; MVR Currency</span>
          <span className="font-mono text-[11px]">
            {currentUser.role === "super_admin"
              ? "Super Admin Mode (All Outlets)"
              : `Outlet: ${currentUser.outlet_name || "Assigned Outlet"}`}
          </span>
        </div>
      </footer>

      {/* Modals */}
      {isUploadOpen && (
        <UploadModal
          isOpen={isUploadOpen}
          initialTab={uploadInitialTab}
          authToken={authToken}
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
          authToken={authToken}
          selectedOutlet={selectedOutlet}
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

      {isOutletsModalOpen && (
        <OutletManagementModal
          isOpen={isOutletsModalOpen}
          authToken={authToken}
          onClose={() => setIsOutletsModalOpen(false)}
          onOutletsUpdated={() => {
            fetchOutlets();
            fetchSummary();
            fetchBills();
          }}
        />
      )}

      {isUsersModalOpen && (
        <UserManagementModal
          isOpen={isUsersModalOpen}
          authToken={authToken}
          onClose={() => setIsUsersModalOpen(false)}
          onUsersUpdated={() => {
            fetchSummary();
          }}
        />
      )}

      {isRevenueOpen && (
        <RevenueManagementModal
          isOpen={isRevenueOpen}
          onClose={() => setIsRevenueOpen(false)}
          currentUser={currentUser}
          outlets={outlets}
        />
      )}

      {isAssetsOpen && (
        <FixedAssetRegisterModal
          isOpen={isAssetsOpen}
          onClose={() => setIsAssetsOpen(false)}
          currentUser={currentUser}
          outlets={outlets}
        />
      )}

      {isIncomeTaxOpen && (
        <TaxReviewDashboard
          isOpen={isIncomeTaxOpen}
          onClose={() => setIsIncomeTaxOpen(false)}
          currentUser={currentUser}
          outlets={outlets}
        />
      )}
    </div>
  );
}
