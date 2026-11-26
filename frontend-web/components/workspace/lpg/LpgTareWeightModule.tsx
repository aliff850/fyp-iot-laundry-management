"use client";

import React, { useRef, useState } from "react";
import { Scale } from "lucide-react";
import {
  fetchLpgCommandStatus,
  setBranchLpgTareWeight,
} from "@/app/branches/[branchId]/lpg/actions";
import { useActionToast } from "@/components/workspace/common/ActionToastContext";
import type { LpgNodeConfig, SafetyNodeDevice } from "@/lib/auth/business";

export interface LpgTareWeightModuleProps {
  branchId: string;
  sourceId: string;
  assetLabel: string;
  device: SafetyNodeDevice | null;
  lpgConfig: LpgNodeConfig | null;
  maintenanceActive: boolean;
  actorName: string;
  disabled?: boolean;
  onConfigured?: () => Promise<void> | void;
}

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 45000;

const INPUT_CLASS =
  "min-h-11 w-full min-w-0 rounded-md border border-control bg-canvas px-3 py-2 text-sm text-ink tabular-nums placeholder:text-faint transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted";

const PRIMARY_BTN_CLASS =
  "inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-ink bg-ink px-3.5 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:border-muted enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted sm:w-auto";

const SECONDARY_BTN_CLASS =
  "inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-xs font-semibold text-ink transition-colors enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted sm:w-auto";

function randomRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function LpgTareWeightModule({
  branchId,
  sourceId,
  assetLabel,
  device,
  lpgConfig,
  maintenanceActive,
  actorName,
  disabled = false,
  onConfigured,
}: LpgTareWeightModuleProps) {
  const cfg = lpgConfig ?? device?.lpg_config ?? null;
  const { notify } = useActionToast();

  const [tareInput, setTareInput] = useState<string | null>(null);
  const [capacityInput, setCapacityInput] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const requestIdRef = useRef<string>(randomRequestId());

  const defaultTare =
    cfg?.cylinder_tare_kg != null && Number.isFinite(cfg.cylinder_tare_kg)
      ? String(cfg.cylinder_tare_kg)
      : "15.2";
  const defaultCap = String(cfg?.rated_capacity_kg ?? device?.capacity_kg ?? 14);

  const tareText = tareInput ?? defaultTare;
  const capacityText = capacityInput ?? defaultCap;

  const obs = device?.observation ?? null;
  const liveGross =
    obs?.freshness === "fresh" &&
    typeof obs.values.gross_weight_kg === "number" &&
    Number.isFinite(obs.values.gross_weight_kg)
      ? obs.values.gross_weight_kg
      : null;

  const controlsLocked = !maintenanceActive || disabled || submitting;
  const toastId = `lpg-tare-${branchId}-${sourceId}`;

  const handleSaveTare = async () => {
    if (controlsLocked) return;

    const parsedTare = Number(tareText);
    const parsedCap = Number(capacityText);

    if (tareText.trim() === "" || !Number.isFinite(parsedTare) || parsedTare < 0 || parsedTare > 200) {
      notify({
        id: toastId,
        kind: "error",
        title: "Invalid tare weight",
        message: "Empty cylinder tare weight must be between 0 and 200 kg.",
      });
      return;
    }
    if (capacityText.trim() === "" || !Number.isFinite(parsedCap) || parsedCap < 0.1 || parsedCap > 500) {
      notify({
        id: toastId,
        kind: "error",
        title: "Invalid rated capacity",
        message: "Rated LPG capacity must be between 0.1 and 500 kg.",
      });
      return;
    }

    setSubmitting(true);
    notify({
      id: toastId,
      kind: "info",
      title: "Updating tare weight",
      message: `Sending cylinder tare (${parsedTare.toFixed(2)} kg) to branch gateway…`,
    });

    try {
      const res = await setBranchLpgTareWeight(branchId, sourceId, {
        request_id: requestIdRef.current,
        tare_kg: parsedTare,
        rated_capacity_kg: parsedCap,
        updated_by: actorName.trim() || "Operator",
      });

      if (!res.ok) {
        notify({
          id: toastId,
          kind: "error",
          title: "Tare update failed",
          message: res.message || "Could not dispatch tare weight command.",
        });
        return;
      }

      if (res.value.status === "succeeded") {
        requestIdRef.current = randomRequestId();
        await onConfigured?.();
        notify({
          id: toastId,
          kind: "success",
          title: "Tare weight updated",
          message: `${assetLabel} tare (${parsedTare.toFixed(2)} kg) and capacity (${parsedCap.toFixed(1)} kg) saved.`,
        });
        return;
      }

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
        const statusRes = await fetchLpgCommandStatus(branchId, sourceId, res.value.command_id);
        if (!statusRes.ok) {
          notify({
            id: toastId,
            kind: "error",
            title: "Tare update failed",
            message: statusRes.message || "Could not verify gateway command status.",
          });
          return;
        }
        const st = statusRes.value.status;
        if (st === "succeeded") {
          requestIdRef.current = randomRequestId();
          await onConfigured?.();
          notify({
            id: toastId,
            kind: "success",
            title: "Tare weight updated",
            message: `${assetLabel} tare (${parsedTare.toFixed(2)} kg) and capacity (${parsedCap.toFixed(1)} kg) saved.`,
          });
          return;
        }
        if (st === "failed" || st === "expired" || st === "unknown") {
          requestIdRef.current = randomRequestId();
          notify({
            id: toastId,
            kind: "error",
            title: "Tare update rejected",
            message: statusRes.value.reason || "Branch gateway rejected tare weight update.",
          });
          return;
        }
      }

      requestIdRef.current = randomRequestId();
      notify({
        id: toastId,
        kind: "error",
        title: "Tare update timed out",
        message: "Timed out waiting for branch gateway confirmation.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-label="Tare Weight Configuration"
      className="space-y-4 rounded-md border border-line bg-raised/40 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
        <div className="flex items-center gap-2">
          <Scale className="size-4 shrink-0 text-warning" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-ink">Tare Weight &amp; Capacity</h3>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-3 rounded-md border border-line bg-surface p-3.5 text-xs sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-faint">Live scale</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-ink">
            {liveGross !== null ? `${liveGross.toFixed(2)} kg` : "—"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-faint">Saved tare</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-ink">
            {cfg?.cylinder_tare_kg != null ? `${cfg.cylinder_tare_kg.toFixed(2)} kg` : "—"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-faint">Rated capacity</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-ink">
            {cfg?.rated_capacity_kg != null
              ? `${cfg.rated_capacity_kg.toFixed(1)} kg`
              : device?.capacity_kg != null
                ? `${device.capacity_kg.toFixed(1)} kg`
                : "—"}
          </dd>
        </div>
      </dl>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted">
          <span>Empty cylinder tare (kg)</span>
          <input
            type="number"
            min="0"
            max="200"
            step="0.01"
            disabled={controlsLocked}
            value={tareText}
            onChange={(e) => {
              setTareInput(e.target.value);
              requestIdRef.current = randomRequestId();
            }}
            placeholder="15.20"
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted">
          <span>Rated LPG capacity (kg)</span>
          <input
            type="number"
            min="0.1"
            max="500"
            step="0.1"
            disabled={controlsLocked}
            value={capacityText}
            onChange={(e) => {
              setCapacityInput(e.target.value);
              requestIdRef.current = randomRequestId();
            }}
            placeholder="14.0"
            className={INPUT_CLASS}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          disabled={controlsLocked || liveGross === null}
          onClick={() => {
            if (liveGross !== null) {
              setTareInput(liveGross.toFixed(2));
              requestIdRef.current = randomRequestId();
            }
          }}
          className={SECONDARY_BTN_CLASS}
        >
          Use live scale as tare
        </button>

        <button
          type="button"
          disabled={controlsLocked}
          onClick={() => void handleSaveTare()}
          className={PRIMARY_BTN_CLASS}
        >
          {submitting ? "Saving…" : "Save tare & capacity"}
        </button>
      </div>
    </section>
  );
}
