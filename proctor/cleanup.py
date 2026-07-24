"""
cleanup.py — APScheduler background job for image retention cleanup.
Deletes flagged frame thumbnails older than IMAGE_RETENTION_DAYS.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import delete, select

from config import get_settings
from database import AsyncSessionFactory
from models import ProctorAIEvent

logger = logging.getLogger(__name__)
settings = get_settings()

scheduler = AsyncIOScheduler()


async def _cleanup_old_images() -> None:
    """
    Delete ProctorAIEvent rows (and their thumbnails) older than IMAGE_RETENTION_DAYS.
    Runs daily at 02:00 UTC.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.image_retention_days)
    logger.info("[cleanup] deleting events older than %s", cutoff.date())

    try:
        async with AsyncSessionFactory() as db:
            # Fetch paths of events to be deleted
            result = await db.execute(
                select(ProctorAIEvent.thumbnail_path)
                .where(
                    ProctorAIEvent.created_at < cutoff,
                    ProctorAIEvent.thumbnail_path.isnot(None),
                )
            )
            paths = [r for r in result.scalars() if r]

            # Delete from filesystem
            deleted_files = 0
            for path in paths:
                try:
                    if os.path.exists(path):
                        os.remove(path)
                        deleted_files += 1
                except Exception as e:
                    logger.warning("[cleanup] failed to delete file %s: %s", path, e)

            # Delete from DB
            result = await db.execute(
                delete(ProctorAIEvent).where(ProctorAIEvent.created_at < cutoff)
            )
            await db.commit()
            deleted_rows = result.rowcount

            logger.info(
                "[cleanup] done: deleted_rows=%d deleted_files=%d",
                deleted_rows, deleted_files,
            )
    except Exception as exc:
        logger.error("[cleanup] job failed: %s", exc, exc_info=True)


def start_scheduler() -> None:
    """Start the APScheduler with the daily cleanup job."""
    scheduler.add_job(
        _cleanup_old_images,
        trigger="cron",
        hour=2,
        minute=0,
        id="proctor_cleanup",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("[cleanup] scheduler started (daily at 02:00 UTC)")


def stop_scheduler() -> None:
    """Shut down the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("[cleanup] scheduler stopped")
