import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { CustomerReportCard } from "@/components/workspace/reports/CustomerReportCard";
import type { CustomerReportItem } from "@/lib/auth/business";

describe("CustomerReportCard component", () => {
  const ongoingReport: CustomerReportItem = {
    id: "RPT-2001",
    branch_id: "b-01",
    asset_id: "W-05",
    asset_name: "Washer #05 (18kg)",
    asset_type: "washer",
    category: "Drainage / Water Leak",
    description: "Water pooling beneath the drum during final spin cycle.",
    status: "received",
    source_kind: "simulated",
    reporter_name: "Ahmad Farhan",
    reporter_contact: "+60 17-234 5678",
    created_at: "2026-10-30T10:00:00Z",
    updated_at: "2026-10-30T10:00:00Z",
    investigation_notes: null,
    assigned_specialist_role: "machine_maintenance",
    resolution_reason: null,
    history: [],
  };

  const resolvedReport: CustomerReportItem = {
    id: "RPT-2002",
    branch_id: "b-01",
    asset_id: "D-03",
    asset_name: "Dryer #03 (14kg)",
    asset_type: "dryer",
    category: "Heat / Temperature",
    description: "Dryer drum spinning cold without heating up.",
    status: "resolved",
    source_kind: "simulated",
    reporter_name: "Mei Ling",
    reporter_contact: "+60 12-987 6543",
    created_at: "2026-10-29T14:00:00Z",
    updated_at: "2026-10-29T16:30:00Z",
    investigation_notes: "Checked gas manifold pressure solenoid.",
    assigned_specialist_role: "lpg_maintenance",
    resolution_reason: "Replaced faulty gas solenoid valve and retested ignition.",
    history: [],
  };

  it("renders ongoing report card with ticket id, status, asset name, complaint, reporter details and 'Review & Address' action", () => {
    const onSelectReport = vi.fn();
    const raw = renderToString(
      React.createElement(CustomerReportCard, {
        report: ongoingReport,
        isHistory: false,
        onSelectReport,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");

    // Header info
    expect(text).toContain("#RPT-2001");
    expect(text).toContain("Needs Triage");
    expect(text).toContain("machine maintenance");
    expect(text).toContain("Reported:");

    // Asset & Category
    expect(text).toContain("Washer #05 (18kg)");
    expect(text).toContain("Drainage / Water Leak");

    // Customer Complaint
    expect(text).toContain("Customer Complaint");
    expect(text).toContain("Water pooling beneath the drum during final spin cycle.");

    // Reporter Details
    expect(text).toContain("Reporter:");
    expect(text).toContain("Ahmad Farhan");
    expect(text).toContain("Phone:");
    expect(text).toContain("+60 17-234 5678");

    // Action button
    expect(text).toContain("Review & Address");
  });

  it("renders history report card with resolution outcome and 'View History' action", () => {
    const onSelectReport = vi.fn();
    const raw = renderToString(
      React.createElement(CustomerReportCard, {
        report: resolvedReport,
        isHistory: true,
        onSelectReport,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");

    // Header info & status
    expect(text).toContain("#RPT-2002");
    expect(text).toContain("Resolved");
    expect(text).toContain("lpg maintenance");

    // Asset info
    expect(text).toContain("Dryer #03 (14kg)");
    expect(text).toContain("Heat / Temperature");

    // Resolution outcome preview
    expect(text).toContain("Resolution Outcome:");
    expect(text).toContain("Replaced faulty gas solenoid valve and retested ignition.");

    // Reporter details
    expect(text).toContain("Mei Ling");
    expect(text).toContain("+60 12-987 6543");

    // Action button
    expect(text).toContain("View History");
  });

  it("supports custom actionSlot or custom actionLabel", () => {
    const raw = renderToString(
      React.createElement(CustomerReportCard, {
        report: ongoingReport,
        actionLabel: "Triage Ticket",
        onSelectReport: vi.fn(),
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    expect(text).toContain("Triage Ticket");
    expect(text).not.toContain("Review & Address");
  });
});

