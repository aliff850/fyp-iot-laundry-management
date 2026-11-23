import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/public_models.dart';
import '../theme/spinsense_theme.dart';

typedef BranchPhotoBuilder = Widget Function(
  BuildContext context,
  PublicBranchImage image,
  BoxFit fit,
);

Future<void> showBranchImagesViewer({
  required BuildContext context,
  required String branchName,
  required List<PublicBranchImage> images,
  int initialIndex = 0,
  BranchPhotoBuilder? imageBuilder,
}) {
  return showDialog<void>(
    context: context,
    barrierColor: SpinSenseColors.surface.withValues(alpha: 0.96),
    useSafeArea: false,
    builder: (_) => _BranchImagesViewerDialog(
      branchName: branchName,
      images: images,
      initialIndex: initialIndex,
      imageBuilder: imageBuilder,
    ),
  );
}

class BranchImagesGallery extends StatelessWidget {
  const BranchImagesGallery({
    super.key,
    required this.branchName,
    required this.images,
    this.imageBuilder,
  });

  final String branchName;
  final List<PublicBranchImage> images;
  @visibleForTesting
  final BranchPhotoBuilder? imageBuilder;

  void _openViewer(BuildContext context, int initialIndex) {
    showBranchImagesViewer(
      context: context,
      branchName: branchName,
      images: images,
      initialIndex: initialIndex,
      imageBuilder: imageBuilder,
    );
  }

  Widget _buildPhoto(BuildContext context, PublicBranchImage image, BoxFit fit) {
    if (imageBuilder != null) {
      return imageBuilder!(context, image, fit);
    }
    return Image.network(
      image.imageUrl,
      fit: fit,
      loadingBuilder: (context, child, loadingProgress) {
        if (loadingProgress == null) return child;
        return const Center(
          child: SizedBox(
            width: 24,
            height: 24,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: SpinSenseColors.accent,
            ),
          ),
        );
      },
      errorBuilder: (_, _, _) => const _BrokenImageFallback(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasMultiple = images.length > 1;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Text(
                  'Images',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                if (hasMultiple)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: SpinSenseColors.raised,
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: SpinSenseColors.rule),
                    ),
                    child: Text(
                      '${images.length} photos',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: SpinSenseColors.muted,
                        fontFeatures: [FontFeature.tabularFigures()],
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            if (images.isEmpty)
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 18),
                decoration: BoxDecoration(
                  color: SpinSenseColors.raised,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: SpinSenseColors.rule),
                ),
                child: const Text(
                  'No images available',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    color: SpinSenseColors.muted,
                  ),
                ),
              )
            else
              Semantics(
                button: true,
                label: hasMultiple
                    ? 'View all ${images.length} photos for $branchName'
                    : 'View photo for $branchName',
                child: Material(
                  color: SpinSenseColors.raised,
                  borderRadius: BorderRadius.circular(6),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => _openViewer(context, 0),
                    child: AspectRatio(
                      aspectRatio: 16 / 9,
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          _buildPhoto(context, images.first, BoxFit.cover),
                          if (hasMultiple)
                            Positioned(
                              right: 10,
                              bottom: 10,
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 10,
                                  vertical: 6,
                                ),
                                decoration: BoxDecoration(
                                  color: SpinSenseColors.surface.withValues(alpha: 0.88),
                                  borderRadius: BorderRadius.circular(6),
                                  border: Border.all(color: SpinSenseColors.line),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(
                                      Icons.photo_library_outlined,
                                      size: 15,
                                      color: SpinSenseColors.ink,
                                    ),
                                    const SizedBox(width: 6),
                                    Text(
                                      '1 / ${images.length}',
                                      style: const TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w600,
                                        color: SpinSenseColors.ink,
                                        fontFeatures: [FontFeature.tabularFigures()],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _BranchImagesViewerDialog extends StatefulWidget {
  const _BranchImagesViewerDialog({
    required this.branchName,
    required this.images,
    required this.initialIndex,
    this.imageBuilder,
  });

  final String branchName;
  final List<PublicBranchImage> images;
  final int initialIndex;
  final BranchPhotoBuilder? imageBuilder;

  @override
  State<_BranchImagesViewerDialog> createState() => _BranchImagesViewerDialogState();
}

class _BranchImagesViewerDialogState extends State<_BranchImagesViewerDialog> {
  late final PageController _pageController;
  late int _currentIndex;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex.clamp(0, widget.images.length - 1);
    _pageController = PageController(initialPage: _currentIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _goTo(int index) {
    if (index < 0 || index >= widget.images.length) return;
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 220),
      curve: Curves.easeOutCubic,
    );
  }

  Widget _buildFullscreenPhoto(BuildContext context, PublicBranchImage image) {
    if (widget.imageBuilder != null) {
      return widget.imageBuilder!(context, image, BoxFit.contain);
    }
    return Image.network(
      image.imageUrl,
      fit: BoxFit.contain,
      loadingBuilder: (context, child, loadingProgress) {
        if (loadingProgress == null) return child;
        return const Center(
          child: CircularProgressIndicator(color: SpinSenseColors.accent),
        );
      },
      errorBuilder: (_, _, _) => const _BrokenImageFallback(),
    );
  }

  @override
  Widget build(BuildContext context) {
    final total = widget.images.length;
    final hasMultiple = total > 1;
    final canGoPrev = _currentIndex > 0;
    final canGoNext = _currentIndex < total - 1;

    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.escape): () => Navigator.of(context).pop(),
        if (hasMultiple) ...{
          const SingleActivator(LogicalKeyboardKey.arrowLeft): () => _goTo(_currentIndex - 1),
          const SingleActivator(LogicalKeyboardKey.arrowRight): () => _goTo(_currentIndex + 1),
        },
      },
      child: Focus(
        autofocus: true,
        child: Scaffold(
          backgroundColor: SpinSenseColors.surface,
          body: SafeArea(
            child: Column(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: const BoxDecoration(
                    color: SpinSenseColors.navy,
                    border: Border(
                      bottom: BorderSide(color: SpinSenseColors.line),
                    ),
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          widget.branchName,
                          overflow: TextOverflow.ellipsis,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                      ),
                      if (hasMultiple) ...[
                        const SizedBox(width: 8),
                        Text(
                          '${_currentIndex + 1} / $total',
                          style: const TextStyle(
                            color: SpinSenseColors.muted,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                      ],
                      const SizedBox(width: 4),
                      IconButton(
                        onPressed: () => Navigator.of(context).pop(),
                        tooltip: 'Close gallery',
                        constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                        icon: const Icon(Icons.close_rounded, color: SpinSenseColors.ink),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: PageView.builder(
                    controller: _pageController,
                    itemCount: total,
                    physics: hasMultiple
                        ? const PageScrollPhysics()
                        : const NeverScrollableScrollPhysics(),
                    onPageChanged: (index) {
                      setState(() => _currentIndex = index);
                    },
                    itemBuilder: (context, index) {
                      return Center(
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: _buildFullscreenPhoto(context, widget.images[index]),
                        ),
                      );
                    },
                  ),
                ),
                if (hasMultiple)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: const BoxDecoration(
                      color: SpinSenseColors.navy,
                      border: Border(
                        top: BorderSide(color: SpinSenseColors.line),
                      ),
                    ),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        IconButton(
                          onPressed: canGoPrev ? () => _goTo(_currentIndex - 1) : null,
                          tooltip: 'Previous image',
                          constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                          style: IconButton.styleFrom(
                            backgroundColor: SpinSenseColors.raised,
                            disabledBackgroundColor: SpinSenseColors.canvas,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                              side: BorderSide(
                                color: canGoPrev
                                    ? SpinSenseColors.control
                                    : SpinSenseColors.rule,
                              ),
                            ),
                          ),
                          icon: Icon(
                            Icons.chevron_left_rounded,
                            size: 28,
                            color: canGoPrev
                                ? SpinSenseColors.ink
                                : SpinSenseColors.faint,
                          ),
                        ),
                        Text(
                          '${_currentIndex + 1} / $total',
                          style: const TextStyle(
                            color: SpinSenseColors.ink,
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            fontFeatures: [FontFeature.tabularFigures()],
                          ),
                        ),
                        IconButton(
                          onPressed: canGoNext ? () => _goTo(_currentIndex + 1) : null,
                          tooltip: 'Next image',
                          constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                          style: IconButton.styleFrom(
                            backgroundColor: SpinSenseColors.raised,
                            disabledBackgroundColor: SpinSenseColors.canvas,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                              side: BorderSide(
                                color: canGoNext
                                    ? SpinSenseColors.control
                                    : SpinSenseColors.rule,
                              ),
                            ),
                          ),
                          icon: Icon(
                            Icons.chevron_right_rounded,
                            size: 28,
                            color: canGoNext
                                ? SpinSenseColors.ink
                                : SpinSenseColors.faint,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BrokenImageFallback extends StatelessWidget {
  const _BrokenImageFallback();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: SpinSenseColors.raised,
      alignment: Alignment.center,
      padding: const EdgeInsets.all(16),
      child: const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.broken_image_outlined,
            color: SpinSenseColors.muted,
            size: 28,
          ),
          SizedBox(height: 8),
          Text(
            'Unable to load image',
            style: TextStyle(
              color: SpinSenseColors.muted,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}
