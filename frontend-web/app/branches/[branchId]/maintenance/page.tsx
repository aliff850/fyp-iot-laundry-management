import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/auth/AuthForm";
import { BranchWorkspaceShell } from "@/components/workspace/layout/BranchWorkspaceShell";
import { MaintenanceHistoryView } from "@/components/workspace/machines/MaintenanceHistoryView";
import {
  getBranch,
  getBranchLpgSafety,
  getBranchMaintenanceLogs,
  getMembership,
  getRemoteMachines,
} from "@/lib/auth/business";

export const metadata: Metadata = { title: "Maintenance Logs" };
export const dynamic = "force-dynamic";

interface BranchMaintenancePageProps {
  params: Promise<{ branchId: string }>;
}

export default async function BranchMaintenancePage({
  params,
}: BranchMaintenancePageProps) {
  const { branchId } = await params;
  const membershipRes = await getMembership();

  if (!membershipRes.ok && membershipRes.status === 401) {
    redirect(`/login?next=%2Fbranches%2F${branchId}%2Fmaintenance`);
  }

  if (!membershipRes.ok || membershipRes.value.state !== "active") {
    redirect("/membership-status");
  }

  const role = membershipRes.value.role;

  if (
    role !== "owner" &&
    role !== "branch_manager" &&
    role !== "machine_maintenance" &&
    role !== "lpg_maintenance"
  ) {
    redirect("/branches");
  }

  const [branchRes, logsRes, machinesRes, lpgRes] = await Promise.all([
    getBranch(branchId),
    getBranchMaintenanceLogs(branchId, { page: 1, page_size: 20 }),
    role === "lpg_maintenance"
      ? Promise.resolve({ ok: true as const, value: [] })
      : getRemoteMachines(branchId),
    role === "machine_maintenance"
      ? Promise.resolve({ ok: true as const, value: null })
      : getBranchLpgSafety(branchId),
  ]);

  if (!branchRes.ok) {
    if (branchRes.status === 403) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-6 text-ink">
          <div className="w-full max-w-md rounded-md border border-line bg-surface p-6">
            <h1 className="text-lg font-bold text-ink">Access Restricted</h1>
            <p className="mt-2 text-sm text-muted">
              You are not assigned to this branch location. Contact your
              organization owner to request assignment.
            </p>
            <div className="mt-6">
              <Link
                href="/branches"
                className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
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

  const branch = branchRes.value;
  const orgName =
    membershipRes.value.organization?.name ?? "Your Organization";
  const machineOptions = [
    ...(machinesRes.ok
      ? machinesRes.value.map((m) => ({ source_id: m.source_id, label: m.label }))
      : []),
    ...(lpgRes.ok && lpgRes.value
      ? lpgRes.value.devices.map((d) => ({ source_id: d.source_id, label: d.label }))
      : []),
  ];

  return (
    <BranchWorkspaceShell
      branch={branch}
      activeTab="maintenance"
      userRole={role}
      organizationName={orgName}
    >
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">
          Maintenance logs
        </h2>
        <MaintenanceHistoryView
          branchId={branchId}
          userRole={role}
          machines={machineOptions}
          initialPage={logsRes.ok ? logsRes.value : null}
          initialError={logsRes.ok ? null : logsRes.message}
        />
      </div>
    </BranchWorkspaceShell>
  );
}
