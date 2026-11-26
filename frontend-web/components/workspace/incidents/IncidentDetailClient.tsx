"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import type { IncidentDetail } from "@/lib/auth/business";
import { resolveIncidentAction } from "@/app/branches/[branchId]/incidents/[incidentId]/actions";
import { useActionToast } from "@/components/workspace/common/ActionToastContext";
import { formatMytShortDateTime } from "@/lib/formatDate";

interface IncidentDetailClientProps {
  branchId: string;
  branchOpen?: boolean;
  userId: string;
  userRole: string;
  defaultTechnicianName?: string;
  initialIncident: IncidentDetail;
}

function readFiniteNumber(val: unknown): number | null {
  return typeof val === "number" && Number.isFinite(val) ? val : null;
}

function formatResolverRole(
  role: string | null | undefined,
): { label: string; className: string } | null {
  if (!role) return null;
  switch (role) {
    case "owner":
      return {
        label: "Owner",
        className:
          "inline-flex items-center rounded border border-accent/30 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent",
      };
    case "branch_manager":
      return {
        label: "Branch Manager",
        className:
          "inline-flex items-center rounded border border-line bg-raised px-2 py-0.5 text-xs font-medium text-ink",
      };
    case "machine_maintenance":
      return {
        label: "Machine Maintenance",
        className:
          "inline-flex items-center rounded border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning",
      };
    case "lpg_maintenance":
      return {
        label: "LPG Maintenance",
        className:
          "inline-flex items-center rounded border border-positive/30 bg-positive/10 px-2 py-0.5 text-xs font-medium text-positive",
      };
    default:
      return {
        label: role,
        className:
          "inline-flex items-center rounded border border-line bg-raised px-2 py-0.5 text-xs font-medium text-muted",
      };
  }
}

export function IncidentDetailClient({
  branchId,
  userRole,
  defaultTechnicianName,
  initialIncident,
}: IncidentDetailClientProps) {
  const router = useRouter();
  const { notify } = useActionToast();
  const [incident, setIncident] = useState<IncidentDetail>(initialIncident);
  const [observation, setObservation] = useState(initialIncident.resolution_note ?? "");
  const [isPending, startTransition] = useTransition();

  const isResolved = incident.workflow_state === "resolved";
  const isEdgeActive = incident.edge_condition_state === "active";
  const isLpgGasHazard =
    incident.domain === "lpg" &&
    (incident.condition_key === "gas_concentration" ||
      incident.condition_key === "gas_leak" ||
      (incident.fault_code ?? "").toUpperCase().startsWith("GAS_"));

  const inspectHref =
    incident.domain === "lpg"
      ? `/branches/${branchId}/lpg`
      : `/branches/${branchId}/machines`;

  const canResolve = !isResolved && !isEdgeActive && observation.trim().length >= 3;

  const evidence = incident.evidence_snapshot ?? {};
  const peakPpm = readFiniteNumber(evidence.peak_ppm);
  const latestPpm = readFiniteNumber(evidence.estimated_ppm);
  const durationSeconds = readFiniteNumber(evidence.duration_seconds);
  const isSustained = evidence.sustained === true || (durationSeconds !== null && durationSeconds >= 60);

  const severityBadge =
    incident.severity === "critical"
      ? {
          label: "Critical",
          className: "border-negative/40 bg-negative/15 text-negative",
        }
      : {
          label: "Warning",
          className: "border-warning/40 bg-warning/15 text-warning",
        };

  const handleResolve = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending || !canResolve) return;

    const trimmed = observation.trim();
    const toastId = `incident-resolve-${incident.id}`;
    notify({
      id: toastId,
      kind: "info",
      title: "Resolving incident",
      message: `Marking ${incident.reference_code} as resolved…`,
    });

    startTransition(async () => {
      const res = await resolveIncidentAction(branchId, incident.id, trimmed);
      if (!res.ok) {
        notify({
          id: toastId,
          kind: "error",
          title: "Could not resolve incident",
          message: res.message,
        });
        return;
      }
      setIncident((prev) => ({
        ...prev,
        ...res.incident,
        resolved_by_name:
          res.incident.resolved_by_name ??
          (defaultTechnicianName?.trim() || prev.resolved_by_name || null),
        resolved_by_role:
          res.incident.resolved_by_role ??
          (userRole || prev.resolved_by_role || null),
        resolution_note: res.incident.resolution_note ?? trimmed,
      }));
      notify({
        id: toastId,
        kind: "success",
        title: "Incident resolved",
        message: `${incident.reference_code} has been marked as resolved.`,
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {/* Header: Back to Incidents on the left + Device Name, Incident Code & Severity only */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={`/branches/${branchId}/incidents`}
            className="inline-flex min-h-11 min-w-11 w-full shrink-0 items-center justify-center gap-2 rounded-md border border-control bg-navy px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent sm:w-auto"
          >
            <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
            <span>Back to Incidents</span>
          </Link>

          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <h1 className="min-w-0 break-words text-xl font-semibold tracking-tight text-ink sm:text-2xl">
              {incident.asset_name}
            </h1>
            <span className="inline-flex shrink-0 items-center rounded border border-rule bg-surface px-2.5 py-1 text-xs font-semibold tabular-nums text-muted">
              {incident.reference_code}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded border px-2.5 py-1 text-xs font-semibold ${severityBadge.className}`}
          >
            {severityBadge.label}
          </span>
          {isResolved && (
            <span className="inline-flex items-center gap-1.5 rounded border border-positive/40 bg-positive/10 px-2.5 py-1 text-xs font-semibold text-positive">
              <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
              <span>Resolved</span>
            </span>
          )}
        </div>
      </div>

      {/* Incident Explanation Section */}
      {incident.diagnosis && (
        <section className="space-y-4 rounded-md border border-line bg-surface p-5 md:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-2.5">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {incident.diagnosis.fault_code && (
                    <span className="rounded border border-rule bg-raised px-2 py-0.5 text-xs font-semibold tabular-nums text-ink">
                      {incident.diagnosis.fault_code}
                    </span>
                  )}
                  <h2 className="text-base font-semibold text-ink">
                    {incident.diagnosis.title}
                  </h2>
                </div>
                <p className="text-sm text-ink">{incident.diagnosis.plain_explanation}</p>
              </div>
            </div>

            {isLpgGasHazard && (
              <span
                className={`inline-flex shrink-0 self-start items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold tabular-nums ${
                  isEdgeActive
                    ? "border-negative/40 bg-negative/15 text-negative"
                    : "border-positive/40 bg-positive/10 text-positive"
                }`}
              >
                {isEdgeActive ? (
                  <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>
                  {isEdgeActive
                    ? isSustained
                      ? "Sustained leak active"
                      : "Elevated gas active"
                    : "Burst subsided — Below threshold"}
                  {peakPpm !== null
                    ? ` (Peak ${peakPpm.toFixed(1)} ppm)`
                    : latestPpm !== null
                      ? ` (${latestPpm.toFixed(1)} ppm)`
                      : ""}
                </span>
              </span>
            )}
          </div>

          <div
            className={`rounded-md border px-3.5 py-2.5 text-xs text-ink ${
              incident.severity === "critical"
                ? "border-negative/40 bg-negative/10"
                : "border-warning/30 bg-warning/10"
            }`}
          >
            <span
              className={`font-semibold ${
                incident.severity === "critical" ? "text-negative" : "text-warning"
              }`}
            >
              Safety:{" "}
            </span>
            {incident.diagnosis.safety_precautions}
          </div>

          {incident.diagnosis.likely_causes.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-ink">Likely Causes</h3>
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
                {incident.diagnosis.likely_causes.map((cause) => (
                  <li key={cause}>{cause}</li>
                ))}
              </ul>
            </div>
          )}

          {incident.diagnosis.troubleshooting_steps.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-ink">Troubleshooting Steps</h3>
              <ol className="list-decimal space-y-1 pl-4 text-xs text-ink">
                {incident.diagnosis.troubleshooting_steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {/* Incident Response Section */}
      <section className="space-y-4 rounded-md border border-line bg-surface p-5 md:p-6">
        <div className="flex flex-col gap-3 border-b border-rule pb-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-base font-semibold text-ink">Incident Response</h2>

          <Link
            href={inspectHref}
            className="inline-flex min-h-11 min-w-11 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent sm:w-auto"
          >
            <span>{incident.domain === "machine" ? "Go to Machines" : "Inspect Device"}</span>
            <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
          </Link>
        </div>

        {isResolved ? (
          <div className="space-y-2.5 rounded-md border border-positive/30 bg-positive/10 p-4 text-sm text-ink">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <CheckCircle2
                  className="size-4 shrink-0 text-positive"
                  aria-hidden="true"
                />
                <span className="break-words font-semibold text-ink">
                  Resolved by {incident.resolved_by_name?.trim() || "Staff member"}
                </span>
                {(() => {
                  const roleBadge = formatResolverRole(incident.resolved_by_role);
                  return roleBadge ? (
                    <span className={roleBadge.className}>{roleBadge.label}</span>
                  ) : null;
                })()}
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {formatMytShortDateTime(incident.resolved_at)}
              </span>
            </div>
            {incident.resolution_note && (
              <p className="whitespace-pre-wrap break-words border-t border-positive/20 pt-2.5 text-sm text-ink">
                {incident.resolution_note}
              </p>
            )}
          </div>
        ) : incident.domain === "machine" ? (
          <div className="rounded-md border border-rule bg-raised/40 p-4 text-xs leading-relaxed text-muted sm:text-sm">
            <p className="text-ink">
              Machine breakdowns are serviced directly from the Machines workspace. Open this unit via{" "}
              <span className="font-semibold">Go to Machines</span>, put it under maintenance, perform the repair, and click{" "}
              <span className="font-semibold">Complete Service &amp; Return Online</span> — this incident closes automatically once the machine returns to Idle.
            </p>
          </div>
        ) : (
          <form onSubmit={handleResolve} className="space-y-4">
            {isEdgeActive && (
              <div
                role="alert"
                className={`rounded-md border p-3.5 text-xs ${
                  isLpgGasHazard
                    ? "border-negative/50 bg-negative/10 text-ink"
                    : "border-warning/40 bg-warning/10 text-warning"
                }`}
              >
                {isLpgGasHazard ? (
                  <p>
                    <span className="font-semibold text-negative">
                      IMMINENT FIRE &amp; EXPLOSION HAZARD:{" "}
                    </span>
                    Elevated LPG gas is still above the danger threshold inside the enclosed cylinder room
                    {latestPpm !== null ? ` (${latestPpm.toFixed(1)} ppm)` : ""}. Do not enter the room or
                    operate electrical switches. Isolate the external main gas shutoff if safe and evacuate.
                    This incident can only be marked resolved after sensor readings drop safely below the danger threshold.
                  </p>
                ) : (
                  <p>
                    Device fault is still active. Use Inspect Device to address the fault before marking this incident as resolved.
                  </p>
                )}
              </div>
            )}

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted">
                Technician observation
              </span>
              <textarea
                rows={4}
                required
                minLength={3}
                value={observation}
                onChange={(e) => setObservation(e.target.value)}
                placeholder="Enter inspection remarks or corrective observations regarding this incident..."
                className="w-full rounded-md border border-control bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-faint focus-visible:outline-2 focus-visible:outline-accent"
              />
            </label>

            <div className="flex flex-col sm:flex-row sm:justify-end">
              <button
                type="submit"
                disabled={isPending || !canResolve}
                className="inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-md border border-ink bg-ink px-4 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:border-muted enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted sm:w-auto"
              >
                {isPending ? "Saving…" : "Mark incident as resolved"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
