"use client";

import React, { useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { confirmGatewayAction, cancelPairingClaimAction } from "@/app/branches/[branchId]/hardware-setup/actions";
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
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!claim.gateway_id) {
      setErrorMessage("Missing gateway identity on pending claim.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await confirmGatewayAction(branchId, claim.claim_id, claim.gateway_id);
      if (res.success) {
        onConfirmed?.();
      } else {
        setErrorMessage(res.message || "Failed to confirm gateway.");
      }
    } catch {
      setErrorMessage("Network error during gateway confirmation.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await cancelPairingClaimAction(branchId, claim.claim_id);
      if (res.success) {
        onCancelled?.();
      } else {
        setErrorMessage(res.message || "Failed to cancel claim.");
      }
    } catch {
      setErrorMessage("Network error during cancellation.");
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

      {errorMessage && (
        <div className="mt-3 rounded bg-negative/10 border border-negative/30 p-3 text-xs text-negative" role="alert">
          {errorMessage}
        </div>
      )}

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

