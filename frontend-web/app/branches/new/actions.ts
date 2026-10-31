"use server";

import { revalidatePath } from "next/cache";
import { businessRequest } from "@/lib/auth/business";

export type CreateBranchState = { message?: string; success?: boolean };

export async function createWorkspaceBranch(_state: CreateBranchState, form: FormData): Promise<CreateBranchState> {
  const read = (key: string) => form.get(key);
  const fields = ["request_id", "name", "address", "city", "region", "postal_code", "contact_phone", "opening_hours", "primary_manager_user_id"];
  if (fields.some(key => typeof read(key) !== "string" || !String(read(key)).trim())) return { message: "Complete the required branch details." };
  if (!/^[0-9a-fA-F-]{36}$/.test(String(read("request_id"))) || !/^[0-9a-fA-F-]{36}$/.test(String(read("primary_manager_user_id")))) return { message: "The request or manager selection is invalid." };

  const phone = String(read("contact_phone") ?? "").trim();
  if (phone.length < 7 || phone.length > 32 || !/^[+()0-9 .-]+$/.test(phone)) {
    return { message: "Enter a valid contact phone number (7 to 32 digits, symbols + ( ) - . allowed)." };
  }

  const name = String(read("name") ?? "").trim();
  const address = String(read("address") ?? "").trim();
  const city = String(read("city") ?? "").trim();
  const region = String(read("region") ?? "").trim();
  const postalCode = String(read("postal_code") ?? "").trim();
  const openingHours = String(read("opening_hours") ?? "").trim();
  if (name.length > 120) return { message: "Branch name cannot exceed 120 characters." };
  if (address.length > 240) return { message: "Address cannot exceed 240 characters." };
  if (city.length > 100) return { message: "City cannot exceed 100 characters." };
  if (region.length > 100) return { message: "State or region cannot exceed 100 characters." };
  if (postalCode.length > 20) return { message: "Postal code cannot exceed 20 characters." };
  if (openingHours.length > 200) return { message: "Opening hours cannot exceed 200 characters." };

  const latitude = String(read("latitude") ?? "").trim();
  const longitude = String(read("longitude") ?? "").trim();
  if (Boolean(latitude) !== Boolean(longitude)) return { message: "Enter both coordinates, or leave both blank." };
  const lat = latitude ? Number(latitude) : null;
  const lng = longitude ? Number(longitude) : null;
  if ((lat !== null && (!Number.isFinite(lat) || lat < -90 || lat > 90)) || (lng !== null && (!Number.isFinite(lng) || lng < -180 || lng > 180))) return { message: "Coordinates are outside the valid range." };
  const payload = Object.fromEntries(fields.map(key => [key, String(read(key)).trim()]));
  const result = await businessRequest<{ branch: { id: string } }>("/branches", "POST", { ...payload, latitude: lat, longitude: lng });
  if (!result.ok) return { message: result.message };
  if (!result.value?.branch?.id) return { message: "The business service returned an invalid branch." };
  revalidatePath("/branches");
  return { success: true, message: "Branch created." };
}
