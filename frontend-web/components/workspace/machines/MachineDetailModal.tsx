"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
  X,
  WashingMachine,
  Wind,
  Zap,
  ShieldAlert,
  Save,
} from "lucide-react";
import type { MachineItem, MachineParameters } from "@/lib/auth/business";
import { saveMachineParameters } from "@/app/branches/[branchId]/machines/actions";

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
      {/* Notice for status constraint (FM-06) */}
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Price (Only visible to Operators) */}
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
                className="min-h-10 w-full rounded-md border border-control bg-canvas px-3 py-1.5 text-xs text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
              />
            </div>
          )}

          {/* Duration */}
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
              className="min-h-10 w-full rounded-md border border-control bg-canvas px-3 py-1.5 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
            />
          </div>

          {/* Temperature */}
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
              className="min-h-10 w-full rounded-md border border-control bg-canvas px-3 py-1.5 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
            />
          </div>

          {/* Water Level (Washers only) */}
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
                className="min-h-10 w-full rounded-md border border-control bg-canvas px-3 py-1.5 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
              >
                <option value="Low">Low (Economic load)</option>
                <option value="Medium">Medium (Standard)</option>
                <option value="High">High (Full drum)</option>
              </select>
            </div>
          )}

          {/* Spin Speed (Washers only) */}
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
                className="min-h-10 w-full rounded-md border border-control bg-canvas px-3 py-1.5 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
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
          <div className="mt-6 flex justify-end gap-3 border-t border-rule pt-4">
            <button
              type="submit"
              disabled={!canEditParameters || isPending}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-ink bg-ink px-4 py-2 text-xs font-semibold text-surface transition-colors duration-150 enabled:hover:border-muted enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
            >
              <Save className="size-3.5" aria-hidden="true" />
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
  const [activeTab, setActiveTab] = useState<"diagnostics" | "programs" | "parameters">("diagnostics");

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !machine) return null;

  const isWasher = machine.type === "washer";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="machine-detail-title"
    >
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-md border border-control bg-surface p-6 text-ink shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-rule pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-raised/60">
              {isWasher ? (
                <WashingMachine className="size-5 text-accent" aria-hidden="true" />
              ) : (
                <Wind className="size-5 text-warning" aria-hidden="true" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="machine-detail-title" className="text-lg font-semibold text-ink">
                  {machine.name}
                </h2>
                <span className="rounded border border-rule bg-raised/40 px-2 py-0.5 text-xs font-medium text-muted">
                  {machine.capacity_kg} kg
                </span>
                <span
                  className={`rounded border px-2 py-0.5 text-xs font-medium ${
                    machine.status === "RUNNING"
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
              <p className="text-xs text-muted">
                {isWasher ? "Commercial High-Spin Washer" : "Commercial Gas-Heated Dryer"} · ID:{" "}
                <span className="font-semibold tabular-nums text-muted">{machine.id}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
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
            className={`min-h-11 border-b-2 px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
              activeTab === "diagnostics"
                ? "border-accent text-ink font-semibold"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            State & Diagnostics
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "programs"}
            onClick={() => setActiveTab("programs")}
            className={`min-h-11 border-b-2 px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
              activeTab === "programs"
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
            className={`min-h-11 border-b-2 px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
              activeTab === "parameters"
                ? "border-accent text-ink font-semibold"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            Parameters & Pricing
          </button>
        </div>

        {/* Tab Body */}
        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          {/* TAB 1: Diagnostics */}
          {activeTab === "diagnostics" && (
            <div className="space-y-4">
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
                        Remediation protocol: {machine.fault_remediation || "Dispatch technician for manual inspection."}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="rounded border border-rule bg-raised/30 p-3">
                  <span className="text-xs text-muted">Operating Phase</span>
                  <p className="mt-1 text-sm font-semibold text-ink">{machine.phase}</p>
                </div>

                <div className="rounded border border-rule bg-raised/30 p-3">
                  <span className="text-xs text-muted">Cycle Time Left</span>
                  <p className="mt-1 text-sm font-semibold text-ink tabular-nums">
                    {machine.remaining_time > 0 ? `${machine.remaining_time} min` : "None"}
                  </p>
                </div>

                <div className="rounded border border-rule bg-raised/30 p-3">
                  <span className="text-xs text-muted">Power Draw</span>
                  <p className="mt-1 text-sm font-semibold text-ink tabular-nums">{machine.power_w} W</p>
                </div>

                {isWasher ? (
                  <div className="rounded border border-rule bg-raised/30 p-3">
                    <span className="text-xs text-muted">Water Fill</span>
                    <p className="mt-1 text-sm font-semibold text-ink tabular-nums">{machine.water_l} L</p>
                  </div>
                ) : (
                  <div className="rounded border border-rule bg-raised/30 p-3">
                    <span className="text-xs text-muted">Target Temp</span>
                    <p className="mt-1 text-sm font-semibold text-ink tabular-nums">
                      {machine.parameters.temp_celsius ?? 60} °C
                    </p>
                  </div>
                )}

                <div className="rounded border border-rule bg-raised/30 p-3">
                  <span className="text-xs text-muted">Drum RPM</span>
                  <p className="mt-1 text-sm font-semibold text-ink tabular-nums">{machine.drum_rpm} RPM</p>
                </div>

                <div className="rounded border border-rule bg-raised/30 p-3">
                  <span className="text-xs text-muted">Door Interlock</span>
                  <p className="mt-1 text-sm font-semibold text-ink">
                    {machine.status === "RUNNING" ? "Locked (Running)" : "Engaged / Safe"}
                  </p>
                </div>
              </div>

              <div className="rounded border border-rule bg-raised/20 p-4">
                <h4 className="text-xs font-semibold text-ink">Telemetry Provenance & Quality</h4>
                <p className="mt-1 text-xs text-muted">
                  Ingested via Raspberry Pi gateway service from ESP32 edge telemetry and Modbus/MQTT payload streams.
                  All sensor samples are timestamped and deduplicated before synchronization.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: Programs */}
          {activeTab === "programs" && (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                Factory firmware programs provisioned on this unit. These cycles are selected during remote start or direct customer token interaction.
              </p>

              {isWasher ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded border border-rule bg-raised/30 p-3">
                    <div>
                      <h4 className="text-xs font-semibold text-ink">Standard Normal Wash</h4>
                      <p className="text-[11px] text-muted">Everyday cottons and linens · 40°C · 800 RPM</p>
                    </div>
                    <span className="text-xs font-medium text-ink tabular-nums">45 min</span>
                  </div>

                  <div className="flex items-center justify-between rounded border border-rule bg-raised/30 p-3">
                    <div>
                      <h4 className="text-xs font-semibold text-ink">Heavy Duty / Bulky</h4>
                      <p className="text-[11px] text-muted">Towels, denim, heavy soils · 60°C · 1000 RPM</p>
                    </div>
                    <span className="text-xs font-medium text-ink tabular-nums">60 min</span>
                  </div>

                  <div className="flex items-center justify-between rounded border border-rule bg-raised/30 p-3">
                    <div>
                      <h4 className="text-xs font-semibold text-ink">Quick Refresh</h4>
                      <p className="text-[11px] text-muted">Lightly soiled garments · 30°C · 800 RPM</p>
                    </div>
                    <span className="text-xs font-medium text-ink tabular-nums">25 min</span>
                  </div>

                  <div className="flex items-center justify-between rounded border border-rule bg-raised/30 p-3">
                    <div>
                      <h4 className="text-xs font-semibold text-ink">Delicates & Synthetic</h4>
                      <p className="text-[11px] text-muted">Gentle drum tumble · Cold 20°C · 400 RPM</p>
                    </div>
                    <span className="text-xs font-medium text-ink tabular-nums">35 min</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded border border-rule bg-raised/30 p-3">
                    <div>
                      <h4 className="text-xs font-semibold text-ink">Regular High Heat</h4>
                      <p className="text-[11px] text-muted">Heavy cottons, workwear · High Temp 70°C</p>
                    </div>
                    <span className="text-xs font-medium text-ink tabular-nums">45 min</span>
                  </div>

                  <div className="flex items-center justify-between rounded border border-rule bg-raised/30 p-3">
                    <div>
                      <h4 className="text-xs font-semibold text-ink">Permanent Press</h4>
                      <p className="text-[11px] text-muted">Synthetics, wrinkle-free · Medium Temp 60°C</p>
                    </div>
                    <span className="text-xs font-medium text-ink tabular-nums">35 min</span>
                  </div>

                  <div className="flex items-center justify-between rounded border border-rule bg-raised/30 p-3">
                    <div>
                      <h4 className="text-xs font-semibold text-ink">Delicate Low Heat</h4>
                      <p className="text-[11px] text-muted">Delicate fabrics, knits · Low Temp 50°C</p>
                    </div>
                    <span className="text-xs font-medium text-ink tabular-nums">30 min</span>
                  </div>

                  <div className="flex items-center justify-between rounded border border-rule bg-raised/30 p-3">
                    <div>
                      <h4 className="text-xs font-semibold text-ink">Air Fluff (No Heat)</h4>
                      <p className="text-[11px] text-muted">Dust removal, freshening · Ambient Air</p>
                    </div>
                    <span className="text-xs font-medium text-ink tabular-nums">20 min</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Parameters & Pricing */}
          {activeTab === "parameters" && (
            <MachineParameterForm
              key={machine.id}
              machine={machine}
              branchId={branchId}
              userRole={userRole}
              onMachineUpdated={onMachineUpdated}
            />
          )}
        </div>
      </div>
    </div>
  );
}
