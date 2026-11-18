import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import '../models/public_models.dart';
import '../services/location_service.dart';
import '../services/public_api_service.dart';
import '../theme/spinsense_theme.dart';
import '../widgets/branch_map_pane.dart';
import '../widgets/branch_summary_card.dart';
import '../widgets/discovery_filter_sheet.dart';
import 'branch_detail_screen.dart';

enum _MobilePane { list, map }

class DiscoveryScreen extends StatefulWidget {
  const DiscoveryScreen({
    super.key,
    this.apiService,
    this.locationService,
    this.tileProvider,
  });

  final PublicApiService? apiService;
  final LocationService? locationService;
  final TileProvider? tileProvider;

  @override
  State<DiscoveryScreen> createState() => _DiscoveryScreenState();
}

class _DiscoveryScreenState extends State<DiscoveryScreen> {
  late final PublicApiService _apiService;
  late final LocationService _locationService;
  final MapController _mapController = MapController();
  final TextEditingController _searchController = TextEditingController();

  List<PublicOrganization> _organizations = const [];
  List<PublicBranchSummary> _branches = const [];
  String? _nextCursor;
  String? _selectedBranchId;

  DiscoveryFilterState _filters = const DiscoveryFilterState();
  String _appliedQuery = '';
  _MobilePane _mobilePane = _MobilePane.list;

  bool _isLoading = true;
  bool _isLoadingMore = false;
  bool _isLocatingNearMe = false;
  String? _errorMessage;

  CustomerCoordinates? _customerCoords;
  Map<String, double> _distancesKm = const {};
  bool _nearMeSortActive = false;
  bool _nearMeAllPagesLoaded = false;
  LocationLookupResult? _locationBanner;

  @override
  void initState() {
    super.initState();
    _apiService = widget.apiService ?? PublicApiService();
    _locationService = widget.locationService ?? const GeolocatorLocationService();
    _loadInitial();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadInitial() async {
    await Future.wait([
      _loadOrganizations(),
      _loadBranches(reset: true),
    ]);
  }

  Future<void> _loadOrganizations() async {
    try {
      final orgs = await _apiService.fetchOrganizations();
      if (!mounted) return;
      setState(() => _organizations = orgs);
    } catch (_) {
      // Organizations filter falls back cleanly to "All companies" if list fails.
    }
  }

  Future<void> _loadBranches({required bool reset}) async {
    if (reset) {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      });
    } else {
      if (_isLoadingMore || _nextCursor == null) return;
      setState(() {
        _isLoadingMore = true;
        _errorMessage = null;
      });
    }

    try {
      final page = await _apiService.fetchBranches(
        q: _appliedQuery.isEmpty ? null : _appliedQuery,
        organizationId: _filters.organizationId,
        machineType: _filters.machineType,
        minCapacityKg: _filters.minCapacityKg,
        availableOnly: _filters.availableOnly,
        openNowOnly: _filters.openNowOnly,
        cursor: reset ? null : _nextCursor,
        limit: 20,
      );

      var finalBranches = reset
          ? page.branches
          : [..._branches, ...page.branches];
      var nextCursor = page.nextCursor;
      var nearComplete = _nearMeSortActive && nextCursor == null;

      if (_nearMeSortActive && _customerCoords != null) {
        if (reset && nextCursor != null) {
          final allPage = await _apiService.loadRemainingPagesForSort(
            currentPage: PublicBranchesPage(
              branches: finalBranches,
              nextCursor: nextCursor,
              asOf: page.asOf,
            ),
            q: _appliedQuery.isEmpty ? null : _appliedQuery,
            organizationId: _filters.organizationId,
            machineType: _filters.machineType,
            minCapacityKg: _filters.minCapacityKg,
            availableOnly: _filters.availableOnly,
            openNowOnly: _filters.openNowOnly,
          );
          finalBranches = allPage.branches;
          nextCursor = allPage.nextCursor;
          nearComplete = nextCursor == null;
        }
        final sorted = _sortByDistance(finalBranches, _customerCoords!);
        finalBranches = sorted.$1;
        if (mounted) {
          setState(() => _distancesKm = sorted.$2);
        }
      }

      if (!mounted) return;
      setState(() {
        _branches = finalBranches;
        _nextCursor = nextCursor;
        _nearMeAllPagesLoaded = nearComplete;
        _isLoading = false;
        _isLoadingMore = false;
      });
    } on PublicApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _isLoadingMore = false;
        _errorMessage = e.message;
      });
    }
  }

  (List<PublicBranchSummary>, Map<String, double>) _sortByDistance(
    List<PublicBranchSummary> source,
    CustomerCoordinates coords,
  ) {
    final distances = <String, double>{};
    final withCoords = <PublicBranchSummary>[];
    final withoutCoords = <PublicBranchSummary>[];

    for (final b in source) {
      if (b.hasCoordinates) {
        distances[b.branchId] = haversineDistanceKm(
          coords.latitude,
          coords.longitude,
          b.latitude!,
          b.longitude!,
        );
        withCoords.add(b);
      } else {
        withoutCoords.add(b);
      }
    }

    withCoords.sort(
      (a, b) => distances[a.branchId]!.compareTo(distances[b.branchId]!),
    );
    return ([...withCoords, ...withoutCoords], distances);
  }

  Future<void> _onTapNearMe() async {
    if (_isLocatingNearMe) return;

    setState(() {
      _isLocatingNearMe = true;
      _locationBanner = null;
    });

    final result = await _locationService.requestForegroundLocation();
    if (!mounted) return;

    if (!result.isGranted) {
      setState(() {
        _isLocatingNearMe = false;
        _locationBanner = result;
      });
      return;
    }

    final coords = result.coordinates!;
    setState(() {
      _customerCoords = coords;
      _nearMeSortActive = true;
      _nearMeAllPagesLoaded = false;
    });

    try {
      PublicBranchesPage resolvedPage = PublicBranchesPage(
        branches: _branches,
        nextCursor: _nextCursor,
      );
      if (_branches.isEmpty && _errorMessage != null) {
        resolvedPage = await _apiService.fetchBranches(
          q: _appliedQuery.isEmpty ? null : _appliedQuery,
          organizationId: _filters.organizationId,
          machineType: _filters.machineType,
          minCapacityKg: _filters.minCapacityKg,
          availableOnly: _filters.availableOnly,
          openNowOnly: _filters.openNowOnly,
          limit: 50,
        );
      }
      if (resolvedPage.hasMore) {
        resolvedPage = await _apiService.loadRemainingPagesForSort(
          currentPage: resolvedPage,
          q: _appliedQuery.isEmpty ? null : _appliedQuery,
          organizationId: _filters.organizationId,
          machineType: _filters.machineType,
          minCapacityKg: _filters.minCapacityKg,
          availableOnly: _filters.availableOnly,
          openNowOnly: _filters.openNowOnly,
        );
      }

      if (!mounted) return;
      final sorted = _sortByDistance(resolvedPage.branches, coords);
      setState(() {
        _branches = sorted.$1;
        _distancesKm = sorted.$2;
        _nextCursor = resolvedPage.nextCursor;
        _nearMeAllPagesLoaded = resolvedPage.nextCursor == null;
        _isLocatingNearMe = false;
        _errorMessage = null;
      });
    } on PublicApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _isLocatingNearMe = false;
        _errorMessage = e.message;
      });
    }
  }

  void _clearNearMeSort() {
    setState(() {
      _nearMeSortActive = false;
      _nearMeAllPagesLoaded = false;
      _distancesKm = const {};
      _customerCoords = null;
      _locationBanner = null;
    });
    _loadBranches(reset: true);
  }

  Future<void> _openFilterSheet() async {
    final result = await showDiscoveryFilterSheet(
      context: context,
      initialFilters: _filters,
      organizations: _organizations,
    );
    if (result == null || !mounted) return;
    setState(() => _filters = result);
    await _loadBranches(reset: true);
  }

  void _submitSearch(String value) {
    final next = value.trim();
    if (next == _appliedQuery) return;
    setState(() => _appliedQuery = next);
    _loadBranches(reset: true);
  }

  void _clearAllFilters() {
    _searchController.clear();
    setState(() {
      _appliedQuery = '';
      _filters = const DiscoveryFilterState();
    });
    _loadBranches(reset: true);
  }

  void _openBranchDetail(PublicBranchSummary branch) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => BranchDetailScreen(
          apiService: _apiService,
          branchId: branch.branchId,
          initialSummary: branch,
          distanceKm: _distancesKm[branch.branchId],
        ),
      ),
    );
  }

  void _focusBranchOnMap(PublicBranchSummary branch, {required bool isCompact}) {
    setState(() {
      _selectedBranchId = branch.branchId;
      if (isCompact) {
        _mobilePane = _MobilePane.map;
      }
    });
    if (branch.hasCoordinates) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        try {
          _mapController.move(LatLng(branch.latitude!, branch.longitude!), 15);
        } catch (_) {
          // MapController might not be attached yet before map builds on switch.
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: const Row(
          children: [
            Icon(
              Icons.local_laundry_service_outlined,
              color: SpinSenseColors.accent,
              size: 24,
            ),
            SizedBox(width: 10),
            Flexible(
              child: Text(
                'SpinSense',
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: _loadInitial,
            tooltip: 'Refresh branches',
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            final isSplitWide = constraints.maxWidth >= 760;

            return Column(
              children: [
                _SearchAndFilterBar(
                  controller: _searchController,
                  appliedQuery: _appliedQuery,
                  filters: _filters,
                  nearMeActive: _nearMeSortActive,
                  nearMeLocating: _isLocatingNearMe,
                  nearMeAllPagesLoaded: _nearMeAllPagesLoaded,
                  onSubmitSearch: _submitSearch,
                  onOpenFilters: _openFilterSheet,
                  onTapNearMe: _onTapNearMe,
                  onClearAll: _clearAllFilters,
                  onClearNearMe: _clearNearMeSort,
                  trailingToggle: isSplitWide
                      ? null
                      : SegmentedButton<_MobilePane>(
                          showSelectedIcon: false,
                          style: ButtonStyle(
                            minimumSize: const WidgetStatePropertyAll(Size(64, 48)),
                            backgroundColor: WidgetStateProperty.resolveWith((states) {
                              if (states.contains(WidgetState.selected)) {
                                return SpinSenseColors.navySelected;
                              }
                              return SpinSenseColors.surface;
                            }),
                          ),
                          segments: const [
                            ButtonSegment<_MobilePane>(
                              value: _MobilePane.list,
                              icon: Icon(Icons.list_alt_rounded, size: 18),
                              label: Text('List'),
                            ),
                            ButtonSegment<_MobilePane>(
                              value: _MobilePane.map,
                              icon: Icon(Icons.map_outlined, size: 18),
                              label: Text('Map'),
                            ),
                          ],
                          selected: {_mobilePane},
                          onSelectionChanged: (sel) {
                            setState(() => _mobilePane = sel.first);
                          },
                        ),
                ),
                if (_locationBanner != null && !_locationBanner!.isGranted)
                  _LocationNoticeBanner(
                    result: _locationBanner!,
                    onDismiss: () => setState(() => _locationBanner = null),
                    onOpenSettings: () async {
                      if (_locationBanner!.outcome == LocationOutcome.serviceDisabled) {
                        await _locationService.openLocationSettings();
                      } else {
                        await _locationService.openAppSettings();
                      }
                    },
                  ),
                Expanded(
                  child: isSplitWide
                      ? Row(
                          children: [
                            Expanded(
                              flex: 5,
                              child: _buildListPane(isCompact: false),
                            ),
                            const VerticalDivider(width: 1),
                            Expanded(
                              flex: 6,
                              child: BranchMapPane(
                                branches: _branches,
                                selectedBranchId: _selectedBranchId,
                                customerCoordinates: _customerCoords,
                                mapController: _mapController,
                                tileProvider: widget.tileProvider,
                                hasActiveFilters:
                                    _appliedQuery.isNotEmpty || _filters.hasActiveFilters,
                                onClearFilters: _clearAllFilters,
                                onSelectBranch: (b) =>
                                    setState(() => _selectedBranchId = b.branchId),
                                onOpenBranch: _openBranchDetail,
                              ),
                            ),
                          ],
                        )
                      : (_mobilePane == _MobilePane.list
                          ? _buildListPane(isCompact: true)
                          : BranchMapPane(
                              branches: _branches,
                              selectedBranchId: _selectedBranchId,
                              customerCoordinates: _customerCoords,
                              mapController: _mapController,
                              tileProvider: widget.tileProvider,
                              hasActiveFilters:
                                  _appliedQuery.isNotEmpty || _filters.hasActiveFilters,
                              onClearFilters: _clearAllFilters,
                              onSelectBranch: (b) =>
                                  setState(() => _selectedBranchId = b.branchId),
                              onOpenBranch: _openBranchDetail,
                              onSwitchToList: () =>
                                  setState(() => _mobilePane = _MobilePane.list),
                            )),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildListPane({required bool isCompact}) {
    if (_isLoading && _branches.isEmpty) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: SpinSenseColors.accent),
            SizedBox(height: 12),
            Text(
              'Loading published laundromats...',
              style: TextStyle(color: SpinSenseColors.muted),
            ),
          ],
        ),
      );
    }

    if (_errorMessage != null && _branches.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.cloud_off_outlined,
                    color: SpinSenseColors.negative,
                    size: 32,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _errorMessage!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: SpinSenseColors.ink),
                  ),
                  const SizedBox(height: 16),
                  ElevatedButton(
                    onPressed: () => _loadBranches(reset: true),
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    if (_branches.isEmpty) {
      final hasFilters = _appliedQuery.isNotEmpty || _filters.hasActiveFilters;
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.store_mall_directory_outlined,
                    color: SpinSenseColors.muted,
                    size: 32,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    hasFilters
                        ? 'No branches match the current search or filters.'
                        : 'No laundromat branches are published right now.',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: SpinSenseColors.ink),
                  ),
                  if (hasFilters) ...[
                    const SizedBox(height: 14),
                    OutlinedButton(
                      onPressed: _clearAllFilters,
                      child: const Text('Clear filters'),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      );
    }

    final nearestCandidateId = _nearMeSortActive && _nearMeAllPagesLoaded
        ? _branches
            .where((b) => _distancesKm.containsKey(b.branchId))
            .map((b) => b.branchId)
            .firstOrNull
        : null;

    return RefreshIndicator(
      onRefresh: () => _loadBranches(reset: true),
      color: SpinSenseColors.accent,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_errorMessage != null) ...[
            Card(
              color: SpinSenseColors.raised,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
                side: const BorderSide(color: SpinSenseColors.negative),
              ),
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    const Icon(
                      Icons.warning_amber_rounded,
                      color: SpinSenseColors.negative,
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        '${_errorMessage!} Showing previously loaded branches.',
                        style: const TextStyle(fontSize: 13),
                      ),
                    ),
                    TextButton(
                      onPressed: () => _loadBranches(reset: true),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
          for (var i = 0; i < _branches.length; i++) ...[
            if (i > 0) const SizedBox(height: 12),
            BranchSummaryCard(
              branch: _branches[i],
              selected: _branches[i].branchId == _selectedBranchId,
              distanceKm: _distancesKm[_branches[i].branchId],
              isNearest: _branches[i].branchId == nearestCandidateId,
              onOpenDetail: () => _openBranchDetail(_branches[i]),
              onLocateOnMap: _branches[i].hasCoordinates
                  ? () => _focusBranchOnMap(_branches[i], isCompact: isCompact)
                  : null,
            ),
          ],
          const SizedBox(height: 16),
          Text(
            _nextCursor != null
                ? 'Showing ${_branches.length} branches • More branches available'
                : 'Showing ${_branches.length} branch${_branches.length == 1 ? '' : 'es'}',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: SpinSenseColors.faint,
              fontSize: 12,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
          if (_nextCursor != null) ...[
            const SizedBox(height: 10),
            OutlinedButton(
              onPressed: _isLoadingMore ? null : () => _loadBranches(reset: false),
              child: Text(_isLoadingMore ? 'Loading more...' : 'Load more branches'),
            ),
          ],
        ],
      ),
    );
  }
}

class _SearchAndFilterBar extends StatelessWidget {
  const _SearchAndFilterBar({
    required this.controller,
    required this.appliedQuery,
    required this.filters,
    required this.nearMeActive,
    required this.nearMeLocating,
    required this.nearMeAllPagesLoaded,
    required this.onSubmitSearch,
    required this.onOpenFilters,
    required this.onTapNearMe,
    required this.onClearAll,
    required this.onClearNearMe,
    this.trailingToggle,
  });

  final TextEditingController controller;
  final String appliedQuery;
  final DiscoveryFilterState filters;
  final bool nearMeActive;
  final bool nearMeLocating;
  final bool nearMeAllPagesLoaded;
  final ValueChanged<String> onSubmitSearch;
  final VoidCallback onOpenFilters;
  final VoidCallback onTapNearMe;
  final VoidCallback onClearAll;
  final VoidCallback onClearNearMe;
  final Widget? trailingToggle;

  @override
  Widget build(BuildContext context) {
    final activeCount = filters.activeFilterCount;
    final hasAnyResettable = appliedQuery.isNotEmpty || filters.hasActiveFilters;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: const BoxDecoration(
        color: SpinSenseColors.surface,
        border: Border(bottom: BorderSide(color: SpinSenseColors.line)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: controller,
            textInputAction: TextInputAction.search,
            onSubmitted: onSubmitSearch,
            decoration: InputDecoration(
              hintText: 'Search company, branch, or city',
              prefixIcon: const Icon(Icons.search_rounded, size: 20),
              suffixIcon: controller.text.isNotEmpty || appliedQuery.isNotEmpty
                  ? IconButton(
                      onPressed: () {
                        controller.clear();
                        onSubmitSearch('');
                      },
                      tooltip: 'Clear search text',
                      icon: const Icon(Icons.close_rounded, size: 18),
                    )
                  : null,
            ),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              ?trailingToggle,
              OutlinedButton.icon(
                onPressed: onOpenFilters,
                icon: const Icon(Icons.tune_rounded, size: 18),
                label: Text(activeCount > 0 ? 'Filters ($activeCount)' : 'Filters'),
              ),
              OutlinedButton.icon(
                onPressed: nearMeLocating
                    ? null
                    : (nearMeActive ? onClearNearMe : onTapNearMe),
                icon: nearMeLocating
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: SpinSenseColors.accent,
                        ),
                      )
                    : Icon(
                        nearMeActive
                            ? Icons.close_rounded
                            : Icons.near_me_outlined,
                        size: 18,
                        color: nearMeActive
                            ? SpinSenseColors.positive
                            : SpinSenseColors.ink,
                      ),
                label: Text(
                  nearMeActive
                      ? (nearMeAllPagesLoaded
                          ? 'Nearest sort'
                          : 'Nearest (partial)')
                      : 'Near me',
                ),
              ),
              if (hasAnyResettable)
                TextButton.icon(
                  onPressed: onClearAll,
                  icon: const Icon(Icons.filter_alt_off_outlined, size: 16),
                  label: const Text('Clear filters'),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _LocationNoticeBanner extends StatelessWidget {
  const _LocationNoticeBanner({
    required this.result,
    required this.onDismiss,
    required this.onOpenSettings,
  });

  final LocationLookupResult result;
  final VoidCallback onDismiss;
  final VoidCallback onOpenSettings;

  @override
  Widget build(BuildContext context) {
    final canOpenSettings =
        result.outcome == LocationOutcome.deniedForever ||
        result.outcome == LocationOutcome.serviceDisabled;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: const BoxDecoration(
        color: SpinSenseColors.raised,
        border: Border(
          bottom: BorderSide(color: SpinSenseColors.warning),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          const Icon(
            Icons.location_disabled_outlined,
            color: SpinSenseColors.warning,
            size: 18,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              result.message ?? 'Location unavailable.',
              style: const TextStyle(fontSize: 12, color: SpinSenseColors.ink),
            ),
          ),
          if (canOpenSettings)
            TextButton(
              onPressed: onOpenSettings,
              child: const Text('Settings'),
            ),
          IconButton(
            onPressed: onDismiss,
            tooltip: 'Dismiss location notice',
            icon: const Icon(Icons.close_rounded, size: 18),
          ),
        ],
      ),
    );
  }
}
