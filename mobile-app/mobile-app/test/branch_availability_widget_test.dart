import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/screens/branch_detail_screen.dart';
import 'package:mobile_app/services/public_api_service.dart';
import 'package:mobile_app/theme/spinsense_theme.dart';

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  testWidgets('separates Washers, Dryers, Washer/Dryers, labels simulation/stale, and guards Directions on mobile width', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final launchedUris = <Uri>[];
    final client = MockClient((req) async {
      return http.Response(
        jsonEncode({
          'branch': {
            'branch_id': 'b-1',
            'name': 'Glenmarie Branch',
            'organization_id': 'org-1',
            'organization_name': 'SpinCo',
            'address': '12 Jalan Persiaran',
            'city': 'Shah Alam',
            'weekly_hours': {
              'mon': [
                {'open': '20:00', 'close': '02:00'}
              ],
            },
            'timezone': 'Asia/Kuala_Lumpur',
            'latitude': null,
            'longitude': null,
            'service_status': 'open',
            'open_now': true,
            'regular_open_now': true,
            'hours_status': 'open_regular_hours',
          },
          'summary': {
            'washers_available': 1,
            'washers_total': 1,
            'dryers_available': 0,
            'dryers_total': 1,
            'washer_dryers_available': 1,
            'washer_dryers_total': 1,
            'total_available': 2,
            'total_machines': 3,
          },
          'machines': [
            {
              'machine_id': 'm-w1',
              'source_id': 'w1',
              'label': 'Washer #01',
              'device_type': 'washer',
              'capacity_kg': 15,
              'capabilities': {'supports_wash': true, 'supports_dry': false},
              'availability': 'available',
              'price_myr': 6.0,
              'price_currency': 'MYR',
              'programs': [
                {
                  'program_id': 'normal',
                  'name': 'Normal Wash',
                  'price_myr': 6.0,
                  'duration_seconds': 2100,
                }
              ],
              'source_kind': 'physical',
              'observed_at': '2026-11-18T06:00:00Z',
              'freshness': 'fresh',
            },
            {
              'machine_id': 'm-d1',
              'source_id': 'd1',
              'label': 'Dryer #01',
              'device_type': 'dryer',
              'capacity_kg': 14,
              'capabilities': {'supports_wash': false, 'supports_dry': true},
              'availability': 'in_use',
              'remaining_seconds_estimate': 0,
              'price_myr': null,
              'programs': [],
              'source_kind': 'simulated',
              'observed_at': '2026-11-18T06:00:00Z',
              'freshness': 'fresh',
            },
            {
              'machine_id': 'm-wd1',
              'source_id': 'wd1',
              'label': 'Combo #01',
              'device_type': 'washer_dryer',
              'capacity_kg': 18,
              'capabilities': {'supports_wash': true, 'supports_dry': true},
              'availability': 'available',
              'price_myr': 10.0,
              'price_currency': 'MYR',
              'programs': [],
              'source_kind': 'simulated',
              'observed_at': '2026-11-18T05:00:00Z',
              'freshness': 'stale',
            },
          ],
        }),
        200,
      );
    });

    await tester.pumpWidget(
      MaterialApp(
        theme: SpinSenseTheme.darkTheme,
        home: BranchDetailScreen(
          apiService: PublicApiService(baseUrl: 'https://x.test', client: client),
          branchId: 'b-1',
          launchExternalUrl: (uri) async {
            launchedUris.add(uri);
            return true;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Coordinates unavailable'), findsOneWidget);
    expect(find.text('20:00 - 02:00'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Washers'), 250);
    expect(find.text('Washers'), findsOneWidget);
    expect(find.text('Washer #01'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Dryers'), 250);
    expect(find.text('Dryers'), findsOneWidget);
    expect(
      find.text('Cycle finishing — awaiting machine ready confirmation'),
      findsOneWidget,
    );

    await tester.scrollUntilVisible(find.text('Combo #01'), 250);
    expect(find.text('Washer/Dryers'), findsOneWidget);
    expect(find.text('Combo #01'), findsOneWidget);
    expect(find.text('Wash cycle'), findsOneWidget);
    expect(find.text('Dry cycle'), findsOneWidget);
    expect(find.text('Simulated telemetry'), findsAtLeastNWidgets(1));

    await tester.scrollUntilVisible(find.text('Washer #01'), -250);
    await tester.tap(find.text('Washer #01'));
    await tester.pumpAndSettle();

    expect(find.text('Configured programs'), findsOneWidget);
    expect(find.text('Normal Wash'), findsOneWidget);
    expect(find.text('Report problem'), findsOneWidget);
    expect(launchedUris, isEmpty);
  });

  testWidgets('launches external Directions URI when coordinates exist and labels operator-closed branch', (
    tester,
  ) async {
    final launchedUris = <Uri>[];
    final client = MockClient((req) async {
      return http.Response(
        jsonEncode({
          'branch': {
            'branch_id': 'b-closed',
            'name': 'Section 7 Store',
            'organization_id': 'org-1',
            'organization_name': 'SpinCo',
            'address': '4 Jalan Plumbum',
            'city': 'Shah Alam',
            'timezone': 'Asia/Kuala_Lumpur',
            'latitude': 3.0738,
            'longitude': 101.4910,
            'service_status': 'closed',
            'open_now': false,
            'regular_open_now': true,
            'hours_status': 'closed_by_operator',
          },
          'summary': {
            'washers_available': 0,
            'washers_total': 1,
            'dryers_available': 0,
            'dryers_total': 0,
            'washer_dryers_available': 0,
            'washer_dryers_total': 0,
            'total_available': 0,
            'total_machines': 1,
          },
          'machines': [],
        }),
        200,
      );
    });

    await tester.pumpWidget(
      MaterialApp(
        theme: SpinSenseTheme.darkTheme,
        home: BranchDetailScreen(
          apiService: PublicApiService(baseUrl: 'https://x.test', client: client),
          branchId: 'b-closed',
          launchExternalUrl: (uri) async {
            launchedUris.add(uri);
            return true;
          },
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Temporarily closed by operator. Machines are marked unavailable regardless of prior status.'),
      findsOneWidget,
    );
    expect(find.text('Closed by operator'), findsOneWidget);
    expect(find.text('No public machines are published at this branch yet.'), findsOneWidget);

    await tester.tap(find.text('Directions'));
    await tester.pumpAndSettle();

    expect(launchedUris, hasLength(1));
    expect(launchedUris.first.scheme, 'geo');
    expect(launchedUris.first.toString(), contains('3.0738,101.491'));
  });
}
