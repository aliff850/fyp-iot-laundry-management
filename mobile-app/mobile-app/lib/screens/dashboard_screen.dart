import 'dart:async';
import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/lpg_safety_banner.dart';
import '../widgets/machine_card.dart';
import '../widgets/parameter_modal.dart';

class DashboardScreen extends StatefulWidget {
  final String initialBranchId;

  const DashboardScreen({
    super.key,
    this.initialBranchId = 'msu-shah-alam',
  });

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  final ApiService _apiService = ApiService();
  late String _currentBranchId;

  List<Branch> _branches = [];
  List<Machine> _machines = [];
  SensorData? _sensorData;
  TelemetrySummary? _summary;

  bool _isLoading = true;
  String _filterType = 'all'; // 'all', 'washer', 'dryer', 'safety'
  Timer? _pollingTimer;

  @override
  void initState() {
    super.initState();
    _currentBranchId = widget.initialBranchId;
    _initialLoad();
    _startPolling();
  }

  @override
  void dispose() {
    _pollingTimer?.cancel();
    super.dispose();
  }

  void _startPolling() {
    _pollingTimer?.cancel();
    _pollingTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      _pollLiveData();
    });
  }

  Future<void> _initialLoad() async {
    setState(() => _isLoading = true);
    await Future.wait([
      _loadBranches(),
      _loadDashboardData(),
    ]);
    if (mounted) {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadBranches() async {
    try {
      final branches = await _apiService.fetchBranches();
      if (mounted) {
        setState(() => _branches = branches);
      }
    } catch (_) {}
  }

  Future<void> _loadDashboardData() async {
    try {
      final machinesFuture = _apiService.fetchMachines(_currentBranchId);
      final sensorFuture = _apiService.fetchSensorData(_currentBranchId);
      final summaryFuture = _apiService.fetchTelemetrySummary(_currentBranchId);

      final results = await Future.wait([machinesFuture, sensorFuture, summaryFuture]);

      if (mounted) {
        setState(() {
          _machines = results[0] as List<Machine>;
          _sensorData = results[1] as SensorData;
          _summary = results[2] as TelemetrySummary;
        });
      }
    } catch (_) {}
  }

  Future<void> _pollLiveData() async {
    if (!mounted) return;
    try {
      final sensor = await _apiService.fetchSensorData(_currentBranchId);
      final machines = await _apiService.fetchMachines(_currentBranchId);
      if (mounted) {
        setState(() {
          _sensorData = sensor;
          _machines = machines;
        });
      }
    } catch (_) {}
  }

  void _onSwitchBranch(String branchId) {
    if (branchId == _currentBranchId) return;
    setState(() {
      _currentBranchId = branchId;
      _isLoading = true;
    });
    _loadDashboardData().then((_) {
      if (mounted) setState(() => _isLoading = false);
    });
  }

  Future<void> _handleCommand(String machineId, String cmd) async {
    await _apiService.sendMachineCommand(machineId, cmd);
    await _loadDashboardData();
  }

  Future<void> _handleSaveParameters(String machineId, MachineParameters params) async {
    await _apiService.updateMachineParameters(machineId, params);
    await _loadDashboardData();
  }

  void _openParameterModal(Machine machine) {
    ParameterModal.show(
      context,
      machine: machine,
      onSave: _handleSaveParameters,
      onCommand: _handleCommand,
    );
  }

  @override
  Widget build(BuildContext context) {
    final currentBranch = _branches.firstWhere(
      (b) => b.id == _currentBranchId,
      orElse: () => Branch(
        id: _currentBranchId,
        name: _currentBranchId.contains('cheras') ? 'MSU Cheras' : 'MSU Shah Alam',
        campusType: 'Campus Hub',
        address: 'Management & Science University',
        washersCount: 4,
        dryersCount: 4,
        totalMachines: 8,
        status: 'ONLINE',
      ),
    );

    final filteredMachines = _machines.where((m) {
      if (_filterType == 'all') return true;
      if (_filterType == 'washer') return m.type == 'washer';
      if (_filterType == 'dryer') return m.type == 'dryer';
      return true;
    }).toList();

    return Scaffold(
      backgroundColor: AppColors.canvasBg,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Flexible(
                  child: Text(
                    currentBranch.name,
                    style: const TextStyle(fontWeight: FontWeight.w900),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.2),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Text(
                    'LIVE',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w900,
                      color: Color(0xFFFDE68A),
                    ),
                  ),
                ),
              ],
            ),
            Text(
              currentBranch.campusType,
              style: TextStyle(
                fontSize: 11,
                color: Colors.white.withValues(alpha: 0.85),
                fontFamily: AppTheme.monoFont,
              ),
            ),
          ],
        ),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.swap_horiz_rounded),
            tooltip: 'Switch Branch',
            onSelected: _onSwitchBranch,
            itemBuilder: (ctx) => [
              const PopupMenuItem(
                value: 'msu-shah-alam',
                child: Text('MSU Shah Alam (Main Hub)', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
              const PopupMenuItem(
                value: 'msu-cheras',
                child: Text('MSU Cheras (Centre)', style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ],
          ),
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh data',
            onPressed: () {
              setState(() => _isLoading = true);
              _loadDashboardData().then((_) {
                if (mounted) setState(() => _isLoading = false);
              });
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.crimsonPrimary),
            )
          : RefreshIndicator(
              onRefresh: _loadDashboardData,
              color: AppColors.crimsonPrimary,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // LPG Safety Section
                  if (_sensorData != null) ...[
                    LpgSafetyBanner(sensorData: _sensorData!),
                    const SizedBox(height: 16),
                  ],

                  // Telemetry Summary Strip
                  if (_summary != null) ...[
                    Row(
                      children: [
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: AppColors.borderSlate, width: 1.5),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'DAILY REVENUE',
                                  style: TextStyle(
                                    fontSize: 8.5,
                                    fontWeight: FontWeight.w900,
                                    fontFamily: AppTheme.monoFont,
                                    color: AppColors.slate500,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'RM ${_summary!.revenueMyr.toStringAsFixed(2)}',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w900,
                                    fontFamily: AppTheme.monoFont,
                                    color: AppColors.slate900,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: AppColors.borderSlate, width: 1.5),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'ACTIVE CYCLES',
                                  style: TextStyle(
                                    fontSize: 8.5,
                                    fontWeight: FontWeight.w900,
                                    fontFamily: AppTheme.monoFont,
                                    color: AppColors.slate500,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '${_summary!.totalCycles} Runs',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w900,
                                    fontFamily: AppTheme.monoFont,
                                    color: AppColors.slate900,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: AppColors.borderSlate, width: 1.5),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'POWER DRAW',
                                  style: TextStyle(
                                    fontSize: 8.5,
                                    fontWeight: FontWeight.w900,
                                    fontFamily: AppTheme.monoFont,
                                    color: AppColors.slate500,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '${_summary!.powerKwh} kWh',
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w900,
                                    fontFamily: AppTheme.monoFont,
                                    color: AppColors.slate900,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Filter Segment Buttons
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: Row(
                      children: [
                        _buildFilterChip('all', 'All Fleet (${_machines.length})'),
                        const SizedBox(width: 8),
                        _buildFilterChip('washer', 'Washers (4)'),
                        const SizedBox(width: 8),
                        _buildFilterChip('dryer', 'Dryers (4)'),
                      ],
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Section Title & Machine Count
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        _filterType == 'washer'
                            ? 'WASHING UNITS'
                            : _filterType == 'dryer'
                                ? 'GAS DRYER UNITS'
                                : 'FLEET MACHINES',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                          fontFamily: AppTheme.monoFont,
                          letterSpacing: 1.2,
                          color: AppColors.slate700,
                        ),
                      ),
                      Text(
                        '${filteredMachines.length} Units',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w900,
                          fontFamily: AppTheme.monoFont,
                          color: AppColors.slate500,
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 12),

                  // Machine Cards (Strict 7-box vertical layout)
                  ...filteredMachines.map(
                    (m) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: MachineCard(
                        machine: m,
                        onTap: () => _openParameterModal(m),
                        onCommand: (cmd) => _handleCommand(m.id, cmd),
                      ),
                    ),
                  ),

                  const SizedBox(height: 20),
                ],
              ),
            ),
    );
  }

  Widget _buildFilterChip(String type, String label) {
    final selected = _filterType == type;
    return ChoiceChip(
      label: Text(
        label,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w900,
          fontFamily: AppTheme.monoFont,
          color: selected ? Colors.white : AppColors.slate900,
        ),
      ),
      selected: selected,
      selectedColor: AppColors.crimsonPrimary,
      backgroundColor: Colors.white,
      side: BorderSide(
        color: selected ? AppColors.crimsonPrimary : AppColors.borderSlate,
        width: 2,
      ),
      onSelected: (_) => setState(() => _filterType = type),
    );
  }
}
