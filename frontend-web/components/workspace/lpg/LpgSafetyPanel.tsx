"use client";

import React, { useState, useTransition } from "react";
import {
  AlertTriangle,
  ShieldAlert,
  Power,
} from "lucide-react";
import type { LpgEnvironmentData, LpgIncidentItem } from "@/lib/auth/business";
import { executeEmergencyShutoff } from "@/app/branches/[branchId]/lpg/actions";

interface LpgSafetyPanelProps {
  environment: LpgEnvironmentData;
  incidents: LpgIncidentItem[];
  branchId: string;
  userRole: "owner" | "branch_manager" | "machine_maintenance" | "lpg_maintenance";
  onValveUpdated?: (valve: LpgEnvironmentData["safety_valve"]) => void;
}

export function LpgSafetyPanel({
  environment,
  incidents: _incidents,
  branchId,
  userRole,
  onValveUpdated,
}: LpgSafetyPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [valveState, setValveState] = useState(environment.safety_valve);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isOperator = userRole === "owner" || userRole === "branch_manager" || userRole === "lpg_maintenance";
  const mq6 = environment.mq6;
  const dht22 = environment.dht22;

  const isLeak = mq6.is_leak_detected || mq6.status === "CRITICAL";
  const isHighHeat = dht22.is_high_heat || dht22.temperature_celsius > 45.0;

  const handleToggleValve = (targetAction: "open" | "close") => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await executeEmergencyShutoff(branchId, targetAction);
      if (!res.success) {
        setErrorMsg(res.message || "Failed to toggle safety valve");
      } else if (res.safety_valve) {
        setValveState(res.safety_valve);
        if (onValveUpdated) onValveUpdated(res.safety_valve);
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* High-Urgency Gas Leak Hazard Banner (PRD Section 4.5 & DESIGN.md 4.5) */}
      {isLeak && (
        <div className="rounded-md border border-negative/60 bg-negative/15 p-4 text-negative animate-pulse flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-negative text-surface">
              <AlertTriangle className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded bg-negative/30 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-negative">
                  LPG Combustible Gas Leak Detected
                </span>
                <span className="text-xs font-semibold tabular-nums">
                  Voltage: {mq6.voltage.toFixed(2)} V
                </span>
              </div>
              <p className="mt-0.5 text-xs font-medium text-ink">
                Emergency gas shut-off required. Evacuate personnel and verify facility mechanical ventilation.
              </p>
            </div>
          </div>

          {isOperator && valveState.state === "OPEN" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleToggleValve("close")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded border border-negative bg-negative px-3 py-1.5 text-xs font-bold text-surface transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Power className="size-3.5" aria-hidden="true" />
              <span>Trip Emergency Valve</span>
            </button>
          )}
        </div>
      )}

      {/* High Ambient Temperature Banner (PRD FE-08) */}
      {isHighHeat && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-4 text-warning flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <ShieldAlert className="size-5 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0">
              <h4 className="text-xs font-bold tracking-tight text-ink">
                High Ambient Facility Temperature ({dht22.temperature_celsius.toFixed(1)}°C &gt; 45°C limit)
              </h4>
              <p className="mt-0.5 text-xs text-muted">
                Inspect commercial gas dryer exhaust ducting and ventilation airflow dampers.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Solenoid Valve Closed / Tripped Alert Banner */}
      {/* {!isLeak && valveState.state === "CLOSED" && (
        <div className="rounded-md border border-warning/50 bg-warning/10 p-4 text-warning flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-warning text-surface">
              <Power className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="rounded bg-warning/30 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-warning">
                  Gas Supply Valve Closed
                </span>
              </div>
              <p className="mt-0.5 text-xs font-medium text-ink">
                Emergency valve is shut off. Verify manifold integrity before reopening main supply.
              </p>
            </div>
          </div>

          {isOperator && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => handleToggleValve("open")}
              className="inline-flex shrink-0 items-center gap-1.5 rounded border border-positive bg-positive px-3 py-1.5 text-xs font-bold text-surface transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Power className="size-3.5" aria-hidden="true" />
              <span>Restore Gas Supply</span>
            </button>
          )}
        </div>
      )} */}

      {errorMsg && (
        <p className="text-xs text-negative" role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
