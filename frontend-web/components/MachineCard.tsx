"use client";

import React, { useState } from "react";
import { Machine } from "@/types";
import {
  Play,
  Pause,
  Square,
  Sliders,
  Clock,
  Lock,
  Unlock,
  AlertCircle,
  Thermometer,
  Gauge,
} from "lucide-react";

interface MachineCardProps {
  machine: Machine;
  onCommand: (machineId: string, command: "start" | "pause" | "stop") => Promise<void>;
  onEditParameters: (machine: Machine) => void;
}

export function MachineCard({ machine, onCommand, onEditParameters }: MachineCardProps) {
  const [confirmCmd, setConfirmCmd] = useState<"start" | "pause" | "stop" | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isRunning = machine.status === "RUNNING";
  const isIdle = machine.status === "IDLE";
  const isError = machine.status === "ERROR";

  const handleAction = async (cmd: "start" | "pause" | "stop") => {
    setIsLoading(true);
    await onCommand(machine.id, cmd);
    setIsLoading(false);
    setConfirmCmd(null);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow overflow-hidden flex flex-col justify-between h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono truncate">
            {machine.id} • {machine.type.toUpperCase()}
          </span>
          <h4
            className="text-sm font-bold text-slate-900 leading-snug line-clamp-1 mt-0.5"
            title={machine.name}
          >
            {machine.name}
          </h4>
        </div>

        {/* Status Badge */}
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide ${
            isRunning
              ? "bg-blue-100 text-blue-700"
              : isIdle
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              isRunning ? "bg-blue-500 animate-ping" : isIdle ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          <span className="truncate">{machine.status}</span>
        </span>
      </div>

      {/* Body: Countdown & Parameters */}
      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
        {/* Remaining Time Banner */}
        <div
          className={`p-3 rounded-lg flex items-center justify-between gap-2 ${
            isRunning
              ? "bg-blue-50/70 border border-blue-100 text-blue-900"
              : "bg-slate-50 border border-slate-100 text-slate-600"
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Clock
              className={`w-4 h-4 shrink-0 ${
                isRunning ? "text-blue-600 animate-spin" : "text-slate-400"
              }`}
            />
            <div className="min-w-0 flex-1">
              <span className="block text-xs font-semibold truncate leading-tight">
                {isRunning
                  ? "Cycle in Progress"
                  : isError
                  ? "Service Required"
                  : "Ready for Load"}
              </span>
              <p
                className="text-[11px] text-slate-500 truncate leading-tight mt-0.5"
                title={machine.current_cycle || "Idle / Available"}
              >
                {machine.current_cycle || "Idle / Available"}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xl font-extrabold font-mono tracking-tight text-slate-900">
              {machine.remaining_time ?? 0}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 ml-1">mins</span>
          </div>
        </div>

        {/* Operating Parameter Badges Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Price */}
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 text-slate-700 border border-slate-100 min-w-0">
            <span className="text-[10px] font-bold text-slate-400 shrink-0">RM</span>
            <span className="font-bold text-msu font-mono truncate">
              {(machine.parameters?.price ?? 6.0).toFixed(2)}
            </span>
          </div>

          {/* Temperature */}
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 text-slate-700 border border-slate-100 min-w-0">
            <Thermometer className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-semibold truncate">
              {machine.parameters?.temp_celsius ?? 40}°C
            </span>
          </div>

          {/* Spin Speed */}
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 text-slate-700 border border-slate-100 min-w-0">
            <Gauge className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-semibold truncate">
              {machine.parameters?.spin_speed ?? 800} RPM
            </span>
          </div>

          {/* Door Status */}
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 text-slate-700 border border-slate-100 min-w-0">
            {machine.parameters?.door_locked ? (
              <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            ) : (
              <Unlock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            )}
            <span className="font-semibold truncate">
              {machine.parameters?.door_locked ? "Locked" : "Unlocked"}
            </span>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="p-3 bg-slate-50 border-t border-slate-100">
        {confirmCmd ? (
          <div className="flex items-center justify-between gap-2 p-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs min-w-0">
            <div className="flex items-center gap-1 text-amber-800 font-semibold min-w-0 flex-1 truncate">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{confirmCmd.toUpperCase()}?</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                disabled={isLoading}
                onClick={() => handleAction(confirmCmd)}
                className="px-2.5 py-1 bg-msu text-white text-[11px] font-bold rounded shadow-xs hover:bg-msu-dark disabled:opacity-50 transition-colors"
              >
                Yes
              </button>
              <button
                disabled={isLoading}
                onClick={() => setConfirmCmd(null)}
                className="px-2 py-1 text-slate-600 text-[11px] font-semibold hover:bg-white rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            {/* Quick Commands */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                disabled={isRunning || isError}
                onClick={() => setConfirmCmd("start")}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-emerald-600 hover:bg-emerald-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Start Cycle"
                aria-label={`Start cycle on ${machine.name}`}
              >
                <Play className="w-3.5 h-3.5 fill-current" />
              </button>
              <button
                disabled={!isRunning}
                onClick={() => setConfirmCmd("pause")}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-amber-600 hover:bg-amber-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Pause Cycle"
                aria-label={`Pause cycle on ${machine.name}`}
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
              </button>
              <button
                disabled={!isRunning}
                onClick={() => setConfirmCmd("stop")}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Emergency Stop"
                aria-label={`Stop cycle on ${machine.name}`}
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            </div>

            {/* Edit Parameters Button */}
            <button
              onClick={() => onEditParameters(machine)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors shrink-0"
              aria-label={`Configure parameters for ${machine.name}`}
            >
              <Sliders className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>Configure</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
