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
    let inFlight = false;
    let activeController: AbortController | null = null;

    async function poll() {
      if (!active || inFlight) return;
      if (document.visibilityState !== "visible") return;
      inFlight = true;
      const controller = new AbortController();
      activeController = controller;
      try {
        const res = await fetch(
          `/api/workspace/branches/${encodeURIComponent(branchId)}/lpg-safety`,
          { method: "GET", cache: "no-store", signal: controller.signal },
        );
        const result = (await res.json()) as
          | { ok: true; value: LpgSafetySnapshot }
          | { ok: false; message: string };
        if (!active) return;
        if (result.ok) {
          setSnapshot(result.value);
          setServiceError(null);
        } else {
          setServiceError(result.message);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (active) {
          setServiceError("The business service is unavailable. Please retry.");
        }
      } finally {
        if (activeController === controller) {
          activeController = null;
        }
        inFlight = false;
      }
    }

    const timer = window.setInterval(poll, 6000);
    return () => {
      active = false;
      activeController?.abort();
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
