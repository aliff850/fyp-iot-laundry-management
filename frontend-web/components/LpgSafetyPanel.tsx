"use client";

import React from "react";
import { LpgSensorData } from "@/types";
import { calculateLpgPpm } from "@/lib/gasCalculator";
import {
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Thermometer,
  Droplets,
  Scale,
  Radio,
  Activity,
} from "lucide-react";

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

  // Calculate real-time PPM from MQ-6 voltage
  const gasMetrics = calculateLpgPpm(voltage);

  const isLowGas = lpgCap < 15;
  const isCriticalGas = lpgCap < 5;
  const isHighHeat = temp > 45;

  return (
    <div className="space-y-4">
      {/* Enlarged Prominent LPG Hazard Status Banner */}
      <div
        className={`p-6 sm:p-7 rounded-2xl border-2 shadow-md transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-6 ${
          gasMetrics.status === "CRITICAL"
            ? "bg-red-100 border-red-600 text-red-950 animate-pulse"
            : gasMetrics.status === "WARNING"
            ? "bg-amber-100 border-amber-600 text-amber-950"
            : gasMetrics.status === "ELEVATED"
            ? "bg-amber-50 border-amber-500 text-amber-950"
            : "bg-emerald-50 border-emerald-600 text-emerald-950"
        }`}
      >
        {/* Left: Extra-Large Status Icon & Headline */}
        <div className="flex items-center gap-5">
          <div
            className={`w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
              gasMetrics.status === "CRITICAL"
                ? "bg-red-600 text-white"
                : gasMetrics.status === "WARNING"
                ? "bg-amber-600 text-white"
                : gasMetrics.status === "ELEVATED"
                ? "bg-amber-500 text-white"
                : "bg-emerald-600 text-white"
            }`}
          >
            {gasMetrics.status === "CRITICAL" ? (
              <AlertTriangle className="w-9 h-9 sm:w-11 sm:h-11" />
            ) : gasMetrics.status === "WARNING" ? (
              <AlertCircle className="w-9 h-9 sm:w-11 sm:h-11" />
            ) : (
              <CheckCircle2 className="w-9 h-9 sm:w-11 sm:h-11" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-black tracking-widest uppercase text-slate-500 font-mono">
                LPG SAFETY STATUS
              </span>
              <span
                className={`text-xs font-black px-3 py-0.5 rounded-full uppercase tracking-wider font-mono shadow-xs ${gasMetrics.badgeClass}`}
              >
                {gasMetrics.statusLabel}
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight mt-1 text-slate-950">
              {gasMetrics.status === "CRITICAL"
                ? "HAZARDOUS GAS LEAK"
                : gasMetrics.status === "WARNING"
                ? "ELEVATED GAS WARNING"
                : "ATMOSPHERE SAFE"}
            </h3>
          </div>
        </div>

        {/* Right: Prominent Metrics Readout */}
        <div className="flex items-center gap-6 sm:gap-8 self-start lg:self-auto border-t lg:border-t-0 pt-4 lg:pt-0 border-slate-300/80">
          {/* Large PPM Metric */}
          <div className="text-left lg:text-right">
            <span className="block text-xs font-black uppercase tracking-wider text-slate-600 font-mono">
              CONCENTRATION
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-slate-950">
                {gasMetrics.ppm}
              </span>
              <span className="text-sm font-black text-slate-600 uppercase font-mono">PPM</span>
            </div>
          </div>

          <div className="h-12 w-0.5 bg-slate-300 hidden sm:block" />

          {/* Sensor Voltage */}
          <div className="text-left lg:text-right">
            <span className="block text-xs font-black uppercase tracking-wider text-slate-600 font-mono">
              MQ-6 VOLTAGE
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-slate-950">
                {voltage.toFixed(2)}
              </span>
              <span className="text-sm font-black text-slate-600 font-mono">V</span>
            </div>
          </div>

          {/* ESP32 Live Indicator */}
          <div className="hidden xl:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border-2 border-slate-300 text-xs font-mono font-bold text-slate-800 shadow-2xs">
            <Radio className="w-4 h-4 text-emerald-600 animate-pulse" />
            <span>ESP32 Node 01</span>
          </div>
        </div>
      </div>

      {/* Grid of Peripheral Sensor Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* LPG Tank Capacity Widget */}
        <div className="bg-white rounded-2xl border-2 border-slate-300 p-5 shadow-xs flex flex-col justify-between hover:border-slate-400 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-msu" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 font-mono">
                LPG Tank Scale
              </h4>
            </div>
            <span
              className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full font-mono border ${
                isCriticalGas
                  ? "bg-red-100 text-red-800 border-red-300"
                  : isLowGas
                  ? "bg-amber-100 text-amber-800 border-amber-300"
                  : "bg-emerald-100 text-emerald-800 border-emerald-300"
              }`}
            >
              {isCriticalGas ? "CRITICAL" : isLowGas ? "LOW" : "NORMAL"}
            </span>
          </div>

          <div className="my-2 flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                {lpgWeight.toFixed(1)}
              </span>
              <span className="text-sm font-bold text-slate-500 font-mono">
                / {lpgMax.toFixed(0)} kg
              </span>
            </div>
            <span className="text-2xl font-black text-slate-900 font-mono">
              {lpgCap.toFixed(0)}%
            </span>
          </div>

          {/* Cylinder Bar */}
          <div className="mt-2">
            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden border border-slate-300">
              <div
                className={`h-full transition-all duration-500 ${
                  isCriticalGas ? "bg-red-600" : isLowGas ? "bg-amber-500" : "bg-msu"
                }`}
                style={{ width: `${Math.min(100, Math.max(0, lpgCap))}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono font-bold mt-1.5">
              <span>0 kg</span>
              <span>50 kg Tank</span>
            </div>
          </div>
        </div>

        {/* Ambient Temperature (DHT22 Live) */}
        <div className="bg-white rounded-2xl border-2 border-slate-300 p-5 shadow-xs flex flex-col justify-between hover:border-slate-400 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-orange-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 font-mono">
                Temperature
              </h4>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-700 border border-slate-300">
              DHT22
            </span>
          </div>

          <div className="my-2 flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                {temp.toFixed(1)}
              </span>
              <span className="text-lg font-bold text-slate-500 font-mono">°C</span>
            </div>
            <span
              className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
                isHighHeat ? "bg-red-100 text-red-800 border border-red-300" : "text-emerald-700"
              }`}
            >
              {isHighHeat ? "ALERT" : "NORMAL"}
            </span>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-mono font-medium">
            <span>Threshold</span>
            <span>&lt;45°C</span>
          </div>
        </div>

        {/* Ambient Humidity (DHT22 Live) */}
        <div className="bg-white rounded-2xl border-2 border-slate-300 p-5 shadow-xs flex flex-col justify-between hover:border-slate-400 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Droplets className="w-4 h-4 text-blue-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 font-mono">
                Relative Humidity
              </h4>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-slate-100 text-slate-700 border border-slate-300">
              DHT22
            </span>
          </div>

          <div className="my-2 flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                {humidity.toFixed(1)}
              </span>
              <span className="text-lg font-bold text-slate-500 font-mono">%RH</span>
            </div>
            <span className="text-xs font-bold font-mono text-emerald-700">
              {humidity > 80 ? "HIGH" : "OPTIMAL"}
            </span>
          </div>

          <div className="mt-2 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500 font-mono font-medium">
            <span>Target</span>
            <span>40% – 70%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
