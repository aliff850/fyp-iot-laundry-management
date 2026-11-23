import 'package:flutter/material.dart';
import '../models/public_models.dart';
import '../theme/spinsense_theme.dart';

class PeakDemandHoursCard extends StatefulWidget {
  const PeakDemandHoursCard({
    super.key,
    required this.peakHours,
  });

  final PublicPeakDemandHours peakHours;

  @override
  State<PeakDemandHoursCard> createState() => _PeakDemandHoursCardState();
}

class _PeakDemandHoursCardState extends State<PeakDemandHoursCard> {
  static const List<MapEntry<String, String>> _dayOptions = [
    MapEntry('overall', 'Overall'),
    MapEntry('mon', 'Monday'),
    MapEntry('tue', 'Tuesday'),
    MapEntry('wed', 'Wednesday'),
    MapEntry('thu', 'Thursday'),
    MapEntry('fri', 'Friday'),
    MapEntry('sat', 'Saturday'),
    MapEntry('sun', 'Sunday'),
  ];

  late String _selectedKey;
  int? _inspectedHour;

  String _normalizeBucketKey(String key) {
    for (final option in _dayOptions) {
      if (option.key == key) return key;
    }
    return 'overall';
  }

  @override
  void initState() {
    super.initState();
    _selectedKey = _normalizeBucketKey(widget.peakHours.defaultBucket);
    _inspectedHour = widget.peakHours.bucketFor(_selectedKey).peakHour;
  }

  @override
  void didUpdateWidget(covariant PeakDemandHoursCard oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.peakHours != widget.peakHours) {
      if (!widget.peakHours.buckets.containsKey(_selectedKey) ||
          !widget.peakHours.bucketFor(_selectedKey).hasData) {
        _selectedKey = _normalizeBucketKey(widget.peakHours.defaultBucket);
      }
      _inspectedHour = widget.peakHours.bucketFor(_selectedKey).peakHour;
    }
  }

  void _selectBucket(String key) {
    final normalized = _normalizeBucketKey(key);
    setState(() {
      _selectedKey = normalized;
      _inspectedHour = widget.peakHours.bucketFor(normalized).peakHour;
    });
  }

  Color _barColor(PeakDemandHourPoint point) {
    if (point.busyPct <= 0) return SpinSenseColors.rule;
    switch (point.level) {
      case 'busy':
        return SpinSenseColors.accent;
      case 'moderate':
        return SpinSenseColors.warning;
      default:
        return SpinSenseColors.control;
    }
  }

  @override
  Widget build(BuildContext context) {
    final activeKey = _normalizeBucketKey(_selectedKey);
    final bucket = widget.peakHours.bucketFor(activeKey);
    final activeHourIndex = _inspectedHour ?? bucket.peakHour;
    final inspectedPoint = (activeHourIndex != null &&
            activeHourIndex >= 0 &&
            activeHourIndex < bucket.hours.length)
        ? bucket.hours[activeHourIndex]
        : null;

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
                    'Peak demand hours',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  if (bucket.hasData && bucket.peakHourLabel != null)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: SpinSenseColors.navy,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: SpinSenseColors.accent),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.bar_chart_rounded,
                            size: 14,
                            color: SpinSenseColors.accent,
                          ),
                          const SizedBox(width: 5),
                          Text(
                            'Peak ${bucket.peakHourLabel}',
                            style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: SpinSenseColors.ink,
                              fontFeatures: [FontFeature.tabularFigures()],
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Typical machine occupancy (${widget.peakHours.timezone}).',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: SpinSenseColors.faint,
                  ),
            ),
            const SizedBox(height: 12),
            if (!widget.peakHours.hasData)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 18),
                decoration: BoxDecoration(
                  color: SpinSenseColors.raised,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: SpinSenseColors.rule),
                ),
                child: const Text(
                  'Not enough usage history yet to estimate peak hours.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    color: SpinSenseColors.muted,
                  ),
                ),
              )
            else ...[
              Semantics(
                label: 'Peak demand day filter',
                child: InputDecorator(
                  decoration: const InputDecoration(
                    isDense: true,
                    contentPadding: EdgeInsets.symmetric(
                      horizontal: 14,
                      vertical: 2,
                    ),
                    prefixIcon: Icon(
                      Icons.calendar_today_outlined,
                      size: 16,
                      color: SpinSenseColors.muted,
                    ),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: activeKey,
                      isExpanded: true,
                      dropdownColor: SpinSenseColors.raised,
                      borderRadius: BorderRadius.circular(8),
                      icon: const Icon(
                        Icons.keyboard_arrow_down_rounded,
                        color: SpinSenseColors.muted,
                      ),
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w600,
                            color: SpinSenseColors.ink,
                          ),
                      selectedItemBuilder: (context) => _dayOptions
                          .map(
                            (option) => Align(
                              alignment: Alignment.centerLeft,
                              child: Text(
                                option.value,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: Theme.of(context)
                                    .textTheme
                                    .bodyMedium
                                    ?.copyWith(
                                      fontWeight: FontWeight.w600,
                                      color: SpinSenseColors.ink,
                                    ),
                              ),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        if (value != null) _selectBucket(value);
                      },
                      items: _dayOptions.map((option) {
                        final optionHasData = option.key == 'overall' ||
                            widget.peakHours.bucketFor(option.key).hasData;
                        final isSelected = option.key == activeKey;
                        return DropdownMenuItem<String>(
                          value: option.key,
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  option.value,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: isSelected
                                        ? FontWeight.w600
                                        : FontWeight.w500,
                                    color: optionHasData
                                        ? SpinSenseColors.ink
                                        : SpinSenseColors.muted,
                                  ),
                                ),
                              ),
                              if (!optionHasData)
                                const Padding(
                                  padding: EdgeInsets.only(left: 8),
                                  child: Text(
                                    'No history',
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: SpinSenseColors.faint,
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),
              if (!bucket.hasData)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: SpinSenseColors.raised,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: SpinSenseColors.rule),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'No activity recorded for this day yet. Switch to Overall to view combined peak hours.',
                        style: TextStyle(
                          fontSize: 13,
                          color: SpinSenseColors.muted,
                        ),
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton(
                        onPressed: () => _selectBucket('overall'),
                        child: const Text('View Overall'),
                      ),
                    ],
                  ),
                )
              else ...[
                if (inspectedPoint != null)
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: SpinSenseColors.raised,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: SpinSenseColors.rule),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          inspectedPoint.hourLabel,
                          style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: SpinSenseColors.ink,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                        const SizedBox(width: 8),
                        Flexible(
                          child: Text(
                            inspectedPoint.busyPct > 0
                                ? '${inspectedPoint.displayLevel} (${inspectedPoint.busyPct}%)'
                                : inspectedPoint.displayLevel,
                            textAlign: TextAlign.right,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: inspectedPoint.level == 'busy'
                                  ? SpinSenseColors.accent
                                  : SpinSenseColors.muted,
                              fontFeatures: const [FontFeature.tabularFigures()],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.fromLTRB(8, 12, 8, 8),
                  decoration: BoxDecoration(
                    color: SpinSenseColors.canvas,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: SpinSenseColors.rule),
                  ),
                  child: Column(
                    children: [
                      SizedBox(
                        height: 104,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: bucket.hours.map((pt) {
                            final isSelected = activeHourIndex == pt.hour;
                            final barHeight = pt.busyPct <= 0
                                ? 3.0
                                : ((pt.busyPct / 100.0) * 92.0).clamp(6.0, 92.0);
                            return Expanded(
                              child: Semantics(
                                button: true,
                                selected: isSelected,
                                label:
                                    '${pt.hourLabel} ${pt.displayLevel} ${pt.busyPct} percent',
                                child: GestureDetector(
                                  behavior: HitTestBehavior.opaque,
                                  onTap: () {
                                    setState(() => _inspectedHour = pt.hour);
                                  },
                                  child: Container(
                                    height: double.infinity,
                                    margin: const EdgeInsets.symmetric(horizontal: 1),
                                    decoration: isSelected
                                        ? BoxDecoration(
                                            color: SpinSenseColors.navy
                                                .withValues(alpha: 0.65),
                                            borderRadius: BorderRadius.circular(3),
                                          )
                                        : null,
                                    alignment: Alignment.bottomCenter,
                                    child: Container(
                                      width: double.infinity,
                                      height: barHeight,
                                      decoration: BoxDecoration(
                                        color: _barColor(pt),
                                        borderRadius: BorderRadius.circular(2),
                                        border: isSelected
                                            ? Border.all(
                                                color: SpinSenseColors.ink,
                                                width: 1,
                                              )
                                            : null,
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                      const SizedBox(height: 6),
                      const Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            '00h',
                            style: TextStyle(
                              fontSize: 11,
                              color: SpinSenseColors.faint,
                              fontFeatures: [FontFeature.tabularFigures()],
                            ),
                          ),
                          Text(
                            '06h',
                            style: TextStyle(
                              fontSize: 11,
                              color: SpinSenseColors.faint,
                              fontFeatures: [FontFeature.tabularFigures()],
                            ),
                          ),
                          Text(
                            '12h',
                            style: TextStyle(
                              fontSize: 11,
                              color: SpinSenseColors.faint,
                              fontFeatures: [FontFeature.tabularFigures()],
                            ),
                          ),
                          Text(
                            '18h',
                            style: TextStyle(
                              fontSize: 11,
                              color: SpinSenseColors.faint,
                              fontFeatures: [FontFeature.tabularFigures()],
                            ),
                          ),
                          Text(
                            '23h',
                            style: TextStyle(
                              fontSize: 11,
                              color: SpinSenseColors.faint,
                              fontFeatures: [FontFeature.tabularFigures()],
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                const Wrap(
                  spacing: 14,
                  runSpacing: 6,
                  children: [
                    _LegendItem(
                      color: SpinSenseColors.control,
                      label: 'Quiet',
                    ),
                    _LegendItem(
                      color: SpinSenseColors.warning,
                      label: 'Moderate',
                    ),
                    _LegendItem(
                      color: SpinSenseColors.accent,
                      label: 'Busiest',
                    ),
                  ],
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _LegendItem extends StatelessWidget {
  const _LegendItem({
    required this.color,
    required this.label,
  });

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            color: SpinSenseColors.muted,
          ),
        ),
      ],
    );
  }
}
