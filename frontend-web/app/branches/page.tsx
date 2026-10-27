import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, MapPin, Plus, Users } from "lucide-react";
import { Notice } from "@/components/auth/AuthForm";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import { BranchDirectoryView } from "@/components/workspace/BranchDirectoryView";
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
        {owner && <Link href="/branches/new" className={primaryButton}><Plus className="size-4" aria-hidden="true" />Create branch</Link>}
      </div>
      {!directory.ok && <section className="rounded-md border border-line bg-surface px-5 py-4 md:p-7"><Notice>{directory.message} Your branch data has not been replaced with sample data.</Notice><Link href="/branches" className={secondaryButton + " mt-4"}>Retry</Link></section>}
      {directory.ok && <>
        {owner && directory.value.summary && <div className="grid gap-4 md:grid-cols-3 md:gap-6" aria-label="Organization counts">
          <Metric icon={<Building2 className="size-5" aria-hidden="true" />} label="Branches" value={directory.value.summary.branch_count} />
          <Metric icon={<Users className="size-5" aria-hidden="true" />} label="Approved personnel" value={directory.value.summary.personnel_count} />
          <Metric icon={<Users className="size-5" aria-hidden="true" />} label="Pending requests" value={directory.value.summary.pending_request_count} href="/personnel" />
        </div>}
        {directory.value.branches.length === 0 ? <section className="rounded-md border border-line bg-surface px-5 py-8 md:p-7">
          <MapPin className="size-6 text-accent" aria-hidden="true" />
          <h3 className="mt-5 text-base font-semibold">{owner ? "Your first branch starts here" : "No branches assigned yet"}</h3>
          <p className="mt-2 max-w-lg text-sm text-muted">{owner ? "Add your first location to begin organizing the laundry operation. Machines and sensors are configured later." : "Your owner has approved your role but has not assigned a branch. Contact them for access."}</p>
          {owner && <Link href="/branches/new" className={primaryButton + " mt-6"}>Create branch</Link>}
        </section> : <BranchDirectoryView branches={directory.value.branches} />}
        {owner && <section className="rounded-md border border-line bg-surface px-5 py-4 md:p-7"><h3 className="text-base font-semibold">Operations data</h3><p className="mt-2 text-sm text-muted">Incident notifications, machine totals, fuel readings and analytics will appear when their authorized data providers are connected. No live measurements are available here yet.</p></section>}
      </>}
    </div>
  </WorkspaceShell>;
}

function Metric({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: number; href?: string }) {
  const content = <><span className="text-muted">{icon}</span><span className="text-xs text-muted">{label}</span><strong className="mt-3 text-4xl font-medium tabular-nums">{value}</strong></>;
  return href ? <Link href={href} className="flex flex-col rounded-md border border-line bg-surface px-5 py-4 transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none md:p-7">{content}</Link> : <div className="flex flex-col rounded-md border border-line bg-surface px-5 py-4 md:p-7">{content}</div>;
}
