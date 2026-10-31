import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, AlertCircle, Building2, MapPin, Plus, Users, WashingMachine } from "lucide-react";
import { Notice } from "@/components/auth/AuthForm";
import { WorkspaceShell } from "@/components/workspace/layout/WorkspaceShell";
import { MetricCard, MetricGrid } from "@/components/workspace/common/MetricCard";
import { BranchDirectoryView } from "@/components/workspace/branches/BranchDirectoryView";
import { BranchPerformanceChart } from "@/components/workspace/overview/BranchPerformanceChart";
import { getBranchDirectory, getMembership } from "@/lib/auth/business";
import { primaryButton, secondaryButton } from "@/lib/auth/styles";

export const metadata: Metadata = { title: "Branches" };
export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  const [member, directory] = await Promise.all([
    getMembership("/me"),
    getBranchDirectory(),
  ]);
  if (!member.ok && member.status === 401) redirect("/login?next=%2Fbranches");
  if (!member.ok) return <WorkspaceShell title="Branches"><Notice>{member.message}</Notice></WorkspaceShell>;
  if (member.value.state !== "active" && member.value.state !== "approved_unassigned") redirect("/membership-status");
  const owner = member.value.state === "active" && member.value.role === "owner";
  return <WorkspaceShell title="Branches" organization={member.value.organization?.name} owner={owner}>
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-muted">{owner ? "Organization workspace" : "Assigned locations"}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{member.value.organization?.name}</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">{owner ? "Manage your locations and personnel from one place." : "Your branch access is based on current assignments."}</p>
        </div>
        {/* {owner && <Link href="/branches/new" className={primaryButton}><Plus className="size-4" aria-hidden="true" />Create branch</Link>} */}
      </div>
      {!directory.ok && <section className="rounded-md border border-line bg-surface px-5 py-4 md:p-7"><Notice>{directory.message} Your branch data has not been replaced with sample data.</Notice><Link href="/branches" className={secondaryButton + " mt-4"}>Retry</Link></section>}
      {directory.ok && <>
        {owner && directory.value.summary && (
          <section
            className="rounded-md border border-line bg-surface p-5 md:p-6"
            aria-label="Organization statistics"
          >
            <div className="space-y-6">
              <div>
                <h2 id="org-infrastructure-heading" className="text-sm font-semibold text-ink mb-3">
                  Infrastructure
                </h2>
                <MetricGrid columns={3} ariaLabel="Infrastructure statistics">
                  <MetricCard size="sm" variant="raised" icon={<Building2 className="size-4" aria-hidden="true" />} label="Branches" value={directory.value.summary.branch_count} />
                  <MetricCard size="sm" variant="raised" icon={<Users className="size-4" aria-hidden="true" />} label="Approved personnel" value={directory.value.summary.personnel_count} />
                  <MetricCard size="sm" variant="raised" icon={<WashingMachine className="size-4" aria-hidden="true" />} label="Registered machines" value={0} />
                </MetricGrid>
              </div>

              <div className="border-t border-rule pt-6">
                <h2 id="org-operations-heading" className="text-sm font-semibold text-ink mb-3">
                  Operational activity
                </h2>
                <MetricGrid columns={3} ariaLabel="Operational activity statistics">
                  <MetricCard size="sm" variant="raised" icon={<Users className="size-4" aria-hidden="true" />} label="Pending requests" value={directory.value.summary.pending_request_count} href="/personnel" />
                  <MetricCard size="sm" variant="raised" icon={<Activity className="size-4" aria-hidden="true" />} label="Machines running" value={0} />
                  <MetricCard size="sm" variant="raised" icon={<AlertCircle className="size-4" aria-hidden="true" />} label="Machines down" value={0} />
                </MetricGrid>
              </div>
            </div>
          </section>
        )}
        <BranchDirectoryView branches={directory.value.branches} owner={owner} />
        {owner && <BranchPerformanceChart branches={directory.value.branches} />}
      </>}
    </div>
  </WorkspaceShell>;
}
