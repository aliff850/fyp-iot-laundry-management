"use server";

import { revalidatePath } from "next/cache";
import { businessRequest } from "@/lib/auth/business";

export type RoleUpdateActionState = { message?: string; success?: boolean };

export async function updatePersonnelRole(
  _state: RoleUpdateActionState,
  form: FormData
): Promise<RoleUpdateActionState> {
  const userId = form.get("userId");
  const roleValue = form.get("role");

  if (typeof userId !== "string" || !/^[0-9a-fA-F-]{36}$/.test(userId)) {
    return { message: "Invalid personnel identifier." };
  }

  const role =
    roleValue === "" || roleValue === null
      ? null
      : String(roleValue);

  if (
    role !== null &&
    !["branch_manager", "machine_maintenance", "lpg_maintenance"].includes(role)
  ) {
    return { message: "Select a valid operational role or leave unassigned." };
  }

  const result = await businessRequest<{ success: boolean; message: string }>(
    `/personnel/${userId}/role`,
    "PATCH",
    { role }
  );

  if (!result.ok) {
    return { message: result.message };
  }

  revalidatePath("/personnel");
  revalidatePath("/branches/new");
  revalidatePath("/branches", "layout");
  return {
    success: true,
    message: result.value?.message ?? "Role updated successfully.",
  };
}

export async function removePersonnelFromBranch(
  branchId: string,
  userId: string
): Promise<{ success: boolean; message: string }> {
  if (!branchId || !/^[0-9a-fA-F-]{36}$/.test(branchId)) {
    return { success: false, message: "Invalid branch identifier." };
  }
  if (!userId || !/^[0-9a-fA-F-]{36}$/.test(userId)) {
    return { success: false, message: "Invalid personnel identifier." };
  }

  const result = await businessRequest<{ success: boolean; message: string }>(
    `/branches/${branchId}/personnel/${userId}`,
    "DELETE"
  );

  if (!result.ok) {
    return { success: false, message: result.message };
  }

  revalidatePath("/personnel");
  revalidatePath("/branches");
  revalidatePath(`/branches/${branchId}/personnel`);
  revalidatePath(`/branches/${branchId}/overview`);

  return {
    success: true,
    message:
      result.value?.message ??
      "Personnel unassigned from branch and role cleared.",
  };
}

export type BranchUpdateActionState = { message?: string; success?: boolean };

export async function updatePersonnelBranches(
  _state: BranchUpdateActionState,
  form: FormData
): Promise<BranchUpdateActionState> {
  const userId = form.get("userId");
  const branchIds = form.getAll("branchIds").map(String).filter(Boolean);

  if (typeof userId !== "string" || !/^[0-9a-fA-F-]{36}$/.test(userId)) {
    return { message: "Invalid personnel identifier." };
  }

  for (const bid of branchIds) {
    if (!/^[0-9a-fA-F-]{36}$/.test(bid)) {
      return { message: "Invalid branch identifier." };
    }
  }

  const result = await businessRequest<{ success: boolean; message: string; branch_ids: string[] }>(
    `/personnel/${userId}/branches`,
    "PUT",
    { branch_ids: branchIds }
  );

  if (!result.ok) {
    return { message: result.message };
  }

  revalidatePath("/personnel");
  revalidatePath("/branches");
  return {
    success: true,
    message: result.value?.message ?? "Branch assignments updated.",
  };
}

