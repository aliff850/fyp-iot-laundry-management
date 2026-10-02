"use client";

import React, { useState } from "react";
import { Machine, MachineType } from "@/types";
import { MachineCard } from "./MachineCard";
import { WashingMachine, Wind } from "lucide-react";

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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border-2 border-slate-300 shadow-xs">
        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setFilterType("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === "all"
                ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All ({machines.length})
          </button>
          <button
            onClick={() => setFilterType("washer")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === "washer"
                ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <WashingMachine className="w-3.5 h-3.5" />
            <span>Washers ({washerCount})</span>
          </button>
          <button
            onClick={() => setFilterType("dryer")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              filterType === "dryer"
                ? "bg-white text-slate-900 shadow-2xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Wind className="w-3.5 h-3.5" />
            <span>Dryers ({dryerCount})</span>
          </button>
        </div>

        {/* Live Fleet Health Status Pills */}
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-800 font-bold border border-blue-300 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            {runningCount} Running
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-300 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            {idleCount} Available
          </span>
          {errorCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-800 font-bold border border-red-300 shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-red-600" />
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
