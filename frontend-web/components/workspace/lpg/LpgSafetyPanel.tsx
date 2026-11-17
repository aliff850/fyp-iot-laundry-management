"use client";

import React from "react";
import type { SafetyNodeDevice } from "@/lib/auth/business";
import { LpgCylinderCard } from "./LpgCylinderCard";

export interface LpgSafetyPanelProps {
  devices: SafetyNodeDevice[];
  branchId?: string;
  defaultActorName?: string | null;
  onRefresh?: () => Promise<void> | void;
  errorMessage?: string | null;
}

export function LpgSafetyPanel({
  devices,
  branchId,
  defaultActorName,
  onRefresh,
  errorMessage,
}: LpgSafetyPanelProps) {
  return (
    <div className="space-y-4">
      {errorMessage && (
        <div
          role="alert"
          className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-xs text-warning"
        >
          {errorMessage}
        </div>
      )}

      {devices.length === 0 ? (
        <p className="rounded-md border border-line bg-surface px-5 py-4 text-sm text-muted md:p-7">
          No approved LPG or safety nodes on this branch.
        </p>
      ) : (
        <section className="space-y-4" aria-labelledby="lpg-safety-nodes-heading">
          <h2
            id="lpg-safety-nodes-heading"
            className="text-base font-semibold text-ink"
          >
            LPG &amp; Safety nodes
          </h2>
          <div
            role="feed"
            aria-label="LPG & Safety node list"
            className="space-y-4"
          >
            {devices.map((device) => (
              <LpgCylinderCard
                key={device.source_id}
                device={device}
                branchId={branchId}
                defaultActorName={defaultActorName}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
