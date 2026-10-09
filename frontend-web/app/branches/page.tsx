"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { BranchLandingCard } from "@/components/BranchLandingCard";
import { GoogleBranchMap } from "@/components/GoogleBranchMap";
import { AddBranchModal } from "@/components/AddBranchModal";
import { getBranches } from "@/lib/api";
import { Branch } from "@/types";
import {
  Building2,
  WashingMachine,
  Flame,
  Activity,
  Plus,
  User,
  LogOut,
  RefreshCw,
} from "lucide-react";

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddBranchOpen, setIsAddBranchOpen] = useState(false);
  const [operatorName, setOperatorName] = useState<string>("MSU Operator");

  const fetchBranches = useCallback(async () => {
    setIsLoading(true);
    const res = await getBranches();
    if (res.data) setBranches(res.data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchBranches();
    const stored = localStorage.getItem("msu_operator_name");
    if (stored) setOperatorName(stored);
  }, [fetchBranches]);

  const handleLogout = () => {
    localStorage.removeItem("msu_auth_token");
    localStorage.removeItem("msu_operator_name");
    window.location.href = "/login";
  };

  const totalWashers = branches.reduce((sum, b) => sum + (b.total_washers ?? 4), 0);
  const totalDryers = branches.reduce((sum, b) => sum + (b.total_dryers ?? 4), 0);
  const totalMachines = totalWashers + totalDryers;
  const criticalCount = branches.filter((b) => b.health_status === "CRITICAL").length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Top Brand Header */}
      <header className="sticky top-0 z-40 bg-msu text-white shadow-sm border-b border-msu-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Link href="/" className="group flex items-center gap-2">
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-white leading-tight group-hover:text-amber-200 transition-colors">
                    MSU SpinSense
                  </h1>
                  <p className="text-xs text-white/80 font-medium">
                    Management & Science University • Multi-Branch Operations
                  </p>
                </div>
              </Link>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-xs font-semibold text-white">
                <User className="w-3.5 h-3.5 text-amber-300" />
                <span className="hidden sm:inline">{operatorName}</span>
              </div>

              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg bg-msu-dark hover:bg-black/30 text-white/80 hover:text-white transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Hub Content Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Top Control Bar with Add Branch & Summary */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 leading-tight">
              Multi-Branch Operations Portal
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Supervise all campus laundry facilities, automated LPG manifold racks, and fleet utilization
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setIsAddBranchOpen(true)}
              className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-msu hover:bg-msu-dark text-white text-xs font-semibold shadow-xs hover:shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Branch</span>
            </button>

            <button
              onClick={fetchBranches}
              disabled={isLoading}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-msu" : ""}`} />
              <span>Sync</span>
            </button>
          </div>
        </div>

        {/* Aggregate Quick Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
              <Building2 className="w-3.5 h-3.5 text-msu" />
              <span>Active Facilities</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
              {branches.length} <span className="text-sm font-semibold text-slate-500">Branches</span>
            </div>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
              <WashingMachine className="w-3.5 h-3.5 text-blue-600" />
              <span>Fleet Deployment</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
              {totalMachines} <span className="text-sm font-semibold text-slate-500">Units</span>
            </div>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
              <Flame className="w-3.5 h-3.5 text-amber-600" />
              <span>LPG Manifolds</span>
            </div>
            <div className={`text-2xl sm:text-3xl font-extrabold mt-1 ${criticalCount === 0 ? "text-green-700" : "text-red-700"}`}>
              {criticalCount === 0 ? "Normal" : `${criticalCount} Alert`}
            </div>
          </div>

          <div className="p-3.5 sm:p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold">
              <Activity className="w-3.5 h-3.5 text-green-600" />
              <span>Fleet Telemetry</span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
              Live Stream
            </div>
          </div>
        </div>

        {/* FULLY FUNCTIONAL GOOGLE MAPS SECTION */}
        <div className="space-y-3">
          <GoogleBranchMap
            branches={branches}
            onSelectBranch={() => {}}
          />
        </div>

        {/* RESPONSIVE GRID OF BRANCH SUMMARY CARDS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div>
              <h3 className="text-base font-bold tracking-tight text-slate-900">
                Registered Outlets & Fleet Segregation
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Select an outlet to drill down into dedicated washer/dryer fleets, LPG cylinders, and telemetry
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-white text-slate-700 border border-slate-200 shadow-2xs">
              {branches.length} Outlets
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {branches.map((b) => (
              <BranchLandingCard key={b.id} branch={b} />
            ))}
          </div>
        </div>
      </main>

      {/* Add Branch Modal */}
      <AddBranchModal
        isOpen={isAddBranchOpen}
        onClose={() => setIsAddBranchOpen(false)}
        onBranchAdded={(newB) => {
          setBranches((prev) => [...prev, newB]);
        }}
      />

      {/* Clean System Footer */}
      <footer className="mt-auto py-4 border-t border-slate-200 bg-white/70 text-center text-xs text-slate-500">
        <p>Management & Science University • IoT Smart Laundry & LPG Monitoring System</p>
      </footer>
    </div>
  );
}
