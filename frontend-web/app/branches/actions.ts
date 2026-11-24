"use server";

import { revalidatePath } from "next/cache";
import {
  businessRequest,
  geocodeBranchAddress,
  getBranchOverviewAnalytics,
  getOrganizationAnalytics,
  type GeocodeResult,
  type OverviewAnalyticsPeriod,
} from "@/lib/auth/business";
import type { FetchOverviewAnalyticsResult } from "@/app/branches/[branchId]/overview/actions";

export type DeleteBranchState = { message?: string; success?: boolean };
export type GeocodeActionResult = {
  ok: boolean;
  status?: number;
  results?: GeocodeResult[];
  attribution?: string;
  cached?: boolean;
  message?: string;
};

export async function lookupBranchAddressAction(query: string): Promise<GeocodeActionResult> {
  const cleaned = query.replace(/\s+/g, " ").trim();
  if (cleaned.length < 3 || cleaned.length > 200) {
    return {
      ok: false,
      status: 422,
      message: "Enter 3 to 200 characters of a public branch address, street, or city.",
    };
  }
  if (cleaned.includes("@")) {
    return {
      ok: false,
      status: 422,
      message: "Do not enter email addresses or personal identifiers in map search.",
    };
  }
  const result = await geocodeBranchAddress(cleaned, 5);
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      message: result.message,
    };
  }
  return {
    ok: true,
    results: result.value.results,
    attribution: result.value.attribution,
    cached: result.value.cached,
  };
}

export async function fetchBranchesAnalytics(
  selectionId: string,
  period: OverviewAnalyticsPeriod
): Promise<FetchOverviewAnalyticsResult> {
  if (period !== "day" && period !== "week" && period !== "month") {
    return { ok: false, status: 400, message: "Invalid analytics timeframe." };
  }
  if (selectionId === "all") {
    const result = await getOrganizationAnalytics(period);
    if (!result.ok) {
      return { ok: false, status: result.status, message: result.message };
    }
    return { ok: true, data: result.value };
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(selectionId)) {
    return { ok: false, status: 400, message: "Invalid branch identifier." };
  }
  const result = await getBranchOverviewAnalytics(selectionId, period);
  if (!result.ok) {
    return { ok: false, status: result.status, message: result.message };
  }
  return { ok: true, data: result.value };
}

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
