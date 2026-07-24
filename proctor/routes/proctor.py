"""
routes/proctor.py — Primary WebSocket frame channel + REST fallback + session/event endpoints.
All routes are versioned under /api/v1/proctor (mounted in main.py).
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from sqlalchemy import select

from config import get_settings
from database import get_db
from metrics import proctor_metrics
from models import ProctorAIEvent, ProctorSession
from schemas import (
    BrowserEventRequest,
    FlagResult,
    SessionEndRequest,
    SessionStartRequest,
    SessionStartResponse,
)
from services import calibration_service
from services.detection_service import SessionDetectionState
from services.risk_scorer import compute_risk_score
from services.session_service import (
    close_connection,
    create_connection,
    end_session,
    get_or_create_session,
)

logger = logging.getLogger(__name__)
router = APIRouter()
settings = get_settings()

# ── Session Start ─────────────────────────────────────────────────────────────

@router.post("/session/start", response_model=SessionStartResponse)
async def start_session(req: SessionStartRequest) -> SessionStartResponse:
    """
    Creates or resumes a ProctorSession for the given attempt.
    Returns UUID session_id and calibration duration.
    """
    async with get_db() as db:
        session, is_new = await get_or_create_session(db, req)

    return SessionStartResponse(
        session_id=session.id,
        is_new=is_new,
        calibration_duration_s=settings.calibration_duration_s,
        message="Session started" if is_new else "Session resumed",
    )


# ── Session End ───────────────────────────────────────────────────────────────

@router.post("/session/end")
async def end_session_route(req: SessionEndRequest) -> dict:
    """Mark session as ENDED and compute final risk score."""
    async with get_db() as db:
        # Get event counts for risk scoring
        result = await db.execute(
            select(ProctorAIEvent.flag)
            .where(ProctorAIEvent.session_id == req.session_id)
        )
        flags = result.scalars().all()
        event_counts: dict[str, int] = {}
        for f in flags:
            event_counts[f] = event_counts.get(f, 0) + 1

        risk_score = compute_risk_score(event_counts)
        await end_session(db, req.session_id, risk_score)
        calibration_service.reset_session_calibration(req.session_id)

    return {"success": True, "session_id": req.session_id, "risk_score": risk_score}


# ── Browser Event Relay ───────────────────────────────────────────────────────

@router.post("/event/browser")
async def browser_event(req: BrowserEventRequest) -> dict:
    """
    Receives browser lifecycle events (TAB_HIDDEN, WINDOW_BLUR, etc.).
    Writes directly to ProctorAIEvent as advisory signals.
    """
    SEVERITY_MAP = {
        "TAB_HIDDEN": "MEDIUM", "TAB_RESTORED": "LOW",
        "WINDOW_BLUR": "LOW", "WINDOW_FOCUS": "LOW",
        "NETWORK_LOST": "MEDIUM", "CAMERA_DISCONNECTED": "HIGH",
        "CAMERA_PERMISSION_DENIED": "HIGH", "CONSENT_DECLINED": "MEDIUM",
    }

    async with get_db() as db:
        # Verify session exists
        result = await db.execute(
            select(ProctorSession).where(ProctorSession.id == req.session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        event = ProctorAIEvent(
            session_id=req.session_id,
            user_id=session.user_id,
            flag=req.flag,
            severity=SEVERITY_MAP.get(req.flag, "LOW"),
            confidence=1.0,
            detector_version="browser@v1.0.0",
            event_metadata=req.metadata,
            trace_id=req.trace_id or "",
            frame_count=0,
            started_at=req.timestamp or datetime.now(timezone.utc),
            ended_at=req.timestamp or datetime.now(timezone.utc),
            duration_s=0.0,
        )
        db.add(event)
        await db.commit()

    return {"success": True, "flag": req.flag}


# ── Instructor Report ─────────────────────────────────────────────────────────

@router.get("/report/{session_id}")
async def get_report(session_id: str) -> dict:
    """
    Full proctor report for an instructor.
    Returns compressed timeline with event summaries.
    """
    async with get_db() as db:
        # Get session
        result = await db.execute(
            select(ProctorSession).where(ProctorSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Get all events
        result = await db.execute(
            select(ProctorAIEvent)
            .where(ProctorAIEvent.session_id == session_id)
            .order_by(ProctorAIEvent.started_at.asc())
        )
        events = result.scalars().all()

    # Build summary (compressed timeline)
    summary: dict[str, Any] = {}
    raw_timeline = []

    for ev in events:
        flag = ev.flag
        if flag not in summary:
            summary[flag] = {
                "flag": flag,
                "severity": ev.severity,
                "occurrences": 0,
                "total_duration_s": 0.0,
                "longest_duration_s": 0.0,
                "first_seen": ev.started_at.isoformat() if ev.started_at else None,
            }

        s = summary[flag]
        s["occurrences"] += 1
        dur = ev.duration_s or 0.0
        s["total_duration_s"] = round(s["total_duration_s"] + dur, 2)
        if dur > s["longest_duration_s"]:
            s["longest_duration_s"] = round(dur, 2)

        raw_timeline.append({
            "id": ev.id,
            "flag": ev.flag,
            "severity": ev.severity,
            "confidence": ev.confidence,
            "detector_version": ev.detector_version,
            "started_at": ev.started_at.isoformat() if ev.started_at else None,
            "ended_at": ev.ended_at.isoformat() if ev.ended_at else None,
            "duration_s": ev.duration_s,
            "frame_count": ev.frame_count,
            "metadata": ev.event_metadata,
            "thumbnail_path": ev.thumbnail_path,
            "trace_id": ev.trace_id,
        })

    event_counts = {k: v["occurrences"] for k, v in summary.items()}
    risk_score = compute_risk_score(event_counts)

    return {
        "session_id": session_id,
        "attempt_id": session.attempt_id,
        "user_id": session.user_id,
        "status": session.status,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "risk_score": risk_score,
        "consent_given": session.consent_given,
        "reconnect_count": session.reconnect_count,
        "config_version": session.config_version,
        "summary": list(summary.values()),
        "timeline": raw_timeline,
        "raw_event_count": len(events),
    }


# ── REST Frame Fallback ───────────────────────────────────────────────────────

@router.post("/frame")
async def analyze_frame_rest(request: Request) -> dict:
    """
    REST fallback for WebSocket-blocked environments.
    Accepts multipart/form-data with 'session_id', 'frame' (JPEG), 'trace_id'.
    """
    detection_service = request.app.state.detection_service
    form = await request.form()

    session_id = form.get("session_id", "")
    trace_id = form.get("trace_id", str(uuid.uuid4()))
    frame_file = form.get("frame")

    if not session_id or not frame_file:
        raise HTTPException(status_code=400, detail="session_id and frame are required")

    async with get_db() as db:
        result = await db.execute(
            select(ProctorSession).where(ProctorSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

    frame_bytes = await frame_file.read()
    from schemas import InstituteConfig
    config = InstituteConfig(**(session.institute_config or {})) if session.institute_config else InstituteConfig()

    session_state = SessionDetectionState(
        session_id=session_id,
        connection_id="rest-fallback",
        user_id=session.user_id,
        institute_config=config,
    )

    result = await detection_service.submit_frame(frame_bytes, session_state, trace_id)
    if result is None:
        return {"session_id": session_id, "flags": [], "message": "Frame dropped (queue full)"}

    return result


# ── WebSocket Primary Channel ─────────────────────────────────────────────────

@router.websocket("/ws/{session_id}")
async def proctor_websocket(websocket: WebSocket, session_id: str) -> None:
    """
    Primary WebSocket frame channel.
    Client sends: binary JPEG frame with 4-byte header = trace_id length (UTF-8) + trace_id + frame
    Server sends: JSON with flags, metadata, sampling_interval_ms
    """
    await websocket.accept()
    proctor_metrics.active_connections += 1

    trace_id = str(uuid.uuid4())
    connection = None

    try:
        # Load session
        async with get_db() as db:
            result = await db.execute(
                select(ProctorSession).where(ProctorSession.id == session_id)
            )
            session = result.scalar_one_or_none()
            if not session:
                await websocket.send_json({"error": "Session not found"})
                await websocket.close(code=4004)
                return

            connection = await create_connection(db, session_id, trace_id)

        from schemas import InstituteConfig
        config = InstituteConfig(**(session.institute_config or {})) if session.institute_config else InstituteConfig()

        session_state = SessionDetectionState(
            session_id=session_id,
            connection_id=connection.id,
            user_id=session.user_id,
            institute_config=config,
        )

        detection_service = websocket.app.state.detection_service
        await websocket.send_json({
            "type": "connected",
            "session_id": session_id,
            "connection_id": connection.id,
            "trace_id": trace_id,
            "calibration_duration_s": settings.calibration_duration_s,
        })

        frame_number = 0
        while True:
            # Receive binary frame: [4 bytes trace_id_len][trace_id UTF-8][JPEG bytes]
            data = await websocket.receive_bytes()

            if len(data) < 4:
                continue

            trace_len = int.from_bytes(data[:4], "big")
            if trace_len > 0 and len(data) >= 4 + trace_len:
                frame_trace_id = data[4:4 + trace_len].decode("utf-8", errors="replace")
                frame_bytes = data[4 + trace_len:]
            else:
                frame_trace_id = trace_id
                frame_bytes = data

            frame_number += 1
            result = await detection_service.submit_frame(
                frame_bytes, session_state, frame_trace_id
            )

            if result:
                await websocket.send_json(result)
            else:
                # Frame was dropped — inform client to keep same interval
                await websocket.send_json({
                    "session_id": session_id,
                    "trace_id": frame_trace_id,
                    "frame_number": frame_number,
                    "flags": [],
                    "dropped": True,
                    "sampling_interval_ms": 3000,
                })

    except WebSocketDisconnect:
        logger.info("[ws] disconnected session_id=%s conn_id=%s", session_id, connection.id if connection else "?")
    except Exception as exc:
        logger.error("[ws] error session_id=%s: %s", session_id, exc, exc_info=True)
    finally:
        proctor_metrics.active_connections = max(0, proctor_metrics.active_connections - 1)
        if connection:
            async with get_db() as db:
                await close_connection(db, connection.id, "DISCONNECTED")
