"""
metrics.py — Global in-process metrics tracker for the proctoring service.
Tracks FPS, queue depth, per-detector timing, and detection counts.
"""
from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass, field
from threading import Lock


@dataclass
class ProctorMetrics:
    """
    Mutable singleton updated by the detection pipeline.
    Thread-safe via Lock for counters; asyncio-safe for reads.
    """
    frames_received: int = 0
    frames_processed: int = 0
    frames_dropped: int = 0
    active_connections: int = 0
    queue_size: int = 0
    queue_high_watermark: int = 0

    # Rolling window of processing times (last 100 frames)
    _processing_times: deque = field(default_factory=lambda: deque(maxlen=100))
    _detector_times: dict[str, deque] = field(default_factory=lambda: defaultdict(lambda: deque(maxlen=100)))
    _detection_counts: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    _lock: Lock = field(default_factory=Lock)
    _started_at: float = field(default_factory=time.monotonic)

    def record_frame_received(self) -> None:
        with self._lock:
            self.frames_received += 1

    def record_frame_processed(self, processing_ms: float) -> None:
        with self._lock:
            self.frames_processed += 1
            self._processing_times.append(processing_ms)

    def record_frame_dropped(self) -> None:
        with self._lock:
            self.frames_dropped += 1

    def record_detector_time(self, detector_name: str, ms: float) -> None:
        with self._lock:
            self._detector_times[detector_name].append(ms)

    def record_flag(self, flag: str) -> None:
        with self._lock:
            self._detection_counts[flag] += 1

    def update_queue_size(self, size: int) -> None:
        with self._lock:
            self.queue_size = size
            if size > self.queue_high_watermark:
                self.queue_high_watermark = size

    @property
    def avg_processing_ms(self) -> float:
        times = list(self._processing_times)
        return round(sum(times) / len(times), 2) if times else 0.0

    @property
    def detector_avg_ms(self) -> dict[str, float]:
        result = {}
        for name, times in self._detector_times.items():
            t = list(times)
            result[name] = round(sum(t) / len(t), 2) if t else 0.0
        return result

    @property
    def detection_counts(self) -> dict[str, int]:
        return dict(self._detection_counts)

    @property
    def uptime_s(self) -> float:
        return round(time.monotonic() - self._started_at, 1)

    def to_dict(self) -> dict:
        return {
            "frames_received": self.frames_received,
            "frames_processed": self.frames_processed,
            "frames_dropped": self.frames_dropped,
            "active_connections": self.active_connections,
            "queue_size": self.queue_size,
            "queue_high_watermark": self.queue_high_watermark,
            "avg_processing_ms": self.avg_processing_ms,
            "detector_avg_ms": self.detector_avg_ms,
            "detection_counts": self.detection_counts,
            "uptime_s": self.uptime_s,
        }


# Singleton instance shared across the app
proctor_metrics = ProctorMetrics()
