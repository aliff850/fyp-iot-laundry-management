import { Branch, LpgSensorData, Machine, MachineParameters, TelemetrySummary } from "@/types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://esp32-gas-api.onrender.com";

// Fallback mock dataset if network is offline
const MOCK_BRANCHES: Branch[] = [
  { id: "msu-shah-alam", name: "MSU Shah Alam", location: "Student Service Centre, Ground Floor" },
  { id: "msu-cheras", name: "MSU Cheras", location: "Campus Laundry Annex, Level 1" },
];

let mockMachines: Machine[] = [
  {
    id: "W-01",
    name: "Washer #01 (Hippo Laundry 15kg)",
    type: "washer",
    status: "RUNNING",
    remaining_time: 18,
    current_cycle: "Standard Cotton 40°C",
    parameters: { price: 6.0, duration_mins: 35, temp_celsius: 40, water_level: "High", spin_speed: 1200, door_locked: true },
  },
  {
    id: "W-02",
    name: "Washer #02 (Hippo Laundry 15kg)",
    type: "washer",
    status: "IDLE",
    remaining_time: 0,
    current_cycle: null,
    parameters: { price: 6.0, duration_mins: 30, temp_celsius: 30, water_level: "Medium", spin_speed: 800, door_locked: false },
  },
  {
    id: "W-03",
    name: "Washer #03 (Hippo Laundry 20kg)",
    type: "washer",
    status: "RUNNING",
    remaining_time: 27,
    current_cycle: "Heavy Bedding 60°C",
    parameters: { price: 8.5, duration_mins: 45, temp_celsius: 60, water_level: "High", spin_speed: 1200, door_locked: true },
  },
  {
    id: "W-04",
    name: "Washer #04 (Hippo Laundry 15kg)",
    type: "washer",
    status: "ERROR",
    remaining_time: 0,
    current_cycle: "Water Inlet Fault (E04)",
    parameters: { price: 6.0, duration_mins: 30, temp_celsius: 30, water_level: "Low", spin_speed: 400, door_locked: false },
  },
  {
    id: "D-01",
    name: "Dryer #01 (Hippo Laundry Gas 16kg)",
    type: "dryer",
    status: "RUNNING",
    remaining_time: 22,
    current_cycle: "High Heat Express",
    parameters: { price: 5.5, duration_mins: 30, temp_celsius: 65, water_level: "Low", spin_speed: 400, door_locked: true },
  },
  {
    id: "D-02",
    name: "Dryer #02 (Hippo Laundry Gas 16kg)",
    type: "dryer",
    status: "IDLE",
    remaining_time: 0,
    current_cycle: null,
    parameters: { price: 5.5, duration_mins: 30, temp_celsius: 50, water_level: "Low", spin_speed: 400, door_locked: false },
  },
  {
    id: "D-03",
    name: "Dryer #03 (Hippo Laundry Gas 20kg)",
    type: "dryer",
    status: "RUNNING",
    remaining_time: 9,
    current_cycle: "Delicates Low Heat",
    parameters: { price: 7.0, duration_mins: 35, temp_celsius: 45, water_level: "Low", spin_speed: 400, door_locked: true },
  },
  {
    id: "D-04",
    name: "Dryer #04 (Hippo Laundry Gas 16kg)",
    type: "dryer",
    status: "IDLE",
    remaining_time: 0,
    current_cycle: null,
    parameters: { price: 5.5, duration_mins: 30, temp_celsius: 55, water_level: "Low", spin_speed: 400, door_locked: false },
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

export async function fetchWithFallback<T>(url: string, fallback: T, options?: RequestInit): Promise<{ data: T; isLive: boolean }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(`${API_BASE}${url}`, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return { data, isLive: true };
  } catch (err) {
    console.warn(`[API] Remote call to ${url} failed, using local mock adapter:`, err);
    return { data: fallback, isLive: false };
  }
}

export async function getBranches(): Promise<{ data: Branch[]; isLive: boolean }> {
  return fetchWithFallback<Branch[]>("/branches", MOCK_BRANCHES);
}

export async function getMachines(type?: "washer" | "dryer"): Promise<{ data: Machine[]; isLive: boolean }> {
  const query = type ? `?type=${type}` : "";
  const result = await fetchWithFallback<Machine[]>(`/machines${query}`, mockMachines);
  if (!result.isLive && type) {
    return { data: mockMachines.filter((m) => m.type === type), isLive: false };
  }
  return result;
}

export async function issueCommand(
  machineId: string,
  command: "start" | "pause" | "stop"
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
  } catch {
    // offline fallback
  }

  // Local state update
  const m = mockMachines.find((x) => x.id === machineId);
  if (m) {
    if (command === "start") {
      m.status = "RUNNING";
      if (m.remaining_time === 0) m.remaining_time = m.parameters.duration_mins;
      m.parameters.door_locked = true;
    } else if (command === "pause") {
      m.status = "IDLE";
    } else if (command === "stop") {
      m.status = "IDLE";
      m.remaining_time = 0;
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
  } catch {
    // fallback
  }

  const m = mockMachines.find((x) => x.id === machineId);
  if (m) {
    m.parameters = { ...parameters };
    return { success: true, isLive: false };
  }
  return { success: false, isLive: false };
}

export async function getTelemetry(
  branchId: string = "msu-subang",
  timeframe: "daily" | "weekly" | "monthly" = "daily"
): Promise<{ data: TelemetrySummary; isLive: boolean }> {
  const fallback: TelemetrySummary = {
    branch_id: branchId,
    timeframe,
    revenue_myr: timeframe === "daily" ? 482.5 : timeframe === "weekly" ? 3410.0 : 14650.0,
    total_cycles: timeframe === "daily" ? 86 : timeframe === "weekly" ? 612 : 2580,
    water_liters: timeframe === "daily" ? 3870 : timeframe === "weekly" ? 27540 : 116100,
    power_kwh: timeframe === "daily" ? 64.2 : timeframe === "weekly" ? 456.8 : 1928.0,
    active_units: 6,
    idle_units: 1,
    fault_units: 1,
    hourly_distribution: [
      { hour: "08:00", cycles: 4 },
      { hour: "10:00", cycles: 9 },
      { hour: "12:00", cycles: 14 },
      { hour: "14:00", cycles: 11 },
      { hour: "16:00", cycles: 16 },
      { hour: "18:00", cycles: 20 },
      { hour: "20:00", cycles: 12 },
    ],
  };

  return fetchWithFallback<TelemetrySummary>(`/telemetry?branch_id=${branchId}&timeframe=${timeframe}`, fallback);
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
