import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  LayoutDashboard,
  WashingMachine,
  Flame,
  Settings,
} from "lucide-react";
import {
  WorkspaceVerticalNav,
  type WorkspaceVerticalNavItem,
} from "@/components/workspace/layout/WorkspaceVerticalNav";

describe("WorkspaceVerticalNav component", () => {
  const mockTabs: WorkspaceVerticalNavItem[] = [
    {
      id: "overview",
      label: "Overview",
      href: "/branches/b-1/overview",
      icon: LayoutDashboard,
      visible: true,
    },
    {
      id: "machines",
      label: "Machines",
      href: "/branches/b-1/machines",
      icon: WashingMachine,
      visible: true,
    },
    {
      id: "lpg",
      label: "LPG & Safety",
      href: "/branches/b-1/lpg",
      icon: Flame,
      visible: true,
    },
    {
      id: "secret",
      label: "Hidden Settings",
      href: "/branches/b-1/secret",
      icon: Settings,
      visible: false,
    },
  ];

  const serializableTabs: WorkspaceVerticalNavItem[] = [
    {
      id: "overview",
      label: "Overview",
      href: "/branches/b-1/overview",
      icon: "overview",
      visible: true,
    },
    {
      id: "machines",
      label: "Machines",
      href: "/branches/b-1/machines",
      icon: "machines",
      visible: true,
    },
    {
      id: "reports",
      label: "Reports",
      href: "/branches/b-1/customer-reports",
      icon: "reports",
      visible: true,
    },
  ];

  it("renders in expanded state by default with hamburger button and full labels", () => {
    const raw = renderToString(
      React.createElement(WorkspaceVerticalNav, {
        items: mockTabs,
        activeId: "overview",
        ariaLabel: "Branch workspace navigation",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    // Validates navigation wrapper and expanded width
    expect(text).toContain("<nav");
    expect(text).toContain('aria-label="Branch workspace navigation"');
    expect(text).toContain("md:w-56");

    // Validates hamburger button
    expect(text).toContain('aria-label="Collapse navigation"');
    expect(text).toContain('aria-expanded="true"');
    expect(text).toContain("Menu");

    // Validates visible labels and icons
    expect(text).toContain("Overview");
    expect(text).toContain("Machines");
    expect(text).toContain("LPG &amp; Safety");
    expect(text).not.toContain("Hidden Settings");

    // Validates active indicator classes
    expect(text).toContain("border-accent");
    expect(text).toContain("bg-navy-selected");
    expect(text).toContain("font-semibold");
    expect(text).toContain("text-ink");
    expect(text).toContain('aria-current="page"');
  });

  it("renders in collapsed state when defaultCollapsed is true with icon-only and tooltips", () => {
    const raw = renderToString(
      React.createElement(WorkspaceVerticalNav, {
        items: mockTabs,
        activeId: "machines",
        ariaLabel: "Branch workspace navigation",
        defaultCollapsed: true,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    // Validates collapsed width
    expect(text).toContain("md:w-16");

    // Validates hamburger button in collapsed mode
    expect(text).toContain('aria-label="Expand navigation"');
    expect(text).toContain('aria-expanded="false"');

    // Validates tooltips and sr-only labels in collapsed mode
    expect(text).toContain('title="Overview"');
    expect(text).toContain('title="Machines"');
    expect(text).toContain("md:sr-only");

    // Validates active link
    expect(text).toContain("border-accent");
    expect(text).toContain("bg-navy-selected");
  });

  it("renders mobile-responsive header and hideable navigation list", () => {
    const raw = renderToString(
      React.createElement(WorkspaceVerticalNav, {
        items: mockTabs,
        activeId: "machines",
        ariaLabel: "Branch workspace navigation",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    // Mobile header displays the current active item label
    expect(text).toContain("Machines");
    // List container has mobile hidden and desktop flex classes
    expect(text).toContain("hidden md:flex flex-col gap-1");
  });

  it("resolves serializable string icon identifiers across RSC boundary without error", () => {
    const raw = renderToString(
      React.createElement(WorkspaceVerticalNav, {
        items: serializableTabs,
        activeId: "reports",
        ariaLabel: "Branch workspace navigation",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    expect(text).toContain("Overview");
    expect(text).toContain("Machines");
    expect(text).toContain("Reports");
    // Verify SVG icon markup is properly rendered
    expect(text).toContain("<svg");
    expect(text).toContain('aria-current="page"');
  });
});

