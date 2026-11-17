import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import Chart from "chart.js/auto";
import { PerformanceChart } from "@/components/workspace/branches/PerformanceChart";
import type { BranchOverviewAnalytics } from "@/lib/auth/business";

const BRANCH_ID = "22222222-2222-2222-2222-222222222222";

function buildAnalytics(
  overrides: Partial<BranchOverviewAnalytics> = {}
): BranchOverviewAnalytics {
  return {
    branch_id: BRANCH_ID,
    period: "day",
    granularity: "hour",
    timezone: "Asia/Kuala_Lumpur",
    coverage: "recorded_cloud_telemetry",
    summary: {
      completed_cycles: 5,
      running_seconds: 5400,
      running_minutes: 90.0,
      estimated_revenue_myr: "37.50",
      avg_gas_ppm: 18.4,
      gas_node_count: 2,
      total_lpg_nodes: 2,
      gas_aggregation_mode: "multi_node_average",
      complaints_total: null,
    },
    programs: [
      { program_id: "normal", label: "Normal Wash" },
      { program_id: "heavy", label: "Heavy Duty" },
    ],
    machines: [
      {
        source_id: "sim-washer-01",
        label: "Washer 01",
        device_type: "washer",
        completed_cycles: 3,
        running_seconds: 3600,
        running_minutes: 60.0,
        estimated_revenue_myr: "22.50",
        cycles_by_program: { normal: 2, heavy: 1 },
      },
      {
        source_id: "sim-dryer-01",
        label: "Dryer 01",
        device_type: "dryer",
        completed_cycles: 2,
        running_seconds: 1800,
        running_minutes: 30.0,
        estimated_revenue_myr: "15.00",
        cycles_by_program: { normal: 2 },
      },
    ],
    revenue_series: [
      {
        bucket: "2026-11-15T09:00",
        label: "09:00",
        period_revenue_myr: "15.00",
        cumulative_revenue_myr: "15.00",
      },
      {
        bucket: "2026-11-15T10:00",
        label: "10:00",
        period_revenue_myr: "22.50",
        cumulative_revenue_myr: "37.50",
      },
    ],
    gas_series: {
      aggregation_mode: "multi_node_average",
      node_count: 2,
      nodes: [
        {
          source_id: "esp32-lpg-01",
          label: "Node 01",
          calibrated: true,
          period_avg_ppm: 14.2,
          sample_count: 10,
        },
        {
          source_id: "esp32-lpg-02",
          label: "Node 02",
          calibrated: true,
          period_avg_ppm: 22.6,
          sample_count: 4,
        },
      ],
      series: [
        { bucket: "2026-11-15T09:00", label: "09:00", avg_ppm: 18.4, contributing_nodes: 2 },
        { bucket: "2026-11-15T10:00", label: "10:00", avg_ppm: null, contributing_nodes: 0 },
      ],
    },
    complaints: {
      implemented: false,
      source: "deferred_customer_app",
      total: null,
      series: [
        { bucket: "2026-11-15T09:00", label: "09:00", count: null },
        { bucket: "2026-11-15T10:00", label: "10:00", count: null },
      ],
    },
    ...overrides,
  };
}

describe("PerformanceChart (Pi-aligned Chart.js Branch Overview Analytics)", () => {
  it("registers both bar and line Chart.js controllers", () => {
    expect(Chart.registry.getController("bar")).toBeDefined();
    expect(Chart.registry.getController("line")).toBeDefined();
  });

  it("renders timeframe selector, 4 summary KPI tiles, and 4 analytics sections", () => {
    const raw = renderToString(
      React.createElement(PerformanceChart, {
        branchId: BRANCH_ID,
        initialAnalytics: buildAnalytics(),
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    expect(text).toContain("Branch analytics");
    expect(text).toContain("Today");
    expect(text).toContain("7 days");
    expect(text).toContain("30 days");

    expect(text).toContain("Completed cycles");
    expect(text).toContain("Total runtime");
    expect(text).toContain("90.0 min");
    expect(text).toContain("Est. revenue");
    expect(text).toContain("RM 37.50");
    expect(text).toContain("Avg gas PPM");
    expect(text).toContain("18.4 ppm");

    expect(text).toContain("Machine metrics");
    expect(text).toContain("Running minutes");
    expect(text).toContain("Estimated revenue");
    expect(text).toContain("Cumulative estimated revenue");
    expect(text).toContain("Hourly MYT");
    expect(text).toContain("Average environmental gas");
    expect(text).toContain("2 nodes averaged");
    expect(text).toContain("Customer complaints");
    expect(text).toContain("Customer complaints integration is not yet connected.");
  });

  it("renders breakdown rows for multiple machines and enforces clean typography constraints", () => {
    const raw = renderToString(
      React.createElement(PerformanceChart, {
        branchId: BRANCH_ID,
        initialAnalytics: buildAnalytics(),
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    expect(text).toContain("Washer 01");
    expect(text).toContain("Dryer 01");
    expect(text).toContain("22.50");
    expect(text).toContain("15.00");

    // DESIGN.md Section 3.4: no middot separators, no simulated badges, no PRD IDs
    expect(text).not.toContain("·");
    expect(text).not.toMatch(/WF-0\d|CR-0\d|FM-0\d/);
  });

  it("shows honest Calibration required state when LPG nodes are uncalibrated", () => {
    const raw = renderToString(
      React.createElement(PerformanceChart, {
        branchId: BRANCH_ID,
        initialAnalytics: buildAnalytics({
          summary: {
            completed_cycles: 0,
            running_seconds: 0,
            running_minutes: 0,
            estimated_revenue_myr: "0.00",
            avg_gas_ppm: null,
            gas_node_count: 0,
            total_lpg_nodes: 1,
            gas_aggregation_mode: "uncalibrated",
            complaints_total: null,
          },
          gas_series: {
            aggregation_mode: "uncalibrated",
            node_count: 0,
            nodes: [
              {
                source_id: "esp32-lpg-01",
                label: "Node 01",
                calibrated: false,
                period_avg_ppm: null,
                sample_count: 0,
              },
            ],
            series: [{ bucket: "2026-11-15", label: "15 Nov", avg_ppm: null, contributing_nodes: 0 }],
          },
        }),
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Calibration required");
    expect(text).toContain("Gas PPM readings require a calibrated LPG edge node.");
    expect(text).toContain("—");
  });

  it("renders single-node label when only one calibrated LPG node exists", () => {
    const raw = renderToString(
      React.createElement(PerformanceChart, {
        branchId: BRANCH_ID,
        initialAnalytics: buildAnalytics({
          summary: {
            completed_cycles: 1,
            running_seconds: 600,
            running_minutes: 10,
            estimated_revenue_myr: "5.00",
            avg_gas_ppm: 12.1,
            gas_node_count: 1,
            total_lpg_nodes: 1,
            gas_aggregation_mode: "single_node",
            complaints_total: null,
          },
          gas_series: {
            aggregation_mode: "single_node",
            node_count: 1,
            nodes: [
              {
                source_id: "esp32-lpg-01",
                label: "Cylinder Bay Sensor",
                calibrated: true,
                period_avg_ppm: 12.1,
                sample_count: 3,
              },
            ],
            series: [{ bucket: "2026-11-15T10:00", label: "10:00", avg_ppm: 12.1, contributing_nodes: 1 }],
          },
        }),
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Cylinder Bay Sensor");
  });

  it("renders explicit empty states and error alert when initialAnalytics is null", () => {
    const raw = renderToString(
      React.createElement(PerformanceChart, {
        branchId: BRANCH_ID,
        initialAnalytics: null,
        initialError: "The business service is unavailable. Please retry.",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("The business service is unavailable. Please retry.");
    expect(text).toContain("No approved machines in this branch.");
    expect(text).toContain("No revenue intervals recorded yet.");
    expect(text).not.toContain("All branches");
  });

  it("renders multi-branch dropdown selector and Branch column without middots when branches prop is provided", () => {
    const raw = renderToString(
      React.createElement(PerformanceChart, {
        branchId: "all",
        branches: [
          { id: BRANCH_ID, name: "MSU Shah Alam" },
          { id: "33333333-3333-3333-3333-333333333333", name: "Subang SS15" },
        ],
        initialAnalytics: buildAnalytics({
          branch_id: "all",
          branch_count: 2,
          machines: [
            {
              branch_id: BRANCH_ID,
              branch_name: "MSU Shah Alam",
              source_id: "sim-washer-01",
              label: "Washer 01",
              device_type: "washer",
              completed_cycles: 3,
              running_seconds: 3600,
              running_minutes: 60.0,
              estimated_revenue_myr: "22.50",
              cycles_by_program: { normal: 2, heavy: 1 },
            },
            {
              branch_id: "33333333-3333-3333-3333-333333333333",
              branch_name: "Subang SS15",
              source_id: "sim-washer-01",
              label: "Washer 01",
              device_type: "washer",
              completed_cycles: 2,
              running_seconds: 1800,
              running_minutes: 30.0,
              estimated_revenue_myr: "15.00",
              cycles_by_program: { normal: 2 },
            },
          ],
        }),
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("<select");
    expect(text).toContain("All branches");
    expect(text).toContain("MSU Shah Alam");
    expect(text).toContain("Subang SS15");
    expect(text).toContain("min-h-11");
    expect(text).toContain("Branch");
    expect(text).not.toContain("·");
  });

  it("hides Machine metrics and renders business insights when showMachineMetrics=false and showBusinessInsights=true", () => {
    const raw = renderToString(
      React.createElement(PerformanceChart, {
        branchId: "all",
        branches: [
          { id: BRANCH_ID, name: "MSU Shah Alam" },
          { id: "33333333-3333-3333-3333-333333333333", name: "Subang SS15" },
        ],
        showMachineMetrics: false,
        showBusinessInsights: true,
        initialAnalytics: buildAnalytics({
          branch_id: "all",
          branch_count: 2,
          branch_breakdown: [
            {
              branch_id: BRANCH_ID,
              branch_name: "MSU Shah Alam",
              completed_cycles: 3,
              running_seconds: 3600,
              running_minutes: 60.0,
              estimated_revenue_myr: "22.50",
              revenue_share_pct: 60.0,
            },
            {
              branch_id: "33333333-3333-3333-3333-333333333333",
              branch_name: "Subang SS15",
              completed_cycles: 2,
              running_seconds: 1800,
              running_minutes: 30.0,
              estimated_revenue_myr: "15.00",
              revenue_share_pct: 40.0,
            },
          ],
          program_breakdown: [
            {
              program_id: "normal",
              label: "Normal Wash",
              completed_cycles: 4,
              estimated_revenue_myr: "30.00",
              avg_revenue_myr: "7.50",
              share_pct: 80.0,
            },
            {
              program_id: "heavy",
              label: "Heavy Duty",
              completed_cycles: 1,
              estimated_revenue_myr: "7.50",
              avg_revenue_myr: "7.50",
              share_pct: 20.0,
            },
          ],
          cycle_outcomes: {
            completed: 5,
            stopped: 1,
            faulted: 1,
            interrupted: 0,
            total: 7,
            completion_rate_pct: 71.4,
          },
          hourly_demand: [
            { hour: 9, hour_label: "09:00", completed_cycles: 2, estimated_revenue_myr: "15.00" },
            { hour: 10, hour_label: "10:00", completed_cycles: 3, estimated_revenue_myr: "22.50" },
          ],
        }),
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).not.toContain("Machine metrics");
    expect(text).toContain("Cumulative estimated revenue");
    expect(text).toContain("Average environmental gas");
    expect(text).toContain("Customer complaints");
    expect(text).toContain("Branch comparison");
    expect(text).toContain("Program mix");
    expect(text).toContain("Peak demand hours");
    expect(text).toContain("Cycle reliability");
    expect(text).toContain("71.4% completion");
    expect(text).toContain("Peak 10:00 MYT");
    expect(text).toContain("60.0%");
    expect(text).toContain("Normal Wash");
    expect(text).not.toContain("·");
    expect(text).not.toMatch(/WF-0\d|CR-0\d|FM-0\d|RP-0\d/);
  });
});
