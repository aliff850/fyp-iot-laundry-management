import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Notice } from "@/components/auth/AuthForm";
import { BranchWorkspaceShell } from "@/components/workspace/layout/BranchWorkspaceShell";
import { CustomerReportsView } from "@/components/workspace/reports/CustomerReportsView";
import {
  getBranch,
  getBranchCustomerReports,
  getMembership,
} from "@/lib/auth/business";

export const metadata: Metadata = { title: "Customer Reports" };
export const dynamic = "force-dynamic";

interface BranchCustomerReportsPageProps {
  params: Promise<{ branchId: string }>;
}

export default async function BranchCustomerReportsPage({
  params,
}: BranchCustomerReportsPageProps) {
  const { branchId } = await params;
  const [membershipRes, branchRes, reportsRes] = await Promise.all([
    getMembership(),
    getBranch(branchId),
    getBranchCustomerReports(branchId),
  ]);

  if (!membershipRes.ok && membershipRes.status === 401) {
    redirect(`/login?next=%2Fbranches%2F${branchId}%2Fcustomer-reports`);
  }

  if (!membershipRes.ok || membershipRes.value.state !== "active") {
    redirect("/membership-status");
  }

  const role = membershipRes.value.role;

  // Owner, assigned branch_manager, and assigned maintenance crew (machine_maintenance, lpg_maintenance)
  // may access the branch Customer Reports portal.
  if (
    role !== "owner" &&
    role !== "branch_manager" &&
    role !== "machine_maintenance" &&
    role !== "lpg_maintenance"
  ) {
    redirect("/branches");
  }

  if (!branchRes.ok || !reportsRes.ok) {
    const is403 =
      (!branchRes.ok && branchRes.status === 403) ||
      (!reportsRes.ok && reportsRes.status === 403);

    if (is403) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-6 text-ink">
          <div className="w-full max-w-md rounded-md border border-line bg-surface p-6">
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
      : !reportsRes.ok
      ? reportsRes.message
      : "Unable to load customer support reports right now.";

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
  const reportsData = reportsRes.value;
  const orgName =
    membershipRes.value.organization?.name ?? "Your Organization";

  return (
    <BranchWorkspaceShell
      branch={branch}
      activeTab="customer-reports"
      userRole={role}
      organizationName={orgName}
    >
      <CustomerReportsView
        initialData={reportsData}
        branchId={branch.id}
        userRole={role}
      />
    </BranchWorkspaceShell>
  );
}

