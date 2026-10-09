"use client";

import React, { useState } from "react";
import { Branch } from "@/types";
import { MapPin, Navigation, WashingMachine, Wind, Flame, ShieldAlert, ArrowRight, ExternalLink } from "lucide-react";
import Link from "next/link";

interface BranchMapProps {
  branches: Branch[];
  selectedBranchId?: string;
  onSelectBranch: (branchId: string) => void;
}

export function BranchMap({ branches, selectedBranchId, onSelectBranch }: BranchMapProps) {
  const [activePin, setActivePin] = useState<string>(selectedBranchId || branches[0]?.id || "msu-shah-alam");

  const currentBranch = branches.find((b) => b.id === activePin) || branches[0];

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-xs overflow-hidden">
      {/* Header Bar */}
      <div className="px-5 py-3.5 bg-slate-100/80 border-b-2 border-slate-300 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-msu text-white flex items-center justify-center shadow-xs">
            <Navigation className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-black tracking-tight text-slate-900 leading-tight">
              Klang Valley Geographical Hub Map
            </h3>
            <p className="text-[11px] text-slate-500 font-medium">
              Live status markers across registered laundromat outlets (Leaflet / GIS Coordinates)
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] font-mono font-bold">
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Healthy (&gt;15% Gas)
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Warning / Low Gas
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-50 text-red-800 border border-red-300">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
            Critical Alert
          </span>
        </div>
      </div>

      {/* Map Canvas and Branch Spotlight */}
      <div className="grid grid-cols-1 lg:grid-cols-3">
        {/* Interactive Map Visual Area */}
        <div className="lg:col-span-2 relative h-80 sm:h-96 bg-[#0F172A] overflow-hidden select-none">
          {/* Subtle Map Grid Lines */}
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(#334155 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />

          {/* Map Topographical Water / Contour Shapes */}
          <svg className="absolute inset-0 w-full h-full opacity-15 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M-50,220 C100,180 200,280 350,240 C500,200 650,290 850,220 L850,450 L-50,450 Z"
              fill="#38BDF8"
            />
            <path
              d="M-50,80 C150,120 280,40 450,110 C620,180 750,70 950,120 L950,0 L-50,0 Z"
              fill="#1E293B"
            />
          </svg>

          {/* Region Annotations */}
          <div className="absolute top-4 left-5 text-[11px] font-mono text-slate-400 font-bold uppercase tracking-wider bg-slate-900/80 px-2.5 py-1 rounded-md border border-slate-700">
            Klang Valley Region • Malaysia
          </div>

          {/* Interactive Pins */}
          {branches.map((b, index) => {
            // Position pins based on coordinates or index
            const positions: Record<string, { top: string; left: string }> = {
              "msu-shah-alam": { top: "54%", left: "32%" },
              "msu-cheras": { top: "42%", left: "68%" },
            };
            const defaultPos = positions[b.id] || {
              top: `${35 + (index * 25) % 45}%`,
              left: `${45 + (index * 30) % 45}%`,
            };

            const isSelected = activePin === b.id;
            const markerColor = b.marker_color || (b.health_status === "CRITICAL" ? "red" : b.health_status === "WARNING" ? "amber" : "green");

            return (
              <div
                key={b.id}
                onClick={() => {
                  setActivePin(b.id);
                  onSelectBranch(b.id);
                }}
                style={{ top: defaultPos.top, left: defaultPos.left }}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group z-10"
              >
                {/* Ping animation if warning or selected */}
                <span
                  className={`absolute -inset-2 rounded-full opacity-60 animate-ping ${
                    markerColor === "red"
                      ? "bg-red-500"
                      : markerColor === "amber"
                      ? "bg-amber-400"
                      : "bg-emerald-400"
                  }`}
                />

                {/* Pin Head */}
                <div
                  className={`relative px-3 py-1.5 rounded-xl border-2 flex items-center gap-1.5 shadow-lg transition-transform duration-150 ${
                    isSelected ? "scale-115 ring-2 ring-white" : "hover:scale-105"
                  } ${
                    markerColor === "red"
                      ? "bg-red-600 border-red-300 text-white"
                      : markerColor === "amber"
                      ? "bg-amber-500 border-amber-200 text-slate-950 font-black"
                      : "bg-emerald-600 border-emerald-300 text-white"
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5" />
                  <span className="text-xs font-black tracking-tight">{b.name}</span>
                </div>

                {/* Subtitle Badge */}
                <div className="text-center mt-1">
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900/90 text-slate-300 border border-slate-700 shadow-sm">
                    {b.city || "Selangor"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Branch Spotlight Panel */}
        <div className="p-5 border-t lg:border-t-0 lg:border-l-2 border-slate-300 flex flex-col justify-between bg-white">
          {currentBranch ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-msu bg-msu-light px-2.5 py-0.5 rounded-full border border-msu-border/30">
                  {currentBranch.campus_type || "Campus Outlet"}
                </span>
                <span
                  className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                    currentBranch.marker_color === "red"
                      ? "bg-red-100 text-red-800 border-red-300"
                      : currentBranch.marker_color === "amber"
                      ? "bg-amber-100 text-amber-800 border-amber-300"
                      : "bg-emerald-100 text-emerald-800 border-emerald-300"
                  }`}
                >
                  {currentBranch.marker_color === "red"
                    ? "CRITICAL HAZARD"
                    : currentBranch.marker_color === "amber"
                    ? "ATTENTION REQUIRED"
                    : "ALL SYSTEMS NOMINAL"}
                </span>
              </div>

              <div>
                <h4 className="text-xl font-black text-slate-900 leading-tight">
                  {currentBranch.name}
                </h4>
                <p className="text-xs text-slate-600 mt-1 font-medium leading-relaxed">
                  {currentBranch.address}, {currentBranch.city}
                </p>
                <div className="mt-2 text-[11px] font-mono text-slate-500 space-y-0.5">
                  <p>Hours: <span className="text-slate-800 font-bold">{currentBranch.opening_hours || "24 Hours"}</span></p>
                  <p>Tel: <span className="text-slate-800 font-bold">{currentBranch.contact_phone || "+60 3-5521 2888"}</span></p>
                  <p>Gateway: <span className="text-slate-800 font-bold">{currentBranch.gateway_ip || "192.168.1.100"}</span></p>
                </div>
              </div>

              {/* Machine Fleet Quick Tallies */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                    <WashingMachine className="w-3.5 h-3.5 text-blue-600" />
                    <span>Washers</span>
                  </div>
                  <div className="text-sm font-black font-mono text-slate-900 mt-1">
                    {currentBranch.active_washers ?? 2}/{currentBranch.total_washers ?? 4} Active
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                    <Wind className="w-3.5 h-3.5 text-cyan-600" />
                    <span>Dryers</span>
                  </div>
                  <div className="text-sm font-black font-mono text-slate-900 mt-1">
                    {currentBranch.active_dryers ?? 2}/{currentBranch.total_dryers ?? 4} Active
                  </div>
                </div>
              </div>

              {/* LPG & Safety Quick Metric */}
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-orange-600" />
                  <div>
                    <span className="text-[10px] font-mono font-bold text-slate-500 uppercase block">LPG Fuel Health</span>
                    <span className="text-xs font-black text-slate-900 font-mono">
                      {currentBranch.lpg_status || "4/4 Cylinders Healthy"}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  MQ-6 Safe
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">Select a branch marker on the map</div>
          )}

          <div className="pt-4 border-t border-slate-200 mt-4">
            <Link
              href={`/dashboard?branch=${currentBranch?.id || "msu-shah-alam"}`}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-msu hover:bg-msu-dark text-white text-xs font-black uppercase tracking-wider font-mono shadow-xs transition-all"
            >
              <span>Open Branch Operations</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
