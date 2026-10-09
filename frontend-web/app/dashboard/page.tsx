"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { Sidebar, NavTab } from "@/components/Sidebar";
import { LpgSafetyPanel } from "@/components/LpgSafetyPanel";
import { LpgManifoldRack } from "@/components/LpgManifoldRack";
import { MachineGrid } from "@/components/MachineGrid";
import { ParameterModal } from "@/components/ParameterModal";
import { AddMachineModal } from "@/components/AddMachineModal";
import { AuthModal } from "@/components/AuthModal";
import { TelemetrySection } from "@/components/TelemetrySection";
import {
  getBranches,
  getMachines,
  getLatestSensorData,
  getLpgManifold,
  getTelemetry,
  issueCommand,
  updateParameters,
} from "@/lib/api";
import {
  Branch,
  LpgCylinder,
  LpgSensorData,
  Machine,
  MachineParameters,
  MachineType,
  TelemetrySummary,
} from "@/types";
import { RefreshCw, CheckCircle2, Layers, Sliders, ArrowLeft, Plus, ShieldAlert, Cpu } from "lucide-react";
import Link from "next/link";

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const branchParam = searchParams.get("branch") || "msu-shah-alam";

  const [activeTab, setActiveTab] = useState<NavTab>("overview");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState(branchParam);

  const [machines, setMachines] = useState<Machine[]>([]);
  const [lpgCylinders, setLpgCylinders] = useState<LpgCylinder[]>([]);
  const [sensorData, setSensorData] = useState<LpgSensorData | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetrySummary | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null);

  // Modals state
  const [isAddMachineOpen, setIsAddMachineOpen] = useState(false);
  const [addMachineType, setAddMachineType] = useState<MachineType>("washer");
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [operatorName, setOperatorName] = useState("MSU Operator");

  useEffect(() => {
    const stored = localStorage.getItem("msu_operator_name");
    if (stored) setOperatorName(stored);
  }, []);

  // Sync state if URL query changes
  useEffect(() => {
    if (branchParam && branchParam !== selectedBranch) {
      setSelectedBranch(branchParam);
    }
  }, [branchParam, selectedBranch]);

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
      const [branchRes, machineRes, lpgRes, sensorRes, telemetryRes] = await Promise.all([
        getBranches(),
        getMachines(selectedBranch),
        getLpgManifold(selectedBranch),
        getLatestSensorData(),
        getTelemetry(selectedBranch),
      ]);

      if (branchRes.data.length > 0) setBranches(branchRes.data);
      if (machineRes.data.length > 0) {
        setMachines(machineRes.data);
      }
      if (lpgRes.data.length > 0) {
        setLpgCylinders(lpgRes.data);
      }
      if (sensorRes.data) {
        setSensorData(sensorRes.data);
      }
      if (telemetryRes.data) {
        setTelemetry(telemetryRes.data);
      }
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

  const handleCommand = async (machineId: string, cmd: "start" | "pause" | "stop" | "unlock") => {
    const res = await issueCommand(machineId, cmd);
    if (res.success) {
      showToast(`Command '${cmd.toUpperCase()}' dispatched to ${machineId}`);
      await refreshAllData();
    } else {
      showToast(`Failed to execute '${cmd}' on ${machineId}`);
    }
  };

  const handleSaveParameters = async (machineId: string, params: MachineParameters) => {
    const res = await updateParameters(machineId, params);
    if (res.success) {
      showToast(`Parameters saved and pushed to ${machineId}`);
      await refreshAllData();
    } else {
      showToast(`Failed to update parameters for ${machineId}`);
    }
  };

  const openAddMachineModal = (type: MachineType) => {
    setAddMachineType(type);
    setIsAddMachineOpen(true);
  };

  const runningCount = machines.filter((m) => m.status === "RUNNING").length;
  const currentBranchMeta = branches.find((b) => b.id === selectedBranch);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      {/* Top Header */}
      <Header
        branches={branches}
        selectedBranch={selectedBranch}
        onSelectBranch={handleBranchChange}
        operatorName={operatorName}
        onAuthClick={() => setIsAuthOpen(true)}
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
          {/* Top Bar with Branch Context & Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/branches"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs transition-all"
                title="Return to Branch Selection"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-slate-500" />
                <span>All Branches</span>
              </Link>

              <div className="h-5 w-px bg-slate-200 hidden sm:block" />

              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                {activeTab === "overview"
                  ? "Operations Overview"
                  : activeTab === "fleet"
                  ? "Segregated Machine Fleet"
                  : activeTab === "lpg"
                  ? "Multi-Cylinder LPG Management"
                  : activeTab === "safety"
                  ? "Environmental Safety & Air Quality"
                  : activeTab === "parameters"
                  ? "Firmware Operating Parameters"
                  : "Consumption & Revenue Analytics"}
              </h2>

              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white text-msu border border-msu-border shadow-2xs">
                {currentBranchMeta?.name || selectedBranch.toUpperCase()}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => openAddMachineModal("washer")}
                className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-msu hover:bg-msu-dark text-white text-xs font-semibold shadow-xs transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Machine</span>
              </button>

              <button
                onClick={refreshAllData}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-2xs transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-msu" : "text-slate-500"}`} />
                <span>Sync</span>
              </button>
            </div>
          </div>

          {/* Toast Notification Banner */}
          {toastMessage && (
            <div className="p-3 rounded-lg bg-slate-900 text-white text-xs font-semibold shadow-md flex items-center justify-between animate-in slide-in-from-top-2 duration-150">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                <span>{toastMessage}</span>
              </div>
              <button onClick={() => setToastMessage(null)} className="text-slate-400 hover:text-white text-xs">
                ✕
              </button>
            </div>
          )}

          {/* TAB 1: OPERATIONS OVERVIEW */}
          {activeTab === "overview" && (
            <div className="space-y-6">
              {/* Environmental Safety Hazard Banner & Sensor Strip */}
              {sensorData && <LpgSafetyPanel sensorData={sensorData} />}

              {/* Dedicated Multi-Cylinder LPG Rack */}
              <LpgManifoldRack
                branchId={selectedBranch}
                cylinders={lpgCylinders}
                onCylinderUpdated={(updated) => {
                  setLpgCylinders((prev) =>
                    prev.map((c) => (c.cylinder_id === updated.cylinder_id ? updated : c))
                  );
                }}
              />

              {/* Segregated Laundry Fleet: Washers and Dryers */}
              <MachineGrid
                machines={machines}
                onCommand={handleCommand}
                onEditParameters={(m) => setEditingMachine(m)}
                onAddMachine={openAddMachineModal}
              />

              {/* Consumption, Revenue, and Gas Efficiency Analytics */}
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

          {/* TAB 2: SEGREGATED MACHINE FLEET */}
          {activeTab === "fleet" && (
            <div className="space-y-4">
              <MachineGrid
                machines={machines}
                onCommand={handleCommand}
                onEditParameters={(m) => setEditingMachine(m)}
                onAddMachine={openAddMachineModal}
              />
            </div>
          )}

          {/* TAB 3: DEDICATED MULTI-CYLINDER LPG MANAGEMENT */}
          {activeTab === "lpg" && (
            <div className="space-y-6">
              <LpgManifoldRack
                branchId={selectedBranch}
                cylinders={lpgCylinders}
                onCylinderUpdated={(updated) => {
                  setLpgCylinders((prev) =>
                    prev.map((c) => (c.cylinder_id === updated.cylinder_id ? updated : c))
                  );
                }}
              />

              {/* LPG Manifold Rack Technical Specs */}
              <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-msu" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    LPG Manifold Auto-Switch & Maintenance Protocol
                  </h4>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Commercial gas dryers draw fuel through a multi-cylinder automatic changeover manifold. When cylinders require replacement, toggle <strong>Tank Swap Mode</strong> on the respective channel to freeze depletion alarms and calibrate tare baseline without triggering false gas depletion alerts.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: ENVIRONMENTAL SAFETY */}
          {activeTab === "safety" && (
            <div className="space-y-6">
              {sensorData && <LpgSafetyPanel sensorData={sensorData} />}

              {/* Hardware Topology Card */}
              <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-msu" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    ESP32 Edge Peripheral Architecture & Pinout
                  </h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-semibold text-msu uppercase">ADC1 Pin 34</span>
                    <h5 className="font-bold text-slate-900 mt-1">MQ-6 Gas Sensor</h5>
                    <p className="text-xs text-slate-500 mt-0.5">Threshold &gt;1.30V (&gt;1000 PPM)</p>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-semibold text-green-700 uppercase">GPIO Pin 4</span>
                    <h5 className="font-bold text-slate-900 mt-1">DHT22 Digital Sensor</h5>
                    <p className="text-xs text-slate-500 mt-0.5">Temp (&lt;45°C limit) & Humidity</p>
                  </div>
                  <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                    <span className="text-[10px] font-semibold text-blue-700 uppercase">HX711 Bus</span>
                    <h5 className="font-bold text-slate-900 mt-1">4-Channel Load Cell Array</h5>
                    <p className="text-xs text-slate-500 mt-0.5">Individual 50kg Cylinders Scale</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PARAMETERS TABLE */}
          {activeTab === "parameters" && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Operational Parameters Table
                </h3>
                <span className="text-xs text-slate-500">
                  Click &apos;Edit&apos; to modify firmware configuration
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-600 font-semibold uppercase tracking-wider text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Machine</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Capacity</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Price</th>
                      <th className="py-3 px-4">Duration</th>
                      <th className="py-3 px-4">Temp</th>
                      <th className="py-3 px-4">Speed</th>
                      <th className="py-3 px-4">Door Lock</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-medium">
                    {machines.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-bold text-slate-900">{m.name}</td>
                        <td className="py-3 px-4 uppercase text-slate-500">{m.type}</td>
                        <td className="py-3 px-4">{m.capacity_kg ?? 15} kg</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                              m.status === "RUNNING"
                                ? "bg-blue-100 text-blue-700"
                                : m.status === "IDLE"
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
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
                          <span className={`text-xs font-semibold ${m.parameters.door_locked ? "text-green-700" : "text-amber-700"}`}>
                            {m.parameters.door_locked ? "Locked" : "Unlocked"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setEditingMachine(m)}
                            className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700 shadow-2xs transition-colors"
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

          {/* TAB 6: TELEMETRY & CONSUMPTION */}
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

      {/* Add Machine Provisioning Modal */}
      <AddMachineModal
        branchId={selectedBranch}
        defaultType={addMachineType}
        isOpen={isAddMachineOpen}
        onClose={() => setIsAddMachineOpen(false)}
        onMachineAdded={(newM) => {
          setMachines((prev) => [...prev, newM]);
          showToast(`Appliance ${newM.id} registered and connected!`);
        }}
      />

      {/* Operator Authentication Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={(name) => {
          setOperatorName(name);
          showToast(`Welcome, ${name}!`);
        }}
      />
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
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
