"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { ChartConfiguration } from "chart.js/auto";
import type { LpgSafetySnapshot, SafetyNodeDevice } from "@/lib/auth/business";
import {
  ChartCanvas,
  type ResolvedTheme,
} from "@/components/workspace/branches/ChartCanvas";

export interface LpgTankEntry {
  source_id: string;
  label: string;
  percent: number | null;
  weightKg: number | null;
  stateLabel: string;
  tone: "positive" | "warning" | "negative" | "neutral";
}

export interface LpgTankLevelsChartProps {
  branchId: string;
  initialSnapshot: LpgSafetySnapshot | null;
  initialError?: string | null;
}

const POLL_INTERVAL_MS = 6000;

export function deriveLpgTankEntries(devices: SafetyNodeDevice[]): LpgTankEntry[] {
  return devices.map((device) => {
    const label = device.label || device.source_id;
    const obs = device.observation;
    const quality = (obs?.quality && typeof obs.quality === "object" ? obs.quality : {}) as Record<
      string,
      unknown
    >;
    const maintenance = Boolean(
      quality.maintenance_mode === true || quality.weight_evaluation_paused === true
    );
    const rawPercent = obs?.values?.lpg_percent;
    const validPercent =
      typeof rawPercent === "number" &&
      Number.isFinite(rawPercent) &&
      rawPercent >= 0 &&
      rawPercent <= 100
        ? rawPercent
        : null;

    let percent: number | null = null;
    let stateLabel = "No reading";
    let tone: LpgTankEntry["tone"] = "neutral";

    if (maintenance) {
      stateLabel = "Maintenance";
      tone = "warning";
    } else if (!obs || obs.freshness === "unknown") {
      stateLabel = "No reading";
    } else if (obs.freshness === "offline") {
      stateLabel = "Offline";
      tone = "negative";
    } else if (obs.freshness === "stale") {
      stateLabel = "Stale";
      tone = "warning";
    } else if (quality.weight_valid === false) {
      stateLabel = "Scale fault";
      tone = "negative";
    } else if (validPercent === null) {
      stateLabel = "Calibrate tank";
      tone = "warning";
    } else {
      percent = validPercent;
      stateLabel = `${validPercent.toFixed(1)}%`;
      if (validPercent < 5) {
        tone = "negative";
      } else if (validPercent < 15) {
        tone = "warning";
      } else {
        tone = "positive";
      }
    }

    const rawWeight = obs?.values?.lpg_weight_kg;
    const weightKg =
      percent !== null && typeof rawWeight === "number" && Number.isFinite(rawWeight)
        ? rawWeight
        : null;

    return {
      source_id: device.source_id,
      label,
      percent,
      weightKg,
      stateLabel,
      tone,
    };
  });
}

function toneTextClass(tone: LpgTankEntry["tone"]): string {
  switch (tone) {
    case "positive":
      return "text-positive";
    case "warning":
      return "text-warning";
    case "negative":
      return "text-negative";
    default:
      return "text-muted";
  }
}

function barColorForTone(tone: LpgTankEntry["tone"], theme: ResolvedTheme): string {
  switch (tone) {
    case "negative":
      return theme.negative;
    case "warning":
      return theme.warning;
    case "positive":
      return theme.positive;
    default:
      return theme.muted;
  }
}

/** Real-time per-node LPG tank level Chart.js bar section for branch overview. */
export function LpgTankLevelsChart({
  branchId,
  initialSnapshot,
  initialError = null,
}: LpgTankLevelsChartProps) {
  const [snapshot, setSnapshot] = useState<LpgSafetySnapshot | null>(initialSnapshot);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let activeController: AbortController | null = null;

    async function poll() {
      if (!active || inFlight) return;
      if (document.visibilityState !== "visible") return;
      inFlight = true;
      const controller = new AbortController();
      activeController = controller;
      try {
        const res = await fetch(
          `/api/workspace/branches/${encodeURIComponent(branchId)}/lpg-safety`,
          { method: "GET", cache: "no-store", signal: controller.signal },
        );
        const result = (await res.json()) as
          | { ok: true; value: LpgSafetySnapshot }
          | { ok: false; message: string };
        if (!active) return;
        if (result.ok) {
          setSnapshot(result.value);
          setErrorMessage(null);
        } else {
          setErrorMessage(result.message);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (active) {
          setErrorMessage("The business service is unavailable. Please retry.");
        }
      } finally {
        if (activeController === controller) {
          activeController = null;
        }
        inFlight = false;
      }
    }

    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      active = false;
      activeController?.abort();
      window.clearInterval(timer);
    };
  }, [branchId]);

  const entries = useMemo(
    () => deriveLpgTankEntries(snapshot?.devices ?? []),
    [snapshot]
  );

  const liveCount = entries.filter((entry) => entry.percent !== null).length;
  const headerStatus =
    entries.length === 0
      ? "No LPG nodes"
      : liveCount === entries.length
        ? `${liveCount} live ${liveCount === 1 ? "node" : "nodes"}`
        : `${liveCount} of ${entries.length} live`;

  const chartConfig = useMemo(() => {
    const horizontal = entries.length > 4;
    return (theme: ResolvedTheme): ChartConfiguration => {
      const categoryAxis = {
        ticks: { color: theme.muted, font: { size: 11 } },
        grid: { display: false },
      };
      const percentAxis = {
        min: 0,
        max: 100,
        title: {
          display: true,
          text: "Tank level (%)",
          color: theme.muted,
          font: { size: 11 },
        },
        ticks: {
          color: theme.muted,
          font: { size: 11 },
          callback: (value: string | number) => `${value}%`,
        },
        grid: { color: theme.rule },
      };

      return {
        type: "bar",
        data: {
          labels: entries.map((entry) => entry.label),
          datasets: [
            {
              label: "Gas tank level (%)",
              data: entries.map((entry) => entry.percent),
              backgroundColor: entries.map((entry) => barColorForTone(entry.tone, theme)),
              borderRadius: 4,
              maxBarThickness: 48,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: horizontal ? "y" : "x",
          animation: { duration: theme.reducedMotion ? 0 : 220 },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const entry = entries[ctx.dataIndex];
                  if (!entry) return "";
                  return entry.weightKg !== null
                    ? `${entry.stateLabel} (${entry.weightKg.toFixed(2)} kg)`
                    : entry.stateLabel;
                },
              },
            },
          },
          scales: horizontal
            ? { x: percentAxis, y: categoryAxis }
            : { x: categoryAxis, y: percentAxis },
        },
      };
    };
  }, [entries]);

  return (
    <section
      aria-labelledby="overview-lpg-tank-heading"
      className="rounded-md border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="overview-lpg-tank-heading" className="text-base font-bold text-ink">
          LPG gas tank levels
        </h2>
        <span className="text-xs font-medium text-muted">{headerStatus}</span>
      </div>

      {errorMessage && (
        <div
          role="status"
          className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-xs text-warning"
        >
          {errorMessage}
        </div>
      )}

      <div className="mt-4 h-60 w-full min-w-0 sm:h-64">
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-md border border-rule bg-canvas/50 p-4 text-center text-sm text-muted">
            No approved LPG edge nodes in this branch.
          </div>
        ) : (
          <ChartCanvas
            ariaLabel="Real-time LPG gas tank levels bar chart"
            buildConfig={chartConfig}
          />
        )}
      </div>

      {entries.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <li
              key={entry.source_id}
              className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-rule bg-raised px-3 py-2"
            >
              <span className="truncate font-medium text-ink">{entry.label}</span>
              <span className={`shrink-0 font-semibold tabular-nums ${toneTextClass(entry.tone)}`}>
                {entry.weightKg !== null
                  ? `${entry.stateLabel} (${entry.weightKg.toFixed(2)} kg)`
                  : entry.stateLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
