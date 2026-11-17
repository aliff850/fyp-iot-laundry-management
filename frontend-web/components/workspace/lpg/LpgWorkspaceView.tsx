"use client";

import React, { useCallback, useEffect, useState } from "react";
import type { LpgSafetySnapshot } from "@/lib/auth/business";
import { refreshBranchLpgSafety } from "@/app/branches/[branchId]/lpg/actions";
import { LpgSafetyPanel } from "./LpgSafetyPanel";

export interface LpgWorkspaceViewProps {
  initialSnapshot: LpgSafetySnapshot;
  branchId: string;
  defaultActorName?: string | null;
}

export function LpgWorkspaceView({
  initialSnapshot,
  branchId,
  defaultActorName,
}: LpgWorkspaceViewProps) {
  const [snapshot, setSnapshot] = useState<LpgSafetySnapshot>(initialSnapshot);
  const [serviceError, setServiceError] = useState<string | null>(null);

  const refreshNow = useCallback(async () => {
    const result = await refreshBranchLpgSafety(branchId);
    if (result.ok) {
      setSnapshot(result.value);
      setServiceError(null);
    } else {
      setServiceError(result.message);
    }
  }, [branchId]);

  useEffect(() => {
    let active = true;

    async function poll() {
      if (document.visibilityState !== "visible") return;
      const result = await refreshBranchLpgSafety(branchId);
      if (!active) return;
      if (result.ok) {
        setSnapshot(result.value);
        setServiceError(null);
      } else {
        setServiceError(result.message);
      }
    }

    const timer = window.setInterval(poll, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [branchId]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">
          LPG &amp; Safety
        </h2>
      </div>

      <LpgSafetyPanel
        devices={snapshot.devices}
        branchId={branchId}
        defaultActorName={defaultActorName}
        onRefresh={refreshNow}
        errorMessage={serviceError}
      />
    </div>
  );
}
