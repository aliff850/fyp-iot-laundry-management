"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/Header";
import { Sidebar, NavTab } from "@/components/Sidebar";
import { LpgSafetyPanel } from "@/components/LpgSafetyPanel";
import { MachineGrid } from "@/components/MachineGrid";
import { ParameterModal } from "@/components/ParameterModal";
import { TelemetrySection } from "@/components/TelemetrySection";
import {
  getBranches,
  getMachines,
  getLatestSensorData,
  getTelemetry,
  issueCommand,
  updateParameters,
} from "@/lib/api";
import { Branch, LpgSensorData, Machine, MachineParameters, TelemetrySummary } from "@/types";
import { RefreshCw, CheckCircle2, AlertTriangle, Layers, Sliders } from "lucide-react";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<NavTab>("overview");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("msu-shah-alam");

  const [machines, setMachines] = useState<Machine[]>([]);
  const [sensorData, setSensorData] = useState<LpgSensorData | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySummary | null>(null);

  const [isBackendConnected, setIsBackendConnected] = useState(false);
  const [isEsp32Live, setIsEsp32Live] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Polling data fetcher
  const refreshAllData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const [branchRes, machineRes, sensorRes, telemetryRes] = await Promise.all([
        getBranches(),
        getMachines(),
        getLatestSensorData(),
        getTelemetry(selectedBranch),
      ]);

      if (branchRes.data.length > 0) setBranches(branchRes.data);
      if (machineRes.data.length > 0) setMachines(machineRes.data);
      if (sensorRes.data) {
        setSensorData(sensorRes.data);
        setIsEsp32Live(sensorRes.data.is_live_stream);
      }
      if (telemetryRes.data) setTelemetry(telemetryRes.data);

      setIsBackendConnected(machineRes.isLive || sensorRes.isLive);
    } catch (err) {
      console.error("[Dashboard] Refresh failed:", err);
      setIsBackendConnected(false);
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedBranch]);

  useEffect(() => {
    refreshAllData();
    // Poll every 4 seconds per PRD non-functional requirements
    const interval = setInterval(refreshAllData, 4000);
    return () => clearInterval(interval);
  }, [refreshAllData]);

  const handleCommand = async (machineId: string, cmd: "start" | "pause" | "stop") => {
    const res = await issueCommand(machineId, cmd);
    if (res.success) {
      showToast(`Command '${cmd.toUpperCase()}' sent to ${machineId}`);
      await refreshAllData();
    } else {
      showToast(`Failed to execute '${cmd}' on ${machineId}`);
    }
  };

  const handleSaveParameters = async (machineId: string, params: MachineParameters) => {
    const res = await updateParameters(machineId, params);
    if (res.success) {
      showToast(`Parameters updated for ${machineId}`);
      await refreshAllData();
    } else {
      showToast(`Failed to update parameters for ${machineId}`);
    }
  };

  const runningCount = machines.filter((m) => m.status === "RUNNING").length;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        branches={branches}
        selectedBranch={selectedBranch}
        onSelectBranch={setSelectedBranch}
        isBackendConnected={isBackendConnected}
        isEsp32Live={isEsp32Live}
      />

      {/* Main Layout Body */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          runningCount={runningCount}
          totalMachines={machines.length}
        />

        {/* Content Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 overflow-x-hidden">
          {/* Top Banner & Refresh Trigger */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 capitalize">
                  {activeTab === "overview"
                    ? "Branch Operations Overview"
                    : activeTab === "fleet"
                    ? "Commercial Machine Fleet"
                    : activeTab === "parameters"
                    ? "Machine Operating Parameters"
                    : activeTab === "safety"
                    ? "LPG Cylinders & Hazard Safety"
                    : "Consumption & Performance Analytics"}
                </h2>
                <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-msu-light text-msu border border-msu-border/30">
                  {selectedBranch.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Centralized telemetry & remote command center for self-service operators.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={refreshAllData}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-msu" : "text-slate-400"}`} />
                <span>Sync Telemetry</span>
              </button>
            </div>
          </div>

          {/* Toast Notification Banner */}
          {toastMessage && (
            <div className="p-3 rounded-lg bg-slate-900 text-white text-xs font-medium shadow-lg flex items-center justify-between animate-in slide-in-from-top-2 duration-150">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{toastMessage}</span>
              </div>
              <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white text-xs font-mono">
                ✕
              </button>
            </div>
          )}

          {/* Dynamic Content Views */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* LPG & Environmental Safety Section */}
              {sensorData && <LpgSafetyPanel sensorData={sensorData} />}

              {/* Machine Fleet Overview */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">
                    Live Laundry Fleet ({machines.length} Units)
                  </h3>
                  <button
                    onClick={() => setActiveTab("fleet")}
                    className="text-xs font-bold text-msu hover:underline"
                  >
                    View All Fleet &rarr;
                  </button>
                </div>
                <MachineGrid
                  machines={machines}
                  onCommand={handleCommand}
                  onEditParameters={(m) => setEditingMachine(m)}
                />
              </div>

              {/* Quick Telemetry Summary */}
              {telemetry && (
                <TelemetrySection
                  telemetry={telemetry}
                  onTimeframeChange={async (tf) => {
                    const res = await getTelemetry(selectedBranch, tf);
                    if (res.data) setTelemetry(res.data);
                  }}
                />
              )}
            </div>
          )}

          {activeTab === "fleet" && (
            <div className="space-y-4">
              <MachineGrid
                machines={machines}
                onCommand={handleCommand}
                onEditParameters={(m) => setEditingMachine(m)}
              />
            </div>
          )}

          {activeTab === "parameters" && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Operating Parameter Configuration</h3>
                  <p className="text-xs text-slate-500">Configure cycle pricing, duration, temperature, and door locks per machine</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Machine</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Cycle Price</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Temp</th>
                      <th className="py-3 px-4">Spin Speed</th>
                      <th className="py-3 px-4">Door Lock</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {machines.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">{m.name}</td>
                        <td className="py-3 px-4 uppercase font-mono text-slate-500">{m.type}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              m.status === "RUNNING"
                                ? "bg-blue-100 text-blue-700"
                                : m.status === "IDLE"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {m.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-msu font-mono">RM {m.parameters.price.toFixed(2)}</td>
                        <td className="py-3 px-4">{m.parameters.duration_mins} mins</td>
                        <td className="py-3 px-4">{m.parameters.temp_celsius}°C</td>
                        <td className="py-3 px-4">{m.parameters.spin_speed} RPM</td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-semibold ${m.parameters.door_locked ? "text-emerald-700" : "text-amber-700"}`}>
                            {m.parameters.door_locked ? "Locked" : "Unlocked"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setEditingMachine(m)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 font-bold text-slate-700 shadow-2xs"
                          >
                            <Sliders className="w-3 h-3 text-slate-400" />
                            <span>Edit</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === "safety" && (
            <div className="space-y-6">
              {sensorData && <LpgSafetyPanel sensorData={sensorData} />}

              {/* Hardware Topology Card */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-msu" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Physical IoT Node Pinout & Telemetry Channel Mapping
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-mono font-bold text-msu uppercase">Node 01 • MQ-6 Analog</span>
                    <h5 className="font-bold text-slate-900 mt-1">LPG Gas Concentration</h5>
                    <p className="text-[11px] text-slate-500 mt-0.5">ESP32 Pin GPIO 34 (ADC1). Voltage threshold &gt;1.3V triggers urgent buzzer and alert banner.</p>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-mono font-bold text-emerald-600 uppercase">Node 01 • DHT22 Digital</span>
                    <h5 className="font-bold text-slate-900 mt-1">Temperature & Humidity</h5>
                    <p className="text-[11px] text-slate-500 mt-0.5">ESP32 Pin GPIO 4. Reads room humidity and exhaust temperature every 5 seconds.</p>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-mono font-bold text-blue-600 uppercase">Node 02 • HX711 Load Cell</span>
                    <h5 className="font-bold text-slate-900 mt-1">50KG Cylinder Scale (Simulated)</h5>
                    <p className="text-[11px] text-slate-500 mt-0.5">Pending hardware integration. Backend provides calibrated simulated weight metrics.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "telemetry" && telemetry && (
            <div className="space-y-6">
              <TelemetrySection
                telemetry={telemetry}
                onTimeframeChange={async (tf) => {
                  const res = await getTelemetry(selectedBranch, tf);
                  if (res.data) setTelemetry(res.data);
                }}
              />
            </div>
          )}
        </main>
      </div>

      {/* Parameter Edit Modal */}
      <ParameterModal
        machine={editingMachine}
        isOpen={!!editingMachine}
        onClose={() => setEditingMachine(null)}
        onSave={handleSaveParameters}
      />
    </div>
  );
}
