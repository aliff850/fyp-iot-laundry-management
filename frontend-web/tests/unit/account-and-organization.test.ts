import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  updateOwnProfile: vi.fn(),
  updateOrganizationDetails: vi.fn(),
  revalidatePath: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/auth/business", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/business")>();
  return {
    ...actual,
    updateOwnProfile: mocks.updateOwnProfile,
    updateOrganizationDetails: mocks.updateOrganizationDetails,
  };
});

import {
  updateAccountPasswordAction,
  updateAccountProfileAction,
} from "@/app/account/actions";
import { updateOrganizationSettingsAction } from "@/app/personnel/actions";
import { AccountPasswordForm } from "@/components/workspace/account/AccountPasswordForm";
import { AccountProfileForm } from "@/components/workspace/account/AccountProfileForm";
import { OrganizationLogoCard } from "@/components/workspace/account/OrganizationLogoCard";
import { OrganizationSettingsForm } from "@/components/workspace/personnel/OrganizationSettingsForm";

describe("Account profile & merged Organization/Personnel workflows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates and saves editable profile details and syncs Supabase metadata", async () => {
    const updateUser = vi.fn().mockResolvedValue({ data: { user: {} }, error: null });
    mocks.createClient.mockResolvedValue({ auth: { updateUser } });
    mocks.updateOwnProfile.mockResolvedValue({
      ok: true,
      value: {
        state: "active",
        role: "owner",
        organization: { id: "org-1", name: "SpinCo", business_timezone: "Asia/Kuala_Lumpur" },
        profile: { full_name: "Amina Ali", phone: "+60123456789" },
      },
    });

    const invalidForm = new FormData();
    invalidForm.set("full_name", "A");
    invalidForm.set("phone", "bad!");
    const invalidRes = await updateAccountProfileAction({}, invalidForm);
    expect(invalidRes.success).toBe(false);
    expect(invalidRes.fieldErrors?.full_name).toBeDefined();
    expect(invalidRes.fieldErrors?.phone).toBeDefined();
    expect(mocks.updateOwnProfile).not.toHaveBeenCalled();

    const validForm = new FormData();
    validForm.set("full_name", "Amina Ali");
    validForm.set("phone", "+60123456789");
    const okRes = await updateAccountProfileAction({}, validForm);

    expect(okRes).toMatchObject({
      success: true,
      message: "Account profile updated.",
      fullName: "Amina Ali",
      phone: "+60123456789",
    });
    expect(mocks.updateOwnProfile).toHaveBeenCalledWith({
      full_name: "Amina Ali",
      phone: "+60123456789",
    });
    expect(updateUser).toHaveBeenCalledWith({
      data: { full_name: "Amina Ali", phone: "+60123456789" },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/account");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/personnel");
  });

  it("validates matching 8-128 char password and updates via confirmed Supabase session", async () => {
    const updateUser = vi.fn().mockResolvedValue({ data: { user: {} }, error: null });
    mocks.createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { email_confirmed_at: "2026-10-27" } },
          error: null,
        }),
        updateUser,
      },
    });

    const mismatchForm = new FormData();
    mismatchForm.set("new_password", "short");
    mismatchForm.set("confirm_password", "different");
    const mismatchRes = await updateAccountPasswordAction({}, mismatchForm);
    expect(mismatchRes.success).toBe(false);
    expect(mismatchRes.fieldErrors?.new_password).toBeDefined();
    expect(mismatchRes.fieldErrors?.confirm_password).toBeDefined();
    expect(updateUser).not.toHaveBeenCalled();

    const validForm = new FormData();
    validForm.set("new_password", "SpinSense2026!");
    validForm.set("confirm_password", "SpinSense2026!");
    const okRes = await updateAccountPasswordAction({}, validForm);
    expect(okRes.success).toBe(true);
    expect(okRes.message).toBe("Password updated.");
    expect(updateUser).toHaveBeenCalledWith({ password: "SpinSense2026!" });
  });

  it("validates and updates organization details on /personnel", async () => {
    mocks.updateOrganizationDetails.mockResolvedValue({
      ok: true,
      value: {
        organization: {
          id: "org-1",
          name: "SpinCo Hub",
          business_timezone: "Asia/Singapore",
          logo_url: null,
        },
      },
    });

    const invalidForm = new FormData();
    invalidForm.set("name", "   ");
    invalidForm.set("business_timezone", "");
    const invalidRes = await updateOrganizationSettingsAction({}, invalidForm);
    expect(invalidRes.success).toBe(false);
    expect(invalidRes.fieldErrors?.name).toBeDefined();
    expect(invalidRes.fieldErrors?.business_timezone).toBeDefined();

    const validForm = new FormData();
    validForm.set("name", "SpinCo Hub");
    validForm.set("business_timezone", "Asia/Singapore");
    const okRes = await updateOrganizationSettingsAction({}, validForm);
    expect(okRes).toMatchObject({
      success: true,
      message: "Organization details updated.",
      name: "SpinCo Hub",
      businessTimezone: "Asia/Singapore",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/personnel");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/branches", "layout");
  });

  it("renders DESIGN.md compliant AccountProfileForm & AccountPasswordForm without organization details", () => {
    const profileHtml = renderToString(
      React.createElement(AccountProfileForm, {
        initialFullName: "Amina Ali",
        initialPhone: "+60123456789",
        email: "amina@spinsense.my",
        memberSince: "November 22, 2026",
      }),
    );
    const passwordHtml = renderToString(React.createElement(AccountPasswordForm));

    expect(profileHtml).toContain("Profile Details");
    expect(profileHtml).toContain('name="full_name"');
    expect(profileHtml).toContain('name="phone"');
    expect(profileHtml).toContain("Save profile");
    expect(profileHtml).toContain("min-h-11");
    expect(profileHtml).toContain("focus-visible:outline-accent");
    expect(profileHtml).not.toContain("Organization &amp; Permissions");
    expect(profileHtml).not.toContain("Operator profile");

    expect(passwordHtml).toContain("Password");
    expect(passwordHtml).toContain("items-start");
    expect(passwordHtml).toContain("content-start");
    expect(passwordHtml).toContain('name="new_password"');
    expect(passwordHtml).toContain('name="confirm_password"');
    expect(passwordHtml).toContain("Update password");
    expect(passwordHtml).toContain("min-h-11");
  });

  it("renders OrganizationSettingsForm and embedded OrganizationLogoCard cleanly on /personnel", () => {
    const orgHtml = renderToString(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(OrganizationSettingsForm, {
          initialName: "SpinCo Laundromat",
          initialTimezone: "Asia/Kuala_Lumpur",
          roleLabel: "Owner",
          accessScope: "All branches, personnel, and settings",
        }),
        React.createElement(OrganizationLogoCard, {
          organizationName: "SpinCo Laundromat",
          initialLogoUrl: null,
          embedded: true,
        }),
      ),
    );

    expect(orgHtml).toContain('name="name"');
    expect(orgHtml).toContain('name="business_timezone"');
    expect(orgHtml).toContain("Save organization");
    expect(orgHtml).toContain("Asia/Kuala_Lumpur");
    expect(orgHtml).toContain("Owner");
    expect(orgHtml).toContain("Public organization logo");
    expect(orgHtml).toContain("min-h-11");
    expect(orgHtml).toContain("focus-visible:outline-accent");
    expect(orgHtml).not.toContain("AB-07");
  });
});
