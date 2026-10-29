"use server";

import { revalidatePath } from "next/cache";
import { businessRequest } from "@/lib/auth/business";

export type DeleteBranchState = { message?: string; success?: boolean };

export async function deleteWorkspaceBranch(branchId: string): Promise<DeleteBranchState> {
  if (!/^[0-9a-fA-F-]{36}$/.test(branchId)) {
    return { success: false, message: "Invalid branch identifier." };
  }
  const result = await businessRequest<{ success: boolean; message: string }>(`/branches/${branchId}`, "DELETE");
  if (!result.ok) {
    return { success: false, message: result.message };
  }
  revalidatePath("/branches");
  return { success: true, message: "Branch deleted." };
}
