import {
  Branch,
  LpgCylinder,
  LpgSensorData,
  Machine,
  MachineParameters,
  MaintenanceLogEntry,
  SafetyTelemetry,
  TelemetrySummary,
} from "@/types";
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "https://esp32-gas-api.onrender.com").replace(/\/$/, "");

// Fallback mock dataset
let mockBranches: Branch[] = [
  {
    id: "msu-shah-alam",
    name: "MSU Shah Alam",
    campus_type: "Main Campus Hub",
    address: "Management & Science University, Section 13",
    city: "Shah Alam",
    state: "Selangor",
    postal_code: "40100",
    lat: 3.0565,
    lng: 101.5540,
    contact_phone: "+60 3-5521 2888",
    opening_hours: "24 Hours (Daily)",
    gateway_ip: "192.168.10.1",
    status: "ONLINE",
    total_washers: 4,
    active_washers: 2,
    idle_washers: 1,
    error_washers: 1,
    total_dryers: 4,
    active_dryers: 2,
    idle_dryers: 2,
    error_dryers: 0,
    total_machines: 8,
    total_cylinders: 4,
    healthy_cylinders: 2,
    lpg_status: "2/4 Cylinders Healthy",
    health_status: "WARNING",
    marker_color: "amber",
  },
  {
    id: "msu-cheras",
    name: "MSU Cheras",
    campus_type: "Cheras Campus Centre",
    address: "MSU College Cheras, Jalan Manickavasagam",
    city: "Cheras",
    state: "Kuala Lumpur",
    postal_code: "56000",
    lat: 3.0901,
    lng: 101.7390,
    contact_phone: "+60 3-9132 2888",
    opening_hours: "07:00 - 23:00 Daily",
    gateway_ip: "192.168.20.1",
    status: "ONLINE",
    total_washers: 4,
    active_washers: 2,
    idle_washers: 2,
    error_washers: 0,
    total_dryers: 4,
    active_dryers: 1,
    idle_dryers: 3,
    error_dryers: 0,
    total_machines: 8,
    total_cylinders: 4,
    healthy_cylinders: 4,
    lpg_status: "4/4 Cylinders Healthy",
    health_status: "HEALTHY",
    marker_color: "green",
  },
];

let mockMachines: Machine[] = [
  // Shah Alam Fleet
  {
    id: "W-01",
    branch_id: "msu-shah-alam",
    name: "Washer #01 (15kg)",
    type: "washer",
    status: "RUNNING",
    remaining_time: 18,
    current_cycle: "Standard Cotton 40°C",
    phase: "Wash",
    capacity_kg: 15,
    power_w: 1850,
    water_l: 48,
    drum_rpm: 800,
    parameters: { price: 6.0, duration_mins: 35, temp_celsius: 40, water_level: "High", spin_speed: 1200, door_locked: true },
  },
  {
    id: "W-02",
    branch_id: "msu-shah-alam",
    name: "Washer #02 (15kg)",
    type: "washer",
    status: "IDLE",
    remaining_time: 0,
    current_cycle: null,
    phase: "Idle",
    capacity_kg: 15,
    power_w: 35,
    water_l: 0,
    drum_rpm: 0,
    parameters: { price: 6.0, duration_mins: 30, temp_celsius: 30, water_level: "Medium", spin_speed: 800, door_locked: false },
  },
  {
    id: "W-03",
    branch_id: "msu-shah-alam",
    name: "Washer #03 (20kg)",
    type: "washer",
    status: "RUNNING",
    remaining_time: 27,
    current_cycle: "Heavy Bedding 60°C",
    phase: "Rinse",
    capacity_kg: 20,
    power_w: 2100,
    water_l: 62,
    drum_rpm: 650,
    parameters: { price: 8.5, duration_mins: 45, temp_celsius: 60, water_level: "High", spin_speed: 1200, door_locked: true },
  },
  {
    id: "W-04",
    branch_id: "msu-shah-alam",
    name: "Washer #04 (15kg)",
    type: "washer",
    status: "ERROR",
    remaining_time: 0,
    current_cycle: "Fault Interrupted",
    phase: "Idle",
    capacity_kg: 15,
    power_w: 12,
    water_l: 15,
    drum_rpm: 0,
    fault_code: "E01",
    fault_subsystem: "Inlet Solenoid Valve",
    fault_remediation: "Inspect main water intake valve; verify supply pressure and clean debris filter screen.",
    parameters: { price: 6.0, duration_mins: 30, temp_celsius: 30, water_level: "Low", spin_speed: 400, door_locked: false },
  },
  {
    id: "D-01",
    branch_id: "msu-shah-alam",
    name: "Dryer #01 (Gas 16kg)",
    type: "dryer",
    status: "RUNNING",
    remaining_time: 22,
    current_cycle: "High Heat Express",
    phase: "Dry",
    capacity_kg: 16,
    power_w: 480,
    water_l: 0,
    drum_rpm: 450,
    parameters: { price: 5.5, duration_mins: 30, temp_celsius: 65, water_level: "Low", spin_speed: 400, door_locked: true },
  },
  {
    id: "D-02",
    branch_id: "msu-shah-alam",
    name: "Dryer #02 (Gas 16kg)",
    type: "dryer",
    status: "IDLE",
    remaining_time: 0,
    current_cycle: null,
    phase: "Idle",
    capacity_kg: 16,
    power_w: 20,
    water_l: 0,
    drum_rpm: 0,
    parameters: { price: 5.5, duration_mins: 30, temp_celsius: 50, water_level: "Low", spin_speed: 400, door_locked: false },
  },
  {
    id: "D-03",
    branch_id: "msu-shah-alam",
    name: "Dryer #03 (Gas 20kg)",
    type: "dryer",
    status: "RUNNING",
    remaining_time: 9,
    current_cycle: "Delicates Low Heat",
    phase: "Cool Down",
    capacity_kg: 20,
    power_w: 310,
    water_l: 0,
    drum_rpm: 400,
    parameters: { price: 7.0, duration_mins: 35, temp_celsius: 45, water_level: "Low", spin_speed: 400, door_locked: true },
  },
  {
    id: "D-04",
    branch_id: "msu-shah-alam",
    name: "Dryer #04 (Gas 16kg)",
    type: "dryer",
    status: "IDLE",
    remaining_time: 0,
    current_cycle: null,
    phase: "Idle",
    capacity_kg: 16,
    power_w: 22,
    water_l: 0,
    drum_rpm: 0,
    parameters: { price: 5.5, duration_mins: 30, temp_celsius: 55, water_level: "Low", spin_speed: 400, door_locked: false },
  },

  // Cheras Fleet
  {
    id: "CH-W01",
    branch_id: "msu-cheras",
    name: "Washer #01 (15kg)",
    type: "washer",
    status: "RUNNING",
    remaining_time: 14,
    current_cycle: "Standard Cotton 40°C",
    phase: "Spin",
    capacity_kg: 15,
    power_w: 1780,
    water_l: 45,
    drum_rpm: 1200,
    parameters: { price: 6.0, duration_mins: 35, temp_celsius: 40, water_level: "High", spin_speed: 1200, door_locked: true },
  },
  {
    id: "CH-W02",
    branch_id: "msu-cheras",
    name: "Washer #02 (15kg)",
    type: "washer",
    status: "IDLE",
    remaining_time: 0,
    current_cycle: null,
    phase: "Idle",
    capacity_kg: 15,
    power_w: 30,
    water_l: 0,
    drum_rpm: 0,
    parameters: { price: 6.0, duration_mins: 30, temp_celsius: 30, water_level: "Medium", spin_speed: 800, door_locked: false },
  },
  {
    id: "CH-W03",
    branch_id: "msu-cheras",
    name: "Washer #03 (15kg)",
    type: "washer",
    status: "IDLE",
    remaining_time: 0,
    current_cycle: null,
    phase: "Idle",
    capacity_kg: 15,
    power_w: 30,
    water_l: 0,
    drum_rpm: 0,
    parameters: { price: 6.0, duration_mins: 30, temp_celsius: 30, water_level: "Medium", spin_speed: 800, door_locked: false },
  },
  {
    id: "CH-W04",
    branch_id: "msu-cheras",
    name: "Washer #04 (20kg)",
    type: "washer",
    status: "RUNNING",
    remaining_time: 32,
    current_cycle: "Heavy Bedding 60°C",
    phase: "Wash",
    capacity_kg: 20,
    power_w: 2050,
    water_l: 60,
    drum_rpm: 750,
    parameters: { price: 8.5, duration_mins: 45, temp_celsius: 60, water_level: "High", spin_speed: 1200, door_locked: true },
  },
  {
    id: "CH-D01",
    branch_id: "msu-cheras",
    name: "Dryer #01 (Gas 16kg)",
    type: "dryer",
    status: "IDLE",
    remaining_time: 0,
    current_cycle: null,
    phase: "Idle",
    capacity_kg: 16,
    power_w: 25,
    water_l: 0,
    drum_rpm: 0,
    parameters: { price: 5.5, duration_mins: 30, temp_celsius: 55, water_level: "Low", spin_speed: 400, door_locked: false },
  },
  {
    id: "CH-D02",
    branch_id: "msu-cheras",
    name: "Dryer #02 (Gas 16kg)",
    type: "dryer",
    status: "RUNNING",
    remaining_time: 19,
    current_cycle: "High Heat Express",
    phase: "Dry",
    capacity_kg: 16,
    power_w: 490,
    water_l: 0,
    drum_rpm: 450,
    parameters: { price: 5.5, duration_mins: 30, temp_celsius: 65, water_level: "Low", spin_speed: 400, door_locked: true },
  },
  {
    id: "CH-D03",
    branch_id: "msu-cheras",
    name: "Dryer #03 (Gas 16kg)",
    type: "dryer",
    status: "IDLE",
    remaining_time: 0,
    current_cycle: null,
    phase: "Idle",
    capacity_kg: 16,
    power_w: 25,
    water_l: 0,
    drum_rpm: 0,
    parameters: { price: 5.5, duration_mins: 30, temp_celsius: 50, water_level: "Low", spin_speed: 400, door_locked: false },
  },
  {
    id: "CH-D04",
    branch_id: "msu-cheras",
    name: "Dryer #04 (Gas 20kg)",
    type: "dryer",
    status: "IDLE",
    remaining_time: 0,
    current_cycle: null,
    phase: "Idle",
    capacity_kg: 20,
    power_w: 25,
    water_l: 0,
    drum_rpm: 0,
    parameters: { price: 7.0, duration_mins: 35, temp_celsius: 50, water_level: "Low", spin_speed: 400, door_locked: false },
  },
];

let mockLpgManifolds: Record<string, LpgCylinder[]> = {
  "msu-shah-alam": [
    { cylinder_id: "CYL-01", label: "Cylinder #01", channel: "HX711-CH1", weight_kg: 42.4, max_capacity_kg: 50.0, capacity_percent: 84.8, status: "HEALTHY", maintenance_mode: false },
    { cylinder_id: "CYL-02", label: "Cylinder #02", channel: "HX711-CH2", weight_kg: 38.6, max_capacity_kg: 50.0, capacity_percent: 77.2, status: "HEALTHY", maintenance_mode: false },
    { cylinder_id: "CYL-03", label: "Cylinder #03", channel: "HX711-CH3", weight_kg: 6.5, max_capacity_kg: 50.0, capacity_percent: 13.0, status: "WARNING", maintenance_mode: false },
    { cylinder_id: "CYL-04", label: "Cylinder #04", channel: "HX711-CH4", weight_kg: 2.1, max_capacity_kg: 50.0, capacity_percent: 4.2, status: "CRITICAL", maintenance_mode: false },
  ],
  "msu-cheras": [
    { cylinder_id: "CYL-01", label: "Cylinder #01", channel: "HX711-CH1", weight_kg: 48.0, max_capacity_kg: 50.0, capacity_percent: 96.0, status: "HEALTHY", maintenance_mode: false },
    { cylinder_id: "CYL-02", label: "Cylinder #02", channel: "HX711-CH2", weight_kg: 35.2, max_capacity_kg: 50.0, capacity_percent: 70.4, status: "HEALTHY", maintenance_mode: false },
    { cylinder_id: "CYL-03", label: "Cylinder #03", channel: "HX711-CH3", weight_kg: 29.0, max_capacity_kg: 50.0, capacity_percent: 58.0, status: "HEALTHY", maintenance_mode: false },
    { cylinder_id: "CYL-04", label: "Cylinder #04", channel: "HX711-CH4", weight_kg: 44.1, max_capacity_kg: 50.0, capacity_percent: 88.2, status: "HEALTHY", maintenance_mode: false },
  ],
};

let mockMaintenanceLogs: MaintenanceLogEntry[] = [
  {
    id: "LOG-101",
    machine_id: "W-04",
    technician_name: "Ahmad Faiz (Technician ID 44)",
    action_taken: "Tested water intake solenoid coil; identified 12V relay failure and scheduled replacement part.",
    fault_code: "E01",
    timestamp: new Date().toISOString(),
  },
];

let mockSensorData: LpgSensorData = {
  voltage: 0.85,
  temperature: 28.2,
  humidity: 64.5,
  received_at: new Date().toISOString(),
  is_live_stream: false,
  lpg_weight_kg: 38.6,
  lpg_max_weight_kg: 50.0,
  lpg_capacity_percent: 77.2,
  is_leak_detected: false,
  leak_status: "SAFE",
};

export async function fetchWithFallback<T>(
  url: string,
  fallback: T,
  options?: RequestInit
): Promise<{ data: T; isLive: boolean }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const targetUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
    const res = await fetch(targetUrl, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { data, isLive: true };
  } catch {
    return { data: fallback, isLive: false };
  }
}

// ------------------------------------------
// Operator Authentication
// ------------------------------------------

export async function loginOperator(username: string, password: string) {
  try {
    const res = await fetch(`${API_BASE}/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) return { success: true, data: await res.json() };
  } catch {}
  return {
    success: true,
    data: {
      access_token: `mock-token-${Date.now()}`,
      operator_name: username === "admin" ? "MSU Supervisor" : username.toUpperCase(),
      role: "Branch Operator",
    },
  };
}

export async function registerOperator(payload: { name: string; email: string; password: string; company: string }) {
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { success: true, data: await res.json() };
  } catch {}
  return {
    success: true,
    data: {
      access_token: `mock-reg-token-${Date.now()}`,
      operator_name: payload.name,
      role: "Branch Operator",
    },
  };
}

// ------------------------------------------
// Multi-Branch Operations
// ------------------------------------------

export async function getBranches(): Promise<{ data: Branch[]; isLive: boolean }> {
  const res = await fetchWithFallback<Branch[]>("/branches", mockBranches);
  if (!res.isLive) {
    return { data: [...mockBranches], isLive: false };
  }
  return res;
}

export async function createBranch(newBranch: Partial<Branch>): Promise<{ success: boolean; data?: Branch }> {
  try {
    const res = await fetch(`${API_BASE}/branches`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newBranch),
    });
    if (res.ok) {
      const data = await res.json();
      mockBranches.push(data);
      return { success: true, data };
    }
  } catch {}

  const branchId = (newBranch.name || "new-branch").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const fallbackBranch: Branch = {
    id: branchId,
    name: newBranch.name || "New Laundry Branch",
    campus_type: "Campus Laundry Hub",
    address: newBranch.address || "MSU Subang Extension",
    city: newBranch.city || "Shah Alam",
    state: newBranch.state || "Selangor",
    postal_code: newBranch.postal_code || "40100",
    lat: newBranch.lat || 3.0738,
    lng: newBranch.lng || 101.5183,
    contact_phone: newBranch.contact_phone || "+60 3-5521 2888",
    opening_hours: newBranch.opening_hours || "24 Hours Daily",
    status: "ONLINE",
    total_washers: 4,
    active_washers: 0,
    idle_washers: 4,
    error_washers: 0,
    total_dryers: 4,
    active_dryers: 0,
    idle_dryers: 4,
    error_dryers: 0,
    total_machines: 8,
    total_cylinders: 4,
    healthy_cylinders: 4,
    lpg_status: "4/4 Cylinders Healthy",
    health_status: "HEALTHY",
    marker_color: "green",
  };
  mockBranches.push(fallbackBranch);
  mockLpgManifolds[branchId] = [
    { cylinder_id: "CYL-01", label: "Cylinder #01", channel: "HX711-CH1", weight_kg: 48.0, max_capacity_kg: 50.0, capacity_percent: 96.0, status: "HEALTHY", maintenance_mode: false },
    { cylinder_id: "CYL-02", label: "Cylinder #02", channel: "HX711-CH2", weight_kg: 46.0, max_capacity_kg: 50.0, capacity_percent: 92.0, status: "HEALTHY", maintenance_mode: false },
    { cylinder_id: "CYL-03", label: "Cylinder #03", channel: "HX711-CH3", weight_kg: 45.0, max_capacity_kg: 50.0, capacity_percent: 90.0, status: "HEALTHY", maintenance_mode: false },
    { cylinder_id: "CYL-04", label: "Cylinder #04", channel: "HX711-CH4", weight_kg: 44.0, max_capacity_kg: 50.0, capacity_percent: 88.0, status: "HEALTHY", maintenance_mode: false },
  ];
  return { success: true, data: fallbackBranch };
}

// ------------------------------------------
// Machine Fleet Operations
// ------------------------------------------

export async function getMachines(branchId?: string, type?: "washer" | "dryer"): Promise<{ data: Machine[]; isLive: boolean }> {
  const params = new URLSearchParams();
  if (branchId) params.append("branch_id", branchId);
  if (type) params.append("type", type);
  const query = params.toString() ? `?${params.toString()}` : "";
  const endpoint = `/machines${query}`;
  const result = await fetchWithFallback<Machine[]>(endpoint, mockMachines);
  if (!result.isLive) {
    let filtered = [...mockMachines];
    if (branchId) filtered = filtered.filter((m) => !m.branch_id || m.branch_id === branchId);
    if (type) filtered = filtered.filter((m) => m.type === type);
    return { data: filtered, isLive: false };
  }
  return result;
}

export async function provisionMachine(branchId: string, payload: any): Promise<{ success: boolean; data?: Machine }> {
  try {
    const res = await fetch(`${API_BASE}/branches/${branchId}/machines`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      mockMachines.push(data);
      return { success: true, data };
    }
  } catch {}

  const prefix = payload.type === "washer" ? "W" : "D";
  const newId = `${prefix}-0${mockMachines.length + 1}`;
  const newM: Machine = {
    id: newId,
    branch_id: branchId,
    name: `${payload.label} (${payload.capacity_kg}kg)`,
    type: payload.type,
    status: "IDLE",
    remaining_time: 0,
    current_cycle: null,
    phase: "Idle",
    capacity_kg: payload.capacity_kg || 15,
    power_w: 20,
    water_l: 0,
    drum_rpm: 0,
    parameters: {
      price: payload.type === "washer" ? 6.0 : 5.5,
      duration_mins: 30,
      temp_celsius: 40,
      water_level: "Medium",
      spin_speed: 800,
      door_locked: false,
    },
  };
  mockMachines.push(newM);
  return { success: true, data: newM };
}

export async function issueCommand(
  machineId: string,
  command: "start" | "pause" | "stop" | "unlock"
): Promise<{ success: boolean; machine?: Machine; isLive: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/machines/${machineId}/commands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, machine: data.machine, isLive: true };
    }
  } catch {}

  const m = mockMachines.find((x) => x.id === machineId);
  if (m) {
    if (command === "start") {
      m.status = "RUNNING";
      if (m.remaining_time === 0) m.remaining_time = m.parameters.duration_mins;
      m.phase = m.type === "washer" ? "Wash" : "Dry";
      m.parameters.door_locked = true;
      m.power_w = m.type === "washer" ? 1850 : 480;
      m.drum_rpm = m.type === "washer" ? 800 : 450;
    } else if (command === "pause") {
      m.status = "PAUSED";
    } else if (command === "stop") {
      m.status = "IDLE";
      m.remaining_time = 0;
      m.phase = "Idle";
      m.parameters.door_locked = false;
      m.power_w = 20;
      m.drum_rpm = 0;
    } else if (command === "unlock") {
      m.parameters.door_locked = false;
    }
    return { success: true, machine: { ...m }, isLive: false };
  }

  return { success: false, isLive: false };
}

export async function updateParameters(
  machineId: string,
  parameters: MachineParameters
): Promise<{ success: boolean; isLive: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/machines/${machineId}/parameters`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parameters),
    });
    if (res.ok) return { success: true, isLive: true };
  } catch {}

  const m = mockMachines.find((x) => x.id === machineId);
  if (m) {
    m.parameters = { ...parameters };
    return { success: true, isLive: false };
  }
  return { success: false, isLive: false };
}

export async function addMaintenanceLog(machineId: string, log: MaintenanceLogEntry): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/machines/${machineId}/maintenance-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(log),
    });
    if (res.ok) return true;
  } catch {}

  mockMaintenanceLogs.push(log);
  const m = mockMachines.find((x) => x.id === machineId);
  if (m && m.status === "ERROR") {
    m.status = "IDLE";
    m.fault_code = null;
    m.fault_subsystem = null;
    m.fault_remediation = null;
  }
  return true;
}

export async function getMaintenanceLogs(machineId: string): Promise<MaintenanceLogEntry[]> {
  try {
    const res = await fetch(`${API_BASE}/machines/${machineId}/maintenance-logs`);
    if (res.ok) return await res.json();
  } catch {}
  return mockMaintenanceLogs.filter((l) => l.machine_id === machineId);
}

// ------------------------------------------
// Multi-Cylinder LPG Management
// ------------------------------------------

export async function getLpgManifold(branchId: string): Promise<{ data: LpgCylinder[]; isLive: boolean }> {
  const fallback = mockLpgManifolds[branchId] || mockLpgManifolds["msu-shah-alam"];
  const res = await fetchWithFallback<LpgCylinder[]>(`/branches/${branchId}/lpg`, fallback);
  if (!res.isLive) {
    return { data: [...fallback], isLive: false };
  }
  return res;
}

export async function toggleLpgMaintenance(
  branchId: string,
  cylinderId: string,
  enabled: boolean,
  action?: "tare_full" | "tare_empty"
): Promise<{ success: boolean; cylinder?: LpgCylinder }> {
  try {
    const res = await fetch(`${API_BASE}/branches/${branchId}/lpg/${cylinderId}/maintenance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled, action }),
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, cylinder: data.cylinder };
    }
  } catch {}

  const list = mockLpgManifolds[branchId] || mockLpgManifolds["msu-shah-alam"];
  const cyl = list.find((c) => c.cylinder_id === cylinderId);
  if (cyl) {
    cyl.maintenance_mode = enabled;
    if (action === "tare_full") {
      cyl.weight_kg = 50.0;
      cyl.capacity_percent = 100.0;
      cyl.status = "HEALTHY";
    } else if (action === "tare_empty") {
      cyl.weight_kg = 0.0;
      cyl.capacity_percent = 0.0;
      cyl.status = "CRITICAL";
    } else {
      cyl.status = enabled ? "MAINTENANCE" : (cyl.capacity_percent < 5 ? "CRITICAL" : cyl.capacity_percent < 15 ? "WARNING" : "HEALTHY");
    }
    return { success: true, cylinder: { ...cyl } };
  }
  return { success: false };
}

// ------------------------------------------
// Safety & Environmental Telemetry
// ------------------------------------------

export async function getSafetyTelemetry(branchId: string): Promise<{ data: SafetyTelemetry; isLive: boolean }> {
  const fallback: SafetyTelemetry = {
    branch_id: branchId,
    sensor_voltage: mockSensorData.voltage,
    gas_ppm: Math.round(mockSensorData.voltage * 650),
    gas_leak_detected: mockSensorData.is_leak_detected,
    leak_status: mockSensorData.leak_status,
    ambient_temp_c: mockSensorData.temperature,
    humidity_rh: mockSensorData.humidity,
    high_temp_alert: mockSensorData.temperature > 45,
    alert_level: mockSensorData.is_leak_detected ? "CRITICAL" : "SAFE",
    received_at: mockSensorData.received_at,
  };

  return fetchWithFallback<SafetyTelemetry>(`/branches/${branchId}/safety`, fallback);
}

export async function getLatestSensorData(): Promise<{ data: LpgSensorData; isLive: boolean }> {
  const res = await fetchWithFallback<Partial<LpgSensorData>>("/api/latest", mockSensorData);
  const raw = res.data || {};
  const v = typeof raw.voltage === "number" ? raw.voltage : 0.85;
  const isLeak = raw.is_leak_detected ?? (v > 1.3);
  const safeData: LpgSensorData = {
    voltage: v,
    temperature: typeof raw.temperature === "number" ? raw.temperature : 28.0,
    humidity: typeof raw.humidity === "number" ? raw.humidity : 65.0,
    received_at: raw.received_at || new Date().toISOString(),
    is_live_stream: raw.is_live_stream ?? res.isLive,
    lpg_weight_kg: typeof raw.lpg_weight_kg === "number" ? raw.lpg_weight_kg : 38.6,
    lpg_max_weight_kg: typeof raw.lpg_max_weight_kg === "number" ? raw.lpg_max_weight_kg : 50.0,
    lpg_capacity_percent: typeof raw.lpg_capacity_percent === "number" ? raw.lpg_capacity_percent : 77.2,
    is_leak_detected: isLeak,
    leak_status: raw.leak_status || (v > 1.8 ? "CRITICAL" : v > 1.3 ? "WARNING" : "SAFE"),
  };
  return { data: safeData, isLive: res.isLive };
}

// ------------------------------------------
// Analytics & Consumption
// ------------------------------------------

export async function getTelemetry(
  branchId: string = "msu-shah-alam",
  timeframe: "daily" | "weekly" | "monthly" = "daily"
): Promise<{ data: TelemetrySummary; isLive: boolean }> {
  const fallback: TelemetrySummary = {
    branch_id: branchId,
    timeframe,
    revenue_myr: timeframe === "daily" ? 482.5 : timeframe === "weekly" ? 3410.0 : 14650.0,
    total_cycles: timeframe === "daily" ? 86 : timeframe === "weekly" ? 612 : 2580,
    water_liters: timeframe === "daily" ? 3870 : timeframe === "weekly" ? 27540 : 116100,
    power_kwh: timeframe === "daily" ? 64.2 : timeframe === "weekly" ? 456.8 : 1928.0,
    lpg_consumed_kg: timeframe === "daily" ? 14.8 : timeframe === "weekly" ? 105.0 : 442.0,
    gas_efficiency_kg_per_cycle: 0.38,
    dryer_cycles: timeframe === "daily" ? 39 : timeframe === "weekly" ? 284 : 1220,
    washer_cycles: timeframe === "daily" ? 47 : timeframe === "weekly" ? 328 : 1360,
    hourly_distribution: [
      { hour: "08:00", cycles: 4 },
      { hour: "10:00", cycles: 9 },
      { hour: "12:00", cycles: 14 },
      { hour: "14:00", cycles: 11 },
      { hour: "16:00", cycles: 16 },
      { hour: "18:00", cycles: 20 },
      { hour: "20:00", cycles: 12 },
    ],
    daily_revenue: [
      { day: "Mon", revenue: 420 },
      { day: "Tue", revenue: 390 },
      { day: "Wed", revenue: 450 },
      { day: "Thu", revenue: 510 },
      { day: "Fri", revenue: 580 },
      { day: "Sat", revenue: 620 },
      { day: "Sun", revenue: 440 },
    ],
  };

  return fetchWithFallback<TelemetrySummary>(`/telemetry?branch_id=${branchId}&timeframe=${timeframe}`, fallback);
}
