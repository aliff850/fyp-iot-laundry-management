"use client";

import React, { useState } from "react";
import { LpgCylinder } from "@/types";
import { Flame, Wrench, CheckCircle2 } from "lucide-react";
import { toggleLpgMaintenance } from "@/lib/api";

interface LpgManifoldRackProps {
  branchId: string;
  cylinders: LpgCylinder[];
  onCylinderUpdated?: (updated: LpgCylinder) => void;
}

export function LpgManifoldRack({ branchId, cylinders, onCylinderUpdated }: LpgManifoldRackProps) {
  const [loadingCylId, setLoadingCylId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const totalCapacityKg = cylinders.reduce((acc, c) => acc + c.max_capacity_kg, 0);
  const totalWeightKg = cylinders.reduce((acc, c) => acc + c.weight_kg, 0);
  const warningCount = cylinders.filter((c) => c.status === "WARNING" && !c.maintenance_mode).length;
  const criticalCount = cylinders.filter((c) => c.status === "CRITICAL" && !c.maintenance_mode).length;
  const maintenanceCount = cylinders.filter((c) => c.maintenance_mode).length;

  const handleToggleMaintenance = async (cyl: LpgCylinder) => {
    setLoadingCylId(cyl.cylinder_id);
    const newMode = !cyl.maintenance_mode;
    const res = await toggleLpgMaintenance(branchId, cyl.cylinder_id, newMode);
    setLoadingCylId(null);
    if (res.success && res.cylinder) {
      if (onCylinderUpdated) onCylinderUpdated(res.cylinder);
      setActionNotice(
        newMode
          ? `${cyl.label}: Swap Mode enabled. Depletion alerts silenced.`
          : `${cyl.label}: Telemetry monitoring resumed.`
      );
      setTimeout(() => setActionNotice(null), 3500);
    }
  };

  const handleTare = async (cyl: LpgCylinder, action: "tare_full" | "tare_empty") => {
    setLoadingCylId(cyl.cylinder_id);
    const res = await toggleLpgMaintenance(branchId, cyl.cylinder_id, cyl.maintenance_mode, action);
    setLoadingCylId(null);
    if (res.success && res.cylinder) {
      if (onCylinderUpdated) onCylinderUpdated(res.cylinder);
      setActionNotice(
        action === "tare_full"
          ? `${cyl.label}: Calibrated 50.0 kg full baseline.`
          : `${cyl.label}: Calibrated 0.0 kg empty baseline.`
      );
      setTimeout(() => setActionNotice(null), 3500);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-4">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 shrink-0 rounded-lg bg-msu-light text-msu flex items-center justify-center">
            <Flame className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-800 leading-tight">LPG Manifold Rack</h3>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              {cylinders.length} cylinders
            </p>
          </div>
        </div>

        {/* Aggregate KPI */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {totalWeightKg.toFixed(1)} / {totalCapacityKg.toFixed(1)} kg
          </span>
          {criticalCount > 0 ? (
            <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 animate-pulse">
              {criticalCount} Critical
            </span>
          ) : warningCount > 0 ? (
            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-700">{warningCount} Low</span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">Normal</span>
          )}
          {maintenanceCount > 0 && (
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {maintenanceCount} Swap Mode
            </span>
          )}
        </div>
      </div>

      {/* Notice Banner */}
      {actionNotice && (
        <div className="p-3 rounded-lg bg-slate-900 text-white text-xs font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionNotice}</span>
          </div>
          <button
            onClick={() => setActionNotice(null)}
            className="text-slate-400 hover:text-white px-1.5 py-0.5"
            aria-label="Dismiss notice"
          >
            ✕
          </button>
        </div>
      )}

      {/* Cylinders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cylinders.map((cyl) => {
          const isMaint = cyl.maintenance_mode;
          const isCrit = cyl.capacity_percent < 5 && !isMaint;
          const isWarn = cyl.capacity_percent < 15 && !isCrit && !isMaint;
          const isLoading = loadingCylId === cyl.cylinder_id;

          const statusBadge = isMaint
            ? { label: "Swap Mode", color: "bg-slate-100 text-slate-700" }
            : isCrit
            ? { label: "Critical", color: "bg-red-100 text-red-700 animate-pulse" }
            : isWarn
            ? { label: "Low Gas", color: "bg-amber-100 text-amber-700" }
            : { label: "Normal", color: "bg-green-100 text-green-700" };

          const progressColor = isMaint
            ? "bg-slate-400"
            : isCrit
            ? "bg-red-500"
            : isWarn
            ? "bg-amber-500"
            : "bg-green-500";

          return (
            <div
              key={cyl.cylinder_id}
              className={`rounded-xl border p-4 flex flex-col justify-between gap-4 transition-colors ${
                isCrit ? "border-red-500" : isWarn ? "border-amber-500" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="space-y-3">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-6 h-6 shrink-0 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center">
                      {cyl.cylinder_id.replace("CYL-", "")}
                    </span>
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold text-slate-800 leading-tight">
                        {cyl.label}
                      </h4>
                      <span className="block truncate text-xs font-medium text-slate-500">
                        {cyl.channel}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadge.color}`}
                  >
                    {statusBadge.label}
                  </span>
                </div>

                {/* Level Display */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <p className="text-3xl font-extrabold text-slate-900 tracking-tight">
                      {cyl.weight_kg.toFixed(1)}
                      <span className="ml-1 text-xs font-medium text-slate-500">/ 50.0 kg</span>
                    </p>
                    <span className="text-sm font-semibold text-slate-700">
                      {cyl.capacity_percent.toFixed(0)}%
                    </span>
                  </div>

                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                      style={{ width: `${Math.min(100, Math.max(0, cyl.capacity_percent))}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Maintenance & Swap Mode Controls */}
              <div className="pt-4 border-t border-slate-100 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5" />
                    Swap Mode
                  </span>

                  <button
                    type="button"
                    disabled={isLoading}
                    onClick={() => handleToggleMaintenance(cyl)}
                    aria-pressed={isMaint}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      isMaint ? "bg-msu text-white hover:bg-msu-dark" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {isMaint ? "On" : "Off"}
                  </button>
                </div>

                {/* Tare Actions (Only active during Swap Mode) */}
                {isMaint && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleTare(cyl, "tare_full")}
                      className="flex-1 min-w-[84px] py-2 px-2 rounded-lg bg-green-100 hover:bg-green-200 text-green-700 text-xs font-semibold transition-colors text-center"
                      title="Set 50.0 kg calibrated full baseline"
                    >
                      Tare Full
                    </button>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleTare(cyl, "tare_empty")}
                      className="flex-1 min-w-[84px] py-2 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors text-center"
                      title="Set 0.0 kg empty baseline"
                    >
                      Tare Empty
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
