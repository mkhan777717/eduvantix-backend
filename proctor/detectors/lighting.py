"""
detectors/lighting.py — Detects LOW_LIGHT and CAMERA_BLOCKED conditions.
Uses adaptive brightness threshold from CalibrationService.
Priority 3: Runs on every frame (image-level check, no face required).
"""
from __future__ import annotations

import logging

import cv2
import numpy as np

from detectors.base import BaseDetector, FlagResult
from detectors.context import DetectorContext

logger = logging.getLogger(__name__)

CAMERA_BLOCKED_THRESHOLD = 10  # almost completely black


class LightingDetector(BaseDetector):
    NAME = "lighting"
    VERSION = "v1.0.0"
    PRIORITY = 3

    def is_enabled(self, config: object) -> bool:
        return getattr(config, "enable_lighting_check", True)

    async def _detect(
        self, frame: np.ndarray, ctx: DetectorContext
    ) -> list[FlagResult]:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        brightness = float(np.mean(gray))

        # CAMERA_BLOCKED: nearly black frame
        if brightness < CAMERA_BLOCKED_THRESHOLD:
            return [FlagResult(
                flag="CAMERA_BLOCKED",
                confidence=1.0,
                severity="HIGH",
                detector_version=self.versioned_name,
                metadata={"brightness": round(brightness, 2)},
            )]

        # Use adaptive threshold from calibration if available
        low_light_threshold = (
            ctx.calibration.brightness_threshold
            if ctx.calibration.is_calibrated
            else getattr(ctx.institute_config, "low_light_threshold", 50)
        )

        if brightness < low_light_threshold:
            # Confidence scales with how far below threshold
            confidence = min(1.0, (low_light_threshold - brightness) / low_light_threshold)
            return [FlagResult(
                flag="LOW_LIGHT",
                confidence=round(confidence, 3),
                severity="LOW",
                detector_version=self.versioned_name,
                metadata={
                    "brightness": round(brightness, 2),
                    "threshold": low_light_threshold,
                },
            )]

        return []
