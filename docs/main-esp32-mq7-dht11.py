import os
from fastapi import FastAPI
from fastapi.responses import FileResponse
from pydantic import BaseModel
from supabase import create_client, Client

app = FastAPI()

# Retrieve database credentials from environment variables securely
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

# Initialize the Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# In-memory storage for instant dashboard updates
latest_data = {
    "temperature": 0.0,
    "humidity": 0.0,
    "co_voltage": 0.0
}

class SensorData(BaseModel):
    temperature: float
    humidity: float
    co_voltage: float

@app.post("/api/data")
async def receive_data(data: SensorData):
    # 1. Update the live dashboard data
    latest_data["temperature"] = data.temperature
    latest_data["humidity"] = data.humidity
    latest_data["co_voltage"] = data.co_voltage
    
    # 2. Insert a new row into the Supabase database
    # try:
    #     supabase.table("sensor_readings").insert({
    #         "temperature": data.temperature,
    #         "humidity": data.humidity,
    #         "co_voltage": data.co_voltage
    #     }).execute()
    # except Exception as e:
    #     print(f"Database insertion error: {e}")
    #     return {"status": "error", "message": "Failed to save data"}

    return {"status": "success"}

@app.get("/api/data")
async def get_data():
    return latest_data

@app.get("/")
async def serve_dashboard():
    return FileResponse("index.html")