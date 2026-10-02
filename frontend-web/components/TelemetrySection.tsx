"use client";

import React, { useState } from "react";
import { TelemetrySummary } from "@/types";
import { DollarSign, Droplets, Zap, RotateCw, TrendingUp } from "lucide-react";

interface TelemetrySectionProps {
  telemetry: TelemetrySummary;
  onTimeframeChange: (tf: "daily" | "weekly" | "monthly") => void;
}

export function TelemetrySection({ telemetry, onTimeframeChange }: TelemetrySectionProps) {
  const [activeTf, setActiveTf] = useState<"daily" | "weekly" | "monthly">(telemetry.timeframe);

  const handleSelect = (tf: "daily" | "weekly" | "monthly") => {
    setActiveTf(tf);
    onTimeframeChange(tf);
  };

  const maxCycles = telemetry.hourly_distribution
    ? Math.max(...telemetry.hourly_distribution.map((h) => h.cycles), 1)
    : 1;

  return (
    <div className="space-y-4">
      {/* Timeframe Selector Bar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl border-2 border-slate-300 shadow-xs">
        <div>
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 font-mono">
            Telemetry & Revenue
          </h3>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-300">
          {(["daily", "weekly", "monthly"] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => handleSelect(tf)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg capitalize transition-all ${
                activeTf === tf
                  ? "bg-white text-slate-900 shadow-2xs font-extrabold border border-slate-300"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Revenue Card */}
        <div className="bg-white p-5 rounded-2xl border-2 border-slate-300 shadow-xs hover:border-slate-400 transition-colors flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">Gross Revenue</span>
            <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
              RM {(telemetry.revenue_myr ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-emerald-700 font-bold flex items-center gap-0.5 mt-1 font-mono">
              <TrendingUp className="w-3.5 h-3.5" />
              +12.4%
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-msu-light text-msu flex items-center justify-center font-bold border-2 border-msu-border/40 shadow-inner">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        {/* Total Cycles */}
        <div className="bg-white p-5 rounded-2xl border-2 border-slate-300 shadow-xs hover:border-slate-400 transition-colors flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">Cycles Run</span>
            <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
              {telemetry.total_cycles ?? 0}
            </div>
            <span className="text-[11px] text-slate-500 font-bold mt-1 block font-mono">
              Fleet Total
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold border-2 border-blue-200 shadow-inner">
            <RotateCw className="w-6 h-6" />
          </div>
        </div>

        {/* Water Consumption */}
        <div className="bg-white p-5 rounded-2xl border-2 border-slate-300 shadow-xs hover:border-slate-400 transition-colors flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">Water Usage</span>
            <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
              {(telemetry.water_liters ?? 0).toLocaleString()} <span className="text-sm font-bold text-slate-500 font-sans">L</span>
            </div>
            <span className="text-[11px] text-slate-500 font-bold mt-1 block font-mono">
              Washers
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-cyan-50 text-cyan-700 flex items-center justify-center font-bold border-2 border-cyan-200 shadow-inner">
            <Droplets className="w-6 h-6" />
          </div>
        </div>

        {/* Electrical Energy */}
        <div className="bg-white p-5 rounded-2xl border-2 border-slate-300 shadow-xs hover:border-slate-400 transition-colors flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-mono">Electricity</span>
            <div className="text-2xl font-black text-slate-900 mt-1 font-mono">
              {(telemetry.power_kwh ?? 0).toFixed(1)} <span className="text-sm font-bold text-slate-500 font-sans">kWh</span>
            </div>
            <span className="text-[11px] text-slate-500 font-bold mt-1 block font-mono">
              Total Grid
            </span>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold border-2 border-amber-200 shadow-inner">
            <Zap className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Hourly / Peak Distribution Visualizer */}
      {telemetry.hourly_distribution && (
        <div className="bg-white p-5 rounded-2xl border-2 border-slate-300 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 font-mono">
              Hourly Load Profile
            </h4>
          </div>
          <div className="flex items-end gap-3 h-32 pt-2">
            {telemetry.hourly_distribution.map((item) => {
              const heightPercent = (item.cycles / maxCycles) * 100;
              return (
                <div key={item.hour} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="text-[10px] font-black font-mono text-slate-900">{item.cycles}</span>
                  <div className="w-full bg-slate-200 rounded-t-md h-full flex items-end overflow-hidden border-t border-x border-slate-300">
                    <div
                      className="w-full bg-msu hover:bg-msu-dark transition-all rounded-t-md"
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 font-mono">{item.hour}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
