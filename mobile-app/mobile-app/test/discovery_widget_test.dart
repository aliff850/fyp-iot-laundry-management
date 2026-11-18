import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/screens/discovery_screen.dart';
import 'package:mobile_app/services/location_service.dart';
import 'package:mobile_app/services/public_api_service.dart';
import 'package:mobile_app/theme/spinsense_theme.dart';

class _FakeLocationService implements LocationService {
  _FakeLocationService(this.result);
  final LocationLookupResult result;
  int calls = 0;

  @override
  Future<LocationLookupResult> requestForegroundLocation() async {
    calls += 1;
    return result;
  }

  @override
  Future<bool> openAppSettings() async => true;

  @override
  Future<bool> openLocationSettings() async => true;
}

class _BlankMemoryTileProvider extends TileProvider {
  static final Uint8List _transparentPng = Uint8List.fromList(<int>[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
    0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
  ]);

  @override
  ImageProvider getImage(TileCoordinates coordinates, TileLayer options) {
    return MemoryImage(_transparentPng);
  }
}

class _FailingAsyncImageProvider extends ImageProvider<_FailingAsyncImageProvider> {
  const _FailingAsyncImageProvider(this.coordinates);
  final TileCoordinates coordinates;

  @override
  Future<_FailingAsyncImageProvider> obtainKey(ImageConfiguration configuration) {
    return SynchronousFuture<_FailingAsyncImageProvider>(this);
  }

  @override
  ImageStreamCompleter loadImage(
    _FailingAsyncImageProvider key,
    ImageDecoderCallback decode,
  ) {
    return OneFrameImageStreamCompleter(
      Future<ImageInfo>.error(Exception('Tile server unreachable')),
    );
  }

  @override
  bool operator ==(Object other) =>
      other is _FailingAsyncImageProvider && other.coordinates == coordinates;

  @override
  int get hashCode => coordinates.hashCode;
}

class _FailingTileProvider extends TileProvider {
  @override
  ImageProvider getImage(TileCoordinates coordinates, TileLayer options) {
    return _FailingAsyncImageProvider(coordinates);
  }
}

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  final multiOrgResponse = jsonEncode({
    'branches': [
      {
        'branch_id': 'b-klcc',
        'name': 'City Hub',
        'organization_id': 'org-a',
        'organization_name': 'Alpha Wash',
        'organization_logo_url': null,
        'city': 'Kuala Lumpur',
        'latitude': 3.1579,
        'longitude': 101.7116,
        'timezone': 'Asia/Kuala_Lumpur',
        'service_status': 'open',
        'open_now': true,
        'regular_open_now': true,
        'hours_status': 'open_regular_hours',
        'availability': {
          'washers_available': 2,
          'washers_total': 4,
          'dryers_available': 1,
          'dryers_total': 2,
          'washer_dryers_available': 1,
          'washer_dryers_total': 1,
          'total_available': 4,
          'total_machines': 7,
        },
      },
      {
        'branch_id': 'b-nocoord',
        'name': 'Subang Annex',
        'organization_id': 'org-b',
        'organization_name': 'Beta Suds',
        'organization_logo_url': null,
        'city': 'Subang Jaya',
        'latitude': null,
        'longitude': null,
        'timezone': 'Asia/Kuala_Lumpur',
        'service_status': 'open',
        'open_now': null,
        'regular_open_now': null,
        'hours_status': 'hours_unknown',
        'availability': {
          'washers_available': 1,
          'washers_total': 2,
          'dryers_available': 0,
          'dryers_total': 1,
          'washer_dryers_available': 0,
          'washer_dryers_total': 0,
          'total_available': 1,
          'total_machines': 3,
        },
      },
    ],
    'next_cursor': null,
  });

  MockClient twoPageClient() {
    return MockClient((req) async {
      if (req.url.path == '/public/organizations') {
        return http.Response('{"organizations": []}', 200);
      }
      final cursor = req.url.queryParameters['cursor'];
      if (cursor == null) {
        return http.Response(
          jsonEncode({
            'branches': [
              {
                'branch_id': 'far-branch',
                'name': 'Farther Branch',
                'organization_id': 'org-a',
                'organization_name': 'Alpha Wash',
                'latitude': 3.2500,
                'longitude': 101.8000,
                'timezone': 'Asia/Kuala_Lumpur',
                'service_status': 'open',
                'hours_status': 'open_regular_hours',
                'availability': {
                  'washers_available': 1,
                  'washers_total': 1,
                  'dryers_available': 0,
                  'dryers_total': 0,
                  'washer_dryers_available': 0,
                  'washer_dryers_total': 0,
                  'total_available': 1,
                  'total_machines': 1,
                },
              },
            ],
            'next_cursor': 'page-2',
          }),
          200,
        );
      }
      return http.Response(
        jsonEncode({
          'branches': [
            {
              'branch_id': 'near-branch',
              'name': 'Nearest Later Page Branch',
              'organization_id': 'org-b',
              'organization_name': 'Beta Suds',
              'latitude': 3.0570,
              'longitude': 101.5545,
              'timezone': 'Asia/Kuala_Lumpur',
              'service_status': 'open',
              'hours_status': 'open_regular_hours',
              'availability': {
                'washers_available': 2,
                'washers_total': 2,
                'dryers_available': 0,
                'dryers_total': 0,
                'washer_dryers_available': 0,
                'washer_dryers_total': 0,
                'total_available': 2,
                'total_machines': 2,
              },
            },
          ],
          'next_cursor': null,
        }),
        200,
      );
    });
  }

  testWidgets('renders multiple orgs, initials fallback, missing coordinates, OSM attribution, and no eager GPS', (
    tester,
  ) async {
    final location = _FakeLocationService(
      const LocationLookupResult(outcome: LocationOutcome.denied),
    );
    final client = MockClient((req) async {
      if (req.url.path == '/public/organizations') {
        return http.Response(
          jsonEncode({
            'organizations': [
              {'id': 'org-a', 'name': 'Alpha Wash'},
              {'id': 'org-b', 'name': 'Beta Suds'},
            ],
          }),
          200,
        );
      }
      return http.Response(multiOrgResponse, 200);
    });

    await tester.pumpWidget(
      MaterialApp(
        theme: SpinSenseTheme.darkTheme,
        home: DiscoveryScreen(
          apiService: PublicApiService(baseUrl: 'https://x.test', client: client),
          locationService: location,
          tileProvider: _BlankMemoryTileProvider(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(location.calls, 0);
    expect(find.text('City Hub'), findsOneWidget);
    expect(find.text('Alpha Wash'), findsOneWidget);
    expect(find.text('AW'), findsAtLeastNWidgets(1));
    expect(find.text('Subang Annex'), findsOneWidget);
    expect(find.text('No map pin'), findsOneWidget);
    expect(find.text('© OpenStreetMap contributors'), findsOneWidget);
  });

  testWidgets('shows non-blocking tile failure notice while keeping list visible', (
    tester,
  ) async {
    final client = MockClient((req) async {
      if (req.url.path == '/public/organizations') {
        return http.Response('{"organizations": []}', 200);
      }
      return http.Response(multiOrgResponse, 200);
    });

    await tester.pumpWidget(
      MaterialApp(
        theme: SpinSenseTheme.darkTheme,
        home: DiscoveryScreen(
          apiService: PublicApiService(baseUrl: 'https://x.test', client: client),
          tileProvider: _FailingTileProvider(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('Map tiles failed to load. You can still browse all branches from the list.'),
      findsOneWidget,
    );
    expect(find.text('City Hub'), findsOneWidget);
    expect(find.text('Subang Annex'), findsOneWidget);
  });

  testWidgets('Near me handles permission denial cleanly while retaining list', (
    tester,
  ) async {
    final deniedLocation = _FakeLocationService(
      const LocationLookupResult(
        outcome: LocationOutcome.denied,
        message: 'Location permission declined.',
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: SpinSenseTheme.darkTheme,
        home: DiscoveryScreen(
          apiService: PublicApiService(
            baseUrl: 'https://x.test',
            client: twoPageClient(),
          ),
          locationService: deniedLocation,
          tileProvider: _BlankMemoryTileProvider(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Near me'));
    await tester.pumpAndSettle();

    expect(find.text('Location permission declined.'), findsOneWidget);
    expect(find.text('Farther Branch'), findsOneWidget);
  });

  testWidgets('Near me loads remaining pages before marking and sorting nearest branch', (
    tester,
  ) async {
    final grantedLocation = _FakeLocationService(
      const LocationLookupResult(
        outcome: LocationOutcome.granted,
        coordinates: CustomerCoordinates(latitude: 3.0565, longitude: 101.5540),
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: SpinSenseTheme.darkTheme,
        home: DiscoveryScreen(
          apiService: PublicApiService(
            baseUrl: 'https://x.test',
            client: twoPageClient(),
          ),
          locationService: grantedLocation,
          tileProvider: _BlankMemoryTileProvider(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Near me'));
    await tester.pumpAndSettle();

    expect(find.text('Nearest Later Page Branch'), findsOneWidget);
    expect(find.textContaining('Nearest ('), findsOneWidget);
  });

  testWidgets('keeps request failure distinct from empty directory and supports Clear filters', (
    tester,
  ) async {
    var failRequests = true;
    final client = MockClient((req) async {
      if (req.url.path == '/public/organizations') {
        return http.Response('{"organizations": []}', 200);
      }
      if (failRequests) {
        return http.Response('{"detail": "Database down"}', 503);
      }
      if (req.url.queryParameters['q'] == 'Unmatched') {
        return http.Response('{"branches": [], "next_cursor": null}', 200);
      }
      return http.Response(multiOrgResponse, 200);
    });

    await tester.pumpWidget(
      MaterialApp(
        theme: SpinSenseTheme.darkTheme,
        home: DiscoveryScreen(
          apiService: PublicApiService(baseUrl: 'https://x.test', client: client),
          tileProvider: _BlankMemoryTileProvider(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Database down'), findsOneWidget);
    expect(find.text('Retry'), findsOneWidget);

    failRequests = false;
    await tester.tap(find.text('Retry'));
    await tester.pumpAndSettle();
    expect(find.text('City Hub'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'Unmatched');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();

    expect(
      find.text('No branches match the current search or filters.'),
      findsNWidgets(2),
    );
    await tester.tap(find.widgetWithText(OutlinedButton, 'Clear filters'));
    await tester.pumpAndSettle();

    expect(find.text('City Hub'), findsOneWidget);
  });

  testWidgets('shows honest empty-directory banner on mobile Map pane when zero branches are published', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final client = MockClient((req) async {
      if (req.url.path == '/public/organizations') {
        return http.Response('{"organizations": []}', 200);
      }
      return http.Response('{"branches": [], "next_cursor": null}', 200);
    });

    await tester.pumpWidget(
      MaterialApp(
        theme: SpinSenseTheme.darkTheme,
        home: DiscoveryScreen(
          apiService: PublicApiService(baseUrl: 'https://x.test', client: client),
          tileProvider: _BlankMemoryTileProvider(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Map'));
    await tester.pumpAndSettle();

    expect(
      find.text('No laundromat branches are published right now.'),
      findsOneWidget,
    );
    expect(find.text('View list'), findsOneWidget);
  });
}
