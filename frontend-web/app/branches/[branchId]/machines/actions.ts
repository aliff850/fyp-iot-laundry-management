"use server";

import { revalidatePath } from "next/cache";
import {
  sendMachineCommand,
  updateMachineParameters,
  type MachineItem,
  type MachineParameters,
} from "@/lib/auth/business";

export type MachineActionResponse = {
  success: boolean;
  message?: string;
  machine?: MachineItem;
};

export async function executeMachineCommand(
  branchId: string,
  machineId: string,
  command: "start" | "pause" | "resume" | "stop" | "unlock"
): Promise<MachineActionResponse> {
  const result = await sendMachineCommand(branchId, machineId, command);
  if (!result.ok) {
    return {
      success: false,
      message: result.message || "Failed to execute machine command.",
    };
  }

  revalidatePath(`/branches/${branchId}/machines`);
  revalidatePath(`/branches/${branchId}/overview`);
  return {
    success: true,
    machine: result.value,
  };
}

export async function saveMachineParameters(
  branchId: string,
  machineId: string,
  params: Partial<MachineParameters>
): Promise<MachineActionResponse> {
  const result = await updateMachineParameters(branchId, machineId, params);
  if (!result.ok) {
    return {
      success: false,
      message: result.message || "Failed to update machine parameters.",
    };
  }

  revalidatePath(`/branches/${branchId}/machines`);
  revalidatePath(`/branches/${branchId}/overview`);
  return {
    success: true,
    machine: result.value,
  };
}
