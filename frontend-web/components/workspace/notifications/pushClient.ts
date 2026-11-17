export type PushCapabilityStatus =
  | "checking"
  | "unsupported"
  | "insecure_context"
  | "ios_install_required"
  | "unconfigured"
  | "denied"
  | "enabled"
  | "disabled";

export interface PushSupportCheck {
  supported: boolean;
  reason?: "unsupported" | "insecure_context" | "ios_install_required";
}

export interface SerializedPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  user_agent?: string;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const cleaned = base64String.trim();
  const padding = "=".repeat((4 - (cleaned.length % 4)) % 4);
  const base64 = (cleaned + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  if (typeof window.matchMedia === "function") {
    return window.matchMedia("(display-mode: standalone)").matches;
  }
  return false;
}

export function isIosDevice(userAgent?: string): boolean {
  const ua =
    typeof userAgent === "string"
      ? userAgent
      : typeof navigator !== "undefined"
        ? navigator.userAgent
        : "";
  return /iphone|ipad|ipod/i.test(ua);
}

export function detectPushSupport(): PushSupportCheck {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { supported: false, reason: "unsupported" };
  }
  if (!window.isSecureContext) {
    return { supported: false, reason: "insecure_context" };
  }
  const hasApis =
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
  if (!hasApis) {
    if (isIosDevice() && !isStandalonePwa()) {
      return { supported: false, reason: "ios_install_required" };
    }
    return { supported: false, reason: "unsupported" };
  }
  return { supported: true };
}

export async function ensurePushServiceWorker(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register("/sw.js", {
    scope: "/",
    updateViaCache: "none",
  });
  await navigator.serviceWorker.ready;
  return reg;
}

export async function getActiveBrowserPushSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  const existingReg = await navigator.serviceWorker.getRegistration("/");
  if (!existingReg || !existingReg.pushManager) {
    return null;
  }
  return existingReg.pushManager.getSubscription();
}

export function extractPushKeys(sub: PushSubscription): SerializedPushSubscription | null {
  const json = typeof sub.toJSON === "function" ? sub.toJSON() : null;
  const endpoint = (json?.endpoint || sub.endpoint || "").trim();
  const p256dh = typeof json?.keys?.p256dh === "string" ? json.keys.p256dh.trim() : "";
  const auth = typeof json?.keys?.auth === "string" ? json.keys.auth.trim() : "";
  if (!endpoint || !p256dh || !auth) return null;
  const userAgent =
    typeof navigator !== "undefined" && navigator.userAgent
      ? navigator.userAgent.slice(0, 255)
      : undefined;
  return {
    endpoint,
    keys: { p256dh, auth },
    user_agent: userAgent,
  };
}

export async function unsubscribeBrowserPush(): Promise<string | null> {
  try {
    const sub = await getActiveBrowserPushSubscription();
    if (!sub) return null;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    return endpoint || null;
  } catch {
    return null;
  }
}

export async function cleanupPushOnSignOut(
  unregisterServer?: (endpoint: string) => Promise<unknown>,
): Promise<void> {
  const timeoutPromise = new Promise<void>((resolve) => {
    setTimeout(resolve, 1500);
  });
  const workPromise = (async () => {
    const endpoint = await unsubscribeBrowserPush();
    if (endpoint && unregisterServer) {
      try {
        await unregisterServer(endpoint);
      } catch {
        // Server cleanup is best-effort during sign-out.
      }
    }
  })();
  await Promise.race([workPromise, timeoutPromise]);
}
