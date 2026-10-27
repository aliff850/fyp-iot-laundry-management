import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthForm, Notice } from "@/components/auth/AuthForm";
import { getAuthConfig, getSiteUrl } from "@/lib/auth/config";
import { safeReturnTo } from "@/lib/auth/redirects";

export const metadata: Metadata = { title: "Log in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; confirmed?: string }> }) {
  const params = await searchParams;
  return (
    <AuthShell title="Good to see you again" description="Log in to your SpinSense account.">
      <div className="space-y-5">
        {params.confirmed === "1" && <Notice kind="success">Email confirmation complete. Log in to continue.</Notice>}
        <AuthForm mode="login" configured={Boolean(getAuthConfig() && getSiteUrl())} next={safeReturnTo(params.next)} />
      </div>
    </AuthShell>
  );
}
