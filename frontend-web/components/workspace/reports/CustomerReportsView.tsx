"use client";

import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  History,
  MessageSquareWarning,
  Phone,
  Search,
  User,
  WashingMachine,
  Wind,
  Wrench,
  Building2,
} from "lucide-react";
import type {
  CustomerReportItem,
  CustomerReportsBranchData,
  CustomerReportsSummary,
  CustomerReportStatus,
} from "@/lib/auth/business";
import {
  CustomerReportTriageModal,
  type ReportsOperatorRole,
} from "@/components/workspace/reports/CustomerReportTriageModal";

interface CustomerReportsViewProps {
  initialData: CustomerReportsBranchData;
  branchId: string;
  userRole?: ReportsOperatorRole;
}

type OngoingFilter = "all" | "received" | "investigating";
type HistoryFilter = "all" | "resolved" | "dismissed";

export function CustomerReportsView({
  initialData,
  branchId,
  userRole = "owner",
}: CustomerReportsViewProps) {
  const [reports, setReports] = useState<CustomerReportItem[]>(
    initialData.reports
  );
  const [summary, setSummary] = useState<CustomerReportsSummary>(
    initialData.summary
  );
  const [ongoingFilter, setOngoingFilter] = useState<OngoingFilter>("all");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [selectedReport, setSelectedReport] =
    useState<CustomerReportItem | null>(null);

  const allOngoingReports = useMemo(
    () =>
      reports.filter(
        r => r.status === "received" || r.status === "investigating"
      ),
    [reports]
  );

  const allHistoryReports = useMemo(
    () =>
      reports.filter(
        r => r.status === "resolved" || r.status === "dismissed"
      ),
    [reports]
  );

  const filteredOngoingReports = useMemo(() => {
    if (ongoingFilter === "all") return allOngoingReports;
    return allOngoingReports.filter(r => r.status === ongoingFilter);
  }, [allOngoingReports, ongoingFilter]);

  const filteredHistoryReports = useMemo(() => {
    if (historyFilter === "all") return allHistoryReports;
    return allHistoryReports.filter(r => r.status === historyFilter);
  }, [allHistoryReports, historyFilter]);

  const handleReportUpdated = (
    updatedReport: CustomerReportItem,
    updatedSummary: CustomerReportsSummary
  ) => {
    setReports(prev =>
      prev.map(r => (r.id === updatedReport.id ? updatedReport : r))
    );
    setSummary(updatedSummary);
    setSelectedReport(updatedReport);
  };

  const getStatusBadge = (status: CustomerReportStatus) => {
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

  const getAssetIcon = (type: CustomerReportItem["asset_type"]) => {
    if (type === "washer") {
      return <WashingMachine className="size-4 text-accent" aria-hidden="true" />;
    }
    if (type === "dryer") {
      return <Wind className="size-4 text-warning" aria-hidden="true" />;
    }
    return <Building2 className="size-4 text-muted" aria-hidden="true" />;
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-MY", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const ongoingFilterButtons: Array<{
    id: OngoingFilter;
    label: string;
    count: number;
  }> = [
      {
        id: "all",
        label: "All Ongoing",
        count: summary.received + summary.investigating,
      },
      { id: "received", label: "Needs Triage", count: summary.received },
      {
        id: "investigating",
        label: "Investigating",
        count: summary.investigating,
      },
    ];

  const historyFilterButtons: Array<{
    id: HistoryFilter;
    label: string;
    count: number;
  }> = [
      {
        id: "all",
        label: "All History",
        count: summary.resolved + summary.dismissed,
      },
      { id: "resolved", label: "Resolved", count: summary.resolved },
      { id: "dismissed", label: "Dismissed", count: summary.dismissed },
    ];

  const renderReportCard = (report: CustomerReportItem, isHistory: boolean) => {
    const badge = getStatusBadge(report.status);
    return (
      <article
        key={report.id}
        role="listitem"
        className="flex flex-col justify-between gap-4 rounded-md border border-line bg-surface p-4 transition-colors hover:border-control sm:flex-row sm:items-center sm:p-5"
      >
        <div className="min-w-0 flex-1 space-y-2">
          {/* Top Badge & Metadata Row */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-muted tabular-nums">
              {report.id}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${badge.wrapper}`}
            >
              <span
                className={`size-1.5 rounded-full ${badge.dot}`}
                aria-hidden="true"
              />
              <span>{badge.label}</span>
            </span>
            {/* {report.source_kind === "simulated" && (
              <span
                className="rounded border border-rule bg-raised px-2 py-0.5 text-[11px] font-medium text-muted"
                title="Simulated customer report for operator evaluation"
              >
                Simulated
              </span>
            )} */}
            {report.assigned_specialist_role && (
              <span className="inline-flex items-center gap-1 rounded border border-rule bg-raised px-2 py-0.5 text-[11px] font-medium text-ink">
                <Wrench className="size-3 text-accent" aria-hidden="true" />
                <span className="capitalize">
                  {report.assigned_specialist_role.replace("_", " ")}
                </span>
              </span>
            )}
            <span className="text-faint tabular-nums">
              · {formatDate(isHistory ? report.updated_at : report.created_at)}
            </span>
          </div>

          {/* Asset & Issue Category Title */}
          <div className="flex items-center gap-2">
            {getAssetIcon(report.asset_type)}
            <h4 className="text-sm font-semibold text-ink">
              {report.asset_name} — {report.category}
            </h4>
          </div>

          {/* Customer Description */}
          <p className="text-xs leading-relaxed text-muted">
            {report.description}
          </p>

          {/* Investigation or Resolution Note Preview */}
          {report.resolution_reason ? (
            <p className="rounded border border-positive/20 bg-positive/5 px-2.5 py-1.5 text-xs text-positive">
              <strong className="font-semibold">Outcome:</strong>{" "}
              {report.resolution_reason}
            </p>
          ) : report.investigation_notes ? (
            <p className="rounded border border-rule bg-raised/40 px-2.5 py-1.5 text-xs text-muted">
              <strong className="font-semibold text-ink">
                Investigation:
              </strong>{" "}
              {report.investigation_notes}
            </p>
          ) : null}

          {/* Reporter Contact Info */}
          <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-faint">
            <span className="inline-flex items-center gap-1">
              <User className="size-3" aria-hidden="true" />
              <span>{report.reporter_name}</span>
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Phone className="size-3" aria-hidden="true" />
              <span>{report.reporter_contact}</span>
            </span>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex shrink-0 items-center sm:self-center">
          <button
            type="button"
            onClick={() => setSelectedReport(report)}
            className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-control bg-navy px-4 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
          >
            <span>{isHistory ? "View History" : "Review & Address"}</span>
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header & Support Portal Description */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-xs font-medium text-muted">
            Customer Support &amp; Maintenance Portal
          </span>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
            Customer Issue Reports
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Review customer-submitted machine and facility observations, log investigation notes, coordinate maintenance crew action, and inspect resolved report history.
          </p>
        </div>
      </div>

      {/* 4-Card Summary KPI Strip */}
      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        aria-label="Customer reports summary"
      >
        <div className="flex flex-col justify-between rounded-md border border-line bg-surface p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <MessageSquareWarning
              className="size-3.5 text-faint"
              aria-hidden="true"
            />
            <span>Total Tickets</span>
          </div>
          <span className="mt-2 text-2xl font-semibold text-ink tabular-nums">
            {summary.total}
          </span>
        </div>

        <div className="flex flex-col justify-between rounded-md border border-line bg-surface p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Clock className="size-3.5 text-warning" aria-hidden="true" />
            <span>Needs Triage</span>
          </div>
          <span
            className={`mt-2 text-2xl font-semibold tabular-nums ${summary.received > 0 ? "text-warning" : "text-ink"
              }`}
          >
            {summary.received}
          </span>
        </div>

        <div className="flex flex-col justify-between rounded-md border border-line bg-surface p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Search className="size-3.5 text-accent" aria-hidden="true" />
            <span>Investigating</span>
          </div>
          <span className="mt-2 text-2xl font-semibold text-ink tabular-nums">
            {summary.investigating}
          </span>
        </div>

        <div className="flex flex-col justify-between rounded-md border border-line bg-surface p-4">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <CheckCircle2
              className="size-3.5 text-positive"
              aria-hidden="true"
            />
            <span>Resolved &amp; Closed</span>
          </div>
          <span className="mt-2 text-2xl font-semibold text-positive tabular-nums">
            {summary.resolved + summary.dismissed}
          </span>
        </div>
      </div>

      {/* SECTION 1: Ongoing Reports */}
      <section aria-labelledby="ongoing-reports-heading" className="space-y-4">
        <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-warning" aria-hidden="true" />
              <h3
                id="ongoing-reports-heading"
                className="text-base font-semibold text-ink"
              >
                Ongoing Reports
              </h3>

            </div>
            <p className="text-xs text-muted">
              Active customer issues requiring initial triage or ongoing maintenance investigation.
            </p>
          </div>

          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filter ongoing support tickets"
          >
            {ongoingFilterButtons.map(btn => {
              const isSelected = ongoingFilter === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setOngoingFilter(btn.id)}
                  aria-pressed={isSelected}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${isSelected
                    ? "border-line bg-navy-selected font-semibold text-ink"
                    : "border-transparent bg-navy text-muted hover:bg-navy-hover hover:text-ink"
                    }`}
                >
                  <span>{btn.label}</span>
                  <span className="rounded bg-canvas/50 px-1.5 py-0.5 text-[11px] tabular-nums text-ink">
                    {btn.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {filteredOngoingReports.length === 0 ? (
          <div className="rounded-md border border-line bg-surface p-8 text-center">
            <CheckCircle2
              className="mx-auto size-8 text-positive"
              aria-hidden="true"
            />
            <h4 className="mt-3 text-sm font-semibold text-ink">
              No ongoing support reports
            </h4>
            <p className="mt-1 text-xs text-muted">
              {ongoingFilter === "all"
                ? "All customer support tickets for this branch have been resolved or closed."
                : `No active tickets currently in the "${ongoingFilter}" state.`}
            </p>
          </div>
        ) : (
          <div
            className="space-y-3"
            role="list"
            aria-label="Ongoing customer support tickets"
          >
            {filteredOngoingReports.map(report =>
              renderReportCard(report, false)
            )}
          </div>
        )}
      </section>

      {/* SECTION 2: Report History & Resolved Reports */}
      <section aria-labelledby="history-reports-heading" className="space-y-4">
        <div className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <History className="size-4 text-positive" aria-hidden="true" />
              <h3
                id="history-reports-heading"
                className="text-base font-semibold text-ink"
              >
                Report History
              </h3>

            </div>

          </div>

          <div
            className="flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Filter resolved and historical support tickets"
          >
            {historyFilterButtons.map(btn => {
              const isSelected = historyFilter === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setHistoryFilter(btn.id)}
                  aria-pressed={isSelected}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${isSelected
                    ? "border-line bg-navy-selected font-semibold text-ink"
                    : "border-transparent bg-navy text-muted hover:bg-navy-hover hover:text-ink"
                    }`}
                >
                  <span>{btn.label}</span>
                  <span className="rounded bg-canvas/50 px-1.5 py-0.5 text-[11px] tabular-nums text-ink">
                    {btn.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {filteredHistoryReports.length === 0 ? (
          <div className="rounded-md border border-line bg-surface p-8 text-center">
            <History
              className="mx-auto size-8 text-muted"
              aria-hidden="true"
            />
            <h4 className="mt-3 text-sm font-semibold text-ink">
              No resolved or historical reports
            </h4>
            <p className="mt-1 text-xs text-muted">
              {historyFilter === "all"
                ? "Completed or dismissed support tickets will appear here once closed."
                : `No historical tickets currently in the "${historyFilter}" state.`}
            </p>
          </div>
        ) : (
          <div
            className="space-y-3"
            role="list"
            aria-label="Resolved and historical customer support tickets"
          >
            {filteredHistoryReports.map(report =>
              renderReportCard(report, true)
            )}
          </div>
        )}
      </section>

      {/* Triage & Resolution Modal */}
      {selectedReport && (
        <CustomerReportTriageModal
          report={selectedReport}
          branchId={branchId}
          userRole={userRole}
          onClose={() => setSelectedReport(null)}
          onReportUpdated={handleReportUpdated}
        />
      )}
    </div>
  );
}
