"""
services/session_service.py — ProctorSession and ProctorConnection lifecycle management.
Handles session creation, reconnect policy, and connection tracking.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models import ProctorSession, ProctorConnection
from schemas import InstituteConfig, SessionStartRequest

logger = logging.getLogger(__name__)


async def get_or_create_session(
    db: AsyncSession,
    req: SessionStartRequest,
) -> tuple[ProctorSession, bool]:
    """
    Returns (session, is_new).
    Reuses existing ACTIVE session for the attempt unless
    institute_config.new_session_on_reconnect is True.
    """
    config = req.institute_config or InstituteConfig()
    new_session_on_reconnect = config.new_session_on_reconnect

    if not new_session_on_reconnect:
        # Look for an existing ACTIVE session for this attempt
        result = await db.execute(
            select(ProctorSession)
            .where(
                ProctorSession.attempt_id == req.attempt_id,
                ProctorSession.status == "ACTIVE",
            )
            .order_by(ProctorSession.started_at.desc())
            .limit(1)
        )
        existing = result.scalar_one_or_none()
        if existing:
            # Increment reconnect count
            await db.execute(
                update(ProctorSession)
                .where(ProctorSession.id == existing.id)
                .values(reconnect_count=ProctorSession.reconnect_count + 1)
            )
            await db.commit()
            await db.refresh(existing)
            logger.info(
                "[session_service] reusing session_id=%s attempt_id=%d reconnect=%d",
                existing.id, req.attempt_id, existing.reconnect_count,
            )
            return existing, False

    # Create a new session
    session_id = str(uuid.uuid4())
    config_version = f"inst-{req.user_id}@v1"

    session = ProctorSession(
        id=session_id,
        attempt_id=req.attempt_id,
        user_id=req.user_id,
        status="ACTIVE",
        consent_given=req.consent_given,
        reconnect_count=0,
        institute_config=config.model_dump(),
        config_version=config_version,
        risk_score=0.0,
        started_at=datetime.now(timezone.utc),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    logger.info(
        "[session_service] created session_id=%s attempt_id=%d",
        session_id, req.attempt_id,
    )
    return session, True


async def create_connection(
    db: AsyncSession,
    session_id: str,
    trace_id: str,
) -> ProctorConnection:
    """Create a new ProctorConnection row for a WebSocket connection."""
    # Count existing connections for this session
    result = await db.execute(
        select(ProctorConnection)
        .where(ProctorConnection.session_id == session_id)
    )
    existing_count = len(result.scalars().all())

    conn = ProctorConnection(
        id=str(uuid.uuid4()),
        session_id=session_id,
        trace_id=trace_id,
        connection_number=existing_count + 1,
        connected_at=datetime.now(timezone.utc),
    )
    db.add(conn)
    await db.commit()
    await db.refresh(conn)

    logger.info(
        "[session_service] connection created conn_id=%s session_id=%s number=%d",
        conn.id, session_id, conn.connection_number,
    )
    return conn


async def close_connection(
    db: AsyncSession,
    connection_id: str,
    reason: str = "DISCONNECTED",
) -> None:
    """Mark a WebSocket connection as closed."""
    await db.execute(
        update(ProctorConnection)
        .where(ProctorConnection.id == connection_id)
        .values(
            disconnected_at=datetime.now(timezone.utc),
            disconnect_reason=reason,
        )
    )
    await db.commit()


async def end_session(
    db: AsyncSession,
    session_id: str,
    risk_score: float = 0.0,
) -> None:
    """Mark a session as ENDED with final risk score."""
    await db.execute(
        update(ProctorSession)
        .where(ProctorSession.id == session_id)
        .values(
            status="ENDED",
            ended_at=datetime.now(timezone.utc),
            risk_score=risk_score,
        )
    )
    await db.commit()
    logger.info("[session_service] session ended session_id=%s risk_score=%.1f", session_id, risk_score)
