"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  MessageSquare,
  MessageSquareWarning,
  Phone,
  Search,
  User,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import type {
  CustomerReportItem,
  CustomerReportsSummary,
  OpenBranchIncidentOption,
} from "@/lib/auth/business";
import {
  executeInvestigateReport,
  executeResolveReport,
} from "@/app/branches/[branchId]/customer-reports/actions";
import { useActionToast } from "@/components/workspace/common/ActionToastContext";

export type ReportsOperatorRole =
  | "owner"
  | "branch_manager"
  | "machine_maintenance"
  | "lpg_maintenance";

interface CustomerReportTriageModalProps {
  report: CustomerReportItem;
  branchId: string;
  userRole?: ReportsOperatorRole;
  openIncidents?: OpenBranchIncidentOption[];
  onClose: () => void;
  onReportUpdated: (
    updatedReport: CustomerReportItem,
    updatedSummary: CustomerReportsSummary
  ) => void;
}

export function CustomerReportTriageModal({
  report,
  branchId,
  userRole = "owner",
  openIncidents = [],
  onClose,
  onReportUpdated,
}: CustomerReportTriageModalProps) {
  const { notify } = useActionToast();
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState(report.investigation_notes ?? "");
  const [specialistRole, setSpecialistRole] = useState<
    "machine_maintenance" | "lpg_maintenance" | ""
  >(report.assigned_specialist_role ?? "");
  const [linkedIncidentId, setLinkedIncidentId] = useState<string>(
    report.linked_incident_id ?? ""
  );
  const [resolutionReason, setResolutionReason] = useState(
    report.resolution_reason ?? ""
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const isClosed = report.status === "resolved" || report.status === "dismissed";

  const formatActorRole = (role: string) => {
    if (role === "owner") return "Owner";
    if (role === "branch_manager") return "Branch Manager";
    if (role === "machine_maintenance") return "Machine Maintenance";
    if (role === "lpg_maintenance") return "LPG Maintenance";
    if (role === "customer") return "Customer";
    return role.replace("_", " ");
  };

  const getStatusBadge = (status: CustomerReportItem["status"]) => {
    if (status === "received") {
      return {
        wrapper: "border-warning/40 bg-warning/10 text-warning",
        dot: "bg-warning",
        label: "Needs Triage",
      };
    }
    if (status === "investigating") {
      return {
        wrapper: "border-control bg-navy text-ink",
        dot: "bg-accent",
        label: "Investigating",
      };
    }
    if (status === "resolved") {
      return {
        wrapper: "border-positive/30 bg-positive/10 text-positive",
        dot: "bg-positive",
        label: "Resolved",
      };
    }
    return {
      wrapper: "border-rule bg-raised text-muted",
      dot: "bg-muted",
      label: "Dismissed",
    };
  };

  const statusBadge = getStatusBadge(report.status);

  const toastId = `customer-report-${report.id}`;

  const handleInvestigateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    notify({
      id: toastId,
      kind: "info",
      title: "Saving triage notes",
      message: `Updating ticket #${report.id}…`,
    });

    startTransition(async () => {
      const res = await executeInvestigateReport(
        branchId,
        report.id,
        notes,
        specialistRole === "" ? null : specialistRole,
        linkedIncidentId === "" ? null : linkedIncidentId
      );
      if (!res.success) {
        notify({
          id: toastId,
          kind: "error",
          title: "Triage update failed",
          message: res.message || "Unable to save investigation details.",
        });
      } else if (res.report && res.summary) {
        notify({
          id: toastId,
          kind: "success",
          title: "Investigation updated",
          message: "Investigation notes saved and ticket marked as investigating.",
        });
        onReportUpdated(res.report, res.summary);
      }
    });
  };

  const handleResolveAction = (action: "resolve" | "dismiss") => {
    notify({
      id: toastId,
      kind: "info",
      title: action === "dismiss" ? "Dismissing ticket" : "Resolving ticket",
      message: `Closing ticket #${report.id}…`,
    });

    startTransition(async () => {
      const res = await executeResolveReport(
        branchId,
        report.id,
        action,
        resolutionReason
      );
      if (!res.success) {
        notify({
          id: toastId,
          kind: "error",
          title: action === "dismiss" ? "Dismiss failed" : "Resolve failed",
          message: res.message || `Unable to ${action} report.`,
        });
      } else if (res.report && res.summary) {
        notify({
          id: toastId,
          kind: "success",
          title: action === "dismiss" ? "Ticket dismissed" : "Ticket resolved",
          message: `Customer report #${report.id} has been ${action === "dismiss" ? "dismissed" : "resolved"}.`,
        });
        onReportUpdated(res.report, res.summary);
        onClose();
      }
    });
  };

  const formatTimestamp = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-MY", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="triage-modal-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-md border border-line bg-surface shadow-lg">
        {/* Top Modal Header */}
        <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-rule bg-raised/80 px-2 py-0.5 text-xs font-semibold text-ink tabular-nums">
                #{report.id}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${statusBadge.wrapper}`}
              >
                <span
                  className={`size-1.5 rounded-full ${statusBadge.dot}`}
                  aria-hidden="true"
                />
                <span>{statusBadge.label}</span>
              </span>
              <span className="rounded border border-rule bg-raised px-2 py-0.5 text-xs font-medium text-muted">
                Acting as: {formatActorRole(userRole)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2
                id="triage-modal-title"
                className="text-base font-semibold text-ink"
              >
                {report.asset_name}
              </h2>
              <span className="inline-flex items-center gap-1 rounded border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-semibold text-warning">
                <AlertCircle className="size-3 text-warning shrink-0" aria-hidden="true" />
                <span>{report.category}</span>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close support ticket modal"
            className="inline-flex size-8 items-center justify-center rounded-md border border-transparent text-muted transition-colors hover:border-line hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Customer Report Observation Summary */}
          <div className="space-y-3.5 rounded-md border border-rule bg-raised/30 p-4">
            {/* Header: Machine, Issue Category, and Date */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2.5 text-xs">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
                <div className="flex items-center gap-1.5">
                  <span className="text-faint">Machine:</span>
                  <span className="font-semibold text-ink">{report.asset_name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-faint">Issue:</span>
                  <span className="font-medium text-warning">{report.category}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <Calendar className="size-3.5 text-faint" aria-hidden="true" />
                <span>Reported:</span>
                <span className="font-medium text-ink tabular-nums">
                  {formatTimestamp(report.created_at)}
                </span>
              </div>
            </div>

            {/* Complaint quote well */}
            <div className="space-y-1">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted">
                <MessageSquare className="size-3.5 text-accent" aria-hidden="true" />
                <span>Customer Complaint</span>
              </span>
              <p className="text-sm leading-relaxed text-ink">
                &ldquo;{report.description}&rdquo;
              </p>
            </div>

            {/* Reporter Contact Info */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-rule pt-2.5 text-xs text-muted">
              <div className="flex items-center gap-1.5">
                <User className="size-3.5 text-faint" aria-hidden="true" />
                <span>Reporter:</span>
                <span className="font-medium text-ink">{report.reporter_name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Phone className="size-3.5 text-faint" aria-hidden="true" />
                <span>Phone:</span>
                <span className="font-medium text-ink tabular-nums">{report.reporter_contact}</span>
              </div>
            </div>
          </div>

          {/* Step 1: Investigation Notes & Specialist Domain Assignment */}
          <form onSubmit={handleInvestigateSubmit} className="space-y-3 rounded-md border border-line bg-surface p-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Search className="size-3.5 text-accent" aria-hidden="true" />
                <span>1. Investigation &amp; Maintenance Triage</span>
              </h3>
            </div>

            <div>
              <label
                htmlFor="investigation-notes"
                className="block text-xs font-medium text-muted"
              >
                Investigation notes
              </label>
              <textarea
                id="investigation-notes"
                rows={3}
                disabled={isPending}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Record inspection findings, customer follow-up, or corrective steps..."
                className="mt-1.5 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex-1">
                  <label
                    htmlFor="specialist-domain-select"
                    className="block text-xs font-medium text-muted"
                  >
                    Flag specialist maintenance domain (optional)
                  </label>
                  <div className="relative mt-1.5 flex items-center">
                    <Wrench
                      className="pointer-events-none absolute left-2.5 size-3.5 text-faint"
                      aria-hidden="true"
                    />
                    <select
                      id="specialist-domain-select"
                      disabled={isPending}
                      value={specialistRole}
                      onChange={e =>
                        setSpecialistRole(
                          e.target.value as
                            | "machine_maintenance"
                            | "lpg_maintenance"
                            | ""
                        )
                      }
                      className="min-h-11 w-full rounded-md border border-control bg-navy pl-8 pr-4 py-1.5 text-xs text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <option value="">No specialist dispatch required</option>
                      <option value="machine_maintenance">
                        Machine Maintenance Specialist
                      </option>
                      <option value="lpg_maintenance">
                        LPG &amp; Gas Maintenance Specialist
                      </option>
                    </select>
                  </div>
                </div>

                <div className="flex-1">
                  <label
                    htmlFor="linked-incident-select"
                    className="block text-xs font-medium text-muted"
                  >
                    Link to active incident (optional)
                  </label>
                  <select
                    id="linked-incident-select"
                    disabled={isPending}
                    value={linkedIncidentId}
                    onChange={e => setLinkedIncidentId(e.target.value)}
                    className="mt-1.5 min-h-11 w-full rounded-md border border-control bg-navy px-3 py-1.5 text-xs text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <option value="">No linked hardware incident</option>
                    {openIncidents.map(inc => (
                      <option key={inc.id} value={inc.id}>
                        {inc.reference_code} — {inc.asset_name}
                        {inc.fault_code ? ` (${inc.fault_code})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                {report.linked_incident ? (
                  <Link
                    href={`/branches/${branchId}/incidents/${report.linked_incident.id}`}
                    className="inline-flex min-h-11 items-center text-xs font-semibold text-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    Open linked incident {report.linked_incident.reference_code} &rarr;
                  </Link>
                ) : (
                  <span />
                )}

                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex min-h-11 w-full sm:w-auto shrink-0 items-center justify-center gap-1.5 rounded-md border border-control bg-navy px-4 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
                >
                  <span>Save &amp; Mark Investigating</span>
                </button>
              </div>
            </div>
          </form>

          {/* Step 2: Resolution or Dismissal with Reason */}
          <div className="space-y-3 rounded-md border border-line bg-surface p-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <CheckCircle2
                  className="size-3.5 text-positive"
                  aria-hidden="true"
                />
                <span>2. Close Support Ticket (Resolve or Dismiss)</span>
              </h3>
            </div>

            <div>
              <label
                htmlFor="resolution-reason"
                className="block text-xs font-medium text-muted"
              >
                Resolution or dismissal reason (required to close)
              </label>
              <input
                id="resolution-reason"
                type="text"
                disabled={isPending}
                value={resolutionReason}
                onChange={e => setResolutionReason(e.target.value)}
                placeholder="e.g., Cleaned detergent nozzle and verified rinse cycle flow..."
                className="mt-1.5 min-h-9 w-full rounded-md border border-control bg-canvas px-3 py-1.5 text-xs text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
              <p className="mt-1 text-[11px] text-faint">
                Closing a customer report records the support outcome and does not override active edge hardware telemetry.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={isPending}
                onClick={() => handleResolveAction("dismiss")}
                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-control bg-raised px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
              >
                <XCircle className="size-3.5" aria-hidden="true" />
                <span>Dismiss Report</span>
              </button>

              <button
                type="button"
                disabled={isPending}
                onClick={() => handleResolveAction("resolve")}
                className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border border-ink bg-ink px-4 py-1.5 text-xs font-semibold text-surface transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
              >
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                <span>{isClosed && report.status === "resolved" ? "Update Resolution" : "Resolve Issue"}</span>
              </button>
            </div>
          </div>

          {/* Audit History Timeline (CR-01, CR-03) */}
          <div className="space-y-2.5 rounded-md border border-rule bg-raised/20 p-4">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ink">
              <Clock className="size-3.5 text-faint" aria-hidden="true" />
              <span>Ticket Activity History</span>
            </h3>

            <ol className="space-y-2.5 border-l border-line pl-3.5">
              {report.history.map(item => (
                <li key={item.id} className="space-y-0.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold capitalize text-ink">
                        {item.action}
                      </span>
                      <span className="rounded border border-rule bg-surface px-1.5 py-0.5 text-[11px] font-normal text-muted">
                        {formatActorRole(item.actor_role)}
                      </span>
                    </div>
                    <span className="text-[11px] text-faint tabular-nums">
                      {formatTimestamp(item.timestamp)}
                    </span>
                  </div>
                  <p className="text-muted">{item.note}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
