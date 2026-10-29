import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/auth/AuthForm";
import { BranchWorkspaceShell } from "@/components/workspace/layout/BranchWorkspaceShell";
import { MachineFleetView } from "@/components/workspace/machines/MachineFleetView";
import {
  getBranch,
  getBranchMachines,
  getMembership,
} from "@/lib/auth/business";

export const metadata: Metadata = { title: "Branch Machine Fleet" };
export const dynamic = "force-dynamic";

interface BranchMachinesPageProps {
  params: Promise<{ branchId: string }>;
}

export default async function BranchMachinesPage({ params }: BranchMachinesPageProps) {
  const { branchId } = await params;
  const [membershipRes, branchRes, machinesRes] = await Promise.all([
    getMembership(),
    getBranch(branchId),
    getBranchMachines(branchId),
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
        {/* Header Eyebrow & Title */}
        <div className="flex flex-col gap-1">
          {/* <span className="text-xs text-muted">Branch Fleet Management</span> */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-ink">
              Commercial Washers & Dryers
            </h2>
            <div className="flex items-center gap-2">
              <span className="rounded border border-positive/30 bg-positive/10 px-2 py-0.5 text-xs font-medium text-positive">
                {machines.filter(m => m.status !== "OFFLINE" && m.status !== "ERROR").length} Operational
              </span>
              {machines.filter(m => m.status === "ERROR").length > 0 && (
                <span className="rounded border border-negative/30 bg-negative/10 px-2 py-0.5 text-xs font-medium text-negative">
                  {machines.filter(m => m.status === "ERROR").length} Faulted
                </span>
              )}
            </div>
          </div>
          {/* <p className="max-w-2xl text-xs text-muted">
            Real-time telemetry, operational cycle controls, and factory program parameters for all commercial laundry units provisioned at this location.
          </p> */}
        </div>

        {/* Fleet View Interactive Component */}
        <MachineFleetView
          initialMachines={machines}
          branchId={branchId}
          userRole={role}
        />
      </div>
    </BranchWorkspaceShell>
  );
}
