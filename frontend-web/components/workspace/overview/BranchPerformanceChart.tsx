"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import Chart from "chart.js/auto";
import type { ChartConfiguration } from "chart.js";
import {
  BarChart3,
  Building2,
  DollarSign,
  Droplets,
  Flame,
  WashingMachine,
} from "lucide-react";
import type { BranchDetail } from "@/lib/auth/business";

export type BranchTimeframeMode = "daily" | "weekly" | "monthly";
export type BranchMetricKey = "revenue" | "cycles" | "water" | "gas";

export interface BranchPerformanceDataPoint {
  timestamp: string;
  label: string;
  revenue_myr?: number;
  cycle_count?: number;
  water_l?: number;
  gas_kg?: number;
}

export interface BranchPerformanceSummary {
  today_revenue_myr: number | null;
  today_cycles: number | null;
  fleet_utilization_rate: number | null;
  lpg_consumed_kg: number | null;
}

export interface BranchPerformanceChartProps {
  /** Single-branch mode: statistics scoped strictly to one specific branch */
  branch?: Pick<BranchDetail, "id" | "name">;
  /** Multi-branch mode: statistics across multiple branches on /branches */
  branches?: Array<Pick<BranchDetail, "id" | "name">>;
  performance?: BranchPerformanceSummary | null;
  performanceByBranch?: Record<string, BranchPerformanceSummary | null | undefined>;
  data?: BranchPerformanceDataPoint[];
  dataByBranch?: Record<string, BranchPerformanceDataPoint[] | undefined>;
}

interface MetricConfig {
  key: BranchMetricKey;
  label: string;
  shortLabel: string;
  unit: string;
  color: string;
  bgColor: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;
  getValue: (
    timeframe: BranchTimeframeMode,
    performance?: BranchPerformanceSummary | null,
    data?: BranchPerformanceDataPoint[]
  ) => { value: string; isReal: boolean };
}

const BRANCH_SERIES_COLORS = [
  "#79c5a6",
  "#ef6268",
  "#5ea1e0",
  "#dfb463",
  "#a78bfa",
  "#f472b6",
];

const METRICS: Record<BranchMetricKey, MetricConfig> = {
  revenue: {
    key: "revenue",
    label: "Cumulative Revenue",
    shortLabel: "Revenue",
    unit: "MYR",
    color: "#79c5a6", // positive mint token
    bgColor: "rgba(121, 197, 166, 0.12)",
    icon: DollarSign,
    getValue: (timeframe, perf) => {
      if (timeframe === "daily" && perf?.today_revenue_myr != null) {
        return {
          value: `RM ${perf.today_revenue_myr.toFixed(2)}`,
          isReal: true,
        };
      }
      return { value: "—", isReal: false };
    },
  },
  cycles: {
    key: "cycles",
    label: "Machine Cycles",
    shortLabel: "Cycles",
    unit: "cycles",
    color: "#ef6268", // accent coral token
    bgColor: "rgba(239, 98, 104, 0.12)",
    icon: WashingMachine,
    getValue: (timeframe, perf) => {
      if (timeframe === "daily" && perf?.today_cycles != null) {
        return {
          value: perf.today_cycles.toLocaleString(),
          isReal: true,
        };
      }
      return { value: "—", isReal: false };
    },
  },
  water: {
    key: "water",
    label: "Cumulative Water Usage",
    shortLabel: "Water Usage",
    unit: "L",
    color: "#5ea1e0", // water blue token
    bgColor: "rgba(94, 161, 224, 0.12)",
    icon: Droplets,
    getValue: () => {
      // Water meters await edge IoT pulse counter sync
      return { value: "—", isReal: false };
    },
  },
  gas: {
    key: "gas",
    label: "Cumulative Gas Usage",
    shortLabel: "LPG Gas",
    unit: "kg",
    color: "#dfb463", // warning amber token
    bgColor: "rgba(223, 180, 99, 0.12)",
    icon: Flame,
    getValue: (timeframe, perf) => {
      if (timeframe === "daily" && perf?.lpg_consumed_kg != null) {
        return {
          value: `${perf.lpg_consumed_kg.toFixed(1)} kg`,
          isReal: true,
        };
      }
      return { value: "—", isReal: false };
    },
  },
};

function extractPointMetric(
  pt: BranchPerformanceDataPoint | undefined,
  activeMetric: BranchMetricKey
): number | null {
  if (!pt) return null;
  if (activeMetric === "revenue") return pt.revenue_myr ?? null;
  if (activeMetric === "cycles") return pt.cycle_count ?? null;
  if (activeMetric === "water") return pt.water_l ?? null;
  if (activeMetric === "gas") return pt.gas_kg ?? null;
  return null;
}

export function BranchPerformanceChart({
  branch,
  branches,
  performance,
  performanceByBranch,
  data = [],
  dataByBranch,
}: BranchPerformanceChartProps) {
  const isMultiBranchMode = Array.isArray(branches) && !branch;
  const branchList = useMemo(() => branches ?? (branch ? [branch] : []), [branches, branch]);

  const [timeframe, setTimeframe] = useState<BranchTimeframeMode>("daily");
  const [activeMetric, setActiveMetric] = useState<BranchMetricKey>("revenue");
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  const chartTitleId = useId();
  const branchFilterId = useId();

  // Active scope label (single branch vs all branches vs filtered branch in multi-branch view)
  const activeScopeLabel = useMemo(() => {
    if (!isMultiBranchMode) {
      return branch?.name ?? "this branch";
    }
    if (selectedBranchId === "all") {
      return branchList.length > 1
        ? `all ${branchList.length} branches`
        : branchList[0]?.name ?? "all branches";
    }
    const found = branchList.find(b => b.id === selectedBranchId);
    return found ? found.name : "all branches";
  }, [isMultiBranchMode, branch, branchList, selectedBranchId]);

  // Effective performance summary for the currently active scope
  const effectivePerformance = useMemo<BranchPerformanceSummary | null | undefined>(() => {
    if (!isMultiBranchMode) {
      return performance;
    }
    if (selectedBranchId !== "all") {
      if (performanceByBranch && selectedBranchId in performanceByBranch) {
        return performanceByBranch[selectedBranchId];
      }
      return performance;
    }
    if (performanceByBranch) {
      const summaries = branchList
        .map(b => performanceByBranch[b.id])
        .filter((s): s is BranchPerformanceSummary => s != null);
      if (summaries.length === 0) return performance ?? null;

      const sumNullable = (
        getter: (s: BranchPerformanceSummary) => number | null
      ): number | null => {
        const vals = summaries.map(getter).filter((v): v is number => v != null);
        return vals.length > 0 ? vals.reduce((acc, v) => acc + v, 0) : null;
      };

      const utilVals = summaries
        .map(s => s.fleet_utilization_rate)
        .filter((v): v is number => v != null);

      return {
        today_revenue_myr: sumNullable(s => s.today_revenue_myr),
        today_cycles: sumNullable(s => s.today_cycles),
        fleet_utilization_rate:
          utilVals.length > 0
            ? utilVals.reduce((acc, v) => acc + v, 0) / utilVals.length
            : null,
        lpg_consumed_kg: sumNullable(s => s.lpg_consumed_kg),
      };
    }
    return performance;
  }, [isMultiBranchMode, selectedBranchId, performance, performanceByBranch, branchList]);

  // Effective series data
  const effectiveData = useMemo<BranchPerformanceDataPoint[]>(() => {
    if (!isMultiBranchMode) {
      return data;
    }
    if (selectedBranchId !== "all" && dataByBranch) {
      return dataByBranch[selectedBranchId] ?? [];
    }
    return data;
  }, [isMultiBranchMode, selectedBranchId, data, dataByBranch]);

  const hasMultiBranchSeries = useMemo(() => {
    if (!isMultiBranchMode || selectedBranchId !== "all" || !dataByBranch) return false;
    return branchList.some(b => (dataByBranch[b.id]?.length ?? 0) > 0);
  }, [isMultiBranchMode, selectedBranchId, dataByBranch, branchList]);

  // Timeline labels per timeframe
  const timelineLabels = useMemo(() => {
    if (timeframe === "daily") {
      return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    }
    if (timeframe === "weekly") {
      return ["Week 1", "Week 2", "Week 3", "Week 4"];
    }
    return [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
  }, [timeframe]);

  const metric = METRICS[activeMetric];
  const hasData = effectiveData.length > 0 || hasMultiBranchSeries;

  // Mount and update Chart.js instance
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Destroy any existing chart
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    const datasets =
      hasMultiBranchSeries && dataByBranch
        ? branchList.map((b, branchIdx) => {
            const branchSeries = dataByBranch[b.id] ?? [];
            const color =
              BRANCH_SERIES_COLORS[branchIdx % BRANCH_SERIES_COLORS.length];
            return {
              label: `${b.name} — ${metric.shortLabel}`,
              data: timelineLabels.map((_, idx) =>
                extractPointMetric(branchSeries[idx], activeMetric)
              ),
              borderColor: color,
              backgroundColor: "transparent",
              borderWidth: 2,
              tension: 0.35,
              fill: false,
              pointBackgroundColor: color,
              pointBorderColor: "#131217",
              pointBorderWidth: 2,
              pointRadius: branchSeries.length > 0 ? 4 : 0,
              pointHoverRadius: 6,
            };
          })
        : [
            {
              label: metric.label,
              data: timelineLabels.map((_, idx) =>
                hasData ? extractPointMetric(effectiveData[idx], activeMetric) : null
              ),
              borderColor: metric.color,
              backgroundColor: metric.bgColor,
              borderWidth: 2,
              tension: 0.35,
              fill: true,
              pointBackgroundColor: metric.color,
              pointBorderColor: "#131217",
              pointBorderWidth: 2,
              pointRadius: hasData ? 4 : 0,
              pointHoverRadius: 6,
            },
          ];

    const chartConfig: ChartConfiguration<"line"> = {
      type: "line",
      data: {
        labels: timelineLabels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: hasMultiBranchSeries,
            labels: {
              color: "#b4b4ba",
              boxWidth: 10,
              font: {
                family: "ui-sans-serif, system-ui, sans-serif",
                size: 11,
              },
            },
          },
          tooltip: {
            enabled: hasData,
            backgroundColor: "#131217",
            borderColor: "#2c2b30",
            borderWidth: 1,
            titleColor: "#f2f2f3",
            bodyColor: "#b4b4ba",
            padding: 10,
            cornerRadius: 4,
            callbacks: {
              label: context => {
                const val = context.parsed.y;
                if (val === null || val === undefined) {
                  return `${context.dataset.label}: —`;
                }
                if (activeMetric === "revenue") return `Revenue: RM ${val.toFixed(2)}`;
                if (activeMetric === "cycles") return `Cycles: ${val}`;
                if (activeMetric === "water") return `Water: ${val} L`;
                if (activeMetric === "gas") return `Gas: ${val} kg`;
                return `${context.dataset.label}: ${val}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              color: "#242328",
              tickColor: "#2c2b30",
            },
            ticks: {
              color: "#94949d",
              font: {
                family: "ui-sans-serif, system-ui, sans-serif",
                size: 11,
              },
            },
          },
          y: {
            beginAtZero: true,
            grid: {
              color: "#242328",
              tickColor: "#2c2b30",
            },
            ticks: {
              color: "#94949d",
              font: {
                family: "ui-sans-serif, system-ui, sans-serif",
                size: 11,
              },
              callback: value => (hasData ? `${value}` : "—"),
            },
          },
        },
      },
    };

    const newChart = new Chart(canvas, chartConfig);
    chartInstanceRef.current = newChart;

    return () => {
      newChart.destroy();
      chartInstanceRef.current = null;
    };
  }, [
    timelineLabels,
    activeMetric,
    metric,
    hasData,
    effectiveData,
    hasMultiBranchSeries,
    dataByBranch,
    branchList,
  ]);

  return (
    <section
      className="rounded-md border border-line bg-surface p-5 md:p-6"
      aria-labelledby={chartTitleId}
    >
      {/* Header Row: Title and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <div>
          <h2 id={chartTitleId} className="text-base font-semibold text-ink">
            Branch Performance & Resource Analytics
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {isMultiBranchMode
              ? `Multi-branch telemetry and resource consumption across ${activeScopeLabel}`
              : `Telemetry and resource consumption for ${activeScopeLabel} across revenue, cycles, water and LPG fuel`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Multi-Branch Filter Selector (only rendered in multi-branch mode when >1 branch exists) */}
          {isMultiBranchMode && branchList.length > 1 && (
            <div className="flex items-center gap-1.5">
              <label htmlFor={branchFilterId} className="sr-only">
                Filter by branch
              </label>
              <div className="relative inline-flex items-center">
                <Building2
                  className="pointer-events-none absolute left-2.5 size-3.5 text-faint"
                  aria-hidden="true"
                />
                <select
                  id={branchFilterId}
                  aria-label="Filter by branch"
                  value={selectedBranchId}
                  onChange={e => setSelectedBranchId(e.target.value)}
                  className="min-h-8 rounded-md border border-line bg-navy pl-8 pr-6 py-1 text-xs text-ink transition-colors hover:border-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <option value="all">All branches ({branchList.length})</option>
                  {branchList.map(b => (
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
                  className={`inline-flex min-h-7 items-center rounded px-2.5 py-1 text-xs capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${
                    isSelected
                      ? "border border-line bg-navy-selected font-semibold text-ink"
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
        {(Object.keys(METRICS) as BranchMetricKey[]).map(key => {
          const cfg = METRICS[key];
          const Icon = cfg.icon;
          const isActive = activeMetric === key;
          const reading = cfg.getValue(timeframe, effectivePerformance, effectiveData);

          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveMetric(key)}
              aria-pressed={isActive}
              className={`flex flex-col justify-between rounded-md border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                isActive
                  ? "border-line bg-navy"
                  : "border-line bg-surface hover:bg-raised"
              }`}
            >
              <div className="flex items-center justify-between text-muted">
                <span className="flex items-center gap-1.5 text-xs">
                  <Icon className="size-3.5" aria-hidden="true" />
                  {cfg.shortLabel}
                </span>
                <span className="text-[11px] capitalize text-faint">{timeframe}</span>
              </div>
              <div className="mt-2 flex items-baseline">
                <span className="text-xl font-semibold text-ink tabular-nums">
                  {reading.value}
                </span>
              </div>
              <span className="mt-1 text-[11px] text-faint">
                {reading.isReal ? "Recorded telemetry" : "Awaiting telemetry"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Metric Focus Navigation Tabs */}
      <div className="mt-4 flex min-w-0 gap-4 overflow-x-auto border-b border-line text-xs">
        {(Object.keys(METRICS) as BranchMetricKey[]).map(key => {
          const cfg = METRICS[key];
          const isSelected = activeMetric === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveMetric(key)}
              aria-pressed={isSelected}
              className={`min-h-9 shrink-0 whitespace-nowrap border-b-2 py-2 font-medium transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${
                isSelected
                  ? "border-accent font-semibold text-ink"
                  : "border-transparent text-muted"
              }`}
            >
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Chart.js Canvas Area */}
      <div className="relative mt-4 h-64 w-full overflow-hidden rounded-md border border-rule bg-canvas/60 p-3 md:p-5">
        <canvas
          ref={canvasRef}
          aria-label={`${metric.label} chart for ${timeframe} timeframe`}
          role="img"
        />

        {/* Blank / Pending State Overlay (Truthful Presentation per DESIGN.md Section 5.2) */}
        {!hasData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center backdrop-blur-[1px]">
            <div className="max-w-md rounded-md border border-line bg-surface/95 px-6 py-5 shadow-lg">
              <div className="mb-3 inline-flex size-10 items-center justify-center rounded-md border border-line bg-raised">
                <BarChart3 className="size-5 text-accent" aria-hidden="true" />
              </div>
              <h3 className="text-sm font-semibold text-ink">
                No {metric.shortLabel.toLowerCase()} records recorded yet
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Aggregated {timeframe} metrics for {metric.label.toLowerCase()} across {activeScopeLabel} will appear once physical gateway telemetry or machine service syncs are active.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
