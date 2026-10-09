"use client";

import React, { useState } from "react";
import { LpgSensorData } from "@/types";
import { calculateLpgPpm } from "@/lib/gasCalculator";
import {
  AlertTriangle,
  CheckCircle2,
  Thermometer,
  Droplets,
  Volume2,
  VolumeX,
  ShieldAlert,
} from "lucide-react";

interface LpgSafetyPanelProps {
  sensorData: LpgSensorData;
}

export function LpgSafetyPanel({ sensorData }: LpgSafetyPanelProps) {
  const [chimeEnabled, setChimeEnabled] = useState(true);

  const voltage = sensorData?.voltage ?? 0.85;
  const temp = sensorData?.temperature ?? 28.0;
  const humidity = sensorData?.humidity ?? 65.0;

  // Calculate real-time PPM from MQ-6 voltage
  const gasMetrics = calculateLpgPpm(voltage);

  const isLeak = sensorData?.is_leak_detected || gasMetrics.status === "CRITICAL" || voltage > 1.3;
  const isHighHeat = temp > 45.0;

  return (
    <div className="space-y-3.5">
      {/* High-Urgency Gas Leak Hazard Banner per DESIGN.md 4.5 */}
      {isLeak ? (
        <div className="p-3.5 sm:p-4 rounded-xl text-red-700 bg-red-100 border border-red-500 shadow-sm animate-pulse flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-red-600 text-white flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider bg-red-200 px-2 py-0.5 rounded-full">
                  LPG Gas Leak Detected
                </span>
                <span className="text-xs font-semibold">
                  {gasMetrics.ppm} PPM ({voltage.toFixed(2)}V)
                </span>
              </div>
              <h3 className="text-sm font-bold tracking-tight mt-0.5 truncate">
                Emergency gas shut-off and facility ventilation required.
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setChimeEnabled(!chimeEnabled)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-200/80 hover:bg-red-200 text-xs font-semibold text-red-800 transition-colors"
            >
              {chimeEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              <span>{chimeEnabled ? "Mute" : "Unmute"}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
            <span className="text-xs font-semibold">Safe — No Gas Detected ({gasMetrics.ppm} PPM nominal)</span>
          </div>
          <span className="text-xs text-green-600 font-medium">MQ-6 Calibrated</span>
        </div>
      )}

      {/* High Heat Warning Banner */}
      {isHighHeat && (
        <div className="p-3.5 rounded-xl bg-amber-100 border border-amber-300 text-amber-800 shadow-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="min-w-0">
              <h4 className="text-xs font-bold tracking-tight truncate">
                High Ambient Temperature ({temp.toFixed(1)}°C &gt; 45°C limit)
              </h4>
              <p className="text-xs font-medium text-amber-700 truncate">
                Check dryer exhaust ventilation and duct clearings.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Environmental Safety Strip: 3 Structured Columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {/* MQ-6 Gas Concentration Readout */}
        <div
          className={`rounded-xl border p-3.5 sm:p-4 shadow-xs flex flex-col justify-between transition-colors ${
            isLeak
              ? "bg-red-50 border-red-500"
              : gasMetrics.status === "WARNING"
              ? "bg-amber-50 border-amber-400"
              : "bg-white border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
              MQ-6 Gas Sensor
            </span>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                isLeak
                  ? "bg-red-100 text-red-700"
                  : gasMetrics.status === "WARNING"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-green-100 text-green-700"
              }`}
            >
              {isLeak ? "Leak Hazard" : gasMetrics.status === "WARNING" ? "Elevated" : "Safe"}
            </span>
          </div>

          <div className="my-1.5 flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {gasMetrics.ppm}
              </span>
              <span className="text-xs font-medium text-slate-500">PPM</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-semibold text-slate-700">
                {voltage.toFixed(2)} V
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Threshold</span>
            <span className="font-semibold text-slate-800">&lt;1000 PPM (1.30V)</span>
          </div>
        </div>

        {/* Ambient Temperature (DHT22) */}
        <div
          className={`rounded-xl border p-3.5 sm:p-4 shadow-xs flex flex-col justify-between transition-colors ${
            isHighHeat ? "bg-red-50 border-red-500" : "bg-white border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">
              <Thermometer className="w-3.5 h-3.5 text-orange-600" />
              <span>Room Temperature</span>
            </div>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                isHighHeat ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
              }`}
            >
              {isHighHeat ? "High Heat" : "Nominal"}
            </span>
          </div>

          <div className="my-1.5 flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {temp.toFixed(1)}
              </span>
              <span className="text-xs font-medium text-slate-500">°C</span>
            </div>
            <span className="text-xs text-slate-400 font-medium">DHT22 Bus</span>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Limit</span>
            <span className="font-semibold text-slate-800">&lt;45.0°C</span>
          </div>
        </div>

        {/* Ambient Relative Humidity (DHT22) */}
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-500">
              <Droplets className="w-3.5 h-3.5 text-blue-600" />
              <span>Relative Humidity</span>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
              {humidity > 75 ? "Humid" : "Optimal"}
            </span>
          </div>

          <div className="my-1.5 flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                {humidity.toFixed(1)}
              </span>
              <span className="text-xs font-medium text-slate-500">%RH</span>
            </div>
            <span className="text-xs text-slate-400 font-medium">ESP32 Node</span>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Target</span>
            <span className="font-semibold text-slate-800">40% – 70%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
