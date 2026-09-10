from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import certificates, checkin, dashboard, events, participants, public

app = FastAPI(title="Motion-U API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(events.router)
app.include_router(participants.router)
app.include_router(checkin.router)
app.include_router(certificates.router)
app.include_router(dashboard.router)
app.include_router(public.router)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
