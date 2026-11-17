import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MachineCard } from "@/components/workspace/machines/MachineCard";
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
    expect(html).not.toContain("Unlock door");
    expect(html).not.toContain("RM 4.00");
  });

  it("keeps stale machines unknown and disables cycle controls", () => {
    const html = renderToString(React.createElement(MachineCard, {
      ...cardProps,
      machine: { ...washer, freshness: "stale", state: "idle" },
    }));
    expect(html).toContain("Stale");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*><svg[^>]*>[\s\S]*?<span>Start<\/span>/);
  });

  it("does not expose cycle controls or prices to a machine specialist", () => {
    const html = renderToString(React.createElement(MachineDetailModal, {
      machine: washer,
      branchId: "branch-1",
      branchOpen: true,
      role: "machine_maintenance",
      onClose: () => {},
    }));
    expect(html).not.toContain("Program for START");
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
});
