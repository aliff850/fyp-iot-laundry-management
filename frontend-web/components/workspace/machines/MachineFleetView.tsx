"use client";

import React, { useState } from "react";
import { WashingMachine, Wind, Filter, LayoutGrid, LayoutList, CircuitBoard, Cog } from "lucide-react";
import type { MachineItem } from "@/lib/auth/business";
import { MachineCard } from "@/components/workspace/machines/MachineCard";
import { MachineRowCard } from "@/components/workspace/machines/MachineRowCard";
import { MachineDetailModal } from "@/components/workspace/machines/MachineDetailModal";

interface MachineFleetViewProps {
  initialMachines: MachineItem[];
  branchId: string;
  userRole: "owner" | "branch_manager" | "machine_maintenance" | "lpg_maintenance";
}

export function MachineFleetView({
  initialMachines,
  branchId,
  userRole,
}: MachineFleetViewProps) {
  const [machines, setMachines] = useState<MachineItem[]>(initialMachines);
  const [typeFilter, setTypeFilter] = useState<"all" | "washer" | "dryer">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "RUNNING" | "IDLE" | "ERROR" | "OFFLINE">("all");
  const [viewMode, setViewMode] = useState<"rows" | "grid">("rows");
  const [selectedMachine, setSelectedMachine] = useState<MachineItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Counts
  const totalCount = machines.length;
  const washerCount = machines.filter(m => m.type === "washer").length;
  const dryerCount = machines.filter(m => m.type === "dryer").length;

  const runningCount = machines.filter(m => m.status === "RUNNING").length;
  const idleCount = machines.filter(m => m.status === "IDLE").length;
  const errorCount = machines.filter(m => m.status === "ERROR").length;
  const offlineCount = machines.filter(m => m.status === "OFFLINE").length;

  // Filtered collection
  const filteredMachines = machines.filter(m => {
    if (typeFilter !== "all" && m.type !== typeFilter) return false;
    if (statusFilter !== "all" && m.status !== statusFilter) return false;
    return true;
  });

  const handleMachineUpdated = (updated: MachineItem) => {
    setMachines(prev => prev.map(m => (m.id === updated.id ? updated : m)));
    if (selectedMachine && selectedMachine.id === updated.id) {
      setSelectedMachine(updated);
    }
  };

  const handleOpenDetails = (machine: MachineItem) => {
    setSelectedMachine(machine);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Overview & Quick Filters Bar adhering to DESIGN.md Section 4.4 */}
      <div className="rounded-md border border-line bg-surface p-3.5 sm:p-4 md:p-5 space-y-4">
        {/* Equipment Category Tabs: 2-column mobile grid with All full-width, flex row on sm+ */}
        <div
          className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:items-center"
          role="group"
          aria-label="Filter by equipment category"
        >
          <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-muted mr-0.5 sm:mr-1">
            <Cog className="size-3.5 shrink-0" aria-hidden="true" />
            <span>Type:</span>
          </span>

          <button
            type="button"
            aria-pressed={typeFilter === "all"}
            onClick={() => setTypeFilter("all")}
            className={`col-span-2 sm:col-auto inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3.5 py-2 text-xs sm:text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${typeFilter === "all"
              ? "border border-ink bg-ink font-semibold text-surface"
              : "border border-line bg-raised/40 text-muted hover:border-control hover:bg-raised hover:text-ink"
              }`}
          >
            <span>All Equipment</span>
            {/* <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${typeFilter === "all"
                ? "bg-surface/20 text-surface"
                : "bg-raised text-muted"
                }`}
            > */}
            ({totalCount})

          </button>

          <button
            type="button"
            aria-pressed={typeFilter === "washer"}
            onClick={() => setTypeFilter("washer")}
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap rounded-md px-3 py-2 sm:px-3.5 text-xs sm:text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${typeFilter === "washer"
              ? "border border-ink bg-ink font-semibold text-surface"
              : "border border-line bg-raised/40 text-muted hover:border-control hover:bg-raised hover:text-ink"
              }`}
          >
            <WashingMachine className="size-3.5 sm:size-4 shrink-0" aria-hidden="true" />
            <span>Washers</span>
            {/* <span
              className={`rounded-full px-1.5 sm:px-2 py-0.5 text-xs font-semibold tabular-nums ${typeFilter === "washer"
                ? "bg-surface/20 text-surface"
                : "bg-raised text-muted"
                }`}
            > */}
            ({washerCount})

          </button>

          <button
            type="button"
            aria-pressed={typeFilter === "dryer"}
            onClick={() => setTypeFilter("dryer")}
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 sm:gap-2 whitespace-nowrap rounded-md px-3 py-2 sm:px-3.5 text-xs sm:text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${typeFilter === "dryer"
              ? "border border-ink bg-ink font-semibold text-surface"
              : "border border-line bg-raised/40 text-muted hover:border-control hover:bg-raised hover:text-ink"
              }`}
          >
            <Wind className="size-3.5 sm:size-4 shrink-0" aria-hidden="true" />
            <span>Dryers</span>
            {/* <span
              className={`rounded-full px-1.5 sm:px-2 py-0.5 text-xs font-semibold tabular-nums ${typeFilter === "dryer"
                ? "bg-surface/20 text-surface"
                : "bg-raised text-muted"
                }`}
            > */}
            ({dryerCount})

          </button>
        </div>

        {/* Status Sub-Filters Row */}
        <div className="border-t border-rule pt-3.5">
          <div
            className="flex flex-wrap items-center gap-1.5 sm:gap-2"
            role="group"
            aria-label="Filter by operational status"
          >
            <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-muted mr-0.5 sm:mr-1">
              <Filter className="size-3.5 shrink-0" aria-hidden="true" />
              <span>Status:</span>
            </span>

            <button
              type="button"
              aria-pressed={statusFilter === "all"}
              onClick={() => setStatusFilter("all")}
              className={`inline-flex min-h-11 items-center justify-center rounded-md px-2.5 sm:px-3 py-2 text-xs sm:text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${statusFilter === "all"
                ? "border border-ink bg-ink font-semibold text-surface"
                : "border border-line bg-raised/40 font-medium text-muted hover:border-control hover:bg-raised hover:text-ink"
                }`}
            >
              All ({totalCount})
            </button>

            <button
              type="button"
              aria-pressed={statusFilter === "RUNNING"}
              onClick={() => setStatusFilter("RUNNING")}
              className={`inline-flex min-h-11 items-center justify-center rounded-md px-2.5 sm:px-3 py-2 text-xs sm:text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${statusFilter === "RUNNING"
                ? "border border-accent/50 bg-accent/15 font-semibold text-ink"
                : "border border-line bg-raised/40 font-medium text-muted hover:border-control hover:bg-raised hover:text-ink"
                }`}
            >
              Running ({runningCount})
            </button>

            <button
              type="button"
              aria-pressed={statusFilter === "IDLE"}
              onClick={() => setStatusFilter("IDLE")}
              className={`inline-flex min-h-11 items-center justify-center rounded-md px-2.5 sm:px-3 py-2 text-xs sm:text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${statusFilter === "IDLE"
                ? "border border-positive/40 bg-positive/15 font-semibold text-positive"
                : "border border-line bg-raised/40 font-medium text-muted hover:border-control hover:bg-raised hover:text-ink"
                }`}
            >
              Idle ({idleCount})
            </button>

            {errorCount > 0 && (
              <button
                type="button"
                aria-pressed={statusFilter === "ERROR"}
                onClick={() => setStatusFilter("ERROR")}
                className={`inline-flex min-h-11 items-center justify-center rounded-md px-2.5 sm:px-3 py-2 text-xs sm:text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${statusFilter === "ERROR"
                  ? "border border-negative/50 bg-negative/15 font-semibold text-negative"
                  : "border border-line bg-raised/40 font-medium text-negative/80 hover:border-control hover:bg-raised hover:text-negative"
                  }`}
              >
                Error ({errorCount})
              </button>
            )}

            {offlineCount > 0 && (
              <button
                type="button"
                aria-pressed={statusFilter === "OFFLINE"}
                onClick={() => setStatusFilter("OFFLINE")}
                className={`inline-flex min-h-11 items-center justify-center rounded-md px-2.5 sm:px-3 py-2 text-xs sm:text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${statusFilter === "OFFLINE"
                  ? "border border-line bg-raised font-semibold text-muted"
                  : "border border-line bg-raised/40 font-medium text-muted hover:border-control hover:bg-raised hover:text-ink"
                  }`}
              >
                Offline ({offlineCount})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Dedicated Fleet View Header & Layout Mode Container */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-md border border-line bg-surface p-3.5 sm:p-4">
        <h3 className="text-sm sm:text-base font-semibold text-ink">
          View
        </h3>

        {/* View Mode Toggle: full width segmented control on mobile, compact on sm+ */}
        <div
          className="grid grid-cols-2 w-full sm:w-auto sm:flex sm:items-center gap-1 rounded-md border border-line bg-surface p-1 shrink-0"
          role="group"
          aria-label="View mode"
        >
          <button
            type="button"
            onClick={() => setViewMode("rows")}
            aria-pressed={viewMode === "rows"}
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs sm:text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${viewMode === "rows"
              ? "border border-ink bg-ink font-semibold text-surface"
              : "border border-transparent font-medium text-muted hover:bg-raised hover:text-ink"
              }`}
            title="Stacked rows view (default)"
          >
            <LayoutList className="size-3.5 sm:size-4 shrink-0" aria-hidden="true" />
            <span>Rows</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode("grid")}
            aria-pressed={viewMode === "grid"}
            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs sm:text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none ${viewMode === "grid"
              ? "border border-ink bg-ink font-semibold text-surface"
              : "border border-transparent font-medium text-muted hover:bg-raised hover:text-ink"
              }`}
            title="4x4 grid view"
          >
            <LayoutGrid className="size-3.5 sm:size-4 shrink-0" aria-hidden="true" />
            <span>Grid</span>
          </button>
        </div>
      </div>

      {/* Equipment Collection Display: Stacked Rows (default) or 4x4 Grid */}
      {filteredMachines.length > 0 ? (
        viewMode === "rows" ? (
          <div className="space-y-3" role="feed" aria-label="Machine equipment list">
            {filteredMachines.map(machine => (
              <MachineRowCard
                key={machine.id}
                machine={machine}
                branchId={branchId}
                userRole={userRole}
                onOpenDetails={handleOpenDetails}
                onMachineUpdated={handleMachineUpdated}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" role="feed" aria-label="Machine equipment grid">
            {filteredMachines.map(machine => (
              <MachineCard
                key={machine.id}
                machine={machine}
                branchId={branchId}
                userRole={userRole}
                onOpenDetails={handleOpenDetails}
                onMachineUpdated={handleMachineUpdated}
              />
            ))}
          </div>
        )
      ) : (
        <div className="flex flex-col items-center justify-center rounded-md border border-line bg-surface p-12 text-center">
          <WashingMachine className="size-10 text-faint" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-semibold text-ink">No Machines Match Filter</h3>
          <p className="mt-1 max-w-sm text-xs text-muted">
            No equipment in this branch satisfies the selected category or status criteria.
          </p>
          <button
            type="button"
            onClick={() => {
              setTypeFilter("all");
              setStatusFilter("all");
            }}
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-3.5 py-2 text-sm font-medium text-ink transition-colors duration-150 hover:bg-navy-hover active:bg-navy-selected focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Machine Details & Parameters Modal */}
      <MachineDetailModal
        machine={selectedMachine}
        branchId={branchId}
        userRole={userRole}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onMachineUpdated={handleMachineUpdated}
      />
    </div>
  );
}
