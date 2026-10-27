"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/auth/config";
import { activeDestination, workspaceDestination } from "@/lib/auth/redirects";
import { getMembership } from "@/lib/auth/business";
import { getPublicOrganizations } from "@/lib/auth/organizations";
import { validateLogin, validateRegistration, type AuthFormState } from "@/lib/auth/validation";

function failure(error?: { code?: string } | null): AuthFormState {
  const messages: Record<string, string> = {
    invalid_credentials: "The email or password is incorrect. Please try again.",
    email_not_confirmed: "Confirm your email before logging in. You can request another confirmation email.",
    over_email_send_rate_limit: "Too many email requests. Wait a little before trying again.",
    over_request_rate_limit: "Too many attempts. Wait a little before trying again.",
    weak_password: "Choose a stronger password and try again.",
    signup_disabled: "Registration is currently unavailable. Please try again later.",
  };
  return { status: "error", message: messages[error?.code ?? ""] ?? "We couldn't reach the authentication service or complete this request. Please try again." };
}

export async function signIn(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const input = validateLogin(form);
  if (!input.ok) return { status: "error", message: "Check the highlighted fields.", fieldErrors: input.errors };
  try {
    const client = await createClient(true);
    if (!client) return failure();
    const { error } = await client.auth.signInWithPassword(input.value);
    if (error) return failure(error);
    const { data, error: identityError } = await client.auth.getUser();
    if (identityError || !data.user?.email_confirmed_at) {
      await client.auth.signOut({ scope: "local" });
      return failure({ code: "email_not_confirmed" });
    }
  } catch {
    return failure();
  }
  let membership = await getMembership("/me");
  if (membership.ok && membership.value.state === "incomplete") {
    const completed = await getMembership("/onboarding", "POST");
    // A timed-out write may still have committed. The next read is authoritative.
    membership = completed.ok ? completed : await getMembership("/me");
  }
  if (membership.ok && membership.value.state === "active") {
    redirect(activeDestination(form.get("next"), membership.value.role));
  }
  redirect(workspaceDestination(form.get("next")));
}

export async function signUp(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const input = validateRegistration(form, form.get("kind"));
  if (!input.ok) return { status: "error", message: "Check the highlighted fields.", fieldErrors: input.errors };
  const site = getSiteUrl();
  if (!site) return failure();
  const intent = input.value.metadata.onboarding_intent;
  if (intent.kind === "personnel") {
    const directory = await getPublicOrganizations();
    if (directory.status !== "ready" || !directory.organizations.some(org => org.id === intent.organization_id)) {
      return { status: "error", message: "Organization selection is unavailable. Please try again later.", fieldErrors: { organizationId: "Select an organization from the current directory." } };
    }
  }
  try {
    const client = await createClient(true);
    if (!client) return failure();
    const { data, error } = await client.auth.signUp({
      email: input.value.email, password: input.value.password,
      options: { emailRedirectTo: `${site}/auth/confirm`, data: input.value.metadata },
    });
    if (error) return failure(error);
    if (data.session) {
      await client.auth.signOut({ scope: "local" });
      return { status: "error", message: "Registration requires email confirmation. Please contact your administrator before continuing." };
    }
  } catch {
    return failure();
  }
  redirect("/check-email");
}

export async function resendConfirmation(_state: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = form.get("email");
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.length > 254) return { status: "error", fieldErrors: { email: "Enter the email address you registered with." } };
  const site = getSiteUrl();
  if (!site) return failure();
  try {
    const client = await createClient(true);
    if (!client) return failure();
    const { error } = await client.auth.resend({ type: "signup", email: email.trim(), options: { emailRedirectTo: `${site}/auth/confirm` } });
    if (error) return failure(error);
    return { status: "success", message: "If this address needs confirmation, a new email has been requested. Check your inbox and spam folder." };
  } catch {
    return failure();
  }
}

export async function signOut(): Promise<AuthFormState> {
  try {
    const client = await createClient(true);
    if (!client) return failure();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) return failure(error);
  } catch {
    return failure();
  }
  redirect("/login");
}
