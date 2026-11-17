"use server";

import {
  deletePushSubscription,
  getNotifications,
  getPushPublicKey,
  savePushSubscription,
  type PushSubscriptionSavePayload,
  type WorkspaceNotificationsPayload,
} from "@/lib/auth/business";

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export type FetchWorkspaceNotificationsResult =
  | { ok: true; data: WorkspaceNotificationsPayload }
  | { ok: false; status: number; message: string };

export async function fetchWorkspaceNotifications(
  category: "all" | "machine" | "lpg" = "all",
  branchId?: string,
): Promise<FetchWorkspaceNotificationsResult> {
  if (branchId && !UUID_REGEX.test(branchId)) {
    return { ok: false, status: 400, message: "Invalid branch identifier." };
  }
  const safeCategory = category === "machine" || category === "lpg" ? category : "all";
  const result = await getNotifications({
    category: safeCategory,
    branchId: branchId || undefined,
    limit: 100,
  });
  if (!result.ok) {
    return { ok: false, status: result.status, message: result.message };
  }
  return { ok: true, data: result.value };
}

function isValidHttpsEndpoint(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" && Boolean(parsed.hostname) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export type FetchPushPublicKeyResult =
  | { ok: true; configured: boolean; publicKey: string | null }
  | { ok: false; status: number; message: string };

export async function fetchPushPublicKey(): Promise<FetchPushPublicKeyResult> {
  const result = await getPushPublicKey();
  if (!result.ok) {
    return { ok: false, status: result.status, message: result.message };
  }
  return {
    ok: true,
    configured: result.value.configured && Boolean(result.value.public_key),
    publicKey: result.value.public_key,
  };
}

export type PushSubscriptionMutationResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

export async function registerPushSubscription(
  payload: PushSubscriptionSavePayload,
): Promise<PushSubscriptionMutationResult> {
  if (!payload || !isValidHttpsEndpoint(payload.endpoint)) {
    return { ok: false, status: 422, message: "Invalid Web Push subscription endpoint." };
  }
  const p256dh = typeof payload.keys?.p256dh === "string" ? payload.keys.p256dh.trim() : "";
  const auth = typeof payload.keys?.auth === "string" ? payload.keys.auth.trim() : "";
  if (!p256dh || !auth) {
    return { ok: false, status: 422, message: "Invalid Web Push encryption keys." };
  }
  const result = await savePushSubscription({
    endpoint: payload.endpoint.trim(),
    keys: { p256dh, auth },
    user_agent:
      typeof payload.user_agent === "string" && payload.user_agent.trim()
        ? payload.user_agent.trim().slice(0, 255)
        : undefined,
  });
  if (!result.ok) {
    return { ok: false, status: result.status, message: result.message };
  }
  return { ok: true };
}

export async function unregisterPushSubscription(
  endpoint: string,
): Promise<PushSubscriptionMutationResult> {
  if (!isValidHttpsEndpoint(endpoint)) {
    return { ok: false, status: 422, message: "Invalid Web Push subscription endpoint." };
  }
  const result = await deletePushSubscription(endpoint.trim());
  if (!result.ok) {
    return { ok: false, status: result.status, message: result.message };
  }
  return { ok: true };
}
