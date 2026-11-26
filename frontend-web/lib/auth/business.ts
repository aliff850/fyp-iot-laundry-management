import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const perRequestCache: <T extends (...args: any[]) => any>(fn: T) => T =
  typeof cache === "function" ? cache : ((fn) => fn);

export type MembershipState = "incomplete" | "pending" | "approval_pending" | "rejected" | "active" | "approved_unassigned" | "deactivated";
export type MembershipProfile = { full_name: string; phone: string };
export type Membership = {
  state: MembershipState;
  organization: {
    id: string;
    name: string;
    logo_url?: string | null;
    business_timezone?: string;
  } | null;
  role: string | null;
  profile?: MembershipProfile | null;
};
export type JoinRequest = { id: string; user_id: string; state: string; full_name: string; phone: string; requested_at: string; decision_role: string | null };
export type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export type WeeklyHoursInterval = { open: string; close: string };
export type WeeklyHoursSchedule = Record<WeekdayKey, WeeklyHoursInterval[]>;
export type WorkspaceBranch = { id: string; name: string; address: string; city: string; region: string; postal_code: string; contact_phone: string; opening_hours: string; latitude: number | null; longitude: number | null; service_status: "open" | "closed"; is_published?: boolean; weekly_hours?: WeeklyHoursSchedule | null; primary_manager_user_id: string; primary_manager_name?: string | null; created_at: string };
export type ManagerOption = { user_id: string; full_name: string; role: "owner" | "branch_manager" | null };
export type OrganizationPersonnel = { user_id: string; full_name: string; phone: string; role: "owner" | "branch_manager" | "machine_maintenance" | "lpg_maintenance" | null; state: "active" | "approved_unassigned"; created_at: string; assigned_branches: string[]; assigned_branch_ids?: string[]; is_primary_manager?: boolean };
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

let inFlightTokenPromise: Promise<Result<string>> | null = null;

type ClaimsAuthClient = {
  getClaims?: () => Promise<{ data?: { claims?: Record<string, unknown> | null } | null; error?: unknown }>;
  getUser: () => Promise<{ data: { user?: { email_confirmed_at?: string | null } | null }; error?: unknown }>;
  getSession: () => Promise<{ data: { session?: { access_token?: string | null } | null }; error?: unknown }>;
};

const verifySessionTokenOnce = perRequestCache(async (): Promise<Result<string>> => {
  try {
    const client = await createClient();
    if (!client) return { ok: false, status: 503, message: "Authentication is unavailable." };
    const auth = client.auth as unknown as ClaimsAuthClient;
    if (typeof auth.getClaims === "function") {
      // getClaims verifies asymmetric JWTs locally via cached JWKS; FastAPI enforces /auth/v1/user + DB state.
      const { data: claimsData, error: claimsError } = await auth.getClaims();
      const claims = claimsData?.claims;
      const meta =
        claims?.user_metadata && typeof claims.user_metadata === "object"
          ? (claims.user_metadata as Record<string, unknown>)
          : null;
      if (claimsError || !claims?.sub || meta?.email_verified === false) {
        return { ok: false, status: 401, message: "Log in with a confirmed account." };
      }
    } else {
      const { data: identity, error: identityError } = await auth.getUser();
      if (identityError || !identity.user?.email_confirmed_at) {
        return { ok: false, status: 401, message: "Log in with a confirmed account." };
      }
    }
    const { data: session, error: sessionError } = await auth.getSession();
    if (sessionError || !session.session?.access_token) {
      return { ok: false, status: 401, message: "Your session has expired. Log in again." };
    }
    return { ok: true, value: session.session.access_token };
  } catch {
    return { ok: false, status: 503, message: "Authentication is temporarily unavailable." };
  }
});

async function resolveVerifiedBearerToken(): Promise<Result<string>> {
  if (inFlightTokenPromise) return inFlightTokenPromise;
  inFlightTokenPromise = verifySessionTokenOnce().finally(() => {
    inFlightTokenPromise = null;
  });
  return inFlightTokenPromise;
}

export async function businessRequest<T>(path: string, method = "GET", body?: object): Promise<Result<T>> {
  const base = apiBase();
  if (!base) return { ok: false, status: 503, message: "Business service is not configured." };
  const tokenRes = await resolveVerifiedBearerToken();
  if (!tokenRes.ok) return tokenRes;
  const token = tokenRes.value;
  try {
    const response = await fetch(`${base}${path}`, {
      method, cache: "no-store", signal: AbortSignal.timeout(method === "GET" ? 25000 : 30000),
      headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      let detailMessage: string | null = null;
      try {
        const errorData = await response.json();
        if (typeof errorData?.detail === "string" && errorData.detail.trim()) {
          detailMessage = errorData.detail.trim();
        } else if (Array.isArray(errorData?.detail)) {
          detailMessage = errorData.detail
            .map((err: { loc?: unknown[]; msg?: string }) => {
              const field = Array.isArray(err.loc) && err.loc.length > 1 ? String(err.loc[err.loc.length - 1]) : "";
              return field ? `${field}: ${err.msg || "invalid value"}` : (err.msg || "invalid value");
            })
            .filter(Boolean)
            .join("; ");
        } else if (typeof errorData?.message === "string" && errorData.message.trim()) {
          detailMessage = errorData.message.trim();
        }
      } catch {
        // Response was not JSON
      }
      const messages: Record<number, string> = {
        401: "Your session has expired. Log in again.",
        403: "This action is not permitted for your current account.",
        404: "That request is no longer available.",
        409: "This request has changed. Refresh and review its current state.",
        422: "Review the selected action and role.",
        503: "Business setup is temporarily unavailable. Please retry.",
      };
      return { ok: false, status: response.status, message: detailMessage || messages[response.status] || "The business service could not complete this request." };
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

function parseMembershipEnvelope(row: unknown): Membership | null {
  if (!row || typeof row !== "object" || !("state" in row) || !states.has(row.state as MembershipState) ||
    !("role" in row) || (row.role !== null && typeof row.role !== "string") || !("organization" in row)) return null;
  const organization = row.organization;
  if (organization !== null && (!organization || typeof organization !== "object" ||
    !("id" in organization) || typeof organization.id !== "string" ||
    !("name" in organization) || typeof organization.name !== "string")) return null;
  const role = row.role;
  if ((row.state === "active" && !["owner", "branch_manager", "machine_maintenance", "lpg_maintenance"].includes(String(role))) ||
    (row.state === "approved_unassigned" && role !== null && !["branch_manager", "machine_maintenance", "lpg_maintenance"].includes(String(role))) ||
    (!["active", "approved_unassigned"].includes(String(row.state)) && role !== null) ||
    (row.state !== "incomplete" && organization === null)) return null;

  let profile: MembershipProfile | null | undefined;
  if ("profile" in row) {
    const rawProfile = row.profile;
    if (rawProfile === null) {
      profile = null;
    } else if (
      rawProfile &&
      typeof rawProfile === "object" &&
      "full_name" in rawProfile &&
      typeof rawProfile.full_name === "string" &&
      "phone" in rawProfile &&
      typeof rawProfile.phone === "string"
    ) {
      profile = { full_name: rawProfile.full_name, phone: rawProfile.phone };
    }
  }

  return {
    state: row.state as MembershipState,
    role: row.role as string | null,
    organization: organization as Membership["organization"],
    ...(profile !== undefined ? { profile } : {}),
  };
}

export async function getMembership(path = "/onboarding", method = "GET"): Promise<Result<Membership>> {
  const result = await businessRequest<unknown>(path, method);
  if (!result.ok) return result;
  const parsed = parseMembershipEnvelope(result.value);
  return parsed ? { ok: true, value: parsed } : invalid();
}

export async function updateOwnProfile(input: {
  full_name: string;
  phone: string;
}): Promise<Result<Membership>> {
  const result = await businessRequest<unknown>("/me", "PATCH", input);
  if (!result.ok) return result;
  const parsed = parseMembershipEnvelope(result.value);
  return parsed ? { ok: true, value: parsed } : invalid();
}

export async function updateOrganizationDetails(input: {
  name: string;
  business_timezone: string;
}): Promise<Result<{ organization: NonNullable<Membership["organization"]> }>> {
  const result = await businessRequest<unknown>("/organization", "PATCH", input);
  if (!result.ok) return result;
  const row = result.value;
  if (!row || typeof row !== "object" || !("organization" in row)) return invalid();
  const org = (row as { organization: unknown }).organization;
  if (
    !org ||
    typeof org !== "object" ||
    !("id" in org) ||
    typeof org.id !== "string" ||
    !("name" in org) ||
    typeof org.name !== "string"
  ) {
    return invalid();
  }
  return {
    ok: true,
    value: { organization: org as NonNullable<Membership["organization"]> },
  };
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
    (b.primary_manager_name === undefined || b.primary_manager_name === null || typeof b.primary_manager_name === "string") &&
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
    ((m as ManagerOption).role === null || ["owner", "branch_manager"].includes((m as ManagerOption).role as string)))) return invalid();
  return { ok: true, value: body.managers };
}

export async function getOrganizationPersonnel(): Promise<Result<OrganizationPersonnel[]>> {
  const result = await businessRequest<unknown>("/personnel");
  if (!result.ok) return result;
  const body = result.value as Record<string, unknown> | null;
  if (!body || !Array.isArray(body.personnel)) return invalid();
  const personnel: OrganizationPersonnel[] = [];
  for (const row of body.personnel) {
    if (
      !row ||
      typeof row !== "object" ||
      typeof (row as Record<string, unknown>).user_id !== "string" ||
      typeof (row as Record<string, unknown>).full_name !== "string" ||
      typeof (row as Record<string, unknown>).phone !== "string" ||
      ((row as Record<string, unknown>).role !== null && typeof (row as Record<string, unknown>).role !== "string") ||
      typeof (row as Record<string, unknown>).state !== "string" ||
      typeof (row as Record<string, unknown>).created_at !== "string" ||
      !Array.isArray((row as Record<string, unknown>).assigned_branches)
    ) {
      return invalid();
    }
    personnel.push(row as OrganizationPersonnel);
  }
  return { ok: true, value: personnel };
}

export async function getBranchPersonnel(branchId: string): Promise<Result<OrganizationPersonnel[]>> {
  const result = await businessRequest<unknown>(`/branches/${branchId}/personnel`);
  if (!result.ok) return result;
  const body = result.value as Record<string, unknown> | null;
  if (!body || !Array.isArray(body.personnel)) return invalid();
  const personnel: OrganizationPersonnel[] = [];
  for (const row of body.personnel) {
    if (
      !row ||
      typeof row !== "object" ||
      typeof (row as Record<string, unknown>).user_id !== "string" ||
      typeof (row as Record<string, unknown>).full_name !== "string" ||
      typeof (row as Record<string, unknown>).phone !== "string" ||
      ((row as Record<string, unknown>).role !== null && typeof (row as Record<string, unknown>).role !== "string") ||
      typeof (row as Record<string, unknown>).state !== "string" ||
      typeof (row as Record<string, unknown>).created_at !== "string" ||
      !Array.isArray((row as Record<string, unknown>).assigned_branches)
    ) {
      return invalid();
    }
    personnel.push(row as OrganizationPersonnel);
  }
  return { ok: true, value: personnel };
}

export type BranchImage = {
  id: string;
  image_url: string;
  sort_order: number;
  created_at: string | null;
};

export type BranchDetail = WorkspaceBranch & {
  images?: BranchImage[];
  primary_manager?: {
    user_id: string;
    full_name: string;
    phone: string;
  };
};

export type BranchPersonnelMember = {
  user_id: string;
  full_name: string;
  phone: string;
  role: string | null;
  is_primary_manager: boolean;
};

export type BranchOverviewIncident = {
  id: string;
  reference_code?: string;
  asset_name?: string;
  domain?: "machine" | "lpg" | string | null;
  fault_code?: string | null;
  fault_name?: string | null;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  workflow_state?: string;
  edge_condition_state?: string;
  created_at: string;
};

export type BranchOverviewData = {
  branch: BranchDetail;
  incidents: BranchOverviewIncident[];
  incidents_total_count?: number;
  personnel: {
    total_assigned: number;
    branch_managers: number;
    machine_techs: number;
    lpg_techs: number;
    roster: BranchPersonnelMember[];
  };
  fleet: {
    total_machines: number;
    washers: number;
    dryers: number;
    running: number;
    idle: number;
    error: number;
    offline: number;
    status: string;
  };
  lpg: {
    total_cylinders: number;
    active_cylinders: number;
    manifold_status: string;
    fuel_level_percent: number | null;
    status: string;
  };
  customer_reports: {
    pending_count: number;
    investigating_count: number;
  };
  performance: {
    today_revenue_myr: number | null;
    today_cycles: number | null;
    fleet_utilization_rate: number | null;
    lpg_consumed_kg: number | null;
  };
};

const fetchBranchCached = perRequestCache(async (branchId: string): Promise<Result<BranchDetail>> => {
  const result = await businessRequest<{ branch: BranchDetail }>(`/branches/${branchId}`);
  if (!result.ok) return result;
  if (!result.value?.branch || !validBranch(result.value.branch)) return invalid();
  return { ok: true, value: result.value.branch };
});

export async function getBranch(branchId: string): Promise<Result<BranchDetail>> {
  return fetchBranchCached(branchId);
}

export interface BranchUpdatePayload {
  name: string;
  address: string;
  city: string;
  region: string;
  postal_code: string;
  contact_phone: string;
  opening_hours: string;
  service_status: "open" | "closed";
  latitude: number | null;
  longitude: number | null;
  primary_manager_user_id?: string;
  is_published?: boolean;
  weekly_hours?: WeeklyHoursSchedule | null;
}

export async function updateBranchDetails(
  branchId: string,
  payload: BranchUpdatePayload,
): Promise<Result<WorkspaceBranch>> {
  const result = await businessRequest<{ branch: WorkspaceBranch }>(
    `/branches/${encodeURIComponent(branchId)}`,
    "PATCH",
    payload,
  );
  if (!result.ok) return result;
  if (!result.value?.branch || !validBranch(result.value.branch)) return invalid();
  return { ok: true, value: result.value.branch };
}

export async function getBranchOverview(branchId: string): Promise<Result<BranchOverviewData>> {
  const result = await businessRequest<BranchOverviewData>(`/branches/${branchId}/overview`);
  if (!result.ok) return result;
  if (!result.value?.branch || !validBranch(result.value.branch)) return invalid();
  return { ok: true, value: result.value };
}

export interface MachineParameters {
  price: number | null;
  duration_mins: number;
  temp_celsius: number;
  water_level: "Low" | "Medium" | "High";
  spin_speed: number;
  door_locked: boolean;
}

export interface MachineItem {
  id: string;
  branch_id: string;
  name: string;
  type: "washer" | "dryer" | "washer_dryer";
  status: "IDLE" | "RUNNING" | "PAUSED" | "ERROR" | "OFFLINE";
  remaining_time: number;
  current_cycle: string | null;
  phase: "Idle" | "Fill" | "Wash" | "Rinse" | "Spin" | "Dry" | "Cool Down";
  capacity_kg: number;
  power_w: number;
  water_l: number;
  drum_rpm: number;
  fault_code: string | null;
  fault_subsystem: string | null;
  fault_remediation: string | null;
  parameters: MachineParameters;
}

export type FaultDiagnosis = {
  fault_code: string;
  title: string;
  source_status:
    | "placeholder_washer_guide"
    | "spinsense_safety_rule"
    | "unverified_vendor_code";
  disclaimer: string;
  plain_explanation: string;
  likely_causes: string[];
  safety_precautions: string;
  troubleshooting_steps: string[];
};

export type RemoteMachineActiveIncident = {
  id: string;
  reference_code: string;
  severity: "warning" | "critical";
  fault_code: string | null;
  workflow_state: string;
  edge_condition_state: string;
};

export type RemoteMachine = {
  source_id: string;
  type: "washer" | "dryer" | "washer_dryer";
  source: "simulated" | "physical" | "vendor";
  label: string;
  capacity_kg: number | null;
  state: "idle" | "running" | "paused" | "error" | "maintenance" | "unknown";
  freshness: "fresh" | "stale" | "missing";
  last_update: string | null;
  data: {
    remaining_seconds?: number;
    fault_code?: string | null;
    fault_name?: string | null;
    maintenance_started_at?: string | null;
    settings?: Record<string, unknown>;
    programs?: Record<string, Record<string, unknown>>;
  } | null;
  diagnosis?: FaultDiagnosis | null;
  active_incident?: RemoteMachineActiveIncident | null;
  active_incidents_count?: number;
};

export type RemoteMachineCommandAction =
  | "start"
  | "pause"
  | "resume"
  | "stop"
  | "set_settings"
  | "delete_program"
  | "clear_fault"
  | "start_maintenance";

export type RemoteMachineCommand = {
  command_id: string;
  action: string;
  status: "queued" | "dispatched" | "succeeded" | "failed" | "expired" | "unknown";
  reason: string | null;
  issued_at: string;
  result_at: string | null;
};

export async function getRemoteMachines(branchId: string): Promise<Result<RemoteMachine[]>> {
  const result = await businessRequest<{ machines: RemoteMachine[] }>(`/branches/${branchId}/machine-state`);
  if (!result.ok) return result;
  if (!Array.isArray(result.value?.machines)) return invalid();
  return { ok: true, value: result.value.machines };
}

export async function getRemoteMachineStatistics<T>(branchId: string, sourceId: string,
  period: "day" | "week" | "month"): Promise<Result<T>> {
  return businessRequest<T>(`/branches/${branchId}/machines/${encodeURIComponent(sourceId)}/statistics?period=${period}`);
}

export async function getRemoteMachineCommands(branchId: string, sourceId: string): Promise<Result<RemoteMachineCommand[]>> {
  const result = await businessRequest<{ commands: RemoteMachineCommand[] }>(
    `/branches/${branchId}/machine-commands/${encodeURIComponent(sourceId)}`);
  if (!result.ok) return result;
  if (!Array.isArray(result.value?.commands)) return invalid();
  return { ok: true, value: result.value.commands };
}

export async function issueRemoteMachineCommand(branchId: string, sourceId: string,
  requestId: string, action: RemoteMachineCommandAction,
  args: Record<string, unknown> = {}): Promise<Result<{ command_id: string; status: string }>> {
  return businessRequest(`/branches/${branchId}/machine-commands/${encodeURIComponent(sourceId)}`,
    "POST", { request_id: requestId, action, arguments: args });
}

export async function getBranchMachines(branchId: string, type?: string): Promise<Result<MachineItem[]>> {
  const query = type ? `?type=${encodeURIComponent(type)}` : "";
  const result = await businessRequest<{ machines: MachineItem[] }>(`/branches/${branchId}/machines${query}`);
  if (!result.ok) return result;
  if (!result.value?.machines || !Array.isArray(result.value.machines)) return invalid();
  return { ok: true, value: result.value.machines };
}

export async function getBranchMachine(branchId: string, machineId: string): Promise<Result<MachineItem>> {
  const result = await businessRequest<{ machine: MachineItem }>(`/branches/${branchId}/machines/${machineId}`);
  if (!result.ok) return result;
  if (!result.value?.machine) return invalid();
  return { ok: true, value: result.value.machine };
}

export async function sendMachineCommand(
  branchId: string,
  machineId: string,
  command: "start" | "pause" | "resume" | "stop" | "unlock"
): Promise<Result<MachineItem>> {
  const result = await businessRequest<{ machine: MachineItem }>(
    `/branches/${branchId}/machines/${machineId}/commands`,
    "POST",
    { command }
  );
  if (!result.ok) return result;
  if (!result.value?.machine) return invalid();
  return { ok: true, value: result.value.machine };
}

export async function updateMachineParameters(
  branchId: string,
  machineId: string,
  params: Partial<MachineParameters>
): Promise<Result<MachineItem>> {
  const result = await businessRequest<{ machine: MachineItem }>(
    `/branches/${branchId}/machines/${machineId}/parameters`,
    "PUT",
    params
  );
  if (!result.ok) return result;
  if (!result.value?.machine) return invalid();
  return { ok: true, value: result.value.machine };
}

export interface LpgCylinderItem {
  id: string;
  label: string;
  position: number;
  source_kind: "physical" | "simulated";
  gross_mass_kg: number;
  cylinder_tare_kg: number;
  rated_fuel_capacity_kg: number;
  remaining_fuel_kg: number;
  fill_percent: number;
  status: "NORMAL" | "WARNING" | "CRITICAL";
  quality: "valid" | "unverified" | "invalid";
  maintenance_mode: boolean;
  is_connected: boolean;
  last_updated: string;
  replacement_start_time: string | null;
  service_note: string | null;
  mq6?: {
    voltage: number;
    baseline_voltage?: number;
    ppm_estimate?: number;
    status: "NORMAL" | "WARNING" | "CRITICAL";
    is_leak_detected: boolean;
  };
}

export interface LpgEnvironmentData {
  mq6: {
    sensor_id: string;
    voltage: number;
    baseline_voltage: number;
    ppm_estimate: number;
    status: "NORMAL" | "WARNING" | "CRITICAL";
    warmup_complete: boolean;
    is_leak_detected: boolean;
    source_kind: "physical" | "simulated";
    quality: "valid" | "unverified" | "invalid";
    last_updated: string;
  };
  dht22: {
    sensor_id: string;
    temperature_celsius: number;
    humidity_percent: number;
    status: "NORMAL" | "WARNING" | "CRITICAL";
    is_high_heat: boolean;
    source_kind: "physical" | "simulated";
    quality: "valid" | "unverified" | "invalid";
    last_updated: string;
  };
  safety_valve: {
    state: "OPEN" | "CLOSED";
    emergency_shutoff: boolean;
    last_actuated: string;
  };
}

export interface LpgSummaryData {
  total_cylinders: number;
  active_cylinders: number;
  total_remaining_fuel_kg: number;
  total_rated_capacity_kg: number;
  weighted_fuel_percent: number;
  measurement_coverage: string;
  status: "Healthy" | "Low Gas Warning" | "Critical Depletion" | "Leak Hazard";
}

export interface LpgIncidentItem {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  created_at: string;
}

export interface SafetyNodeValues {
  lpg_weight_kg: number | null;
  gross_weight_kg: number | null;
  lpg_percent: number | null;
  mq6_raw_adc: number | null;
  voltage: number | null;
  estimated_ppm?: number | null;
  temperature: number | null;
  humidity: number | null;
}

export interface SafetyNodeObservation {
  record_id: string;
  source_id: string;
  sample_at: string | null;
  received_at: string | null;
  cloud_received_at: string | null;
  source_time_quality: string;
  freshness: "fresh" | "stale" | "offline" | "unknown";
  source_kind: string;
  sync_state: "synced" | "pending" | "quarantined" | string;
  quality: Record<string, unknown>;
  values: SafetyNodeValues;
}

export interface SafetyNodeGasInterpretation {
  ppm_calibrated: boolean;
  gas_condition: "normal" | "warning" | "critical" | "out_of_range" | "uncalibrated" | "unavailable" | string;
  estimated_ppm: number | null;
}

export interface SafetyNodeMaintenanceSession {
  session_id?: string | null;
  session_kind?: "tank_swap" | "maintenance" | "incident_inspection" | string;
  incident_id?: string | null;
  started_by?: string | null;
  service_note?: string | null;
  started_at?: string | null;
}

export interface SafetyNodeLpgConfig {
  mq6_vcc_v: number;
  mq6_rl_kohm: number;
  mq6_divider_ratio: number;
  mq6_ro_kohm: number | null;
  mq6_baseline_v: number | null;
  gas_warn_ppm: number;
  gas_crit_ppm: number;
  cylinder_tare_kg: number | null;
  rated_capacity_kg: number | null;
  stability_tolerance_kg: number;
}

export type LpgNodeConfig = SafetyNodeLpgConfig;

export interface SafetyNodePendingCommand {
  command_id: string;
  action:
    | "start_tank_swap"
    | "complete_tank_swap"
    | "calibrate_gas_baseline"
    | "set_tare_weight"
    | "start_service_maintenance"
    | "complete_service_maintenance"
    | string;
  status: string;
  issued_at: string | null;
}

export interface SafetyNodeDevice {
  id: string;
  source_id: string;
  type: "lpg_edge_node";
  source_kind: "physical" | "simulated" | "vendor" | string;
  label: string;
  capacity_kg: number | null;
  status?: "active" | "maintenance" | string;
  operating_mode?: "online" | "low" | "maintenance" | "stale" | "offline" | string;
  low_fuel_reminder?: boolean;
  maintenance_mode?: boolean;
  maintenance_session?: SafetyNodeMaintenanceSession | null;
  gas_interpretation?: SafetyNodeGasInterpretation | null;
  lpg_config?: SafetyNodeLpgConfig | null;
  pending_command?: SafetyNodePendingCommand | null;
  active_incidents_count?: number;
  observation: SafetyNodeObservation | null;
}

export interface LpgSafetySummary {
  total_nodes: number;
  fresh_nodes: number;
  stale_nodes: number;
  offline_nodes: number;
  uninitialized_nodes: number;
}

export interface LpgSafetySnapshot {
  branch_id: string;
  checked_at: string;
  devices: SafetyNodeDevice[];
  summary: LpgSafetySummary;
}

export async function getBranchLpgSafety(branchId: string): Promise<Result<LpgSafetySnapshot>> {
  const result = await businessRequest<LpgSafetySnapshot>(`/branches/${branchId}/lpg-safety`);
  if (!result.ok) return result;
  if (!result.value || !Array.isArray(result.value.devices)) return invalid();
  return { ok: true, value: result.value };
}

export interface LpgSwapStabilitySample {
  gross_weight_kg: number;
  sample_at: string;
}

export interface LpgSwapStability {
  stable: boolean;
  reason: string;
  sample_count: number;
  spread_kg: number | null;
  mean_gross_kg: number | null;
  samples: LpgSwapStabilitySample[];
}

export interface LpgMaintenanceStatusResponse {
  source_id: string;
  maintenance_mode: boolean;
  session: SafetyNodeMaintenanceSession | null;
  stability: LpgSwapStability;
  lpg_config: SafetyNodeLpgConfig;
}

export interface LpgCommandDispatchResponse {
  command_id: string;
  status: string;
  expires_at?: string | null;
  reason?: string | null;
  result_payload?: Record<string, unknown>;
}

export interface LpgCommandStatusResponse {
  command_id: string;
  action: "start_tank_swap" | "complete_tank_swap" | "calibrate_gas_baseline" | string;
  status: "queued" | "dispatched" | "succeeded" | "failed" | "expired" | "unknown" | string;
  reason: string | null;
  result_payload: Record<string, unknown>;
  issued_at: string | null;
  result_at: string | null;
}

export interface LpgGasBaselinePayload {
  request_id: string;
  reset: boolean;
  save_settings_only: boolean;
  updated_by?: string;
  rl_kohm?: number | null;
  divider_ratio?: number | null;
  vcc_v?: number | null;
  gas_warn_ppm?: number | null;
  gas_crit_ppm?: number | null;
}

export interface LpgTareWeightPayload {
  request_id: string;
  tare_kg: number;
  rated_capacity_kg: number;
  updated_by?: string;
}

export async function getLpgMaintenanceStatus(
  branchId: string,
  sourceId: string,
): Promise<Result<LpgMaintenanceStatusResponse>> {
  const result = await businessRequest<LpgMaintenanceStatusResponse>(
    `/branches/${encodeURIComponent(branchId)}/lpg/${encodeURIComponent(sourceId)}/maintenance-status`,
  );
  if (!result.ok) return result;
  if (!result.value || typeof result.value.source_id !== "string" || !result.value.stability || !result.value.lpg_config) {
    return invalid();
  }
  return { ok: true, value: result.value };
}

export interface LpgStartServiceMaintenancePayload {
  request_id: string;
  started_by?: string;
  service_note?: string;
  session_kind?: "tank_swap" | "maintenance" | "incident_inspection";
  incident_id?: string | null;
}

export interface LpgCompleteServiceMaintenancePayload {
  request_id: string;
  completed_by?: string;
  service_note?: string;
}

export async function startLpgServiceMaintenance(
  branchId: string,
  sourceId: string,
  payload: LpgStartServiceMaintenancePayload,
): Promise<Result<LpgCommandDispatchResponse>> {
  const result = await businessRequest<LpgCommandDispatchResponse>(
    `/branches/${encodeURIComponent(branchId)}/lpg/${encodeURIComponent(sourceId)}/service-maintenance/start`,
    "POST",
    payload,
  );
  if (!result.ok) return result;
  if (!result.value || typeof result.value.command_id !== "string") return invalid();
  return { ok: true, value: result.value };
}

export async function completeLpgServiceMaintenance(
  branchId: string,
  sourceId: string,
  payload: LpgCompleteServiceMaintenancePayload,
): Promise<Result<LpgCommandDispatchResponse>> {
  const result = await businessRequest<LpgCommandDispatchResponse>(
    `/branches/${encodeURIComponent(branchId)}/lpg/${encodeURIComponent(sourceId)}/service-maintenance/complete`,
    "POST",
    payload,
  );
  if (!result.ok) return result;
  if (!result.value || typeof result.value.command_id !== "string") return invalid();
  return { ok: true, value: result.value };
}

export async function calibrateLpgGasBaseline(
  branchId: string,
  sourceId: string,
  payload: LpgGasBaselinePayload,
): Promise<Result<LpgCommandDispatchResponse>> {
  const result = await businessRequest<LpgCommandDispatchResponse>(
    `/branches/${encodeURIComponent(branchId)}/lpg/${encodeURIComponent(sourceId)}/gas-baseline`,
    "POST",
    payload,
  );
  if (!result.ok) return result;
  if (!result.value || typeof result.value.command_id !== "string") return invalid();
  return { ok: true, value: result.value };
}

export async function setLpgTareWeight(
  branchId: string,
  sourceId: string,
  payload: LpgTareWeightPayload,
): Promise<Result<LpgCommandDispatchResponse>> {
  const result = await businessRequest<LpgCommandDispatchResponse>(
    `/branches/${encodeURIComponent(branchId)}/lpg/${encodeURIComponent(sourceId)}/tare-weight`,
    "POST",
    payload,
  );
  if (!result.ok) return result;
  if (!result.value || typeof result.value.command_id !== "string") return invalid();
  return { ok: true, value: result.value };
}

export async function getLpgCommandStatus(
  branchId: string,
  sourceId: string,
  commandId: string,
): Promise<Result<LpgCommandStatusResponse>> {
  const result = await businessRequest<LpgCommandStatusResponse>(
    `/branches/${encodeURIComponent(branchId)}/lpg/${encodeURIComponent(sourceId)}/commands/${encodeURIComponent(commandId)}`,
  );
  if (!result.ok) return result;
  if (!result.value || typeof result.value.command_id !== "string" || typeof result.value.status !== "string") {
    return invalid();
  }
  return { ok: true, value: result.value };
}

export interface LpgBranchData {
  cylinders: LpgCylinderItem[];
  environment: LpgEnvironmentData;
  summary: LpgSummaryData;
  incidents: LpgIncidentItem[];
}

export async function getBranchLpg(branchId: string): Promise<Result<LpgBranchData>> {
  const result = await businessRequest<LpgBranchData>(`/branches/${branchId}/lpg`);
  if (!result.ok) return result;
  if (!result.value?.cylinders || !Array.isArray(result.value.cylinders)) return invalid();
  return { ok: true, value: result.value };
}

// ==========================================
// Customer Reports Support Portal (PRD 4.4, 6.8 CR-01..CR-04)
// ==========================================

export type CustomerReportStatus = "received" | "investigating" | "resolved" | "dismissed";

export interface CustomerReportHistoryItem {
  id: string;
  action: CustomerReportStatus;
  actor_role:
    | "customer"
    | "owner"
    | "branch_manager"
    | "machine_maintenance"
    | "lpg_maintenance";
  timestamp: string;
  note: string;
}

export interface LinkedIncidentSummary {
  id: string;
  reference_code: string;
  asset_name: string;
  fault_code: string | null;
  severity: "warning" | "critical";
  edge_condition_state: "active" | "cleared";
  workflow_state: "open" | "acknowledged" | "resolved";
}

export interface OpenBranchIncidentOption {
  id: string;
  reference_code: string;
  source_id: string;
  asset_name: string;
  domain: "machine" | "lpg";
  severity: "warning" | "critical";
  fault_code: string | null;
  fault_name: string | null;
  edge_condition_state: "active" | "cleared";
  workflow_state: "open" | "acknowledged" | "resolved";
  summary: string;
  opened_at: string | null;
}

export interface CustomerReportItem {
  id: string;
  reference_code?: string | null;
  branch_id: string;
  asset_id: string;
  asset_name: string;
  asset_type: "washer" | "dryer" | "washer_dryer" | "facility";
  category: string;
  description: string;
  status: CustomerReportStatus;
  source_kind: "simulated" | "customer_portal";
  reporter_name: string;
  reporter_contact: string;
  created_at: string;
  updated_at: string;
  investigation_notes: string | null;
  assigned_specialist_role: "machine_maintenance" | "lpg_maintenance" | null;
  resolution_reason: string | null;
  linked_incident_id?: string | null;
  linked_incident?: LinkedIncidentSummary | null;
  history: CustomerReportHistoryItem[];
}

export interface CustomerReportsSummary {
  total: number;
  received: number;
  investigating: number;
  resolved: number;
  dismissed: number;
}

export interface CustomerReportsBranchData {
  reports: CustomerReportItem[];
  summary: CustomerReportsSummary;
  open_branch_incidents?: OpenBranchIncidentOption[];
}

export async function getBranchCustomerReports(
  branchId: string
): Promise<Result<CustomerReportsBranchData>> {
  const result = await businessRequest<CustomerReportsBranchData>(
    `/branches/${branchId}/customer-reports`
  );
  if (!result.ok) return result;
  if (!result.value?.reports || !Array.isArray(result.value.reports)) return invalid();
  return { ok: true, value: result.value };
}

export async function investigateCustomerReport(
  branchId: string,
  reportId: string,
  notes: string,
  assignedSpecialistRole?: "machine_maintenance" | "lpg_maintenance" | null,
  options?: {
    linkedIncidentId?: string | null;
  }
): Promise<Result<{ report: CustomerReportItem; summary: CustomerReportsSummary }>> {
  const result = await businessRequest<{
    report: CustomerReportItem;
    summary: CustomerReportsSummary;
  }>(`/branches/${branchId}/customer-reports/${reportId}/investigate`, "POST", {
    notes,
    assigned_specialist_role: assignedSpecialistRole ?? null,
    linked_incident_id: options?.linkedIncidentId ?? null,
  });
  if (!result.ok) return result;
  if (!result.value?.report || !result.value?.summary) return invalid();
  return { ok: true, value: { report: result.value.report, summary: result.value.summary } };
}

export async function resolveCustomerReport(
  branchId: string,
  reportId: string,
  action: "resolve" | "dismiss",
  reason: string
): Promise<Result<{ report: CustomerReportItem; summary: CustomerReportsSummary }>> {
  const result = await businessRequest<{
    report: CustomerReportItem;
    summary: CustomerReportsSummary;
  }>(`/branches/${branchId}/customer-reports/${reportId}/resolve`, "POST", {
    action,
    reason,
  });
  if (!result.ok) return result;
  if (!result.value?.report || !result.value?.summary) return invalid();
  return { ok: true, value: { report: result.value.report, summary: result.value.summary } };
}

export interface GatewayItem {
  id: string;
  branch_id: string;
  label: string;
  status: "awaiting_confirmation" | "active" | "replaced" | "revoked";
  firmware_version: string | null;
  config_revision: number;
  last_contact_at: string | null;
  last_sync_at: string | null;
  created_at: string;
  revoked_at: string | null;
}

export interface GatewayClaimItem {
  claim_id: string;
  status: "issued" | "redeemed_pending" | "confirmed" | "expired" | "cancelled";
  expires_at: string;
  confirmation_expires_at: string | null;
  gateway_id: string | null;
  verification_fingerprint: string | null;
}

export interface DeviceDiscoveryItem {
  id: string;
  candidate_id: string;
  source_id: string;
  proposed_type: string | null;
  evidence_quality: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  gateway_id: string;
}

export async function getBranchGateways(branchId: string): Promise<Result<GatewayItem[]>> {
  const result = await businessRequest<{ gateways: GatewayItem[] }>(`/branches/${branchId}/gateways`);
  if (!result.ok) return result;
  return { ok: true, value: result.value?.gateways ?? [] };
}

export async function getCurrentGatewayClaim(branchId: string): Promise<Result<GatewayClaimItem | null>> {
  const result = await businessRequest<{ current_claim: GatewayClaimItem | null }>(`/branches/${branchId}/gateway-claims`);
  if (!result.ok) return result;
  return { ok: true, value: result.value?.current_claim ?? null };
}

export async function getBranchDeviceDiscoveries(branchId: string): Promise<Result<DeviceDiscoveryItem[]>> {
  const result = await businessRequest<{ discoveries: DeviceDiscoveryItem[] }>(`/branches/${branchId}/device-discoveries`);
  if (!result.ok) return result;
  return { ok: true, value: result.value?.discoveries ?? [] };
}


export type OverviewAnalyticsPeriod = "day" | "week" | "month";

export interface OverviewAnalyticsSummary {
  completed_cycles: number;
  running_seconds: number;
  running_minutes: number;
  estimated_revenue_myr: string;
  avg_gas_ppm: number | null;
  gas_node_count: number;
  total_lpg_nodes: number;
  gas_aggregation_mode: "uncalibrated" | "single_node" | "multi_node_average";
  complaints_total: number | null;
  incidents_total?: number;
}

export interface OverviewProgramSpec {
  program_id: string;
  label: string;
}

export interface OverviewMachineMetric {
  branch_id?: string;
  branch_name?: string;
  source_id: string;
  label: string;
  device_type: string;
  completed_cycles: number;
  running_seconds: number;
  running_minutes: number;
  estimated_revenue_myr: string;
  cycles_by_program: Record<string, number>;
}

export interface OverviewRevenuePoint {
  bucket: string;
  label: string;
  period_revenue_myr: string;
  cumulative_revenue_myr: string;
}

export interface OverviewGasNodeSummary {
  branch_id?: string;
  branch_name?: string;
  source_id: string;
  label: string;
  calibrated: boolean;
  period_avg_ppm: number | null;
  sample_count: number;
}

export interface OverviewGasPoint {
  bucket: string;
  label: string;
  avg_ppm: number | null;
  contributing_nodes: number;
}

export interface OverviewComplaintsPoint {
  bucket: string;
  label: string;
  count: number | null;
}

export interface OverviewBranchBreakdown {
  branch_id: string;
  branch_name: string;
  completed_cycles: number;
  running_seconds: number;
  running_minutes: number;
  estimated_revenue_myr: string;
  revenue_share_pct: number | null;
}

export interface OverviewProgramBreakdown {
  program_id: string;
  label: string;
  completed_cycles: number;
  estimated_revenue_myr: string;
  avg_revenue_myr: string | null;
  share_pct: number | null;
}

export interface OverviewCycleOutcomes {
  completed: number;
  stopped: number;
  faulted: number;
  interrupted: number;
  total: number;
  completion_rate_pct: number | null;
}

export interface OverviewHourlyDemandPoint {
  hour: number;
  hour_label: string;
  completed_cycles: number;
  estimated_revenue_myr: string;
}

export interface OverviewIncidentPoint {
  bucket: string;
  label: string;
  total: number;
  warning: number;
  critical: number;
  resolved: number;
}

export interface OverviewIncidentMetrics {
  total_incidents: number;
  open_count: number;
  acknowledged_count: number;
  resolved_count: number;
  warning_count: number;
  critical_count: number;
  machine_count: number;
  lpg_count: number;
  avg_acknowledge_minutes: number | null;
  avg_resolve_minutes: number | null;
  ack_sample_count: number;
  resolve_sample_count: number;
  series: OverviewIncidentPoint[];
}

export interface BranchOverviewAnalytics {
  branch_count?: number;
  branch_breakdown?: OverviewBranchBreakdown[];
  program_breakdown?: OverviewProgramBreakdown[];
  cycle_outcomes?: OverviewCycleOutcomes;
  hourly_demand?: OverviewHourlyDemandPoint[];
  incident_metrics?: OverviewIncidentMetrics;
  branch_id: string;
  period: OverviewAnalyticsPeriod;
  granularity: "hour" | "day";
  timezone: string;
  coverage: string;
  summary: OverviewAnalyticsSummary;
  programs: OverviewProgramSpec[];
  machines: OverviewMachineMetric[];
  revenue_series: OverviewRevenuePoint[];
  gas_series: {
    aggregation_mode: "uncalibrated" | "single_node" | "multi_node_average";
    node_count: number;
    nodes: OverviewGasNodeSummary[];
    series: OverviewGasPoint[];
  };
  complaints: {
    implemented: boolean;
    source: string;
    total: number | null;
    series: OverviewComplaintsPoint[];
  };
}

export async function getOrganizationAnalytics(
  period: OverviewAnalyticsPeriod = "day"
): Promise<Result<BranchOverviewAnalytics>> {
  const safePeriod: OverviewAnalyticsPeriod =
    period === "day" || period === "week" || period === "month" ? period : "day";
  const result = await businessRequest<BranchOverviewAnalytics>(
    `/organization/analytics?period=${encodeURIComponent(safePeriod)}`
  );
  if (!result.ok) return result;
  if (!result.value || !result.value.summary || !Array.isArray(result.value.machines)) {
    return invalid();
  }
  return { ok: true, value: result.value };
}

export async function getBranchOverviewAnalytics(
  branchId: string,
  period: OverviewAnalyticsPeriod = "day"
): Promise<Result<BranchOverviewAnalytics>> {
  const safePeriod: OverviewAnalyticsPeriod =
    period === "day" || period === "week" || period === "month" ? period : "day";
  const result = await businessRequest<BranchOverviewAnalytics>(
    `/branches/${branchId}/overview/analytics?period=${encodeURIComponent(safePeriod)}`
  );
  if (!result.ok) return result;
  if (!result.value || !result.value.summary || !Array.isArray(result.value.machines)) {
    return invalid();
  }
  return { ok: true, value: result.value };
}

export type BranchRecordsScope = "lpg" | "env" | "machines";
export type BranchRecordsPeriod = "all" | "today" | "week" | "month";

export interface LpgTelemetryRecordItem {
  record_id: string;
  source_id: string;
  device_label: string;
  sample_at: string | null;
  received_at: string | null;
  source_time_quality: string;
  source_kind: string;
  lpg_percent: number | null;
  lpg_weight_kg: number | null;
  gross_weight_kg: number | null;
  estimated_ppm: number | null;
  gas_condition: string | null;
  weight_valid: boolean | null;
  maintenance_mode: boolean;
}

export interface EnvTelemetryRecordItem {
  record_id: string;
  source_id: string;
  device_label: string;
  sample_at: string | null;
  received_at: string | null;
  source_time_quality: string;
  source_kind: string;
  temperature: number | null;
  humidity: number | null;
  temperature_valid: boolean | null;
  humidity_valid: boolean | null;
}

export interface MachineCycleRecordItem {
  cycle_id: string;
  source_id: string;
  device_label: string;
  device_type: string;
  program_id: string;
  program_label: string;
  running_seconds: number;
  running_minutes: number;
  outcome: string;
  started_at: string | null;
  finished_at: string | null;
  price_myr?: string | null;
}

export type BranchRecordItem =
  | LpgTelemetryRecordItem
  | EnvTelemetryRecordItem
  | MachineCycleRecordItem;

export interface BranchRecordsResponse {
  branch_id: string;
  scope: BranchRecordsScope;
  period: BranchRecordsPeriod;
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  items: BranchRecordItem[];
}

export async function getBranchRecords(
  branchId: string,
  scope: BranchRecordsScope = "lpg",
  period: BranchRecordsPeriod = "all",
  page = 1,
  pageSize = 10
): Promise<Result<BranchRecordsResponse>> {
  const safeScope: BranchRecordsScope =
    scope === "lpg" || scope === "env" || scope === "machines" ? scope : "lpg";
  const safePeriod: BranchRecordsPeriod =
    period === "all" || period === "today" || period === "week" || period === "month"
      ? period
      : "all";
  const safePage = Number.isInteger(page) && page >= 1 ? page : 1;
  const safeSize = Number.isInteger(pageSize) && pageSize >= 1 && pageSize <= 50 ? pageSize : 10;

  const query = new URLSearchParams({
    scope: safeScope,
    period: safePeriod,
    page: String(safePage),
    page_size: String(safeSize),
  });
  const result = await businessRequest<BranchRecordsResponse>(
    `/branches/${branchId}/records?${query.toString()}`
  );
  if (!result.ok) return result;
  if (!result.value || !Array.isArray(result.value.items)) {
    return invalid();
  }
  return { ok: true, value: result.value };
}

export interface NotificationBranchOption {
  id: string;
  name: string;
}

export interface NotificationDeviceSummary {
  branch_id: string;
  branch_name: string;
  source_id: string;
  label: string;
  type: string;
  status: string;
  maintenance_mode: boolean;
  freshness: string;
  state: string;
  fault_code: string | null;
  program_id: string | null;
  lpg_percent: number | null;
  ppm_calibrated: boolean;
  gas_condition: string | null;
  estimated_ppm: number | null;
  sample_at: string | null;
}

export interface WorkspaceNotificationEvent {
  id: string;
  branch_id: string;
  branch_name: string;
  category: "machine" | "lpg";
  kind: string;
  severity: "negative" | "warning" | "positive" | "info" | "neutral";
  title: string;
  detail: string;
  reference_code?: string | null;
  source_id: string;
  device_label: string;
  incident_id?: string | null;
  occurred_at: string;
  active: boolean;
}

export interface WorkspaceNotificationsPayload {
  checked_at: string;
  organization_id: string;
  role: string;
  branches: NotificationBranchOption[];
  devices: NotificationDeviceSummary[];
  events: WorkspaceNotificationEvent[];
}

export async function getNotifications(params?: {
  category?: "all" | "machine" | "lpg";
  branchId?: string;
  limit?: number;
}): Promise<Result<WorkspaceNotificationsPayload>> {
  const category =
    params?.category === "machine" || params?.category === "lpg" ? params.category : "all";
  const limit =
    typeof params?.limit === "number" && Number.isInteger(params.limit) && params.limit >= 1 && params.limit <= 200
      ? params.limit
      : 100;
  const query = new URLSearchParams({ category, limit: String(limit) });
  if (params?.branchId) {
    query.set("branch_id", params.branchId);
  }
  const result = await businessRequest<WorkspaceNotificationsPayload>(`/notifications?${query.toString()}`);
  if (!result.ok) return result;
  if (!result.value || !Array.isArray(result.value.events) || !Array.isArray(result.value.devices)) {
    return invalid();
  }
  return { ok: true, value: result.value };
}
export interface PushPublicKeyResponse {
  configured: boolean;
  public_key: string | null;
}

export interface PushSubscriptionKeysPayload {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionSavePayload {
  endpoint: string;
  keys: PushSubscriptionKeysPayload;
  user_agent?: string;
}

export async function uploadOrganizationLogo(
  contentType: "image/png" | "image/jpeg" | "image/webp",
  dataBase64: string,
): Promise<Result<{ logo_url: string }>> {
  const result = await businessRequest<{ logo_url: string }>(
    "/organization/logo",
    "POST",
    { content_type: contentType, data_base64: dataBase64 },
  );
  if (!result.ok) return result;
  if (!result.value || typeof result.value.logo_url !== "string") return invalid();
  return { ok: true, value: result.value };
}

export async function removeOrganizationLogo(): Promise<Result<{ logo_url: null }>> {
  const result = await businessRequest<{ logo_url: null }>("/organization/logo", "DELETE", {});
  if (!result.ok) return result;
  return { ok: true, value: { logo_url: null } };
}

function validBranchImagesList(value: unknown): value is BranchImage[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (img) =>
      img &&
      typeof img === "object" &&
      typeof (img as Record<string, unknown>).id === "string" &&
      typeof (img as Record<string, unknown>).image_url === "string" &&
      typeof (img as Record<string, unknown>).sort_order === "number",
  );
}

export async function uploadBranchImage(
  branchId: string,
  contentType: "image/png" | "image/jpeg" | "image/webp",
  dataBase64: string,
): Promise<Result<{ images: BranchImage[] }>> {
  const result = await businessRequest<{ images: BranchImage[] }>(
    `/branches/${encodeURIComponent(branchId)}/images`,
    "POST",
    { content_type: contentType, data_base64: dataBase64 },
  );
  if (!result.ok) return result;
  if (!result.value || !validBranchImagesList(result.value.images)) return invalid();
  return { ok: true, value: { images: result.value.images } };
}

export async function setBranchCoverImage(
  branchId: string,
  imageId: string,
): Promise<Result<{ images: BranchImage[] }>> {
  const result = await businessRequest<{ images: BranchImage[] }>(
    `/branches/${encodeURIComponent(branchId)}/images/${encodeURIComponent(imageId)}/cover`,
    "PATCH",
    {},
  );
  if (!result.ok) return result;
  if (!result.value || !validBranchImagesList(result.value.images)) return invalid();
  return { ok: true, value: { images: result.value.images } };
}

export async function deleteBranchImage(
  branchId: string,
  imageId: string,
): Promise<Result<{ images: BranchImage[] }>> {
  const result = await businessRequest<{ images: BranchImage[] }>(
    `/branches/${encodeURIComponent(branchId)}/images/${encodeURIComponent(imageId)}`,
    "DELETE",
    {},
  );
  if (!result.ok) return result;
  if (!result.value || !validBranchImagesList(result.value.images)) return invalid();
  return { ok: true, value: { images: result.value.images } };
}

export async function getPushPublicKey(): Promise<Result<PushPublicKeyResponse>> {
  const result = await businessRequest<PushPublicKeyResponse>("/push/public-key");
  if (!result.ok) return result;
  if (
    !result.value ||
    typeof result.value.configured !== "boolean" ||
    (result.value.public_key !== null && typeof result.value.public_key !== "string")
  ) {
    return invalid();
  }
  return { ok: true, value: result.value };
}

export async function savePushSubscription(
  payload: PushSubscriptionSavePayload,
): Promise<Result<{ saved: boolean; subscription_id: string }>> {
  const result = await businessRequest<{ saved: boolean; subscription_id: string }>(
    "/push/subscriptions",
    "POST",
    payload,
  );
  if (!result.ok) return result;
  if (!result.value || typeof result.value.saved !== "boolean") return invalid();
  return { ok: true, value: result.value };
}

export async function deletePushSubscription(endpoint: string): Promise<Result<{ revoked: boolean }>> {
  const result = await businessRequest<{ revoked: boolean }>(
    "/push/subscriptions",
    "DELETE",
    { endpoint },
  );
  if (!result.ok) return result;
  if (!result.value || typeof result.value.revoked !== "boolean") return invalid();
  return { ok: true, value: result.value };
}

export type IncidentWorkflowState = "open" | "acknowledged" | "resolved";
export type IncidentEdgeConditionState = "active" | "cleared";

export type IncidentSummary = {
  id: string;
  reference_code: string;
  branch_id: string;
  branch_name: string;
  device_id: string;
  source_id: string;
  asset_name: string;
  domain: "machine" | "lpg";
  condition_key: string;
  severity: "warning" | "critical";
  edge_condition_state: IncidentEdgeConditionState;
  workflow_state: IncidentWorkflowState;
  fault_code: string | null;
  fault_name: string | null;
  summary: string;
  rule_version: string;
  revision: number;
  opened_at: string | null;
  last_sample_at: string | null;
  cleared_at: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  resolved_by_name?: string | null;
  resolved_by_role?: string | null;
  resolution_note: string | null;
  evidence_snapshot?: Record<string, unknown>;
  linked_reports_count: number;
  open_tasks_count: number;
  diagnosis: FaultDiagnosis | null;
};

export type IncidentEventItem = {
  id: string;
  event_type: string;
  actor_type: "edge" | "operator" | "system";
  actor_role: string | null;
  actor_name: string | null;
  summary: string;
  metadata: Record<string, unknown>;
  occurred_at: string | null;
};

export type MaintenanceTaskItem = {
  id: string;
  branch_id: string;
  incident_id: string | null;
  report_id: string | null;
  domain: "machine" | "lpg";
  title: string;
  assigned_to_user_id: string;
  assignee_name: string | null;
  assignee_role: string | null;
  assigned_by_user_id: string;
  assigned_by_name: string | null;
  status: "assigned" | "in_progress" | "completed";
  service_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  completed_at: string | null;
};

export type LinkedReportSummary = {
  id: string;
  reference_code: string;
  category: string;
  status: string;
  description: string;
  reporter_name: string | null;
  contact_type: string | null;
  contact_value: string | null;
  created_at: string | null;
};

export type EligibleAssignee = {
  user_id: string;
  full_name: string;
  role: string;
};

export type IncidentAssetState = {
  domain: "machine" | "lpg";
  state: string;
  freshness: string;
  maintenance_mode: boolean;
  fault_code?: string | null;
  session_kind?: string | null;
};

export type IncidentDetail = IncidentSummary & {
  evidence_snapshot: Record<string, unknown>;
  asset_state?: IncidentAssetState;
  maintenance_logs?: MaintenanceLogItem[];
  events: IncidentEventItem[];
  tasks: MaintenanceTaskItem[];
  linked_reports: LinkedReportSummary[];
  eligible_assignees: EligibleAssignee[];
};

export type BranchActiveIncidentsSummary = {
  total_count: number;
  incidents: BranchOverviewIncident[];
};

export async function getBranchActiveIncidentsSummary(
  branchId: string,
  limit = 5,
): Promise<Result<BranchActiveIncidentsSummary>> {
  const result = await businessRequest<BranchActiveIncidentsSummary>(
    `/branches/${encodeURIComponent(branchId)}/active-incidents-summary?limit=${limit}`,
  );
  if (!result.ok) return result;
  if (!Array.isArray(result.value?.incidents)) return invalid();
  return {
    ok: true,
    value: {
      total_count: Number(result.value.total_count ?? result.value.incidents.length),
      incidents: result.value.incidents,
    },
  };
}

export async function getBranchIncidents(
  branchId: string,
  params?: {
    domain?: "machine" | "lpg";
    workflowState?: IncidentWorkflowState;
    activeOnly?: boolean;
    limit?: number;
  },
): Promise<Result<IncidentSummary[]>> {
  const query = new URLSearchParams({ branch_id: branchId });
  if (params?.domain) query.set("domain", params.domain);
  if (params?.workflowState) query.set("workflow_state", params.workflowState);
  if (params?.activeOnly) query.set("active_only", "true");
  if (typeof params?.limit === "number") query.set("limit", String(params.limit));
  const result = await businessRequest<{ incidents: IncidentSummary[] }>(`/incidents?${query.toString()}`);
  if (!result.ok) return result;
  if (!Array.isArray(result.value?.incidents)) return invalid();
  return { ok: true, value: result.value.incidents };
}

export async function getIncidentDetail(incidentId: string): Promise<Result<IncidentDetail>> {
  const result = await businessRequest<{ incident: IncidentDetail }>(`/incidents/${encodeURIComponent(incidentId)}`);
  if (!result.ok) return result;
  if (!result.value?.incident?.id) return invalid();
  return { ok: true, value: result.value.incident };
}

export async function acknowledgeBranchIncident(
  incidentId: string,
  note?: string,
): Promise<Result<IncidentSummary>> {
  const result = await businessRequest<{ incident: IncidentSummary }>(
    `/incidents/${encodeURIComponent(incidentId)}/acknowledge`,
    "POST",
    note ? { note } : {},
  );
  if (!result.ok) return result;
  if (!result.value?.incident?.id) return invalid();
  return { ok: true, value: result.value.incident };
}

export async function resolveBranchIncident(
  incidentId: string,
  resolutionNote: string,
): Promise<Result<IncidentSummary>> {
  const result = await businessRequest<{ incident: IncidentSummary }>(
    `/incidents/${encodeURIComponent(incidentId)}/resolve`,
    "POST",
    { resolution_note: resolutionNote },
  );
  if (!result.ok) return result;
  if (!result.value?.incident?.id) return invalid();
  return { ok: true, value: result.value.incident };
}

export async function createIncidentTask(payload: {
  branch_id: string;
  incident_id?: string | null;
  report_id?: string | null;
  domain: "machine" | "lpg";
  title: string;
  assigned_to_user_id: string;
  service_notes?: string | null;
}): Promise<Result<MaintenanceTaskItem>> {
  const result = await businessRequest<{ task: MaintenanceTaskItem }>(
    "/maintenance-tasks",
    "POST",
    payload,
  );
  if (!result.ok) return result;
  if (!result.value?.task?.id) return invalid();
  return { ok: true, value: result.value.task };
}

export async function updateIncidentTask(
  taskId: string,
  payload: { status?: "assigned" | "in_progress" | "completed"; service_notes?: string | null },
): Promise<Result<MaintenanceTaskItem>> {
  const result = await businessRequest<{ task: MaintenanceTaskItem }>(
    `/maintenance-tasks/${encodeURIComponent(taskId)}`,
    "PATCH",
    payload,
  );
  if (!result.ok) return result;
  if (!result.value?.task?.id) return invalid();
  return { ok: true, value: result.value.task };
}

export type MaintenanceLogOutcome = "in_progress" | "completed";
export type MaintenanceLogKind =
  | "maintenance"
  | "incident_resolution"
  | "tank_swap"
  | "gas_calibration"
  | "set_tare_weight"
  | "inspection";

export type MaintenanceLogItem = {
  id: string;
  reference_code: string;
  branch_id: string;
  device_id: string;
  source_id: string;
  asset_name: string;
  domain?: "machine" | "lpg";
  log_kind?: MaintenanceLogKind;
  lpg_session_id?: string | null;
  incident_id: string | null;
  error_code: string;
  fault_name: string | null;
  technician_name: string;
  performed_by_user_id: string | null;
  performed_by_role: string;
  work_done: string;
  outcome: MaintenanceLogOutcome;
  created_at: string;
};

export type MaintenanceLogsPage = {
  items: MaintenanceLogItem[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
};

export type MaintenanceLogCreateInput = {
  error_code: string;
  technician_name: string;
  work_done: string;
  log_kind?: MaintenanceLogKind;
  incident_id?: string | null;
  outcome: "completed";
  return_to_service: true;
  resolve_incident?: boolean;
  command_request_id?: string;
};

export type MaintenanceLogCreateResponse = {
  item: MaintenanceLogItem;
  command: { command_id: string; status: string } | null;
  incident_resolution?: {
    resolved: boolean;
    incident_id: string;
    reason?: string;
  } | null;
};

export async function getBranchMaintenanceLogs(
  branchId: string,
  options?: {
    domain?: "machine" | "lpg";
    source_id?: string;
    incident_id?: string;
    error_code?: string;
    search?: string;
    page?: number;
    page_size?: number;
  },
): Promise<Result<MaintenanceLogsPage>> {
  const query = new URLSearchParams();
  if (options?.domain) query.set("domain", options.domain);
  if (options?.source_id?.trim()) query.set("source_id", options.source_id.trim());
  if (options?.incident_id?.trim()) query.set("incident_id", options.incident_id.trim());
  if (options?.error_code?.trim()) query.set("error_code", options.error_code.trim());
  if (options?.search?.trim()) query.set("search", options.search.trim());
  if (options?.page) query.set("page", String(options.page));
  if (options?.page_size) query.set("page_size", String(options.page_size));
  const qs = query.toString();
  const result = await businessRequest<MaintenanceLogsPage>(
    `/branches/${encodeURIComponent(branchId)}/maintenance-logs${qs ? `?${qs}` : ""}`,
  );
  if (!result.ok) return result;
  if (!Array.isArray(result.value?.items)) return invalid();
  return result;
}

export async function createDeviceMaintenanceLog(
  branchId: string,
  sourceId: string,
  payload: MaintenanceLogCreateInput,
): Promise<Result<MaintenanceLogCreateResponse>> {
  const result = await businessRequest<MaintenanceLogCreateResponse>(
    `/branches/${encodeURIComponent(branchId)}/devices/${encodeURIComponent(sourceId)}/maintenance-logs`,
    "POST",
    payload,
  );
  if (!result.ok) return result;
  if (!result.value?.item?.id) return invalid();
  return result;
}

export async function createMachineMaintenanceLog(
  branchId: string,
  sourceId: string,
  payload: MaintenanceLogCreateInput,
): Promise<Result<MaintenanceLogCreateResponse>> {
  const result = await businessRequest<MaintenanceLogCreateResponse>(
    `/branches/${encodeURIComponent(branchId)}/machines/${encodeURIComponent(sourceId)}/maintenance-logs`,
    "POST",
    payload,
  );
  if (!result.ok) return result;
  if (!result.value?.item?.id) return invalid();
  return result;
}

export type GeocodeResult = {
  display_name: string;
  latitude: number;
  longitude: number;
  address_line?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
};

export type GeocodeProvider = "photon" | "locationiq" | "geoapify" | "nominatim";

export type GeocodeResponse = {
  query: string;
  cached: boolean;
  provider: GeocodeProvider;
  attribution: string;
  results: GeocodeResult[];
};

const VALID_GEOCODE_PROVIDERS = new Set<GeocodeProvider>([
  "photon",
  "locationiq",
  "geoapify",
  "nominatim",
]);

export async function geocodeBranchAddress(
  query: string,
  limit = 5,
): Promise<Result<GeocodeResponse>> {
  const cleaned = query.replace(/\s+/g, " ").trim();
  if (cleaned.length < 3 || cleaned.length > 200) {
    return {
      ok: false,
      status: 422,
      message: "Enter 3 to 200 characters of a public branch address, street, or city.",
    };
  }
  if (cleaned.includes("@")) {
    return {
      ok: false,
      status: 422,
      message: "Do not enter email addresses or personal identifiers in map search.",
    };
  }
  const safeLimit = Math.min(5, Math.max(1, Math.trunc(limit) || 5));
  const params = new URLSearchParams({ q: cleaned, limit: String(safeLimit) });
  const result = await businessRequest<unknown>(`/maps/geocode?${params.toString()}`);
  if (!result.ok) return result;

  const body = result.value as Record<string, unknown> | null;
  if (
    !body ||
    typeof body !== "object" ||
    typeof body.query !== "string" ||
    typeof body.cached !== "boolean" ||
    typeof body.provider !== "string" ||
    !VALID_GEOCODE_PROVIDERS.has(body.provider as GeocodeProvider) ||
    typeof body.attribution !== "string" ||
    !Array.isArray(body.results)
  ) {
    return invalid();
  }

  const parsedResults: GeocodeResult[] = [];
  for (const row of body.results) {
    if (!row || typeof row !== "object") return invalid();
    const item = row as Record<string, unknown>;
    if (
      typeof item.display_name !== "string" ||
      typeof item.latitude !== "number" ||
      !Number.isFinite(item.latitude) ||
      item.latitude < -90 ||
      item.latitude > 90 ||
      typeof item.longitude !== "number" ||
      !Number.isFinite(item.longitude) ||
      item.longitude < -180 ||
      item.longitude > 180
    ) {
      return invalid();
    }
    parsedResults.push({
      display_name: item.display_name,
      latitude: item.latitude,
      longitude: item.longitude,
      address_line: typeof item.address_line === "string" ? item.address_line : null,
      city: typeof item.city === "string" ? item.city : null,
      region: typeof item.region === "string" ? item.region : null,
      postal_code: typeof item.postal_code === "string" ? item.postal_code : null,
    });
  }

  return {
    ok: true,
    value: {
      query: body.query,
      cached: body.cached,
      provider: body.provider as GeocodeProvider,
      attribution: body.attribution,
      results: parsedResults,
    },
  };
}
