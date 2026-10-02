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
  Droplet,
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
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow overflow-hidden flex flex-col justify-between">
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex items-start justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
            {machine.id} • {machine.type.toUpperCase()}
          </span>
          <h4 className="text-sm font-bold text-slate-900 leading-snug">{machine.name}</h4>
        </div>
        {/* Status Badge */}
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${
            isRunning
              ? "bg-blue-100 text-blue-700"
              : isIdle
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isRunning ? "bg-blue-500 animate-ping" : isIdle ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          {machine.status}
        </span>
      </div>

      {/* Body: Countdown & Parameters */}
      <div className="p-4 space-y-3.5 flex-1">
        {/* Remaining Time Banner */}
        <div
          className={`p-3 rounded-lg flex items-center justify-between ${
            isRunning ? "bg-blue-50/70 border border-blue-100 text-blue-900" : "bg-slate-50 border border-slate-100 text-slate-600"
          }`}
        >
          <div className="flex items-center gap-2">
            <Clock className={`w-4 h-4 ${isRunning ? "text-blue-600 animate-spin" : "text-slate-400"}`} />
            <div>
              <span className="text-xs font-semibold">
                {isRunning ? "Cycle in Progress" : isError ? "Service Required" : "Ready for Load"}
              </span>
              <p className="text-[11px] text-slate-500 truncate max-w-[170px]">
                {machine.current_cycle || "Idle / Available"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xl font-extrabold font-mono tracking-tight text-slate-900">
              {machine.remaining_time}
            </span>
            <span className="text-[11px] font-semibold text-slate-500 ml-1">mins</span>
          </div>
        </div>

        {/* Operating Parameter Badges */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 text-slate-700 border border-slate-100">
            <span className="text-[10px] font-bold text-slate-400">PRICE:</span>
            <span className="font-bold text-msu font-mono">RM {(machine.parameters?.price ?? 6.0).toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 text-slate-700 border border-slate-100">
            <Thermometer className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold">{machine.parameters?.temp_celsius ?? 40}°C</span>
          </div>
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 text-slate-700 border border-slate-100">
            <Gauge className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold">{machine.parameters?.spin_speed ?? 800} RPM</span>
          </div>
          <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-50 text-slate-700 border border-slate-100">
            {machine.parameters?.door_locked ? (
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Unlock className="w-3.5 h-3.5 text-amber-600" />
            )}
            <span className="font-semibold">
              {machine.parameters?.door_locked ? "Locked" : "Unlocked"}
            </span>
          </div>
        </div>
      </div>

      {/* Two-step Confirmation Prompt or Normal Action Footer */}
      <div className="p-3 bg-slate-50 border-t border-slate-100">
        {confirmCmd ? (
          <div className="flex items-center justify-between gap-2 p-1.5 bg-amber-50 border border-amber-200 rounded-lg text-xs">
            <div className="flex items-center gap-1.5 text-amber-800 font-semibold">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>Confirm {confirmCmd.toUpperCase()}?</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                disabled={isLoading}
                onClick={() => handleAction(confirmCmd)}
                className="px-2.5 py-1 bg-msu text-white text-[11px] font-bold rounded shadow-xs hover:bg-msu-dark disabled:opacity-50"
              >
                Yes
              </button>
              <button
                disabled={isLoading}
                onClick={() => setConfirmCmd(null)}
                className="px-2 py-1 text-slate-600 text-[11px] font-semibold hover:bg-white rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-1.5">
            {/* Quick Commands */}
            <div className="flex items-center gap-1">
              <button
                disabled={isRunning || isError}
                onClick={() => setConfirmCmd("start")}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-emerald-600 hover:bg-emerald-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Start Cycle"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
              </button>
              <button
                disabled={!isRunning}
                onClick={() => setConfirmCmd("pause")}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-amber-600 hover:bg-amber-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Pause Cycle"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
              </button>
              <button
                disabled={!isRunning}
                onClick={() => setConfirmCmd("stop")}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Emergency Stop"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            </div>

            {/* Edit Parameters Button */}
            <button
              onClick={() => onEditParameters(machine)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
            >
              <Sliders className="w-3.5 h-3.5 text-slate-500" />
              <span>Configure</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
