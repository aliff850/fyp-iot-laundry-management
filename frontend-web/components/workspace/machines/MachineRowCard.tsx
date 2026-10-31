"use client";

import React, { useState, useTransition } from "react";
import {
  Play,
  Pause,
  Square,
  Unlock,
  SlidersHorizontal,
  Clock,
  Tag,
  Lock,
} from "lucide-react";
import type { MachineItem } from "@/lib/auth/business";
import { executeMachineCommand } from "@/app/branches/[branchId]/machines/actions";
import {
  SimpleWasherSvg,
  SimpleDryerSvg,
} from "@/components/workspace/machines/MachineCard";

export interface MachineRowCardProps {
  machine: MachineItem;
  branchId: string;
  userRole: "owner" | "branch_manager" | "machine_maintenance" | "lpg_maintenance";
  onOpenDetails: (machine: MachineItem) => void;
  onMachineUpdated?: (updated: MachineItem) => void;
}

export function MachineRowCard({
  machine,
  branchId,
  userRole,
  onOpenDetails,
  onMachineUpdated,
}: MachineRowCardProps) {
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const isOperator = userRole === "owner" || userRole === "branch_manager";
  const isWasher = machine.type === "washer";

  // Status visual variants adhering strictly to DESIGN.md Section 4.5 & 4.8
  const getStatusBadge = () => {
    switch (machine.status) {
      case "RUNNING":
        return {
          wrapper: "border-accent/40 bg-accent/10 text-ink",
          dot: "bg-accent",
          label: "Running",
        };
      case "IDLE":
        return {
          wrapper: "border-positive/30 bg-positive/10 text-positive",
          dot: "bg-positive",
          label: "Idle / Available",
        };
      case "PAUSED":
        return {
          wrapper: "border-warning/30 bg-warning/10 text-warning",
          dot: "bg-warning",
          label: "Paused",
        };
      case "ERROR":
        return {
          wrapper: "border-negative/40 bg-negative/10 text-negative",
          dot: "bg-negative",
          label: machine.fault_code ? `Fault: ${machine.fault_code}` : "Error",
        };
      case "OFFLINE":
      default:
        return {
          wrapper: "border-line bg-raised text-muted",
          dot: "bg-muted",
          label: "Offline",
        };
    }
  };

  const status = getStatusBadge();

  const handleCommand = (
    cmd: "start" | "pause" | "resume" | "stop" | "unlock"
  ) => {
    setActionError(null);
    startTransition(async () => {
      const res = await executeMachineCommand(branchId, machine.id, cmd);
      if (!res.success) {
        setActionError(res.message || `Failed to execute ${cmd}`);
      } else if (res.machine && onMachineUpdated) {
        onMachineUpdated(res.machine);
      }
    });
  };

  const canStart =
    isOperator &&
    !isPending &&
    (machine.status === "IDLE" || machine.status === "PAUSED");

  const canPause =
    isOperator &&
    !isPending &&
    machine.status === "RUNNING";

  const canStop =
    isOperator &&
    !isPending &&
    (machine.status === "RUNNING" || machine.status === "PAUSED");

  const getRemainingTimeText = () => {
    if (machine.status === "RUNNING") {
      return `${machine.remaining_time} min remaining`;
    }
    if (machine.status === "PAUSED") {
      return `${machine.remaining_time} min remaining (Paused)`;
    }
    if (machine.status === "IDLE") {
      return machine.parameters.duration_mins
        ? `Ready (${machine.parameters.duration_mins} min cycle)`
        : "Ready for cycle";
    }
    if (machine.status === "ERROR") {
      return "Cycle interrupted";
    }
    return "Unavailable";
  };

  const progressPct = Math.round(
    Math.max(
      15,
      Math.min(
        100,
        ((machine.parameters.duration_mins - machine.remaining_time) /
          (machine.parameters.duration_mins || 35)) *
        100
      )
    )
  );

  return (
    <article
      aria-label={`${machine.name} (${status.label})`}
      className="flex min-w-0 w-full flex-col gap-4 rounded-md border border-line bg-surface p-4 sm:p-5 md:p-6"
    >
      {/* Tier 1: Machine Identity Row (Mobile-First Responsive Layout) */}
      <div className="flex items-center gap-3.5 min-w-0">
        <div className="shrink-0">
          {isWasher ? (
            <SimpleWasherSvg
              status={machine.status}
              className="size-10 shrink-0 text-muted"
            />
          ) : (
            <SimpleDryerSvg
              status={machine.status}
              className="size-10 shrink-0 text-muted"
            />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <h3 className="min-w-0 truncate text-base font-semibold leading-normal text-ink">
            {machine.name}
          </h3>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span
              className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded border px-2.5 py-1 text-xs font-medium ${status.wrapper}`}
            >
              <span
                className={`size-2 rounded-full ${status.dot}`}
                aria-hidden="true"
              />
              <span>{status.label}</span>
            </span>

            {machine.parameters.door_locked && (
              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-warning/30 bg-raised px-2.5 py-1 text-xs font-medium text-warning">
                <Lock className="size-3.5 shrink-0" aria-hidden="true" />
                <span>Door locked</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tier 2: Machine Reading Grid (DESIGN.md Section 3.3, 4.7, 4.8) */}
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Box 1: Cycle program */}
        <div className="flex flex-col justify-between rounded-md border border-line bg-raised/40 p-3.5 md:p-4">
          <dt className="text-xs leading-normal text-muted">Cycle program</dt>
          <dd className="mt-1 text-sm font-semibold leading-normal text-ink truncate">
            {machine.current_cycle ||
              (machine.status === "IDLE" ? "Standby" : "—")}
          </dd>
        </div>

        {/* Box 2: Cycle time */}
        <div className="flex flex-col justify-between rounded-md border border-line bg-raised/40 p-3.5 md:p-4">
          <dt className="flex items-center gap-1.5 text-xs leading-normal text-muted">
            <Clock className="size-3.5 shrink-0 text-faint" aria-hidden="true" />
            <span>Cycle time</span>
          </dt>
          <dd className="mt-1 text-sm font-semibold leading-normal text-ink tabular-nums">
            {getRemainingTimeText()}
          </dd>
          {machine.status === "RUNNING" && (
            <svg
              viewBox="0 0 100 4"
              preserveAspectRatio="none"
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface"
              role="progressbar"
              aria-valuenow={progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Cycle progress"
            >
              <rect
                x="0"
                y="0"
                width={progressPct}
                height="4"
                className="fill-accent"
              />
            </svg>
          )}
        </div>

        {/* Box 3: Cycle rate */}
        <div className="flex flex-col justify-between rounded-md border border-line bg-raised/40 p-3.5 md:p-4">
          <dt className="flex items-center gap-1.5 text-xs leading-normal text-muted">
            <Tag className="size-3.5 shrink-0 text-faint" aria-hidden="true" />
            <span>Cycle rate</span>
          </dt>
          <dd className="mt-1 text-sm font-semibold leading-normal text-ink tabular-nums">
            {machine.parameters.price !== null &&
            machine.parameters.price !== undefined
              ? `RM ${machine.parameters.price.toFixed(2)}`
              : "—"}
          </dd>
        </div>
      </dl>

      {/* Tier 3: Machine Action Row (DESIGN.md Section 4.2 & 4.8) */}
      <div className="flex flex-col gap-3 border-t border-rule pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        {isOperator ? (
          <div
            className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center"
            role="group"
            aria-label="Cycle controls"
          >
            <button
              type="button"
              disabled={!canStart}
              aria-busy={isPending}
              onClick={() =>
                handleCommand(machine.status === "PAUSED" ? "resume" : "start")
              }
              className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-ink bg-ink px-3.5 py-2 text-sm font-semibold text-surface transition-colors duration-150 enabled:hover:border-muted enabled:hover:bg-muted motion-safe:enabled:active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted motion-reduce:transition-none"
              title={
                machine.status === "PAUSED"
                  ? "Resume paused cycle"
                  : canStart
                    ? "Start wash cycle"
                    : "Start unavailable while machine is active or faulted"
              }
            >
              <Play className="size-3.5 shrink-0" aria-hidden="true" />
              <span>
                {isPending
                  ? "Working…"
                  : machine.status === "PAUSED"
                    ? "Resume"
                    : "Start"}
              </span>
            </button>

            <button
              type="button"
              disabled={!canPause}
              aria-busy={isPending}
              onClick={() => handleCommand("pause")}
              className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-sm font-medium text-ink transition-colors duration-150 enabled:hover:bg-navy-hover enabled:active:bg-navy-selected focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted motion-reduce:transition-none"
              title={
                canPause
                  ? "Pause running cycle"
                  : "Pause is only available when machine is running"
              }
            >
              <Pause className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{isPending ? "Working…" : "Pause"}</span>
            </button>

            <button
              type="button"
              disabled={!canStop}
              aria-busy={isPending}
              onClick={() => handleCommand("stop")}
              className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-negative bg-negative px-3.5 py-2 text-sm font-semibold text-surface transition-colors duration-150 enabled:hover:border-ink motion-safe:enabled:active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted motion-reduce:transition-none"
              title={
                canStop
                  ? "Stop active cycle"
                  : "Stop is only available when machine is active"
              }
            >
              <Square className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{isPending ? "Working…" : "Stop"}</span>
            </button>

            {(machine.status === "IDLE" || machine.status === "ERROR") &&
              machine.parameters.door_locked && (
                <button
                  type="button"
                  disabled={isPending}
                  aria-busy={isPending}
                  onClick={() => handleCommand("unlock")}
                  className="col-span-3 inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-sm font-medium text-ink transition-colors duration-150 enabled:hover:bg-navy-hover enabled:active:bg-navy-selected focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted motion-reduce:transition-none sm:col-span-1"
                  title="Unlock door interlock"
                >
                  <Unlock className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>Unlock door</span>
                </button>
              )}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 py-1 text-xs text-faint">
            <span>Diagnostics only</span>
            <span>Operator controls restricted</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => onOpenDetails(machine)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-sm font-medium text-ink transition-colors duration-150 enabled:hover:bg-navy-hover enabled:active:bg-navy-selected focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none sm:w-auto"
        >
          <SlidersHorizontal
            className="size-4 shrink-0 text-muted"
            aria-hidden="true"
          />
          <span>Details &amp; parameters</span>
        </button>
      </div>

      {actionError && (
        <p
          className="rounded-md border-l-2 border-negative bg-raised px-4 py-3 text-sm text-ink"
          role="alert"
        >
          {actionError}
        </p>
      )}
    </article>
  );
}
