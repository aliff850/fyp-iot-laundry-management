"use server";

import { revalidatePath } from "next/cache";
import {
  startCylinderReplacement,
  completeCylinderReplacement,
  cancelCylinderReplacement,
  toggleEmergencyValve,
  type LpgCylinderItem,
} from "@/lib/auth/business";

export type LpgActionResponse = {
  success: boolean;
  message?: string;
  cylinder?: LpgCylinderItem;
  safety_valve?: {
    state: "OPEN" | "CLOSED";
    emergency_shutoff: boolean;
    last_actuated: string;
  };
};

export async function executeStartReplacement(
  branchId: string,
  cylinderId: string,
  notes?: string
): Promise<LpgActionResponse> {
  const result = await startCylinderReplacement(branchId, cylinderId, notes);
  if (!result.ok) {
    return {
      success: false,
      message: result.message || "Failed to start tank replacement mode.",
    };
  }

  revalidatePath(`/branches/${branchId}/lpg`);
  revalidatePath(`/branches/${branchId}/overview`);
  return {
    success: true,
    cylinder: result.value,
  };
}

export async function executeCompleteReplacement(
  branchId: string,
  cylinderId: string,
  newTareKg: number,
  ratedCapacityKg: number,
  notes?: string
): Promise<LpgActionResponse> {
  const result = await completeCylinderReplacement(
    branchId,
    cylinderId,
    newTareKg,
    ratedCapacityKg,
    notes
  );
  if (!result.ok) {
    return {
      success: false,
      message: result.message || "Failed to complete tank replacement.",
    };
  }

  revalidatePath(`/branches/${branchId}/lpg`);
  revalidatePath(`/branches/${branchId}/overview`);
  return {
    success: true,
    cylinder: result.value,
  };
}

export async function executeCancelReplacement(
  branchId: string,
  cylinderId: string
): Promise<LpgActionResponse> {
  const result = await cancelCylinderReplacement(branchId, cylinderId);
  if (!result.ok) {
    return {
      success: false,
      message: result.message || "Failed to cancel tank replacement.",
    };
  }

  revalidatePath(`/branches/${branchId}/lpg`);
  revalidatePath(`/branches/${branchId}/overview`);
  return {
    success: true,
    cylinder: result.value,
  };
}

export async function executeEmergencyShutoff(
  branchId: string,
  action: "open" | "close"
): Promise<LpgActionResponse> {
  const result = await toggleEmergencyValve(branchId, action);
  if (!result.ok) {
    return {
      success: false,
      message: result.message || "Failed to actuate emergency safety valve.",
    };
  }

  revalidatePath(`/branches/${branchId}/lpg`);
  revalidatePath(`/branches/${branchId}/overview`);
  return {
    success: true,
    safety_valve: result.value,
  };
}
