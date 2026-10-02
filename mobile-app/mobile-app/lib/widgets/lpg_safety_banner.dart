import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/gas_calculator.dart';
import '../theme/app_theme.dart';

class LpgSafetyBanner extends StatelessWidget {
  final SensorData sensorData;

  const LpgSafetyBanner({
    super.key,
    required this.sensorData,
  });

  @override
  Widget build(BuildContext context) {
    final voltage = sensorData.voltage;
    final temp = sensorData.temperature;
    final humidity = sensorData.humidity;
    final lpgWeight = sensorData.lpgWeightKg;
    final lpgMax = sensorData.lpgMaxWeightKg;
    final lpgCap = sensorData.lpgCapacityPercent;

    final gasMetrics = GasCalculator.calculateLpgPpm(voltage);

    final isLowGas = lpgCap < 15;
    final isCriticalGas = lpgCap < 5;

    Color bannerBg;
    Color bannerBorder;
    Color iconBg;
    Color textColor;
    IconData statusIcon;

    if (gasMetrics.status == GasStatus.critical) {
      bannerBg = const Color(0xFFFEE2E2);
      bannerBorder = const Color(0xFFDC2626);
      iconBg = const Color(0xFFDC2626);
      textColor = const Color(0xFF7F1D1D);
      statusIcon = Icons.warning_amber_rounded;
    } else if (gasMetrics.status == GasStatus.warning) {
      bannerBg = const Color(0xFFFEF3C7);
      bannerBorder = const Color(0xFFD97706);
      iconBg = const Color(0xFFD97706);
      textColor = const Color(0xFF78350F);
      statusIcon = Icons.error_outline_rounded;
    } else if (gasMetrics.status == GasStatus.elevated) {
      bannerBg = const Color(0xFFFFFBEB);
      bannerBorder = const Color(0xFFF59E0B);
      iconBg = const Color(0xFFF59E0B);
      textColor = const Color(0xFF78350F);
      statusIcon = Icons.error_outline_rounded;
    } else {
      bannerBg = const Color(0xFFECFDF5);
      bannerBorder = const Color(0xFF059669);
      iconBg = const Color(0xFF059669);
      textColor = const Color(0xFF064E3B);
      statusIcon = Icons.check_circle_outline_rounded;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Primary LPG Alert Banner
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: bannerBg,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: bannerBorder, width: 2),
            boxShadow: const [
              BoxShadow(
                color: Color(0x0D000000),
                blurRadius: 4,
                offset: Offset(0, 2),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Container(
                    width: 48,
                    height: 48,
                    decoration: BoxDecoration(
                      color: iconBg,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(statusIcon, color: Colors.white, size: 28),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(
                              'LPG SAFETY STATUS',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1.2,
                                color: textColor.withValues(alpha: 0.7),
                                fontFamily: AppTheme.monoFont,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: iconBg.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                gasMetrics.statusLabel,
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w900,
                                  color: iconBg,
                                  fontFamily: AppTheme.monoFont,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 3),
                        Text(
                          gasMetrics.status == GasStatus.critical
                              ? 'HAZARDOUS GAS LEAK'
                              : gasMetrics.status == GasStatus.warning
                                  ? 'ELEVATED GAS WARNING'
                                  : 'ATMOSPHERE SAFE',
                          style: TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.3,
                            color: textColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Divider(color: Color(0x33000000), height: 1),
              const SizedBox(height: 12),
              // Concentration & Voltage Row
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'CONCENTRATION',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1,
                          color: textColor.withValues(alpha: 0.7),
                          fontFamily: AppTheme.monoFont,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            '${gasMetrics.ppm}',
                            style: TextStyle(
                              fontSize: 32,
                              fontWeight: FontWeight.w900,
                              fontFamily: AppTheme.monoFont,
                              color: textColor,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'PPM',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w900,
                              fontFamily: AppTheme.monoFont,
                              color: textColor.withValues(alpha: 0.8),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                  Container(
                    height: 36,
                    width: 1.5,
                    color: const Color(0x33000000),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        'MQ-6 VOLTAGE',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1,
                          color: textColor.withValues(alpha: 0.7),
                          fontFamily: AppTheme.monoFont,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            voltage.toStringAsFixed(2),
                            style: TextStyle(
                              fontSize: 26,
                              fontWeight: FontWeight.w900,
                              fontFamily: AppTheme.monoFont,
                              color: textColor,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'V',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w900,
                              fontFamily: AppTheme.monoFont,
                              color: textColor.withValues(alpha: 0.8),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),

        const SizedBox(height: 12),

        // 3 Peripheral Cards: Tank Capacity, DHT22 Temperature, Humidity
        Row(
          children: [
            // Tank Capacity
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.borderSlate, width: 2),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Icon(Icons.scale_rounded, size: 16, color: AppColors.crimsonPrimary),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
                          decoration: BoxDecoration(
                            color: isCriticalGas
                                ? const Color(0xFFFEE2E2)
                                : isLowGas
                                    ? const Color(0xFFFEF3C7)
                                    : const Color(0xFFECFDF5),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            isCriticalGas ? 'CRIT' : isLowGas ? 'LOW' : 'OK',
                            style: TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w900,
                              fontFamily: AppTheme.monoFont,
                              color: isCriticalGas
                                  ? const Color(0xFFDC2626)
                                  : isLowGas
                                      ? const Color(0xFFD97706)
                                      : const Color(0xFF059669),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'LPG TANK',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w900,
                        color: AppColors.slate600,
                        fontFamily: AppTheme.monoFont,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${lpgCap.toStringAsFixed(0)}%',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        fontFamily: AppTheme.monoFont,
                        color: AppColors.slate900,
                      ),
                    ),
                    const SizedBox(height: 4),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: (lpgCap / 100).clamp(0.0, 1.0),
                        backgroundColor: const Color(0xFFE2E8F0),
                        valueColor: AlwaysStoppedAnimation<Color>(
                          isCriticalGas
                              ? const Color(0xFFDC2626)
                              : isLowGas
                                  ? const Color(0xFFF59E0B)
                                  : AppColors.crimsonPrimary,
                        ),
                        minHeight: 6,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${lpgWeight.toStringAsFixed(1)} / ${lpgMax.toStringAsFixed(0)} kg',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.bold,
                        fontFamily: AppTheme.monoFont,
                        color: AppColors.slate500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),

            // Temperature
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.borderSlate, width: 2),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Icon(Icons.thermostat_rounded, size: 16, color: Color(0xFFEA580C)),
                        Text(
                          'DHT22',
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w900,
                            fontFamily: AppTheme.monoFont,
                            color: AppColors.slate500,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'TEMPERATURE',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w900,
                        color: AppColors.slate600,
                        fontFamily: AppTheme.monoFont,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${temp.toStringAsFixed(1)}°C',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        fontFamily: AppTheme.monoFont,
                        color: AppColors.slate900,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      temp > 45 ? 'Elevated Heat' : 'Ambient Safe',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.bold,
                        fontFamily: AppTheme.monoFont,
                        color: temp > 45 ? const Color(0xFFDC2626) : const Color(0xFF059669),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(width: 8),

            // Humidity
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.borderSlate, width: 2),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Icon(Icons.water_drop_rounded, size: 16, color: Color(0xFF0284C7)),
                        Text(
                          'LIVE',
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w900,
                            fontFamily: AppTheme.monoFont,
                            color: AppColors.slate500,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'HUMIDITY',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w900,
                        color: AppColors.slate600,
                        fontFamily: AppTheme.monoFont,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${humidity.toStringAsFixed(0)}%',
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w900,
                        fontFamily: AppTheme.monoFont,
                        color: AppColors.slate900,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Atmospheric',
                      style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.bold,
                        fontFamily: AppTheme.monoFont,
                        color: AppColors.slate500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
