import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/auth/AuthForm";
import { BranchWorkspaceShell } from "@/components/workspace/layout/BranchWorkspaceShell";
import { LpgWorkspaceView } from "@/components/workspace/lpg/LpgWorkspaceView";
import {
  getBranch,
  getBranchLpg,
  getMembership,
} from "@/lib/auth/business";

export const metadata: Metadata = { title: "LPG Fuel & Safety" };
export const dynamic = "force-dynamic";

interface BranchLpgPageProps {
  params: Promise<{ branchId: string }>;
}

export default async function BranchLpgPage({ params }: BranchLpgPageProps) {
  const { branchId } = await params;
  const [membershipRes, branchRes, lpgRes] = await Promise.all([
    getMembership(),
    getBranch(branchId),
    getBranchLpg(branchId),
  ]);

  if (!membershipRes.ok && membershipRes.status === 401) {
    redirect(`/login?next=%2Fbranches%2F${branchId}%2Flpg`);
  }

  if (!membershipRes.ok || membershipRes.value.state !== "active") {
    redirect("/membership-status");
  }

  const role = membershipRes.value.role;

  // PRD Section 4.3 & 4.4 Role-based boundary:
  // Permitted: owner, branch_manager, lpg_maintenance
  // Forbidden: machine_maintenance redirected to /machines
  if (role === "machine_maintenance") {
    redirect(`/branches/${branchId}/machines`);
  }

  if (role !== "owner" && role !== "branch_manager" && role !== "lpg_maintenance") {
    redirect("/branches");
  }

  // Branch access authorization check
  if (!branchRes.ok || !lpgRes.ok) {
    const is403 =
      (!branchRes.ok && branchRes.status === 403) ||
      (!lpgRes.ok && lpgRes.status === 403);

    if (is403) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-6 text-ink">
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-sm">
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
      : !lpgRes.ok
      ? lpgRes.message
      : "Failed to load LPG fuel and environmental safety data.";

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
  const lpgData = lpgRes.value;

  return (
    <BranchWorkspaceShell
      branch={branch}
      activeTab="lpg"
      userRole={role}
    >
      <LpgWorkspaceView
        initialData={lpgData}
        branchId={branchId}
        userRole={role}
      />
    </BranchWorkspaceShell>
  );
}
