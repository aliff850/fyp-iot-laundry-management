"use server";

import { revalidatePath } from "next/cache";
import {
  deleteBranchImage,
  setBranchCoverImage,
  updateBranchDetails,
  uploadBranchImage,
  type BranchImage,
  type WeeklyHoursSchedule,
} from "@/lib/auth/business";

export type UpdateBranchState = { message?: string; success?: boolean; savedAt?: number };
export type BranchImageActionState = {
  success?: boolean;
  message?: string;
  images?: BranchImage[];
  savedAt?: number;
};

const MAX_BRANCH_IMAGE_BYTES = 5_242_880;
const ALLOWED_BRANCH_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const UUID_REGEX = /^[0-9a-fA-F-]{36}$/;

export async function updateWorkspaceBranch(
  branchId: string,
  _state: UpdateBranchState,
  form: FormData,
): Promise<UpdateBranchState> {
  if (!/^[0-9a-fA-F-]{36}$/.test(branchId)) {
    return { success: false, message: "Invalid branch identifier.", savedAt: Date.now() };
  }

  const read = (key: string) => form.get(key);
  const requiredFields = [
    "name",
    "address",
    "city",
    "region",
    "postal_code",
    "contact_phone",
    "opening_hours",
  ];
  if (requiredFields.some((key) => typeof read(key) !== "string" || !String(read(key)).trim())) {
    return { success: false, message: "Complete the required branch details.", savedAt: Date.now() };
  }

  const serviceStatusRaw = String(read("service_status") ?? "open").trim();
  if (serviceStatusRaw !== "open" && serviceStatusRaw !== "closed") {
    return { success: false, message: "Select a valid branch service status.", savedAt: Date.now() };
  }

  const primaryManagerRaw = String(read("primary_manager_user_id") ?? "").trim();
  if (primaryManagerRaw && !/^[0-9a-fA-F-]{36}$/.test(primaryManagerRaw)) {
    return { success: false, message: "The manager selection is invalid.", savedAt: Date.now() };
  }

  const latitude = String(read("latitude") ?? "").trim();
  const longitude = String(read("longitude") ?? "").trim();
  if (Boolean(latitude) !== Boolean(longitude)) {
    return { success: false, message: "Enter both coordinates, or leave both blank.", savedAt: Date.now() };
  }

  const lat = latitude ? Number(latitude) : null;
  const lng = longitude ? Number(longitude) : null;
  if (
    (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) ||
    (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180))
  ) {
    return { success: false, message: "Coordinates are outside the valid range.", savedAt: Date.now() };
  }

  const isPublishedRaw = read("is_published");
  const isPublished =
    isPublishedRaw === "true"
      ? true
      : isPublishedRaw === "false"
        ? false
        : undefined;

  let weeklyHours: WeeklyHoursSchedule | null | undefined = undefined;
  const weeklyHoursRaw = read("weekly_hours_json");
  if (typeof weeklyHoursRaw === "string" && weeklyHoursRaw.trim()) {
    try {
      const parsed = JSON.parse(weeklyHoursRaw);
      if (parsed === null || (typeof parsed === "object" && !Array.isArray(parsed))) {
        weeklyHours = parsed as WeeklyHoursSchedule | null;
      } else {
        return { success: false, message: "Weekly schedule format is invalid.", savedAt: Date.now() };
      }
    } catch {
      return { success: false, message: "Weekly schedule format is invalid.", savedAt: Date.now() };
    }
  }

  const result = await updateBranchDetails(branchId, {
    name: String(read("name")).trim(),
    address: String(read("address")).trim(),
    city: String(read("city")).trim(),
    region: String(read("region")).trim(),
    postal_code: String(read("postal_code")).trim(),
    contact_phone: String(read("contact_phone")).trim(),
    opening_hours: String(read("opening_hours")).trim(),
    service_status: serviceStatusRaw,
    latitude: lat,
    longitude: lng,
    ...(primaryManagerRaw ? { primary_manager_user_id: primaryManagerRaw } : {}),
    ...(isPublished !== undefined ? { is_published: isPublished } : {}),
    ...(weeklyHours !== undefined ? { weekly_hours: weeklyHours } : {}),
  });

  if (!result.ok) {
    return { success: false, message: result.message, savedAt: Date.now() };
  }

  revalidatePath("/branches");
  revalidatePath(`/branches/${branchId}`, "layout");
  revalidatePath(`/branches/${branchId}`);
  revalidatePath(`/branches/${branchId}/details`);
  return {
    success: true,
    message: "Branch settings saved successfully.",
    savedAt: Date.now(),
  };
}

export async function uploadBranchImageAction(
  branchId: string,
  formData: FormData,
): Promise<BranchImageActionState> {
  if (!UUID_REGEX.test(branchId)) {
    return { success: false, message: "Invalid branch identifier.", savedAt: Date.now() };
  }

  const file = formData.get("image");
  if (!(file instanceof File) || file.size <= 0) {
    return { success: false, message: "Select a PNG, JPEG, or WebP image file.", savedAt: Date.now() };
  }
  if (file.size > MAX_BRANCH_IMAGE_BYTES) {
    return { success: false, message: "Branch photo must be 5 MB or smaller.", savedAt: Date.now() };
  }
  if (!ALLOWED_BRANCH_IMAGE_MIME.has(file.type)) {
    return { success: false, message: "Unsupported image format. Use PNG, JPEG, or WebP.", savedAt: Date.now() };
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const result = await uploadBranchImage(
    branchId,
    file.type as "image/png" | "image/jpeg" | "image/webp",
    base64,
  );
  if (!result.ok) {
    return { success: false, message: result.message, savedAt: Date.now() };
  }

  revalidatePath("/branches");
  revalidatePath(`/branches/${branchId}`, "layout");
  revalidatePath(`/branches/${branchId}`);
  revalidatePath(`/branches/${branchId}/details`);
  return {
    success: true,
    message: "Branch photo uploaded.",
    images: result.value.images,
    savedAt: Date.now(),
  };
}

export async function setBranchCoverImageAction(
  branchId: string,
  imageId: string,
): Promise<BranchImageActionState> {
  if (!UUID_REGEX.test(branchId) || !UUID_REGEX.test(imageId)) {
    return { success: false, message: "Invalid branch or image identifier.", savedAt: Date.now() };
  }

  const result = await setBranchCoverImage(branchId, imageId);
  if (!result.ok) {
    return { success: false, message: result.message, savedAt: Date.now() };
  }

  revalidatePath("/branches");
  revalidatePath(`/branches/${branchId}`, "layout");
  revalidatePath(`/branches/${branchId}`);
  revalidatePath(`/branches/${branchId}/details`);
  return {
    success: true,
    message: "Cover photo updated.",
    images: result.value.images,
    savedAt: Date.now(),
  };
}

export async function deleteBranchImageAction(
  branchId: string,
  imageId: string,
): Promise<BranchImageActionState> {
  if (!UUID_REGEX.test(branchId) || !UUID_REGEX.test(imageId)) {
    return { success: false, message: "Invalid branch or image identifier.", savedAt: Date.now() };
  }

  const result = await deleteBranchImage(branchId, imageId);
  if (!result.ok) {
    return { success: false, message: result.message, savedAt: Date.now() };
  }

  revalidatePath("/branches");
  revalidatePath(`/branches/${branchId}`, "layout");
  revalidatePath(`/branches/${branchId}`);
  revalidatePath(`/branches/${branchId}/details`);
  return {
    success: true,
    message: "Branch photo removed.",
    images: result.value.images,
    savedAt: Date.now(),
  };
}

