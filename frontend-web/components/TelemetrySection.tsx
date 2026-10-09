"use client";

import React, { useState } from "react";
import { TelemetrySummary } from "@/types";
import { DollarSign, Droplet, Zap, Flame, BarChart3 } from "lucide-react";

interface TelemetrySectionProps {
  telemetry: TelemetrySummary;
  onTimeframeChange: (tf: "daily" | "weekly" | "monthly") => Promise<void>;
}

export function TelemetrySection({ telemetry, onTimeframeChange }: TelemetrySectionProps) {
  const [selectedTf, setSelectedTf] = useState<"daily" | "weekly" | "monthly">(telemetry.timeframe || "daily");
  const [isUpdating, setIsUpdating] = useState(false);

  const handleSelect = async (tf: "daily" | "weekly" | "monthly") => {
    setSelectedTf(tf);
    setIsUpdating(true);
    await onTimeframeChange(tf);
    setIsUpdating(false);
  };

  const lpgKg = telemetry.lpg_consumed_kg ?? (selectedTf === "daily" ? 14.8 : selectedTf === "weekly" ? 105.0 : 442.0);
  const efficiency = telemetry.gas_efficiency_kg_per_cycle ?? 0.38;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-4">
      {/* Header and Timeframe Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-msu-light text-msu flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-800 leading-tight truncate">
              Telemetry & Analytics
            </h3>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider truncate">
              Resource footprint & revenue metrics
            </p>
          </div>
        </div>

        {/* Timeframe Selector Segmented Control */}
        <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
          {(["daily", "weekly", "monthly"] as const).map((tf) => (
            <button
              key={tf}
              onClick={() => handleSelect(tf)}
              disabled={isUpdating}
              className={`px-3 py-1.5 rounded-md capitalize transition-all ${
                selectedTf === tf
                  ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Metric Cards: 2-column or 4-column responsive grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* Revenue */}
        <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-emerald-600" />
              Revenue
            </span>
            <span className="text-green-700 font-semibold">+8.4%</span>
          </div>
          <div className="my-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              RM {telemetry.revenue_myr.toFixed(2)}
            </span>
          </div>
          <div className="text-xs text-slate-500 pt-1.5 border-t border-slate-100 font-medium truncate">
            {telemetry.total_cycles} total cycles
          </div>
        </div>

        {/* Water Volume */}
        <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Droplet className="w-4 h-4 text-blue-600" />
              Water Volume
            </span>
            <span className="text-blue-700 font-semibold">Inlet</span>
          </div>
          <div className="my-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {telemetry.water_liters.toLocaleString()}
            </span>
            <span className="text-xs font-medium text-slate-500 ml-1">Liters</span>
          </div>
          <div className="text-xs text-slate-500 pt-1.5 border-t border-slate-100 font-medium truncate">
            Avg ~45L / cycle
          </div>
        </div>

        {/* Electricity Energy */}
        <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-600" />
              Electricity
            </span>
            <span className="text-amber-700 font-semibold">Submeter</span>
          </div>
          <div className="my-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {telemetry.power_kwh.toFixed(1)}
            </span>
            <span className="text-xs font-medium text-slate-500 ml-1">kWh</span>
          </div>
          <div className="text-xs text-slate-500 pt-1.5 border-t border-slate-100 font-medium truncate">
            Fleet power draw
          </div>
        </div>

        {/* LPG Burned & Efficiency */}
        <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200 bg-white flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-orange-600" />
              LPG Fuel
            </span>
            <span className="text-orange-700 font-semibold">{efficiency.toFixed(2)} kg/cyc</span>
          </div>
          <div className="my-2">
            <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
              {lpgKg.toFixed(1)}
            </span>
            <span className="text-xs font-medium text-slate-500 ml-1">kg</span>
          </div>
          <div className="text-xs text-slate-500 pt-1.5 border-t border-slate-100 font-medium truncate">
            Burn efficiency metric
          </div>
        </div>
      </div>
    </div>
  );
}
