import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthForm } from "@/components/auth/AuthForm";
import { getAuthConfig, getSiteUrl } from "@/lib/auth/config";

export const metadata: Metadata = { title: "Owner registration" };
export const dynamic = "force-dynamic";

export default function OwnerRegistrationPage() {
  return <AuthShell title="Create your owner account" description="After confirming your email, log in and we'll set up your organization automatically before opening Branches." backHref="/register" backLabel="Choose account type"><AuthForm mode="owner" configured={Boolean(getAuthConfig() && getSiteUrl())} /></AuthShell>;
}
