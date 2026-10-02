"use client";

import React from "react";
import Link from "next/link";
import {
  MapPin,
  WashingMachine,
  Wind,
  Flame,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

export interface BranchInfo {
  id: string;
  name: string;
  campusType: string;
  address: string;
  washersCount: number;
  dryersCount: number;
  totalMachines: number;
  status: "ONLINE" | "BUSY" | "MAINTENANCE";
}

interface BranchLandingCardProps {
  branch: BranchInfo;
}

export function BranchLandingCard({ branch }: BranchLandingCardProps) {
  return (
    <div className="bg-white rounded-2xl border-2 border-slate-300 hover:border-msu shadow-xs hover:shadow-md transition-all duration-200 p-6 flex flex-col justify-between group">
      {/* Card Header */}
      <div>
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
            <MapPin className="w-3 h-3 text-msu" />
            {branch.campusType}
          </span>

          <span className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
            {branch.status}
          </span>
        </div>

        <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight group-hover:text-msu transition-colors">
          {branch.name}
        </h3>
        <p className="text-xs text-slate-500 font-medium mt-1">
          {branch.address}
        </p>

        {/* Divider */}
        <div className="h-0.5 bg-slate-200 my-4" />

        {/* Machine Breakdown */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="block text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500">
              Hippo Laundry Fleet
            </span>
            <span className="text-[11px] font-mono font-bold text-slate-700">
              {branch.totalMachines} Total Units
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border-2 border-slate-200">
              <WashingMachine className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <span className="block font-bold text-slate-900 font-mono text-sm">
                  {branch.washersCount} Washers
                </span>
                <span className="text-[10px] text-slate-500 font-medium">Commercial Heavy</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border-2 border-slate-200">
              <Wind className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <span className="block font-bold text-slate-900 font-mono text-sm">
                  {branch.dryersCount} Dryers
                </span>
                <span className="text-[10px] text-slate-500 font-medium">Commercial Gas</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-6 pt-4 border-t-2 border-slate-200">
        <Link
          href={`/dashboard?branch=${branch.id}`}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-msu hover:bg-msu-dark text-white font-bold text-xs uppercase tracking-wider shadow-xs hover:shadow-md transition-all"
        >
          <span>Launch Operations</span>
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </Link>
      </div>
    </div>
  );
}
