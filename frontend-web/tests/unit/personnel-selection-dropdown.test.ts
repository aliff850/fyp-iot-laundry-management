import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  PersonnelSelectionDropdown,
  type SelectionOption,
} from "@/components/workspace/personnel/PersonnelSelectionDropdown";
import { PersonnelRoleSelect } from "@/components/workspace/personnel/PersonnelRoleSelect";
import { PersonnelBranchSelect } from "@/components/workspace/personnel/PersonnelBranchSelect";
import type { WorkspaceBranch } from "@/lib/auth/business";

const mockBranchOptions: SelectionOption[] = [
  {
    value: "b1111111-1111-1111-1111-111111111111",
    label: "MSU Shah Alam",
    description: "Seksyen 13",
  },
  {
    value: "b2222222-2222-2222-2222-222222222222",
    label: "Subang Jaya SS15",
    description: "Jalan SS 15/4",
  },
];

const mockRoleOptions: SelectionOption[] = [
  {
    value: "branch_manager",
    label: "Branch Manager",
    description: "Operations and facility monitoring",
  },
  {
    value: "machine_maintenance",
    label: "Machine Maintenance",
    description: "Washer and dryer diagnostics",
  },
  {
    value: "lpg_maintenance",
    label: "LPG Maintenance",
    description: "Gas cylinder and fuel systems",
  },
];

const dummyServerAction = async () => ({ success: true });

describe("PersonnelSelectionDropdown component", () => {
  it("renders closed trigger button in radio mode with active role label", () => {
    const raw = renderToString(
      React.createElement(PersonnelSelectionDropdown, {
        mode: "radio",
        userId: "u1111111-1111-1111-1111-111111111111",
        options: mockRoleOptions,
        currentValues: ["branch_manager"],
        fieldName: "role",
        ariaLabel: "Role selection",
        serverAction: dummyServerAction,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Branch Manager");
    expect(text).toContain('aria-haspopup="dialog"');
    expect(text).toContain('aria-expanded="false"');
  });

  it("renders open popover in radio mode with radio options and descriptions", () => {
    const raw = renderToString(
      React.createElement(PersonnelSelectionDropdown, {
        mode: "radio",
        userId: "u1111111-1111-1111-1111-111111111111",
        options: mockRoleOptions,
        currentValues: ["branch_manager"],
        fieldName: "role",
        ariaLabel: "Role selection",
        defaultOpen: true,
        serverAction: dummyServerAction,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Branch Manager");
    expect(text).toContain("Operations and facility monitoring");
    expect(text).toContain("Machine Maintenance");
    expect(text).toContain("Washer and dryer diagnostics");
    expect(text).toContain('role="radio"');
    expect(text).toContain('aria-checked="true"');
  });

  it("renders closed trigger button in checkbox mode with single branch label", () => {
    const raw = renderToString(
      React.createElement(PersonnelSelectionDropdown, {
        mode: "checkbox",
        userId: "u1111111-1111-1111-1111-111111111111",
        options: mockBranchOptions,
        currentValues: ["b1111111-1111-1111-1111-111111111111"],
        fieldName: "branchIds",
        buttonPlaceholder: "Assign branches…",
        ariaLabel: "Branch selection",
        serverAction: dummyServerAction,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("MSU Shah Alam");
  });

  it("renders open popover in checkbox mode with options and save button", () => {
    const raw = renderToString(
      React.createElement(PersonnelSelectionDropdown, {
        mode: "checkbox",
        userId: "u1111111-1111-1111-1111-111111111111",
        options: mockBranchOptions,
        currentValues: ["b1111111-1111-1111-1111-111111111111"],
        fieldName: "branchIds",
        buttonPlaceholder: "Assign branches…",
        ariaLabel: "Branch selection",
        defaultOpen: true,
        serverAction: dummyServerAction,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("MSU Shah Alam");
    expect(text).toContain("Subang Jaya SS15");
    expect(text).toContain("Seksyen 13");
    expect(text).toContain("Jalan SS 15/4");
    expect(text).toContain('role="checkbox"');
    expect(text).toContain("Save");
    expect(text).toContain("Cancel");
  });

  it("renders multiple branch count summary in checkbox mode", () => {
    const raw = renderToString(
      React.createElement(PersonnelSelectionDropdown, {
        mode: "checkbox",
        userId: "u1111111-1111-1111-1111-111111111111",
        options: mockBranchOptions,
        currentValues: [
          "b1111111-1111-1111-1111-111111111111",
          "b2222222-2222-2222-2222-222222222222",
        ],
        fieldName: "branchIds",
        buttonPlaceholder: "Assign branches…",
        ariaLabel: "Branch selection",
        serverAction: dummyServerAction,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("2 locations");
  });

  it("renders placeholder when no branches are assigned in checkbox mode", () => {
    const raw = renderToString(
      React.createElement(PersonnelSelectionDropdown, {
        mode: "checkbox",
        userId: "u1111111-1111-1111-1111-111111111111",
        options: mockBranchOptions,
        currentValues: [],
        fieldName: "branchIds",
        buttonPlaceholder: "Assign branches…",
        ariaLabel: "Branch selection",
        serverAction: dummyServerAction,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Assign branches…");
  });

  it("renders protected non-interactive text for owner rows", () => {
    const raw = renderToString(
      React.createElement(PersonnelSelectionDropdown, {
        mode: "checkbox",
        userId: "u1111111-1111-1111-1111-111111111111",
        options: mockBranchOptions,
        currentValues: [],
        isOwnerRow: true,
        fieldName: "branchIds",
        ownerText: "All locations (Owner)",
        ariaLabel: "Branch selection",
        serverAction: dummyServerAction,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("All locations (Owner)");
    expect(text).not.toContain("button");
  });

  it("PersonnelRoleSelect wrapper integrates with PersonnelSelectionDropdown in radio mode", () => {
    const raw = renderToString(
      React.createElement(PersonnelRoleSelect, {
        userId: "u1111111-1111-1111-1111-111111111111",
        currentRole: "machine_maintenance",
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Machine Maintenance");
    expect(text).toContain('aria-haspopup="dialog"');
  });

  it("PersonnelRoleSelect wrapper renders protected text for owner row", () => {
    const raw = renderToString(
      React.createElement(PersonnelRoleSelect, {
        userId: "u1111111-1111-1111-1111-111111111111",
        currentRole: "owner",
        isOwnerRow: true,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Owner (Permanent)");
    expect(text).not.toContain("button");
  });

  it("PersonnelBranchSelect ticks assigned branch checkboxes when opened", () => {
    const branches: WorkspaceBranch[] = [
      {
        id: "b1111111-1111-1111-1111-111111111111",
        name: "MSU Shah Alam",
        address: "Seksyen 13",
        city: "Shah Alam",
        region: "Selangor",
        postal_code: "40100",
        latitude: null,
        longitude: null,
        contact_phone: "+60123456789",
        opening_hours: "Daily 08:00-22:00",
        primary_manager_user_id: "u1111111-1111-1111-1111-111111111111",
        service_status: "open",
        created_at: "2026-10-27T00:00:00Z",
      },
      {
        id: "b2222222-2222-2222-2222-222222222222",
        name: "Subang Jaya SS15",
        address: "Jalan SS 15/4",
        city: "Subang Jaya",
        region: "Selangor",
        postal_code: "47500",
        latitude: null,
        longitude: null,
        contact_phone: "+60123456789",
        opening_hours: "Daily 08:00-22:00",
        primary_manager_user_id: "u9999999-9999-9999-9999-999999999999",
        service_status: "open",
        created_at: "2026-10-27T00:00:00Z",
      },
      {
        id: "b3333333-3333-3333-3333-333333333333",
        name: "Sunway Pyramid",
        address: "Bandar Sunway",
        city: "Petaling Jaya",
        region: "Selangor",
        postal_code: "46150",
        latitude: null,
        longitude: null,
        contact_phone: "+60123456789",
        opening_hours: "Daily 08:00-22:00",
        primary_manager_user_id: "u9999999-9999-9999-9999-999999999999",
        service_status: "open",
        created_at: "2026-10-27T00:00:00Z",
      },
    ];

    const raw = renderToString(
      React.createElement(PersonnelBranchSelect, {
        userId: "u1111111-1111-1111-1111-111111111111",
        fullName: "Ahmad Faiz",
        branches,
        assignedBranchIds: ["b2222222-2222-2222-2222-222222222222"],
        assignedBranchNames: ["Subang Jaya SS15"],
        defaultOpen: true,
      })
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("2 locations");
    expect(text).toContain("MSU Shah Alam");
    expect(text).toContain("Subang Jaya SS15");
    expect(text).toContain("Sunway Pyramid");
    // Two assigned branches should be checked (MSU Shah Alam via primary_manager_user_id, Subang Jaya SS15 via assignedBranchIds)
    const checkedMatches = text.match(/role="checkbox"\s+aria-checked="true"/g) ?? [];
    const uncheckedMatches = text.match(/role="checkbox"\s+aria-checked="false"/g) ?? [];
    expect(checkedMatches.length).toBe(2);
    expect(uncheckedMatches.length).toBe(1);
  });
});
