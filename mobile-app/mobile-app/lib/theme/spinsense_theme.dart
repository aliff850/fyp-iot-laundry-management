import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// SpinSense dark interface palette tokens shared with web and edge surfaces.
class SpinSenseColors {
  const SpinSenseColors._();

  static const Color canvas = Color(0xFF171719);
  static const Color surface = Color(0xFF131217);
  static const Color raised = Color(0xFF212023);

  static const Color navy = Color(0xFF14243A);
  static const Color navyHover = Color(0xFF1B304B);
  static const Color navySelected = Color(0xFF223D5B);

  static const Color ink = Color(0xFFF2F2F3);
  static const Color muted = Color(0xFFB4B4BA);
  static const Color faint = Color(0xFF94949D);

  static const Color line = Color(0xFF2C2B30);
  static const Color rule = Color(0xFF242328);
  static const Color control = Color(0xFF8C8A93);

  static const Color accent = Color(0xFFEF6268);
  static const Color positive = Color(0xFF79C5A6);
  static const Color warning = Color(0xFFDFB463);
  static const Color negative = Color(0xFFEF8798);
}

class SpinSenseTheme {
  const SpinSenseTheme._();

  static ThemeData get darkTheme {
    final baseText = ThemeData(brightness: Brightness.dark).textTheme;
    final manrope = GoogleFonts.manropeTextTheme(baseText).apply(
      bodyColor: SpinSenseColors.ink,
      displayColor: SpinSenseColors.ink,
    );

    const colorScheme = ColorScheme(
      brightness: Brightness.dark,
      primary: SpinSenseColors.ink,
      onPrimary: SpinSenseColors.surface,
      secondary: SpinSenseColors.navy,
      onSecondary: SpinSenseColors.ink,
      error: SpinSenseColors.negative,
      onError: SpinSenseColors.surface,
      surface: SpinSenseColors.surface,
      onSurface: SpinSenseColors.ink,
      outline: SpinSenseColors.control,
      outlineVariant: SpinSenseColors.line,
    );

    final buttonShape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(8),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: SpinSenseColors.canvas,
      canvasColor: SpinSenseColors.canvas,
      dividerColor: SpinSenseColors.rule,
      textTheme: manrope.copyWith(
        headlineSmall: manrope.headlineSmall?.copyWith(
          fontSize: 22,
          fontWeight: FontWeight.w700,
          color: SpinSenseColors.ink,
          letterSpacing: -0.3,
        ),
        titleLarge: manrope.titleLarge?.copyWith(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: SpinSenseColors.ink,
        ),
        titleMedium: manrope.titleMedium?.copyWith(
          fontSize: 16,
          fontWeight: FontWeight.w600,
          color: SpinSenseColors.ink,
        ),
        bodyLarge: manrope.bodyLarge?.copyWith(
          fontSize: 15,
          fontWeight: FontWeight.w500,
          color: SpinSenseColors.ink,
        ),
        bodyMedium: manrope.bodyMedium?.copyWith(
          fontSize: 14,
          fontWeight: FontWeight.w400,
          color: SpinSenseColors.ink,
        ),
        bodySmall: manrope.bodySmall?.copyWith(
          fontSize: 12,
          fontWeight: FontWeight.w400,
          color: SpinSenseColors.muted,
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: SpinSenseColors.navy,
        foregroundColor: SpinSenseColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        shape: const Border(
          bottom: BorderSide(color: SpinSenseColors.line, width: 1),
        ),
        titleTextStyle: manrope.titleLarge?.copyWith(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: SpinSenseColors.ink,
        ),
      ),
      cardTheme: CardThemeData(
        color: SpinSenseColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
          side: const BorderSide(color: SpinSenseColors.line, width: 1),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size(48, 48),
          backgroundColor: SpinSenseColors.ink,
          foregroundColor: SpinSenseColors.surface,
          disabledBackgroundColor: SpinSenseColors.raised,
          disabledForegroundColor: SpinSenseColors.muted,
          shape: buttonShape,
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          elevation: 0,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(48, 48),
          backgroundColor: SpinSenseColors.ink,
          foregroundColor: SpinSenseColors.surface,
          disabledBackgroundColor: SpinSenseColors.raised,
          disabledForegroundColor: SpinSenseColors.muted,
          shape: buttonShape,
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
          elevation: 0,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(48, 48),
          backgroundColor: SpinSenseColors.navy,
          foregroundColor: SpinSenseColors.ink,
          disabledForegroundColor: SpinSenseColors.muted,
          side: const BorderSide(color: SpinSenseColors.control, width: 1),
          shape: buttonShape,
          textStyle: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(48, 48),
          foregroundColor: SpinSenseColors.ink,
          shape: buttonShape,
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          minimumSize: const Size(48, 48),
          foregroundColor: SpinSenseColors.ink,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: SpinSenseColors.canvas,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        hintStyle: const TextStyle(color: SpinSenseColors.faint, fontSize: 14),
        labelStyle: const TextStyle(color: SpinSenseColors.muted, fontSize: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: SpinSenseColors.control),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: SpinSenseColors.control),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: SpinSenseColors.accent, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: SpinSenseColors.negative),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: SpinSenseColors.negative, width: 2),
        ),
        errorStyle: const TextStyle(color: SpinSenseColors.negative, fontSize: 12),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: SpinSenseColors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
          side: BorderSide(color: SpinSenseColors.line, width: 1),
        ),
      ),
      dividerTheme: const DividerThemeData(
        color: SpinSenseColors.rule,
        thickness: 1,
        space: 1,
      ),
    );
  }
}
