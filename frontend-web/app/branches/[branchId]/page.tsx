import { redirect } from "next/navigation";
import { getMembership, getBranch } from "@/lib/auth/business";

export const dynamic = "force-dynamic";

interface BranchRouteProps {
  params: Promise<{ branchId: string }>;
}

export default async function BranchRouteEntry({ params }: BranchRouteProps) {
  const { branchId } = await params;
  const [membershipRes, branchRes] = await Promise.all([
    getMembership(),
    getBranch(branchId),
  ]);

  if (!membershipRes.ok && membershipRes.status === 401) {
    redirect(`/login?next=%2Fbranches%2F${branchId}`);
  }

  if (!membershipRes.ok || membershipRes.value.state !== "active") {
    redirect("/membership-status");
  }

  if (!branchRes.ok) {
    if (branchRes.status === 403) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-canvas p-6 text-ink">
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-6 shadow-sm">
            <h1 className="text-lg font-bold text-ink">Access Restricted</h1>
            <p className="mt-2 text-sm text-muted">
              You are not assigned to this branch location. Contact your organization owner to request assignment.
            </p>
            <div className="mt-6">
              <a
                href="/branches"
                className="inline-flex items-center text-sm font-medium text-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
              >
                ← Return to Branch Directory
              </a>
            </div>
          </div>
        </div>
      );
    }
    redirect("/branches");
  }

  const role = membershipRes.value.role;

  // PRD Section 4.3 Routing:
  // Owner/Manager → overview
  // Machine Maintenance → machines
  // LPG Maintenance → lpg
  if (role === "owner" || role === "branch_manager") {
    redirect(`/branches/${branchId}/overview`);
  } else if (role === "machine_maintenance") {
    redirect(`/branches/${branchId}/machines`);
  } else if (role === "lpg_maintenance") {
    redirect(`/branches/${branchId}/lpg`);
  } else {
    redirect("/branches");
  }
}
