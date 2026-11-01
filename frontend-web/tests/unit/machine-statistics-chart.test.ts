import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MachineStatisticsChart } from "@/components/workspace/machines/MachineStatisticsChart";

describe("MachineStatisticsChart component", () => {
  it("renders line chart with canvas, title, subtitle, and accessible fallback table", () => {
    const raw = renderToString(
      React.createElement(MachineStatisticsChart, {
        title: "Income Situation Curve Graph (Unit: MYR)",
        subtitle: "Daily Billing Trend",
        unit: "MYR",
        type: "line",
        labels: ["2026-10-22", "2026-10-23", "2026-10-24"],
        datasets: [
          {
            label: "Revenue",
            data: [12, 18, 24],
            color: "#79c5a6",
            fill: true,
          },
        ],
        footerNote: "Estimated revenue calculated from recorded cycles.",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    // Canvas element present with role="img"
    expect(raw).toContain("<canvas");
    expect(raw).toContain('role="img"');
    expect(raw).toContain('aria-label="Income Situation Curve Graph (Unit: MYR) visualization"');

    // Title and subtitle
    expect(text).toContain("Income Situation Curve Graph (Unit: MYR)");
    expect(text).toContain("Daily Billing Trend");

    // Accessible hidden table with dates and data points
    expect(raw).toContain("sr-only");
    expect(text).toContain("2026-10-22");
    expect(text).toContain("12 MYR");
    expect(text).toContain("2026-10-24");
    expect(text).toContain("24 MYR");

    // Footnote
    expect(text).toContain("Estimated revenue calculated from recorded cycles.");

    // Anti-AI-aesthetic: No font-mono
    expect(raw).not.toContain("font-mono");
  });

  it("renders multi-dataset bar chart for work-time and cycle statistics", () => {
    const raw = renderToString(
      React.createElement(MachineStatisticsChart, {
        title: "Daily Operating Work-Time Distribution",
        unit: "hrs",
        type: "bar",
        labels: ["2026-10-22", "2026-10-23"],
        datasets: [
          {
            label: "Motor Active",
            data: [1.2, 1.8],
            color: "#ef6268",
          },
          {
            label: "Standby",
            data: [22.8, 22.2],
            color: "#5ea1e0",
          },
        ],
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    expect(raw).toContain("<canvas");
    expect(text).toContain("Daily Operating Work-Time Distribution");
    expect(text).toContain("Motor Active");
    expect(text).toContain("Standby");
    expect(text).toContain("1.2 hrs");
    expect(text).toContain("22.8 hrs");
  });

  it("registers Chart.js line and bar controllers without runtime error", async () => {
    const { default: Chart } = await import("chart.js/auto");
    const lineController = Chart.registry.getController("line");
    const barController = Chart.registry.getController("bar");
    expect(lineController).toBeDefined();
    expect(barController).toBeDefined();
  });
});

