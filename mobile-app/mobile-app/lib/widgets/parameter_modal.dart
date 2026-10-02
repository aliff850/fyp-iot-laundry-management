import 'package:flutter/material.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';

class ParameterModal extends StatefulWidget {
  final Machine machine;
  final Future<void> Function(String machineId, MachineParameters parameters) onSave;
  final Future<void> Function(String machineId, String command)? onCommand;

  const ParameterModal({
    super.key,
    required this.machine,
    required this.onSave,
    this.onCommand,
  });

  static Future<void> show(
    BuildContext context, {
    required Machine machine,
    required Future<void> Function(String machineId, MachineParameters parameters) onSave,
    Future<void> Function(String machineId, String command)? onCommand,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => ParameterModal(
        machine: machine,
        onSave: onSave,
        onCommand: onCommand,
      ),
    );
  }

  @override
  State<ParameterModal> createState() => _ParameterModalState();
}

class _ParameterModalState extends State<ParameterModal> {
  late double _price;
  late int _durationMins;
  late int _tempCelsius;
  late String _waterLevel;
  late int _spinSpeed;
  late bool _doorLocked;

  bool _isSaving = false;
  String? _confirmCmd;
  bool _isCommandLoading = false;

  @override
  void initState() {
    super.initState();
    final p = widget.machine.parameters;
    _price = p.price;
    _durationMins = p.durationMins;
    _tempCelsius = p.tempCelsius;
    _waterLevel = p.waterLevel;
    _spinSpeed = p.spinSpeed;
    _doorLocked = p.doorLocked;
  }

  Future<void> _handleSave() async {
    setState(() => _isSaving = true);
    try {
      final updated = MachineParameters(
        price: _price,
        durationMins: _durationMins,
        tempCelsius: _tempCelsius,
        waterLevel: _waterLevel,
        spinSpeed: _spinSpeed,
        doorLocked: _doorLocked,
      );
      await widget.onSave(widget.machine.id, updated);
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${widget.machine.id} parameters saved successfully'),
            backgroundColor: AppColors.emeraldStatus,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to save parameters: $e'),
            backgroundColor: AppColors.crimsonPrimary,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  Future<void> _handleCommand(String cmd) async {
    if (widget.onCommand == null) return;
    setState(() => _isCommandLoading = true);
    try {
      await widget.onCommand!(widget.machine.id, cmd);
      if (mounted) {
        setState(() => _confirmCmd = null);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Sent $cmd to ${widget.machine.id}'),
            backgroundColor: AppColors.crimsonPrimary,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Command failed: $e'),
            backgroundColor: Colors.red.shade700,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isCommandLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // Clean name without 'Hippo Laundry'
    final displayName = widget.machine.name.replaceAll(RegExp(r'Hippo Laundry\s*', caseSensitive: false), '').trim();
    final isRunning = widget.machine.isRunning;
    final isIdle = widget.machine.isIdle;
    final isError = widget.machine.isError;

    final totalDuration = _durationMins > 0 ? _durationMins : 30;
    final remaining = widget.machine.remainingTime;
    final progress = isRunning
        ? ((totalDuration - remaining) / totalDuration).clamp(0.05, 1.0)
        : 0.0;

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.9,
      ),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle
          Container(
            margin: const EdgeInsets.only(top: 8, bottom: 4),
            width: 36,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.slate300,
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            decoration: const BoxDecoration(
              color: AppColors.crimsonPrimary,
              border: Border(
                bottom: BorderSide(color: AppColors.crimsonDark, width: 2),
              ),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Row(
                    children: [
                      Flexible(
                        child: Text(
                          displayName,
                          style: const TextStyle(
                            fontSize: 17,
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.2),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.3)),
                        ),
                        child: Text(
                          widget.machine.id,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                            fontFamily: AppTheme.monoFont,
                            color: const Color(0xFFFDE68A),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close, color: Colors.white),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                  splashRadius: 20,
                ),
              ],
            ),
          ),

          // Scrollable Content
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Live Status & Cycle Control Banner
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: isRunning
                          ? const Color(0xFFEFF6FF)
                          : isError
                              ? const Color(0xFFFEF2F2)
                              : const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: isRunning
                            ? const Color(0xFF93C5FD)
                            : isError
                                ? const Color(0xFFFCA5A5)
                                : AppColors.borderSlate,
                        width: 2,
                      ),
                    ),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: isRunning
                                    ? AppColors.blueCycle
                                    : isIdle
                                        ? AppColors.emeraldStatus
                                        : AppColors.crimsonPrimary,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Icon(
                                isRunning
                                    ? Icons.autorenew_rounded
                                    : isIdle
                                        ? Icons.check_circle_outline_rounded
                                        : Icons.error_outline_rounded,
                                color: Colors.white,
                                size: 24,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    isRunning
                                        ? 'CYCLE ACTIVE'
                                        : isError
                                            ? 'FAULT DETECTED'
                                            : 'AVAILABLE',
                                    style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w900,
                                      fontFamily: AppTheme.monoFont,
                                      color: isRunning
                                          ? const Color(0xFF1E3A8A)
                                          : isError
                                              ? const Color(0xFF7F1D1D)
                                              : AppColors.slate900,
                                    ),
                                  ),
                                  Text(
                                    widget.machine.currentCycle ?? 'Ready for load',
                                    style: const TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w600,
                                      color: AppColors.slate600,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Text(
                                  'REMAINING',
                                  style: TextStyle(
                                    fontSize: 9,
                                    fontWeight: FontWeight.w900,
                                    fontFamily: AppTheme.monoFont,
                                    color: AppColors.slate500,
                                  ),
                                ),
                                Row(
                                  crossAxisAlignment: CrossAxisAlignment.baseline,
                                  textBaseline: TextBaseline.alphabetic,
                                  children: [
                                    Text(
                                      '$remaining',
                                      style: TextStyle(
                                        fontSize: 22,
                                        fontWeight: FontWeight.w900,
                                        fontFamily: AppTheme.monoFont,
                                        color: AppColors.slate900,
                                      ),
                                    ),
                                    const SizedBox(width: 2),
                                    Text(
                                      'min',
                                      style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w900,
                                        fontFamily: AppTheme.monoFont,
                                        color: AppColors.slate600,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ],
                        ),

                        if (isRunning) ...[
                          const SizedBox(height: 12),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: progress,
                              minHeight: 6,
                              backgroundColor: const Color(0xFFBFDBFE),
                              valueColor: const AlwaysStoppedAnimation<Color>(AppColors.blueCycle),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(
                                'Cycle Progress',
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  fontFamily: AppTheme.monoFont,
                                  color: Colors.blue.shade900,
                                ),
                              ),
                              Text(
                                '${(progress * 100).toInt()}%',
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w900,
                                  fontFamily: AppTheme.monoFont,
                                  color: Colors.blue.shade900,
                                ),
                              ),
                            ],
                          ),
                        ],

                        // Remote Controls
                        if (widget.onCommand != null) ...[
                          const SizedBox(height: 12),
                          const Divider(height: 1),
                          const SizedBox(height: 10),
                          if (_confirmCmd != null) ...[
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFEF3C7),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: const Color(0xFFFCD34D)),
                              ),
                              child: Row(
                                children: [
                                  const Icon(Icons.warning_amber_rounded, size: 16, color: Color(0xFFB45309)),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    child: Text(
                                      'Confirm ${_confirmCmd!.toUpperCase()} on ${widget.machine.id}?',
                                      style: TextStyle(
                                        fontSize: 11,
                                        fontWeight: FontWeight.w900,
                                        fontFamily: AppTheme.monoFont,
                                        color: const Color(0xFF78350F),
                                      ),
                                    ),
                                  ),
                                  ElevatedButton(
                                    onPressed: _isCommandLoading ? null : () => _handleCommand(_confirmCmd!),
                                    style: ElevatedButton.styleFrom(
                                      backgroundColor: AppColors.crimsonPrimary,
                                      foregroundColor: Colors.white,
                                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                      minimumSize: Size.zero,
                                    ),
                                    child: _isCommandLoading
                                        ? const SizedBox(
                                            width: 12,
                                            height: 12,
                                            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                          )
                                        : const Text('Yes', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                                  ),
                                  const SizedBox(width: 4),
                                  TextButton(
                                    onPressed: _isCommandLoading ? null : () => setState(() => _confirmCmd = null),
                                    style: TextButton.styleFrom(
                                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                      minimumSize: Size.zero,
                                    ),
                                    child: const Text('Cancel', style: TextStyle(fontSize: 11, color: Colors.black87)),
                                  ),
                                ],
                              ),
                            ),
                          ] else ...[
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Text(
                                  'COMMANDS',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w900,
                                    fontFamily: AppTheme.monoFont,
                                    color: AppColors.slate600,
                                  ),
                                ),
                                Row(
                                  children: [
                                    _buildCmdButton(
                                      label: 'Start',
                                      icon: Icons.play_arrow_rounded,
                                      color: AppColors.emeraldStatus,
                                      enabled: !isRunning && !isError,
                                      onPressed: () => setState(() => _confirmCmd = 'start'),
                                    ),
                                    const SizedBox(width: 6),
                                    _buildCmdButton(
                                      label: 'Pause',
                                      icon: Icons.pause_rounded,
                                      color: const Color(0xFFD97706),
                                      enabled: isRunning,
                                      onPressed: () => setState(() => _confirmCmd = 'pause'),
                                    ),
                                    const SizedBox(width: 6),
                                    _buildCmdButton(
                                      label: 'Stop',
                                      icon: Icons.stop_rounded,
                                      color: const Color(0xFFDC2626),
                                      enabled: isRunning,
                                      onPressed: () => setState(() => _confirmCmd = 'stop'),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ],
                        ],
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  // Parameter Inputs Header
                  Text(
                    'PARAMETER CONFIGURATION',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      fontFamily: AppTheme.monoFont,
                      letterSpacing: 1,
                      color: AppColors.slate700,
                    ),
                  ),
                  const SizedBox(height: 12),

                  // Price & Duration
                  Row(
                    children: [
                      // Price
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'PRICE (MYR)',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                fontFamily: AppTheme.monoFont,
                                color: AppColors.slate600,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: AppColors.borderSlate, width: 2),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    'RM ${_price.toStringAsFixed(2)}',
                                    style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w900,
                                      fontFamily: AppTheme.monoFont,
                                    ),
                                  ),
                                  Row(
                                    children: [
                                      InkWell(
                                        onTap: () {
                                          if (_price > 1.0) setState(() => _price -= 0.5);
                                        },
                                        child: const Icon(Icons.remove_circle_outline, size: 20, color: AppColors.slate500),
                                      ),
                                      const SizedBox(width: 6),
                                      InkWell(
                                        onTap: () {
                                          if (_price < 30.0) setState(() => _price += 0.5);
                                        },
                                        child: const Icon(Icons.add_circle_outline, size: 20, color: AppColors.slate500),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 12),

                      // Duration
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'DURATION (MINS)',
                              style: TextStyle(
                                fontSize: 10,
                                fontWeight: FontWeight.w900,
                                fontFamily: AppTheme.monoFont,
                                color: AppColors.slate600,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: AppColors.borderSlate, width: 2),
                              ),
                              child: Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    '$_durationMins mins',
                                    style: TextStyle(
                                      fontSize: 14,
                                      fontWeight: FontWeight.w900,
                                      fontFamily: AppTheme.monoFont,
                                    ),
                                  ),
                                  Row(
                                    children: [
                                      InkWell(
                                        onTap: () {
                                          if (_durationMins > 10) setState(() => _durationMins -= 5);
                                        },
                                        child: const Icon(Icons.remove_circle_outline, size: 20, color: AppColors.slate500),
                                      ),
                                      const SizedBox(width: 6),
                                      InkWell(
                                        onTap: () {
                                          if (_durationMins < 120) setState(() => _durationMins += 5);
                                        },
                                        child: const Icon(Icons.add_circle_outline, size: 20, color: AppColors.slate500),
                                      ),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 14),

                  // Target Temperature
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'TEMPERATURE PRESET',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                          fontFamily: AppTheme.monoFont,
                          color: AppColors.slate600,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [25, 30, 40, 50, 60, 65].map((t) {
                          final selected = _tempCelsius == t;
                          return ChoiceChip(
                            label: Text(
                              '$t°C ${t == 25 ? '(Cold)' : t == 60 ? '(Sanitize)' : ''}',
                              style: TextStyle(
                                fontSize: 11,
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
                            onSelected: (val) {
                              if (val) setState(() => _tempCelsius = t);
                            },
                          );
                        }).toList(),
                      ),
                    ],
                  ),

                  const SizedBox(height: 14),

                  // Water Level (Low, Medium, High)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'WATER LEVEL',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                          fontFamily: AppTheme.monoFont,
                          color: AppColors.slate600,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: ['Low', 'Medium', 'High'].map((lvl) {
                          final selected = _waterLevel.toLowerCase() == lvl.toLowerCase();
                          return Expanded(
                            child: Padding(
                              padding: const EdgeInsets.only(right: 6),
                              child: OutlinedButton(
                                onPressed: () => setState(() => _waterLevel = lvl),
                                style: OutlinedButton.styleFrom(
                                  backgroundColor: selected ? AppColors.crimsonPrimary : Colors.white,
                                  foregroundColor: selected ? Colors.white : AppColors.slate900,
                                  side: BorderSide(
                                    color: selected ? AppColors.crimsonPrimary : AppColors.borderSlate,
                                    width: 2,
                                  ),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                  padding: const EdgeInsets.symmetric(vertical: 8),
                                ),
                                child: Text(
                                  lvl,
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w900,
                                    color: selected ? Colors.white : AppColors.slate900,
                                  ),
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ),

                  const SizedBox(height: 14),

                  // Drum Spin Speed (400, 800, 1200 RPM)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'DRUM SPIN SPEED (RPM)',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                          fontFamily: AppTheme.monoFont,
                          color: AppColors.slate600,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [400, 800, 1200].map((rpm) {
                          final selected = _spinSpeed == rpm;
                          return Expanded(
                            child: Padding(
                              padding: const EdgeInsets.only(right: 6),
                              child: OutlinedButton(
                                onPressed: () => setState(() => _spinSpeed = rpm),
                                style: OutlinedButton.styleFrom(
                                  backgroundColor: selected ? AppColors.crimsonPrimary : Colors.white,
                                  foregroundColor: selected ? Colors.white : AppColors.slate900,
                                  side: BorderSide(
                                    color: selected ? AppColors.crimsonPrimary : AppColors.borderSlate,
                                    width: 2,
                                  ),
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                  padding: const EdgeInsets.symmetric(vertical: 8),
                                ),
                                child: Text(
                                  '$rpm RPM',
                                  style: TextStyle(
                                    fontSize: 12,
                                    fontWeight: FontWeight.w900,
                                    fontFamily: AppTheme.monoFont,
                                    color: selected ? Colors.white : AppColors.slate900,
                                  ),
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ),

                  const SizedBox(height: 14),

                  // Door Lock Switch
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8FAFC),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.borderSlate, width: 2),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Icon(
                              _doorLocked ? Icons.lock_rounded : Icons.lock_open_rounded,
                              size: 20,
                              color: _doorLocked ? AppColors.emeraldStatus : const Color(0xFFD97706),
                            ),
                            const SizedBox(width: 10),
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text(
                                  'Door Latch Lock',
                                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900),
                                ),
                                Text(
                                  _doorLocked ? 'Engaged (Protected)' : 'Disengaged (Openable)',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold,
                                    fontFamily: AppTheme.monoFont,
                                    color: AppColors.slate600,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                        Switch(
                          value: _doorLocked,
                          activeThumbColor: AppColors.emeraldStatus,
                          onChanged: (val) => setState(() => _doorLocked = val),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 20),

                  // Save Action Button
                  SizedBox(
                    height: 48,
                    child: ElevatedButton(
                      onPressed: _isSaving ? null : _handleSave,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.crimsonPrimary,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                      child: _isSaving
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Text(
                              'SAVE CONFIGURATION',
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1,
                              ),
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCmdButton({
    required String label,
    required IconData icon,
    required Color color,
    required bool enabled,
    required VoidCallback onPressed,
  }) {
    return OutlinedButton.icon(
      onPressed: enabled ? onPressed : null,
      icon: Icon(icon, size: 14),
      label: Text(label),
      style: OutlinedButton.styleFrom(
        foregroundColor: color,
        disabledForegroundColor: AppColors.slate400,
        side: BorderSide(
          color: enabled ? color.withValues(alpha: 0.6) : AppColors.slate300,
          width: 1.5,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        minimumSize: Size.zero,
        textStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    );
  }
}
