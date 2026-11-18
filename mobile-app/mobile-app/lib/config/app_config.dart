/// Runtime environment configuration supplied at build/run time via `--dart-define`.
class AppConfig {
  const AppConfig._();

  static const String _rawApiBaseUrl = String.fromEnvironment(
    'SPINSENSE_API_URL',
    defaultValue: 'https://esp32-gas-api.onrender.com',
  );

  static const String osmTileUrlTemplate = String.fromEnvironment(
    'OSM_TILE_URL_TEMPLATE',
    defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  );

  static const String osmTileUserAgentPackageName = String.fromEnvironment(
    'OSM_TILE_USER_AGENT',
    defaultValue: 'com.smartlaundry.mobile_app',
  );

  static String get apiBaseUrl {
    final trimmed = _rawApiBaseUrl.trim();
    if (trimmed.isEmpty) {
      return 'https://esp32-gas-api.onrender.com';
    }
    return trimmed.endsWith('/') ? trimmed.substring(0, trimmed.length - 1) : trimmed;
  }
}
