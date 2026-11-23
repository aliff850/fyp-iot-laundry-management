"use client";

import { useActionState } from "react";
import { Calendar, Mail, ShieldCheck } from "lucide-react";
import {
  updateAccountProfileAction,
  type AccountProfileActionState,
} from "@/app/account/actions";

export interface AccountProfileFormProps {
  initialFullName: string;
  initialPhone: string;
  email: string;
  memberSince: string;
}

const inputClass =
  "min-h-11 w-full min-w-0 rounded-md border border-control bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint transition-colors duration-150 enabled:hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted aria-invalid:border-negative motion-reduce:transition-none";

const primaryButtonClass =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-ink bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors duration-150 enabled:hover:border-muted enabled:hover:bg-muted motion-safe:enabled:active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted motion-reduce:transition-none sm:w-auto";

export function AccountProfileForm({
  initialFullName,
  initialPhone,
  email,
  memberSince,
}: AccountProfileFormProps) {
  const initialState: AccountProfileActionState = {
    fullName: initialFullName,
    phone: initialPhone,
  };
  const [state, action, pending] = useActionState(
    updateAccountProfileAction,
    initialState,
  );

  const displayedName = state.fullName ?? initialFullName;
  const displayedPhone = state.phone ?? initialPhone;

  return (
    <section
      aria-labelledby="profile-heading"
      className="rounded-md border border-line bg-surface p-5 md:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
        <h2 id="profile-heading" className="text-base font-semibold text-ink">
          Profile Details
        </h2>
      </div>

      {state.message && (
        <p
          role={state.success ? "status" : "alert"}
          className={`mt-4 rounded-md border-l-2 bg-raised px-4 py-3 text-sm text-ink ${
            state.success ? "border-positive" : "border-negative"
          }`}
        >
          {state.message}
        </p>
      )}

      <form action={action} className="mt-4 space-y-5">
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <label htmlFor="account-full-name" className="text-sm font-medium text-ink">
              Full name
            </label>
            <input
              id="account-full-name"
              name="full_name"
              type="text"
              required
              minLength={2}
              maxLength={100}
              defaultValue={displayedName}
              aria-invalid={Boolean(state.fieldErrors?.full_name)}
              aria-describedby={
                state.fieldErrors?.full_name ? "account-full-name-error" : undefined
              }
              className={inputClass}
            />
            {state.fieldErrors?.full_name && (
              <p id="account-full-name-error" className="text-sm text-negative">
                {state.fieldErrors.full_name}
              </p>
            )}
          </div>

          <div className="grid content-start gap-2">
            <label htmlFor="account-phone" className="text-sm font-medium text-ink">
              Contact phone
            </label>
            <input
              id="account-phone"
              name="phone"
              type="tel"
              required
              minLength={7}
              maxLength={32}
              pattern="^[+()0-9 .-]{7,32}$"
              defaultValue={displayedPhone}
              aria-invalid={Boolean(state.fieldErrors?.phone)}
              aria-describedby={
                state.fieldErrors?.phone ? "account-phone-error" : undefined
              }
              className={inputClass}
            />
            {state.fieldErrors?.phone && (
              <p id="account-phone-error" className="text-sm text-negative">
                {state.fieldErrors.phone}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="submit" disabled={pending} aria-busy={pending} className={primaryButtonClass}>
            {pending ? "Saving profile…" : "Save profile"}
          </button>
        </div>
      </form>

      <dl className="mt-6 grid grid-cols-1 gap-3 border-t border-rule pt-5 sm:grid-cols-3">
        <div className="min-w-0 rounded-md border border-line bg-raised/40 p-4">
          <dt className="flex items-center gap-1.5 text-xs text-muted">
            <Mail className="size-3.5 text-faint" aria-hidden="true" />
            <span>Email address</span>
          </dt>
          <dd className="mt-1 truncate text-sm text-ink">{email}</dd>
        </div>

        <div className="min-w-0 rounded-md border border-line bg-raised/40 p-4">
          <dt className="flex items-center gap-1.5 text-xs text-muted">
            <Calendar className="size-3.5 text-faint" aria-hidden="true" />
            <span>Member since</span>
          </dt>
          <dd className="mt-1 text-sm tabular-nums text-ink">{memberSince}</dd>
        </div>

        <div className="min-w-0 rounded-md border border-line bg-raised/40 p-4">
          <dt className="flex items-center gap-1.5 text-xs text-muted">
            <ShieldCheck className="size-3.5 text-faint" aria-hidden="true" />
            <span>Account status</span>
          </dt>
          <dd className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-positive">
            <span className="size-2 rounded-full bg-positive" aria-hidden="true" />
            <span>Active</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
