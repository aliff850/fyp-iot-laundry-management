"use client";

import React, { useEffect, useState } from "react";
import { Cog, Filter, WashingMachine, Wind } from "lucide-react";
import {
  refreshRemoteMachines,
  refreshRemoteMachineStatistics,
  type RemoteMachine,
} from "@/app/branches/[branchId]/machines/actions";
import {
  getMachineStatusBadge,
  MachineCard,
  type MachineModalTab,
} from "@/components/workspace/machines/MachineCard";
import { MachineDetailModal } from "@/components/workspace/machines/MachineDetailModal";

export interface RemoteMachineFleetProps {
  branchId: string;
  branchOpen: boolean;
  role: "owner" | "branch_manager" | "machine_maintenance";
  defaultTechnicianName?: string;
  initialMachines: RemoteMachine[];
}

type TypeFilter = "all" | "washer" | "dryer";
type StatusFilter =
  | "all"
  | "RUNNING"
  | "IDLE"
  | "ERROR"
  | "MAINTENANCE"
  | "OFFLINE";

export function RemoteMachineFleet({
  branchId,
  branchOpen,
  role,
  defaultTechnicianName = "",
  initialMachines,
}: RemoteMachineFleetProps) {
  const [machines, setMachines] = useState<RemoteMachine[]>(initialMachines);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<MachineModalTab>("diagnostics");
  const [serviceError, setServiceError] = useState<string | null>(null);

  const selectedMachine =
    machines.find((machine) => machine.source_id === selectedId) ?? null;

  const refreshMachinesNow = async () => {
    const result = await refreshRemoteMachines(branchId);
    if (result.ok) {
      setMachines(result.value);
      setServiceError(null);
    } else {
      setServiceError(result.message);
    }
  };

  useEffect(() => {
    let active = true;
    async function poll() {
      if (document.visibilityState !== "visible") return;
      const result = await refreshRemoteMachines(branchId);
      if (!active) return;
      if (result.ok) {
        setMachines(result.value);
        setServiceError(null);
      } else {
        setServiceError(result.message);
      }
    }
    const timer = window.setInterval(poll, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [branchId]);

  const handleOpenDetails = (
    machine: RemoteMachine,
    initialTab: MachineModalTab = "diagnostics",
  ) => {
    setSelectedId(machine.source_id);
    setModalTab(initialTab);
  };

  const totalCount = machines.length;
  const washerCount = machines.filter(
    (m) => m.type === "washer" || m.type === "washer_dryer",
  ).length;
  const dryerCount = machines.filter((m) => m.type === "dryer").length;

  const statusOf = (m: RemoteMachine) => getMachineStatusBadge(m).effectiveStatus;
  const runningCount = machines.filter((m) => statusOf(m) === "RUNNING").length;
  const idleCount = machines.filter((m) => statusOf(m) === "IDLE").length;
  const errorCount = machines.filter((m) => statusOf(m) === "ERROR").length;
  const maintenanceCount = machines.filter(
    (m) => statusOf(m) === "MAINTENANCE",
  ).length;
  const offlineCount = machines.filter((m) => statusOf(m) === "OFFLINE").length;

  const filtered = machines.filter((m) => {
    if (
      typeFilter === "washer" &&
      m.type !== "washer" &&
      m.type !== "washer_dryer"
    ) {
      return false;
    }
    if (typeFilter === "dryer" && m.type !== "dryer") {
      return false;
    }
    if (statusFilter !== "all" && statusOf(m) !== statusFilter) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {serviceError && (
        <p
          role="alert"
          className="rounded-md border border-warning bg-raised px-5 py-4 text-sm text-ink"
        >
          {serviceError} Last received machine data is shown; controls are disabled.
        </p>
      )}

      {!branchOpen && (
        <p className="rounded-md border border-rule bg-surface px-5 py-4 text-sm text-muted">
          This branch is closed. Machine controls are unavailable.
        </p>
      )}

      {machines.length === 0 && !serviceError ? (
        <p className="rounded-md border border-rule bg-surface px-5 py-4 text-sm text-muted">
          No approved machines are registered for this branch.
        </p>
      ) : (
        <section className="space-y-6">
          {/* Overview & Quick Filters Bar matching Pi 5 renderMachines */}
          <div className="space-y-4">
            <div className="space-y-4 rounded-md border border-line bg-surface p-3.5 sm:p-4 md:p-5">
              {/* Equipment Category Tabs */}
              <div
                role="group"
                aria-label="Filter by equipment category"
                className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center"
              >
                <span className="mr-0.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted sm:mr-1 sm:text-sm">
                  <Cog className="size-3.5 shrink-0" aria-hidden="true" />
                  <span>Type:</span>
                </span>

                <button
                  type="button"
                  aria-pressed={typeFilter === "all"}
                  onClick={() => setTypeFilter("all")}
                  className={`col-span-2 inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:col-auto sm:gap-2 sm:px-3.5 sm:text-sm ${
                    typeFilter === "all"
                      ? "border border-ink bg-ink font-semibold text-surface"
                      : "border border-line bg-raised/40 text-muted hover:border-control hover:bg-raised hover:text-ink"
                  }`}
                >
                  <span>All Equipment ({totalCount})</span>
                </button>

                <button
                  type="button"
                  aria-pressed={typeFilter === "washer"}
                  onClick={() => setTypeFilter("washer")}
                  className={`inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:gap-2 sm:px-3.5 sm:text-sm ${
                    typeFilter === "washer"
                      ? "border border-ink bg-ink font-semibold text-surface"
                      : "border border-line bg-raised/40 text-muted hover:border-control hover:bg-raised hover:text-ink"
                  }`}
                >
                  <WashingMachine className="size-3.5 shrink-0 sm:size-4" aria-hidden="true" />
                  <span>Washers ({washerCount})</span>
                </button>

                <button
                  type="button"
                  aria-pressed={typeFilter === "dryer"}
                  onClick={() => setTypeFilter("dryer")}
                  className={`inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:gap-2 sm:px-3.5 sm:text-sm ${
                    typeFilter === "dryer"
                      ? "border border-ink bg-ink font-semibold text-surface"
                      : "border border-line bg-raised/40 text-muted hover:border-control hover:bg-raised hover:text-ink"
                  }`}
                >
                  <Wind className="size-3.5 shrink-0 sm:size-4" aria-hidden="true" />
                  <span>Dryers ({dryerCount})</span>
                </button>
              </div>

              {/* Status Sub-Filters Row */}
              <div className="flex flex-col gap-3 border-t border-rule pt-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div
                  role="group"
                  aria-label="Filter by operational status"
                  className="flex flex-wrap items-center gap-1.5 sm:gap-2"
                >
                  <span className="mr-0.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted sm:mr-1 sm:text-sm">
                    <Filter className="size-3.5 shrink-0" aria-hidden="true" />
                    <span>Status:</span>
                  </span>

                  {(
                    [
                      ["all", "All", totalCount],
                      ["RUNNING", "Running", runningCount],
                      ["IDLE", "Idle", idleCount],
                      ["ERROR", "Error", errorCount],
                      ["MAINTENANCE", "Maintenance", maintenanceCount],
                      ["OFFLINE", "Offline", offlineCount],
                    ] as const
                  ).map(([key, label, count]) => {
                    const active = statusFilter === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setStatusFilter(key)}
                        className={`inline-flex min-h-11 items-center justify-center rounded-md px-2.5 py-2 text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:px-3 sm:text-sm ${
                          active
                            ? "border border-control bg-navy-selected font-semibold text-ink"
                            : "border border-line bg-raised/40 font-medium text-muted hover:border-control hover:bg-raised hover:text-ink"
                        }`}
                      >
                        {label} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Full-Width Stacked Row Cards */}
          {filtered.length > 0 ? (
            <div
              role="feed"
              aria-label="Machine equipment list"
              className="space-y-4"
            >
              {filtered.map((machine) => (
                <MachineCard
                  key={machine.source_id}
                  machine={machine}
                  branchId={branchId}
                  branchOpen={branchOpen}
                  role={role}
                  serviceError={serviceError}
                  onOpenDetails={handleOpenDetails}
                  onCommandSent={refreshMachinesNow}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-md border border-line bg-surface p-12 text-center">
              <WashingMachine className="size-10 text-faint" aria-hidden="true" />
              <h3 className="mt-3 text-sm font-semibold text-ink">
                No Machines Match Filter
              </h3>
              <p className="mt-1 max-w-sm text-xs text-muted">
                No equipment on this branch satisfies the selected category or status criteria.
              </p>
              <button
                type="button"
                onClick={() => {
                  setTypeFilter("all");
                  setStatusFilter("all");
                }}
                className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-sm font-medium text-ink transition-colors duration-150 hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent"
              >
                Reset Filters
              </button>
            </div>
          )}
        </section>
      )}

      <MachineDetailModal
        key={selectedMachine?.source_id ?? "closed"}
        machine={selectedMachine}
        branchId={branchId}
        branchOpen={branchOpen}
        role={role}
        defaultTechnicianName={defaultTechnicianName}
        serviceError={serviceError}
        initialTab={modalTab}
        onFetchStatistics={async (sourceId, period) => {
          const result = await refreshRemoteMachineStatistics(branchId, sourceId, period);
          if (!result.ok) throw new Error(result.message);
          return result.value;
        }}
        onClose={() => setSelectedId(null)}
        onCommandSent={refreshMachinesNow}
      />
    </div>
  );
}
