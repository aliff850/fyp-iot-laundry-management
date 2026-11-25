"use server";

import { getBranchIncidents, type IncidentWorkflowState } from "@/lib/auth/business";

export async function fetchBranchIncidentsAction(
  branchId: string,
  options?: {
    domain?: "machine" | "lpg";
    activeOnly?: boolean;
    workflowState?: IncidentWorkflowState;
  },
) {
  const result = await getBranchIncidents(branchId, {
    domain: options?.domain,
    activeOnly: options?.activeOnly,
    workflowState: options?.workflowState,
    limit: 100,
  });
  if (!result.ok) {
    return { ok: false as const, message: result.message };
  }
  return { ok: true as const, incidents: result.value };
}
