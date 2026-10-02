import 'package:flutter/material.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';

class MachineCardWidget extends StatefulWidget {
  final Machine machine;
  final Function(String command) onCommand;
  final VoidCallback onTap;

  const MachineCardWidget({
    super.key,
    required this.machine,
    required this.onCommand,
    required this.onTap,
  });

  @override
  State<MachineCardWidget> createState() => _MachineCardWidgetState();
}

class _MachineCardWidgetState extends State<MachineCardWidget> {
  String? _confirmCommand;

  @override
  Widget build(BuildContext context) {
    final m = widget.machine;
    final isRunning = m.status == 'RUNNING';
    final isIdle = m.status == 'IDLE';

    return InkWell(
      onTap: widget.onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        decoration: BoxDecoration(
          color: AppColors.cardBg,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: AppColors.cardBorder, width: 2),
          boxShadow: const [
            BoxShadow(
              color: Color(0x0A000000),
              blurRadius: 4,
              offset: Offset(0, 2),
            ),
          ],
        ),
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // 7 Stacked Elements
            // Box 1: Machine Name / ID
            Container(
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFF020617), width: 1.5),
              ),
              alignment: Alignment.center,
              child: Text(
                m.id,
                style: const TextStyle(
                  color: Colors.white,
                  fontFamily: 'monospace',
                  fontWeight: FontWeight.w900,
                  fontSize: 18,
                  letterSpacing: 0.5,
                ),
              ),
            ),
            const SizedBox(height: 6),

            // Box 2: Status (Only Live Status)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 6),
              decoration: BoxDecoration(
                color: isRunning
                    ? AppColors.runningBg
                    : isIdle
                        ? AppColors.idleBg
                        : AppColors.errorBg,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: isRunning
                      ? AppColors.runningBorder
                      : isIdle
                          ? AppColors.idleBorder
                          : AppColors.errorBorder,
                  width: 1.5,
                ),
              ),
              alignment: Alignment.center,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircleAvatar(
                    radius: 3.5,
                    backgroundColor: isRunning
                        ? AppColors.runningDot
                        : isIdle
                            ? AppColors.idleDot
                            : AppColors.errorDot,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    m.status,
                    style: TextStyle(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w900,
                      fontSize: 12,
                      color: isRunning
                          ? AppColors.runningText
                          : isIdle
                              ? AppColors.idleText
                              : AppColors.errorText,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),

            // Box 3: Cycle Time (Focal Point)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 10),
              decoration: BoxDecoration(
                color: isRunning ? const Color(0xFFEFF6FF) : const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: isRunning ? const Color(0xFFBFDBFE) : const Color(0xFFE2E8F0),
                  width: 1.5,
                ),
              ),
              child: Column(
                children: [
                  const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.schedule, size: 12, color: Colors.blueGrey),
                      SizedBox(width: 4),
                      Text(
                        'CYCLE TIME',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          fontFamily: 'monospace',
                          color: Colors.blueGrey,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(
                        '${m.remainingTime}',
                        style: const TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                          fontFamily: 'monospace',
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(width: 4),
                      const Text(
                        'mins',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          fontFamily: 'monospace',
                          color: Colors.grey,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),

            // Box 4: Price
            _buildMinorDataBox(
              icon: Icons.attach_money,
              label: 'PRICE',
              value: 'RM ${m.parameters.price.toStringAsFixed(2)}',
              bgColor: const Color(0xFFFFFBEB),
              borderColor: const Color(0xFFFDE68A),
              textColor: const Color(0xFF78350F),
            ),
            const SizedBox(height: 6),

            // Box 5: Temperature
            _buildMinorDataBox(
              icon: Icons.thermostat,
              label: 'TEMP',
              value: '${m.parameters.tempCelsius}°C',
              bgColor: const Color(0xFFFFF7ED),
              borderColor: const Color(0xFFFED7AA),
              textColor: const Color(0xFF7C2D12),
            ),
            const SizedBox(height: 6),

            // Box 6: RPM
            _buildMinorDataBox(
              icon: Icons.speed,
              label: 'SPEED',
              value: '${m.parameters.spinSpeed} RPM',
              bgColor: const Color(0xFFECFEFF),
              borderColor: const Color(0xFFA5F3FC),
              textColor: const Color(0xFF164E63),
            ),
            const SizedBox(height: 6),

            // Box 7: Door Lock
            _buildMinorDataBox(
              icon: m.parameters.doorLocked ? Icons.lock : Icons.lock_open,
              label: 'DOOR',
              value: m.parameters.doorLocked ? 'Locked' : 'Unlocked',
              bgColor: m.parameters.doorLocked ? const Color(0xFFF0FDF4) : const Color(0xFFFFFBEB),
              borderColor: m.parameters.doorLocked ? const Color(0xFFBBF7D0) : const Color(0xFFFDE68A),
              textColor: m.parameters.doorLocked ? const Color(0xFF14532D) : const Color(0xFF78350F),
            ),

            const SizedBox(height: 10),

            // Footer Quick Command Buttons
            if (_confirmCommand != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF3C7),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: const Color(0xFFF59E0B)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      '${_confirmCommand!.toUpperCase()}?',
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        fontFamily: 'monospace',
                        color: Color(0xFF78350F),
                      ),
                    ),
                    Row(
                      children: [
                        InkWell(
                          onTap: () {
                            widget.onCommand(_confirmCommand!);
                            setState(() => _confirmCommand = null);
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: AppColors.msuCrimson,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text('YES', style: TextStyle(fontSize: 10, color: Colors.white, fontWeight: FontWeight.bold)),
                          ),
                        ),
                        const SizedBox(width: 4),
                        InkWell(
                          onTap: () => setState(() => _confirmCommand = null),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: Colors.white,
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text('NO', style: TextStyle(fontSize: 10, color: Colors.black, fontWeight: FontWeight.bold)),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              )
            else
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: (!isRunning && m.status != 'ERROR')
                          ? () => setState(() => _confirmCommand = 'start')
                          : null,
                      style: OutlinedButton.styleFrom(
                        padding: EdgeInsets.zero,
                        side: const BorderSide(color: AppColors.emeraldStatus, width: 1.5),
                        backgroundColor: const Color(0xFFECFDF5),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      child: const Icon(Icons.play_arrow, size: 16, color: AppColors.emeraldStatus),
                    ),
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: isRunning
                          ? () => setState(() => _confirmCommand = 'pause')
                          : null,
                      style: OutlinedButton.styleFrom(
                        padding: EdgeInsets.zero,
                        side: BorderSide(color: Colors.amber.shade400, width: 1.5),
                        backgroundColor: Colors.amber.shade50,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      child: const Icon(Icons.pause, size: 16, color: Colors.amber),
                    ),
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: OutlinedButton(
                      onPressed: isRunning
                          ? () => setState(() => _confirmCommand = 'stop')
                          : null,
                      style: OutlinedButton.styleFrom(
                        padding: EdgeInsets.zero,
                        side: BorderSide(color: Colors.red.shade400, width: 1.5),
                        backgroundColor: Colors.red.shade50,
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      child: const Icon(Icons.stop, size: 16, color: Colors.red),
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildMinorDataBox({
    required IconData icon,
    required String label,
    required String value,
    required Color bgColor,
    required Color borderColor,
    required Color textColor,
  }) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: borderColor),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Icon(icon, size: 12, color: textColor),
              const SizedBox(width: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  fontFamily: 'monospace',
                  color: textColor,
                ),
              ),
            ],
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              fontFamily: 'monospace',
              color: textColor,
            ),
          ),
        ],
      ),
    );
  }
}

typedef MachineCard = MachineCardWidget;
