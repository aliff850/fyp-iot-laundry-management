"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  GitCommitHorizontal,
  RotateCcw,
  Search,
  Wrench,
} from "lucide-react";
import { loadBranchMaintenanceLogs } from "@/app/branches/[branchId]/machines/actions";
import { formatDateLabel } from "@/components/workspace/machines/MachineCard";
import type {
  MaintenanceLogItem,
  MaintenanceLogsPage,
  RemoteMachine,
} from "@/lib/auth/business";

export interface MaintenanceHistoryViewProps {
  branchId: string;
  machines: Pick<RemoteMachine, "source_id" | "label">[];
  initialPage: MaintenanceLogsPage | null;
  initialError?: string | null;
}

const PAGE_SIZE = 20;

export function MaintenanceHistoryView({
  branchId,
  machines,
  initialPage,
  initialError = null,
}: MaintenanceHistoryViewProps) {
  const [data, setData] = useState<MaintenanceLogsPage | null>(initialPage);
  const [error, setError] = useState<string | null>(initialError);
  const [sourceFilter, setSourceFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const items: MaintenanceLogItem[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const page = data?.page ?? 1;
  const hasMore = Boolean(data?.has_more);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const machineOptions = (() => {
    const seen = new Map<string, string>();
    for (const machine of machines) {
      seen.set(machine.source_id, machine.label);
    }
    for (const entry of items) {
      if (!seen.has(entry.source_id)) {
        seen.set(entry.source_id, entry.asset_name);
      }
    }
    return Array.from(seen.entries());
  })();

  const fetchLogs = (
    nextSourceId: string,
    nextSearch: string,
    nextPage: number,
  ) => {
    startTransition(async () => {
      const result = await loadBranchMaintenanceLogs(branchId, {
        ...(nextSourceId ? { source_id: nextSourceId } : {}),
        ...(nextSearch ? { search: nextSearch } : {}),
        page: nextPage,
        page_size: PAGE_SIZE,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
      setData(result.value);
    });
  };

  const handleApplyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = searchInput.trim();
    setAppliedSearch(trimmed);
    fetchLogs(sourceFilter, trimmed, 1);
  };

  const handleResetFilters = () => {
    setSourceFilter("");
    setSearchInput("");
    setAppliedSearch("");
    fetchLogs("", "", 1);
  };

  const hasActiveFilters = Boolean(sourceFilter || appliedSearch);

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleApplyFilters}
        className="flex flex-col gap-3 rounded-md border border-line bg-surface p-3.5 sm:p-4 lg:flex-row lg:items-end"
      >
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-medium text-muted">
          <span>Machine</span>
          <select
            name="source_id"
            value={sourceFilter}
            onChange={(e) => {
              const nextSource = e.target.value;
              setSourceFilter(nextSource);
              fetchLogs(nextSource, appliedSearch, 1);
            }}
            className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <option value="">All machines</option>
            {machineOptions.map(([sourceId, label]) => (
              <option key={sourceId} value={sourceId}>
                {label} ({sourceId})
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-xs font-medium text-muted">
          <span>Search logs</span>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
              aria-hidden="true"
            />
            <input
              type="search"
              name="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Reference, error code, employee, or repair task"
              className="min-h-11 w-full rounded-md border border-control bg-canvas py-2 pl-9 pr-3 text-sm text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-accent"
            />
          </div>
        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-md border border-ink bg-ink px-4 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:border-muted enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted sm:w-auto"
          >
            {isPending ? "Loading..." : "Search"}
          </button>

          <button
            type="button"
            disabled={isPending || (!hasActiveFilters && !searchInput)}
            onClick={handleResetFilters}
            className="inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-1.5 rounded-md border border-control bg-navy px-3.5 py-2 text-xs font-medium text-ink transition-colors enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted sm:w-auto"
          >
            <RotateCcw className="size-3.5 shrink-0" aria-hidden="true" />
            <span>Reset</span>
          </button>
        </div>
      </form>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-negative"
        >
          {error}
        </p>
      )}

      {!error && items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-md border border-line bg-surface p-10 text-center">
          <Wrench className="size-9 text-faint" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-semibold text-ink">
            {hasActiveFilters
              ? "No maintenance logs match filters"
              : "No maintenance work logged yet"}
          </h3>
          <p className="mt-1 max-w-sm text-xs text-muted">
            {hasActiveFilters
              ? "Clear or adjust the machine or search filters to view all repair history."
              : "Service commits submitted from machine diagnostics appear here chronologically."}
          </p>
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={handleResetFilters}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md border border-control bg-navy px-4 py-2 text-xs font-medium text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent"
            >
              Reset filters
            </button>
          ) : (
            <Link
              href={`/branches/${branchId}/machines`}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-md border border-control bg-navy px-4 py-2 text-xs font-medium text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent"
            >
              Go to machines
            </Link>
          )}
        </div>
      ) : (
        <ol
          aria-label="Maintenance commit timeline"
          className="relative space-y-4 before:absolute before:bottom-4 before:left-2.5 before:top-4 before:w-px before:bg-line sm:before:left-3"
        >
          {items.map((entry) => {
            const completed = entry.outcome === "completed";
            return (
              <li key={entry.id} className="relative pl-8 sm:pl-9">
                <span
                  aria-hidden="true"
                  className={`absolute left-0 top-5 flex size-5 items-center justify-center rounded-full border bg-surface sm:size-6 ${
                    completed
                      ? "border-positive/60 text-positive"
                      : "border-warning/60 text-warning"
                  }`}
                >
                  <GitCommitHorizontal className="size-3.5" />
                </span>

                <article className="rounded-md border border-line bg-surface p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded border border-warning/40 bg-warning/10 px-2 py-0.5 font-mono text-xs font-semibold text-warning">
                          {entry.error_code}
                        </span>
                        <h3 className="break-words text-sm font-semibold text-ink sm:text-base">
                          {entry.fault_name
                            ? entry.fault_name
                            : entry.asset_name}
                        </h3>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded border border-rule bg-raised px-2 py-1 font-mono text-xs text-muted">
                        {entry.reference_code}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium ${
                          completed
                            ? "border-positive/40 bg-positive/10 text-positive"
                            : "border-warning/40 bg-warning/10 text-warning"
                        }`}
                      >
                        {completed ? (
                          <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                        ) : (
                          <Clock className="size-3.5 shrink-0" aria-hidden="true" />
                        )}
                        <span>{completed ? "Completed" : "In progress"}</span>
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 rounded-md border border-rule bg-raised/40 p-3 sm:p-3.5">
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-ink">
                      {entry.work_done}
                    </pre>
                  </div>

                  <dl className="mt-3 grid grid-cols-1 gap-3 border-t border-rule pt-3 text-xs sm:grid-cols-3">
                    <div className="min-w-0">
                      <dt className="text-faint">Employee</dt>
                      <dd className="mt-0.5 break-words font-medium text-ink">
                        {entry.technician_name}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-faint">Machine</dt>
                      <dd className="mt-0.5 break-words font-medium text-ink">
                        {entry.asset_name} ({entry.source_id})
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-faint">Logged at</dt>
                      <dd
                        className="mt-0.5 break-words font-medium tabular-nums text-muted"
                        suppressHydrationWarning
                      >
                        {formatDateLabel(entry.created_at)}
                      </dd>
                    </div>
                  </dl>

                  {entry.incident_id && (
                    <div className="mt-3 border-t border-rule pt-2">
                      <Link
                        href={`/branches/${branchId}/incidents/${entry.incident_id}`}
                        className="inline-flex min-h-11 items-center text-xs font-medium text-accent hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        View linked incident →
                      </Link>
                    </div>
                  )}
                </article>
              </li>
            );
          })}
        </ol>
      )}

      {(page > 1 || hasMore) && (
        <nav
          aria-label="Maintenance log pagination"
          className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-xs text-muted tabular-nums">
            Page {page} of {totalPages} ({total} logs)
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isPending || page <= 1}
              onClick={() => fetchLogs(sourceFilter, appliedSearch, page - 1)}
              className="inline-flex min-h-11 min-w-11 flex-1 items-center justify-center rounded-md border border-control bg-navy px-3.5 py-2 text-xs font-medium text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted sm:flex-initial"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={isPending || !hasMore}
              onClick={() => fetchLogs(sourceFilter, appliedSearch, page + 1)}
              className="inline-flex min-h-11 min-w-11 flex-1 items-center justify-center rounded-md border border-control bg-navy px-3.5 py-2 text-xs font-medium text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted sm:flex-initial"
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
