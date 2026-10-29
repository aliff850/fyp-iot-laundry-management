"use server";

import { revalidatePath } from "next/cache";
import {
  investigateCustomerReport,
  resolveCustomerReport,
  type CustomerReportItem,
  type CustomerReportsSummary,
} from "@/lib/auth/business";

export type CustomerReportActionResponse = {
  success: boolean;
  message?: string;
  report?: CustomerReportItem;
  summary?: CustomerReportsSummary;
};

export async function executeInvestigateReport(
  branchId: string,
  reportId: string,
  notes: string,
  assignedSpecialistRole?: "machine_maintenance" | "lpg_maintenance" | null
): Promise<CustomerReportActionResponse> {
  const trimmed = notes.trim();
  if (!trimmed) {
    return {
      success: false,
      message: "Enter investigation notes before saving.",
    };
  }

  const result = await investigateCustomerReport(
    branchId,
    reportId,
    trimmed,
    assignedSpecialistRole ?? null
  );

  if (!result.ok) {
    return {
      success: false,
      message: result.message || "Failed to update report investigation.",
    };
  }

  revalidatePath(`/branches/${branchId}/customer-reports`);
  revalidatePath(`/branches/${branchId}/overview`);

  return {
    success: true,
    report: result.value.report,
    summary: result.value.summary,
  };
}

export async function executeResolveReport(
  branchId: string,
  reportId: string,
  action: "resolve" | "dismiss",
  reason: string
): Promise<CustomerReportActionResponse> {
  const trimmed = reason.trim();
  if (!trimmed) {
    return {
      success: false,
      message: "Provide a resolution or dismissal reason.",
    };
  }

  const result = await resolveCustomerReport(branchId, reportId, action, trimmed);

  if (!result.ok) {
    return {
      success: false,
      message: result.message || `Failed to ${action} customer report.`,
    };
  }

  revalidatePath(`/branches/${branchId}/customer-reports`);
  revalidatePath(`/branches/${branchId}/overview`);

  return {
    success: true,
    report: result.value.report,
    summary: result.value.summary,
  };
}

