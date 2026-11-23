import 'package:flutter/foundation.dart';

enum ApiFailureKind {
  network,
  notFound,
  validation,
  conflict,
  rateLimited,
  server,
}

class PublicApiException implements Exception {
  const PublicApiException({
    required this.kind,
    required this.message,
    this.statusCode,
    this.retryAfterSeconds,
  });

  final ApiFailureKind kind;
  final String message;
  final int? statusCode;
  final int? retryAfterSeconds;

  @override
  String toString() => 'PublicApiException($kind, $statusCode): $message';
}

@immutable
class PublicOrganization {
  const PublicOrganization({
    required this.id,
    required this.name,
  });

  final String id;
  final String name;

  factory PublicOrganization.fromJson(Map<String, dynamic> json) {
    return PublicOrganization(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
    );
  }
}

@immutable
class WeeklyInterval {
  const WeeklyInterval({
    required this.open,
    required this.close,
  });

  final String open;
  final String close;

  factory WeeklyInterval.fromJson(Map<String, dynamic> json) {
    return WeeklyInterval(
      open: (json['open'] ?? '').toString(),
      close: (json['close'] ?? '').toString(),
    );
  }

  String get displayRange {
    if (open == '00:00' && close == '24:00') {
      return '24 hours';
    }
    return '$open - $close';
  }
}

@immutable
class MachineAvailabilitySummary {
  const MachineAvailabilitySummary({
    required this.washersAvailable,
    required this.washersTotal,
    required this.dryersAvailable,
    required this.dryersTotal,
    required this.washerDryersAvailable,
    required this.washerDryersTotal,
    required this.totalAvailable,
    required this.totalMachines,
  });

  final int washersAvailable;
  final int washersTotal;
  final int dryersAvailable;
  final int dryersTotal;
  final int washerDryersAvailable;
  final int washerDryersTotal;
  final int totalAvailable;
  final int totalMachines;

  factory MachineAvailabilitySummary.fromJson(Map<String, dynamic> json) {
    return MachineAvailabilitySummary(
      washersAvailable: _asInt(json['washers_available']),
      washersTotal: _asInt(json['washers_total']),
      dryersAvailable: _asInt(json['dryers_available']),
      dryersTotal: _asInt(json['dryers_total']),
      washerDryersAvailable: _asInt(json['washer_dryers_available']),
      washerDryersTotal: _asInt(json['washer_dryers_total']),
      totalAvailable: _asInt(json['total_available']),
      totalMachines: _asInt(json['total_machines']),
    );
  }
}

enum HoursStatus {
  openRegularHours,
  closedRegularHours,
  closedByOperator,
  hoursUnknown;

  static HoursStatus fromWire(String? value) {
    switch (value) {
      case 'open_regular_hours':
        return HoursStatus.openRegularHours;
      case 'closed_regular_hours':
        return HoursStatus.closedRegularHours;
      case 'closed_by_operator':
        return HoursStatus.closedByOperator;
      default:
        return HoursStatus.hoursUnknown;
    }
  }

  String get displayLabel {
    switch (this) {
      case HoursStatus.openRegularHours:
        return 'Open now (regular hours)';
      case HoursStatus.closedRegularHours:
        return 'Closed (regular hours)';
      case HoursStatus.closedByOperator:
        return 'Closed by operator';
      case HoursStatus.hoursUnknown:
        return 'Hours unavailable';
    }
  }
}

@immutable
class PublicBranchSummary {
  const PublicBranchSummary({
    required this.branchId,
    required this.name,
    required this.organizationId,
    required this.organizationName,
    this.organizationLogoUrl,
    this.coverImageUrl,
    this.address,
    this.city,
    this.region,
    this.postalCode,
    this.contactPhone,
    this.openingHours,
    this.weeklyHours,
    required this.timezone,
    this.latitude,
    this.longitude,
    required this.serviceStatus,
    this.openNow,
    this.regularOpenNow,
    required this.hoursStatus,
    required this.availability,
    this.observedAt,
    this.asOf,
  });

  final String branchId;
  final String name;
  final String organizationId;
  final String organizationName;
  final String? organizationLogoUrl;
  final String? coverImageUrl;
  final String? address;
  final String? city;
  final String? region;
  final String? postalCode;
  final String? contactPhone;
  final String? openingHours;
  final Map<String, List<WeeklyInterval>>? weeklyHours;
  final String timezone;
  final double? latitude;
  final double? longitude;
  final String serviceStatus;
  final bool? openNow;
  final bool? regularOpenNow;
  final HoursStatus hoursStatus;
  final MachineAvailabilitySummary availability;
  final DateTime? observedAt;
  final DateTime? asOf;

  bool get hasCoordinates => latitude != null && longitude != null;
  bool get hasCoverImage => coverImageUrl != null && coverImageUrl!.trim().isNotEmpty;
  bool get isClosedByOperator => serviceStatus.toLowerCase() == 'closed';

  String get cityRegionLabel {
    final parts = [city, region]
        .whereType<String>()
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toList();
    return parts.join(', ');
  }

  factory PublicBranchSummary.fromJson(Map<String, dynamic> json) {
    return PublicBranchSummary(
      branchId: (json['branch_id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      organizationId: (json['organization_id'] ?? '').toString(),
      organizationName: (json['organization_name'] ?? '').toString(),
      organizationLogoUrl: _asNullableString(json['organization_logo_url']),
      coverImageUrl: _asNullableString(json['cover_image_url']),
      address: _asNullableString(json['address']),
      city: _asNullableString(json['city']),
      region: _asNullableString(json['region']),
      postalCode: _asNullableString(json['postal_code']),
      contactPhone: _asNullableString(json['contact_phone']),
      openingHours: _asNullableString(json['opening_hours']),
      weeklyHours: _parseWeeklyHours(json['weekly_hours']),
      timezone: _asNullableString(json['timezone']) ?? 'Asia/Kuala_Lumpur',
      latitude: _asNullableDouble(json['latitude']),
      longitude: _asNullableDouble(json['longitude']),
      serviceStatus: _asNullableString(json['service_status']) ?? 'open',
      openNow: json['open_now'] is bool ? json['open_now'] as bool : null,
      regularOpenNow:
          json['regular_open_now'] is bool ? json['regular_open_now'] as bool : null,
      hoursStatus: HoursStatus.fromWire(_asNullableString(json['hours_status'])),
      availability: MachineAvailabilitySummary.fromJson(
        _asMap(json['availability']),
      ),
      observedAt: _parseDateTime(json['observed_at']),
      asOf: _parseDateTime(json['as_of']),
    );
  }
}

@immutable
class PublicBranchesPage {
  const PublicBranchesPage({
    required this.branches,
    this.nextCursor,
    this.asOf,
  });

  final List<PublicBranchSummary> branches;
  final String? nextCursor;
  final DateTime? asOf;

  bool get hasMore => nextCursor != null && nextCursor!.isNotEmpty;

  factory PublicBranchesPage.fromJson(Map<String, dynamic> json) {
    final rawList = json['branches'];
    final items = rawList is List
        ? rawList
            .whereType<Map>()
            .map((m) => PublicBranchSummary.fromJson(Map<String, dynamic>.from(m)))
            .toList()
        : <PublicBranchSummary>[];
    return PublicBranchesPage(
      branches: items,
      nextCursor: _asNullableString(json['next_cursor']),
      asOf: _parseDateTime(json['as_of']),
    );
  }
}

enum PublicMachineAvailabilityStatus {
  available,
  inUse,
  outOfService,
  maintenance,
  unknown;

  static PublicMachineAvailabilityStatus fromWire(String? value) {
    switch (value) {
      case 'available':
        return PublicMachineAvailabilityStatus.available;
      case 'in_use':
        return PublicMachineAvailabilityStatus.inUse;
      case 'out_of_service':
        return PublicMachineAvailabilityStatus.outOfService;
      case 'maintenance':
        return PublicMachineAvailabilityStatus.maintenance;
      default:
        return PublicMachineAvailabilityStatus.unknown;
    }
  }

  String get displayLabel {
    switch (this) {
      case PublicMachineAvailabilityStatus.available:
        return 'Available';
      case PublicMachineAvailabilityStatus.inUse:
        return 'In use';
      case PublicMachineAvailabilityStatus.outOfService:
        return 'Out of service';
      case PublicMachineAvailabilityStatus.maintenance:
        return 'Maintenance';
      case PublicMachineAvailabilityStatus.unknown:
        return 'Offline';
    }
  }
}

@immutable
class PublicMachineCapabilities {
  const PublicMachineCapabilities({
    required this.supportsWash,
    required this.supportsDry,
  });

  final bool supportsWash;
  final bool supportsDry;

  factory PublicMachineCapabilities.fromJson(
    Map<String, dynamic> json,
    String deviceType,
  ) {
    return PublicMachineCapabilities(
      supportsWash: json['supports_wash'] is bool
          ? json['supports_wash'] as bool
          : (deviceType == 'washer' || deviceType == 'washer_dryer'),
      supportsDry: json['supports_dry'] is bool
          ? json['supports_dry'] as bool
          : (deviceType == 'dryer' || deviceType == 'washer_dryer'),
    );
  }
}

@immutable
class PublicMachineProgram {
  const PublicMachineProgram({
    required this.programId,
    required this.name,
    this.priceMyr,
    this.durationSeconds,
  });

  final String programId;
  final String name;
  final double? priceMyr;
  final int? durationSeconds;

  factory PublicMachineProgram.fromJson(Map<String, dynamic> json) {
    return PublicMachineProgram(
      programId: (json['program_id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      priceMyr: _asNullableDouble(json['price_myr']),
      durationSeconds: _asNullableInt(json['duration_seconds']),
    );
  }
}

@immutable
class PublicMachine {
  const PublicMachine({
    required this.machineId,
    required this.sourceId,
    required this.label,
    required this.deviceType,
    this.capacityKg,
    required this.capabilities,
    required this.availability,
    this.availabilityReason,
    this.remainingSecondsEstimate,
    this.priceMyr,
    this.priceCurrency,
    this.priceSource,
    required this.programs,
    required this.sourceKind,
    this.observedAt,
    this.asOf,
    required this.freshness,
  });

  final String machineId;
  final String sourceId;
  final String label;
  final String deviceType; // 'washer', 'dryer', 'washer_dryer'
  final double? capacityKg;
  final PublicMachineCapabilities capabilities;
  final PublicMachineAvailabilityStatus availability;
  final String? availabilityReason;
  final int? remainingSecondsEstimate;
  final double? priceMyr;
  final String? priceCurrency;
  final String? priceSource;
  final List<PublicMachineProgram> programs;
  final String sourceKind; // 'physical', 'simulated', 'vendor'
  final DateTime? observedAt;
  final DateTime? asOf;
  final String freshness; // 'fresh', 'stale', 'missing'

  bool get isSimulated => sourceKind.toLowerCase() == 'simulated';
  bool get isStaleOrMissing => freshness.toLowerCase() != 'fresh';

  String? get availabilityReasonLabel {
    if (availabilityReason == 'branch_closed') {
      return 'Branch closed by operator';
    }
    return null;
  }

  String? get formattedHeadlinePrice {
    if (priceMyr == null) return null;
    final currency = priceCurrency ?? 'MYR';
    return '$currency ${priceMyr!.toStringAsFixed(2)}';
  }

  String? get formattedCountdownEstimate {
    if (availability != PublicMachineAvailabilityStatus.inUse) return null;
    final secs = remainingSecondsEstimate;
    if (secs == null) return null;
    if (secs <= 0) {
      return 'Cycle finishing — awaiting machine ready confirmation';
    }
    final mins = (secs / 60).ceil();
    return 'Est. $mins min remaining';
  }

  factory PublicMachine.fromJson(Map<String, dynamic> json) {
    final dtype = (json['device_type'] ?? 'washer').toString();
    final rawPrograms = json['programs'];
    return PublicMachine(
      machineId: (json['machine_id'] ?? '').toString(),
      sourceId: (json['source_id'] ?? '').toString(),
      label: (json['label'] ?? '').toString(),
      deviceType: dtype,
      capacityKg: _asNullableDouble(json['capacity_kg']),
      capabilities: PublicMachineCapabilities.fromJson(
        _asMap(json['capabilities']),
        dtype,
      ),
      availability: PublicMachineAvailabilityStatus.fromWire(
        _asNullableString(json['availability']),
      ),
      availabilityReason: _asNullableString(json['availability_reason']),
      remainingSecondsEstimate: _asNullableInt(json['remaining_seconds_estimate']),
      priceMyr: _asNullableDouble(json['price_myr']),
      priceCurrency: _asNullableString(json['price_currency']),
      priceSource: _asNullableString(json['price_source']),
      programs: rawPrograms is List
          ? rawPrograms
              .whereType<Map>()
              .map((p) => PublicMachineProgram.fromJson(Map<String, dynamic>.from(p)))
              .toList()
          : const [],
      sourceKind: _asNullableString(json['source_kind']) ?? 'physical',
      observedAt: _parseDateTime(json['observed_at']),
      asOf: _parseDateTime(json['as_of']),
      freshness: _asNullableString(json['freshness']) ?? 'missing',
    );
  }
}

@immutable
class PublicBranchImage {
  const PublicBranchImage({
    required this.id,
    required this.imageUrl,
  });

  final String id;
  final String imageUrl;

  factory PublicBranchImage.fromJson(Map<String, dynamic> json) {
    return PublicBranchImage(
      id: (json['id'] ?? '').toString(),
      imageUrl: (json['image_url'] ?? '').toString().trim(),
    );
  }
}

@immutable
class PublicBranchDetail {
  const PublicBranchDetail({
    required this.branchId,
    required this.name,
    required this.organizationId,
    required this.organizationName,
    this.organizationLogoUrl,
    this.coverImageUrl,
    this.address,
    this.city,
    this.region,
    this.postalCode,
    this.contactPhone,
    this.openingHours,
    this.weeklyHours,
    required this.timezone,
    this.latitude,
    this.longitude,
    required this.serviceStatus,
    this.openNow,
    this.regularOpenNow,
    required this.hoursStatus,
    this.images = const [],
  });

  final String branchId;
  final String name;
  final String organizationId;
  final String organizationName;
  final String? organizationLogoUrl;
  final String? coverImageUrl;
  final String? address;
  final String? city;
  final String? region;
  final String? postalCode;
  final String? contactPhone;
  final String? openingHours;
  final Map<String, List<WeeklyInterval>>? weeklyHours;
  final String timezone;
  final double? latitude;
  final double? longitude;
  final String serviceStatus;
  final bool? openNow;
  final bool? regularOpenNow;
  final HoursStatus hoursStatus;
  final List<PublicBranchImage> images;

  bool get hasCoordinates => latitude != null && longitude != null;
  bool get hasCoverImage => coverImageUrl != null && coverImageUrl!.trim().isNotEmpty;
  PublicBranchImage? get coverImage => images.isNotEmpty
      ? images.first
      : (hasCoverImage
          ? PublicBranchImage(id: 'cover', imageUrl: coverImageUrl!.trim())
          : null);
  bool get isClosedByOperator => serviceStatus.toLowerCase() == 'closed';

  String get fullAddressDisplay {
    final parts = [address, city, postalCode, region]
        .whereType<String>()
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toList();
    return parts.join(', ');
  }

  factory PublicBranchDetail.fromJson(Map<String, dynamic> json) {
    final rawImages = json['images'];
    final parsedImages = rawImages is List
        ? rawImages
            .whereType<Map>()
            .map((e) => PublicBranchImage.fromJson(Map<String, dynamic>.from(e)))
            .where((img) => img.imageUrl.isNotEmpty)
            .toList()
        : const <PublicBranchImage>[];

    return PublicBranchDetail(
      branchId: (json['branch_id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      organizationId: (json['organization_id'] ?? '').toString(),
      organizationName: (json['organization_name'] ?? '').toString(),
      organizationLogoUrl: _asNullableString(json['organization_logo_url']),
      coverImageUrl: _asNullableString(json['cover_image_url']),
      address: _asNullableString(json['address']),
      city: _asNullableString(json['city']),
      region: _asNullableString(json['region']),
      postalCode: _asNullableString(json['postal_code']),
      contactPhone: _asNullableString(json['contact_phone']),
      openingHours: _asNullableString(json['opening_hours']),
      weeklyHours: _parseWeeklyHours(json['weekly_hours']),
      timezone: _asNullableString(json['timezone']) ?? 'Asia/Kuala_Lumpur',
      latitude: _asNullableDouble(json['latitude']),
      longitude: _asNullableDouble(json['longitude']),
      serviceStatus: _asNullableString(json['service_status']) ?? 'open',
      openNow: json['open_now'] is bool ? json['open_now'] as bool : null,
      regularOpenNow:
          json['regular_open_now'] is bool ? json['regular_open_now'] as bool : null,
      hoursStatus: HoursStatus.fromWire(_asNullableString(json['hours_status'])),
      images: parsedImages,
    );
  }
}

@immutable
class PeakDemandHourPoint {
  const PeakDemandHourPoint({
    required this.hour,
    required this.hourLabel,
    required this.busyPct,
    required this.level,
  });

  final int hour;
  final String hourLabel;
  final int busyPct;
  final String level; // 'none', 'quiet', 'moderate', 'busy'

  String get displayLevel {
    switch (level) {
      case 'busy':
        return 'Usually busiest';
      case 'moderate':
        return 'Moderately busy';
      case 'quiet':
        return 'Quiet';
      default:
        return 'No recorded activity';
    }
  }

  factory PeakDemandHourPoint.fromJson(Map<String, dynamic> json) {
    final hr = (_asNullableInt(json['hour']) ?? 0).clamp(0, 23);
    final pct = (_asNullableInt(json['busy_pct']) ?? 0).clamp(0, 100);
    return PeakDemandHourPoint(
      hour: hr,
      hourLabel: _asNullableString(json['hour_label']) ??
          '${hr.toString().padLeft(2, '0')}:00',
      busyPct: pct,
      level: _asNullableString(json['level']) ?? 'none',
    );
  }
}

@immutable
class PeakDemandBucket {
  const PeakDemandBucket({
    required this.hasData,
    this.peakHour,
    this.peakHourLabel,
    required this.hours,
  });

  final bool hasData;
  final int? peakHour;
  final String? peakHourLabel;
  final List<PeakDemandHourPoint> hours;

  factory PeakDemandBucket.empty() => PeakDemandBucket(
        hasData: false,
        hours: List.generate(
          24,
          (h) => PeakDemandHourPoint(
            hour: h,
            hourLabel: '${h.toString().padLeft(2, '0')}:00',
            busyPct: 0,
            level: 'none',
          ),
        ),
      );

  factory PeakDemandBucket.fromJson(Map<String, dynamic> json) {
    final rawHours = json['hours'];
    final parsed = rawHours is List
        ? rawHours
            .whereType<Map>()
            .map((e) => PeakDemandHourPoint.fromJson(Map<String, dynamic>.from(e)))
            .toList()
        : <PeakDemandHourPoint>[];
    final byHour = {for (final p in parsed) p.hour: p};
    final normalizedHours = List.generate(
      24,
      (h) =>
          byHour[h] ??
          PeakDemandHourPoint(
            hour: h,
            hourLabel: '${h.toString().padLeft(2, '0')}:00',
            busyPct: 0,
            level: 'none',
          ),
    );
    return PeakDemandBucket(
      hasData: json['has_data'] is bool ? json['has_data'] as bool : false,
      peakHour: _asNullableInt(json['peak_hour']),
      peakHourLabel: _asNullableString(json['peak_hour_label']),
      hours: normalizedHours,
    );
  }
}

@immutable
class PublicPeakDemandHours {
  const PublicPeakDemandHours({
    required this.hasData,
    required this.windowDays,
    required this.timezone,
    required this.defaultBucket,
    required this.buckets,
  });

  static const List<String> orderedKeys = [
    'overall',
    'mon',
    'tue',
    'wed',
    'thu',
    'fri',
    'sat',
    'sun',
  ];

  final bool hasData;
  final int windowDays;
  final String timezone;
  final String defaultBucket;
  final Map<String, PeakDemandBucket> buckets;

  PeakDemandBucket bucketFor(String key) =>
      buckets[key] ?? PeakDemandBucket.empty();

  factory PublicPeakDemandHours.empty({String timezone = 'Asia/Kuala_Lumpur'}) =>
      PublicPeakDemandHours(
        hasData: false,
        windowDays: 90,
        timezone: timezone,
        defaultBucket: 'overall',
        buckets: {for (final key in orderedKeys) key: PeakDemandBucket.empty()},
      );

  factory PublicPeakDemandHours.fromJson(
    Map<String, dynamic> json, {
    String fallbackTimezone = 'Asia/Kuala_Lumpur',
  }) {
    if (json.isEmpty) {
      return PublicPeakDemandHours.empty(timezone: fallbackTimezone);
    }
    final rawBuckets = _asMap(json['buckets']);
    final parsedBuckets = <String, PeakDemandBucket>{};
    for (final key in orderedKeys) {
      parsedBuckets[key] = rawBuckets[key] is Map
          ? PeakDemandBucket.fromJson(_asMap(rawBuckets[key]))
          : PeakDemandBucket.empty();
    }
    final def = _asNullableString(json['default_bucket']) ?? 'overall';
    return PublicPeakDemandHours(
      hasData: json['has_data'] is bool ? json['has_data'] as bool : false,
      windowDays: _asNullableInt(json['window_days']) ?? 90,
      timezone: _asNullableString(json['timezone']) ?? fallbackTimezone,
      defaultBucket: parsedBuckets.containsKey(def) ? def : 'overall',
      buckets: parsedBuckets,
    );
  }
}

@immutable
class PublicBranchAvailabilityResponse {
  const PublicBranchAvailabilityResponse({
    required this.branch,
    required this.summary,
    required this.machines,
    PublicPeakDemandHours? peakHours,
    this.asOf,
  }) : _peakHours = peakHours;

  final PublicBranchDetail branch;
  final MachineAvailabilitySummary summary;
  final List<PublicMachine> machines;
  final PublicPeakDemandHours? _peakHours;
  final DateTime? asOf;

  PublicPeakDemandHours get peakHours =>
      _peakHours ?? PublicPeakDemandHours.empty(timezone: branch.timezone);

  List<PublicMachine> get washers =>
      machines.where((m) => m.deviceType == 'washer').toList();
  List<PublicMachine> get dryers =>
      machines.where((m) => m.deviceType == 'dryer').toList();
  List<PublicMachine> get washerDryers =>
      machines.where((m) => m.deviceType == 'washer_dryer').toList();

  factory PublicBranchAvailabilityResponse.fromJson(Map<String, dynamic> json) {
    final rawMachines = json['machines'];
    final branch = PublicBranchDetail.fromJson(_asMap(json['branch']));
    return PublicBranchAvailabilityResponse(
      branch: branch,
      summary: MachineAvailabilitySummary.fromJson(_asMap(json['summary'])),
      machines: rawMachines is List
          ? rawMachines
              .whereType<Map>()
              .map((m) => PublicMachine.fromJson(Map<String, dynamic>.from(m)))
              .toList()
          : const [],
      peakHours: PublicPeakDemandHours.fromJson(
        _asMap(json['peak_hours']),
        fallbackTimezone: branch.timezone,
      ),
      asOf: _parseDateTime(json['as_of']),
    );
  }
}

enum ReportCategory {
  paymentQr('payment_qr', 'Payment or QR issue'),
  wontStart('wont_start', 'Machine will not start'),
  doorLock('door_lock', 'Door lock problem'),
  stoppedOrFaulted('stopped_or_faulted', 'Stopped mid-cycle or faulted'),
  washDryResult('wash_dry_result', 'Poor wash or dry result'),
  cleanliness('cleanliness', 'Cleanliness or spill'),
  other('other', 'Other issue');

  const ReportCategory(this.wireValue, this.label);
  final String wireValue;
  final String label;
}

@immutable
class PublicReportDraft {
  const PublicReportDraft({
    required this.requestId,
    required this.category,
    required this.description,
    this.reporterName,
    this.contactType,
    this.contactValue,
    required this.contactConsent,
  });

  final String requestId;
  final ReportCategory category;
  final String description;
  final String? reporterName;
  final String? contactType; // 'email' | 'phone' | null
  final String? contactValue;
  final bool contactConsent;

  Map<String, dynamic> toJson() {
    return {
      'request_id': requestId,
      'category': category.wireValue,
      'description': description,
      'reporter_name': reporterName,
      'contact_type': contactType,
      'contact_value': contactValue,
      'contact_consent': contactConsent,
    };
  }
}

@immutable
class PublicReportReceipt {
  const PublicReportReceipt({
    required this.reportId,
    required this.referenceCode,
    this.receivedAt,
  });

  final String reportId;
  final String referenceCode;
  final DateTime? receivedAt;

  factory PublicReportReceipt.fromJson(Map<String, dynamic> json) {
    return PublicReportReceipt(
      reportId: (json['report_id'] ?? '').toString(),
      referenceCode: (json['reference_code'] ?? '').toString(),
      receivedAt: _parseDateTime(json['received_at']),
    );
  }
}

int _asInt(dynamic value) {
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value) ?? 0;
  return 0;
}

int? _asNullableInt(dynamic value) {
  if (value == null || value is bool) return null;
  if (value is int) return value;
  if (value is num) return value.toInt();
  if (value is String) return int.tryParse(value);
  return null;
}

double? _asNullableDouble(dynamic value) {
  if (value == null || value is bool) return null;
  if (value is num) {
    final d = value.toDouble();
    return d.isFinite ? d : null;
  }
  if (value is String) {
    final d = double.tryParse(value);
    return (d != null && d.isFinite) ? d : null;
  }
  return null;
}

String? _asNullableString(dynamic value) {
  if (value == null) return null;
  final text = value.toString().trim();
  return text.isEmpty ? null : text;
}

DateTime? _parseDateTime(dynamic value) {
  final text = _asNullableString(value);
  if (text == null) return null;
  return DateTime.tryParse(text);
}

Map<String, dynamic> _asMap(dynamic value) {
  if (value is Map<String, dynamic>) return value;
  if (value is Map) return Map<String, dynamic>.from(value);
  return const <String, dynamic>{};
}

Map<String, List<WeeklyInterval>>? _parseWeeklyHours(dynamic raw) {
  if (raw is! Map) return null;
  final result = <String, List<WeeklyInterval>>{};
  for (final entry in raw.entries) {
    final key = entry.key.toString();
    final value = entry.value;
    if (value is List) {
      result[key] = value
          .whereType<Map>()
          .map((item) => WeeklyInterval.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    } else {
      result[key] = const [];
    }
  }
  return result;
}
