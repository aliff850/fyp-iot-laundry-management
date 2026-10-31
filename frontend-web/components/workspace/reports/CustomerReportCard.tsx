"use client";

import React from "react";
import {
  AlertCircle,
  Building2,
  Calendar,
  MessageSquare,
  Phone,
  User,
  WashingMachine,
  Wind,
  Wrench,
} from "lucide-react";
import type {
  CustomerReportItem,
  CustomerReportStatus,
} from "@/lib/auth/business";

export interface CustomerReportCardProps {
  report: CustomerReportItem;
  isHistory?: boolean;
  onSelectReport?: (report: CustomerReportItem) => void;
  actionLabel?: string;
  actionSlot?: React.ReactNode;
  className?: string;
}

function getStatusBadge(status: CustomerReportStatus) {
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
}

function getAssetIcon(type: CustomerReportItem["asset_type"]) {
  if (type === "washer") {
    return <WashingMachine className="size-4 text-accent" aria-hidden="true" />;
  }
  if (type === "dryer") {
    return <Wind className="size-4 text-warning" aria-hidden="true" />;
  }
  return <Building2 className="size-4 text-muted" aria-hidden="true" />;
}

function formatDate(iso: string) {
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
}

export function CustomerReportCard({
  report,
  isHistory = false,
  onSelectReport,
  actionLabel,
  actionSlot,
  className = "",
}: CustomerReportCardProps) {
  const badge = getStatusBadge(report.status);

  return (
    <article
      role="listitem"
      className={`flex flex-col justify-between gap-3.5 rounded-md border border-line bg-surface p-3.5 transition-colors hover:border-control/70 sm:p-5 ${className}`.trim()}
    >
      <div className="space-y-3 sm:space-y-3.5">
        {/* Header Row: ID, Badges, and Date */}
        <div className="flex flex-col gap-2 border-b border-rule pb-2.5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded border border-rule bg-raised/80 px-2 py-0.5 font-semibold text-ink tabular-nums">
              #{report.id}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-medium ${badge.wrapper}`}
            >
              <span
                className={`size-1.5 rounded-full ${badge.dot}`}
                aria-hidden="true"
              />
              <span>{badge.label}</span>
            </span>
            {report.assigned_specialist_role && (
              <span className="inline-flex items-center gap-1 rounded border border-rule bg-raised px-2 py-0.5 text-[11px] font-medium text-ink">
                <Wrench className="size-3 text-accent" aria-hidden="true" />
                <span className="capitalize">
                  {report.assigned_specialist_role.replace("_", " ")}
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-muted shrink-0">
            <Calendar className="size-3 text-faint" aria-hidden="true" />
            <span>Reported:</span>
            <span className="font-medium text-ink tabular-nums">
              {formatDate(report.created_at)}
            </span>
          </div>
        </div>

        {/* Structured 2-Column Asset & Issue Grid */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-4 rounded-md border border-rule/60 bg-raised/20 p-2.5 sm:p-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-8 shrink-0 items-center justify-center rounded border border-rule/80 bg-raised">
              {getAssetIcon(report.asset_type)}
            </div>
            <div className="min-w-0">
              <span className="block text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-faint truncate">
                Reported Machine / Asset
              </span>
              <span className="block text-sm font-semibold text-ink truncate">
                {report.asset_name}
              </span>
            </div>
          </div>

          <div className="flex flex-col justify-center sm:border-l sm:border-rule/60 sm:pl-4">
            <span className="block text-[10px] sm:text-[11px] font-medium uppercase tracking-wider text-faint truncate">
              Reported Machine Issue
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning truncate">
              <AlertCircle className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
              <span className="truncate">{report.category}</span>
            </span>
          </div>
        </div>

        {/* Streamlined Customer Complaint Container */}
        <div className="space-y-1 rounded-r-md border border-line border-l-2 border-l-accent/70 bg-raised/30 p-2.5 sm:p-3">
          <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-muted">
            <MessageSquare className="size-3 text-accent" aria-hidden="true" />
            <span>Customer Complaint</span>
          </div>
          <p className="text-xs sm:text-sm leading-relaxed text-ink">
            &ldquo;{report.description}&rdquo;
          </p>
        </div>

        {/* Investigation / Resolution Note Preview */}
        {report.resolution_reason ? (
          <div className="rounded-md border border-positive/30 bg-positive/10 px-3 py-2 text-xs text-positive">
            <strong className="font-semibold">Resolution Outcome:</strong>{" "}
            {report.resolution_reason}
          </div>
        ) : report.investigation_notes ? (
          <div className="rounded-md border border-rule bg-navy px-3 py-2 text-xs text-muted">
            <strong className="font-semibold text-ink">
              Investigation Notes:
            </strong>{" "}
            {report.investigation_notes}
          </div>
        ) : null}

        {/* Footer Bar: Reporter Details & Action Button */}
        <div className="flex flex-col gap-2.5 border-t border-rule pt-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <div className="flex items-center gap-1.5">
              <User className="size-3 text-faint" aria-hidden="true" />
              <span>Reporter:</span>
              <span className="font-medium text-ink">{report.reporter_name}</span>
            </div>
            <span className="hidden text-line sm:inline" aria-hidden="true">·</span>
            <div className="flex items-center gap-1.5">
              <Phone className="size-3 text-faint" aria-hidden="true" />
              <span>Phone:</span>
              <span className="font-medium text-ink tabular-nums">{report.reporter_contact}</span>
            </div>
          </div>

          <div>
            {actionSlot ?? (
              onSelectReport && (
                <button
                  type="button"
                  onClick={() => onSelectReport(report)}
                  className="inline-flex min-h-10 sm:min-h-9 w-full sm:w-auto items-center justify-center gap-1.5 rounded-md border border-control bg-navy px-4 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-navy-hover active:bg-navy-selected focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span>{actionLabel ?? (isHistory ? "View History" : "Review & Address")}</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

