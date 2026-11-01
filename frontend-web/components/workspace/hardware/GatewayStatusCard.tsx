"use client";

import React, { useState, useEffect } from "react";
import { AlertTriangle, Cpu, Loader2, PowerOff } from "lucide-react";
import { revokeGatewayAction } from "@/app/branches/[branchId]/hardware-setup/actions";
import type { GatewayItem } from "@/lib/auth/business";

interface GatewayStatusCardProps {
  branchId: string;
  gateway: GatewayItem | null;
  isOwner: boolean;
  onRevoked?: () => void;
}

export function GatewayStatusCard({
  branchId,
  gateway,
  isOwner,
  onRevoked,
}: GatewayStatusCardProps) {
  const [loading, setLoading] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    if (!gateway?.last_contact_at) {
      setIsOnline(false);
      return;
    }
    const check = () => {
      const diff = Date.now() - new Date(gateway.last_contact_at!).getTime();
      setIsOnline(diff < 30000);
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [gateway?.last_contact_at]);

  const handleRevoke = async () => {
    if (!gateway) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await revokeGatewayAction(branchId, gateway.id);
      if (res.success) {
        setConfirmingRevoke(false);
        onRevoked?.();
      } else {
        setErrorMessage(res.message || "Failed to revoke gateway.");
      }
    } catch {
      setErrorMessage("Network error during gateway revocation.");
    } finally {
      setLoading(false);
    }
  };

  if (!gateway) {
    return (
      <section className="rounded-md border border-line bg-surface p-4 sm:p-6" aria-labelledby="gatewayStatusHeading">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-muted stroke-current fill-none" aria-hidden="true" />
          <h2 id="gatewayStatusHeading" className="text-base font-semibold leading-normal text-ink">
            Edge Gateway Status
          </h2>
        </div>
        <p className="mt-3 text-sm text-muted">
          No edge gateway is currently bound to this branch. Generate a pairing code above to connect your Raspberry Pi 5.
        </p>
      </section>
    );
  }


  return (
    <section className="rounded-md border border-line bg-surface p-4 sm:p-6" aria-labelledby="gatewayStatusHeading">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-accent stroke-current fill-none" aria-hidden="true" />
          <h2 id="gatewayStatusHeading" className="text-base font-semibold leading-normal text-ink">
            Edge Gateway Status
          </h2>
          <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
              gateway.status === "active"
                ? isOnline
                  ? "bg-positive/10 text-positive border border-positive/30"
                  : "bg-warning/10 text-warning border border-warning/30"
                : "bg-negative/10 text-negative border border-negative/30"
            }`}
          >
            {gateway.status === "active" ? (isOnline ? "Online" : "Contact Stale") : gateway.status}
          </span>
        </div>

        {isOwner && gateway.status === "active" && !confirmingRevoke && (
          <button
            type="button"
            onClick={() => setConfirmingRevoke(true)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded border border-control bg-raised px-4 py-2 text-xs font-medium text-negative transition-colors hover:bg-negative/10 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <PowerOff className="h-3.5 w-3.5 stroke-current fill-none" aria-hidden="true" />
            <span>Revoke Gateway</span>
          </button>
        )}
      </div>

      {confirmingRevoke && (
        <div className="mt-4 rounded-md border border-negative/40 bg-negative/5 p-4" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-negative flex-none stroke-current fill-none" aria-hidden="true" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-semibold text-ink">Revoke Gateway Authorization?</p>
              <p className="text-xs text-muted">
                Revoking this gateway will immediately block future telemetry ingestion and edge configuration updates. Physical machines will remain running locally.
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleRevoke}
                  disabled={loading}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded bg-negative px-4 py-2 text-xs font-semibold text-surface transition-colors hover:bg-negative/90 focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  <span>Confirm Revocation</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRevoke(false)}
                  disabled={loading}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-control bg-raised px-4 py-2 text-xs font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mt-3 rounded bg-negative/10 border border-negative/30 p-3 text-xs text-negative" role="alert">
          {errorMessage}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div className="rounded border border-rule bg-raised p-3">
          <span className="text-muted block mb-1">Gateway ID</span>
          <span className="font-mono text-ink text-xs truncate block" title={gateway.id}>
            {gateway.id}
          </span>
        </div>
        <div className="rounded border border-rule bg-raised p-3">
          <span className="text-muted block mb-1">Config Revision</span>
          <span className="font-semibold text-ink">Rev {gateway.config_revision}</span>
        </div>
        <div className="rounded border border-rule bg-raised p-3">
          <span className="text-muted block mb-1">Last Heartbeat</span>
          <span className="text-ink">
            {gateway.last_contact_at ? new Date(gateway.last_contact_at).toLocaleTimeString() : "Never"}
          </span>
        </div>
        <div className="rounded border border-rule bg-raised p-3">
          <span className="text-muted block mb-1">Last Telemetry Sync</span>
          <span className="text-ink">
            {gateway.last_sync_at ? new Date(gateway.last_sync_at).toLocaleTimeString() : "Never"}
          </span>
        </div>
      </div>
    </section>
  );
}
