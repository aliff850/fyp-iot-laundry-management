"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import {
  fetchPushPublicKey,
  registerPushSubscription,
  unregisterPushSubscription,
} from "@/app/notifications/actions";
import {
  detectPushSupport,
  ensurePushServiceWorker,
  extractPushKeys,
  getActiveBrowserPushSubscription,
  urlBase64ToUint8Array,
  type PushCapabilityStatus,
} from "@/components/workspace/notifications/pushClient";

interface PushNotificationToggleProps {
  variant?: "inline" | "card";
}

export interface PushStatusPresentation {
  label: string;
  detail: string;
  badgeClass: string;
  canToggle: boolean;
}

export function describePushStatus(status: PushCapabilityStatus): PushStatusPresentation {
  switch (status) {
    case "enabled":
      return {
        label: "Alerts enabled",
        detail: "Critical faults and LPG safety alerts notify this device even in the background.",
        badgeClass: "border-positive/30 bg-positive/10 text-positive",
        canToggle: true,
      };
    case "disabled":
      return {
        label: "Alerts off",
        detail: "Receive device notifications for machine faults and LPG gas or low-tank alerts.",
        badgeClass: "border-line bg-raised text-muted",
        canToggle: true,
      };
    case "denied":
      return {
        label: "Blocked in browser",
        detail: "Notifications are blocked for this site. Re-enable them in your browser site settings.",
        badgeClass: "border-negative/30 bg-negative/10 text-negative",
        canToggle: false,
      };
    case "insecure_context":
      return {
        label: "HTTPS required",
        detail: "Push alerts require HTTPS or localhost.",
        badgeClass: "border-warning/30 bg-warning/10 text-warning",
        canToggle: false,
      };
    case "ios_install_required":
      return {
        label: "Install app required",
        detail: "Add SpinSense to your Home Screen from Safari Share, then enable push alerts here.",
        badgeClass: "border-warning/30 bg-warning/10 text-warning",
        canToggle: false,
      };
    case "unconfigured":
      return {
        label: "Not configured",
        detail: "Push delivery keys are not configured on the backend service yet.",
        badgeClass: "border-line bg-raised text-muted",
        canToggle: false,
      };
    case "unsupported":
      return {
        label: "Unsupported browser",
        detail: "This browser does not support Web Push notifications.",
        badgeClass: "border-line bg-raised text-muted",
        canToggle: false,
      };
    case "checking":
    default:
      return {
        label: "Checking",
        detail: "Checking notification permission and subscription status…",
        badgeClass: "border-line bg-raised text-muted",
        canToggle: false,
      };
  }
}

export function PushNotificationToggle({ variant = "inline" }: PushNotificationToggleProps) {
  const [status, setStatus] = useState<PushCapabilityStatus>("checking");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function inspectState() {
      const support = detectPushSupport();
      if (!support.supported) {
        if (!cancelled) {
          setStatus(support.reason ?? "unsupported");
        }
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) {
          setStatus("denied");
        }
        return;
      }

      const [keyResult, existingSub] = await Promise.all([
        fetchPushPublicKey(),
        getActiveBrowserPushSubscription(),
      ]);

      if (cancelled) return;

      if (!keyResult.ok) {
        setStatus("unconfigured");
        setFeedback(keyResult.message);
        return;
      }

      if (!keyResult.configured || !keyResult.publicKey) {
        setStatus("unconfigured");
        return;
      }

      setPublicKey(keyResult.publicKey);
      setStatus(existingSub ? "enabled" : "disabled");
    }

    void inspectState();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleEnable() {
    if (busy || !publicKey) return;
    setBusy(true);
    setFeedback(null);

    try {
      const permission =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (permission === "denied") {
        setStatus("denied");
        return;
      }
      if (permission !== "granted") {
        setStatus("disabled");
        return;
      }

      const reg = await ensurePushServiceWorker();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const serialized = extractPushKeys(sub);
      if (!serialized) {
        setFeedback("Browser returned an incomplete push subscription.");
        return;
      }

      const saved = await registerPushSubscription(serialized);
      if (!saved.ok) {
        setFeedback(saved.message);
        return;
      }

      setStatus("enabled");
    } catch (error) {
      setFeedback(
        error instanceof Error && error.message
          ? error.message
          : "Unable to enable push alerts on this device.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    if (busy) return;
    setBusy(true);
    setFeedback(null);

    try {
      const existingSub = await getActiveBrowserPushSubscription();
      const endpoint = existingSub?.endpoint;
      if (existingSub) {
        await existingSub.unsubscribe();
      }
      if (endpoint) {
        const res = await unregisterPushSubscription(endpoint);
        if (!res.ok) {
          setFeedback(res.message);
        }
      }
      setStatus("disabled");
    } catch {
      setFeedback("Unable to disable push alerts right now.");
    } finally {
      setBusy(false);
    }
  }

  const meta = describePushStatus(status);

  if (variant === "inline") {
    return (
      <div className="flex flex-col gap-2 border-b border-rule bg-surface/60 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          {status === "enabled" ? (
            <BellRing className="size-4 shrink-0 text-positive" aria-hidden="true" />
          ) : status === "denied" ? (
            <BellOff className="size-4 shrink-0 text-negative" aria-hidden="true" />
          ) : (
            <Bell className="size-4 shrink-0 text-muted" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-ink">Device push alerts</span>
              <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${meta.badgeClass}`}>
                {meta.label}
              </span>
            </div>
            {(feedback || !meta.canToggle) && (
              <p className="mt-0.5 text-[11px] text-muted">{feedback ?? meta.detail}</p>
            )}
          </div>
        </div>

        {meta.canToggle && (
          <div className="shrink-0">
            {status === "enabled" ? (
              <button
                type="button"
                disabled={busy}
                onClick={handleDisable}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-control bg-raised/40 px-3 text-xs font-medium text-ink transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {busy ? "Disabling…" : "Disable push alerts"}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={handleEnable}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-control bg-navy px-3 text-xs font-semibold text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {busy ? "Enabling…" : "Enable push alerts"}
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <section
      aria-labelledby="push-alerts-heading"
      className="rounded-md border border-rule bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-col gap-3 border-b border-rule pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="push-alerts-heading" className="text-base font-semibold text-ink">
            Device Push Alerts
          </h2>
          <p className="mt-1 text-xs text-muted">{meta.detail}</p>
        </div>
        <span className={`self-start rounded border px-2.5 py-1 text-xs font-medium sm:self-center ${meta.badgeClass}`}>
          {meta.label}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          Only critical machine faults and LPG gas or low-cylinder warnings trigger device alerts.
        </p>

        {meta.canToggle && (
          <div className="shrink-0">
            {status === "enabled" ? (
              <button
                type="button"
                disabled={busy}
                onClick={handleDisable}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-control bg-raised/40 px-4 text-xs font-medium text-ink transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {busy ? "Disabling…" : "Disable on this device"}
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={handleEnable}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-control bg-navy px-4 text-xs font-semibold text-ink transition-colors hover:bg-navy-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {busy ? "Enabling…" : "Enable on this device"}
              </button>
            )}
          </div>
        )}
      </div>

      {feedback && (
        <p role="status" className="mt-3 rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
          {feedback}
        </p>
      )}
    </section>
  );
}
