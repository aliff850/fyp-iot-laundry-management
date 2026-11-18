"use client";

import React, { useMemo, useRef, useState, useTransition } from "react";
import type { ChartConfiguration } from "chart.js/auto";
import {
  fetchBranchOverviewAnalytics,
  type FetchOverviewAnalyticsResult,
} from "@/app/branches/[branchId]/overview/actions";
import type {
  BranchOverviewAnalytics,
  OverviewAnalyticsPeriod,
  WorkspaceBranch,
} from "@/lib/auth/business";
import {
  ChartCanvas,
  withHexAlpha,
  type ResolvedTheme,
} from "@/components/workspace/branches/ChartCanvas";
import { BusinessInsightsSections } from "@/components/workspace/branches/BusinessInsightsSections";

export type MachineMetricView = "cycles" | "runtime" | "revenue";

export interface PerformanceChartProps {
  branchId: string;
  initialAnalytics: BranchOverviewAnalytics | null;
  initialError?: string | null;
  branches?: Array<Pick<WorkspaceBranch, "id" | "name">>;
  showMachineMetrics?: boolean;
  showBusinessInsights?: boolean;
  onFetchPeriod?: (
    branchId: string,
    period: OverviewAnalyticsPeriod
  ) => Promise<FetchOverviewAnalyticsResult>;
}

const PERIOD_OPTIONS: { key: OverviewAnalyticsPeriod; label: string }[] = [
  { key: "day", label: "Today" },
  { key: "week", label: "7 days" },
  { key: "month", label: "30 days" },
];

const METRIC_OPTIONS: { key: MachineMetricView; label: string }[] = [
  { key: "cycles", label: "Completed cycles" },
  { key: "runtime", label: "Running minutes" },
  { key: "revenue", label: "Estimated revenue" },
];

function emptyFallbackAnalytics(branchId: string, period: OverviewAnalyticsPeriod): BranchOverviewAnalytics {
  return {
    branch_id: branchId,
    period,
    granularity: period === "day" ? "hour" : "day",
    timezone: "Asia/Kuala_Lumpur",
    coverage: "recorded_cloud_telemetry",
    summary: {
      completed_cycles: 0,
      running_seconds: 0,
      running_minutes: 0,
      estimated_revenue_myr: "0.00",
      avg_gas_ppm: null,
      gas_node_count: 0,
      total_lpg_nodes: 0,
      gas_aggregation_mode: "uncalibrated",
      complaints_total: null,
    },
    programs: [],
    machines: [],
    revenue_series: [],
    gas_series: {
      aggregation_mode: "uncalibrated",
      node_count: 0,
      nodes: [],
      series: [],
    },
    complaints: {
      implemented: false,
      source: "deferred_customer_app",
      total: null,
      series: [],
    },
  };
}

export function selectRevenueSeriesValues(analytics: Pick<BranchOverviewAnalytics, "period" | "granularity" | "revenue_series">): {
  isHourly: boolean;
  heading: string;
  datasetLabel: string;
  values: number[];
} {
  const isHourly = analytics.period === "day" || analytics.granularity === "hour";
  return {
    isHourly,
    heading: isHourly ? "Hourly estimated revenue" : "Daily estimated revenue",
    datasetLabel: isHourly ? "Hourly revenue (RM)" : "Daily revenue (RM)",
    values: analytics.revenue_series.map((pt) => Number(pt.period_revenue_myr || 0)),
  };
}

export function PerformanceChart({
  branchId,
  initialAnalytics,
  initialError = null,
  branches,
  showMachineMetrics = true,
  showBusinessInsights = false,
  onFetchPeriod,
}: PerformanceChartProps) {
  const multiBranchMode = branches !== undefined;
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    multiBranchMode ? branchId || "all" : branchId
  );
  const [period, setPeriod] = useState<OverviewAnalyticsPeriod>(
    initialAnalytics?.period ?? "day"
  );
  const [metricView, setMetricView] = useState<MachineMetricView>("cycles");
  const [analytics, setAnalytics] = useState<BranchOverviewAnalytics | null>(initialAnalytics);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [isPending, startTransition] = useTransition();
  const requestSeqRef = useRef(0);

  const activeData = analytics ?? emptyFallbackAnalytics(selectedBranchId, period);
  const viewingAllBranches =
    multiBranchMode &&
    (analytics ? analytics.branch_id === "all" : selectedBranchId === "all");
  const fetchFn = onFetchPeriod ?? fetchBranchOverviewAnalytics;

  function fetchAnalytics(nextBranchId: string, nextPeriod: OverviewAnalyticsPeriod) {
    const requestId = ++requestSeqRef.current;
    startTransition(async () => {
      const res = await fetchFn(nextBranchId, nextPeriod);
      if (requestSeqRef.current !== requestId) return;
      if (res.ok) {
        setAnalytics(res.data);
        setErrorMessage(null);
      } else {
        setErrorMessage(res.message);
      }
    });
  }

  function handleSelectPeriod(nextPeriod: OverviewAnalyticsPeriod) {
    if (nextPeriod === period && analytics !== null && !errorMessage) return;
    setPeriod(nextPeriod);
    fetchAnalytics(selectedBranchId, nextPeriod);
  }

  function handleSelectBranch(nextBranchId: string) {
    if (nextBranchId === selectedBranchId && analytics !== null && !errorMessage) return;
    setSelectedBranchId(nextBranchId);
    fetchAnalytics(nextBranchId, period);
  }

  const gasLabel = useMemo(() => {
    const gas = activeData.gas_series;
    if (gas.aggregation_mode === "uncalibrated") {
      return "Calibration required";
    }
    if (gas.aggregation_mode === "single_node") {
      const calNode = gas.nodes.find((n) => n.calibrated);
      if (!calNode) return "Single LPG node";
      return viewingAllBranches && calNode.branch_name
        ? `${calNode.label} (${calNode.branch_name})`
        : calNode.label;
    }
    return `${gas.node_count} nodes averaged`;
  }, [activeData, viewingAllBranches]);

  const machineChartConfig = useMemo(() => {
    return (theme: ResolvedTheme): ChartConfiguration => {
      const labels = activeData.machines.map((m) => {
        const name = m.label || m.source_id;
        return viewingAllBranches && m.branch_name ? [name, m.branch_name] : name;
      });
      const programColors = [
        theme.accent,
        theme.positive,
        theme.warning,
        theme.control,
        theme.ink,
        theme.negative,
      ];

      if (metricView === "cycles") {
        const programs = activeData.programs;
        const datasets =
          programs.length > 0
            ? programs.map((prog, idx) => {
                const color = programColors[idx % programColors.length];
                return {
                  label: prog.label,
                  data: activeData.machines.map(
                    (m) => m.cycles_by_program[prog.program_id] ?? 0
                  ),
                  backgroundColor: color,
                  borderRadius: 3,
                };
              })
            : [
                {
                  label: "Completed cycles",
                  data: activeData.machines.map((m) => m.completed_cycles),
                  backgroundColor: theme.accent,
                  borderRadius: 3,
                },
              ];

        return {
          type: "bar",
          data: { labels, datasets },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: theme.reducedMotion ? false : undefined,
            plugins: {
              legend: {
                display: programs.length > 0,
                position: "bottom",
                labels: { color: theme.muted, boxWidth: 12, padding: 14 },
              },
            },
            scales: {
              x: {
                stacked: true,
                ticks: { color: theme.muted },
                grid: { color: theme.rule },
              },
              y: {
                stacked: true,
                beginAtZero: true,
                title: { display: true, text: "Cycles", color: theme.muted },
                ticks: { color: theme.muted, precision: 0 },
                grid: { color: theme.rule },
              },
            },
          },
        };
      }

      if (metricView === "runtime") {
        return {
          type: "bar",
          data: {
            labels,
            datasets: [
              {
                label: "Running minutes",
                data: activeData.machines.map((m) => m.running_minutes),
                backgroundColor: theme.positive,
                borderRadius: 3,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: theme.reducedMotion ? false : undefined,
            plugins: {
              legend: { display: false },
            },
            scales: {
              x: {
                ticks: { color: theme.muted },
                grid: { color: theme.rule },
              },
              y: {
                beginAtZero: true,
                title: { display: true, text: "Minutes", color: theme.muted },
                ticks: { color: theme.muted },
                grid: { color: theme.rule },
              },
            },
          },
        };
      }

      return {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Estimated revenue (RM)",
              data: activeData.machines.map((m) => Number(m.estimated_revenue_myr || 0)),
              backgroundColor: theme.warning,
              borderRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: theme.reducedMotion ? false : undefined,
          plugins: {
            legend: { display: false },
          },
          scales: {
            x: {
              ticks: { color: theme.muted },
              grid: { color: theme.rule },
            },
            y: {
              beginAtZero: true,
              title: { display: true, text: "RM", color: theme.muted },
              ticks: { color: theme.muted },
              grid: { color: theme.rule },
            },
          },
        },
      };
    };
  }, [activeData.machines, activeData.programs, metricView, viewingAllBranches]);

  const revenueView = useMemo(
    () => selectRevenueSeriesValues(activeData),
    [activeData]
  );

  const revenueChartConfig = useMemo(() => {
    return (theme: ResolvedTheme): ChartConfiguration => {
      const series = activeData.revenue_series;
      return {
        type: "line",
        data: {
          labels: series.map((pt) => pt.label),
          datasets: [
            {
              label: revenueView.datasetLabel,
              data: revenueView.values,
              borderColor: theme.accent,
              backgroundColor: withHexAlpha(theme.accent, "26"),
              fill: true,
              tension: 0.25,
              pointRadius: series.length > 24 ? 2 : 3,
              pointHoverRadius: 5,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: theme.reducedMotion ? false : undefined,
          plugins: {
            legend: { display: false },
          },
          scales: {
            x: {
              title: {
                display: true,
                text: activeData.granularity === "hour" ? "Hourly MYT" : "Daily MYT",
                color: theme.faint,
              },
              ticks: { color: theme.muted, maxRotation: 0, autoSkip: true },
              grid: { color: theme.rule },
            },
            y: {
              beginAtZero: true,
              title: { display: true, text: "RM", color: theme.muted },
              ticks: { color: theme.muted },
              grid: { color: theme.rule },
            },
          },
        },
      };
    };
  }, [activeData.granularity, activeData.revenue_series, revenueView.datasetLabel, revenueView.values]);

  const gasChartConfig = useMemo(() => {
    return (theme: ResolvedTheme): ChartConfiguration => {
      const series = activeData.gas_series.series;
      return {
        type: "line",
        data: {
          labels: series.map((pt) => pt.label),
          datasets: [
            {
              label: "Average gas (PPM)",
              data: series.map((pt) => pt.avg_ppm),
              borderColor: theme.positive,
              backgroundColor: withHexAlpha(theme.positive, "22"),
              fill: true,
              spanGaps: false,
              tension: 0.2,
              pointRadius: series.length > 24 ? 2 : 3,
              pointHoverRadius: 5,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: theme.reducedMotion ? false : undefined,
          plugins: {
            legend: { display: false },
          },
          scales: {
            x: {
              title: {
                display: true,
                text: activeData.granularity === "hour" ? "Hourly MYT" : "Daily MYT",
                color: theme.faint,
              },
              ticks: { color: theme.muted, maxRotation: 0, autoSkip: true },
              grid: { color: theme.rule },
            },
            y: {
              beginAtZero: true,
              title: { display: true, text: "PPM", color: theme.muted },
              ticks: { color: theme.muted },
              grid: { color: theme.rule },
            },
          },
        },
      };
    };
  }, [activeData.gas_series.series, activeData.granularity]);

  const complaintsChartConfig = useMemo(() => {
    return (theme: ResolvedTheme): ChartConfiguration => {
      const series = activeData.complaints.series;
      return {
        type: "bar",
        data: {
          labels: series.map((pt) => pt.label),
          datasets: [
            {
              label: "Complaints",
              data: series.map((pt) => pt.count),
              backgroundColor: theme.control,
              borderRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: theme.reducedMotion ? false : undefined,
          plugins: {
            legend: { display: false },
          },
          scales: {
            x: {
              ticks: { color: theme.muted, maxRotation: 0, autoSkip: true },
              grid: { color: theme.rule },
            },
            y: {
              beginAtZero: true,
              suggestedMax: 5,
              title: { display: true, text: "Reports", color: theme.muted },
              ticks: { color: theme.muted, precision: 0 },
              grid: { color: theme.rule },
            },
          },
        },
      };
    };
  }, [activeData.complaints.series]);

  const summary = activeData.summary;
  const formattedRevenue = `RM ${Number(summary.estimated_revenue_myr || 0).toFixed(2)}`;
  const formattedRuntime = `${Number(summary.running_minutes || 0).toFixed(1)} min`;
  const formattedGas =
    summary.avg_gas_ppm !== null && summary.avg_gas_ppm !== undefined
      ? `${Number(summary.avg_gas_ppm).toFixed(1)} ppm`
      : "—";

  return (
    <section
      aria-labelledby="branch-analytics-heading"
      className="space-y-4 rounded-md border border-line bg-surface p-4 sm:space-y-6 sm:p-5"
    >
      {/* Top Toolbar: Heading + Optional Branch Filter + Period Selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2
          id="branch-analytics-heading"
          className="text-base font-bold text-ink"
        >
          Branch analytics
        </h2>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {multiBranchMode && (
            <div className="min-w-0">
              <label htmlFor="branch-analytics-filter" className="sr-only">
                Filter analytics by branch
              </label>
              <select
                id="branch-analytics-filter"
                aria-label="Filter analytics by branch"
                value={selectedBranchId}
                disabled={isPending}
                onChange={(e) => handleSelectBranch(e.target.value)}
                className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60 sm:w-auto"
              >
                <option value="all">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div
            role="group"
            aria-label="Analytics timeframe"
            className="flex flex-wrap gap-2"
          >
            {PERIOD_OPTIONS.map((opt) => {
              const active = period === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={active}
                  disabled={isPending}
                  onClick={() => handleSelectPeriod(opt.key)}
                  className={
                    active
                      ? "min-h-11 whitespace-nowrap rounded-md border border-navy-selected bg-navy-selected px-3.5 py-2 text-xs font-semibold text-ink transition-colors focus-visible:outline-2 focus-visible:outline-accent"
                      : "min-h-11 whitespace-nowrap rounded-md border border-control bg-canvas px-3.5 py-2 text-xs font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Inline Service Error Alert (preserves existing data rather than showing fake zeros) */}
      {errorMessage && (
        <div
          role="alert"
          className="rounded-md border border-warning/40 bg-warning/10 p-3.5 text-sm text-warning"
        >
          {errorMessage}
        </div>
      )}

      {/* 4 Summary KPI Tiles */}
      <dl
        aria-label="Overview performance summary"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <div className="min-w-0 rounded-md border border-rule bg-raised p-3.5 sm:p-4">
          <dt className="text-xs font-medium text-muted">Completed cycles</dt>
          <dd className="mt-1 text-lg font-extrabold tabular-nums text-ink sm:text-2xl">
            {analytics ? summary.completed_cycles : "—"}
          </dd>
        </div>
        <div className="min-w-0 rounded-md border border-rule bg-raised p-3.5 sm:p-4">
          <dt className="text-xs font-medium text-muted">Total runtime</dt>
          <dd className="mt-1 text-lg font-extrabold tabular-nums text-ink sm:text-2xl">
            {analytics ? formattedRuntime : "—"}
          </dd>
        </div>
        <div className="min-w-0 rounded-md border border-rule bg-raised p-3.5 sm:p-4">
          <dt className="text-xs font-medium text-muted">Est. revenue</dt>
          <dd className="mt-1 text-lg font-extrabold tabular-nums text-ink sm:text-2xl">
            {analytics ? formattedRevenue : "—"}
          </dd>
        </div>
        <div className="min-w-0 rounded-md border border-rule bg-raised p-3.5 sm:p-4">
          <dt className="text-xs font-medium text-muted">Avg gas PPM</dt>
          <dd className="mt-1 text-lg font-extrabold tabular-nums text-ink sm:text-2xl">
            {analytics ? formattedGas : "—"}
          </dd>
        </div>
      </dl>

      {/* Section 1: Machine Metrics Bar Chart (Toggleable) + Exact Breakdown Table */}
      {showMachineMetrics && (
      <div className="rounded-md border border-rule bg-raised p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-base font-bold text-ink">Machine metrics</h3>

          <div
            role="group"
            aria-label="Machine metric chart"
            className="flex flex-wrap gap-2"
          >
            {METRIC_OPTIONS.map((opt) => {
              const active = metricView === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setMetricView(opt.key)}
                  className={
                    active
                      ? "min-h-11 whitespace-nowrap rounded-md border border-navy-selected bg-navy-selected px-3.5 py-2 text-xs font-semibold text-ink transition-colors focus-visible:outline-2 focus-visible:outline-accent"
                      : "min-h-11 whitespace-nowrap rounded-md border border-control bg-canvas px-3.5 py-2 text-xs font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 h-64 w-full min-w-0 sm:h-72">
          {activeData.machines.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-md border border-rule bg-canvas/50 p-4 text-center text-sm text-muted">
              {viewingAllBranches
                ? (branches?.length ?? 0) === 0
                  ? "No branches recorded yet."
                  : "No approved machines across branches."
                : "No approved machines in this branch."}
            </div>
          ) : (
            <ChartCanvas
              ariaLabel={`Machine metrics bar chart showing ${metricView}`}
              buildConfig={machineChartConfig}
            />
          )}
        </div>

        <div className="mt-4 overflow-x-auto rounded-md border border-rule">
          <table className="min-w-full divide-y divide-rule text-left text-sm">
            <thead className="bg-surface/80">
              <tr>
                <th scope="col" className="whitespace-nowrap px-3.5 py-2.5 text-xs font-semibold text-muted">
                  Machine
                </th>
                {viewingAllBranches && (
                  <th scope="col" className="whitespace-nowrap px-3.5 py-2.5 text-xs font-semibold text-muted">
                    Branch
                  </th>
                )}
                <th scope="col" className="whitespace-nowrap px-3.5 py-2.5 text-right text-xs font-semibold text-muted">
                  Cycles
                </th>
                <th scope="col" className="whitespace-nowrap px-3.5 py-2.5 text-right text-xs font-semibold text-muted">
                  Runtime (min)
                </th>
                <th scope="col" className="whitespace-nowrap px-3.5 py-2.5 text-right text-xs font-semibold text-muted">
                  Revenue (RM)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule bg-surface">
              {activeData.machines.length === 0 ? (
                <tr>
                  <td colSpan={viewingAllBranches ? 5 : 4} className="px-3.5 py-3 text-sm text-muted">
                    No recorded machine activity for this timeframe.
                  </td>
                </tr>
              ) : (
                activeData.machines.map((machine) => (
                  <tr
                    key={`${machine.branch_id ?? ""}:${machine.source_id}`}
                    className="hover:bg-raised/30"
                  >
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-medium text-ink">
                      {machine.label || machine.source_id}
                    </td>
                    {viewingAllBranches && (
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-muted">
                        {machine.branch_name || "—"}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums text-ink">
                      {machine.completed_cycles}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums text-ink">
                      {machine.running_minutes.toFixed(1)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums text-ink">
                      {Number(machine.estimated_revenue_myr || 0).toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {showBusinessInsights && (
        <BusinessInsightsSections
          analytics={activeData}
          viewingAllBranches={viewingAllBranches}
          hasLoadedData={analytics !== null}
        />
      )}

      {/* Section 2: Estimated Revenue Timeline (Hourly for Today; Cumulative for 7d/30d) */}
      <div className="rounded-md border border-rule bg-raised p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-ink">
            {revenueView.heading}
          </h3>
          <span className="text-xs font-medium text-faint">
            {activeData.granularity === "hour" ? "Hourly MYT" : "Daily MYT"}
          </span>
        </div>

        <div className="mt-4 h-64 w-full min-w-0">
          {activeData.revenue_series.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-md border border-rule bg-canvas/50 p-4 text-center text-sm text-muted">
              No revenue intervals recorded yet.
            </div>
          ) : (
            <ChartCanvas
              ariaLabel={`${revenueView.heading} line chart`}
              buildConfig={revenueChartConfig}
            />
          )}
        </div>
      </div>

      {/* Section 3: Average Environmental Gas (PPM) */}
      <div className="rounded-md border border-rule bg-raised p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-ink">
            Average environmental gas
          </h3>
          <span className="text-xs font-medium text-muted">{gasLabel}</span>
        </div>

        <div className="mt-4 h-64 w-full min-w-0">
          {activeData.gas_series.series.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-md border border-rule bg-canvas/50 p-4 text-center text-sm text-muted">
              No gas telemetry recorded for this timeframe.
            </div>
          ) : (
            <ChartCanvas
              ariaLabel="Average environmental gas PPM line chart"
              buildConfig={gasChartConfig}
            />
          )}
        </div>

        {activeData.gas_series.aggregation_mode === "uncalibrated" && (
          <p className="mt-3 text-xs text-muted">
            Gas PPM readings require a calibrated LPG edge node.
          </p>
        )}
      </div>

      {/* Section 4: Customer Complaints */}
      <div className="rounded-md border border-rule bg-raised p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-ink">Customer complaints</h3>
          <span className="text-xs font-medium text-faint">
            {activeData.complaints.implemented ? "Count" : "Deferred"}
          </span>
        </div>

        <div className="mt-4 h-56 w-full min-w-0">
          <ChartCanvas
            ariaLabel="Customer complaints bar chart"
            buildConfig={complaintsChartConfig}
          />
        </div>

        {!activeData.complaints.implemented && (
          <p className="mt-3 text-xs text-muted">
            Customer complaints integration is not yet connected.
          </p>
        )}
      </div>
    </section>
  );
}
