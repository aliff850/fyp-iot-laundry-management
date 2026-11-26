"use client";

import React, { useRef, useState } from "react";
import { Flame } from "lucide-react";
import {
  calibrateBranchLpgGasBaseline,
  fetchLpgCommandStatus,
} from "@/app/branches/[branchId]/lpg/actions";
import { useActionToast } from "@/components/workspace/common/ActionToastContext";
import type { LpgNodeConfig, SafetyNodeDevice } from "@/lib/auth/business";

export interface LpgGasCalibrationModuleProps {
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

const DESTRUCTIVE_BTN_CLASS =
  "inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-negative bg-negative px-3.5 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:border-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted sm:w-auto";

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

export function LpgGasCalibrationModule({
  branchId,
  sourceId,
  assetLabel,
  device,
  lpgConfig,
  maintenanceActive,
  actorName,
  disabled = false,
  onConfigured,
}: LpgGasCalibrationModuleProps) {
  const cfg = lpgConfig ?? device?.lpg_config ?? null;
  const { notify } = useActionToast();

  const [warnPpmInput, setWarnPpmInput] = useState<string | null>(null);
  const [critPpmInput, setCritPpmInput] = useState<string | null>(null);
  const [rlKohmInput, setRlKohmInput] = useState<string | null>(null);
  const [dividerInput, setDividerInput] = useState<string | null>(null);
  const [vccInput, setVccInput] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"calibrate" | "save" | "reset" | null>(null);

  const requestIdRef = useRef<string>(randomRequestId());

  const warnText = warnPpmInput ?? String(cfg?.gas_warn_ppm ?? 20);
  const critText = critPpmInput ?? String(cfg?.gas_crit_ppm ?? 80);
  const rlText = rlKohmInput ?? String(cfg?.mq6_rl_kohm ?? 20);
  const dividerText = dividerInput ?? String(cfg?.mq6_divider_ratio ?? 1);
  const vccText = vccInput ?? String(cfg?.mq6_vcc_v ?? 5);

  const obs = device?.observation ?? null;
  const liveVoltage = obs?.values.voltage ?? null;
  const isFresh = obs?.freshness === "fresh";
  const roKohm = cfg?.mq6_ro_kohm ?? null;
  const baselineV = cfg?.mq6_baseline_v ?? null;
  const isCalibrated = roKohm !== null || Boolean(device?.gas_interpretation?.ppm_calibrated);
  const controlsLocked = !maintenanceActive || disabled || Boolean(submitting);
  const toastId = `lpg-gas-${branchId}-${sourceId}`;

  const pollUntilTerminal = async (
    commandId: string,
    successTitle: string,
    successMessage: string,
  ): Promise<boolean> => {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
      const statusRes = await fetchLpgCommandStatus(branchId, sourceId, commandId);
      if (!statusRes.ok) {
        notify({
          id: toastId,
          kind: "error",
          title: "Gas calibration failed",
          message: statusRes.message || "Failed to verify calibration status with gateway.",
        });
        return false;
      }
      const st = statusRes.value.status;
      if (st === "succeeded") {
        await onConfigured?.();
        notify({
          id: toastId,
          kind: "success",
          title: successTitle,
          message: successMessage,
        });
        return true;
      }
      if (st === "failed" || st === "expired" || st === "unknown") {
        notify({
          id: toastId,
          kind: "error",
          title: "Gas calibration rejected",
          message: statusRes.value.reason || "Branch gateway rejected gas calibration update.",
        });
        return false;
      }
    }
    notify({
      id: toastId,
      kind: "error",
      title: "Gas calibration timed out",
      message: "Timed out waiting for branch gateway confirmation.",
    });
    return false;
  };

  const submitAction = async (mode: "calibrate" | "save" | "reset") => {
    if (controlsLocked) return;

    const warnPpm = Number(warnText);
    const critPpm = Number(critText);
    const rlKohm = Number(rlText);
    const divider = Number(dividerText);
    const vccV = Number(vccText);

    if (mode !== "reset") {
      if (!Number.isFinite(warnPpm) || warnPpm < 10 || warnPpm > 10000) {
        notify({
          id: toastId,
          kind: "error",
          title: "Invalid warning limit",
          message: "Warning alert threshold must be between 10 and 10,000 ppm.",
        });
        return;
      }
      if (!Number.isFinite(critPpm) || critPpm < 20 || critPpm > 20000 || critPpm <= warnPpm) {
        notify({
          id: toastId,
          kind: "error",
          title: "Invalid critical limit",
          message: "Critical alert threshold must exceed warning threshold (20–20,000 ppm).",
        });
        return;
      }
      if (!Number.isFinite(rlKohm) || rlKohm < 0.1 || rlKohm > 200) {
        notify({
          id: toastId,
          kind: "error",
          title: "Invalid resistor value",
          message: "Load resistor RL must be between 0.1 and 200 kOhm.",
        });
        return;
      }
      if (!Number.isFinite(divider) || divider < 0.1 || divider > 10) {
        notify({
          id: toastId,
          kind: "error",
          title: "Invalid divider ratio",
          message: "Voltage divider ratio must be between 0.1 and 10.",
        });
        return;
      }
      if (!Number.isFinite(vccV) || vccV < 2.5 || vccV > 12) {
        notify({
          id: toastId,
          kind: "error",
          title: "Invalid supply voltage",
          message: "Supply voltage must be between 2.5 and 12 V.",
        });
        return;
      }
    }

    const pendingMsg =
      mode === "reset"
        ? "Clearing gas calibration on branch gateway…"
        : mode === "save"
          ? "Saving alert thresholds on branch gateway…"
          : "Capturing clean-air baseline on branch gateway…";
    const successTitle =
      mode === "reset"
        ? "Calibration cleared"
        : mode === "save"
          ? "Alert limits saved"
          : "Gas baseline calibrated";
    const successMsg =
      mode === "reset"
        ? `${assetLabel} MQ-6 baseline cleared.`
        : mode === "save"
          ? `${assetLabel} gas alert thresholds updated.`
          : `${assetLabel} clean-air baseline captured.`;

    setSubmitting(mode);
    notify({
      id: toastId,
      kind: "info",
      title: "Updating gas calibration",
      message: pendingMsg,
    });

    try {
      const res = await calibrateBranchLpgGasBaseline(branchId, sourceId, {
        request_id: requestIdRef.current,
        reset: mode === "reset",
        save_settings_only: mode === "save",
        updated_by: actorName.trim() || "Operator",
        rl_kohm: mode === "reset" ? null : rlKohm,
        divider_ratio: mode === "reset" ? null : divider,
        vcc_v: mode === "reset" ? null : vccV,
        gas_warn_ppm: mode === "reset" ? null : warnPpm,
        gas_crit_ppm: mode === "reset" ? null : critPpm,
      });

      if (!res.ok) {
        notify({
          id: toastId,
          kind: "error",
          title: "Gas calibration failed",
          message: res.message || "Could not dispatch gas baseline command.",
        });
        return;
      }

      if (res.value.status === "succeeded") {
        requestIdRef.current = randomRequestId();
        await onConfigured?.();
        notify({
          id: toastId,
          kind: "success",
          title: successTitle,
          message: successMsg,
        });
        return;
      }

      const ok = await pollUntilTerminal(res.value.command_id, successTitle, successMsg);
      requestIdRef.current = randomRequestId();
      if (!ok) return;
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <section
      aria-label="MQ-6 Gas Calibration"
      className="space-y-4 rounded-md border border-line bg-raised/40 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
        <div className="flex items-center gap-2">
          <Flame className="size-4 shrink-0 text-warning" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-ink">MQ-6 Gas Calibration</h3>
        </div>
      </div>

      <dl className="grid grid-cols-1 gap-3 rounded-md border border-line bg-surface p-3.5 text-xs sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-faint">Sensor signal</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-ink">
            {isFresh && liveVoltage !== null
              ? `Live (${liveVoltage.toFixed(3)} V)`
              : liveVoltage !== null
                ? `Stale (${liveVoltage.toFixed(3)} V)`
                : "Waiting for live reading"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-faint">Calibration status</dt>
          <dd className={`mt-0.5 font-medium ${isCalibrated ? "text-positive" : "text-warning"}`}>
            {isCalibrated ? "Calibrated" : "Baseline needed"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-faint">Saved R0</dt>
          <dd className="mt-0.5 font-medium tabular-nums text-ink">
            {roKohm !== null ? `${roKohm.toFixed(2)} kΩ` : "—"}
          </dd>
        </div>
      </dl>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted">
          <span>Warning alert (ppm)</span>
          <input
            type="number"
            min="10"
            max="10000"
            step="1"
            disabled={controlsLocked}
            value={warnText}
            onChange={(e) => {
              setWarnPpmInput(e.target.value);
              requestIdRef.current = randomRequestId();
            }}
            className={INPUT_CLASS}
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted">
          <span>Critical alert (ppm)</span>
          <input
            type="number"
            min="20"
            max="20000"
            step="1"
            disabled={controlsLocked}
            value={critText}
            onChange={(e) => {
              setCritPpmInput(e.target.value);
              requestIdRef.current = randomRequestId();
            }}
            className={INPUT_CLASS}
          />
        </label>
      </div>

      <details className="rounded-md border border-line bg-surface p-3.5">
        <summary className="cursor-pointer select-none text-xs font-medium text-ink focus-visible:outline-2 focus-visible:outline-accent">
          Advanced circuit settings
        </summary>
        <div className="mt-3 space-y-3">
          <dl className="grid grid-cols-1 gap-3 border-b border-rule pb-3 text-xs tabular-nums sm:grid-cols-2">
            <div>
              <dt className="text-faint">Saved baseline R0</dt>
              <dd className="mt-0.5 text-ink">{roKohm !== null ? `${roKohm.toFixed(2)} kΩ` : "None"}</dd>
            </div>
            <div>
              <dt className="text-faint">Baseline voltage</dt>
              <dd className="mt-0.5 text-ink">{baselineV !== null ? `${baselineV.toFixed(3)} V` : "None"}</dd>
            </div>
          </dl>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted">
              <span>Load RL (kΩ)</span>
              <input
                type="number"
                min="0.1"
                max="200"
                step="0.1"
                disabled={controlsLocked}
                value={rlText}
                onChange={(e) => {
                  setRlKohmInput(e.target.value);
                  requestIdRef.current = randomRequestId();
                }}
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted">
              <span>Divider ratio</span>
              <input
                type="number"
                min="0.1"
                max="10"
                step="0.05"
                disabled={controlsLocked}
                value={dividerText}
                onChange={(e) => {
                  setDividerInput(e.target.value);
                  requestIdRef.current = randomRequestId();
                }}
                className={INPUT_CLASS}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted">
              <span>Supply (V)</span>
              <input
                type="number"
                min="2.5"
                max="12"
                step="0.1"
                disabled={controlsLocked}
                value={vccText}
                onChange={(e) => {
                  setVccInput(e.target.value);
                  requestIdRef.current = randomRequestId();
                }}
                className={INPUT_CLASS}
              />
            </label>
          </div>
        </div>
      </details>

      <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={controlsLocked || !isCalibrated}
            onClick={() => void submitAction("reset")}
            className={DESTRUCTIVE_BTN_CLASS}
          >
            {submitting === "reset" ? "Clearing…" : "Clear calibration"}
          </button>
          <button
            type="button"
            disabled={controlsLocked || !isCalibrated}
            onClick={() => void submitAction("save")}
            className={SECONDARY_BTN_CLASS}
          >
            {submitting === "save" ? "Saving…" : "Save alert limits"}
          </button>
        </div>

        <button
          type="button"
          disabled={controlsLocked}
          onClick={() => void submitAction("calibrate")}
          className={PRIMARY_BTN_CLASS}
        >
          {submitting === "calibrate" ? "Calibrating…" : "Calibrate clean air"}
        </button>
      </div>
    </section>
  );
}
