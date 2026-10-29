import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { PerformanceChart } from "@/components/workspace/branches/PerformanceChart";
import type { WorkspaceBranch } from "@/lib/auth/business";

const mockBranches: WorkspaceBranch[] = [
  {
    id: "branch-1",
    name: "MSU Shah Alam",
    address: "Seksyen 13",
    city: "Shah Alam",
    region: "Selangor",
    postal_code: "40100",
    contact_phone: "+60123456789",
    opening_hours: "24 Hours",
    latitude: 3.0738,
    longitude: 101.5183,
    service_status: "open",
    primary_manager_user_id: "user-1",
    created_at: "2026-10-27T00:00:00Z",
  },
  {
    id: "branch-2",
    name: "Subang Jaya SS15",
    address: "Jalan SS 15/4",
    city: "Subang Jaya",
    region: "Selangor",
    postal_code: "47500",
    contact_phone: "+60198765432",
    opening_hours: "24 Hours",
    latitude: 3.0763,
    longitude: 101.5878,
    service_status: "closed",
    primary_manager_user_id: "user-2",
    created_at: "2026-10-27T00:00:00Z",
  },
];

describe("PerformanceChart component", () => {
  it("renders the performance panel with title and core metric definitions", () => {
    const raw = renderToString(React.createElement(PerformanceChart, { branches: mockBranches }));
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Operations Performance");
    expect(text).toContain("Total Revenue");
    expect(text).toContain("Machine Cycles");
    expect(text).toContain("Fleet Utilization");
    expect(text).toContain("LPG Consumed");
  });

  it("truthfully renders blank/pending indicators when no telemetry data is supplied", () => {
    const raw = renderToString(React.createElement(PerformanceChart, { branches: mockBranches }));
    const text = raw.replace(/<!--.*?-->/g, "");
    // Must render dash placeholders, never fabricated zeroes
    expect(text).toContain("—");
    expect(text).toContain("No revenue records recorded yet");
  });

  it("provides daily, weekly, and monthly timeframe selectors", () => {
    const raw = renderToString(React.createElement(PerformanceChart, { branches: mockBranches }));
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("daily");
    expect(text).toContain("weekly");
    expect(text).toContain("monthly");
  });

  it("renders branch filter selector when multiple branches exist", () => {
    const raw = renderToString(React.createElement(PerformanceChart, { branches: mockBranches }));
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("All branches (2)");
    expect(text).toContain("MSU Shah Alam");
    expect(text).toContain("Subang Jaya SS15");
  });

  it("omits branch filter dropdown when only one branch exists", () => {
    const raw = renderToString(React.createElement(PerformanceChart, { branches: [mockBranches[0]] }));
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).not.toContain("Filter by branch");
  });
});
