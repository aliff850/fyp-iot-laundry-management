"use client";

import React, { useState } from "react";
import { Machine, MachineType } from "@/types";
import { MachineCard } from "./MachineCard";
import { WashingMachine, Wind, Filter } from "lucide-react";

interface MachineGridProps {
  machines: Machine[];
  onCommand: (machineId: string, command: "start" | "pause" | "stop") => Promise<void>;
  onEditParameters: (machine: Machine) => void;
}

export function MachineGrid({ machines, onCommand, onEditParameters }: MachineGridProps) {
  const [filterType, setFilterType] = useState<"all" | MachineType>("all");

  const filtered = machines.filter((m) => {
    if (filterType === "all") return true;
    return m.type === filterType;
  });

  const washerCount = machines.filter((m) => m.type === "washer").length;
  const dryerCount = machines.filter((m) => m.type === "dryer").length;
  const runningCount = machines.filter((m) => m.status === "RUNNING").length;
  const idleCount = machines.filter((m) => m.status === "IDLE").length;
  const errorCount = machines.filter((m) => m.status === "ERROR").length;

  return (
    <div className="space-y-4">
      {/* Top Filter and Fleet Summary Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === "all"
                ? "bg-msu text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            All Units ({machines.length})
          </button>
          <button
            onClick={() => setFilterType("washer")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === "washer"
                ? "bg-msu text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <WashingMachine className="w-3.5 h-3.5" />
            <span>Washers ({washerCount})</span>
          </button>
          <button
            onClick={() => setFilterType("dryer")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filterType === "dryer"
                ? "bg-msu text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Wind className="w-3.5 h-3.5" />
            <span>Dryers ({dryerCount})</span>
          </button>
        </div>

        {/* Live Fleet Health Status Pills */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 font-semibold border border-blue-200">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            {runningCount} Running
          </span>
          <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {idleCount} Available
          </span>
          {errorCount > 0 && (
            <span className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-700 font-semibold border border-red-200">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {errorCount} Fault
            </span>
          )}
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {filtered.map((machine) => (
          <MachineCard
            key={machine.id}
            machine={machine}
            onCommand={onCommand}
            onEditParameters={onEditParameters}
          />
        ))}
      </div>
    </div>
  );
}
