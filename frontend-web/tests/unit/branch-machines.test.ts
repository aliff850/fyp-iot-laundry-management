import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MachineCard } from "@/components/workspace/machines/MachineCard";
import {
  formatCountdownSeconds,
  MachineCountdownTimer,
} from "@/components/workspace/machines/MachineCountdownTimer";
import { MachineDetailModal } from "@/components/workspace/machines/MachineDetailModal";
import { RemoteMachineFleet } from "@/components/workspace/machines/RemoteMachineFleet";
import type { RemoteMachine } from "@/lib/auth/business";

const washer: RemoteMachine = {
  source_id: "washer-sim-01",
  type: "washer",
  source: "simulated",
  label: "Demo Washer 01",
  capacity_kg: null,
  state: "idle",
  freshness: "fresh",
  last_update: "2026-11-14T10:00:00Z",
  data: {
    remaining_seconds: 0,
    programs: {
      quick: { name: "Quick", duration_seconds: 30, price_myr: "4.00" },
      p_fe20185dc7ed: { name: "ECODEMO", duration_seconds: 20, price_myr: "3.50" },
    },
  },
};

const cardProps = {
  branchId: "branch-1",
  branchOpen: true,
  role: "owner" as const,
  onOpenDetails: () => {},
};

describe("live branch machine UI", () => {
  it("matches Pi 5 machineRowCard layout with Device ID, 3-box grid, and no unsupported door action", () => {
    const html = renderToString(React.createElement(MachineCard, {
      ...cardProps,
      machine: washer,
    }));
    const text = html.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");

    expect(text).toContain("Demo Washer 01");
    expect(text).toContain("Device ID");
    expect(text).toContain("washer-sim-01");
    expect(text).toContain("Machine state");
    expect(text).toContain("Idle");
    expect(text).toContain("Remaining estimate");
    expect(text).toContain("Capacity");
    expect(text).toContain("Category");
    expect(text).toContain("Washer");
    expect(text).toContain("Last sample");
    expect(text).toContain("Freshness");
    expect(text).toContain("Fresh");
    expect(text).toContain("Details & parameters");
    expect(html).not.toContain("<span>Start</span>");
    expect(html).not.toContain("<span>Pause</span>");
    expect(html).not.toContain("<span>Stop</span>");
    expect(html).not.toContain("Unlock door");
    expect(html).not.toContain("RM 4.00");
  });

  it("keeps stale machines unknown on cards and disables Machine Testing cycle controls in the modal", () => {
    const staleMachine = { ...washer, freshness: "stale" as const, state: "idle" as const };
    const cardHtml = renderToString(React.createElement(MachineCard, {
      ...cardProps,
      machine: staleMachine,
    }));
    expect(cardHtml).toContain("Stale");
    expect(cardHtml).not.toContain("<span>Start</span>");

    const modalHtml = renderToString(React.createElement(MachineDetailModal, {
      machine: staleMachine,
      branchId: "branch-1",
      branchOpen: true,
      role: "owner",
      onClose: () => {},
    }));
    expect(modalHtml).toContain("Machine Testing");
    expect(modalHtml).toMatch(/<button[^>]*disabled=""[^>]*>START<\/button>/);
  });

  it("enables Machine Testing cycle controls for machine_maintenance without prices, statistics, or program edits", () => {
    const html = renderToString(React.createElement(MachineDetailModal, {
      machine: washer,
      branchId: "branch-1",
      branchOpen: true,
      role: "machine_maintenance",
      onClose: () => {},
    }));
    expect(html).toContain("Machine Testing");
    expect(html).toContain("Program for START");
    expect(html).toContain(">START<");
    expect(html).toContain(">STOP<");
    expect(html).not.toContain("CLEAR FAULT");
    expect(html).not.toContain("RM 4.00");
    expect(html).not.toContain("Statistics &amp; Revenue");
  });

  it("uses recorded capacity and does not offer simulator commands to a physical source", () => {
    const html = renderToString(React.createElement(MachineCard, {
      ...cardProps,
      machine: { ...washer, source: "physical", capacity_kg: 15 },
    }));
    expect(html).toContain("15.0 kg");
    expect(html).not.toContain("<span>Start</span>");
  });

  it("renders the live fleet empty state without sample machines", () => {
    const html = renderToString(React.createElement(RemoteMachineFleet, {
      branchId: "branch-1",
      branchOpen: true,
      role: "owner",
      initialMachines: [],
    }));
    expect(html).toContain("No approved machines are registered for this branch.");
    expect(html).not.toContain("Demo Washer 01");
  });

  it("renders explainable fault diagnosis and unified service/incident actions", () => {
    const faultedWasher: RemoteMachine = {
      ...washer,
      state: "error",
      data: {
        ...washer.data,
        fault_code: "E01",
        fault_name: "Water Inlet Failure",
      },
      active_incident: {
        id: "inc-e01",
        reference_code: "INC-E01",
        severity: "critical",
        fault_code: "E01",
        workflow_state: "open",
        edge_condition_state: "active",
      },
      diagnosis: {
        fault_code: "E01",
        title: "Water Inlet Failure",
        source_status: "placeholder_washer_guide",
        disclaimer: "Placeholder troubleshooting guide pending vendor manual.",
        plain_explanation: "The washer did not detect expected fill within intake window.",
        likely_causes: ["Wall shutoff valve closed"],
        safety_precautions: "Verify floor dryness around outlets.",
        troubleshooting_steps: ["Confirm water supply valve is fully open."],
      },
    };

    const cardWithIncidentHtml = renderToString(React.createElement(MachineCard, {
      ...cardProps,
      machine: faultedWasher,
    }));
    expect(cardWithIncidentHtml).toContain("Attention!");

    const ownerHtml = renderToString(React.createElement(MachineDetailModal, {
      machine: faultedWasher,
      branchId: "branch-1",
      branchOpen: true,
      role: "owner",
      onOpenServiceModal: () => {},
      onClose: () => {},
    }));
    const ownerText = ownerHtml.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");
    expect(ownerText).toContain("Machine has 1 active incident.");
    expect(ownerText).toContain("View Incidents");
    expect(ownerHtml).toContain('href="/branches/branch-1/incidents"');
    expect(ownerText).toContain("Water Inlet Failure");
    expect(ownerText).not.toContain("Placeholder guide");
    expect(ownerText).not.toContain("Placeholder troubleshooting guide");
    expect(ownerText).toContain("Verify floor dryness around outlets.");
    expect(ownerText).toContain("Confirm water supply valve is fully open.");
    expect(ownerText).not.toContain("Inspect Incident INC-E01");
    expect(ownerText).not.toContain("Service & Resolve Issue");
    expect(ownerText).toContain("Maintenance & Service");
    expect(ownerText).not.toContain("CLEAR FAULT");

    const specialistHtml = renderToString(React.createElement(MachineDetailModal, {
      machine: {
        ...faultedWasher,
        active_incidents_count: 2,
        diagnosis: {
          ...faultedWasher.diagnosis!,
          fault_code: "E14",
          title: "Unverified vendor code (E14)",
          source_status: "unverified_vendor_code",
          disclaimer: "",
        },
      },
      branchId: "branch-1",
      branchOpen: true,
      role: "machine_maintenance",
      onOpenServiceModal: () => {},
      onClose: () => {},
    }));
    const specialistText = specialistHtml.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");
    expect(specialistText).toContain("Machine has 2 active incidents.");
    expect(specialistText).toContain("View Incidents");
    expect(specialistText).toContain("Unverified vendor code (E14)");
    expect(specialistText).not.toContain("Placeholder guide");
    expect(specialistText).not.toContain("CLEAR FAULT");
    expect(specialistText).not.toContain("Service & Resolve Issue");
    expect(specialistText).toContain("Maintenance & Service");
  });

  it("renders amber maintenance badge and floating modal launcher for maintenance state", () => {
    const maintenanceWasher: RemoteMachine = {
      ...washer,
      state: "maintenance",
      data: {
        ...washer.data,
        fault_code: "E01",
        fault_name: "Water Inlet Failure",
      },
      diagnosis: {
        fault_code: "E01",
        title: "Water Inlet Failure",
        source_status: "placeholder_washer_guide",
        disclaimer: "Placeholder troubleshooting guide pending vendor manual.",
        plain_explanation: "The washer did not detect expected fill within intake window.",
        likely_causes: ["Wall shutoff valve closed"],
        safety_precautions: "Verify floor dryness around outlets.",
        troubleshooting_steps: ["Confirm water supply valve is fully open."],
      },
    };

    const cardHtml = renderToString(React.createElement(MachineCard, {
      ...cardProps,
      machine: maintenanceWasher,
    }));
    expect(cardHtml).toContain("Under maintenance (E01)");
    expect(cardHtml).toContain("text-warning");

    const fleetHtml = renderToString(React.createElement(RemoteMachineFleet, {
      branchId: "branch-1",
      branchOpen: true,
      role: "machine_maintenance",
      defaultTechnicianName: "Ali Technician",
      initialMachines: [maintenanceWasher],
    }));
    const fleetText = fleetHtml.replace(/<!--.*?-->/g, "");
    expect(fleetText).toContain("Maintenance (1)");

    const modalHtml = renderToString(React.createElement(MachineDetailModal, {
      machine: maintenanceWasher,
      branchId: "branch-1",
      branchOpen: true,
      role: "machine_maintenance",
      defaultTechnicianName: "Ali Technician",
      onOpenServiceModal: () => {},
      onClose: () => {},
    }));
    expect(modalHtml).toContain("Machine under maintenance");
    expect(modalHtml).toContain("Water Inlet Failure");
    expect(modalHtml).toContain("Continue Maintenance Log");
    expect(modalHtml).toContain("Machine Testing");
    expect(modalHtml).not.toContain("Statistics &amp; Revenue");
  });

  it("renders clean stale offline badge when backend omits raw state as unknown", () => {
    const staleUnknownCard = renderToString(React.createElement(MachineCard, {
      ...cardProps,
      machine: { ...washer, freshness: "stale", state: "unknown" },
    }));
    expect(staleUnknownCard).toContain("Offline / Telemetry stale");
    expect(staleUnknownCard).not.toContain("last reported UNKNOWN");
  });

  it("places Machine status & Remaining estimate inside Machine Testing, removes Source Provenance, and colors active running timer", () => {
    const runningWasher: RemoteMachine = {
      ...washer,
      state: "running",
      data: {
        ...washer.data,
        remaining_seconds: 90,
      },
    };
    const runningHtml = renderToString(React.createElement(MachineDetailModal, {
      machine: runningWasher,
      branchId: "branch-1",
      branchOpen: true,
      role: "machine_maintenance",
      onClose: () => {},
    }));
    const runningText = runningHtml.replace(/<!--.*?-->/g, "");

    expect(runningText).not.toContain("Source Provenance");
    const testingIdx = runningText.indexOf("Machine Testing");
    const statusIdx = runningText.indexOf("Machine status");
    const estimateIdx = runningText.indexOf("Remaining estimate");
    expect(testingIdx).toBeGreaterThan(-1);
    expect(statusIdx).toBeGreaterThan(testingIdx);
    expect(estimateIdx).toBeGreaterThan(statusIdx);
    expect(runningText).toContain("border-positive/40 bg-positive/10");
    expect(runningText).toContain("text-positive");
    expect(runningText).toContain("01:30 (90 s)");

    const idleHtml = renderToString(React.createElement(MachineDetailModal, {
      machine: washer,
      branchId: "branch-1",
      branchOpen: true,
      role: "owner",
      onClose: () => {},
    }));
    expect(idleHtml).toContain("border-control/50 bg-navy/70");

    const maintHtml = renderToString(React.createElement(MachineDetailModal, {
      machine: { ...washer, state: "maintenance" },
      branchId: "branch-1",
      branchOpen: true,
      role: "owner",
      onClose: () => {},
    }));
    expect(maintHtml).toContain("border-warning/40 bg-warning/10");

    const errorHtml = renderToString(React.createElement(MachineDetailModal, {
      machine: { ...washer, state: "error" },
      branchId: "branch-1",
      branchOpen: true,
      role: "owner",
      onClose: () => {},
    }));
    expect(errorHtml).toContain("border-negative/40 bg-negative/10");

    expect(formatCountdownSeconds(90)).toBe("01:30 (90 s)");
    expect(
      renderToString(React.createElement(MachineCountdownTimer, {
        initialSeconds: 90,
        isRunning: false,
        isPaused: false,
      })),
    ).toBe("—");
  });

  it("renders Add program, Edit, and Delete only on custom programs for idle operators", () => {
    const programsHtml = renderToString(React.createElement(MachineDetailModal, {
      machine: washer,
      branchId: "branch-1",
      branchOpen: true,
      role: "owner",
      initialTab: "programs",
      onClose: () => {},
    }));
    const text = programsHtml.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Saved programs");
    expect(text).toContain("Add program");
    expect(text).toContain("Quick");
    expect(text).toContain("ECODEMO");

    // One Delete button (custom p_fe20185dc7ed only, never Quick) and two Edit buttons
    expect(programsHtml.match(/>Delete</g)?.length).toBe(1);
    expect(programsHtml.match(/>Edit</g)?.length).toBe(2);

    // Maintenance technician sees read-only list without Add/Edit/Delete controls
    const techHtml = renderToString(React.createElement(MachineDetailModal, {
      machine: washer,
      branchId: "branch-1",
      branchOpen: true,
      role: "machine_maintenance",
      initialTab: "programs",
      onClose: () => {},
    }));
    expect(techHtml).not.toContain(">Add program<");
    expect(techHtml).not.toContain(">Edit<");
    expect(techHtml).not.toContain(">Delete<");
  });
});
