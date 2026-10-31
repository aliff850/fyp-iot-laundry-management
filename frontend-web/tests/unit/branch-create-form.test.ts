import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { BranchCreateForm } from "@/components/workspace/branches/BranchCreateForm";
import { createWorkspaceBranch } from "@/app/branches/new/actions";
import { businessRequest } from "@/lib/auth/business";
import type { ManagerOption } from "@/lib/auth/business";

// Mock useRouter and useActionState
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/business", () => ({
  businessRequest: vi.fn(),
}));

const mockManagers: ManagerOption[] = [
  { user_id: "u-owner", full_name: "John Doe", role: "owner" },
  { user_id: "u-manager", full_name: "Jane Smith", role: "branch_manager" },
];

describe("BranchCreateForm component", () => {
  it("renders centered form with single 24-hours toggle button, no redundant checkbox, and no extra presets", () => {
    const raw = renderToString(
      React.createElement(BranchCreateForm, { managers: mockManagers })
    );

    const text = raw.replace(/<!--.*?-->/g, "");

    // 1. Centered layout
    expect(raw).toContain("mx-auto max-w-3xl");

    // 2. Step indicators without middle-dots
    expect(raw).not.toContain("·");
    expect(text).toContain("1. Details and location");
    expect(text).toContain("2. Primary manager");
    expect(text).toContain("3. Review");

    // 3. Opening Hours: 24 Hours / Always Open toggle exists with min-h-11
    expect(text).toContain("24 Hours / Always Open");
    expect(raw).toMatch(/<button[^>]*min-h-11[^>]*>(?:(?!<\/button>)[\s\S])*?<span>24 Hours \/ Always Open<\/span>/);

    // 4. Removed redundant presets
    expect(text).not.toContain("07:00 - 23:00 (Standard)");
    expect(text).not.toContain("06:00 - 00:00 (Late Night)");
    expect(text).not.toContain("08:00 - 22:00 (Mall Hours)");
    expect(text).not.toContain("Quick presets:");

    // 5. Removed redundant checkbox
    expect(raw).not.toContain('type="checkbox"');
    expect(text).not.toContain("Branch operates 24 hours daily");

    // 6. Default time inputs with min-h-11
    expect(text).toContain("Opening time");
    expect(text).toContain("Closing time");
    expect(raw).toMatch(/<input[^>]*type="time"[^>]*min-h-11/);

    // 7. Buttons have min-h-11 touch targets
    expect(raw).toMatch(/<a[^>]*min-h-11[^>]*href="\/branches"/);
    expect(raw).toMatch(/<button[^>]*min-h-11[^>]*>Continue<\/button>/);

    // 8. Form inputs have maxLength and phone pattern
    expect(raw).toContain('pattern="^[+()0-9 .-]+$"');
    expect(raw).toContain('maxLength="32"');
    expect(raw).toContain('maxLength="120"');
    expect(raw).toContain('maxLength="240"');
  });

  it("handles initialization when owner is not present in managers list", () => {
    const nonOwnerManagers: ManagerOption[] = [
      { user_id: "u-mgr-1", full_name: "Branch Lead", role: "branch_manager" },
      { user_id: "u-mgr-2", full_name: "Unassigned Tech", role: null },
    ];
    const raw = renderToString(
      React.createElement(BranchCreateForm, { managers: nonOwnerManagers })
    );
    expect(raw).toContain("1. Details and location");
    expect(raw).toContain("Branch name");
  });
});

describe("createWorkspaceBranch server action", () => {
  const validFormData = () => {
    const fd = new FormData();
    fd.append("request_id", "11111111-1111-1111-1111-111111111111");
    fd.append("name", "Branch One");
    fd.append("address", "123 Jalan Ampang");
    fd.append("city", "Kuala Lumpur");
    fd.append("region", "Wilayah Persekutuan");
    fd.append("postal_code", "50450");
    fd.append("contact_phone", "+60123456789");
    fd.append("opening_hours", "24 Hours");
    fd.append("primary_manager_user_id", "22222222-2222-2222-2222-222222222222");
    return fd;
  };

  it("rejects invalid contact phone patterns and lengths", async () => {
    const fd = validFormData();
    fd.set("contact_phone", "invalid-phone!");
    const res = await createWorkspaceBranch({}, fd);
    expect(res).toEqual({ message: "Enter a valid contact phone number (7 to 32 digits, symbols + ( ) - . allowed)." });

    fd.set("contact_phone", "123");
    const resShort = await createWorkspaceBranch({}, fd);
    expect(resShort).toEqual({ message: "Enter a valid contact phone number (7 to 32 digits, symbols + ( ) - . allowed)." });
  });

  it("rejects field lengths exceeding schema boundaries", async () => {
    const fd = validFormData();
    fd.set("name", "A".repeat(121));
    const res = await createWorkspaceBranch({}, fd);
    expect(res).toEqual({ message: "Branch name cannot exceed 120 characters." });
  });

  it("submits clean payload and surfaces server detail on failure", async () => {
    const mockRequest = vi.mocked(businessRequest);
    mockRequest.mockResolvedValueOnce({
      ok: false,
      status: 422,
      message: "Select an active owner, branch manager, or unassigned personnel in this organization",
    });

    const fd = validFormData();
    const res = await createWorkspaceBranch({}, fd);
    expect(res).toEqual({
      message: "Select an active owner, branch manager, or unassigned personnel in this organization",
    });
  });

  it("returns success when backend creates branch", async () => {
    const mockRequest = vi.mocked(businessRequest);
    mockRequest.mockResolvedValueOnce({
      ok: true,
      value: { branch: { id: "new-branch-id" } } as never,
    });

    const fd = validFormData();
    const res = await createWorkspaceBranch({}, fd);
    expect(res).toEqual({
      success: true,
      message: "Branch created.",
    });
  });
});

