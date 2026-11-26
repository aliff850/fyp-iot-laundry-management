"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Clock,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Notice } from "@/components/auth/AuthForm";
import { fetchBranchIncidentsAction } from "@/app/branches/[branchId]/incidents/actions";
import type { IncidentSummary } from "@/lib/auth/business";
import { formatMytDateTime } from "@/lib/formatDate";

interface BranchIncidentsClientProps {
  branchId: string;
  userRole: "owner" | "branch_manager" | "machine_maintenance" | "lpg_maintenance";
  initialIncidents: IncidentSummary[];
  initialError?: string | null;
}

type StatusView = "active" | "resolved" | "all";
type DomainView = "all" | "machine" | "lpg";

function severityBadge(severity: IncidentSummary["severity"]) {
  if (severity === "critical") {
    return {
      label: "Critical",
      className: "border-negative/40 bg-negative/15 text-negative",
    };
  }
  return {
    label: "Warning",
    className: "border-warning/40 bg-warning/15 text-warning",
  };
}

function workflowLabel(state: IncidentSummary["workflow_state"]) {
  if (state === "acknowledged") return "Acknowledged";
  if (state === "resolved") return "Resolved";
  return "Open";
}

function domainLabel(domain: IncidentSummary["domain"]) {
  return domain === "lpg" ? "LPG & Safety" : "Machine";
}

function roleLabel(role: string | null | undefined): string | null {
  if (!role) return null;
  if (role === "owner") return "Owner";
  if (role === "branch_manager") return "Branch Manager";
  if (role === "machine_maintenance") return "Machine Maintenance";
  if (role === "lpg_maintenance") return "LPG Maintenance";
  return role;
}

export function BranchIncidentsClient({
  branchId,
  userRole,
  initialIncidents,
  initialError = null,
}: BranchIncidentsClientProps) {
  const canFilterDomain = userRole === "owner" || userRole === "branch_manager";
  const [incidents, setIncidents] = useState<IncidentSummary[]>(initialIncidents);
  const [statusView, setStatusView] = useState<StatusView>("active");
  const [domainView, setDomainView] = useState<DomainView>("all");
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [isPending, startTransition] = useTransition();

  const loadFiltered = (nextStatus: StatusView, nextDomain: DomainView) => {
    setStatusView(nextStatus);
    setDomainView(nextDomain);
    startTransition(async () => {
      const res = await fetchBranchIncidentsAction(branchId, {
        domain: nextDomain === "all" ? undefined : nextDomain,
        activeOnly: nextStatus === "active" ? true : undefined,
        workflowState: nextStatus === "resolved" ? "resolved" : undefined,
      });
      if (!res.ok) {
        setErrorMessage(res.message);
        return;
      }
      setErrorMessage(null);
      setIncidents(res.incidents);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">
          Active Incidents
        </h2>

        <button
          type="button"
          disabled={isPending}
          onClick={() => loadFiltered(statusView, domainView)}
          className="inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 rounded-md border border-control bg-navy px-4 py-2 text-xs font-semibold text-ink transition-colors enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          <RefreshCw
            className={`size-4 shrink-0 ${isPending ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          <span>Refresh</span>
        </button>
      </div>

      <section
        aria-label="Incident filters"
        className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
      >
        <div className="flex flex-wrap gap-2" role="group" aria-label="Incident status filter">
          {(
            [
              { id: "active", label: "Active & Unresolved" },
              { id: "resolved", label: "Resolved History" },
              { id: "all", label: "All Incidents" },
            ] as const
          ).map((option) => {
            const selected = statusView === option.id;
            return (
              <button
                key={option.id}
                type="button"
                disabled={isPending}
                aria-pressed={selected}
                onClick={() => loadFiltered(option.id, domainView)}
                className={`inline-flex min-h-11 items-center justify-center rounded-md border px-3.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  selected
                    ? "border-accent bg-navy-selected text-ink"
                    : "border-control bg-navy text-muted hover:bg-navy-hover hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {canFilterDomain && (
          <label className="flex w-full flex-col gap-1.5 text-xs font-medium text-muted sm:w-52">
            <span>Equipment Domain</span>
            <select
              value={domainView}
              disabled={isPending}
              onChange={(e) =>
                loadFiltered(statusView, e.target.value as DomainView)
              }
              className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              <option value="all">All equipment</option>
              <option value="machine">Machines</option>
              <option value="lpg">LPG &amp; Safety</option>
            </select>
          </label>
        )}
      </section>

      {errorMessage && <Notice>{errorMessage}</Notice>}

      {!errorMessage && incidents.length === 0 ? (
        <section className="flex flex-col items-start justify-between gap-4 rounded-md border border-line bg-surface p-5 sm:flex-row sm:items-center md:p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 shrink-0 text-positive" aria-hidden="true" />
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-ink sm:text-base">
                {statusView === "active"
                  ? "No active incidents"
                  : "No incidents found"}
              </h3>
              <p className="text-xs text-muted">
                {statusView === "active"
                  ? "All monitored equipment in your scope is currently clear of open incidents."
                  : "Adjust your status or domain filter to view other records."}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-3.5" role="list" aria-label="Incident records">
          {incidents.map((inc) => {
            const sev = severityBadge(inc.severity);
            const isActiveEdge = inc.edge_condition_state === "active";

            return (
              <Link
                key={inc.id}
                href={`/branches/${branchId}/incidents/${inc.id}`}
                role="listitem"
                className={`group block min-w-0 rounded-md border bg-surface p-4 transition-colors hover:border-control hover:bg-raised/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:p-5 ${
                  inc.workflow_state !== "resolved"
                    ? "border-negative/35"
                    : "border-line"
                }`}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${sev.className}`}
                      >
                        {sev.label}
                      </span>

                      <span className="inline-flex items-center rounded border border-line bg-raised px-2 py-0.5 text-[11px] font-medium text-ink">
                        {workflowLabel(inc.workflow_state)}
                      </span>

                      <span
                        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${
                          isActiveEdge
                            ? "border-negative/30 bg-negative/10 text-negative"
                            : "border-positive/30 bg-positive/10 text-positive"
                        }`}
                      >
                        {isActiveEdge ? (
                          <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
                        ) : (
                          <CheckCircle2 className="size-3 shrink-0" aria-hidden="true" />
                        )}
                        <span>{isActiveEdge ? "Edge Active" : "Edge Cleared"}</span>
                      </span>

                      <span className="inline-flex items-center rounded border border-rule bg-raised/50 px-2 py-0.5 text-[11px] font-medium text-muted">
                        {domainLabel(inc.domain)}
                      </span>

                      {inc.fault_code && (
                        <span className="inline-flex items-center rounded border border-rule bg-canvas px-2 py-0.5 font-mono text-[11px] font-semibold text-ink">
                          {inc.fault_code}
                        </span>
                      )}

                      <span className="inline-flex items-center rounded border border-rule bg-canvas px-2 py-0.5 font-mono text-[11px] font-medium text-muted tabular-nums">
                        {inc.reference_code}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-ink sm:text-base">
                      {inc.asset_name}
                    </h3>

                    <p className="break-words text-xs leading-relaxed text-muted sm:text-sm">
                      {inc.summary}
                    </p>

                    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-rule pt-2.5 text-xs sm:grid-cols-3">
                      <div className="min-w-0">
                        <dt className="text-faint">Hardware ID</dt>
                        <dd className="mt-0.5 truncate font-mono text-muted">
                          {inc.source_id}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-faint">Opened</dt>
                        <dd className="mt-0.5 flex items-center gap-1.5 text-muted tabular-nums">
                          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                          <span>{formatMytDateTime(inc.opened_at)}</span>
                        </dd>
                      </div>
                      <div className="min-w-0">
                        {inc.workflow_state === "resolved" && inc.resolved_by_name ? (
                          <>
                            <dt className="text-faint">Resolved by</dt>
                            <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-ink">
                              <CheckCircle2
                                className="size-3.5 shrink-0 text-positive"
                                aria-hidden="true"
                              />
                              <span className="font-medium">
                                {inc.resolved_by_name}
                              </span>
                              {inc.resolved_by_role && (
                                <span className="text-muted">
                                  ({roleLabel(inc.resolved_by_role)})
                                </span>
                              )}
                            </dd>
                          </>
                        ) : (
                          <>
                            <dt className="text-faint">Follow-up</dt>
                            <dd className="mt-0.5 flex items-center gap-1.5 text-muted tabular-nums">
                              <ClipboardList className="size-3.5 shrink-0" aria-hidden="true" />
                              <span>
                                {inc.open_tasks_count} open tasks, {inc.linked_reports_count} linked reports
                              </span>
                            </dd>
                          </>
                        )}
                      </div>
                    </dl>
                  </div>

                  <div className="flex shrink-0 items-center">
                    <span className="inline-flex min-h-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-4 py-2 text-xs font-semibold text-ink transition-colors group-hover:border-accent/60 group-hover:bg-navy-hover sm:w-auto">
                      <span>Inspect Incident</span>
                      <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
