import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/auth/AuthForm";
import { BranchWorkspaceShell } from "@/components/workspace/layout/BranchWorkspaceShell";
import { IncidentDetailClient } from "@/components/workspace/incidents/IncidentDetailClient";
import { getBranch, getIncidentDetail, getMembership } from "@/lib/auth/business";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Incident Response" };
export const dynamic = "force-dynamic";

interface BranchIncidentPageProps {
  params: Promise<{ branchId: string; incidentId: string }>;
}

export default async function BranchIncidentPage({ params }: BranchIncidentPageProps) {
  const { branchId, incidentId } = await params;
  const supabase = await createClient();
  const authRes = supabase
    ? await supabase.auth.getUser().catch(() => ({ data: { user: null } }))
    : { data: { user: null } };
  const userId = authRes.data?.user?.id ?? "";
  if (!userId) {
    redirect(`/login?next=%2Fbranches%2F${branchId}%2Fincidents%2F${incidentId}`);
  }

  const [membershipRes, branchRes, incidentRes] = await Promise.all([
    getMembership(),
    getBranch(branchId),
    getIncidentDetail(incidentId),
  ]);

  if (!membershipRes.ok && membershipRes.status === 401) {
    redirect(`/login?next=%2Fbranches%2F${branchId}%2Fincidents%2F${incidentId}`);
  }

  if (!membershipRes.ok || membershipRes.value.state !== "active") {
    redirect("/membership-status");
  }

  const rawRole = membershipRes.value.role ?? "";
  if (
    rawRole !== "owner" &&
    rawRole !== "branch_manager" &&
    rawRole !== "machine_maintenance" &&
    rawRole !== "lpg_maintenance"
  ) {
    redirect("/branches");
  }
  const role = rawRole;

  if (!branchRes.ok || !incidentRes.ok) {
    const message = !incidentRes.ok
      ? incidentRes.message
      : !branchRes.ok
        ? branchRes.message
        : "Unable to load incident.";
    return (
      <div className="min-h-screen bg-canvas p-6 text-ink">
        <div className="mx-auto max-w-3xl space-y-4">
          <Notice>{message}</Notice>
          <Link
            href="/branches"
            className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            &larr; Return to Branch Directory
          </Link>
        </div>
      </div>
    );
  }

  const incident = incidentRes.value;
  if (incident.branch_id !== branchId) {
    redirect(`/branches/${incident.branch_id}/incidents/${incident.id}`);
  }

  const activeTab = incident.domain === "lpg" ? "lpg" : "machines";
  const orgName = membershipRes.value.organization?.name ?? "Your Organization";

  return (
    <BranchWorkspaceShell
      branch={branchRes.value}
      activeTab={activeTab}
      userRole={role}
      organizationName={orgName}
    >
      <IncidentDetailClient
        branchId={branchId}
        userId={userId}
        userRole={role}
        initialIncident={incident}
      />
    </BranchWorkspaceShell>
  );
}
