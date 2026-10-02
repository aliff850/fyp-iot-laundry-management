/**
 * MQ-6 LPG Gas Sensor PPM Calculator
 * 
 * Physics Model:
 * - ESP32 12-bit ADC mapped to 0 - 3.3V analog rail.
 * - Sensor resistance Rs = ((Vc - V) / V) * RL (where Vc = 3.3V, RL = 10k Ohm).
 * - Clean air baseline ratio (Rs/R0) is approx 10.0.
 * - Calibrated R0 in ambient air (at 0.80V) ~ 3.125k Ohm.
 * - Power law curve for LPG: PPM = A * (Rs / R0)^B (A = 1009.2, B = -2.35).
 * - Clamped to standard MQ-6 detection envelope: 200 PPM to 10,000 PPM.
 */

export interface LpgPpmResult {
  ppm: number;
  voltage: number;
  ratio: number;
  status: "SAFE" | "ELEVATED" | "WARNING" | "CRITICAL";
  statusLabel: string;
  statusDescription: string;
  colorClass: string;
  badgeClass: string;
  borderClass: string;
  bgClass: string;
}

export function calculateLpgPpm(voltage: number): LpgPpmResult {
  // Constrain voltage to physical range
  const v = Math.max(0.1, Math.min(3.25, voltage));
  const vc = 3.3; // ADC rail voltage
  const rl = 10.0; // 10k load resistor
  const r0 = 3.15; // Calibrated R0 in clean air (kOhm)

  // Calculate sensor resistance Rs
  const rs = ((vc - v) / v) * rl;
  const ratio = Math.max(0.1, rs / r0);

  // Power-law regression for LPG on MQ-6: PPM = 1009.2 * (Rs/R0)^(-2.35)
  let rawPpm = 1009.2 * Math.pow(ratio, -2.35);

  // Baseline calibration clamping
  if (v <= 0.85) {
    // Normal ambient room reading: 150 - 300 PPM
    rawPpm = 150 + ((v - 0.1) / 0.75) * 150;
  }

  const ppm = Math.round(Math.min(10000, Math.max(50, rawPpm)));

  if (v >= 1.75 || ppm >= 2500) {
    return {
      ppm,
      voltage: v,
      ratio,
      status: "CRITICAL",
      statusLabel: "CRITICAL LEAK",
      statusDescription: "Immediate evacuation & shutoff required",
      colorClass: "text-red-700",
      badgeClass: "bg-red-600 text-white",
      borderClass: "border-red-600",
      bgClass: "bg-red-50",
    };
  }

  if (v >= 1.30 || ppm >= 1000) {
    return {
      ppm,
      voltage: v,
      ratio,
      status: "WARNING",
      statusLabel: "GAS WARNING",
      statusDescription: "LPG concentration elevated above 1000 PPM",
      colorClass: "text-amber-800",
      badgeClass: "bg-amber-600 text-white",
      borderClass: "border-amber-500",
      bgClass: "bg-amber-50",
    };
  }

  if (v >= 1.05 || ppm >= 500) {
    return {
      ppm,
      voltage: v,
      ratio,
      status: "ELEVATED",
      statusLabel: "ELEVATED CONCENTRATION",
      statusDescription: "Mild gas trace detected, ventilation active",
      colorClass: "text-amber-700",
      badgeClass: "bg-amber-100 text-amber-900 border border-amber-300",
      borderClass: "border-amber-400",
      bgClass: "bg-amber-50/60",
    };
  }

  return {
    ppm,
    voltage: v,
    ratio,
    status: "SAFE",
    statusLabel: "SAFE — NORMAL",
    statusDescription: "Ambient air clean. No combustible gas detected.",
    colorClass: "text-emerald-800",
    badgeClass: "bg-emerald-600 text-white",
    borderClass: "border-emerald-500",
    bgClass: "bg-emerald-50/80",
  };
}
