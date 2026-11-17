import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/auth/AuthForm";
import { BranchWorkspaceShell } from "@/components/workspace/layout/BranchWorkspaceShell";
import { RemoteMachineFleet } from "@/components/workspace/machines/RemoteMachineFleet";
import { BranchRecordsTable } from "@/components/workspace/records/BranchRecordsTable";
import {
  getBranch,
  getBranchRecords,
  getRemoteMachines,
  getMembership,
} from "@/lib/auth/business";

export const metadata: Metadata = { title: "Branch Machine Fleet" };
export const dynamic = "force-dynamic";

interface BranchMachinesPageProps {
  params: Promise<{ branchId: string }>;
}

export default async function BranchMachinesPage({ params }: BranchMachinesPageProps) {
  const { branchId } = await params;
  const [membershipRes, branchRes, machinesRes, recordsRes] = await Promise.all([
    getMembership(),
    getBranch(branchId),
    getRemoteMachines(branchId),
    getBranchRecords(branchId, "machines", "all", 1, 10),
  ]);

  if (!membershipRes.ok && membershipRes.status === 401) {
    redirect(`/login?next=%2Fbranches%2F${branchId}%2Fmachines`);
  }

  if (!membershipRes.ok || membershipRes.value.state !== "active") {
    redirect("/membership-status");
  }

  const role = membershipRes.value.role;

  // PRD Section 4.3 & 4.4:
  // Allowed: owner, branch_manager, machine_maintenance
  // Forbidden: lpg_maintenance redirected to LPG page
  if (role === "lpg_maintenance") {
    redirect(`/branches/${branchId}/lpg`);
  }

  if (role !== "owner" && role !== "branch_manager" && role !== "machine_maintenance") {
    redirect("/branches");
  }

  // Branch access failure check
  if (!branchRes.ok || !machinesRes.ok) {
    const is403 =
      (!branchRes.ok && branchRes.status === 403) ||
      (!machinesRes.ok && machinesRes.status === 403);

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
      : !machinesRes.ok
        ? machinesRes.message
        : "Failed to load branch machine data.";

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
  const machines = machinesRes.value;
  const orgName = membershipRes.value.organization?.name ?? "Your Organization";

  return (
    <BranchWorkspaceShell
      branch={branch}
      activeTab="machines"
      userRole={role}
      organizationName={orgName}
    >
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Machines</h2>
        <RemoteMachineFleet
          initialMachines={machines}
          branchId={branchId}
          branchOpen={branch.service_status === "open"}
          role={role}
        />
        <BranchRecordsTable
          key={`machine-records-${branch.id}`}
          branchId={branch.id}
          allowedScopes={["machines"]}
          defaultScope="machines"
          title="Machine cycle records"
          showPrice={role !== "machine_maintenance"}
          initialData={recordsRes.ok ? recordsRes.value : null}
          initialError={recordsRes.ok ? null : recordsRes.message}
        />
      </div>
    </BranchWorkspaceShell>
  );
}
