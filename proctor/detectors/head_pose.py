"""
detectors/head_pose.py — Multi-stage head pose estimation using OpenCV solvePnP.
Tracks yaw/pitch/roll and fires LOOK_AWAY_LONG only after sustained threshold exceeded.
Priority 2: Runs after FaceDetector (skipped on NO_FACE via short-circuit).
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict

import cv2
import numpy as np

from detectors.base import BaseDetector, FlagResult
from detectors.context import DetectorContext

logger = logging.getLogger(__name__)

# ── 3D facial model reference points (MediaPipe landmark indices) ─────────────
FACE_3D_POINTS = np.array([
    [0.0,   0.0,    0.0],     # Nose tip           (1)
    [0.0,  -330.0, -65.0],    # Chin               (152)
    [-225.0, 170.0, -135.0],  # Left eye corner    (263)
    [225.0, 170.0, -135.0],   # Right eye corner   (33)
    [-150.0, -150.0, -125.0], # Left mouth corner  (287)
    [150.0, -150.0, -125.0],  # Right mouth corner (57)
], dtype=np.float64)

LANDMARK_INDICES = [1, 152, 263, 33, 287, 57]

# ── Per-session sustained look-away state ─────────────────────────────────────
_session_state: dict[str, dict] = defaultdict(lambda: {
    "look_away_start": None,
    "last_yaw": 0.0,
    "last_pitch": 0.0,
})


class HeadPoseDetector(BaseDetector):
    NAME = "head_pose"
    VERSION = "v1.1.0"
    PRIORITY = 2

    # Multi-stage thresholds
    THRESHOLDS = {
        "yaw":   {"warning": 20.0, "flag_start": 30.0, "high": 40.0},
        "pitch": {"warning": 15.0, "flag_start": 25.0, "high": 35.0},
    }

    def is_enabled(self, config: object) -> bool:
        return getattr(config, "enable_head_pose", True)

    async def _detect(
        self, frame: np.ndarray, ctx: DetectorContext
    ) -> list[FlagResult]:
        face_mesh = ctx.face_mesh
        if face_mesh is None:
            return []

        import cv2 as _cv2
        h, w = frame.shape[:2]
        rgb_frame = _cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(rgb_frame)

        if not results.multi_face_landmarks:
            # Face disappeared — reset look-away timer
            _session_state[ctx.session_id]["look_away_start"] = None
            return []

        landmarks = results.multi_face_landmarks[0].landmark

        # Extract 2D image points
        face_2d = np.array([
            [landmarks[idx].x * w, landmarks[idx].y * h]
            for idx in LANDMARK_INDICES
        ], dtype=np.float64)

        # Camera matrix approximation
        focal_len = w
        cam_matrix = np.array([
            [focal_len, 0, w / 2],
            [0, focal_len, h / 2],
            [0, 0, 1],
        ], dtype=np.float64)
        dist_coeffs = np.zeros((4, 1), dtype=np.float64)

        success, rot_vec, trans_vec = cv2.solvePnP(
            FACE_3D_POINTS, face_2d, cam_matrix, dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE,
        )
        if not success:
            return []

        rot_mat, _ = cv2.Rodrigues(rot_vec)
        angles, _, _, _, _, _ = cv2.RQDecomp3x3(rot_mat)
        yaw, pitch, roll = angles[1] * 360, angles[0] * 360, angles[2] * 360

        state = _session_state[ctx.session_id]
        state["last_yaw"] = yaw
        state["last_pitch"] = pitch

        # Multi-stage threshold check
        yaw_abs = abs(yaw)
        pitch_abs = abs(pitch)
        y_thresh = ctx.institute_config.yaw_flag_deg
        p_thresh = ctx.institute_config.pitch_flag_deg
        sustained_s = ctx.institute_config.look_away_threshold_s

        is_looking_away = yaw_abs > y_thresh or pitch_abs > p_thresh

        flags: list[FlagResult] = []
        now = time.monotonic()

        if is_looking_away:
            if state["look_away_start"] is None:
                state["look_away_start"] = now
            else:
                duration = now - state["look_away_start"]
                if duration >= sustained_s:
                    # Compute confidence from degree of deviation
                    max_deviation = max(
                        yaw_abs / self.THRESHOLDS["yaw"]["high"],
                        pitch_abs / self.THRESHOLDS["pitch"]["high"],
                    )
                    confidence = min(1.0, max_deviation)
                    severity = "HIGH" if confidence >= 0.9 else "MEDIUM"

                    flags.append(FlagResult(
                        flag="LOOK_AWAY_LONG",
                        confidence=round(confidence, 3),
                        severity=severity,
                        detector_version=self.versioned_name,
                        metadata={
                            "yaw": round(yaw, 2),
                            "pitch": round(pitch, 2),
                            "roll": round(roll, 2),
                            "sustained_s": round(duration, 1),
                        },
                    ))
        else:
            # Reset timer when looking straight
            state["look_away_start"] = None

        return flags
