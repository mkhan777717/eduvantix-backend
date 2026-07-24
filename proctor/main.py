"""
main.py — FastAPI application factory.
Handles startup lifespan: MediaPipe singleton, detector registry, detection service, cleanup scheduler.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import mediapipe as mp
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from cleanup import start_scheduler, stop_scheduler
from config import get_settings
from detectors.blur import BlurDetector
from detectors.face_detector import FaceDetector
from detectors.head_pose import HeadPoseDetector
from detectors.lighting import LightingDetector
from detectors.mouth import MouthDetector
from detectors.registry import detector_registry
from metrics import proctor_metrics
from routes.health import router as health_router
from routes.proctor import router as proctor_router
from services.detection_service import DetectionService
from services.storage_service import build_storage_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)
settings = get_settings()


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Startup: initialize MediaPipe singleton, detector registry, detection service, scheduler.
    Shutdown: stop workers and scheduler.
    """
    logger.info("[startup] initializing MediaPipe FaceMesh singleton...")
    face_mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=False,
        max_num_faces=2,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    app.state.face_mesh = face_mesh
    logger.info("[startup] MediaPipe FaceMesh initialized")

    # ── Register detectors (plugin architecture) ──────────────────────────────
    detector_registry.register(FaceDetector())
    detector_registry.register(HeadPoseDetector())
    detector_registry.register(LightingDetector())
    detector_registry.register(MouthDetector())
    detector_registry.register(BlurDetector())
    logger.info("[startup] registered %d detectors: %s", len(detector_registry), detector_registry.detector_names)

    # ── Build storage service ─────────────────────────────────────────────────
    storage = build_storage_service()
    logger.info("[startup] storage backend: %s", settings.storage_backend)

    # ── Start detection service (worker pool) ─────────────────────────────────
    detection_service = DetectionService(
        registry=detector_registry,
        storage=storage,
        metrics=proctor_metrics,
        face_mesh=face_mesh,
        num_workers=settings.proctor_workers,
    )
    await detection_service.start()
    app.state.detection_service = detection_service
    logger.info("[startup] detection service started with %d workers", settings.proctor_workers)

    # ── Start cleanup scheduler ───────────────────────────────────────────────
    start_scheduler()

    logger.info("[startup] proctor service ready on port %d", settings.proctor_service_port)

    yield  # ── Application runs here ─────────────────────────────────────────

    # ── Shutdown ──────────────────────────────────────────────────────────────
    logger.info("[shutdown] stopping detection service workers...")
    await detection_service.stop()

    logger.info("[shutdown] stopping cleanup scheduler...")
    stop_scheduler()

    logger.info("[shutdown] closing MediaPipe FaceMesh...")
    face_mesh.close()

    logger.info("[shutdown] complete")


# ── Application factory ────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    app = FastAPI(
        title="DMX Academy — AI Proctoring Service",
        description="Production-ready AI webcam proctoring for online examinations. Advisory-only.",
        version=settings.service_version,
        docs_url="/api/v1/proctor/docs",
        redoc_url="/api/v1/proctor/redoc",
        openapi_url="/api/v1/proctor/openapi.json",
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ───────────────────────────────────────────────────────────────
    prefix = "/api/v1/proctor"
    app.include_router(proctor_router, prefix=prefix, tags=["Proctoring"])
    app.include_router(health_router, prefix=prefix, tags=["Health"])

    # ── Serve saved thumbnails ────────────────────────────────────────────────
    import os
    os.makedirs("uploads/proctor", exist_ok=True)
    app.mount(
        "/proctor-media",
        StaticFiles(directory="."),
        name="proctor-media",
    )

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.proctor_service_host,
        port=settings.proctor_service_port,
        reload=True,
        log_level="info",
    )
