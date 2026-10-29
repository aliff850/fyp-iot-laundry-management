import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Notice } from "@/components/auth/AuthForm";
import { DecisionForm } from "@/components/auth/DecisionForm";
import { PersonnelDirectoryTable } from "@/components/workspace/personnel/PersonnelDirectoryTable";
import { WorkspaceShell } from "@/components/workspace/layout/WorkspaceShell";
import {
  getBranchDirectory,
  getJoinRequests,
  getMembership,
  getOrganizationPersonnel,
} from "@/lib/auth/business";

export const metadata: Metadata = { title: "Personnel" };
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
      <WorkspaceShell title="Personnel">
        <Notice>{current.message}</Notice>
      </WorkspaceShell>
    );
  }

  const owner = current.value.state === "active" && current.value.role === "owner";
  if (!owner) redirect("/membership-status");

  const orgName = current.value.organization?.name ?? "Your Organization";
  const requests = requestsResult.ok ? requestsResult.value : [];
  const personnel = personnelResult.ok ? personnelResult.value : [];
  const branches = branchDirectoryResult.ok ? branchDirectoryResult.value.branches : [];

  const pendingRequests = requests.filter(
    r => r.state === "pending" || r.state === "approval_pending"
  );
  const resolvedRequests = requests.filter(
    r => r.state === "approved" || r.state === "rejected"
  );

  return (
    <WorkspaceShell title="Personnel" organization={orgName} owner={owner}>
      <div className="space-y-8">
        {/* Heading & Subpage Action Row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs text-muted">Organization personnel</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{orgName}</h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Review applicant join requests, manage active personnel, and track operational role assignments across your locations.
            </p>
          </div>
        </div>

        {/* Error notices if requests or personnel endpoints failed */}
        {!requestsResult.ok && <Notice>{requestsResult.message}</Notice>}
        {!personnelResult.ok && <Notice>{personnelResult.message}</Notice>}
        {!branchDirectoryResult.ok && <Notice>{branchDirectoryResult.message}</Notice>}
        {/* Removed the goddamn statistics */}
        {/* Section 1: Pending Join Requests */}
        <section
          className="rounded-md border border-line bg-surface p-5 md:p-6"
          aria-labelledby="requests-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
            <div>
              <h2 id="requests-heading" className="text-base font-semibold text-ink">
                Pending Join Requests
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {pendingRequests.length > 0
                  ? `${pendingRequests.length} pending ${pendingRequests.length === 1 ? "request" : "requests"
                  } awaiting role approval`
                  : "No pending requests awaiting approval"}
              </p>
            </div>
            {pendingRequests.length > 0 && (
              <span className="rounded-full border border-warning/30 bg-warning/10 px-2.5 py-0.5 text-xs font-medium text-warning">
                Action required
              </span>
            )}
          </div>

          {pendingRequests.length === 0 ? (
            <p className="mt-4 text-xs text-faint">
              All join requests have been processed. When prospective team members apply, their applications will appear here for review and role assignment.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {pendingRequests.map(request => (
                <div
                  key={request.id}
                  className="flex flex-col justify-between rounded-md border border-line bg-raised/40 p-4 transition-colors hover:bg-raised/60"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold text-ink">{request.full_name}</h3>
                      <span className="rounded border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                        {request.state === "approval_pending"
                          ? "Approval pending"
                          : "Pending review"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Phone: <span className="text-ink">{request.phone}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-faint">
                      Requested:{" "}
                      {new Date(request.requested_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
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

        {/* Section 2: Approved Organization Personnel Directory */}
        <section
          className="rounded-md border border-line bg-surface p-5 md:p-6"
          aria-labelledby="personnel-heading"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
            <div>
              <h2 id="personnel-heading" className="text-base font-semibold text-ink">
                Approved Personnel Directory
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {personnel.length} approved team {personnel.length === 1 ? "member" : "members"} in {orgName}
              </p>
            </div>
          </div>

          <PersonnelDirectoryTable
            variant="organization"
            personnel={personnel}
            branches={branches}
            canManage={owner}
          />
        </section>

        {/* Section 3: Decision History */}
        {resolvedRequests.length > 0 && (
          <section
            className="rounded-md border border-line bg-surface p-5 md:p-6"
            aria-labelledby="history-heading"
          >
            <div className="flex items-center justify-between border-b border-rule pb-3">
              <div>
                <h2 id="history-heading" className="text-sm font-semibold text-ink">
                  Decision History
                </h2>
                <p className="mt-0.5 text-xs text-muted">
                  {resolvedRequests.length} previously recorded join request decisions
                </p>
              </div>
            </div>

            <div className="mt-3 divide-y divide-rule text-xs">
              {resolvedRequests.map(req => (
                <div
                  key={req.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-1 last:pb-1"
                >
                  <div>
                    <span className="font-semibold text-ink">{req.full_name}</span>
                    <span className="ml-2 text-faint">· {req.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {req.state === "approved" ? (
                      <span className="rounded border border-positive/30 bg-positive/10 px-2 py-0.5 text-xs font-medium text-positive">
                        Approved · {req.decision_role?.replaceAll("_", " ")}
                      </span>
                    ) : (
                      <span className="rounded border border-negative/30 bg-negative/10 px-2 py-0.5 text-xs font-medium text-negative">
                        Rejected
                      </span>
                    )}
                    <span className="text-faint">
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
