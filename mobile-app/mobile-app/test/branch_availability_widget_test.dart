import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/models/public_models.dart';
import 'package:mobile_app/screens/branch_detail_screen.dart';
import 'package:mobile_app/services/public_api_service.dart';
import 'package:mobile_app/theme/spinsense_theme.dart';
import 'package:mobile_app/widgets/branch_banner_image.dart';
import 'package:mobile_app/widgets/branch_images_gallery.dart';
import 'package:mobile_app/widgets/peak_demand_hours_card.dart';
import 'package:mobile_app/widgets/weekly_hours_card.dart';

void main() {
  setUpAll(() {
    GoogleFonts.config.allowRuntimeFetching = false;
  });

  testWidgets('separates Washers, Dryers, Washer/Dryers, labels stale machines Offline without telemetry clutter, and guards Directions on mobile width', (
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
            'washer_dryers_available': 0,
            'washer_dryers_total': 1,
            'total_available': 1,
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
              'availability': 'unknown',
              'availability_reason': 'stale_or_offline',
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
    expect(find.text('Offline'), findsOneWidget);

    for (final forbidden in const [
      'Unknown',
      'Reading is stale or offline',
      'Simulated telemetry',
      'Physical telemetry',
      'Vendor telemetry',
      'Source',
      'Last reading',
    ]) {
      expect(find.text(forbidden), findsNothing);
    }

    // Open offline machine sheet and verify Freshness/Last update/Source/stale text are absent.
    await tester.tap(find.text('Combo #01'));
    await tester.pumpAndSettle();
    expect(find.text('Offline'), findsAtLeastNWidgets(1));
    for (final forbidden in const [
      'Freshness',
      'Last update',
      'Simulated telemetry',
      'Physical telemetry',
      'Reading is stale or offline',
    ]) {
      expect(find.text(forbidden), findsNothing);
    }
    await tester.tap(find.byTooltip('Close machine details'));
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.text('Washer #01'), -250);
    await tester.tap(find.text('Washer #01'));
    await tester.pumpAndSettle();

    expect(find.text('Configured programs'), findsOneWidget);
    expect(find.text('Normal Wash'), findsOneWidget);
    expect(find.text('Report problem'), findsOneWidget);
    expect(find.text('Freshness'), findsNothing);
    expect(find.text('Last update'), findsNothing);
    expect(launchedUris, isEmpty);
  });

  testWidgets('displays Branch closed by operator reason on machine card when operator-closed', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final client = MockClient((req) async {
      return http.Response(
        jsonEncode({
          'branch': {
            'branch_id': 'b-closed-2',
            'name': 'Compact Branch',
            'organization_id': 'org-1',
            'organization_name': 'SpinCo',
            'timezone': 'Asia/Kuala_Lumpur',
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
          'machines': [
            {
              'machine_id': 'm-w1',
              'source_id': 'w1',
              'label': 'Washer #01',
              'device_type': 'washer',
              'capacity_kg': 10,
              'capabilities': {'supports_wash': true, 'supports_dry': false},
              'availability': 'unknown',
              'availability_reason': 'branch_closed',
              'programs': [],
              'source_kind': 'physical',
              'freshness': 'fresh',
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
          branchId: 'b-closed-2',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.text('Washer #01'), 250);
    expect(find.text('Offline'), findsOneWidget);
    expect(find.text('Branch closed by operator'), findsOneWidget);
    expect(tester.takeException(), isNull);
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

    await tester.tap(find.text('Directions'));
    await tester.pumpAndSettle();

    expect(launchedUris, hasLength(1));
    expect(launchedUris.first.scheme, 'geo');
    expect(launchedUris.first.toString(), contains('3.0738,101.491'));

    await tester.scrollUntilVisible(
      find.text('No public machines are published at this branch yet.'),
      150,
    );
    expect(find.text('No public machines are published at this branch yet.'), findsOneWidget);

    await tester.scrollUntilVisible(find.text('Images'), 150);
    expect(find.text('Images'), findsOneWidget);
    expect(find.text('No images available'), findsOneWidget);
  });

  testWidgets('BranchImagesGallery handles empty, single-image, and multi-image arrow carousel cleanly on mobile widths', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    Widget fakePhotoBuilder(BuildContext context, PublicBranchImage img, BoxFit fit) {
      return ColoredBox(
        color: SpinSenseColors.navy,
        child: Center(
          child: Text('Photo:${img.id}'),
        ),
      );
    }

    // 1. Single image: displays image cleanly with no arrow controls in viewer
    await tester.pumpWidget(
      MaterialApp(
        theme: SpinSenseTheme.darkTheme,
        home: Scaffold(
          body: BranchImagesGallery(
            branchName: 'Test Branch 3',
            images: const [
              PublicBranchImage(id: 'solo', imageUrl: 'https://img.test/solo.jpg'),
            ],
            imageBuilder: fakePhotoBuilder,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Images'), findsOneWidget);
    expect(find.text('Photo:solo'), findsOneWidget);
    expect(find.text('1 / 1'), findsNothing);
    expect(find.text('1 photos'), findsNothing);

    await tester.tap(find.text('Photo:solo'));
    await tester.pumpAndSettle();
    expect(find.byTooltip('Close gallery'), findsOneWidget);
    expect(find.byTooltip('Previous image'), findsNothing);
    expect(find.byTooltip('Next image'), findsNothing);

    await tester.tap(find.byTooltip('Close gallery'));
    await tester.pumpAndSettle();

    // 2. Multiple images: shows cover photo first + opens interactive left/right arrow viewer
    await tester.pumpWidget(
      MaterialApp(
        theme: SpinSenseTheme.darkTheme,
        home: Scaffold(
          body: BranchImagesGallery(
            branchName: 'Test Branch 3',
            images: const [
              PublicBranchImage(id: 'one', imageUrl: 'https://img.test/1.jpg'),
              PublicBranchImage(id: 'two', imageUrl: 'https://img.test/2.jpg'),
              PublicBranchImage(id: 'three', imageUrl: 'https://img.test/3.jpg'),
            ],
            imageBuilder: fakePhotoBuilder,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('3 photos'), findsOneWidget);
    expect(find.text('1 / 3'), findsOneWidget);
    expect(find.text('Photo:one'), findsOneWidget);

    await tester.tap(find.text('Photo:one'));
    await tester.pumpAndSettle();

    expect(find.byTooltip('Previous image'), findsOneWidget);
    expect(find.byTooltip('Next image'), findsOneWidget);
    expect(find.text('1 / 3'), findsAtLeastNWidgets(1));

    await tester.tap(find.byTooltip('Next image'));
    await tester.pumpAndSettle();
    expect(find.text('2 / 3'), findsAtLeastNWidgets(1));
    expect(find.text('Photo:two'), findsOneWidget);

    await tester.tap(find.byTooltip('Previous image'));
    await tester.pumpAndSettle();
    expect(find.text('1 / 3'), findsAtLeastNWidgets(1));

    await tester.tap(find.byTooltip('Close gallery'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('BranchDetailScreen shows cover banner above header title while retaining all photos in Images gallery', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 900);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    final client = MockClient((req) async {
      return http.Response(
        jsonEncode({
          'branch': {
            'branch_id': 'b-photos',
            'name': 'Test Branch 3',
            'organization_id': 'org-1',
            'organization_name': 'SpinCo',
            'timezone': 'Asia/Kuala_Lumpur',
            'service_status': 'open',
            'hours_status': 'open_regular_hours',
            'images': [
              {'id': 'img-1', 'image_url': 'https://img.test/cover.jpg'},
              {'id': 'img-2', 'image_url': 'https://img.test/inside.jpg'},
            ],
          },
          'summary': {
            'washers_available': 0,
            'washers_total': 0,
            'dryers_available': 0,
            'dryers_total': 0,
            'washer_dryers_available': 0,
            'washer_dryers_total': 0,
            'total_available': 0,
            'total_machines': 0,
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
          branchId: 'b-photos',
        ),
      ),
    );
    await tester.pumpAndSettle();

    final bannerFinder = find.byType(BranchBannerImage);
    expect(bannerFinder, findsOneWidget);
    final bannerRect = tester.getRect(bannerFinder);
    final titleFinder = find.descendant(
      of: find.byType(ListView),
      matching: find.text('Test Branch 3'),
    );
    expect(bannerRect.bottom, lessThanOrEqualTo(tester.getRect(titleFinder).top));

    // Tap header banner opens full-screen gallery showing all 2 images (including header photo)
    await tester.tap(bannerFinder);
    await tester.pumpAndSettle();
    expect(find.byTooltip('Close gallery'), findsOneWidget);
    expect(find.byTooltip('Next image'), findsOneWidget);
    expect(find.text('1 / 2'), findsAtLeastNWidgets(1));
    await tester.tap(find.byTooltip('Close gallery'));
    await tester.pumpAndSettle();

    // Gallery section beneath Opening hours still shows both images ('2 photos' and '1 / 2')
    await tester.scrollUntilVisible(find.text('Images'), 150);
    expect(find.text('Images'), findsOneWidget);
    expect(find.text('2 photos'), findsOneWidget);
    expect(find.text('1 / 2'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('PeakDemandHoursCard shows empty message when no data and interactive Overall/Weekday bars on 320px width', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    // 1. Empty branch history state on BranchDetailScreen beneath Opening hours
    final emptyClient = MockClient((req) async {
      return http.Response(
        jsonEncode({
          'branch': {
            'branch_id': 'b-empty-peak',
            'name': 'Fresh Store',
            'organization_id': 'org-1',
            'organization_name': 'SpinCo',
            'timezone': 'Asia/Kuala_Lumpur',
            'service_status': 'open',
            'hours_status': 'open_regular_hours',
          },
          'summary': {},
          'machines': [],
          'peak_hours': {
            'has_data': false,
            'window_days': 90,
            'timezone': 'Asia/Kuala_Lumpur',
            'default_bucket': 'overall',
            'buckets': {},
          },
        }),
        200,
      );
    });

    await tester.pumpWidget(
      MaterialApp(
        theme: SpinSenseTheme.darkTheme,
        home: BranchDetailScreen(
          apiService: PublicApiService(baseUrl: 'https://x.test', client: emptyClient),
          branchId: 'b-empty-peak',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.text('Peak demand hours'), 150);
    expect(find.text('Peak demand hours'), findsOneWidget);
    expect(
      find.text('Not enough usage history yet to estimate peak hours.'),
      findsOneWidget,
    );
    expect(
      tester.getRect(find.text('Peak demand hours')).top,
      greaterThan(tester.getRect(find.text('Opening hours')).top),
    );

    // 2. Populated profile: default 'sat', switches to 'Overall' and sparse 'Mon' cleanly
    final populatedClient = MockClient((req) async {
      return http.Response(
        jsonEncode({
          'branch': {
            'branch_id': 'b-busy-peak',
            'name': 'Peak Store',
            'organization_id': 'org-1',
            'organization_name': 'SpinCo',
            'timezone': 'Asia/Kuala_Lumpur',
            'service_status': 'open',
            'hours_status': 'open_regular_hours',
          },
          'summary': {},
          'machines': [],
          'peak_hours': {
            'has_data': true,
            'window_days': 90,
            'timezone': 'Asia/Kuala_Lumpur',
            'default_bucket': 'sat',
            'buckets': {
              'overall': {
                'has_data': true,
                'peak_hour': 19,
                'peak_hour_label': '19:00',
                'hours': [
                  {'hour': 10, 'hour_label': '10:00', 'busy_pct': 20, 'level': 'quiet'},
                  {'hour': 19, 'hour_label': '19:00', 'busy_pct': 100, 'level': 'busy'},
                ],
              },
              'sat': {
                'has_data': true,
                'peak_hour': 20,
                'peak_hour_label': '20:00',
                'hours': [
                  {'hour': 10, 'hour_label': '10:00', 'busy_pct': 25, 'level': 'quiet'},
                  {'hour': 20, 'hour_label': '20:00', 'busy_pct': 100, 'level': 'busy'},
                ],
              },
              'mon': {
                'has_data': false,
                'peak_hour': null,
                'peak_hour_label': null,
                'hours': [],
              },
            },
          },
        }),
        200,
      );
    });

    await tester.pumpWidget(
      MaterialApp(
        theme: SpinSenseTheme.darkTheme,
        home: BranchDetailScreen(
          key: const ValueKey('busy-peak'),
          apiService: PublicApiService(baseUrl: 'https://x.test', client: populatedClient),
          branchId: 'b-busy-peak',
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.scrollUntilVisible(find.text('Peak 20:00'), 150);
    expect(find.text('Peak 20:00'), findsOneWidget);
    expect(find.text('Saturday'), findsOneWidget);
    expect(find.text('Usually busiest (100%)'), findsOneWidget);

    // Tap 10:00 bar to inspect quieter hour
    final bar10 = find.bySemanticsLabel('10:00 Quiet 25 percent');
    await tester.ensureVisible(bar10);
    await tester.pumpAndSettle();
    await tester.tap(bar10);
    await tester.pumpAndSettle();
    expect(find.text('Quiet (25%)'), findsOneWidget);

    // Open dropdown and select Monday (no history yet) -> shows clear empty weekday fallback + View Overall CTA
    final dayDropdown = find.descendant(
      of: find.byType(PeakDemandHoursCard),
      matching: find.byType(DropdownButton<String>),
    );
    await tester.ensureVisible(dayDropdown);
    await tester.pumpAndSettle();
    await tester.tap(dayDropdown);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Monday').last);
    await tester.pumpAndSettle();
    expect(
      find.text('No activity recorded for this day yet. Switch to Overall to view combined peak hours.'),
      findsOneWidget,
    );

    final viewOverall = find.text('View Overall');
    await tester.ensureVisible(viewOverall);
    await tester.tap(viewOverall);
    await tester.pumpAndSettle();
    expect(find.text('Peak 19:00'), findsOneWidget);
    expect(
      find.descendant(
        of: dayDropdown,
        matching: find.text('Overall'),
      ),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('WeeklyHoursCard enlarges opening hours, hides internal setup text, and uses customer availability labels at 320px width', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.reset);

    // 1. Missing hours state: shows customer-facing unavailability without internal config phrasing
    await tester.pumpWidget(
      MaterialApp(
        theme: SpinSenseTheme.darkTheme,
        home: const Scaffold(
          body: Padding(
            padding: EdgeInsets.all(16),
            child: WeeklyHoursCard(
              hoursStatus: HoursStatus.hoursUnknown,
              timezone: 'Asia/Kuala_Lumpur',
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Hours unavailable'), findsOneWidget);
    expect(find.text('Operating hours unavailable'), findsOneWidget);
    expect(
      find.textContaining('Structured weekly hours have not been configured'),
      findsNothing,
    );
    expect(find.text('Hours unknown'), findsNothing);
    expect(tester.takeException(), isNull);

    // 2. 24-hour branch renders prominently (>= 18px) with Open now status
    await tester.pumpWidget(
      MaterialApp(
        theme: SpinSenseTheme.darkTheme,
        home: const Scaffold(
          body: Padding(
            padding: EdgeInsets.all(16),
            child: WeeklyHoursCard(
              hoursStatus: HoursStatus.openRegularHours,
              timezone: 'Asia/Kuala_Lumpur',
              openingHoursText: '24 Hours',
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Open now (regular hours)'), findsOneWidget);
    final textWidget = tester.widget<Text>(find.text('24 Hours'));
    expect(textWidget.style?.fontSize, greaterThanOrEqualTo(18));
    expect(find.text('Hours unavailable'), findsNothing);
    expect(find.text('Operating hours unavailable'), findsNothing);
    expect(
      find.textContaining('Structured weekly hours have not been configured'),
      findsNothing,
    );
    expect(tester.takeException(), isNull);
  });
}
