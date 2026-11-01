"use client";

import React, { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { approveDeviceAction } from "@/app/branches/[branchId]/hardware-setup/actions";
import type { DeviceDiscoveryItem } from "@/lib/auth/business";
import { inputClass } from "@/lib/auth/styles";

interface DeviceApprovalModalProps {
  branchId: string;
  candidate: DeviceDiscoveryItem;
  isOpen: boolean;
  onClose: () => void;
  onApproved?: () => void;
}

export function DeviceApprovalModal({
  branchId,
  candidate,
  isOpen,
  onClose,
  onApproved,
}: DeviceApprovalModalProps) {
  const [deviceType, setDeviceType] = useState<string>(candidate.proposed_type || "washer");
  const [label, setLabel] = useState<string>(`Device ${candidate.source_id}`);
  const [sourceKind, setSourceKind] = useState<string>("physical");
  const [capacityKg, setCapacityKg] = useState<string>("15");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);

    const cap = deviceType !== "lpg_edge_node" && capacityKg ? parseFloat(capacityKg) : undefined;

    try {
      const res = await approveDeviceAction(branchId, candidate.candidate_id, {
        device_type: deviceType,
        label: label.trim(),
        source_kind: sourceKind,
        capacity_kg: cap,
      });

      if (res.success) {
        onApproved?.();
        onClose();
      } else {
        setErrorMessage(res.message || "Failed to approve device.");
      }
    } catch {
      setErrorMessage("Network error during device approval.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div className="w-full max-w-md rounded-md border border-line bg-surface p-5 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between border-b border-rule pb-3">
          <h2 id="modalTitle" className="text-base font-semibold text-ink">
            Approve & Commission Device
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded bg-negative/10 border border-negative/30 p-3 text-xs text-negative" role="alert">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">
              Source Identity (MQTT)
            </label>
            <span className="block rounded border border-rule bg-raised px-3 py-2 font-mono text-xs text-ink select-all">
              {candidate.source_id}
            </span>
          </div>

          <div>
            <label htmlFor="labelInput" className="block text-xs font-medium text-muted mb-1">
              Operational Label *
            </label>
            <input
              id="labelInput"
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className={inputClass}
              placeholder="e.g. Washer #01 or LPG Edge Node"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="typeSelect" className="block text-xs font-medium text-muted mb-1">
                Device Type *
              </label>
              <select
                id="typeSelect"
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value)}
                className={inputClass}
              >
                <option value="washer">Washer</option>
                <option value="dryer">Dryer</option>
                <option value="washer_dryer">Washer/Dryer</option>
                <option value="lpg_edge_node">LPG Edge Node</option>
              </select>
            </div>

            <div>
              <label htmlFor="sourceKindSelect" className="block text-xs font-medium text-muted mb-1">
                Source Kind *
              </label>
              <select
                id="sourceKindSelect"
                value={sourceKind}
                onChange={(e) => setSourceKind(e.target.value)}
                className={inputClass}
              >
                <option value="physical">Physical Node</option>
                <option value="simulated">Simulator</option>
                <option value="vendor">Vendor Controller</option>
              </select>
            </div>
          </div>

          {deviceType !== "lpg_edge_node" && (
            <div>
              <label htmlFor="capInput" className="block text-xs font-medium text-muted mb-1">
                Load Capacity (kg)
              </label>
              <input
                id="capInput"
                type="number"
                min="1"
                max="100"
                step="0.5"
                value={capacityKg}
                onChange={(e) => setCapacityKg(e.target.value)}
                className={inputClass}
              />
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t border-rule">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-control bg-raised px-4 py-2 text-xs font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded bg-ink px-5 py-2 text-xs font-semibold text-surface transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-accent active:translate-y-px"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              <span>Commission Asset</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
