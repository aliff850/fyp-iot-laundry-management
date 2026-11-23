import 'package:flutter/material.dart';
import '../models/public_models.dart';
import '../services/location_service.dart';
import '../theme/spinsense_theme.dart';
import 'branch_banner_image.dart';
import 'organization_logo_badge.dart';
import 'status_badge.dart';

class BranchSummaryCard extends StatelessWidget {
  const BranchSummaryCard({
    super.key,
    required this.branch,
    required this.onOpenDetail,
    this.onLocateOnMap,
    this.selected = false,
    this.distanceKm,
    this.isNearest = false,
  });

  final PublicBranchSummary branch;
  final VoidCallback onOpenDetail;
  final VoidCallback? onLocateOnMap;
  final bool selected;
  final double? distanceKm;
  final bool isNearest;

  @override
  Widget build(BuildContext context) {
    final counts = branch.availability;
    final cityLabel = branch.cityRegionLabel;

    return Card(
      clipBehavior: Clip.antiAlias,
      color: selected ? SpinSenseColors.navySelected : SpinSenseColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(
          color: selected ? SpinSenseColors.accent : SpinSenseColors.line,
          width: selected ? 1.5 : 1,
        ),
      ),
      child: InkWell(
        onTap: onOpenDetail,
        borderRadius: BorderRadius.circular(8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (branch.hasCoverImage)
              BranchBannerImage(
                imageUrl: branch.coverImageUrl!,
                height: 136,
                semanticLabel: '${branch.name} photo',
              ),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  OrganizationLogoBadge(
                    organizationName: branch.organizationName,
                    logoUrl: branch.organizationLogoUrl,
                    size: 44,
                    highlighted: selected,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          branch.name,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 2),
                        Text(
                          branch.organizationName,
                          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                color: SpinSenseColors.muted,
                              ),
                        ),
                        if (cityLabel.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(
                            cityLabel,
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                  color: SpinSenseColors.faint,
                                ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  if (onLocateOnMap != null && branch.hasCoordinates)
                    IconButton(
                      onPressed: onLocateOnMap,
                      tooltip: 'Focus marker on map',
                      icon: const Icon(Icons.my_location_outlined, size: 20),
                    ),
                ],
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  StatusBadge.fromHoursStatus(branch.hoursStatus),
                  if (distanceKm != null)
                    StatusBadge(
                      label: isNearest
                          ? 'Nearest (${formatDistanceKm(distanceKm!)})'
                          : formatDistanceKm(distanceKm!),
                      icon: Icons.near_me_outlined,
                      foreground: isNearest
                          ? SpinSenseColors.positive
                          : SpinSenseColors.ink,
                      background: SpinSenseColors.navy,
                      border: SpinSenseColors.control,
                    )
                  else if (!branch.hasCoordinates)
                    const StatusBadge(
                      label: 'No map pin',
                      icon: Icons.location_off_outlined,
                      foreground: SpinSenseColors.faint,
                    ),
                ],
              ),
              const SizedBox(height: 14),
              const Divider(),
              const SizedBox(height: 12),
              LayoutBuilder(
                builder: (context, constraints) {
                  final wide = constraints.maxWidth >= 340;
                  final tiles = [
                    _AvailabilityTile(
                      label: 'Washers',
                      available: counts.washersAvailable,
                      total: counts.washersTotal,
                    ),
                    _AvailabilityTile(
                      label: 'Dryers',
                      available: counts.dryersAvailable,
                      total: counts.dryersTotal,
                    ),
                    if (counts.washerDryersTotal > 0)
                      _AvailabilityTile(
                        label: 'Washer/Dryers',
                        available: counts.washerDryersAvailable,
                        total: counts.washerDryersTotal,
                      ),
                  ];

                  if (!wide) {
                    return Column(
                      children: tiles
                          .map(
                            (t) => Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: t,
                            ),
                          )
                          .toList(),
                    );
                  }

                  return Row(
                    children: [
                      for (var i = 0; i < tiles.length; i++) ...[
                        if (i > 0) const SizedBox(width: 8),
                        Expanded(child: tiles[i]),
                      ],
                    ],
                  );
                },
              ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AvailabilityTile extends StatelessWidget {
  const _AvailabilityTile({
    required this.label,
    required this.available,
    required this.total,
  });

  final String label;
  final int available;
  final int total;

  @override
  Widget build(BuildContext context) {
    final valueColor =
        available > 0 ? SpinSenseColors.positive : SpinSenseColors.muted;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: SpinSenseColors.raised,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: SpinSenseColors.rule),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Flexible(
            child: Text(
              label,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                fontSize: 12,
                color: SpinSenseColors.muted,
              ),
            ),
          ),
          const SizedBox(width: 6),
          Text(
            '$available/$total',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: valueColor,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
