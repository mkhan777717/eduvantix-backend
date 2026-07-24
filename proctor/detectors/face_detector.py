"""
detectors/face_detector.py — Detects NO_FACE and MULTIPLE_FACE using MediaPipe FaceMesh singleton.
Priority 1: Runs first. NO_FACE short-circuits head_pose and mouth detectors.
"""
from __future__ import annotations

import logging

import numpy as np

from detectors.base import BaseDetector, FlagResult
from detectors.context import DetectorContext

logger = logging.getLogger(__name__)

# Severity map
SEVERITY_NO_FACE = "HIGH"
SEVERITY_MULTIPLE = "HIGH"


class FaceDetector(BaseDetector):
    NAME = "face_detector"
    VERSION = "v1.0.0"
    PRIORITY = 1

    def is_enabled(self, config: object) -> bool:
        return getattr(config, "enable_face_detection", True)

    async def _detect(
        self, frame: np.ndarray, ctx: DetectorContext
    ) -> list[FlagResult]:
        """
        Runs MediaPipe FaceMesh on frame (reuses singleton via ctx.face_mesh).
        Returns NO_FACE if 0 faces, MULTIPLE_FACE if >1.
        """
        face_mesh = ctx.face_mesh
        if face_mesh is None:
            logger.warning("[face_detector] face_mesh singleton not available trace_id=%s", ctx.trace_id)
            return []

        import cv2
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb_frame)
        face_count = len(results.multi_face_landmarks) if results.multi_face_landmarks else 0

        flags: list[FlagResult] = []

        if face_count == 0:
            flags.append(FlagResult(
                flag="NO_FACE",
                confidence=1.0,
                severity=SEVERITY_NO_FACE,
                detector_version=self.versioned_name,
                metadata={"face_count": 0},
            ))
        elif face_count > 1:
            flags.append(FlagResult(
                flag="MULTIPLE_FACE",
                confidence=min(1.0, 0.5 + face_count * 0.2),
                severity=SEVERITY_MULTIPLE,
                detector_version=self.versioned_name,
                metadata={"face_count": face_count},
            ))

        return flags
