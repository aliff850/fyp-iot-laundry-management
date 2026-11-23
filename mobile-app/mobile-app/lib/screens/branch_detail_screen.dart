import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/public_models.dart';
import '../services/location_service.dart';
import '../services/public_api_service.dart';
import '../theme/spinsense_theme.dart';
import '../widgets/branch_banner_image.dart';
import '../widgets/branch_images_gallery.dart';
import '../widgets/organization_logo_badge.dart';
import '../widgets/peak_demand_hours_card.dart';
import '../widgets/public_machine_card.dart';
import '../widgets/public_machine_sheet.dart';
import '../widgets/status_badge.dart';
import '../widgets/weekly_hours_card.dart';
import 'report_problem_screen.dart';

typedef UrlLaunchHandler = Future<bool> Function(Uri uri);

class BranchDetailScreen extends StatefulWidget {
  const BranchDetailScreen({
    super.key,
    required this.apiService,
    required this.branchId,
    this.initialSummary,
    this.distanceKm,
    this.launchExternalUrl,
  });

  final PublicApiService apiService;
  final String branchId;
  final PublicBranchSummary? initialSummary;
  final double? distanceKm;
  final UrlLaunchHandler? launchExternalUrl;

  @override
  State<BranchDetailScreen> createState() => _BranchDetailScreenState();
}

class _BranchDetailScreenState extends State<BranchDetailScreen> {
  PublicBranchAvailabilityResponse? _data;
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      final result = await widget.apiService.fetchBranchAvailability(widget.branchId);
      if (!mounted) return;
      setState(() {
        _data = result;
        _isLoading = false;
      });
    } on PublicApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _errorMessage = e.message;
      });
    }
  }

  Future<void> _launchUri(Uri uri, String failureText) async {
    final handler = widget.launchExternalUrl;
    var launched = false;
    try {
      if (handler != null) {
        launched = await handler(uri);
      } else {
        launched = await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (_) {
      launched = false;
    }

    if (!launched && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(failureText)),
      );
    }
  }

  Future<void> _openDirections(PublicBranchDetail branch) async {
    if (!branch.hasCoordinates) return;
    final lat = branch.latitude!;
    final lng = branch.longitude!;
    final label = Uri.encodeComponent(branch.name);
    final geoUri = Uri.parse('geo:$lat,$lng?q=$lat,$lng($label)');

    if (widget.launchExternalUrl != null) {
      await _launchUri(geoUri, 'No maps application available to open directions.');
      return;
    }

    final canGeo = await canLaunchUrl(geoUri);
    if (canGeo) {
      await _launchUri(geoUri, 'Could not open maps application.');
      return;
    }

    final webMapUri = Uri.parse(
      'https://www.openstreetmap.org/?mlat=$lat&mlon=$lng#map=17/$lat/$lng',
    );
    await _launchUri(webMapUri, 'Unable to open external directions.');
  }

  Future<void> _callBranch(String phone) async {
    final telUri = Uri(scheme: 'tel', path: phone.trim());
    await _launchUri(telUri, 'Unable to open phone dialer.');
  }

  void _openReportScreen(PublicBranchDetail branch, PublicMachine machine) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ReportProblemScreen(
          apiService: widget.apiService,
          branchId: branch.branchId,
          branchName: branch.name,
          organizationName: branch.organizationName,
          machineId: machine.machineId,
          machineLabel: machine.label,
        ),
      ),
    );
  }

  void _inspectMachine(PublicBranchDetail branch, PublicMachine machine) {
    showPublicMachineSheet(
      context: context,
      machine: machine,
      onReportProblem: () => _openReportScreen(branch, machine),
    );
  }

  @override
  Widget build(BuildContext context) {
    final titleText = _data?.branch.name ?? widget.initialSummary?.name ?? 'Branch';

    return Scaffold(
      appBar: AppBar(
        title: Text(titleText, overflow: TextOverflow.ellipsis),
        actions: [
          IconButton(
            onPressed: _load,
            tooltip: 'Refresh machine availability',
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: _buildBody(context),
      ),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_isLoading && _data == null) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(color: SpinSenseColors.accent),
            SizedBox(height: 14),
            Text(
              'Loading branch availability...',
              style: TextStyle(color: SpinSenseColors.muted),
            ),
          ],
        ),
      );
    }

    if (_errorMessage != null && _data == null) {
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
                    Icons.error_outline_rounded,
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
                    onPressed: _load,
                    child: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    final payload = _data!;
    final branch = payload.branch;
    final washers = payload.washers;
    final dryers = payload.dryers;
    final combined = payload.washerDryers;

    return RefreshIndicator(
      onRefresh: _load,
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
                        'Refresh failed: $_errorMessage Showing previously loaded status.',
                        style: const TextStyle(fontSize: 13),
                      ),
                    ),
                    TextButton(onPressed: _load, child: const Text('Retry')),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
          ],
          if (branch.isClosedByOperator) ...[
            Card(
              color: SpinSenseColors.raised,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8),
                side: const BorderSide(color: SpinSenseColors.negative),
              ),
              child: const Padding(
                padding: EdgeInsets.all(14),
                child: Row(
                  children: [
                    Icon(
                      Icons.block_outlined,
                      color: SpinSenseColors.negative,
                      size: 22,
                    ),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'Temporarily closed by operator. Machines are marked unavailable regardless of prior status.',
                        style: TextStyle(color: SpinSenseColors.ink, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
          ],
          _BranchIdentityCard(
            branch: branch,
            fallbackCoverImageUrl: widget.initialSummary?.coverImageUrl,
            distanceKm: widget.distanceKm,
            onBannerTap: branch.images.isNotEmpty
                ? () => showBranchImagesViewer(
                      context: context,
                      branchName: branch.name,
                      images: branch.images,
                    )
                : null,
            onDirections: branch.hasCoordinates ? () => _openDirections(branch) : null,
            onCall: branch.contactPhone != null
                ? () => _callBranch(branch.contactPhone!)
                : null,
          ),
          const SizedBox(height: 14),
          WeeklyHoursCard(
            hoursStatus: branch.hoursStatus,
            timezone: branch.timezone,
            openingHoursText: branch.openingHours,
            weeklyHours: branch.weeklyHours,
          ),
          const SizedBox(height: 14),
          PeakDemandHoursCard(
            peakHours: payload.peakHours,
          ),
          const SizedBox(height: 14),
          BranchImagesGallery(
            branchName: branch.name,
            images: branch.images,
          ),
          const SizedBox(height: 20),
          if (payload.machines.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: Text(
                  'No public machines are published at this branch yet.',
                  style: TextStyle(color: SpinSenseColors.muted),
                ),
              ),
            )
          else ...[
            if (washers.isNotEmpty) ...[
              _MachineCategorySection(
                title: 'Washers',
                availableCount: payload.summary.washersAvailable,
                totalCount: payload.summary.washersTotal,
                machines: washers,
                onInspect: (m) => _inspectMachine(branch, m),
              ),
              const SizedBox(height: 20),
            ],
            if (dryers.isNotEmpty) ...[
              _MachineCategorySection(
                title: 'Dryers',
                availableCount: payload.summary.dryersAvailable,
                totalCount: payload.summary.dryersTotal,
                machines: dryers,
                onInspect: (m) => _inspectMachine(branch, m),
              ),
              const SizedBox(height: 20),
            ],
            if (combined.isNotEmpty) ...[
              _MachineCategorySection(
                title: 'Washer/Dryers',
                availableCount: payload.summary.washerDryersAvailable,
                totalCount: payload.summary.washerDryersTotal,
                machines: combined,
                onInspect: (m) => _inspectMachine(branch, m),
              ),
              const SizedBox(height: 20),
            ],
          ],
        ],
      ),
    );
  }
}

class _BranchIdentityCard extends StatelessWidget {
  const _BranchIdentityCard({
    required this.branch,
    this.fallbackCoverImageUrl,
    this.distanceKm,
    this.onBannerTap,
    this.onDirections,
    this.onCall,
  });

  final PublicBranchDetail branch;
  final String? fallbackCoverImageUrl;
  final double? distanceKm;
  final VoidCallback? onBannerTap;
  final VoidCallback? onDirections;
  final VoidCallback? onCall;

  @override
  Widget build(BuildContext context) {
    final fullAddress = branch.fullAddressDisplay;
    final bannerUrl = branch.coverImage?.imageUrl ?? fallbackCoverImageUrl;

    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (bannerUrl != null && bannerUrl.trim().isNotEmpty)
            BranchBannerImage(
              imageUrl: bannerUrl,
              height: 176,
              semanticLabel: '${branch.name} header photo',
              onTap: onBannerTap,
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
                  size: 48,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        branch.name,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        branch.organizationName,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: SpinSenseColors.muted,
                            ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (fullAddress.isNotEmpty) ...[
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(
                    Icons.place_outlined,
                    size: 16,
                    color: SpinSenseColors.muted,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      fullAddress,
                      style: const TextStyle(
                        color: SpinSenseColors.muted,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ],
              ),
            ],
            if (distanceKm != null) ...[
              const SizedBox(height: 10),
              StatusBadge(
                label: '${formatDistanceKm(distanceKm!)} away',
                icon: Icons.near_me_outlined,
                foreground: SpinSenseColors.ink,
                background: SpinSenseColors.navy,
                border: SpinSenseColors.control,
              ),
            ],
            const SizedBox(height: 14),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                ElevatedButton.icon(
                  onPressed: onDirections,
                  icon: const Icon(Icons.directions_outlined, size: 18),
                  label: Text(
                    onDirections != null
                        ? 'Directions'
                        : 'Coordinates unavailable',
                  ),
                ),
                if (onCall != null)
                  OutlinedButton.icon(
                    onPressed: onCall,
                    icon: const Icon(Icons.call_outlined, size: 18),
                    label: Text(branch.contactPhone!),
                  ),
              ],
            ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _MachineCategorySection extends StatelessWidget {
  const _MachineCategorySection({
    required this.title,
    required this.availableCount,
    required this.totalCount,
    required this.machines,
    required this.onInspect,
  });

  final String title;
  final int availableCount;
  final int totalCount;
  final List<PublicMachine> machines;
  final ValueChanged<PublicMachine> onInspect;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: double.infinity,
          child: Wrap(
            spacing: 8,
            runSpacing: 4,
            alignment: WrapAlignment.spaceBetween,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.titleMedium,
              ),
              Text(
                '$availableCount of $totalCount available',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: availableCount > 0
                      ? SpinSenseColors.positive
                      : SpinSenseColors.muted,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        LayoutBuilder(
          builder: (context, constraints) {
            final cols = constraints.maxWidth >= 960
                ? 3
                : (constraints.maxWidth >= 600 ? 2 : 1);
            if (cols == 1) {
              return Column(
                children: [
                  for (var i = 0; i < machines.length; i++) ...[
                    if (i > 0) const SizedBox(height: 10),
                    PublicMachineCard(
                      machine: machines[i],
                      onInspect: () => onInspect(machines[i]),
                    ),
                  ],
                ],
              );
            }

            final itemWidth =
                (constraints.maxWidth - (12 * (cols - 1))) / cols;
            return Wrap(
              spacing: 12,
              runSpacing: 12,
              children: machines
                  .map(
                    (m) => SizedBox(
                      width: itemWidth,
                      child: PublicMachineCard(
                        machine: m,
                        onInspect: () => onInspect(m),
                      ),
                    ),
                  )
                  .toList(),
            );
          },
        ),
      ],
    );
  }
}
