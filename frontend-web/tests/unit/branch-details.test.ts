import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { BranchDetailsForm } from "@/components/workspace/branches/BranchDetailsForm";
import { BranchDirectoryCard } from "@/components/workspace/branches/BranchDirectoryList";
import { OrganizationLogoCard } from "@/components/workspace/account/OrganizationLogoCard";
import type { BranchDetail, ManagerOption } from "@/lib/auth/business";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const mockBranch: BranchDetail = {
  id: "b1111111-1111-1111-1111-111111111111",
  name: "MSU Shah Alam",
  address: "1 Jalan University, Seksyen 13",
  city: "Shah Alam",
  region: "Selangor",
  postal_code: "40100",
  contact_phone: "+60355216868",
  opening_hours: "07:00 - 23:00",
  latitude: 3.0789,
  longitude: 101.5529,
  service_status: "open",
  primary_manager_user_id: "u2222222-2222-2222-2222-222222222222",
  created_at: "2026-10-27T00:00:00Z",
  primary_manager: {
    user_id: "u2222222-2222-2222-2222-222222222222",
    full_name: "Siti Manager",
    phone: "+60123456789",
  },
};

const mockManagers: ManagerOption[] = [
  {
    user_id: "u1111111-1111-1111-1111-111111111111",
    full_name: "Dr. Owner",
    role: "owner",
  },
  {
    user_id: "u2222222-2222-2222-2222-222222222222",
    full_name: "Siti Manager",
    role: "branch_manager",
  },
];

describe("BranchDetailsForm component", () => {
  it("renders editable branch fields, manager selector, and Delete Branch section for owner", () => {
    const raw = renderToString(
      React.createElement(BranchDetailsForm, {
        branch: mockBranch,
        isOwner: true,
        managers: mockManagers,
      }),
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Branch Identity &amp; Status");
    expect(text).toContain("MSU Shah Alam");
    expect(text).toContain("1 Jalan University, Seksyen 13");
    expect(text).toContain("Shah Alam");
    expect(text).toContain("Selangor");
    expect(text).toContain("40100");
    expect(text).toContain("07:00 - 23:00");
    expect(text).toContain("Siti Manager (Branch manager)");
    expect(text).toContain("Delete Branch");
    expect(text).toContain("Save changes");
  });

  it("renders editable branch fields for branch_manager without Delete Branch section", () => {
    const raw = renderToString(
      React.createElement(BranchDetailsForm, {
        branch: mockBranch,
        isOwner: false,
        managers: [],
      }),
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Branch Identity &amp; Status");
    expect(text).toContain("MSU Shah Alam");
    expect(text).toContain("Operating Hours");
    expect(text).toContain("Address &amp; Location");
    expect(text).toContain("Siti Manager");
    expect(text).toContain("Unpublished (owner only)");
    expect(text).not.toContain("Delete Branch");
    expect(text).toContain("Save changes");
  });

  it("renders customer directory visibility selector and weekly schedule controls for owner", () => {
    const raw = renderToString(
      React.createElement(BranchDetailsForm, {
        branch: {
          ...mockBranch,
          is_published: true,
          weekly_hours: {
            mon: [{ open: "08:00", close: "22:00" }],
            tue: [{ open: "08:00", close: "22:00" }],
            wed: [{ open: "08:00", close: "22:00" }],
            thu: [{ open: "08:00", close: "22:00" }],
            fri: [{ open: "08:00", close: "22:00" }],
            sat: [{ open: "08:00", close: "22:00" }],
            sun: [],
          },
        },
        isOwner: true,
        managers: mockManagers,
      }),
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Customer directory visibility");
    expect(text).toContain("Published in customer app");
    expect(text).toContain("Use structured weekly schedule for Open now status");
    expect(text).toContain("Apply daily hours to Mon–Sun");
  });

  it("renders OrganizationLogoCard with initials fallback and uploaded logo", () => {
    const noLogoRaw = renderToString(
      React.createElement(OrganizationLogoCard, {
        organizationName: "SpinSense Laundry",
        initialLogoUrl: null,
      }),
    );
    expect(noLogoRaw).toContain("SL");
    expect(noLogoRaw).toContain("Public organization logo");
    expect(noLogoRaw).toContain("Upload logo");

    const withLogoRaw = renderToString(
      React.createElement(OrganizationLogoCard, {
        organizationName: "SpinSense Laundry",
        initialLogoUrl: "https://example.supabase.co/storage/v1/object/public/organization-logos/org/logo.png",
      }),
    );
    expect(withLogoRaw).toContain("Remove logo");
    expect(withLogoRaw).toContain("SpinSense Laundry public logo");
  });

  it("renders Published and Unpublished customer directory badges on BranchDirectoryCard", () => {
    const unpublishedRaw = renderToString(
      React.createElement(BranchDirectoryCard, {
        branch: { ...mockBranch, is_published: false },
      }),
    );
    expect(unpublishedRaw).toContain("Open to customers");
    expect(unpublishedRaw).toContain("Unpublished");

    const publishedRaw = renderToString(
      React.createElement(BranchDirectoryCard, {
        branch: { ...mockBranch, is_published: true },
      }),
    );
    expect(publishedRaw).toContain("Published");
  });
});

