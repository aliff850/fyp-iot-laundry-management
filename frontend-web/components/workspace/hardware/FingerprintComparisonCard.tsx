"use client";

import React, { useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { confirmGatewayAction, cancelPairingClaimAction } from "@/app/branches/[branchId]/hardware-setup/actions";
import { useActionToast } from "@/components/workspace/common/ActionToastContext";
import type { GatewayClaimItem } from "@/lib/auth/business";

interface FingerprintComparisonCardProps {
  branchId: string;
  claim: GatewayClaimItem;
  isOwner: boolean;
  onConfirmed?: () => void;
  onCancelled?: () => void;
}

export function FingerprintComparisonCard({
  branchId,
  claim,
  isOwner,
  onConfirmed,
  onCancelled,
}: FingerprintComparisonCardProps) {
  const { notify } = useActionToast();
  const [loading, setLoading] = useState(false);

  const toastId = `hardware-claim-${branchId}-${claim.claim_id}`;

  const handleConfirm = async () => {
    if (!claim.gateway_id) {
      notify({
        id: toastId,
        kind: "error",
        title: "Missing gateway identity",
        message: "Missing gateway identity on pending claim.",
      });
      return;
    }
    setLoading(true);
    notify({
      id: toastId,
      kind: "info",
      title: "Activating gateway",
      message: "Confirming gateway pairing fingerprint…",
    });
    try {
      const res = await confirmGatewayAction(branchId, claim.claim_id, claim.gateway_id);
      if (res.success) {
        notify({
          id: toastId,
          kind: "success",
          title: "Gateway activated",
          message: res.message || "Edge gateway verified and paired to branch.",
        });
        onConfirmed?.();
      } else {
        notify({
          id: toastId,
          kind: "error",
          title: "Confirmation failed",
          message: res.message || "Failed to confirm gateway.",
        });
      }
    } catch {
      notify({
        id: toastId,
        kind: "error",
        title: "Confirmation failed",
        message: "Network error during gateway confirmation.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    notify({
      id: toastId,
      kind: "info",
      title: "Cancelling pairing",
      message: "Cancelling pending gateway pairing claim…",
    });
    try {
      const res = await cancelPairingClaimAction(branchId, claim.claim_id);
      if (res.success) {
        notify({
          id: toastId,
          kind: "success",
          title: "Pairing cancelled",
          message: "Pending gateway pairing claim cancelled.",
        });
        onCancelled?.();
      } else {
        notify({
          id: toastId,
          kind: "error",
          title: "Cancel failed",
          message: res.message || "Failed to cancel claim.",
        });
      }
    } catch {
      notify({
        id: toastId,
        kind: "error",
        title: "Cancel failed",
        message: "Network error during cancellation.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-md border border-warning/40 bg-surface p-4 sm:p-6" aria-labelledby="fingerprintHeading">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-warning stroke-current fill-none" aria-hidden="true" />
        <h2 id="fingerprintHeading" className="text-base font-semibold leading-normal text-ink">
          Verify Gateway Fingerprint
        </h2>
      </div>

      <p className="mt-2 text-sm text-muted">
        The pairing code was redeemed by a Pi 5 gateway. Visually compare the verification fingerprint below with the one displayed on the Pi local dashboard.
      </p>

      <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
        <div className="flex-1 rounded-md border border-rule bg-raised p-4 text-center">
          <p className="text-xs text-muted mb-1">Verification Fingerprint</p>
          <span className="font-mono text-3xl font-bold tracking-widest text-accent">
            {claim.verification_fingerprint || "----"}
          </span>
        </div>

        {isOwner && (
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded bg-ink px-6 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-accent active:translate-y-px"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin stroke-current fill-none" aria-hidden="true" />
                  <span>Activating...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 stroke-current fill-none" aria-hidden="true" />
                  <span>Confirm Activation</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded border border-control bg-raised px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              <XCircle className="h-4 w-4 stroke-current fill-none" aria-hidden="true" />
              <span>Cancel Claim</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

