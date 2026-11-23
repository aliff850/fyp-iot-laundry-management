"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import {
  removeOrganizationLogoAction,
  uploadOrganizationLogoAction,
  type OrganizationLogoState,
} from "@/app/account/actions";
import {
  useActionToast,
  withActionToast,
} from "@/components/workspace/common/ActionToastContext";

export interface OrganizationLogoCardProps {
  organizationName: string;
  initialLogoUrl: string | null;
  embedded?: boolean;
}

function initialsFromName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "SS";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export function OrganizationLogoCard({
  organizationName,
  initialLogoUrl,
  embedded = false,
}: OrganizationLogoCardProps) {
  const { notify } = useActionToast();
  const initialState: OrganizationLogoState = { logoUrl: initialLogoUrl };
  const [uploadState, uploadAction, uploadPending] = useActionState(
    withActionToast(notify, uploadOrganizationLogoAction, {
      id: "organization-logo-action",
      successTitle: "Organization logo updated",
      errorTitle: "Logo upload failed",
    }),
    initialState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    withActionToast(notify, removeOrganizationLogoAction, {
      id: "organization-logo-action",
      successTitle: "Organization logo removed",
      errorTitle: "Logo removal failed",
    }),
    initialState,
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const activeLogoUrl =
    removeState.success && removeState.logoUrl === null
      ? null
      : uploadState.logoUrl !== undefined
        ? uploadState.logoUrl
        : initialLogoUrl;

  const content = (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3.5">
          {activeLogoUrl ? (
            <Image
              src={activeLogoUrl}
              alt={`${organizationName} public logo`}
              width={56}
              height={56}
              unoptimized
              className="size-14 shrink-0 rounded-md border border-rule bg-canvas object-cover"
            />
          ) : (
            <div
              aria-label={`${organizationName} initials fallback`}
              className="flex size-14 shrink-0 items-center justify-center rounded-md border border-rule bg-raised text-base font-bold text-ink"
            >
              {initialsFromName(organizationName)}
            </div>
          )}

          <div className="min-w-0">
            <h3 id="org-logo-heading" className="text-sm font-semibold text-ink">
              Public organization logo
            </h3>
            <p className="mt-0.5 text-xs text-muted">
              PNG, JPEG, or WebP up to 1 MB for customer map markers
            </p>
          </div>
        </div>

        {activeLogoUrl && (
          <form action={removeAction}>
            <button
              type="submit"
              disabled={uploadPending || removePending}
              className="min-h-11 w-full rounded-md border border-control bg-canvas px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:opacity-50 sm:w-auto"
            >
              {removePending ? "Removing…" : "Remove logo"}
            </button>
          </form>
        )}
      </div>

      <form
        action={uploadAction}
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <label className="block min-w-0 flex-1">
          <span className="sr-only">Choose organization logo file</span>
          <input
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) {
                setSelectedFileName(null);
                setClientError(null);
                return;
              }
              if (file.size > 1_048_576) {
                const msg = "Logo file must be 1 MB or smaller.";
                setClientError(msg);
                notify({
                  id: "organization-logo-action",
                  kind: "error",
                  title: "Logo file too large",
                  message: msg,
                });
              } else {
                setClientError(null);
              }
              setSelectedFileName(file.name);
            }}
            className="min-h-11 w-full min-w-0 rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink file:mr-3 file:rounded file:border-0 file:bg-raised file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          />
        </label>

        <button
          type="submit"
          disabled={uploadPending || removePending || Boolean(clientError) || !selectedFileName}
          className="min-h-11 w-full whitespace-nowrap rounded-md border border-control bg-navy px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:opacity-50 sm:w-auto"
        >
          {uploadPending ? "Uploading…" : "Upload logo"}
        </button>
      </form>
    </>
  );

  if (embedded) {
    return (
      <div aria-labelledby="org-logo-heading" className="border-t border-rule pt-6">
        {content}
      </div>
    );
  }

  return (
    <section
      aria-labelledby="org-logo-heading"
      className="rounded-md border border-rule bg-surface p-4 sm:p-6"
    >
      {content}
    </section>
  );
}
