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
    final hasStructured = weeklyHours != null && weeklyHours!.isNotEmpty;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Opening hours',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(width: 8),
                Flexible(child: StatusBadge.fromHoursStatus(hoursStatus)),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              'Status shown in branch timezone ($timezone).',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: SpinSenseColors.faint,
                  ),
            ),
            if (openingHoursText != null && openingHoursText!.trim().isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(
                openingHoursText!.trim(),
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: SpinSenseColors.muted,
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
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        day.value,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: SpinSenseColors.muted,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Flexible(
                        child: Text(
                          rangeText,
                          textAlign: TextAlign.right,
                          style: const TextStyle(
                            fontSize: 13,
                            color: SpinSenseColors.ink,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ] else if (hoursStatus == HoursStatus.hoursUnknown) ...[
              const SizedBox(height: 8),
              Text(
                'Structured weekly hours have not been configured for this branch.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: SpinSenseColors.faint,
                    ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
