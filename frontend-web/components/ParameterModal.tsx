"use client";

import React, { useState, useEffect } from "react";
import { Machine, MachineParameters, MaintenanceLogEntry, WaterLevel } from "@/types";
import {
  X,
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
  Wrench,
  CheckCircle2,
  FileText,
  Sliders,
  ShieldAlert,
} from "lucide-react";
import { addMaintenanceLog, getMaintenanceLogs } from "@/lib/api";

interface ParameterModalProps {
  machine: Machine | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (machineId: string, parameters: MachineParameters) => Promise<void>;
  onCommand?: (machineId: string, command: "start" | "pause" | "stop" | "unlock") => Promise<void>;
}

export function ParameterModal({
  machine,
  isOpen,
  onClose,
  onSave,
  onCommand,
}: ParameterModalProps) {
  const [activeTab, setActiveTab] = useState<"telemetry" | "parameters" | "diagnostics">("telemetry");
  const [params, setParams] = useState<MachineParameters | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmCmd, setConfirmCmd] = useState<"start" | "pause" | "stop" | "unlock" | null>(null);
  const [isCommandLoading, setIsCommandLoading] = useState(false);

  // Maintenance log state
  const [technicianName, setTechnicianName] = useState("Technician");
  const [actionNotes, setActionNotes] = useState("");
  const [isLogging, setIsLogging] = useState(false);
  const [maintenanceHistory, setMaintenanceHistory] = useState<MaintenanceLogEntry[]>([]);

  useEffect(() => {
    if (machine) {
      setParams({ ...machine.parameters });
      if (machine.status === "ERROR") {
        setActiveTab("diagnostics");
      } else {
        setActiveTab("telemetry");
      }
      loadLogs(machine.id);
    }
  }, [machine]);

  const loadLogs = async (machineId: string) => {
    const logs = await getMaintenanceLogs(machineId);
    setMaintenanceHistory(logs);
  };

  if (!isOpen || !machine || !params) return null;

  const isRunning = machine.status === "RUNNING";
  const isIdle = machine.status === "IDLE";
  const isError = machine.status === "ERROR";

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

  const handleCommandExec = async (cmd: "start" | "pause" | "stop" | "unlock") => {
    if (!onCommand) return;
    setIsCommandLoading(true);
    await onCommand(machine.id, cmd);
    setIsCommandLoading(false);
    setConfirmCmd(null);
  };

  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionNotes.trim()) return;
    setIsLogging(true);
    const newEntry: MaintenanceLogEntry = {
      id: `LOG-${Date.now().toString().slice(-4)}`,
      machine_id: machine.id,
      technician_name: technicianName || "Facilities Technician",
      action_taken: actionNotes,
      fault_code: machine.fault_code || "E01",
      timestamp: new Date().toISOString(),
    };
    await addMaintenanceLog(machine.id, newEntry);
    setActionNotes("");
    setIsLogging(false);
    await loadLogs(machine.id);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in duration-150 my-6">
        {/* Header Row per DESIGN.md 4.2 */}
        <div className="px-5 py-3.5 bg-msu text-white flex items-center justify-between border-b border-msu-dark">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-base font-semibold text-white leading-tight truncate">
              {machine.name}
            </h3>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white shrink-0">
              {machine.id}
            </span>
          </div>

          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-lg p-1 hover:bg-white/10 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Controls Bar */}
        <div className="grid grid-cols-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold p-1 gap-1">
          <button
            onClick={() => setActiveTab("telemetry")}
            className={`py-2 px-2.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "telemetry"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span className="truncate">Telemetry</span>
          </button>

          <button
            onClick={() => setActiveTab("parameters")}
            className={`py-2 px-2.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "parameters"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-slate-700 shrink-0" />
            <span className="truncate">Parameters</span>
          </button>

          <button
            onClick={() => setActiveTab("diagnostics")}
            className={`py-2 px-2.5 rounded-md transition-all flex items-center justify-center gap-1.5 ${
              activeTab === "diagnostics"
                ? "bg-white text-slate-900 shadow-xs border border-slate-200"
                : isError
                ? "text-red-700 font-bold"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Wrench className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <span className="truncate">Diagnostics {isError ? "(Fault)" : ""}</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 space-y-4 max-h-[calc(85vh-120px)] overflow-y-auto">
          {/* TAB 1: Real-Time Telemetry & Directives */}
          {activeTab === "telemetry" && (
            <div className="space-y-4">
              {/* Status Banner */}
              <div
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isRunning
                    ? "bg-blue-50 border-blue-200 text-blue-950"
                    : isError
                    ? "bg-red-50 border-red-200 text-red-950"
                    : "bg-slate-50 border-slate-200 text-slate-900"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      isRunning
                        ? "bg-blue-600 text-white"
                        : isIdle
                        ? "bg-green-600 text-white"
                        : "bg-red-600 text-white"
                    }`}
                  >
                    <Clock className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-medium uppercase tracking-wider text-slate-500 block">
                      Cycle Phase
                    </span>
                    <h4 className="text-base font-semibold text-slate-900 leading-snug truncate">
                      {isRunning ? `Phase: ${machine.phase || "Wash"}` : isError ? "Hardware Fault" : "Idle / Ready"}
                    </h4>
                    <p className="text-xs text-slate-500 truncate">
                      {machine.current_cycle || "Standby"}
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500 block">
                    Remaining
                  </span>
                  <p className="text-2xl font-extrabold text-slate-900 tracking-tight">
                    {remaining} <span className="text-xs font-medium text-slate-500">mins</span>
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              {isRunning && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-600 font-medium">
                    <span>Progress</span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Telemetry Sensor Grid: 2-column or 4-column */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-center">
                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-xs text-slate-500 uppercase tracking-wider block font-medium">Speed</span>
                  <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                    {machine.drum_rpm ?? (isRunning ? 800 : 0)} RPM
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-xs text-slate-500 uppercase tracking-wider block font-medium">Power</span>
                  <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                    {machine.power_w ? `${machine.power_w.toFixed(0)} W` : isRunning ? "1850 W" : "20 W"}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-xs text-slate-500 uppercase tracking-wider block font-medium">Water</span>
                  <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                    {machine.type === "washer" ? `${machine.water_l ?? 45} L` : "Gas"}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-xs text-slate-500 uppercase tracking-wider block font-medium">Door</span>
                  <span
                    className={`text-sm font-bold mt-0.5 block ${
                      machine.parameters.door_locked ? "text-green-700" : "text-amber-700"
                    }`}
                  >
                    {machine.parameters.door_locked ? "Locked" : "Unlocked"}
                  </span>
                </div>
              </div>

              {/* Directives Actions */}
              {onCommand && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <span className="text-xs font-semibold text-slate-800 uppercase tracking-wider block">
                    Remote Directives
                  </span>

                  {confirmCmd ? (
                    <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-amber-100 border border-amber-200">
                      <span className="text-xs font-semibold text-amber-800">
                        Confirm {confirmCmd}?
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isCommandLoading}
                          onClick={() => handleCommandExec(confirmCmd)}
                          className="px-2.5 py-1 bg-msu text-white text-xs font-semibold rounded-md hover:bg-msu-dark transition-colors"
                        >
                          Execute
                        </button>
                        <button
                          type="button"
                          disabled={isCommandLoading}
                          onClick={() => setConfirmCmd(null)}
                          className="px-2.5 py-1 bg-white text-slate-700 text-xs font-semibold rounded-md hover:bg-slate-100 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={isRunning || isError}
                        onClick={() => setConfirmCmd("start")}
                        className="flex-1 min-w-[70px] py-1.5 px-2.5 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 text-xs font-semibold disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Start</span>
                      </button>

                      <button
                        type="button"
                        disabled={!isRunning}
                        onClick={() => setConfirmCmd("pause")}
                        className="flex-1 min-w-[70px] py-1.5 px-2.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 text-xs font-semibold disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                      >
                        <Pause className="w-3.5 h-3.5 fill-current" />
                        <span>Pause</span>
                      </button>

                      <button
                        type="button"
                        disabled={!isRunning}
                        onClick={() => setConfirmCmd("stop")}
                        className="flex-1 min-w-[70px] py-1.5 px-2.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold disabled:opacity-40 transition-colors flex items-center justify-center gap-1"
                      >
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>Stop</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setConfirmCmd("unlock")}
                        className="flex-1 min-w-[70px] py-1.5 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-colors flex items-center justify-center gap-1"
                      >
                        <Unlock className="w-3.5 h-3.5" />
                        <span>Unlock</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Parameter Configuration Form (DESIGN.md 4.4) */}
          {activeTab === "parameters" && (
            <form onSubmit={handleSubmit} id="param-form" className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1 uppercase tracking-wider">
                    Cycle Price (RM)
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-xs font-semibold text-slate-500">
                      RM
                    </span>
                    <input
                      type="number"
                      step="0.5"
                      min="1.0"
                      max="30.0"
                      value={params.price}
                      onChange={(e) => setParams({ ...params, price: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-10 pr-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 focus:border-msu focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1 uppercase tracking-wider">
                    Cycle Duration (Mins)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="120"
                    step="5"
                    value={params.duration_mins}
                    onChange={(e) => setParams({ ...params, duration_mins: parseInt(e.target.value) || 30 })}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 focus:border-msu focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Temperature dropdown: Cold, 30°C, 40°C, 60°C per DESIGN.md 4.4 */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1 uppercase tracking-wider">
                  Temperature
                </label>
                <select
                  value={params.temp_celsius}
                  onChange={(e) => setParams({ ...params, temp_celsius: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 focus:border-msu focus:outline-none bg-white"
                >
                  <option value={25}>Cold (25°C)</option>
                  <option value={30}>30°C</option>
                  <option value={40}>40°C</option>
                  <option value={60}>60°C</option>
                  <option value={65}>65°C</option>
                </select>
              </div>

              {/* Water Level Segmented Control per DESIGN.md 4.4: Low, Medium, High */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1 uppercase tracking-wider">
                  Water Level
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["Low", "Medium", "High"] as WaterLevel[]).map((level) => (
                    <button
                      type="button"
                      key={level}
                      onClick={() => setParams({ ...params, water_level: level })}
                      className={`py-2 text-xs font-semibold rounded-lg transition-colors border ${
                        params.water_level === level
                          ? "bg-msu text-white border-msu"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Spin Speed Segmented Control per DESIGN.md 4.4: 400, 800, 1200 RPM */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1 uppercase tracking-wider">
                  Spin Speed
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[400, 800, 1200].map((rpm) => (
                    <button
                      type="button"
                      key={rpm}
                      onClick={() => setParams({ ...params, spin_speed: rpm })}
                      className={`py-2 text-xs font-semibold rounded-lg transition-colors border ${
                        params.spin_speed === rpm
                          ? "bg-msu text-white border-msu"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {rpm} RPM
                    </button>
                  ))}
                </div>
              </div>

              {/* Door Lock Override Switch per DESIGN.md 4.4 */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {params.door_locked ? <Lock className="w-4 h-4 text-green-600" /> : <Unlock className="w-4 h-4 text-amber-600" />}
                  <div>
                    <span className="text-xs font-semibold text-slate-800 block">Door Lock Override</span>
                    <span className="text-xs text-slate-500">
                      {params.door_locked ? "Locked" : "Unlocked"}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setParams({ ...params, door_locked: !params.door_locked })}
                  aria-pressed={params.door_locked}
                  className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors ${
                    params.door_locked ? "bg-green-600" : "bg-slate-300"
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-xs transform transition-transform ${
                      params.door_locked ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 px-4 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-9 px-4 rounded-lg bg-msu hover:bg-msu-dark text-white text-xs font-semibold transition-colors shadow-xs disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Save Parameters"}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: Diagnostic Fault Inspection & Service Logs */}
          {activeTab === "diagnostics" && (
            <div className="space-y-4">
              <div
                className={`p-3.5 rounded-xl border space-y-1.5 ${
                  isError
                    ? "bg-red-50 border-red-200 text-red-950"
                    : "bg-green-50 border-green-200 text-green-950"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-semibold text-xs">
                    {isError ? <ShieldAlert className="w-4 h-4 text-red-600" /> : <CheckCircle2 className="w-4 h-4 text-green-600" />}
                    <span>Diagnostic Status</span>
                  </div>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      isError ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                    }`}
                  >
                    {isError ? `Fault: ${machine.fault_code || "E01"}` : "Nominal"}
                  </span>
                </div>

                {isError ? (
                  <div className="space-y-1 text-xs">
                    <p><strong>Subsystem:</strong> {machine.fault_subsystem || "Intake Valve"}</p>
                    <p className="text-slate-700 bg-white p-2 rounded border border-red-200">
                      {machine.fault_remediation || "Inspect water valve pressure and clear intake filters."}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600">
                    All subsystem checks nominal. Motor, heating element, and door interlocks pass.
                  </p>
                )}
              </div>

              {/* Service Action Log Form */}
              <form onSubmit={handleAddLog} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <span className="text-xs font-semibold text-slate-800 block">
                  Log Service Action
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Technician ID
                    </label>
                    <input
                      type="text"
                      value={technicianName}
                      onChange={(e) => setTechnicianName(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 font-medium"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Target Fault
                    </label>
                    <input
                      type="text"
                      value={machine.fault_code || "Routine Service"}
                      readOnly
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-100 text-slate-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Action Taken
                  </label>
                  <textarea
                    rows={2}
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="Describe maintenance action..."
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 focus:border-msu focus:outline-none"
                    required
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isLogging}
                    className="h-8 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                  >
                    {isLogging ? "Saving..." : "Record Entry"}
                  </button>
                </div>
              </form>

              {/* History */}
              <div className="space-y-1.5">
                <h5 className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Service History ({maintenanceHistory.length})
                </h5>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {maintenanceHistory.map((log) => (
                    <div key={log.id} className="p-2 rounded-lg bg-white border border-slate-200 text-xs space-y-0.5">
                      <div className="flex items-center justify-between text-slate-500 text-[11px]">
                        <span className="font-semibold text-slate-800">{log.technician_name}</span>
                        <span>{new Date(log.timestamp).toLocaleDateString()}</span>
                      </div>
                      <p className="text-slate-700">{log.action_taken}</p>
                    </div>
                  ))}
                  {maintenanceHistory.length === 0 && (
                    <p className="p-2 text-center text-xs text-slate-400">
                      No service records logged.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
