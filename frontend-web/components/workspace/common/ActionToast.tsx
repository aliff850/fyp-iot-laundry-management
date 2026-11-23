"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";

export type ActionToastKind = "info" | "success" | "error";

export interface ActionToastProps {
  kind: ActionToastKind;
  title: string;
  message: string;
  timestamp?: number;
  actionHref?: string;
  actionLabel?: string;
  floating?: boolean;
  onDismiss: () => void;
}

function formatSavedTime(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "";
  }
}

export function ActionToastCard({
  kind,
  title,
  message,
  timestamp,
  actionHref,
  actionLabel,
  onDismiss,
}: Omit<ActionToastProps, "floating">) {
  const isError = kind === "error";
  const isInfo = kind === "info";
  const borderClass = isError
    ? "border-negative/40 border-l-4 border-l-negative"
    : isInfo
      ? "border-warning/40 border-l-4 border-l-warning"
      : "border-positive/40 border-l-4 border-l-positive";
  const timeText = timestamp ? formatSavedTime(timestamp) : "";

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-md border ${borderClass} bg-surface p-3.5 text-ink shadow-2xl`}
    >
      <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-rule bg-raised">
        {isError ? (
          <AlertTriangle
            className="size-4 shrink-0 text-negative"
            aria-hidden="true"
          />
        ) : isInfo ? (
          <Loader2
            className="size-4 shrink-0 animate-spin text-warning motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : (
          <CheckCircle2
            className="size-4 shrink-0 text-positive"
            aria-hidden="true"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-ink">{title}</p>
        <p className="mt-0.5 break-words text-xs leading-relaxed text-muted">
          {message}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {timeText ? (
            <span
              className="text-xs tabular-nums text-faint"
              suppressHydrationWarning
            >
              {timeText}
            </span>
          ) : null}
          {actionHref && actionLabel ? (
            <Link
              href={actionHref}
              onClick={onDismiss}
              className="inline-flex min-h-11 items-center text-xs font-semibold text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent sm:min-h-0"
            >
              {actionLabel}
            </Link>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="inline-flex size-11 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ActionToast({
  floating = true,
  ...props
}: ActionToastProps) {
  if (!floating) {
    return <ActionToastCard {...props} />;
  }

  return (
    <div className="pointer-events-none fixed bottom-20 left-4 z-50 w-[calc(100vw-2rem)] max-w-sm md:bottom-5 md:left-5">
      <ActionToastCard {...props} />
    </div>
  );
}
