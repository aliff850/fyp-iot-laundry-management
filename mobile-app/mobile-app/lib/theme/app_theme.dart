import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppColors {
  // Canvas & Surfaces
  static const Color canvas = Color(0xFFE7ECF3);
  static const Color canvasBg = Color(0xFFE7ECF3);
  static const Color cardBg = Colors.white;
  static const Color cardBorder = Color(0xFFCBD5E1);
  static const Color borderSlate = Color(0xFFCBD5E1);

  // MSU Brand
  static const Color msuCrimson = Color(0xFF8B0000);
  static const Color crimsonPrimary = Color(0xFF8B0000);
  static const Color msuDark = Color(0xFF660000);
  static const Color crimsonDark = Color(0xFF660000);
  static const Color msuLight = Color(0xFFFDF2F2);
  static const Color msuGold = Color(0xFFD4AF37);
  static const Color msuBorder = Color(0xFFDC2626);

  // Typography & Neutrals
  static const Color textPrimary = Color(0xFF0F172A);
  static const Color slate900 = Color(0xFF0F172A);
  static const Color slate800 = Color(0xFF1E293B);
  static const Color slate700 = Color(0xFF334155);
  static const Color slate600 = Color(0xFF475569);
  static const Color slate500 = Color(0xFF64748B);
  static const Color slate400 = Color(0xFF94A3B8);
  static const Color slate300 = Color(0xFFCBD5E1);
  static const Color slate200 = Color(0xFFE2E8F0);
  static const Color slate100 = Color(0xFFF1F5F9);
  static const Color slate50 = Color(0xFFF8FAFC);
  static const Color textSecondary = Color(0xFF64748B);

  // Status Badges & Cycle Colors
  static const Color blueCycle = Color(0xFF2563EB);
  static const Color emeraldStatus = Color(0xFF059669);
  static const Color emeraldDark = Color(0xFF047857);

  static const Color runningBg = Color(0xFFDBEAFE);
  static const Color runningText = Color(0xFF1E40AF);
  static const Color runningBorder = Color(0xFF93C5FD);
  static const Color runningDot = Color(0xFF2563EB);

  static const Color idleBg = Color(0xFFDCFCE7);
  static const Color idleText = Color(0xFF166534);
  static const Color idleBorder = Color(0xFF86EFAC);
  static const Color idleDot = Color(0xFF16A34A);

  static const Color errorBg = Color(0xFFFEE2E2);
  static const Color errorText = Color(0xFF991B1B);
  static const Color errorBorder = Color(0xFFFCA5A5);
  static const Color errorDot = Color(0xFFDC2626);
}

class AppTheme {
  // Use monospace font family string for data/status values
  static String? get monoFont => GoogleFonts.jetBrainsMono().fontFamily;

  static ThemeData get lightTheme {
    final textTheme = GoogleFonts.poppinsTextTheme();

    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: AppColors.canvas,
      colorScheme: ColorScheme.fromSeed(
        seedColor: AppColors.msuCrimson,
        primary: AppColors.msuCrimson,
        surface: AppColors.cardBg,
      ),
      textTheme: textTheme.copyWith(
        headlineLarge: GoogleFonts.poppins(
          fontWeight: FontWeight.w900,
          color: AppColors.textPrimary,
        ),
        headlineMedium: GoogleFonts.poppins(
          fontWeight: FontWeight.w900,
          color: AppColors.textPrimary,
        ),
        headlineSmall: GoogleFonts.poppins(
          fontWeight: FontWeight.w900,
          color: AppColors.textPrimary,
        ),
        titleLarge: GoogleFonts.poppins(
          fontWeight: FontWeight.w800,
          color: AppColors.textPrimary,
        ),
        titleMedium: GoogleFonts.poppins(
          fontWeight: FontWeight.w700,
          color: AppColors.textPrimary,
        ),
        bodyLarge: GoogleFonts.poppins(
          fontWeight: FontWeight.w500,
          color: AppColors.textPrimary,
        ),
        bodyMedium: GoogleFonts.poppins(
          fontWeight: FontWeight.w400,
          color: AppColors.textPrimary,
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.msuCrimson,
        foregroundColor: Colors.white,
        elevation: 2,
        titleTextStyle: GoogleFonts.poppins(
          fontSize: 18,
          fontWeight: FontWeight.w900,
          color: Colors.white,
        ),
      ),
    );
  }
}
