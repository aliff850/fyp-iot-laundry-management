import 'package:flutter/material.dart';
import '../theme/spinsense_theme.dart';

typedef BannerNetworkImageBuilder = Widget Function(
  BuildContext context,
  String imageUrl,
  BoxFit fit,
);

/// Full-width cover banner displayed across list cards, map pin previews, and branch detail headers.
class BranchBannerImage extends StatelessWidget {
  const BranchBannerImage({
    super.key,
    required this.imageUrl,
    this.height = 140,
    this.semanticLabel,
    this.onTap,
    this.imageBuilder,
  });

  final String imageUrl;
  final double height;
  final String? semanticLabel;
  final VoidCallback? onTap;
  @visibleForTesting
  final BannerNetworkImageBuilder? imageBuilder;

  Widget _buildImage(BuildContext context) {
    final trimmed = imageUrl.trim();
    if (imageBuilder != null) {
      return imageBuilder!(context, trimmed, BoxFit.cover);
    }
    return Image.network(
      trimmed,
      fit: BoxFit.cover,
      width: double.infinity,
      height: height,
      loadingBuilder: (context, child, loadingProgress) {
        if (loadingProgress == null) return child;
        return Container(
          color: SpinSenseColors.raised,
          alignment: Alignment.center,
          child: const SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: SpinSenseColors.accent,
            ),
          ),
        );
      },
      errorBuilder: (_, _, _) => Container(
        color: SpinSenseColors.raised,
        alignment: Alignment.center,
        padding: const EdgeInsets.all(12),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.broken_image_outlined,
              size: 18,
              color: SpinSenseColors.muted,
            ),
            SizedBox(width: 8),
            Text(
              'Unable to load image',
              style: TextStyle(
                color: SpinSenseColors.muted,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final content = Container(
      width: double.infinity,
      height: height,
      decoration: const BoxDecoration(
        color: SpinSenseColors.raised,
        border: Border(
          bottom: BorderSide(color: SpinSenseColors.rule, width: 1),
        ),
      ),
      child: _buildImage(context),
    );

    final wrapped = onTap != null
        ? Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              child: content,
            ),
          )
        : content;

    if (semanticLabel == null || semanticLabel!.trim().isEmpty) {
      return wrapped;
    }

    return Semantics(
      button: onTap != null,
      image: true,
      label: semanticLabel,
      child: wrapped,
    );
  }
}
