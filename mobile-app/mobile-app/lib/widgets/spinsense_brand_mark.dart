import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Renders the circular SpinSense SVG mark (`assets/spinsense.svg`), matching
/// the web header emblem (`size-7 shrink-0 rounded-full`).
class SpinSenseBrandMark extends StatelessWidget {
  const SpinSenseBrandMark({
    super.key,
    this.size = 28,
  });

  static const String assetPath = 'assets/spinsense.svg';

  final double size;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: SizedBox.square(
        dimension: size,
        child: ClipOval(
          child: SvgPicture.asset(
            assetPath,
            width: size,
            height: size,
            fit: BoxFit.cover,
          ),
        ),
      ),
    );
  }
}
