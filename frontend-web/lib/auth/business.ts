import { createClient } from "@/lib/supabase/server";

export type MembershipState = "incomplete" | "pending" | "approval_pending" | "rejected" | "active" | "approved_unassigned" | "deactivated";
export type Membership = { state: MembershipState; organization: { id: string; name: string } | null; role: string | null };
export type JoinRequest = { id: string; user_id: string; state: string; full_name: string; phone: string; requested_at: string; decision_role: string | null };
export type WorkspaceBranch = { id: string; name: string; address: string; city: string; region: string; postal_code: string; contact_phone: string; opening_hours: string; latitude: number | null; longitude: number | null; service_status: "open" | "closed"; primary_manager_user_id: string; created_at: string };
export type ManagerOption = { user_id: string; full_name: string; role: "owner" | "branch_manager" };
export type BranchDirectory = { branches: WorkspaceBranch[]; summary: { branch_count: number; personnel_count: number; pending_request_count: number } | null };
export type Result<T> = { ok: true; value: T } | { ok: false; status: number; message: string };

function apiBase(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}

export async function businessRequest<T>(path: string, method = "GET", body?: object): Promise<Result<T>> {
  const base = apiBase();
  if (!base) return { ok: false, status: 503, message: "Business service is not configured." };
  let token: string;
  try {
    const client = await createClient();
    if (!client) return { ok: false, status: 503, message: "Authentication is unavailable." };
    // getUser establishes a fresh verified identity; getSession only supplies its bearer token.
    const { data: identity, error: identityError } = await client.auth.getUser();
    if (identityError || !identity.user?.email_confirmed_at) return { ok: false, status: 401, message: "Log in with a confirmed account." };
    const { data: session, error: sessionError } = await client.auth.getSession();
    if (sessionError || !session.session?.access_token) return { ok: false, status: 401, message: "Your session has expired. Log in again." };
    token = session.session.access_token;
  } catch {
    return { ok: false, status: 503, message: "Authentication is temporarily unavailable." };
  }
  try {
    const response = await fetch(`${base}${path}`, {
      method, cache: "no-store", signal: AbortSignal.timeout(method === "GET" ? 10000 : 30000),
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const messages: Record<number, string> = {
        401: "Your session has expired. Log in again.",
        403: "This action is not permitted for your current account.",
        404: "That request is no longer available.",
        409: "This request has changed. Refresh and review its current state.",
        422: "Review the selected action and role.",
        503: "Business setup is temporarily unavailable. Please retry.",
      };
      return { ok: false, status: response.status, message: messages[response.status] ?? "The business service could not complete this request." };
    }
    return { ok: true, value: await response.json() as T };
  } catch {
    return { ok: false, status: 503, message: method === "GET"
      ? "The business service is unavailable. Please retry."
      : "This action may have completed. Refresh the page to check its current status before retrying." };
  }
}

const states = new Set<MembershipState>(["incomplete", "pending", "approval_pending", "rejected", "active", "approved_unassigned", "deactivated"]);
const invalid = (): Result<never> => ({ ok: false, status: 503, message: "The business service returned an invalid response." });

export async function getMembership(path = "/onboarding", method = "GET"): Promise<Result<Membership>> {
  const result = await businessRequest<unknown>(path, method);
  if (!result.ok) return result;
  const row = result.value;
  if (!row || typeof row !== "object" || !("state" in row) || !states.has(row.state as MembershipState) ||
    !("role" in row) || (row.role !== null && typeof row.role !== "string") || !("organization" in row)) return invalid();
  const organization = row.organization;
  if (organization !== null && (!organization || typeof organization !== "object" ||
    !("id" in organization) || typeof organization.id !== "string" ||
    !("name" in organization) || typeof organization.name !== "string")) return invalid();
  const role = row.role;
  if ((row.state === "active" && !["owner", "branch_manager", "machine_maintenance", "lpg_maintenance"].includes(String(role))) ||
    (row.state === "approved_unassigned" && !["branch_manager", "machine_maintenance", "lpg_maintenance"].includes(String(role))) ||
    (!["active", "approved_unassigned"].includes(String(row.state)) && role !== null) ||
    (row.state !== "incomplete" && organization === null)) return invalid();
  return { ok: true, value: { state: row.state as MembershipState, role: row.role as string | null, organization: organization as Membership["organization"] } };
}

export async function getJoinRequests(): Promise<Result<JoinRequest[]>> {
  const result = await businessRequest<unknown>("/join-requests");
  if (!result.ok) return result;
  const body = result.value;
  if (!body || typeof body !== "object" || !("requests" in body) || !Array.isArray(body.requests) || body.requests.length > 100) return invalid();
  const requests: JoinRequest[] = [];
  for (const row of body.requests) {
    if (!row || typeof row !== "object" || typeof row.id !== "string" || typeof row.user_id !== "string" ||
      typeof row.state !== "string" || typeof row.full_name !== "string" || typeof row.phone !== "string" ||
      typeof row.requested_at !== "string" || (row.decision_role !== null && typeof row.decision_role !== "string")) return invalid();
    requests.push({ id: row.id, user_id: row.user_id, state: row.state, full_name: row.full_name, phone: row.phone, requested_at: row.requested_at, decision_role: row.decision_role });
  }
  return { ok: true, value: requests };
}

function validBranch(value: unknown): value is WorkspaceBranch {
  if (!value || typeof value !== "object") return false;
  const b = value as Record<string, unknown>;
  return ["id", "name", "address", "city", "region", "postal_code", "contact_phone", "opening_hours", "primary_manager_user_id", "created_at"].every(key => typeof b[key] === "string") &&
    (b.latitude === null || typeof b.latitude === "number") && (b.longitude === null || typeof b.longitude === "number") &&
    (b.service_status === "open" || b.service_status === "closed");
}

export async function getBranchDirectory(): Promise<Result<BranchDirectory>> {
  const result = await businessRequest<unknown>("/branches");
  if (!result.ok) return result;
  const body = result.value as Record<string, unknown> | null;
  if (!body || !Array.isArray(body.branches) || !body.branches.every(validBranch)) return invalid();
  const summary = body.summary as Record<string, unknown> | null;
  if (summary !== null && (!summary || !["branch_count", "personnel_count", "pending_request_count"].every(key => Number.isSafeInteger(summary[key]) && (summary[key] as number) >= 0))) return invalid();
  return { ok: true, value: { branches: body.branches, summary: summary as BranchDirectory["summary"] } };
}

export async function getManagerOptions(): Promise<Result<ManagerOption[]>> {
  const result = await businessRequest<unknown>("/branches/manager-options");
  if (!result.ok) return result;
  const body = result.value as Record<string, unknown> | null;
  if (!body || !Array.isArray(body.managers) || !body.managers.every((m: unknown) => m && typeof m === "object" &&
    typeof (m as ManagerOption).user_id === "string" && typeof (m as ManagerOption).full_name === "string" &&
    ["owner", "branch_manager"].includes((m as ManagerOption).role))) return invalid();
  return { ok: true, value: body.managers };
}
