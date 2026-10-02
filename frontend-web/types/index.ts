export type MachineType = "washer" | "dryer";
export type MachineStatus = "IDLE" | "RUNNING" | "ERROR";
export type WaterLevel = "Low" | "Medium" | "High";

export interface MachineParameters {
  price: number;
  duration_mins: number;
  temp_celsius: number;
  water_level: WaterLevel;
  spin_speed: number;
  door_locked: boolean;
}

export interface Machine {
  id: string;
  name: string;
  type: MachineType;
  status: MachineStatus;
  remaining_time: number;
  current_cycle: string | null;
  parameters: MachineParameters;
}

export interface Branch {
  id: string;
  name: string;
  location: string;
}

export interface LpgSensorData {
  voltage: number;
  temperature: number;
  humidity: number;
  received_at: string;
  is_live_stream: boolean;
  lpg_weight_kg: number;
  lpg_max_weight_kg: number;
  lpg_capacity_percent: number;
  is_leak_detected: boolean;
  leak_status: "SAFE" | "WARNING" | "CRITICAL";
}

export interface TelemetrySummary {
  branch_id: string;
  timeframe: "daily" | "weekly" | "monthly";
  revenue_myr: number;
  total_cycles: number;
  water_liters: number;
  power_kwh: number;
  active_units: number;
  idle_units: number;
  fault_units: number;
  hourly_distribution?: { hour: string; cycles: number }[];
  daily_revenue?: { day: string; revenue: number }[];
}
