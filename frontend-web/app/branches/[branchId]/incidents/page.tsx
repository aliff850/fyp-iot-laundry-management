import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/auth/AuthForm";
import { BranchWorkspaceShell } from "@/components/workspace/layout/BranchWorkspaceShell";
import { BranchIncidentsClient } from "@/components/workspace/incidents/BranchIncidentsClient";
import { getBranch, getBranchIncidents, getMembership } from "@/lib/auth/business";

export const metadata: Metadata = { title: "Active Incidents" };
export const dynamic = "force-dynamic";

interface BranchIncidentsPageProps {
  params: Promise<{ branchId: string }>;
}

export default async function BranchIncidentsPage({
  params,
}: BranchIncidentsPageProps) {
  const { branchId } = await params;
  const [membershipRes, branchRes, incidentsRes] = await Promise.all([
    getMembership(),
    getBranch(branchId),
    getBranchIncidents(branchId, { activeOnly: true, limit: 100 }),
  ]);

  if (!membershipRes.ok && membershipRes.status === 401) {
    redirect(`/login?next=%2Fbranches%2F${branchId}%2Fincidents`);
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

  if (!branchRes.ok) {
    return (
      <div className="min-h-screen bg-canvas p-6 text-ink">
        <div className="mx-auto max-w-4xl">
          <Notice>{branchRes.message}</Notice>
          <div className="mt-4">
            <Link
              href="/branches"
              className="text-xs text-accent underline hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              &larr; Return to Branch Directory
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const orgName = membershipRes.value.organization?.name ?? "Your Organization";

  return (
    <BranchWorkspaceShell
      branch={branchRes.value}
      activeTab="incidents"
      userRole={role}
      organizationName={orgName}
      hideIncidentsBanner
    >
      <BranchIncidentsClient
        branchId={branchId}
        userRole={role}
        initialIncidents={incidentsRes.ok ? incidentsRes.value : []}
        initialError={incidentsRes.ok ? null : incidentsRes.message}
      />
    </BranchWorkspaceShell>
  );
}
