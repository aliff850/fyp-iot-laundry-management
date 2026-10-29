import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { PersonnelDirectoryTable } from "@/components/workspace/personnel/PersonnelDirectoryTable";
import type { OrganizationPersonnel, WorkspaceBranch } from "@/lib/auth/business";

vi.mock("@/app/personnel/actions", () => ({
  updatePersonnelRole: vi.fn().mockResolvedValue({ success: true }),
  updatePersonnelBranches: vi.fn().mockResolvedValue({ success: true }),
  removePersonnelFromBranch: vi.fn().mockResolvedValue({ success: true }),
}));

const mockBranches: WorkspaceBranch[] = [
  {
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
  },
];

const mockPersonnel: OrganizationPersonnel[] = [
  {
    user_id: "u1111111-1111-1111-1111-111111111111",
    full_name: "Dr. Owner",
    phone: "+60123456789",
    role: "owner",
    state: "active",
    created_at: "2026-10-27T00:00:00Z",
    assigned_branches: ["MSU Shah Alam"],
    assigned_branch_ids: ["b1111111-1111-1111-1111-111111111111"],
    is_primary_manager: true,
  },
  {
    user_id: "u2222222-2222-2222-2222-222222222222",
    full_name: "Hafiz Manager",
    phone: "+60172223333",
    role: "branch_manager",
    state: "active",
    created_at: "2026-10-28T00:00:00Z",
    assigned_branches: ["MSU Shah Alam"],
    assigned_branch_ids: ["b1111111-1111-1111-1111-111111111111"],
    is_primary_manager: true,
  },
  {
    user_id: "u3333333-3333-3333-3333-333333333333",
    full_name: "Zul Machine Tech",
    phone: "+60198887777",
    role: "machine_maintenance",
    state: "active",
    created_at: "2026-10-29T00:00:00Z",
    assigned_branches: ["MSU Shah Alam"],
    assigned_branch_ids: ["b1111111-1111-1111-1111-111111111111"],
    is_primary_manager: false,
  },
];

describe("PersonnelDirectoryTable reusable component", () => {
  it("renders organization variant with Assigned Locations dropdown", () => {
    const raw = renderToString(
      React.createElement(PersonnelDirectoryTable, {
        variant: "organization",
        personnel: mockPersonnel,
        branches: mockBranches,
        canManage: true,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    expect(text).toContain("Assigned Locations");
    expect(text).toContain("Dr. Owner");
    expect(text).toContain("Hafiz Manager");
    expect(text).toContain("Zul Machine Tech");
    expect(text).toContain("All locations (Owner)");
    expect(text).not.toContain("Remove from branch");
    expect(raw).not.toContain("font-mono");
  });

  it("renders branch variant for owner with Remove from branch button and Primary Manager guard", () => {
    const raw = renderToString(
      React.createElement(PersonnelDirectoryTable, {
        variant: "branch",
        branchId: "b1111111-1111-1111-1111-111111111111",
        personnel: mockPersonnel,
        canManage: true,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    expect(text).toContain("Branch Assignment");
    expect(text).toContain("Dr. Owner");
    expect(text).toContain("All locations (Owner)");
    expect(text).toContain("Primary Manager");
    expect(text).toContain("Remove from branch");
    expect(raw).not.toContain("font-mono");
  });

  it("renders branch variant in read-only mode for branch managers", () => {
    const raw = renderToString(
      React.createElement(PersonnelDirectoryTable, {
        variant: "branch",
        branchId: "b1111111-1111-1111-1111-111111111111",
        personnel: mockPersonnel,
        canManage: false,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");

    expect(text).toContain("Branch Assignment");
    expect(text).toContain("Assigned to branch");
    expect(text).toContain("(View only)");
    expect(text).not.toContain("Remove from branch");
  });
});

