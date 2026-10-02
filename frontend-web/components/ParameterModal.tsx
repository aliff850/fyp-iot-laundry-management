"use client";

import React, { useState, useEffect } from "react";
import { Machine, MachineParameters, WaterLevel } from "@/types";
import {
  X,
  Sliders,
  Lock,
  Unlock,
  DollarSign,
  Clock,
  Thermometer,
  Droplet,
  Gauge,
  Play,
  Pause,
  Square,
  AlertCircle,
  Activity,
  Zap,
  CheckCircle2,
} from "lucide-react";

interface ParameterModalProps {
  machine: Machine | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (machineId: string, parameters: MachineParameters) => Promise<void>;
  onCommand?: (machineId: string, command: "start" | "pause" | "stop") => Promise<void>;
}

export function ParameterModal({
  machine,
  isOpen,
  onClose,
  onSave,
  onCommand,
}: ParameterModalProps) {
  const [params, setParams] = useState<MachineParameters | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmCmd, setConfirmCmd] = useState<"start" | "pause" | "stop" | null>(null);
  const [isCommandLoading, setIsCommandLoading] = useState(false);

  useEffect(() => {
    if (machine) {
      setParams({ ...machine.parameters });
    }
  }, [machine]);

  if (!isOpen || !machine || !params) return null;

  const isRunning = machine.status === "RUNNING";
  const isIdle = machine.status === "IDLE";
  const isError = machine.status === "ERROR";

  // Calculate simulated cycle progress
  const totalDuration = params.duration_mins || 30;
  const remaining = machine.remaining_time ?? 0;
  const progressPercent = isRunning
    ? Math.min(100, Math.max(5, Math.round(((totalDuration - remaining) / totalDuration) * 100)))
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onSave(machine.id, params);
    setIsSubmitting(false);
    onClose();
  };

  const handleCommandExec = async (cmd: "start" | "pause" | "stop") => {
    if (!onCommand) return;
    setIsCommandLoading(true);
    await onCommand(machine.id, cmd);
    setIsCommandLoading(false);
    setConfirmCmd(null);
  };

  // Clean name without 'Hippo Laundry'
  const displayName = machine.name.replace(/Hippo Laundry\s*/gi, "").trim();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl border-2 border-slate-400 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
        {/* Simplified Clean Header: Washer Name + Codename */}
        <div className="px-5 sm:px-6 py-4 bg-msu text-white flex items-center justify-between border-b-2 border-msu-dark">
          <div className="flex items-center gap-2.5">
            <h3 className="text-lg font-black tracking-tight text-white leading-tight">
              {displayName}
            </h3>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-white/20 text-amber-200 border border-white/20">
              {machine.id}
            </span>
          </div>

          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-lg p-1.5 hover:bg-white/10 transition-colors"
            aria-label="Close machine details modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 space-y-5 max-h-[calc(85vh-120px)] overflow-y-auto">
          {/* Live Status & Cycle Control Banner */}
          <div
            className={`p-4 rounded-xl border-2 transition-all ${
              isRunning
                ? "bg-blue-50 border-blue-300 text-blue-950"
                : isError
                ? "bg-red-50 border-red-300 text-red-950"
                : "bg-slate-50 border-slate-300 text-slate-900"
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${
                    isRunning
                      ? "bg-blue-600 text-white border-blue-700"
                      : isIdle
                      ? "bg-emerald-600 text-white border-emerald-700"
                      : "bg-red-600 text-white border-red-700"
                  }`}
                >
                  <Clock className={`w-6 h-6 ${isRunning ? "animate-spin" : ""}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">
                      Current Machine State
                    </span>
                  </div>
                  <h4 className="text-lg font-black text-slate-900 leading-snug">
                    {isRunning ? "Cycle Active" : isError ? "Hardware Fault Detected" : "Machine Available"}
                  </h4>
                  <p className="text-xs font-medium text-slate-600">
                    {machine.current_cycle || "Ready for customer load"}
                  </p>
                </div>
              </div>

              <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-500 block">
                  Remaining Time
                </span>
                <div className="flex items-baseline gap-1 sm:justify-end">
                  <span className="text-3xl font-black font-mono text-slate-950">
                    {remaining}
                  </span>
                  <span className="text-xs font-bold text-slate-600 uppercase font-mono">mins</span>
                </div>
              </div>
            </div>

            {/* Cycle Progress Bar */}
            {isRunning && (
              <div className="mt-4 pt-3 border-t border-blue-200/60">
                <div className="flex items-center justify-between text-[11px] font-mono font-bold text-blue-900 mb-1">
                  <span>Cycle Progress</span>
                  <span>{progressPercent}% Complete</span>
                </div>
                <div className="w-full bg-blue-200/60 rounded-full h-2.5 overflow-hidden border border-blue-300">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Remote Command Actions */}
            {onCommand && (
              <div className="mt-4 pt-3 border-t border-slate-300/80">
                {confirmCmd ? (
                  <div className="flex items-center justify-between gap-3 p-2 rounded-lg bg-amber-100 border border-amber-300">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-950 font-mono">
                      <AlertCircle className="w-4 h-4 text-amber-700" />
                      <span>Confirm {confirmCmd.toUpperCase()} command on {machine.id}?</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isCommandLoading}
                        onClick={() => handleCommandExec(confirmCmd)}
                        className="px-3 py-1 bg-msu text-white text-xs font-bold rounded-lg hover:bg-msu-dark disabled:opacity-50 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        disabled={isCommandLoading}
                        onClick={() => setConfirmCmd(null)}
                        className="px-2.5 py-1 bg-white text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-600">
                      Remote Controls:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isRunning || isError}
                        onClick={() => setConfirmCmd("start")}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-emerald-500 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Start</span>
                      </button>
                      <button
                        type="button"
                        disabled={!isRunning}
                        onClick={() => setConfirmCmd("pause")}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-amber-500 bg-amber-50 text-amber-800 hover:bg-amber-100 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        <Pause className="w-3.5 h-3.5 fill-current" />
                        <span>Pause</span>
                      </button>
                      <button
                        type="button"
                        disabled={!isRunning}
                        onClick={() => setConfirmCmd("stop")}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-red-500 bg-red-50 text-red-800 hover:bg-red-100 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>Stop</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Operating Parameters Configuration Form */}
          <form onSubmit={handleSubmit} id="parameter-form" className="space-y-4">
            <div className="pb-1 border-b-2 border-slate-200">
              <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-800">
                Machine Parameters Configuration
              </h4>
            </div>

            {/* Price & Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1 font-mono uppercase">
                  <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                  Cycle Price (MYR)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400 font-mono">
                    RM
                  </span>
                  <input
                    type="number"
                    step="0.5"
                    min="1.0"
                    max="30.0"
                    value={params.price}
                    onChange={(e) => setParams({ ...params, price: parseFloat(e.target.value) || 0 })}
                    className="w-full pl-10 pr-3 py-2 text-sm font-semibold rounded-lg border-2 border-slate-300 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1 font-mono uppercase">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Cycle Duration (Mins)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="10"
                    max="120"
                    step="5"
                    value={params.duration_mins}
                    onChange={(e) => setParams({ ...params, duration_mins: parseInt(e.target.value) || 30 })}
                    className="w-full pl-3 pr-12 py-2 text-sm font-semibold rounded-lg border-2 border-slate-300 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none"
                    required
                  />
                  <span className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs font-medium text-slate-400">
                    mins
                  </span>
                </div>
              </div>
            </div>

            {/* Temperature Setting */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1 font-mono uppercase">
                <Thermometer className="w-3.5 h-3.5 text-slate-400" />
                Target Temperature
              </label>
              <select
                aria-label="Operating Temperature"
                value={params.temp_celsius}
                onChange={(e) => setParams({ ...params, temp_celsius: parseInt(e.target.value) })}
                className="w-full px-3 py-2 text-sm font-medium rounded-lg border-2 border-slate-300 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none bg-white font-mono"
              >
                <option value={25}>Cold / Tap Water (25°C)</option>
                <option value={30}>Eco Warm (30°C)</option>
                <option value={40}>Standard Warm (40°C)</option>
                <option value={50}>High Heat (50°C)</option>
                <option value={60}>Sanitize / Bedding (60°C)</option>
                <option value={65}>Dryer Express (65°C)</option>
              </select>
            </div>

            {/* Water Level (For Washers) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1 font-mono uppercase">
                <Droplet className="w-3.5 h-3.5 text-slate-400" />
                Water Level Preset
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["Low", "Medium", "High"] as WaterLevel[]).map((level) => (
                  <button
                    type="button"
                    key={level}
                    onClick={() => setParams({ ...params, water_level: level })}
                    className={`py-2 text-xs font-bold rounded-lg border-2 transition-all ${
                      params.water_level === level
                        ? "bg-msu text-white border-msu shadow-xs"
                        : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Spin Speed (RPM) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1 font-mono uppercase">
                <Gauge className="w-3.5 h-3.5 text-slate-400" />
                Drum Spin Speed
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[400, 800, 1200].map((rpm) => (
                  <button
                    type="button"
                    key={rpm}
                    onClick={() => setParams({ ...params, spin_speed: rpm })}
                    className={`py-2 text-xs font-bold rounded-lg border-2 transition-all font-mono ${
                      params.spin_speed === rpm
                        ? "bg-msu text-white border-msu shadow-xs"
                        : "bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100"
                    }`}
                  >
                    {rpm} RPM
                  </button>
                ))}
              </div>
            </div>

            {/* Door Lock Override Toggle */}
            <div className="p-3.5 rounded-xl bg-slate-50 border-2 border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {params.door_locked ? (
                  <Lock className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Unlock className="w-4 h-4 text-amber-600" />
                )}
                <div>
                  <span className="text-xs font-bold text-slate-800 block">Remote Door Latch Lock</span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {params.door_locked ? "Engaged (Cycle Protected)" : "Disengaged (Door Openable)"}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setParams({ ...params, door_locked: !params.door_locked })}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                  params.door_locked ? "bg-emerald-600" : "bg-slate-300"
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    params.door_locked ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </form>

          {/* Diagnostics Strip */}
          <div className="grid grid-cols-3 gap-2.5 pt-2">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <span className="text-[10px] font-mono uppercase text-slate-400 block">Est. Power</span>
              <span className="text-xs font-bold text-slate-800 font-mono mt-0.5 block">
                {isRunning ? "1.85 kW" : "0.04 kW"}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <span className="text-[10px] font-mono uppercase text-slate-400 block">Cycle Water</span>
              <span className="text-xs font-bold text-slate-800 font-mono mt-0.5 block">
                {machine.type === "washer" ? "45 Liters" : "Gas Heated"}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
              <span className="text-[10px] font-mono uppercase text-slate-400 block">Fleet Protocol</span>
              <span className="text-xs font-bold text-emerald-700 font-mono mt-0.5 block">
                Hippo v2.4
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t-2 border-slate-200 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors font-mono"
          >
            Close
          </button>
          <button
            type="submit"
            form="parameter-form"
            disabled={isSubmitting}
            className="px-5 py-2.5 text-xs font-black text-white bg-msu hover:bg-msu-dark rounded-xl transition-all shadow-xs disabled:opacity-50 font-mono uppercase tracking-wider"
          >
            {isSubmitting ? "Saving Parameters..." : "Save Parameters"}
          </button>
        </div>
      </div>
    </div>
  );
}
