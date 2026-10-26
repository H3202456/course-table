from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.database import init_db
from app.routers import legacy, szpu

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"

app = FastAPI(
    title="Minimal Timetable",
    version="0.1.0",
    description="一个没有废话的大学课表。",
)

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

app.include_router(legacy.router, prefix="/api")
app.include_router(szpu.router, prefix="/api")


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/health")
def health():
    return {"status": "ok", "app": "minimal-timetable", "version": "0.1.0"}


@app.get("/manifest.webmanifest", include_in_schema=False)
def pwa_manifest():
    return FileResponse(FRONTEND_DIR / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/service-worker.js", include_in_schema=False)
def pwa_service_worker():
    return FileResponse(FRONTEND_DIR / "service-worker.js", media_type="text/javascript",
                        headers={"Cache-Control": "no-cache"})


@app.get("/index.html", include_in_schema=False)
def pwa_index_html():
    return FileResponse(FRONTEND_DIR / "index.html")
