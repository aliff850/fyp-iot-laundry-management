import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';
import '../models/public_models.dart';

class PublicApiService {
  PublicApiService({
    String? baseUrl,
    http.Client? client,
    Duration? timeout,
  })  : baseUrl = (baseUrl ?? AppConfig.apiBaseUrl).replaceAll(RegExp(r'/+$'), ''),
        _client = client ?? http.Client(),
        _timeout = timeout ?? const Duration(seconds: 30);

  final String baseUrl;
  final http.Client _client;
  final Duration _timeout;

  Future<List<PublicOrganization>> fetchOrganizations() async {
    final uri = Uri.parse('$baseUrl/public/organizations');
    final decoded = await _getJson(uri);
    final raw = decoded['organizations'];
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((m) => PublicOrganization.fromJson(Map<String, dynamic>.from(m)))
        .where((o) => o.id.isNotEmpty && o.name.isNotEmpty)
        .toList();
  }

  Future<PublicBranchesPage> fetchBranches({
    String? q,
    String? organizationId,
    String? machineType,
    double? minCapacityKg,
    bool availableOnly = false,
    bool openNowOnly = false,
    String? cursor,
    int limit = 20,
  }) async {
    final query = <String, String>{
      'availability': availableOnly ? 'available' : 'any',
      'limit': limit.toString(),
    };
    if (q != null && q.trim().isNotEmpty) {
      query['q'] = q.trim();
    }
    if (organizationId != null && organizationId.trim().isNotEmpty) {
      query['organization_id'] = organizationId.trim();
    }
    if (machineType != null && machineType.trim().isNotEmpty) {
      query['machine_type'] = machineType.trim();
    }
    if (minCapacityKg != null) {
      query['min_capacity_kg'] = minCapacityKg.toString();
    }
    if (openNowOnly) {
      query['open_now'] = 'true';
    }
    if (cursor != null && cursor.trim().isNotEmpty) {
      query['cursor'] = cursor.trim();
    }

    final uri = Uri.parse('$baseUrl/public/branches').replace(queryParameters: query);
    final decoded = await _getJson(uri);
    return PublicBranchesPage.fromJson(decoded);
  }

  /// Continues fetching remaining paginated pages before performing global nearest sorting.
  Future<PublicBranchesPage> loadRemainingPagesForSort({
    required PublicBranchesPage currentPage,
    String? q,
    String? organizationId,
    String? machineType,
    double? minCapacityKg,
    bool availableOnly = false,
    bool openNowOnly = false,
    int limit = 50,
    int maxExtraPages = 25,
  }) async {
    final combined = List<PublicBranchSummary>.from(currentPage.branches);
    var cursor = currentPage.nextCursor;
    var asOf = currentPage.asOf;
    var pagesLoaded = 0;

    while (cursor != null && cursor.isNotEmpty && pagesLoaded < maxExtraPages) {
      final next = await fetchBranches(
        q: q,
        organizationId: organizationId,
        machineType: machineType,
        minCapacityKg: minCapacityKg,
        availableOnly: availableOnly,
        openNowOnly: openNowOnly,
        cursor: cursor,
        limit: limit,
      );
      combined.addAll(next.branches);
      asOf = next.asOf ?? asOf;
      cursor = next.nextCursor;
      pagesLoaded += 1;
    }

    return PublicBranchesPage(
      branches: combined,
      nextCursor: cursor,
      asOf: asOf,
    );
  }

  Future<PublicBranchAvailabilityResponse> fetchBranchAvailability(
    String branchId,
  ) async {
    final encoded = Uri.encodeComponent(branchId);
    final uri = Uri.parse('$baseUrl/public/branches/$encoded/availability');
    final decoded = await _getJson(uri);
    return PublicBranchAvailabilityResponse.fromJson(decoded);
  }

  Future<PublicReportReceipt> submitMachineReport({
    required String branchId,
    required String machineId,
    required PublicReportDraft draft,
  }) async {
    final b = Uri.encodeComponent(branchId);
    final m = Uri.encodeComponent(machineId);
    final uri = Uri.parse('$baseUrl/public/branches/$b/machines/$m/reports');

    http.Response response;
    try {
      response = await _client
          .post(
            uri,
            headers: const {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: jsonEncode(draft.toJson()),
          )
          .timeout(_timeout);
    } on TimeoutException {
      throw const PublicApiException(
        kind: ApiFailureKind.network,
        message: 'Request timed out. Retry using the same report button to avoid duplicate tickets.',
      );
    } catch (_) {
      throw const PublicApiException(
        kind: ApiFailureKind.network,
        message: 'Unable to reach SpinSense servers. Check your connection and retry.',
      );
    }

    if (response.statusCode == 200 || response.statusCode == 201) {
      final decoded = _decodeJsonMap(response.body);
      return PublicReportReceipt.fromJson(decoded);
    }

    throw _mapHttpError(response);
  }

  Future<Map<String, dynamic>> _getJson(Uri uri) async {
    http.Response response;
    try {
      response = await _client
          .get(uri, headers: const {'Accept': 'application/json'})
          .timeout(_timeout);
    } on TimeoutException {
      throw const PublicApiException(
        kind: ApiFailureKind.network,
        message: 'Connection timed out while loading laundromat data.',
      );
    } catch (_) {
      throw const PublicApiException(
        kind: ApiFailureKind.network,
        message: 'Could not connect to SpinSense. Check your internet connection and retry.',
      );
    }

    if (response.statusCode >= 200 && response.statusCode < 300) {
      return _decodeJsonMap(response.body);
    }

    throw _mapHttpError(response);
  }

  Map<String, dynamic> _decodeJsonMap(String raw) {
    try {
      final parsed = jsonDecode(raw);
      if (parsed is Map<String, dynamic>) return parsed;
      if (parsed is Map) return Map<String, dynamic>.from(parsed);
    } catch (_) {
      // Handled by exception below
    }
    throw const PublicApiException(
      kind: ApiFailureKind.server,
      message: 'Received an unexpected response format from SpinSense.',
    );
  }

  PublicApiException _mapHttpError(http.Response response) {
    final code = response.statusCode;
    final detail = _extractErrorDetail(response.body);

    if (code == 404) {
      return PublicApiException(
        kind: ApiFailureKind.notFound,
        statusCode: code,
        message: detail ?? 'This branch or machine is unavailable or no longer published.',
      );
    }
    if (code == 409) {
      return PublicApiException(
        kind: ApiFailureKind.conflict,
        statusCode: code,
        message: detail ??
            'This report submission ID was already used with different details. Start a fresh draft to continue.',
      );
    }
    if (code == 422 || code == 400) {
      return PublicApiException(
        kind: ApiFailureKind.validation,
        statusCode: code,
        message: detail ?? 'Please review the highlighted fields and try again.',
      );
    }
    if (code == 429) {
      final retryHeader = response.headers['retry-after'] ?? response.headers['Retry-After'];
      final retryAfter = retryHeader != null ? int.tryParse(retryHeader.trim()) : null;
      return PublicApiException(
        kind: ApiFailureKind.rateLimited,
        statusCode: code,
        retryAfterSeconds: retryAfter,
        message: detail ?? 'Too many problem reports submitted. Please wait before trying again.',
      );
    }
    return PublicApiException(
      kind: ApiFailureKind.server,
      statusCode: code,
      message: detail ?? 'SpinSense service is temporarily unavailable ($code).',
    );
  }

  String? _extractErrorDetail(String body) {
    if (body.trim().isEmpty) return null;
    try {
      final parsed = jsonDecode(body);
      if (parsed is Map && parsed['detail'] != null) {
        final d = parsed['detail'];
        if (d is String && d.trim().isNotEmpty) return d.trim();
        if (d is List && d.isNotEmpty) {
          final first = d.first;
          if (first is Map && first['msg'] is String) {
            return (first['msg'] as String).trim();
          }
        }
      }
    } catch (_) {
      return null;
    }
    return null;
  }
}
