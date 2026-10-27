"use client";

import { useActionState } from "react";
import { decideJoinRequest } from "@/app/membership-status/actions";
import { Notice } from "@/components/auth/AuthForm";
import { inputClass, primaryButton, secondaryButton } from "@/lib/auth/styles";

export function DecisionForm({ requestId, retryRole }: { requestId: string; retryRole?: string | null }) {
  const [state, action, pending] = useActionState(decideJoinRequest, {});
  return <form action={action} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
    <input type="hidden" name="requestId" value={requestId} />
    <label className="grid gap-1 text-sm">Role
      {retryRole && <input type="hidden" name="role" value={retryRole} />}
      <select name={retryRole ? undefined : "role"} defaultValue={retryRole ?? "branch_manager"} className={inputClass} disabled={pending || Boolean(retryRole)}>
        <option value="branch_manager">Branch manager</option>
        <option value="machine_maintenance">Machine maintenance</option>
        <option value="lpg_maintenance">LPG maintenance</option>
      </select>
    </label>
    <button name="decision" value="approve" disabled={pending} className={primaryButton}>Approve</button>
    {!retryRole && <button name="decision" value="reject" disabled={pending} className={secondaryButton}>Reject</button>}
    {state.message && <div className="sm:col-span-3"><Notice kind={state.success ? "success" : "error"}>{state.message}</Notice></div>}
  </form>;
}
