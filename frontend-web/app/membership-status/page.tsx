import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { Notice, RefreshButton } from "@/components/auth/AuthForm";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { OnboardingButton } from "@/components/auth/OnboardingButton";
import { createClient } from "@/lib/supabase/server";
import { getMembership } from "@/lib/auth/business";
import { activeDestination, safeReturnTo } from "@/lib/auth/redirects";
import { textLink } from "@/lib/auth/styles";

export const metadata: Metadata = { title: "Workspace setup" };
export const dynamic = "force-dynamic";

export default async function MembershipStatusPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeReturnTo((await searchParams).next);
  const login = next ? `/login?${new URLSearchParams({ next })}` : "/login";
  const client = await createClient();
  if (!client) return <AuthShell title="Workspace unavailable" description="We can't verify your session right now. Please try again later."><Link href="/login" className={textLink}>Back to log in</Link></AuthShell>;
  const { data, error } = await client.auth.getUser().catch(() => ({ data: { user: null }, error: true }));
  if (error || !data.user?.email_confirmed_at) redirect(login);
  const result = await getMembership();
  if (!result.ok && result.status === 401) redirect(login);
  const membership = result.ok ? result.value : null;
  if (membership?.state === "active") redirect(activeDestination(next, membership.role));
  const title = membership?.state === "pending" ? "Waiting for approval" : membership?.state === "approval_pending" ? "Approval in progress" : membership?.state === "rejected" ? "Request declined" : membership?.state === "approved_unassigned" ? "Waiting for a branch" : membership?.state === "deactivated" ? "Account unavailable" : "Complete workspace setup";
  return <AuthShell title={title} description="Your current organization status is checked with the business service.">
    <div className="space-y-6">
      <p className="break-words text-sm text-muted">Signed in as <span className="text-ink">{data.user.email}</span></p>
      {!result.ok && <Notice>{result.message} No workspace access has been assumed.</Notice>}
      {membership?.state === "incomplete" && <><Notice kind="info">Your account is confirmed. Complete or retry business onboarding to create your organization or join request.</Notice><OnboardingButton /></>}
      {membership?.state === "pending" && <Notice kind="info">Your join request is pending owner approval. No branches are available yet.</Notice>}
      {membership?.state === "approval_pending" && <Notice kind="info">Your owner’s approval is being finalized. Ask the owner to retry the recorded decision if this state persists.</Notice>}
      {membership?.state === "rejected" && <Notice kind="info">The organization declined your join request. Contact its owner if this needs review.</Notice>}
      {membership?.state === "approved_unassigned" && <Notice kind="info">Your role is approved, but no branch is assigned. Branch operations are unavailable.</Notice>}
      {membership?.state === "deactivated" && <Notice>Your account or organization is inactive. Contact the organization owner.</Notice>}
      <RefreshButton>Check again</RefreshButton>
      <SignOutButton variant="button" />
    </div>
  </AuthShell>;
}
