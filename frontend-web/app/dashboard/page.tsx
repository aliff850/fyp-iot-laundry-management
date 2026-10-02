"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
import { RefreshCw, CheckCircle2, Layers, Sliders, ArrowLeft } from "lucide-react";
import Link from "next/link";

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const branchParam = searchParams.get("branch") || "msu-shah-alam";

  const [activeTab, setActiveTab] = useState<NavTab>("overview");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState(branchParam);

  const [machines, setMachines] = useState<Machine[]>([]);
  const [sensorData, setSensorData] = useState<LpgSensorData | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySummary | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);

  // Sync state if URL changes
  useEffect(() => {
    if (branchParam && branchParam !== selectedBranch) {
      setSelectedBranch(branchParam);
    }
  }, [branchParam]);

  const handleBranchChange = (branchId: string) => {
    setSelectedBranch(branchId);
    router.push(`/dashboard?branch=${branchId}`);
  };

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
      if (machineRes.data.length > 0) {
        // Filter by branch if machine has branch_id, or display fleet
        setMachines(machineRes.data);
      }
      if (sensorRes.data) {
        setSensorData(sensorRes.data);
      }
      if (telemetryRes.data) setTelemetry(telemetryRes.data);
    } catch (err) {
      console.error("[Dashboard] Refresh failed:", err);
    } finally {
      setIsRefreshing(false);
    }
  }, [selectedBranch]);

  useEffect(() => {
    refreshAllData();
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
    <div className="min-h-screen bg-[#E7ECF3] flex flex-col font-sans">
      {/* Top Header */}
      <Header
        branches={branches}
        selectedBranch={selectedBranch}
        onSelectBranch={handleBranchChange}
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
          {/* Top Bar */}
          <div className="flex items-center justify-between gap-3 pb-3 border-b-2 border-slate-300">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-slate-300 bg-white hover:bg-slate-100 hover:border-slate-400 text-xs font-bold text-slate-700 shadow-2xs transition-all"
                title="Return to Branch Selection"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
                <span>All Branches</span>
              </Link>

              <div className="h-6 w-0.5 bg-slate-300 hidden sm:block" />

              <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 capitalize">
                {activeTab === "overview"
                  ? "Operations Overview"
                  : activeTab === "fleet"
                  ? "Machine Fleet"
                  : activeTab === "parameters"
                  ? "Operating Parameters"
                  : activeTab === "safety"
                  ? "LPG & Safety"
                  : "Consumption & Performance"}
              </h2>

              <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-white text-msu border-2 border-msu-border/40 shadow-2xs">
                {selectedBranch.toUpperCase()}
              </span>
            </div>

            <button
              onClick={refreshAllData}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border-2 border-slate-300 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-400 text-xs font-bold shadow-2xs transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-msu" : "text-slate-500"}`} />
              <span>Sync</span>
            </button>
          </div>

          {/* Toast Notification Banner */}
          {toastMessage && (
            <div className="p-3 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-lg flex items-center justify-between animate-in slide-in-from-top-2 duration-150">
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
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 font-mono">
                    Laundry Fleet ({machines.length} Units)
                  </h3>
                  <button
                    onClick={() => setActiveTab("fleet")}
                    className="text-xs font-bold text-msu hover:underline font-mono"
                  >
                    View All &rarr;
                  </button>
                </div>
                <MachineGrid
                  machines={machines}
                  onCommand={handleCommand}
                  onEditParameters={(m) => setEditingMachine(m)}
                />
              </div>

              {/* Telemetry Summary */}
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
            <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/50">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 font-mono">
                  Parameter Configuration
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-600 font-bold uppercase tracking-wider text-[10px] border-b-2 border-slate-200 font-mono">
                    <tr>
                      <th className="py-3 px-4">Machine</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Price</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Temp</th>
                      <th className="py-3 px-4">Speed</th>
                      <th className="py-3 px-4">Door</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium">
                    {machines.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">{m.name}</td>
                        <td className="py-3 px-4 uppercase font-mono text-slate-500">{m.type}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              m.status === "RUNNING"
                                ? "bg-blue-100 text-blue-800 border-blue-300"
                                : m.status === "IDLE"
                                ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                                : "bg-red-100 text-red-800 border-red-300"
                            }`}
                          >
                            {m.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-msu font-mono">RM {m.parameters.price.toFixed(2)}</td>
                        <td className="py-3 px-4">{m.parameters.duration_mins}m</td>
                        <td className="py-3 px-4">{m.parameters.temp_celsius}°C</td>
                        <td className="py-3 px-4">{m.parameters.spin_speed} RPM</td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-bold ${m.parameters.door_locked ? "text-emerald-700" : "text-amber-700"}`}>
                            {m.parameters.door_locked ? "Locked" : "Unlocked"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setEditingMachine(m)}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 font-bold text-slate-700 shadow-2xs transition-colors"
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
              <div className="bg-white p-5 rounded-2xl border-2 border-slate-300 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-msu" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 font-mono">
                    Hardware Channels & Pinout
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-slate-50 border-2 border-slate-200">
                    <span className="text-[10px] font-mono font-bold text-msu uppercase">ADC1 Pin 34</span>
                    <h5 className="font-bold text-slate-900 mt-1">MQ-6 Gas Sensor</h5>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">&gt;1.30V (&gt;1000 PPM Limit)</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border-2 border-slate-200">
                    <span className="text-[10px] font-mono font-bold text-emerald-700 uppercase">GPIO Pin 4</span>
                    <h5 className="font-bold text-slate-900 mt-1">DHT22 Digital Sensor</h5>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">Temp & Humidity Bus</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border-2 border-slate-200">
                    <span className="text-[10px] font-mono font-bold text-blue-700 uppercase">HX711 Channel</span>
                    <h5 className="font-bold text-slate-900 mt-1">50KG Cylinder Scale</h5>
                    <p className="text-[11px] text-slate-500 font-mono mt-0.5">Load Cell Bus</p>
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

      {/* Machine Details & Parameter Modal */}
      <ParameterModal
        machine={editingMachine}
        isOpen={!!editingMachine}
        onClose={() => setEditingMachine(null)}
        onSave={handleSaveParameters}
        onCommand={handleCommand}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#E7ECF3] flex items-center justify-center">
          <div className="flex items-center gap-2 font-mono text-sm font-bold text-slate-600">
            <RefreshCw className="w-4 h-4 animate-spin text-msu" />
            <span>Loading MSU SpinSense Operations...</span>
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
