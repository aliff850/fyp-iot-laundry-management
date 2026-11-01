"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { pollClaimStatusAction } from "@/app/branches/[branchId]/hardware-setup/actions";
import { PairingCodeCard } from "@/components/workspace/hardware/PairingCodeCard";
import { FingerprintComparisonCard } from "@/components/workspace/hardware/FingerprintComparisonCard";
import { GatewayStatusCard } from "@/components/workspace/hardware/GatewayStatusCard";
import { PendingDiscoveriesList } from "@/components/workspace/hardware/PendingDiscoveriesList";
import type { GatewayItem, GatewayClaimItem, DeviceDiscoveryItem } from "@/lib/auth/business";

interface HardwareSetupViewProps {
  branchId: string;
  initialGateways: GatewayItem[];
  initialClaim: GatewayClaimItem | null;
  initialDiscoveries: DeviceDiscoveryItem[];
  isOwner: boolean;
}

export function HardwareSetupView({
  branchId,
  initialGateways,
  initialClaim,
  initialDiscoveries,
  isOwner,
}: HardwareSetupViewProps) {
  const router = useRouter();
  const [claim, setClaim] = useState<GatewayClaimItem | null>(initialClaim);
  const activeGateway = initialGateways.find((g) => g.status === "active") || null;

  // Poll for claim status changes if claim is active or redeemed_pending
  const pollClaim = useCallback(async () => {
    if (!claim?.claim_id) return;
    try {
      const updated = await pollClaimStatusAction(branchId, claim.claim_id);
      if (updated) {
        setClaim(updated);
        if (updated.status === "confirmed") {
          router.refresh();
        }
      }
    } catch {
      // Ignore background poll errors
    }
  }, [branchId, claim?.claim_id, router]);

  useEffect(() => {
    if (claim && (claim.status === "issued" || claim.status === "redeemed_pending")) {
      const interval = setInterval(pollClaim, 4000);
      return () => clearInterval(interval);
    }
  }, [claim, pollClaim]);

  const handleRefresh = () => {
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* 1. Fingerprint Comparison Prompt (if redeemed_pending) */}
      {claim && claim.status === "redeemed_pending" && (
        <FingerprintComparisonCard
          branchId={branchId}
          claim={claim}
          isOwner={isOwner}
          onConfirmed={handleRefresh}
          onCancelled={handleRefresh}
        />
      )}

      {/* 2. Pairing Code Issuance & Status */}
      <PairingCodeCard
        branchId={branchId}
        currentClaim={claim}
        hasActiveGateway={Boolean(activeGateway)}
        activeGatewayId={activeGateway?.id}
        isOwner={isOwner}
        onClaimUpdate={handleRefresh}
      />

      {/* 3. Active Gateway Status */}
      <GatewayStatusCard
        branchId={branchId}
        gateway={activeGateway}
        isOwner={isOwner}
        onRevoked={handleRefresh}
      />

      {/* 4. Pending Device Discoveries */}
      <PendingDiscoveriesList
        branchId={branchId}
        discoveries={initialDiscoveries}
        isOwner={isOwner}
        onRefresh={handleRefresh}
      />
    </div>
  );
}
