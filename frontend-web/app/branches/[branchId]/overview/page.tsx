import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Flame,
  MessageSquareWarning,
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

export default async function BranchOverviewPage({ params }: BranchOverviewPageProps) {
  const { branchId } = await params;
  const [membershipRes, overviewRes, analyticsRes, lpgRes, recordsRes] = await Promise.all([
    getMembership(),
    getBranchOverview(branchId),
    getBranchOverviewAnalytics(branchId, "day"),
    getBranchLpgSafety(branchId),
    getBranchRecords(branchId, "lpg", "all", 1, 10),
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
    >
      <div className="space-y-6">
        {/* Scoped Incidents Banner */}
        {overview.incidents.length > 0 ? (
          <div
            className="rounded-md border border-negative/40 bg-negative/10 p-4"
            role="alert"
            aria-label="Active branch incidents"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 shrink-0 text-negative" aria-hidden="true" />
              <div className="space-y-1">
                <h2 className="text-sm font-semibold text-ink">
                  {overview.incidents.length}{" "}
                  {overview.incidents.length === 1 ? "Active Incident" : "Active Incidents"} Requiring
                  Attention
                </h2>
                <div className="space-y-2 pt-1">
                  {overview.incidents.map((inc) => (
                    <Link
                      key={inc.id}
                      href={`/branches/${branchId}/incidents/${inc.id}`}
                      className="flex min-h-11 flex-col gap-1 rounded-md border border-negative/30 bg-surface/80 px-3 py-2 text-xs transition-colors hover:border-negative focus-visible:outline-2 focus-visible:outline-accent sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="min-w-0 text-muted">
                        <span className="font-semibold text-ink">{inc.title}:</span>{" "}
                        {inc.description}
                      </span>
                      <span className="shrink-0 font-semibold text-accent">
                        Inspect &rarr;
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
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

        {/* Grouped Metric Statistics Container (Infrastructure & Operational Activity) */}
        <section
          className="rounded-md border border-line bg-surface p-5 md:p-6"
          aria-label="Branch statistics"
        >
          <div className="space-y-6">
            <div>
              <h2 id="branch-infrastructure-heading" className="text-sm font-semibold text-ink mb-3">
                Infrastructure
              </h2>
              <MetricGrid
                columns={3}
                ariaLabel="Branch infrastructure statistics"
              >
                <MetricCard
                  size="sm"
                  variant="raised"
                  icon={<WashingMachine className="size-4" aria-hidden="true" />}
                  label="Total machines"
                  value={overview.fleet.total_machines}
                  href={`/branches/${branch.id}/machines`}
                />
                <MetricCard
                  size="sm"
                  variant="raised"
                  icon={<Flame className="size-4" aria-hidden="true" />}
                  label="LPG cylinders"
                  value={overview.lpg.total_cylinders}
                  href={`/branches/${branch.id}/lpg`}
                />
                <MetricCard
                  size="sm"
                  variant="raised"
                  icon={<Users className="size-4" aria-hidden="true" />}
                  label="Branch personnel"
                  value={overview.personnel.total_assigned}
                  href={`/branches/${branch.id}/personnel`}
                />
              </MetricGrid>
            </div>

            <div className="border-t border-rule pt-6">
              <h2 id="branch-operations-heading" className="text-sm font-semibold text-ink mb-3">
                Operational activity
              </h2>
              <MetricGrid
                columns={3}
                ariaLabel="Branch operational activity statistics"
              >
                <MetricCard
                  size="sm"
                  variant="raised"
                  icon={<Activity className="size-4" aria-hidden="true" />}
                  label="Machines running"
                  value={overview.fleet.running}
                  href={`/branches/${branch.id}/machines`}
                />
                <MetricCard
                  size="sm"
                  variant="raised"
                  icon={<AlertCircle className="size-4" aria-hidden="true" />}
                  label="Machines down"
                  value={overview.fleet.error + overview.fleet.offline}
                  href={`/branches/${branch.id}/machines`}
                />
                <MetricCard
                  size="sm"
                  variant="raised"
                  icon={<MessageSquareWarning className="size-4" aria-hidden="true" />}
                  label="Customer reports"
                  value={overview.customer_reports.pending_count}
                  href={`/branches/${branch.id}/customer-reports`}
                />
              </MetricGrid>
            </div>
          </div>
        </section>

        <PerformanceChart
          key={branch.id}
          branchId={branch.id}
          initialAnalytics={analyticsRes.ok ? analyticsRes.value : null}
          initialError={analyticsRes.ok ? null : analyticsRes.message}
        />

        <LpgTankLevelsChart
          key={`lpg-tanks-${branch.id}`}
          branchId={branch.id}
          initialSnapshot={lpgRes.ok ? lpgRes.value : null}
          initialError={lpgRes.ok ? null : lpgRes.message}
        />

        <BranchRecordsTable
          key={`records-${branch.id}`}
          branchId={branch.id}
          allowedScopes={["lpg", "machines"]}
          defaultScope="lpg"
          title="Recent records"
          showPrice={true}
          initialData={recordsRes.ok ? recordsRes.value : null}
          initialError={recordsRes.ok ? null : recordsRes.message}
        />
      </div>
    </BranchWorkspaceShell>
  );
}
