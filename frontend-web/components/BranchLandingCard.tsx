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
  AlertTriangle,
} from "lucide-react";
import { Branch } from "@/types";

interface BranchLandingCardProps {
  branch: Branch;
}

export function BranchLandingCard({ branch }: BranchLandingCardProps) {
  const isCritical = branch.health_status === "CRITICAL";
  const isWarning = branch.health_status === "WARNING";

  return (
    <div className="bg-white rounded-xl border border-slate-200 hover:border-msu-border shadow-xs hover:shadow-md transition-all p-4 flex flex-col justify-between gap-3 group">
      {/* Card Header Row per DESIGN.md 4.3 */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-100">
          <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            <MapPin className="w-3 h-3 text-msu" />
            <span className="truncate">{branch.campus_type || "Campus Facility"}</span>
          </span>

          <span
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full ${
              isCritical
                ? "bg-red-100 text-red-700 animate-pulse"
                : isWarning
                ? "bg-amber-100 text-amber-700"
                : "bg-green-100 text-green-700"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isCritical ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-green-500"
              }`}
            />
            {isCritical ? "Critical" : isWarning ? "Warning" : "Normal"}
          </span>
        </div>

        <h3 className="text-base font-semibold text-slate-800 leading-tight group-hover:text-msu transition-colors truncate">
          {branch.name}
        </h3>
        <p className="text-xs text-slate-500 font-medium mt-0.5 truncate">
          {branch.address}, {branch.city}
        </p>

        {/* Micro-grid per DESIGN.md 4.3 */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-600 text-xs font-medium">
              <WashingMachine className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Washers</span>
            </div>
            <span className="text-xs font-bold text-slate-900">
              {branch.active_washers ?? 2}/{branch.total_washers ?? 4}
            </span>
          </div>

          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-600 text-xs font-medium">
              <Wind className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
              <span>Dryers</span>
            </div>
            <span className="text-xs font-bold text-slate-900">
              {branch.active_dryers ?? 2}/{branch.total_dryers ?? 4}
            </span>
          </div>

          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-600 text-xs font-medium">
              <Flame className="w-3.5 h-3.5 text-orange-600 shrink-0" />
              <span>Fuel</span>
            </div>
            <span className="text-xs font-bold text-slate-900">
              {branch.lpg_status ?? "Nominal"}
            </span>
          </div>

          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-600 text-xs font-medium">
              {isCritical ? (
                <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-green-600 shrink-0" />
              )}
              <span>Safety</span>
            </div>
            <span
              className={`text-xs font-bold ${
                isCritical ? "text-red-700" : isWarning ? "text-amber-700" : "text-green-700"
              }`}
            >
              {isCritical ? "Hazard" : isWarning ? "Alert" : "Passed"}
            </span>
          </div>
        </div>
      </div>

      {/* Action Footer per DESIGN.md 4.3 */}
      <div className="pt-2.5 mt-1 border-t border-slate-100 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-500 font-medium">
          {branch.opening_hours || "24 Hours"}
        </span>

        <Link
          href={`/dashboard?branch=${branch.id}`}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-msu hover:bg-msu-dark text-white text-xs font-semibold transition-colors shadow-2xs"
        >
          <span>Open Dashboard</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}
