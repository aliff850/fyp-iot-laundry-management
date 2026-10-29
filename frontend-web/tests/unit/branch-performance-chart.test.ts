import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { BranchPerformanceChart } from "@/components/workspace/overview/BranchPerformanceChart";
import type { BranchDetail } from "@/lib/auth/business";

const mockBranch: Pick<BranchDetail, "id" | "name"> = {
  id: "branch-test-1",
  name: "MSU Shah Alam",
};

describe("BranchPerformanceChart component", () => {
  it("renders the branch performance panel with title and the 4 core metric definitions", () => {
    const raw = renderToString(
      React.createElement(BranchPerformanceChart, {
        branch: mockBranch,
        performance: null,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Branch Performance &amp; Resource Analytics");
    expect(text).toContain("Cumulative Revenue");
    expect(text).toContain("Machine Cycles");
    expect(text).toContain("Cumulative Water Usage");
    expect(text).toContain("Cumulative Gas Usage");
  });

  it("renders the 4 metric buttons with correct short labels", () => {
    const raw = renderToString(
      React.createElement(BranchPerformanceChart, {
        branch: mockBranch,
        performance: null,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Revenue");
    expect(text).toContain("Cycles");
    expect(text).toContain("Water Usage");
    expect(text).toContain("LPG Gas");
  });

  it("truthfully renders blank/pending indicators when no telemetry data is supplied", () => {
    const raw = renderToString(
      React.createElement(BranchPerformanceChart, {
        branch: mockBranch,
        performance: null,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    // Must render dash placeholders, never fabricated zeroes
    expect(text).toContain("—");
    expect(text).toContain("No revenue records recorded yet");
    expect(text).toContain("Awaiting telemetry");
  });

  it("provides daily, weekly, and monthly timeframe selectors", () => {
    const raw = renderToString(
      React.createElement(BranchPerformanceChart, {
        branch: mockBranch,
        performance: null,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("daily");
    expect(text).toContain("weekly");
    expect(text).toContain("monthly");
  });

  it("displays real performance data when provided in daily mode", () => {
    const raw = renderToString(
      React.createElement(BranchPerformanceChart, {
        branch: mockBranch,
        performance: {
          today_revenue_myr: 450.5,
          today_cycles: 64,
          fleet_utilization_rate: 82.5,
          lpg_consumed_kg: 18.2,
        },
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("RM 450.50");
    expect(text).toContain("64");
    expect(text).toContain("18.2 kg");
    expect(text).toContain("Recorded telemetry");
  });

  it("renders the canvas element for Chart.js rendering", () => {
    const raw = renderToString(
      React.createElement(BranchPerformanceChart, {
        branch: mockBranch,
        performance: null,
      })
    );
    expect(raw).toContain("<canvas");
    expect(raw).toContain("role=\"img\"");
  });

  it("registers the line controller for Chart.js without runtime error", async () => {
    const { default: Chart } = await import("chart.js/auto");
    const lineController = Chart.registry.getController("line");
    expect(lineController).toBeDefined();
    expect(typeof lineController).toBe("function");
  });
});

