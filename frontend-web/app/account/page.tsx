import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Notice } from "@/components/auth/AuthForm";
import { AccountPasswordForm } from "@/components/workspace/account/AccountPasswordForm";
import { AccountProfileForm } from "@/components/workspace/account/AccountProfileForm";
import { WorkspaceShell } from "@/components/workspace/layout/WorkspaceShell";
import { PushNotificationToggle } from "@/components/workspace/notifications/PushNotificationToggle";
import { getMembership } from "@/lib/auth/business";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const client = await createClient();
  if (!client) redirect("/login?next=%2Faccount");

  const { data: identity, error: identityError } = await client.auth
    .getUser()
    .catch(() => ({ data: { user: null }, error: true }));
  if (identityError || !identity?.user?.email_confirmed_at) {
    redirect("/login?next=%2Faccount");
  }

  const membershipResult = await getMembership("/me");
  if (!membershipResult.ok && membershipResult.status === 401) {
    redirect("/login?next=%2Faccount");
  }

  if (!membershipResult.ok) {
    return (
      <WorkspaceShell title="Account">
        <Notice>{membershipResult.message}</Notice>
      </WorkspaceShell>
    );
  }

  const membership = membershipResult.value;
  if (membership.state !== "active") {
    redirect("/membership-status");
  }

  const user = identity.user;
  const isOwner = membership.role === "owner";
  const orgName = membership.organization?.name ?? "SpinSense Organization";
  const fullName =
    membership.profile?.full_name ||
    (user.user_metadata?.full_name as string | undefined) ||
    "Operator";
  const phone =
    membership.profile?.phone ||
    (user.user_metadata?.phone as string | undefined) ||
    "";

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  return (
    <WorkspaceShell
      title="Account"
      organization={orgName}
      owner={isOwner}
      notificationsEnabled
      userRole={membership.role}
    >
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Account</h1>
        </div>

        <AccountProfileForm
          initialFullName={fullName}
          initialPhone={phone}
          email={user.email ?? ""}
          memberSince={memberSince}
        />

        <AccountPasswordForm />

        {["owner", "branch_manager", "machine_maintenance", "lpg_maintenance"].includes(
          membership.role ?? "",
        ) && <PushNotificationToggle variant="card" />}
      </div>
    </WorkspaceShell>
  );
}
