import { createClient } from "@/lib/supabase/server";

export type MembershipState = "incomplete" | "pending" | "approval_pending" | "rejected" | "active" | "approved_unassigned" | "deactivated";
export type Membership = { state: MembershipState; organization: { id: string; name: string } | null; role: string | null };
export type JoinRequest = { id: string; user_id: string; state: string; full_name: string; phone: string; requested_at: string; decision_role: string | null };
export type WorkspaceBranch = { id: string; name: string; address: string; city: string; region: string; postal_code: string; contact_phone: string; opening_hours: string; latitude: number | null; longitude: number | null; service_status: "open" | "closed"; primary_manager_user_id: string; created_at: string };
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
    (row.state === "approved_unassigned" && role !== null && !["branch_manager", "machine_maintenance", "lpg_maintenance"].includes(String(role))) ||
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

export type BranchDetail = WorkspaceBranch & {
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

export type BranchOverviewData = {
  branch: BranchDetail;
  incidents: Array<{
    id: string;
    severity: "critical" | "warning" | "info";
    title: string;
    description: string;
    created_at: string;
  }>;
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

export async function getBranch(branchId: string): Promise<Result<BranchDetail>> {
  const result = await businessRequest<{ branch: BranchDetail }>(`/branches/${branchId}`);
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

export async function startCylinderReplacement(
  branchId: string,
  cylinderId: string,
  notes?: string
): Promise<Result<LpgCylinderItem>> {
  const result = await businessRequest<{ cylinder: LpgCylinderItem }>(
    `/branches/${branchId}/lpg/cylinders/${cylinderId}/replacement/start`,
    "POST",
    { notes }
  );
  if (!result.ok) return result;
  if (!result.value?.cylinder) return invalid();
  return { ok: true, value: result.value.cylinder };
}

export async function completeCylinderReplacement(
  branchId: string,
  cylinderId: string,
  newTareKg: number,
  ratedCapacityKg: number,
  notes?: string
): Promise<Result<LpgCylinderItem>> {
  const result = await businessRequest<{ cylinder: LpgCylinderItem }>(
    `/branches/${branchId}/lpg/cylinders/${cylinderId}/replacement/complete`,
    "POST",
    { new_tare_kg: newTareKg, rated_capacity_kg: ratedCapacityKg, notes }
  );
  if (!result.ok) return result;
  if (!result.value?.cylinder) return invalid();
  return { ok: true, value: result.value.cylinder };
}

export async function cancelCylinderReplacement(
  branchId: string,
  cylinderId: string
): Promise<Result<LpgCylinderItem>> {
  const result = await businessRequest<{ cylinder: LpgCylinderItem }>(
    `/branches/${branchId}/lpg/cylinders/${cylinderId}/replacement/cancel`,
    "POST",
    {}
  );
  if (!result.ok) return result;
  if (!result.value?.cylinder) return invalid();
  return { ok: true, value: result.value.cylinder };
}

export async function toggleEmergencyValve(
  branchId: string,
  action: "open" | "close"
): Promise<Result<{ state: "OPEN" | "CLOSED"; emergency_shutoff: boolean; last_actuated: string }>> {
  const result = await businessRequest<{
    safety_valve: { state: "OPEN" | "CLOSED"; emergency_shutoff: boolean; last_actuated: string };
  }>(`/branches/${branchId}/lpg/emergency-shutoff`, "POST", { action });
  if (!result.ok) return result;
  if (!result.value?.safety_valve) return invalid();
  return { ok: true, value: result.value.safety_valve };
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

export interface CustomerReportItem {
  id: string;
  branch_id: string;
  asset_id: string;
  asset_name: string;
  asset_type: "washer" | "dryer" | "facility";
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
  assignedSpecialistRole?: "machine_maintenance" | "lpg_maintenance" | null
): Promise<Result<{ report: CustomerReportItem; summary: CustomerReportsSummary }>> {
  const result = await businessRequest<{
    report: CustomerReportItem;
    summary: CustomerReportsSummary;
  }>(`/branches/${branchId}/customer-reports/${reportId}/investigate`, "POST", {
    notes,
    assigned_specialist_role: assignedSpecialistRole ?? null,
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

