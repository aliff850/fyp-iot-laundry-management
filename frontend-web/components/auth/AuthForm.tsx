"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn, signUp, resendConfirmation } from "@/app/auth/actions";
import type { AuthFormState } from "@/lib/auth/validation";
import type { OrganizationDirectory } from "@/lib/auth/organizations";
import { inputClass, primaryButton, textLink } from "@/lib/auth/styles";

export function Notice({ children, kind = "error" }: { children: React.ReactNode; kind?: "error" | "success" | "info" }) {
  const styles = {
    error: "rounded-md border border-negative bg-raised p-4 text-sm leading-relaxed text-negative",
    success: "rounded-md border border-positive bg-raised p-4 text-sm leading-relaxed text-positive",
    info: "rounded-md border border-line bg-raised p-4 text-sm leading-relaxed text-muted",
  };
  return <div role={kind === "error" ? "alert" : "status"} className={styles[kind]}>{children}</div>;
}

function Field({ name, label, error, type = "text", autoComplete, help, maxLength = 128 }: {
  name: string; label: string; error?: string; type?: string; autoComplete?: string; help?: string; maxLength?: number;
}) {
  const [value, setValue] = useState("");
  const description = [help ? `${name}-help` : "", error ? `${name}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-2">
      <label htmlFor={name} className="text-sm font-medium">{label}</label>
      <input id={name} name={name} type={type} autoComplete={autoComplete} required maxLength={maxLength} value={value} onChange={event => setValue(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={description} className={inputClass} />
      {help && <p id={`${name}-help`} className="text-xs leading-relaxed text-faint">{help}</p>}
      {error && <p id={`${name}-error`} className="text-sm text-negative">{error}</p>}
    </div>
  );
}

export function RefreshButton({ children = "Try again" }: { children?: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button type="button" className={textLink} disabled={pending} aria-busy={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "Refreshing…" : children}</button>;
}

export function AuthForm({ mode, configured, next, directory }: {
  mode: "login" | "owner" | "personnel" | "resend";
  configured: boolean;
  next?: string | null;
  directory?: OrganizationDirectory;
}) {
  const action = mode === "login" ? signIn : mode === "resend" ? resendConfirmation : signUp;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(action, {});
  const [organizationId, setOrganizationId] = useState("");
  const registration = mode === "owner" || mode === "personnel";
  const organizations = directory?.organizations ?? [];
  const directoryUnavailable = mode === "personnel" && (directory?.status !== "ready" || !organizations.length);
  const errors = state.fieldErrors ?? {};
  const labels = { login: "Log in", owner: "Create account", personnel: "Create account", resend: "Resend confirmation" };
  const pendingLabels = { login: "Logging in…", owner: "Creating account…", personnel: "Creating account…", resend: "Requesting email…" };

  return (
    <div className="space-y-5">
      {!configured && <Notice kind="info">Authentication is temporarily unavailable. Please try again later.</Notice>}
      {directoryUnavailable && <Notice kind="info">{directory?.status === "ready" ? "No organizations are available to join right now." : "The organization directory is unavailable right now."} You can complete registration when organization selection is available.<div className="mt-2"><RefreshButton>Refresh organizations</RefreshButton></div></Notice>}
      <form action={formAction} noValidate aria-busy={pending} className="space-y-5">
        {state.message && <Notice kind={state.status === "success" ? "success" : "error"}>{state.message}</Notice>}
        {registration && <input type="hidden" name="kind" value={mode} />}
        {mode === "login" && next && <input type="hidden" name="next" value={next} />}
        <fieldset disabled={pending} className="grid min-w-0 gap-5">
          <legend className="sr-only">{registration ? "Registration details" : mode === "resend" ? "Confirmation email" : "Login details"}</legend>
          {registration && <Field name="name" label="Full name" autoComplete="name" maxLength={100} error={errors.name} />}
          <Field name="email" label="Email address" type="email" autoComplete="email" maxLength={254} error={errors.email} />
          {registration && <Field name="phone" label="Phone number" type="tel" autoComplete="tel" maxLength={32} error={errors.phone} />}
          {mode === "owner" && <Field name="organizationName" label="Organization name" autoComplete="organization" maxLength={120} error={errors.organizationName} />}
          {mode === "personnel" && <div className="grid gap-2">
            <label htmlFor="organizationId" className="text-sm font-medium">Organization</label>
            <select id="organizationId" name="organizationId" required value={organizationId} onChange={event => setOrganizationId(event.target.value)} disabled={directoryUnavailable} className={inputClass} aria-invalid={Boolean(errors.organizationId)} aria-describedby={errors.organizationId ? "organization-help organization-error" : "organization-help"}>
              <option value="">Select your organization</option>
              {organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
            <p id="organization-help" className="text-xs leading-relaxed text-faint">Your organization owner assigns your role and branches after email confirmation.</p>
            {errors.organizationId && <p id="organization-error" role="alert" className="text-sm text-negative">{errors.organizationId}</p>}
          </div>}
          {mode !== "resend" && <Field name="password" label="Password" type="password" autoComplete={registration ? "new-password" : "current-password"} help={registration ? "Use 8–128 characters. Additional password requirements may apply." : undefined} error={errors.password} />}
          {registration && <Field name="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" error={errors.confirmPassword} />}
          <button type="submit" disabled={!configured || directoryUnavailable || pending} className={`${primaryButton} w-full`}>{pending ? pendingLabels[mode] : labels[mode]}</button>
        </fieldset>
      </form>
      {registration && <p className="text-xs leading-relaxed text-faint">We’ll ask you to confirm your email. Creating an account does not grant access to an organization.</p>}
      {mode === "login" && <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1"><Link href="/register" className={textLink}>Create an account</Link><Link href="/check-email" className={textLink}>Confirm your email</Link></div>}
      {registration && <p className="text-sm text-muted">Already have an account? <Link href="/login" className={textLink}>Log in</Link></p>}
    </div>
  );
}
