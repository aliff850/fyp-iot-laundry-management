import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { IncidentDetailClient } from "@/components/workspace/incidents/IncidentDetailClient";
import { notificationHref } from "@/components/workspace/notifications/notificationLogic";
import {
  formatMytDate,
  formatMytDateTime,
  formatMytShortDateTime,
  formatMytTime,
} from "@/lib/formatDate";
import type { IncidentDetail } from "@/lib/auth/business";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
}));

const sampleIncident: IncidentDetail = {
  id: "inc-1",
  reference_code: "INC-7A2F10",
  branch_id: "branch-1",
  branch_name: "MSU Shah Alam",
  device_id: "dev-1",
  source_id: "washer-sim-01",
  asset_name: "Demo Washer 01",
  domain: "machine",
  condition_key: "machine_fault",
  severity: "critical",
  edge_condition_state: "active",
  workflow_state: "open",
  fault_code: "E01",
  fault_name: "Water Inlet Failure",
  summary: "Machine fault active: E01 — Water Inlet Failure",
  rule_version: "edge-hysteresis-v1",
  revision: 1,
  opened_at: "2026-11-23T09:00:00Z",
  last_sample_at: "2026-11-23T09:05:00Z",
  cleared_at: null,
  acknowledged_at: null,
  resolved_at: null,
  resolution_note: null,
  linked_reports_count: 1,
  open_tasks_count: 1,
  diagnosis: {
    fault_code: "E01",
    title: "Water Inlet Failure",
    source_status: "placeholder_washer_guide",
    disclaimer: "Placeholder troubleshooting guide pending vendor manual.",
    plain_explanation: "The washer did not detect the expected water fill level.",
    likely_causes: ["Wall supply shutoff valve closed"],
    safety_precautions: "Verify floor dryness around power outlets.",
    troubleshooting_steps: ["Confirm water shutoff taps are fully open."],
  },
  evidence_snapshot: { fault_code: "E01" },
  events: [
    {
      id: "ev-1",
      event_type: "opened",
      actor_type: "edge",
      actor_role: null,
      actor_name: null,
      summary: "Machine fault active: E01 — Water Inlet Failure",
      metadata: {},
      occurred_at: "2026-11-23T09:00:00Z",
    },
  ],
  tasks: [
    {
      id: "task-1",
      branch_id: "branch-1",
      incident_id: "inc-1",
      report_id: null,
      domain: "machine",
      title: "Inspect E01 inlet hose",
      assigned_to_user_id: "tech-1",
      assignee_name: "Ali Tech",
      assignee_role: "machine_maintenance",
      assigned_by_user_id: "owner-1",
      assigned_by_name: "Dr Owner",
      status: "assigned",
      service_notes: null,
      created_at: "2026-11-23T09:02:00Z",
      updated_at: "2026-11-23T09:02:00Z",
      completed_at: null,
    },
  ],
  linked_reports: [
    {
      id: "rep-1",
      reference_code: "RPT-101",
      category: "stopped_or_faulted",
      status: "investigating",
      description: "Water never filled the drum",
      reporter_name: null,
      contact_type: null,
      contact_value: null,
      created_at: "2026-11-23T09:03:00Z",
    },
  ],
  eligible_assignees: [
    { user_id: "tech-1", full_name: "Ali Tech", role: "machine_maintenance" },
  ],
};

describe("incident workflow and deep links", () => {
  it("routes notification alerts with an incident_id directly to the incident workspace", () => {
    expect(
      notificationHref({ branch_id: "branch-1", category: "machine", incident_id: "inc-1" }),
    ).toBe("/branches/branch-1/incidents/inc-1");
    expect(
      notificationHref({ branch_id: "branch-1", category: "lpg", incident_id: null }),
    ).toBe("/branches/branch-1/lpg");
  });

  it("keeps physical condition distinct from workflow state and blocks resolve while active", () => {
    const ownerHtml = renderToString(
      React.createElement(IncidentDetailClient, {
        branchId: "branch-1",
        userId: "owner-1",
        userRole: "owner",
        initialIncident: sampleIncident,
      }),
    );
    expect(ownerHtml).toContain("Active Fault / Condition");
    expect(ownerHtml).toContain("Physical edge condition must report Cleared before this incident can be resolved.");
    expect(ownerHtml).toContain("Assign Specialist Task");
    expect(ownerHtml).toContain("Water Inlet Failure");
    expect(ownerHtml).toContain("Placeholder guide");
    const resolveBtn = ownerHtml.match(/<button[^>]*>Resolve Incident<\/button>/)?.[0] ?? "";
    expect(resolveBtn).toContain("disabled");

    const techHtml = renderToString(
      React.createElement(IncidentDetailClient, {
        branchId: "branch-1",
        userId: "tech-1",
        userRole: "machine_maintenance",
        initialIncident: sampleIncident,
      }),
    );
    expect(techHtml).not.toContain("Assign Specialist Task");
    expect(techHtml).toContain("Mark In Progress");
  });

  it("formats SSR timestamps deterministically in MYT without locale hydration drift", () => {
    expect(formatMytShortDateTime("2026-11-23T16:15:00Z")).toBe("24 Nov, 00:15 MYT");
    expect(formatMytDateTime("2026-11-23T16:15:00Z")).toBe("24 Nov 2026, 00:15 MYT");
    expect(formatMytDate("2026-11-23T16:15:00Z")).toBe("24 Nov 2026");
    expect(formatMytTime("2026-11-23T16:15:05Z")).toBe("00:15:05 MYT");
    expect(formatMytTime(null, "Never")).toBe("Never");

    const ownerHtml = renderToString(
      React.createElement(IncidentDetailClient, {
        branchId: "branch-1",
        userId: "owner-1",
        userRole: "owner",
        initialIncident: sampleIncident,
      }),
    );
    const text = ownerHtml.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Last edge sample: 23 Nov, 17:05 MYT");
    expect(text).toContain("Opened: 23 Nov, 17:00 MYT");
    expect(text).not.toMatch(/\b(?:AM|PM|am|pm)\b/);
  });
});
