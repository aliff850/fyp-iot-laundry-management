"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { BranchLandingCard, BranchInfo } from "@/components/BranchLandingCard";
import {
  Building2,
  WashingMachine,
  Flame,
  ArrowRight,
  ShieldCheck,
  Activity,
} from "lucide-react";

export default function LandingPage() {
  const branches: BranchInfo[] = [
    {
      id: "msu-shah-alam",
      name: "MSU Shah Alam",
      campusType: "Main Campus Hub",
      address: "Management & Science University, Section 13, 40100 Shah Alam, Selangor",
      washersCount: 4,
      dryersCount: 4,
      totalMachines: 8,
      status: "ONLINE",
    },
    {
      id: "msu-cheras",
      name: "MSU Cheras",
      campusType: "Cheras Campus Centre",
      address: "MSU College Cheras, Jalan Manickavasagam, 56000 Cheras, Kuala Lumpur",
      washersCount: 4,
      dryersCount: 4,
      totalMachines: 8,
      status: "ONLINE",
    },
  ];

  return (
    <div className="min-h-screen bg-[#E7ECF3] flex flex-col font-sans">
      {/* Top Brand Header */}
      <header className="bg-msu text-white shadow-md border-b-2 border-msu-dark">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div>
              <h1 className="text-xl font-black tracking-tight text-white leading-tight">
                MSU SpinSense
              </h1>
              <p className="text-[11px] text-white/80 font-mono font-medium">
                Management & Science University
              </p>
            </div>

            <Link
              href="/dashboard?branch=msu-shah-alam"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-msu-dark hover:bg-black/40 border border-white/20 text-xs font-bold text-white shadow-2xs transition-all"
            >
              <span>Quick Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Hub Content Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        {/* Welcome Hero Banner */}
        <div className="bg-white rounded-2xl border-2 border-slate-300 p-6 sm:p-8 shadow-xs">
          <div className="max-w-3xl space-y-2">
            {/* <span className="inline-block text-xs font-mono font-bold uppercase tracking-wider text-msu">
              Operations Portal
            </span> */}
            <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 leading-tight">
              Welcome to MSU SpinSense
            </h2>
            <p className="text-sm sm:text-base text-slate-600 font-medium">
              Select a laundry facility below to inspect live machine telemetry, configure operating parameters, and monitor real-time LPG gas safety.
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t-2 border-slate-200">
            <div className="p-3 rounded-xl bg-slate-50 border-2 border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px] font-bold uppercase">
                <Building2 className="w-3.5 h-3.5 text-msu" />
                <span>Branches</span>
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono mt-1">2 Active</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border-2 border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px] font-bold uppercase">
                <WashingMachine className="w-3.5 h-3.5 text-blue-600" />
                <span>Fleet Units</span>
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono mt-1">16 Units</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border-2 border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px] font-bold uppercase">
                <Flame className="w-3.5 h-3.5 text-emerald-600" />
                <span>LPG Safety</span>
              </div>
              <div className="text-2xl font-black text-emerald-700 font-mono mt-1">Normal (0 Leaks)</div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border-2 border-slate-200">
              <div className="flex items-center gap-2 text-slate-500 font-mono text-[11px] font-bold uppercase">
                <Activity className="w-3.5 h-3.5 text-amber-600" />
                <span>Fleet Health</span>
              </div>
              <div className="text-2xl font-black text-slate-900 font-mono mt-1">100% Online</div>
            </div>
          </div>
        </div>

        {/* Laundry Branches Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b-2 border-slate-300">
            <div>
              <h3 className="text-lg sm:text-xl font-black tracking-tight text-slate-900">
                Select Laundry Branch
              </h3>
              {/* <p className="text-xs text-slate-500 font-medium">
                Choose a campus location to open its dedicated Operations Overview
              </p> */}
            </div>
            {/* <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-white text-slate-700 border-2 border-slate-300">
              2 Locations
            </span> */}
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {branches.map((b) => (
              <BranchLandingCard key={b.id} branch={b} />
            ))}
          </div>
        </div>
      </main>

      {/* Clean System Footer */}
      <footer className="mt-auto py-6 border-t-2 border-slate-300 bg-white/60 text-center text-xs text-slate-500 font-mono">
        <p>Management & Science University • IoT Smart Laundry & LPG Monitoring System</p>
      </footer>
    </div>
  );
}
