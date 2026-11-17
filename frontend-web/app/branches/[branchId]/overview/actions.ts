"use server";

import {
  getBranchOverviewAnalytics,
  getBranchRecords,
  type BranchOverviewAnalytics,
  type BranchRecordsPeriod,
  type BranchRecordsResponse,
  type BranchRecordsScope,
  type OverviewAnalyticsPeriod,
} from "@/lib/auth/business";

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ALLOWED_PERIODS = new Set<OverviewAnalyticsPeriod>(["day", "week", "month"]);
const ALLOWED_RECORD_SCOPES = new Set<BranchRecordsScope>(["lpg", "env", "machines"]);
const ALLOWED_RECORD_PERIODS = new Set<BranchRecordsPeriod>(["all", "today", "week", "month"]);

export type FetchOverviewAnalyticsResult =
  | { ok: true; data: BranchOverviewAnalytics }
  | { ok: false; status: number; message: string };

export async function fetchBranchOverviewAnalytics(
  branchId: string,
  period: OverviewAnalyticsPeriod
): Promise<FetchOverviewAnalyticsResult> {
  if (!UUID_REGEX.test(branchId)) {
    return { ok: false, status: 400, message: "Invalid branch identifier." };
  }
  const safePeriod: OverviewAnalyticsPeriod = ALLOWED_PERIODS.has(period) ? period : "day";
  const result = await getBranchOverviewAnalytics(branchId, safePeriod);
  if (!result.ok) {
    return { ok: false, status: result.status, message: result.message };
  }
  return { ok: true, data: result.value };
}

export type FetchBranchRecordsResult =
  | { ok: true; data: BranchRecordsResponse }
  | { ok: false; status: number; message: string };

export async function fetchBranchRecords(
  branchId: string,
  scope: BranchRecordsScope,
  period: BranchRecordsPeriod,
  page: number
): Promise<FetchBranchRecordsResult> {
  if (!UUID_REGEX.test(branchId)) {
    return { ok: false, status: 400, message: "Invalid branch identifier." };
  }
  const safeScope: BranchRecordsScope = ALLOWED_RECORD_SCOPES.has(scope) ? scope : "lpg";
  const safePeriod: BranchRecordsPeriod = ALLOWED_RECORD_PERIODS.has(period) ? period : "all";
  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const result = await getBranchRecords(branchId, safeScope, safePeriod, safePage, 10);
  if (!result.ok) {
    return { ok: false, status: result.status, message: result.message };
  }
  return { ok: true, data: result.value };
}
