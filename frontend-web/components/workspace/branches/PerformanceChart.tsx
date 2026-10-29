"use client";

import React, { useId, useMemo, useState } from "react";
import { Activity, BarChart3, Building2, Calendar, DollarSign, Flame, WashingMachine } from "lucide-react";
import type { WorkspaceBranch } from "@/lib/auth/business";

export type TimeframeMode = "daily" | "weekly" | "monthly";
export type MetricKey = "revenue" | "cycles" | "utilization" | "lpg";

export interface PerformanceDataPoint {
  timestamp: string;
  label: string;
  revenue_myr?: number;
  cycle_count?: number;
  utilization_pct?: number;
  lpg_kg?: number;
}

export interface PerformanceChartProps {
  branches: WorkspaceBranch[];
  data?: PerformanceDataPoint[];
}

interface MetricConfig {
  key: MetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  formatValue: (v: number | undefined) => string;
  color: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
}

const METRICS: Record<MetricKey, MetricConfig> = {
  revenue: {
    key: "revenue",
    label: "Total Revenue",
    shortLabel: "Revenue",
    unit: "MYR",
    formatValue: v => (v !== undefined ? `RM ${v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"),
    color: "#79c5a6", // positive mint token
    icon: DollarSign,
  },
  cycles: {
    key: "cycles",
    label: "Machine Cycles",
    shortLabel: "Cycles",
    unit: "cycles",
    formatValue: v => (v !== undefined ? v.toLocaleString() : "—"),
    color: "#ef6268", // accent coral token
    icon: WashingMachine,
  },
  utilization: {
    key: "utilization",
    label: "Fleet Utilization",
    shortLabel: "Utilization",
    unit: "%",
    formatValue: v => (v !== undefined ? `${v.toFixed(1)}%` : "—"),
    color: "#dfb463", // warning amber token
    icon: Activity,
  },
  lpg: {
    key: "lpg",
    label: "LPG Consumed",
    shortLabel: "LPG Gas",
    unit: "kg",
    formatValue: v => (v !== undefined ? `${v.toFixed(1)} kg` : "—"),
    color: "#b4b4ba", // muted text token
    icon: Flame,
  },
};

export function PerformanceChart({ branches, data = [] }: PerformanceChartProps) {
  const [timeframe, setTimeframe] = useState<TimeframeMode>("daily");
  const [activeMetric, setActiveMetric] = useState<MetricKey>("revenue");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");

  const chartTitleId = useId();

  // Generate truthful placeholder timeline labels for the selected timeframe
  const timelineTicks = useMemo(() => {
    if (timeframe === "daily") {
      const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
      return days.map(d => ({ label: d }));
    }
    if (timeframe === "weekly") {
      return [{ label: "W1" }, { label: "W2" }, { label: "W3" }, { label: "W4" }];
    }
    return [
      { label: "Jan" },
      { label: "Feb" },
      { label: "Mar" },
      { label: "Apr" },
      { label: "May" },
      { label: "Jun" },
      { label: "Jul" },
      { label: "Aug" },
      { label: "Sep" },
      { label: "Oct" },
      { label: "Nov" },
      { label: "Dec" },
    ];
  }, [timeframe]);

  const activeBranchLabel = useMemo(() => {
    if (selectedBranchId === "all") return "All branches";
    const found = branches.find(b => b.id === selectedBranchId);
    return found ? found.name : "All branches";
  }, [branches, selectedBranchId]);

  const metric = METRICS[activeMetric];

  // SVG Chart Dimensions
  const svgWidth = 800;
  const svgHeight = 220;
  const padLeft = 45;
  const padRight = 20;
  const padTop = 25;
  const padBottom = 35;
  const plotWidth = svgWidth - padLeft - padRight;
  const plotHeight = svgHeight - padTop - padBottom;

  const hasData = data.length > 0;

  return (
    <section
      className="rounded-md border border-line bg-surface p-5 md:p-6"
      aria-labelledby={chartTitleId}
    >
      {/* Header Row: Title, Subtitle, and Timeframe / Branch Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <div>
          <h2 id={chartTitleId} className="text-base font-semibold text-ink">
            Operations Performance
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Multi-branch summary across revenue, completed cycles, utilization and fuel
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Branch Filter (if multiple branches exist) */}
          {branches.length > 1 && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="branch-filter" className="sr-only">
                Filter by branch
              </label>
              <div className="relative inline-flex items-center">
                <Building2 className="pointer-events-none absolute left-2.5 size-3.5 text-faint" aria-hidden="true" />
                <select
                  id="branch-filter"
                  value={selectedBranchId}
                  onChange={e => setSelectedBranchId(e.target.value)}
                  className="min-h-8 rounded-md border border-line bg-navy pl-8 pr-6 py-1 text-xs text-ink transition-colors hover:border-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <option value="all">All branches ({branches.length})</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Timeframe Filter (Daily, Weekly, Monthly) */}
          <div
            className="inline-flex items-center gap-1 rounded-md border border-line bg-navy p-1 text-xs"
            role="group"
            aria-label="Select analytics timeframe"
          >
            {(["daily", "weekly", "monthly"] as const).map(tf => {
              const isSelected = timeframe === tf;
              return (
                <button
                  key={tf}
                  type="button"
                  onClick={() => setTimeframe(tf)}
                  aria-pressed={isSelected}
                  className={`inline-flex min-h-7 items-center rounded px-2.5 py-1 text-xs capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${isSelected
                    ? "bg-navy-selected font-semibold text-ink border border-line"
                    : "text-muted hover:text-ink"
                    }`}
                >
                  {tf}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4 Summary Metric Tiles */}
      <div
        className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4"
        aria-label="Performance indicators summary"
      >
        {(Object.keys(METRICS) as MetricKey[]).map(key => {
          const cfg = METRICS[key];
          const Icon = cfg.icon;
          const isActive = activeMetric === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveMetric(key)}
              aria-pressed={isActive}
              className={`flex flex-col justify-between rounded-md border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${isActive
                ? "border-line bg-navy"
                : "border-line bg-surface hover:bg-raised"
                }`}
            >
              <div className="flex items-center justify-between text-muted">
                <span className="flex items-center gap-1.5 text-xs">
                  <Icon className="size-3.5" aria-hidden="true" />
                  {cfg.shortLabel}
                </span>
                <span className="text-[11px] text-faint capitalize">{timeframe}</span>
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-xl font-semibold text-ink tabular-nums">
                  {cfg.formatValue(undefined)}
                </span>
                {cfg.unit && (
                  <span className="ml-1 text-xs text-muted font-normal">
                    {cfg.unit}
                  </span>
                )}
              </div>
              <span className="mt-1 text-[11px] text-faint">
                Awaiting telemetry
              </span>
            </button>
          );
        })}
      </div>

      {/* Metric Focus Navigation Tabs */}
      <div className="mt-4 flex min-w-0 gap-4 overflow-x-auto border-b border-line text-xs">
        {(Object.keys(METRICS) as MetricKey[]).map(key => {
          const cfg = METRICS[key];
          const isSelected = activeMetric === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveMetric(key)}
              aria-pressed={isSelected}
              className={`min-h-9 shrink-0 whitespace-nowrap border-b-2 py-2 font-medium transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${isSelected
                ? "border-accent text-ink font-semibold"
                : "border-transparent text-muted"
                }`}
            >
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Chart Canvas Area */}
      <div className="relative mt-4 rounded-md border border-rule bg-canvas/60 p-3 md:p-5 overflow-hidden">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-56 md:h-64 select-none"
          aria-label={`${metric.label} chart for ${timeframe} timeframe`}
          role="img"
        >
          {/* Horizontal Background Gridlines */}
          {[0, 0.33, 0.66, 1].map((ratio, index) => {
            const y = padTop + plotHeight * ratio;
            return (
              <g key={index}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={svgWidth - padRight}
                  y2={y}
                  stroke="#242328"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-[#94949d] text-[10px] tabular-nums"
                >
                  —
                </text>
              </g>
            );
          })}

          {/* X-Axis Timeline Ticks */}
          {timelineTicks.map((tick, index) => {
            const step = plotWidth / (timelineTicks.length - 1 || 1);
            const x = padLeft + index * step;
            return (
              <g key={index}>
                <line
                  x1={x}
                  y1={padTop + plotHeight}
                  x2={x}
                  y2={padTop + plotHeight + 5}
                  stroke="#2c2b30"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={padTop + plotHeight + 18}
                  textAnchor="middle"
                  className="fill-[#94949d] text-[11px] tabular-nums"
                >
                  {tick.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Blank / Pending State Overlay (Truthful Presentation per DESIGN.md Section 5.2) */}
        {!hasData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center backdrop-blur-[1px]">
            <div className="max-w-md rounded-md border border-line bg-surface/95 px-6 py-5 shadow-lg">
              <div className="inline-flex size-10 items-center justify-center rounded-md border border-line bg-raised mb-3">
                <BarChart3 className="size-5 text-accent" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-ink">
                No {metric.shortLabel.toLowerCase()} records recorded yet
              </h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                Aggregated {timeframe} metrics for {metric.label.toLowerCase()} across {activeBranchLabel.toLowerCase()} will appear once physical gateway telemetry or machine service syncs are active.
              </p>
              {/* Pointless message */}
              {/* <div className="mt-3.5 inline-flex items-center gap-1.5 rounded border border-line bg-raised px-2.5 py-1 text-xs text-muted">
                <Activity className="size-3 text-warning" aria-hidden="true" />
                <span>Status: Awaiting gateway batch sync</span>
              </div> */}
            </div>
          </div>
        )}
      </div>

      {/* Footer Provenance & Scope */}
      {/* Not needed */}
      {/* <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-3 text-xs text-faint">
        <div className="flex items-center gap-1.5">
          <Calendar className="size-3.5 text-faint" aria-hidden="true" />
          <span>
            Scope: {activeBranchLabel} · Currency: Malaysian Ringgit (MYR)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span>Telemetry provider: Cloud sync</span>
          <span className="inline-block size-1.5 rounded-full bg-warning" aria-hidden="true" />
          <span className="text-muted">No measurements available yet</span>
        </div>
      </div> */}
    </section>
  );
}
