"""
Maps raw voice analysis metrics to a concise human-readable vocal state
description that Jarvis can use as context.
"""

from __future__ import annotations
from typing import Any


def _safe(d: dict, *keys: str, default: Any = None) -> Any:
    v = d
    for k in keys:
        if not isinstance(v, dict):
            return default
        v = v.get(k, default)
    return v


def interpret_vocal_state(metrics: dict[str, Any]) -> str:
    """Return a natural-language description of the speaker's vocal state."""
    if "error" in metrics:
        return "Unable to analyse voice"

    observations: list[str] = []

    # --- Pitch analysis ---
    pitch_mean = _safe(metrics, "pitch", "mean")
    pitch_range = _safe(metrics, "prosody", "pitchRange")
    pitch_slope = _safe(metrics, "prosody", "pitchSlope")

    if pitch_mean is not None:
        if pitch_mean > 250:
            observations.append("elevated pitch")
        elif pitch_mean < 120:
            observations.append("low pitch")

    if pitch_range is not None:
        if pitch_range < 30:
            observations.append("monotone intonation")
        elif pitch_range > 150:
            observations.append("highly expressive intonation")

    if pitch_slope is not None:
        if pitch_slope > 0.3:
            observations.append("rising intonation")
        elif pitch_slope < -0.3:
            observations.append("falling intonation")

    # --- Voice quality ---
    jitter_local = _safe(metrics, "jitter", "local")
    shimmer_local = _safe(metrics, "shimmer", "local")
    hnr = _safe(metrics, "hnr")

    if jitter_local is not None and jitter_local > 0.02:
        observations.append("voice instability (high jitter)")

    if shimmer_local is not None and shimmer_local > 0.08:
        observations.append("breathy or rough voice quality")

    if hnr is not None:
        if hnr < 10:
            observations.append("noisy/hoarse voice")
        elif hnr > 25:
            observations.append("clear, strong voice")

    # --- Speaking rate ---
    syl_rate = _safe(metrics, "speakingRate", "estimatedSyllablesPerSec")
    voiced_ratio = _safe(metrics, "speakingRate", "voicedRatio")

    if syl_rate is not None:
        if syl_rate > 6:
            observations.append("speaking very fast")
        elif syl_rate > 4.5:
            observations.append("speaking quickly")
        elif syl_rate < 2:
            observations.append("speaking very slowly")
        elif syl_rate < 3:
            observations.append("speaking slowly")

    # --- Energy / amplitude ---
    speech_ratio = _safe(metrics, "vad", "speechRatio")

    if voiced_ratio is not None and voiced_ratio < 0.3:
        observations.append("mostly silent")
    if speech_ratio is not None and speech_ratio < 0.2:
        observations.append("very little speech detected")

    # --- Rhythm ---
    pvi = _safe(metrics, "prosody", "rhythmPVI")
    if pvi is not None:
        if pvi > 0.5:
            observations.append("irregular speech rhythm")
        elif pvi < 0.15:
            observations.append("very steady, regular rhythm")

    # --- Composite emotional inference ---
    emotion = _infer_emotion(metrics, observations)

    if not observations and not emotion:
        return "User's voice sounds neutral and steady"

    parts: list[str] = []
    if emotion:
        parts.append(emotion)
    if observations:
        parts.append(", ".join(observations))
    return " — ".join(parts)


def _infer_emotion(metrics: dict[str, Any], observations: list[str]) -> str:
    """Infer a high-level emotional label from combined metrics."""
    pitch_mean = _safe(metrics, "pitch", "mean")
    jitter_local = _safe(metrics, "jitter", "local")
    syl_rate = _safe(metrics, "speakingRate", "estimatedSyllablesPerSec")
    pitch_slope = _safe(metrics, "prosody", "pitchSlope")
    pitch_range = _safe(metrics, "prosody", "pitchRange")
    hnr = _safe(metrics, "hnr")

    # Whispering: low energy, low HNR, quiet
    if hnr is not None and hnr < 8 and pitch_range is not None and pitch_range < 40:
        return "User appears to be whispering or speaking very softly"

    # Stressed / anxious: high pitch, high jitter, fast rate
    stress_score = 0
    if pitch_mean is not None and pitch_mean > 200:
        stress_score += 1
    if jitter_local is not None and jitter_local > 0.015:
        stress_score += 1
    if syl_rate is not None and syl_rate > 5:
        stress_score += 1
    if stress_score >= 2:
        return "User sounds stressed or anxious"

    # Excited / urgent: fast rate, rising pitch
    if syl_rate is not None and syl_rate > 4.5 and pitch_slope is not None and pitch_slope > 0.2:
        return "User sounds excited or urgent"

    # Calm / relaxed: low pitch, slow rate
    calm_score = 0
    if pitch_mean is not None and pitch_mean < 150:
        calm_score += 1
    if syl_rate is not None and syl_rate < 3.5:
        calm_score += 1
    if pitch_range is not None and pitch_range < 60:
        calm_score += 1
    if calm_score >= 2:
        return "User sounds calm and relaxed"

    # Assertive / confident: loud, clear voice, moderate-fast rate
    if hnr is not None and hnr > 20 and syl_rate is not None and syl_rate > 3.5:
        return "User sounds confident and assertive"

    return ""
