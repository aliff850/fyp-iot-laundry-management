from datetime import datetime, timezone
from typing import Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="Smart Laundry Monitoring API", version="1.0.0")

# Enable CORS for web frontend and mobile integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for the latest reading
latest_data = {
    "voltage": None,
    "temperature": None,
    "humidity": None,
    "received_at": None,
}


class SensorPayload(BaseModel):
    voltage: float = Field(..., ge=0.0, le=5.0, description="Analog voltage from MQ-6")
    temperature: float = Field(..., description="Temperature in Celsius from DHT22")
    humidity: float = Field(..., ge=0.0, le=100.0, description="Relative humidity in percentage")


@app.get("/")
def root():
    return {"status": "online", "service": "Sensor Monitor API"}


@app.post("/api/update", status_code=status.HTTP_200_OK)
def update_sensor_data(payload: SensorPayload):
    global latest_data
    latest_data = {
        "voltage": payload.voltage,
        "temperature": payload.temperature,
        "humidity": payload.humidity,
        "received_at": datetime.now(timezone.utc).isoformat(),
    }
    return {"message": "Reading updated successfully", "data": latest_data}


@app.get("/api/latest")
def get_latest_data():
    if latest_data["received_at"] is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No sensor data received yet",
        )
    return latest_data