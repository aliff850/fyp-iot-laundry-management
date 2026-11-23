"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActionToastCard,
  type ActionToastKind,
} from "@/components/workspace/common/ActionToast";

export interface NotifyActionInput {
  id?: string;
  kind: ActionToastKind;
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
  durationMs?: number;
}

export interface ActionToastEntry {
  id: string;
  kind: ActionToastKind;
  title: string;
  message: string;
  timestamp: number;
  actionHref?: string;
  actionLabel?: string;
  durationMs?: number;
}

export interface ActionToastContextValue {
  notify: (input: NotifyActionInput) => string;
  dismiss: (id: string) => void;
  clearAll: () => void;
}

export const MAX_ACTION_TOASTS = 3;

export function defaultDurationForKind(kind: ActionToastKind): number | null {
  if (kind === "success") return 6000;
  if (kind === "error") return 10000;
  return null;
}

export function upsertActionToast(
  current: ActionToastEntry[],
  entry: ActionToastEntry,
  maxItems = MAX_ACTION_TOASTS,
): ActionToastEntry[] {
  const existingIndex = current.findIndex((item) => item.id === entry.id);
  if (existingIndex >= 0) {
    const next = [...current];
    next[existingIndex] = entry;
    return next;
  }
  const appended = [...current, entry];
  return appended.length > maxItems
    ? appended.slice(appended.length - maxItems)
    : appended;
}

const NOOP_CONTEXT: ActionToastContextValue = {
  notify: (input) => input.id ?? "noop-toast",
  dismiss: () => {},
  clearAll: () => {},
};

const ActionToastContext = createContext<ActionToastContextValue>(NOOP_CONTEXT);

export function useActionToast(): ActionToastContextValue {
  return useContext(ActionToastContext);
}

/**
 * Wraps a Next.js useActionState Server Action so every completed submission emits
 * a floating bottom-left ActionToast cleanly without effect-driven renders.
 */
export function withActionToast<State extends { message?: string; success?: boolean }>(
  notify: ActionToastContextValue["notify"],
  serverAction: (prev: State, formData: FormData) => Promise<State>,
  options: {
    id?: string;
    successTitle: string;
    errorTitle: string;
    resolveSuccessMessage?: (state: State) => string | undefined;
  },
) {
  return async (prev: State, formData: FormData): Promise<State> => {
    const next = await serverAction(prev, formData);
    const successMsg =
      options.resolveSuccessMessage?.(next) ?? next.message;
    if (next.success) {
      notify({
        ...(options.id ? { id: options.id } : {}),
        kind: "success",
        title: options.successTitle,
        message: successMsg || "Changes saved.",
      });
    } else if (next.message) {
      notify({
        ...(options.id ? { id: options.id } : {}),
        kind: "error",
        title: options.errorTitle,
        message: next.message,
      });
    }
    return next;
  };
}

export function ActionToastProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<ActionToastEntry[]>([]);
  const [revision, setRevision] = useState(0);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const popoverRef = useRef<HTMLDivElement>(null);

  const clearTimer = useCallback((id: string) => {
    const handle = timersRef.current.get(id);
    if (handle !== undefined) {
      clearTimeout(handle);
      timersRef.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((item) => item.id !== id));
    },
    [clearTimer],
  );

  const clearAll = useCallback(() => {
    for (const handle of timersRef.current.values()) {
      clearTimeout(handle);
    }
    timersRef.current.clear();
    setToasts([]);
  }, []);

  const notify = useCallback(
    (input: NotifyActionInput): string => {
      const id =
        input.id ??
        (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`);

      clearTimer(id);
      const entry: ActionToastEntry = {
        id,
        kind: input.kind,
        title: input.title,
        message: input.message,
        timestamp: Date.now(),
        actionHref: input.actionHref,
        actionLabel: input.actionLabel,
        durationMs: input.durationMs,
      };

      setToasts((prev) => upsertActionToast(prev, entry));
      setRevision((rev) => rev + 1);

      const ttl =
        input.durationMs !== undefined
          ? input.durationMs
          : defaultDurationForKind(input.kind);
      if (ttl !== null && ttl > 0) {
        const timer = setTimeout(() => {
          timersRef.current.delete(id);
          setToasts((prev) => prev.filter((item) => item.id !== id));
        }, ttl);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [clearTimer],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const handle of timers.values()) {
        clearTimeout(handle);
      }
      timers.clear();
    };
  }, []);

  useEffect(() => {
    const node = popoverRef.current as
      | (HTMLDivElement & {
          showPopover?: () => void;
          hidePopover?: () => void;
          matches?: (selector: string) => boolean;
        })
      | null;
    if (!node) return;
    try {
      const isOpen = node.matches?.(":popover-open") ?? false;
      if (toasts.length > 0) {
        // Re-promote into the browser Top Layer above any active <dialog>.showModal()
        if (isOpen) node.hidePopover?.();
        node.showPopover?.();
      } else if (isOpen) {
        node.hidePopover?.();
      }
    } catch {
      // Fallback safely to fixed z-[100] positioning when Popover API is unavailable
    }
  }, [toasts.length, revision]);

  const value = useMemo(
    () => ({ notify, dismiss, clearAll }),
    [notify, dismiss, clearAll],
  );

  return (
    <ActionToastContext.Provider value={value}>
      {children}
      <div
        ref={popoverRef}
        popover="manual"
        aria-label="Action notifications"
        className={`pointer-events-none fixed inset-auto bottom-20 left-4 right-auto top-auto z-[100] m-0 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2.5 border-0 bg-transparent p-0 text-ink shadow-none outline-none md:bottom-5 md:left-5 ${
          toasts.length === 0 ? "hidden" : "flex"
        }`}
      >
        {toasts.map((toast) => (
          <ActionToastCard
            key={toast.id}
            kind={toast.kind}
            title={toast.title}
            message={toast.message}
            timestamp={toast.timestamp}
            actionHref={toast.actionHref}
            actionLabel={toast.actionLabel}
            onDismiss={() => dismiss(toast.id)}
          />
        ))}
      </div>
    </ActionToastContext.Provider>
  );
}
