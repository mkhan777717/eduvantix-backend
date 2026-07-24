"""
services/detection_service.py — Core frame analysis orchestrator.
- asyncio.Queue with N worker tasks
- 500ms queue timeout (old frames discarded)
- Sustained event aggregation (one DB row per event, not per frame)
- Calibration integration for first 15 seconds
- StorageService for 640x360 thumbnail on flagged frames
"""
from __future__ import annotations

import asyncio
import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import numpy as np

from config import get_settings
from database import get_db
from detectors.base import FlagResult
from detectors.context import CalibrationData, DetectorContext
from detectors.registry import DetectorRegistry
from metrics import ProctorMetrics
from models import ProctorAIEvent
from schemas import InstituteConfig
from services import calibration_service
from services.risk_scorer import compute_risk_score
from services.storage_service import StorageService

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class SustainedEventState:
    """In-memory state tracking an ongoing sustained flag event for a session."""
    flag: str
    started_at: datetime
    frame_count: int = 0
    latest_confidence: float = 0.0
    latest_metadata: dict | None = None
    latest_thumbnail_path: str | None = None


@dataclass
class SessionDetectionState:
    """Per-session mutable state held in memory between frames."""
    session_id: str
    connection_id: str
    user_id: int
    institute_config: InstituteConfig
    calibration: CalibrationData = field(default_factory=CalibrationData)
    session_start: float = field(default_factory=time.monotonic)
    frame_number: int = 0
    sustained: dict[str, SustainedEventState] = field(default_factory=dict)
    event_counts: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    is_calibrated: bool = False


# ── Task envelope ─────────────────────────────────────────────────────────────

@dataclass
class FrameTask:
    frame_bytes: bytes
    session_state: SessionDetectionState
    trace_id: str
    enqueued_at: float = field(default_factory=time.monotonic)
    result_future: asyncio.Future = field(default_factory=asyncio.get_event_loop().create_future if False else lambda: None)

    def __post_init__(self):
        loop = asyncio.get_event_loop()
        self.result_future = loop.create_future()


class DetectionService:
    """
    Manages the asyncio.Queue + worker pool for frame analysis.
    Initialized once at app startup and shared across all WebSocket connections.
    """

    def __init__(
        self,
        registry: DetectorRegistry,
        storage: StorageService,
        metrics: ProctorMetrics,
        face_mesh: Any,
        num_workers: int = 4,
    ) -> None:
        self._registry = registry
        self._storage = storage
        self._metrics = metrics
        self._face_mesh = face_mesh
        self._num_workers = num_workers
        self._queue: asyncio.Queue[FrameTask] = asyncio.Queue(maxsize=settings.queue_capacity)
        self._workers: list[asyncio.Task] = []

    async def start(self) -> None:
        """Start worker tasks. Called from FastAPI lifespan."""
        self._workers = [
            asyncio.create_task(self._worker(i), name=f"proctor-worker-{i}")
            for i in range(self._num_workers)
        ]
        logger.info("[detection_service] started %d workers", self._num_workers)

    async def stop(self) -> None:
        """Cancel all workers on shutdown."""
        for w in self._workers:
            w.cancel()
        await asyncio.gather(*self._workers, return_exceptions=True)
        logger.info("[detection_service] workers stopped")

    async def submit_frame(
        self,
        frame_bytes: bytes,
        session_state: SessionDetectionState,
        trace_id: str,
    ) -> dict | None:
        """
        Submit a frame for analysis. Returns analysis result dict or None if dropped.
        Raises asyncio.TimeoutError if queue is full for > QUEUE_TIMEOUT_MS.
        """
        self._metrics.record_frame_received()
        task = FrameTask(
            frame_bytes=frame_bytes,
            session_state=session_state,
            trace_id=trace_id,
        )
        timeout_s = settings.queue_timeout_ms / 1000.0
        try:
            await asyncio.wait_for(self._queue.put(task), timeout=timeout_s)
        except asyncio.TimeoutError:
            self._metrics.record_frame_dropped()
            logger.warning("[detection_service] frame dropped — queue full trace_id=%s", trace_id)
            return None

        self._metrics.update_queue_size(self._queue.qsize())

        # Wait for result from worker
        try:
            result = await asyncio.wait_for(task.result_future, timeout=10.0)
            return result
        except asyncio.TimeoutError:
            logger.error("[detection_service] worker timeout trace_id=%s", trace_id)
            return None

    async def _worker(self, worker_id: int) -> None:
        """Consumer task: dequeues frames and runs detection pipeline."""
        logger.debug("[worker-%d] started", worker_id)
        while True:
            try:
                task: FrameTask = await self._queue.get()
                try:
                    result = await self._process_frame(task)
                    if not task.result_future.done():
                        task.result_future.set_result(result)
                except Exception as exc:
                    logger.error("[worker-%d] processing error: %s", worker_id, exc, exc_info=True)
                    if not task.result_future.done():
                        task.result_future.set_result({})
                finally:
                    self._queue.task_done()
                    self._metrics.update_queue_size(self._queue.qsize())
            except asyncio.CancelledError:
                break

    async def _process_frame(self, task: FrameTask) -> dict:
        """Decode frame, run detectors, persist sustained events, return response."""
        import cv2
        start = time.perf_counter()

        ss = task.session_state
        ss.frame_number += 1

        # Decode JPEG bytes to numpy array
        nparr = np.frombuffer(task.frame_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if frame is None:
            return {}

        # ── Calibration phase (first 15 seconds) ─────────────────────────────
        elapsed_session = time.monotonic() - ss.session_start
        calibration_window = settings.calibration_duration_s

        if not ss.is_calibrated:
            await calibration_service.add_calibration_frame(ss.session_id, frame)
            if elapsed_session >= calibration_window:
                ss.calibration = await calibration_service.finalize_calibration(ss.session_id)
                ss.is_calibrated = True

        # ── Build context ─────────────────────────────────────────────────────
        ctx = DetectorContext(
            session_id=ss.session_id,
            connection_id=ss.connection_id,
            trace_id=task.trace_id,
            frame_number=ss.frame_number,
            user_id=ss.user_id,
            institute_config=ss.institute_config,
            calibration=ss.calibration,
            face_mesh=self._face_mesh,
            metrics=self._metrics,
            storage=self._storage,
        )

        # ── Run all detectors ─────────────────────────────────────────────────
        flag_results: list[FlagResult] = await self._registry.run_all(frame, ctx)

        # ── Aggregate metadata from all results ───────────────────────────────
        combined_metadata: dict = {}
        for r in flag_results:
            if r.metadata:
                combined_metadata.update(r.metadata)
        combined_metadata["frame_number"] = ss.frame_number

        # ── Sustained event logic + DB persistence ────────────────────────────
        fired_flags = {r.flag for r in flag_results}
        await self._update_sustained_events(ss, flag_results, frame, task.trace_id)

        # ── Metrics ───────────────────────────────────────────────────────────
        elapsed_ms = (time.perf_counter() - start) * 1000
        self._metrics.record_frame_processed(elapsed_ms)

        # ── Build response ────────────────────────────────────────────────────
        # Determine adaptive sampling interval hint
        sampling_ms = 1000 if fired_flags else 3000

        return {
            "session_id": ss.session_id,
            "trace_id": task.trace_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "frame_number": ss.frame_number,
            "flags": [
                {
                    "type": r.flag,
                    "confidence": r.confidence,
                    "severity": r.severity,
                    "detector_version": r.detector_version,
                }
                for r in flag_results
            ],
            "metadata": combined_metadata,
            "detector_timings_ms": self._metrics.detector_avg_ms,
            "total_processing_ms": round(elapsed_ms, 2),
            "sampling_interval_ms": sampling_ms,
        }

    async def _update_sustained_events(
        self,
        ss: SessionDetectionState,
        flag_results: list[FlagResult],
        frame: np.ndarray,
        trace_id: str,
    ) -> None:
        """
        Track sustained events in memory.
        Writes ONE DB row when a sustained flag ends (not on every frame).
        Instantaneous flags (NO_FACE, LOW_LIGHT, CAMERA_BLOCKED) are written immediately.
        """
        INSTANTANEOUS = {"NO_FACE", "MULTIPLE_FACE", "LOW_LIGHT", "CAMERA_BLOCKED",
                         "BLURRY_CAMERA", "MOUTH_MOVEMENT"}
        SUSTAINED_THRESHOLD_S = ss.institute_config.look_away_threshold_s

        fired_flags = {r.flag: r for r in flag_results}
        now = datetime.now(timezone.utc)

        # Flags that started/continued this frame
        for flag, result in fired_flags.items():
            ss.event_counts[flag] = ss.event_counts.get(flag, 0) + 1

            if flag in INSTANTANEOUS:
                # Write DB row immediately
                thumbnail_path = None
                if ss.institute_config.store_flagged_images:
                    import cv2
                    _, buf = cv2.imencode(".jpg", frame)
                    thumbnail_path = await self._storage.save_flagged_frame(
                        ss.session_id, flag, buf.tobytes(), ss.frame_number
                    )
                await self._write_event(ss, result, now, now, 0.0, 1, thumbnail_path, trace_id)
            else:
                # Sustained: start or continue timer
                if flag not in ss.sustained:
                    ss.sustained[flag] = SustainedEventState(
                        flag=flag,
                        started_at=now,
                        frame_count=1,
                        latest_confidence=result.confidence,
                        latest_metadata=result.metadata,
                    )
                else:
                    st = ss.sustained[flag]
                    st.frame_count += 1
                    st.latest_confidence = result.confidence
                    st.latest_metadata = result.metadata

        # Flags that ENDED this frame (were sustained but no longer firing)
        ended_flags = set(ss.sustained.keys()) - set(fired_flags.keys())
        for flag in ended_flags:
            st = ss.sustained.pop(flag)
            duration_s = (now - st.started_at).total_seconds()

            if duration_s >= SUSTAINED_THRESHOLD_S:
                # Capture thumbnail for the ending frame
                thumbnail_path = None
                if ss.institute_config.store_flagged_images:
                    import cv2
                    _, buf = cv2.imencode(".jpg", frame)
                    thumbnail_path = await self._storage.save_flagged_frame(
                        ss.session_id, flag, buf.tobytes(), ss.frame_number
                    )

                # Reconstruct result for the ended flag
                dummy = FlagResult(flag=flag, confidence=st.latest_confidence,
                                   severity="MEDIUM", detector_version="unknown",
                                   metadata=st.latest_metadata)
                await self._write_event(
                    ss, dummy, st.started_at, now, duration_s,
                    st.frame_count, thumbnail_path, trace_id
                )

    async def _write_event(
        self,
        ss: SessionDetectionState,
        result: FlagResult,
        started_at: datetime,
        ended_at: datetime,
        duration_s: float,
        frame_count: int,
        thumbnail_path: str | None,
        trace_id: str,
    ) -> None:
        """Persist a single ProctorAIEvent row."""
        try:
            async with get_db() as db:
                event = ProctorAIEvent(
                    session_id=ss.session_id,
                    connection_id=ss.connection_id,
                    user_id=ss.user_id,
                    flag=result.flag,
                    severity=result.severity,
                    confidence=result.confidence,
                    detector_version=result.detector_version,
                    thumbnail_path=thumbnail_path,
                    event_metadata=result.metadata,
                    trace_id=trace_id,
                    frame_count=frame_count,
                    started_at=started_at,
                    ended_at=ended_at,
                    duration_s=round(duration_s, 2) if duration_s else None,
                )
                db.add(event)
                await db.commit()
                logger.debug(
                    "[detection_service] event written flag=%s session=%s duration=%.1fs",
                    result.flag, ss.session_id, duration_s,
                )
        except Exception as exc:
            logger.error("[detection_service] DB write failed: %s", exc, exc_info=True)
