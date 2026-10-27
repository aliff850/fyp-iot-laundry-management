import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { Notice } from "@/components/auth/AuthForm";
import { DecisionForm } from "@/components/auth/DecisionForm";
import { getJoinRequests, getMembership } from "@/lib/auth/business";
import { textLink } from "@/lib/auth/styles";

export const metadata: Metadata = { title: "Personnel requests" };
export const dynamic = "force-dynamic";

export default async function PersonnelPage() {
  const current = await getMembership("/me");
  if (!current.ok && current.status === 401) redirect("/login");
  if (!current.ok) return <AuthShell title="Personnel requests" description="Owner approvals"><Notice>{current.message}</Notice></AuthShell>;
  if (current.value.state !== "active" || current.value.role !== "owner") redirect("/membership-status");
  const result = await getJoinRequests();
  return <AuthShell title="Personnel requests" description={`Review requests for ${current.value.organization?.name ?? "your organization"}. Approved personnel have no branch access yet.`} backHref="/branches" backLabel="Back to Branches">
    <div className="space-y-5">
      {!result.ok && <Notice>{result.message}</Notice>}
      {result.ok && !result.value.length && <Notice kind="info">No join requests yet.</Notice>}
      {result.ok && result.value.map(request => <section key={request.id} className="rounded-md border border-line bg-raised p-4">
        <h2 className="text-base font-semibold">{request.full_name}</h2>
        <p className="mt-1 text-xs text-muted">{request.phone} · {request.state.replaceAll("_", " ")}</p>
        {request.state === "pending" || request.state === "approval_pending" ? <DecisionForm requestId={request.id} retryRole={request.state === "approval_pending" ? request.decision_role : null} /> : <p className="mt-2 text-sm text-muted">Decision recorded{request.decision_role ? ` · ${request.decision_role.replaceAll("_", " ")}` : ""}.</p>}
      </section>)}
      <Link href="/branches" className={textLink}>Back to Branches</Link>
    </div>
  </AuthShell>;
}
