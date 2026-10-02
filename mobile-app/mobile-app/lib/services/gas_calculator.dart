import 'dart:math' as math;
import 'package:flutter/material.dart';

enum GasStatus { safe, elevated, warning, critical }

class GasCalculationResult {
  final int ppm;
  final double voltage;
  final GasStatus status;
  final String statusLabel;
  final Color badgeBg;
  final Color badgeText;
  final Color bannerBg;
  final Color bannerBorder;

  GasCalculationResult({
    required this.ppm,
    required this.voltage,
    required this.status,
    required this.statusLabel,
    required this.badgeBg,
    required this.badgeText,
    required this.bannerBg,
    required this.bannerBorder,
  });
}

class GasCalculator {
  static GasCalculationResult calculateLpgPpm(double voltage) => calculate(voltage);

  static GasCalculationResult calculate(double voltage) {
    final v = math.max(0.1, math.min(3.25, voltage));
    const vc = 3.3; // ADC rail
    const rl = 10.0; // 10k load resistor
    const r0 = 3.15; // Calibrated clean air R0

    final rs = ((vc - v) / v) * rl;
    final ratio = math.max(0.1, rs / r0);

    // Power-law regression: PPM = 1009.2 * (Rs/R0)^(-2.35)
    double rawPpm = 1009.2 * math.pow(ratio, -2.35);

    if (v <= 0.85) {
      rawPpm = 150 + ((v - 0.1) / 0.75) * 150;
    }

    final ppm = math.min(10000, math.max(50, rawPpm)).round();

    if (v >= 1.75 || ppm >= 2500) {
      return GasCalculationResult(
        ppm: ppm,
        voltage: v,
        status: GasStatus.critical,
        statusLabel: "CRITICAL LEAK",
        badgeBg: const Color(0xFFDC2626),
        badgeText: Colors.white,
        bannerBg: const Color(0xFFFEE2E2),
        bannerBorder: const Color(0xFFDC2626),
      );
    }

    if (v >= 1.30 || ppm >= 1000) {
      return GasCalculationResult(
        ppm: ppm,
        voltage: v,
        status: GasStatus.warning,
        statusLabel: "ELEVATED WARNING",
        badgeBg: const Color(0xFFD97706),
        badgeText: Colors.white,
        bannerBg: const Color(0xFFFEF3C7),
        bannerBorder: const Color(0xFFD97706),
      );
    }

    if (v >= 1.05 || ppm >= 500) {
      return GasCalculationResult(
        ppm: ppm,
        voltage: v,
        status: GasStatus.elevated,
        statusLabel: "ELEVATED TRACE",
        badgeBg: const Color(0xFFF59E0B),
        badgeText: Colors.white,
        bannerBg: const Color(0xFFFFFBEB),
        bannerBorder: const Color(0xFFF59E0B),
      );
    }

    return GasCalculationResult(
      ppm: ppm,
      voltage: v,
      status: GasStatus.safe,
      statusLabel: "ATMOSPHERE SAFE",
      badgeBg: const Color(0xFF16A34A),
      badgeText: Colors.white,
      bannerBg: const Color(0xFFDCFCE7),
      bannerBorder: const Color(0xFF16A34A),
    );
  }
}
