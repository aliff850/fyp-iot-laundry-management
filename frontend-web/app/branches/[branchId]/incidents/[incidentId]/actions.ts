"use server";

import { revalidatePath } from "next/cache";
import {
  acknowledgeBranchIncident,
  createIncidentTask,
  resolveBranchIncident,
  updateIncidentTask,
} from "@/lib/auth/business";

export async function acknowledgeIncidentAction(
  branchId: string,
  incidentId: string,
  note?: string,
) {
  const result = await acknowledgeBranchIncident(incidentId, note);
  if (!result.ok) {
    return { ok: false as const, message: result.message };
  }
  revalidatePath(`/branches/${branchId}/overview`);
  revalidatePath(`/branches/${branchId}/incidents/${incidentId}`);
  return { ok: true as const, incident: result.value };
}

export async function resolveIncidentAction(
  branchId: string,
  incidentId: string,
  resolutionNote: string,
) {
  const result = await resolveBranchIncident(incidentId, resolutionNote);
  if (!result.ok) {
    return { ok: false as const, message: result.message };
  }
  revalidatePath(`/branches/${branchId}/overview`);
  revalidatePath(`/branches/${branchId}/incidents/${incidentId}`);
  return { ok: true as const, incident: result.value };
}

export async function createMaintenanceTaskAction(
  branchId: string,
  incidentId: string,
  payload: {
    domain: "machine" | "lpg";
    title: string;
    assigned_to_user_id: string;
    service_notes?: string;
  },
) {
  const result = await createIncidentTask({
    branch_id: branchId,
    incident_id: incidentId,
    domain: payload.domain,
    title: payload.title,
    assigned_to_user_id: payload.assigned_to_user_id,
    service_notes: payload.service_notes,
  });
  if (!result.ok) {
    return { ok: false as const, message: result.message };
  }
  revalidatePath(`/branches/${branchId}/incidents/${incidentId}`);
  return { ok: true as const, task: result.value };
}

export async function updateMaintenanceTaskAction(
  branchId: string,
  incidentId: string,
  taskId: string,
  payload: {
    status?: "assigned" | "in_progress" | "completed";
    service_notes?: string;
  },
) {
  const result = await updateIncidentTask(taskId, payload);
  if (!result.ok) {
    return { ok: false as const, message: result.message };
  }
  revalidatePath(`/branches/${branchId}/incidents/${incidentId}`);
  return { ok: true as const, task: result.value };
}
