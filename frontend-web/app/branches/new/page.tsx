import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Notice } from "@/components/auth/AuthForm";
import { WorkspaceShell } from "@/components/workspace/layout/WorkspaceShell";
import { BranchCreateForm } from "@/components/workspace/branches/BranchCreateForm";
import { getManagerOptions, getMembership } from "@/lib/auth/business";

export const metadata: Metadata = { title: "Create branch" };
export const dynamic = "force-dynamic";

export default async function NewBranchPage() {
  const member = await getMembership("/me");
  if (!member.ok && member.status === 401) redirect("/login?next=%2Fbranches%2Fnew");
  if (!member.ok) return <WorkspaceShell title="Create branch"><Notice>{member.message}</Notice></WorkspaceShell>;
  if (member.value.state !== "active" || member.value.role !== "owner") redirect("/membership-status");
  const managers = await getManagerOptions();
  return <WorkspaceShell title="Create branch" organization={member.value.organization?.name} owner>
    <div className="max-w-3xl"><h1 className="text-2xl font-semibold tracking-tight">Create a branch</h1><p className="mt-2 text-sm text-muted">Record the location and choose its primary manager. Machines and gateway devices can be added in a later phase.</p>
      {!managers.ok ? <div className="mt-6"><Notice>{managers.message}</Notice></div> : <BranchCreateForm managers={managers.value} />}
    </div>
  </WorkspaceShell>;
}
