"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding } from "@/app/membership-status/actions";
import { Notice } from "@/components/auth/AuthForm";
import { primaryButton } from "@/lib/auth/styles";

export function OnboardingButton() {
  const router = useRouter();
  const [state, action, pending] = useActionState(async () => {
    const result = await completeOnboarding();
    // A timed-out write can commit before the response arrives. Read canonical state again.
    router.refresh();
    return result;
  }, {});
  return <div className="space-y-3">
    <form action={action}><button type="submit" disabled={pending} className={primaryButton}>{pending ? "Setting up…" : "Complete workspace setup"}</button></form>
    {state.message && <Notice kind={state.success ? "success" : "error"}>{state.message}</Notice>}
  </div>;
}
