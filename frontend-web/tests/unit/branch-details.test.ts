import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { BranchDetailsForm } from "@/components/workspace/branches/BranchDetailsForm";
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
    expect(text).not.toContain("Delete Branch");
    expect(text).toContain("Save changes");
  });
});

