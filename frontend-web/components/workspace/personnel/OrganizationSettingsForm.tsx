"use client";

import { useActionState } from "react";
import { Building2, Shield, ShieldCheck } from "lucide-react";
import {
  updateOrganizationSettingsAction,
  type OrganizationSettingsActionState,
} from "@/app/personnel/actions";
import {
  useActionToast,
  withActionToast,
} from "@/components/workspace/common/ActionToastContext";

const TIMEZONE_OPTIONS = [
  "Asia/Kuala_Lumpur",
  "Asia/Singapore",
  "Asia/Jakarta",
  "Asia/Bangkok",
  "Asia/Manila",
  "Asia/Tokyo",
  "UTC",
];

const inputClass =
  "min-h-11 w-full min-w-0 rounded-md border border-control bg-canvas px-3 py-2 text-sm text-ink placeholder:text-faint transition-colors duration-150 enabled:hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted aria-invalid:border-negative motion-reduce:transition-none";

const selectClass =
  "min-h-11 w-full min-w-0 rounded-md border border-control bg-canvas px-3 py-2 text-sm text-ink transition-colors duration-150 enabled:hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted aria-invalid:border-negative motion-reduce:transition-none";

const primaryButtonClass =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-ink bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors duration-150 enabled:hover:border-muted enabled:hover:bg-muted motion-safe:enabled:active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted motion-reduce:transition-none sm:w-auto";

export interface OrganizationSettingsFormProps {
  initialName: string;
  initialTimezone: string;
  roleLabel: string;
  accessScope: string;
}

export function OrganizationSettingsForm({
  initialName,
  initialTimezone,
  roleLabel,
  accessScope,
}: OrganizationSettingsFormProps) {
  const { notify } = useActionToast();
  const initialState: OrganizationSettingsActionState = {
    name: initialName,
    businessTimezone: initialTimezone,
  };
  const [state, action, pending] = useActionState(
    withActionToast(notify, updateOrganizationSettingsAction, {
      id: "organization-settings-save",
      successTitle: "Organization updated",
      errorTitle: "Organization update failed",
    }),
    initialState,
  );

  const displayedName = state.name ?? initialName;
  const displayedTimezone = state.businessTimezone ?? initialTimezone;
  const timezoneChoices = TIMEZONE_OPTIONS.includes(displayedTimezone)
    ? TIMEZONE_OPTIONS
    : [displayedTimezone, ...TIMEZONE_OPTIONS];

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <label htmlFor="org-settings-name" className="text-sm font-medium text-ink">
              Organization name
            </label>
            <input
              id="org-settings-name"
              name="name"
              type="text"
              required
              minLength={1}
              maxLength={120}
              defaultValue={displayedName}
              aria-invalid={Boolean(state.fieldErrors?.name)}
              aria-describedby={
                state.fieldErrors?.name ? "org-settings-name-error" : undefined
              }
              className={inputClass}
            />
            {state.fieldErrors?.name && (
              <p id="org-settings-name-error" className="text-sm text-negative">
                {state.fieldErrors.name}
              </p>
            )}
          </div>

          <div className="grid content-start gap-2">
            <label htmlFor="org-settings-timezone" className="text-sm font-medium text-ink">
              Business timezone
            </label>
            <select
              id="org-settings-timezone"
              name="business_timezone"
              defaultValue={displayedTimezone}
              aria-invalid={Boolean(state.fieldErrors?.business_timezone)}
              aria-describedby={
                state.fieldErrors?.business_timezone
                  ? "org-settings-timezone-error"
                  : undefined
              }
              className={selectClass}
            >
              {timezoneChoices.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            {state.fieldErrors?.business_timezone && (
              <p id="org-settings-timezone-error" className="text-sm text-negative">
                {state.fieldErrors.business_timezone}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="submit" disabled={pending} aria-busy={pending} className={primaryButtonClass}>
            {pending ? "Saving organization…" : "Save organization"}
          </button>
        </div>
      </form>

      <dl className="grid grid-cols-1 gap-3 border-t border-rule pt-5 sm:grid-cols-3">
        <div className="min-w-0 rounded-md border border-line bg-raised/40 p-4">
          <dt className="flex items-center gap-1.5 text-xs text-muted">
            <Shield className="size-3.5 text-faint" aria-hidden="true" />
            <span>Role</span>
          </dt>
          <dd className="mt-1 text-sm font-semibold text-ink">{roleLabel}</dd>
        </div>

        <div className="min-w-0 rounded-md border border-line bg-raised/40 p-4">
          <dt className="flex items-center gap-1.5 text-xs text-muted">
            <Building2 className="size-3.5 text-faint" aria-hidden="true" />
            <span>Organization status</span>
          </dt>
          <dd className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-positive">
            <span className="size-2 rounded-full bg-positive" aria-hidden="true" />
            <span>Active</span>
          </dd>
        </div>

        <div className="min-w-0 rounded-md border border-line bg-raised/40 p-4">
          <dt className="flex items-center gap-1.5 text-xs text-muted">
            <ShieldCheck className="size-3.5 text-faint" aria-hidden="true" />
            <span>Access scope</span>
          </dt>
          <dd className="mt-1 text-sm text-ink">{accessScope}</dd>
        </div>
      </dl>
    </div>
  );
}
