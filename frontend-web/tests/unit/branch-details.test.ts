import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  updateBranchDetails: vi.fn(),
  uploadBranchImage: vi.fn(),
  setBranchCoverImage: vi.fn(),
  deleteBranchImage: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/auth/business", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/business")>();
  return {
    ...actual,
    updateBranchDetails: mocks.updateBranchDetails,
    uploadBranchImage: mocks.uploadBranchImage,
    setBranchCoverImage: mocks.setBranchCoverImage,
    deleteBranchImage: mocks.deleteBranchImage,
  };
});

import { ActionToast } from "@/components/workspace/common/ActionToast";
import { BranchDetailsForm } from "@/components/workspace/branches/BranchDetailsForm";
import { BranchDirectoryCard } from "@/components/workspace/branches/BranchDirectoryList";
import { OrganizationLogoCard } from "@/components/workspace/account/OrganizationLogoCard";
import {
  deleteBranchImageAction,
  setBranchCoverImageAction,
  updateWorkspaceBranch,
  uploadBranchImageAction,
} from "@/app/branches/[branchId]/details/actions";
import type { BranchDetail, ManagerOption } from "@/lib/auth/business";

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
    expect(text).toContain("Branch Map Location");
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

  it("renders ActionToast with valid SpinSense tokens and 44px dismiss control", () => {
    const successRaw = renderToString(
      React.createElement(ActionToast, {
        kind: "success",
        title: "Settings saved",
        message: "Branch settings saved successfully.",
        timestamp: 1763500000000,
        onDismiss: () => {},
      }),
    );
    expect(successRaw).toContain('role="status"');
    expect(successRaw).toContain("border-positive");
    expect(successRaw).toContain("Settings saved");
    expect(successRaw).toContain("Branch settings saved successfully.");
    expect(successRaw).toContain("size-11");
    expect(successRaw).not.toContain("border-ok");

    const errorRaw = renderToString(
      React.createElement(ActionToast, {
        kind: "error",
        title: "Unable to save settings",
        message: "Coordinates are outside the valid range.",
        onDismiss: () => {},
      }),
    );
    expect(errorRaw).toContain('role="alert"');
    expect(errorRaw).toContain("border-negative");
    expect(errorRaw).toContain("Unable to save settings");
    expect(errorRaw).not.toContain("danger");
  });

  it("updateWorkspaceBranch attaches distinct savedAt timestamps on committed saves and failures", async () => {
    const form = new FormData();
    form.set("name", "MSU Shah Alam");
    form.set("address", "1 Jalan University");
    form.set("city", "Shah Alam");
    form.set("region", "Selangor");
    form.set("postal_code", "40100");
    form.set("contact_phone", "+60355216868");
    form.set("opening_hours", "07:00 - 23:00");
    form.set("service_status", "open");
    form.set("latitude", "3.0789");
    form.set("longitude", "101.5529");
    form.set("is_published", "true");

    mocks.updateBranchDetails.mockResolvedValue({ ok: true, value: mockBranch });
    const first = await updateWorkspaceBranch(mockBranch.id, {}, form);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await updateWorkspaceBranch(mockBranch.id, first, form);

    expect(first.success).toBe(true);
    expect(first.message).toBe("Branch settings saved successfully.");
    expect(typeof first.savedAt).toBe("number");
    expect(typeof second.savedAt).toBe("number");
    expect(second.savedAt).toBeGreaterThanOrEqual(first.savedAt ?? 0);

    const invalid = await updateWorkspaceBranch("bad-id", {}, form);
    expect(invalid.success).toBe(false);
    expect(typeof invalid.savedAt).toBe("number");
  });

  it("renders Branch Photos manager and runs upload/cover/delete image actions cleanly", async () => {
    const branchWithPhotos: BranchDetail = {
      ...mockBranch,
      images: [
        {
          id: "img-11111111-1111-1111-1111-111111111111",
          image_url: "https://proj.supabase.co/storage/v1/object/public/branch-images/1.jpg",
          sort_order: 0,
          created_at: "2026-11-19T00:00:00Z",
        },
        {
          id: "img-22222222-2222-2222-2222-222222222222",
          image_url: "https://proj.supabase.co/storage/v1/object/public/branch-images/2.jpg",
          sort_order: 1,
          created_at: "2026-11-19T00:01:00Z",
        },
      ],
    };

    const raw = renderToString(
      React.createElement(BranchDetailsForm, {
        branch: branchWithPhotos,
        isOwner: false,
        managers: mockManagers,
      }),
    );
    const text = raw.replace(/<!--.*?-->/g, "");
    expect(text).toContain("Branch Photos");
    expect(text).toContain("2 / 10");
    expect(text).toContain("Cover");
    expect(text).toContain("Set as cover");
    expect(text).toContain("Remove");

    const file = new File([new Uint8Array(64)], "storefront.png", { type: "image/png" });
    const imgForm = new FormData();
    imgForm.set("image", file);
    mocks.uploadBranchImage.mockResolvedValue({
      ok: true,
      value: { images: branchWithPhotos.images },
    });
    const uploaded = await uploadBranchImageAction(mockBranch.id, imgForm);
    expect(uploaded.success).toBe(true);
    expect(uploaded.message).toBe("Branch photo uploaded.");
    expect(uploaded.images).toHaveLength(2);

    const coverId = "22222222-2222-2222-2222-222222222222";
    mocks.setBranchCoverImage.mockResolvedValue({
      ok: true,
      value: { images: [...(branchWithPhotos.images ?? [])].reverse() },
    });
    const coverRes = await setBranchCoverImageAction(mockBranch.id, coverId);
    expect(coverRes.success).toBe(true);
    expect(coverRes.message).toBe("Cover photo updated.");

    mocks.deleteBranchImage.mockResolvedValue({
      ok: true,
      value: { images: [branchWithPhotos.images![0]] },
    });
    const delRes = await deleteBranchImageAction(mockBranch.id, coverId);
    expect(delRes.success).toBe(true);
    expect(delRes.images).toHaveLength(1);
  });
});

