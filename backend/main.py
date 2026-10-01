from fastapi import FastAPI

app = FastAPI(title="Smart Laundry Monitoring API")

@app.get("/health")
def health_check():
    return {"status": "online"}