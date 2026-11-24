import React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock } from "lucide-react";
import type { BranchOverviewIncident } from "@/lib/auth/business";

export interface ActiveIncidentsBannerProps {
  branchId: string;
  incidents: BranchOverviewIncident[];
}

function formatIncidentTimestamp(iso: string): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function severityPill(severity: BranchOverviewIncident["severity"]): {
  label: string;
  className: string;
} {
  if (severity === "critical") {
    return {
      label: "Critical",
      className: "border-negative/40 bg-negative/15 text-negative",
    };
  }
  if (severity === "warning") {
    return {
      label: "Warning",
      className: "border-warning/40 bg-warning/15 text-warning",
    };
  }
  return {
    label: "Notice",
    className: "border-accent/40 bg-accent/15 text-accent",
  };
}

function formatWorkflowLabel(state?: string): string | null {
  if (!state) return null;
  if (state === "open") return "Open";
  if (state === "acknowledged") return "Acknowledged";
  if (state === "in_progress") return "In Progress";
  if (state === "escalated") return "Escalated";
  return state.replace(/_/g, " ");
}

function formatDomainLabel(domain?: string | null): string | null {
  if (domain === "lpg") return "LPG & Safety";
  if (domain === "machine") return "Machine";
  return null;
}

/**
 * Full-width active incident banner displayed at the top of the Branch Overview workspace.
 */
export function ActiveIncidentsBanner({
  branchId,
  incidents,
}: ActiveIncidentsBannerProps) {
  if (incidents.length === 0) return null;

  return (
    <section
      className="w-full rounded-md border border-negative/40 bg-negative/10 p-4 sm:p-5"
      role="alert"
      aria-label="Active branch incidents"
    >
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="size-5 shrink-0 text-negative" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ink sm:text-base">
          {incidents.length}{" "}
          {incidents.length === 1 ? "Active Incident" : "Active Incidents"} Requiring Attention
        </h2>
      </div>

      <div className="mt-3.5 flex w-full flex-col gap-3">
        {incidents.map((inc) => {
          const sev = severityPill(inc.severity);
          const workflowLabel = formatWorkflowLabel(inc.workflow_state);
          const domainLabel = formatDomainLabel(inc.domain);

          return (
            <article
              key={inc.id}
              className="w-full rounded-md border border-negative/35 bg-surface p-4 transition-colors hover:border-control sm:p-5"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${sev.className}`}
                    >
                      {sev.label}
                    </span>

                    {workflowLabel && (
                      <span className="inline-flex items-center rounded border border-line bg-raised px-2 py-0.5 text-[11px] font-medium text-ink">
                        {workflowLabel}
                      </span>
                    )}

                    {domainLabel && (
                      <span className="inline-flex items-center rounded border border-rule bg-raised/50 px-2 py-0.5 text-[11px] font-medium text-muted">
                        {domainLabel}
                      </span>
                    )}

                    {inc.reference_code && (
                      <span className="inline-flex items-center rounded border border-rule bg-canvas px-2 py-0.5 font-mono text-[11px] font-medium text-muted tabular-nums">
                        {inc.reference_code}
                      </span>
                    )}
                  </div>

                  <h3 className="text-sm font-semibold text-ink sm:text-base">
                    {inc.title}
                  </h3>

                  <p className="text-xs leading-relaxed text-muted sm:text-sm">
                    {inc.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-faint tabular-nums">
                    <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                    <span>{`Opened: ${formatIncidentTimestamp(inc.created_at)}`}</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center">
                  <Link
                    href={`/branches/${branchId}/incidents/${inc.id}`}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-4 py-2 text-xs font-semibold text-ink transition-colors hover:border-accent/60 hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
                  >
                    <span>Inspect Incident</span>
                    <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
