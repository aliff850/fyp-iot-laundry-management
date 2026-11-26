"use client";

import React from "react";
import { AlertTriangle, SlidersHorizontal } from "lucide-react";
import type { RemoteMachine } from "@/app/branches/[branchId]/machines/actions";
import { formatMytDateTime } from "@/lib/formatDate";

export type MachineModalTab = "diagnostics" | "statistics" | "programs" | "parameters";

export interface MachineCardProps {
  machine: RemoteMachine;
  branchId: string;
  branchOpen: boolean;
  role: "owner" | "branch_manager" | "machine_maintenance";
  serviceError?: string | null;
  onOpenDetails: (machine: RemoteMachine, initialTab?: MachineModalTab) => void;
  onCommandSent?: () => void;
}

/**
 * Simple, Clean Mono-Colored SVG Illustration for Commercial Front-Load Washers
 */
export function SimpleWasherSvg({
  status,
  className = "size-28",
}: {
  status: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={`${className} text-muted transition-colors group-hover:text-ink select-none`.trim()}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={`Commercial Washer illustration (${status})`}
    >
      <rect x="15" y="10" width="70" height="80" rx="6" />
      <line x1="15" y1="28" x2="85" y2="28" strokeWidth="2" />
      <rect x="23" y="16" width="16" height="7" rx="1.5" strokeWidth="1.5" />
      <circle cx="73" cy="19.5" r="3.5" strokeWidth="1.5" />
      <circle cx="50" cy="58" r="23" strokeWidth="2.5" />
      <circle cx="50" cy="58" r="16" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d="M 72 55 L 72 61" strokeWidth="2" />
    </svg>
  );
}

/**
 * Simple, Clean Mono-Colored SVG Illustration for Commercial Gas-Heated Dryers
 */
export function SimpleDryerSvg({
  status,
  className = "size-28",
}: {
  status: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={`${className} text-muted transition-colors group-hover:text-ink select-none`.trim()}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={`Commercial Dryer illustration (${status})`}
    >
      <rect x="15" y="10" width="70" height="80" rx="6" />
      <line x1="15" y1="28" x2="85" y2="28" strokeWidth="2" />
      <circle cx="27" cy="19.5" r="3.5" strokeWidth="1.5" />
      <circle cx="39" cy="19.5" r="3.5" strokeWidth="1.5" />
      <rect x="58" y="16" width="18" height="7" rx="1.5" strokeWidth="1.5" />
      <circle cx="50" cy="58" r="23" strokeWidth="2.5" />
      <circle cx="50" cy="58" r="16" strokeWidth="1.5" />
      <line x1="42" y1="54" x2="58" y2="54" strokeWidth="1.5" />
      <line x1="40" y1="58" x2="60" y2="58" strokeWidth="1.5" />
      <line x1="42" y1="62" x2="58" y2="62" strokeWidth="1.5" />
      <path d="M 72 55 L 72 61" strokeWidth="2" />
    </svg>
  );
}

export function formatDateLabel(value: string | null): string {
  if (!value) return "—";
  return formatMytDateTime(value, "Time unknown");
}

export function freshnessText(freshness: RemoteMachine["freshness"]): string {
  if (freshness === "fresh") return "Fresh";
  if (freshness === "stale") return "Stale";
  if (freshness === "missing") return "No approved observation";
  return "Time unknown";
}

export function sourceText(source: RemoteMachine["source"]): string {
  if (source === "simulated") return "Simulator";
  if (source === "physical") return "Physical source";
  if (source === "vendor") return "Vendor source, capabilities unverified";
  return "Source unknown";
}

export function programDisplayName(
  id: string,
  program?: Record<string, unknown> | null,
): string {
  if (program && typeof program.name === "string" && program.name.trim()) {
    return program.name;
  }
  if (id === "quick") return "Quick";
  if (id === "standard") return "Standard";
  return id;
}

export function getMachineStatusBadge(machine: RemoteMachine): {
  effectiveStatus: "RUNNING" | "IDLE" | "PAUSED" | "ERROR" | "MAINTENANCE" | "OFFLINE";
  label: string;
  wrapper: string;
  dot: string;
} {
  if (machine.freshness === "missing") {
    return {
      effectiveStatus: "OFFLINE",
      wrapper: "border-line bg-raised text-muted",
      dot: "bg-muted",
      label: "No approved observation",
    };
  }
  const rawUpper = machine.state.toUpperCase();
  if (machine.freshness !== "fresh") {
    return {
      effectiveStatus: "OFFLINE",
      wrapper: "border-line bg-raised text-muted",
      dot: "bg-muted",
      label:
        rawUpper && rawUpper !== "UNKNOWN"
          ? `Current state unknown (last reported ${rawUpper})`
          : "Offline / Telemetry stale",
    };
  }
  switch (rawUpper) {
    case "RUNNING":
      return {
        effectiveStatus: "RUNNING",
        wrapper: "border-control bg-raised text-ink",
        dot: "bg-muted",
        label: "Running",
      };
    case "IDLE":
      return {
        effectiveStatus: "IDLE",
        wrapper: "border-positive/30 bg-positive/10 text-positive",
        dot: "bg-positive",
        label: "Idle / Available",
      };
    case "PAUSED":
      return {
        effectiveStatus: "PAUSED",
        wrapper: "border-control bg-raised text-ink",
        dot: "bg-muted",
        label: "Paused",
      };
    case "ERROR":
      return {
        effectiveStatus: "ERROR",
        wrapper: "border-negative/40 bg-negative/10 text-negative",
        dot: "bg-negative",
        label: machine.data?.fault_code
          ? `Fault: ${machine.data.fault_code}`
          : "Error",
      };
    case "MAINTENANCE":
      return {
        effectiveStatus: "MAINTENANCE",
        wrapper: "border-warning/40 bg-warning/10 text-warning",
        dot: "bg-warning",
        label: machine.data?.fault_code
          ? `Under maintenance (${machine.data.fault_code})`
          : "Under maintenance",
      };
    default:
      return {
        effectiveStatus: "OFFLINE",
        wrapper: "border-line bg-raised text-muted",
        dot: "bg-muted",
        label: "Offline",
      };
  }
}

export function MachineCard({
  machine,
  onOpenDetails,
}: MachineCardProps) {
  const isFresh = machine.freshness === "fresh";
  const badge = getMachineStatusBadge(machine);
  const effectiveStatus = badge.effectiveStatus;
  const isWasher = machine.type !== "dryer";
  const activeIncidentsCount =
    typeof machine.active_incidents_count === "number"
      ? machine.active_incidents_count
      : machine.active_incident
        ? 1
        : 0;

  const remainingSecs =
    isFresh && typeof machine.data?.remaining_seconds === "number"
      ? machine.data.remaining_seconds
      : null;
  const remainingMins =
    remainingSecs !== null ? Math.max(0, Math.ceil(remainingSecs / 60)) : null;
  const remEstimateVal =
    isFresh && remainingSecs !== null
      ? `${remainingSecs} s (${remainingMins} min)`
      : "—";

  const capacityText =
    typeof machine.capacity_kg === "number" && Number.isFinite(machine.capacity_kg)
      ? `${machine.capacity_kg.toFixed(1)} kg`
      : "Unavailable";

  const machineStateText =
    effectiveStatus === "RUNNING"
      ? "Running"
      : effectiveStatus === "PAUSED"
        ? "Paused"
        : effectiveStatus === "IDLE"
          ? "Idle"
          : effectiveStatus === "ERROR"
            ? machine.data?.fault_code
              ? `Fault (${machine.data.fault_code})`
              : "Fault"
            : effectiveStatus === "MAINTENANCE"
              ? machine.data?.fault_code
                ? `Under maintenance (${machine.data.fault_code})`
                : "Under maintenance"
              : "Offline";

  const categoryText =
    machine.type === "washer_dryer"
      ? "Washer / Dryer"
      : isWasher
        ? "Washer"
        : "Dryer";

  const renderRowBox = (rows: readonly [string, string][]) => (
    <dl className="flex flex-col justify-between gap-2.5 rounded-md border border-line bg-raised/40 p-3.5 md:p-4">
      {rows.map(([label, valText], idx) => (
        <div
          key={label}
          className={idx > 0 ? "min-w-0 border-t border-rule/60 pt-2.5" : "min-w-0"}
        >
          <dt className="truncate text-xs leading-normal text-muted">{label}</dt>
          <dd
            className="mt-1 min-w-0 break-words text-sm font-semibold leading-normal tabular-nums text-ink"
            suppressHydrationWarning
          >
            {valText}
          </dd>
        </div>
      ))}
    </dl>
  );

  return (
    <article
      aria-label={`${machine.label} (${badge.label})`}
      className="group flex min-w-0 w-full flex-col gap-4 rounded-md border border-line bg-surface p-4 sm:p-5 md:p-6"
    >
      {/* Tier 1: Machine Identity (Device ID only) & Status Badge Row (matching Pi 5 machineRowCard) */}
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-md border border-rule bg-raised/40 p-1.5">
          {isWasher ? (
            <SimpleWasherSvg status={effectiveStatus} className="size-12 shrink-0" />
          ) : (
            <SimpleDryerSvg status={effectiveStatus} className="size-12 shrink-0" />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
          <div className="min-w-0">
            <h3 className="min-w-0 break-words text-base font-semibold leading-normal text-ink">
              {machine.label}
            </h3>
            <dl className="mt-2 grid grid-cols-1 gap-y-1 text-xs">
              <div className="min-w-0">
                <dt className="text-faint">Device ID</dt>
                <dd className="mt-0.5 break-all text-muted">{machine.source_id}</dd>
              </div>
            </dl>
          </div>

          <div className="flex shrink-0 max-w-full flex-wrap items-center gap-2">
            {activeIncidentsCount > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-negative/40 bg-negative/15 px-2.5 py-1 text-xs font-semibold text-negative">
                <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                <span>Attention!</span>
              </span>
            )}
            <span
              className={`inline-flex max-w-full shrink-0 items-center gap-2 whitespace-normal break-words rounded border px-2.5 py-1 text-xs font-medium ${badge.wrapper}`}
            >
              <span
                className={`size-2 shrink-0 rounded-full ${badge.dot}`}
                aria-hidden="true"
              />
              <span>{badge.label}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Tier 2: Horizontal 3-Box Detail Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {renderRowBox([
          ["Machine state", machineStateText],
          ["Remaining estimate", remEstimateVal],
        ])}
        {renderRowBox([
          ["Capacity", capacityText],
          ["Category", categoryText],
        ])}
        {renderRowBox([
          ["Last sample", formatDateLabel(machine.last_update)],
          ["Freshness", freshnessText(machine.freshness)],
        ])}
      </div>

      {/* Tier 3: Modal Trigger Footer */}
      <div className="flex flex-col gap-3 border-t border-rule pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => onOpenDetails(machine, "diagnostics")}
            className="inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-xs font-medium text-ink transition-colors duration-150 hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
          >
            <SlidersHorizontal className="size-4 shrink-0 text-muted" aria-hidden="true" />
            <span>Details &amp; parameters</span>
          </button>
        </div>
      </div>
    </article>
  );
}
