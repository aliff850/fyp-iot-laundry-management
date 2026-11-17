"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  Building2,
  CheckCircle2,
  Flame,
  Play,
  Wrench,
  X,
} from "lucide-react";
import { fetchWorkspaceNotifications } from "@/app/notifications/actions";
import type {
  NotificationBranchOption,
  WorkspaceNotificationEvent,
} from "@/lib/auth/business";
import { PushNotificationToggle } from "@/components/workspace/notifications/PushNotificationToggle";
import {
  computeUnreadNotifications,
  detectNotificationTransitions,
  formatNotificationTimestamp,
  mergeNotificationEvents,
  NOTIFICATIONS_PAGE_SIZE,
  notificationHref,
  notificationStorageKeys,
  notificationVisuals,
  readNotificationStorageJson,
  writeNotificationStorageJson,
  type DeviceTransitionSnapshot,
} from "@/components/workspace/notifications/notificationLogic";

export type NotificationCategoryFilter = "all" | "machine" | "lpg";

interface ActiveToastItem {
  toastKey: string;
  event: WorkspaceNotificationEvent;
}

export interface NotificationCenterProps {
  currentBranchId?: string;
  userRole?: string | null;
  enabled?: boolean;
}

function NotificationKindIcon({
  kind,
  className = "size-4 shrink-0",
}: {
  kind: string;
  className?: string;
}) {
  if (kind === "machine_running") {
    return <Play className={`${className} text-accent`} aria-hidden="true" />;
  }
  if (kind === "machine_fault") {
    return <AlertTriangle className={`${className} text-negative`} aria-hidden="true" />;
  }
  if (kind === "machine_completed") {
    return <CheckCircle2 className={`${className} text-positive`} aria-hidden="true" />;
  }
  if (kind === "lpg_maintenance") {
    return <Wrench className={`${className} text-warning`} aria-hidden="true" />;
  }
  if (kind === "lpg_critical" || kind === "lpg_gas_critical") {
    return <Flame className={`${className} text-negative`} aria-hidden="true" />;
  }
  if (kind === "lpg_low" || kind === "lpg_gas_warning") {
    return <Flame className={`${className} text-warning`} aria-hidden="true" />;
  }
  return <Bell className={`${className} text-muted`} aria-hidden="true" />;
}

function BranchTag({
  branchId,
  branchName,
  currentBranchId,
}: {
  branchId: string;
  branchName: string;
  currentBranchId?: string;
}) {
  const isCurrent = Boolean(currentBranchId && currentBranchId === branchId);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <span
        className={`inline-flex max-w-full items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] leading-tight ${
          isCurrent
            ? "border-accent/40 bg-accent/15 font-semibold text-accent"
            : "border-control/40 bg-navy/70 font-medium text-ink"
        }`}
      >
        <Building2 className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{branchName || "Branch"}</span>
      </span>
    </div>
  );
}

export function NotificationCenter({
  currentBranchId,
  userRole = null,
  enabled = true,
}: NotificationCenterProps) {
  const [scopeKey, setScopeKey] = useState("workspace");
  const [events, setEvents] = useState<WorkspaceNotificationEvent[]>([]);
  const [branches, setBranches] = useState<NotificationBranchOption[]>([]);
  const [effectiveRole, setEffectiveRole] = useState<string | null>(userRole ?? null);
  const [lastReadAt, setLastReadAt] = useState("");
  const [pollError, setPollError] = useState<string | null>(null);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<NotificationCategoryFilter>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [modalPage, setModalPage] = useState(1);
  const [toasts, setToasts] = useState<ActiveToastItem[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const modalListRef = useRef<HTMLDivElement>(null);
  const toastTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const scopeRef = useRef(scopeKey);
  const eventsRef = useRef(events);

  useEffect(() => {
    scopeRef.current = scopeKey;
  }, [scopeKey]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const keys = notificationStorageKeys("workspace");
      const cachedFeed = readNotificationStorageJson<WorkspaceNotificationEvent[]>(keys.feed, []);
      const cachedRead = readNotificationStorageJson<string>(keys.lastRead, "");
      if (Array.isArray(cachedFeed) && cachedFeed.length > 0) {
        setEvents(cachedFeed);
      }
      if (typeof cachedRead === "string" && cachedRead) {
        setLastReadAt(cachedRead);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const dismissToast = useCallback((toastKey: string) => {
    const existingTimer = toastTimersRef.current.get(toastKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
      toastTimersRef.current.delete(toastKey);
    }
    setToasts((prev) => prev.filter((t) => t.toastKey !== toastKey));
  }, []);

  const enqueueToast = useCallback((event: WorkspaceNotificationEvent) => {
    const toastKey = `${event.id}:${Date.now()}`;
    const isSticky = event.severity === "negative";

    setToasts((prev) => {
      const next = [...prev];
      while (next.length >= 3) {
        const removableIdx = next.findIndex((item) => item.event.severity !== "negative");
        const removeIdx = removableIdx >= 0 ? removableIdx : 0;
        const removed = next.splice(removeIdx, 1)[0];
        if (removed) {
          const timer = toastTimersRef.current.get(removed.toastKey);
          if (timer) {
            clearTimeout(timer);
            toastTimersRef.current.delete(removed.toastKey);
          }
        }
      }
      next.push({ toastKey, event });
      return next;
    });

    if (!isSticky) {
      const duration = event.severity === "warning" ? 8000 : 6000;
      const timer = setTimeout(() => {
        toastTimersRef.current.delete(toastKey);
        setToasts((prev) => prev.filter((item) => item.toastKey !== toastKey));
      }, duration);
      toastTimersRef.current.set(toastKey, timer);
    }
  }, []);

  useEffect(() => {
    const timers = toastTimersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const markNotificationsRead = useCallback((customEvents?: WorkspaceNotificationEvent[]) => {
    const currentList = customEvents ?? eventsRef.current;
    const newest =
      currentList.find((item) => item.occurred_at)?.occurred_at || new Date().toISOString();
    const keys = notificationStorageKeys(scopeRef.current);
    writeNotificationStorageJson(keys.lastRead, newest);
    setLastReadAt(newest);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let authStopped = false;

    const pollOnce = async () => {
      if (cancelled || authStopped) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;

      const result = await fetchWorkspaceNotifications("all");
      if (cancelled) return;

      if (!result.ok) {
        if (result.status === 401 || result.status === 403) {
          authStopped = true;
        }
        setPollError(result.message);
        return;
      }

      setPollError(null);
      const data = result.data;
      const nextScope = `${data.organization_id || "org"}.${data.role || "member"}`;
      const keys = notificationStorageKeys(nextScope);
      scopeRef.current = nextScope;
      setScopeKey(nextScope);
      setEffectiveRole(data.role || userRole || null);
      setBranches(data.branches || []);

      const prevFeed = readNotificationStorageJson<WorkspaceNotificationEvent[]>(
        keys.feed,
        eventsRef.current,
      );
      const prevRead = readNotificationStorageJson<string>(keys.lastRead, "");
      if (prevRead) {
        setLastReadAt(prevRead);
      }

      const prevMap = readNotificationStorageJson<Record<string, DeviceTransitionSnapshot> | null>(
        keys.prevState,
        null,
      );
      const { nextMap, triggeredEvents } = detectNotificationTransitions(
        prevMap,
        data.devices || [],
        data.checked_at,
      );
      writeNotificationStorageJson(keys.prevState, nextMap);

      const merged = mergeNotificationEvents(data.events || [], [
        ...triggeredEvents,
        ...prevFeed,
      ]);
      writeNotificationStorageJson(keys.feed, merged);
      setEvents(merged);

      for (const triggered of triggeredEvents) {
        enqueueToast(triggered);
      }
    };

    void pollOnce();
    const interval = setInterval(() => {
      void pollOnce();
    }, 5000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void pollOnce();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, enqueueToast, userRole]);

  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDropdownOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    if (!isModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsModalOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen]);

  const { unreadCount, hasCriticalUnread } = useMemo(
    () => computeUnreadNotifications(events, lastReadAt),
    [events, lastReadAt],
  );

  const availableCategories = useMemo<
    Array<{ key: NotificationCategoryFilter; label: string }>
  >(() => {
    if (effectiveRole === "machine_maintenance") {
      return [
        { key: "all", label: "All" },
        { key: "machine", label: "Machines" },
      ];
    }
    if (effectiveRole === "lpg_maintenance") {
      return [
        { key: "all", label: "All" },
        { key: "lpg", label: "LPG & Safety" },
      ];
    }
    return [
      { key: "all", label: "All" },
      { key: "machine", label: "Machines" },
      { key: "lpg", label: "LPG & Safety" },
    ];
  }, [effectiveRole]);

  const safeCategoryFilter = availableCategories.some((c) => c.key === categoryFilter)
    ? categoryFilter
    : "all";

  const branchFilteredEvents = useMemo(() => {
    if (branchFilter === "all") return events;
    return events.filter((item) => item.branch_id === branchFilter);
  }, [events, branchFilter]);

  const modalFilteredEvents = useMemo(() => {
    if (safeCategoryFilter === "all") return branchFilteredEvents;
    return branchFilteredEvents.filter((item) => item.category === safeCategoryFilter);
  }, [branchFilteredEvents, safeCategoryFilter]);

  const totalCount = modalFilteredEvents.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / NOTIFICATIONS_PAGE_SIZE));
  const clampedPage = Math.min(Math.max(1, modalPage), totalPages);
  const modalPageItems = modalFilteredEvents.slice(
    (clampedPage - 1) * NOTIFICATIONS_PAGE_SIZE,
    clampedPage * NOTIFICATIONS_PAGE_SIZE,
  );

  const previewItems = events.slice(0, 5);

  const openModal = () => {
    setIsDropdownOpen(false);
    markNotificationsRead();
    setModalPage(1);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    triggerRef.current?.focus();
  };

  if (!enabled) {
    return null;
  }

  return (
    <>
      <div ref={containerRef} id="notificationsWrap" className="relative">
        <button
          ref={triggerRef}
          id="notificationsButton"
          type="button"
          aria-haspopup="dialog"
          aria-expanded={isDropdownOpen}
          aria-controls="notificationsDropdown"
          aria-label="Notifications"
          title="Notifications"
          onClick={() => setIsDropdownOpen((prev) => !prev)}
          className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-control bg-navy text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Bell className="size-5 shrink-0" aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              id="notificationsBadge"
              className={`absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums ${
                hasCriticalUnread ? "bg-negative text-ink" : "bg-accent text-surface"
              }`}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </button>

        {isDropdownOpen && (
          <div
            id="notificationsDropdown"
            role="region"
            aria-label="Recent notifications"
            className="fixed right-3 top-16 z-40 flex w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden rounded-md border border-line bg-surface text-ink shadow-xl sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-96"
          >
            <div className="flex items-center justify-between gap-2 border-b border-rule px-4 py-2.5">
              <span className="text-sm font-semibold text-ink">Notifications</span>
              <button
                id="notificationsMarkRead"
                type="button"
                onClick={() => markNotificationsRead()}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded px-3 text-xs font-medium text-accent transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
              >
                Mark read
              </button>
            </div>

            {pollError && (
              <div className="border-b border-rule bg-negative/10 px-4 py-2 text-xs text-negative">
                {pollError}
              </div>
            )}

            <ul id="notificationsDropdownList" className="max-h-80 divide-y divide-rule overflow-y-auto">
              {previewItems.length === 0 ? (
                <li className="px-4 py-6 text-center text-xs text-muted">
                  No notifications recorded.
                </li>
              ) : (
                previewItems.map((item) => {
                  const visuals = notificationVisuals(item);
                  const isCurrentBranch = Boolean(
                    currentBranchId && currentBranchId === item.branch_id,
                  );
                  return (
                    <li key={item.id}>
                      <Link
                        href={notificationHref(item)}
                        onClick={() => setIsDropdownOpen(false)}
                        className={`block px-4 py-3 transition-colors hover:bg-raised/40 focus-visible:outline-2 focus-visible:outline-accent ${
                          isCurrentBranch ? "border-l-2 border-l-accent bg-navy/25" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-rule bg-raised/60">
                            <NotificationKindIcon kind={item.kind} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className="truncate text-xs font-semibold text-ink">
                                  {item.title}
                                </span>
                                <span
                                  className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${visuals.badgeClass}`}
                                >
                                  {visuals.kindLabel}
                                </span>
                              </div>
                              <span className="shrink-0 text-[11px] tabular-nums text-faint">
                                {formatNotificationTimestamp(item.occurred_at)}
                              </span>
                            </div>
                            <p className="mt-1 break-words text-xs text-muted">
                              {item.detail || item.device_label || item.source_id}
                            </p>
                            <BranchTag
                              branchId={item.branch_id}
                              branchName={item.branch_name}
                              currentBranchId={currentBranchId}
                            />
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })
              )}
            </ul>

            <div className="border-t border-rule bg-raised/30 p-2">
              <button
                id="displayAllNotificationsBtn"
                type="button"
                onClick={openModal}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-control bg-navy px-3 text-xs font-semibold text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent"
              >
                Display all notifications
              </button>
            </div>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="allNotificationsTitle"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80 p-3 sm:p-4"
        >
          <div className="flex h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none flex-col overflow-hidden rounded-md border border-control bg-surface text-ink shadow-2xl sm:h-11/12 sm:w-11/12">
            <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3.5 sm:px-5">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-raised/60">
                  <Bell className="size-5 text-accent" aria-hidden="true" />
                </div>
                <h2
                  id="allNotificationsTitle"
                  className="truncate text-base font-semibold text-ink sm:text-lg"
                >
                  Notifications
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close notifications modal"
                onClick={closeModal}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-control bg-raised/40 text-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
              >
                <X className="size-5" aria-hidden="true" />
                <span className="sr-only">Close</span>
              </button>
            </div>

            <div className="flex flex-col gap-3 border-b border-rule bg-raised/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div
                role="group"
                aria-label="Filter notification history"
                className="flex flex-wrap gap-2"
              >
                {availableCategories.map(({ key, label }) => {
                  const active = safeCategoryFilter === key;
                  const count =
                    key === "all"
                      ? branchFilteredEvents.length
                      : branchFilteredEvents.filter((item) => item.category === key).length;
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setCategoryFilter(key);
                        setModalPage(1);
                        if (modalListRef.current) modalListRef.current.scrollTop = 0;
                      }}
                      className={
                        active
                          ? "inline-flex min-h-11 items-center justify-center rounded-md border border-control bg-navy-selected px-3.5 py-2 text-xs font-semibold text-ink focus-visible:outline-2 focus-visible:outline-accent"
                          : "inline-flex min-h-11 items-center justify-center rounded-md border border-line bg-raised/40 px-3.5 py-2 text-xs font-medium text-muted transition-colors hover:border-control hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                      }
                    >
                      {`${label} (${count})`}
                    </button>
                  );
                })}
              </div>

              {branches.length > 1 && (
                <div className="w-full sm:w-auto sm:min-w-56">
                  <select
                    aria-label="Filter by branch"
                    value={branchFilter}
                    onChange={(event) => {
                      setBranchFilter(event.target.value);
                      setModalPage(1);
                      if (modalListRef.current) modalListRef.current.scrollTop = 0;
                    }}
                    className="min-h-11 w-full rounded-md border border-control bg-canvas px-3 py-2 text-xs text-ink focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <option value="all">All permitted branches</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <PushNotificationToggle variant="inline" />

            {pollError && (
              <div className="border-b border-rule bg-negative/10 px-4 py-2.5 text-xs text-negative sm:px-5">
                {pollError}
              </div>
            )}

            <div ref={modalListRef} className="min-h-0 flex-1 overflow-y-auto">
              <ul className="divide-y divide-rule">
                {modalPageItems.length === 0 ? (
                  <li className="px-5 py-10 text-center text-sm text-muted">
                    No notifications match this filter.
                  </li>
                ) : (
                  modalPageItems.map((item) => {
                    const visuals = notificationVisuals(item);
                    const categoryLabel = item.category === "lpg" ? "LPG & Safety" : "Machine";
                    const isCurrentBranch = Boolean(
                      currentBranchId && currentBranchId === item.branch_id,
                    );
                    return (
                      <li key={item.id}>
                        <Link
                          href={notificationHref(item)}
                          onClick={() => setIsModalOpen(false)}
                          className={`block px-4 py-3.5 transition-colors hover:bg-raised/30 focus-visible:outline-2 focus-visible:outline-accent sm:px-5 ${
                            isCurrentBranch ? "border-l-2 border-l-accent bg-navy/25" : ""
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-rule bg-raised/60">
                              <NotificationKindIcon kind={item.kind} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <span className="truncate text-xs font-semibold text-ink">
                                    {item.title}
                                  </span>
                                  <span
                                    className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${visuals.badgeClass}`}
                                  >
                                    {visuals.kindLabel}
                                  </span>
                                  <span className="rounded border border-rule bg-raised/40 px-1.5 py-0.5 text-[11px] text-muted">
                                    {categoryLabel}
                                  </span>
                                </div>
                                <span className="shrink-0 text-[11px] tabular-nums text-faint">
                                  {formatNotificationTimestamp(item.occurred_at)}
                                </span>
                              </div>
                              <p className="mt-1 break-words text-xs text-muted">
                                {item.detail || item.device_label || item.source_id}
                              </p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span
                                  className={`inline-flex max-w-full items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] leading-tight ${
                                    isCurrentBranch
                                      ? "border-accent/40 bg-accent/15 font-semibold text-accent"
                                      : "border-control/40 bg-navy/70 font-medium text-ink"
                                  }`}
                                >
                                  <Building2 className="size-3 shrink-0" aria-hidden="true" />
                                  <span className="truncate">{item.branch_name || "Branch"}</span>
                                </span>
                                {item.source_id && (
                                  <span className="text-[11px] tabular-nums text-faint">
                                    {`Device: ${item.device_label || item.source_id} (${item.source_id})`}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>

            {totalPages > 1 && (
              <div
                id="notificationsModalPager"
                className="flex flex-col gap-2 border-t border-rule bg-raised/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <p className="text-xs tabular-nums text-muted sm:text-sm">
                  {`Page ${clampedPage} of ${totalPages} (${totalCount} notifications)`}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={clampedPage <= 1}
                    onClick={() => {
                      setModalPage((prev) => Math.max(1, prev - 1));
                      if (modalListRef.current) modalListRef.current.scrollTop = 0;
                    }}
                    className="inline-flex min-h-11 min-w-11 flex-1 items-center justify-center rounded-md border border-control bg-navy px-4 text-sm font-medium text-ink transition-colors enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted sm:flex-initial"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={clampedPage >= totalPages}
                    onClick={() => {
                      setModalPage((prev) => Math.min(totalPages, prev + 1));
                      if (modalListRef.current) modalListRef.current.scrollTop = 0;
                    }}
                    className="inline-flex min-h-11 min-w-11 flex-1 items-center justify-center rounded-md border border-control bg-navy px-4 text-sm font-medium text-ink transition-colors enabled:hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-raised disabled:text-muted sm:flex-initial"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div
          id="toastRegion"
          aria-live="polite"
          className="pointer-events-none fixed bottom-20 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2 md:bottom-4"
        >
          {toasts.map(({ toastKey, event }) => {
            const visuals = notificationVisuals(event);
            const isSticky = event.severity === "negative";
            return (
              <div
                key={toastKey}
                role={isSticky ? "alert" : "status"}
                className={`pointer-events-auto flex w-full items-start gap-3 rounded-md border ${visuals.borderClass} bg-surface p-3.5 text-ink shadow-xl`}
              >
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-rule bg-raised/60">
                  <NotificationKindIcon kind={event.kind} />
                </div>
                <Link
                  href={notificationHref(event)}
                  onClick={() => dismissToast(toastKey)}
                  className="min-w-0 flex-1 rounded focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-ink">{event.title}</p>
                    <span
                      className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium ${visuals.badgeClass}`}
                    >
                      {visuals.kindLabel}
                    </span>
                  </div>
                  <p className="mt-0.5 break-words text-xs text-muted">
                    {event.detail || event.device_label || event.source_id}
                  </p>
                  <BranchTag
                    branchId={event.branch_id}
                    branchName={event.branch_name}
                    currentBranchId={currentBranchId}
                  />
                  <p className="mt-1 text-[11px] tabular-nums text-faint">
                    {formatNotificationTimestamp(event.occurred_at)}
                  </p>
                </Link>
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  onClick={() => dismissToast(toastKey)}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <X className="size-4" aria-hidden="true" />
                  <span className="sr-only">Dismiss</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
