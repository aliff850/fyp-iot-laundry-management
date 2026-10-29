import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  PersonnelSelectionDropdown,
  type SelectionOption,
} from "@/components/workspace/personnel/PersonnelSelectionDropdown";
import { PersonnelRoleSelect } from "@/components/workspace/personnel/PersonnelRoleSelect";

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
});
