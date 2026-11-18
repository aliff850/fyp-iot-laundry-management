import 'package:flutter/material.dart';
import '../theme/spinsense_theme.dart';

/// Displays an organization's public logo image with an accessible initials fallback.
class OrganizationLogoBadge extends StatelessWidget {
  const OrganizationLogoBadge({
    super.key,
    required this.organizationName,
    this.logoUrl,
    this.size = 40,
    this.highlighted = false,
  });

  final String organizationName;
  final String? logoUrl;
  final double size;
  final bool highlighted;

  String get initials {
    final parts = organizationName
        .trim()
        .split(RegExp(r'\s+'))
        .where((p) => p.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'SS';
    if (parts.length == 1) {
      final word = parts.first;
      return word.substring(0, word.length >= 2 ? 2 : 1).toUpperCase();
    }
    return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final borderColor = highlighted ? SpinSenseColors.accent : SpinSenseColors.control;
    final hasLogo = logoUrl != null && logoUrl!.trim().isNotEmpty;

    return Semantics(
      label: '$organizationName badge',
      child: Container(
        width: size,
        height: size,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: SpinSenseColors.navy,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: borderColor,
            width: highlighted ? 2 : 1,
          ),
        ),
        child: hasLogo
            ? Image.network(
                logoUrl!.trim(),
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => _InitialsFallback(initials: initials, size: size),
              )
            : _InitialsFallback(initials: initials, size: size),
      ),
    );
  }
}

class _InitialsFallback extends StatelessWidget {
  const _InitialsFallback({
    required this.initials,
    required this.size,
  });

  final String initials;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        initials,
        style: TextStyle(
          color: SpinSenseColors.ink,
          fontWeight: FontWeight.w700,
          fontSize: size * 0.36,
          letterSpacing: 0.4,
        ),
      ),
    );
  }
}
