import { describe, it, expect, vi } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";
import { LpgCylinderCard } from "@/components/workspace/lpg/LpgCylinderCard";
import { LpgGasBaselineModal } from "@/components/workspace/lpg/LpgGasBaselineModal";
import { LpgSafetyPanel } from "@/components/workspace/lpg/LpgSafetyPanel";
import { LpgTankSwapModal } from "@/components/workspace/lpg/LpgTankSwapModal";
import { LpgWorkspaceView } from "@/components/workspace/lpg/LpgWorkspaceView";
import type { LpgSafetySnapshot, SafetyNodeDevice } from "@/lib/auth/business";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/branches/test-branch/lpg",
}));

vi.mock("@/app/branches/[branchId]/lpg/actions", () => ({
  refreshBranchLpgSafety: vi.fn(),
  fetchLpgMaintenanceStatus: vi.fn(),
  startBranchLpgTankSwap: vi.fn(),
  completeBranchLpgTankSwap: vi.fn(),
  calibrateBranchLpgGasBaseline: vi.fn(),
  fetchLpgCommandStatus: vi.fn(),
}));

const freshDevice: SafetyNodeDevice = {
  id: "88888888-8888-8888-8888-888888888888",
  source_id: "esp32-lpg-01",
  type: "lpg_edge_node",
  source_kind: "physical",
  label: "Primary Weighing Station",
  capacity_kg: 14.0,
  observation: {
    record_id: "99999999-9999-9999-9999-999999999999",
    source_id: "esp32-lpg-01",
    sample_at: "2026-11-15T05:59:54Z",
    received_at: "2026-11-15T05:59:55Z",
    cloud_received_at: "2026-11-15T05:59:56Z",
    source_time_quality: "device_reported",
    freshness: "fresh",
    source_kind: "physical",
    sync_state: "synced",
    quality: {
      source_time_quality: "device_reported",
      weight_valid: true,
      temperature_valid: true,
      humidity_valid: true,
    },
    values: {
      lpg_weight_kg: 11.55,
      gross_weight_kg: 25.55,
      lpg_percent: 82.5,
      mq6_raw_adc: 412,
      voltage: 0.41,
      temperature: 29.4,
      humidity: 61.2,
    },
  },
};

const staleDevice: SafetyNodeDevice = {
  ...freshDevice,
  id: "77777777-7777-7777-7777-777777777777",
  source_id: "esp32-lpg-02",
  source_kind: "simulated",
  label: "Reserve Tank Node",
  observation: {
    ...freshDevice.observation!,
    source_id: "esp32-lpg-02",
    freshness: "stale",
    source_kind: "simulated",
  },
};

const uninitializedDevice: SafetyNodeDevice = {
  id: "66666666-6666-6666-6666-666666666666",
  source_id: "esp32-lpg-03",
  type: "lpg_edge_node",
  source_kind: "physical",
  label: "Unreported Station",
  capacity_kg: null,
  observation: null,
};

const snapshotFixture: LpgSafetySnapshot = {
  branch_id: "44444444-4444-4444-4444-444444444444",
  checked_at: "2026-11-15T06:00:00Z",
  devices: [freshDevice, staleDevice, uninitializedDevice],
  summary: {
    total_nodes: 3,
    fresh_nodes: 1,
    stale_nodes: 1,
    offline_nodes: 0,
    uninitialized_nodes: 1,
  },
};

describe("LpgCylinderCard component", () => {
  it("renders fresh Pi 5 safetyCard telemetry, uncalibrated gas status, and Tier 1 cloud delivery", () => {
    const raw = ReactDOMServer.renderToString(
      React.createElement(LpgCylinderCard, { device: freshDevice }),
    );
    const text = raw.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");

    expect(text).toContain("Primary Weighing Station");
    expect(text).toContain("Device ID");
    expect(text).toContain("esp32-lpg-01");
    expect(text).toContain("Fresh");
    expect(text).toContain("Cloud delivery synced");
    expect(text).toContain("Reported level");
    expect(text).toContain("82.5%");
    expect(text).toContain("Gross mass");
    expect(text).toContain("25.55 kg");
    expect(text).toContain("Reported fuel");
    expect(text).toContain("11.55 kg");
    expect(text).toContain("Gas status");
    expect(text).toContain("Uncalibrated");
    expect(text).toContain("Est. LPG");
    expect(text).toContain("Baseline needed");
    expect(text).toContain("Temperature");
    expect(text).toContain("29.4 °C");
    expect(text).toContain("Humidity");
    expect(text).toContain("61.2%");
    expect(text).toContain("Last sample");
    expect(text).not.toContain("MQ-6 raw ADC");
    expect(text).not.toContain("MQ-6 voltage");
    expect(raw).not.toContain("font-mono");
    expect(raw).not.toContain("<text");
    expect(raw).toContain('role="progressbar"');
  });

  it("renders calibrated PPM and tank-swap maintenance state matching Pi 5 safetyCard", () => {
    const maintCalibratedDevice: SafetyNodeDevice = {
      ...freshDevice,
      maintenance_mode: true,
      maintenance_session: { started_by: "Aliff" },
      gas_interpretation: {
        ppm_calibrated: true,
        gas_condition: "warning",
        estimated_ppm: 540,
      },
    };
    const raw = ReactDOMServer.renderToString(
      React.createElement(LpgCylinderCard, { device: maintCalibratedDevice }),
    );
    const text = raw.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");

    expect(text).toContain("Maintenance");
    expect(text).toContain("Fuel level");
    expect(text).toContain("Paused (Tank swap)");
    expect(text).toContain("Live scale");
    expect(text).toContain("25.55 kg");
    expect(text).toContain("Started by");
    expect(text).toContain("Aliff");
    expect(text).toContain("Elevated");
    expect(text).toContain("540 ppm");
    expect(raw).not.toContain('role="progressbar"');
  });

  it("masks stale readings to em-dash and omits live progress bar", () => {
    const raw = ReactDOMServer.renderToString(
      React.createElement(LpgCylinderCard, { device: staleDevice }),
    );
    const text = raw.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");

    expect(text).toContain("Reserve Tank Node");
    expect(text).toContain("esp32-lpg-02");
    expect(text).toContain("Stale");
    expect(text).not.toContain("25.55 kg");
    expect(text).not.toContain("29.4 °C");
    expect(raw).not.toContain('role="progressbar"');
  });

  it("handles missing observation cleanly", () => {
    const raw = ReactDOMServer.renderToString(
      React.createElement(LpgCylinderCard, { device: uninitializedDevice }),
    );
    const text = raw.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");

    expect(text).toContain("No approved observation");
    expect(text).toContain("Cloud delivery unknown");
  });
});

describe("LpgSafetyPanel & LpgWorkspaceView", () => {
  it("renders empty message when branch has no approved safety nodes", () => {
    const raw = ReactDOMServer.renderToString(
      React.createElement(LpgSafetyPanel, { devices: [] }),
    );
    const text = raw.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");

    expect(text).toContain("No approved LPG or safety nodes on this branch.");
  });

  it("renders feed of approved safety nodes and polling view container", () => {
    const raw = ReactDOMServer.renderToString(
      React.createElement(LpgWorkspaceView, {
        initialSnapshot: snapshotFixture,
        branchId: snapshotFixture.branch_id,
      }),
    );
    const text = raw.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");

    expect(text).toContain("LPG & Safety");
    expect(text).toContain("LPG & Safety nodes");
    expect(raw).toContain('role="feed"');
    expect(text).toContain("Primary Weighing Station");
    expect(text).toContain("Reserve Tank Node");
    expect(text).toContain("Unreported Station");
    expect(text).toContain("Calibrate clean air");
    expect(text).toContain("Swap tank");
    expect(text).toContain("Maintenance / Log service");
    expect(text).toContain("Online");
    expect(raw).toContain("min-h-11");
    expect(raw).toContain("bg-navy");
    expect(raw).toContain("bg-ink");
    expect(raw).toContain("text-surface");
    expect(raw).not.toContain("size-2 rounded-full");
    expect(raw).not.toContain("bg-control");
    expect(raw).not.toContain("font-mono");
  });

  it("switches footer labels to Recalibrate gas and Complete tank swap when calibrated & in maintenance", () => {
    const calibratedMaintDevice: SafetyNodeDevice = {
      ...freshDevice,
      maintenance_mode: true,
      maintenance_session: {
        started_by: "Aliff",
        service_note: "Morning cylinder swap",
      },
      gas_interpretation: {
        ppm_calibrated: true,
        gas_condition: "normal",
        estimated_ppm: 12.4,
      },
      lpg_config: {
        mq6_vcc_v: 5.0,
        mq6_rl_kohm: 20.0,
        mq6_divider_ratio: 1.0,
        mq6_ro_kohm: 9.8,
        mq6_baseline_v: 0.92,
        gas_warn_ppm: 20,
        gas_crit_ppm: 80,
        cylinder_tare_kg: 15.2,
        rated_capacity_kg: 14.0,
        stability_tolerance_kg: 0.25,
      },
    };

    const raw = ReactDOMServer.renderToString(
      React.createElement(LpgCylinderCard, {
        device: calibratedMaintDevice,
        branchId: snapshotFixture.branch_id,
      }),
    );
    const text = raw.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");

    expect(text).toContain("Recalibrate gas");
    expect(text).toContain("Complete tank swap");
    expect(text).toContain("Morning cylinder swap");
  });

  it("renders Low mode reminder badge when fuel falls below 15% without creating an Incident badge", () => {
    const lowDevice: SafetyNodeDevice = {
      ...freshDevice,
      operating_mode: "low",
      low_fuel_reminder: true,
      observation: {
        ...freshDevice.observation!,
        values: {
          ...freshDevice.observation!.values,
          lpg_percent: 11.5,
          lpg_weight_kg: 1.61,
        },
      },
    };
    const raw = ReactDOMServer.renderToString(
      React.createElement(LpgCylinderCard, {
        device: lowDevice,
        branchId: snapshotFixture.branch_id,
      }),
    );
    const text = raw.replace(/<!--.*?-->/g, "").replace(/&amp;/g, "&");
    expect(text).toContain("Low — Replace soon");
    expect(text).not.toContain(">Incident<");
  });
});

describe("LpgTankSwapModal & LpgGasBaselineModal", () => {
  it("renders Start & Complete tank swap dialogs with pre-filled staff attribution and scale verification", () => {
    const startRaw = ReactDOMServer.renderToString(
      React.createElement(LpgTankSwapModal, {
        open: true,
        mode: "start",
        branchId: snapshotFixture.branch_id,
        device: freshDevice,
        defaultActorName: "Farah",
        onClose: vi.fn(),
        onConfirmed: vi.fn(),
      }),
    );
    expect(startRaw).toContain('role="dialog"');
    expect(startRaw).toContain("Start tank swap");
    expect(startRaw).toContain("Farah");
    expect(startRaw).toContain("Service note (optional)");
    expect(startRaw).not.toContain("bg-control");
    expect(startRaw).not.toContain(" ? ");
    expect(startRaw).not.toContain("font-mono");

    const completeRaw = ReactDOMServer.renderToString(
      React.createElement(LpgTankSwapModal, {
        open: true,
        mode: "complete",
        branchId: snapshotFixture.branch_id,
        device: freshDevice,
        defaultActorName: "Farah",
        onClose: vi.fn(),
        onConfirmed: vi.fn(),
      }),
    );
    expect(completeRaw).toContain("Complete tank swap");
    expect(completeRaw).toContain("Waiting for stable scale reading");
    expect(completeRaw).toContain("Empty cylinder tare (kg)");
    expect(completeRaw).toContain("Rated LPG capacity (kg)");
    expect(completeRaw).toContain("Confirm tank swap");
  });

  it("renders Gas Baseline calibration modal with alert limits and advanced circuit controls", () => {
    const raw = ReactDOMServer.renderToString(
      React.createElement(LpgGasBaselineModal, {
        open: true,
        branchId: snapshotFixture.branch_id,
        device: freshDevice,
        defaultActorName: "Farah",
        onClose: vi.fn(),
        onConfirmed: vi.fn(),
      }),
    );
    expect(raw).toContain('role="dialog"');
    expect(raw).toContain("Calibrate gas baseline");
    expect(raw).toContain("Warning alert (ppm)");
    expect(raw).toContain("Critical alert (ppm)");
    expect(raw).toContain("Advanced circuit settings");
    expect(raw).toContain("Clear calibration");
    expect(raw).toContain("Save alert limits");
    expect(raw).toContain("Calibrate clean air");
    expect(raw).toContain("bg-negative");
    expect(raw).not.toContain("bg-control");
    expect(raw).not.toContain(" ? ");
    expect(raw).not.toContain("font-mono");
  });
});
