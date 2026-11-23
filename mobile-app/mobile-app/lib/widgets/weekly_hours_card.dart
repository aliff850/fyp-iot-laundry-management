import 'package:flutter/material.dart';
import '../models/public_models.dart';
import '../theme/spinsense_theme.dart';
import 'status_badge.dart';

class WeeklyHoursCard extends StatelessWidget {
  const WeeklyHoursCard({
    super.key,
    required this.hoursStatus,
    required this.timezone,
    this.openingHoursText,
    this.weeklyHours,
  });

  final HoursStatus hoursStatus;
  final String timezone;
  final String? openingHoursText;
  final Map<String, List<WeeklyInterval>>? weeklyHours;

  static const _dayOrder = <MapEntry<String, String>>[
    MapEntry('mon', 'Mon'),
    MapEntry('tue', 'Tue'),
    MapEntry('wed', 'Wed'),
    MapEntry('thu', 'Thu'),
    MapEntry('fri', 'Fri'),
    MapEntry('sat', 'Sat'),
    MapEntry('sun', 'Sun'),
  ];

  @override
  Widget build(BuildContext context) {
    final trimmedHoursText = openingHoursText?.trim() ?? '';
    final hasOpeningHoursText = trimmedHoursText.isNotEmpty;
    final hasStructured = weeklyHours != null && weeklyHours!.isNotEmpty;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: double.infinity,
              child: Wrap(
                spacing: 8,
                runSpacing: 6,
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  Text(
                    'Opening hours',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  StatusBadge.fromHoursStatus(hoursStatus),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Status shown in branch timezone ($timezone).',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: SpinSenseColors.faint,
                  ),
            ),
            if (hasOpeningHoursText) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: SpinSenseColors.raised,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: SpinSenseColors.rule),
                ),
                child: Row(
                  children: [
                    Icon(
                      Icons.schedule_rounded,
                      size: 20,
                      color: hoursStatus == HoursStatus.openRegularHours
                          ? SpinSenseColors.positive
                          : SpinSenseColors.muted,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        trimmedHoursText,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: SpinSenseColors.ink,
                          height: 1.25,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            if (hasStructured) ...[
              const SizedBox(height: 12),
              const Divider(),
              const SizedBox(height: 8),
              ..._dayOrder.map((day) {
                final intervals = weeklyHours![day.key] ?? const [];
                final rangeText = intervals.isEmpty
                    ? 'Closed'
                    : intervals.map((e) => e.displayRange).join(', ');
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 6),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        day.value,
                        style: const TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: SpinSenseColors.muted,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Flexible(
                        child: Text(
                          rangeText,
                          textAlign: TextAlign.right,
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: SpinSenseColors.ink,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ] else if (!hasOpeningHoursText) ...[
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: SpinSenseColors.raised,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: SpinSenseColors.rule),
                ),
                child: const Text(
                  'Operating hours unavailable',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: SpinSenseColors.muted,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
