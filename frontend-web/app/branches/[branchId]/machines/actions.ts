"use server";

import { revalidatePath } from "next/cache";
import {
  createMachineMaintenanceLog,
  getBranchMaintenanceLogs,
  getRemoteMachines,
  getRemoteMachineStatistics,
  getRemoteMachineCommands,
  issueRemoteMachineCommand,
  type MaintenanceLogCreateInput,
  type MaintenanceLogItem,
  type MaintenanceLogsPage,
  type RemoteMachine,
  type RemoteMachineCommand,
  type RemoteMachineCommandAction,
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
  requestId: string, action: RemoteMachineCommandAction,
  args: Record<string, unknown> = {}) {
  return issueRemoteMachineCommand(branchId, sourceId, requestId, action, args);
}

export async function loadBranchMaintenanceLogs(
  branchId: string,
  options?: {
    source_id?: string;
    error_code?: string;
    search?: string;
    page?: number;
    page_size?: number;
  },
) {
  return getBranchMaintenanceLogs(branchId, options);
}

export async function submitMachineMaintenanceLog(
  branchId: string,
  sourceId: string,
  payload: MaintenanceLogCreateInput,
) {
  const result = await createMachineMaintenanceLog(branchId, sourceId, payload);
  if (result.ok) {
    revalidatePath(`/branches/${branchId}/machines`);
    revalidatePath(`/branches/${branchId}/maintenance`);
    revalidatePath(`/branches/${branchId}/overview`);
  }
  return result;
}

export type {
  MaintenanceLogCreateInput,
  MaintenanceLogItem,
  MaintenanceLogsPage,
  RemoteMachine,
  RemoteMachineCommand,
  RemoteMachineCommandAction,
};

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
