"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RotateCcw, Wrench } from "lucide-react";
import {
  refreshRemoteMachineCommands,
  requestRemoteMachineCommand,
  submitMachineMaintenanceLog,
  type RemoteMachine,
} from "@/app/branches/[branchId]/machines/actions";
import { useActionToast } from "@/components/workspace/common/ActionToastContext";

export interface MachineMaintenancePanelProps {
  machine: RemoteMachine;
  effectiveStatus:
    | "RUNNING"
    | "IDLE"
    | "PAUSED"
    | "ERROR"
    | "MAINTENANCE"
    | "OFFLINE";
  branchId: string;
  branchOpen: boolean;
  serviceError?: string | null;
  defaultTechnicianName?: string;
  onMaintenanceUpdated?: () => void;
}

export function MachineMaintenancePanel({
  machine,
  effectiveStatus,
  branchId,
  branchOpen,
  serviceError,
  defaultTechnicianName = "",
  onMaintenanceUpdated,
}: MachineMaintenancePanelProps) {
  const { notify } = useActionToast();
  const liveDefaultErrorCode = machine.data?.fault_code?.trim() || "MAINT";
  const [customErrorCode, setCustomErrorCode] = useState<string | null>(null);
  const errorCode = customErrorCode ?? liveDefaultErrorCode;
  const [technicianName, setTechnicianName] = useState(defaultTechnicianName);
  const [workDone, setWorkDone] = useState("");
  const [isCommandPending, setIsCommandPending] = useState(false);
  const [isSavingLog, setIsSavingLog] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isFresh = machine.freshness === "fresh";
  const canIssueCommand =
    branchOpen &&
    !serviceError &&
    isFresh &&
    machine.source === "simulated" &&
    !isCommandPending &&
    !isSavingLog;

  const canStartMaintenance =
    canIssueCommand && (effectiveStatus === "ERROR" || effectiveStatus === "IDLE");
  const canReturnToIdle = canIssueCommand && effectiveStatus === "MAINTENANCE";
  const canReturnToService =
    canIssueCommand &&
    (effectiveStatus === "ERROR" || effectiveStatus === "MAINTENANCE");

  const cmdToastId = `machine-maint-${machine.source_id}`;
  const logToastId = `machine-log-${machine.source_id}`;
  const historyHref = `/branches/${branchId}/maintenance`;

  const pollCommandResult = async (
    toastId: string,
    titleOnSuccess: string,
    commandId: string,
    successText: string,
    prefixText = "",
    linkHistory = false,
  ) => {
    for (let attempt = 0; attempt < 18; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (!mountedRef.current) return;
      const history = await refreshRemoteMachineCommands(
        branchId,
        machine.source_id,
      );
      if (!history.ok || !mountedRef.current) continue;
      const record = history.value.find(
        (item) => item.command_id === commandId,
      );
      if (!record || record.status === "queued" || record.status === "dispatched") {
        continue;
      }
      if (record.status === "succeeded") {
        onMaintenanceUpdated?.();
        notify({
          id: toastId,
          kind: "success",
          title: titleOnSuccess,
          message: prefixText ? `${prefixText} ${successText}` : successText,
          ...(linkHistory
            ? { actionHref: historyHref, actionLabel: "Open maintenance history →" }
            : {}),
        });
        return;
      }
      onMaintenanceUpdated?.();
      notify({
        id: toastId,
        kind: "error",
        title: "Machine command did not apply",
        message: `${prefixText ? `${prefixText} ` : ""}Command status: ${record.status}${
          record.reason ? ` (${record.reason})` : ". Check Pi 5 sync worker and ESP32."
        }`,
      });
      return;
    }
    notify({
      id: toastId,
      kind: "error",
      title: "Machine response timed out",
      message: `${prefixText ? `${prefixText} ` : ""}Command is still pending or unknown.`,
    });
  };

  const handleStateCommand = async (
    action: "start_maintenance" | "clear_fault",
  ) => {
    if (!canIssueCommand) return;
    setIsCommandPending(true);
    const starting = action === "start_maintenance";
    notify({
      id: cmdToastId,
      kind: "info",
      title: starting ? "Enabling maintenance mode" : "Returning machine to idle",
      message: `Waiting for ${machine.label} confirmation...`,
    });
    try {
      const requestId = crypto.randomUUID();
      const res = await requestRemoteMachineCommand(
        branchId,
        machine.source_id,
        requestId,
        action,
        {},
      );
      if (!res.ok) {
        notify({
          id: cmdToastId,
          kind: "error",
          title: "Maintenance command rejected",
          message: res.message,
        });
        return;
      }
      onMaintenanceUpdated?.();
      await pollCommandResult(
        cmdToastId,
        starting ? "Machine under maintenance" : "Machine returned to idle",
        res.value.command_id,
        starting
          ? `${machine.label} is now locked for maintenance.`
          : `${machine.label} is back in customer idle mode.`,
      );
    } catch {
      notify({
        id: cmdToastId,
        kind: "error",
        title: "Maintenance command failed",
        message: "Could not reach the backend server.",
      });
    } finally {
      if (mountedRef.current) {
        setIsCommandPending(false);
      }
    }
  };

  const submitLog = async (returnToService: boolean) => {
    const trimmedCode = errorCode.trim();
    const trimmedTech = technicianName.trim();
    const trimmedWork = workDone.trim();

    if (trimmedCode.length < 1) {
      notify({
        id: logToastId,
        kind: "error",
        title: "Missing error code",
        message: "Enter an error or service code before saving.",
      });
      return;
    }
    if (trimmedTech.length < 2) {
      notify({
        id: logToastId,
        kind: "error",
        title: "Missing employee name",
        message: "Enter the employee name (at least 2 characters).",
      });
      return;
    }
    if (trimmedWork.length < 3) {
      notify({
        id: logToastId,
        kind: "error",
        title: "Missing repair details",
        message: "Describe the tasks carried out (at least 3 characters).",
      });
      return;
    }

    setIsSavingLog(true);
    notify({
      id: logToastId,
      kind: "info",
      title: returnToService ? "Completing maintenance" : "Saving service log",
      message: returnToService
        ? `Logging repair on ${machine.label} and returning to service...`
        : `Saving maintenance log for ${machine.label}...`,
    });
    try {
      const result = await submitMachineMaintenanceLog(
        branchId,
        machine.source_id,
        {
          error_code: trimmedCode,
          technician_name: trimmedTech,
          work_done: trimmedWork,
          outcome: "completed",
          return_to_service: returnToService,
          ...(returnToService ? { command_request_id: crypto.randomUUID() } : {}),
        },
      );

      if (!result.ok) {
        notify({
          id: logToastId,
          kind: "error",
          title: "Service log not saved",
          message: result.message,
        });
        return;
      }

      setWorkDone("");
      onMaintenanceUpdated?.();
      const refCode = result.value.item.reference_code;
      if (result.value.command) {
        notify({
          id: logToastId,
          kind: "info",
          title: `Service log ${refCode} saved`,
          message: `Waiting for ${machine.label} to return to idle...`,
        });
        await pollCommandResult(
          logToastId,
          `Service ${refCode} completed`,
          result.value.command.command_id,
          `${machine.label} returned to idle.`,
          `Logged ${refCode}.`,
          true,
        );
      } else {
        notify({
          id: logToastId,
          kind: "success",
          title: `Service log ${refCode} saved`,
          message: `Recorded in-progress work on ${machine.label} (${trimmedCode}).`,
          actionHref: historyHref,
          actionLabel: "Open maintenance history →",
        });
      }
    } catch {
      notify({
        id: logToastId,
        kind: "error",
        title: "Service log failed",
        message: "Unexpected error while saving maintenance log.",
      });
    } finally {
      if (mountedRef.current) {
        setIsSavingLog(false);
      }
    }
  };

  const shouldReturnToIdleOnSubmit =
    machine.source === "simulated" && effectiveStatus !== "IDLE";

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitLog(shouldReturnToIdleOnSubmit);
  };

  return (
    <section className="space-y-4 rounded-md border border-line bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">
            Maintenance &amp; Repair Log
          </h3>
          {effectiveStatus === "MAINTENANCE" && (
            <span className="inline-flex items-center rounded border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
              Maintenance active
            </span>
          )}
        </div>

        {machine.source === "simulated" && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              disabled={!canStartMaintenance}
              data-maint-primary-focus={canStartMaintenance ? "true" : undefined}
              onClick={() => handleStateCommand("start_maintenance")}
              className="inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-warning/50 bg-warning/10 px-3.5 py-2 text-xs font-semibold text-warning transition-colors enabled:hover:bg-warning/20 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted sm:w-auto"
            >
              <Wrench className="size-4 shrink-0" aria-hidden="true" />
              <span>
                {isCommandPending ? "Updating..." : "Put under maintenance"}
              </span>
            </button>

            {effectiveStatus === "MAINTENANCE" && (
              <button
                type="button"
                disabled={!canReturnToIdle}
                onClick={() => handleStateCommand("clear_fault")}
                className="inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-xs font-semibold text-ink transition-colors enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted sm:w-auto"
              >
                <RotateCcw className="size-4 shrink-0" aria-hidden="true" />
                <span>Return to idle</span>
              </button>
            )}
          </div>
        )}
      </div>

      <form
        noValidate
        onSubmit={handleFormSubmit}
        className="space-y-4 rounded-md border border-rule bg-raised/40 p-3.5 sm:p-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-ink">
            <span>Error code</span>
            <input
              type="text"
              name="error_code"
              value={errorCode}
              onChange={(e) => {
                setCustomErrorCode(e.target.value);
              }}
              required
              minLength={1}
              maxLength={64}
              placeholder="e.g. E01 or MAINT"
              className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 font-mono text-sm text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>

          <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-ink">
            <span>Employee name</span>
            <input
              type="text"
              name="technician_name"
              value={technicianName}
              onChange={(e) => setTechnicianName(e.target.value)}
              required
              minLength={2}
              maxLength={120}
              placeholder="Technician or staff full name"
              className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
          <span>Tasks carried out</span>
          <textarea
            name="work_done"
            rows={5}
            value={workDone}
            onChange={(e) => setWorkDone(e.target.value)}
            data-maint-primary-focus={!canStartMaintenance ? "true" : undefined}
            required
            minLength={3}
            maxLength={4000}
            placeholder="Record inspection steps, parts cleaned or replaced, and verification results."
            className="w-full rounded-md border border-control bg-canvas px-3 py-2.5 text-sm leading-relaxed text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          {shouldReturnToIdleOnSubmit ? (
            <button
              type="submit"
              disabled={isSavingLog || isCommandPending || !canReturnToService}
              className="inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-md border border-ink bg-ink px-4 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:border-muted enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted sm:w-auto"
            >
              {isSavingLog
                ? "Completing..."
                : "Log maintenance & return to idle"}
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSavingLog || isCommandPending}
              className="inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-md border border-ink bg-ink px-4 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:border-muted enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted sm:w-auto"
            >
              {isSavingLog ? "Saving..." : "Save maintenance log"}
            </button>
          )}

          <Link
            href={historyHref}
            className="inline-flex min-h-11 items-center justify-center text-xs font-medium text-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-accent sm:ml-auto"
          >
            View maintenance history →
          </Link>
        </div>
      </form>
    </section>
  );
}
