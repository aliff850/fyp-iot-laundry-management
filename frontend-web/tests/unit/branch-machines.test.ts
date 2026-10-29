import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MachineCard } from "@/components/workspace/machines/MachineCard";
import { MachineDetailModal } from "@/components/workspace/machines/MachineDetailModal";
import { MachineFleetView } from "@/components/workspace/machines/MachineFleetView";
import type { MachineItem } from "@/lib/auth/business";

const mockWasherRunning: MachineItem = {
  id: "W-01",
  branch_id: "b1111111-1111-1111-1111-111111111111",
  name: "Washer #01 (15kg)",
  type: "washer",
  status: "RUNNING",
  remaining_time: 18,
  current_cycle: "Standard Cotton 40°C",
  phase: "Wash",
  capacity_kg: 15,
  power_w: 1850.0,
  water_l: 48.0,
  drum_rpm: 800,
  fault_code: null,
  fault_subsystem: null,
  fault_remediation: null,
  parameters: {
    price: 6.0,
    duration_mins: 35,
    temp_celsius: 40,
    water_level: "High",
    spin_speed: 1200,
    door_locked: true,
  },
};

const mockWasherIdle: MachineItem = {
  id: "W-02",
  branch_id: "b1111111-1111-1111-1111-111111111111",
  name: "Washer #02 (15kg)",
  type: "washer",
  status: "IDLE",
  remaining_time: 0,
  current_cycle: null,
  phase: "Idle",
  capacity_kg: 15,
  power_w: 35.0,
  water_l: 0.0,
  drum_rpm: 0,
  fault_code: null,
  fault_subsystem: null,
  fault_remediation: null,
  parameters: {
    price: 6.0,
    duration_mins: 30,
    temp_celsius: 30,
    water_level: "Medium",
    spin_speed: 800,
    door_locked: false,
  },
};

const mockDryerFault: MachineItem = {
  id: "D-01",
  branch_id: "b1111111-1111-1111-1111-111111111111",
  name: "Dryer #01 (Gas 16kg)",
  type: "dryer",
  status: "ERROR",
  remaining_time: 0,
  current_cycle: "High Heat Express",
  phase: "Idle",
  capacity_kg: 16,
  power_w: 0.0,
  water_l: 0.0,
  drum_rpm: 0,
  fault_code: "E-302",
  fault_subsystem: "Ignition",
  fault_remediation: "Verify LPG cylinder manifold pressure and inspect spark igniter.",
  parameters: {
    price: 5.5,
    duration_mins: 30,
    temp_celsius: 65,
    water_level: "Low",
    spin_speed: 400,
    door_locked: false,
  },
};

const mockMaintenanceProjection: MachineItem = {
  ...mockWasherRunning,
  parameters: {
    ...mockWasherRunning.parameters,
    price: null, // PRD FM-06 & Section 4.4: financial pricing stripped for maintenance
  },
};

describe("MachineCard component", () => {
  it("renders running washer with full SVG, status, remaining time, and three buttons (Start, Pause, Stop)", () => {
    const raw = renderToString(
      React.createElement(MachineCard, {
        machine: mockWasherRunning,
        branchId: "b1111111-1111-1111-1111-111111111111",
        userRole: "owner",
        onOpenDetails: () => {},
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    // Title
    expect(text).toContain("Washer #01 (15kg)");
    // Full SVG representation
    expect(text).toContain("Commercial Washer illustration (RUNNING)");
    // Machine status section
    expect(text).toContain("Running");
    expect(text).toContain("Standard Cotton 40°C");
    // Remaining time section
    expect(text).toContain("18 min remaining");
    // Three buttons section
    expect(text).toContain("Start");
    expect(text).toContain("Pause");
    expect(text).toContain("Stop");
    // In running state, pause button is enabled, start button is disabled
    expect(raw).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*?<span>Start<\/span>/);
    expect(raw).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*?<span>Pause<\/span>/);
    // Modal trigger
    expect(text).toContain("Details &amp; Parameters");
    // No font-mono
    expect(raw).not.toContain("font-mono");
  });

  it("renders idle machine with enabled Start button and disabled Pause/Stop buttons", () => {
    const raw = renderToString(
      React.createElement(MachineCard, {
        machine: mockWasherIdle,
        branchId: "b1111111-1111-1111-1111-111111111111",
        userRole: "branch_manager",
        onOpenDetails: () => {},
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Washer #02 (15kg)");
    expect(text).toContain("Idle / Available");
    expect(text).toContain("Ready (30 min cycle)");
    expect(text).toContain("Start");
    expect(text).toContain("Pause");
    expect(text).toContain("Stop");
    // Start is enabled; Pause and Stop are disabled
    expect(raw).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*?<span>Start<\/span>/);
    expect(raw).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*?<span>Pause<\/span>/);
    expect(raw).toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*?<span>Stop<\/span>/);
  });

  it("restricts cycle controls and omits price for machine maintenance specialist", () => {
    const raw = renderToString(
      React.createElement(MachineCard, {
        machine: mockMaintenanceProjection,
        branchId: "b1111111-1111-1111-1111-111111111111",
        userRole: "machine_maintenance",
        onOpenDetails: () => {},
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Washer #01 (15kg)");
    expect(text).toContain("Diagnostics only");
    expect(text).toContain("Operator controls restricted");
    // Cycle control buttons are NOT rendered or replaced by diagnostics text
    expect(text).not.toContain("<span>Start</span>");
    // Ensure financial pricing is NOT rendered
    expect(text).not.toContain("RM 6.00");
  });

  it("renders fault warning banner with remediation instructions on ERROR status", () => {
    const raw = renderToString(
      React.createElement(MachineCard, {
        machine: mockDryerFault,
        branchId: "b1111111-1111-1111-1111-111111111111",
        userRole: "owner",
        onOpenDetails: () => {},
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Dryer #01 (Gas 16kg)");
    expect(text).toContain("Commercial Dryer illustration (ERROR)");
    expect(text).toContain("Fault: E-302");
    expect(text).toContain("Cycle interrupted");
  });
});

describe("MachineDetailModal component", () => {
  it("renders modal structure with diagnostic tabs and fault details", () => {
    const raw = renderToString(
      React.createElement(MachineDetailModal, {
        machine: mockDryerFault,
        branchId: "b1111111-1111-1111-1111-111111111111",
        userRole: "owner",
        isOpen: true,
        onClose: () => {},
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Dryer #01 (Gas 16kg)");
    expect(text).toContain("State &amp; Diagnostics");
    expect(text).toContain("Programs Catalog");
    expect(text).toContain("Parameters &amp; Pricing");
    expect(text).toContain("Active Fault: E-302 (Ignition)");
    expect(text).toContain("Verify LPG cylinder manifold pressure and inspect spark igniter.");
    // No font-mono
    expect(raw).not.toContain("font-mono");
  });

  it("does not render when isOpen is false", () => {
    const raw = renderToString(
      React.createElement(MachineDetailModal, {
        machine: mockWasherRunning,
        branchId: "b1111111-1111-1111-1111-111111111111",
        userRole: "owner",
        isOpen: false,
        onClose: () => {},
      })
    );
    expect(raw).toBe("");
  });
});

describe("MachineFleetView component", () => {
  it("renders fleet category buttons, status filters, 4-column grid, and machine cards", () => {
    const raw = renderToString(
      React.createElement(MachineFleetView, {
        initialMachines: [mockWasherRunning, mockWasherIdle, mockDryerFault],
        branchId: "b1111111-1111-1111-1111-111111111111",
        userRole: "owner",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("All Equipment");
    expect(text).toContain("Washers");
    expect(text).toContain("Dryers");
    expect(text).toContain("Running (1)");
    expect(text).toContain("Idle (1)");
    expect(text).toContain("Error (1)");
    expect(text).toContain("Washer #01 (15kg)");
    expect(text).toContain("Washer #02 (15kg)");
    expect(text).toContain("Dryer #01 (Gas 16kg)");
    // Verifies 4-column grid on large screens per Frontend-Specs.md Line 205
    expect(raw).toContain("xl:grid-cols-4");
    // Verifies no font-mono in MachineFleetView
    expect(raw).not.toContain("font-mono");
  });
});
