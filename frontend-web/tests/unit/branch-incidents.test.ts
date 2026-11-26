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

  it("renders streamlined header, incident explanation without placeholders, and response controls", () => {
    const ownerHtml = renderToString(
      React.createElement(IncidentDetailClient, {
        branchId: "branch-1",
        userId: "owner-1",
        userRole: "owner",
        initialIncident: sampleIncident,
      }),
    );
    const ownerText = ownerHtml.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");
    expect(ownerText).toContain("Back to Incidents");
    expect(ownerHtml).toContain('href="/branches/branch-1/incidents"');
    expect(ownerText).toContain("Demo Washer 01");
    expect(ownerText).toContain("INC-7A2F10");
    expect(ownerText).toContain("Critical");
    expect(ownerText).toContain("Water Inlet Failure");
    expect(ownerText).toContain("Incident Response");
    expect(ownerText).toContain("Go to Machines");
    expect(ownerHtml).toContain('href="/branches/branch-1/machines"');
    expect(ownerText).toContain("Complete Service & Return Online");
    expect(ownerText).not.toContain("Technician observation");
    expect(ownerText).not.toContain("Mark incident as resolved");

    // Explicitly verify removed legacy clutter & placeholders
    expect(ownerText).not.toContain("Placeholder guide");
    expect(ownerText).not.toContain("Placeholder troubleshooting guide");
    expect(ownerText).not.toContain("Physical Condition (Edge)");
    expect(ownerText).not.toContain("Staff Workflow State");
    expect(ownerText).not.toContain("edge-hysteresis-v1");
    expect(ownerText).not.toContain("Assign Specialist Task");
    expect(ownerText).not.toContain("Acknowledge Incident");
    expect(ownerText).not.toContain("Audit Timeline");
    expect(ownerText).not.toContain("Linked Customer Reports");
    expect(ownerText).not.toContain("Service Asset & Log Work");
    expect(ownerText).not.toContain("Back to Machines");

    // Enclosed fireproof LPG cylinder room active gas leak shows life-safety warning, telemetry, and disabled resolve button
    const activeGasIncident: IncidentDetail = {
      ...sampleIncident,
      domain: "lpg",
      condition_key: "gas_leak",
      asset_name: "Primary Weighing Station",
      source_id: "esp32-lpg-01",
      fault_code: "GAS_CRITICAL",
      fault_name: "Sustained LPG Leak — Fire & Explosion Hazard",
      summary: "Sustained elevated LPG concentration in cylinder room (~145 ppm).",
      evidence_snapshot: {
        estimated_ppm: 145.2,
        peak_ppm: 180.6,
        duration_seconds: 125,
      },
      diagnosis: {
        fault_code: "GAS_CRITICAL",
        title: "Sustained / Critical LPG Leak — Fire & Explosion Hazard",
        source_status: "spinsense_safety_rule",
        disclaimer: "",
        plain_explanation: "Sustained elevated LPG gas concentration in the enclosed fireproof cylinder room.",
        likely_causes: ["Active cylinder valve leak"],
        safety_precautions: "IMMINENT FIRE & EXPLOSION HAZARD: Evacuate immediately.",
        troubleshooting_steps: ["Shut off external main LPG isolation valve."],
      },
    };
    const gasHtml = renderToString(
      React.createElement(IncidentDetailClient, {
        branchId: "branch-1",
        userId: "owner-1",
        userRole: "owner",
        initialIncident: activeGasIncident,
      }),
    );
    const gasText = gasHtml.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");
    expect(gasText).toContain("Inspect Device");
    expect(gasText).toContain("Technician observation");
    expect(gasText).toContain("Mark incident as resolved");
    const gasResolveBtn = gasHtml.match(/<button[^>]*>Mark incident as resolved<\/button>/)?.[0] ?? "";
    expect(gasResolveBtn).toContain("disabled");
    expect(gasText).toContain("IMMINENT FIRE & EXPLOSION HAZARD");
    expect(gasText).toContain("Sustained leak active");
    expect(gasText).toContain("145.2 ppm");
    expect(gasText).toContain("Peak 180.6 ppm");
    expect(gasHtml).toContain('href="/branches/branch-1/lpg"');
  });

  it("formats SSR timestamps deterministically in MYT without locale hydration drift", () => {
    expect(formatMytShortDateTime("2026-11-23T16:15:00Z")).toBe("24 Nov, 00:15 MYT");
    expect(formatMytDateTime("2026-11-23T16:15:00Z")).toBe("24 Nov 2026, 00:15 MYT");
    expect(formatMytDate("2026-11-23T16:15:00Z")).toBe("24 Nov 2026");
    expect(formatMytTime("2026-11-23T16:15:05Z")).toBe("00:15:05 MYT");
    expect(formatMytTime(null, "Never")).toBe("Never");

    const resolvedHtml = renderToString(
      React.createElement(IncidentDetailClient, {
        branchId: "branch-1",
        userId: "owner-1",
        userRole: "owner",
        initialIncident: {
          ...sampleIncident,
          edge_condition_state: "cleared",
          workflow_state: "resolved",
          resolved_by_name: "Ali Tech",
          resolved_by_role: "machine_maintenance",
          resolved_at: "2026-11-23T09:20:00Z",
          resolution_note: "Replaced inlet solenoid and verified normal fill.",
        },
      }),
    );
    const text = resolvedHtml.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Resolved");
    expect(text).toContain("Resolved by Ali Tech");
    expect(text).toContain("Machine Maintenance");
    expect(text).not.toContain(">Incident resolved<");
    expect(text).toContain("23 Nov, 17:20 MYT");
    expect(text).toContain("Replaced inlet solenoid and verified normal fill.");
    expect(text).not.toMatch(/\b(?:AM|PM|am|pm)\b/);
  });
});
