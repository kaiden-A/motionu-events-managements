from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import certificates, checkin, dashboard, events, participants, public

API_PREFIX = "/api/v1"

app = FastAPI(title="Motion-U API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(events.router, prefix=API_PREFIX)
app.include_router(participants.router, prefix=API_PREFIX)
app.include_router(checkin.router, prefix=API_PREFIX)
app.include_router(certificates.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)
app.include_router(public.router, prefix=API_PREFIX)


@app.get("/health")
async def healthz():
    return {"status": "ok"}
