"""
detectors/base.py — Abstract base class for all proctoring detectors.
Enforces: VERSION, NAME, PRIORITY, is_enabled(), _detect(), analyze() timing wrapper.
"""
from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass

import numpy as np

from detectors.context import DetectorContext

logger = logging.getLogger(__name__)


@dataclass
class FlagResult:
    """Result returned by a detector for a single frame."""
    flag: str                    # ProctorFlag value
    confidence: float            # 0.0 – 1.0
    severity: str                # LOW | MEDIUM | HIGH
    detector_version: str        # e.g. "head_pose@v1.2.0"
    metadata: dict | None = None  # yaw, pitch, brightness, etc.


class BaseDetector(ABC):
    """
    Abstract base for all detectors. Subclasses must define:
      - NAME: str
      - VERSION: str
      - PRIORITY: int (lower = runs first)
      - _detect(frame, ctx) -> list[FlagResult]
    """
    NAME: str = "base"
    VERSION: str = "v1.0.0"
    PRIORITY: int = 99

    @property
    def versioned_name(self) -> str:
        return f"{self.NAME}@{self.VERSION}"

    def is_enabled(self, config: object) -> bool:
        """
        Check institute config to determine if this detector should run.
        Subclasses override to check their specific feature flag.
        """
        return True

    @abstractmethod
    async def _detect(
        self, frame: np.ndarray, ctx: DetectorContext
    ) -> list[FlagResult]:
        """Core detection logic. Implemented by each detector subclass."""
        ...

    async def analyze(
        self, frame: np.ndarray, ctx: DetectorContext
    ) -> list[FlagResult]:
        """
        Public entry point. Wraps _detect() with:
        - per-detector timing (recorded to metrics)
        - exception isolation (logs error, returns empty list)
        """
        start = time.perf_counter()
        try:
            results = await self._detect(frame, ctx)
            return results
        except Exception as exc:
            logger.error(
                "[detector_error] name=%s trace_id=%s error=%s",
                self.NAME, ctx.trace_id, exc,
                exc_info=True,
            )
            return []
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000
            ctx.metrics.record_detector_time(self.NAME, elapsed_ms)
