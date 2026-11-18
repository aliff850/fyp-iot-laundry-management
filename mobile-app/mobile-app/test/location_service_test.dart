import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/models/public_models.dart';
import 'package:mobile_app/services/location_service.dart';

void main() {
  group('Location distance & schedule formatters', () {
    test('calculates sensible haversine distance and compact display labels', () {
      // MSU Shah Alam (3.0565, 101.5540) to KLCC (3.1579, 101.7116) ~ 20.8 km
      final km = haversineDistanceKm(3.0565, 101.5540, 3.1579, 101.7116);
      expect(km, greaterThan(18.0));
      expect(km, lessThan(24.0));
      expect(formatDistanceKm(km), endsWith(' km'));

      expect(formatDistanceKm(0.42), '420 m');
    });

    test('HoursStatus preserves operator override vs unknown vs regular open/closed', () {
      expect(
        HoursStatus.fromWire('open_regular_hours').displayLabel,
        'Open now (regular hours)',
      );
      expect(
        HoursStatus.fromWire('closed_regular_hours').displayLabel,
        'Closed (regular hours)',
      );
      expect(
        HoursStatus.fromWire('closed_by_operator').displayLabel,
        'Closed by operator',
      );
      expect(
        HoursStatus.fromWire('hours_unknown').displayLabel,
        'Hours unknown',
      );
      expect(
        HoursStatus.fromWire(null),
        HoursStatus.hoursUnknown,
      );
    });
  });
}
