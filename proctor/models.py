"""
models.py — SQLAlchemy ORM models for the AI proctoring tables.
These mirror the Prisma models (ProctorSession, ProctorConnection, ProctorAIEvent).
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


# ── Enums ─────────────────────────────────────────────────────────────────────

class ProctorFlag(str, enum.Enum):
    NO_FACE = "NO_FACE"
    MULTIPLE_FACE = "MULTIPLE_FACE"
    LOOK_AWAY_LONG = "LOOK_AWAY_LONG"
    MOUTH_MOVEMENT = "MOUTH_MOVEMENT"
    LOW_LIGHT = "LOW_LIGHT"
    BLURRY_CAMERA = "BLURRY_CAMERA"
    CAMERA_BLOCKED = "CAMERA_BLOCKED"
    TAB_HIDDEN = "TAB_HIDDEN"
    TAB_RESTORED = "TAB_RESTORED"
    WINDOW_BLUR = "WINDOW_BLUR"
    WINDOW_FOCUS = "WINDOW_FOCUS"
    NETWORK_LOST = "NETWORK_LOST"
    CAMERA_DISCONNECTED = "CAMERA_DISCONNECTED"
    CAMERA_PERMISSION_DENIED = "CAMERA_PERMISSION_DENIED"
    CONSENT_DECLINED = "CONSENT_DECLINED"


class ProctorSeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class SessionStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"
    SUSPENDED = "SUSPENDED"


# ── Models ────────────────────────────────────────────────────────────────────

class ProctorSession(Base):
    """
    Logical monitoring session tied to one exam Attempt.
    Persists across browser reconnects. One attempt may have multiple sessions
    only if new_session_on_reconnect=True in institute config.
    """
    __tablename__ = "ProctorSession"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # UUID
    attempt_id: Mapped[int] = mapped_column("attemptId", Integer, ForeignKey("Attempt.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column("userId", Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    consent_given: Mapped[bool] = mapped_column("consentGiven", Boolean, default=False)
    reconnect_count: Mapped[int] = mapped_column("reconnectCount", Integer, default=0)
    calibration_data: Mapped[dict | None] = mapped_column("calibrationData", JSONB, nullable=True)
    institute_config: Mapped[dict | None] = mapped_column("instituteConfig", JSONB, nullable=True)
    config_version: Mapped[str] = mapped_column("configVersion", String(50), default="v1")
    risk_score: Mapped[float] = mapped_column("riskScore", Float, default=0.0)
    started_at: Mapped[datetime] = mapped_column("startedAt", DateTime(timezone=True), server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column("endedAt", DateTime(timezone=True), nullable=True)

    connections: Mapped[list["ProctorConnection"]] = relationship("ProctorConnection", back_populates="session", cascade="all, delete-orphan")
    ai_events: Mapped[list["ProctorAIEvent"]] = relationship("ProctorAIEvent", back_populates="session", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_proctor_session_attempt", "attemptId"),
        Index("ix_proctor_session_user", "userId"),
    )


class ProctorConnection(Base):
    """
    One row per WebSocket connection within a ProctorSession.
    Allows tracking reconnects while keeping the same logical session.
    """
    __tablename__ = "ProctorConnection"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # UUID
    session_id: Mapped[str] = mapped_column("sessionId", String, ForeignKey("ProctorSession.id", ondelete="CASCADE"), nullable=False)
    trace_id: Mapped[str] = mapped_column("traceId", String(64), nullable=False)
    connection_number: Mapped[int] = mapped_column("connectionNumber", Integer, default=1)
    connected_at: Mapped[datetime] = mapped_column("connectedAt", DateTime(timezone=True), server_default=func.now())
    disconnected_at: Mapped[datetime | None] = mapped_column("disconnectedAt", DateTime(timezone=True), nullable=True)
    disconnect_reason: Mapped[str | None] = mapped_column("disconnectReason", String(200), nullable=True)

    session: Mapped["ProctorSession"] = relationship("ProctorSession", back_populates="connections")
    ai_events: Mapped[list["ProctorAIEvent"]] = relationship("ProctorAIEvent", back_populates="connection")

    __table_args__ = (Index("ix_proctor_conn_session", "sessionId"),)


class ProctorAIEvent(Base):
    """
    One row per sustained detection event (NOT one row per frame).
    Stores aggregated flag data including start/end time and frame count.
    """
    __tablename__ = "ProctorAIEvent"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column("sessionId", String, ForeignKey("ProctorSession.id", ondelete="CASCADE"), nullable=False)
    connection_id: Mapped[str | None] = mapped_column("connectionId", String, ForeignKey("ProctorConnection.id"), nullable=True)
    user_id: Mapped[int] = mapped_column("userId", Integer, nullable=False)
    flag: Mapped[str] = mapped_column(String(40), nullable=False)  # ProctorFlag value
    severity: Mapped[str] = mapped_column(String(10), default="LOW")
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    detector_version: Mapped[str] = mapped_column("detectorVersion", String(50), default="v1.0.0")
    thumbnail_path: Mapped[str | None] = mapped_column("thumbnailPath", Text, nullable=True)
    event_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB, nullable=True)
    trace_id: Mapped[str] = mapped_column("traceId", String(64), default="")
    frame_count: Mapped[int] = mapped_column("frameCount", Integer, default=1)
    started_at: Mapped[datetime] = mapped_column("startedAt", DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column("endedAt", DateTime(timezone=True), nullable=True)
    duration_s: Mapped[float | None] = mapped_column("durationS", Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column("createdAt", DateTime(timezone=True), server_default=func.now())

    session: Mapped["ProctorSession"] = relationship("ProctorSession", back_populates="ai_events")
    connection: Mapped["ProctorConnection | None"] = relationship("ProctorConnection", back_populates="ai_events")

    __table_args__ = (
        Index("ix_proctor_event_session_time", "sessionId", "startedAt"),
        Index("ix_proctor_event_user", "userId"),
        Index("ix_proctor_event_flag", "flag"),
    )
