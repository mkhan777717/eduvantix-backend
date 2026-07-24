"""
services/calibration_service.py — Adaptive threshold calibration.
Measures baseline brightness during the first N seconds of each session.
Stores per-session calibration data to reduce false positives.
"""
from __future__ import annotations

import asyncio
import logging
import statistics
from collections import defaultdict

import cv2
import numpy as np

from config import get_settings
from detectors.context import CalibrationData

logger = logging.getLogger(__name__)
settings = get_settings()

# In-memory calibration state per session
_calibration_frames: dict[str, list[float]] = defaultdict(list)
_calibration_complete: dict[str, bool] = defaultdict(bool)
_calibration_data: dict[str, CalibrationData] = {}


def compute_brightness(frame: np.ndarray) -> float:
    """Return mean pixel brightness of grayscale frame."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return float(np.mean(gray))


async def add_calibration_frame(session_id: str, frame: np.ndarray) -> None:
    """
    Collect a frame during the calibration window.
    Called by detection_service during the first N seconds.
    """
    if _calibration_complete.get(session_id, False):
        return
    brightness = compute_brightness(frame)
    _calibration_frames[session_id].append(brightness)


async def finalize_calibration(session_id: str) -> CalibrationData:
    """
    Compute adaptive thresholds from collected frames.
    LOW_LIGHT threshold = 60% of baseline, clamped to [30, 70].
    """
    if _calibration_complete.get(session_id, False):
        return _calibration_data.get(session_id, CalibrationData())

    frames = _calibration_frames.get(session_id, [])
    if not frames:
        data = CalibrationData(is_calibrated=False)
        _calibration_data[session_id] = data
        _calibration_complete[session_id] = True
        return data

    baseline = statistics.mean(frames)
    raw_threshold = baseline * 0.6
    threshold = max(30, min(70, int(raw_threshold)))

    data = CalibrationData(
        brightness_threshold=threshold,
        is_calibrated=True,
        baseline_brightness=round(baseline, 2),
    )
    _calibration_data[session_id] = data
    _calibration_complete[session_id] = True

    logger.info(
        "[calibration] session=%s baseline_brightness=%.1f threshold=%d",
        session_id, baseline, threshold,
    )
    return data


def get_calibration(session_id: str) -> CalibrationData:
    """Return the calibration data for a session (or defaults if not yet calibrated)."""
    return _calibration_data.get(session_id, CalibrationData())


def is_calibrated(session_id: str) -> bool:
    return _calibration_complete.get(session_id, False)


def reset_session_calibration(session_id: str) -> None:
    """Clean up calibration state when session ends."""
    _calibration_frames.pop(session_id, None)
    _calibration_complete.pop(session_id, None)
    _calibration_data.pop(session_id, None)
