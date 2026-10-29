"use client";

import React, { useState } from "react";
import {
  Scale,
  ShieldCheck,
  ShieldAlert,
  Gauge,
  Layers,
  Thermometer,
  Droplets,
} from "lucide-react";
import type { LpgBranchData, LpgCylinderItem, LpgEnvironmentData } from "@/lib/auth/business";
import { LpgCylinderCard } from "./LpgCylinderCard";
import { LpgSafetyPanel } from "./LpgSafetyPanel";

interface LpgWorkspaceViewProps {
  initialData: LpgBranchData;
  branchId: string;
  userRole: "owner" | "branch_manager" | "machine_maintenance" | "lpg_maintenance";
}

export function LpgWorkspaceView({
  initialData,
  branchId,
  userRole,
}: LpgWorkspaceViewProps) {
  const [data, setData] = useState<LpgBranchData>(initialData);

  const handleCylinderUpdated = (updatedCyl: LpgCylinderItem) => {
    setData(prev => {
      const newCylinders = prev.cylinders.map(c =>
        c.id === updatedCyl.id ? updatedCyl : c
      );
      // Recalculate summary
      const total = newCylinders.length;
      const validCyls = newCylinders.filter(c => c.quality === "valid" && !c.maintenance_mode);
      const totalRemaining = validCyls.reduce((sum, c) => sum + c.remaining_fuel_kg, 0);
      const totalCapacity = validCyls.reduce((sum, c) => sum + c.rated_fuel_capacity_kg, 0);
      const weightedPct = totalCapacity > 0 ? (totalRemaining / totalCapacity) * 100 : 0;

      const criticalCount = newCylinders.filter(c => c.status === "CRITICAL" && !c.maintenance_mode).length;
      const warningCount = newCylinders.filter(c => c.status === "WARNING" && !c.maintenance_mode).length;

      let newStatus: LpgBranchData["summary"]["status"] = "Healthy";
      if (prev.environment.mq6.is_leak_detected) {
        newStatus = "Leak Hazard";
      } else if (criticalCount > 0) {
        newStatus = "Critical Depletion";
      } else if (warningCount > 0) {
        newStatus = "Low Gas Warning";
      }

      const validCount = newCylinders.filter(c => c.quality === "valid").length;
      const covPct = total > 0 ? Math.round((validCount / total) * 100) : 0;

      return {
        ...prev,
        cylinders: newCylinders,
        summary: {
          total_cylinders: total,
          active_cylinders: validCyls.length,
          total_remaining_fuel_kg: Number(totalRemaining.toFixed(2)),
          total_rated_capacity_kg: Number(totalCapacity.toFixed(2)),
          weighted_fuel_percent: Number(weightedPct.toFixed(1)),
          measurement_coverage: `${validCount}/${total} (${covPct}%)`,
          status: newStatus,
        },
      };
    });
  };

  const handleValveUpdated = (valve: LpgEnvironmentData["safety_valve"]) => {
    setData(prev => ({
      ...prev,
      environment: {
        ...prev.environment,
        safety_valve: valve,
      },
    }));
  };

  const summary = data.summary;

  return (
    <div className="space-y-8">
      {/* 1. Header Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {/* <span className="text-xs font-semibold uppercase tracking-wider text-muted">
            LPG Fuel Continuity & Safety
          </span> */}
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
            LPG Levels & Environmental Safety
          </h2>
          {/* <p className="mt-2 max-w-xl text-sm text-muted">
            Real-time load-cell telemetry across commissioned cylinder manifolds, gateway swap mode replacement workflow, and facility environmental hazard detection.
          </p> */}
        </div>
      </div>

      {/* Emergency Hazards & Safety Interventions (Active Leaks, High Heat, Shutoff) */}
      <LpgSafetyPanel
        environment={data.environment}
        incidents={data.incidents}
        branchId={branchId}
        userRole={userRole}
        onValveUpdated={handleValveUpdated}
      />

      {/* 2. Aggregate KPI Metrics Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* KPI 1: Remaining Fuel */}
        <div className="flex flex-col justify-between rounded-md border border-line bg-surface p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Scale className="size-3.5 text-faint" aria-hidden="true" />
            <span>Manifold Fuel Mass</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-semibold text-ink tabular-nums">
              {summary.total_remaining_fuel_kg.toFixed(1)}
            </span>
            <span className="text-xs font-normal text-muted">
              / {summary.total_rated_capacity_kg.toFixed(1)} kg
            </span>
          </div>
          {/* <p className="mt-1 text-[11px] text-faint">Valid load-cell readings</p> */}
        </div>

        {/* KPI 2: Weighted Fuel % (PRD Section 4.4) */}
        <div className="flex flex-col justify-between rounded-md border border-line bg-surface p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Gauge className="size-3.5 text-faint" aria-hidden="true" />
            <span>Weighted Fuel Level</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-semibold text-ink tabular-nums">
              {summary.weighted_fuel_percent.toFixed(1)}%
            </span>
          </div>
          {/* <p className="mt-1 text-[11px] text-faint">
            Coverage: {summary.measurement_coverage}
          </p> */}
        </div>

        {/* KPI 3: Commissioned Cylinders */}
        <div className="flex flex-col justify-between rounded-md border border-line bg-surface p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Layers className="size-3.5 text-faint" aria-hidden="true" />
            <span>Active Cylinders</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-3xl font-semibold text-ink tabular-nums">
              {summary.active_cylinders}
            </span>
            <span className="text-xs font-normal text-muted">
              / {summary.total_cylinders} Online
            </span>
          </div>
          {/* <p className="mt-1 text-[11px] text-faint">4 commissioned stations</p> */}
        </div>

        {/* KPI 4: Manifold Status */}
        <div className="flex flex-col justify-between rounded-md border border-line bg-surface p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <ShieldCheck className="size-3.5 text-faint" aria-hidden="true" />
            <span>System Status</span>
          </div>
          <div className="mt-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-semibold ${summary.status === "Leak Hazard"
                ? "border-negative/50 bg-negative/15 text-negative animate-pulse"
                : summary.status === "Critical Depletion"
                  ? "border-negative/40 bg-negative/10 text-negative"
                  : summary.status === "Low Gas Warning"
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : "border-positive/30 bg-positive/10 text-positive"
                }`}
            >
              <span
                className={`size-1.5 rounded-full ${summary.status === "Healthy"
                  ? "bg-positive"
                  : summary.status === "Low Gas Warning"
                    ? "bg-warning"
                    : "bg-negative"
                  }`}
                aria-hidden="true"
              />
              <span>{summary.status}</span>
            </span>
          </div>
          {/* <p className="mt-1 text-[11px] text-faint">Continuous telemetry sync</p> */}
        </div>
      </div>

      {/* 3. Shared Facility Climate Monitoring (DHT22 Temperature & Humidity) */}
      <section className="space-y-3" aria-labelledby="climate-monitoring-heading">
        <div className="rounded-md border border-line bg-surface p-4 sm:p-5">
          {/* Header Row inside Climate Panel */}
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-rule pb-3.5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-rule bg-raised">
                <Thermometer className="size-5 text-accent" aria-hidden="true" />
              </div>
              <div>
                <h3 id="climate-monitoring-heading" className="text-sm font-semibold text-ink">
                  Shared Environmental Atmosphere
                </h3>
                {/* <p className="mt-0.5 text-xs text-muted">
                  DHT22 Facility Climate Sensor · Ambient laundry hall temperature and moisture telemetry
                </p> */}
              </div>
            </div>
          </div>

          {/* High Heat Warning Callout if triggered */}
          {data.environment.dht22.is_high_heat && (
            <div className="mt-3.5 flex items-start gap-2.5 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning">
              <ShieldAlert className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="font-semibold text-ink">High Ambient Temperature Alert: </span>
                <span>
                  Facility temperature exceeds the 45.0°C safety threshold. Inspect dryer exhaust ductwork and ventilation airflow dampers immediately.
                </span>
              </div>
            </div>
          )}

          {/* Prominent Two-Column Metric Grid on Mobile & Desktop */}
          <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {/* Metric 1: Ambient Temperature */}
            <div className="flex flex-col justify-between rounded-md border border-rule bg-raised/40 p-4 transition-colors hover:border-control/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-muted">
                  <Thermometer className="size-4 text-faint" aria-hidden="true" />
                  <span>Ambient Temperature</span>
                </div>
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${data.environment.dht22.is_high_heat
                    ? "border-warning/50 bg-warning/15 text-warning"
                    : "border-positive/30 bg-positive/10 text-positive"
                    }`}
                >
                  {data.environment.dht22.is_high_heat ? "High Heat" : "Normal"}
                </span>
              </div>

              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold text-ink tabular-nums tracking-tight">
                  {data.environment.dht22.temperature_celsius.toFixed(1)}
                </span>
                <span className="text-sm font-medium text-muted">°C</span>
              </div>
              {/* 
              <div className="mt-3 flex items-center justify-between border-t border-rule/60 pt-2 text-[11px] text-faint">
                <span>Operating Ceiling</span>
                <span className="text-muted tabular-nums">Max 45.0 °C</span>
              </div> */}
            </div>

            {/* Metric 2: Relative Humidity */}
            <div className="flex flex-col justify-between rounded-md border border-rule bg-raised/40 p-4 transition-colors hover:border-control/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-medium text-muted">
                  <Droplets className="size-4 text-faint" aria-hidden="true" />
                  <span>Relative Humidity</span>
                </div>
                <span className="rounded border border-positive/30 bg-positive/10 px-1.5 py-0.5 text-[10px] font-semibold text-positive">
                  Nominal
                </span>
              </div>

              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-semibold text-ink tabular-nums tracking-tight">
                  {data.environment.dht22.humidity_percent.toFixed(1)}
                </span>
                <span className="text-sm font-medium text-muted">% RH</span>
              </div>

              {/* <div className="mt-3 flex items-center justify-between border-t border-rule/60 pt-2 text-[11px] text-faint">
                <span>Target Range</span>
                <span className="text-muted tabular-nums">30% – 70% RH</span>
              </div> */}
            </div>
          </div>
        </div>
      </section>

      {/* 3. Manifold Cylinder Rack (4 Columns on large screen per Frontend-Specs / DESIGN.md) */}
      <section className="space-y-4" aria-labelledby="manifold-rack-heading">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
          <div>
            <h3 id="manifold-rack-heading" className="text-3xl text-base font-semibold text-ink">
              LPG Tank Levels
            </h3>
            {/* <p className="mt-0.5 text-xs text-muted">
              Dedicated per-position load-cell telemetry, gross/tare breakdown, and gateway-confirmed tank replacement.
            </p> */}
          </div>
          {/* <span className="text-xs text-muted tabular-nums">
            {summary.active_cylinders} of {summary.total_cylinders} active
          </span> */}
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {data.cylinders.map(cylinder => (
            <LpgCylinderCard
              key={cylinder.id}
              cylinder={cylinder}
              branchId={branchId}
              userRole={userRole}
              onCylinderUpdated={handleCylinderUpdated}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
