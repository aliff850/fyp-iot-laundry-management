"use server";

import { revalidatePath } from "next/cache";
import {
  getRemoteMachines,
  getRemoteMachineStatistics,
  getRemoteMachineCommands,
  issueRemoteMachineCommand,
  type RemoteMachine,
  type RemoteMachineCommand,
  sendMachineCommand,
  updateMachineParameters,
  type MachineItem,
  type MachineParameters,
} from "@/lib/auth/business";
import type { MachineStatisticsPayload } from "@/components/workspace/machines/MachineDetailModal";

export async function refreshRemoteMachines(branchId: string) {
  return getRemoteMachines(branchId);
}

export async function refreshRemoteMachineStatistics(branchId: string, sourceId: string,
  period: "day" | "week" | "month") {
  return getRemoteMachineStatistics<MachineStatisticsPayload>(branchId, sourceId, period);
}

export async function refreshRemoteMachineCommands(branchId: string, sourceId: string) {
  return getRemoteMachineCommands(branchId, sourceId);
}

export async function requestRemoteMachineCommand(branchId: string, sourceId: string,
  requestId: string, action: "start" | "pause" | "resume" | "stop" | "set_settings" | "clear_fault",
  args: Record<string, unknown> = {}) {
  return issueRemoteMachineCommand(branchId, sourceId, requestId, action, args);
}

export type { RemoteMachine, RemoteMachineCommand };

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
