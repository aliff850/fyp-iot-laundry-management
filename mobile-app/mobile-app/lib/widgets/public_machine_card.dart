import 'package:flutter/material.dart';
import '../models/public_models.dart';
import '../theme/spinsense_theme.dart';
import 'status_badge.dart';

class PublicMachineCard extends StatelessWidget {
  const PublicMachineCard({
    super.key,
    required this.machine,
    required this.onInspect,
  });

  final PublicMachine machine;
  final VoidCallback onInspect;

  String _formatTimestamp(DateTime? dt) {
    if (dt == null) return 'Not yet reported';
    final local = dt.toLocal();
    final hh = local.hour.toString().padLeft(2, '0');
    final mm = local.minute.toString().padLeft(2, '0');
    return '$hh:$mm local';
  }

  @override
  Widget build(BuildContext context) {
    final countdown = machine.formattedCountdownEstimate;
    final priceText = machine.formattedHeadlinePrice;

    return Card(
      child: InkWell(
        onTap: onInspect,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          machine.label,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          machine.capacityKg != null
                              ? '${machine.capacityKg!.toStringAsFixed(machine.capacityKg! % 1 == 0 ? 0 : 1)} kg capacity'
                              : 'Capacity unspecified',
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: SpinSenseColors.muted,
                                fontFeatures: const [FontFeature.tabularFigures()],
                              ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  StatusBadge.fromMachineStatus(machine.availability),
                ],
              ),
              if (machine.deviceType == 'washer_dryer') ...[
                const SizedBox(height: 10),
                const Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    StatusBadge(
                      label: 'Wash cycle',
                      icon: Icons.water_drop_outlined,
                      foreground: SpinSenseColors.ink,
                    ),
                    StatusBadge(
                      label: 'Dry cycle',
                      icon: Icons.air_outlined,
                      foreground: SpinSenseColors.ink,
                    ),
                  ],
                ),
              ],
              if (countdown != null) ...[
                const SizedBox(height: 10),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                  decoration: BoxDecoration(
                    color: SpinSenseColors.raised,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: SpinSenseColors.rule),
                  ),
                  child: Text(
                    countdown,
                    style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: SpinSenseColors.warning,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                ),
              ],
              if (machine.availability == PublicMachineAvailabilityStatus.unknown &&
                  machine.availabilityReasonLabel != null) ...[
                const SizedBox(height: 8),
                Text(
                  machine.availabilityReasonLabel!,
                  style: const TextStyle(
                    fontSize: 12,
                    color: SpinSenseColors.faint,
                  ),
                ),
              ],
              const SizedBox(height: 12),
              const Divider(),
              const SizedBox(height: 10),
              _MetadataGridRow(
                label: 'Starting price',
                value: priceText ?? 'Unavailable',
                isMuted: priceText == null,
              ),
              const SizedBox(height: 4),
              _MetadataGridRow(
                label: 'Source',
                value: machine.sourceDisplayLabel,
                isMuted: machine.isSimulated,
              ),
              const SizedBox(height: 4),
              _MetadataGridRow(
                label: 'Last reading',
                value: machine.isStaleOrMissing
                    ? '${_formatTimestamp(machine.observedAt)} (${machine.freshness})'
                    : _formatTimestamp(machine.observedAt),
                isMuted: machine.isStaleOrMissing,
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: onInspect,
                  child: const Text('Machine details'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MetadataGridRow extends StatelessWidget {
  const _MetadataGridRow({
    required this.label,
    required this.value,
    this.isMuted = false,
  });

  final String label;
  final String value;
  final bool isMuted;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(fontSize: 12, color: SpinSenseColors.faint),
        ),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.right,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: isMuted ? SpinSenseColors.muted : SpinSenseColors.ink,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ),
      ],
    );
  }
}
