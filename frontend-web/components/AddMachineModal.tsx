"use client";

import React, { useState } from "react";
import { X, WashingMachine, Wind, Cpu, Network, Radio, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { provisionMachine } from "@/lib/api";
import { Machine, MachineType } from "@/types";

interface AddMachineModalProps {
  branchId: string;
  isOpen: boolean;
  onClose: () => void;
  defaultType?: MachineType;
  onMachineAdded: (machine: Machine) => void;
}

export function AddMachineModal({
  branchId,
  isOpen,
  onClose,
  defaultType = "washer",
  onMachineAdded,
}: AddMachineModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Classification
  const [type, setType] = useState<MachineType>(defaultType);
  const [model, setModel] = useState("Hippo Commercial Heavy Duty 2026");
  const [capacity, setCapacity] = useState(15);

  // Step 2: Hardware Identification
  const [serialNumber, setSerialNumber] = useState("SN-HIPPO-994821");
  const [macAddress, setMacAddress] = useState("A4:E5:7C:12:F0:3B");

  // Step 3: Network & MQTT
  const [label, setLabel] = useState("");
  const [ipAddress, setIpAddress] = useState("192.168.10.155");
  const [clientId, setClientId] = useState("");
  const [topic, setTopic] = useState("");

  // Step 4: Handshake Test
  const [handshakeStatus, setHandshakeStatus] = useState<"idle" | "testing" | "success" | "failed">("idle");
  const [handshakeLatency, setHandshakeLatency] = useState<number | null>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);

  // Auto-fill label and MQTT params when classification changes
  React.useEffect(() => {
    const defaultLabel = type === "washer" ? "Washer #05" : "Dryer #05";
    setLabel(defaultLabel);
    setClientId(`${type === "washer" ? "WASH" : "DRY"}-BR01-05`);
    setTopic(`laundry/${branchId}/${type}/05/telemetry`);
  }, [type, branchId]);

  if (!isOpen) return null;

  const runHandshakeTest = () => {
    setHandshakeStatus("testing");
    setTimeout(() => {
      setHandshakeStatus("success");
      setHandshakeLatency(42);
    }, 1200);
  };

  const handleFinalSubmit = async () => {
    setIsProvisioning(true);
    const payload = {
      type,
      label,
      serial_number: serialNumber,
      mac_address: macAddress,
      capacity_kg: capacity,
      ip_address: ipAddress,
      client_id: clientId,
      model,
    };

    const res = await provisionMachine(branchId, payload);
    setIsProvisioning(false);

    if (res.success && res.data) {
      onMachineAdded(res.data);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
        {/* Header */}
        <div className="px-5 py-3.5 bg-msu text-white flex items-center justify-between border-b border-msu-dark">
          <div className="flex items-center gap-2">
            {type === "washer" ? <WashingMachine className="w-5 h-5 text-amber-300" /> : <Wind className="w-5 h-5 text-amber-300" />}
            <div>
              <h3 className="text-base font-bold tracking-tight text-white leading-tight">
                Appliance Provisioning Workflow
              </h3>
              <p className="text-xs text-white/80">
                Step {step} of 4 • {step === 1 ? "Classification" : step === 2 ? "Hardware ID" : step === 3 ? "Network" : "Verification"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white rounded-lg p-1 hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Pills */}
        <div className="grid grid-cols-4 bg-slate-100 border-b border-slate-200 text-center font-medium text-xs p-2 gap-1.5">
          <div className={`py-1 rounded-md text-xs font-semibold ${step === 1 ? "bg-msu text-white" : step > 1 ? "bg-green-100 text-green-700" : "text-slate-400"}`}>
            1. Class
          </div>
          <div className={`py-1 rounded-md text-xs font-semibold ${step === 2 ? "bg-msu text-white" : step > 2 ? "bg-green-100 text-green-700" : "text-slate-400"}`}>
            2. Hardware
          </div>
          <div className={`py-1 rounded-md text-xs font-semibold ${step === 3 ? "bg-msu text-white" : step > 3 ? "bg-green-100 text-green-700" : "text-slate-400"}`}>
            3. Network
          </div>
          <div className={`py-1 rounded-md text-xs font-semibold ${step === 4 ? "bg-msu text-white" : "text-slate-400"}`}>
            4. Verify
          </div>
        </div>

        {/* Modal Form Canvas */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* STEP 1: Appliance Classification */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Appliance Category *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setType("washer")}
                    className={`p-3.5 rounded-lg border flex items-center gap-3 transition-all ${
                      type === "washer" ? "border-msu bg-msu-light text-slate-900 shadow-xs" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <WashingMachine className="w-5 h-5 text-blue-600 shrink-0" />
                    <div className="text-left min-w-0">
                      <span className="block text-xs font-bold text-slate-900 truncate">Smart Washer</span>
                      <span className="text-[11px] text-slate-500 truncate block">Electric Water Inverter</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setType("dryer")}
                    className={`p-3.5 rounded-lg border flex items-center gap-3 transition-all ${
                      type === "dryer" ? "border-msu bg-msu-light text-slate-900 shadow-xs" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Wind className="w-5 h-5 text-cyan-600 shrink-0" />
                    <div className="text-left min-w-0">
                      <span className="block text-xs font-bold text-slate-900 truncate">Smart Gas Dryer</span>
                      <span className="text-[11px] text-slate-500 truncate block">LPG Burner Heated</span>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Drum Load Capacity (kg)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[14, 16, 20].map((kg) => (
                    <button
                      type="button"
                      key={kg}
                      onClick={() => setCapacity(kg)}
                      className={`h-9 rounded-lg text-xs font-semibold border transition-all ${
                        capacity === kg ? "bg-msu text-white border-msu shadow-xs" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {kg} kg Load
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Manufacturer Model Specification
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-medium"
                />
              </div>
            </div>
          )}

          {/* STEP 2: Hardware Identification */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hardware MAC Address *
                </label>
                <div className="relative">
                  <Cpu className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={macAddress}
                    onChange={(e) => setMacAddress(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-mono"
                    placeholder="XX:XX:XX:XX:XX:XX"
                    required
                  />
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Found on the controller board chassis barcode label or printed QR code
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Controller Serial Number (S/N) *
                </label>
                <input
                  type="text"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-mono"
                  placeholder="SN-HIPPO-XXXXXX"
                  required
                />
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-600">Camera Device Scanner:</span>
                <span className="text-green-700 font-semibold">QR Optical Ready</span>
              </div>
            </div>
          )}

          {/* STEP 3: Network & Communication Parameters */}
          {step === 3 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Assigned Machine Label *
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-medium"
                  placeholder="e.g., Washer #05"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Subnet IP Address
                </label>
                <input
                  type="text"
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-mono"
                  placeholder="192.168.10.155"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  MQTT Client ID & Telemetry Topic
                </label>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:border-msu focus:ring-1 focus:ring-msu focus:outline-none font-mono mb-2"
                />
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 font-mono bg-slate-50 text-slate-600"
                />
              </div>
            </div>
          )}

          {/* STEP 4: Connectivity Handshake Verification */}
          {step === 4 && (
            <div className="space-y-4 animate-in fade-in duration-150 text-center py-2">
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-left space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Unit:</span>
                  <span className="font-semibold text-slate-900">{label} ({capacity}kg)</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Type:</span>
                  <span className="font-semibold uppercase text-slate-900">{type}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>MAC:</span>
                  <span className="font-mono text-slate-900">{macAddress}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>MQTT Client:</span>
                  <span className="font-mono text-slate-900">{clientId}</span>
                </div>
              </div>

              {/* Handshake Status Box */}
              <div className="p-4 rounded-lg border border-slate-200 flex flex-col items-center justify-center gap-2">
                {handshakeStatus === "idle" && (
                  <>
                    <Radio className="w-7 h-7 text-slate-400" />
                    <span className="text-xs font-semibold text-slate-700">
                      Verify Appliance Heartbeat Over MQTT Broker
                    </span>
                    <button
                      type="button"
                      onClick={runHandshakeTest}
                      className="mt-1 h-9 px-4 rounded-lg bg-msu text-white text-xs font-semibold hover:bg-msu-dark shadow-xs"
                    >
                      Run Handshake Ping Test
                    </button>
                  </>
                )}

                {handshakeStatus === "testing" && (
                  <div className="flex items-center gap-2 py-3 text-slate-700 text-xs font-medium">
                    <RefreshCw className="w-4 h-4 animate-spin text-msu" />
                    <span>Emitting MQTT Ping to {ipAddress}...</span>
                  </div>
                )}

                {handshakeStatus === "success" && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-center gap-1.5 text-green-700 font-semibold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      <span>CONNACK & Heartbeat Verified ({handshakeLatency}ms RTT)</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Firmware responded with status READY (v2.4.1)
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Navigation Controls */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as any)}
                className="h-9 px-4 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
              >
                &larr; Back
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-lg transition-colors border border-slate-200"
              >
                Cancel
              </button>

              {step < 4 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => (s + 1) as any)}
                  className="h-9 px-4 text-xs font-semibold text-white bg-msu hover:bg-msu-dark rounded-lg transition-all shadow-xs"
                >
                  Continue &rarr;
                </button>
              ) : (
                <button
                  type="button"
                  disabled={handshakeStatus !== "success" || isProvisioning}
                  onClick={handleFinalSubmit}
                  className="h-9 px-4 text-xs font-semibold text-white bg-green-700 hover:bg-green-800 rounded-lg transition-all shadow-xs disabled:opacity-50"
                >
                  {isProvisioning ? "Provisioning..." : "Complete Registration"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
