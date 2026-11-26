import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/screens/discovery_screen.dart';
import 'package:mobile_app/services/public_api_service.dart';
import 'package:mobile_app/theme/spinsense_theme.dart';
import 'package:mobile_app/widgets/spinsense_brand_mark.dart';

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

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  testWidgets('Guest discovery app shell launches without login prompt or overflow on 320px', (
    WidgetTester tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final mockClient = MockClient((request) async {
      if (request.url.path == '/public/organizations') {
        return http.Response('{"organizations": []}', 200);
      }
      return http.Response('{"branches": [], "next_cursor": null}', 200);
    });

    await tester.pumpWidget(
      MaterialApp(
        theme: SpinSenseTheme.darkTheme,
        home: DiscoveryScreen(
          apiService: PublicApiService(
            baseUrl: 'https://example.invalid',
            client: mockClient,
          ),
          tileProvider: _BlankMemoryTileProvider(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(SpinSenseBrandMark), findsOneWidget);
    expect(find.text('SpinSense'), findsOneWidget);
    expect(find.text('Near me'), findsOneWidget);
    expect(find.text('No laundromat branches are published right now.'), findsOneWidget);
    expect(find.textContaining('Sign in'), findsNothing);
    expect(find.textContaining('MSU'), findsNothing);
  });
}
