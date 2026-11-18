import 'dart:async';
import 'dart:math' as math;
import 'package:geolocator/geolocator.dart';

enum LocationOutcome {
  granted,
  denied,
  deniedForever,
  serviceDisabled,
  timeout,
  error,
}

class CustomerCoordinates {
  const CustomerCoordinates({
    required this.latitude,
    required this.longitude,
  });

  final double latitude;
  final double longitude;
}

class LocationLookupResult {
  const LocationLookupResult({
    required this.outcome,
    this.coordinates,
    this.message,
  });

  final LocationOutcome outcome;
  final CustomerCoordinates? coordinates;
  final String? message;

  bool get isGranted => outcome == LocationOutcome.granted && coordinates != null;
}

abstract class LocationService {
  Future<LocationLookupResult> requestForegroundLocation();
  Future<bool> openLocationSettings();
  Future<bool> openAppSettings();
}

class GeolocatorLocationService implements LocationService {
  const GeolocatorLocationService({
    this.timeout = const Duration(seconds: 10),
  });

  final Duration timeout;

  @override
  Future<LocationLookupResult> requestForegroundLocation() async {
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        return const LocationLookupResult(
          outcome: LocationOutcome.serviceDisabled,
          message:
              'Location services are turned off. Enable GPS to sort by nearest branch, or continue browsing.',
        );
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied) {
        return const LocationLookupResult(
          outcome: LocationOutcome.denied,
          message:
              'Location permission was declined. You can keep searching and browsing all branches.',
        );
      }

      if (permission == LocationPermission.deniedForever) {
        return const LocationLookupResult(
          outcome: LocationOutcome.deniedForever,
          message:
              'Location access is blocked in Android settings. Open app settings to allow foreground location.',
        );
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.medium,
        ),
      ).timeout(timeout);

      return LocationLookupResult(
        outcome: LocationOutcome.granted,
        coordinates: CustomerCoordinates(
          latitude: position.latitude,
          longitude: position.longitude,
        ),
      );
    } on TimeoutException {
      return const LocationLookupResult(
        outcome: LocationOutcome.timeout,
        message: 'Could not get a GPS fix in time. Try again outdoors or continue browsing.',
      );
    } catch (_) {
      return const LocationLookupResult(
        outcome: LocationOutcome.error,
        message: 'Location lookup failed. Normal branch browsing remains available.',
      );
    }
  }

  @override
  Future<bool> openLocationSettings() => Geolocator.openLocationSettings();

  @override
  Future<bool> openAppSettings() => Geolocator.openAppSettings();
}

/// Computes great-circle distance in kilometers without transmitting coordinates.
double haversineDistanceKm(
  double lat1,
  double lon1,
  double lat2,
  double lon2,
) {
  const earthRadiusKm = 6371.0;
  final dLat = _degToRad(lat2 - lat1);
  final dLon = _degToRad(lon2 - lon1);
  final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
      math.cos(_degToRad(lat1)) *
          math.cos(_degToRad(lat2)) *
          math.sin(dLon / 2) *
          math.sin(dLon / 2);
  final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
  return earthRadiusKm * c;
}

double _degToRad(double deg) => deg * (math.pi / 180.0);

String formatDistanceKm(double km) {
  if (km < 1.0) {
    final meters = (km * 1000).round();
    return '$meters m';
  }
  return '${km.toStringAsFixed(1)} km';
}
