"use server";

import { revalidatePath } from "next/cache";
import {
  calibrateLpgGasBaseline,
  completeLpgServiceMaintenance,
  getBranchLpgSafety,
  getLpgCommandStatus,
  getLpgMaintenanceStatus,
  setLpgTareWeight,
  startLpgServiceMaintenance,
  type LpgCompleteServiceMaintenancePayload,
  type LpgGasBaselinePayload,
  type LpgStartServiceMaintenancePayload,
  type LpgTareWeightPayload,
} from "@/lib/auth/business";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCE_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;

function validBranch(branchId: string): boolean {
  return UUID_RE.test(branchId);
}

function validSource(sourceId: string): boolean {
  return SOURCE_ID_RE.test(sourceId);
}

export async function refreshBranchLpgSafety(branchId: string) {
  if (!validBranch(branchId)) {
    return { ok: false as const, status: 400, message: "Invalid branch identity." };
  }
  return getBranchLpgSafety(branchId);
}

export async function fetchLpgMaintenanceStatus(branchId: string, sourceId: string) {
  if (!validBranch(branchId) || !validSource(sourceId)) {
    return { ok: false as const, status: 400, message: "Invalid branch or LPG node identity." };
  }
  return getLpgMaintenanceStatus(branchId, sourceId);
}

export async function setBranchLpgTareWeight(
  branchId: string,
  sourceId: string,
  payload: LpgTareWeightPayload,
) {
  if (!validBranch(branchId) || !validSource(sourceId) || !UUID_RE.test(payload.request_id)) {
    return { ok: false as const, status: 400, message: "Invalid tare weight request identity." };
  }
  const result = await setLpgTareWeight(branchId, sourceId, payload);
  if (result.ok) {
    revalidatePath(`/branches/${branchId}/lpg`);
    revalidatePath(`/branches/${branchId}/overview`);
  }
  return result;
}

export async function startBranchLpgServiceMaintenance(
  branchId: string,
  sourceId: string,
  payload: LpgStartServiceMaintenancePayload,
) {
  if (!validBranch(branchId) || !validSource(sourceId) || !UUID_RE.test(payload.request_id)) {
    return { ok: false as const, status: 400, message: "Invalid LPG maintenance request identity." };
  }
  const result = await startLpgServiceMaintenance(branchId, sourceId, payload);
  if (result.ok) {
    revalidatePath(`/branches/${branchId}/lpg`);
    revalidatePath(`/branches/${branchId}/overview`);
  }
  return result;
}

export async function completeBranchLpgServiceMaintenance(
  branchId: string,
  sourceId: string,
  payload: LpgCompleteServiceMaintenancePayload,
) {
  if (!validBranch(branchId) || !validSource(sourceId) || !UUID_RE.test(payload.request_id)) {
    return { ok: false as const, status: 400, message: "Invalid LPG maintenance completion request identity." };
  }
  const result = await completeLpgServiceMaintenance(branchId, sourceId, payload);
  if (result.ok) {
    revalidatePath(`/branches/${branchId}/lpg`);
    revalidatePath(`/branches/${branchId}/maintenance`);
    revalidatePath(`/branches/${branchId}/overview`);
  }
  return result;
}

export async function calibrateBranchLpgGasBaseline(
  branchId: string,
  sourceId: string,
  payload: LpgGasBaselinePayload,
) {
  if (!validBranch(branchId) || !validSource(sourceId) || !UUID_RE.test(payload.request_id)) {
    return { ok: false as const, status: 400, message: "Invalid gas baseline request identity." };
  }
  const result = await calibrateLpgGasBaseline(branchId, sourceId, payload);
  if (result.ok) {
    revalidatePath(`/branches/${branchId}/lpg`);
    revalidatePath(`/branches/${branchId}/overview`);
  }
  return result;
}

export async function fetchLpgCommandStatus(
  branchId: string,
  sourceId: string,
  commandId: string,
) {
  if (!validBranch(branchId) || !validSource(sourceId) || !UUID_RE.test(commandId)) {
    return { ok: false as const, status: 400, message: "Invalid command lookup identity." };
  }
  return getLpgCommandStatus(branchId, sourceId, commandId);
}
