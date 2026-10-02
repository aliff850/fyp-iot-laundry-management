"use client";

import React from "react";
import { Branch } from "@/types";
import { Activity, ShieldCheck, MapPin, Radio } from "lucide-react";

interface HeaderProps {
  branches: Branch[];
  selectedBranch: string;
  onSelectBranch: (id: string) => void;
  isBackendConnected: boolean;
  isEsp32Live: boolean;
}

export function Header({
  branches,
  selectedBranch,
  onSelectBranch,
  isBackendConnected,
  isEsp32Live,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-msu text-white shadow-md border-b border-msu-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & Identity */}
          <div className="flex items-center space-x-3">
            {/* <div className="w-10 h-10 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-white font-black tracking-wider text-lg shadow-inner">
              <span className="text-msu-gold">M</span>SU
            </div> */}
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-white leading-tight">
                  MSU SpinSense
                </h1>
                {/* <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded bg-msu-gold text-slate-900 font-mono">
                  IoT Portal
                </span> */}
              </div>
              <p className="text-xs text-white/80 font-medium">
                Smart Laundry Management
              </p>
            </div>
          </div>

          {/* Right Status & Controls */}
          <div className="flex items-center space-x-4">
            {/* ESP32 Live Edge Indicator */}
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-black/25 border border-white/10">
              <Radio className={`w-3.5 h-3.5 ${isEsp32Live ? "text-emerald-400 animate-pulse" : "text-amber-300"}`} />
              <span className="text-white/90">
                ESP32: <strong className={isEsp32Live ? "text-emerald-300" : "text-amber-200"}>{isEsp32Live ? "Streaming Live" : "Standby"}</strong>
              </span>
            </div>

            {/* Cloud Connection Pill */}
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-black/25 border border-white/10">
              <span className={`w-2 h-2 rounded-full ${isBackendConnected ? "bg-emerald-400 animate-ping" : "bg-amber-400"}`} />
              <span className="text-white/90">
                {isBackendConnected ? "Cloud Active" : "Mock Fallback"}
              </span>
            </div>

            {/* Branch Selector */}
            <div className="flex items-center space-x-1.5 bg-white text-slate-800 rounded-lg px-2.5 py-1.5 shadow-sm border border-slate-200 text-xs">
              <MapPin className="w-3.5 h-3.5 text-msu" />
              <select
                aria-label="Select Laundry Branch"
                value={selectedBranch}
                onChange={(e) => onSelectBranch(e.target.value)}
                className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer text-xs"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
