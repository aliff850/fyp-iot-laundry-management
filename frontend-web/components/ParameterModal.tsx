"use client";

import React, { useState, useEffect } from "react";
import { Machine, MachineParameters, WaterLevel } from "@/types";
import { X, Sliders, Lock, Unlock, DollarSign, Clock, Thermometer, Droplet, Gauge } from "lucide-react";

interface ParameterModalProps {
  machine: Machine | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (machineId: string, parameters: MachineParameters) => Promise<void>;
}

export function ParameterModal({ machine, isOpen, onClose, onSave }: ParameterModalProps) {
  const [params, setParams] = useState<MachineParameters | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (machine) {
      setParams({ ...machine.parameters });
    }
  }, [machine]);

  if (!isOpen || !machine || !params) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    await onSave(machine.id, params);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-msu text-white flex items-center justify-between border-b border-msu-dark">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-msu-gold" />
            <div>
              <h3 className="text-base font-bold leading-tight">Configure Machine Parameters</h3>
              <p className="text-xs text-white/80">{machine.name} ({machine.id})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white rounded-lg p-1 transition-colors"
            aria-label="Close configuration modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Price & Duration Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                Cycle Price (MYR)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-bold text-slate-400">
                  RM
                </span>
                <input
                  type="number"
                  step="0.5"
                  min="1.0"
                  max="30.0"
                  value={params.price}
                  onChange={(e) => setParams({ ...params, price: parseFloat(e.target.value) || 0 })}
                  className="w-full pl-10 pr-3 py-2 text-sm font-semibold rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Cycle Duration
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="10"
                  max="120"
                  step="5"
                  value={params.duration_mins}
                  onChange={(e) => setParams({ ...params, duration_mins: parseInt(e.target.value) || 30 })}
                  className="w-full pl-3 pr-12 py-2 text-sm font-semibold rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none"
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
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <Thermometer className="w-3.5 h-3.5 text-slate-400" />
              Operating Temperature (°C)
            </label>
            <select
              aria-label="Operating Temperature"
              value={params.temp_celsius}
              onChange={(e) => setParams({ ...params, temp_celsius: parseInt(e.target.value) })}
              className="w-full px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none bg-white"
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
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <Droplet className="w-3.5 h-3.5 text-slate-400" />
              Water Level Preset
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["Low", "Medium", "High"] as WaterLevel[]).map((level) => (
                <button
                  type="button"
                  key={level}
                  onClick={() => setParams({ ...params, water_level: level })}
                  className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                    params.water_level === level
                      ? "bg-msu text-white border-msu shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {/* Spin Speed (RPM) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-slate-400" />
              Spin Speed (RPM)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[400, 800, 1200].map((rpm) => (
                <button
                  type="button"
                  key={rpm}
                  onClick={() => setParams({ ...params, spin_speed: rpm })}
                  className={`py-2 text-xs font-semibold rounded-lg border transition-all ${
                    params.spin_speed === rpm
                      ? "bg-msu text-white border-msu shadow-xs"
                      : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {rpm} RPM
                </button>
              ))}
            </div>
          </div>

          {/* Door Lock Override Toggle */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {params.door_locked ? (
                <Lock className="w-4 h-4 text-emerald-600" />
              ) : (
                <Unlock className="w-4 h-4 text-amber-600" />
              )}
              <div>
                <span className="text-xs font-semibold text-slate-800">Remote Door Safety Lock</span>
                <p className="text-[11px] text-slate-500">Lock latch during cycles to prevent spills</p>
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

          {/* Footer Action Buttons */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-msu hover:bg-msu-dark rounded-lg transition-colors shadow-xs disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save Parameters"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
