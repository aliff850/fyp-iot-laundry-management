"use client";

import React, { useState } from "react";
import { WashingMachine, Wind, Filter } from "lucide-react";
import type { MachineItem } from "@/lib/auth/business";
import { MachineCard } from "@/components/workspace/machines/MachineCard";
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
      <div className="rounded-md border border-line bg-surface p-4 md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Equipment Category Tabs */}
          <div className="flex min-w-0 gap-4 overflow-x-auto border-b border-rule pb-2 lg:border-b-0 lg:pb-0" role="group" aria-label="Filter by equipment category">
            <button
              type="button"
              aria-pressed={typeFilter === "all"}
              onClick={() => setTypeFilter("all")}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                typeFilter === "all"
                  ? "bg-ink font-semibold text-surface"
                  : "bg-raised/40 text-muted hover:bg-raised hover:text-ink"
              }`}
            >
              <span>All Equipment</span>
              <span className="rounded-full bg-surface/20 px-1.5 py-0.2 text-[10px] font-semibold tabular-nums">
                {totalCount}
              </span>
            </button>

            <button
              type="button"
              aria-pressed={typeFilter === "washer"}
              onClick={() => setTypeFilter("washer")}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                typeFilter === "washer"
                  ? "bg-ink font-semibold text-surface"
                  : "bg-raised/40 text-muted hover:bg-raised hover:text-ink"
              }`}
            >
              <WashingMachine className="size-3.5" aria-hidden="true" />
              <span>Washers</span>
              <span className="rounded-full bg-surface/20 px-1.5 py-0.2 text-[10px] font-semibold tabular-nums">
                {washerCount}
              </span>
            </button>

            <button
              type="button"
              aria-pressed={typeFilter === "dryer"}
              onClick={() => setTypeFilter("dryer")}
              className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                typeFilter === "dryer"
                  ? "bg-ink font-semibold text-surface"
                  : "bg-raised/40 text-muted hover:bg-raised hover:text-ink"
              }`}
            >
              <Wind className="size-3.5" aria-hidden="true" />
              <span>Dryers</span>
              <span className="rounded-full bg-surface/20 px-1.5 py-0.2 text-[10px] font-semibold tabular-nums">
                {dryerCount}
              </span>
            </button>
          </div>

          {/* Status Sub-Filters */}
          <div className="flex flex-wrap items-center gap-2 text-xs" role="group" aria-label="Filter by operational status">
            <span className="text-muted flex items-center gap-1">
              <Filter className="size-3.5" aria-hidden="true" />
              <span>Status:</span>
            </span>

            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                statusFilter === "all"
                  ? "bg-navy-selected text-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              All ({totalCount})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("RUNNING")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                statusFilter === "RUNNING"
                  ? "border border-accent/40 bg-accent/10 text-ink"
                  : "text-muted hover:text-ink"
              }`}
            >
              Running ({runningCount})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter("IDLE")}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                statusFilter === "IDLE"
                  ? "border border-positive/30 bg-positive/10 text-positive"
                  : "text-muted hover:text-ink"
              }`}
            >
              Idle ({idleCount})
            </button>

            {errorCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter("ERROR")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  statusFilter === "ERROR"
                    ? "border border-negative/40 bg-negative/10 text-negative"
                    : "text-negative/80 hover:text-negative"
                }`}
              >
                Error ({errorCount})
              </button>
            )}

            {offlineCount > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter("OFFLINE")}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  statusFilter === "OFFLINE"
                    ? "border border-line bg-raised text-muted"
                    : "text-muted hover:text-ink"
                }`}
              >
                Offline ({offlineCount})
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Machine Grid (Frontend-Specs.md Line 205: 4 columns on large screens/PCs) */}
      {filteredMachines.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
            className="mt-4 inline-flex min-h-9 items-center justify-center rounded-md border border-control bg-raised px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-raised/70 focus-visible:outline-2 focus-visible:outline-accent"
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
