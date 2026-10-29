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
} from "lucide-react";
import type { MachineItem } from "@/lib/auth/business";
import { executeMachineCommand } from "@/app/branches/[branchId]/machines/actions";

interface MachineCardProps {
  machine: MachineItem;
  branchId: string;
  userRole: "owner" | "branch_manager" | "machine_maintenance" | "lpg_maintenance";
  onOpenDetails: (machine: MachineItem) => void;
  onMachineUpdated?: (updated: MachineItem) => void;
}

/**
 * Simple, Clean Mono-Colored SVG Illustration for Commercial Front-Load Washers
 */
function SimpleWasherSvg({ status }: { status: MachineItem["status"] }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="size-28 text-muted transition-colors group-hover:text-ink select-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={`Commercial Washer illustration (${status})`}
    >
      {/* Cabinet Frame */}
      <rect x="15" y="10" width="70" height="80" rx="6" />
      {/* Control Panel Divider */}
      <line x1="15" y1="28" x2="85" y2="28" strokeWidth="2" />
      {/* Detergent Dispenser Drawer */}
      <rect x="23" y="16" width="16" height="7" rx="1.5" strokeWidth="1.5" />
      {/* Control Dial */}
      <circle cx="73" cy="19.5" r="3.5" strokeWidth="1.5" />
      {/* Outer Door Ring */}
      <circle cx="50" cy="58" r="23" strokeWidth="2.5" />
      {/* Inner Drum Window */}
      <circle cx="50" cy="58" r="16" strokeWidth="1.5" strokeDasharray="4 3" />
      {/* Handle Latch */}
      <path d="M 72 55 L 72 61" strokeWidth="2" />
    </svg>
  );
}

/**
 * Simple, Clean Mono-Colored SVG Illustration for Commercial Gas-Heated Dryers
 */
function SimpleDryerSvg({ status }: { status: MachineItem["status"] }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="size-28 text-muted transition-colors group-hover:text-ink select-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={`Commercial Dryer illustration (${status})`}
    >
      {/* Cabinet Frame */}
      <rect x="15" y="10" width="70" height="80" rx="6" />
      {/* Control Panel Divider */}
      <line x1="15" y1="28" x2="85" y2="28" strokeWidth="2" />
      {/* Heat Control Dials */}
      <circle cx="27" cy="19.5" r="3.5" strokeWidth="1.5" />
      <circle cx="39" cy="19.5" r="3.5" strokeWidth="1.5" />
      {/* Lint Trap / Display Screen */}
      <rect x="58" y="16" width="18" height="7" rx="1.5" strokeWidth="1.5" />
      {/* Outer Door Ring */}
      <circle cx="50" cy="58" r="23" strokeWidth="2.5" />
      {/* Tumbler Drum & Air Vents */}
      <circle cx="50" cy="58" r="16" strokeWidth="1.5" />
      <line x1="42" y1="54" x2="58" y2="54" strokeWidth="1.5" />
      <line x1="40" y1="58" x2="60" y2="58" strokeWidth="1.5" />
      <line x1="42" y1="62" x2="58" y2="62" strokeWidth="1.5" />
      {/* Handle Latch */}
      <path d="M 72 55 L 72 61" strokeWidth="2" />
    </svg>
  );
}

export function MachineCard({
  machine,
  branchId,
  userRole,
  onOpenDetails,
  onMachineUpdated,
}: MachineCardProps) {
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const isOperator = userRole === "owner" || userRole === "branch_manager";
  const isWasher = machine.type === "washer";

  // Status visual variants adhering to DESIGN.md Section 4.5 & 4.8
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

  // Control action handler stopping propagation so card click is not triggered
  const handleCommand = (
    e: React.MouseEvent,
    cmd: "start" | "pause" | "resume" | "stop" | "unlock"
  ) => {
    e.stopPropagation();
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

  // State-validated button states for Start, Pause, Stop
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

  // Remaining time formatted string
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

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetails(machine)}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenDetails(machine);
        }
      }}
      className="group flex min-w-0 flex-col justify-between rounded-md border border-line bg-surface p-5 transition-all hover:border-control hover:bg-surface/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent cursor-pointer"
      aria-label={`Machine card for ${machine.name}, status ${status.label}. Click to inspect details.`}
    >
      <div className="space-y-3.5">
        {/* 1. TITLE SECTION (Frontend-Specs.md Line 211) */}
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold tracking-tight text-ink truncate group-hover:text-accent transition-colors">
              {machine.name}
            </h3>
            {/* <p className="mt-0.5 text-xs text-muted">
              {isWasher ? "Commercial High-Spin Washer" : "Commercial Gas-Heated Dryer"} · {machine.capacity_kg} kg
            </p> */}
          </div>

          {/* <div
            className="flex size-7 shrink-0 items-center justify-center rounded border border-rule bg-raised/40 text-muted transition-colors group-hover:border-control group-hover:text-ink"
            title="Inspect machine details and parameters"
          >
            <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          </div> */}
        </div>

        {/* 2. FULL SIZED MONO-COLORED SVG IMAGE (Frontend-Specs.md Line 213) */}
        <div className="relative flex h-36 w-full items-center justify-center rounded-md border border-rule/60 bg-raised/20 p-3 transition-transform duration-200 group-hover:scale-[1.01]">
          {isWasher ? (
            <SimpleWasherSvg status={machine.status} />
          ) : (
            <SimpleDryerSvg status={machine.status} />
          )}

          {/* Fault Indicator Overlay if ERROR */}
          {machine.status === "ERROR" && (
            <div className="absolute inset-x-2 bottom-2 rounded bg-negative/90 px-2.5 py-1 text-center backdrop-blur-xs">
              <span className="text-[11px] font-semibold text-surface">
                {machine.fault_code ? `Fault: ${machine.fault_code}` : "Safety Fault"}
              </span>
            </div>
          )}
        </div>

        {/* 3. MACHINE STATUS SECTION (Frontend-Specs.md Line 215) */}
        <div className="flex flex-col gap-1.5 rounded-md border border-rule bg-raised/30 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-muted">Operational Status</span>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${status.wrapper}`}
            >
              <span className={`size-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
              <span>{status.label}</span>
            </span>
          </div>

          <div className="flex items-center justify-between text-xs text-muted">
            <span>Cycle Program</span>
            <span className="font-semibold text-ink truncate max-w-[140px]">
              {machine.current_cycle || (machine.status === "IDLE" ? "Standby" : "—")}
            </span>
          </div>
        </div>

        {/* 4. REMAINING CYCLE TIME & RATE SECTION (Frontend-Specs.md Line 217) */}
        <div className="space-y-2 rounded-md border border-rule bg-raised/30 p-2.5">
          {/* Cycle Time Row */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-muted">
              <Clock className="size-3.5 text-faint" aria-hidden="true" />
              <span>Cycle Time</span>
            </div>
            <span className="font-semibold text-ink tabular-nums">
              {getRemainingTimeText()}
            </span>
          </div>

          {/* Progress Bar for Running Cycle */}
          {machine.status === "RUNNING" && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
              <div
                className="h-full bg-accent transition-all duration-500 rounded-full"
                style={{
                  width: `${Math.max(
                    15,
                    Math.min(
                      100,
                      ((machine.parameters.duration_mins - machine.remaining_time) /
                        (machine.parameters.duration_mins || 35)) *
                      100
                    )
                  )}%`,
                }}
              />
            </div>
          )}

          {/* Rate Row Positioned Directly Below Cycle Time Matching Its Styling */}
          <div className="flex items-center justify-between text-xs border-t border-rule/60 pt-2">
            <div className="flex items-center gap-1.5 text-muted">
              <Tag className="size-3.5 text-faint" aria-hidden="true" />
              <span>Cycle Rate</span>
            </div>
            <span className="font-semibold text-ink tabular-nums">
              {machine.parameters.price !== null && machine.parameters.price !== undefined
                ? `RM ${machine.parameters.price.toFixed(2)}`
                : "—"}
            </span>
          </div>
        </div>

        {/* Error Feedback Message if Command Failed */}
        {actionError && (
          <p className="text-xs text-negative" role="alert">
            {actionError}
          </p>
        )}
      </div>

      {/* 5. THREE BUTTONS SECTION: START, PAUSE, STOP (Frontend-Specs.md Line 219) */}
      <div className="mt-4 border-t border-rule pt-3.5">
        {isOperator ? (
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Machine operational cycle controls">
            {/* 1. START / RESUME BUTTON */}
            <button
              type="button"
              disabled={!canStart}
              onClick={e => handleCommand(e, machine.status === "PAUSED" ? "resume" : "start")}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-ink bg-ink px-2 py-1.5 text-xs font-semibold text-surface transition-colors duration-150 enabled:hover:border-muted enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control/50 disabled:bg-raised disabled:text-muted/60"
              title={
                machine.status === "PAUSED"
                  ? "Resume paused cycle"
                  : canStart
                    ? "Start wash cycle"
                    : "Start unavailable while machine is active or faulted"
              }
            >
              <Play className="size-3" aria-hidden="true" />
              <span>{isPending ? "…" : machine.status === "PAUSED" ? "Resume" : "Start"}</span>
            </button>

            {/* 2. PAUSE BUTTON */}
            <button
              type="button"
              disabled={!canPause}
              onClick={e => handleCommand(e, "pause")}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-control bg-navy px-2 py-1.5 text-xs font-medium text-ink transition-colors duration-150 enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control/50 disabled:bg-raised disabled:text-muted/60"
              title={canPause ? "Pause running cycle" : "Pause is only available when machine is running"}
            >
              <Pause className="size-3" aria-hidden="true" />
              <span>{isPending ? "…" : "Pause"}</span>
            </button>

            {/* 3. STOP BUTTON */}
            <button
              type="button"
              disabled={!canStop}
              onClick={e => handleCommand(e, "stop")}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-negative/40 bg-negative/15 px-2 py-1.5 text-xs font-medium text-negative transition-colors duration-150 enabled:hover:bg-negative/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control/50 disabled:bg-raised disabled:text-muted/60"
              title={canStop ? "Stop active cycle" : "Stop is only available when machine is active"}
            >
              <Square className="size-3" aria-hidden="true" />
              <span>{isPending ? "…" : "Stop"}</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between py-1 text-xs text-muted">
            <span className="text-[11px] text-faint">Diagnostics only</span>
            <span className="text-[11px] text-faint">Operator controls restricted</span>
          </div>
        )}

        {/* Quick Door Unlock for operators when door is locked and machine not running */}
        {isOperator && (machine.status === "IDLE" || machine.status === "ERROR") && machine.parameters.door_locked && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              disabled={isPending}
              onClick={e => handleCommand(e, "unlock")}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
              title="Unlock door interlock"
            >
              <Unlock className="size-3" aria-hidden="true" />
              <span>Unlock Door</span>
            </button>
          </div>
        )}

        {/* Full-width Details & Parameters button */}
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onOpenDetails(machine);
          }}
          className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-control bg-raised/50 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <SlidersHorizontal className="size-3.5 text-muted" aria-hidden="true" />
          <span>Details & Parameters</span>
        </button>
      </div>
    </div>
  );
}
