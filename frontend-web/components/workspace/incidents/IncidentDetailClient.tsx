"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Clock,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import type { IncidentDetail, MaintenanceTaskItem } from "@/lib/auth/business";
import {
  acknowledgeIncidentAction,
  createMaintenanceTaskAction,
  resolveIncidentAction,
  updateMaintenanceTaskAction,
} from "@/app/branches/[branchId]/incidents/[incidentId]/actions";
import { useActionToast } from "@/components/workspace/common/ActionToastContext";

interface IncidentDetailClientProps {
  branchId: string;
  userId: string;
  userRole: string;
  initialIncident: IncidentDetail;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function workflowLabel(state: IncidentDetail["workflow_state"]): string {
  if (state === "acknowledged") return "Acknowledged";
  if (state === "resolved") return "Resolved";
  return "Open";
}

function taskStatusLabel(status: MaintenanceTaskItem["status"]): string {
  if (status === "in_progress") return "In progress";
  if (status === "completed") return "Completed";
  return "Assigned";
}

export function IncidentDetailClient({
  branchId,
  userId,
  userRole,
  initialIncident,
}: IncidentDetailClientProps) {
  const router = useRouter();
  const { notify } = useActionToast();
  const [incident, setIncident] = useState<IncidentDetail>(initialIncident);
  const [ackNote, setAckNote] = useState("");
  const [resolutionNote, setResolutionNote] = useState(initialIncident.resolution_note ?? "");
  const [taskTitle, setTaskTitle] = useState(
    `${initialIncident.fault_code || initialIncident.condition_key} inspection on ${initialIncident.asset_name}`,
  );
  const [assigneeId, setAssigneeId] = useState(
    initialIncident.eligible_assignees[0]?.user_id ?? "",
  );
  const [taskNotes, setTaskNotes] = useState("");
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialIncident.tasks.map((t) => [t.id, t.service_notes ?? ""])),
  );
  const [isPending, startTransition] = useTransition();

  const canManage = userRole === "owner" || userRole === "branch_manager";
  const backHref =
    incident.domain === "lpg"
      ? `/branches/${branchId}/lpg`
      : `/branches/${branchId}/machines`;
  const canResolve =
    incident.workflow_state !== "resolved" &&
    incident.edge_condition_state === "cleared" &&
    resolutionNote.trim().length >= 3;

  const handleAcknowledge = () => {
    const toastId = `incident-ack-${incident.id}`;
    notify({
      id: toastId,
      kind: "info",
      title: "Acknowledging incident",
      message: `Recording acknowledgement for ${incident.reference_code}…`,
    });
    startTransition(async () => {
      const res = await acknowledgeIncidentAction(branchId, incident.id, ackNote.trim() || undefined);
      if (!res.ok) {
        notify({
          id: toastId,
          kind: "error",
          title: "Acknowledge failed",
          message: res.message,
        });
        return;
      }
      setIncident((prev) => ({ ...prev, ...res.incident }));
      setAckNote("");
      notify({
        id: toastId,
        kind: "success",
        title: "Incident acknowledged",
        message: `${incident.reference_code} marked as acknowledged.`,
      });
      router.refresh();
    });
  };

  const handleResolve = (event: React.FormEvent) => {
    event.preventDefault();
    const toastId = `incident-resolve-${incident.id}`;
    notify({
      id: toastId,
      kind: "info",
      title: "Resolving incident",
      message: `Closing incident ${incident.reference_code}…`,
    });
    startTransition(async () => {
      const res = await resolveIncidentAction(branchId, incident.id, resolutionNote.trim());
      if (!res.ok) {
        notify({
          id: toastId,
          kind: "error",
          title: "Resolution failed",
          message: res.message,
        });
        return;
      }
      setIncident((prev) => ({ ...prev, ...res.incident }));
      notify({
        id: toastId,
        kind: "success",
        title: "Incident resolved",
        message: `${incident.reference_code} marked as resolved.`,
      });
      router.refresh();
    });
  };

  const handleAssignTask = (event: React.FormEvent) => {
    event.preventDefault();
    if (!assigneeId || taskTitle.trim().length < 3) return;
    const toastId = `incident-task-assign-${incident.id}`;
    notify({
      id: toastId,
      kind: "info",
      title: "Assigning task",
      message: "Creating maintenance task…",
    });
    startTransition(async () => {
      const res = await createMaintenanceTaskAction(branchId, incident.id, {
        domain: incident.domain,
        title: taskTitle.trim(),
        assigned_to_user_id: assigneeId,
        service_notes: taskNotes.trim() || undefined,
      });
      if (!res.ok) {
        notify({
          id: toastId,
          kind: "error",
          title: "Assignment failed",
          message: res.message,
        });
        return;
      }
      setIncident((prev) => ({
        ...prev,
        tasks: [...prev.tasks, res.task],
      }));
      setDraftNotes((prev) => ({ ...prev, [res.task.id]: res.task.service_notes ?? "" }));
      setTaskNotes("");
      notify({
        id: toastId,
        kind: "success",
        title: "Maintenance task assigned",
        message: `Task "${res.task.title}" assigned.`,
      });
      router.refresh();
    });
  };

  const handleUpdateTask = (
    taskId: string,
    status: "assigned" | "in_progress" | "completed",
  ) => {
    const toastId = `incident-task-${taskId}`;
    notify({
      id: toastId,
      kind: "info",
      title: "Updating task",
      message: `Updating task status to ${taskStatusLabel(status)}…`,
    });
    startTransition(async () => {
      const res = await updateMaintenanceTaskAction(branchId, incident.id, taskId, {
        status,
        service_notes: draftNotes[taskId] ?? "",
      });
      if (!res.ok) {
        notify({
          id: toastId,
          kind: "error",
          title: "Task update failed",
          message: res.message,
        });
        return;
      }
      setIncident((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) => (t.id === taskId ? res.task : t)),
      }));
      notify({
        id: toastId,
        kind: "success",
        title: "Task updated",
        message: `Task updated to ${taskStatusLabel(status)}.`,
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded border border-rule bg-surface px-2 py-0.5 font-mono text-xs font-semibold text-ink">
              {incident.reference_code}
            </span>
            <h1 className="text-lg font-semibold text-ink sm:text-xl">
              {incident.asset_name}
            </h1>
          </div>
          <p className="break-words text-sm text-muted">{incident.summary}</p>
        </div>

        <Link
          href={backHref}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-md border border-control bg-navy px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to {incident.domain === "lpg" ? "LPG Safety" : "Machines"}
        </Link>
      </div>

      {/* Physical edge condition state kept distinct from staff workflow state */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-line bg-surface p-4">
          <span className="text-xs text-muted">Physical Condition (Edge)</span>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-semibold ${
                incident.edge_condition_state === "active"
                  ? "border-negative/40 bg-negative/10 text-negative"
                  : "border-positive/40 bg-positive/10 text-positive"
              }`}
            >
              {incident.edge_condition_state === "active" ? (
                <AlertTriangle className="size-3.5" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
              )}
              {incident.edge_condition_state === "active" ? "Active Fault / Condition" : "Cleared"}
            </span>
          </div>
          <p className="mt-2 text-xs text-faint">
            Last edge sample: {formatDateTime(incident.last_sample_at)}
          </p>
        </div>

        <div className="rounded-md border border-line bg-surface p-4">
          <span className="text-xs text-muted">Staff Workflow State</span>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded border px-2.5 py-1 text-xs font-semibold ${
                incident.workflow_state === "resolved"
                  ? "border-positive/40 bg-positive/10 text-positive"
                  : incident.workflow_state === "acknowledged"
                    ? "border-warning/40 bg-warning/10 text-warning"
                    : "border-negative/40 bg-negative/10 text-negative"
              }`}
            >
              {workflowLabel(incident.workflow_state)}
            </span>
          </div>
          <p className="mt-2 text-xs text-faint">
            Opened: {formatDateTime(incident.opened_at)}
          </p>
        </div>

        <div className="rounded-md border border-line bg-surface p-4">
          <span className="text-xs text-muted">Severity &amp; Source</span>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded border px-2.5 py-1 text-xs font-semibold uppercase ${
                incident.severity === "critical"
                  ? "border-negative/40 bg-negative/10 text-negative"
                  : "border-warning/40 bg-warning/10 text-warning"
              }`}
            >
              {incident.severity}
            </span>
            <span className="font-mono text-xs text-muted">{incident.source_id}</span>
          </div>
          <p className="mt-2 text-xs text-faint">
            Rule: {incident.rule_version} (rev {incident.revision})
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Explainable Diagnosis & Troubleshooting Playbook */}
          {incident.diagnosis && (
            <section className="space-y-4 rounded-md border border-line bg-surface p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-2.5">
                  <ShieldAlert className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden="true" />
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-rule bg-raised px-2 py-0.5 font-mono text-xs font-semibold text-ink">
                        {incident.diagnosis.fault_code}
                      </span>
                      <h2 className="text-base font-semibold text-ink">
                        {incident.diagnosis.title}
                      </h2>
                    </div>
                    <p className="text-sm text-ink">{incident.diagnosis.plain_explanation}</p>
                  </div>
                </div>
                <span
                  className={`inline-flex shrink-0 self-start rounded border px-2 py-0.5 text-xs font-medium ${
                    incident.diagnosis.source_status === "placeholder_washer_guide"
                      ? "border-warning/40 bg-warning/10 text-warning"
                      : incident.diagnosis.source_status === "spinsense_safety_rule"
                        ? "border-line bg-raised text-muted"
                        : "border-negative/40 bg-negative/10 text-negative"
                  }`}
                >
                  {incident.diagnosis.source_status === "placeholder_washer_guide"
                    ? "Placeholder guide"
                    : incident.diagnosis.source_status === "spinsense_safety_rule"
                      ? "SpinSense safety rule"
                      : "Unverified vendor code"}
                </span>
              </div>

              <p className="text-xs text-muted">{incident.diagnosis.disclaimer}</p>

              <div className="rounded-md border border-warning/30 bg-warning/10 px-3.5 py-2.5 text-xs text-ink">
                <span className="font-semibold text-warning">Safety: </span>
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

          {/* Maintenance Tasks */}
          <section className="space-y-4 rounded-md border border-line bg-surface p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Wrench className="size-4 text-accent" aria-hidden="true" />
              <h2 className="text-base font-semibold text-ink">Maintenance Tasks</h2>
            </div>

            {incident.tasks.length === 0 ? (
              <p className="rounded-md border border-rule bg-raised/30 p-3 text-xs text-muted">
                No specialist work tasks assigned yet.
              </p>
            ) : (
              <div className="space-y-3">
                {incident.tasks.map((task) => {
                  const canEditTask = canManage || task.assigned_to_user_id === userId;
                  return (
                    <div
                      key={task.id}
                      className="space-y-3 rounded-md border border-rule bg-raised/30 p-3.5"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-ink">{task.title}</h3>
                          <p className="text-xs text-muted">
                            Assigned to {task.assignee_name || "Specialist"} ({task.assignee_role || task.domain})
                          </p>
                        </div>
                        <span
                          className={`inline-flex shrink-0 self-start rounded border px-2 py-0.5 text-xs font-medium ${
                            task.status === "completed"
                              ? "border-positive/40 bg-positive/10 text-positive"
                              : task.status === "in_progress"
                                ? "border-warning/40 bg-warning/10 text-warning"
                                : "border-line bg-surface text-ink"
                          }`}
                        >
                          {taskStatusLabel(task.status)}
                        </span>
                      </div>

                      {canEditTask ? (
                        <div className="space-y-2.5">
                          <label className="block space-y-1">
                            <span className="text-xs text-muted">Service notes</span>
                            <textarea
                              rows={2}
                              value={draftNotes[task.id] ?? ""}
                              onChange={(e) =>
                                setDraftNotes((prev) => ({
                                  ...prev,
                                  [task.id]: e.target.value,
                                }))
                              }
                              className="w-full rounded-md border border-rule bg-surface px-3 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent"
                              placeholder="Document inspection and repair findings..."
                            />
                          </label>
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <button
                              type="button"
                              disabled={isPending || task.status === "in_progress"}
                              onClick={() => handleUpdateTask(task.id, "in_progress")}
                              className="inline-flex min-h-11 items-center justify-center rounded-md border border-control bg-navy px-3.5 text-xs font-semibold text-ink transition-colors enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
                            >
                              Mark In Progress
                            </button>
                            <button
                              type="button"
                              disabled={isPending || task.status === "completed"}
                              onClick={() => handleUpdateTask(task.id, "completed")}
                              className="inline-flex min-h-11 items-center justify-center rounded-md border border-ink bg-ink px-3.5 text-xs font-semibold text-surface transition-colors enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted"
                            >
                              Mark Completed
                            </button>
                          </div>
                        </div>
                      ) : (
                        task.service_notes && (
                          <p className="text-xs text-muted">{task.service_notes}</p>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {canManage && (
              <form
                onSubmit={handleAssignTask}
                className="space-y-3 border-t border-rule pt-4"
              >
                <h3 className="text-xs font-semibold text-ink">Assign Specialist Task</h3>
                {incident.eligible_assignees.length === 0 ? (
                  <p className="text-xs text-warning">
                    No active {incident.domain === "lpg" ? "LPG maintenance" : "machine maintenance"} specialist is assigned to this branch.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="space-y-1">
                        <span className="text-xs text-muted">Specialist</span>
                        <select
                          value={assigneeId}
                          onChange={(e) => setAssigneeId(e.target.value)}
                          className="min-h-11 w-full rounded-md border border-rule bg-raised px-3 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          {incident.eligible_assignees.map((a) => (
                            <option key={a.user_id} value={a.user_id}>
                              {a.full_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs text-muted">Task title</span>
                        <input
                          type="text"
                          required
                          minLength={3}
                          value={taskTitle}
                          onChange={(e) => setTaskTitle(e.target.value)}
                          className="min-h-11 w-full rounded-md border border-rule bg-raised px-3 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent"
                        />
                      </label>
                    </div>
                    <label className="block space-y-1">
                      <span className="text-xs text-muted">Instructions (optional)</span>
                      <input
                        type="text"
                        value={taskNotes}
                        onChange={(e) => setTaskNotes(e.target.value)}
                        className="min-h-11 w-full rounded-md border border-rule bg-raised px-3 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent"
                        placeholder="Add specific check or safety notes..."
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={isPending || !assigneeId}
                      className="inline-flex min-h-11 items-center justify-center rounded-md border border-control bg-navy px-4 text-xs font-semibold text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
                    >
                      Assign Task
                    </button>
                  </>
                )}
              </form>
            )}
          </section>

          {/* Linked Customer Reports */}
          <section className="space-y-3 rounded-md border border-line bg-surface p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <ClipboardList className="size-4 text-accent" aria-hidden="true" />
              <h2 className="text-base font-semibold text-ink">Linked Customer Reports</h2>
            </div>
            {incident.linked_reports.length === 0 ? (
              <p className="text-xs text-muted">No customer reports linked to this incident.</p>
            ) : (
              <div className="space-y-2.5">
                {incident.linked_reports.map((rep) => (
                  <div
                    key={rep.id}
                    className="rounded-md border border-rule bg-raised/30 p-3 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-ink">
                        {rep.reference_code}
                      </span>
                      <span className="text-faint">{formatDateTime(rep.created_at)}</span>
                    </div>
                    <p className="mt-1 text-ink">{rep.description}</p>
                    {rep.contact_value && (
                      <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 border-t border-rule/60 pt-2 text-muted sm:grid-cols-2">
                        {rep.reporter_name && (
                          <div className="min-w-0">
                            <span className="text-faint">Reporter: </span>
                            <span className="font-medium text-ink">{rep.reporter_name}</span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="text-faint">Contact: </span>
                          <span className="font-medium text-ink">{rep.contact_value}</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Acknowledgement, Clearance-Gated Resolution & Audit Timeline */}
        <div className="space-y-6">
          <section className="space-y-4 rounded-md border border-line bg-surface p-4 sm:p-5">
            <h2 className="text-base font-semibold text-ink">Incident Response</h2>

            {incident.workflow_state === "open" && (
              <div className="space-y-2.5 border-b border-rule pb-4">
                <label className="block space-y-1">
                  <span className="text-xs text-muted">Acknowledgement note (optional)</span>
                  <input
                    type="text"
                    value={ackNote}
                    onChange={(e) => setAckNote(e.target.value)}
                    className="min-h-11 w-full rounded-md border border-rule bg-raised px-3 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent"
                    placeholder="e.g., Inspecting unit shortly"
                  />
                </label>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleAcknowledge}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-control bg-navy px-4 text-xs font-semibold text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
                >
                  Acknowledge Incident
                </button>
              </div>
            )}

            {incident.workflow_state === "resolved" ? (
              <div className="rounded-md border border-positive/30 bg-positive/10 p-3 text-xs text-ink">
                <p className="font-semibold text-positive">
                  Resolved {formatDateTime(incident.resolved_at)}
                </p>
                <p className="mt-1 text-muted">{incident.resolution_note}</p>
              </div>
            ) : (
              <form onSubmit={handleResolve} className="space-y-3">
                {incident.edge_condition_state !== "cleared" && (
                  <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
                    Physical edge condition must report Cleared before this incident can be resolved.
                  </p>
                )}
                <label className="block space-y-1">
                  <span className="text-xs text-muted">Resolution service note</span>
                  <textarea
                    rows={3}
                    required
                    minLength={3}
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    className="w-full rounded-md border border-rule bg-raised px-3 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent"
                    placeholder="Describe physical corrective action verified..."
                  />
                </label>
                <button
                  type="submit"
                  disabled={isPending || !canResolve}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-ink bg-ink px-4 text-xs font-semibold text-surface transition-colors enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted"
                >
                  Resolve Incident
                </button>
              </form>
            )}
          </section>

          {/* Audit Timeline */}
          <section className="space-y-3 rounded-md border border-line bg-surface p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-accent" aria-hidden="true" />
              <h2 className="text-base font-semibold text-ink">Audit Timeline</h2>
            </div>
            <ol className="space-y-3">
              {incident.events.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-md border border-rule bg-raised/25 p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <span className="font-semibold capitalize text-ink">
                      {ev.event_type.replaceAll("_", " ")}
                    </span>
                    <span className="text-faint">{formatDateTime(ev.occurred_at)}</span>
                  </div>
                  <p className="mt-1 break-words text-muted">{ev.summary}</p>
                  {ev.actor_name && (
                    <p className="mt-1 text-[11px] text-faint">By {ev.actor_name}</p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
