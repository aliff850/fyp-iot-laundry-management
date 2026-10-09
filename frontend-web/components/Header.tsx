"use client";

import React from "react";
import Link from "next/link";
import { Branch } from "@/types";
import { MapPin, LayoutGrid, User } from "lucide-react";

interface HeaderProps {
  branches: Branch[];
  selectedBranch: string;
  onSelectBranch: (id: string) => void;
  operatorName?: string;
  onAuthClick?: () => void;
  isLive?: boolean;
}

export function Header({
  branches,
  selectedBranch,
  onSelectBranch,
  operatorName = "MSU Operator",
  onAuthClick,
  isLive = true,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-msu text-white shadow-sm border-b border-msu-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & Identity */}
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/" className="group flex items-center gap-2 min-w-0">
              <div className="min-w-0">
                <h1 className="text-lg font-bold tracking-tight text-white leading-tight group-hover:text-amber-200 transition-colors truncate">
                  MSU SpinSense
                </h1>
                <p className="text-xs text-white/80 font-medium truncate hidden sm:block">
                  Management & Science University • Operator Portal
                </p>
              </div>
            </Link>
          </div>

          {/* Right Status & Controls */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Live Connectivity Pill */}
            <div className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${
              isLive
                ? "bg-black/20 border-white/20 text-emerald-300"
                : "bg-black/20 border-amber-400/40 text-amber-300"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
              <span>{isLive ? "ESP32 Live Stream" : "Offline (Cached)"}</span>
            </div>

            {/* Branch Hub Navigation Link */}
            <Link
              href="/branches"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-msu-dark hover:bg-black/30 border border-white/20 text-xs font-semibold text-white transition-colors"
              title="Return to Branch Selection Hub"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden sm:inline">All Branches</span>
            </Link>

            {/* Branch Selector Dropdown */}
            {branches.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white text-slate-800 rounded-lg px-2.5 py-1.5 border border-slate-200 text-xs shadow-2xs">
                <MapPin className="w-3.5 h-3.5 text-msu shrink-0" />
                <select
                  aria-label="Select Laundry Branch"
                  value={selectedBranch}
                  onChange={(e) => onSelectBranch(e.target.value)}
                  className="bg-transparent font-semibold text-slate-900 focus:outline-none cursor-pointer text-xs pr-1"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Operator Auth Button */}
            {onAuthClick && (
              <button
                onClick={onAuthClick}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold transition-colors text-white"
                title="Operator Account"
              >
                <User className="w-3.5 h-3.5 text-amber-300" />
                <span className="hidden md:inline">{operatorName}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
