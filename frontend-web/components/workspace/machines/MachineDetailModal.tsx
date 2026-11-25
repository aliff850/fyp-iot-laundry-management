"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, X, WashingMachine, Wind, ShieldAlert, Wrench } from "lucide-react";
import {
  refreshRemoteMachineCommands,
  requestRemoteMachineCommand,
  type RemoteMachine,
  type RemoteMachineCommand,
} from "@/app/branches/[branchId]/machines/actions";
import {
  formatDateLabel,
  freshnessText,
  getMachineStatusBadge,
  programDisplayName,
  type MachineModalTab,
} from "@/components/workspace/machines/MachineCard";
import { MachineCountdownTimer } from "@/components/workspace/machines/MachineCountdownTimer";
import { useActionToast } from "@/components/workspace/common/ActionToastContext";
import {
  MachineStatisticsChart,
  type ChartDataset,
  type ChartTokenName,
} from "@/components/workspace/machines/MachineStatisticsChart";
import {
  VENDOR_GROUP_SPECS,
  VENDOR_PARAMETER_GROUPS,
  VENDOR_PARAMETER_REFERENCE,
  type VendorGroupKey,
} from "@/components/workspace/machines/vendorParameters";

export interface MachineStatisticsSummary {
  completed_cycles: number;
  running_seconds: number;
  estimated_revenue_myr: string;
  stopped: number;
  faulted: number;
  interrupted: number;
}

export interface MachineStatisticsSeriesRow {
  timestamp: string;
  cycles: number;
  stopped: number;
  running_seconds: number;
  revenue_myr: string;
}

export interface MachineStatisticsEvent {
  cycle_id: string;
  program_id: string;
  outcome: string;
  running_seconds: number;
  price_myr: string;
  local_date: string;
  finished_at: string;
}

export interface MachineStatisticsPayload {
  source_id: string;
  period: "day" | "week" | "month";
  summary: MachineStatisticsSummary;
  series: MachineStatisticsSeriesRow[];
  events: MachineStatisticsEvent[];
}

export interface MachineDetailModalProps {
  machine: RemoteMachine | null;
  branchId: string;
  branchOpen: boolean;
  role: "owner" | "branch_manager" | "machine_maintenance";
  defaultTechnicianName?: string;
  serviceError?: string | null;
  initialTab?: MachineModalTab;
  onFetchStatistics?: (
    sourceId: string,
    period: "day" | "week" | "month",
  ) => Promise<MachineStatisticsPayload | null>;
  onOpenServiceModal?: (machine: RemoteMachine) => void;
  onClose: () => void;
  onCommandSent?: () => void;
}

const TAB_DEFS: { key: MachineModalTab; label: string }[] = [
  { key: "diagnostics", label: "State & Diagnostics" },
  { key: "statistics", label: "Statistics & Revenue" },
  { key: "programs", label: "Programs Catalog" },
  { key: "parameters", label: "Parameters" },
];

const COMMAND_ACTIONS = [
  "start",
  "pause",
  "resume",
  "stop",
] as const;

type HistoryPeriod = "today" | "week" | "month" | "all";
type StatsMetric = "cycles" | "running" | "revenue";
type StatsPeriod = "day" | "week" | "month";

const CHART_PALETTE: ChartTokenName[] = [
  "accent",
  "positive",
  "warning",
  "navy-selected",
  "muted",
  "control",
];

function machineStatusTileTheme(
  status: "RUNNING" | "IDLE" | "PAUSED" | "ERROR" | "MAINTENANCE" | "OFFLINE",
): {
  cardClass: string;
  valueClass: string;
  dotClass: string;
} {
  switch (status) {
    case "RUNNING":
      return {
        cardClass: "border-positive/40 bg-positive/10",
        valueClass: "text-positive",
        dotClass: "bg-positive",
      };
    case "IDLE":
      return {
        cardClass: "border-control/50 bg-navy/70",
        valueClass: "text-ink",
        dotClass: "bg-control",
      };
    case "PAUSED":
      return {
        cardClass: "border-control/50 bg-navy-selected/50",
        valueClass: "text-ink",
        dotClass: "bg-control",
      };
    case "MAINTENANCE":
      return {
        cardClass: "border-warning/40 bg-warning/10",
        valueClass: "text-warning",
        dotClass: "bg-warning",
      };
    case "ERROR":
      return {
        cardClass: "border-negative/40 bg-negative/10",
        valueClass: "text-negative",
        dotClass: "bg-negative",
      };
    default:
      return {
        cardClass: "border-line bg-raised/40",
        valueClass: "text-muted",
        dotClass: "bg-muted",
      };
  }
}

function remainingEstimateTileTheme(
  status: "RUNNING" | "IDLE" | "PAUSED" | "ERROR" | "MAINTENANCE" | "OFFLINE",
): {
  cardClass: string;
  valueClass: string;
} {
  if (status === "RUNNING") {
    return {
      cardClass: "border-positive/40 bg-positive/10",
      valueClass: "text-positive",
    };
  }
  if (status === "PAUSED") {
    return {
      cardClass: "border-control/50 bg-navy-selected/50",
      valueClass: "text-ink",
    };
  }
  return {
    cardClass: "border-line bg-raised/40",
    valueClass: "text-muted",
  };
}

function filterCommandsByPeriod(
  commands: RemoteMachineCommand[],
  period: HistoryPeriod,
): RemoteMachineCommand[] {
  if (period === "all") return commands;
  const now = new Date();
  let cutoffMs = 0;
  if (period === "today") {
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    cutoffMs = startOfDay.getTime();
  } else if (period === "week") {
    cutoffMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  } else {
    cutoffMs = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  }
  return commands.filter((cmd) => {
    const t = new Date(cmd.issued_at).getTime();
    return Number.isFinite(t) && t >= cutoffMs;
  });
}

function generateCustomProgramId(): string {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `p_${hex}`;
}

export function MachineDetailModal({
  machine,
  branchId,
  branchOpen,
  role,
  serviceError,
  initialTab = "diagnostics",
  onFetchStatistics,
  onOpenServiceModal,
  onClose,
  onCommandSent,
}: MachineDetailModalProps) {
  const { notify } = useActionToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const postCommandTimersRef = useRef<number[]>([]);
  const [tab, setTab] = useState<MachineModalTab>(initialTab);
  const [selectedStartProgram, setSelectedStartProgram] = useState("");
  const [commands, setCommands] = useState<RemoteMachineCommand[]>([]);
  const [commandsLoaded, setCommandsLoaded] = useState(false);
  const [commandsError, setCommandsError] = useState(false);
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>("week");
  const [historyPage, setHistoryPage] = useState(1);
  const [confirmStartOpen, setConfirmStartOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Statistics tab state
  const [statsMetric, setStatsMetric] = useState<StatsMetric>("cycles");
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>("day");
  const [statsData, setStatsData] = useState<MachineStatisticsPayload | null>(null);
  const [statsState, setStatsState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");

  // Programs Catalog editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [creatingProgram, setCreatingProgram] = useState(false);
  const [savingProgram, setSavingProgram] = useState(false);

  // Parameters tab state
  const [activeParamGroup, setActiveParamGroup] = useState<VendorGroupKey>("machine");

  const machineId = machine?.source_id ?? null;

  useEffect(() => {
    const node = dialogRef.current;
    if (!machineId) {
      if (node?.open) node.close();
      return;
    }
    if (node && !node.open) {
      node.showModal();
    }
  }, [machineId]);

  useEffect(() => {
    if (!machineId) return;
    let active = true;
    async function loadCommands() {
      if (!machineId) return;
      const history = await refreshRemoteMachineCommands(branchId, machineId);
      if (!active) return;
      setCommandsLoaded(true);
      if (history.ok) {
        setCommands(history.value);
        setCommandsError(false);
      } else {
        setCommandsError(true);
      }
    }
    loadCommands();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        loadCommands();
      }
    }, 4000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [branchId, machineId]);

  useEffect(() => {
    return () => {
      for (const timerId of postCommandTimersRef.current) {
        window.clearTimeout(timerId);
      }
      postCommandTimersRef.current = [];
    };
  }, []);

  const loadStatistics = async (period: StatsPeriod) => {
    if (!machine) return;
    if (!onFetchStatistics) {
      setStatsData(null);
      setStatsState("unavailable");
      return;
    }
    setStatsState("loading");
    try {
      const payload = await onFetchStatistics(machine.source_id, period);
      if (!payload) {
        setStatsData(null);
        setStatsState("unavailable");
      } else {
        setStatsData(payload);
        setStatsState("ready");
      }
    } catch {
      setStatsData(null);
      setStatsState("unavailable");
    }
  };

  const handleTabSelect = (nextTab: MachineModalTab) => {
    setTab(nextTab);
    if (nextTab === "statistics") {
      loadStatistics(statsPeriod);
    }
  };

  const handleClose = () => {
    setConfirmStartOpen(false);
    setCommands([]);
    onClose();
  };

  const isFresh = machine?.freshness === "fresh";
  const badge = machine ? getMachineStatusBadge(machine) : null;
  const effectiveStatus = badge?.effectiveStatus ?? "OFFLINE";
  const isOperator = role !== "machine_maintenance";
  const canTestMachine =
    role === "owner" ||
    role === "branch_manager" ||
    role === "machine_maintenance";
  const testEnabled =
    Boolean(machine) &&
    branchOpen &&
    !serviceError &&
    canTestMachine &&
    machine?.source === "simulated";
  const enabled = testEnabled && isOperator;

  const canControl = testEnabled && isFresh && !isPending;

  const programsMap = useMemo(
    () => machine?.data?.programs ?? {},
    [machine?.data?.programs],
  );
  const availablePrograms = useMemo(
    () =>
      Object.entries(programsMap).filter(
        ([, val]) => val && typeof val === "object",
      ),
    [programsMap],
  );

  const settings = machine?.data?.settings ?? {};
  const isWasher = machine ? machine.type !== "dryer" : true;
  const requiredSettings =
    machine?.type === "dryer"
      ? ["program_id", "price_myr", "duration_seconds", "target_temperature_c"]
      : [
        "program_id",
        "price_myr",
        "duration_seconds",
        "target_temperature_c",
        "water_level",
        "spin_rpm",
      ];
  const canEditSettings =
    enabled &&
    isFresh &&
    effectiveStatus === "IDLE" &&
    requiredSettings.every((key) => settings[key] != null);

  // Filtered and paginated commands
  const filteredCommands = useMemo(
    () => filterCommandsByPeriod(commands, historyPeriod),
    [commands, historyPeriod],
  );
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(filteredCommands.length / pageSize));
  const clampedPage = Math.min(historyPage, totalPages);
  const pagedCommands = filteredCommands.slice(
    (clampedPage - 1) * pageSize,
    clampedPage * pageSize,
  );

  const executeCommand = (
    action: "start" | "pause" | "resume" | "stop" | "clear_fault",
    args: Record<string, unknown> = {},
  ) => {
    if (!machine || !canControl) return;
    const toastId = `machine-modal-cmd-${machine.source_id}`;
    const actionLabel = action.replaceAll("_", " ");
    notify({
      id: toastId,
      kind: "info",
      title: `Sending ${actionLabel}`,
      message: `Dispatching command to ${machine.label}...`,
    });
    startTransition(async () => {
      const requestId = crypto.randomUUID();
      const result = await requestRemoteMachineCommand(
        branchId,
        machine.source_id,
        requestId,
        action,
        args,
      );
      if (!result.ok) {
        notify({
          id: toastId,
          kind: "error",
          title: `Failed to ${actionLabel}`,
          message: result.message,
        });
        return;
      }
      notify({
        id: toastId,
        kind: "success",
        title: `Command ${result.value.status}`,
        message: `${actionLabel.toUpperCase()} sent to ${machine.label}.`,
      });
      const history = await refreshRemoteMachineCommands(branchId, machine.source_id);
      if (history.ok) setCommands(history.value);
      onCommandSent?.();
      if (action === "start" || action === "stop" || action === "pause" || action === "resume") {
        const t1 = window.setTimeout(() => onCommandSent?.(), 800);
        const t2 = window.setTimeout(() => onCommandSent?.(), 1800);
        postCommandTimersRef.current.push(t1, t2);
      }
    });
  };

  const sendCommand = (
    action: "start" | "pause" | "resume" | "stop" | "clear_fault",
    args: Record<string, unknown> = {},
  ) => {
    if (!machine || !canControl) return;
    if (action === "start") {
      setConfirmStartOpen(true);
      return;
    }
    const confirmation = `Request ${action.replaceAll("_", " ")} for ${machine.label}?`;
    if (typeof window.confirm === "function" && !window.confirm(confirmation)) {
      return;
    }
    executeCommand(action, args);
  };

  const openProgramForm = (id: string | null) => {
    setCreatingProgram(!id);
    setEditingProgramId(id || generateCustomProgramId());
    setEditorOpen(true);
  };

  const handleSaveProgram = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!machine || !editingProgramId) return;
    if (
      typeof window.confirm === "function" &&
      !window.confirm(`Save program on ${machine.label}?`)
    ) {
      return;
    }
    const form = new FormData(event.currentTarget);
    const args: Record<string, unknown> = {
      program_id: editingProgramId,
      ...(creatingProgram ? { create: true } : {}),
      name: String(form.get("name") || "").trim(),
      price_myr: String(form.get("price_myr") || ""),
      duration_seconds: Number(form.get("duration_seconds")),
      target_temperature_c: Number(form.get("target_temperature_c")),
      ...(machine.type === "dryer"
        ? {}
        : {
          water_level: String(form.get("water_level") || "medium"),
          spin_rpm: Number(form.get("spin_rpm")),
        }),
    };

    const toastId = `machine-program-${machine.source_id}`;
    setSavingProgram(true);
    notify({
      id: toastId,
      kind: "info",
      title: "Saving program",
      message: `Sending updated settings to ${machine.label}...`,
    });
    try {
      const requestId = crypto.randomUUID();
      const submitted = await requestRemoteMachineCommand(
        branchId,
        machine.source_id,
        requestId,
        "set_settings",
        args,
      );
      if (!submitted.ok) {
        notify({
          id: toastId,
          kind: "error",
          title: "Program save rejected",
          message: submitted.message || "Failed to queue program request.",
        });
        setSavingProgram(false);
        return;
      }
      for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (!dialogRef.current?.open) return;
        const history = await refreshRemoteMachineCommands(
          branchId,
          machine.source_id,
        );
        if (!history.ok) continue;
        setCommands(history.value);
        const record = history.value.find(
          (item) => item.command_id === submitted.value.command_id,
        );
        if (!record || ["queued", "dispatched"].includes(record.status)) {
          continue;
        }
        if (record.status !== "succeeded") {
          notify({
            id: toastId,
            kind: "error",
            title: `Program ${record.status}`,
            message: record.reason || "Machine did not apply program settings.",
          });
          setSavingProgram(record.status === "unknown");
          return;
        }
        onCommandSent?.();
        notify({
          id: toastId,
          kind: "success",
          title: "Program saved",
          message: `${machine.label} confirmed updated program settings.`,
        });
        setEditorOpen(false);
        setSavingProgram(false);
        return;
      }
      notify({
        id: toastId,
        kind: "error",
        title: "Program status unknown",
        message: "Check command history before trying again.",
      });
    } catch {
      notify({
        id: toastId,
        kind: "error",
        title: "Program save failed",
        message: "Could not save program.",
      });
    } finally {
      setSavingProgram(false);
    }
  };

  const handleDeleteProgram = async (programId: string, programLabel: string) => {
    if (!machine || !/^p_[a-f0-9]{12}$/.test(programId) || savingProgram) return;
    if (
      typeof window.confirm === "function" &&
      !window.confirm(`Delete custom program "${programLabel}" from ${machine.label}?`)
    ) {
      return;
    }

    const toastId = `machine-program-delete-${machine.source_id}`;
    setSavingProgram(true);
    notify({
      id: toastId,
      kind: "info",
      title: "Deleting program",
      message: `Removing ${programLabel} from ${machine.label}...`,
    });
    try {
      const requestId = crypto.randomUUID();
      const submitted = await requestRemoteMachineCommand(
        branchId,
        machine.source_id,
        requestId,
        "delete_program",
        { program_id: programId },
      );
      if (!submitted.ok) {
        notify({
          id: toastId,
          kind: "error",
          title: "Program delete rejected",
          message: submitted.message || "Failed to queue delete request.",
        });
        setSavingProgram(false);
        return;
      }
      for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (!dialogRef.current?.open) return;
        const history = await refreshRemoteMachineCommands(
          branchId,
          machine.source_id,
        );
        if (!history.ok) continue;
        setCommands(history.value);
        const record = history.value.find(
          (item) => item.command_id === submitted.value.command_id,
        );
        if (!record || ["queued", "dispatched"].includes(record.status)) {
          continue;
        }
        if (record.status !== "succeeded") {
          notify({
            id: toastId,
            kind: "error",
            title: `Delete ${record.status}`,
            message: record.reason || "Machine did not delete custom program.",
          });
          setSavingProgram(record.status === "unknown");
          return;
        }
        if (editingProgramId === programId) {
          setEditorOpen(false);
        }
        onCommandSent?.();
        notify({
          id: toastId,
          kind: "success",
          title: "Program deleted",
          message: `${programLabel} removed from ${machine.label}.`,
        });
        setSavingProgram(false);
        return;
      }
      notify({
        id: toastId,
        kind: "error",
        title: "Delete status unknown",
        message: "Check command history before trying again.",
      });
    } catch {
      notify({
        id: toastId,
        kind: "error",
        title: "Program delete failed",
        message: "Could not delete custom program.",
      });
    } finally {
      setSavingProgram(false);
    }
  };

  if (!machine || !badge) {
    return <dialog ref={dialogRef} className="hidden" />;
  }

  const capacityBadge =
    typeof machine.capacity_kg === "number" && Number.isFinite(machine.capacity_kg)
      ? `${machine.capacity_kg.toFixed(1)} kg`
      : "Capacity unavailable";
  const remainingSecs =
    isFresh && typeof machine.data?.remaining_seconds === "number"
      ? machine.data.remaining_seconds
      : null;
  const activeProgramDuration =
    typeof settings.duration_seconds === "number"
      ? settings.duration_seconds
      : selectedStartProgram &&
          typeof programsMap[selectedStartProgram]?.duration_seconds === "number"
        ? Number(programsMap[selectedStartProgram]?.duration_seconds)
        : null;
  const countdownInitialSeconds =
    remainingSecs ??
    (effectiveStatus === "RUNNING" ? activeProgramDuration : null);
  const countdownKey = `${machine.source_id}:${
    effectiveStatus === "RUNNING" || effectiveStatus === "PAUSED" ? "active" : "inactive"
  }:${countdownInitialSeconds !== null ? "has" : "none"}`;
  const statusTheme = machineStatusTileTheme(effectiveStatus);
  const estimateTheme = remainingEstimateTileTheme(effectiveStatus);

  const selectedProgramRecord =
    editingProgramId && !creatingProgram
      ? programsMap[editingProgramId]
      : undefined;

  const statsChartData = (() => {
    if (!statsData || !statsData.series.length) return null;
    const labels = statsData.series.map((row) => row.timestamp);
    if (statsMetric === "cycles") {
      const completedPrograms = Array.from(
        new Set(
          statsData.events
            .filter((ev) => ev.outcome === "completed")
            .map((ev) => ev.program_id),
        ),
      );
      const datasets: ChartDataset[] = completedPrograms.map((id, index) => ({
        label: programDisplayName(id, programsMap[id]),
        data: statsData.series.map(
          (row) =>
            statsData.events.filter(
              (ev) =>
                ev.outcome === "completed" &&
                ev.program_id === id &&
                ev.local_date === row.timestamp,
            ).length,
        ),
        token: CHART_PALETTE[index % CHART_PALETTE.length],
      }));
      return {
        title: "Completed cycles by period",
        type: "bar" as const,
        stacked: true,
        unit: "cycles",
        precision: 0,
        labels,
        datasets,
      };
    }
    if (statsMetric === "running") {
      return {
        title: "Actual running minutes by period",
        type: "line" as const,
        stacked: false,
        unit: "min",
        precision: 1,
        labels,
        datasets: [
          {
            label: "Running minutes",
            data: statsData.series.map(
              (row) => Number(row.running_seconds) / 60,
            ),
            token: "positive" as ChartTokenName,
          },
        ],
      };
    }
    return {
      title: "Estimated revenue by period",
      type: "line" as const,
      stacked: false,
      unit: "MYR",
      precision: 1,
      labels,
      datasets: [
        {
          label: "Estimated revenue (RM)",
          data: statsData.series.map((row) => Number(row.revenue_myr)),
          token: "accent" as ChartTokenName,
        },
      ],
    };
  })();

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        if (confirmStartOpen) {
          event.preventDefault();
          setConfirmStartOpen(false);
        }
      }}
      onClose={handleClose}
      aria-labelledby={`parameters-title-${machine.source_id}`}
      className="fixed inset-0 z-50 m-auto hidden h-11/12 w-11/12 max-w-none flex-col overflow-hidden rounded-md border border-control bg-surface p-4 text-ink shadow-2xl backdrop:bg-canvas/80 open:flex sm:p-6"
    >
      {/* 1. Modal Header */}
      <div className="flex items-start justify-between gap-4 border-b border-rule pb-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-line bg-raised/60">
            {isWasher ? (
              <WashingMachine className="size-6 text-muted" aria-hidden="true" />
            ) : (
              <Wind className="size-6 text-muted" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2
                id={`parameters-title-${machine.source_id}`}
                className="truncate text-xl font-bold tracking-tight text-ink"
              >
                {machine.label}
              </h2>
              <span className="rounded border border-rule bg-raised/40 px-2 py-0.5 text-xs font-semibold tabular-nums text-muted">
                {capacityBadge}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
              <span>{machine.type.replaceAll("_", " ")}</span>
              <span className="font-semibold tabular-nums text-ink">
                ID: {machine.source_id}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label="Close modal"
          className="flex size-11 shrink-0 items-center justify-center rounded-md border border-control bg-raised/40 text-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>

      {/* 2. Modal Tab Selection Bar */}
      <div
        role="tablist"
        aria-label="Machine detail sections"
        className="mt-4 flex flex-wrap gap-2 border-b border-rule sm:gap-4"
      >
        {TAB_DEFS.filter((item) => role !== "machine_maintenance" || item.key !== "statistics").map((item) => {
          const isSelected = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => handleTabSelect(item.key)}
              className={
                isSelected
                  ? "min-h-11 border-b-2 border-accent px-3.5 py-2 text-xs font-semibold text-ink transition-colors focus-visible:outline-2 focus-visible:outline-accent"
                  : "min-h-11 border-b-2 border-transparent px-3.5 py-2 text-xs font-medium text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
              }
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* 3. Modal Tab Body */}
      <div className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto">
        {/* TAB 1: State & Diagnostics */}
        {tab === "diagnostics" && (
          <div className="space-y-5">
            {effectiveStatus === "MAINTENANCE" && (
              <div
                role="status"
                className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <Wrench
                    className="mt-0.5 size-5 shrink-0 text-warning"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 space-y-1">
                    <h3 className="text-base font-semibold tracking-tight text-ink sm:text-lg">
                      Machine under maintenance
                    </h3>
                    <p className="text-xs text-muted">
                      Technician service in progress. Customer cycles remain paused until returned to service.
                    </p>
                  </div>
                </div>
                {machine.data?.fault_code && (
                  <span className="inline-flex shrink-0 self-start rounded border border-warning/50 bg-surface px-2.5 py-1 font-mono text-xs font-semibold text-warning">
                    {machine.data.fault_code}
                  </span>
                )}
              </div>
            )}

            {(effectiveStatus === "ERROR" ||
              (effectiveStatus === "MAINTENANCE" &&
                Boolean(machine.diagnosis || machine.data?.fault_code))) && (
              <div
                role="alert"
                className="space-y-4 rounded-md border border-negative/40 bg-negative/10 p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3">
                    <ShieldAlert
                      className="mt-0.5 size-5 shrink-0 text-negative"
                      aria-hidden="true"
                    />
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded border border-negative/50 bg-surface px-2 py-0.5 font-mono text-xs font-semibold text-negative">
                          {machine.diagnosis?.fault_code ??
                            machine.data?.fault_code ??
                            "FAULT"}
                        </span>
                        <h3 className="text-base font-semibold tracking-tight text-ink sm:text-lg">
                          {machine.diagnosis?.title ??
                            machine.data?.fault_name ??
                            "Active Machine Fault"}
                        </h3>
                      </div>
                      <p className="text-sm text-ink">
                        {machine.diagnosis?.plain_explanation ??
                          "Review the active fault before issuing remote controls."}
                      </p>
                    </div>
                  </div>
                  {machine.diagnosis && (
                    <span
                      className={`inline-flex shrink-0 self-start rounded border px-2 py-0.5 text-xs font-medium ${
                        machine.diagnosis.source_status ===
                        "placeholder_washer_guide"
                          ? "border-warning/40 bg-warning/10 text-warning"
                          : machine.diagnosis.source_status ===
                              "spinsense_safety_rule"
                            ? "border-line bg-surface text-muted"
                            : "border-negative/40 bg-surface text-negative"
                      }`}
                    >
                      {machine.diagnosis.source_status ===
                      "placeholder_washer_guide"
                        ? "Placeholder guide"
                        : machine.diagnosis.source_status ===
                            "spinsense_safety_rule"
                          ? "SpinSense safety rule"
                          : "Unverified vendor code"}
                    </span>
                  )}
                </div>

                {machine.diagnosis && (
                  <div className="space-y-3 rounded-md border border-rule bg-surface p-3.5 text-xs">
                    <p className="text-muted">{machine.diagnosis.disclaimer}</p>
                    <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2 text-ink">
                      <span className="font-semibold text-warning">
                        Safety:{" "}
                      </span>
                      {machine.diagnosis.safety_precautions}
                    </div>
                    {machine.diagnosis.likely_causes.length > 0 && (
                      <div className="space-y-1.5">
                        <h4 className="font-semibold text-ink">
                          Likely Causes
                        </h4>
                        <ul className="list-disc space-y-1 pl-4 text-muted">
                          {machine.diagnosis.likely_causes.map((cause) => (
                            <li key={cause}>{cause}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {machine.diagnosis.troubleshooting_steps.length > 0 && (
                      <div className="space-y-1.5">
                        <h4 className="font-semibold text-ink">
                          Troubleshooting Steps
                        </h4>
                        <ol className="list-decimal space-y-1 pl-4 text-ink">
                          {machine.diagnosis.troubleshooting_steps.map(
                            (step) => (
                              <li key={step}>{step}</li>
                            ),
                          )}
                        </ol>
                      </div>
                    )}
                  </div>
                )}

                {(effectiveStatus === "ERROR" || Boolean(machine.active_incident)) && (
                  <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap sm:items-center">
                    {machine.active_incident && (
                      <Link
                        href={`/branches/${branchId}/incidents/${machine.active_incident.id}`}
                        className="inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
                      >
                        <AlertTriangle className="size-4 shrink-0 text-negative" aria-hidden="true" />
                        <span>Inspect Incident {machine.active_incident.reference_code}</span>
                        <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
                      </Link>
                    )}

                    {onOpenServiceModal && (
                      <button
                        type="button"
                        onClick={() => onOpenServiceModal(machine)}
                        className="inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-ink bg-ink px-4 py-2 text-xs font-semibold text-surface transition-colors hover:border-muted hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
                      >
                        <Wrench className="size-4 shrink-0" aria-hidden="true" />
                        <span>Service &amp; Resolve Issue</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Hardware Registration & Freshness Metadata Grid */}
            <div className="grid grid-cols-1 gap-4 rounded-md border border-line bg-raised/30 p-4 sm:grid-cols-3">
              <div className="min-w-0">
                <span className="text-xs text-muted">Hardware Identity</span>
                <p className="mt-1 break-all text-sm font-semibold text-ink">
                  {machine.source_id}
                </p>
              </div>
              <div className="min-w-0">
                <span className="text-xs text-muted">Machine type</span>
                <p className="mt-1 break-words text-sm font-semibold text-ink">
                  {machine.type.replaceAll("_", " ")}
                </p>
              </div>
              <div className="min-w-0">
                <span className="text-xs text-muted">Freshness &amp; Sample</span>
                <p className="mt-1 break-words text-sm font-semibold text-ink">
                  {freshnessText(machine.freshness)} —{" "}
                  {formatDateLabel(machine.last_update)}
                </p>
              </div>
            </div>

            {/* Sensor Grid (Unavailable until provider supplies verified readings) */}
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {isWasher && (
                <>
                  <div className="rounded-md border border-rule bg-raised/30 p-3.5">
                    <dt className="text-xs text-muted">Water level</dt>
                    <dd className="mt-1 text-lg font-bold tabular-nums text-ink">
                      Unavailable
                    </dd>
                  </div>
                  <div className="rounded-md border border-rule bg-raised/30 p-3.5">
                    <dt className="text-xs text-muted">Temperature</dt>
                    <dd className="mt-1 text-lg font-bold tabular-nums text-ink">
                      Unavailable
                    </dd>
                  </div>
                </>
              )}
              <div className="rounded-md border border-rule bg-raised/30 p-3.5">
                <dt className="text-xs text-muted">Spin speed</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-ink">
                  Unavailable
                </dd>
              </div>
              <div className="rounded-md border border-rule bg-raised/30 p-3.5">
                <dt className="text-xs text-muted">Door Interlock</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-ink">
                  Unavailable
                </dd>
              </div>
            </dl>

            {/* Machine Testing */}
            {canTestMachine && (
              <section className="space-y-4 rounded-md border border-line bg-surface p-4">
                <h3 className="text-base font-semibold tracking-tight text-ink sm:text-lg">
                  Machine Testing
                </h3>

                {/* Live State & Countdown Summary inside Machine Testing */}
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className={`min-w-0 rounded-md border p-3.5 ${statusTheme.cardClass}`}>
                    <dt className="text-xs font-medium text-muted">Machine status</dt>
                    <dd className={`mt-1.5 flex items-center gap-2 break-words text-base font-semibold ${statusTheme.valueClass}`}>
                      <span
                        className={`size-2 shrink-0 rounded-full ${statusTheme.dotClass}`}
                        aria-hidden="true"
                      />
                      <span>{badge.label}</span>
                    </dd>
                  </div>
                  <div className={`min-w-0 rounded-md border p-3.5 ${estimateTheme.cardClass}`}>
                    <dt className="text-xs font-medium text-muted">Remaining estimate</dt>
                    <dd className={`mt-1.5 text-base font-semibold tabular-nums ${estimateTheme.valueClass}`}>
                      <MachineCountdownTimer
                        key={countdownKey}
                        initialSeconds={countdownInitialSeconds}
                        isRunning={effectiveStatus === "RUNNING"}
                        isPaused={effectiveStatus === "PAUSED"}
                      />
                    </dd>
                  </div>
                </dl>

                <label className="flex w-full max-w-sm flex-col gap-2 text-sm font-medium text-ink">
                  Program for START
                  <select
                    value={selectedStartProgram}
                    disabled={
                      !testEnabled ||
                      !isFresh ||
                      effectiveStatus !== "IDLE" ||
                      availablePrograms.length === 0
                    }
                    onChange={(e) => setSelectedStartProgram(e.target.value)}
                    className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
                  >
                    <option value="">
                      {availablePrograms.length
                        ? "Select a program"
                        : "No saved programs"}
                    </option>
                    {availablePrograms.map(([id, prog]) => (
                      <option key={id} value={id}>
                        {programDisplayName(id, prog)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex flex-wrap items-center gap-2.5">
                  {COMMAND_ACTIONS.map((action) => {
                    const labelText = action.replaceAll("_", " ").toUpperCase();
                    const valid =
                      action === "start"
                        ? effectiveStatus === "IDLE"
                        : action === "pause"
                          ? effectiveStatus === "RUNNING"
                          : action === "resume"
                            ? effectiveStatus === "PAUSED"
                            : ["RUNNING", "PAUSED"].includes(effectiveStatus);

                    const isStartUnavailable =
                      action === "start" && !selectedStartProgram;
                    const disabled =
                      !canControl || !valid || isStartUnavailable;

                    const btnStyle =
                      action === "start" || action === "resume"
                        ? "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-ink bg-ink px-4 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:border-muted enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted"
                        : action === "stop"
                          ? "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-negative bg-negative px-4 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:border-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted"
                          : "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md border border-control bg-navy px-4 py-2 text-xs font-semibold text-ink transition-colors enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted";

                    return (
                      <button
                        key={action}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          sendCommand(
                            action,
                            action === "start"
                              ? { program_id: selectedStartProgram }
                              : {},
                          );
                        }}
                        className={btnStyle}
                      >
                        {labelText}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="flex flex-col gap-3 rounded-md border border-line bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <h3 className="text-base font-semibold tracking-tight text-ink">
                  Maintenance &amp; Service
                </h3>
                <p className="text-xs text-muted">
                  Put the unit into maintenance mode, log tasks performed, and return it to service.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {machine.active_incident && (
                  <Link
                    href={`/branches/${branchId}/incidents/${machine.active_incident.id}`}
                    className="inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-control bg-navy px-4 py-2 text-xs font-semibold text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent sm:w-auto"
                  >
                    <span>Inspect Incident {machine.active_incident.reference_code}</span>
                    <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
                  </Link>
                )}
                {onOpenServiceModal && (
                  <button
                    type="button"
                    onClick={() => onOpenServiceModal(machine)}
                    className="inline-flex min-h-11 min-w-11 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md border border-ink bg-ink px-4 py-2 text-xs font-semibold text-surface transition-colors hover:border-muted hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent sm:w-auto"
                  >
                    <Wrench className="size-4 shrink-0" aria-hidden="true" />
                    <span>
                      {effectiveStatus === "MAINTENANCE"
                        ? "Continue Maintenance Log"
                        : "Maintenance & Service"}
                    </span>
                  </button>
                )}
              </div>
            </section>

            {/* Recent commands (inside Tab 1 matching Pi 5) */}
            <section className="space-y-4 rounded-md border border-line bg-surface p-4">
              <h3 className="text-base font-semibold tracking-tight text-ink sm:text-lg">
                Recent commands
              </h3>

              <label className="flex w-full flex-col gap-2 text-sm font-medium text-ink sm:max-w-xs">
                Timeframe
                <select
                  value={historyPeriod}
                  onChange={(e) => {
                    setHistoryPeriod(e.target.value as HistoryPeriod);
                    setHistoryPage(1);
                  }}
                  className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <option value="today">Today</option>
                  <option value="week">Past 7 days</option>
                  <option value="month">Past 30 days</option>
                  <option value="all">All time</option>
                </select>
              </label>

              <ul aria-live="polite" className="space-y-2">
                {!commandsLoaded ? (
                  <li className="text-sm text-muted">Loading commands</li>
                ) : commandsError ? (
                  <li className="text-sm text-warning">
                    Command history unavailable
                  </li>
                ) : pagedCommands.length === 0 ? (
                  <li className="text-sm text-muted">
                    No commands in this timeframe
                  </li>
                ) : (
                  pagedCommands.map((cmd) => (
                    <li
                      key={cmd.command_id}
                      className="min-w-0 rounded-md border border-line bg-raised/40 p-3"
                    >
                      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div className="min-w-0">
                          <dt className="text-xs text-muted">Action</dt>
                          <dd className="mt-1 break-words text-sm text-ink">
                            {cmd.action.replaceAll("_", " ") || "Unknown"}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted">Result</dt>
                          <dd className="mt-1 break-words text-sm text-ink">
                            {cmd.status || "Unknown"}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs text-muted">Issued</dt>
                          <dd className="mt-1 break-words text-sm text-ink">
                            {formatDateLabel(cmd.issued_at)}
                          </dd>
                        </div>
                      </dl>
                      {cmd.reason && (
                        <p className="mt-2 text-sm text-warning">{cmd.reason}</p>
                      )}
                    </li>
                  ))
                )}
              </ul>

              <div className="flex flex-col gap-2 border-t border-rule pt-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm tabular-nums text-muted">
                  Page {clampedPage} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={clampedPage <= 1}
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    className="min-h-11 min-w-11 rounded-md border border-control bg-navy px-4 text-sm font-medium text-ink enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={clampedPage >= totalPages}
                    onClick={() =>
                      setHistoryPage((p) => Math.min(totalPages, p + 1))
                    }
                    className="min-h-11 min-w-11 rounded-md border border-control bg-navy px-4 text-sm font-medium text-ink enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* TAB 2: Statistics & Revenue */}
        {tab === "statistics" && role !== "machine_maintenance" && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                aria-label="Chart metric"
                value={statsMetric}
                onChange={(e) => setStatsMetric(e.target.value as StatsMetric)}
                className="min-h-11 w-full rounded-md border border-control bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent sm:w-auto"
              >
                <option value="cycles">Completed cycles</option>
                <option value="running">Running minutes</option>
                <option value="revenue">Estimated revenue</option>
              </select>

              <select
                aria-label="Chart period"
                value={statsPeriod}
                onChange={(e) => {
                  const next = e.target.value as StatsPeriod;
                  setStatsPeriod(next);
                  loadStatistics(next);
                }}
                className="min-h-11 w-full rounded-md border border-control bg-surface px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent sm:w-auto"
              >
                <option value="day">Today</option>
                <option value="week">Past 7 days</option>
                <option value="month">Past 30 days</option>
              </select>
            </div>

            <div aria-live="polite" className="space-y-4">
              {statsState === "loading" && (
                <p className="text-sm text-muted">Loading recorded cycles</p>
              )}

              {statsState === "unavailable" && (
                <p className="rounded-md border border-warning bg-raised p-4 text-sm text-warning">
                  Recorded statistics unavailable
                </p>
              )}

              {statsState === "ready" && statsData && (
                <>
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-md border border-rule bg-raised p-4">
                      <dt className="text-xs text-muted">Completed cycles</dt>
                      <dd className="mt-2 text-2xl font-semibold tabular-nums text-ink">
                        {statsData.summary.completed_cycles}
                      </dd>
                    </div>
                    <div className="rounded-md border border-rule bg-raised p-4">
                      <dt className="text-xs text-muted">
                        Actual running minutes
                      </dt>
                      <dd className="mt-2 text-2xl font-semibold tabular-nums text-ink">
                        {(statsData.summary.running_seconds / 60).toFixed(1)}
                      </dd>
                    </div>
                    <div className="rounded-md border border-rule bg-raised p-4">
                      <dt className="text-xs text-muted">Estimated revenue</dt>
                      <dd className="mt-2 text-2xl font-semibold tabular-nums text-ink">
                        RM {Number(statsData.summary.estimated_revenue_myr).toFixed(2)}
                      </dd>
                    </div>
                  </dl>

                  {!statsChartData ? (
                    <p className="rounded-md border border-rule bg-raised p-4 text-sm text-muted">
                      No recorded cycles in this period
                    </p>
                  ) : (
                    <>
                      <MachineStatisticsChart
                        title={statsChartData.title}
                        unit={statsChartData.unit}
                        type={statsChartData.type}
                        stacked={statsChartData.stacked}
                        precision={statsChartData.precision}
                        labels={statsChartData.labels}
                        datasets={statsChartData.datasets}
                      />

                      <div className="overflow-x-auto rounded-md border border-rule">
                        <table className="w-full min-w-96 text-sm">
                          <thead className="bg-navy text-muted">
                            <tr>
                              <th className="px-4 py-3 text-left font-semibold">
                                Date (Malaysia)
                              </th>
                              <th className="px-4 py-3 text-left font-semibold">
                                Completed cycles
                              </th>
                              <th className="px-4 py-3 text-left font-semibold">
                                Stopped cycles
                              </th>
                              <th className="px-4 py-3 text-left font-semibold">
                                Running minutes
                              </th>
                              <th className="px-4 py-3 text-left font-semibold">
                                Estimated revenue
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-rule">
                            {statsData.series.map((row) => (
                              <tr key={row.timestamp} className="bg-surface">
                                <td className="px-4 py-3 tabular-nums text-ink">
                                  {row.timestamp}
                                </td>
                                <td className="px-4 py-3 tabular-nums text-ink">
                                  {row.cycles}
                                </td>
                                <td className="px-4 py-3 tabular-nums text-ink">
                                  {row.stopped}
                                </td>
                                <td className="px-4 py-3 tabular-nums text-ink">
                                  {(row.running_seconds / 60).toFixed(1)}
                                </td>
                                <td className="px-4 py-3 tabular-nums text-ink">
                                  RM {Number(row.revenue_myr).toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {statsData.summary.stopped +
                    statsData.summary.faulted +
                    statsData.summary.interrupted >
                    0 && (
                      <p className="text-xs text-muted">
                        {statsData.summary.stopped +
                          statsData.summary.faulted +
                          statsData.summary.interrupted}{" "}
                        other recorded attempts are excluded from completed cycles
                        and estimated revenue.
                      </p>
                    )}

                  <p className="text-xs text-muted">
                    Recorded simulator cycles only. Revenue is an estimate, not
                    a payment record.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: Programs Catalog */}
        {tab === "programs" && (
          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-base font-semibold text-ink">Saved programs</h3>
              {isOperator && (
                <button
                  type="button"
                  disabled={
                    !enabled ||
                    !isFresh ||
                    effectiveStatus !== "IDLE" ||
                    availablePrograms.length >= 6
                  }
                  onClick={() => openProgramForm(null)}
                  className="min-h-11 min-w-11 rounded-md border border-control bg-navy px-4 text-sm font-semibold text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:bg-raised disabled:text-muted"
                >
                  Add program
                </button>
              )}
            </div>

            {availablePrograms.length === 0 ? (
              <p className="text-sm text-muted">
                No verified program data is available.
              </p>
            ) : (
              <ul className="space-y-2">
                {availablePrograms.map(([id, saved]) => (
                  <li
                    key={id}
                    className="rounded-md border border-rule bg-raised p-4 text-sm text-ink"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <h4 className="text-base font-semibold text-ink">
                        {programDisplayName(id, saved)}
                      </h4>
                      {isOperator && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={
                              !enabled || !isFresh || effectiveStatus !== "IDLE" || savingProgram
                            }
                            onClick={() => openProgramForm(id)}
                            className="min-h-11 min-w-11 rounded-md border border-control bg-navy px-4 text-sm font-semibold text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:bg-raised disabled:text-muted"
                          >
                            Edit
                          </button>
                          {/^p_[a-f0-9]{12}$/.test(id) && (
                            <button
                              type="button"
                              disabled={
                                !enabled || !isFresh || effectiveStatus !== "IDLE" || savingProgram
                              }
                              onClick={() =>
                                void handleDeleteProgram(id, programDisplayName(id, saved))
                              }
                              className="min-h-11 min-w-11 rounded-md border border-negative/40 bg-negative/10 px-4 text-sm font-semibold text-negative hover:bg-negative/20 focus-visible:outline-2 focus-visible:outline-accent disabled:border-line disabled:bg-raised disabled:text-muted"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {isOperator && (
                        <div>
                          <dt className="text-xs text-muted">Cycle rate</dt>
                          <dd className="text-sm tabular-nums text-ink">
                            RM {String(saved.price_myr ?? "Unknown")}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-xs text-muted">Cycle time</dt>
                        <dd className="text-sm tabular-nums text-ink">
                          {String(saved.duration_seconds ?? "Unknown")} seconds
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            )}

            {/* Inline Program Editor (matching Pi 5 livePane) */}
            {editorOpen && isOperator && (
              <div className="space-y-4 rounded-md border border-line bg-surface p-4 md:p-5">
                <div className="border-b border-rule pb-3">
                  <h3 className="text-base font-semibold text-ink">
                    {creatingProgram
                      ? "Add program"
                      : `Edit ${programDisplayName(
                        editingProgramId ?? "",
                        selectedProgramRecord,
                      )}`}
                  </h3>
                </div>

                {!canEditSettings && (
                  <div className="rounded border border-warning/30 bg-warning/10 p-3 text-xs text-ink">
                    <p className="font-semibold text-warning">
                      Modifications Restricted
                    </p>
                    <p className="mt-0.5 text-muted">
                      Programs can be changed only while the machine is connected
                      and idle.
                    </p>
                  </div>
                )}

                <form
                  key={`${machine.source_id}-${editingProgramId ?? "new"}-${creatingProgram ? "c" : "e"}`}
                  onSubmit={handleSaveProgram}
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                >
                  <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
                    Program name
                    <input
                      name="name"
                      type="text"
                      required
                      maxLength={18}
                      pattern="[A-Za-z0-9][A-Za-z0-9 -]{0,17}"
                      disabled={!canEditSettings}
                      defaultValue={
                        creatingProgram
                          ? ""
                          : programDisplayName(
                            editingProgramId ?? "",
                            selectedProgramRecord,
                          )
                      }
                      className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
                    Cycle Rate (MYR)
                    <input
                      name="price_myr"
                      type="number"
                      required
                      min="0"
                      max="999"
                      step="0.01"
                      disabled={!canEditSettings}
                      defaultValue={String(
                        selectedProgramRecord?.price_myr ??
                        settings.price_myr ??
                        "",
                      )}
                      className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
                    Default Duration (Seconds)
                    <input
                      name="duration_seconds"
                      type="number"
                      required
                      min="1"
                      max="7200"
                      step="1"
                      disabled={!canEditSettings}
                      defaultValue={String(
                        selectedProgramRecord?.duration_seconds ??
                        settings.duration_seconds ??
                        "",
                      )}
                      className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
                    Operating Temperature (°C)
                    <input
                      name="target_temperature_c"
                      type="number"
                      required
                      min="0"
                      max="90"
                      step="1"
                      disabled={!canEditSettings}
                      defaultValue={String(
                        selectedProgramRecord?.target_temperature_c ??
                        settings.target_temperature_c ??
                        "",
                      )}
                      className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
                    />
                  </label>

                  {machine.type !== "dryer" && (
                    <>
                      <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
                        Water Level Setting
                        <select
                          name="water_level"
                          disabled={!canEditSettings}
                          defaultValue={String(
                            selectedProgramRecord?.water_level ??
                            settings.water_level ??
                            "",
                          )}
                          className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
                        >
                          <option value="">Unavailable</option>
                          <option value="low">Low (Economic load)</option>
                          <option value="medium">Medium (Standard load)</option>
                          <option value="high">High (Full drum)</option>
                        </select>
                      </label>

                      <label className="flex flex-col gap-1.5 text-xs font-medium text-ink">
                        Maximum Spin Speed (RPM)
                        <input
                          name="spin_rpm"
                          type="number"
                          required
                          min="0"
                          max="1200"
                          step="1"
                          disabled={!canEditSettings}
                          defaultValue={String(
                            selectedProgramRecord?.spin_rpm ??
                            settings.spin_rpm ??
                            "",
                          )}
                          className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
                        />
                      </label>
                    </>
                  )}

                  <div className="flex flex-col gap-2 border-t border-rule pt-4 sm:col-span-2 sm:flex-row sm:justify-end lg:col-span-3">
                    <button
                      type="button"
                      onClick={() => setEditorOpen(false)}
                      className="min-h-11 min-w-11 rounded-md border border-control bg-navy px-5 text-sm text-ink hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!canEditSettings || savingProgram}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-ink bg-ink px-5 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:border-muted enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted"
                    >
                      Save program
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Parameters (matching Pi 5 11-category sub-tabs + vendor reference) */}
        {tab === "parameters" && (
          <div className="space-y-5">
            {/* Sub-tabs Bar */}
            <div
              role="tablist"
              aria-label="Vendor parameter categories"
              className="flex flex-wrap gap-2 border-b border-rule pb-3"
            >
              {VENDOR_PARAMETER_GROUPS.map(([gKey, gLabel]) => {
                const active = activeParamGroup === gKey;
                return (
                  <button
                    key={gKey}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setActiveParamGroup(gKey)}
                    className={
                      active
                        ? "min-h-11 rounded-md border border-control bg-navy px-3.5 py-2 text-xs font-semibold text-ink transition-colors focus-visible:outline-2 focus-visible:outline-accent"
                        : "min-h-11 rounded-md bg-raised/40 px-3.5 py-2 text-xs font-semibold text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                    }
                  >
                    {gLabel}
                  </button>
                );
              })}
            </div>

            {/* Active Vendor Group Pane */}
            <div className="space-y-4 rounded-md border border-line bg-surface p-5">
              <div className="border-b border-rule pb-3">
                <h3 className="text-xs font-semibold text-ink">
                  {VENDOR_GROUP_SPECS[activeParamGroup].title}
                </h3>
              </div>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {VENDOR_GROUP_SPECS[activeParamGroup].items.map(
                  ([dtLabel, ddVal, isDisabled]) => (
                    <div
                      key={dtLabel}
                      className="rounded border border-rule bg-raised/30 p-3"
                    >
                      <dt className="text-xs text-muted">{dtLabel}</dt>
                      <dd
                        className={
                          isDisabled
                            ? "mt-1 text-sm font-semibold text-faint line-through"
                            : "mt-1 text-sm font-semibold text-ink"
                        }
                      >
                        {ddVal}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
            </div>

            {/* Live Confirmed Settings (if present) */}
            {Object.keys(settings).length > 0 && (
              <div className="space-y-3 rounded-md border border-line bg-surface p-5">
                <h3 className="text-xs font-semibold text-ink">
                  Confirmed active settings
                </h3>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(settings)
                    .filter(([key]) => isOperator || key !== "price_myr")
                    .map(([key, val]) => (
                      <div
                        key={key}
                        className="rounded border border-rule bg-raised/30 p-3"
                      >
                        <dt className="text-xs text-muted">
                          {key.replaceAll("_", " ")}
                        </dt>
                        <dd className="mt-1 text-sm font-semibold text-ink">
                          {String(val)}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            )}

            {/* Collapsible Vendor Parameter Reference Catalog */}
            <details className="mt-4 border-t border-rule pt-4">
              <summary className="min-h-11 cursor-pointer text-sm text-ink focus-visible:outline-2 focus-visible:outline-accent">
                Vendor parameter reference
              </summary>
              <p className="mt-2 text-xs text-muted">
                Unverified vendor fields are unavailable.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                {Object.entries(VENDOR_PARAMETER_REFERENCE).map(
                  ([group, fieldsList]) => (
                    <section
                      key={group}
                      className="min-w-0 rounded-md border border-rule bg-raised p-3"
                    >
                      <h4 className="text-xs font-semibold text-ink">
                        {group}
                      </h4>
                      <ul className="mt-2 space-y-1">
                        {fieldsList.map((field) => (
                          <li
                            key={field}
                            className="break-words text-xs text-muted"
                          >
                            {field}: unavailable
                          </li>
                        ))}
                      </ul>
                    </section>
                  ),
                )}
              </div>
            </details>
          </div>
        )}
      </div>

      {confirmStartOpen && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`confirm-start-title-${machine.source_id}`}
          aria-describedby={`confirm-start-desc-${machine.source_id}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) setConfirmStartOpen(false);
          }}
          className="fixed inset-0 z-20 flex items-center justify-center bg-canvas/85 p-4"
        >
          <div className="w-full max-w-md space-y-4 rounded-md border border-warning/40 bg-surface p-5 text-ink shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-warning/40 bg-warning/10">
                <AlertTriangle className="size-5 text-warning" aria-hidden="true" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <h3
                  id={`confirm-start-title-${machine.source_id}`}
                  className="text-base font-semibold tracking-tight text-ink"
                >
                  Confirm Machine Start
                </h3>
                <p
                  id={`confirm-start-desc-${machine.source_id}`}
                  className="text-xs leading-relaxed text-muted sm:text-sm"
                >
                  Ensure <span className="font-semibold text-ink">{machine.label}</span> is completely clear, no items or hands obstruct the drum, and the door is securely closed before starting{" "}
                  <span className="font-semibold text-ink">
                    {programDisplayName(selectedStartProgram, programsMap[selectedStartProgram])}
                  </span>.
                </p>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2.5 border-t border-rule pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmStartOpen(false)}
                className="inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-md border border-control bg-raised px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canControl || !selectedStartProgram}
                onClick={() => {
                  setConfirmStartOpen(false);
                  executeCommand("start", { program_id: selectedStartProgram });
                }}
                className="inline-flex min-h-11 min-w-11 w-full items-center justify-center rounded-md border border-ink bg-ink px-4 py-2 text-xs font-semibold text-surface transition-colors enabled:hover:border-muted enabled:hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:border-control disabled:bg-raised disabled:text-muted sm:w-auto"
              >
                Confirm &amp; Start
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
