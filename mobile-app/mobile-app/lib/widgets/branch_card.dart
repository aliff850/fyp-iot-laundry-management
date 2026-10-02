import 'package:flutter/material.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';

class BranchCard extends StatelessWidget {
  final Branch branch;
  final VoidCallback onTap;

  const BranchCard({
    super.key,
    required this.branch,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
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
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header Row: Campus Tag & Online Badge
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFCBD5E1)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.location_on, size: 12, color: AppColors.msuCrimson),
                    const SizedBox(width: 4),
                    Text(
                      branch.id == 'msu-shah-alam' ? 'MAIN CAMPUS' : 'CAMPUS CENTRE',
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        fontFamily: 'monospace',
                        color: Color(0xFF334155),
                      ),
                    ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.idleBg,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.idleBorder),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircleAvatar(radius: 3, backgroundColor: AppColors.idleDot),
                    SizedBox(width: 4),
                    Text(
                      'ONLINE',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        fontFamily: 'monospace',
                        color: AppColors.idleText,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Branch Name & Location
          Text(
            branch.name,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w900,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            branch.location,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: AppColors.textSecondary,
            ),
          ),

          const Divider(height: 24, thickness: 1.5, color: Color(0xFFE2E8F0)),

          // Machine Breakdown
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'FLEET ALLOCATION',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  fontFamily: 'monospace',
                  color: AppColors.textSecondary,
                ),
              ),
              Text(
                '8 Units Total',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  fontFamily: 'monospace',
                  color: Colors.blue.shade900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE2E8F0), width: 1.5),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.local_laundry_service, size: 20, color: Colors.blue),
                      SizedBox(width: 8),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('4 Washers', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                          Text('Commercial', style: TextStyle(fontSize: 10, color: Colors.grey)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: const Color(0xFFE2E8F0), width: 1.5),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.waves, size: 20, color: Colors.amber),
                      SizedBox(width: 8),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('4 Dryers', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
                          Text('Commercial Gas', style: TextStyle(fontSize: 10, color: Colors.grey)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Launch CTA Button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: onTap,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.msuCrimson,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 0,
              ),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'LAUNCH OPERATIONS',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.5,
                    ),
                  ),
                  SizedBox(width: 6),
                  Icon(Icons.arrow_forward, size: 16),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
