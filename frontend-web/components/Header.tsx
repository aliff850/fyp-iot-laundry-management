"use client";

import React from "react";
import Link from "next/link";
import { Branch } from "@/types";
import { MapPin, LayoutGrid } from "lucide-react";

interface HeaderProps {
  branches: Branch[];
  selectedBranch: string;
  onSelectBranch: (id: string) => void;
}

export function Header({
  branches,
  selectedBranch,
  onSelectBranch,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-msu text-white shadow-md border-b-2 border-msu-dark">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand & Identity */}
          <div className="flex items-center space-x-3">
            <Link href="/" className="group flex items-center gap-2.5">
              <div>
                <h1 className="text-xl font-black tracking-tight text-white leading-tight group-hover:text-amber-200 transition-colors">
                  MSU SpinSense
                </h1>
                <p className="text-[11px] text-white/80 font-mono font-medium">
                  Management & Science University
                </p>
              </div>
            </Link>
          </div>

          {/* Right Status & Controls */}
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            {/* Branch Hub Navigation Link */}
            {/* <Link
              href="/"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-msu-dark hover:bg-black/40 border border-white/20 text-xs font-bold text-white shadow-2xs transition-all"
              title="Return to Branch Selection Hub"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-amber-300" />
              <span className="hidden sm:inline">Branch Hub</span>
            </Link> */}

            {/* Branch Selector Dropdown */}
            {/* <div className="flex items-center space-x-1.5 bg-white text-slate-900 rounded-xl px-3 py-1.5 shadow-xs border-2 border-slate-300 text-xs">
              <MapPin className="w-3.5 h-3.5 text-msu shrink-0" />
              <select
                aria-label="Select Laundry Branch"
                value={selectedBranch}
                onChange={(e) => onSelectBranch(e.target.value)}
                className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer text-xs"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div> */}
          </div>
        </div>
      </div>
    </header>
  );
}
