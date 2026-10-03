import os
from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional
from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel, Field

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
INDEX_FILE = os.path.join(STATIC_DIR, "index.html")

app = FastAPI(
    title="MSU SpinSense - Smart Laundry Operator API",
    description="IoT Laundry Management & Fleet Control API per PRD Specifications",
    version="1.0.0",
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

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    operator_name: str
    role: str

class MachineParameters(BaseModel):
    price: float = Field(..., ge=1.0, le=50.0, description="Cycle price in MYR")
    duration_mins: int = Field(..., ge=1, le=180, description="Cycle duration in minutes")
    temp_celsius: int = Field(..., ge=20, le=90, description="Wash or dry temperature")
    water_level: Literal["Low", "Medium", "High"] = Field("Medium", description="Water level for washers")
    spin_speed: int = Field(800, description="Spin RPM (400, 800, 1200)")
    door_locked: bool = Field(True, description="Door lock override status")

class MachineCommand(BaseModel):
    command: Literal["start", "pause", "stop"]

class Machine(BaseModel):
    id: str
    name: str
    type: Literal["washer", "dryer"]
    status: Literal["IDLE", "RUNNING", "ERROR"]
    remaining_time: int = Field(0, description="Remaining cycle minutes")
    current_cycle: Optional[str] = None
    parameters: MachineParameters

class SensorPayload(BaseModel):
    voltage: float = 0.0
    temperature: float = 0.0
    humidity: float = 0.0

# ==========================================
# In-Memory State & Mock Fixtures
# ==========================================

# Active branches
BRANCHES = [
    {"id": "msu-shah-alam", "name": "MSU Shah Alam", "location": "Student Service Centre, Ground Floor"},
    {"id": "msu-cheras", "name": "MSU Cheras", "location": "Campus Laundry Annex, Level 1"},
]

# Fleet state (4 washers, 4 dryers) - Hippo Laundry
machines_db: Dict[str, Machine] = {
    "W-01": Machine(
        id="W-01",
        name="Washer #01 (Hippo Laundry 15kg)",
        type="washer",
        status="RUNNING",
        remaining_time=18,
        current_cycle="Standard Cotton 40°C",
        parameters=MachineParameters(price=6.00, duration_mins=35, temp_celsius=40, water_level="High", spin_speed=1200, door_locked=True),
    ),
    "W-02": Machine(
        id="W-02",
        name="Washer #02 (Hippo Laundry 15kg)",
        type="washer",
        status="IDLE",
        remaining_time=0,
        current_cycle=None,
        parameters=MachineParameters(price=6.00, duration_mins=30, temp_celsius=30, water_level="Medium", spin_speed=800, door_locked=False),
    ),
    "W-03": Machine(
        id="W-03",
        name="Washer #03 (Hippo Laundry 20kg)",
        type="washer",
        status="RUNNING",
        remaining_time=27,
        current_cycle="Heavy Bedding 60°C",
        parameters=MachineParameters(price=8.50, duration_mins=45, temp_celsius=60, water_level="High", spin_speed=1200, door_locked=True),
    ),
    "W-04": Machine(
        id="W-04",
        name="Washer #04 (Hippo Laundry 15kg)",
        type="washer",
        status="ERROR",
        remaining_time=0,
        current_cycle="Water Inlet Fault (E04)",
        parameters=MachineParameters(price=6.00, duration_mins=30, temp_celsius=30, water_level="Low", spin_speed=400, door_locked=False),
    ),
    "D-01": Machine(
        id="D-01",
        name="Dryer #01 (Hippo Laundry Gas 16kg)",
        type="dryer",
        status="RUNNING",
        remaining_time=22,
        current_cycle="High Heat Express",
        parameters=MachineParameters(price=5.50, duration_mins=30, temp_celsius=65, water_level="Low", spin_speed=400, door_locked=True),
    ),
    "D-02": Machine(
        id="D-02",
        name="Dryer #02 (Hippo Laundry Gas 16kg)",
        type="dryer",
        status="IDLE",
        remaining_time=0,
        current_cycle=None,
        parameters=MachineParameters(price=5.50, duration_mins=30, temp_celsius=50, water_level="Low", spin_speed=400, door_locked=False),
    ),
    "D-03": Machine(
        id="D-03",
        name="Dryer #03 (Hippo Laundry Gas 20kg)",
        type="dryer",
        status="RUNNING",
        remaining_time=9,
        current_cycle="Delicates Low Heat",
        parameters=MachineParameters(price=7.00, duration_mins=35, temp_celsius=45, water_level="Low", spin_speed=400, door_locked=True),
    ),
    "D-04": Machine(
        id="D-04",
        name="Dryer #04 (Hippo Laundry Gas 16kg)",
        type="dryer",
        status="IDLE",
        remaining_time=0,
        current_cycle=None,
        parameters=MachineParameters(price=5.50, duration_mins=30, temp_celsius=55, water_level="Low", spin_speed=400, door_locked=False),
    ),
}

# Live ESP32 + Peripheral State
latest_edge_data = {
    "voltage": 0.85,
    "temperature": 27.8,
    "humidity": 65.4,
    "received_at": datetime.now(timezone.utc).isoformat(),
    "is_live_stream": False,
    # Simulated load cell placeholder until physical HX711 arrives
    "lpg_weight_kg": 38.6,
    "lpg_max_weight_kg": 50.0,
    "lpg_capacity_percent": 77.2,
    "is_leak_detected": False,
    "leak_status": "SAFE",
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
        "version": "1.0.0",
        "endpoints": ["/auth/token", "/machines", "/telemetry", "/branches", "/api/latest", "/api/data", "/api/update"],
    }

@app.post("/auth/token", response_model=TokenResponse)
def login_operator(payload: LoginRequest):
    """Simulates operator authentication per FR-1.1"""
    if payload.username == "admin" and payload.password == "admin":
        return TokenResponse(
            access_token="msu-mock-jwt-token-998877",
            operator_name="MSU Laundry Supervisor",
            role="Branch Operator",
        )
    # Default permissive login for prototype demo
    return TokenResponse(
        access_token=f"msu-token-{payload.username}-demo",
        operator_name=payload.username.capitalize() or "Operator",
        role="Operator",
    )

@app.get("/branches")
def list_branches():
    """Returns available branch list per FR-1.3"""
    return BRANCHES

@app.get("/machines", response_model=List[Machine])
def list_machines(type: Optional[str] = Query(None, description="Filter by washer or dryer")):
    """Returns all fleet units categorized by type per FR-2.1"""
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
    """Issue start, pause, stop commands per FR-3.2"""
    if machine_id not in machines_db:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    m = machines_db[machine_id]
    if cmd.command == "start":
        m.status = "RUNNING"
        if m.remaining_time == 0:
            m.remaining_time = m.parameters.duration_mins
        m.parameters.door_locked = True
    elif cmd.command == "pause":
        m.status = "IDLE"
    elif cmd.command == "stop":
        m.status = "IDLE"
        m.remaining_time = 0
        m.parameters.door_locked = False

    return {"message": f"Command '{cmd.command}' executed successfully", "machine": m}

@app.put("/machines/{machine_id}/parameters")
def update_machine_parameters(machine_id: str, params: MachineParameters):
    """Update machine parameters per FR-3.1"""
    if machine_id not in machines_db:
        raise HTTPException(status_code=404, detail="Machine not found")
    
    machines_db[machine_id].parameters = params
    return {"message": "Parameters updated successfully", "parameters": params}

@app.get("/telemetry")
def get_telemetry(
    branch_id: str = "msu-shah-alam",
    timeframe: Literal["daily", "weekly", "monthly"] = "daily"
):
    """Returns consumption, revenue, and usage analytics per FR-4.1"""
    if timeframe == "daily":
        return {
            "branch_id": branch_id,
            "timeframe": timeframe,
            "revenue_myr": 482.50,
            "total_cycles": 86,
            "water_liters": 3870,
            "power_kwh": 64.2,
            "active_units": 6,
            "idle_units": 1,
            "fault_units": 1,
            "hourly_distribution": [
                {"hour": "08:00", "cycles": 4},
                {"hour": "10:00", "cycles": 9},
                {"hour": "12:00", "cycles": 14},
                {"hour": "14:00", "cycles": 11},
                {"hour": "16:00", "cycles": 16},
                {"hour": "18:00", "cycles": 20},
                {"hour": "20:00", "cycles": 12},
            ]
        }
    elif timeframe == "weekly":
        return {
            "branch_id": branch_id,
            "timeframe": timeframe,
            "revenue_myr": 3410.00,
            "total_cycles": 612,
            "water_liters": 27540,
            "power_kwh": 456.8,
            "active_units": 7,
            "idle_units": 1,
            "fault_units": 0,
            "daily_revenue": [
                {"day": "Mon", "revenue": 420},
                {"day": "Tue", "revenue": 390},
                {"day": "Wed", "revenue": 450},
                {"day": "Thu", "revenue": 510},
                {"day": "Fri", "revenue": 580},
                {"day": "Sat", "revenue": 620},
                {"day": "Sun", "revenue": 440},
            ]
        }
    else:
        return {
            "branch_id": branch_id,
            "timeframe": timeframe,
            "revenue_myr": 14650.00,
            "total_cycles": 2580,
            "water_liters": 116100,
            "power_kwh": 1928.0,
            "active_units": 7,
            "idle_units": 1,
            "fault_units": 0,
        }

# ==========================================
# ESP32 Edge Ingestion & Safety Endpoints
# ==========================================

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