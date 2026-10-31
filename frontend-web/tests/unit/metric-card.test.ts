import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Scale, Users } from "lucide-react";
import { MetricCard, MetricGrid } from "@/components/workspace/common/MetricCard";

describe("MetricCard and MetricGrid components", () => {
  it("renders basic metric card with label, icon, and tabular numbers", () => {
    const raw = renderToString(
      React.createElement(MetricCard, {
        icon: React.createElement(Users, { className: "size-4" }),
        label: "Approved personnel",
        value: 12,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    expect(text).toContain("Approved personnel");
    expect(text).toContain("12");
    expect(text).toContain("tabular-nums");
    expect(text).toContain("p-4"); // default size md
    expect(raw).not.toContain("font-mono");
  });

  it("renders as an accessible Link when href is provided", () => {
    const raw = renderToString(
      React.createElement(MetricCard, {
        icon: React.createElement(Users, { className: "size-4" }),
        label: "Pending requests",
        value: 3,
        href: "/personnel",
        ariaLabel: "View pending personnel requests",
        size: "sm",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    expect(text).toContain("<a");
    expect(text).toContain('href="/personnel"');
    expect(text).toContain('aria-label="View pending personnel requests"');
    expect(text).toContain("hover:bg-raised");
    expect(text).toContain("p-3"); // size sm
    expect(text).toContain("text-xl");
    expect(raw).not.toContain("font-mono");
  });

  it("supports suffix units, subtext, and custom valueClassName", () => {
    const raw = renderToString(
      React.createElement(MetricCard, {
        icon: React.createElement(Scale, { className: "size-3.5" }),
        label: "Manifold Fuel Mass",
        value: "27.2",
        suffix: "/ 56.0 kg",
        subtext: "Continuous telemetry sync",
        valueClassName: "text-warning",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    expect(text).toContain("Manifold Fuel Mass");
    expect(text).toContain("27.2");
    expect(text).toContain("/ 56.0 kg");
    expect(text).toContain("Continuous telemetry sync");
    expect(text).toContain("text-warning");
    expect(raw).not.toContain("font-mono");
  });

  it("renders custom children for status badges or non-numeric slots", () => {
    const raw = renderToString(
      React.createElement(
        MetricCard,
        {
          label: "System Status",
        },
        React.createElement("span", { className: "badge-healthy" }, "Healthy")
      )
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    expect(text).toContain("System Status");
    expect(text).toContain("badge-healthy");
    expect(text).toContain("Healthy");
  });

  it("renders nested well with variant='raised' (bg-raised/40 and hover:bg-raised/60)", () => {
    const raw = renderToString(
      React.createElement(MetricCard, {
        label: "Branches",
        value: 5,
        variant: "raised",
        href: "/branches",
      })
    );
    expect(raw).toContain("bg-raised/40");
    expect(raw).toContain("hover:bg-raised/60");
  });

  it("renders MetricGrid with responsive 3-column, 4-column, and 6-column column layouts", () => {
    const raw3 = renderToString(
      React.createElement(
        MetricGrid,
        { columns: 3, ariaLabel: "3-col grid" },
        React.createElement("div", null, "Child 1")
      )
    );
    expect(raw3).toContain("grid-cols-1 gap-2.5 sm:grid-cols-3");
    expect(raw3).toContain('aria-label="3-col grid"');

    const raw4 = renderToString(
      React.createElement(
        MetricGrid,
        { columns: 4, ariaLabel: "4-col grid" },
        React.createElement("div", null, "Child 1")
      )
    );
    expect(raw4).toContain("grid-cols-2 gap-3 sm:grid-cols-4");
    expect(raw4).toContain('aria-label="4-col grid"');

    const raw6 = renderToString(
      React.createElement(
        MetricGrid,
        { columns: 6, ariaLabel: "6-col grid" },
        React.createElement("div", null, "Child 1")
      )
    );
    expect(raw6).toContain("grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6");
    expect(raw6).toContain('aria-label="6-col grid"');
  });
});

