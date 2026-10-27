import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { getAuthConfig, getSiteUrl } from "@/lib/auth/config";
import { getPublicOrganizations } from "@/lib/auth/organizations";

export const metadata: Metadata = { title: "Personnel registration" };
export const dynamic = "force-dynamic";

export default async function PersonnelRegistrationPage() {
  const directory = await getPublicOrganizations();
  return <AuthShell title="Join your laundry team" description="Choose your organization and create an account. Its owner will review your request when workspace setup is available." backHref="/register" backLabel="Choose account type"><AuthForm mode="personnel" configured={Boolean(getAuthConfig() && getSiteUrl())} directory={directory} /></AuthShell>;
}
