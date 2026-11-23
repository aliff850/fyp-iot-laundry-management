"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { Flame, X } from "lucide-react";
import {
  calibrateBranchLpgGasBaseline,
  fetchLpgCommandStatus,
  fetchLpgMaintenanceStatus,
} from "@/app/branches/[branchId]/lpg/actions";
import { useActionToast } from "@/components/workspace/common/ActionToastContext";
import type { SafetyNodeDevice } from "@/lib/auth/business";

export interface LpgGasBaselineModalProps {
  open: boolean;
  branchId: string;
  device: SafetyNodeDevice;
  defaultActorName?: string | null;
  onClose: () => void;
  onConfirmed: () => Promise<void> | void;
}

const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 48000;

const INPUT_CLASS =
  "min-h-11 w-full min-w-0 rounded-md border border-control bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint transition-colors duration-150 enabled:hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted aria-invalid:border-negative motion-reduce:transition-none";

const PRIMARY_BTN_CLASS =
  "inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-ink bg-ink px-3.5 py-2 text-sm font-semibold text-surface transition-colors duration-150 enabled:hover:border-muted enabled:hover:bg-muted motion-safe:enabled:active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted motion-reduce:transition-none sm:w-auto";

const SECONDARY_NAVY_BTN_CLASS =
  "inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-sm font-medium text-ink transition-colors duration-150 enabled:hover:bg-navy-hover enabled:active:bg-navy-selected focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted motion-reduce:transition-none sm:w-auto";

const DESTRUCTIVE_BTN_CLASS =
  "inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-negative bg-negative px-3.5 py-2 text-sm font-semibold text-surface transition-colors duration-150 enabled:hover:border-ink motion-safe:enabled:active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted motion-reduce:transition-none sm:w-auto";

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

export function LpgGasBaselineModal({
  open,
  branchId,
  device,
  defaultActorName,
  onClose,
  onConfirmed,
}: LpgGasBaselineModalProps) {
  const titleId = useId();
  const cfg = device.lpg_config;

  const [actorName, setActorName] = useState((defaultActorName && defaultActorName.trim()) || "Operator");
  const [warnPpmInput, setWarnPpmInput] = useState(String(cfg?.gas_warn_ppm ?? 20));
  const [critPpmInput, setCritPpmInput] = useState(String(cfg?.gas_crit_ppm ?? 80));
  const [rlKohmInput, setRlKohmInput] = useState(String(cfg?.mq6_rl_kohm ?? 20));
  const [dividerInput, setDividerInput] = useState(String(cfg?.mq6_divider_ratio ?? 1));
  const [vccInput, setVccInput] = useState(String(cfg?.mq6_vcc_v ?? 5));
  const [roKohm, setRoKohm] = useState<number | null>(cfg?.mq6_ro_kohm ?? null);
  const [baselineV, setBaselineV] = useState<number | null>(cfg?.mq6_baseline_v ?? null);

  const { notify } = useActionToast();
  const [submitting, setSubmitting] = useState<"calibrate" | "save" | "reset" | null>(null);

  const dirtyRef = useRef(false);
  const requestIdRef = useRef<string>(randomRequestId());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadLatestConfig = async () => {
      const res = await fetchLpgMaintenanceStatus(branchId, device.source_id);
      if (cancelled || !res.ok) return;
      const latest = res.value.lpg_config;
      setRoKohm(latest.mq6_ro_kohm);
      setBaselineV(latest.mq6_baseline_v);
      if (!dirtyRef.current) {
        setWarnPpmInput(String(latest.gas_warn_ppm));
        setCritPpmInput(String(latest.gas_crit_ppm));
        setRlKohmInput(String(latest.mq6_rl_kohm));
        setDividerInput(String(latest.mq6_divider_ratio));
        setVccInput(String(latest.mq6_vcc_v));
      }
    };
    void loadLatestConfig();
    return () => {
      cancelled = true;
    };
  }, [open, branchId, device.source_id]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const obs = device.observation;
  const liveVoltage = obs?.values.voltage ?? null;
  const isFresh = obs?.freshness === "fresh";
  const gasInterp = device.gas_interpretation;
  const isCalibrated = roKohm !== null || Boolean(gasInterp?.ppm_calibrated);

  const toastId = `lpg-gas-${branchId}-${device.source_id}`;

  async function pollUntilTerminal(
    commandId: string,
    successTitle: string,
    successMessage: string,
  ): Promise<boolean> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const statusRes = await fetchLpgCommandStatus(branchId, device.source_id, commandId);
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
        await onConfirmed();
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
  }

  async function submitAction(mode: "calibrate" | "save" | "reset") {
    if (submitting) return;

    const warnPpm = Number(warnPpmInput);
    const critPpm = Number(critPpmInput);
    const rlKohm = Number(rlKohmInput);
    const divider = Number(dividerInput);
    const vccV = Number(vccInput);

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
        ? `${device.label} MQ-6 baseline cleared.`
        : mode === "save"
          ? `${device.label} gas alert thresholds updated.`
          : `${device.label} clean-air baseline captured.`;

    setSubmitting(mode);
    notify({
      id: toastId,
      kind: "info",
      title: "Updating gas calibration",
      message: pendingMsg,
    });

    try {
      const res = await calibrateBranchLpgGasBaseline(branchId, device.source_id, {
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
        await onConfirmed();
        notify({
          id: toastId,
          kind: "success",
          title: successTitle,
          message: successMsg,
        });
        onClose();
        return;
      }

      notify({
        id: toastId,
        kind: "info",
        title: "Updating gas calibration",
        message: "Waiting for branch gateway confirmation…",
      });
      const ok = await pollUntilTerminal(res.value.command_id, successTitle, successMsg);
      if (ok) {
        onClose();
      } else {
        requestIdRef.current = randomRequestId();
      }
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget && !submitting) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-xl max-h-[90dvh] overflow-y-auto rounded-md border border-control bg-surface p-6 text-ink shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-rule pb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Flame className="size-4 shrink-0 text-muted" aria-hidden="true" />
              <h2 id={titleId} className="text-base font-semibold leading-normal text-ink">
                Calibrate gas baseline
              </h2>
            </div>
            <p className="mt-1 truncate text-xs text-faint">{device.label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(submitting)}
            aria-label="Close gas calibration modal"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border border-control bg-navy text-muted transition-colors duration-150 enabled:hover:bg-navy-hover enabled:hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted motion-reduce:transition-none"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-md border border-line bg-raised p-4 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-faint">Sensor signal</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-ink">
                {isFresh && liveVoltage !== null
                  ? `Live (${liveVoltage.toFixed(3)} V)`
                  : liveVoltage !== null
                    ? `Stale (${liveVoltage.toFixed(3)} V)`
                    : "Waiting for live reading"}
              </dd>
            </div>
            <div>
              <dt className="text-faint">Gas sensor status</dt>
              <dd className={`mt-0.5 font-medium ${isCalibrated ? "text-positive" : "text-warning"}`}>
                {isCalibrated ? "Calibrated" : "Baseline needed"}
              </dd>
            </div>
            <div>
              <dt className="text-faint">Saved baseline R0</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-ink">
                {roKohm !== null ? `${roKohm.toFixed(2)} kΩ` : "—"}
              </dd>
            </div>
          </dl>

          <div className="rounded-md border-l-2 border-control bg-raised px-4 py-3 text-sm text-muted">
            Ensure fresh clean air around the MQ-6 sensor for 30 seconds before capturing clean-air
            baseline resistance.
          </div>

          <div className="space-y-4">
            <div className="grid gap-2">
              <label htmlFor="gas-updated-by" className="text-sm font-medium text-ink">
                Staff name
              </label>
              <input
                id="gas-updated-by"
                type="text"
                maxLength={80}
                value={actorName}
                onChange={(e) => {
                  setActorName(e.target.value);
                  requestIdRef.current = randomRequestId();
                }}
                className={INPUT_CLASS}
                placeholder="Operator name"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <label htmlFor="gas-warn-ppm" className="text-sm font-medium text-ink">
                  Warning alert (ppm)
                </label>
                <input
                  id="gas-warn-ppm"
                  type="number"
                  min="10"
                  max="10000"
                  step="1"
                  value={warnPpmInput}
                  onChange={(e) => {
                    dirtyRef.current = true;
                    setWarnPpmInput(e.target.value);
                    requestIdRef.current = randomRequestId();
                  }}
                  className={`${INPUT_CLASS} tabular-nums`}
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="gas-crit-ppm" className="text-sm font-medium text-ink">
                  Critical alert (ppm)
                </label>
                <input
                  id="gas-crit-ppm"
                  type="number"
                  min="20"
                  max="20000"
                  step="1"
                  value={critPpmInput}
                  onChange={(e) => {
                    dirtyRef.current = true;
                    setCritPpmInput(e.target.value);
                    requestIdRef.current = randomRequestId();
                  }}
                  className={`${INPUT_CLASS} tabular-nums`}
                />
              </div>
            </div>

            <details className="rounded-md border border-line bg-raised p-4">
              <summary className="cursor-pointer select-none text-sm font-medium text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
                Advanced circuit settings
              </summary>
              <div className="mt-4 space-y-4">
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 border-b border-rule pb-3 text-xs tabular-nums sm:grid-cols-2">
                  <div>
                    <dt className="text-faint">Saved baseline R0</dt>
                    <dd className="mt-0.5 text-ink">
                      {roKohm !== null ? `${roKohm.toFixed(2)} kΩ` : "None"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-faint">Baseline voltage</dt>
                    <dd className="mt-0.5 text-ink">
                      {baselineV !== null ? `${baselineV.toFixed(3)} V` : "None"}
                    </dd>
                  </div>
                </dl>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="grid gap-2">
                    <label htmlFor="gas-rl-kohm" className="text-sm font-medium text-ink">
                      Load RL (kΩ)
                    </label>
                    <input
                      id="gas-rl-kohm"
                      type="number"
                      min="0.1"
                      max="200"
                      step="0.1"
                      value={rlKohmInput}
                      onChange={(e) => {
                        dirtyRef.current = true;
                        setRlKohmInput(e.target.value);
                        requestIdRef.current = randomRequestId();
                      }}
                      className={`${INPUT_CLASS} tabular-nums`}
                    />
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="gas-divider" className="text-sm font-medium text-ink">
                      Divider ratio
                    </label>
                    <input
                      id="gas-divider"
                      type="number"
                      min="0.1"
                      max="10"
                      step="0.05"
                      value={dividerInput}
                      onChange={(e) => {
                        dirtyRef.current = true;
                        setDividerInput(e.target.value);
                        requestIdRef.current = randomRequestId();
                      }}
                      className={`${INPUT_CLASS} tabular-nums`}
                    />
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="gas-vcc-v" className="text-sm font-medium text-ink">
                      Supply (V)
                    </label>
                    <input
                      id="gas-vcc-v"
                      type="number"
                      min="2.5"
                      max="12"
                      step="0.1"
                      value={vccInput}
                      onChange={(e) => {
                        dirtyRef.current = true;
                        setVccInput(e.target.value);
                        requestIdRef.current = randomRequestId();
                      }}
                      className={`${INPUT_CLASS} tabular-nums`}
                    />
                  </div>
                </div>
              </div>
            </details>
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-rule pt-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void submitAction("reset")}
                  disabled={Boolean(submitting) || !isCalibrated}
                  aria-busy={submitting === "reset"}
                  className={DESTRUCTIVE_BTN_CLASS}
                >
                  Clear calibration
                </button>
                <button
                  type="button"
                  onClick={() => void submitAction("save")}
                  disabled={Boolean(submitting) || !isCalibrated}
                  aria-busy={submitting === "save"}
                  className={SECONDARY_NAVY_BTN_CLASS}
                >
                  Save alert limits
                </button>
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={Boolean(submitting)}
                  className={SECONDARY_NAVY_BTN_CLASS}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void submitAction("calibrate")}
                  disabled={Boolean(submitting)}
                  aria-busy={submitting === "calibrate"}
                  className={PRIMARY_BTN_CLASS}
                >
                  {submitting === "calibrate" ? "Calibrating…" : "Calibrate clean air"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
