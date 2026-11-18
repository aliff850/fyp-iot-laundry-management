import 'package:flutter/material.dart';
import '../models/public_models.dart';
import '../theme/spinsense_theme.dart';
import 'status_badge.dart';

Future<void> showPublicMachineSheet({
  required BuildContext context,
  required PublicMachine machine,
  required VoidCallback onReportProblem,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (ctx) => PublicMachineSheetBody(
      machine: machine,
      onReportProblem: () {
        Navigator.of(ctx).pop();
        onReportProblem();
      },
    ),
  );
}

class PublicMachineSheetBody extends StatelessWidget {
  const PublicMachineSheetBody({
    super.key,
    required this.machine,
    required this.onReportProblem,
  });

  final PublicMachine machine;
  final VoidCallback onReportProblem;

  String get _deviceCategoryLabel {
    switch (machine.deviceType) {
      case 'dryer':
        return 'Dryer';
      case 'washer_dryer':
        return 'Combined Washer/Dryer';
      default:
        return 'Washer';
    }
  }

  String _formatDateTime(DateTime? dt) {
    if (dt == null) return 'No valid observation recorded';
    final local = dt.toLocal();
    final y = local.year.toString().padLeft(4, '0');
    final m = local.month.toString().padLeft(2, '0');
    final d = local.day.toString().padLeft(2, '0');
    final hh = local.hour.toString().padLeft(2, '0');
    final mm = local.minute.toString().padLeft(2, '0');
    return '$y-$m-$d $hh:$mm';
  }

  @override
  Widget build(BuildContext context) {
    final countdown = machine.formattedCountdownEstimate;
    final reasonLabel = machine.availabilityReasonLabel;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
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
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _deviceCategoryLabel,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: SpinSenseColors.muted,
                          ),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () => Navigator.of(context).pop(),
                tooltip: 'Close machine details',
                icon: const Icon(Icons.close_rounded),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              StatusBadge.fromMachineStatus(machine.availability),
              if (machine.deviceType == 'washer_dryer')
                const StatusBadge(
                  label: 'Single combined unit (Wash + Dry)',
                  icon: Icons.sync_alt_rounded,
                  foreground: SpinSenseColors.ink,
                ),
              StatusBadge(
                label: machine.sourceDisplayLabel,
                icon: machine.isSimulated
                    ? Icons.science_outlined
                    : Icons.sensors_outlined,
                foreground: machine.isSimulated
                    ? SpinSenseColors.warning
                    : SpinSenseColors.muted,
              ),
            ],
          ),
          if (countdown != null) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: SpinSenseColors.raised,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: SpinSenseColors.warning),
              ),
              child: Text(
                countdown,
                style: const TextStyle(
                  color: SpinSenseColors.ink,
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
          if (reasonLabel != null) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: SpinSenseColors.raised,
                borderRadius: BorderRadius.circular(8),
                border: const Border.fromBorderSide(
                  BorderSide(color: SpinSenseColors.control),
                ),
              ),
              child: Text(
                reasonLabel,
                style: const TextStyle(color: SpinSenseColors.muted, fontSize: 13),
              ),
            ),
          ],
          const SizedBox(height: 16),
          const Divider(),
          const SizedBox(height: 12),
          _DetailRow(
            label: 'Capacity',
            value: machine.capacityKg != null
                ? '${machine.capacityKg!.toStringAsFixed(machine.capacityKg! % 1 == 0 ? 0 : 1)} kg'
                : 'Unspecified',
          ),
          const SizedBox(height: 8),
          _DetailRow(
            label: 'Price',
            value: machine.formattedHeadlinePrice ?? 'Price unavailable',
          ),
          const SizedBox(height: 8),
          _DetailRow(
            label: 'Freshness',
            value: machine.freshness,
          ),
          const SizedBox(height: 8),
          _DetailRow(
            label: 'Last update',
            value: _formatDateTime(machine.observedAt),
          ),
          if (machine.programs.isNotEmpty) ...[
            const SizedBox(height: 16),
            Text(
              'Configured programs',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Container(
              decoration: BoxDecoration(
                color: SpinSenseColors.raised,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: SpinSenseColors.rule),
              ),
              child: Column(
                children: [
                  for (var i = 0; i < machine.programs.length; i++) ...[
                    if (i > 0) const Divider(),
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              machine.programs[i].name,
                              style: const TextStyle(
                                color: SpinSenseColors.ink,
                                fontSize: 13,
                              ),
                            ),
                          ),
                          if (machine.programs[i].durationSeconds != null) ...[
                            Text(
                              '${(machine.programs[i].durationSeconds! / 60).round()} min',
                              style: const TextStyle(
                                color: SpinSenseColors.muted,
                                fontSize: 12,
                                fontFeatures: [FontFeature.tabularFigures()],
                              ),
                            ),
                            const SizedBox(width: 12),
                          ],
                          Text(
                            machine.programs[i].priceMyr != null
                                ? '${machine.priceCurrency ?? 'MYR'} ${machine.programs[i].priceMyr!.toStringAsFixed(2)}'
                                : '—',
                            style: const TextStyle(
                              color: SpinSenseColors.ink,
                              fontWeight: FontWeight.w600,
                              fontSize: 13,
                              fontFeatures: [FontFeature.tabularFigures()],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          Text(
            'Availability and rates are informational only. Pay directly at the machine.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: SpinSenseColors.faint,
                ),
          ),
          const SizedBox(height: 18),
          OutlinedButton.icon(
            onPressed: onReportProblem,
            icon: const Icon(Icons.flag_outlined, size: 18),
            label: const Text('Report problem'),
          ),
        ],
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: const TextStyle(color: SpinSenseColors.muted, fontSize: 13),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.right,
            style: const TextStyle(
              color: SpinSenseColors.ink,
              fontSize: 13,
              fontWeight: FontWeight.w600,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ),
      ],
    );
  }
}
