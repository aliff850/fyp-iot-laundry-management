import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  LpgTankLevelsChart,
  deriveLpgTankEntries,
} from "@/components/workspace/branches/LpgTankLevelsChart";
import type { LpgSafetySnapshot, SafetyNodeDevice } from "@/lib/auth/business";

vi.mock("@/app/branches/[branchId]/lpg/actions", () => ({
  refreshBranchLpgSafety: vi.fn(),
}));

const BRANCH_ID = "22222222-2222-2222-2222-222222222222";

function makeDevice(overrides: Partial<SafetyNodeDevice> = {}): SafetyNodeDevice {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    source_id: "esp32-lpg-01",
    type: "lpg_edge_node",
    source_kind: "physical",
    label: "Main Weigh Station",
    capacity_kg: 14.0,
    observation: {
      record_id: "rec-1",
      source_id: "esp32-lpg-01",
      sample_at: "2026-11-16T00:15:00Z",
      received_at: "2026-11-16T00:15:01Z",
      cloud_received_at: "2026-11-16T00:15:02Z",
      source_time_quality: "device_reported",
      freshness: "fresh",
      source_kind: "physical",
      sync_state: "synced",
      quality: {
        weight_valid: true,
      },
      values: {
        lpg_weight_kg: 9.8,
        gross_weight_kg: 23.8,
        lpg_percent: 70.0,
        mq6_raw_adc: 380,
        voltage: 0.38,
        estimated_ppm: 12.4,
        temperature: 28.5,
        humidity: 60.0,
      },
    },
    ...overrides,
  };
}

describe("LpgTankLevelsChart component & entry derivation", () => {
  it("plots fresh readings and suppresses non-fresh, scale-fault, and maintenance tanks honestly", () => {
    const devices: SafetyNodeDevice[] = [
      makeDevice({ source_id: "n-1", label: "Primary Tank" }),
      makeDevice({
        source_id: "n-2",
        label: "Low Reserve Tank",
        observation: {
          ...makeDevice().observation!,
          values: {
            ...makeDevice().observation!.values,
            lpg_percent: 11.2,
            lpg_weight_kg: 1.57,
          },
        },
      }),
      makeDevice({
        source_id: "n-3",
        label: "Critical Tank",
        observation: {
          ...makeDevice().observation!,
          values: {
            ...makeDevice().observation!.values,
            lpg_percent: 3.5,
            lpg_weight_kg: 0.49,
          },
        },
      }),
      makeDevice({
        source_id: "n-4",
        label: "Offline Tank",
        observation: {
          ...makeDevice().observation!,
          freshness: "offline",
        },
      }),
      makeDevice({
        source_id: "n-5",
        label: "Swapping Tank",
        observation: {
          ...makeDevice().observation!,
          quality: { weight_valid: true, maintenance_mode: true },
        },
      }),
    ];

    const entries = deriveLpgTankEntries(devices);
    expect(entries).toHaveLength(5);

    expect(entries[0]).toMatchObject({ percent: 70, stateLabel: "70.0%", tone: "positive" });
    expect(entries[1]).toMatchObject({ percent: 11.2, stateLabel: "11.2%", tone: "warning" });
    expect(entries[2]).toMatchObject({ percent: 3.5, stateLabel: "3.5%", tone: "negative" });
    expect(entries[3]).toMatchObject({ percent: null, stateLabel: "Offline", tone: "negative" });
    expect(entries[4]).toMatchObject({ percent: null, stateLabel: "Maintenance", tone: "warning" });
  });

  it("renders Chart.js canvas, live status count, and per-node readout list via SSR", () => {
    const snapshot: LpgSafetySnapshot = {
      branch_id: BRANCH_ID,
      checked_at: "2026-11-16T00:15:02Z",
      devices: [makeDevice()],
      summary: {
        total_nodes: 1,
        fresh_nodes: 1,
        stale_nodes: 0,
        offline_nodes: 0,
        uninitialized_nodes: 0,
      },
    };

    const html = renderToString(
      React.createElement(LpgTankLevelsChart, {
        branchId: BRANCH_ID,
        initialSnapshot: snapshot,
      })
    ).replace(/<!--.*?-->/g, "");

    expect(html).toContain("LPG gas tank levels");
    expect(html).toContain("1 live node");
    expect(html).toContain("Main Weigh Station");
    expect(html).toContain("70.0% (9.80 kg)");
    expect(html).toContain("<canvas");
  });

  it("renders empty branch state cleanly when no LPG edge nodes exist", () => {
    const html = renderToString(
      React.createElement(LpgTankLevelsChart, {
        branchId: BRANCH_ID,
        initialSnapshot: null,
        initialError: "LPG nodes temporarily unavailable",
      })
    ).replace(/<!--.*?-->/g, "");

    expect(html).toContain("No LPG nodes");
    expect(html).toContain("LPG nodes temporarily unavailable");
    expect(html).toContain("No approved LPG edge nodes in this branch.");
  });
});
