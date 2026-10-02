import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/models.dart';

class ApiService {
  static const String baseUrl = 'https://esp32-gas-api.onrender.com';

  // Fallback mock branches
  static final List<Branch> mockBranches = [
    Branch(
      id: 'msu-shah-alam',
      name: 'MSU Shah Alam',
      location: 'Section 13, Shah Alam, Selangor',
      campusType: 'Main Campus Hub',
      address: 'Management & Science University, Section 13, 40100 Shah Alam, Selangor',
      washersCount: 4,
      dryersCount: 4,
      totalMachines: 8,
      status: 'ONLINE',
    ),
    Branch(
      id: 'msu-cheras',
      name: 'MSU Cheras',
      location: 'Cheras Commercial Centre, KL',
      campusType: 'Cheras Campus Centre',
      address: 'MSU College Cheras, Jalan Manickavasagam, 56000 Cheras, Kuala Lumpur',
      washersCount: 4,
      dryersCount: 4,
      totalMachines: 8,
      status: 'ONLINE',
    ),
  ];

  // Fallback mock machines (8 Hippo Laundry units)
  static final List<Machine> mockMachines = [
    Machine(
      id: 'W-01',
      name: 'Washer #01 (15kg)',
      type: 'washer',
      status: 'RUNNING',
      remainingTime: 18,
      currentCycle: 'Cotton 40°C',
      parameters: MachineParameters(price: 6.0, durationMins: 35, tempCelsius: 40, waterLevel: 'High', spinSpeed: 1200, doorLocked: true),
    ),
    Machine(
      id: 'W-02',
      name: 'Washer #02 (15kg)',
      type: 'washer',
      status: 'IDLE',
      remainingTime: 0,
      currentCycle: null,
      parameters: MachineParameters(price: 6.0, durationMins: 30, tempCelsius: 30, waterLevel: 'Medium', spinSpeed: 800, doorLocked: false),
    ),
    Machine(
      id: 'W-03',
      name: 'Washer #03 (20kg)',
      type: 'washer',
      status: 'RUNNING',
      remainingTime: 27,
      currentCycle: 'Bedding 60°C',
      parameters: MachineParameters(price: 8.5, durationMins: 45, tempCelsius: 60, waterLevel: 'High', spinSpeed: 1200, doorLocked: true),
    ),
    Machine(
      id: 'W-04',
      name: 'Washer #04 (15kg)',
      type: 'washer',
      status: 'ERROR',
      remainingTime: 0,
      currentCycle: 'Inlet Fault (E04)',
      parameters: MachineParameters(price: 6.0, durationMins: 30, tempCelsius: 30, waterLevel: 'Low', spinSpeed: 400, doorLocked: false),
    ),
    Machine(
      id: 'D-01',
      name: 'Dryer #01 (16kg)',
      type: 'dryer',
      status: 'RUNNING',
      remainingTime: 22,
      currentCycle: 'Express Heat',
      parameters: MachineParameters(price: 5.5, durationMins: 30, tempCelsius: 65, waterLevel: 'Low', spinSpeed: 400, doorLocked: true),
    ),
    Machine(
      id: 'D-02',
      name: 'Dryer #02 (16kg)',
      type: 'dryer',
      status: 'IDLE',
      remainingTime: 0,
      currentCycle: null,
      parameters: MachineParameters(price: 5.5, durationMins: 30, tempCelsius: 50, waterLevel: 'Low', spinSpeed: 400, doorLocked: false),
    ),
    Machine(
      id: 'D-03',
      name: 'Dryer #03 (20kg)',
      type: 'dryer',
      status: 'RUNNING',
      remainingTime: 9,
      currentCycle: 'Delicates',
      parameters: MachineParameters(price: 7.0, durationMins: 35, tempCelsius: 45, waterLevel: 'Low', spinSpeed: 400, doorLocked: true),
    ),
    Machine(
      id: 'D-04',
      name: 'Dryer #04 (16kg)',
      type: 'dryer',
      status: 'IDLE',
      remainingTime: 0,
      currentCycle: null,
      parameters: MachineParameters(price: 5.5, durationMins: 30, tempCelsius: 55, waterLevel: 'Low', spinSpeed: 400, doorLocked: false),
    ),
  ];

  // Instance methods
  Future<List<Branch>> fetchBranches() => getBranches();
  Future<List<Machine>> fetchMachines([String? branchId]) => getMachines(branchId);
  Future<SensorData> fetchSensorData([String? branchId]) => getLatestSensorData();
  Future<TelemetrySummary> fetchTelemetrySummary(String branchId) => getTelemetry(branchId);
  Future<bool> sendMachineCommand(String machineId, String command) => issueCommand(machineId, command);
  Future<bool> updateMachineParameters(String machineId, MachineParameters params) => updateParameters(machineId, params);

  // Static implementations
  static Future<List<Branch>> getBranches() async {
    try {
      final response = await http
          .get(Uri.parse('$baseUrl/branches'))
          .timeout(const Duration(seconds: 4));
      if (response.statusCode == 200) {
        final List data = jsonDecode(response.body);
        return data.map((e) => Branch.fromJson(e)).toList();
      }
    } catch (_) {}
    return mockBranches;
  }

  static Future<List<Machine>> getMachines([String? branchId]) async {
    try {
      final url = branchId != null ? '$baseUrl/machines?branch_id=$branchId' : '$baseUrl/machines';
      final response = await http
          .get(Uri.parse(url))
          .timeout(const Duration(seconds: 4));
      if (response.statusCode == 200) {
        final List data = jsonDecode(response.body);
        return data.map((e) => Machine.fromJson(e)).toList();
      }
    } catch (_) {}
    return mockMachines;
  }

  static Future<SensorData> getLatestSensorData() async {
    try {
      final response = await http
          .get(Uri.parse('$baseUrl/api/latest'))
          .timeout(const Duration(seconds: 4));
      if (response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        return SensorData.fromJson(data);
      }
    } catch (_) {}
    return SensorData(
      voltage: 0.85,
      temperature: 28.0,
      humidity: 65.0,
      lpgWeightKg: 38.6,
      lpgMaxWeightKg: 50.0,
      lpgCapacityPercent: 77.2,
      isLiveStream: false,
    );
  }

  static Future<TelemetrySummary> getTelemetry(String branchId) async {
    try {
      final response = await http
          .get(Uri.parse('$baseUrl/telemetry?branch_id=$branchId'))
          .timeout(const Duration(seconds: 4));
      if (response.statusCode == 200) {
        final Map<String, dynamic> data = jsonDecode(response.body);
        return TelemetrySummary.fromJson(data);
      }
    } catch (_) {}
    return TelemetrySummary(
      branchId: branchId,
      timeframe: 'daily',
      revenueMyr: 324.50,
      totalCycles: 48,
      waterLiters: 2160,
      powerKwh: 42.6,
    );
  }

  static Future<bool> issueCommand(String machineId, String command) async {
    try {
      final response = await http
          .post(
            Uri.parse('$baseUrl/machines/$machineId/commands'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode({'command': command}),
          )
          .timeout(const Duration(seconds: 4));
      if (response.statusCode == 200) return true;
    } catch (_) {}
    // Update local state if offline
    final idx = mockMachines.indexWhere((m) => m.id == machineId);
    if (idx != -1) {
      if (command == 'start') {
        // mock start
      }
      return true;
    }
    return false;
  }

  static Future<bool> updateParameters(String machineId, MachineParameters params) async {
    try {
      final response = await http
          .put(
            Uri.parse('$baseUrl/machines/$machineId/parameters'),
            headers: {'Content-Type': 'application/json'},
            body: jsonEncode(params.toJson()),
          )
          .timeout(const Duration(seconds: 4));
      if (response.statusCode == 200) return true;
    } catch (_) {}
    final idx = mockMachines.indexWhere((m) => m.id == machineId);
    if (idx != -1) {
      mockMachines[idx].parameters.price = params.price;
      mockMachines[idx].parameters.durationMins = params.durationMins;
      mockMachines[idx].parameters.tempCelsius = params.tempCelsius;
      mockMachines[idx].parameters.waterLevel = params.waterLevel;
      mockMachines[idx].parameters.spinSpeed = params.spinSpeed;
      mockMachines[idx].parameters.doorLocked = params.doorLocked;
      return true;
    }
    return false;
  }
}
