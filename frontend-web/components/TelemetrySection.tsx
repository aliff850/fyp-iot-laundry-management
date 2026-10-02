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
      <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Branch Consumption & Revenue Telemetry</h3>
          <p className="text-xs text-slate-500">Live analytics for branch operations and utility overhead</p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          {(["daily", "weekly", "monthly"] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => handleSelect(tf)}
              className={`px-3 py-1 text-xs font-semibold rounded-md capitalize transition-all ${
                activeTf === tf
                  ? "bg-white text-slate-900 shadow-xs font-bold"
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
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Revenue</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1 font-mono">
              RM {(telemetry.revenue_myr ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
            <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5 mt-1">
              <TrendingUp className="w-3 h-3" />
              +12.4% vs previous {activeTf}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-msu-light text-msu flex items-center justify-center font-bold">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        {/* Total Cycles */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Completed Cycles</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1 font-mono">
              {telemetry.total_cycles ?? 0}
            </div>
            <span className="text-[10px] text-slate-500 font-medium mt-1 block">
              Across 8 branch machines
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <RotateCw className="w-5 h-5" />
          </div>
        </div>

        {/* Water Consumption */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Water Consumption</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1 font-mono">
              {(telemetry.water_liters ?? 0).toLocaleString()} <span className="text-xs font-semibold text-slate-500">L</span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium mt-1 block">
              ~45 L per washer cycle
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center font-bold">
            <Droplets className="w-5 h-5" />
          </div>
        </div>

        {/* Electrical Energy */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Electrical Energy</span>
            <div className="text-2xl font-extrabold text-slate-900 mt-1 font-mono">
              {(telemetry.power_kwh ?? 0).toFixed(1)} <span className="text-xs font-semibold text-slate-500">kWh</span>
            </div>
            <span className="text-[10px] text-slate-500 font-medium mt-1 block">
              Motors & control systems
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Zap className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Hourly / Peak Distribution Visualizer */}
      {telemetry.hourly_distribution && (
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-4">
            Peak Operating Hours (Cycle Density)
          </h4>
          <div className="flex items-end gap-3 h-32 pt-4">
            {telemetry.hourly_distribution.map((item) => {
              const heightPercent = (item.cycles / maxCycles) * 100;
              return (
                <div key={item.hour} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="text-[10px] font-bold font-mono text-slate-700">{item.cycles}</span>
                  <div className="w-full bg-slate-100 rounded-t-md h-full flex items-end overflow-hidden">
                    <div
                      className="w-full bg-msu hover:bg-msu-dark transition-all rounded-t-md"
                      style={{ height: `${heightPercent}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400 font-mono">{item.hour}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
