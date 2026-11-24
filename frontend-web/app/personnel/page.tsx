import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Notice } from "@/components/auth/AuthForm";
import { DecisionForm } from "@/components/auth/DecisionForm";
import { OrganizationLogoCard } from "@/components/workspace/account/OrganizationLogoCard";
import { WorkspaceShell } from "@/components/workspace/layout/WorkspaceShell";
import { OrganizationSettingsForm } from "@/components/workspace/personnel/OrganizationSettingsForm";
import { PersonnelDirectoryTable } from "@/components/workspace/personnel/PersonnelDirectoryTable";
import {
  getBranchDirectory,
  getJoinRequests,
  getMembership,
  getOrganizationPersonnel,
} from "@/lib/auth/business";

export const metadata: Metadata = { title: "Organization" };
export const dynamic = "force-dynamic";

export default async function PersonnelPage() {
  const [current, requestsResult, personnelResult, branchDirectoryResult] = await Promise.all([
    getMembership("/me"),
    getJoinRequests(),
    getOrganizationPersonnel(),
    getBranchDirectory(),
  ]);

  if (!current.ok && current.status === 401) redirect("/login?next=%2Fpersonnel");
  if (!current.ok) {
    return (
      <WorkspaceShell title="Organization">
        <Notice>{current.message}</Notice>
      </WorkspaceShell>
    );
  }

  const owner = current.value.state === "active" && current.value.role === "owner";
  if (!owner) redirect("/membership-status");

  const orgName = current.value.organization?.name ?? "Your Organization";
  const orgTimezone = current.value.organization?.business_timezone ?? "Asia/Kuala_Lumpur";
  const orgLogoUrl = current.value.organization?.logo_url ?? null;
  const requests = requestsResult.ok ? requestsResult.value : [];
  const personnel = personnelResult.ok ? personnelResult.value : [];
  const branches = branchDirectoryResult.ok ? branchDirectoryResult.value.branches : [];

  const pendingRequests = requests.filter(
    (r) => r.state === "pending" || r.state === "approval_pending",
  );
  const resolvedRequests = requests.filter(
    (r) => r.state === "approved" || r.state === "rejected",
  );

  return (
    <WorkspaceShell
      title="Organization"
      organization={orgName}
      owner={owner}
      notificationsEnabled
      userRole={current.value.role}
    >
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            Organization &amp; Personnel
          </h1>
        </div>

        {/* Section 1: Organization Details & Permissions */}
        <section
          className="rounded-md border border-line bg-surface p-5 md:p-6"
          aria-labelledby="org-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
            <h2 id="org-heading" className="text-base font-semibold text-ink">
              Organization &amp; Permissions
            </h2>
          </div>

          <div className="mt-4 space-y-6">
            <OrganizationSettingsForm
              initialName={orgName}
              initialTimezone={orgTimezone}
              roleLabel="Owner"
              accessScope="All branches, personnel, and settings"
            />

            <OrganizationLogoCard
              organizationName={orgName}
              initialLogoUrl={orgLogoUrl}
              embedded
            />
          </div>
        </section>

        {!requestsResult.ok && <Notice>{requestsResult.message}</Notice>}
        {!personnelResult.ok && <Notice>{personnelResult.message}</Notice>}
        {!branchDirectoryResult.ok && <Notice>{branchDirectoryResult.message}</Notice>}

        {/* Section 2: Pending Join Requests */}
        <section
          className="rounded-md border border-line bg-surface p-5 md:p-6"
          aria-labelledby="requests-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
            <h2 id="requests-heading" className="text-base font-semibold text-ink">
              Pending Join Requests
            </h2>
          </div>

          {pendingRequests.length === 0 ? (
            <p className="mt-4 text-xs text-faint">
              No pending join requests.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {pendingRequests.map((request) => (
                <div
                  key={request.id}
                  className="flex flex-col justify-between rounded-md border border-line bg-raised/40 p-4 transition-colors hover:bg-raised/60"
                >
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink">{request.full_name}</h3>
                      <span className="rounded border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                        {request.state === "approval_pending"
                          ? "Approval pending"
                          : "Pending review"}
                      </span>
                    </div>
                    <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-muted">Phone</dt>
                        <dd className="text-ink tabular-nums">{request.phone}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Requested</dt>
                        <dd className="text-ink tabular-nums">
                          {new Date(request.requested_at).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <DecisionForm
                    requestId={request.id}
                    retryRole={
                      request.state === "approval_pending" ? request.decision_role : null
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Section 3: Approved Organization Personnel Directory */}
        <section
          className="rounded-md border border-line bg-surface p-5 md:p-6"
          aria-labelledby="personnel-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
            <h2 id="personnel-heading" className="text-base font-semibold text-ink">
              Approved Personnel Directory
            </h2>
          </div>

          <PersonnelDirectoryTable
            variant="organization"
            personnel={personnel}
            branches={branches}
            canManage={owner}
          />
        </section>

        {/* Section 4: Decision History */}
        {resolvedRequests.length > 0 && (
          <section
            className="rounded-md border border-line bg-surface p-5 md:p-6"
            aria-labelledby="history-heading"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
              <h2 id="history-heading" className="text-base font-semibold text-ink">
                Decision History
              </h2>
            </div>

            <div className="mt-4 divide-y divide-rule text-xs">
              {resolvedRequests.map((req) => (
                <div
                  key={req.id}
                  className="grid grid-cols-1 gap-2 py-3 first:pt-1 last:pb-1 sm:grid-cols-3 sm:items-center"
                >
                  <span className="font-semibold text-ink">{req.full_name}</span>
                  <span className="text-muted tabular-nums">{req.phone}</span>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {req.state === "approved" ? (
                      <span className="rounded border border-positive/30 bg-positive/10 px-2 py-0.5 text-xs font-medium text-positive">
                        Approved
                      </span>
                    ) : (
                      <span className="rounded border border-negative/30 bg-negative/10 px-2 py-0.5 text-xs font-medium text-negative">
                        Rejected
                      </span>
                    )}
                    {req.decision_role && (
                      <span className="text-muted">
                        {req.decision_role.replaceAll("_", " ")}
                      </span>
                    )}
                    <span className="text-faint tabular-nums">
                      {new Date(req.requested_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </WorkspaceShell>
  );
}
