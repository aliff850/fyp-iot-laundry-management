"use client";

import { useActionState } from "react";
import { signOut } from "@/app/auth/actions";
import { Notice } from "@/components/auth/AuthForm";
import { secondaryButton } from "@/lib/auth/styles";
import type { AuthFormState } from "@/lib/auth/validation";

export function SignOutButton() {
  const [state, action, pending] = useActionState<AuthFormState>(signOut, {});
  return <form action={action} aria-busy={pending} className="space-y-4">
    {state.message && <Notice>{state.message}</Notice>}
    <button type="submit" disabled={pending} className={`${secondaryButton} w-full`}>{pending ? "Signing out…" : "Sign out"}</button>
  </form>;
}
