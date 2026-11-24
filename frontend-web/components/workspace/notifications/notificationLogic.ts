import type {
  NotificationDeviceSummary,
  WorkspaceNotificationEvent,
} from "@/lib/auth/business";

export const NOTIFICATIONS_PAGE_SIZE = 10;
const STORAGE_PREFIX = "spinsense.web.notifications.";

export interface DeviceTransitionSnapshot {
  state: string;
  fault_code: string | null;
  lpg_band: "critical" | "low" | "normal" | null;
  gas_condition: string | null;
  maintenance_mode: boolean;
}

export function notificationStorageKeys(scope: string) {
  const safeScope = scope.trim() || "workspace";
  return {
    feed: `${STORAGE_PREFIX}feed.${safeScope}`,
    lastRead: `${STORAGE_PREFIX}lastRead.${safeScope}`,
    prevState: `${STORAGE_PREFIX}prevState.${safeScope}`,
  };
}

export function readNotificationStorageJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeNotificationStorageJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota or private mode restrictions
  }
}

export function clearWorkspaceNotificationsStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let idx = 0; idx < window.localStorage.length; idx += 1) {
      const key = window.localStorage.key(idx);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore blocked browser storage
  }
}

export function lpgFillBand(pct: unknown): "critical" | "low" | "normal" | null {
  if (typeof pct !== "number" || !Number.isFinite(pct)) return null;
  if (pct < 5) return "critical";
  if (pct < 15) return "low";
  return "normal";
}

export function formatNotificationProgram(prog: unknown): string | null {
  if (typeof prog !== "string" || !prog.trim()) return null;
  const norm = prog.trim().toLowerCase();
  if (norm === "quick") return "Quick";
  if (norm === "standard") return "Standard";
  return norm.replaceAll("_", " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

export function notificationVisuals(item: Pick<WorkspaceNotificationEvent, "severity" | "kind">) {
  const severity = item.severity || "neutral";
  const badgeClass =
    severity === "negative"
      ? "border-negative/30 bg-negative/10 text-negative"
      : severity === "warning"
        ? "border-warning/30 bg-warning/10 text-warning"
        : severity === "positive"
          ? "border-positive/30 bg-positive/10 text-positive"
          : severity === "info"
            ? "border-accent/30 bg-accent/10 text-accent"
            : "border-line bg-raised text-muted";

  const borderClass =
    severity === "negative"
      ? "border-negative/50"
      : severity === "warning"
        ? "border-warning/50"
        : severity === "info"
          ? "border-accent/50"
          : "border-line";

  const kindLabel =
    item.kind === "machine_running"
      ? "Running"
      : item.kind === "machine_fault"
        ? "Fault"
        : item.kind === "machine_completed"
          ? "Completed"
          : item.kind === "machine_stopped"
            ? "Stopped"
            : item.kind === "lpg_maintenance" || item.kind === "machine_maintenance"
              ? "Maintenance"
              : item.kind === "machine_maintenance_logged" || item.kind === "lpg_maintenance_completed"
                ? "Serviced"
              : item.kind === "lpg_gas_critical"
                ? "Gas Leak"
                : item.kind === "lpg_gas_warning"
                  ? "Elevated Gas"
                  : item.kind === "lpg_critical"
                    ? "Critical Low"
                    : item.kind === "lpg_low"
                      ? "Low LPG"
                      : "Activity";

  return { badgeClass, borderClass, kindLabel };
}

export function formatNotificationTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return String(iso);
  return dt.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function notificationHref(
  item: Pick<WorkspaceNotificationEvent, "branch_id" | "category" | "incident_id"> & {
    kind?: string;
  },
): string {
  if (item.kind === "machine_maintenance_logged") {
    return `/branches/${item.branch_id}/maintenance`;
  }
  if (item.incident_id) {
    return `/branches/${item.branch_id}/incidents/${item.incident_id}`;
  }
  return item.category === "lpg"
    ? `/branches/${item.branch_id}/lpg`
    : `/branches/${item.branch_id}/machines`;
}

export function detectNotificationTransitions(
  prevMap: Record<string, DeviceTransitionSnapshot> | null,
  devices: NotificationDeviceSummary[],
  checkedAt: string,
): {
  nextMap: Record<string, DeviceTransitionSnapshot>;
  triggeredEvents: WorkspaceNotificationEvent[];
} {
  const nextMap: Record<string, DeviceTransitionSnapshot> = {};
  const triggeredEvents: WorkspaceNotificationEvent[] = [];
  const seeded = prevMap !== null && typeof prevMap === "object";

  for (const dev of devices || []) {
    if (!dev || !dev.source_id || !dev.branch_id) continue;
    const stateKey = `${dev.branch_id}:${dev.source_id}`;
    const prev = seeded ? prevMap[stateKey] : null;
    const isMachine =
      dev.type === "washer" || dev.type === "dryer" || dev.type === "washer_dryer";
    const isLpg = dev.type === "lpg_edge_node";
    const currBand = isLpg && !dev.maintenance_mode ? lpgFillBand(dev.lpg_percent) : null;
    const currGasCond =
      isLpg && dev.ppm_calibrated && dev.freshness === "fresh"
        ? dev.gas_condition || null
        : null;
    const occurredAt = dev.sample_at || checkedAt || new Date().toISOString();
    const label = dev.label || dev.source_id;
    const branchName = dev.branch_name || "Branch";

    const stateUpper = String(dev.state || "UNKNOWN").trim().toUpperCase();
    const isMaintMode = Boolean(dev.maintenance_mode) || stateUpper === "MAINTENANCE";

    nextMap[stateKey] = {
      state: stateUpper,
      fault_code: dev.fault_code || null,
      lpg_band: currBand,
      gas_condition: currGasCond,
      maintenance_mode: isMaintMode,
    };

    if (!seeded) continue;

    if (isMachine) {
      if (stateUpper === "RUNNING" && prev?.state !== "RUNNING") {
        const prog = formatNotificationProgram(dev.program_id);
        triggeredEvents.push({
          id: `tx:${dev.branch_id}:machine:${dev.source_id}:running:${occurredAt}`,
          branch_id: dev.branch_id,
          branch_name: branchName,
          category: "machine",
          kind: "machine_running",
          severity: "info",
          title: "Machine running",
          detail: `${label} started ${prog || "cycle"}`,
          source_id: dev.source_id,
          device_label: label,
          occurred_at: occurredAt,
          active: true,
        });
      }
      if (
        stateUpper === "ERROR" &&
        (prev?.state !== "ERROR" || (dev.fault_code && dev.fault_code !== prev?.fault_code))
      ) {
        triggeredEvents.push({
          id: `tx:${dev.branch_id}:machine:${dev.source_id}:error:${occurredAt}`,
          branch_id: dev.branch_id,
          branch_name: branchName,
          category: "machine",
          kind: "machine_fault",
          severity: "negative",
          title: "Machine fault",
          detail: dev.fault_code
            ? `${label} reported fault ${dev.fault_code}`
            : `${label} broke down`,
          source_id: dev.source_id,
          device_label: label,
          occurred_at: occurredAt,
          active: true,
        });
      }
      if (isMaintMode && !prev?.maintenance_mode && prev?.state !== "MAINTENANCE") {
        triggeredEvents.push({
          id: `tx:${dev.branch_id}:machine:${dev.source_id}:maintenance:${occurredAt}`,
          branch_id: dev.branch_id,
          branch_name: branchName,
          category: "machine",
          kind: "machine_maintenance",
          severity: "warning",
          title: "Machine under maintenance",
          detail: dev.fault_code
            ? `${label} under maintenance (${dev.fault_code})`
            : `${label} is undergoing maintenance`,
          source_id: dev.source_id,
          device_label: label,
          occurred_at: occurredAt,
          active: true,
        });
      }
    } else if (isLpg) {
      if (dev.maintenance_mode && !prev?.maintenance_mode) {
        triggeredEvents.push({
          id: `tx:${dev.branch_id}:lpg:${dev.source_id}:maintenance:${occurredAt}`,
          branch_id: dev.branch_id,
          branch_name: branchName,
          category: "lpg",
          kind: "lpg_maintenance",
          severity: "warning",
          title: "LPG undergoing maintenance",
          detail: `${label} is undergoing maintenance`,
          source_id: dev.source_id,
          device_label: label,
          occurred_at: occurredAt,
          active: true,
        });
      }
      if (!dev.maintenance_mode) {
        if (currBand === "critical" && prev?.lpg_band !== "critical") {
          triggeredEvents.push({
            id: `tx:${dev.branch_id}:lpg:${dev.source_id}:critical:${occurredAt}`,
            branch_id: dev.branch_id,
            branch_name: branchName,
            category: "lpg",
            kind: "lpg_critical",
            severity: "negative",
            title: "LPG gas critically low",
            detail: `${label} at ${Number(dev.lpg_percent).toFixed(1)}% remaining`,
            source_id: dev.source_id,
            device_label: label,
            occurred_at: occurredAt,
            active: true,
          });
        } else if (
          currBand === "low" &&
          prev?.lpg_band !== "low" &&
          prev?.lpg_band !== "critical"
        ) {
          triggeredEvents.push({
            id: `tx:${dev.branch_id}:lpg:${dev.source_id}:low:${occurredAt}`,
            branch_id: dev.branch_id,
            branch_name: branchName,
            category: "lpg",
            kind: "lpg_low",
            severity: "warning",
            title: "LPG gas level low",
            detail: `${label} at ${Number(dev.lpg_percent).toFixed(1)}% remaining`,
            source_id: dev.source_id,
            device_label: label,
            occurred_at: occurredAt,
            active: true,
          });
        }
      }
      if (currGasCond === "critical" || currGasCond === "warning") {
        const hasPpm =
          dev.estimated_ppm !== null &&
          dev.estimated_ppm !== undefined &&
          Number.isFinite(Number(dev.estimated_ppm));
        if (currGasCond === "critical" && prev?.gas_condition !== "critical") {
          triggeredEvents.push({
            id: `tx:${dev.branch_id}:lpg:${dev.source_id}:gas_critical:${occurredAt}`,
            branch_id: dev.branch_id,
            branch_name: branchName,
            category: "lpg",
            kind: "lpg_gas_critical",
            severity: "negative",
            title: "LPG gas leak critical",
            detail: hasPpm
              ? `${label} estimated ${Math.round(Number(dev.estimated_ppm))} ppm (MQ-6)`
              : `${label} detected dangerous LPG gas levels`,
            source_id: dev.source_id,
            device_label: label,
            occurred_at: occurredAt,
            active: true,
          });
        } else if (
          currGasCond === "warning" &&
          prev?.gas_condition !== "warning" &&
          prev?.gas_condition !== "critical"
        ) {
          triggeredEvents.push({
            id: `tx:${dev.branch_id}:lpg:${dev.source_id}:gas_warning:${occurredAt}`,
            branch_id: dev.branch_id,
            branch_name: branchName,
            category: "lpg",
            kind: "lpg_gas_warning",
            severity: "warning",
            title: "LPG gas elevated",
            detail: hasPpm
              ? `${label} estimated ${Math.round(Number(dev.estimated_ppm))} ppm (MQ-6)`
              : `${label} detected elevated LPG gas levels`,
            source_id: dev.source_id,
            device_label: label,
            occurred_at: occurredAt,
            active: true,
          });
        }
      }
    }
  }

  return { nextMap, triggeredEvents };
}

export function mergeNotificationEvents(
  serverEvents: WorkspaceNotificationEvent[],
  localEvents: WorkspaceNotificationEvent[],
): WorkspaceNotificationEvent[] {
  const txList = (localEvents || []).filter(
    (item) => item && typeof item.id === "string" && item.id.startsWith("tx:"),
  );
  const suppressedTxIds = new Set<string>();
  const byId = new Map<string, WorkspaceNotificationEvent>();

  for (const item of serverEvents || []) {
    if (!item || !item.id) continue;
    const isLive = item.id.startsWith("live:");
    const isIncident = item.id.startsWith("incident:");
    const isMaintDurable =
      item.id.startsWith("maintcmd:") || item.id.startsWith("lpgmaint:");
    if (isLive || isIncident || isMaintDurable) {
      const itemMs = Date.parse(item.occurred_at || "");
      const matchingTx = txList.find((tx) => {
        if (
          tx.branch_id !== item.branch_id ||
          tx.source_id !== item.source_id ||
          tx.kind !== item.kind
        ) {
          return false;
        }
        const txMs = Date.parse(tx.occurred_at || "");
        return Number.isFinite(itemMs) && Number.isFinite(txMs)
          ? Math.abs(itemMs - txMs) <= 180_000
          : true;
      });
      if (matchingTx) {
        if ((isIncident && item.incident_id) || isMaintDurable) {
          suppressedTxIds.add(matchingTx.id);
        } else {
          continue;
        }
      }
    }
    byId.set(item.id, item);
  }

  for (const item of localEvents || []) {
    if (!item || !item.id || byId.has(item.id) || suppressedTxIds.has(item.id)) continue;
    byId.set(item.id, item);
  }

  return [...byId.values()]
    .sort((a, b) => {
      const bMs = Date.parse(b.occurred_at || "");
      const aMs = Date.parse(a.occurred_at || "");
      if (Number.isFinite(bMs) && Number.isFinite(aMs) && bMs !== aMs) {
        return bMs - aMs;
      }
      return String(b.occurred_at || "").localeCompare(String(a.occurred_at || ""));
    })
    .slice(0, 200);
}

function isNewerThan(occurredAt: string | null | undefined, lastReadAt: string): boolean {
  if (!occurredAt) return false;
  if (!lastReadAt) return true;
  const itemMs = Date.parse(occurredAt);
  const readMs = Date.parse(lastReadAt);
  if (Number.isFinite(itemMs) && Number.isFinite(readMs)) {
    return itemMs > readMs;
  }
  return String(occurredAt) > String(lastReadAt);
}

export function computeUnreadNotifications(
  events: WorkspaceNotificationEvent[],
  lastReadAt: string,
) {
  const unread = (events || []).filter((item) => isNewerThan(item.occurred_at, lastReadAt));
  return {
    unreadCount: unread.length,
    hasCriticalUnread: unread.some((item) => item.severity === "negative"),
  };
}
