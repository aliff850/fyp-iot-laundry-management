"use client";

import React, { useEffect, useState, useTransition } from "react";
import {
  X,
  CheckCircle2,
  Clock,
  MessageSquareWarning,
  Phone,
  User,
  Wrench,
  XCircle,
  Search,
} from "lucide-react";
import type {
  CustomerReportItem,
  CustomerReportsSummary,
} from "@/lib/auth/business";
import {
  executeInvestigateReport,
  executeResolveReport,
} from "@/app/branches/[branchId]/customer-reports/actions";

export type ReportsOperatorRole =
  | "owner"
  | "branch_manager"
  | "machine_maintenance"
  | "lpg_maintenance";

interface CustomerReportTriageModalProps {
  report: CustomerReportItem;
  branchId: string;
  userRole?: ReportsOperatorRole;
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
  onClose,
  onReportUpdated,
}: CustomerReportTriageModalProps) {
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState(report.investigation_notes ?? "");
  const [specialistRole, setSpecialistRole] = useState<
    "machine_maintenance" | "lpg_maintenance" | ""
  >(report.assigned_specialist_role ?? "");
  const [resolutionReason, setResolutionReason] = useState(
    report.resolution_reason ?? ""
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

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

  const handleInvestigateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setFeedbackMsg(null);

    startTransition(async () => {
      const res = await executeInvestigateReport(
        branchId,
        report.id,
        notes,
        specialistRole === "" ? null : specialistRole
      );
      if (!res.success) {
        setErrorMsg(res.message || "Unable to save investigation details.");
      } else if (res.report && res.summary) {
        setFeedbackMsg("Investigation notes saved and ticket marked as investigating.");
        onReportUpdated(res.report, res.summary);
      }
    });
  };

  const handleResolveAction = (action: "resolve" | "dismiss") => {
    setErrorMsg(null);
    setFeedbackMsg(null);

    startTransition(async () => {
      const res = await executeResolveReport(
        branchId,
        report.id,
        action,
        resolutionReason
      );
      if (!res.success) {
        setErrorMsg(res.message || `Unable to ${action} report.`);
      } else if (res.report && res.summary) {
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
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-muted tabular-nums">
                {report.id}
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
              {report.source_kind === "simulated" && (
                <span className="rounded border border-rule bg-raised px-2 py-0.5 text-[11px] font-medium text-muted">
                  Simulated
                </span>
              )}
              <span className="rounded border border-rule bg-raised px-2 py-0.5 text-[11px] font-medium text-muted">
                Acting as: {formatActorRole(userRole)}
              </span>
            </div>
            <h2
              id="triage-modal-title"
              className="text-base font-semibold text-ink"
            >
              {report.category} · {report.asset_name}
            </h2>
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
          <div className="space-y-3 rounded-md border border-rule bg-raised/30 p-4">
            <div className="flex items-center justify-between gap-2 text-xs text-muted">
              <span className="flex items-center gap-1.5 font-medium text-ink">
                <MessageSquareWarning
                  className="size-3.5 text-accent"
                  aria-hidden="true"
                />
                <span>Customer Observation</span>
              </span>
              <span className="tabular-nums">
                {formatTimestamp(report.created_at)}
              </span>
            </div>

            <p className="text-sm leading-relaxed text-ink">
              {report.description}
            </p>

            <div className="flex flex-wrap items-center gap-4 border-t border-rule pt-3 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <User className="size-3.5 text-faint" aria-hidden="true" />
                <span>
                  Reporter: <strong className="font-medium text-ink">{report.reporter_name}</strong>
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <Phone className="size-3.5 text-faint" aria-hidden="true" />
                <span>{report.reporter_contact}</span>
              </span>
            </div>
          </div>

          {errorMsg && (
            <div
              className="rounded-md border border-negative/40 bg-negative/10 px-3.5 py-2.5 text-xs text-negative"
              role="alert"
            >
              {errorMsg}
            </div>
          )}

          {feedbackMsg && (
            <div
              className="rounded-md border border-positive/30 bg-positive/10 px-3.5 py-2.5 text-xs text-positive"
              role="status"
            >
              {feedbackMsg}
            </div>
          )}

          {/* Step 1: Investigation Notes & Specialist Domain Assignment (CR-02) */}
          <form onSubmit={handleInvestigateSubmit} className="space-y-3 rounded-md border border-line bg-surface p-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Search className="size-3.5 text-accent" aria-hidden="true" />
                <span>1. Investigation &amp; Maintenance Triage</span>
              </h3>
              <span className="text-[11px] text-faint">CR-02</span>
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
                    className="min-h-9 w-full rounded-md border border-control bg-navy pl-8 pr-4 py-1.5 text-xs text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
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

              <button
                type="submit"
                disabled={isPending}
                className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-md border border-control bg-navy px-4 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
              >
                <span>Save &amp; Mark Investigating</span>
              </button>
            </div>
          </form>

          {/* Step 2: Resolution or Dismissal with Reason (CR-03) */}
          <div className="space-y-3 rounded-md border border-line bg-surface p-4">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <CheckCircle2
                  className="size-3.5 text-positive"
                  aria-hidden="true"
                />
                <span>2. Close Support Ticket (Resolve or Dismiss)</span>
              </h3>
              <span className="text-[11px] text-faint">CR-03</span>
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
                    <span className="font-semibold capitalize text-ink">
                      {item.action} ·{" "}
                      <span className="font-normal text-muted">
                        {formatActorRole(item.actor_role)}
                      </span>
                    </span>
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
