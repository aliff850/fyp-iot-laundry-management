"use client";

import React, { useState, useTransition } from "react";
import { X, Scale, CheckCircle2, AlertCircle } from "lucide-react";
import type { LpgCylinderItem } from "@/lib/auth/business";
import { executeCompleteReplacement } from "@/app/branches/[branchId]/lpg/actions";

interface LpgReplacementModalProps {
  cylinder: LpgCylinderItem;
  branchId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (updated: LpgCylinderItem) => void;
}

export function LpgReplacementModal({
  cylinder,
  branchId,
  isOpen,
  onClose,
  onSuccess,
}: LpgReplacementModalProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tareKg, setTareKg] = useState<string>(cylinder.cylinder_tare_kg.toString());
  const [capacityKg, setCapacityKg] = useState<string>(cylinder.rated_fuel_capacity_kg.toString());
  const [notes, setNotes] = useState<string>("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsedTare = parseFloat(tareKg);
    const parsedCapacity = parseFloat(capacityKg);

    if (isNaN(parsedTare) || parsedTare <= 0) {
      setErrorMsg("Please enter a valid positive tare weight (kg).");
      return;
    }

    if (isNaN(parsedCapacity) || parsedCapacity <= 0) {
      setErrorMsg("Please enter a valid positive rated capacity (kg).");
      return;
    }

    startTransition(async () => {
      const res = await executeCompleteReplacement(
        branchId,
        cylinder.id,
        parsedTare,
        parsedCapacity,
        notes.trim() || undefined
      );

      if (!res.success) {
        setErrorMsg(res.message || "Failed to complete replacement.");
      } else {
        if (res.cylinder && onSuccess) {
          onSuccess(res.cylinder);
        }
        onClose();
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="replacement-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-lg rounded-md border border-line bg-surface p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-rule pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded border border-control/30 bg-raised text-ink">
              <Scale className="size-4 text-accent" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2
                id="replacement-modal-title"
                className="text-base font-semibold tracking-tight text-ink truncate"
              >
                Complete Cylinder Replacement
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {cylinder.label} · Station Position #{cylinder.position}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded text-muted hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="Close modal"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Stability Protocol Notice (FE-05) */}
          <div className="rounded border border-positive/30 bg-positive/10 p-3 text-xs">
            <div className="flex items-center gap-2 font-medium text-positive">
              <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
              <span>Gateway Stability Protocol</span>
            </div>
            {/* <p className="mt-1 text-muted">
              Three consecutive stable scale readings within commissioning tolerance are required before live fuel evaluation resumes. Confirmation calculates net mass from verified scale readings.
            </p> */}
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 rounded border border-negative/40 bg-negative/10 p-3 text-xs text-negative">
              <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="new-tare" className="block text-xs font-medium text-muted">
                Vessel Tare Mass (kg) *
              </label>
              <input
                id="new-tare"
                type="number"
                step="0.1"
                min="1"
                max="50"
                value={tareKg}
                onChange={e => setTareKg(e.target.value)}
                required
                className="mt-1.5 w-full rounded border border-control bg-raised px-3 py-2 text-xs font-semibold text-ink tabular-nums focus-visible:outline-2 focus-visible:outline-accent"
              />
              <span className="mt-1 block text-[11px] text-faint">
                Stamped empty tare mass on cylinder collar
              </span>
            </div>

            <div>
              <label htmlFor="rated-capacity" className="block text-xs font-medium text-muted">
                Rated Fuel Capacity (kg) *
              </label>
              <input
                id="rated-capacity"
                type="number"
                step="0.1"
                min="1"
                max="100"
                value={capacityKg}
                onChange={e => setCapacityKg(e.target.value)}
                required
                className="mt-1.5 w-full rounded border border-control bg-raised px-3 py-2 text-xs font-semibold text-ink tabular-nums focus-visible:outline-2 focus-visible:outline-accent"
              />
              <span className="mt-1 block text-[11px] text-faint">
                Commercial LPG specification (e.g. 14.0 kg or 50.0 kg)
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="service-notes" className="block text-xs font-medium text-muted">
              Service Notes & Batch Number
            </label>
            <textarea
              id="service-notes"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="idk bro"
              className="mt-1.5 w-full rounded border border-control bg-raised px-3 py-2 text-xs text-ink placeholder:text-muted/60 focus-visible:outline-2 focus-visible:outline-accent"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t border-rule pt-4">
            <button
              type="button"
              disabled={isPending}
              onClick={onClose}
              className="inline-flex min-h-9 items-center justify-center rounded border border-control/40 px-3.5 py-1.5 text-xs font-medium text-muted hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded border border-ink bg-ink px-4 py-1.5 text-xs font-semibold text-surface transition-colors hover:border-muted hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
            >
              <span>{isPending ? "Validating & Resuming…" : "Confirm Replacement & Resume"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
