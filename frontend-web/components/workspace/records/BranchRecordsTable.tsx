"use client";

import React, { useId, useMemo, useRef, useState, useTransition } from "react";
import {
  fetchBranchRecords,
  type FetchBranchRecordsResult,
} from "@/app/branches/[branchId]/overview/actions";
import type {
  BranchRecordItem,
  BranchRecordsPeriod,
  BranchRecordsResponse,
  BranchRecordsScope,
  EnvTelemetryRecordItem,
  LpgTelemetryRecordItem,
  MachineCycleRecordItem,
} from "@/lib/auth/business";

export interface BranchRecordsTableProps {
  branchId: string;
  allowedScopes: BranchRecordsScope[];
  defaultScope?: BranchRecordsScope;
  title?: string;
  showPrice?: boolean;
  initialData: BranchRecordsResponse | null;
  initialError?: string | null;
  onFetchRecords?: (
    branchId: string,
    scope: BranchRecordsScope,
    period: BranchRecordsPeriod,
    page: number
  ) => Promise<FetchBranchRecordsResult>;
}

interface ScopeViewState {
  page: number;
  period: BranchRecordsPeriod;
}

const SCOPE_LABELS: Record<BranchRecordsScope, string> = {
  lpg: "LPG & Gas",
  env: "Temp & Humidity",
  machines: "Machines",
};

const SCOPE_SUBJECTS: Record<BranchRecordsScope, string> = {
  lpg: "LPG records",
  env: "environmental records",
  machines: "machine cycle records",
};

const PERIOD_OPTIONS: Array<{ value: BranchRecordsPeriod; label: string }> = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "7 days" },
  { value: "month", label: "30 days" },
];

const MYT_FORMATTER = new Intl.DateTimeFormat("en-MY", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Kuala_Lumpur",
});

function formatMytTimestamp(iso: string | null): string {
  if (!iso) return "Unknown time";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "Unknown time";
  return `${MYT_FORMATTER.format(parsed)} MYT`;
}

function lpgTankSummary(item: LpgTelemetryRecordItem): string {
  if (item.maintenance_mode) return "Maintenance";
  if (item.weight_valid === false) return "Scale fault";
  if (item.lpg_percent === null) return "—";
  const weightPart =
    item.lpg_weight_kg !== null ? ` (${item.lpg_weight_kg.toFixed(2)} kg)` : "";
  return `${item.lpg_percent.toFixed(1)}%${weightPart}`;
}

function lpgGasSummary(item: LpgTelemetryRecordItem): string {
  const ppm = item.estimated_ppm !== null ? `${item.estimated_ppm.toFixed(1)} ppm` : "—";
  if (!item.gas_condition) return ppm;
  const label = item.gas_condition.charAt(0).toUpperCase() + item.gas_condition.slice(1);
  return `${ppm} (${label})`;
}

function lpgQualityLabel(item: LpgTelemetryRecordItem): string {
  if (item.maintenance_mode) return "Tank maintenance";
  if (item.weight_valid === false) return "Invalid weight reading";
  return "Synced telemetry";
}

function envQualityLabel(item: EnvTelemetryRecordItem): string {
  const issues: string[] = [];
  if (item.temperature_valid === false) issues.push("temp fault");
  if (item.humidity_valid === false) issues.push("humidity fault");
  if (issues.length > 0) return issues.join(", ");
  return "Synced telemetry";
}

function outcomeBadgeClass(outcome: string): string {
  const normalized = outcome.toLowerCase();
  if (normalized === "completed") {
    return "border-positive/40 bg-positive/10 text-positive";
  }
  if (normalized === "stopped" || normalized === "interrupted") {
    return "border-warning/40 bg-warning/10 text-warning";
  }
  if (normalized === "faulted" || normalized === "error") {
    return "border-negative/40 bg-negative/10 text-negative";
  }
  return "border-rule bg-raised text-muted";
}

function formatOutcome(outcome: string): string {
  if (!outcome) return "Recorded";
  return outcome.charAt(0).toUpperCase() + outcome.slice(1);
}

function cacheKey(scope: BranchRecordsScope, period: BranchRecordsPeriod, page: number): string {
  return `${scope}:${period}:${page}`;
}

/** Paginated, time-filtered cloud records viewer reusable across Overview, Machines, and LPG pages. */
export function BranchRecordsTable({
  branchId,
  allowedScopes,
  defaultScope,
  title = "Recent records",
  showPrice = false,
  initialData,
  initialError = null,
  onFetchRecords,
}: BranchRecordsTableProps) {
  const headingId = useId();
  const selectId = useId();
  const initialScope: BranchRecordsScope =
    defaultScope && allowedScopes.includes(defaultScope)
      ? defaultScope
      : allowedScopes[0] ?? "lpg";

  const [activeScope, setActiveScope] = useState<BranchRecordsScope>(initialScope);
  const [viewStateByScope, setViewStateByScope] = useState<
    Record<BranchRecordsScope, ScopeViewState>
  >({
    lpg: {
      page: initialData?.scope === "lpg" ? initialData.page : 1,
      period: initialData?.scope === "lpg" ? initialData.period : "all",
    },
    env: {
      page: initialData?.scope === "env" ? initialData.page : 1,
      period: initialData?.scope === "env" ? initialData.period : "all",
    },
    machines: {
      page: initialData?.scope === "machines" ? initialData.page : 1,
      period: initialData?.scope === "machines" ? initialData.period : "all",
    },
  });

  const [cache, setCache] = useState<Record<string, BranchRecordsResponse>>(() => {
    if (!initialData) return {};
    return {
      [cacheKey(initialData.scope, initialData.period, initialData.page)]: initialData,
    };
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [isPending, startTransition] = useTransition();
  const requestSeqRef = useRef(0);

  const currentView = viewStateByScope[activeScope];
  const activeKey = cacheKey(activeScope, currentView.period, currentView.page);
  const currentResponse = useMemo(() => {
    if (cache[activeKey]) return cache[activeKey];
    const fallbackKey = Object.keys(cache).find((key) => key.startsWith(`${activeScope}:`));
    return fallbackKey ? cache[fallbackKey] : null;
  }, [cache, activeKey, activeScope]);

  const fetcher = onFetchRecords ?? fetchBranchRecords;

  function loadRecords(
    targetScope: BranchRecordsScope,
    targetPeriod: BranchRecordsPeriod,
    targetPage: number
  ) {
    const seq = ++requestSeqRef.current;
    startTransition(async () => {
      const result = await fetcher(branchId, targetScope, targetPeriod, targetPage);
      if (seq !== requestSeqRef.current) return;
      if (result.ok) {
        const res = result.data;
        setCache((prev) => ({
          ...prev,
          [cacheKey(res.scope, res.period, res.page)]: res,
        }));
        setViewStateByScope((prev) => ({
          ...prev,
          [res.scope]: { page: res.page, period: res.period },
        }));
        setErrorMessage(null);
      } else {
        setErrorMessage(result.message);
      }
    });
  }

  function handleScopeChange(nextScope: BranchRecordsScope) {
    if (nextScope === activeScope) return;
    setActiveScope(nextScope);
    const nextView = viewStateByScope[nextScope];
    const targetKey = cacheKey(nextScope, nextView.period, nextView.page);
    if (!cache[targetKey]) {
      loadRecords(nextScope, nextView.period, nextView.page);
    }
  }

  function handlePeriodChange(nextPeriod: BranchRecordsPeriod) {
    setViewStateByScope((prev) => ({
      ...prev,
      [activeScope]: { page: 1, period: nextPeriod },
    }));
    loadRecords(activeScope, nextPeriod, 1);
  }

  function handlePageStep(delta: -1 | 1) {
    const totalPages = currentResponse?.total_pages ?? 1;
    const basePage = currentResponse?.page ?? currentView.page;
    const nextPage = Math.max(1, Math.min(totalPages, basePage + delta));
    if (nextPage === basePage) return;
    setViewStateByScope((prev) => ({
      ...prev,
      [activeScope]: { ...prev[activeScope], page: nextPage },
    }));
    loadRecords(activeScope, currentView.period, nextPage);
  }

  const items: BranchRecordItem[] = currentResponse?.items ?? [];
  const total = currentResponse?.total ?? 0;
  const page = currentResponse?.page ?? currentView.page;
  const pageSize = currentResponse?.page_size ?? 10;
  const totalPages = currentResponse?.total_pages ?? 1;

  const startIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIndex = total === 0 ? 0 : startIndex + items.length - 1;
  const countText =
    total === 0
      ? `0 ${SCOPE_SUBJECTS[activeScope]}`
      : `Showing ${startIndex}–${endIndex} of ${total} ${SCOPE_SUBJECTS[activeScope]}`;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-md border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 id={headingId} className="text-base font-bold text-ink">
          {title}
        </h2>
        <span className="text-xs font-medium text-muted">
          {isPending ? "Refreshing records..." : countText}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {allowedScopes.length > 1 ? (
          <div
            className="grid w-full grid-cols-2 gap-2 sm:inline-grid sm:w-auto"
            role="group"
            aria-label="Select record category"
          >
            {allowedScopes.map((scopeOption) => {
              const active = scopeOption === activeScope;
              return (
                <button
                  key={scopeOption}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleScopeChange(scopeOption)}
                  className={
                    active
                      ? "min-h-11 whitespace-nowrap rounded-md border border-navy-selected bg-navy-selected px-4 text-xs font-semibold text-ink transition-colors focus-visible:outline-2 focus-visible:outline-accent"
                      : "min-h-11 whitespace-nowrap rounded-md border border-control bg-canvas px-4 text-xs font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                  }
                >
                  {SCOPE_LABELS[scopeOption]}
                </button>
              );
            })}
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          <label htmlFor={selectId} className="shrink-0 text-xs text-muted">
            Time range
          </label>
          <select
            id={selectId}
            value={currentView.period}
            onChange={(e) => handlePeriodChange(e.target.value as BranchRecordsPeriod)}
            className="min-h-11 flex-1 rounded-md border border-control bg-raised px-3 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent sm:flex-initial"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMessage && (
        <div
          role="status"
          className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-xs text-warning"
        >
          {errorMessage}
        </div>
      )}

      {/* Mobile Cards (320px - 767px) */}
      <div className="mt-4 space-y-3 md:hidden">
        {items.length === 0 ? (
          <div className="rounded-md border border-rule bg-raised px-4 py-6 text-center text-xs text-muted">
            No matching {SCOPE_SUBJECTS[activeScope]} in this time range.
          </div>
        ) : (
          items.map((item) => {
            if (activeScope === "lpg") {
              const lpg = item as LpgTelemetryRecordItem;
              return (
                <article
                  key={lpg.record_id}
                  className="rounded-md border border-rule bg-raised p-3.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-ink">{lpg.device_label}</span>
                    <span className="shrink-0 text-muted">{lpgQualityLabel(lpg)}</span>
                  </div>
                  <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
                    <div>
                      <dt className="text-muted">Sample time</dt>
                      <dd className="mt-0.5 text-ink">{formatMytTimestamp(lpg.sample_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Gas tank</dt>
                      <dd className="mt-0.5 tabular-nums text-ink">{lpgTankSummary(lpg)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-muted">Est. PPM</dt>
                      <dd className="mt-0.5 tabular-nums text-ink">{lpgGasSummary(lpg)}</dd>
                    </div>
                  </dl>
                </article>
              );
            }

            if (activeScope === "env") {
              const env = item as EnvTelemetryRecordItem;
              return (
                <article
                  key={env.record_id}
                  className="rounded-md border border-rule bg-raised p-3.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-ink">{env.device_label}</span>
                    <span className="shrink-0 text-muted">{envQualityLabel(env)}</span>
                  </div>
                  <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
                    <div className="col-span-2">
                      <dt className="text-muted">Sample time</dt>
                      <dd className="mt-0.5 text-ink">{formatMytTimestamp(env.sample_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Temperature</dt>
                      <dd className="mt-0.5 tabular-nums text-ink">
                        {env.temperature !== null ? `${env.temperature.toFixed(1)} °C` : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Humidity</dt>
                      <dd className="mt-0.5 tabular-nums text-ink">
                        {env.humidity !== null ? `${env.humidity.toFixed(1)} %` : "—"}
                      </dd>
                    </div>
                  </dl>
                </article>
              );
            }

            const cycle = item as MachineCycleRecordItem;
            return (
              <article
                key={cycle.cycle_id}
                className="rounded-md border border-rule bg-raised p-3.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-ink">{cycle.device_label}</span>
                  <span
                    className={`shrink-0 rounded border px-2 py-0.5 text-[11px] font-medium ${outcomeBadgeClass(
                      cycle.outcome
                    )}`}
                  >
                    {formatOutcome(cycle.outcome)}
                  </span>
                </div>
                <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
                  <div>
                    <dt className="text-muted">Recorded at</dt>
                    <dd className="mt-0.5 text-ink">
                      {formatMytTimestamp(cycle.finished_at ?? cycle.started_at)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Program</dt>
                    <dd className="mt-0.5 text-ink">{cycle.program_label}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Duration</dt>
                    <dd className="mt-0.5 tabular-nums text-ink">
                      {cycle.running_minutes.toFixed(1)} min
                    </dd>
                  </div>
                  {showPrice && (
                    <div>
                      <dt className="text-muted">Amount</dt>
                      <dd className="mt-0.5 tabular-nums text-ink">
                        {cycle.price_myr ? `RM ${cycle.price_myr}` : "—"}
                      </dd>
                    </div>
                  )}
                </dl>
              </article>
            );
          })
        )}
      </div>

      {/* Desktop & Tablet Scrollable Table (>= 768px) */}
      <div
        className="mt-4 hidden overflow-x-auto rounded-md border border-rule md:block"
        role="region"
        aria-label={`${title} table`}
      >
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-raised/60 text-muted">
            {activeScope === "lpg" && (
              <tr>
                <th scope="col" className="whitespace-nowrap px-3.5 py-3 font-medium">
                  Node
                </th>
                <th scope="col" className="whitespace-nowrap px-3.5 py-3 font-medium">
                  Sample time
                </th>
                <th scope="col" className="whitespace-nowrap px-3.5 py-3 text-right font-medium">
                  Gas tank
                </th>
                <th scope="col" className="whitespace-nowrap px-3.5 py-3 text-right font-medium">
                  Est. PPM
                </th>
                <th scope="col" className="whitespace-nowrap px-3.5 py-3 font-medium">
                  Status
                </th>
              </tr>
            )}
            {activeScope === "env" && (
              <tr>
                <th scope="col" className="whitespace-nowrap px-3.5 py-3 font-medium">
                  Node
                </th>
                <th scope="col" className="whitespace-nowrap px-3.5 py-3 font-medium">
                  Sample time
                </th>
                <th scope="col" className="whitespace-nowrap px-3.5 py-3 text-right font-medium">
                  Temperature
                </th>
                <th scope="col" className="whitespace-nowrap px-3.5 py-3 text-right font-medium">
                  Humidity
                </th>
                <th scope="col" className="whitespace-nowrap px-3.5 py-3 font-medium">
                  Status
                </th>
              </tr>
            )}
            {activeScope === "machines" && (
              <tr>
                <th scope="col" className="whitespace-nowrap px-3.5 py-3 font-medium">
                  Machine
                </th>
                <th scope="col" className="whitespace-nowrap px-3.5 py-3 font-medium">
                  Recorded at
                </th>
                <th scope="col" className="whitespace-nowrap px-3.5 py-3 font-medium">
                  Program
                </th>
                <th scope="col" className="whitespace-nowrap px-3.5 py-3 text-right font-medium">
                  Duration
                </th>
                {showPrice && (
                  <th scope="col" className="whitespace-nowrap px-3.5 py-3 text-right font-medium">
                    Amount
                  </th>
                )}
                <th scope="col" className="whitespace-nowrap px-3.5 py-3 font-medium">
                  Outcome
                </th>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-rule bg-surface text-ink">
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={activeScope === "machines" && showPrice ? 6 : 5}
                  className="px-3.5 py-6 text-center text-muted"
                >
                  No matching {SCOPE_SUBJECTS[activeScope]} in this time range.
                </td>
              </tr>
            ) : (
              items.map((item) => {
                if (activeScope === "lpg") {
                  const lpg = item as LpgTelemetryRecordItem;
                  return (
                    <tr key={lpg.record_id} className="hover:bg-raised/30">
                      <td className="whitespace-nowrap px-3.5 py-2.5 font-medium">
                        {lpg.device_label}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-muted">
                        {formatMytTimestamp(lpg.sample_at)}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums">
                        {lpgTankSummary(lpg)}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums">
                        {lpgGasSummary(lpg)}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-muted">
                        {lpgQualityLabel(lpg)}
                      </td>
                    </tr>
                  );
                }

                if (activeScope === "env") {
                  const env = item as EnvTelemetryRecordItem;
                  return (
                    <tr key={env.record_id} className="hover:bg-raised/30">
                      <td className="whitespace-nowrap px-3.5 py-2.5 font-medium">
                        {env.device_label}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-muted">
                        {formatMytTimestamp(env.sample_at)}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums">
                        {env.temperature !== null ? `${env.temperature.toFixed(1)} °C` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums">
                        {env.humidity !== null ? `${env.humidity.toFixed(1)} %` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-muted">
                        {envQualityLabel(env)}
                      </td>
                    </tr>
                  );
                }

                const cycle = item as MachineCycleRecordItem;
                return (
                  <tr key={cycle.cycle_id} className="hover:bg-raised/30">
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-medium">
                      {cycle.device_label}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-muted">
                      {formatMytTimestamp(cycle.finished_at ?? cycle.started_at)}
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2.5">{cycle.program_label}</td>
                    <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums">
                      {cycle.running_minutes.toFixed(1)} min
                    </td>
                    {showPrice && (
                      <td className="whitespace-nowrap px-3.5 py-2.5 text-right tabular-nums">
                        {cycle.price_myr ? `RM ${cycle.price_myr}` : "—"}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3.5 py-2.5">
                      <span
                        className={`inline-block rounded border px-2 py-0.5 text-[11px] font-medium ${outcomeBadgeClass(
                          cycle.outcome
                        )}`}
                      >
                        {formatOutcome(cycle.outcome)}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs text-muted">
          Page {page} of {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isPending || page <= 1}
            onClick={() => handlePageStep(-1)}
            className="min-h-11 flex-1 rounded-md border border-control bg-navy px-4 text-xs font-medium text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 sm:flex-initial"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={isPending || page >= totalPages}
            onClick={() => handlePageStep(1)}
            className="min-h-11 flex-1 rounded-md border border-control bg-navy px-4 text-xs font-medium text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 sm:flex-initial"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
