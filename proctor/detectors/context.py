"""
detectors/context.py — Immutable DetectorContext dataclass.
Passed to every detector.analyze(frame, ctx) call.
Contains all shared dependencies — no global imports needed in detectors.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from metrics import ProctorMetrics
    from services.storage_service import StorageService
    from schemas import InstituteConfig


@dataclass(frozen=True)
class CalibrationData:
    """Adaptive thresholds measured during first 15 seconds of session."""
    brightness_threshold: int = 50       # adaptive LOW_LIGHT threshold
    is_calibrated: bool = False
    baseline_brightness: float = 128.0


@dataclass(frozen=True)
class DetectorContext:
    """
    Immutable context object passed to every detector.
    Eliminates argument sprawl as the system grows with new detectors.
    """
    session_id: str
    connection_id: str
    trace_id: str
    frame_number: int
    user_id: int
    institute_config: Any       # InstituteConfig (typed at runtime)
    calibration: CalibrationData
    face_mesh: Any              # MediaPipe FaceMesh singleton
    metrics: Any                # ProctorMetrics (mutable)
    storage: Any                # StorageService (injected)
