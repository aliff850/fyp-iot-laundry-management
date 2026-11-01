"use client";

import React, { useState, useEffect } from "react";
import { Check, Copy, KeyRound, Loader2, RefreshCw, XCircle } from "lucide-react";
import { requestPairingCodeAction, cancelPairingClaimAction } from "@/app/branches/[branchId]/hardware-setup/actions";
import type { GatewayClaimItem } from "@/lib/auth/business";

interface PairingCodeCardProps {
  branchId: string;
  currentClaim: GatewayClaimItem | null;
  hasActiveGateway: boolean;
  activeGatewayId?: string;
  isOwner: boolean;
  onClaimUpdate?: () => void;
}

export function PairingCodeCard({
  branchId,
  currentClaim,
  hasActiveGateway,
  activeGatewayId,
  isOwner,
  onClaimUpdate,
}: PairingCodeCardProps) {
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("");

  const activeClaim = currentClaim && currentClaim.status === "issued" ? currentClaim : null;

  // Expiration countdown
  useEffect(() => {
    if (!activeClaim?.expires_at) {
      setTimeLeft("");
      return;
    }

    const updateTimer = () => {
      const diff = new Date(activeClaim.expires_at).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("Expired");
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${mins}:${secs < 10 ? "0" : ""}${secs}`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeClaim?.expires_at]);

  const handleRequestCode = async (replace = false) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await requestPairingCodeAction(branchId, replace ? activeGatewayId : undefined);
      if (res.success && res.code) {
        setIssuedCode(res.code);
        onClaimUpdate?.();
      } else {
        setErrorMessage(res.message || "Could not generate pairing code.");
      }
    } catch {
      setErrorMessage("Network error generating pairing code.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelClaim = async () => {
    const claimId = currentClaim?.claim_id;
    if (!claimId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await cancelPairingClaimAction(branchId, claimId);
      if (res.success) {
        setIssuedCode(null);
        onClaimUpdate?.();
      } else {
        setErrorMessage(res.message || "Failed to cancel claim.");
      }
    } catch {
      setErrorMessage("Network error cancelling claim.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!issuedCode) return;
    navigator.clipboard.writeText(issuedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOwner) {
    return (
      <section className="rounded-md border border-line bg-surface p-4 sm:p-6" aria-labelledby="pairingCodeHeading">
        <h2 id="pairingCodeHeading" className="text-base font-semibold leading-normal text-ink">
          Pairing Code
        </h2>
        <p className="mt-2 text-sm leading-normal text-muted">
          Only the organization owner can generate pairing codes or commission hardware gateways.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-md border border-line bg-surface p-4 sm:p-6" aria-labelledby="pairingCodeHeading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-accent stroke-current fill-none" aria-hidden="true" />
          <h2 id="pairingCodeHeading" className="text-base font-semibold leading-normal text-ink">
            Gateway Pairing Code
          </h2>
        </div>
        {activeClaim && (
          <span className="inline-flex items-center self-start sm:self-auto rounded bg-raised px-2.5 py-1 text-xs font-medium text-warning tabular-nums">
            Expires in {timeLeft || "..."}
          </span>
        )}
      </div>

      {errorMessage && (
        <div className="mt-4 rounded bg-negative/10 border border-negative/30 p-3 text-xs text-negative" role="alert">
          {errorMessage}
        </div>
      )}

      {/* Case 1: Code was just issued or is currently active */}
      {issuedCode ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-muted">
            Enter this one-time code on the Pi 5 gateway dashboard (<code className="text-ink">http://10.42.0.1:5000</code>).
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <span className="flex-1 rounded border border-control bg-raised px-4 py-3 text-center font-mono text-2xl font-bold tracking-wider text-ink select-all">
              {issuedCode}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded bg-ink px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-accent active:translate-y-px"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 stroke-current fill-none" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 stroke-current fill-none" aria-hidden="true" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleCancelClaim}
              disabled={loading}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded border border-control bg-raised px-4 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              <XCircle className="h-4 w-4 stroke-current fill-none" aria-hidden="true" />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      ) : activeClaim ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted">
            An active pairing code has been issued and is waiting to be claimed on the local Pi dashboard.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCancelClaim}
              disabled={loading}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded border border-control bg-raised px-4 py-2.5 text-sm font-medium text-negative transition-colors hover:bg-negative/10 focus-visible:outline-2 focus-visible:outline-accent"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin stroke-current fill-none" /> : <XCircle className="h-4 w-4" />}
              <span>Cancel Current Code</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted">
            {hasActiveGateway
              ? "This branch already has an active gateway. You can request a replacement code to cut over to a new Pi 5."
              : "Generate a single-use pairing code valid for 10 minutes to bind your physical Pi 5 edge gateway."}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => handleRequestCode(hasActiveGateway)}
              disabled={loading}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink/90 focus-visible:outline-2 focus-visible:outline-accent active:translate-y-px"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin stroke-current fill-none" aria-hidden="true" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 stroke-current fill-none" aria-hidden="true" />
                  <span>{hasActiveGateway ? "Request Replacement Code" : "Request Pairing Code"}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

