import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/screens/report_problem_screen.dart';
import 'package:mobile_app/services/public_api_service.dart';
import 'package:mobile_app/theme/spinsense_theme.dart';

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  testWidgets('validates description & consent, preserves request_id UUID across network retry, and shows receipt on commit', (
    tester,
  ) async {
    final seenRequestIds = <String>[];
    var attempts = 0;

    final client = MockClient((req) async {
      attempts += 1;
      final body = jsonDecode(req.body) as Map<String, dynamic>;
      seenRequestIds.add(body['request_id'] as String);
      if (attempts == 1) {
        return http.Response('{"detail": "Temporary outage"}', 503);
      }
      return http.Response(
        jsonEncode({
          'report_id': 'rpt-uuid-1',
          'reference_code': 'RPT-ABCD1234',
          'received_at': '2026-11-18T06:15:00Z',
        }),
        201,
      );
    });

    await tester.pumpWidget(
      MaterialApp(
        theme: SpinSenseTheme.darkTheme,
        home: ReportProblemScreen(
          apiService: PublicApiService(baseUrl: 'https://x.test', client: client),
          branchId: 'b-1',
          branchName: 'City Hub',
          organizationName: 'Alpha Wash',
          machineId: 'm-1',
          machineLabel: 'Washer #01',
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Reported against a simulated demo machine.'), findsNothing);

    // Submit empty description triggers validation cleanly
    await tester.ensureVisible(find.text('Submit problem report'));
    await tester.tap(find.text('Submit problem report'));
    await tester.pumpAndSettle();
    expect(find.text('Enter at least 10 characters describing the issue.'), findsOneWidget);

    // Fill description + pick Email without ticking consent yet
    await tester.enterText(
      find.byType(TextFormField).first,
      'Washer drum failed to drain after spin cycle.',
    );
    await tester.ensureVisible(find.text('Email'));
    await tester.tap(find.text('Email'));
    await tester.pumpAndSettle();

    await tester.enterText(
      find.widgetWithText(TextFormField, 'Email address'),
      'guest@example.com',
    );
    await tester.ensureVisible(find.text('Submit problem report'));
    await tester.tap(find.text('Submit problem report'));
    await tester.pumpAndSettle();

    expect(
      find.text('Please tick the contact consent box before sharing an email or phone number.'),
      findsOneWidget,
    );
    expect(attempts, 0);

    // Tick consent, first attempt returns 503, then retry uses identical request_id UUID
    final consentCheckbox = find.byType(CheckboxListTile);
    await tester.ensureVisible(consentCheckbox);
    await tester.tap(consentCheckbox);
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Submit problem report'));
    await tester.tap(find.text('Submit problem report'));
    await tester.pumpAndSettle();

    expect(find.text('Retry sending report'), findsOneWidget);
    expect(attempts, 1);

    await tester.ensureVisible(find.text('Retry sending report'));
    await tester.tap(find.text('Retry sending report'));
    await tester.pumpAndSettle();

    expect(attempts, 2);
    expect(seenRequestIds, hasLength(2));
    expect(seenRequestIds[0], seenRequestIds[1]);
    expect(find.text('Report received'), findsOneWidget);
    expect(find.text('RPT-ABCD1234'), findsOneWidget);
  });

  testWidgets('displays 429 retry cooldown and 409 submission-ID conflict recovery', (
    tester,
  ) async {
    var mode = 'rate_limit';
    final seenIds = <String>[];

    final client = MockClient((req) async {
      final body = jsonDecode(req.body) as Map<String, dynamic>;
      seenIds.add(body['request_id'] as String);
      if (mode == 'rate_limit') {
        return http.Response(
          jsonEncode({'detail': 'Too many problem reports submitted.'}),
          429,
          headers: {'retry-after': '90'},
        );
      }
      if (mode == 'conflict') {
        return http.Response(
          jsonEncode({'detail': 'Request ID reused with different details.'}),
          409,
        );
      }
      return http.Response(
        jsonEncode({
          'report_id': 'rpt-2',
          'reference_code': 'RPT-NEWID999',
          'received_at': '2026-11-18T06:20:00Z',
        }),
        201,
      );
    });

    await tester.pumpWidget(
      MaterialApp(
        theme: SpinSenseTheme.darkTheme,
        home: ReportProblemScreen(
          apiService: PublicApiService(baseUrl: 'https://x.test', client: client),
          branchId: 'b-1',
          branchName: 'City Hub',
          organizationName: 'Alpha Wash',
          machineId: 'm-1',
          machineLabel: 'Washer #01',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(
      find.byType(TextFormField).first,
      'Cycle stopped unexpectedly right after water fill.',
    );

    await tester.ensureVisible(find.text('Submit problem report'));
    await tester.tap(find.text('Submit problem report'));
    await tester.pumpAndSettle();

    expect(
      find.textContaining('Retry available in 90 seconds.'),
      findsOneWidget,
    );

    mode = 'conflict';
    await tester.ensureVisible(find.text('Submit problem report'));
    await tester.tap(find.text('Submit problem report'));
    await tester.pumpAndSettle();

    expect(find.text('Reset submission ID'), findsOneWidget);

    mode = 'ok';
    await tester.ensureVisible(find.text('Reset submission ID'));
    await tester.tap(find.text('Reset submission ID'));
    await tester.pumpAndSettle();

    await tester.ensureVisible(find.text('Submit problem report'));
    await tester.tap(find.text('Submit problem report'));
    await tester.pumpAndSettle();

    expect(seenIds, hasLength(3));
    expect(seenIds[0], seenIds[1]);
    expect(seenIds[2], isNot(seenIds[1]));
    expect(find.text('RPT-NEWID999'), findsOneWidget);
  });
}
