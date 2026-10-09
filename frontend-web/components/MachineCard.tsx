"use client";

import React, { useState } from "react";
import { Machine, MachineStatus } from "@/types";
import {
  Play,
  Pause,
  Square,
  AlertCircle,
  Lock,
  Unlock,
  WashingMachine,
  Wind,
  SlidersHorizontal,
} from "lucide-react";

type Command = "start" | "pause" | "stop" | "unlock";

interface MachineCardProps {
  machine: Machine;
  onCommand: (machineId: string, command: Command) => Promise<void>;
  onEditParameters: (machine: Machine) => void;
}

const STATUS_STYLES: Record<MachineStatus, { badge: string; dot: string; bar: string; label: string }> = {
  IDLE: { badge: "bg-green-100 text-green-700", dot: "bg-green-500", bar: "bg-green-500", label: "Idle" },
  RUNNING: { badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500 animate-pulse", bar: "bg-blue-500", label: "Running" },
  PAUSED: { badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500", bar: "bg-amber-500", label: "Paused" },
  ERROR: { badge: "bg-red-100 text-red-700", dot: "bg-red-500", bar: "bg-red-500", label: "Error" },
  OFFLINE: { badge: "bg-slate-100 text-slate-600", dot: "bg-slate-400", bar: "bg-slate-400", label: "Offline" },
};

export function MachineCard({ machine, onCommand, onEditParameters }: MachineCardProps) {
  const [confirmCmd, setConfirmCmd] = useState<Command | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isRunning = machine.status === "RUNNING";
  const isPaused = machine.status === "PAUSED";
  const isError = machine.status === "ERROR";
  const isOffline = machine.status === "OFFLINE";

  const totalDuration = machine.parameters?.duration_mins || 30;
  const remaining = machine.remaining_time ?? 0;
  const progressPercent =
    isRunning || isPaused
      ? Math.min(100, Math.max(0, Math.round(((totalDuration - remaining) / totalDuration) * 100)))
      : 0;

  const status = STATUS_STYLES[machine.status] ?? STATUS_STYLES.IDLE;
  const label = machine.name || machine.id;
  const doorLocked = !!machine.parameters?.door_locked;

  const handleAction = async (cmd: Command, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIsLoading(true);
    await onCommand(machine.id, cmd);
    setIsLoading(false);
    setConfirmCmd(null);
  };

  const ask = (cmd: Command) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmCmd(cmd);
  };

  const actionBase =
    "flex-1 min-w-0 py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div
      onClick={() => onEditParameters(machine)}
      className="bg-white rounded-xl border border-slate-200 hover:border-msu-border shadow-xs hover:shadow-md cursor-pointer transition-all p-4 flex flex-col justify-between gap-4 h-full select-none"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onEditParameters(machine);
        }
      }}
      aria-label={`Open parameters for ${label}`}
    >
      <div className="space-y-4">
        {/* Header: label + status */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              {machine.type === "washer" ? <WashingMachine className="w-4 h-4" /> : <Wind className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <h4 className="truncate text-base font-semibold text-slate-800 leading-tight">{label}</h4>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                {machine.capacity_kg ?? 15} kg
              </p>
            </div>
          </div>

          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${status.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
        </div>

        {/* Remaining time bar */}
        <div className="space-y-2">
          {isError ? (
            <div className="flex items-center gap-2 text-red-700 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="truncate text-sm font-semibold">Fault {machine.fault_code || "E-01"}</span>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <p className="text-3xl font-extrabold text-slate-900 tracking-tight">
                  {isRunning || isPaused ? remaining : "--"}
                  <span className="ml-1 text-xs font-medium text-slate-500">min left</span>
                </p>
                {(isRunning || isPaused) && (
                  <span className="truncate text-xs font-medium text-slate-500">
                    {machine.phase || "Cycle"} · {progressPercent}%
                  </span>
                )}
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${status.bar}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </>
          )}
        </div>

        {/* Parameter badges: 2-column grid */}
        <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
          <span className="truncate px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
            RM {(machine.parameters?.price ?? 6).toFixed(2)}
          </span>
          <span className="truncate px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
            {machine.parameters?.temp_celsius ?? 40}°C
          </span>
          <span className="truncate px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
            {machine.parameters?.spin_speed ?? 800} RPM
          </span>
          <span
            className={`inline-flex items-center gap-1 truncate px-2.5 py-1 rounded-full ${
              doorLocked ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {doorLocked ? <Lock className="w-3 h-3 shrink-0" /> : <Unlock className="w-3 h-3 shrink-0" />}
            {doorLocked ? "Locked" : "Unlocked"}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 pt-4 border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
        {confirmCmd ? (
          <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-amber-100 rounded-lg">
            <span className="text-xs font-semibold text-amber-700 capitalize">{confirmCmd} cycle?</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isLoading}
                onClick={(e) => handleAction(confirmCmd, e)}
                className="px-3 py-1.5 bg-msu text-white text-xs font-semibold rounded-lg hover:bg-msu-dark transition-colors"
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
                className="px-3 py-1.5 text-slate-700 text-xs font-semibold hover:bg-white rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isRunning || isError || isOffline}
                onClick={ask("start")}
                className={`${actionBase} bg-green-100 text-green-700 hover:bg-green-200`}
                aria-label={`Start ${label}`}
              >
                <Play className="w-3.5 h-3.5 fill-current shrink-0" />
                <span className="truncate">Start</span>
              </button>
              <button
                type="button"
                disabled={!isRunning}
                onClick={ask("pause")}
                className={`${actionBase} bg-amber-100 text-amber-700 hover:bg-amber-200`}
                aria-label={`Pause ${label}`}
              >
                <Pause className="w-3.5 h-3.5 fill-current shrink-0" />
                <span className="truncate">Pause</span>
              </button>
              <button
                type="button"
                disabled={!isRunning && !isPaused}
                onClick={ask("stop")}
                className={`${actionBase} bg-red-100 text-red-700 hover:bg-red-200`}
                aria-label={`Stop ${label}`}
              >
                <Square className="w-3.5 h-3.5 fill-current shrink-0" />
                <span className="truncate">Stop</span>
              </button>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditParameters(machine);
              }}
              className="w-full py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              Edit Parameters
            </button>
          </>
        )}
      </div>
    </div>
  );
}
