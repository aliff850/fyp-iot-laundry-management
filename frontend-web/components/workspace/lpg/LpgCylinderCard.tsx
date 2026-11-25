"use client";

import React, { useState } from "react";
import { Flame, Wrench } from "lucide-react";
import type {
  SafetyNodeDevice,
  SafetyNodeObservation,
  SafetyNodeValues,
} from "@/lib/auth/business";
import { LpgGasBaselineModal } from "./LpgGasBaselineModal";
import { LpgTankSwapModal } from "./LpgTankSwapModal";
import { ServiceAndIncidentModal } from "@/components/workspace/common/ServiceAndIncidentModal";

export interface LpgCylinderCardProps {
  device: SafetyNodeDevice;
  branchId?: string;
  defaultActorName?: string | null;
  onRefresh?: () => Promise<void> | void;
}

function formatNumber(value: number | null | undefined, digits = 0): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatLastSample(observation: SafetyNodeObservation | null): string {
  if (!observation) return "—";
  if (!observation.sample_at) return "Time unknown";
  const parsed = new Date(observation.sample_at);
  if (Number.isNaN(parsed.getTime())) return "Time unknown";
  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function getFreshnessInfo(observation: SafetyNodeObservation | null): {
  label: string;
  badgeClass: string;
  isFresh: boolean;
} {
  if (!observation) {
    return {
      label: "No approved observation",
      badgeClass: "border-line bg-raised text-muted",
      isFresh: false,
    };
  }
  switch (observation.freshness) {
    case "fresh":
      return {
        label: "Fresh",
        badgeClass: "border-positive/30 bg-raised text-positive",
        isFresh: true,
      };
    case "stale":
      return {
        label: "Stale",
        badgeClass: "border-warning/30 bg-raised text-warning",
        isFresh: false,
      };
    case "offline":
      return {
        label: "Offline",
        badgeClass: "border-line bg-raised text-muted",
        isFresh: false,
      };
    default:
      return {
        label: "Time unknown",
        badgeClass: "border-line bg-raised text-muted",
        isFresh: false,
      };
  }
}

function CylinderSvg({ fillPercent }: { fillPercent: number | null }) {
  const validPct = typeof fillPercent === "number" && Number.isFinite(fillPercent);
  const clamped = validPct ? Math.max(0, Math.min(100, fillPercent)) : 0;

  return (
    <svg
      viewBox="0 0 100 110"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={
        validPct
          ? `LPG Cylinder level: ${clamped.toFixed(1)}%`
          : "LPG Cylinder level unavailable"
      }
      className="size-14 select-none text-muted transition-colors group-hover:text-ink"
    >
      <rect x="44" y="6" width="12" height="6" rx="1.5" strokeWidth="2" />
      <line x1="50" y1="12" x2="50" y2="18" strokeWidth="2" />
      <path
        d="M 32 24 L 32 15 C 32 13 36 12 50 12 C 64 12 68 13 68 15 L 68 24"
        strokeWidth="2"
      />
      <line x1="38" y1="18" x2="62" y2="18" strokeWidth="1.5" />
      <rect x="20" y="24" width="60" height="68" rx="8" strokeWidth="2.5" />
      <path
        d="M 28 92 L 28 99 C 28 101 34 102 50 102 C 66 102 72 101 72 99 L 72 92"
        strokeWidth="2"
      />
    </svg>
  );
}

function ProgressBarSvg({ percent }: { percent: number }) {
  const clamped = Math.round(Math.max(2, Math.min(100, Number.isFinite(percent) ? percent : 0)));

  return (
    <svg
      viewBox="0 0 100 4"
      preserveAspectRatio="none"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Reported fuel level"
      className="h-1.5 w-full overflow-hidden rounded-full bg-surface"
    >
      <rect x="0" y="0" width={clamped} height="4" className="fill-accent" />
    </svg>
  );
}

export function LpgCylinderCard({
  device,
  branchId,
  defaultActorName,
  onRefresh,
}: LpgCylinderCardProps) {
  const [swapModalOpen, setSwapModalOpen] = useState(false);
  const [gasModalOpen, setGasModalOpen] = useState(false);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const observation = device.observation;
  const freshness = getFreshnessInfo(observation);
  const isMaintenance = Boolean(
    device.operating_mode === "maintenance" ||
      device.maintenance_mode ||
      device.status === "maintenance",
  );
  const maintSession = device.maintenance_session ?? null;
  const isTankSwapSession =
    !maintSession?.session_kind || maintSession.session_kind === "tank_swap";

  const readMetric = (key: keyof SafetyNodeValues): number | null => {
    if (!freshness.isFresh || !observation) return null;
    const raw = observation.values[key];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  };

  const percent = readMetric("lpg_percent");
  const validPercent = percent !== null;

  const gasInfo = device.gas_interpretation;
  const estPpm =
    readMetric("estimated_ppm") ??
    (freshness.isFresh &&
    typeof gasInfo?.estimated_ppm === "number" &&
    Number.isFinite(gasInfo.estimated_ppm)
      ? gasInfo.estimated_ppm
      : null);
  const validEstPpm = estPpm !== null;

  let ppmText = "Baseline needed";
  let ppmValueClass = "text-warning";
  let gasStatusText = "Uncalibrated";
  let gasStatusClass = "text-muted";

  if (gasInfo?.ppm_calibrated) {
    if (freshness.isFresh && validEstPpm) {
      ppmText = `${formatNumber(estPpm, estPpm < 100 ? 1 : 0)} ppm`;
      ppmValueClass =
        gasInfo.gas_condition === "critical"
          ? "text-negative"
          : gasInfo.gas_condition === "warning"
            ? "text-warning"
            : "text-ink";

      if (gasInfo.gas_condition === "critical") {
        gasStatusText = "Critical";
        gasStatusClass = "text-negative";
      } else if (gasInfo.gas_condition === "warning") {
        gasStatusText = "Elevated";
        gasStatusClass = "text-warning";
      } else if (gasInfo.gas_condition === "normal") {
        gasStatusText = "Normal";
        gasStatusClass = "text-positive";
      } else if (gasInfo.gas_condition === "out_of_range") {
        gasStatusText = "Out of range";
        gasStatusClass = "text-warning";
      } else {
        gasStatusText = "Unavailable";
      }
    } else {
      ppmText = "—";
      ppmValueClass = "text-muted";
      const outOfRange = freshness.isFresh && gasInfo.gas_condition === "out_of_range";
      gasStatusText = outOfRange ? "Out of range" : "—";
      if (outOfRange) {
        gasStatusClass = "text-warning";
      }
    }
  } else if (freshness.isFresh && gasInfo?.gas_condition === "out_of_range") {
    ppmText = "—";
    ppmValueClass = "text-muted";
    gasStatusText = "Out of range";
    gasStatusClass = "text-warning";
  }

  const tempVal = readMetric("temperature");
  const humVal = readMetric("humidity");
  const cloudStateText = observation?.sync_state
    ? `Cloud delivery ${observation.sync_state}`
    : "Cloud delivery unknown";

  const operatingMode =
    device.operating_mode ??
    (isMaintenance
      ? "maintenance"
      : freshness.isFresh && validPercent && percent < 15
        ? "low"
        : freshness.isFresh
          ? "online"
          : observation?.freshness === "stale"
            ? "stale"
            : "offline");

  const modeBadge =
    operatingMode === "maintenance"
      ? {
          label: "Maintenance",
          className: "border-warning/30 bg-raised text-warning",
          showWrench: true,
        }
      : operatingMode === "low"
        ? {
            label: "Low — Replace soon",
            className: "border-warning/40 bg-warning/10 text-warning",
            showWrench: false,
          }
        : operatingMode === "online"
          ? {
              label: "Online",
              className: "border-positive/30 bg-positive/10 text-positive",
              showWrench: false,
            }
          : null;

  const renderMetricPair = (
    label: string,
    key: keyof SafetyNodeValues,
    unit: string,
    digits: number,
  ) => {
    const measured = readMetric(key);
    return (
      <div className="min-w-0">
        <dt className="truncate text-xs leading-normal text-muted">{label}</dt>
        <dd className="mt-1 text-sm font-semibold leading-normal tabular-nums text-ink">
          {formatNumber(measured, digits)}
          {measured === null ? "" : unit}
        </dd>
      </div>
    );
  };

  return (
    <article
      aria-label={`${device.label} (${freshness.label})`}
      className="group flex min-w-0 w-full flex-col gap-4 rounded-md border border-line bg-surface p-4 sm:p-5 md:p-6"
    >
      {/* Tier 1: Node Identity (Device ID only) & Freshness / Cloud Delivery Column */}
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-md border border-rule bg-raised/40 p-1.5">
          <CylinderSvg fillPercent={validPercent ? percent : null} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h3 className="min-w-0 truncate text-base font-semibold leading-normal text-ink">
              {device.label}
            </h3>
            <dl className="mt-2 grid grid-cols-1 gap-y-1 text-xs">
              <div className="min-w-0">
                <dt className="text-faint">Device ID</dt>
                <dd className="mt-0.5 break-all text-muted">{device.source_id}</dd>
              </div>
            </dl>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {modeBadge && (
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border px-2.5 py-1 text-xs font-medium ${modeBadge.className}`}
                >
                  {modeBadge.showWrench && (
                    <Wrench className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <span>{modeBadge.label}</span>
                </span>
              )}
              <span
                className={`inline-flex shrink-0 items-center whitespace-nowrap rounded border px-2.5 py-1 text-xs font-medium ${freshness.badgeClass}`}
              >
                {freshness.label}
              </span>
            </div>
            <p className="text-left text-xs leading-normal text-muted sm:text-right">
              {cloudStateText}
            </p>
          </div>
        </div>
      </div>

      {/* Tier 2: Horizontal Telemetry & Provenance Reading Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Box 1: Fuel Mass & Reported Level (or Tank-Swap Paused State) */}
        <div className="flex flex-col justify-between gap-2.5 rounded-md border border-line bg-raised/40 p-3.5 md:p-4">
          {isMaintenance ? (
            <>
              <dl className="flex flex-wrap items-baseline justify-between gap-2">
                <dt className="text-xs leading-normal text-muted">Fuel level</dt>
                <dd className="text-sm font-semibold leading-normal text-warning">
                  {isTankSwapSession ? "Paused (Tank swap)" : "Paused (Maintenance)"}
                </dd>
              </dl>
              <dl className="grid grid-cols-2 gap-3 border-t border-rule/60 pt-2.5">
                {renderMetricPair("Live scale", "gross_weight_kg", " kg", 2)}
                <div className="min-w-0">
                  <dt className="truncate text-xs leading-normal text-muted">
                    Started by
                  </dt>
                  <dd className="mt-1 truncate text-sm font-semibold leading-normal text-ink">
                    {maintSession?.started_by || "Local staff"}
                  </dd>
                </div>
              </dl>
              {maintSession?.service_note && (
                <p className="truncate text-[11px] text-faint">
                  {maintSession.service_note}
                </p>
              )}
            </>
          ) : (
            <>
              <dl className="flex items-baseline justify-between gap-2">
                <dt className="text-xs leading-normal text-muted">
                  Reported level
                </dt>
                <dd className="text-sm font-semibold leading-normal tabular-nums text-ink">
                  {formatNumber(percent, 1)}
                  {validPercent ? "%" : ""}
                </dd>
              </dl>

              {validPercent && <ProgressBarSvg percent={percent} />}

              <dl className="grid grid-cols-2 gap-3 border-t border-rule/60 pt-2.5">
                {renderMetricPair("Gross mass", "gross_weight_kg", " kg", 2)}
                {renderMetricPair("Reported fuel", "lpg_weight_kg", " kg", 2)}
              </dl>
            </>
          )}
        </div>

        {/* Box 2: Gas Status (top) & Estimated LPG PPM (bottom) */}
        <dl className="flex flex-col justify-between gap-2.5 rounded-md border border-line bg-raised/40 p-3.5 md:p-4">
          <div className="min-w-0">
            <dt className="truncate text-xs leading-normal text-muted">
              Gas status
            </dt>
            <dd
              className={`mt-1 min-w-0 break-words text-sm font-semibold leading-normal tabular-nums ${gasStatusClass}`}
            >
              {gasStatusText}
            </dd>
          </div>
          <div className="min-w-0 border-t border-rule/60 pt-2.5">
            <dt className="truncate text-xs leading-normal text-muted">
              Est. LPG
            </dt>
            <dd
              className={`mt-1 min-w-0 break-words text-sm font-semibold leading-normal tabular-nums ${ppmValueClass}`}
            >
              {ppmText}
            </dd>
          </div>
        </dl>

        {/* Box 3: Temperature (top) & Humidity (bottom) */}
        <dl className="flex flex-col justify-between gap-2.5 rounded-md border border-line bg-raised/40 p-3.5 md:p-4">
          <div className="min-w-0">
            <dt className="truncate text-xs leading-normal text-muted">
              Temperature
            </dt>
            <dd className="mt-1 min-w-0 break-words text-sm font-semibold leading-normal tabular-nums text-ink">
              {formatNumber(tempVal, 1)}
              {tempVal === null ? "" : " °C"}
            </dd>
          </div>
          <div className="min-w-0 border-t border-rule/60 pt-2.5">
            <dt className="truncate text-xs leading-normal text-muted">
              Humidity
            </dt>
            <dd className="mt-1 min-w-0 break-words text-sm font-semibold leading-normal tabular-nums text-ink">
              {formatNumber(humVal, 1)}
              {humVal === null ? "" : "%"}
            </dd>
          </div>
        </dl>
      </div>

      {/* Tier 3: Last Sample Provenance & Service Actions Footer */}
      <div className="flex flex-col gap-3 border-t border-rule pt-3 sm:flex-row sm:items-center sm:justify-between">
        <dl className="grid grid-cols-1 gap-y-1 text-xs">
          <div className="min-w-0">
            <dt className="text-faint">Last sample</dt>
            <dd className="mt-0.5 text-muted" suppressHydrationWarning>
              {formatLastSample(observation)}
            </dd>
          </div>
        </dl>

        {branchId && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={() => setGasModalOpen(true)}
              className="inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-sm font-medium text-ink transition-colors duration-150 enabled:hover:bg-navy-hover enabled:active:bg-navy-selected motion-safe:enabled:active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted motion-reduce:transition-none sm:w-auto"
            >
              <Flame className="size-4 shrink-0 text-muted" aria-hidden="true" />
              <span>
                {device.gas_interpretation?.ppm_calibrated || device.lpg_config?.mq6_ro_kohm != null
                  ? "Recalibrate gas"
                  : "Calibrate clean air"}
              </span>
            </button>

            {isMaintenance ? (
              isTankSwapSession ? (
                <button
                  type="button"
                  onClick={() => setSwapModalOpen(true)}
                  className="inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-ink bg-ink px-3.5 py-2 text-sm font-semibold text-surface transition-colors duration-150 enabled:hover:border-muted enabled:hover:bg-muted motion-safe:enabled:active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted motion-reduce:transition-none sm:w-auto"
                >
                  <Wrench className="size-4 shrink-0" aria-hidden="true" />
                  <span>Complete tank swap</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setServiceModalOpen(true)}
                  className="inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-ink bg-ink px-3.5 py-2 text-sm font-semibold text-surface transition-colors duration-150 enabled:hover:border-muted enabled:hover:bg-muted motion-safe:enabled:active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted motion-reduce:transition-none sm:w-auto"
                >
                  <Wrench className="size-4 shrink-0" aria-hidden="true" />
                  <span>Complete maintenance &amp; log</span>
                </button>
              )
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setServiceModalOpen(true)}
                  className="inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-sm font-medium text-ink transition-colors duration-150 enabled:hover:bg-navy-hover enabled:active:bg-navy-selected motion-safe:enabled:active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted motion-reduce:transition-none sm:w-auto"
                >
                  <Wrench className="size-4 shrink-0 text-warning" aria-hidden="true" />
                  <span>Maintenance / Log service</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSwapModalOpen(true)}
                  className="inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-ink bg-ink px-3.5 py-2 text-sm font-semibold text-surface transition-colors duration-150 enabled:hover:border-muted enabled:hover:bg-muted motion-safe:enabled:active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted motion-reduce:transition-none sm:w-auto"
                >
                  <Wrench className="size-4 shrink-0" aria-hidden="true" />
                  <span>Swap tank</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {swapModalOpen && branchId && (
        <LpgTankSwapModal
          open
          mode={isMaintenance ? "complete" : "start"}
          branchId={branchId}
          device={device}
          defaultActorName={defaultActorName}
          onClose={() => setSwapModalOpen(false)}
          onConfirmed={async () => {
            if (onRefresh) await onRefresh();
          }}
        />
      )}

      {serviceModalOpen && branchId && (
        <ServiceAndIncidentModal
          open
          branchId={branchId}
          domain="lpg"
          sourceId={device.source_id}
          assetLabel={device.label}
          assetStatus={operatingMode.toUpperCase()}
          isMaintenanceMode={isMaintenance}
          defaultTechnicianName={defaultActorName ?? ""}
          defaultErrorCode={
            gasInfo?.gas_condition === "critical"
              ? "GAS_CRITICAL"
              : gasInfo?.gas_condition === "warning"
                ? "GAS_WARNING"
                : null
          }
          onClose={() => setServiceModalOpen(false)}
          onCompleted={async () => {
            if (onRefresh) await onRefresh();
          }}
        />
      )}

      {gasModalOpen && branchId && (
        <LpgGasBaselineModal
          open
          branchId={branchId}
          device={device}
          defaultActorName={defaultActorName}
          onClose={() => setGasModalOpen(false)}
          onConfirmed={async () => {
            if (onRefresh) await onRefresh();
          }}
        />
      )}
    </article>
  );
}
