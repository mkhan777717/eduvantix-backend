"""
routes/health.py — /api/v1/proctor/health and /api/v1/proctor/metrics endpoints.
"""
from __future__ import annotations

import psutil
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from config import get_settings
from database import check_db_connection
from metrics import proctor_metrics

router = APIRouter()
settings = get_settings()


@router.get("/health")
async def health_check(request: Request) -> JSONResponse:
    """
    Full component health check.
    Verifies MediaPipe, OpenCV, database, disk, and queue.
    """
    mediapipe_ok = hasattr(request.app.state, "face_mesh") and request.app.state.face_mesh is not None
    db_ok = await check_db_connection()

    # Disk check
    try:
        disk = psutil.disk_usage(".")
        disk_free_gb = round(disk.free / (1024 ** 3), 2)
        disk_status = "ok" if disk_free_gb > 1.0 else "warning"
    except Exception:
        disk_free_gb = None
        disk_status = "error"

    # OpenCV check
    try:
        import cv2
        cv2_ok = True
    except ImportError:
        cv2_ok = False

    all_ok = mediapipe_ok and db_ok and cv2_ok
    status = "ok" if all_ok else "degraded"

    return JSONResponse(
        status_code=200 if all_ok else 503,
        content={
            "status": status,
            "version": settings.service_version,
            "uptime_s": proctor_metrics.uptime_s,
            "components": {
                "mediapipe": "ok" if mediapipe_ok else "error",
                "opencv": "ok" if cv2_ok else "error",
                "database": "ok" if db_ok else "error",
                "disk": {
                    "status": disk_status,
                    "free_gb": disk_free_gb,
                },
                "queue": {
                    "size": proctor_metrics.queue_size,
                    "capacity": settings.queue_capacity,
                    "workers": settings.proctor_workers,
                    "high_watermark": proctor_metrics.queue_high_watermark,
                },
            },
        }
    )


@router.get("/metrics")
async def get_metrics() -> dict:
    """
    Returns FPS, queue depth, per-detector timing, and detection counts.
    Compatible with Prometheus text format if further adapted.
    """
    return proctor_metrics.to_dict()
