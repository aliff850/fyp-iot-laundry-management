"use server";

import { revalidatePath } from "next/cache";
import {
  removeOrganizationLogo,
  updateOwnProfile,
  uploadOrganizationLogo,
} from "@/lib/auth/business";
import { createClient } from "@/lib/supabase/server";

export type OrganizationLogoState = {
  success?: boolean;
  message?: string;
  logoUrl?: string | null;
};

export type AccountProfileActionState = {
  success?: boolean;
  message?: string;
  fieldErrors?: Partial<Record<"full_name" | "phone", string>>;
  fullName?: string;
  phone?: string;
};

export type AccountPasswordActionState = {
  success?: boolean;
  message?: string;
  fieldErrors?: Partial<Record<"new_password" | "confirm_password", string>>;
  savedAt?: number;
};

const MAX_BYTES = 1_048_576;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const PHONE_REGEX = /^[+()0-9 .-]{7,32}$/;

export async function updateAccountProfileAction(
  _prevState: AccountProfileActionState,
  formData: FormData,
): Promise<AccountProfileActionState> {
  const rawName = formData.get("full_name");
  const rawPhone = formData.get("phone");
  const fullName = typeof rawName === "string" ? rawName.trim() : "";
  const phone = typeof rawPhone === "string" ? rawPhone.trim() : "";

  const fieldErrors: AccountProfileActionState["fieldErrors"] = {};
  if (fullName.length < 2 || fullName.length > 100) {
    fieldErrors.full_name = "Enter your full name (2–100 characters).";
  }
  if (!PHONE_REGEX.test(phone)) {
    fieldErrors.phone = "Enter a phone number, including its country or area code.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      message: "Review the highlighted profile fields.",
      fieldErrors,
    };
  }

  const result = await updateOwnProfile({ full_name: fullName, phone });
  if (!result.ok) {
    return { success: false, message: result.message };
  }

  const client = await createClient(true);
  if (client) {
    await client.auth
      .updateUser({ data: { full_name: fullName, phone } })
      .catch(() => null);
  }

  revalidatePath("/account");
  revalidatePath("/personnel");
  revalidatePath("/branches", "layout");
  return {
    success: true,
    message: "Account profile updated.",
    fullName: result.value.profile?.full_name ?? fullName,
    phone: result.value.profile?.phone ?? phone,
  };
}

export async function updateAccountPasswordAction(
  _prevState: AccountPasswordActionState,
  formData: FormData,
): Promise<AccountPasswordActionState> {
  const rawNew = formData.get("new_password");
  const rawConfirm = formData.get("confirm_password");
  const newPassword = typeof rawNew === "string" ? rawNew : "";
  const confirmPassword = typeof rawConfirm === "string" ? rawConfirm : "";

  const fieldErrors: AccountPasswordActionState["fieldErrors"] = {};
  if (newPassword.length < 8 || newPassword.length > 128) {
    fieldErrors.new_password = "Use 8–128 characters. Your organization may require a stronger password.";
  }
  if (newPassword !== confirmPassword) {
    fieldErrors.confirm_password = "Passwords do not match.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      message: "Review the highlighted password fields.",
      fieldErrors,
    };
  }

  const client = await createClient(true);
  if (!client) {
    return { success: false, message: "Authentication service is unavailable." };
  }
  const { data: identity, error: identityError } = await client.auth
    .getUser()
    .catch(() => ({ data: { user: null }, error: new Error("auth unavailable") }));
  if (identityError || !identity?.user?.email_confirmed_at) {
    return { success: false, message: "Your session has expired. Log in again." };
  }

  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) {
    return {
      success: false,
      message: error.message || "Unable to update password right now.",
    };
  }

  return {
    success: true,
    message: "Password updated.",
    savedAt: Date.now(),
  };
}

export async function uploadOrganizationLogoAction(
  _prevState: OrganizationLogoState,
  formData: FormData,
): Promise<OrganizationLogoState> {
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size <= 0) {
    return { success: false, message: "Select a PNG, JPEG, or WebP logo file." };
  }
  if (file.size > MAX_BYTES) {
    return { success: false, message: "Logo file must be 1 MB or smaller." };
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return { success: false, message: "Unsupported image format. Use PNG, JPEG, or WebP." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const result = await uploadOrganizationLogo(
    file.type as "image/png" | "image/jpeg" | "image/webp",
    base64,
  );
  if (!result.ok) {
    return { success: false, message: result.message };
  }

  revalidatePath("/account");
  revalidatePath("/personnel");
  revalidatePath("/branches");
  return {
    success: true,
    message: "Organization logo updated.",
    logoUrl: result.value.logo_url,
  };
}

export async function removeOrganizationLogoAction(
  prevState: OrganizationLogoState,
): Promise<OrganizationLogoState> {
  void prevState;
  const result = await removeOrganizationLogo();
  if (!result.ok) {
    return { success: false, message: result.message };
  }
  revalidatePath("/account");
  revalidatePath("/personnel");
  revalidatePath("/branches");
  return {
    success: true,
    message: "Organization logo removed.",
    logoUrl: null,
  };
}
