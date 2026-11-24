import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  BranchWorkspaceShell,
  type BranchWorkspaceTab,
} from "@/components/workspace/layout/BranchWorkspaceShell";
import { ActiveIncidentsBanner } from "@/components/workspace/overview/ActiveIncidentsBanner";
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

  it("renders manager subnav tabs including Details & Setup tab", () => {
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
    expect(text).toContain("Details &amp; Setup");
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

  it("renders branch header cover image when set and omits image box when absent", () => {
    const withPhoto: BranchDetail = {
      ...mockBranch,
      images: [
        {
          id: "img-1",
          image_url: "https://proj.supabase.co/storage/v1/object/public/branch-images/hero.jpg",
          sort_order: 0,
          created_at: "2026-10-27T00:00:00Z",
        },
      ],
    };

    const withPhotoHtml = renderToString(
      React.createElement(BranchWorkspaceShell, {
        branch: withPhoto,
        activeTab: "overview",
        userRole: "owner",
      }),
    );
    expect(withPhotoHtml).toContain("https://proj.supabase.co/storage/v1/object/public/branch-images/hero.jpg");
    expect(withPhotoHtml).toContain("MSU Shah Alam cover photo");

    const withoutPhotoHtml = renderToString(
      React.createElement(BranchWorkspaceShell, {
        branch: mockBranch,
        activeTab: "overview",
        userRole: "owner",
      }),
    );
    expect(withoutPhotoHtml).not.toContain("cover photo");
  });

  it("places Maintenance Logs navigation item beneath LPG & Safety", () => {
    const html = renderToString(
      React.createElement(BranchWorkspaceShell, {
        branch: mockBranch,
        activeTab: "overview",
        userRole: "owner",
      }),
    );
    const lpgPos = html.indexOf("LPG &amp; Safety");
    const maintPos = html.indexOf("Maintenance Logs");
    expect(lpgPos).toBeGreaterThan(-1);
    expect(maintPos).toBeGreaterThan(lpgPos);
  });

  it("renders full-width sleek ActiveIncidentsBanner cards with Inspect Incident button and zero middle dots", () => {
    const html = renderToString(
      React.createElement(ActiveIncidentsBanner, {
        branchId: mockBranch.id,
        incidents: [
          {
            id: "inc-1",
            reference_code: "INC-9001",
            domain: "machine",
            severity: "critical",
            workflow_state: "open",
            title: "Washer 01 (E01)",
            description: "Water inlet failure detected during fill stage.",
            created_at: "2026-11-23T10:00:00Z",
          },
        ],
      }),
    );
    const text = html.replace(/<!--.*?-->/g, "");
    expect(text).toContain("1 Active Incident Requiring Attention");
    expect(text).toContain("Washer 01 (E01)");
    expect(text).toContain("Water inlet failure detected during fill stage.");
    expect(text).toContain("INC-9001");
    expect(text).toContain("Critical");
    expect(text).toContain("Inspect Incident");
    expect(text).toContain(`/branches/${mockBranch.id}/incidents/inc-1`);
    expect(text).toContain("w-full");
    expect(text).not.toContain("·");
  });
});
