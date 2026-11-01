"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  X,
  WashingMachine,
  Wind,
  ShieldAlert,
  Save,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Check,
  Play,
  Pause,
  Square,
  Unlock,
  Layers,
  // Settings2,
  // Activity,
  // BarChart2,
  // Sliders,
} from "lucide-react";
import type { MachineItem, MachineParameters } from "@/lib/auth/business";
import {
  saveMachineParameters,
  executeMachineCommand,
} from "@/app/branches/[branchId]/machines/actions";
import { MachineStatisticsChart } from "@/components/workspace/machines/MachineStatisticsChart";

// Program Step Definition (PR-4)
interface ProgramStep {
  id: string;
  name: string;
  durationMins: number;
  durationSecs: number;
  tempCelsius: number;
  speedRpm: number;
}

// Custom Program Definition (PR-1, PR-2, PR-3)
interface CustomProgram {
  id: string;
  position: string;
  name: string;
  totalDuration: string;
  price: string;
  discountPrice?: string;
  isDefault: boolean;
  steps: ProgramStep[];
}

interface MachineParameterFormProps {
  machine: MachineItem;
  branchId: string;
  userRole: "owner" | "branch_manager" | "machine_maintenance" | "lpg_maintenance";
  onMachineUpdated?: (updated: MachineItem) => void;
}

function MachineParameterForm({
  machine,
  branchId,
  userRole,
  onMachineUpdated,
}: MachineParameterFormProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [price, setPrice] = useState<string>(() =>
    machine.parameters.price !== null && machine.parameters.price !== undefined
      ? machine.parameters.price.toString()
      : ""
  );
  const [duration, setDuration] = useState<number>(() => machine.parameters.duration_mins ?? 45);
  const [temp, setTemp] = useState<number>(() => machine.parameters.temp_celsius ?? 40);
  const [waterLevel, setWaterLevel] = useState<"Low" | "Medium" | "High">(
    () => machine.parameters.water_level ?? "Medium"
  );
  const [spinSpeed, setSpinSpeed] = useState<number>(() => machine.parameters.spin_speed ?? 800);

  const isOperator = userRole === "owner" || userRole === "branch_manager";
  const isWasher = machine.type === "washer";
  const canEditParameters = isOperator && machine.status === "IDLE";

  const handleSaveParameters = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const parsedPrice = price ? parseFloat(price) : undefined;
    if (parsedPrice !== undefined && (isNaN(parsedPrice) || parsedPrice < 0)) {
      setErrorMessage("Please enter a valid price in MYR.");
      return;
    }

    const payload: Partial<MachineParameters> = {
      price: parsedPrice,
      duration_mins: Number(duration),
      temp_celsius: Number(temp),
      water_level: isWasher ? waterLevel : undefined,
      spin_speed: isWasher ? Number(spinSpeed) : undefined,
    };

    startTransition(async () => {
      const res = await saveMachineParameters(branchId, machine.id, payload);
      if (!res.success) {
        setErrorMessage(res.message || "Failed to update parameters.");
      } else {
        setSuccessMessage("Machine parameters updated successfully.");
        if (res.machine && onMachineUpdated) {
          onMachineUpdated(res.machine);
        }
      }
    });
  };

  return (
    <div className="space-y-4">
      {!canEditParameters && isOperator && (
        <div className="rounded border border-warning/30 bg-warning/10 p-3 text-xs text-ink">
          <p className="font-semibold text-warning">Modifications Restricted While Active</p>
          <p className="mt-0.5 text-muted">
            Parameters and cycle rates can only be calibrated when the machine is in{" "}
            <span className="font-semibold text-ink">IDLE</span> status. Currently: {machine.status}.
          </p>
        </div>
      )}

      {!isOperator && (
        <div className="rounded border border-rule bg-raised/40 p-3 text-xs text-muted">
          <p className="font-semibold text-ink">Read-Only Diagnostic Parameters</p>
          <p className="mt-0.5">
            Modifying commercial pricing and operational cycles requires Branch Manager or Organization Owner credentials.
          </p>
        </div>
      )}

      {errorMessage && (
        <div className="rounded border border-negative/30 bg-negative/10 p-3 text-xs text-negative" role="alert">
          {errorMessage}
        </div>
      )}

      {successMessage && (
        <div className="rounded border border-positive/30 bg-positive/10 p-3 text-xs text-positive" role="status">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSaveParameters} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isOperator && (
            <div className="space-y-1">
              <label htmlFor="param-price" className="text-xs font-medium text-ink">
                Cycle Rate (MYR)
              </label>
              <input
                id="param-price"
                type="number"
                step="0.50"
                min="0"
                disabled={!canEditParameters || isPending}
                value={price}
                onChange={e => setPrice(e.target.value)}
                placeholder="6.00"
                className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
              />
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="param-duration" className="text-xs font-medium text-ink">
              Default Duration (Minutes)
            </label>
            <input
              id="param-duration"
              type="number"
              min="10"
              max="120"
              disabled={!canEditParameters || isPending}
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="param-temp" className="text-xs font-medium text-ink">
              Operating Temperature (°C)
            </label>
            <input
              id="param-temp"
              type="number"
              min="20"
              max="90"
              disabled={!canEditParameters || isPending}
              value={temp}
              onChange={e => setTemp(Number(e.target.value))}
              className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
            />
          </div>

          {isWasher && (
            <div className="space-y-1">
              <label htmlFor="param-water-level" className="text-xs font-medium text-ink">
                Water Level Setting
              </label>
              <select
                id="param-water-level"
                disabled={!canEditParameters || isPending}
                value={waterLevel}
                onChange={e => setWaterLevel(e.target.value as "Low" | "Medium" | "High")}
                className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
              >
                <option value="Low">Low (Economic load)</option>
                <option value="Medium">Medium (Standard load)</option>
                <option value="High">High (Full drum)</option>
              </select>
            </div>
          )}

          {isWasher && (
            <div className="space-y-1">
              <label htmlFor="param-spin-speed" className="text-xs font-medium text-ink">
                Maximum Spin Speed (RPM)
              </label>
              <select
                id="param-spin-speed"
                disabled={!canEditParameters || isPending}
                value={spinSpeed}
                onChange={e => setSpinSpeed(Number(e.target.value))}
                className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
              >
                <option value={400}>400 RPM (Delicates)</option>
                <option value={800}>800 RPM (Normal)</option>
                <option value={1000}>1000 RPM (Heavy)</option>
                <option value={1200}>1200 RPM (High extraction)</option>
              </select>
            </div>
          )}
        </div>

        {isOperator && (
          <div className="flex justify-end gap-3 border-t border-rule pt-4">
            <button
              type="submit"
              disabled={!canEditParameters || isPending}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-ink bg-ink px-5 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:border-muted enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
            >
              <Save className="size-4" aria-hidden="true" />
              <span>{isPending ? "Saving Parameters…" : "Save Parameters"}</span>
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

interface MachineDetailModalProps {
  machine: MachineItem | null;
  branchId: string;
  userRole: "owner" | "branch_manager" | "machine_maintenance" | "lpg_maintenance";
  isOpen: boolean;
  onClose: () => void;
  onMachineUpdated?: (updated: MachineItem) => void;
}

export function MachineDetailModal({
  machine,
  branchId,
  userRole,
  isOpen,
  onClose,
  onMachineUpdated,
}: MachineDetailModalProps) {
  const [activeTab, setActiveTab] = useState<"diagnostics" | "statistics" | "programs" | "parameters">("diagnostics");
  const [statsSubTab, setStatsSubTab] = useState<"income" | "worktime" | "cycle">("income");
  const [paramGroup, setParamGroup] = useState<
    | "live"
    | "machine"
    | "inverter"
    | "input"
    | "wash"
    | "water_level"
    | "extract"
    | "temp"
    | "door"
    | "soap"
    | "coin"
    | "others"
  >("live");

  // Custom Programs State (Authoring system matching PR-1 through PR-4)
  const [programs, setPrograms] = useState<CustomProgram[]>([]);
  const [isCreatingProgram, setIsCreatingProgram] = useState(false);
  const [expandedProgramId, setExpandedProgramId] = useState<string | null>(null);

  // New Program Form State
  const [progName, setProgName] = useState("");
  const [progPrice, setProgPrice] = useState("6.00");
  const [progDiscount, setProgDiscount] = useState("0.00");
  const [progIsDefault, setProgIsDefault] = useState(false);
  const [progSteps, setProgSteps] = useState<ProgramStep[]>([
    {
      id: "1",
      name: "Main wash",
      durationMins: 10,
      durationSecs: 0,
      tempCelsius: 40,
      speedRpm: 800,
    },
    {
      id: "2",
      name: "Drain",
      durationMins: 1,
      durationSecs: 30,
      tempCelsius: 30,
      speedRpm: 300,
    },
    {
      id: "3",
      name: "Rinse",
      durationMins: 2,
      durationSecs: 0,
      tempCelsius: 30,
      speedRpm: 600,
    },
    {
      id: "4",
      name: "Extract",
      durationMins: 2,
      durationSecs: 0,
      tempCelsius: 25,
      speedRpm: 900,
    },
  ]);

  // Command transition state
  const [cmdPending, startCmdTransition] = useTransition();
  const [cmdError, setCmdError] = useState<string | null>(null);

  // Keyboard navigation: Escape key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !machine) return null;

  const isOperator = userRole === "owner" || userRole === "branch_manager";
  const isWasher = machine.type === "washer";

  const handleCommand = (cmd: "start" | "pause" | "resume" | "stop" | "unlock") => {
    setCmdError(null);
    startCmdTransition(async () => {
      const res = await executeMachineCommand(branchId, machine.id, cmd);
      if (!res.success) {
        setCmdError(res.message || `Failed to execute ${cmd}`);
      } else if (res.machine && onMachineUpdated) {
        onMachineUpdated(res.machine);
      }
    });
  };

  // Program step management
  const handleAddStep = () => {
    const nextId = (progSteps.length + 1).toString();
    setProgSteps([
      ...progSteps,
      {
        id: nextId,
        name: isWasher ? "Rinse" : "Tumble Dry",
        durationMins: 5,
        durationSecs: 0,
        tempCelsius: 40,
        speedRpm: 800,
      },
    ]);
  };

  const handleRemoveStep = (index: number) => {
    if (progSteps.length <= 1) return;
    setProgSteps(progSteps.filter((_, i) => i !== index));
  };

  const handleMoveStep = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === progSteps.length - 1)
    ) {
      return;
    }
    const newSteps = [...progSteps];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const temp = newSteps[index];
    newSteps[index] = newSteps[targetIndex];
    newSteps[targetIndex] = temp;
    setProgSteps(newSteps);
  };

  const handleUpdateStep = (index: number, field: keyof ProgramStep, value: string | number) => {
    const newSteps = [...progSteps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setProgSteps(newSteps);
  };

  const formatCalculatedDuration = (steps: ProgramStep[]): string => {
    let totalSeconds = 0;
    for (const step of steps) {
      totalSeconds += step.durationMins * 60 + step.durationSecs;
    }
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  };

  const handleSaveProgram = (e: React.FormEvent) => {
    e.preventDefault();
    if (!progName.trim()) return;

    const newPosition = (programs.length + 1).toString().padStart(2, "0");
    const totalDuration = formatCalculatedDuration(progSteps);

    const newProg: CustomProgram = {
      id: `prog-${Date.now()}`,
      position: newPosition,
      name: progName.trim(),
      totalDuration,
      price: progPrice || "6.00",
      discountPrice: progDiscount || "0.00",
      isDefault: progIsDefault,
      steps: [...progSteps],
    };

    setPrograms([...programs, newProg]);
    setIsCreatingProgram(false);
    setProgName("");
    setProgSteps([
      {
        id: "1",
        name: "Main wash",
        durationMins: 10,
        durationSecs: 0,
        tempCelsius: 40,
        speedRpm: 800,
      },
    ]);
  };

  const handleDeleteProgram = (id: string) => {
    setPrograms(programs.filter(p => p.id !== id));
    if (expandedProgramId === id) setExpandedProgramId(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 hidden sm:flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="machine-detail-title"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col rounded-md border border-control bg-surface p-6 text-ink shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-rule pb-4">
          <div className="flex items-center gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-line bg-raised/60">
              {isWasher ? (
                <WashingMachine className="size-6 text-accent" aria-hidden="true" />
              ) : (
                <Wind className="size-6 text-warning" aria-hidden="true" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 id="machine-detail-title" className="text-xl font-bold tracking-tight text-ink">
                  {machine.name}
                </h2>
                <span className="rounded border border-rule bg-raised/40 px-2 py-0.5 text-xs font-semibold text-muted">
                  {machine.capacity_kg} kg
                </span>
                <span
                  className={`rounded border px-2.5 py-0.5 text-xs font-semibold ${machine.status === "RUNNING"
                    ? "border-accent/40 bg-accent/10 text-ink"
                    : machine.status === "IDLE"
                      ? "border-positive/30 bg-positive/10 text-positive"
                      : machine.status === "PAUSED"
                        ? "border-warning/30 bg-warning/10 text-warning"
                        : machine.status === "ERROR"
                          ? "border-negative/40 bg-negative/10 text-negative"
                          : "border-line bg-raised text-muted"
                    }`}
                >
                  {machine.status}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                <span>{isWasher ? "Commercial High-Spin Washer" : "Commercial Gas-Heated Dryer"}</span>
                <span>Unit Position: {isWasher ? "Lower Stack Unit" : "Upper Stack Unit"}</span>
                <span>
                  ID: <span className="font-semibold tabular-nums text-ink">{machine.id}</span>
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-md border border-control bg-raised/40 text-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="Close modal"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="mt-4 flex gap-4 border-b border-rule" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "diagnostics"}
            onClick={() => setActiveTab("diagnostics")}
            className={`min-h-11 border-b-2 px-3.5 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${activeTab === "diagnostics"
              ? "border-accent text-ink font-semibold"
              : "border-transparent text-muted hover:text-ink"
              }`}
          >
            State &amp; Diagnostics
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "statistics"}
            onClick={() => setActiveTab("statistics")}
            className={`min-h-11 border-b-2 px-3.5 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${activeTab === "statistics"
              ? "border-accent text-ink font-semibold"
              : "border-transparent text-muted hover:text-ink"
              }`}
          >
            Statistics &amp; Revenue
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "programs"}
            onClick={() => setActiveTab("programs")}
            className={`min-h-11 border-b-2 px-3.5 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${activeTab === "programs"
              ? "border-accent text-ink font-semibold"
              : "border-transparent text-muted hover:text-ink"
              }`}
          >
            Programs Catalog
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "parameters"}
            onClick={() => setActiveTab("parameters")}
            className={`min-h-11 border-b-2 px-3.5 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${activeTab === "parameters"
              ? "border-accent text-ink font-semibold"
              : "border-transparent text-muted hover:text-ink"
              }`}
          >
            Parameters &amp; Pricing
          </button>
        </div>

        {/* Tab Body */}
        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          {/* TAB 1: State & Diagnostics */}
          {activeTab === "diagnostics" && (
            <div className="space-y-5">
              {/* Active Fault Alert */}
              {machine.status === "ERROR" && (
                <div
                  className="rounded-md border border-negative/40 bg-negative/10 p-4"
                  role="alert"
                >
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="size-5 shrink-0 text-negative mt-0.5" aria-hidden="true" />
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-negative">
                        Active Fault: {machine.fault_code} ({machine.fault_subsystem})
                      </h3>
                      <p className="text-xs text-ink">
                        Remediation protocol: {machine.fault_remediation || "Verify LPG cylinder manifold pressure and inspect spark igniter."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Hardware Registration & Activation Metadata */}
              <div className="grid grid-cols-2 gap-4 rounded-md border border-line bg-raised/30 p-4 sm:grid-cols-4">
                <div>
                  <span className="text-xs text-muted">Hardware Identity</span>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    EC22-01A9-6
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted">Stack Position</span>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {isWasher ? "(1号机器) Lower Unit" : "(1号机器) Upper Unit"}
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted">Activation Date</span>
                  <p className="mt-1 text-sm font-semibold text-ink">Not configured</p>
                </div>
                <div>
                  <span className="text-xs text-muted">Warranty Expiration</span>
                  <p className="mt-1 text-sm font-semibold text-ink">Not configured</p>
                </div>
              </div>

              {/* Live Telemetry Sensor Grid */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-md border border-rule bg-raised/30 p-3.5">
                  <span className="text-xs text-muted">Remaining Time</span>
                  <p className="mt-1 text-lg font-bold text-ink tabular-nums">
                    {machine.remaining_time > 0 ? `${machine.remaining_time} min` : "0 min"}
                  </p>
                </div>

                <div className="rounded-md border border-rule bg-raised/30 p-3.5">
                  <span className="text-xs text-muted">Water Level</span>
                  <p className="mt-1 text-lg font-bold text-ink tabular-nums">
                    {isWasher ? "0 CM" : "N/A"}
                  </p>
                </div>

                <div className="rounded-md border border-rule bg-raised/30 p-3.5">
                  <span className="text-xs text-muted">Water Temp</span>
                  <p className="mt-1 text-lg font-bold text-ink tabular-nums">
                    {isWasher ? "25 °C" : `${machine.parameters.temp_celsius ?? 60} °C`}
                  </p>
                </div>

                <div className="rounded-md border border-rule bg-raised/30 p-3.5">
                  <span className="text-xs text-muted">Drum Speed</span>
                  <p className="mt-1 text-lg font-bold text-ink tabular-nums">
                    {machine.drum_rpm} RPM
                  </p>
                </div>

                <div className="rounded-md border border-rule bg-raised/30 p-3.5">
                  <span className="text-xs text-muted">Power Draw</span>
                  <p className="mt-1 text-lg font-bold text-ink tabular-nums">
                    {machine.power_w} W
                  </p>
                </div>

                <div className="rounded-md border border-rule bg-raised/30 p-3.5">
                  <span className="text-xs text-muted">Door Interlock</span>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {machine.status === "RUNNING" ? "Locked (Running)" : "Engaged / Safe"}
                  </p>
                </div>
              </div>

              {/* Operator Command Bar */}
              {isOperator && (
                <div className="rounded-md border border-line bg-surface p-4">
                  <h3 className="text-xs font-semibold text-ink">Operator Diagnostics &amp; Controls</h3>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={cmdPending || (machine.status !== "IDLE" && machine.status !== "PAUSED")}
                      onClick={() => handleCommand("start")}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-positive bg-positive px-4 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:bg-positive/80 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:border-control disabled:text-muted"
                    >
                      <Play className="size-4" aria-hidden="true" />
                      <span>Start Cycle</span>
                    </button>

                    <button
                      type="button"
                      disabled={cmdPending || machine.status !== "RUNNING"}
                      onClick={() => handleCommand("pause")}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-control bg-navy px-4 py-2 text-xs font-semibold text-ink transition-colors enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
                    >
                      <Pause className="size-4" aria-hidden="true" />
                      <span>Pause</span>
                    </button>

                    <button
                      type="button"
                      disabled={cmdPending || (machine.status !== "RUNNING" && machine.status !== "PAUSED")}
                      onClick={() => handleCommand("stop")}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-negative bg-negative px-4 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:border-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:border-control disabled:text-muted"
                    >
                      <Square className="size-4" aria-hidden="true" />
                      <span>Stop Cycle</span>
                    </button>

                    {(machine.status === "IDLE" || machine.status === "ERROR") && (
                      <button
                        type="button"
                        disabled={cmdPending}
                        onClick={() => handleCommand("unlock")}
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-control bg-navy px-4 py-2 text-xs font-semibold text-ink transition-colors enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
                      >
                        <Unlock className="size-4" aria-hidden="true" />
                        <span>Unlock Door</span>
                      </button>
                    )}
                  </div>

                  {cmdError && (
                    <p className="mt-2 text-xs text-negative" role="alert">
                      {cmdError}
                    </p>
                  )}
                </div>
              )}

              {/* Provenance Footer */}
              {/* <div className="rounded-md border border-rule bg-raised/20 p-4">
                <h4 className="text-xs font-semibold text-ink">Telemetry Provenance &amp; Quality</h4>
                <p className="mt-1 text-xs text-muted">
                  Ingested via Raspberry Pi gateway service from ESP32 edge telemetry and Modbus/MQTT payload streams. All sensor samples are timestamped and deduplicated before synchronization.
                </p>
              </div> */}
            </div>
          )}

          {/* TAB 2: Statistics & Revenue */}
          {activeTab === "statistics" && (
            <div className="space-y-4">
              {/* Sub-tab Switcher and Date Range Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStatsSubTab("income")}
                    className={`min-h-11 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${statsSubTab === "income"
                      ? "bg-navy text-ink border border-control"
                      : "bg-raised/40 text-muted hover:text-ink"
                      }`}
                  >
                    Income
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatsSubTab("worktime")}
                    className={`min-h-11 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${statsSubTab === "worktime"
                      ? "bg-navy text-ink border border-control"
                      : "bg-raised/40 text-muted hover:text-ink"
                      }`}
                  >
                    Work Time
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatsSubTab("cycle")}
                    className={`min-h-11 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${statsSubTab === "cycle"
                      ? "bg-navy text-ink border border-control"
                      : "bg-raised/40 text-muted hover:text-ink"
                      }`}
                  >
                    Cycle
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="font-medium text-ink">Date Range:</span>
                  <span className="rounded border border-rule bg-raised/40 px-2.5 py-1 tabular-nums text-ink">
                    2026-10-22 to 2026-10-29
                  </span>
                </div>
              </div>

              {statsSubTab === "income" && (
                <div className="space-y-4">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-md border border-rule bg-raised/30 p-4">
                      <span className="text-xs text-muted">Estimated Period Revenue</span>
                      <p className="mt-1 text-2xl font-bold text-ink tabular-nums">
                        RM {((machine.parameters.price ?? 6) * 14).toFixed(2)}
                      </p>
                      <span className="text-[11px] text-faint">Derived from recorded cycles</span>
                    </div>

                    <div className="rounded-md border border-rule bg-raised/30 p-4">
                      <span className="text-xs text-muted">Completed Cycles</span>
                      <p className="mt-1 text-2xl font-bold text-ink tabular-nums">
                        14 cycles
                      </p>
                      <span className="text-[11px] text-faint">Average 2.0 cycles/day</span>
                    </div>

                    <div className="rounded-md border border-rule bg-raised/30 p-4">
                      <span className="text-xs text-muted">Total Run Duration</span>
                      <p className="mt-1 text-2xl font-bold text-ink tabular-nums">
                        9.5 hrs
                      </p>
                      <span className="text-[11px] text-faint">Active motor run-time</span>
                    </div>
                  </div>

                  {/* Reusable Chart.js Component for Income Trend */}
                  <MachineStatisticsChart
                    title="Income Situation Curve Graph (Unit: MYR)"
                    subtitle="Daily Billing Trend"
                    unit="MYR"
                    type="line"
                    labels={["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-29"]}
                    datasets={[
                      {
                        label: "Revenue",
                        data: [12, 18, 24, 18, 30, 24, 18],
                        color: "#79c5a6",
                        fill: true,
                      },
                    ]}
                    footerNote="Estimated revenue calculated from recorded cycles and configured cycle rates. Unverified by external banking gateway."
                  />
                </div>
              )}

              {statsSubTab === "worktime" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-md border border-rule bg-raised/30 p-4">
                      <span className="text-xs text-muted">Motor Active Runtime</span>
                      <p className="mt-1 text-2xl font-bold text-ink tabular-nums">9.5 hrs</p>
                      <span className="text-[11px] text-faint">Active drum rotation</span>
                    </div>
                    <div className="rounded-md border border-rule bg-raised/30 p-4">
                      <span className="text-xs text-muted">Standby / Idle Time</span>
                      <p className="mt-1 text-2xl font-bold text-ink tabular-nums">158.5 hrs</p>
                      <span className="text-[11px] text-faint">Ready for cycles</span>
                    </div>
                    <div className="rounded-md border border-rule bg-raised/30 p-4">
                      <span className="text-xs text-muted">Error / Outage Time</span>
                      <p className="mt-1 text-2xl font-bold text-ink tabular-nums">0.0 hrs</p>
                      <span className="text-[11px] text-faint">Zero safety outages</span>
                    </div>
                  </div>

                  {/* Reusable Chart.js Component for Work-Time Distribution */}
                  <MachineStatisticsChart
                    title="Daily Operating Work-Time Distribution (Unit: Hours)"
                    subtitle="Motor Runtime vs Standby"
                    unit="hrs"
                    type="bar"
                    labels={["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-29"]}
                    datasets={[
                      {
                        label: "Motor Active (hrs)",
                        data: [1.2, 1.8, 1.2, 0.8, 2.1, 1.4, 1.0],
                        color: "#ef6268",
                      },
                      {
                        label: "Standby / Idle (hrs)",
                        data: [22.8, 22.2, 22.8, 23.2, 21.9, 22.6, 23.0],
                        color: "#5ea1e0",
                      },
                    ]}
                    footerNote="Work-time breakdowns are derived from machine state transition logs."
                  />
                </div>
              )}

              {statsSubTab === "cycle" && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="rounded-md border border-rule bg-raised/30 p-4">
                      <span className="text-xs text-muted">Completed Cycles</span>
                      <p className="mt-1 text-2xl font-bold text-positive tabular-nums">14 (100%)</p>
                      <span className="text-[11px] text-faint">Successfully finished</span>
                    </div>
                    <div className="rounded-md border border-rule bg-raised/30 p-4">
                      <span className="text-xs text-muted">Interrupted / Aborted</span>
                      <p className="mt-1 text-2xl font-bold text-ink tabular-nums">0 (0%)</p>
                      <span className="text-[11px] text-faint">No customer interventions</span>
                    </div>
                  </div>

                  {/* Reusable Chart.js Component for Cycle Throughput */}
                  <MachineStatisticsChart
                    title="Daily Cycle Execution Throughput"
                    subtitle="Completed vs Interrupted Cycles"
                    unit="cycles"
                    type="bar"
                    labels={["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-29"]}
                    datasets={[
                      {
                        label: "Completed Cycles",
                        data: [2, 3, 2, 1, 3, 2, 1],
                        color: "#79c5a6",
                      },
                      {
                        label: "Interrupted / Faulted",
                        data: [0, 0, 0, 0, 0, 0, 0],
                        color: "#ef8798",
                      },
                    ]}
                    footerNote="Cycle statistics reflect local edge controller execution acknowledgements."
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Programs Catalog */}
          {activeTab === "programs" && (
            <div className="space-y-4">
              {/* Programs Header with Action */}
              <div className="flex items-center justify-between border-b border-rule pb-3">
                <h3 className="text-xs font-semibold text-ink">Configured Machine Programs</h3>
                {isOperator && !isCreatingProgram && (
                  <button
                    type="button"
                    onClick={() => setIsCreatingProgram(true)}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-ink bg-ink px-4 py-2 text-xs font-semibold text-surface transition-colors hover:border-muted hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <Plus className="size-4" aria-hidden="true" />
                    <span>Create Program</span>
                  </button>
                )}
              </div>

              {/* Authoring Form (PR-2, PR-3, PR-4) */}
              {isCreatingProgram && (
                <div className="rounded-md border border-line bg-raised/40 p-5 space-y-5">
                  <div className="flex items-center justify-between border-b border-rule pb-3">
                    <h4 className="text-sm font-semibold text-ink">Author New Cycle Program</h4>
                    <button
                      type="button"
                      onClick={() => setIsCreatingProgram(false)}
                      className="text-xs text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      Cancel
                    </button>
                  </div>

                  <form onSubmit={handleSaveProgram} className="space-y-5">
                    {/* Basic Info (PR-2, PR-3) */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1 sm:col-span-2">
                        <label htmlFor="new-prog-name" className="text-xs font-medium text-ink">
                          Program Name
                        </label>
                        <input
                          id="new-prog-name"
                          type="text"
                          required
                          value={progName}
                          onChange={e => setProgName(e.target.value)}
                          placeholder="e.g. Hot-water quick wash 90°C"
                          className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-accent"
                        />
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="new-prog-price" className="text-xs font-medium text-ink">
                          Cycle Rate (MYR)
                        </label>
                        <input
                          id="new-prog-price"
                          type="number"
                          step="0.50"
                          min="0"
                          value={progPrice}
                          onChange={e => setProgPrice(e.target.value)}
                          className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent"
                        />
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="new-prog-discount" className="text-xs font-medium text-ink">
                          Discounted Rate (MYR)
                        </label>
                        <input
                          id="new-prog-discount"
                          type="number"
                          step="0.50"
                          min="0"
                          value={progDiscount}
                          onChange={e => setProgDiscount(e.target.value)}
                          className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        id="new-prog-default"
                        type="checkbox"
                        checked={progIsDefault}
                        onChange={e => setProgIsDefault(e.target.checked)}
                        className="size-4 rounded border-control bg-canvas text-accent focus-visible:outline-accent"
                      />
                      <label htmlFor="new-prog-default" className="text-xs font-medium text-ink">
                        Set as default cycle program for this machine
                      </label>
                    </div>

                    {/* Step Setting Sequence (PR-4) */}
                    <div className="space-y-3 border-t border-rule pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="text-xs font-semibold text-ink">Program Step Execution Sequence</h5>
                          <span className="text-[11px] text-muted">
                            Total Duration: {formatCalculatedDuration(progSteps)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleAddStep}
                          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-control bg-navy px-3 py-1.5 text-xs font-medium text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          <Plus className="size-3.5" aria-hidden="true" />
                          <span>Add Step</span>
                        </button>
                      </div>

                      <div className="space-y-2">
                        {progSteps.map((step, idx) => (
                          <div
                            key={step.id}
                            className="flex flex-wrap items-center gap-3 rounded-md border border-rule bg-surface p-3"
                          >
                            <span className="w-6 text-center text-xs font-bold tabular-nums text-muted">
                              {idx + 1}
                            </span>

                            <div className="w-36">
                              <select
                                value={step.name}
                                onChange={e => handleUpdateStep(idx, "name", e.target.value)}
                                className="min-h-11 w-full rounded-md border border-control bg-canvas px-2.5 py-1.5 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent"
                              >
                                {isWasher ? (
                                  <>
                                    <option value="Main wash">Main wash</option>
                                    <option value="Pre-wash">Pre-wash</option>
                                    <option value="Drain">Drain</option>
                                    <option value="Rinse">Rinse</option>
                                    <option value="Extract">Extract</option>
                                  </>
                                ) : (
                                  <>
                                    <option value="High Heat Dry">High Heat Dry</option>
                                    <option value="Medium Heat Dry">Medium Heat Dry</option>
                                    <option value="Air Fluff">Air Fluff</option>
                                    <option value="Cool Down">Cool Down</option>
                                  </>
                                )}
                              </select>
                            </div>

                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                max="99"
                                value={step.durationMins}
                                onChange={e => handleUpdateStep(idx, "durationMins", Number(e.target.value))}
                                className="min-h-11 w-14 rounded-md border border-control bg-canvas px-2 py-1 text-center text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent"
                              />
                              <span className="text-xs text-muted">m</span>
                              <input
                                type="number"
                                min="0"
                                max="59"
                                value={step.durationSecs}
                                onChange={e => handleUpdateStep(idx, "durationSecs", Number(e.target.value))}
                                className="min-h-11 w-14 rounded-md border border-control bg-canvas px-2 py-1 text-center text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent"
                              />
                              <span className="text-xs text-muted">s</span>
                            </div>

                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                min="20"
                                max="90"
                                value={step.tempCelsius}
                                onChange={e => handleUpdateStep(idx, "tempCelsius", Number(e.target.value))}
                                className="min-h-11 w-16 rounded-md border border-control bg-canvas px-2 py-1 text-center text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent"
                              />
                              <span className="text-xs text-muted">°C</span>
                            </div>

                            {isWasher && (
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min="300"
                                  max="1200"
                                  step="50"
                                  value={step.speedRpm}
                                  onChange={e => handleUpdateStep(idx, "speedRpm", Number(e.target.value))}
                                  className="min-h-11 w-20 rounded-md border border-control bg-canvas px-2 py-1 text-center text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent"
                                />
                                <span className="text-xs text-muted">RPM</span>
                              </div>
                            )}

                            <div className="ml-auto flex items-center gap-1">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveStep(idx, "up")}
                                className="flex size-11 items-center justify-center rounded border border-control text-muted hover:text-ink disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-accent"
                                aria-label="Move step up"
                              >
                                <ChevronUp className="size-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === progSteps.length - 1}
                                onClick={() => handleMoveStep(idx, "down")}
                                className="flex size-11 items-center justify-center rounded border border-control text-muted hover:text-ink disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-accent"
                                aria-label="Move step down"
                              >
                                <ChevronDown className="size-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                disabled={progSteps.length <= 1}
                                onClick={() => handleRemoveStep(idx)}
                                className="flex size-11 items-center justify-center rounded border border-control text-negative hover:bg-negative/10 disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-accent"
                                aria-label="Delete step"
                              >
                                <Trash2 className="size-4" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 border-t border-rule pt-4">
                      <button
                        type="button"
                        onClick={() => setIsCreatingProgram(false)}
                        className="min-h-11 rounded-md border border-control px-4 py-2 text-xs font-semibold text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-ink bg-ink px-5 py-2 text-xs font-semibold text-surface transition-colors hover:border-muted hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        <Save className="size-4" aria-hidden="true" />
                        <span>Save Program</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Programs List */}
              {programs.length === 0 && !isCreatingProgram ? (
                <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-rule bg-raised/20 p-8 text-center">
                  <Layers className="size-10 text-muted" aria-hidden="true" />
                  <h4 className="mt-3 text-sm font-semibold text-ink">No Custom Programs Configured</h4>
                  <p className="mt-1 max-w-sm text-xs text-muted">
                    This unit has no firmware programs authored yet. Use the Create Program button to define customized wash or dry cycles.
                  </p>
                  {isOperator && (
                    <button
                      type="button"
                      onClick={() => setIsCreatingProgram(true)}
                      className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-control bg-navy px-4 py-2 text-xs font-semibold text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      <span>Create First Program</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {programs.map(prog => (
                    <div
                      key={prog.id}
                      className="rounded-md border border-line bg-surface p-4 transition-all"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="flex size-8 items-center justify-center rounded-md border border-rule bg-raised/50 text-xs font-bold tabular-nums text-ink">
                            {prog.position}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-semibold text-ink">{prog.name}</h4>
                              {prog.isDefault && (
                                <span className="rounded border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                                  Default
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted">
                              Duration: {prog.totalDuration} · Rate: RM {prog.price} · {prog.steps.length} steps configured
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedProgramId(expandedProgramId === prog.id ? null : prog.id)
                            }
                            className="min-h-11 rounded-md border border-control bg-navy px-3 py-1.5 text-xs font-medium text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent"
                          >
                            {expandedProgramId === prog.id ? "Hide Steps" : "View Steps"}
                          </button>
                          {isOperator && (
                            <button
                              type="button"
                              onClick={() => handleDeleteProgram(prog.id)}
                              className="flex size-11 items-center justify-center rounded-md border border-control text-negative hover:bg-negative/10 focus-visible:outline-2 focus-visible:outline-accent"
                              aria-label="Delete program"
                            >
                              <Trash2 className="size-4" aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Expandable Step Settings Breakdown (PR-4) */}
                      {expandedProgramId === prog.id && (
                        <div className="mt-4 border-t border-rule pt-3 space-y-2">
                          <h5 className="text-xs font-semibold text-muted">Execution Step Breakdown</h5>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            {prog.steps.map((st, i) => (
                              <div
                                key={st.id}
                                className="rounded border border-rule bg-raised/30 p-2.5 text-xs"
                              >
                                <span className="font-semibold text-ink">
                                  Step {i + 1}: {st.name}
                                </span>
                                <div className="mt-1 text-[11px] text-muted space-y-0.5">
                                  <p>
                                    Duration: {st.durationMins}m {st.durationSecs}s
                                  </p>
                                  <p>Temp: {st.tempCelsius}°C</p>
                                  {isWasher && <p>Speed: {st.speedRpm} RPM</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Parameters & Pricing */}
          {activeTab === "parameters" && (
            <div className="space-y-5">
              {/* Parameter Sub-Selector */}
              <div className="flex flex-wrap gap-2 border-b border-rule pb-3">
                <button
                  type="button"
                  onClick={() => setParamGroup("live")}
                  className={`min-h-11 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${paramGroup === "live"
                    ? "bg-navy text-ink border border-control"
                    : "bg-raised/40 text-muted hover:text-ink"
                    }`}
                >
                  Live Calibration
                </button>
                <button
                  type="button"
                  onClick={() => setParamGroup("machine")}
                  className={`min-h-11 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${paramGroup === "machine"
                    ? "bg-navy text-ink border border-control"
                    : "bg-raised/40 text-muted hover:text-ink"
                    }`}
                >
                  Machine
                </button>
                <button
                  type="button"
                  onClick={() => setParamGroup("inverter")}
                  className={`min-h-11 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${paramGroup === "inverter"
                    ? "bg-navy text-ink border border-control"
                    : "bg-raised/40 text-muted hover:text-ink"
                    }`}
                >
                  Inverter
                </button>
                <button
                  type="button"
                  onClick={() => setParamGroup("input")}
                  className={`min-h-11 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${paramGroup === "input"
                    ? "bg-navy text-ink border border-control"
                    : "bg-raised/40 text-muted hover:text-ink"
                    }`}
                >
                  Input
                </button>
                <button
                  type="button"
                  onClick={() => setParamGroup("wash")}
                  className={`min-h-11 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${paramGroup === "wash"
                    ? "bg-navy text-ink border border-control"
                    : "bg-raised/40 text-muted hover:text-ink"
                    }`}
                >
                  Wash
                </button>
                <button
                  type="button"
                  onClick={() => setParamGroup("water_level")}
                  className={`min-h-11 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${paramGroup === "water_level"
                    ? "bg-navy text-ink border border-control"
                    : "bg-raised/40 text-muted hover:text-ink"
                    }`}
                >
                  Water Level
                </button>
                <button
                  type="button"
                  onClick={() => setParamGroup("extract")}
                  className={`min-h-11 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${paramGroup === "extract"
                    ? "bg-navy text-ink border border-control"
                    : "bg-raised/40 text-muted hover:text-ink"
                    }`}
                >
                  Extract
                </button>
                <button
                  type="button"
                  onClick={() => setParamGroup("temp")}
                  className={`min-h-11 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${paramGroup === "temp"
                    ? "bg-navy text-ink border border-control"
                    : "bg-raised/40 text-muted hover:text-ink"
                    }`}
                >
                  Temperature
                </button>
                <button
                  type="button"
                  onClick={() => setParamGroup("door")}
                  className={`min-h-11 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${paramGroup === "door"
                    ? "bg-navy text-ink border border-control"
                    : "bg-raised/40 text-muted hover:text-ink"
                    }`}
                >
                  Door
                </button>
                <button
                  type="button"
                  onClick={() => setParamGroup("soap")}
                  className={`min-h-11 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${paramGroup === "soap"
                    ? "bg-navy text-ink border border-control"
                    : "bg-raised/40 text-muted hover:text-ink"
                    }`}
                >
                  Soap
                </button>
                <button
                  type="button"
                  onClick={() => setParamGroup("coin")}
                  className={`min-h-11 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${paramGroup === "coin"
                    ? "bg-navy text-ink border border-control"
                    : "bg-raised/40 text-muted hover:text-ink"
                    }`}
                >
                  Coin
                </button>
                <button
                  type="button"
                  onClick={() => setParamGroup("others")}
                  className={`min-h-11 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${paramGroup === "others"
                    ? "bg-navy text-ink border border-control"
                    : "bg-raised/40 text-muted hover:text-ink"
                    }`}
                >
                  Others
                </button>
              </div>

              {/* Sub-tab 1: Live Calibration Form */}
              {paramGroup === "live" && (
                <div className="rounded-md border border-line bg-surface p-5">
                  <div className="border-b border-rule pb-3 mb-4">
                    <h3 className="text-xs font-semibold text-ink">Active Machine Calibration</h3>
                  </div>
                  <MachineParameterForm
                    key={machine.id}
                    machine={machine}
                    branchId={branchId}
                    userRole={userRole}
                    onMachineUpdated={onMachineUpdated}
                  />
                </div>
              )}

              {/* Sub-tab 2: Machine (P-M) */}
              {paramGroup === "machine" && (
                <div className="rounded-md border border-line bg-surface p-5 space-y-4">
                  <div className="border-b border-rule pb-3">
                    <h3 className="text-xs font-semibold text-ink">Machine Hardware Parameters</h3>
                  </div>
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Temperature Display</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">Celsius</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Drain Mode</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">Idle</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Display Cycle Pause button</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">No</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Display Cycle Advance Buttons</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">Yes</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Display Cycle Stop Button</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">Yes</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Start Cycle timer based on water temp</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">Yes</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Start Cycle timer based on water level</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">Yes</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">End Cycle Signal Duration(S)</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">10 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Drain Valve Type</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">Normally open</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Door Pin</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">Yes</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Sub-tab 3: Inverter (P-I) */}
              {paramGroup === "inverter" && (
                <div className="rounded-md border border-line bg-surface p-5 space-y-4">
                  <div className="border-b border-rule pb-3">
                    <h3 className="text-xs font-semibold text-ink">Inverter Controller Parameters</h3>
                  </div>
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Inverter Type</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">TD-EL</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Control Type</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">Terminal</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Invertor Speed Ratio</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">0.16</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Max Frequency</dt>
                      <dd className="mt-1 text-sm font-semibold text-faint line-through">160 Hz (Disabled)</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Motor rated frequency</dt>
                      <dd className="mt-1 text-sm font-semibold text-faint line-through">60 Hz (Disabled)</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Motor rated voltage</dt>
                      <dd className="mt-1 text-sm font-semibold text-faint line-through">380 V (Disabled)</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">V/F Intermediate frequency</dt>
                      <dd className="mt-1 text-sm font-semibold text-faint line-through">1.5 Hz (Disabled)</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">V/F Intermediate voltage</dt>
                      <dd className="mt-1 text-sm font-semibold text-faint line-through">10 V (Disabled)</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">V/F Minimum output frequency</dt>
                      <dd className="mt-1 text-sm font-semibold text-faint line-through">1.5 Hz (Disabled)</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">V/F Minimum output voltage</dt>
                      <dd className="mt-1 text-sm font-semibold text-faint line-through">10 V (Disabled)</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Output frequency upper limit</dt>
                      <dd className="mt-1 text-sm font-semibold text-faint line-through">120 % (Disabled)</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Output frequency lower limit</dt>
                      <dd className="mt-1 text-sm font-semibold text-faint line-through">6 % (Disabled)</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Acceleration time</dt>
                      <dd className="mt-1 text-sm font-semibold text-faint line-through">20 s (Disabled)</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Deceleration time</dt>
                      <dd className="mt-1 text-sm font-semibold text-faint line-through">30 s (Disabled)</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Sub-tab 4: Input (P-IN) */}
              {paramGroup === "input" && (
                <div className="rounded-md border border-line bg-surface p-5 space-y-4">
                  <div className="border-b border-rule pb-3">
                    <h3 className="text-xs font-semibold text-ink">Discrete Input Switch Parameters</h3>
                  </div>
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Door Close Switch Type</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">N.O</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Inverter Error Switch Type</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">N.O</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Unbalance Switch Type</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">N.O</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Door Pin Switch Type</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">N.O</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Emergency Switch Type</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">N.C</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Sub-tab 5: Wash (P-W) */}
              {paramGroup === "wash" && (
                <div className="rounded-md border border-line bg-surface p-5 space-y-4">
                  <div className="border-b border-rule pb-3">
                    <h3 className="text-xs font-semibold text-ink">Drum Wash Timing &amp; Speed Parameters</h3>
                  </div>
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Forward and reverse protection time</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">5 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Standard washing time</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">25 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Standard wash stop time</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">5 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Light wash time</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">5 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Light wash stop time</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">15 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Heavy wash time</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">60 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Heavy wash stop time</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">5 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Standard wash speed</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">55 RPM</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Light wash speed</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">50 RPM</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Heavy wash speed</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">60 RPM</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Max speed</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">60 RPM</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Sub-tab 6: Water Level (P-WL) */}
              {paramGroup === "water_level" && (
                <div className="rounded-md border border-line bg-surface p-5 space-y-4">
                  <div className="border-b border-rule pb-3">
                    <h3 className="text-xs font-semibold text-ink">Water Level &amp; Pressure Sensor Settings</h3>
                  </div>
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Reference level</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">0 cm</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Low water level</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">15 cm</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Mid water level</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">20 cm</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">High water level</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">25 cm</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Overflow level</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">45 cm</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Auto water add</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">Yes</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Add Water Differential Level</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">4 cm</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Water protection time</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">300 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Heat protection level</dt>
                      <dd className="mt-1 text-sm font-semibold text-faint line-through">5 cm (Disabled)</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Auto heating</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">No</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Stop level difference</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">0 cm</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Sub-tab 7: Extract (P-E) */}
              {paramGroup === "extract" && (
                <div className="rounded-md border border-line bg-surface p-5 space-y-4">
                  <div className="border-b border-rule pb-3">
                    <h3 className="text-xs font-semibold text-ink">High-Spin Extraction Parameters</h3>
                  </div>
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Min level for extract</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">5</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Max level in mid extract</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">8</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Balance time with water</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">30 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Balance time without water</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">30 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Mid extract time</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">60 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">High extract time 1 / 2 / 3</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">20 s / 20 s / 20 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Longest extract time</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">600 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Mid / High extract stop time</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">15 s / 30 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Times to run rebalance logic before fail</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">2</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Balance speed</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">100 RPM</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Mid extract speed</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">300 RPM</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">High extract speed 1 / 2 / 3 / 4</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">700 / 800 / 900 / 950 RPM</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">High extract max speed</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">1000 RPM</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Sub-tab 8: Temperature (P-T) */}
              {paramGroup === "temp" && (
                <div className="rounded-md border border-line bg-surface p-5 space-y-4">
                  <div className="border-b border-rule pb-3">
                    <h3 className="text-xs font-semibold text-ink">Thermal Sensor &amp; Heating Limits</h3>
                  </div>
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Min work temp</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">0 °C</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Max work temp</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">70 °C</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Manual heat temp</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">0 °C</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Heater Element Installed</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">Yes</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Auto heat temp difference</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">5 °C</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Heat protection time</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">1200 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Heater min water level</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">10 cm</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Use Heating Element</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">Yes</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Sub-tab 9: Door (P-D) */}
              {paramGroup === "door" && (
                <div className="rounded-md border border-line bg-surface p-5 space-y-4">
                  <div className="border-b border-rule pb-3">
                    <h3 className="text-xs font-semibold text-ink">Door Interlock &amp; Safety Thresholds</h3>
                  </div>
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Door lock safety temp</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">45 °C</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Door lock safety level</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">4 CM</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Pulse Door Lock Time</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">1 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Door lock output mode</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">Mode 3</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Sub-tab 10: Soap (P-S) */}
              {paramGroup === "soap" && (
                <div className="rounded-md border border-line bg-surface p-5 space-y-4">
                  <div className="border-b border-rule pb-3">
                    <h3 className="text-xs font-semibold text-ink">Chemical &amp; Soap Dispenser Timing</h3>
                  </div>
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Min Water level before Soap Box Start</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">5 CM</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Soap 1 / 2 time</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">20 s / 20 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Soap 3 / 4 time</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">20 s / 20 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Soap 5 / 6 time</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">20 s / 20 s</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Soap 7 / 8 time</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">20 s / 20 s</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Sub-tab 11: Coin (P-C) */}
              {paramGroup === "coin" && (
                <div className="rounded-md border border-line bg-surface p-5 space-y-4">
                  <div className="border-b border-rule pb-3">
                    <h3 className="text-xs font-semibold text-ink">Payment &amp; Coin Mechanism Settings</h3>
                  </div>
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Price Display Type</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">Coin value</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Coin Value</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">100</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Auto Run After Pay</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">Yes</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Enable discount</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">No</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Currency Symbol &amp; Position</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">$ (Suffix)</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Displayed Decimal Places</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">0</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3 sm:col-span-2">
                      <dt className="text-xs text-muted">Waiting Time for Automatic Clearance of Remaining Balance</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">30 s</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Sub-tab 12: Others (P-O) */}
              {paramGroup === "others" && (
                <div className="rounded-md border border-line bg-surface p-5 space-y-4">
                  <div className="border-b border-rule pb-3">
                    <h3 className="text-xs font-semibold text-ink">Auxiliary Controller Options</h3>
                  </div>
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Operation mode</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">Opl (On-Premises Laundry)</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Program display qty</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">20</dd>
                    </div>
                    <div className="rounded border border-rule bg-raised/30 p-3">
                      <dt className="text-xs text-muted">Display information</dt>
                      <dd className="mt-1 text-sm font-semibold text-ink">Speed, Water temp, Water, Soap</dd>
                    </div>
                  </dl>
                </div>
              )}

              {/* Catalog Citation Footnote */}
              {/* <div className="rounded-md border border-rule bg-raised/20 p-4 text-xs text-muted">
                Vendor factory parameter catalogs transcribed from test machine firmware reference. Settings are displayed for diagnostic verification.
              </div> */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
