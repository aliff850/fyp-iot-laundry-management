"use server";

import { revalidatePath } from "next/cache";
import { businessRequest } from "@/lib/auth/business";
import type { GatewayClaimItem } from "@/lib/auth/business";

export type ActionState = {
  success?: boolean;
  message?: string;
  code?: string;
  expires_at?: string;
  claim_id?: string;
};

export async function requestPairingCodeAction(
  branchId: string,
  replaceGatewayId?: string
): Promise<ActionState> {
  const payload = {
    request_id: crypto.randomUUID(),
    replace_gateway_id: replaceGatewayId || null,
  };

  const res = await businessRequest<{
    claim_id: string;
    code: string;
    expires_at: string;
    branch_id: string;
  }>(`/branches/${branchId}/gateway-claims`, "POST", payload);

  if (!res.ok) {
    return { success: false, message: res.message };
  }

  revalidatePath(`/branches/${branchId}/hardware-setup`);
  return {
    success: true,
    code: res.value?.code,
    expires_at: res.value?.expires_at,
    claim_id: res.value?.claim_id,
    message: "Pairing code generated.",
  };
}

export async function cancelPairingClaimAction(
  branchId: string,
  claimId: string
): Promise<ActionState> {
  const res = await businessRequest<{ message: string }>(
    `/branches/${branchId}/gateway-claims/${claimId}/cancel`,
    "POST"
  );
  if (!res.ok) {
    return { success: false, message: res.message };
  }
  revalidatePath(`/branches/${branchId}/hardware-setup`);
  return { success: true, message: res.value?.message || "Claim cancelled." };
}

export async function confirmGatewayAction(
  branchId: string,
  claimId: string,
  gatewayId: string
): Promise<ActionState> {
  const res = await businessRequest<{ message: string; gateway_id: string }>(
    `/branches/${branchId}/gateway-claims/${claimId}/confirm`,
    "POST",
    { gateway_id: gatewayId }
  );
  if (!res.ok) {
    return { success: false, message: res.message };
  }
  revalidatePath(`/branches/${branchId}/hardware-setup`);
  return { success: true, message: res.value?.message || "Gateway activated." };
}

export async function revokeGatewayAction(
  branchId: string,
  gatewayId: string
): Promise<ActionState> {
  const res = await businessRequest<{ message: string }>(
    `/branches/${branchId}/gateways/${gatewayId}/revoke`,
    "POST"
  );
  if (!res.ok) {
    return { success: false, message: res.message };
  }
  revalidatePath(`/branches/${branchId}/hardware-setup`);
  return { success: true, message: res.value?.message || "Gateway revoked." };
}

export async function approveDeviceAction(
  branchId: string,
  candidateId: string,
  data: {
    device_type: string;
    label: string;
    source_kind: string;
    capacity_kg?: number;
  }
): Promise<ActionState> {
  const res = await businessRequest<{ message: string }>(
    `/branches/${branchId}/device-discoveries/${candidateId}/approve`,
    "POST",
    data
  );
  if (!res.ok) {
    return { success: false, message: res.message };
  }
  revalidatePath(`/branches/${branchId}/hardware-setup`);
  return { success: true, message: res.value?.message || "Device approved." };
}

export async function retireDeviceAction(
  branchId: string,
  deviceId: string
): Promise<ActionState> {
  const res = await businessRequest<{ message: string }>(
    `/branches/${branchId}/devices/${deviceId}/retire`,
    "POST"
  );
  if (!res.ok) {
    return { success: false, message: res.message };
  }
  revalidatePath(`/branches/${branchId}/hardware-setup`);
  return { success: true, message: res.value?.message || "Device retired." };
}

export async function pollClaimStatusAction(
  branchId: string,
  claimId: string
): Promise<GatewayClaimItem | null> {
  const res = await businessRequest<GatewayClaimItem>(
    `/branches/${branchId}/gateway-claims/${claimId}`,
    "GET"
  );
  return res.ok && res.value ? res.value : null;
}

