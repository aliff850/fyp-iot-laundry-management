import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  BranchWorkspaceShell,
  type BranchWorkspaceTab,
} from "@/components/workspace/layout/BranchWorkspaceShell";
import type { BranchDetail } from "@/lib/auth/business";

const mockBranch: BranchDetail = {
  id: "b1111111-1111-1111-1111-111111111111",
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
  primary_manager_user_id: "u1111111-1111-1111-1111-111111111111",
  created_at: "2026-10-27T00:00:00Z",
  primary_manager: {
    user_id: "u1111111-1111-1111-1111-111111111111",
    full_name: "Dr. Owner",
    phone: "+60123456789",
  },
};

describe("BranchWorkspaceShell component", () => {
  it("renders branch identity, address, hours, and status badge", () => {
    const raw = renderToString(
      React.createElement(
        BranchWorkspaceShell,
        {
          branch: mockBranch,
          activeTab: "overview" as BranchWorkspaceTab,
          userRole: "owner",
          organizationName: "SpinSense HQ",
        },
        React.createElement("div", null, "Child Content")
      )
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("MSU Shah Alam");
    expect(text).toContain("Seksyen 13, Shah Alam, Selangor 40100");
    expect(text).toContain("24 Hours");
    expect(text).toContain("+60123456789");
    expect(text).toContain("Open to customers");
    expect(text).toContain("Child Content");
  });

  it("renders role-filtered tabs for owner (including Overview and Details)", () => {
    const raw = renderToString(
      React.createElement(
        BranchWorkspaceShell,
        {
          branch: mockBranch,
          activeTab: "overview" as BranchWorkspaceTab,
          userRole: "owner",
        },
        React.createElement("div", null)
      )
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Overview");
    expect(text).toContain("Machines");
    expect(text).toContain("LPG &amp; Safety");
    expect(text).not.toContain("Analytics");
    expect(text).toContain("Reports");
    expect(text).toContain("Branch Personnel");
    expect(text).toContain("Details &amp; Setup");
  });

  it("renders manager subnav tabs without owner-only Details tab", () => {
    const raw = renderToString(
      React.createElement(
        BranchWorkspaceShell,
        {
          branch: mockBranch,
          activeTab: "overview" as BranchWorkspaceTab,
          userRole: "branch_manager",
        },
        React.createElement("div", null)
      )
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Overview");
    expect(text).toContain("Machines");
    expect(text).toContain("LPG &amp; Safety");
    expect(text).toContain("Branch Personnel");
    expect(text).not.toContain("Details & Setup");
  });

  it("restricts machine maintenance specialist to permitted domain and Reports tabs only", () => {
    const raw = renderToString(
      React.createElement(
        BranchWorkspaceShell,
        {
          branch: mockBranch,
          activeTab: "machines" as BranchWorkspaceTab,
          userRole: "machine_maintenance",
        },
        React.createElement("div", null)
      )
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Machines");
    expect(text).toContain("Reports");
    expect(text).not.toContain("Overview");
    expect(text).not.toContain("LPG & Safety");
    expect(text).not.toContain("Analytics");
    expect(text).not.toContain("Branch Personnel");
    expect(text).not.toContain("Details & Setup");
  });

  it("restricts LPG maintenance specialist to permitted domain and Reports tabs only", () => {
    const raw = renderToString(
      React.createElement(
        BranchWorkspaceShell,
        {
          branch: mockBranch,
          activeTab: "lpg" as BranchWorkspaceTab,
          userRole: "lpg_maintenance",
        },
        React.createElement("div", null)
      )
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("LPG &amp; Safety");
    expect(text).toContain("Reports");
    expect(text).not.toContain("Overview");
    expect(text).not.toContain("Machines");
    expect(text).not.toContain("Analytics");
    expect(text).not.toContain("Branch Personnel");
  });
});
