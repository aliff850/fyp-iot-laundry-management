import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/auth/AuthForm";
import { BranchWorkspaceShell } from "@/components/workspace/layout/BranchWorkspaceShell";
import { PersonnelDirectoryTable } from "@/components/workspace/personnel/PersonnelDirectoryTable";
import {
  getBranch,
  getBranchPersonnel,
  getMembership,
} from "@/lib/auth/business";

export const metadata: Metadata = { title: "Branch Personnel" };
export const dynamic = "force-dynamic";

interface BranchPersonnelPageProps {
  params: Promise<{ branchId: string }>;
}

export default async function BranchPersonnelPage({
  params,
}: BranchPersonnelPageProps) {
  const { branchId } = await params;
  const [membershipRes, branchRes, personnelRes] = await Promise.all([
    getMembership(),
    getBranch(branchId),
    getBranchPersonnel(branchId),
  ]);

  if (!membershipRes.ok && membershipRes.status === 401) {
    redirect(`/login?next=%2Fbranches%2F${branchId}%2Fpersonnel`);
  }

  if (!membershipRes.ok || membershipRes.value.state !== "active") {
    redirect("/membership-status");
  }

  const role = membershipRes.value.role;

  // PRD Section 4.1 & 4.3:
  // Only owner (manage) and assigned branch_manager (view-only) may access Branch Personnel.
  if (role === "machine_maintenance") {
    redirect(`/branches/${branchId}/machines`);
  }
  if (role === "lpg_maintenance") {
    redirect(`/branches/${branchId}/lpg`);
  }
  if (role !== "owner" && role !== "branch_manager") {
    redirect("/branches");
  }

  if (!branchRes.ok || !personnelRes.ok) {
    const is403 =
      (!branchRes.ok && branchRes.status === 403) ||
      (!personnelRes.ok && personnelRes.status === 403);

    if (is403) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-6 text-ink">
          <div className="w-full max-w-md rounded-md border border-line bg-surface p-6">
            <h1 className="text-lg font-bold text-ink">Access Restricted</h1>
            <p className="mt-2 text-sm text-muted">
              You are not assigned to this branch location. Contact your organization owner to request assignment.
            </p>
            <div className="mt-6">
              <Link
                href="/branches"
                className="inline-flex items-center text-sm font-medium text-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
              >
                ← Return to Branch Directory
              </Link>
            </div>
          </div>
        </div>
      );
    }

    const errMessage = !branchRes.ok
      ? branchRes.message
      : !personnelRes.ok
      ? personnelRes.message
      : "Unable to load branch personnel directory right now.";

    return (
      <div className="min-h-screen bg-canvas p-6 text-ink">
        <div className="mx-auto max-w-4xl">
          <Notice>{errMessage}</Notice>
          <div className="mt-4">
            <Link
              href="/branches"
              className="text-xs text-accent underline hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              ← Return to Branch Directory
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const branch = branchRes.value;
  const personnel = personnelRes.value;
  const isOwner = role === "owner";
  const orgName =
    membershipRes.value.organization?.name ?? "Your Organization";

  return (
    <BranchWorkspaceShell
      branch={branch}
      activeTab="personnel"
      userRole={role}
      organizationName={orgName}
    >
      <div className="space-y-6">
        {/* Heading & Description */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <span className="text-xs font-medium text-muted">
              Branch Personnel Overview
            </span>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
              Assigned Branch Team
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              {isOwner
                ? "Review personnel assigned to this branch, update operational roles, or remove members from this branch location."
                : "View active personnel and maintenance specialists assigned to this branch location."}
            </p>
          </div>
        </div>

        {/* Branch Personnel Directory Table Card */}
        <section
          className="rounded-md border border-line bg-surface p-5 md:p-6"
          aria-labelledby="branch-personnel-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
            <div>
              <h3
                id="branch-personnel-heading"
                className="text-base font-semibold text-ink"
              >
                {branch.name} Personnel Directory
              </h3>
              <p className="mt-0.5 text-xs text-muted">
                {personnel.length} assigned team{" "}
                {personnel.length === 1 ? "member" : "members"} in {branch.name}
              </p>
            </div>
            {!isOwner && (
              <span className="rounded border border-rule bg-raised px-2.5 py-0.5 text-xs font-medium text-muted">
                View only
              </span>
            )}
          </div>

          <PersonnelDirectoryTable
            variant="branch"
            branchId={branch.id}
            personnel={personnel}
            canManage={isOwner}
          />
        </section>
      </div>
    </BranchWorkspaceShell>
  );
}

