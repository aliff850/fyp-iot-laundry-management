"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import {
  removeOrganizationLogoAction,
  uploadOrganizationLogoAction,
  type OrganizationLogoState,
} from "@/app/account/actions";

export interface OrganizationLogoCardProps {
  organizationName: string;
  initialLogoUrl: string | null;
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
}: OrganizationLogoCardProps) {
  const initialState: OrganizationLogoState = { logoUrl: initialLogoUrl };
  const [uploadState, uploadAction, uploadPending] = useActionState(
    uploadOrganizationLogoAction,
    initialState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeOrganizationLogoAction,
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

  const feedback =
    clientError ??
    (uploadState.message || removeState.message || null);
  const feedbackIsError =
    Boolean(clientError) ||
    (Boolean(uploadState.message) && uploadState.success === false) ||
    (Boolean(removeState.message) && removeState.success === false);

  return (
    <section
      aria-labelledby="org-logo-heading"
      className="rounded-md border border-rule bg-surface p-4 sm:p-6"
    >
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
            <h2 id="org-logo-heading" className="text-base font-semibold text-ink">
              Public organization logo
            </h2>
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
              className="min-h-11 w-full rounded-md border border-control bg-canvas px-4 py-2 text-xs font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 sm:w-auto"
            >
              {removePending ? "Removing…" : "Remove logo"}
            </button>
          </form>
        )}
      </div>

      {feedback && (
        <p
          role={feedbackIsError ? "alert" : "status"}
          className={`mt-4 rounded-md border px-3.5 py-2.5 text-xs ${
            feedbackIsError
              ? "border-negative/40 bg-negative/10 text-negative"
              : "border-positive/40 bg-positive/10 text-positive"
          }`}
        >
          {feedback}
        </p>
      )}

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
                setClientError("Logo file must be 1 MB or smaller.");
              } else {
                setClientError(null);
              }
              setSelectedFileName(file.name);
            }}
            className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink file:mr-3 file:rounded file:border-0 file:bg-raised file:px-2.5 file:py-1.5 file:text-xs file:font-semibold file:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>

        <button
          type="submit"
          disabled={uploadPending || removePending || Boolean(clientError) || !selectedFileName}
          className="min-h-11 w-full whitespace-nowrap rounded-md border border-navy-selected bg-navy px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-navy-selected focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 sm:w-auto"
        >
          {uploadPending ? "Uploading…" : "Upload logo"}
        </button>
      </form>
    </section>
  );
}
