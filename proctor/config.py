"""
config.py — Typed settings loaded from environment variables.
All values can be overridden per-institute at session start via DB.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Service ───────────────────────────────────────────────────────────────
    proctor_service_port: int = 8001
    proctor_service_host: str = "0.0.0.0"
    proctor_workers: int = 4
    queue_capacity: int = 50
    queue_timeout_ms: int = 500
    service_version: str = "1.0.0"

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/dmx_academy"

    # ── Storage ───────────────────────────────────────────────────────────────
    storage_backend: Literal["local", "s3", "disabled"] = "local"
    local_storage_path: str = "uploads/proctor"
    image_retention_days: int = 30
    thumbnail_max_width: int = 640
    thumbnail_max_height: int = 360
    thumbnail_jpeg_quality: int = 75
    store_flagged_images: bool = True

    # ── S3 ────────────────────────────────────────────────────────────────────
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_region: str = "ap-south-1"
    s3_bucket: str = ""

    # ── Feature Flags ─────────────────────────────────────────────────────────
    enable_face_detection: bool = True
    enable_head_pose: bool = True
    enable_mouth_detection: bool = True
    enable_lighting_check: bool = True
    enable_blur_check: bool = True
    enable_audio_monitoring: bool = False

    # ── Session Policy ────────────────────────────────────────────────────────
    new_session_on_reconnect: bool = False
    calibration_duration_s: int = 15

    # ── Detection Thresholds ──────────────────────────────────────────────────
    look_away_sustained_s: float = 5.0
    yaw_warning_deg: float = 20.0
    yaw_flag_deg: float = 30.0
    yaw_high_deg: float = 40.0
    pitch_warning_deg: float = 15.0
    pitch_flag_deg: float = 25.0
    pitch_high_deg: float = 35.0
    mar_threshold: float = 0.6
    mar_sustained_frames: int = 3
    blur_threshold: float = 100.0
    low_light_threshold: int = 50

    # ── CORS ──────────────────────────────────────────────────────────────────
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # ── Internal auth ─────────────────────────────────────────────────────────
    internal_api_secret: str = "change-me"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors(cls, v: str) -> str:
        return v  # keep as string; split when needed

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached settings singleton."""
    return Settings()
