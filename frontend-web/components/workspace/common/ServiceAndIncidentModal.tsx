"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Wrench, X } from "lucide-react";
import {
  fetchLpgCommandStatus,
  startBranchLpgServiceMaintenance,
} from "@/app/branches/[branchId]/lpg/actions";
import {
  refreshRemoteMachineCommands,
  requestRemoteMachineCommand,
  submitDeviceMaintenanceLog,
} from "@/app/branches/[branchId]/machines/actions";
import {
  fetchIncidentDetailAction,
  resolveIncidentAction,
} from "@/app/branches/[branchId]/incidents/[incidentId]/actions";
import { useActionToast } from "@/components/workspace/common/ActionToastContext";
import type { MaintenanceLogKind } from "@/lib/auth/business";

export interface ServiceIncidentContext {
  id: string;
  reference_code: string;
  fault_code?: string | null;
  fault_name?: string | null;
  workflow_state: string;
  edge_condition_state: string;
  summary?: string;
}

export interface ServiceAndIncidentModalProps {
  open: boolean;
  branchId: string;
  domain: "machine" | "lpg";
  sourceId: string;
  assetLabel: string;
  assetStatus: string;
  isMaintenanceMode: boolean;
  branchOpen?: boolean;
  canControlHardware?: boolean;
  defaultTechnicianName?: string;
  defaultErrorCode?: string | null;
  incident?: ServiceIncidentContext | null;
  onClose: () => void;
  onCompleted?: () => Promise<void> | void;
}

const INPUT_CLASS =
  "min-h-11 w-full min-w-0 rounded-md border border-control bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted";

const PRIMARY_BTN_CLASS =
  "inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-ink bg-ink px-4 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:border-muted enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted sm:w-auto";

const SECONDARY_BTN_CLASS =
  "inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-4 py-2 text-xs font-semibold text-ink transition-colors enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted sm:w-auto";

const QUICK_CODES_MACHINE = ["PREVENTIVE", "INSPECTION", "CLEANING", "E01", "E02", "E03", "E04", "E05"];
const QUICK_CODES_LPG = ["INSPECTION", "GAS_CHECK", "LEAK_TEST", "CALIBRATION", "GAS_WARNING", "GAS_CRITICAL"];

function randomUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function ServiceAndIncidentModal({
  open,
  branchId,
  domain,
  sourceId,
  assetLabel,
  assetStatus,
  isMaintenanceMode,
  branchOpen = true,
  canControlHardware = true,
  defaultTechnicianName = "",
  defaultErrorCode = null,
  incident = null,
  onClose,
  onCompleted,
}: ServiceAndIncidentModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mountedRef = useRef(true);
  const { notify } = useActionToast();

  const initialCode =
    incident?.fault_code?.trim() ||
    defaultErrorCode?.trim() ||
    (domain === "lpg" ? "INSPECTION" : "PREVENTIVE");

  const [maintenanceOverride, setMaintenanceOverride] = useState(false);
  const maintenanceActive = isMaintenanceMode || maintenanceOverride;
  const [technicianName, setTechnicianName] = useState(defaultTechnicianName.trim());
  const [errorCode, setErrorCode] = useState(initialCode);
  const [workDone, setWorkDone] = useState("");
  const [autoResolveIncident, setAutoResolveIncident] = useState(
    Boolean(incident && incident.workflow_state !== "resolved"),
  );
  const [isCommandPending, setIsCommandPending] = useState(false);
  const [isSubmittingLog, setIsSubmittingLog] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!open) return null;

  const busy = isCommandPending || isSubmittingLog;
  const quickCodes = domain === "lpg" ? QUICK_CODES_LPG : QUICK_CODES_MACHINE;
  const isMachineBlocked =
    domain === "machine" &&
    (!branchOpen || !canControlHardware || assetStatus === "OFFLINE");

  const pollMachineCommand = async (commandId: string): Promise<"succeeded" | "failed" | "timeout"> => {
    for (let attempt = 0; attempt < 16; attempt++) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      if (!mountedRef.current) return "timeout";
      const res = await refreshRemoteMachineCommands(branchId, sourceId);
      if (res.ok) {
        const match = res.value.find((cmd) => cmd.command_id === commandId);
        if (match?.status === "succeeded") return "succeeded";
        if (match && (match.status === "failed" || match.status === "expired")) return "failed";
      }
    }
    return "timeout";
  };

  const pollLpgCommand = async (commandId: string): Promise<"succeeded" | "failed" | "timeout"> => {
    for (let attempt = 0; attempt < 25; attempt++) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      if (!mountedRef.current) return "timeout";
      const res = await fetchLpgCommandStatus(branchId, sourceId, commandId);
      if (res.ok) {
        if (res.value.status === "succeeded") return "succeeded";
        if (["failed", "expired", "unknown"].includes(res.value.status)) return "failed";
      }
    }
    return "timeout";
  };

  const handleEnterMaintenance = async () => {
    if (busy || maintenanceActive) return;
    const toastId = `service-enter-maint-${branchId}-${sourceId}`;
    setIsCommandPending(true);
    notify({
      id: toastId,
      kind: "info",
      title: "Entering maintenance mode",
      message:
        domain === "lpg"
          ? `Pausing telemetry alerts and putting ${assetLabel} into maintenance…`
          : `Locking ${assetLabel} for maintenance…`,
    });

    try {
      const requestId = randomUuid();
      if (domain === "machine") {
        const res = await requestRemoteMachineCommand(
          branchId,
          sourceId,
          requestId,
          "start_maintenance",
          {},
        );
        if (!res.ok) {
          notify({
            id: toastId,
            kind: "error",
            title: "Maintenance mode failed",
            message: res.message,
          });
          return;
        }
        const outcome = await pollMachineCommand(res.value.command_id);
        if (outcome === "succeeded") {
          setMaintenanceOverride(true);
          notify({
            id: toastId,
            kind: "success",
            title: "Machine in maintenance mode",
            message: `${assetLabel} is locked and ready for service logging.`,
          });
          await onCompleted?.();
        } else {
          notify({
            id: toastId,
            kind: "error",
            title: "Maintenance confirmation timed out",
            message: `${assetLabel} did not confirm maintenance mode in time.`,
          });
        }
      } else {
        const res = await startBranchLpgServiceMaintenance(branchId, sourceId, {
          request_id: requestId,
          started_by: technicianName.trim() || defaultTechnicianName || "Operator",
          service_note: incident ? `Inspecting ${incident.reference_code}` : "Routine maintenance",
          session_kind: incident ? "incident_inspection" : "maintenance",
          incident_id: incident?.id ?? null,
        });
        if (!res.ok) {
          notify({
            id: toastId,
            kind: "error",
            title: "Maintenance mode failed",
            message: res.message,
          });
          return;
        }
        const outcome = await pollLpgCommand(res.value.command_id);
        if (outcome === "succeeded") {
          setMaintenanceOverride(true);
          notify({
            id: toastId,
            kind: "success",
            title: "LPG node in maintenance mode",
            message: `${assetLabel} alerts are paused for inspection and service logging.`,
          });
          await onCompleted?.();
        } else {
          notify({
            id: toastId,
            kind: "error",
            title: "LPG maintenance timed out",
            message: `Gateway did not confirm maintenance pause for ${assetLabel}.`,
          });
        }
      }
    } catch {
      notify({
        id: toastId,
        kind: "error",
        title: "Maintenance request failed",
        message: "Could not reach the backend service.",
      });
    } finally {
      if (mountedRef.current) setIsCommandPending(false);
    }
  };

  const tryAwaitClearanceAndResolve = async (
    targetIncidentId: string,
    resolutionNote: string,
  ): Promise<"resolved" | "pending_clearance"> => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
      if (!mountedRef.current) return "pending_clearance";
      const detail = await fetchIncidentDetailAction(targetIncidentId);
      if (detail.ok && detail.incident.edge_condition_state === "cleared") {
        const resolved = await resolveIncidentAction(branchId, targetIncidentId, resolutionNote);
        if (resolved.ok) return "resolved";
      }
    }
    return "pending_clearance";
  };

  const handleSubmit = async (returnToService: boolean) => {
    if (busy) return;
    if (!maintenanceActive) {
      notify({
        id: `service-log-${branchId}-${sourceId}`,
        kind: "error",
        title: "Maintenance mode required",
        message: "Enter maintenance mode before saving a service record.",
      });
      return;
    }

    const trimmedTech = technicianName.trim();
    const trimmedCode = errorCode.trim();
    const trimmedWork = workDone.trim();
    const toastId = `service-log-${branchId}-${sourceId}`;

    if (trimmedTech.length < 2) {
      notify({
        id: toastId,
        kind: "error",
        title: "Technician name required",
        message: "Enter the responsible crew or technician name (min 2 characters).",
      });
      return;
    }
    if (trimmedCode.length < 1) {
      notify({
        id: toastId,
        kind: "error",
        title: "Service or error code required",
        message: "Enter an error code or service code (e.g., PREVENTIVE, E01, GAS_WARNING).",
      });
      return;
    }
    if (trimmedWork.length < 3) {
      notify({
        id: toastId,
        kind: "error",
        title: "Tasks summary required",
        message: "Describe the inspection or tasks performed (min 3 characters).",
      });
      return;
    }

    setIsSubmittingLog(true);
    notify({
      id: toastId,
      kind: "info",
      title: returnToService ? "Completing service" : "Saving service log",
      message: returnToService
        ? `Logging service work on ${assetLabel} and returning to normal operation…`
        : `Saving work-in-progress log for ${assetLabel}…`,
    });

    try {
      const logKind: MaintenanceLogKind = incident
        ? "incident_resolution"
        : domain === "lpg"
          ? "inspection"
          : "maintenance";
      const shouldAttemptResolve = Boolean(
        returnToService && incident && autoResolveIncident && incident.workflow_state !== "resolved",
      );

      const res = await submitDeviceMaintenanceLog(branchId, sourceId, {
        error_code: trimmedCode,
        technician_name: trimmedTech,
        work_done: trimmedWork,
        log_kind: logKind,
        incident_id: incident?.id ?? null,
        outcome: returnToService ? "completed" : "in_progress",
        return_to_service: returnToService,
        resolve_incident: shouldAttemptResolve,
        ...(returnToService ? { command_request_id: randomUuid() } : {}),
      });

      if (!res.ok) {
        notify({
          id: toastId,
          kind: "error",
          title: "Could not save service log",
          message: res.message,
        });
        return;
      }

      if (!returnToService || !res.value.command?.command_id) {
        notify({
          id: toastId,
          kind: "success",
          title: "Service log saved",
          message: `${res.value.item.reference_code} recorded while staying in maintenance mode.`,
        });
        await onCompleted?.();
        onClose();
        return;
      }

      const cmdOutcome =
        domain === "machine"
          ? await pollMachineCommand(res.value.command.command_id)
          : await pollLpgCommand(res.value.command.command_id);

      if (cmdOutcome !== "succeeded") {
        notify({
          id: toastId,
          kind: "info",
          title: "Log saved; return pending",
          message: `${res.value.item.reference_code} was saved, but gateway confirmation for return-to-service did not arrive yet.`,
        });
        await onCompleted?.();
        return;
      }

      if (shouldAttemptResolve && incident) {
        if (res.value.incident_resolution?.resolved) {
          notify({
            id: toastId,
            kind: "success",
            title: "Service completed & incident resolved",
            message: `${res.value.item.reference_code} saved, ${assetLabel} is online, and ${incident.reference_code} is resolved.`,
          });
        } else {
          const resolvedStatus = await tryAwaitClearanceAndResolve(incident.id, trimmedWork);
          if (resolvedStatus === "resolved") {
            notify({
              id: toastId,
              kind: "success",
              title: "Service completed & incident resolved",
              message: `${res.value.item.reference_code} saved, ${assetLabel} returned online, and ${incident.reference_code} is resolved.`,
            });
          } else {
            notify({
              id: toastId,
              kind: "info",
              title: "Asset online; awaiting edge clearance",
              message: `${res.value.item.reference_code} saved and ${assetLabel} returned online. Incident ${incident.reference_code} will be ready to close once fresh normal telemetry clears the edge condition.`,
            });
          }
        }
      } else {
        notify({
          id: toastId,
          kind: "success",
          title: "Service completed",
          message: `${res.value.item.reference_code} saved and ${assetLabel} returned to service.`,
        });
      }

      await onCompleted?.();
      onClose();
    } catch {
      notify({
        id: toastId,
        kind: "error",
        title: "Service request failed",
        message: "Could not reach the backend service.",
      });
    } finally {
      if (mountedRef.current) setIsSubmittingLog(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={() => {
        if (!busy) onClose();
      }}
      onCancel={(event) => {
        if (busy) {
          event.preventDefault();
        }
      }}
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 m-auto hidden max-h-[92vh] w-[calc(100%-1.5rem)] max-w-2xl flex-col overflow-hidden rounded-md border border-control bg-surface p-0 text-ink shadow-2xl backdrop:bg-canvas/80 open:flex"
    >
      <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4 sm:px-6">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Wrench className="size-4 shrink-0 text-warning" aria-hidden="true" />
            <h2 id={titleId} className="truncate text-lg font-semibold text-ink">
              {incident ? "Service & Resolve Incident" : "Equipment Maintenance & Service"}
            </h2>
          </div>
          <dl className="grid grid-cols-1 gap-x-5 gap-y-1 pt-1 text-xs sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-faint">Asset</dt>
              <dd className="truncate font-medium text-ink">{assetLabel}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-faint">Hardware ID</dt>
              <dd className="truncate font-mono text-muted">{sourceId}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-faint">Current state</dt>
              <dd className="font-semibold text-warning">
                {maintenanceActive ? "MAINTENANCE" : assetStatus}
              </dd>
            </div>
          </dl>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          aria-label="Close service modal"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-control bg-navy text-muted transition-colors hover:bg-navy-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
        {incident && (
          <div className="rounded-md border border-negative/35 bg-negative/10 p-3.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <AlertTriangle className="size-4 shrink-0 text-negative" aria-hidden="true" />
              <span className="font-mono font-semibold text-ink">{incident.reference_code}</span>
              {incident.fault_code && (
                <span className="rounded border border-rule bg-canvas px-2 py-0.5 font-mono text-ink">
                  {incident.fault_code}
                </span>
              )}
              <span className="rounded border border-rule bg-surface px-2 py-0.5 text-muted">
                {incident.edge_condition_state === "active" ? "Edge Active" : "Edge Cleared"}
              </span>
            </div>
            {incident.summary && <p className="mt-1.5 text-muted">{incident.summary}</p>}
          </div>
        )}

        <section className="rounded-md border border-line bg-raised/35 p-4 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <h3 className="text-sm font-semibold text-ink">
                1. Hardware Maintenance Mode
              </h3>
              <p className="text-xs text-muted">
                {maintenanceActive
                  ? domain === "lpg"
                    ? "Readings evaluation and safety alerts are paused while this node is in maintenance."
                    : "Customer wash/dry cycles are paused while this machine is in maintenance."
                  : domain === "lpg"
                    ? "Enter maintenance mode to pause gas and fuel alert triggers before logging service work."
                    : "Put this unit into maintenance mode (from idle or error) before recording service work."}
              </p>
            </div>

            {maintenanceActive ? (
              <span className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-md border border-warning/40 bg-warning/15 px-3 py-2 text-xs font-semibold text-warning">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                <span>Maintenance Active</span>
              </span>
            ) : (
              <button
                type="button"
                disabled={busy || isMachineBlocked}
                onClick={handleEnterMaintenance}
                className={SECONDARY_BTN_CLASS}
              >
                <Wrench className="size-4 shrink-0" aria-hidden="true" />
                <span>{isCommandPending ? "Switching..." : "Put into maintenance mode"}</span>
              </button>
            )}
          </div>
          {isMachineBlocked && !maintenanceActive && (
            <p className="text-xs text-negative">
              {!branchOpen
                ? "Branch must be open to send machine commands."
                : "Machine must be online to enter maintenance mode."}
            </p>
          )}
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-ink">
            2. Maintenance &amp; Resolution Log
          </h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted">
              <span>Maintenance crew / technician</span>
              <input
                type="text"
                value={technicianName}
                disabled={busy || !maintenanceActive}
                onChange={(e) => setTechnicianName(e.target.value)}
                placeholder="Technician or crew name"
                maxLength={120}
                className={INPUT_CLASS}
              />
            </label>

            <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-muted">
              <span>Error / service code</span>
              <input
                type="text"
                value={errorCode}
                disabled={busy || !maintenanceActive}
                onChange={(e) => setErrorCode(e.target.value)}
                placeholder={domain === "lpg" ? "INSPECTION or GAS_WARNING" : "PREVENTIVE or E01"}
                maxLength={64}
                className={INPUT_CLASS}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-1.5" aria-label="Quick service codes">
            {quickCodes.map((code) => (
              <button
                key={code}
                type="button"
                disabled={busy || !maintenanceActive}
                onClick={() => setErrorCode(code)}
                className={`min-h-9 rounded border px-2.5 py-1 font-mono text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${
                  errorCode.trim().toUpperCase() === code
                    ? "border-accent bg-navy-selected text-ink"
                    : "border-rule bg-raised text-muted hover:border-control hover:text-ink"
                }`}
              >
                {code}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
            <span>Tasks conducted / inspection findings</span>
            <textarea
              rows={5}
              value={workDone}
              disabled={busy || !maintenanceActive}
              onChange={(e) => setWorkDone(e.target.value)}
              placeholder="Describe checks performed, components serviced, gas leak test results, or repair steps…"
              maxLength={4000}
              className="w-full min-w-0 rounded-md border border-control bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-faint transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
            />
          </label>

          {incident && incident.workflow_state !== "resolved" && (
            <label className="flex min-h-11 items-center gap-2.5 rounded-md border border-line bg-raised/30 px-3 py-2 text-xs text-ink">
              <input
                type="checkbox"
                checked={autoResolveIncident}
                disabled={busy || !maintenanceActive}
                onChange={(e) => setAutoResolveIncident(e.target.checked)}
                className="size-4 accent-accent"
              />
              <span>
                Also mark incident <span className="font-mono font-semibold">{incident.reference_code}</span> resolved once edge clearance confirms
              </span>
            </label>
          )}
        </section>
      </div>

      <div className="flex flex-col-reverse gap-2.5 border-t border-rule bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
        <button
          type="button"
          disabled={busy || !maintenanceActive}
          onClick={() => handleSubmit(false)}
          className={SECONDARY_BTN_CLASS}
        >
          {isSubmittingLog ? "Saving…" : "Save progress (Stay in maintenance)"}
        </button>

        <button
          type="button"
          disabled={busy || !maintenanceActive}
          onClick={() => handleSubmit(true)}
          className={PRIMARY_BTN_CLASS}
        >
          {isSubmittingLog ? "Completing…" : "Complete service & return online"}
        </button>
      </div>
    </dialog>
  );
}
