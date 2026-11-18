"use server";

import { revalidatePath } from "next/cache";
import { removeOrganizationLogo, uploadOrganizationLogo } from "@/lib/auth/business";

export type OrganizationLogoState = {
  success?: boolean;
  message?: string;
  logoUrl?: string | null;
};

const MAX_BYTES = 1_048_576;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

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
  revalidatePath("/branches");
  return {
    success: true,
    message: "Organization logo removed.",
    logoUrl: null,
  };
}
