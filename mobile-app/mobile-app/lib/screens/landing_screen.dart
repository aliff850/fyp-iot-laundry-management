import 'package:flutter/material.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/branch_card.dart';
import 'dashboard_screen.dart';

class LandingScreen extends StatefulWidget {
  const LandingScreen({super.key});

  @override
  State<LandingScreen> createState() => _LandingScreenState();
}

class _LandingScreenState extends State<LandingScreen> {
  final ApiService _apiService = ApiService();
  List<Branch> _branches = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadBranches();
  }

  Future<void> _loadBranches() async {
    setState(() => _isLoading = true);
    try {
      final branches = await _apiService.fetchBranches();
      if (mounted) {
        setState(() {
          _branches = branches;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  void _navigateToDashboard(Branch branch) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (ctx) => DashboardScreen(initialBranchId: branch.id),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.canvasBg,
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('MSU SpinSense'),
            Text(
              'Management & Science University',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: Colors.white.withValues(alpha: 0.85),
                fontFamily: AppTheme.monoFont,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh telemetry',
            onPressed: _loadBranches,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.crimsonPrimary),
            )
          : RefreshIndicator(
              onRefresh: _loadBranches,
              color: AppColors.crimsonPrimary,
              child: ListView(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
                children: [
                  // Hero Welcome Card
                  Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: AppColors.borderSlate, width: 2),
                      boxShadow: const [
                        BoxShadow(
                          color: Color(0x08000000),
                          blurRadius: 8,
                          offset: Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          'Welcome to MSU SpinSense',
                          style: TextStyle(
                            fontSize: 22,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.5,
                            color: AppColors.slate900,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Select a laundry facility below to inspect live machine telemetry, configure operating parameters, and monitor real-time LPG gas safety.',
                          style: TextStyle(
                            fontSize: 13,
                            color: AppColors.slate600,
                            height: 1.4,
                          ),
                        ),
                        const SizedBox(height: 16),
                        const Divider(height: 1, color: AppColors.borderSlate),
                        const SizedBox(height: 14),

                        // Quick 4-box Network Telemetry
                        Row(
                          children: [
                            _buildMetricChip(
                              icon: Icons.store_mall_directory_rounded,
                              iconColor: AppColors.crimsonPrimary,
                              label: 'BRANCHES',
                              val: '2 Active',
                            ),
                            const SizedBox(width: 8),
                            _buildMetricChip(
                              icon: Icons.local_laundry_service_rounded,
                              iconColor: AppColors.blueCycle,
                              label: 'FLEET UNITS',
                              val: '16 Units',
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            _buildMetricChip(
                              icon: Icons.local_fire_department_rounded,
                              iconColor: AppColors.emeraldStatus,
                              label: 'LPG SAFETY',
                              val: 'Normal (0 Leaks)',
                              valColor: AppColors.emeraldDark,
                            ),
                            const SizedBox(width: 8),
                            _buildMetricChip(
                              icon: Icons.offline_bolt_rounded,
                              iconColor: const Color(0xFFD97706),
                              label: 'FLEET HEALTH',
                              val: '100% Online',
                              valColor: const Color(0xFFB45309),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  // Section Title
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'FACILITY LOCATIONS',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w900,
                          fontFamily: AppTheme.monoFont,
                          letterSpacing: 1.2,
                          color: AppColors.slate700,
                        ),
                      ),
                      Text(
                        '${_branches.length} Hubs',
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

                  // Branch Cards
                  ..._branches.map((b) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: BranchCard(
                          branch: b,
                          onTap: () => _navigateToDashboard(b),
                        ),
                      )),
                ],
              ),
            ),
    );
  }

  Widget _buildMetricChip({
    required IconData icon,
    required Color iconColor,
    required String label,
    required String val,
    Color? valColor,
  }) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderSlate, width: 1.5),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 14, color: iconColor),
                const SizedBox(width: 4),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w900,
                    fontFamily: AppTheme.monoFont,
                    color: AppColors.slate600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              val,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w900,
                fontFamily: AppTheme.monoFont,
                color: valColor ?? AppColors.slate900,
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}
