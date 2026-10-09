"use client";

import React, { useState } from "react";
import { Machine, MachineType } from "@/types";
import { MachineCard } from "./MachineCard";
import { WashingMachine, Wind, Plus, CheckCircle2, Play, AlertCircle } from "lucide-react";

interface MachineGridProps {
  machines: Machine[];
  onCommand: (machineId: string, command: "start" | "pause" | "stop" | "unlock") => Promise<void>;
  onEditParameters: (machine: Machine) => void;
  onAddMachine?: (type: MachineType) => void;
}

export function MachineGrid({
  machines,
  onCommand,
  onEditParameters,
  onAddMachine,
}: MachineGridProps) {
  const [activeView, setActiveView] = useState<"segregated" | "washers" | "dryers">("segregated");

  const washers = machines.filter((m) => m.type === "washer");
  const dryers = machines.filter((m) => m.type === "dryer");

  // Washer Fleet KPIs
  const washerRunning = washers.filter((w) => w.status === "RUNNING").length;
  const washerIdle = washers.filter((w) => w.status === "IDLE").length;
  const washerError = washers.filter((w) => w.status === "ERROR").length;

  // Dryer Fleet KPIs
  const dryerRunning = dryers.filter((d) => d.status === "RUNNING").length;
  const dryerIdle = dryers.filter((d) => d.status === "IDLE").length;
  const dryerError = dryers.filter((d) => d.status === "ERROR").length;

  return (
    <div className="space-y-4">
      {/* Top Fleet Navigation Mode Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
          <button
            onClick={() => setActiveView("segregated")}
            className={`px-3 py-1.5 rounded-md transition-all ${
              activeView === "segregated"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            All Appliances ({machines.length})
          </button>
          <button
            onClick={() => setActiveView("washers")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
              activeView === "washers"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <WashingMachine className="w-3.5 h-3.5 text-blue-600" />
            <span>Washers ({washers.length})</span>
          </button>
          <button
            onClick={() => setActiveView("dryers")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
              activeView === "dryers"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Wind className="w-3.5 h-3.5 text-cyan-600" />
            <span>Dryers ({dryers.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {onAddMachine && (
            <button
              onClick={() => onAddMachine("washer")}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-msu hover:bg-msu-dark text-white text-xs font-semibold transition-colors shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Unit</span>
            </button>
          )}
        </div>
      </div>

      {/* SECTION 1: WASHER FLEET VIEW */}
      {(activeView === "segregated" || activeView === "washers") && (
        <div className="space-y-3.5 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          {/* Header Ribbon with Washer KPIs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                <WashingMachine className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-800 leading-tight truncate">
                  Washer Fleet
                </h3>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider truncate">
                  Commercial Electric Washers
                </p>
              </div>
            </div>

            {/* Washer KPI Summary Ribbon */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                Total: {washers.length}
              </span>
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                <Play className="w-3 h-3 fill-current" />
                {washerRunning} In-Use
              </span>
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">
                <CheckCircle2 className="w-3 h-3" />
                {washerIdle} Idle
              </span>
              {washerError > 0 && (
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 animate-pulse">
                  <AlertCircle className="w-3 h-3" />
                  {washerError} Error
                </span>
              )}

              {onAddMachine && (
                <button
                  onClick={() => onAddMachine("washer")}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
                >
                  <Plus className="w-3 h-3 text-msu" />
                  <span>Add Washer</span>
                </button>
              )}
            </div>
          </div>

          {/* Washer Cards Grid: Max 3 Columns on Desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
            {washers.map((w) => (
              <MachineCard
                key={w.id}
                machine={w}
                onCommand={onCommand}
                onEditParameters={onEditParameters}
              />
            ))}
          </div>
        </div>
      )}

      {/* SECTION 2: DRYER FLEET VIEW */}
      {(activeView === "segregated" || activeView === "dryers") && (
        <div className="space-y-3.5 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          {/* Header Ribbon with Dryer KPIs */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-cyan-100 text-cyan-700 flex items-center justify-center shrink-0">
                <Wind className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-800 leading-tight truncate">
                  Dryer Fleet
                </h3>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider truncate">
                  Commercial Gas Heated Dryers
                </p>
              </div>
            </div>

            {/* Dryer KPI Summary Ribbon */}
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
                Total: {dryers.length}
              </span>
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                <Play className="w-3 h-3 fill-current" />
                {dryerRunning} In-Use
              </span>
              <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">
                <CheckCircle2 className="w-3 h-3" />
                {dryerIdle} Idle
              </span>
              {dryerError > 0 && (
                <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 animate-pulse">
                  <AlertCircle className="w-3 h-3" />
                  {dryerError} Error
                </span>
              )}

              {onAddMachine && (
                <button
                  onClick={() => onAddMachine("dryer")}
                  className="flex items-center gap-1 px-2.5 py-0.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors"
                >
                  <Plus className="w-3 h-3 text-msu" />
                  <span>Add Dryer</span>
                </button>
              )}
            </div>
          </div>

          {/* Dryer Cards Grid: Max 3 Columns on Desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
            {dryers.map((d) => (
              <MachineCard
                key={d.id}
                machine={d}
                onCommand={onCommand}
                onEditParameters={onEditParameters}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
