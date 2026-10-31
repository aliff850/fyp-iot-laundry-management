import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Building2, Users, LayoutDashboard, WashingMachine } from "lucide-react";
import {
  WorkspaceNav,
  type WorkspaceNavItem,
} from "@/components/workspace/layout/WorkspaceNav";

describe("WorkspaceNav component", () => {
  const mockNavItems: WorkspaceNavItem[] = [
    {
      id: "branches",
      label: "Branches",
      href: "/branches",
      icon: Building2,
      visible: true,
    },
    {
      id: "personnel",
      label: "Personnel",
      href: "/personnel",
      icon: Users,
      visible: true,
    },
    {
      id: "hidden-item",
      label: "Secret Admin",
      href: "/secret",
      icon: LayoutDashboard,
      visible: false,
    },
  ];

  it("renders in navigation mode with nav tag, icons, and aria-current on active link", () => {
    const raw = renderToString(
      React.createElement(WorkspaceNav, {
        items: mockNavItems,
        activeId: "branches",
        ariaLabel: "Operator navigation",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    // Validates semantic <nav> element
    expect(text).toContain("<nav");
    expect(text).toContain('aria-label="Operator navigation"');

    // Validates visible items and icons
    expect(text).toContain("Branches");
    expect(text).toContain("Personnel");
    expect(text).not.toContain("Secret Admin");

    // Validates active vs inactive attributes and classes
    expect(text).toContain('aria-current="page"');
    expect(text).toContain("border-accent");
    expect(text).toContain("text-ink");
    expect(text).toContain("font-semibold");
    expect(text).toContain("border-transparent");
    expect(text).toContain("text-muted");
  });

  it("renders in tablist mode with role='tablist' and role='tab' and aria-selected='true'", () => {
    const tabItems: WorkspaceNavItem[] = [
      {
        id: "overview",
        label: "Overview",
        href: "/branches/b-1/overview",
        icon: LayoutDashboard,
      },
      {
        id: "machines",
        label: "Machines",
        href: "/branches/b-1/machines",
        icon: WashingMachine,
      },
    ];

    const raw = renderToString(
      React.createElement(WorkspaceNav, {
        items: tabItems,
        activeId: "machines",
        role: "tablist",
        ariaLabel: "Branch workspace navigation",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    // Validates tablist container
    expect(text).toContain('role="tablist"');
    expect(text).toContain('aria-label="Branch workspace navigation"');

    // Validates tabs
    expect(text).toContain('role="tab"');
    expect(text).toContain('aria-selected="true"');
    expect(text).toContain('aria-selected="false"');
    expect(text).not.toContain('aria-current="page"');

    expect(text).toContain("Overview");
    expect(text).toContain("Machines");
    // Tablist mode does not render the global mobile bottom bar
    expect(text).not.toContain("Mobile workspace navigation");
    expect(text).not.toContain("fixed bottom-0");
  });

  it("renders mobile PWA bottom navigation dock with 4 major buttons when personnel is visible", () => {
    const raw = renderToString(
      React.createElement(WorkspaceNav, {
        items: mockNavItems,
        activeId: "branches",
        ariaLabel: "Operator navigation",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    // Validates mobile navigation wrapper
    expect(text).toContain('aria-label="Mobile workspace navigation"');
    expect(text).toContain("fixed bottom-0");
    expect(text).toContain("grid-cols-4");

    // Validates the 4 major buttons
    expect(text).toContain("Branches");
    expect(text).toContain("Personnel");
    expect(text).toContain("Account");
    expect(text).toContain("Sign Out");
  });

  it("dynamically adjusts mobile dock to 3 buttons when personnel is not permitted", () => {
    const nonOwnerItems: WorkspaceNavItem[] = [
      {
        id: "branches",
        label: "Branches",
        href: "/branches",
        icon: Building2,
        visible: true,
      },
      {
        id: "personnel",
        label: "Personnel",
        href: "/personnel",
        icon: Users,
        visible: false,
      },
    ];

    const raw = renderToString(
      React.createElement(WorkspaceNav, {
        items: nonOwnerItems,
        activeId: "account",
        ariaLabel: "Operator navigation",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    // 3 columns when personnel is hidden
    expect(text).toContain("grid-cols-3");
    expect(text).toContain("Branches");
    expect(text).not.toContain("Personnel");
    expect(text).toContain("Account");
    expect(text).toContain("Sign Out");

    // Active state on Account tab
    expect(text).toContain('href="/account"');
    expect(text).toContain('aria-current="page"');
  });
});

