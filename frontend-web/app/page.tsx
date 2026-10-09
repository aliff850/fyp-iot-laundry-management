"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  WashingMachine,
  Flame,
  ShieldCheck,
  ArrowRight,
  LogIn,
  User,
  LogOut,
  Layers,
} from "lucide-react";

export default function LandingPage() {
  const [operatorName, setOperatorName] = useState<string | null>(null);

  useEffect(() => {
    const storedName = localStorage.getItem("msu_operator_name");
    if (storedName) {
      setOperatorName(storedName);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("msu_auth_token");
    localStorage.removeItem("msu_operator_name");
    setOperatorName(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans text-slate-900">
      {/* Brand Navigation Header */}
      <header className="sticky top-0 z-40 bg-msu text-white shadow-sm border-b border-msu-dark">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2 group">
              <div>
                <h1 className="text-xl font-bold tracking-tight text-white leading-tight group-hover:text-amber-200 transition-colors">
                  MSU SpinSense
                </h1>
                <p className="text-xs text-white/80 font-medium">
                  Management & Science University • Commercial Laundry IoT
                </p>
              </div>
            </Link>

            {/* Operator Auth State or Simple Login Button */}
            <div className="flex items-center gap-2.5">
              {operatorName ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-xs font-semibold text-white">
                    <User className="w-3.5 h-3.5 text-amber-300" />
                    <span>{operatorName}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-1.5 rounded-lg bg-msu-dark hover:bg-black/30 text-white/80 hover:text-white transition-colors"
                    title="Sign Out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-white text-slate-900 hover:bg-slate-100 text-xs font-semibold shadow-xs transition-all"
                >
                  <LogIn className="w-3.5 h-3.5 text-msu" />
                  <span>Operator Sign In</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Hero & System Capabilities Section */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl w-full mx-auto space-y-6 py-4 sm:py-6">
          {/* Hero Banner */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-xs text-center space-y-5">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-msu bg-msu-light px-3 py-1 rounded-full border border-msu-border">
              <Layers className="w-3.5 h-3.5" />
              <span>Campus Facility Telemetry & Safety Portal</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight">
              MSU SpinSense System
            </h2>

            <p className="text-sm sm:text-base text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Centralized commercial IoT laundry management platform designed for Management & Science University campus operations. Monitor segregated washer and dryer fleets, supervise multi-cylinder LPG fuel load cells, and uphold real-time safety standards across all facilities.
            </p>

            {/* Core System Capabilities Highlighted */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 text-left">
              {/* Capability 1: Fleet Telemetry */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="w-9 h-9 rounded-lg bg-blue-100 border border-blue-200 text-blue-700 flex items-center justify-center">
                  <WashingMachine className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Remote Fleet Telemetry
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Real-time supervisory control, cycle phase tracking, operating parameters, and segregated washer & dryer utilization monitoring.
                </p>
              </div>

              {/* Capability 2: LPG Automation */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="w-9 h-9 rounded-lg bg-amber-100 border border-amber-200 text-amber-700 flex items-center justify-center">
                  <Flame className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  LPG Manifold Automation
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  4–6 cylinder automated load cell weight tracking, depletion forecasting, and dedicated maintenance swap mode calibration.
                </p>
              </div>

              {/* Capability 3: Safety Monitoring */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="w-9 h-9 rounded-lg bg-green-100 border border-green-200 text-green-700 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Real-Time Safety Interlocks
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Continuous MQ-6 gas concentration analysis, environmental temperature & humidity tracking, and audible emergency alert triggers.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-6 border-t border-slate-200">
              <Link
                href="/branches"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-9 px-5 rounded-lg bg-msu hover:bg-msu-dark text-white text-xs font-semibold shadow-xs hover:shadow-sm transition-all"
              >
                <span>Launch Operations Portal</span>
                <ArrowRight className="w-4 h-4" />
              </Link>

              <Link
                href="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-9 px-5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold transition-colors shadow-2xs"
              >
                <LogIn className="w-4 h-4 text-msu" />
                <span>Operator Sign In</span>
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Clean Minimal Footer */}
      <footer className="py-4 border-t border-slate-200 bg-white/70 text-center text-xs text-slate-500">
        <p>Management & Science University • IoT Smart Laundry & LPG Monitoring System</p>
      </footer>
    </div>
  );
}
