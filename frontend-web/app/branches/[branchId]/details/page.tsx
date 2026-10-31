import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/auth/AuthForm";
import { BranchWorkspaceShell } from "@/components/workspace/layout/BranchWorkspaceShell";
import { BranchDetailsForm } from "@/components/workspace/branches/BranchDetailsForm";
import {
  getBranch,
  getManagerOptions,
  getMembership,
  type ManagerOption,
} from "@/lib/auth/business";

export const metadata: Metadata = { title: "Branch Details & Setup" };
export const dynamic = "force-dynamic";

interface BranchDetailsPageProps {
  params: Promise<{ branchId: string }>;
}

export default async function BranchDetailsPage({
  params,
}: BranchDetailsPageProps) {
  const { branchId } = await params;
  const [membershipRes, branchRes] = await Promise.all([
    getMembership(),
    getBranch(branchId),
  ]);

  if (!membershipRes.ok && membershipRes.status === 401) {
    redirect(`/login?next=%2Fbranches%2F${branchId}%2Fdetails`);
  }

  if (!membershipRes.ok || membershipRes.value.state !== "active") {
    redirect("/membership-status");
  }

  const role = membershipRes.value.role;

  if (role === "machine_maintenance") {
    redirect(`/branches/${branchId}/machines`);
  }
  if (role === "lpg_maintenance") {
    redirect(`/branches/${branchId}/lpg`);
  }
  if (role !== "owner" && role !== "branch_manager") {
    redirect("/branches");
  }

  if (!branchRes.ok) {
    if (branchRes.status === 403) {
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

    return (
      <div className="min-h-screen bg-canvas p-6 text-ink">
        <div className="mx-auto max-w-4xl">
          <Notice>{branchRes.message}</Notice>
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

  const isOwner = role === "owner";
  let managers: ManagerOption[] = [];

  if (isOwner) {
    const managersRes = await getManagerOptions();
    if (managersRes.ok) {
      managers = managersRes.value;
    }
  }

  const branch = branchRes.value;

  return (
    <BranchWorkspaceShell
      branch={branch}
      activeTab="details"
      userRole={role}
      organizationName={membershipRes.value.organization?.name}
    >
      <div className="space-y-6">
        <h1 className="text-lg font-bold text-ink">Details & Setup</h1>
        <BranchDetailsForm
          branch={branch}
          isOwner={isOwner}
          managers={managers}
        />
      </div>
    </BranchWorkspaceShell>
  );
}

