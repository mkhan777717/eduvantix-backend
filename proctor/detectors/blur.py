"""
detectors/blur.py — Detects BLURRY_CAMERA using Laplacian variance.
Priority 5: Image-level check, runs on every frame.
"""
from __future__ import annotations

import cv2
import numpy as np

from detectors.base import BaseDetector, FlagResult
from detectors.context import DetectorContext


class BlurDetector(BaseDetector):
    NAME = "blur"
    VERSION = "v1.0.0"
    PRIORITY = 5

    def is_enabled(self, config: object) -> bool:
        return getattr(config, "enable_blur_check", True)

    async def _detect(
        self, frame: np.ndarray, ctx: DetectorContext
    ) -> list[FlagResult]:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        blur_threshold = getattr(ctx.institute_config, "blur_threshold", 100.0)

        if laplacian_var < blur_threshold:
            # Lower variance = more blurry = higher confidence
            confidence = min(1.0, (blur_threshold - laplacian_var) / blur_threshold)
            return [FlagResult(
                flag="BLURRY_CAMERA",
                confidence=round(confidence, 3),
                severity="LOW",
                detector_version=self.versioned_name,
                metadata={
                    "blur_score": round(laplacian_var, 2),
                    "threshold": blur_threshold,
                },
            )]

        return []
