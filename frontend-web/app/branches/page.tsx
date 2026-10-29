import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, AlertCircle, Building2, MapPin, Plus, Users, WashingMachine } from "lucide-react";
import { Notice } from "@/components/auth/AuthForm";
import { WorkspaceShell } from "@/components/workspace/layout/WorkspaceShell";
import { BranchDirectoryView } from "@/components/workspace/branches/BranchDirectoryView";
import { PerformanceChart } from "@/components/workspace/branches/PerformanceChart";
import { getBranchDirectory, getMembership } from "@/lib/auth/business";
import { primaryButton, secondaryButton } from "@/lib/auth/styles";

export const metadata: Metadata = { title: "Branches" };
export const dynamic = "force-dynamic";

export default async function BranchesPage() {
  const member = await getMembership("/me");
  if (!member.ok && member.status === 401) redirect("/login?next=%2Fbranches");
  if (!member.ok) return <WorkspaceShell title="Branches"><Notice>{member.message}</Notice></WorkspaceShell>;
  if (member.value.state !== "active" && member.value.state !== "approved_unassigned") redirect("/membership-status");
  const owner = member.value.state === "active" && member.value.role === "owner";
  const directory = await getBranchDirectory();
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
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6" aria-label="Organization and machine statistics">
            <Metric icon={<Building2 className="size-4" aria-hidden="true" />} label="Branches" value={directory.value.summary.branch_count} />
            <Metric icon={<Users className="size-4" aria-hidden="true" />} label="Approved personnel" value={directory.value.summary.personnel_count} />
            <Metric icon={<Users className="size-4" aria-hidden="true" />} label="Pending requests" value={directory.value.summary.pending_request_count} href="/personnel" />
            <Metric icon={<WashingMachine className="size-4" aria-hidden="true" />} label="Registered machines" value={0} />
            <Metric icon={<Activity className="size-4" aria-hidden="true" />} label="Machines running" value={0} />
            <Metric icon={<AlertCircle className="size-4" aria-hidden="true" />} label="Machines down" value={0} />
          </div>
        )}
        <BranchDirectoryView branches={directory.value.branches} owner={owner} />
        {owner && <PerformanceChart branches={directory.value.branches} />}
      </>}
    </div>
  </WorkspaceShell>;
}

function Metric({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: number; href?: string }) {
  const content = (
    <>
      <div className="flex items-center gap-1.5 text-muted">
        <span className="shrink-0">{icon}</span>
        <span className="truncate text-xs text-muted">{label}</span>
      </div>
      <strong className="mt-1 text-xl font-semibold text-ink tabular-nums">{value}</strong>
    </>
  );
  const base = "flex flex-col justify-between rounded-md border border-line bg-surface p-3 transition-colors";
  return href ? (
    <Link href={href} className={`${base} hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none`}>
      {content}
    </Link>
  ) : (
    <div className={base}>{content}</div>
  );
}
