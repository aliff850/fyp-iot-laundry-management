"use client";

import React from "react";
import { LpgSensorData } from "@/types";
import { AlertTriangle, CheckCircle2, Flame, Thermometer, Droplets, Scale, Radio } from "lucide-react";

interface LpgSafetyPanelProps {
  sensorData: LpgSensorData;
}

export function LpgSafetyPanel({ sensorData }: LpgSafetyPanelProps) {
  const voltage = sensorData?.voltage ?? 0.85;
  const temp = sensorData?.temperature ?? 28.0;
  const humidity = sensorData?.humidity ?? 65.0;
  const lpgWeight = sensorData?.lpg_weight_kg ?? 38.6;
  const lpgMax = sensorData?.lpg_max_weight_kg ?? 50.0;
  const lpgCap = sensorData?.lpg_capacity_percent ?? 77.2;

  const isLowGas = lpgCap < 15;
  const isCriticalGas = lpgCap < 5;
  const isHighHeat = temp > 45;
  const isLeak = sensorData?.is_leak_detected || sensorData?.leak_status === "CRITICAL" || voltage > 1.3;

  return (
    <div className="space-y-4">
      {/* Critical Gas Leak Banner */}
      {isLeak ? (
        <div className="p-4 rounded-xl bg-red-100 border-2 border-red-500 text-red-800 shadow-md animate-pulse flex items-start gap-3.5">
          <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-red-900">
                CRITICAL HAZARD: LPG Gas Leak Detected!
              </h3>
              <span className="text-xs font-mono font-bold bg-red-600 text-white px-2 py-0.5 rounded">
                MQ-6: {voltage.toFixed(2)}V
              </span>
            </div>
            <p className="text-xs text-red-700 mt-1 font-medium">
              Sensor detected hazardous combustible gas levels. Ventilation protocol triggered. Verify physical cylinder connection immediately.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <div>
              <span className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                LPG Hazard Status: Normal / Safe
              </span>
              <p className="text-[11px] text-emerald-700 font-medium">
                MQ-6 sensor analog level is normal ({voltage.toFixed(2)}V). No gas leak detected.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold text-emerald-800 bg-emerald-100/70 px-2.5 py-1 rounded-md border border-emerald-200">
            <Radio className="w-3 h-3 text-emerald-600 animate-pulse" />
            <span>ESP32 Live Stream</span>
          </div>
        </div>
      )}

      {/* Grid of Telemetry Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* LPG Tank Capacity Widget */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-slate-800">
              <Scale className="w-4 h-4 text-msu" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Dryer LPG Cylinder
              </h4>
            </div>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full font-mono ${
                isCriticalGas
                  ? "bg-red-100 text-red-700 border border-red-300"
                  : isLowGas
                  ? "bg-amber-100 text-amber-700 border border-amber-300"
                  : "bg-emerald-100 text-emerald-700 border border-emerald-300"
              }`}
            >
              {isCriticalGas ? "CRITICAL LOW" : isLowGas ? "DEPLETION WARNING" : "OPTIMAL"}
            </span>
          </div>

          <div className="my-3 flex items-baseline justify-between">
            <div>
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-mono">
                {lpgWeight.toFixed(1)}
              </span>
              <span className="text-xs font-semibold text-slate-500 ml-1">
                / {lpgMax.toFixed(1)} kg
              </span>
            </div>
            <div className="text-right">
              <span className="text-xl font-bold text-slate-800 font-mono">
                {lpgCap.toFixed(0)}%
              </span>
              <span className="block text-[10px] text-slate-400 uppercase">capacity</span>
            </div>
          </div>

          {/* Cylinder Bar */}
          <div className="space-y-1.5">
            <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  isCriticalGas ? "bg-red-500" : isLowGas ? "bg-amber-500" : "bg-msu"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, lpgCap))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400">
              <span>0 kg</span>
              <span className="text-[10px] text-slate-500 font-medium">50kg Commercial Cylinders</span>
              <span>50 kg</span>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Peripheral: 50KG Load Cell</span>
            <span className="italic font-medium text-slate-500">Hardware Simulated</span>
          </div>
        </div>

        {/* Ambient Temperature (DHT22 Live) */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-slate-800">
              <Thermometer className="w-4 h-4 text-orange-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Laundry Hall Ambient Temp
              </h4>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
              DHT22 Live
            </span>
          </div>

          <div className="my-2">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-mono">
                {temp.toFixed(1)}
              </span>
              <span className="text-base font-semibold text-slate-500">°C</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isHighHeat ? (
                <span className="text-red-600 font-semibold">High Heat Alert (&gt;45°C) — Check dryer ducting!</span>
              ) : (
                "Comfortable ventilation baseline"
              )}
            </p>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Threshold limit: 45.0°C</span>
            <span className="font-mono text-slate-600">
              Last: {sensorData?.received_at ? new Date(sensorData.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "Just now"}
            </span>
          </div>
        </div>

        {/* Ambient Humidity (DHT22 Live) */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-slate-800">
              <Droplets className="w-4 h-4 text-blue-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Relative Humidity
              </h4>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
              DHT22 Live
            </span>
          </div>

          <div className="my-2">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight font-mono">
                {humidity.toFixed(1)}
              </span>
              <span className="text-base font-semibold text-slate-500">%RH</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {humidity > 80
                ? "High condensation detected — ensure exhaust fan running."
                : "Optimal room environment"}
            </p>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>Nominal range: 40% – 75%</span>
            <span className="font-mono text-slate-600">ESP32 Pin D4</span>
          </div>
        </div>
      </div>
    </div>
  );
}
