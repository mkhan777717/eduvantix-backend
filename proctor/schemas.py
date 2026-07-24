"""
schemas.py — Pydantic v2 request/response models for the proctoring API.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator


# ── Shared ────────────────────────────────────────────────────────────────────

class InstituteConfig(BaseModel):
    """Per-institute feature flags and thresholds (snapshot stored in ProctorSession)."""
    frame_interval_s: float = 3.0
    look_away_threshold_s: float = 5.0
    image_retention_days: int = 30
    enable_face_detection: bool = True
    enable_head_pose: bool = True
    enable_mouth_detection: bool = True
    enable_lighting_check: bool = True
    enable_blur_check: bool = True
    enable_webcam: bool = True
    store_flagged_images: bool = True
    new_session_on_reconnect: bool = False
    audio_monitoring: bool = False
    yaw_flag_deg: float = 30.0
    pitch_flag_deg: float = 25.0
    mar_threshold: float = 0.6
    blur_threshold: float = 100.0
    low_light_threshold: int = 50


# ── Session ───────────────────────────────────────────────────────────────────

class SessionStartRequest(BaseModel):
    attempt_id: int
    user_id: int
    institute_config: InstituteConfig | None = None
    consent_given: bool = False


class SessionStartResponse(BaseModel):
    session_id: str
    is_new: bool
    calibration_duration_s: int
    message: str


class SessionEndRequest(BaseModel):
    session_id: str
    reason: str = "EXAM_SUBMITTED"


# ── Frame Analysis ────────────────────────────────────────────────────────────

class FlagResult(BaseModel):
    type: str
    confidence: float = Field(ge=0.0, le=1.0)
    severity: str = "LOW"
    detector_version: str = "v1.0.0"


class FrameAnalysisResponse(BaseModel):
    session_id: str
    trace_id: str
    timestamp: datetime
    frame_number: int
    flags: list[FlagResult]
    metadata: dict[str, Any]
    detector_timings_ms: dict[str, float]
    total_processing_ms: float
    sampling_interval_ms: int
    message: str = ""


# ── Browser Events ────────────────────────────────────────────────────────────

class BrowserEventRequest(BaseModel):
    session_id: str
    flag: str
    trace_id: str = ""
    timestamp: datetime | None = None
    metadata: dict[str, Any] | None = None

    @field_validator("flag")
    @classmethod
    def validate_flag(cls, v: str) -> str:
        allowed = {
            "TAB_HIDDEN", "TAB_RESTORED", "WINDOW_BLUR", "WINDOW_FOCUS",
            "NETWORK_LOST", "CAMERA_DISCONNECTED", "CAMERA_PERMISSION_DENIED",
            "CONSENT_DECLINED",
        }
        if v not in allowed:
            raise ValueError(f"Invalid browser flag: {v}")
        return v


# ── Report ────────────────────────────────────────────────────────────────────

class EventSummaryItem(BaseModel):
    flag: str
    severity: str
    occurrences: int
    total_duration_s: float
    longest_duration_s: float
    first_seen: datetime | None


class CompressedTimelineItem(BaseModel):
    flag: str
    severity: str
    occurrences: int
    total_duration_s: float
    longest_duration_s: float
    first_seen: datetime | None
    thumbnail_url: str | None
    detector_version: str


class ProctorReport(BaseModel):
    session_id: str
    attempt_id: int
    user_id: int
    status: str
    started_at: datetime
    ended_at: datetime | None
    risk_score: float
    consent_given: bool
    reconnect_count: int
    summary: dict[str, EventSummaryItem]
    timeline: list[CompressedTimelineItem]
    raw_event_count: int


# ── Health ────────────────────────────────────────────────────────────────────

class ComponentHealth(BaseModel):
    status: str  # "ok" | "error"
    detail: str | None = None


class HealthResponse(BaseModel):
    status: str
    version: str
    uptime_s: float
    components: dict[str, Any]
