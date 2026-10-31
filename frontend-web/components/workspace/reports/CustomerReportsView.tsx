"use client";

import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  History,
  MessageSquareWarning,
  Search,
} from "lucide-react";
import type {
  CustomerReportItem,
  CustomerReportsBranchData,
  CustomerReportsSummary,
} from "@/lib/auth/business";
import { CustomerReportCard } from "@/components/workspace/reports/CustomerReportCard";
import { MetricCard, MetricGrid } from "@/components/workspace/common/MetricCard";
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-ink">
            Customer Issue Reports
          </h2>
        </div>
      </div>

      {/* 4-Card Summary KPI Strip */}
      <MetricGrid columns={4} ariaLabel="Customer reports summary">
        <MetricCard
          icon={
            <MessageSquareWarning
              className="size-3.5 text-faint"
              aria-hidden="true"
            />
          }
          label="Total Tickets"
          value={summary.total}
        />

        <MetricCard
          icon={<Clock className="size-3.5 text-warning" aria-hidden="true" />}
          label="Needs Triage"
          value={summary.received}
          valueClassName={summary.received > 0 ? "text-warning" : "text-ink"}
        />

        <MetricCard
          icon={<Search className="size-3.5 text-accent" aria-hidden="true" />}
          label="Investigating"
          value={summary.investigating}
        />

        <MetricCard
          icon={
            <CheckCircle2
              className="size-3.5 text-positive"
              aria-hidden="true"
            />
          }
          label="Resolved & Closed"
          value={summary.resolved + summary.dismissed}
          valueClassName="text-positive"
        />
      </MetricGrid>

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
            {filteredOngoingReports.map(report => (
              <CustomerReportCard
                key={report.id}
                report={report}
                isHistory={false}
                onSelectReport={setSelectedReport}
              />
            ))}
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
            {filteredHistoryReports.map(report => (
              <CustomerReportCard
                key={report.id}
                report={report}
                isHistory={true}
                onSelectReport={setSelectedReport}
              />
            ))}
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
