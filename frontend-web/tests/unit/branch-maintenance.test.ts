import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { BranchWorkspaceShell } from "@/components/workspace/layout/BranchWorkspaceShell";
import { MaintenanceHistoryView } from "@/components/workspace/machines/MaintenanceHistoryView";
import type { BranchDetail, MaintenanceLogsPage } from "@/lib/auth/business";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => "/branches/branch-1/maintenance",
}));

const sampleBranch: BranchDetail = {
  id: "branch-1",
  name: "MSU Shah Alam",
  address: "1 Jalan University",
  city: "Shah Alam",
  region: "Selangor",
  postal_code: "40100",
  contact_phone: "+60 3-5521 2888",
  opening_hours: "24 Hours Daily",
  latitude: 3.07,
  longitude: 101.55,
  service_status: "open",
  primary_manager_user_id: "owner-1",
  created_at: "2026-11-01T00:00:00Z",
};

const samplePage: MaintenanceLogsPage = {
  items: [
    {
      id: "log-1",
      reference_code: "MNT-A1B2C3",
      branch_id: "branch-1",
      device_id: "dev-1",
      source_id: "washer-sim-01",
      asset_name: "Demo Washer 01",
      incident_id: "inc-1",
      error_code: "E01",
      fault_name: "Water Inlet Failure",
      technician_name: "Ali Technician",
      performed_by_user_id: "tech-1",
      performed_by_role: "machine_maintenance",
      work_done: "- Inspected inlet valve\n- Cleaned sediment screen\n- Tested fill flow",
      outcome: "completed",
      created_at: "2026-11-23T06:40:00Z",
    },
    {
      id: "log-2",
      reference_code: "MNT-D4E5F6",
      branch_id: "branch-1",
      device_id: "dev-2",
      source_id: "dryer-sim-01",
      asset_name: "Demo Dryer 01",
      incident_id: null,
      error_code: "MAINT",
      fault_name: null,
      technician_name: "Owner Admin",
      performed_by_user_id: "owner-1",
      performed_by_role: "owner",
      work_done: "Scheduled lint trap deep cleaning",
      outcome: "in_progress",
      created_at: "2026-11-22T12:15:00Z",
    },
  ],
  total: 2,
  page: 1,
  page_size: 20,
  has_more: false,
};

describe("branch maintenance history page UI", () => {
  it("renders commit-style timeline entries with error code, employee name, tasks carried out, and incident link", () => {
    const html = renderToString(
      React.createElement(MaintenanceHistoryView, {
        branchId: "branch-1",
        machines: [{ source_id: "washer-sim-01", label: "Demo Washer 01" }],
        initialPage: samplePage,
      }),
    );
    const text = html.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");

    expect(text).toContain("MNT-A1B2C3");
    expect(text).toContain("E01");
    expect(text).toContain("Water Inlet Failure");
    expect(text).toContain("Ali Technician");
    expect(text).toContain("Demo Washer 01 (washer-sim-01)");
    expect(text).toContain("Cleaned sediment screen");
    expect(text).toContain("Completed");
    expect(text).toContain("In progress");
    expect(html).toContain("/branches/branch-1/incidents/inc-1");
  });

  it("renders clean empty state and explicit error alert when unavailable", () => {
    const emptyHtml = renderToString(
      React.createElement(MaintenanceHistoryView, {
        branchId: "branch-1",
        machines: [],
        initialPage: { items: [], total: 0, page: 1, page_size: 20, has_more: false },
      }),
    );
    expect(emptyHtml).toContain("No maintenance work logged yet");
    expect(emptyHtml).toContain("/branches/branch-1/machines");

    const errHtml = renderToString(
      React.createElement(MaintenanceHistoryView, {
        branchId: "branch-1",
        machines: [],
        initialPage: null,
        initialError: "Maintenance logs are temporarily unavailable.",
      }),
    );
    expect(errHtml).toContain('role="alert"');
    expect(errHtml).toContain("Maintenance logs are temporarily unavailable.");
  });

  it("shows Maintenance Logs and Active Incidents tabs in BranchWorkspaceShell for machine and lpg roles", () => {
    const techHtml = renderToString(
      React.createElement(BranchWorkspaceShell, {
        branch: sampleBranch,
        activeTab: "maintenance",
        userRole: "machine_maintenance",
        hideIncidentsBanner: true,
      }),
    );
    expect(techHtml).toContain("Maintenance Logs");
    expect(techHtml).toContain("/branches/branch-1/maintenance");
    expect(techHtml).toContain("/branches/branch-1/incidents");
    expect(techHtml).not.toContain("·");

    const lpgHtml = renderToString(
      React.createElement(BranchWorkspaceShell, {
        branch: sampleBranch,
        activeTab: "lpg",
        userRole: "lpg_maintenance",
        hideIncidentsBanner: true,
      }),
    );
    expect(lpgHtml).toContain("/branches/branch-1/maintenance");
    expect(lpgHtml).toContain("/branches/branch-1/incidents");
  });
});
