"use client";

import { useActionState } from "react";
import { Check, X } from "lucide-react";
import { decideJoinRequest } from "@/app/membership-status/actions";
import { Notice } from "@/components/auth/AuthForm";
import { inputClass } from "@/lib/auth/styles";

export function DecisionForm({
  requestId,
}: {
  requestId: string;
  retryRole?: string | null;
}) {
  const [state, action, pending] = useActionState(decideJoinRequest, {});

  const approveButtonClass =
    "inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-ink bg-ink px-4 py-2 text-xs font-semibold text-surface transition-colors duration-150 enabled:hover:border-muted enabled:hover:bg-muted motion-safe:enabled:active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted motion-reduce:transition-none";

  const rejectButtonClass =
    "inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-control bg-surface px-3 py-2 text-xs font-medium text-muted transition-colors duration-150 enabled:hover:border-negative enabled:hover:bg-negative/15 enabled:hover:text-negative focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted motion-reduce:transition-none";

  return (
    <form action={action} className="mt-3 flex flex-wrap items-center gap-2.5" aria-busy={pending}>
      <input type="hidden" name="requestId" value={requestId} />

      <button
        type="submit"
        name="decision"
        value="approve"
        disabled={pending}
        className={approveButtonClass}
      >
        <Check className="size-3.5" aria-hidden="true" />
        {pending ? "Approving…" : "Approve"}
      </button>

      <button
        type="submit"
        name="decision"
        value="reject"
        disabled={pending}
        className={rejectButtonClass}
      >
        <X className="size-3.5" aria-hidden="true" />
        {pending ? "Rejecting…" : "Reject"}
      </button>

      {state.message && (
        <div className="w-full mt-2">
          <Notice kind={state.success ? "success" : "error"}>{state.message}</Notice>
        </div>
      )}
    </form>
  );
}
