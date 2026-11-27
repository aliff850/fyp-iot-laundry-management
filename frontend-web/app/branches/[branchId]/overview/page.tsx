import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Flame,
  ShieldCheck,
  Users,
  WashingMachine,
} from "lucide-react";
import { Notice } from "@/components/auth/AuthForm";
import { BranchWorkspaceShell } from "@/components/workspace/layout/BranchWorkspaceShell";
import { PerformanceChart } from "@/components/workspace/branches/PerformanceChart";
import { LpgTankLevelsChart } from "@/components/workspace/branches/LpgTankLevelsChart";
import { BranchRecordsTable } from "@/components/workspace/records/BranchRecordsTable";
import { MetricCard, MetricGrid } from "@/components/workspace/common/MetricCard";
import {
  getBranchLpgSafety,
  getBranchOverview,
  getBranchOverviewAnalytics,
  getBranchRecords,
  getMembership,
} from "@/lib/auth/business";

export const metadata: Metadata = { title: "Branch Overview" };
export const dynamic = "force-dynamic";

interface BranchOverviewPageProps {
  params: Promise<{ branchId: string }>;
}

function OverviewPanelSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <section className="rounded-md border border-line bg-surface p-5 md:p-6" aria-hidden="true">
      <div className="mb-4 h-5 w-44 animate-pulse rounded bg-raised" />
      <div
        className={`${tall ? "h-64" : "h-48"} w-full animate-pulse rounded-md border border-rule bg-raised`}
      />
    </section>
  );
}

async function OverviewPerformanceSection({ branchId }: { branchId: string }) {
  const analyticsRes = await getBranchOverviewAnalytics(branchId, "day");
  return (
    <PerformanceChart
      key={branchId}
      branchId={branchId}
      initialAnalytics={analyticsRes.ok ? analyticsRes.value : null}
      initialError={analyticsRes.ok ? null : analyticsRes.message}
    />
  );
}

async function OverviewLpgSection({ branchId }: { branchId: string }) {
  const lpgRes = await getBranchLpgSafety(branchId);
  return (
    <LpgTankLevelsChart
      key={`lpg-tanks-${branchId}`}
      branchId={branchId}
      initialSnapshot={lpgRes.ok ? lpgRes.value : null}
      initialError={lpgRes.ok ? null : lpgRes.message}
    />
  );
}

async function OverviewRecordsSection({ branchId }: { branchId: string }) {
  const recordsRes = await getBranchRecords(branchId, "lpg", "all", 1, 10);
  return (
    <BranchRecordsTable
      key={`records-${branchId}`}
      branchId={branchId}
      allowedScopes={["lpg", "machines"]}
      defaultScope="lpg"
      title="Recent records"
      showPrice={true}
      initialData={recordsRes.ok ? recordsRes.value : null}
      initialError={recordsRes.ok ? null : recordsRes.message}
    />
  );
}

export default async function BranchOverviewPage({ params }: BranchOverviewPageProps) {
  const { branchId } = await params;
  const [membershipRes, overviewRes] = await Promise.all([
    getMembership(),
    getBranchOverview(branchId),
  ]);

  if (!membershipRes.ok && membershipRes.status === 401) {
    redirect(`/login?next=%2Fbranches%2F${branchId}%2Foverview`);
  }

  if (!membershipRes.ok || membershipRes.value.state !== "active") {
    redirect("/membership-status");
  }

  const role = membershipRes.value.role;
  // PRD Section 4.3: Only owner and branch_manager may access overview
  if (role !== "owner" && role !== "branch_manager") {
    if (role === "machine_maintenance") redirect(`/branches/${branchId}/machines`);
    if (role === "lpg_maintenance") redirect(`/branches/${branchId}/lpg`);
    redirect("/branches");
  }

  if (!overviewRes.ok) {
    return (
      <div className="min-h-screen bg-canvas p-6 text-ink">
        <div className="mx-auto max-w-4xl">
          <Notice>{overviewRes.message}</Notice>
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

  const overview = overviewRes.value;
  const branch = overview.branch;
  const orgName = membershipRes.value.organization?.name ?? "Your Organization";

  return (
    <BranchWorkspaceShell
      branch={branch}
      activeTab="overview"
      userRole={role}
      organizationName={orgName}
      initialActiveIncidents={{
        totalCount: overview.incidents_total_count ?? overview.incidents.length,
        incidents: overview.incidents,
      }}
    >
      <div className="space-y-6">
        {overview.incidents.length === 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface p-4">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="size-5 text-positive" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-ink">Operational Status Nominal</h2>
                <p className="text-xs text-muted">No unresolved incidents or active safety alerts at this location.</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded border border-positive/30 bg-positive/10 px-2 py-0.5 text-xs font-medium text-positive">
              <span className="size-1.5 rounded-full bg-positive" />
              Nominal
            </span>
          </div>
        )}

        {/* Branch Infrastructure Metric Statistics */}
        <section
          className="rounded-md border border-line bg-surface p-4 sm:p-5"
          aria-labelledby="branch-infrastructure-heading"
        >
          <h2 id="branch-infrastructure-heading" className="mb-3 text-base font-bold text-ink">
            Infrastructure
          </h2>
          <MetricGrid
            columns={3}
            ariaLabel="Branch infrastructure statistics"
          >
            <MetricCard
              size="overview"
              variant="raised"
              icon={<WashingMachine className="size-4" aria-hidden="true" />}
              label="Total machines"
              value={overview.fleet.total_machines}
              href={`/branches/${branch.id}/machines`}
            />
            <MetricCard
              size="overview"
              variant="raised"
              icon={<Flame className="size-4" aria-hidden="true" />}
              label="LPG cylinders"
              value={overview.lpg.total_cylinders}
              href={`/branches/${branch.id}/lpg`}
            />
            <MetricCard
              size="overview"
              variant="raised"
              icon={<Users className="size-4" aria-hidden="true" />}
              label="Branch personnel"
              value={overview.personnel.total_assigned}
              href={`/branches/${branch.id}/personnel`}
            />
          </MetricGrid>
        </section>

        <Suspense fallback={<OverviewPanelSkeleton tall />}>
          <OverviewPerformanceSection branchId={branch.id} />
        </Suspense>

        <Suspense fallback={<OverviewPanelSkeleton />}>
          <OverviewLpgSection branchId={branch.id} />
        </Suspense>

        <Suspense fallback={<OverviewPanelSkeleton />}>
          <OverviewRecordsSection branchId={branch.id} />
        </Suspense>
      </div>
    </BranchWorkspaceShell>
  );
}
