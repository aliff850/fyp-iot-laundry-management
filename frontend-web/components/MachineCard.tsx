"use client";

import React, { useState } from "react";
import { Machine } from "@/types";
import { Play, Pause, Square, AlertCircle, Clock, Thermometer, Gauge, DollarSign, Lock, Unlock } from "lucide-react";

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

  const handleAction = async (cmd: "start" | "pause" | "stop", e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsLoading(true);
    await onCommand(machine.id, cmd);
    setIsLoading(false);
    setConfirmCmd(null);
  };

  return (
    <div
      onClick={() => onEditParameters(machine)}
      className="bg-white rounded-2xl border-2 border-slate-300 hover:border-msu shadow-xs hover:shadow-md cursor-pointer transition-all duration-150 p-4 flex flex-col justify-between h-full select-none"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEditParameters(machine);
        }
      }}
      aria-label={`Open machine parameters and controls for ${machine.id}`}
    >
      <div className="space-y-2">
        {/* Machine ID */}
        <div className="p-2.5 rounded-xl bg-slate-900 border-2 border-slate-950 text-center font-mono font-black text-xl text-white tracking-wide">
          {machine.id}
        </div>

        {/* FOCAL POINT 1: Status */}
        <div
          className={`p-2.5 rounded-xl border-2 text-center font-mono font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 ${
            isRunning
              ? "bg-blue-100 border-blue-500 text-blue-900"
              : isIdle
              ? "bg-emerald-100 border-emerald-500 text-emerald-900"
              : "bg-red-100 border-red-500 text-red-900"
          }`}
        >
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isRunning ? "bg-blue-600 animate-ping" : isIdle ? "bg-emerald-600" : "bg-red-600"
            }`}
          />
          <span>{machine.status}</span>
        </div>

        {/* FOCAL POINT 2: Cycle Time (Hero Metric) */}
        <div
          className={`p-3.5 rounded-xl border-2 flex flex-col items-center justify-center text-center ${
            isRunning
              ? "bg-blue-50/70 border-blue-300 text-blue-950"
              : "bg-slate-50 border-slate-200 text-slate-800"
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-500 uppercase tracking-wider">
            <Clock className={`w-3.5 h-3.5 ${isRunning ? "text-blue-600 animate-spin" : "text-slate-400"}`} />
            <span>Cycle Time</span>
          </div>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-slate-950">
              {machine.remaining_time ?? 0}
            </span>
            <span className="text-xs font-bold font-mono text-slate-500">mins</span>
          </div>
        </div>

        {/* MINOR DETAILS: Price, Temp, Speed, Door (Compact, Small Labels) */}
        <div className="space-y-1.5 pt-1">
          {/* Price */}
          <div className="py-1.5 px-3 rounded-lg bg-amber-50/70 border border-amber-200 flex items-center justify-between text-xs font-mono">
            <span className="flex items-center gap-1.5 text-[11px] text-amber-800 font-bold uppercase">
              <DollarSign className="w-3 h-3 text-amber-600" />
              Price
            </span>
            <span className="font-bold text-amber-950 text-xs">
              RM {(machine.parameters?.price ?? 6.0).toFixed(2)}
            </span>
          </div>

          {/* Temperature */}
          <div className="py-1.5 px-3 rounded-lg bg-orange-50/70 border border-orange-200 flex items-center justify-between text-xs font-mono">
            <span className="flex items-center gap-1.5 text-[11px] text-orange-800 font-bold uppercase">
              <Thermometer className="w-3 h-3 text-orange-600" />
              Temp
            </span>
            <span className="font-bold text-orange-950 text-xs">
              {machine.parameters?.temp_celsius ?? 40}°C
            </span>
          </div>

          {/* Speed */}
          <div className="py-1.5 px-3 rounded-lg bg-cyan-50/70 border border-cyan-200 flex items-center justify-between text-xs font-mono">
            <span className="flex items-center gap-1.5 text-[11px] text-cyan-800 font-bold uppercase">
              <Gauge className="w-3 h-3 text-cyan-600" />
              Speed
            </span>
            <span className="font-bold text-cyan-950 text-xs">
              {machine.parameters?.spin_speed ?? 800} RPM
            </span>
          </div>

          {/* Door Lock */}
          <div
            className={`py-1.5 px-3 rounded-lg border flex items-center justify-between text-xs font-mono ${
              machine.parameters?.door_locked
                ? "bg-emerald-50/70 border-emerald-200 text-emerald-950"
                : "bg-amber-50/70 border-amber-200 text-amber-950"
            }`}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase">
              {machine.parameters?.door_locked ? (
                <Lock className="w-3 h-3 text-emerald-600" />
              ) : (
                <Unlock className="w-3 h-3 text-amber-600" />
              )}
              Door
            </span>
            <span className="font-bold text-xs">
              {machine.parameters?.door_locked ? "Locked" : "Unlocked"}
            </span>
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div
        className="mt-3 pt-3 border-t-2 border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {confirmCmd ? (
          <div className="flex items-center justify-between gap-2 p-1.5 bg-amber-50 border-2 border-amber-300 rounded-xl text-xs">
            <div className="flex items-center gap-1 text-amber-950 font-bold font-mono">
              <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span>{confirmCmd.toUpperCase()}?</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={isLoading}
                onClick={(e) => handleAction(confirmCmd, e)}
                className="px-3 py-1 bg-msu text-white text-xs font-bold rounded-lg hover:bg-msu-dark disabled:opacity-50 transition-colors font-mono"
              >
                Confirm
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmCmd(null);
                }}
                className="px-2 py-1 text-slate-600 text-xs font-semibold hover:bg-white rounded-lg transition-colors font-mono"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={isRunning || machine.status === "ERROR"}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmCmd("start");
              }}
              className="flex-1 py-2 rounded-xl border-2 border-emerald-400 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center shadow-2xs"
              title="Start Cycle"
              aria-label={`Start cycle on ${machine.id}`}
            >
              <Play className="w-4 h-4 fill-current" />
            </button>
            <button
              type="button"
              disabled={!isRunning}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmCmd("pause");
              }}
              className="flex-1 py-2 rounded-xl border-2 border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:border-amber-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center shadow-2xs"
              title="Pause Cycle"
              aria-label={`Pause cycle on ${machine.id}`}
            >
              <Pause className="w-4 h-4 fill-current" />
            </button>
            <button
              type="button"
              disabled={!isRunning}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmCmd("stop");
              }}
              className="flex-1 py-2 rounded-xl border-2 border-red-400 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center shadow-2xs"
              title="Emergency Stop"
              aria-label={`Stop cycle on ${machine.id}`}
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
