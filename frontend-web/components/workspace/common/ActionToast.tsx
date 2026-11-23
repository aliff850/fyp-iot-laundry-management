"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";

export interface ActionToastProps {
  kind: "success" | "error";
  title: string;
  message: string;
  timestamp?: number;
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

export function ActionToast({
  kind,
  title,
  message,
  timestamp,
  onDismiss,
}: ActionToastProps) {
  const isError = kind === "error";
  const borderClass = isError ? "border-negative" : "border-positive";
  const timeText = timestamp ? formatSavedTime(timestamp) : "";

  return (
    <div
      aria-live={isError ? "assertive" : "polite"}
      className="pointer-events-none fixed bottom-20 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm md:bottom-4"
    >
      <div
        role={isError ? "alert" : "status"}
        className={`pointer-events-auto flex w-full items-start gap-3 rounded-md border ${borderClass} bg-surface p-3.5 text-ink shadow-xl`}
      >
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-rule bg-raised/60">
          {isError ? (
            <AlertTriangle className="size-4 shrink-0 text-negative" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-4 shrink-0 text-positive" aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-ink">{title}</p>
          <p className="mt-0.5 break-words text-xs text-muted">{message}</p>
          {timeText ? (
            <p className="mt-1 text-xs tabular-nums text-faint">{timeText}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
