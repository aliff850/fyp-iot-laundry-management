export type MachineType = "washer" | "dryer";
export type MachineStatus = "IDLE" | "RUNNING" | "ERROR" | "PAUSED" | "OFFLINE";
export type WaterLevel = "Low" | "Medium" | "High";
export type CyclePhase = "Fill" | "Wash" | "Rinse" | "Spin" | "Dry" | "Cool Down" | "Idle";

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
  branch_id?: string;
  name: string;
  type: MachineType;
  status: MachineStatus;
  remaining_time: number;
  current_cycle: string | null;
  phase?: CyclePhase;
  capacity_kg?: number;
  power_w?: number;
  water_l?: number;
  drum_rpm?: number;
  fault_code?: string | null;
  fault_subsystem?: string | null;
  fault_remediation?: string | null;
  parameters: MachineParameters;
}

export interface LpgCylinder {
  cylinder_id: string;
  label: string;
  channel: string;
  weight_kg: number;
  max_capacity_kg: number;
  capacity_percent: number;
  status: "HEALTHY" | "WARNING" | "CRITICAL" | "MAINTENANCE";
  maintenance_mode: boolean;
}

export interface Branch {
  id: string;
  name: string;
  campus_type?: string;
  location?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  lat?: number;
  lng?: number;
  contact_phone?: string;
  opening_hours?: string;
  gateway_ip?: string;
  status?: string;
  total_washers?: number;
  active_washers?: number;
  idle_washers?: number;
  error_washers?: number;
  total_dryers?: number;
  active_dryers?: number;
  idle_dryers?: number;
  error_dryers?: number;
  total_machines?: number;
  total_cylinders?: number;
  healthy_cylinders?: number;
  lpg_status?: string;
  health_status?: "HEALTHY" | "WARNING" | "CRITICAL";
  marker_color?: "green" | "amber" | "red";
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

export interface SafetyTelemetry {
  branch_id?: string;
  sensor_voltage: number;
  gas_ppm: number;
  gas_leak_detected: boolean;
  leak_status: "SAFE" | "WARNING" | "CRITICAL";
  ambient_temp_c: number;
  humidity_rh: number;
  high_temp_alert: boolean;
  alert_level: "SAFE" | "WARNING" | "CRITICAL";
  received_at: string;
}

export interface TelemetrySummary {
  branch_id: string;
  timeframe: "daily" | "weekly" | "monthly";
  revenue_myr: number;
  total_cycles: number;
  water_liters: number;
  power_kwh: number;
  lpg_consumed_kg?: number;
  gas_efficiency_kg_per_cycle?: number;
  active_units?: number;
  idle_units?: number;
  fault_units?: number;
  dryer_cycles?: number;
  washer_cycles?: number;
  hourly_distribution?: { hour: string; cycles: number }[];
  daily_revenue?: { day: string; revenue: number }[];
}

export interface MaintenanceLogEntry {
  id: string;
  machine_id: string;
  technician_name: string;
  action_taken: string;
  fault_code?: string | null;
  timestamp: string;
}

export interface OperatorProfile {
  name: string;
  email: string;
  role: string;
  token: string;
}
