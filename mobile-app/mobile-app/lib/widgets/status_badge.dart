import 'package:flutter/material.dart';
import '../models/public_models.dart';
import '../theme/spinsense_theme.dart';

class StatusBadge extends StatelessWidget {
  const StatusBadge({
    super.key,
    required this.label,
    required this.icon,
    required this.foreground,
    this.background = SpinSenseColors.raised,
    this.border = SpinSenseColors.line,
  });

  final String label;
  final IconData icon;
  final Color foreground;
  final Color background;
  final Color border;

  factory StatusBadge.fromMachineStatus(PublicMachineAvailabilityStatus status) {
    switch (status) {
      case PublicMachineAvailabilityStatus.available:
        return StatusBadge(
          label: status.displayLabel,
          icon: Icons.check_circle_outline_rounded,
          foreground: SpinSenseColors.positive,
        );
      case PublicMachineAvailabilityStatus.inUse:
        return StatusBadge(
          label: status.displayLabel,
          icon: Icons.schedule_rounded,
          foreground: SpinSenseColors.warning,
        );
      case PublicMachineAvailabilityStatus.outOfService:
        return StatusBadge(
          label: status.displayLabel,
          icon: Icons.error_outline_rounded,
          foreground: SpinSenseColors.negative,
        );
      case PublicMachineAvailabilityStatus.maintenance:
        return StatusBadge(
          label: status.displayLabel,
          icon: Icons.build_outlined,
          foreground: SpinSenseColors.warning,
        );
      case PublicMachineAvailabilityStatus.unknown:
        return StatusBadge(
          label: status.displayLabel,
          icon: Icons.cloud_off_outlined,
          foreground: SpinSenseColors.muted,
        );
    }
  }

  factory StatusBadge.fromHoursStatus(HoursStatus hoursStatus) {
    switch (hoursStatus) {
      case HoursStatus.openRegularHours:
        return StatusBadge(
          label: hoursStatus.displayLabel,
          icon: Icons.door_front_door_outlined,
          foreground: SpinSenseColors.positive,
        );
      case HoursStatus.closedRegularHours:
        return StatusBadge(
          label: hoursStatus.displayLabel,
          icon: Icons.nights_stay_outlined,
          foreground: SpinSenseColors.muted,
        );
      case HoursStatus.closedByOperator:
        return StatusBadge(
          label: hoursStatus.displayLabel,
          icon: Icons.block_outlined,
          foreground: SpinSenseColors.negative,
        );
      case HoursStatus.hoursUnknown:
        return StatusBadge(
          label: hoursStatus.displayLabel,
          icon: Icons.schedule_outlined,
          foreground: SpinSenseColors.muted,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: border),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: foreground),
          const SizedBox(width: 5),
          Flexible(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: foreground,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
