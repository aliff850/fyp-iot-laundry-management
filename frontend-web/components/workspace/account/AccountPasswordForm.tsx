"use client";

import { useActionState, useState } from "react";
import {
  updateAccountPasswordAction,
  type AccountPasswordActionState,
} from "@/app/account/actions";
import {
  useActionToast,
  withActionToast,
} from "@/components/workspace/common/ActionToastContext";

const inputClass =
  "min-h-11 w-full min-w-0 rounded-md border border-control bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint transition-colors duration-150 enabled:hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted aria-invalid:border-negative motion-reduce:transition-none";

const secondaryButtonClass =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-4 py-2 text-sm font-medium text-ink transition-colors duration-150 enabled:hover:bg-navy-hover enabled:active:bg-navy-selected focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted motion-reduce:transition-none sm:w-auto";

const initialState: AccountPasswordActionState = {};

export function AccountPasswordForm() {
  const { notify } = useActionToast();
  const [state, action, pending] = useActionState(
    withActionToast(notify, updateAccountPasswordAction, {
      id: "account-password-save",
      successTitle: "Password updated",
      errorTitle: "Password update failed",
    }),
    initialState,
  );
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [lastClearedAt, setLastClearedAt] = useState<number | undefined>(undefined);

  if (state.success && state.savedAt && state.savedAt !== lastClearedAt) {
    setLastClearedAt(state.savedAt);
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <section
      aria-labelledby="password-heading"
      className="rounded-md border border-line bg-surface p-5 md:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-3">
        <h2 id="password-heading" className="text-base font-semibold text-ink">
          Password
        </h2>
      </div>

      <form action={action} className="mt-4 space-y-5">
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <label htmlFor="account-new-password" className="text-sm font-medium text-ink">
              New password
            </label>
            <input
              id="account-new-password"
              name="new_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              aria-invalid={Boolean(state.fieldErrors?.new_password)}
              aria-describedby={
                state.fieldErrors?.new_password
                  ? "account-new-password-error"
                  : "account-new-password-hint"
              }
              className={inputClass}
            />
            <p id="account-new-password-hint" className="text-xs text-faint">
              Use 8–128 characters.
            </p>
            {state.fieldErrors?.new_password && (
              <p id="account-new-password-error" className="text-sm text-negative">
                {state.fieldErrors.new_password}
              </p>
            )}
          </div>

          <div className="grid content-start gap-2">
            <label htmlFor="account-confirm-password" className="text-sm font-medium text-ink">
              Confirm password
            </label>
            <input
              id="account-confirm-password"
              name="confirm_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              aria-invalid={Boolean(state.fieldErrors?.confirm_password)}
              aria-describedby={
                state.fieldErrors?.confirm_password
                  ? "account-confirm-password-error"
                  : undefined
              }
              className={inputClass}
            />
            {state.fieldErrors?.confirm_password && (
              <p id="account-confirm-password-error" className="text-sm text-negative">
                {state.fieldErrors.confirm_password}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="submit" disabled={pending} aria-busy={pending} className={secondaryButtonClass}>
            {pending ? "Updating password…" : "Update password"}
          </button>
        </div>
      </form>
    </section>
  );
}
