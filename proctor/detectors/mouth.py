"""
detectors/mouth.py — Detects MOUTH_MOVEMENT using Mouth Aspect Ratio (MAR).
Requires face detection to have succeeded (skipped on NO_FACE via registry short-circuit).
Priority 4: Runs after face/head_pose.
"""
from __future__ import annotations

import logging
from collections import defaultdict

import cv2
import numpy as np

from detectors.base import BaseDetector, FlagResult
from detectors.context import DetectorContext

logger = logging.getLogger(__name__)

# MediaPipe mouth landmark indices (upper/lower lip pairs)
# Upper lip: 13, 14 / Lower lip: 17, 18 / Corners: 61, 291
UPPER_LIP_IDX = [13, 14]
LOWER_LIP_IDX = [17, 18]
LEFT_CORNER_IDX = 61
RIGHT_CORNER_IDX = 291

# Per-session consecutive frame count for MAR
_session_mouth_frames: dict[str, int] = defaultdict(int)


def _euclidean(p1: np.ndarray, p2: np.ndarray) -> float:
    return float(np.linalg.norm(p1 - p2))


class MouthDetector(BaseDetector):
    NAME = "mouth"
    VERSION = "v1.0.0"
    PRIORITY = 4

    def is_enabled(self, config: object) -> bool:
        return getattr(config, "enable_mouth_detection", True)

    async def _detect(
        self, frame: np.ndarray, ctx: DetectorContext
    ) -> list[FlagResult]:
        face_mesh = ctx.face_mesh
        if face_mesh is None:
            return []

        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb)

        if not results.multi_face_landmarks:
            _session_mouth_frames[ctx.session_id] = 0
            return []

        lm = results.multi_face_landmarks[0].landmark

        def pt(idx: int) -> np.ndarray:
            return np.array([lm[idx].x * w, lm[idx].y * h])

        # Mouth Aspect Ratio = vertical openness / horizontal width
        vertical = (
            _euclidean(pt(UPPER_LIP_IDX[0]), pt(LOWER_LIP_IDX[0]))
            + _euclidean(pt(UPPER_LIP_IDX[1]), pt(LOWER_LIP_IDX[1]))
        ) / 2.0
        horizontal = _euclidean(pt(LEFT_CORNER_IDX), pt(RIGHT_CORNER_IDX))

        mar = vertical / horizontal if horizontal > 0 else 0.0
        mar_threshold = getattr(ctx.institute_config, "mar_threshold", 0.6)
        sustained_frames = getattr(ctx.institute_config, "mar_sustained_frames", 3)

        if mar > mar_threshold:
            _session_mouth_frames[ctx.session_id] += 1
        else:
            _session_mouth_frames[ctx.session_id] = 0

        if _session_mouth_frames[ctx.session_id] >= sustained_frames:
            confidence = min(1.0, mar / (mar_threshold * 1.5))
            return [FlagResult(
                flag="MOUTH_MOVEMENT",
                confidence=round(confidence, 3),
                severity="LOW",
                detector_version=self.versioned_name,
                metadata={
                    "mouth_ratio": round(mar, 3),
                    "threshold": mar_threshold,
                    "consecutive_frames": _session_mouth_frames[ctx.session_id],
                },
            )]

        return []
