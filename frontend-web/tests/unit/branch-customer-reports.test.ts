import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { CustomerReportsView } from "@/components/workspace/reports/CustomerReportsView";
import { CustomerReportTriageModal } from "@/components/workspace/reports/CustomerReportTriageModal";
import type {
  CustomerReportItem,
  CustomerReportsBranchData,
} from "@/lib/auth/business";

vi.mock("@/app/branches/[branchId]/customer-reports/actions", () => ({
  executeInvestigateReport: vi.fn().mockResolvedValue({ success: true }),
  executeResolveReport: vi.fn().mockResolvedValue({ success: true }),
}));

const mockReportReceived: CustomerReportItem = {
  id: "RPT-1041",
  branch_id: "b-01",
  asset_id: "W-02",
  asset_name: "Washer #02 (15kg)",
  asset_type: "washer",
  category: "Door Latch / Lock",
  description:
    "Door handle feels stiff after spin cycle completes; took two tries to open.",
  status: "received",
  source_kind: "simulated",
  reporter_name: "Nurul Aisyah",
  reporter_contact: "+60 12-834 9102",
  created_at: "2026-10-30T00:00:00Z",
  updated_at: "2026-10-30T00:00:00Z",
  investigation_notes: null,
  assigned_specialist_role: null,
  resolution_reason: null,
  history: [
    {
      id: "hist-1",
      action: "received",
      actor_role: "customer",
      timestamp: "2026-10-30T00:00:00Z",
      note: "Submitted via customer branch QR support portal (Simulated)",
    },
  ],
};

const mockReportInvestigating: CustomerReportItem = {
  id: "RPT-1039",
  branch_id: "b-01",
  asset_id: "W-01",
  asset_name: "Washer #01 (15kg)",
  asset_type: "washer",
  category: "Detergent Dispenser",
  description: "Fabric softener compartment did not flush completely.",
  status: "investigating",
  source_kind: "simulated",
  reporter_name: "Tan Wei Ming",
  reporter_contact: "+60 16-218 7730",
  created_at: "2026-10-29T18:00:00Z",
  updated_at: "2026-10-29T20:00:00Z",
  investigation_notes:
    "Checked inlet water pressure; flagged machine maintenance.",
  assigned_specialist_role: "machine_maintenance",
  resolution_reason: null,
  history: [
    {
      id: "hist-1",
      action: "received",
      actor_role: "customer",
      timestamp: "2026-10-29T18:00:00Z",
      note: "Submitted via customer branch QR support portal (Simulated)",
    },
    {
      id: "hist-2",
      action: "investigating",
      actor_role: "machine_maintenance",
      timestamp: "2026-10-29T20:00:00Z",
      note: "Checked inlet water pressure; flagged machine maintenance.",
    },
  ],
};

const mockReportResolved: CustomerReportItem = {
  id: "RPT-1038",
  branch_id: "b-01",
  asset_id: "FACILITY",
  asset_name: "QR Payment Terminal #1",
  asset_type: "facility",
  category: "Payment / Kiosk",
  description: "Touchscreen froze briefly while generating DuitNow QR code.",
  status: "resolved",
  source_kind: "simulated",
  reporter_name: "Siti Sarah",
  reporter_contact: "+60 19-552 1084",
  created_at: "2026-10-28T10:00:00Z",
  updated_at: "2026-10-28T12:00:00Z",
  investigation_notes: "Verified network latency spike on local router.",
  assigned_specialist_role: null,
  resolution_reason: "Rebooted payment terminal and verified QR code generation.",
  history: [
    {
      id: "hist-1038-1",
      action: "received",
      actor_role: "customer",
      timestamp: "2026-10-28T10:00:00Z",
      note: "Submitted via customer branch QR support portal (Simulated)",
    },
    {
      id: "hist-1038-2",
      action: "resolved",
      actor_role: "owner",
      timestamp: "2026-10-28T12:00:00Z",
      note: "Rebooted payment terminal and verified QR code generation.",
    },
  ],
};

const mockData: CustomerReportsBranchData = {
  reports: [mockReportReceived, mockReportInvestigating, mockReportResolved],
  summary: {
    total: 3,
    received: 1,
    investigating: 1,
    resolved: 1,
    dismissed: 0,
  },
};

describe("CustomerReportsView component", () => {
  it("renders two distinct sections: Ongoing Reports and Report History & Resolved Reports", () => {
    const raw = renderToString(
      React.createElement(CustomerReportsView, {
        initialData: mockData,
        branchId: "b-01",
        userRole: "machine_maintenance",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");

    expect(text).toContain("Customer Issue Reports");
    expect(text).toContain("Total Tickets");
    expect(text).toContain("Needs Triage");
    expect(text).toContain("Investigating");
    expect(text).toContain("Resolved & Closed");

    // Verify both sections render with their filter controls
    expect(text).toContain("Ongoing Reports");
    expect(text).toContain("All Ongoing");
    expect(text).toContain("Report History & Resolved Reports");
    expect(text).toContain("All History");

    // Ongoing ticket items & simulated badge (CR-01, CR-04)
    expect(text).toContain("RPT-1041");
    expect(text).toContain("Washer #02 (15kg) — Door Latch / Lock");
    expect(text).toContain("Nurul Aisyah");
    expect(text).toContain("+60 12-834 9102");
    expect(text).toContain("Simulated");
    expect(text).toContain("Review & Address");

    // Specialist domain tag
    expect(text).toContain("RPT-1039");
    expect(text).toContain("machine maintenance");

    // Historical / Resolved ticket item
    expect(text).toContain("RPT-1038");
    expect(text).toContain("QR Payment Terminal #1 — Payment / Kiosk");
    expect(text).toContain("Rebooted payment terminal and verified QR code generation.");
    expect(text).toContain("View History");

    // Strictly verify no font-mono
    expect(raw).not.toContain("font-mono");
  });
});

describe("CustomerReportTriageModal component", () => {
  it("renders investigation notes form, specialist domain selector, resolution reason input, and history for maintenance crew", () => {
    const raw = renderToString(
      React.createElement(CustomerReportTriageModal, {
        report: mockReportInvestigating,
        branchId: "b-01",
        userRole: "machine_maintenance",
        onClose: () => {},
        onReportUpdated: () => {},
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");

    expect(text).toContain("RPT-1039");
    expect(text).toContain("Acting as: Machine Maintenance");
    expect(text).toContain("Detergent Dispenser · Washer #01 (15kg)");
    expect(text).toContain("1. Investigation & Maintenance Triage");
    expect(text).toContain("Save & Mark Investigating");
    expect(text).toContain("2. Close Support Ticket (Resolve or Dismiss)");
    expect(text).toContain("Resolve Issue");
    expect(text).toContain("Dismiss Report");
    expect(text).toContain("Ticket Activity History");
    expect(text).toContain("Checked inlet water pressure");
    expect(raw).not.toContain("font-mono");
  });
});
