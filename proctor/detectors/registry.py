"""
detectors/registry.py — DetectorRegistry plugin architecture.
Detectors run in PRIORITY order. Short-circuit rules skip later detectors
when early detectors fire specific flags (e.g. NO_FACE skips head_pose, mouth).
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import numpy as np

from detectors.base import BaseDetector, FlagResult
from detectors.context import DetectorContext

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


# ── Short-circuit rules ───────────────────────────────────────────────────────
# If a flag in the key set is fired, skip the detector names in the value set.
SHORT_CIRCUIT_RULES: dict[str, set[str]] = {
    "NO_FACE": {"head_pose", "mouth"},
}


class DetectorRegistry:
    """
    Plugin registry for all detection algorithms.
    Register detectors once at startup; run_all() dispatches each frame.
    Adding a new detector = registry.register(MyDetector()). Zero orchestration changes.
    """

    def __init__(self) -> None:
        self._detectors: list[BaseDetector] = []

    def register(self, detector: BaseDetector) -> "DetectorRegistry":
        """Add a detector to the registry. Returns self for chaining."""
        self._detectors.append(detector)
        # Keep sorted by PRIORITY ascending (lower = runs first)
        self._detectors.sort(key=lambda d: d.PRIORITY)
        logger.info("[registry] registered detector=%s priority=%d", detector.NAME, detector.PRIORITY)
        return self

    async def run_all(
        self,
        frame: np.ndarray,
        ctx: DetectorContext,
    ) -> list[FlagResult]:
        """
        Run all enabled detectors in priority order.
        Applies short-circuit rules: if NO_FACE fires, skip head_pose + mouth.
        Each detector is individually exception-isolated via BaseDetector.analyze().
        """
        all_results: list[FlagResult] = []
        fired_flags: set[str] = set()
        skipped_detectors: set[str] = set()

        for detector in self._detectors:
            # Check if this detector should be skipped due to a short-circuit rule
            if detector.NAME in skipped_detectors:
                logger.debug(
                    "[registry] short-circuit skip detector=%s trace_id=%s",
                    detector.NAME, ctx.trace_id,
                )
                continue

            # Check if detector is enabled by institute config
            if not detector.is_enabled(ctx.institute_config):
                continue

            results = await detector.analyze(frame, ctx)
            all_results.extend(results)

            for result in results:
                fired_flags.add(result.flag)
                ctx.metrics.record_flag(result.flag)

                # Apply short-circuit rules based on newly fired flag
                if result.flag in SHORT_CIRCUIT_RULES:
                    skipped_detectors.update(SHORT_CIRCUIT_RULES[result.flag])

        return all_results

    @property
    def detector_names(self) -> list[str]:
        return [d.NAME for d in self._detectors]

    def __len__(self) -> int:
        return len(self._detectors)


# ── Global registry instance (populated in main.py startup) ───────────────────
detector_registry = DetectorRegistry()
