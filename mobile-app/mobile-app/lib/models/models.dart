enum MachineStatus { running, idle, error }

class Branch {
  final String id;
  final String name;
  final String location;
  final String campusType;
  final String address;
  final int washersCount;
  final int dryersCount;
  final int totalMachines;
  final String status;

  Branch({
    required this.id,
    required this.name,
    this.location = '',
    this.campusType = 'Campus Hub',
    this.address = '',
    this.washersCount = 4,
    this.dryersCount = 4,
    this.totalMachines = 8,
    this.status = 'ONLINE',
  });

  factory Branch.fromJson(Map<String, dynamic> json) {
    return Branch(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      location: json['location'] ?? json['address'] ?? '',
      campusType: json['campus_type'] ?? (json['id'] == 'msu-shah-alam' ? 'Main Campus Hub' : 'Cheras Campus Centre'),
      address: json['address'] ?? json['location'] ?? '',
      washersCount: json['washers_count'] ?? 4,
      dryersCount: json['dryers_count'] ?? 4,
      totalMachines: json['total_machines'] ?? 8,
      status: json['status'] ?? 'ONLINE',
    );
  }
}

class MachineParameters {
  double price;
  int durationMins;
  int tempCelsius;
  String waterLevel;
  int spinSpeed;
  bool doorLocked;

  MachineParameters({
    required this.price,
    required this.durationMins,
    required this.tempCelsius,
    required this.waterLevel,
    required this.spinSpeed,
    required this.doorLocked,
  });

  factory MachineParameters.fromJson(Map<String, dynamic> json) {
    return MachineParameters(
      price: (json['price'] as num?)?.toDouble() ?? 6.0,
      durationMins: json['duration_mins'] ?? 30,
      tempCelsius: json['temp_celsius'] ?? 40,
      waterLevel: json['water_level'] ?? 'Medium',
      spinSpeed: json['spin_speed'] ?? 800,
      doorLocked: json['door_locked'] ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'price': price,
      'duration_mins': durationMins,
      'temp_celsius': tempCelsius,
      'water_level': waterLevel,
      'spin_speed': spinSpeed,
      'door_locked': doorLocked,
    };
  }
}

class Machine {
  final String id;
  final String name;
  final String type; // 'washer' or 'dryer'
  final String status; // 'RUNNING', 'IDLE', 'ERROR'
  final int remainingTime;
  final String? currentCycle;
  final MachineParameters parameters;

  Machine({
    required this.id,
    required this.name,
    required this.type,
    required this.status,
    required this.remainingTime,
    this.currentCycle,
    required this.parameters,
  });

  bool get isRunning => status.toUpperCase() == 'RUNNING';
  bool get isIdle => status.toUpperCase() == 'IDLE';
  bool get isError => status.toUpperCase() == 'ERROR';

  MachineStatus get machineStatus =>
      isRunning ? MachineStatus.running : (isError ? MachineStatus.error : MachineStatus.idle);

  factory Machine.fromJson(Map<String, dynamic> json) {
    return Machine(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      type: json['type'] ?? 'washer',
      status: json['status'] ?? 'IDLE',
      remainingTime: json['remaining_time'] ?? 0,
      currentCycle: json['current_cycle'],
      parameters: MachineParameters.fromJson(json['parameters'] ?? {}),
    );
  }
}

class SensorData {
  final double voltage;
  final double temperature;
  final double humidity;
  final double lpgWeightKg;
  final double lpgMaxWeightKg;
  final double lpgCapacityPercent;
  final bool isLiveStream;

  SensorData({
    required this.voltage,
    required this.temperature,
    required this.humidity,
    required this.lpgWeightKg,
    required this.lpgMaxWeightKg,
    required this.lpgCapacityPercent,
    required this.isLiveStream,
  });

  factory SensorData.fromJson(Map<String, dynamic> json) {
    return SensorData(
      voltage: (json['voltage'] as num?)?.toDouble() ?? 0.85,
      temperature: (json['temperature'] as num?)?.toDouble() ?? 28.0,
      humidity: (json['humidity'] as num?)?.toDouble() ?? 65.0,
      lpgWeightKg: (json['lpg_weight_kg'] as num?)?.toDouble() ?? 38.6,
      lpgMaxWeightKg: (json['lpg_max_weight_kg'] as num?)?.toDouble() ?? 50.0,
      lpgCapacityPercent: (json['lpg_capacity_percent'] as num?)?.toDouble() ?? 77.2,
      isLiveStream: json['is_live_stream'] ?? false,
    );
  }
}

class TelemetrySummary {
  final String branchId;
  final String timeframe;
  final double revenueMyr;
  final int totalCycles;
  final int waterLiters;
  final double powerKwh;

  TelemetrySummary({
    required this.branchId,
    required this.timeframe,
    required this.revenueMyr,
    required this.totalCycles,
    required this.waterLiters,
    required this.powerKwh,
  });

  factory TelemetrySummary.fromJson(Map<String, dynamic> json) {
    return TelemetrySummary(
      branchId: json['branch_id'] ?? 'msu-shah-alam',
      timeframe: json['timeframe'] ?? 'daily',
      revenueMyr: (json['revenue_myr'] as num?)?.toDouble() ?? 324.50,
      totalCycles: json['total_cycles'] ?? 48,
      waterLiters: json['water_liters'] ?? 2160,
      powerKwh: (json['power_kwh'] as num?)?.toDouble() ?? 42.6,
    );
  }
}
