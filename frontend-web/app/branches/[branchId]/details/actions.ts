"use server";

import { revalidatePath } from "next/cache";
import { updateBranchDetails } from "@/lib/auth/business";

export type UpdateBranchState = { message?: string; success?: boolean };

export async function updateWorkspaceBranch(
  branchId: string,
  _state: UpdateBranchState,
  form: FormData,
): Promise<UpdateBranchState> {
  if (!/^[0-9a-fA-F-]{36}$/.test(branchId)) {
    return { success: false, message: "Invalid branch identifier." };
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
    return { success: false, message: "Complete the required branch details." };
  }

  const serviceStatusRaw = String(read("service_status") ?? "open").trim();
  if (serviceStatusRaw !== "open" && serviceStatusRaw !== "closed") {
    return { success: false, message: "Select a valid branch service status." };
  }

  const primaryManagerRaw = String(read("primary_manager_user_id") ?? "").trim();
  if (primaryManagerRaw && !/^[0-9a-fA-F-]{36}$/.test(primaryManagerRaw)) {
    return { success: false, message: "The manager selection is invalid." };
  }

  const latitude = String(read("latitude") ?? "").trim();
  const longitude = String(read("longitude") ?? "").trim();
  if (Boolean(latitude) !== Boolean(longitude)) {
    return { success: false, message: "Enter both coordinates, or leave both blank." };
  }

  const lat = latitude ? Number(latitude) : null;
  const lng = longitude ? Number(longitude) : null;
  if (
    (lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) ||
    (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180))
  ) {
    return { success: false, message: "Coordinates are outside the valid range." };
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
  });

  if (!result.ok) {
    return { success: false, message: result.message };
  }

  revalidatePath("/branches");
  revalidatePath(`/branches/${branchId}`);
  revalidatePath(`/branches/${branchId}/details`);
  return { success: true, message: "Branch configuration updated." };
}

