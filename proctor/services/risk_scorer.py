"""
services/risk_scorer.py — Computes an advisory risk score (0-100) per session.
NEVER used for automated decisions. For instructor review only.
"""
from __future__ import annotations

# ── Weights per flag ──────────────────────────────────────────────────────────
FLAG_WEIGHTS: dict[str, float] = {
    "NO_FACE":                15.0,
    "MULTIPLE_FACE":          20.0,
    "LOOK_AWAY_LONG":          8.0,   # per occurrence, capped at 30
    "CAMERA_BLOCKED":         15.0,
    "MOUTH_MOVEMENT":          3.0,
    "TAB_HIDDEN":              5.0,   # per occurrence, capped at 15
    "WINDOW_BLUR":             2.0,
    "LOW_LIGHT":               2.0,
    "BLURRY_CAMERA":           2.0,
    "NETWORK_LOST":            3.0,
    "CAMERA_DISCONNECTED":     5.0,
    "CAMERA_PERMISSION_DENIED": 10.0,
    "CONSENT_DECLINED":        5.0,
}

# ── Per-flag contribution caps ────────────────────────────────────────────────
FLAG_CAPS: dict[str, float] = {
    "LOOK_AWAY_LONG": 30.0,
    "TAB_HIDDEN":     15.0,
    "MOUTH_MOVEMENT": 10.0,
    "WINDOW_BLUR":    10.0,
}


def compute_risk_score(event_counts: dict[str, int]) -> float:
    """
    Compute advisory risk score from flag occurrence counts.
    Score is capped at 100.0.

    Args:
        event_counts: dict mapping flag name -> number of occurrences

    Returns:
        Risk score float in range [0, 100]
    """
    total = 0.0
    for flag, count in event_counts.items():
        weight = FLAG_WEIGHTS.get(flag, 0.0)
        contribution = weight * count
        cap = FLAG_CAPS.get(flag)
        if cap is not None:
            contribution = min(contribution, cap)
        total += contribution

    return round(min(100.0, total), 1)


def risk_band(score: float) -> str:
    """Return a human-readable risk band label."""
    if score < 20:
        return "LOW"
    if score < 50:
        return "MEDIUM"
    return "HIGH"
