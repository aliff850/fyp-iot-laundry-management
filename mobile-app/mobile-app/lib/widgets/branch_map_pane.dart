import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config/app_config.dart';
import '../models/public_models.dart';
import '../services/location_service.dart';
import '../theme/spinsense_theme.dart';
import 'branch_banner_image.dart';
import 'organization_logo_badge.dart';
import 'status_badge.dart';

class BranchMapPane extends StatefulWidget {
  const BranchMapPane({
    super.key,
    required this.branches,
    required this.onSelectBranch,
    required this.onOpenBranch,
    this.selectedBranchId,
    this.customerCoordinates,
    this.mapController,
    this.tileProvider,
    this.onSwitchToList,
    this.hasActiveFilters = false,
    this.onClearFilters,
  });

  final List<PublicBranchSummary> branches;
  final String? selectedBranchId;
  final CustomerCoordinates? customerCoordinates;
  final MapController? mapController;
  final TileProvider? tileProvider;
  final ValueChanged<PublicBranchSummary> onSelectBranch;
  final ValueChanged<PublicBranchSummary> onOpenBranch;
  final VoidCallback? onSwitchToList;
  final bool hasActiveFilters;
  final VoidCallback? onClearFilters;

  @override
  State<BranchMapPane> createState() => _BranchMapPaneState();
}

class _BranchMapPaneState extends State<BranchMapPane> {
  static const LatLng _defaultCenter = LatLng(3.1390, 101.6869); // Klang Valley fallback
  late final MapController _controller;
  bool _tileLoadFailed = false;
  bool _hasFittedOnce = false;

  @override
  void initState() {
    super.initState();
    _controller = widget.mapController ?? MapController();
  }

  List<PublicBranchSummary> get _mappableBranches =>
      widget.branches.where((b) => b.hasCoordinates).toList();

  PublicBranchSummary? get _selectedBranch {
    if (widget.selectedBranchId == null) return null;
    for (final branch in _mappableBranches) {
      if (branch.branchId == widget.selectedBranchId) {
        return branch;
      }
    }
    return null;
  }

  void _fitAllPins() {
    final points = _mappableBranches
        .map((b) => LatLng(b.latitude!, b.longitude!))
        .toList();
    if (widget.customerCoordinates != null) {
      points.add(
        LatLng(
          widget.customerCoordinates!.latitude,
          widget.customerCoordinates!.longitude,
        ),
      );
    }
    if (points.isEmpty) return;

    if (points.length == 1) {
      _controller.move(points.first, 14);
      return;
    }

    _controller.fitCamera(
      CameraFit.coordinates(
        coordinates: points,
        padding: const EdgeInsets.fromLTRB(48, 64, 48, 120),
        maxZoom: 15,
      ),
    );
  }

  void _markTileError() {
    if (_tileLoadFailed || !mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !_tileLoadFailed) {
        setState(() => _tileLoadFailed = true);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final mappable = _mappableBranches;
    final selected = _selectedBranch;
    final initialCenter = mappable.isNotEmpty
        ? LatLng(mappable.first.latitude!, mappable.first.longitude!)
        : _defaultCenter;

    final markers = <Marker>[
      if (widget.customerCoordinates != null)
        Marker(
          point: LatLng(
            widget.customerCoordinates!.latitude,
            widget.customerCoordinates!.longitude,
          ),
          width: 24,
          height: 24,
          child: Semantics(
            label: 'Your current location',
            child: Container(
              decoration: BoxDecoration(
                color: SpinSenseColors.positive,
                shape: BoxShape.circle,
                border: Border.all(color: SpinSenseColors.surface, width: 3),
              ),
            ),
          ),
        ),
      ...mappable.map((branch) {
        final isSelected = branch.branchId == widget.selectedBranchId;
        return Marker(
          point: LatLng(branch.latitude!, branch.longitude!),
          width: 48,
          height: 48,
          child: Semantics(
            button: true,
            label: '${branch.organizationName} ${branch.name} marker',
            child: InkWell(
              onTap: () => widget.onSelectBranch(branch),
              borderRadius: BorderRadius.circular(10),
              child: Center(
                child: OrganizationLogoBadge(
                  organizationName: branch.organizationName,
                  logoUrl: branch.organizationLogoUrl,
                  size: isSelected ? 42 : 36,
                  highlighted: isSelected,
                ),
              ),
            ),
          ),
        );
      }),
    ];

    return Container(
      color: SpinSenseColors.surface,
      child: Stack(
        children: [
          FlutterMap(
            mapController: _controller,
            options: MapOptions(
              initialCenter: initialCenter,
              initialZoom: mappable.length == 1 ? 14 : 11,
              interactionOptions: const InteractionOptions(
                flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
              ),
              onMapReady: () {
                if (!_hasFittedOnce && mappable.isNotEmpty) {
                  _hasFittedOnce = true;
                  _fitAllPins();
                }
              },
            ),
            children: [
              TileLayer(
                urlTemplate: AppConfig.osmTileUrlTemplate,
                userAgentPackageName: AppConfig.osmTileUserAgentPackageName,
                tileProvider: widget.tileProvider,
                errorTileCallback: (_, _, _) => _markTileError(),
              ),
              MarkerLayer(markers: markers),
            ],
          ),
          Positioned(
            left: 8,
            right: 8,
            bottom: 8,
            child: SafeArea(
              top: false,
              child: Align(
                alignment: Alignment.bottomRight,
                child: Material(
                  color: SpinSenseColors.surface.withValues(alpha: 0.92),
                  borderRadius: BorderRadius.circular(4),
                  child: InkWell(
                    onTap: () {
                      launchUrl(
                        Uri.parse('https://www.openstreetmap.org/copyright'),
                        mode: LaunchMode.externalApplication,
                      );
                    },
                    borderRadius: BorderRadius.circular(4),
                    child: const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      child: Text(
                        '© OpenStreetMap contributors',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11,
                          color: SpinSenseColors.muted,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          if (mappable.isNotEmpty)
            Positioned(
              top: 12,
              right: 12,
              child: SafeArea(
                bottom: false,
                child: Tooltip(
                  message: 'Fit all branches on map',
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: SpinSenseColors.navy,
                      foregroundColor: SpinSenseColors.ink,
                      side: const BorderSide(color: SpinSenseColors.control),
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                    ),
                    onPressed: _fitAllPins,
                    icon: const Icon(Icons.fit_screen_outlined, size: 18),
                    label: const Text('Fit pins'),
                  ),
                ),
              ),
            ),
          if (_tileLoadFailed)
            Positioned(
              top: 12,
              left: 12,
              right: mappable.isNotEmpty ? 124 : 12,
              child: SafeArea(
                bottom: false,
                child: Card(
                  color: SpinSenseColors.raised,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                    side: const BorderSide(color: SpinSenseColors.warning),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Map tiles failed to load. You can still browse all branches from the list.',
                          style: TextStyle(
                            color: SpinSenseColors.ink,
                            fontSize: 12,
                          ),
                        ),
                        if (widget.onSwitchToList != null) ...[
                          const SizedBox(height: 8),
                          OutlinedButton(
                            onPressed: widget.onSwitchToList,
                            child: const Text('View list'),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ),
          if (widget.branches.isEmpty)
            Positioned(
              top: 12,
              left: 12,
              right: 12,
              child: SafeArea(
                bottom: false,
                child: Card(
                  color: SpinSenseColors.raised,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.store_mall_directory_outlined,
                          size: 18,
                          color: SpinSenseColors.muted,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            widget.hasActiveFilters
                                ? 'No branches match the current search or filters.'
                                : 'No laundromat branches are published right now.',
                            style: const TextStyle(
                              color: SpinSenseColors.ink,
                              fontSize: 12,
                            ),
                          ),
                        ),
                        if (widget.hasActiveFilters && widget.onClearFilters != null)
                          TextButton(
                            onPressed: widget.onClearFilters,
                            child: const Text('Clear filters'),
                          )
                        else if (widget.onSwitchToList != null)
                          TextButton(
                            onPressed: widget.onSwitchToList,
                            child: const Text('View list'),
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            )
          else if (mappable.isEmpty)
            Positioned(
              top: 12,
              left: 12,
              right: 12,
              child: SafeArea(
                bottom: false,
                child: Card(
                  color: SpinSenseColors.raised,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        const Icon(
                          Icons.location_off_outlined,
                          size: 18,
                          color: SpinSenseColors.muted,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'None of the ${widget.branches.length} loaded branches have map coordinates yet.',
                            style: const TextStyle(
                              color: SpinSenseColors.muted,
                              fontSize: 12,
                            ),
                          ),
                        ),
                        if (widget.onSwitchToList != null) ...[
                          const SizedBox(width: 8),
                          TextButton(
                            onPressed: widget.onSwitchToList,
                            child: const Text('List'),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ),
          if (selected != null)
            Positioned(
              left: 12,
              right: 12,
              bottom: 36,
              child: SafeArea(
                top: false,
                child: Card(
                  clipBehavior: Clip.antiAlias,
                  color: SpinSenseColors.surface,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8),
                    side: const BorderSide(color: SpinSenseColors.accent, width: 1.5),
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (selected.hasCoverImage)
                        BranchBannerImage(
                          imageUrl: selected.coverImageUrl!,
                          height: 96,
                          semanticLabel: '${selected.name} photo',
                        ),
                      Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                OrganizationLogoBadge(
                                  organizationName: selected.organizationName,
                                  logoUrl: selected.organizationLogoUrl,
                                  size: 36,
                                  highlighted: true,
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        selected.name,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: Theme.of(context).textTheme.titleMedium,
                                      ),
                                      Text(
                                        selected.organizationName,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: Theme.of(context).textTheme.bodySmall,
                                      ),
                                    ],
                                  ),
                                ),
                                const SizedBox(width: 8),
                                ElevatedButton(
                                  onPressed: () => widget.onOpenBranch(selected),
                                  child: const Text('View branch'),
                                ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Wrap(
                              spacing: 8,
                              runSpacing: 6,
                              children: [
                                StatusBadge.fromHoursStatus(selected.hoursStatus),
                                StatusBadge(
                                  label:
                                      '${selected.availability.totalAvailable}/${selected.availability.totalMachines} free',
                                  icon: Icons.local_laundry_service_outlined,
                                  foreground: selected.availability.totalAvailable > 0
                                      ? SpinSenseColors.positive
                                      : SpinSenseColors.muted,
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
