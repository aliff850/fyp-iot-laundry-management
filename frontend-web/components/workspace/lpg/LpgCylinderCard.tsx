"use client";

import React, { useState, useTransition } from "react";
import {
  Flame,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Radio,
} from "lucide-react";
import type { LpgCylinderItem } from "@/lib/auth/business";
import {
  executeStartReplacement,
  executeCancelReplacement,
} from "@/app/branches/[branchId]/lpg/actions";
import { LpgReplacementModal } from "./LpgReplacementModal";

interface LpgCylinderCardProps {
  cylinder: LpgCylinderItem;
  branchId: string;
  userRole: "owner" | "branch_manager" | "machine_maintenance" | "lpg_maintenance";
  onCylinderUpdated?: (updated: LpgCylinderItem) => void;
}

/**
 * Clean, Mono-Colored Vector SVG Cylinder Illustration
 * Displays static tank geometry with percentage reading inside the vessel
 */
function CylinderGaugeSvg({
  fillPercent,
  status,
  isMaintenance,
}: {
  fillPercent: number;
  status: LpgCylinderItem["status"];
  isMaintenance: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, fillPercent));

  const getTextColor = () => {
    if (isMaintenance) return "fill-muted";
    if (status === "CRITICAL" || clamped < 5.0) return "fill-negative";
    if (status === "WARNING" || clamped < 15.0) return "fill-warning";
    return "fill-ink";
  };

  return (
    <svg
      viewBox="0 0 100 110"
      className="size-28 text-muted transition-colors group-hover:text-ink select-none"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={`LPG Cylinder level: ${clamped.toFixed(1)}%`}
    >
      {/* Valve & Regulator Assembly at top */}
      <rect x="44" y="6" width="12" height="6" rx="1.5" strokeWidth="2" />
      <line x1="50" y1="12" x2="50" y2="18" strokeWidth="2" />

      {/* Top Protective Collar / Shroud Handle */}
      <path d="M 32 24 L 32 15 C 32 13 36 12 50 12 C 64 12 68 13 68 15 L 68 24" strokeWidth="2" />
      <line x1="38" y1="18" x2="62" y2="18" strokeWidth="1.5" />

      {/* Cylinder Body Outer Frame */}
      <rect x="20" y="24" width="60" height="68" rx="8" strokeWidth="2.5" />

      {/* Static Internal Percentage Reading */}
      <text
        x="50"
        y="58"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="13"
        fontWeight="600"
        stroke="none"
        className={`${getTextColor()} tabular-nums select-none`}
      >
        {clamped.toFixed(1)}%
      </text>

      {/* Welded Footring Base */}
      <path d="M 28 92 L 28 99 C 28 101 34 102 50 102 C 66 102 72 101 72 99 L 72 92" strokeWidth="2" />
    </svg>
  );
}

export function LpgCylinderCard({
  cylinder,
  branchId,
  userRole,
  onCylinderUpdated,
}: LpgCylinderCardProps) {
  const [isPending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isOperator = userRole === "owner" || userRole === "branch_manager" || userRole === "lpg_maintenance";
  const isMaint = cylinder.maintenance_mode;
  const isPhysical = cylinder.source_kind === "physical";

  const getStatusBadge = () => {
    if (isMaint) {
      return {
        wrapper: "border-control/50 bg-raised text-muted",
        dot: "bg-muted",
        label: "Swap Mode",
      };
    }
    if (cylinder.status === "CRITICAL" || cylinder.fill_percent < 5.0) {
      return {
        wrapper: "border-negative/40 bg-negative/10 text-negative",
        dot: "bg-negative",
        label: "Critical Depletion",
      };
    }
    if (cylinder.status === "WARNING" || cylinder.fill_percent < 15.0) {
      return {
        wrapper: "border-warning/40 bg-warning/10 text-warning",
        dot: "bg-warning",
        label: "Low Warning",
      };
    }
    return {
      wrapper: "border-positive/30 bg-positive/10 text-positive",
      dot: "bg-positive",
      label: "Healthy",
    };
  };

  const status = getStatusBadge();

  const handleStartReplacement = () => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await executeStartReplacement(branchId, cylinder.id, "Technician initiating tank swap");
      if (!res.success) {
        setErrorMsg(res.message || "Failed to enter swap mode");
      } else if (res.cylinder && onCylinderUpdated) {
        onCylinderUpdated(res.cylinder);
      }
    });
  };

  const handleCancelReplacement = () => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await executeCancelReplacement(branchId, cylinder.id);
      if (!res.success) {
        setErrorMsg(res.message || "Failed to cancel swap mode");
      } else if (res.cylinder && onCylinderUpdated) {
        onCylinderUpdated(res.cylinder);
      }
    });
  };

  return (
    <>
      <div className="group flex min-w-0 flex-col justify-between rounded-md border border-line bg-surface p-5 transition-all hover:border-control hover:bg-surface/90">
        <div className="space-y-3.5">
          {/* Header Title & Station Source */}
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base font-semibold tracking-tight text-ink truncate group-hover:text-accent transition-colors">
                {cylinder.label}
              </h3>
              {/* <p className="mt-0.5 text-xs text-muted">
                Station Position #{cylinder.position} · {cylinder.rated_fuel_capacity_kg} kg rated
              </p> */}
            </div>

            {/* <span
              className={`shrink-0 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${isPhysical
                  ? "border-accent/40 bg-accent/10 text-ink"
                  : "border-rule bg-raised/50 text-muted"
                }`}
              title={isPhysical ? "Physical HX711 scale weighing rig" : "Simulated scale station"}
            >
              <Radio className="size-2.5" aria-hidden="true" />
              <span>{isPhysical ? "Physical Scale" : "Simulated"}</span>
            </span> */}
          </div>

          {/* Mono-Colored SVG Vessel Gauge */}
          <div className="relative flex h-36 w-full items-center justify-center rounded-md border border-rule/60 bg-raised/20 p-3 transition-transform duration-200 group-hover:scale-[1.01]">
            <CylinderGaugeSvg
              fillPercent={cylinder.fill_percent}
              status={cylinder.status}
              isMaintenance={isMaint}
            />

            {/* Swap Mode Watermark Indicator */}
            {isMaint && (
              <div className="absolute inset-x-2 bottom-2 rounded bg-raised/95 px-2.5 py-1 text-center border border-rule backdrop-blur-xs">
                <span className="text-[11px] font-semibold text-muted">
                  Swap Mode · Alarms Silenced
                </span>
              </div>
            )}
          </div>

          {/* Operational Status & Fill Percentage */}
          <div className="flex flex-col gap-1.5 rounded-md border border-rule bg-raised/30 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-muted">Fuel Health</span>
              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${status.wrapper}`}
              >
                <span className={`size-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
                <span>{status.label}</span>
              </span>
            </div>

            {/* <div className="flex items-center justify-between text-xs">
              <span className="text-muted">Fill Level</span>
              <span className="font-semibold text-ink tabular-nums">
                {cylinder.fill_percent.toFixed(1)}%
              </span>
            </div> */}
          </div>

          {/* Mass Readings (Gross, Tare, Net Remaining) per FE-02 */}
          <div className="space-y-2 rounded-md border border-rule bg-raised/30 p-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted">Remaining Fuel</span>
              <span className="font-semibold text-ink tabular-nums">
                {cylinder.remaining_fuel_kg.toFixed(1)} kg / {cylinder.rated_fuel_capacity_kg.toFixed(1)} kg
              </span>
            </div>

            {/* Linear Fill Bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
              <div
                className={`h-full rounded-full transition-all duration-500 ${isMaint
                  ? "bg-muted"
                  : cylinder.status === "CRITICAL"
                    ? "bg-negative"
                    : cylinder.status === "WARNING"
                      ? "bg-warning"
                      : "bg-positive"
                  }`}
                style={{ width: `${Math.max(2, Math.min(100, cylinder.fill_percent))}%` }}
              />
            </div>

            {/* Mass Breakdown Row */}
            {/* <div className="flex items-center justify-between border-t border-rule/60 pt-2 text-[11px] text-muted">
              <span>Gross: <span className="font-semibold text-ink tabular-nums">{cylinder.gross_mass_kg.toFixed(1)} kg</span></span>
              <span>Tare: <span className="font-semibold text-ink tabular-nums">{cylinder.cylinder_tare_kg.toFixed(1)} kg</span></span>
            </div> */}
          </div>

          {/* Localized Edge Node MQ-6 Gas Sensor Reading (PPM Only) */}
          {(() => {
            const mq6 = cylinder.mq6 ?? {
              voltage: 0.42,
              baseline_voltage: 0.40,
              ppm_estimate: 180,
              status: "NORMAL" as const,
              is_leak_detected: false,
            };
            const isLeak = mq6.is_leak_detected || mq6.status === "CRITICAL";
            const isElevated = mq6.status === "WARNING";

            return (
              <div
                className={`space-y-2 rounded-md border p-3 text-xs transition-colors ${isLeak
                  ? "border-negative/50 bg-negative/10 text-negative animate-pulse"
                  : isElevated
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : "border-rule bg-raised/30"
                  }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 font-medium text-ink">
                    <Flame
                      className={`size-3.5 ${isLeak
                        ? "text-negative"
                        : isElevated
                          ? "text-warning"
                          : "text-accent"
                        }`}
                      aria-hidden="true"
                    />
                    <span>Gas Reading</span>
                  </div>

                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${isLeak
                      ? "border-negative/50 bg-negative/20 text-negative"
                      : isElevated
                        ? "border-warning/40 bg-warning/15 text-warning"
                        : "border-positive/30 bg-positive/10 text-positive"
                      }`}
                  >
                    <span
                      className={`size-1.5 rounded-full ${isLeak
                        ? "bg-negative"
                        : isElevated
                          ? "bg-warning"
                          : "bg-positive"
                        }`}
                      aria-hidden="true"
                    />
                    <span>
                      {isLeak ? "Leak Hazard" : isElevated ? "Elevated" : "Nominal"}
                    </span>
                  </span>
                </div>

                <div className="flex items-baseline justify-between border-t border-rule/50 pt-2">
                  <span className="text-xs text-muted">PPM Level</span>
                  <div className="flex items-baseline gap-1">
                    <span
                      className={`text-2xl font-bold tracking-tight tabular-nums ${isLeak
                        ? "text-negative"
                        : isElevated
                          ? "text-warning"
                          : "text-ink"
                        }`}
                    >
                      {mq6.ppm_estimate !== undefined ? mq6.ppm_estimate : "—"}
                    </span>
                    <span className="text-xs font-semibold text-muted">PPM</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {errorMsg && (
            <p className="text-xs text-negative" role="alert">
              {errorMsg}
            </p>
          )}
        </div>

        {/* Action Controls for Tank Replacement (FE-04, FE-05) */}
        <div className="mt-4 border-t border-rule pt-3.5">
          {isOperator ? (
            isMaint ? (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setModalOpen(true)}
                  className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-ink bg-ink px-3 py-1.5 text-xs font-semibold text-surface transition-colors hover:border-muted hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  <span>Complete Replacement</span>
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleCancelReplacement}
                  className="inline-flex min-h-8 w-full items-center justify-center gap-1.5 rounded-md border border-control/30 bg-raised/40 px-3 py-1 text-xs font-medium text-muted hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <RotateCcw className="size-3" aria-hidden="true" />
                  <span>Cancel Swap Mode</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={isPending}
                onClick={handleStartReplacement}
                className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-md border border-control bg-navy px-3 py-1.5 text-xs font-medium text-ink transition-colors duration-150 hover:bg-navy-hover active:bg-navy-selected focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                title="Enter Swap Mode to silence fuel depletion alarms during tank change"
              >
                <Wrench className="size-3.5 text-muted" aria-hidden="true" />
                <span>{isPending ? "Entering Swap Mode…" : "Start Tank Replacement"}</span>
              </button>
            )
          ) : (
            <div className="flex items-center justify-center py-2 text-xs text-muted">
              <span>Read-only specialist monitoring</span>
            </div>
          )}
        </div>
      </div>

      {/* Replacement Modal Dialog */}
      <LpgReplacementModal
        cylinder={cylinder}
        branchId={branchId}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={updated => {
          if (onCylinderUpdated) onCylinderUpdated(updated);
        }}
      />
    </>
  );
}
