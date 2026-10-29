"use server";

import { revalidatePath } from "next/cache";
import { businessRequest, getMembership } from "@/lib/auth/business";

export type BusinessActionState = { message?: string; success?: boolean };

export async function completeOnboarding(): Promise<BusinessActionState> {
  const result = await getMembership("/onboarding", "POST");
  if (!result.ok) return { message: result.message };
  revalidatePath("/membership-status");
  return { success: true, message: result.value.state === "incomplete" ? "Setup is still in progress. Retry shortly." : "Workspace state updated." };
}

export async function decideJoinRequest(_state: BusinessActionState, form: FormData): Promise<BusinessActionState> {
  const id = form.get("requestId");
  const decision = form.get("decision");
  if (typeof id !== "string" || !/^[0-9a-fA-F-]{36}$/.test(id) || (decision !== "approve" && decision !== "reject")) {
    return { message: "Select a valid decision." };
  }
  const result = await businessRequest<{ state: string }>(`/join-requests/${id}/decision`, "POST", { decision, role: null });
  if (!result.ok) return { message: result.message };
  if (result.value?.state !== (decision === "approve" ? "approved_unassigned" : "rejected")) return { message: "The business service returned an invalid decision." };
  revalidatePath("/personnel");
  return { success: true, message: result.value.state === "rejected" ? "Request rejected." : "Request approved. Member added to organization." };
}
