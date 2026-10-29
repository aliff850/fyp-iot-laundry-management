import { describe, it, expect, vi } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { LpgCylinderCard } from "@/components/workspace/lpg/LpgCylinderCard";
import { LpgSafetyPanel } from "@/components/workspace/lpg/LpgSafetyPanel";
import { LpgWorkspaceView } from "@/components/workspace/lpg/LpgWorkspaceView";
import type { LpgBranchData, LpgCylinderItem } from "@/lib/auth/business";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/branches/test-branch/lpg",
}));

vi.mock("@/app/branches/[branchId]/lpg/actions", () => ({
  executeStartReplacement: vi.fn().mockResolvedValue({ success: true }),
  executeCompleteReplacement: vi.fn().mockResolvedValue({ success: true }),
  executeCancelReplacement: vi.fn().mockResolvedValue({ success: true }),
  executeEmergencyShutoff: vi.fn().mockResolvedValue({ success: true }),
}));

const mockCylinderPhysical: LpgCylinderItem = {
  id: "cyl-1",
  label: "Cylinder #01 (Station A)",
  position: 1,
  source_kind: "physical",
  gross_mass_kg: 26.8,
  cylinder_tare_kg: 15.0,
  rated_fuel_capacity_kg: 14.0,
  remaining_fuel_kg: 11.8,
  fill_percent: 84.3,
  status: "NORMAL",
  quality: "valid",
  maintenance_mode: false,
  is_connected: true,
  last_updated: "2026-10-29T00:00:00Z",
  replacement_start_time: null,
  service_note: null,
  mq6: {
    voltage: 0.42,
    baseline_voltage: 0.40,
    ppm_estimate: 180,
    status: "NORMAL",
    is_leak_detected: false,
  },
};

const mockCylinderSwapMode: LpgCylinderItem = {
  id: "cyl-3",
  label: "Cylinder #03 (Station C)",
  position: 3,
  source_kind: "simulated",
  gross_mass_kg: 16.5,
  cylinder_tare_kg: 15.0,
  rated_fuel_capacity_kg: 14.0,
  remaining_fuel_kg: 1.5,
  fill_percent: 10.7,
  status: "WARNING",
  quality: "valid",
  maintenance_mode: true,
  is_connected: true,
  last_updated: "2026-10-29T00:00:00Z",
  replacement_start_time: "2026-10-29T00:05:00Z",
  service_note: "Replacing depleted vessel",
};

const mockLpgData: LpgBranchData = {
  cylinders: [
    mockCylinderPhysical,
    {
      id: "cyl-2",
      label: "Cylinder #02 (Station B)",
      position: 2,
      source_kind: "simulated",
      gross_mass_kg: 28.5,
      cylinder_tare_kg: 15.0,
      rated_fuel_capacity_kg: 14.0,
      remaining_fuel_kg: 13.5,
      fill_percent: 96.4,
      status: "NORMAL",
      quality: "valid",
      maintenance_mode: false,
      is_connected: true,
      last_updated: "2026-10-29T00:00:00Z",
      replacement_start_time: null,
      service_note: null,
    },
    mockCylinderSwapMode,
    {
      id: "cyl-4",
      label: "Cylinder #04 (Station D)",
      position: 4,
      source_kind: "simulated",
      gross_mass_kg: 15.4,
      cylinder_tare_kg: 15.0,
      rated_fuel_capacity_kg: 14.0,
      remaining_fuel_kg: 0.4,
      fill_percent: 2.9,
      status: "CRITICAL",
      quality: "valid",
      maintenance_mode: false,
      is_connected: true,
      last_updated: "2026-10-29T00:00:00Z",
      replacement_start_time: null,
      service_note: null,
    },
  ],
  environment: {
    mq6: {
      sensor_id: "mq6-main",
      voltage: 0.85,
      baseline_voltage: 0.80,
      ppm_estimate: 245,
      status: "NORMAL",
      warmup_complete: true,
      is_leak_detected: false,
      source_kind: "physical",
      quality: "valid",
      last_updated: "2026-10-29T00:00:00Z",
    },
    dht22: {
      sensor_id: "dht22-main",
      temperature_celsius: 28.5,
      humidity_percent: 62.0,
      status: "NORMAL",
      is_high_heat: false,
      source_kind: "physical",
      quality: "valid",
      last_updated: "2026-10-29T00:00:00Z",
    },
    safety_valve: {
      state: "OPEN",
      emergency_shutoff: false,
      last_actuated: "2026-10-29T00:00:00Z",
    },
  },
  summary: {
    total_cylinders: 4,
    active_cylinders: 3,
    total_remaining_fuel_kg: 27.2,
    total_rated_capacity_kg: 56.0,
    weighted_fuel_percent: 48.6,
    measurement_coverage: "4/4 (100%)",
    status: "Healthy",
  },
  incidents: [],
};

describe("LpgCylinderCard component", () => {
  it("renders cylinder information, mass readouts, and enlarged PPM gas reading", () => {
    const raw = ReactDOMServer.renderToString(
      React.createElement(LpgCylinderCard, {
        cylinder: mockCylinderPhysical,
        branchId: "b-01",
        userRole: "lpg_maintenance",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    expect(text).toContain("Cylinder #01 (Station A)");
    expect(text).toContain("11.8 kg / 14.0 kg");
    expect(text).toContain("84.3%");
    expect(text).toContain("Gas Reading");
    expect(text).toContain("PPM Level");
    expect(text).toContain("180");
    expect(text).toContain("PPM");
    expect(text).not.toContain("0.42 V");
    expect(text).toContain("Start Tank Replacement");
    // Strictly verify no font-mono
    expect(raw).not.toContain("font-mono");
  });

  it("renders Swap Mode controls and silenced notification badge when in maintenance", () => {
    const raw = ReactDOMServer.renderToString(
      React.createElement(LpgCylinderCard, {
        cylinder: mockCylinderSwapMode,
        branchId: "b-01",
        userRole: "owner",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    expect(text).toContain("Swap Mode");
    expect(text).toContain("Swap Mode · Alarms Silenced");
    expect(text).toContain("Complete Replacement");
    expect(text).toContain("Cancel Swap Mode");
    expect(raw).not.toContain("font-mono");
  });
});

describe("LpgSafetyPanel component", () => {
  it("renders high ambient temperature banner when temperature exceeds 45°C limit", () => {
    const highHeatEnv = {
      ...mockLpgData.environment,
      dht22: {
        ...mockLpgData.environment.dht22,
        temperature_celsius: 48.2,
        is_high_heat: true,
        status: "CRITICAL" as const,
      },
    };

    const raw = ReactDOMServer.renderToString(
      React.createElement(LpgSafetyPanel, {
        environment: highHeatEnv,
        incidents: [],
        branchId: "b-01",
        userRole: "owner",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");

    expect(text).toContain("High Ambient Facility Temperature");
    expect(text).toContain("48.2°C");
    expect(raw).not.toContain("font-mono");
  });

  it("renders leak hazard warning and trip emergency valve button during active leak", () => {
    const leakEnv = {
      ...mockLpgData.environment,
      mq6: {
        ...mockLpgData.environment.mq6,
        is_leak_detected: true,
        voltage: 1.85,
        status: "CRITICAL" as const,
      },
    };

    const raw = ReactDOMServer.renderToString(
      React.createElement(LpgSafetyPanel, {
        environment: leakEnv,
        incidents: [],
        branchId: "b-01",
        userRole: "lpg_maintenance",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");

    expect(text).toContain("LPG Combustible Gas Leak Detected");
    expect(text).toContain("Trip Emergency Valve");
    expect(raw).not.toContain("font-mono");
  });
});

describe("LpgWorkspaceView orchestrator component", () => {
  it("renders Manifold KPI banner and 4-column responsive grid container", () => {
    const raw = ReactDOMServer.renderToString(
      React.createElement(LpgWorkspaceView, {
        initialData: mockLpgData,
        branchId: "b-01",
        userRole: "owner",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");

    // Shared Climate Atmosphere Header
    expect(text).toContain("Shared Environmental Atmosphere");
    expect(text).toContain("28.5");
    expect(text).toContain("62.0");

    // KPI Metrics
    expect(text).toContain("Manifold Fuel Mass");
    expect(text).toContain("27.2");
    expect(text).toContain("Weighted Fuel Level");
    expect(text).toContain("48.6%");
    expect(text).toContain("Active Cylinders");
    expect(text).toContain("System Status");

    // 4-column grid container for cylinders
    expect(raw).toContain("grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4");

    // All 4 cylinders present
    expect(text).toContain("Cylinder #01 (Station A)");
    expect(text).toContain("Cylinder #02 (Station B)");
    expect(text).toContain("Cylinder #03 (Station C)");
    expect(text).toContain("Cylinder #04 (Station D)");

    // Strictly verify no font-mono
    expect(raw).not.toContain("font-mono");
  });
});
