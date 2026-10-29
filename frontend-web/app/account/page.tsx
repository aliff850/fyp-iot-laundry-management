import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Building2, Calendar, Mail, Phone, ShieldCheck, User } from "lucide-react";
import { Notice } from "@/components/auth/AuthForm";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { WorkspaceShell } from "@/components/workspace/layout/WorkspaceShell";
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
  const fullName = (user.user_metadata?.full_name as string | undefined) || "Operator";
  const phone = (user.user_metadata?.phone as string | undefined) || "Not provided";
  const roleBadge = formatRoleBadge(membership.role ?? "operator");

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    : "—";

  return (
    <WorkspaceShell title="Account" organization={orgName} owner={isOwner}>
      <div className="space-y-8">
        {/* Heading & Subpage Action Row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs text-muted">Operator profile</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Account Profile</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Your verified credentials, role, and organization membership.
            </p>
          </div>
        </div>

        {/* Profile Card */}
        <section
          aria-labelledby="profile-heading"
          className="rounded-md border border-line bg-surface p-5 md:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-full border border-control/30 bg-raised/60 text-ink">
                <User className="size-6 text-accent" aria-hidden="true" />
              </div>
              <div>
                <h2 id="profile-heading" className="text-base font-semibold text-ink">
                  {fullName}
                </h2>
                <p className="mt-0.5 text-xs text-muted">{user.email}</p>
              </div>
            </div>
            {/* Absolutely 0 point for this */}
            {/* <span className="inline-flex items-center gap-1.5 rounded-full border border-positive/30 bg-positive/10 px-2.5 py-0.5 text-xs font-medium text-positive">
              <span className="size-1.5 rounded-full bg-positive" />
              Verified Account
            </span> */}
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-line bg-raised/40 p-4 transition-colors hover:bg-raised/60">
              <dt className="flex items-center gap-1.5 text-xs text-muted">
                <Mail className="size-3.5 text-faint" aria-hidden="true" />
                <span>Email address</span>
              </dt>
              <dd className="mt-1 truncate text-sm text-ink">{user.email}</dd>
            </div>

            <div className="rounded-md border border-line bg-raised/40 p-4 transition-colors hover:bg-raised/60">
              <dt className="flex items-center gap-1.5 text-xs text-muted">
                <Phone className="size-3.5 text-faint" aria-hidden="true" />
                <span>Contact phone</span>
              </dt>
              <dd className="mt-1 text-sm text-ink">{phone}</dd>
            </div>

            <div className="rounded-md border border-line bg-raised/40 p-4 transition-colors hover:bg-raised/60">
              <dt className="flex items-center gap-1.5 text-xs text-muted">
                <Calendar className="size-3.5 text-faint" aria-hidden="true" />
                <span>Member since</span>
              </dt>
              <dd className="mt-1 text-sm tabular-nums text-ink">{memberSince}</dd>
            </div>

            <div className="rounded-md border border-line bg-raised/40 p-4 transition-colors hover:bg-raised/60">
              <dt className="flex items-center gap-1.5 text-xs text-muted">
                <ShieldCheck className="size-3.5 text-faint" aria-hidden="true" />
                <span>Account status</span>
              </dt>
              <dd className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-positive">
                <span className="size-2 rounded-full bg-positive" />
                <span>Active & Verified</span>
              </dd>
            </div>
          </dl>
        </section>

        {/* Organization & Role Card */}
        <section
          aria-labelledby="org-heading"
          className="rounded-md border border-line bg-surface p-5 md:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
            <div className="flex items-center gap-2.5">
              <Building2 className="size-5 text-muted" aria-hidden="true" />
              <div>
                <h2 id="org-heading" className="text-base font-semibold text-ink">
                  Organization & Permissions
                </h2>
                <p className="mt-0.5 text-xs text-muted">Current organization access and role scope</p>
              </div>
            </div>
            {/* <span className={roleBadge.className}>{roleBadge.label}</span> */}
          </div>

          <div className="mt-4 divide-y divide-rule text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="text-xs text-muted">Organization name</span>
              <span className="font-semibold text-ink">{orgName}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="text-xs text-muted">Server role</span>
              <span className="text-xs text-ink">{membership.role}</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 py-3">
              <span className="text-xs text-muted">Access tier</span>
              <span className="text-xs text-muted">
                {isOwner
                  ? "Full administrative access across all branches and personnel management."
                  : "Assigned branch operations and specialist maintenance telemetry."}
              </span>
            </div>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}

function formatRoleBadge(role: string): { label: string; className: string } {
  switch (role) {
    case "owner":
      return {
        label: "Owner",
        className:
          "rounded border border-accent/30 bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent",
      };
    case "branch_manager":
      return {
        label: "Branch Manager",
        className:
          "rounded border border-line bg-raised px-2.5 py-1 text-xs font-semibold text-ink",
      };
    case "machine_maintenance":
      return {
        label: "Machine Maintenance",
        className:
          "rounded border border-warning/30 bg-warning/10 px-2.5 py-1 text-xs font-semibold text-warning",
      };
    case "lpg_maintenance":
      return {
        label: "LPG Maintenance",
        className:
          "rounded border border-positive/30 bg-positive/10 px-2.5 py-1 text-xs font-semibold text-positive",
      };
    default:
      return {
        label: role,
        className:
          "rounded border border-line bg-raised px-2.5 py-1 text-xs font-semibold text-muted",
      };
  }
}
