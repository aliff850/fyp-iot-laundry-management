"use client";

import React, { useMemo, useState } from "react";
import type { ChartConfiguration } from "chart.js/auto";
import type { BranchOverviewAnalytics } from "@/lib/auth/business";
import { ChartCanvas, type ResolvedTheme } from "@/components/workspace/branches/ChartCanvas";

type BranchComparisonView = "revenue" | "cycles";

const BRANCH_METRIC_OPTIONS: { key: BranchComparisonView; label: string }[] = [
  { key: "revenue", label: "Revenue" },
  { key: "cycles", label: "Cycles" },
];

export interface BusinessInsightsSectionsProps {
  analytics: BranchOverviewAnalytics;
  viewingAllBranches: boolean;
  hasLoadedData: boolean;
}

/** Business-level branch comparison, program mix, peak hours, and cycle reliability views. */
export function BusinessInsightsSections({
  analytics,
  viewingAllBranches,
  hasLoadedData,
}: BusinessInsightsSectionsProps) {
  const [branchMetric, setBranchMetric] = useState<BranchComparisonView>("revenue");

  const branchBreakdown = useMemo(
    () => analytics.branch_breakdown ?? [],
    [analytics.branch_breakdown]
  );
  const programBreakdown = useMemo(
    () => analytics.program_breakdown ?? [],
    [analytics.program_breakdown]
  );
  const hourlyDemand = useMemo(
    () => analytics.hourly_demand ?? [],
    [analytics.hourly_demand]
  );
  const cycleOutcomes = analytics.cycle_outcomes ?? {
    completed: 0,
    stopped: 0,
    faulted: 0,
    interrupted: 0,
    total: 0,
    completion_rate_pct: null,
  };

  const hasHourlyActivity = useMemo(
    () => hourlyDemand.some((pt) => pt.completed_cycles > 0),
    [hourlyDemand]
  );

  const peakHourLabel = useMemo(() => {
    if (!hasHourlyActivity || hourlyDemand.length === 0) return null;
    let best = hourlyDemand[0];
    for (const point of hourlyDemand) {
      if (point.completed_cycles > best.completed_cycles) {
        best = point;
      }
    }
    return best.completed_cycles > 0 ? best.hour_label : null;
  }, [hasHourlyActivity, hourlyDemand]);

  const branchChartConfig = useMemo(() => {
    return (theme: ResolvedTheme): ChartConfiguration => {
      const labels = branchBreakdown.map((item) => item.branch_name);
      const isRevenue = branchMetric === "revenue";
      return {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: isRevenue ? "Estimated revenue (RM)" : "Completed cycles",
              data: branchBreakdown.map((item) =>
                isRevenue ? Number(item.estimated_revenue_myr || 0) : item.completed_cycles
              ),
              backgroundColor: isRevenue ? theme.accent : theme.positive,
              borderRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: theme.reducedMotion ? false : undefined,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              ticks: { color: theme.muted },
              grid: { color: theme.rule },
            },
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: isRevenue ? "RM" : "Cycles",
                color: theme.muted,
              },
              ticks: {
                color: theme.muted,
                ...(isRevenue ? {} : { precision: 0 }),
              },
              grid: { color: theme.rule },
            },
          },
        },
      };
    };
  }, [branchBreakdown, branchMetric]);

  const programChartConfig = useMemo(() => {
    return (theme: ResolvedTheme): ChartConfiguration => {
      const colors = [
        theme.accent,
        theme.positive,
        theme.warning,
        theme.control,
        theme.ink,
        theme.negative,
      ];
      return {
        type: "bar",
        data: {
          labels: programBreakdown.map((item) => item.label),
          datasets: [
            {
              label: "Estimated revenue (RM)",
              data: programBreakdown.map((item) => Number(item.estimated_revenue_myr || 0)),
              backgroundColor: programBreakdown.map((_, idx) => colors[idx % colors.length]),
              borderRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: theme.reducedMotion ? false : undefined,
          plugins: { legend: { display: false } },
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
  }, [programBreakdown]);

  const hourlyChartConfig = useMemo(() => {
    return (theme: ResolvedTheme): ChartConfiguration => {
      return {
        type: "bar",
        data: {
          labels: hourlyDemand.map((item) => item.hour_label),
          datasets: [
            {
              label: "Completed cycles",
              data: hourlyDemand.map((item) => item.completed_cycles),
              backgroundColor: theme.accent,
              borderRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: theme.reducedMotion ? false : undefined,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              ticks: { color: theme.muted, maxRotation: 0, autoSkip: true },
              grid: { color: theme.rule },
            },
            y: {
              beginAtZero: true,
              title: { display: true, text: "Cycles", color: theme.muted },
              ticks: { color: theme.muted, precision: 0 },
              grid: { color: theme.rule },
            },
          },
        },
      };
    };
  }, [hourlyDemand]);

  const completionText = !hasLoadedData
    ? "—"
    : cycleOutcomes.completion_rate_pct !== null
      ? `${cycleOutcomes.completion_rate_pct.toFixed(1)}% completion`
      : "No recorded cycles";

  return (
    <>
      {viewingAllBranches && (
        <div className="rounded-md border border-rule bg-raised p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-base font-bold text-ink">Branch comparison</h3>

            <div
              role="group"
              aria-label="Branch comparison metric"
              className="flex flex-wrap gap-2"
            >
              {BRANCH_METRIC_OPTIONS.map((opt) => {
                const active = branchMetric === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setBranchMetric(opt.key)}
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

          <div className="mt-4 h-56 w-full min-w-0 sm:h-64">
            {branchBreakdown.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-md border border-rule bg-canvas/50 p-4 text-center text-sm text-muted">
                No branches recorded yet.
              </div>
            ) : (
              <ChartCanvas
                ariaLabel={`Branch comparison bar chart showing ${branchMetric}`}
                buildConfig={branchChartConfig}
              />
            )}
          </div>

          <div className="mt-4 overflow-x-auto rounded-md border border-rule">
            <table className="min-w-full divide-y divide-rule text-left text-sm">
              <thead className="bg-surface/80">
                <tr>
                  <th scope="col" className="whitespace-nowrap px-3.5 py-2.5 text-xs font-semibold text-muted">
                    Branch
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3.5 py-2.5 text-right text-xs font-semibold text-muted">
                    Cycles
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3.5 py-2.5 text-right text-xs font-semibold text-muted">
                    Runtime (min)
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3.5 py-2.5 text-right text-xs font-semibold text-muted">
                    Revenue (RM)
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3.5 py-2.5 text-right text-xs font-semibold text-muted">
                    Share
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule bg-surface">
                {branchBreakdown.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3.5 py-3 text-sm text-muted">
                      No branch activity recorded for this timeframe.
                    </td>
                  </tr>
                ) : (
                  branchBreakdown.map((branch) => (
                    <tr key={branch.branch_id} className="hover:bg-raised/30">
                      <td className="whitespace-nowrap px-3.5 py-2.5 font-medium text-ink">
                        {branch.branch_name}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums text-ink">
                        {branch.completed_cycles}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums text-ink">
                        {branch.running_minutes.toFixed(1)}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums text-ink">
                        {Number(branch.estimated_revenue_myr || 0).toFixed(2)}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums text-muted">
                        {branch.revenue_share_pct !== null
                          ? `${branch.revenue_share_pct.toFixed(1)}%`
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Program Mix */}
      <div className="rounded-md border border-rule bg-raised p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-ink">Program mix</h3>
          <span className="text-xs font-medium text-faint">Completed cycles</span>
        </div>

        <div className="mt-4 h-56 w-full min-w-0">
          {programBreakdown.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-md border border-rule bg-canvas/50 p-4 text-center text-sm text-muted">
              No completed program cycles in this timeframe.
            </div>
          ) : (
            <ChartCanvas
              ariaLabel="Program revenue mix bar chart"
              buildConfig={programChartConfig}
            />
          )}
        </div>

        <div className="mt-4 overflow-x-auto rounded-md border border-rule">
          <table className="min-w-full divide-y divide-rule text-left text-sm">
            <thead className="bg-surface/80">
              <tr>
                <th scope="col" className="whitespace-nowrap px-3.5 py-2.5 text-xs font-semibold text-muted">
                  Program
                </th>
                <th scope="col" className="whitespace-nowrap px-3.5 py-2.5 text-right text-xs font-semibold text-muted">
                  Cycles
                </th>
                <th scope="col" className="whitespace-nowrap px-3.5 py-2.5 text-right text-xs font-semibold text-muted">
                  Share
                </th>
                <th scope="col" className="whitespace-nowrap px-3.5 py-2.5 text-right text-xs font-semibold text-muted">
                  Revenue (RM)
                </th>
                <th scope="col" className="whitespace-nowrap px-3.5 py-2.5 text-right text-xs font-semibold text-muted">
                  Avg per cycle (RM)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule bg-surface">
              {programBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3.5 py-3 text-sm text-muted">
                    No completed cycles recorded for this timeframe.
                  </td>
                </tr>
              ) : (
                programBreakdown.map((prog) => (
                  <tr key={prog.program_id} className="hover:bg-raised/30">
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-medium text-ink">
                      {prog.label}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums text-ink">
                      {prog.completed_cycles}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums text-muted">
                      {prog.share_pct !== null ? `${prog.share_pct.toFixed(1)}%` : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums text-ink">
                      {Number(prog.estimated_revenue_myr || 0).toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums text-muted">
                      {prog.avg_revenue_myr !== null ? Number(prog.avg_revenue_myr).toFixed(2) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Peak Demand Hours */}
      <div className="rounded-md border border-rule bg-raised p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-ink">Peak demand hours</h3>
          <span className="text-xs font-medium text-muted">
            {peakHourLabel ? `Peak ${peakHourLabel} MYT` : "Hourly MYT"}
          </span>
        </div>

        <div className="mt-4 h-56 w-full min-w-0">
          {!hasHourlyActivity ? (
            <div className="flex h-full items-center justify-center rounded-md border border-rule bg-canvas/50 p-4 text-center text-sm text-muted">
              No completed cycles recorded for this timeframe.
            </div>
          ) : (
            <ChartCanvas
              ariaLabel="Peak demand hours bar chart"
              buildConfig={hourlyChartConfig}
            />
          )}
        </div>
      </div>

      {/* Cycle Reliability */}
      <div className="rounded-md border border-rule bg-raised p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-ink">Cycle reliability</h3>
          <span className="text-xs font-medium text-muted">{completionText}</span>
        </div>

        <dl
          aria-label="Cycle outcomes breakdown"
          className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <div className="min-w-0 rounded-md border border-rule bg-canvas p-3.5">
            <dt className="text-xs font-medium text-muted">Completed</dt>
            <dd className="mt-1 text-lg font-extrabold tabular-nums text-ink sm:text-xl">
              {hasLoadedData ? cycleOutcomes.completed : "—"}
            </dd>
          </div>
          <div className="min-w-0 rounded-md border border-rule bg-canvas p-3.5">
            <dt className="text-xs font-medium text-muted">Stopped</dt>
            <dd className="mt-1 text-lg font-extrabold tabular-nums text-ink sm:text-xl">
              {hasLoadedData ? cycleOutcomes.stopped : "—"}
            </dd>
          </div>
          <div className="min-w-0 rounded-md border border-rule bg-canvas p-3.5">
            <dt className="text-xs font-medium text-muted">Faulted</dt>
            <dd className="mt-1 text-lg font-extrabold tabular-nums text-ink sm:text-xl">
              {hasLoadedData ? cycleOutcomes.faulted : "—"}
            </dd>
          </div>
          <div className="min-w-0 rounded-md border border-rule bg-canvas p-3.5">
            <dt className="text-xs font-medium text-muted">Interrupted</dt>
            <dd className="mt-1 text-lg font-extrabold tabular-nums text-ink sm:text-xl">
              {hasLoadedData ? cycleOutcomes.interrupted : "—"}
            </dd>
          </div>
        </dl>
      </div>
    </>
  );
}
