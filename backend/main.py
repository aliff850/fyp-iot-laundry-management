import os
from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional
from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
INDEX_FILE = os.path.join(STATIC_DIR, "index.html")

app = FastAPI(
    title="MSU SpinSense - Smart Laundry Operator API",
    description="IoT Laundry Management & Fleet Control API per PRD Specifications",
    version="1.1.0",
)

# Enable CORS for Next.js operator dashboard and edge nodes
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# Data Models
# ==========================================

class OperatorRegisterRequest(BaseModel):
    name: str = Field(..., description="Operator full name")
    email: str = Field(..., description="Operator email address")
    password: str = Field(..., min_length=4, description="Account password")
    company: str = Field("MSU Laundry Services", description="Operating company / facility")

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    operator_name: str
    role: str

class BranchCreateRequest(BaseModel):
    name: str = Field(..., description="Branch title, e.g., MSU Shah Alam")
    address: str = Field(..., description="Street address")
    city: str = Field("Shah Alam", description="City")
    state: str = Field("Selangor", description="State")
    postal_code: str = Field("40100", description="Postal Code")
    lat: float = Field(..., description="Latitude coordinate")
    lng: float = Field(..., description="Longitude coordinate")
    contact_phone: str = Field("+60 3-5521 2888", description="Emergency telephone")
    opening_hours: str = Field("24 Hours Daily", description="Store operating hours")
    gateway_ip: Optional[str] = Field("192.168.1.100", description="Edge Gateway Broker IP")

class MachineParameters(BaseModel):
    price: float = Field(..., ge=1.0, le=50.0, description="Cycle price in MYR")
    duration_mins: int = Field(..., ge=1, le=180, description="Cycle duration in minutes")
    temp_celsius: int = Field(..., ge=20, le=90, description="Wash or dry temperature")
    water_level: Literal["Low", "Medium", "High"] = Field("Medium", description="Water level for washers")
    spin_speed: int = Field(800, description="Spin RPM (400, 800, 1200)")
    door_locked: bool = Field(True, description="Door lock override status")

class MachineCommand(BaseModel):
    command: Literal["start", "pause", "stop", "unlock"]

class MachineProvisionRequest(BaseModel):
    type: Literal["washer", "dryer"]
    label: str = Field(..., description="Assigned Machine Label, e.g., Washer #05")
    serial_number: str = Field(..., description="Controller Serial Number")
    mac_address: str = Field(..., description="Device MAC Address")
    capacity_kg: int = Field(15, ge=10, le=30, description="Drum load capacity in kg")
    ip_address: Optional[str] = Field("192.168.1.155", description="Assigned subnet IP")
    client_id: Optional[str] = Field(None, description="Assigned MQTT Client ID")
    model: Optional[str] = Field("Hippo Commercial Heavy Duty", description="Model specification")

class Machine(BaseModel):
    id: str
    branch_id: str = "msu-shah-alam"
    name: str
    type: Literal["washer", "dryer"]
    status: Literal["IDLE", "RUNNING", "ERROR", "PAUSED", "OFFLINE"]
    remaining_time: int = Field(0, description="Remaining cycle minutes")
    current_cycle: Optional[str] = None
    phase: Literal["Fill", "Wash", "Rinse", "Spin", "Dry", "Cool Down", "Idle"] = "Idle"
    capacity_kg: int = 15
    power_w: float = 0.0
    water_l: float = 0.0
    drum_rpm: int = 0
    fault_code: Optional[str] = None
    fault_subsystem: Optional[str] = None
    fault_remediation: Optional[str] = None
    parameters: MachineParameters

class LpgCylinder(BaseModel):
    cylinder_id: str
    label: str
    channel: str = "HX711-CH1"
    weight_kg: float = 38.5
    max_capacity_kg: float = 50.0
    capacity_percent: float = 77.0
    status: Literal["HEALTHY", "WARNING", "CRITICAL", "MAINTENANCE"] = "HEALTHY"
    maintenance_mode: bool = False

class LpgMaintenanceRequest(BaseModel):
    enabled: bool
    action: Optional[Literal["tare_full", "tare_empty"]] = None

class MaintenanceLogEntry(BaseModel):
    id: str
    machine_id: str
    technician_name: str
    action_taken: str
    fault_code: Optional[str] = None
    timestamp: str

class SensorPayload(BaseModel):
    voltage: float = 0.0
    temperature: float = 0.0
    humidity: float = 0.0

# ==========================================
# In-Memory State & Fixtures
# ==========================================

registered_operators = [
    {"name": "MSU Laundry Supervisor", "email": "supervisor@msu.edu.my", "password": "admin", "company": "MSU Facilities"}
]

BRANCHES_DB: Dict[str, dict] = {
    "msu-shah-alam": {
        "id": "msu-shah-alam",
        "name": "MSU Shah Alam",
        "campus_type": "Main Campus Hub",
        "address": "Management & Science University, Section 13",
        "city": "Shah Alam",
        "state": "Selangor",
        "postal_code": "40100",
        "lat": 3.0565,
        "lng": 101.5540,
        "contact_phone": "+60 3-5521 2888",
        "opening_hours": "24 Hours (Daily)",
        "gateway_ip": "192.168.10.1",
        "status": "ONLINE",
    },
    "msu-cheras": {
        "id": "msu-cheras",
        "name": "MSU Cheras",
        "campus_type": "Cheras Campus Centre",
        "address": "MSU College Cheras, Jalan Manickavasagam",
        "city": "Cheras",
        "state": "Kuala Lumpur",
        "postal_code": "56000",
        "lat": 3.0901,
        "lng": 101.7390,
        "contact_phone": "+60 3-9132 2888",
        "opening_hours": "07:00 - 23:00 Daily",
        "gateway_ip": "192.168.20.1",
        "status": "ONLINE",
    },
}

# Multi-cylinder LPG racks per branch (4 cylinders per branch)
lpg_manifolds_db: Dict[str, List[LpgCylinder]] = {
    "msu-shah-alam": [
        LpgCylinder(cylinder_id="CYL-01", label="Cylinder #01", channel="HX711-CH1", weight_kg=42.4, max_capacity_kg=50.0, capacity_percent=84.8, status="HEALTHY", maintenance_mode=False),
        LpgCylinder(cylinder_id="CYL-02", label="Cylinder #02", channel="HX711-CH2", weight_kg=38.6, max_capacity_kg=50.0, capacity_percent=77.2, status="HEALTHY", maintenance_mode=False),
        LpgCylinder(cylinder_id="CYL-03", label="Cylinder #03", channel="HX711-CH3", weight_kg=6.5, max_capacity_kg=50.0, capacity_percent=13.0, status="WARNING", maintenance_mode=False),
        LpgCylinder(cylinder_id="CYL-04", label="Cylinder #04", channel="HX711-CH4", weight_kg=2.1, max_capacity_kg=50.0, capacity_percent=4.2, status="CRITICAL", maintenance_mode=False),
    ],
    "msu-cheras": [
        LpgCylinder(cylinder_id="CYL-01", label="Cylinder #01", channel="HX711-CH1", weight_kg=48.0, max_capacity_kg=50.0, capacity_percent=96.0, status="HEALTHY", maintenance_mode=False),
        LpgCylinder(cylinder_id="CYL-02", label="Cylinder #02", channel="HX711-CH2", weight_kg=35.2, max_capacity_kg=50.0, capacity_percent=70.4, status="HEALTHY", maintenance_mode=False),
        LpgCylinder(cylinder_id="CYL-03", label="Cylinder #03", channel="HX711-CH3", weight_kg=29.0, max_capacity_kg=50.0, capacity_percent=58.0, status="HEALTHY", maintenance_mode=False),
        LpgCylinder(cylinder_id="CYL-04", label="Cylinder #04", channel="HX711-CH4", weight_kg=44.1, max_capacity_kg=50.0, capacity_percent=88.2, status="HEALTHY", maintenance_mode=False),
    ],
}

# Machines database segregated by branch
machines_db: Dict[str, Machine] = {
    # MSU Shah Alam Fleet
    "W-01": Machine(
        id="W-01",
        branch_id="msu-shah-alam",
        name="Washer #01 (15kg)",
        type="washer",
        status="RUNNING",
        remaining_time=18,
        current_cycle="Standard Cotton 40°C",
        phase="Wash",
        capacity_kg=15,
        power_w=1850.0,
        water_l=48.0,
        drum_rpm=800,
        parameters=MachineParameters(price=6.00, duration_mins=35, temp_celsius=40, water_level="High", spin_speed=1200, door_locked=True),
    ),
    "W-02": Machine(
        id="W-02",
        branch_id="msu-shah-alam",
        name="Washer #02 (15kg)",
        type="washer",
        status="IDLE",
        remaining_time=0,
        current_cycle=None,
        phase="Idle",
        capacity_kg=15,
        power_w=35.0,
        water_l=0.0,
        drum_rpm=0,
        parameters=MachineParameters(price=6.00, duration_mins=30, temp_celsius=30, water_level="Medium", spin_speed=800, door_locked=False),
    ),
    "W-03": Machine(
        id="W-03",
        branch_id="msu-shah-alam",
        name="Washer #03 (20kg)",
        type="washer",
        status="RUNNING",
        remaining_time=27,
        current_cycle="Heavy Bedding 60°C",
        phase="Rinse",
        capacity_kg=20,
        power_w=2100.0,
        water_l=62.0,
        drum_rpm=650,
        parameters=MachineParameters(price=8.50, duration_mins=45, temp_celsius=60, water_level="High", spin_speed=1200, door_locked=True),
    ),
    "W-04": Machine(
        id="W-04",
        branch_id="msu-shah-alam",
        name="Washer #04 (15kg)",
        type="washer",
        status="ERROR",
        remaining_time=0,
        current_cycle="Fault Interrupted",
        phase="Idle",
        capacity_kg=15,
        power_w=12.0,
        water_l=15.0,
        drum_rpm=0,
        fault_code="E01",
        fault_subsystem="Inlet Solenoid Valve",
        fault_remediation="Inspect main water intake valve; verify supply pressure and clean debris filter screen.",
        parameters=MachineParameters(price=6.00, duration_mins=30, temp_celsius=30, water_level="Low", spin_speed=400, door_locked=False),
    ),
    "D-01": Machine(
        id="D-01",
        branch_id="msu-shah-alam",
        name="Dryer #01 (Gas 16kg)",
        type="dryer",
        status="RUNNING",
        remaining_time=22,
        current_cycle="High Heat Express",
        phase="Dry",
        capacity_kg=16,
        power_w=480.0,
        water_l=0.0,
        drum_rpm=450,
        parameters=MachineParameters(price=5.50, duration_mins=30, temp_celsius=65, water_level="Low", spin_speed=400, door_locked=True),
    ),
    "D-02": Machine(
        id="D-02",
        branch_id="msu-shah-alam",
        name="Dryer #02 (Gas 16kg)",
        type="dryer",
        status="IDLE",
        remaining_time=0,
        current_cycle=None,
        phase="Idle",
        capacity_kg=16,
        power_w=20.0,
        water_l=0.0,
        drum_rpm=0,
        parameters=MachineParameters(price=5.50, duration_mins=30, temp_celsius=50, water_level="Low", spin_speed=400, door_locked=False),
    ),
    "D-03": Machine(
        id="D-03",
        branch_id="msu-shah-alam",
        name="Dryer #03 (Gas 20kg)",
        type="dryer",
        status="RUNNING",
        remaining_time=9,
        current_cycle="Delicates Low Heat",
        phase="Cool Down",
        capacity_kg=20,
        power_w=310.0,
        water_l=0.0,
        drum_rpm=400,
        parameters=MachineParameters(price=7.00, duration_mins=35, temp_celsius=45, water_level="Low", spin_speed=400, door_locked=True),
    ),
    "D-04": Machine(
        id="D-04",
        branch_id="msu-shah-alam",
        name="Dryer #04 (Gas 16kg)",
        type="dryer",
        status="IDLE",
        remaining_time=0,
        current_cycle=None,
        phase="Idle",
        capacity_kg=16,
        power_w=22.0,
        water_l=0.0,
        drum_rpm=0,
        parameters=MachineParameters(price=5.50, duration_mins=30, temp_celsius=55, water_level="Low", spin_speed=400, door_locked=False),
    ),

    # MSU Cheras Fleet
    "CH-W01": Machine(
        id="CH-W01",
        branch_id="msu-cheras",
        name="Washer #01 (15kg)",
        type="washer",
        status="RUNNING",
        remaining_time=14,
        current_cycle="Standard Cotton 40°C",
        phase="Spin",
        capacity_kg=15,
        power_w=1780.0,
        water_l=45.0,
        drum_rpm=1200,
        parameters=MachineParameters(price=6.00, duration_mins=35, temp_celsius=40, water_level="High", spin_speed=1200, door_locked=True),
    ),
    "CH-W02": Machine(
        id="CH-W02",
        branch_id="msu-cheras",
        name="Washer #02 (15kg)",
        type="washer",
        status="IDLE",
        remaining_time=0,
        current_cycle=None,
        phase="Idle",
        capacity_kg=15,
        power_w=30.0,
        water_l=0.0,
        drum_rpm=0,
        parameters=MachineParameters(price=6.00, duration_mins=30, temp_celsius=30, water_level="Medium", spin_speed=800, door_locked=False),
    ),
    "CH-W03": Machine(
        id="CH-W03",
        branch_id="msu-cheras",
        name="Washer #03 (15kg)",
        type="washer",
        status="IDLE",
        remaining_time=0,
        current_cycle=None,
        phase="Idle",
        capacity_kg=15,
        power_w=30.0,
        water_l=0.0,
        drum_rpm=0,
        parameters=MachineParameters(price=6.00, duration_mins=30, temp_celsius=30, water_level="Medium", spin_speed=800, door_locked=False),
    ),
    "CH-W04": Machine(
        id="CH-W04",
        branch_id="msu-cheras",
        name="Washer #04 (20kg)",
        type="washer",
        status="RUNNING",
        remaining_time=32,
        current_cycle="Heavy Bedding 60°C",
        phase="Wash",
        capacity_kg=20,
        power_w=2050.0,
        water_l=60.0,
        drum_rpm=750,
        parameters=MachineParameters(price=8.50, duration_mins=45, temp_celsius=60, water_level="High", spin_speed=1200, door_locked=True),
    ),
    "CH-D01": Machine(
        id="CH-D01",
        branch_id="msu-cheras",
        name="Dryer #01 (Gas 16kg)",
        type="dryer",
        status="IDLE",
        remaining_time=0,
        current_cycle=None,
        phase="Idle",
        capacity_kg=16,
        power_w=25.0,
        water_l=0.0,
        drum_rpm=0,
        parameters=MachineParameters(price=5.50, duration_mins=30, temp_celsius=55, water_level="Low", spin_speed=400, door_locked=False),
    ),
    "CH-D02": Machine(
        id="CH-D02",
        branch_id="msu-cheras",
        name="Dryer #02 (Gas 16kg)",
        type="dryer",
        status="RUNNING",
        remaining_time=19,
        current_cycle="High Heat Express",
        phase="Dry",
        capacity_kg=16,
        power_w=490.0,
        water_l=0.0,
        drum_rpm=450,
        parameters=MachineParameters(price=5.50, duration_mins=30, temp_celsius=65, water_level="Low", spin_speed=400, door_locked=True),
    ),
    "CH-D03": Machine(
        id="CH-D03",
        branch_id="msu-cheras",
        name="Dryer #03 (Gas 16kg)",
        type="dryer",
        status="IDLE",
        remaining_time=0,
        current_cycle=None,
        phase="Idle",
        capacity_kg=16,
        power_w=25.0,
        water_l=0.0,
        drum_rpm=0,
        parameters=MachineParameters(price=5.50, duration_mins=30, temp_celsius=50, water_level="Low", spin_speed=400, door_locked=False),
    ),
    "CH-D04": Machine(
        id="CH-D04",
        branch_id="msu-cheras",
        name="Dryer #04 (Gas 20kg)",
        type="dryer",
        status="IDLE",
        remaining_time=0,
        current_cycle=None,
        phase="Idle",
        capacity_kg=20,
        power_w=25.0,
        water_l=0.0,
        drum_rpm=0,
        parameters=MachineParameters(price=7.00, duration_mins=35, temp_celsius=50, water_level="Low", spin_speed=400, door_locked=False),
    ),
}

maintenance_logs_db: List[MaintenanceLogEntry] = [
    MaintenanceLogEntry(
        id="LOG-101",
        machine_id="W-04",
        technician_name="Ahmad Faiz (Technician ID 44)",
        action_taken="Tested water intake solenoid coil; identified 12V relay failure and scheduled replacement part.",
        fault_code="E01",
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
]

# Live ESP32 Edge State
latest_edge_data = {
    "voltage": 0.85,
    "temperature": 27.8,
    "humidity": 65.4,
    "received_at": datetime.now(timezone.utc).isoformat(),
    "is_live_stream": False,
    "lpg_weight_kg": 38.6,
    "lpg_max_weight_kg": 50.0,
    "lpg_capacity_percent": 77.2,
    "is_leak_detected": False,
    "leak_status": "SAFE",
}

# ==========================================
# Helper Functions
# ==========================================

def get_branch_summary(branch_id: str):
    branch_meta = BRANCHES_DB.get(branch_id)
    if not branch_meta:
        return None
    
    machines = [m for m in machines_db.values() if m.branch_id == branch_id]
    washers = [m for m in machines if m.type == "washer"]
    dryers = [m for m in machines if m.type == "dryer"]
    
    lpg_cylinders = lpg_manifolds_db.get(branch_id, [])
    has_crit_gas = any(c.status == "CRITICAL" and not c.maintenance_mode for c in lpg_cylinders)
    has_warn_gas = any(c.status == "WARNING" and not c.maintenance_mode for c in lpg_cylinders)
    has_machine_error = any(m.status == "ERROR" for m in machines)
    is_gas_leak = latest_edge_data.get("is_leak_detected", False)
    is_high_temp = latest_edge_data.get("temperature", 28.0) > 45.0
    
    if is_gas_leak or is_high_temp or has_crit_gas:
        health_status = "CRITICAL"
        marker_color = "red"
    elif has_warn_gas or has_machine_error:
        health_status = "WARNING"
        marker_color = "amber"
    else:
        health_status = "HEALTHY"
        marker_color = "green"
        
    healthy_cylinders = sum(1 for c in lpg_cylinders if c.status == "HEALTHY")
    
    return {
        **branch_meta,
        "total_washers": len(washers),
        "active_washers": sum(1 for w in washers if w.status == "RUNNING"),
        "idle_washers": sum(1 for w in washers if w.status == "IDLE"),
        "error_washers": sum(1 for w in washers if w.status == "ERROR"),
        "total_dryers": len(dryers),
        "active_dryers": sum(1 for d in dryers if d.status == "RUNNING"),
        "idle_dryers": sum(1 for d in dryers if d.status == "IDLE"),
        "error_dryers": sum(1 for d in dryers if d.status == "ERROR"),
        "total_machines": len(machines),
        "total_cylinders": len(lpg_cylinders),
        "healthy_cylinders": healthy_cylinders,
        "lpg_status": f"{healthy_cylinders}/{len(lpg_cylinders)} Cylinders Healthy",
        "health_status": health_status,
        "marker_color": marker_color,
    }

# ==========================================
# Endpoints
# ==========================================

@app.get("/", response_class=HTMLResponse)
@app.get("/dashboard", response_class=HTMLResponse)
@app.get("/monitor", response_class=HTMLResponse)
async def serve_dashboard():
    """Serves the real-time auto-updating IoT telemetry dashboard"""
    target = INDEX_FILE if os.path.exists(INDEX_FILE) else os.path.join(BASE_DIR, "index.html")
    if os.path.exists(target):
        with open(target, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse("<h2>MSU SpinSense Live Monitor: index.html not found.</h2>")

@app.get("/api")
@app.get("/api/status")
def api_status():
    return {
        "status": "online",
        "service": "MSU SpinSense Operator API",
        "version": "1.1.0",
        "endpoints": [
            "/auth/register",
            "/auth/token",
            "/branches",
            "/branches/{id}/dashboard",
            "/branches/{id}/machines",
            "/branches/{id}/lpg",
            "/branches/{id}/safety",
            "/branches/{id}/analytics",
            "/branches/{id}/availability",
            "/machines/{id}",
            "/machines/{id}/commands",
            "/machines/{id}/parameters",
            "/machines/{id}/maintenance-log",
            "/api/latest",
            "/api/data",
            "/api/update",
        ],
    }

# ------------------------------------------
# Auth Endpoints (FR-W1, FR-W2)
# ------------------------------------------

@app.post("/auth/register")
def register_operator(payload: OperatorRegisterRequest):
    """Registers a new operator account per FR-W2"""
    for op in registered_operators:
        if op["email"] == payload.email:
            raise HTTPException(status_code=400, detail="Operator with this email already registered")
    
    new_op = {
        "name": payload.name,
        "email": payload.email,
        "password": payload.password,
        "company": payload.company,
    }
    registered_operators.append(new_op)
    
    return {
        "message": "Operator registered successfully",
        "access_token": f"msu-token-{abs(hash(payload.email))}",
        "token_type": "bearer",
        "operator_name": payload.name,
        "role": "Branch Operator",
    }

@app.post("/auth/token", response_model=TokenResponse)
def login_operator(payload: LoginRequest):
    """Authenticates operator per FR-W2"""
    matched = next((op for op in registered_operators if op["email"] == payload.username and op["password"] == payload.password), None)
    if matched:
        return TokenResponse(
            access_token=f"msu-jwt-token-{abs(hash(matched['email']))}",
            operator_name=matched["name"],
            role="Branch Operator",
        )
    
    # Default fallback for admin or prototype demo
    if payload.username == "admin" and payload.password == "admin":
        return TokenResponse(
            access_token="msu-mock-jwt-token-998877",
            operator_name="MSU Laundry Supervisor",
            role="Branch Supervisor",
        )
    
    # Permissive fallback for seamless testing
    return TokenResponse(
        access_token=f"msu-token-{abs(hash(payload.username))}",
        operator_name=payload.username.capitalize() or "Operator",
        role="Operator",
    )

# ------------------------------------------
# Multi-Branch Endpoints (FR-W3, FR-W4)
# ------------------------------------------

@app.get("/branches")
def list_branches():
    """Returns all registered branches enriched with machine counts, LPG status, and coordinates"""
    return [get_branch_summary(b_id) for b_id in BRANCHES_DB.keys()]

@app.post("/branches", status_code=status.HTTP_201_CREATED)
def create_branch(payload: BranchCreateRequest):
    """Registers a new branch per FR-W4"""
    branch_id = payload.name.lower().replace(" ", "-").replace("&", "and")
    if branch_id in BRANCHES_DB:
        raise HTTPException(status_code=409, detail="A branch with this name or ID already exists")
    
    BRANCHES_DB[branch_id] = {
        "id": branch_id,
        "name": payload.name,
        "campus_type": "Campus Laundry Hub",
        "address": payload.address,
        "city": payload.city,
        "state": payload.state,
        "postal_code": payload.postal_code,
        "lat": payload.lat,
        "lng": payload.lng,
        "contact_phone": payload.contact_phone,
        "opening_hours": payload.opening_hours,
        "gateway_ip": payload.gateway_ip or "192.168.1.1",
        "status": "ONLINE",
    }

    # Initialize 4 standard cylinders for the new branch
    lpg_manifolds_db[branch_id] = [
        LpgCylinder(cylinder_id=f"CYL-0{i}", label=f"Cylinder #0{i}", channel=f"HX711-CH{i}", weight_kg=45.0, max_capacity_kg=50.0, capacity_percent=90.0, status="HEALTHY")
        for i in range(1, 5)
    ]

    return get_branch_summary(branch_id)

@app.get("/branches/{branch_id}/dashboard")
def get_branch_dashboard(branch_id: str):
    """Full telemetry bundle for single branch dashboard"""
    summary = get_branch_summary(branch_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    b_machines = [m for m in machines_db.values() if m.branch_id == branch_id]
    washers = [m for m in b_machines if m.type == "washer"]
    dryers = [m for m in b_machines if m.type == "dryer"]
    lpg = lpg_manifolds_db.get(branch_id, [])

    return {
        "branch": summary,
        "washers": washers,
        "dryers": dryers,
        "lpg_manifold": lpg,
        "safety": {
            "voltage": latest_edge_data["voltage"],
            "gas_ppm": round(latest_edge_data["voltage"] * 650.0, 1),
            "is_leak_detected": latest_edge_data["is_leak_detected"],
            "leak_status": latest_edge_data["leak_status"],
            "ambient_temp_c": latest_edge_data["temperature"],
            "humidity_rh": latest_edge_data["humidity"],
            "is_high_heat": latest_edge_data["temperature"] > 45.0,
            "received_at": latest_edge_data["received_at"],
        },
    }

# ------------------------------------------
# Machine Operations & Provisioning (FR-W5, FR-W6, FR-W7, FR-W8, FR-W9)
# ------------------------------------------

@app.get("/branches/{branch_id}/machines", response_model=List[Machine])
def list_branch_machines(branch_id: str, type: Optional[str] = Query(None, description="Filter by washer or dryer")):
    """List machines strictly filtered by branch and type"""
    items = [m for m in machines_db.values() if m.branch_id == branch_id]
    if type:
        items = [m for m in items if m.type == type.lower()]
    return items

@app.post("/branches/{branch_id}/machines", status_code=status.HTTP_201_CREATED)
def provision_machine(branch_id: str, payload: MachineProvisionRequest):
    """Provisions a new smart washer or dryer per FR-W7"""
    if branch_id not in BRANCHES_DB:
        raise HTTPException(status_code=404, detail="Branch not found")
    
    # Auto-generate ID if needed
    prefix = "W" if payload.type == "washer" else "D"
    existing_nums = [
        int(m.id.split("-")[-1]) for m in machines_db.values()
        if m.branch_id == branch_id and m.type == payload.type and m.id.split("-")[-1].isdigit()
    ]
    next_num = max(existing_nums, default=0) + 1
    new_id = f"{prefix}-{next_num:02d}"

    new_machine = Machine(
        id=new_id,
        branch_id=branch_id,
        name=f"{payload.label} ({payload.capacity_kg}kg)",
        type=payload.type,
        status="IDLE",
        remaining_time=0,
        current_cycle=None,
        phase="Idle",
        capacity_kg=payload.capacity_kg,
        power_w=20.0,
        water_l=0.0,
        drum_rpm=0,
        parameters=MachineParameters(
            price=6.00 if payload.type == "washer" else 5.50,
            duration_mins=30,
            temp_celsius=40 if payload.type == "washer" else 55,
            water_level="Medium",
            spin_speed=800 if payload.type == "washer" else 400,
            door_locked=False,
        ),
    )
    machines_db[new_id] = new_machine
    return new_machine

@app.get("/machines", response_model=List[Machine])
def list_all_machines(type: Optional[str] = Query(None, description="Filter by washer or dryer")):
    """Returns all fleet units across all branches"""
    items = list(machines_db.values())
    if type:
        items = [m for m in items if m.type == type.lower()]
    return items

@app.get("/machines/{machine_id}", response_model=Machine)
def get_machine(machine_id: str):
    if machine_id not in machines_db:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machines_db[machine_id]

@app.post("/machines/{machine_id}/commands")
def issue_machine_command(machine_id: str, cmd: MachineCommand):
    """Issue start, pause, stop, unlock commands per FR-W8"""
    if machine_id not in machines_db:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    m = machines_db[machine_id]
    if cmd.command == "start":
        m.status = "RUNNING"
        if m.remaining_time == 0:
            m.remaining_time = m.parameters.duration_mins
        m.phase = "Wash" if m.type == "washer" else "Dry"
        m.parameters.door_locked = True
        m.power_w = 1850.0 if m.type == "washer" else 480.0
        m.drum_rpm = 800 if m.type == "washer" else 450
    elif cmd.command == "pause":
        m.status = "PAUSED"
    elif cmd.command == "stop":
        m.status = "IDLE"
        m.remaining_time = 0
        m.phase = "Idle"
        m.power_w = 20.0
        m.drum_rpm = 0
        m.parameters.door_locked = False
    elif cmd.command == "unlock":
        m.parameters.door_locked = False

    return {"message": f"Command '{cmd.command}' executed successfully", "machine": m}

@app.put("/machines/{machine_id}/parameters")
def update_machine_parameters(machine_id: str, params: MachineParameters):
    """Update machine parameters per FR-W8"""
    if machine_id not in machines_db:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    machines_db[machine_id].parameters = params
    return {"message": "Parameters updated successfully", "parameters": params}

@app.post("/machines/{machine_id}/maintenance-log")
def add_maintenance_log(machine_id: str, payload: MaintenanceLogEntry):
    """Add a maintenance log entry per FR-W9"""
    maintenance_logs_db.append(payload)
    # If technician addressed error, optionally clear machine error
    if machine_id in machines_db and machines_db[machine_id].status == "ERROR":
        machines_db[machine_id].status = "IDLE"
        machines_db[machine_id].fault_code = None
        machines_db[machine_id].fault_subsystem = None
        machines_db[machine_id].fault_remediation = None
    return {"status": "success", "log": payload}

@app.get("/machines/{machine_id}/maintenance-logs", response_model=List[MaintenanceLogEntry])
def get_maintenance_logs(machine_id: str):
    return [l for l in maintenance_logs_db if l.machine_id == machine_id]

# ------------------------------------------
# Multi-Cylinder LPG Management (FR-W10, FR-W11)
# ------------------------------------------

@app.get("/branches/{branch_id}/lpg", response_model=List[LpgCylinder])
def get_branch_lpg(branch_id: str):
    """Returns multi-cylinder manifold rack telemetry per FR-W10"""
    if branch_id not in lpg_manifolds_db:
        raise HTTPException(status_code=404, detail="Branch LPG manifold not found")
    return lpg_manifolds_db[branch_id]

@app.post("/branches/{branch_id}/lpg/{cylinder_id}/maintenance")
def toggle_cylinder_maintenance(branch_id: str, cylinder_id: str, req: LpgMaintenanceRequest):
    """Toggles tank swap maintenance mode and performs tare recalibration per FR-W11"""
    if branch_id not in lpg_manifolds_db:
        raise HTTPException(status_code=404, detail="Branch LPG manifold not found")
    
    cylinders = lpg_manifolds_db[branch_id]
    target = next((c for c in cylinders if c.cylinder_id == cylinder_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Cylinder not found in branch manifold")
    
    target.maintenance_mode = req.enabled
    
    if req.action == "tare_full":
        target.weight_kg = 50.0
        target.capacity_percent = 100.0
        target.status = "HEALTHY"
    elif req.action == "tare_empty":
        target.weight_kg = 0.0
        target.capacity_percent = 0.0
        target.status = "CRITICAL"
    else:
        # Re-evaluate status based on weight
        if target.maintenance_mode:
            target.status = "MAINTENANCE"
        else:
            pct = (target.weight_kg / target.max_capacity_kg) * 100.0
            target.capacity_percent = round(pct, 1)
            if pct < 5.0:
                target.status = "CRITICAL"
            elif pct < 15.0:
                target.status = "WARNING"
            else:
                target.status = "HEALTHY"

    return {
        "message": f"Cylinder {cylinder_id} maintenance updated",
        "cylinder": target,
    }

# ------------------------------------------
# Environmental Safety Endpoints (FR-W12, FR-W13)
# ------------------------------------------

@app.get("/branches/{branch_id}/safety")
def get_branch_safety(branch_id: str):
    """Returns MQ-6 gas and DHT22 environment safety readings per FR-W12 & FR-W13"""
    v = latest_edge_data["voltage"]
    ppm = round(v * 650.0, 1)
    is_leak = latest_edge_data["is_leak_detected"] or (v > 1.3)
    temp = latest_edge_data["temperature"]
    humidity = latest_edge_data["humidity"]

    alert_level = "CRITICAL" if (is_leak or temp > 45.0) else ("WARNING" if (v > 1.0 or temp > 40.0) else "SAFE")

    return {
        "branch_id": branch_id,
        "sensor_voltage": v,
        "gas_ppm": ppm,
        "gas_leak_detected": is_leak,
        "leak_status": latest_edge_data["leak_status"],
        "ambient_temp_c": temp,
        "humidity_rh": humidity,
        "high_temp_alert": temp > 45.0,
        "alert_level": alert_level,
        "received_at": latest_edge_data["received_at"],
    }

# ------------------------------------------
# Analytics & Customer Availability (FR-W14, FR-C1..C4)
# ------------------------------------------

@app.get("/branches/{branch_id}/analytics")
def get_branch_analytics(
    branch_id: str,
    timeframe: Literal["daily", "weekly", "monthly"] = "daily",
):
    """Consumption, revenue, and dryer gas burn efficiency telemetry per FR-W14"""
    if timeframe == "daily":
        return {
            "branch_id": branch_id,
            "timeframe": timeframe,
            "revenue_myr": 482.50,
            "total_cycles": 86,
            "water_liters": 3870,
            "power_kwh": 64.2,
            "lpg_consumed_kg": 14.8,
            "gas_efficiency_kg_per_cycle": 0.38,  # kg of gas per drying cycle
            "dryer_cycles": 39,
            "washer_cycles": 47,
            "hourly_distribution": [
                {"hour": "08:00", "cycles": 4},
                {"hour": "10:00", "cycles": 9},
                {"hour": "12:00", "cycles": 14},
                {"hour": "14:00", "cycles": 11},
                {"hour": "16:00", "cycles": 16},
                {"hour": "18:00", "cycles": 20},
                {"hour": "20:00", "cycles": 12},
            ],
        }
    elif timeframe == "weekly":
        return {
            "branch_id": branch_id,
            "timeframe": timeframe,
            "revenue_myr": 3410.00,
            "total_cycles": 612,
            "water_liters": 27540,
            "power_kwh": 456.8,
            "lpg_consumed_kg": 105.0,
            "gas_efficiency_kg_per_cycle": 0.37,
            "dryer_cycles": 284,
            "washer_cycles": 328,
            "daily_revenue": [
                {"day": "Mon", "revenue": 420},
                {"day": "Tue", "revenue": 390},
                {"day": "Wed", "revenue": 450},
                {"day": "Thu", "revenue": 510},
                {"day": "Fri", "revenue": 580},
                {"day": "Sat", "revenue": 620},
                {"day": "Sun", "revenue": 440},
            ],
        }
    else:
        return {
            "branch_id": branch_id,
            "timeframe": timeframe,
            "revenue_myr": 14650.00,
            "total_cycles": 2580,
            "water_liters": 116100,
            "power_kwh": 1928.0,
            "lpg_consumed_kg": 442.0,
            "gas_efficiency_kg_per_cycle": 0.36,
            "dryer_cycles": 1220,
            "washer_cycles": 1360,
        }

@app.get("/branches/{branch_id}/availability")
def get_branch_availability(branch_id: str):
    """Public customer availability endpoint per FR-C1..C4"""
    b_machines = [m for m in machines_db.values() if m.branch_id == branch_id]
    washers = [m for m in b_machines if m.type == "washer"]
    dryers = [m for m in b_machines if m.type == "dryer"]

    running_w = [w for w in washers if w.status == "RUNNING"]
    running_d = [d for d in dryers if d.status == "RUNNING"]

    next_washer_mins = min([w.remaining_time for w in running_w], default=0)
    next_dryer_mins = min([d.remaining_time for d in running_d], default=0)

    return {
        "branch_id": branch_id,
        "available_washers": sum(1 for w in washers if w.status == "IDLE"),
        "total_washers": len(washers),
        "available_dryers": sum(1 for d in dryers if d.status == "IDLE"),
        "total_dryers": len(dryers),
        "next_washer_available_minutes": next_washer_mins,
        "next_dryer_available_minutes": next_dryer_mins,
    }

# Backward compatibility route for /telemetry
@app.get("/telemetry")
def get_telemetry_legacy(
    branch_id: str = "msu-shah-alam",
    timeframe: Literal["daily", "weekly", "monthly"] = "daily",
):
    return get_branch_analytics(branch_id=branch_id, timeframe=timeframe)

# ------------------------------------------
# ESP32 Edge Ingestion & Safety Endpoints
# ------------------------------------------

@app.post("/api/update")
@app.post("/api/data")
async def update_sensor_data(payload: SensorPayload):
    """Inbound telemetry from ESP32 edge node (MQ-6 & DHT22)"""
    global latest_edge_data

    # Gas leak detection threshold: baseline ~0.8V; warning > 1.2V; critical > 1.8V
    is_leak = payload.voltage > 1.3
    leak_status = "CRITICAL" if payload.voltage > 1.8 else ("WARNING" if payload.voltage > 1.3 else "SAFE")

    latest_edge_data["voltage"] = round(float(payload.voltage), 2)
    latest_edge_data["temperature"] = round(float(payload.temperature), 1)
    latest_edge_data["humidity"] = round(float(payload.humidity), 1)
    latest_edge_data["received_at"] = datetime.now(timezone.utc).isoformat()
    latest_edge_data["is_live_stream"] = True
    latest_edge_data["is_leak_detected"] = is_leak
    latest_edge_data["leak_status"] = leak_status

    return {"status": "success"}

@app.get("/api/latest")
@app.get("/api/data")
@app.get("/api/update")
def get_latest_data():
    """Real-time edge telemetry with enriched cylinder weight and safety status"""
    return latest_edge_data