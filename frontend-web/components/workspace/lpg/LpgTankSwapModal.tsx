"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { RefreshCw, Wrench, X } from "lucide-react";
import {
  completeBranchLpgTankSwap,
  fetchLpgCommandStatus,
  fetchLpgMaintenanceStatus,
  startBranchLpgTankSwap,
} from "@/app/branches/[branchId]/lpg/actions";
import type { LpgSwapStability, SafetyNodeDevice } from "@/lib/auth/business";

export interface LpgTankSwapModalProps {
  open: boolean;
  mode: "start" | "complete";
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

export function LpgTankSwapModal({
  open,
  mode,
  branchId,
  device,
  defaultActorName,
  onClose,
  onConfirmed,
}: LpgTankSwapModalProps) {
  const titleId = useId();
  const initialActor =
    (defaultActorName && defaultActorName.trim()) ||
    (mode === "complete" && device.maintenance_session?.started_by) ||
    "Operator";

  const [actorName, setActorName] = useState(initialActor);
  const [serviceNote, setServiceNote] = useState("");
  const [tareKgInput, setTareKgInput] = useState(
    device.lpg_config?.cylinder_tare_kg != null ? String(device.lpg_config.cylinder_tare_kg) : "",
  );
  const [capacityKgInput, setCapacityKgInput] = useState(
    String(device.lpg_config?.rated_capacity_kg ?? device.capacity_kg ?? 14),
  );
  const [stability, setStability] = useState<LpgSwapStability | null>(null);
  const [loadingStability, setLoadingStability] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const requestIdRef = useRef<string>(randomRequestId());
  const dirtyTareRef = useRef(false);
  const dirtyCapRef = useRef(false);

  const loadStability = useCallback(async () => {
    setLoadingStability(true);
    try {
      const res = await fetchLpgMaintenanceStatus(branchId, device.source_id);
      if (res.ok) {
        setStability(res.value.stability);
        if (!dirtyTareRef.current && res.value.lpg_config.cylinder_tare_kg != null) {
          setTareKgInput(String(res.value.lpg_config.cylinder_tare_kg));
        }
        if (!dirtyCapRef.current) {
          const cap = res.value.lpg_config.rated_capacity_kg ?? device.capacity_kg;
          if (cap != null) setCapacityKgInput(String(cap));
        }
      }
    } finally {
      setLoadingStability(false);
    }
  }, [branchId, device.source_id, device.capacity_kg]);

  useEffect(() => {
    if (!open || mode !== "complete") return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      await loadStability();
    };
    const initialTimer = setTimeout(() => {
      void poll();
    }, 0);
    const interval = setInterval(() => {
      if (!submitting) {
        void poll();
      }
    }, 3000);
    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [open, mode, submitting, loadStability]);

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

  async function pollUntilTerminal(commandId: string): Promise<boolean> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const statusRes = await fetchLpgCommandStatus(branchId, device.source_id, commandId);
      if (!statusRes.ok) {
        setErrorText(statusRes.message || "Failed to verify command status with gateway.");
        return false;
      }
      const st = statusRes.value.status;
      if (st === "succeeded") {
        await onConfirmed();
        return true;
      }
      if (st === "failed" || st === "expired" || st === "unknown") {
        setErrorText(
          statusRes.value.reason || "Branch gateway could not confirm the tank swap request.",
        );
        return false;
      }
    }
    setErrorText("Timed out waiting for branch gateway confirmation. Retry to check status.");
    return false;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setErrorText(null);

    if (mode === "start") {
      setSubmitting(true);
      setPendingText("Sending start tank swap request to branch gateway…");
      try {
        const res = await startBranchLpgTankSwap(branchId, device.source_id, {
          request_id: requestIdRef.current,
          started_by: actorName.trim() || "Operator",
          service_note: serviceNote.trim() || undefined,
        });
        if (!res.ok) {
          setErrorText(res.message || "Could not start tank swap.");
          return;
        }
        if (res.value.status === "succeeded") {
          await onConfirmed();
          onClose();
          return;
        }
        setPendingText("Waiting for branch gateway confirmation…");
        const ok = await pollUntilTerminal(res.value.command_id);
        if (ok) onClose();
      } finally {
        setSubmitting(false);
        setPendingText(null);
      }
      return;
    }

    const parsedTare = tareKgInput.trim() === "" ? null : Number(tareKgInput);
    if (parsedTare !== null && (!Number.isFinite(parsedTare) || parsedTare < 0 || parsedTare > 100)) {
      setErrorText("Empty cylinder tare weight must be between 0 and 100 kg.");
      return;
    }

    const parsedCap = capacityKgInput.trim() === "" ? null : Number(capacityKgInput);
    if (parsedCap !== null && (!Number.isFinite(parsedCap) || parsedCap <= 0 || parsedCap > 500)) {
      setErrorText("Rated LPG capacity must be between 0.1 and 500 kg.");
      return;
    }

    setSubmitting(true);
    setPendingText("Sending tank swap verification to branch gateway…");
    try {
      const res = await completeBranchLpgTankSwap(branchId, device.source_id, {
        request_id: requestIdRef.current,
        completed_by: actorName.trim() || "Operator",
        tare_kg: parsedTare,
        rated_capacity_kg: parsedCap,
      });
      if (!res.ok) {
        setErrorText(res.message || "Could not complete tank swap.");
        return;
      }
      if (res.value.status === "succeeded") {
        await onConfirmed();
        onClose();
        return;
      }
      setPendingText("Verifying 3 consecutive scale readings on branch gateway…");
      const ok = await pollUntilTerminal(res.value.command_id);
      if (ok) {
        onClose();
      } else {
        requestIdRef.current = randomRequestId();
        void loadStability();
      }
    } finally {
      setSubmitting(false);
      setPendingText(null);
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
              <Wrench className="size-4 shrink-0 text-warning" aria-hidden="true" />
              <h2 id={titleId} className="text-base font-semibold leading-normal text-ink">
                {mode === "start" ? "Start tank swap" : "Complete tank swap"}
              </h2>
            </div>
            <p className="mt-1 truncate text-xs text-faint">{device.label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close tank swap modal"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md border border-control bg-navy text-muted transition-colors duration-150 enabled:hover:bg-navy-hover enabled:hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted motion-reduce:transition-none"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {mode === "start" ? (
            <>
              <div className="rounded-md border-l-2 border-warning bg-raised px-4 py-3 text-sm text-ink">
                Mutes fuel-level alarms for this cylinder while keeping gas leak detection and ambient
                temperature monitoring active.
              </div>

              <div className="space-y-4">
                <div className="grid gap-2">
                  <label htmlFor="swap-started-by" className="text-sm font-medium text-ink">
                    Staff name
                  </label>
                  <input
                    id="swap-started-by"
                    type="text"
                    maxLength={80}
                    required
                    value={actorName}
                    onChange={(e) => {
                      setActorName(e.target.value);
                      requestIdRef.current = randomRequestId();
                    }}
                    className={INPUT_CLASS}
                    placeholder="Operator name"
                  />
                </div>

                <div className="grid gap-2">
                  <label htmlFor="swap-service-note" className="text-sm font-medium text-ink">
                    Service note (optional)
                  </label>
                  <input
                    id="swap-service-note"
                    type="text"
                    maxLength={240}
                    value={serviceNote}
                    onChange={(e) => {
                      setServiceNote(e.target.value);
                      requestIdRef.current = randomRequestId();
                    }}
                    className={INPUT_CLASS}
                    placeholder="e.g., Scheduled bottle swap"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div
                className={`rounded-md border-l-2 bg-raised px-4 py-3 ${
                  stability?.stable ? "border-positive" : "border-warning"
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-semibold ${
                        stability?.stable ? "text-positive" : "text-warning"
                      }`}
                    >
                      {stability?.stable
                        ? "Scale reading stable"
                        : "Waiting for stable scale reading"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {stability?.reason || "Checking last 3 valid load-cell readings…"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadStability()}
                    disabled={loadingStability || submitting}
                    className={SECONDARY_NAVY_BTN_CLASS}
                  >
                    <RefreshCw
                      className={`size-4 shrink-0 ${loadingStability ? "animate-spin" : ""}`}
                      aria-hidden="true"
                    />
                    <span>Re-check scale</span>
                  </button>
                </div>

                {stability && (
                  <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-rule pt-3 text-xs tabular-nums sm:grid-cols-3">
                    <div>
                      <dt className="text-faint">Readings</dt>
                      <dd className="mt-0.5 font-medium text-ink">{stability.sample_count} / 3</dd>
                    </div>
                    <div>
                      <dt className="text-faint">Mean gross</dt>
                      <dd className="mt-0.5 font-medium text-ink">
                        {stability.mean_gross_kg != null ? `${stability.mean_gross_kg.toFixed(2)} kg` : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-faint">Spread</dt>
                      <dd className="mt-0.5 font-medium text-ink">
                        {stability.spread_kg != null ? `${stability.spread_kg.toFixed(2)} kg` : "—"}
                      </dd>
                    </div>
                  </dl>
                )}
              </div>

              <div className="space-y-4">
                <div className="grid gap-2">
                  <label htmlFor="swap-completed-by" className="text-sm font-medium text-ink">
                    Completed by
                  </label>
                  <input
                    id="swap-completed-by"
                    type="text"
                    maxLength={80}
                    required
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
                    <label htmlFor="swap-tare-kg" className="text-sm font-medium text-ink">
                      Empty cylinder tare (kg)
                    </label>
                    <input
                      id="swap-tare-kg"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={tareKgInput}
                      onChange={(e) => {
                        dirtyTareRef.current = true;
                        setTareKgInput(e.target.value);
                        requestIdRef.current = randomRequestId();
                      }}
                      className={`${INPUT_CLASS} tabular-nums`}
                      placeholder="e.g., 15.20"
                    />
                  </div>
                  <div className="grid gap-2">
                    <label htmlFor="swap-capacity-kg" className="text-sm font-medium text-ink">
                      Rated LPG capacity (kg)
                    </label>
                    <input
                      id="swap-capacity-kg"
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="500"
                      value={capacityKgInput}
                      onChange={(e) => {
                        dirtyCapRef.current = true;
                        setCapacityKgInput(e.target.value);
                        requestIdRef.current = randomRequestId();
                      }}
                      className={`${INPUT_CLASS} tabular-nums`}
                      placeholder="14.0"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {pendingText && (
            <div
              aria-busy="true"
              className="rounded-md border-l-2 border-control bg-raised px-4 py-3 text-sm text-muted"
            >
              {pendingText}
            </div>
          )}

          {errorText && (
            <div
              role="alert"
              className="rounded-md border-l-2 border-negative bg-raised px-4 py-3 text-sm text-ink"
            >
              {errorText}
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-rule pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={SECONDARY_NAVY_BTN_CLASS}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || (mode === "complete" && !stability?.stable)}
              aria-busy={submitting}
              className={PRIMARY_BTN_CLASS}
            >
              {submitting
                ? "Confirming…"
                : mode === "start"
                  ? "Start tank swap"
                  : "Confirm tank swap"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
