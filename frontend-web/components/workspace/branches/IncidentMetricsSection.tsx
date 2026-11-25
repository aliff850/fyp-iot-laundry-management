"use client";

import React, { useMemo } from "react";
import type { ChartConfiguration } from "chart.js/auto";
import type { OverviewIncidentMetrics } from "@/lib/auth/business";
import { ChartCanvas, type ResolvedTheme } from "@/components/workspace/branches/ChartCanvas";

export interface IncidentMetricsSectionProps {
  incidentMetrics?: OverviewIncidentMetrics;
  granularity: "hour" | "day";
  hasLoadedData: boolean;
}

const EMPTY_INCIDENT_METRICS: OverviewIncidentMetrics = {
  total_incidents: 0,
  open_count: 0,
  acknowledged_count: 0,
  resolved_count: 0,
  warning_count: 0,
  critical_count: 0,
  machine_count: 0,
  lpg_count: 0,
  avg_acknowledge_minutes: null,
  avg_resolve_minutes: null,
  ack_sample_count: 0,
  resolve_sample_count: 0,
  series: [],
};

export function formatIncidentDuration(minutes: number | null, hasLoadedData: boolean): string {
  if (!hasLoadedData) return "—";
  if (minutes === null || !Number.isFinite(minutes)) return "None recorded";
  return `${minutes.toFixed(1)} min`;
}

/** Period-scoped incident counts, acknowledgement/resolution durations, and severity timeline. */
export function IncidentMetricsSection({
  incidentMetrics,
  granularity,
  hasLoadedData,
}: IncidentMetricsSectionProps) {
  const metrics = incidentMetrics ?? EMPTY_INCIDENT_METRICS;
  const series = useMemo(() => metrics.series ?? [], [metrics.series]);
  const hasIncidentActivity = hasLoadedData && metrics.total_incidents > 0 && series.length > 0;

  const incidentChartConfig = useMemo(() => {
    return (theme: ResolvedTheme): ChartConfiguration => ({
      type: "bar",
      data: {
        labels: series.map((pt) => pt.label),
        datasets: [
          {
            label: "Warning",
            data: series.map((pt) => pt.warning),
            backgroundColor: theme.warning,
            borderRadius: 3,
          },
          {
            label: "Critical",
            data: series.map((pt) => pt.critical),
            backgroundColor: theme.negative,
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: theme.reducedMotion ? false : undefined,
        plugins: {
          legend: {
            display: true,
            labels: {
              color: theme.muted,
              boxWidth: 12,
              boxHeight: 12,
            },
          },
        },
        scales: {
          x: {
            stacked: true,
            ticks: { color: theme.muted, maxRotation: 0, autoSkip: true },
            grid: { color: theme.rule },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            title: { display: true, text: "Incidents", color: theme.muted },
            ticks: { color: theme.muted, precision: 0 },
            grid: { color: theme.rule },
          },
        },
      },
    });
  }, [series]);

  const ackValue = formatIncidentDuration(metrics.avg_acknowledge_minutes, hasLoadedData);
  const resolveValue = formatIncidentDuration(metrics.avg_resolve_minutes, hasLoadedData);

  return (
    <div className="rounded-md border border-rule bg-raised p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-base font-bold text-ink">Incident metrics</h3>
        <span className="text-xs font-medium text-faint">
          {granularity === "hour" ? "Hourly MYT" : "Daily MYT"}
        </span>
      </div>

      <dl
        aria-label="Incident metrics summary"
        className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <div className="min-w-0 rounded-md border border-rule bg-surface p-3.5">
          <dt className="text-xs font-medium text-muted">Incidents</dt>
          <dd className="mt-1 text-lg font-extrabold tabular-nums text-ink sm:text-xl">
            {hasLoadedData ? metrics.total_incidents : "—"}
          </dd>
        </div>

        <div className="min-w-0 rounded-md border border-rule bg-surface p-3.5">
          <dt className="text-xs font-medium text-muted">Critical alerts</dt>
          <dd
            className={`mt-1 text-lg font-extrabold tabular-nums sm:text-xl ${
              hasLoadedData && metrics.critical_count > 0 ? "text-negative" : "text-ink"
            }`}
          >
            {hasLoadedData ? metrics.critical_count : "—"}
          </dd>
        </div>

        <div className="min-w-0 rounded-md border border-rule bg-surface p-3.5">
          <dt className="text-xs font-medium text-muted">Avg acknowledge</dt>
          <dd className="mt-1 text-lg font-extrabold tabular-nums text-ink sm:text-xl">
            {ackValue}
          </dd>
          {hasLoadedData && (
            <p className="mt-1 text-xs tabular-nums text-faint">
              {metrics.ack_sample_count} acknowledged
            </p>
          )}
        </div>

        <div className="min-w-0 rounded-md border border-rule bg-surface p-3.5">
          <dt className="text-xs font-medium text-muted">Avg resolution</dt>
          <dd className="mt-1 text-lg font-extrabold tabular-nums text-ink sm:text-xl">
            {resolveValue}
          </dd>
          {hasLoadedData && (
            <p className="mt-1 text-xs tabular-nums text-faint">
              {metrics.resolve_sample_count} resolved
            </p>
          )}
        </div>
      </dl>

      <dl
        aria-label="Incident state and domain counts"
        className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        <div className="min-w-0 rounded-md border border-rule bg-canvas p-3">
          <dt className="text-xs font-medium text-muted">Open</dt>
          <dd className="mt-1 text-sm font-bold tabular-nums text-ink">
            {hasLoadedData ? metrics.open_count : "—"}
          </dd>
        </div>

        <div className="min-w-0 rounded-md border border-rule bg-canvas p-3">
          <dt className="text-xs font-medium text-muted">Acknowledged</dt>
          <dd className="mt-1 text-sm font-bold tabular-nums text-ink">
            {hasLoadedData ? metrics.acknowledged_count : "—"}
          </dd>
        </div>

        <div className="min-w-0 rounded-md border border-rule bg-canvas p-3">
          <dt className="text-xs font-medium text-muted">Resolved</dt>
          <dd className="mt-1 text-sm font-bold tabular-nums text-ink">
            {hasLoadedData ? metrics.resolved_count : "—"}
          </dd>
        </div>

        <div className="min-w-0 rounded-md border border-rule bg-canvas p-3">
          <dt className="text-xs font-medium text-muted">Machine domain</dt>
          <dd className="mt-1 text-sm font-bold tabular-nums text-ink">
            {hasLoadedData ? metrics.machine_count : "—"}
          </dd>
        </div>

        <div className="min-w-0 rounded-md border border-rule bg-canvas p-3">
          <dt className="text-xs font-medium text-muted">LPG domain</dt>
          <dd className="mt-1 text-sm font-bold tabular-nums text-ink">
            {hasLoadedData ? metrics.lpg_count : "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-4 h-56 w-full min-w-0">
        {!hasIncidentActivity ? (
          <div className="flex h-full items-center justify-center rounded-md border border-rule bg-canvas/50 p-4 text-center text-sm text-muted">
            No incidents recorded in this timeframe.
          </div>
        ) : (
          <ChartCanvas
            ariaLabel="Incident severity trend stacked bar chart"
            buildConfig={incidentChartConfig}
          />
        )}
      </div>
    </div>
  );
}
