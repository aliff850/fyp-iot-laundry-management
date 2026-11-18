import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_app/models/public_models.dart';
import 'package:mobile_app/services/public_api_service.dart';

void main() {
  group('PublicApiService contracts', () {
    test('forwards search, filters, and cursor pagination parameters', () async {
      final capturedUris = <Uri>[];
      final client = MockClient((request) async {
        capturedUris.add(request.url);
        if (request.url.path == '/public/branches') {
          final cursor = request.url.queryParameters['cursor'];
          if (cursor == null) {
            return http.Response(
              jsonEncode({
                'branches': [
                  {
                    'branch_id': 'b-1',
                    'name': 'Alpha Branch',
                    'organization_id': 'org-1',
                    'organization_name': 'CleanCo',
                    'timezone': 'Asia/Kuala_Lumpur',
                    'service_status': 'open',
                    'open_now': true,
                    'regular_open_now': true,
                    'hours_status': 'open_regular_hours',
                    'availability': {
                      'washers_available': 2,
                      'washers_total': 3,
                      'dryers_available': 1,
                      'dryers_total': 2,
                      'washer_dryers_available': 0,
                      'washer_dryers_total': 0,
                      'total_available': 3,
                      'total_machines': 5,
                    },
                  }
                ],
                'next_cursor': 'cur-2',
              }),
              200,
            );
          }
          return http.Response(
            jsonEncode({
              'branches': [
                {
                  'branch_id': 'b-2',
                  'name': 'Beta Branch',
                  'organization_id': 'org-2',
                  'organization_name': 'FreshWash',
                  'timezone': 'Asia/Kuala_Lumpur',
                  'service_status': 'closed',
                  'open_now': false,
                  'regular_open_now': null,
                  'hours_status': 'closed_by_operator',
                  'availability': {
                    'washers_available': 0,
                    'washers_total': 2,
                    'dryers_available': 0,
                    'dryers_total': 2,
                    'washer_dryers_available': 1,
                    'washer_dryers_total': 1,
                    'total_available': 1,
                    'total_machines': 5,
                  },
                }
              ],
              'next_cursor': null,
            }),
            200,
          );
        }
        return http.Response('{}', 404);
      });

      final api = PublicApiService(
        baseUrl: 'https://api.example.com/',
        client: client,
      );

      final page1 = await api.fetchBranches(
        q: 'Shah Alam',
        organizationId: 'org-1',
        machineType: 'washer',
        minCapacityKg: 15,
        availableOnly: true,
        openNowOnly: true,
      );

      expect(page1.branches, hasLength(1));
      expect(page1.hasMore, isTrue);
      expect(capturedUris.first.queryParameters['q'], 'Shah Alam');
      expect(capturedUris.first.queryParameters['organization_id'], 'org-1');
      expect(capturedUris.first.queryParameters['machine_type'], 'washer');
      expect(capturedUris.first.queryParameters['min_capacity_kg'], '15.0');
      expect(capturedUris.first.queryParameters['availability'], 'available');
      expect(capturedUris.first.queryParameters['open_now'], 'true');

      final combined = await api.loadRemainingPagesForSort(
        currentPage: page1,
        q: 'Shah Alam',
        organizationId: 'org-1',
        machineType: 'washer',
        minCapacityKg: 15,
        availableOnly: true,
        openNowOnly: true,
      );

      expect(combined.branches.map((b) => b.branchId), ['b-1', 'b-2']);
      expect(combined.hasMore, isFalse);
      expect(capturedUris.last.queryParameters['cursor'], 'cur-2');
    });

    test('preserves null machine price and remaining countdown rather than zero', () {
      final machine = PublicMachine.fromJson({
        'machine_id': 'm-1',
        'source_id': 'wd-1',
        'label': 'Combo #01',
        'device_type': 'washer_dryer',
        'capacity_kg': 18,
        'capabilities': {'supports_wash': true, 'supports_dry': true},
        'availability': 'unknown',
        'availability_reason': 'stale_or_offline',
        'remaining_seconds_estimate': null,
        'price_myr': null,
        'price_currency': null,
        'programs': [],
        'source_kind': 'simulated',
        'observed_at': '2026-11-18T06:00:00Z',
        'freshness': 'stale',
      });

      expect(machine.priceMyr, isNull);
      expect(machine.formattedHeadlinePrice, isNull);
      expect(machine.remainingSecondsEstimate, isNull);
      expect(machine.isSimulated, isTrue);
      expect(machine.isStaleOrMissing, isTrue);
      expect(machine.capabilities.supportsWash, isTrue);
      expect(machine.capabilities.supportsDry, isTrue);
    });

    test('zero remaining seconds while in_use does not convert state to available', () {
      final machine = PublicMachine.fromJson({
        'machine_id': 'm-2',
        'source_id': 'w-01',
        'label': 'Washer #01',
        'device_type': 'washer',
        'availability': 'in_use',
        'remaining_seconds_estimate': 0,
        'source_kind': 'physical',
        'freshness': 'fresh',
      });

      expect(machine.availability, PublicMachineAvailabilityStatus.inUse);
      expect(
        machine.formattedCountdownEstimate,
        'Cycle finishing — awaiting machine ready confirmation',
      );
    });

    test('maps 429 retry-after, 409 conflict, and network failure distinctly', () async {
      final client = MockClient((request) async {
        if (request.url.path.contains('rate-limited')) {
          return http.Response(
            jsonEncode({'detail': 'Too many problem reports submitted.'}),
            429,
            headers: {'retry-after': '120'},
          );
        }
        if (request.url.path.contains('conflict')) {
          return http.Response(
            jsonEncode({'detail': 'Request ID already used'}),
            409,
          );
        }
        throw http.ClientException('Connection closed');
      });

      final api = PublicApiService(
        baseUrl: 'https://api.example.com',
        client: client,
      );

      await expectLater(
        () => api.submitMachineReport(
          branchId: 'rate-limited',
          machineId: 'm-1',
          draft: const PublicReportDraft(
            requestId: '11111111-1111-4111-8111-111111111111',
            category: ReportCategory.other,
            description: 'Machine door stays locked after cycle completes.',
            contactConsent: false,
          ),
        ),
        throwsA(
          isA<PublicApiException>()
              .having((e) => e.kind, 'kind', ApiFailureKind.rateLimited)
              .having((e) => e.retryAfterSeconds, 'retryAfterSeconds', 120),
        ),
      );

      await expectLater(
        () => api.submitMachineReport(
          branchId: 'conflict',
          machineId: 'm-1',
          draft: const PublicReportDraft(
            requestId: '11111111-1111-4111-8111-111111111111',
            category: ReportCategory.other,
            description: 'Different text reusing request UUID.',
            contactConsent: false,
          ),
        ),
        throwsA(
          isA<PublicApiException>()
              .having((e) => e.kind, 'kind', ApiFailureKind.conflict),
        ),
      );

      await expectLater(
        () => api.fetchBranches(),
        throwsA(
          isA<PublicApiException>()
              .having((e) => e.kind, 'kind', ApiFailureKind.network),
        ),
      );
    });
  });
}
