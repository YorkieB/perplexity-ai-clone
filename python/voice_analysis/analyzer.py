"""
Core DSP voice analysis using Parselmouth, librosa, and webrtcvad.

Accepts raw PCM16 audio (24 kHz, mono) and returns a dict of metrics.
"""

from __future__ import annotations

import struct
from typing import Any

import numpy as np
import parselmouth
from parselmouth.praat import call
import librosa
import webrtcvad

SAMPLE_RATE = 24000
FRAME_DURATION_MS = 30  # webrtcvad frame size


def pcm16_to_float32(pcm_bytes: bytes) -> np.ndarray:
    """Convert raw PCM16-LE bytes to float32 numpy array in [-1, 1]."""
    n_samples = len(pcm_bytes) // 2
    samples = struct.unpack(f"<{n_samples}h", pcm_bytes)
    return np.array(samples, dtype=np.float32) / 32768.0


def analyze_pitch(sound: parselmouth.Sound) -> dict[str, float | None]:
    pitch_obj = call(sound, "To Pitch", 0.0, 75, 600)
    frames = pitch_obj.selected_array["frequency"]
    voiced = frames[frames > 0]
    if len(voiced) == 0:
        return {"mean": None, "min": None, "max": None, "stddev": None}
    return {
        "mean": round(float(np.mean(voiced)), 1),
        "min": round(float(np.min(voiced)), 1),
        "max": round(float(np.max(voiced)), 1),
        "stddev": round(float(np.std(voiced)), 1),
    }


def analyze_jitter(sound: parselmouth.Sound) -> dict[str, float | None]:
    point_process = call(sound, "To PointProcess (periodic, cc)", 75, 600)
    try:
        local = call(point_process, "Get jitter (local)", 0, 0, 0.0001, 0.02, 1.3)
        rap = call(point_process, "Get jitter (rap)", 0, 0, 0.0001, 0.02, 1.3)
        ppq5 = call(point_process, "Get jitter (ppq5)", 0, 0, 0.0001, 0.02, 1.3)
    except Exception:
        return {"local": None, "rap": None, "ppq5": None}
    return {
        "local": round(local, 5) if not np.isnan(local) else None,
        "rap": round(rap, 5) if not np.isnan(rap) else None,
        "ppq5": round(ppq5, 5) if not np.isnan(ppq5) else None,
    }


def analyze_shimmer(sound: parselmouth.Sound) -> dict[str, float | None]:
    point_process = call(sound, "To PointProcess (periodic, cc)", 75, 600)
    try:
        local = call(
            [sound, point_process],
            "Get shimmer (local)",
            0, 0, 0.0001, 0.02, 1.3, 1.6,
        )
        apq = call(
            [sound, point_process],
            "Get shimmer (apq5)",
            0, 0, 0.0001, 0.02, 1.3, 1.6,
        )
    except Exception:
        return {"local": None, "apq": None}
    return {
        "local": round(local, 4) if not np.isnan(local) else None,
        "apq": round(apq, 4) if not np.isnan(apq) else None,
    }


def analyze_hnr(sound: parselmouth.Sound) -> float | None:
    try:
        harmonicity = call(sound, "To Harmonicity (cc)", 0.01, 75, 0.1, 1.0)
        hnr = call(harmonicity, "Get mean", 0, 0)
        return round(hnr, 1) if not np.isnan(hnr) else None
    except Exception:
        return None


def analyze_speaking_rate(
    samples: np.ndarray, vad_segments: list[tuple[float, float]]
) -> dict[str, float | None]:
    duration = len(samples) / SAMPLE_RATE
    if duration == 0:
        return {"voicedRatio": None, "estimatedSyllablesPerSec": None}

    voiced_duration = sum(end - start for start, end in vad_segments)
    voiced_ratio = voiced_duration / duration

    # Rough syllable estimation via amplitude envelope peaks in voiced regions
    syllable_count = 0
    for start, end in vad_segments:
        s_idx = int(start * SAMPLE_RATE)
        e_idx = int(end * SAMPLE_RATE)
        segment = samples[s_idx:e_idx]
        if len(segment) < SAMPLE_RATE // 10:
            continue
        envelope = np.abs(segment)
        # Smooth with ~50ms window
        win = max(int(SAMPLE_RATE * 0.05), 1)
        smoothed = np.convolve(envelope, np.ones(win) / win, mode="same")
        threshold = np.mean(smoothed) * 0.5
        above = smoothed > threshold
        crossings = np.diff(above.astype(int))
        syllable_count += int(np.sum(crossings == 1))

    syl_per_sec = syllable_count / duration if duration > 0 else None

    return {
        "voicedRatio": round(voiced_ratio, 2),
        "estimatedSyllablesPerSec": round(syl_per_sec, 1) if syl_per_sec else None,
    }


def analyze_mfcc(samples: np.ndarray) -> list[float]:
    mfccs = librosa.feature.mfcc(y=samples, sr=SAMPLE_RATE, n_mfcc=13)
    return [round(float(c), 2) for c in np.mean(mfccs, axis=1)]


def analyze_spectral(samples: np.ndarray) -> dict[str, float | None]:
    centroid = librosa.feature.spectral_centroid(y=samples, sr=SAMPLE_RATE)
    bandwidth = librosa.feature.spectral_bandwidth(y=samples, sr=SAMPLE_RATE)
    return {
        "centroid": round(float(np.mean(centroid)), 1),
        "bandwidth": round(float(np.mean(bandwidth)), 1),
    }


def analyze_vad(pcm_bytes: bytes) -> dict[str, Any]:
    vad = webrtcvad.Vad(2)
    frame_size = int(SAMPLE_RATE * FRAME_DURATION_MS / 1000) * 2  # bytes per frame
    n_frames = len(pcm_bytes) // frame_size
    if n_frames == 0:
        return {"speechRatio": 0.0, "segments": 0, "segmentTimes": []}

    is_speech: list[bool] = []
    for i in range(n_frames):
        frame = pcm_bytes[i * frame_size : (i + 1) * frame_size]
        try:
            is_speech.append(vad.is_speech(frame, SAMPLE_RATE))
        except Exception:
            is_speech.append(False)

    speech_ratio = sum(is_speech) / len(is_speech) if is_speech else 0.0

    # Build contiguous speech segments
    segments: list[tuple[float, float]] = []
    in_seg = False
    seg_start = 0.0
    for idx, speech in enumerate(is_speech):
        t = idx * FRAME_DURATION_MS / 1000.0
        if speech and not in_seg:
            seg_start = t
            in_seg = True
        elif not speech and in_seg:
            segments.append((seg_start, t))
            in_seg = False
    if in_seg:
        segments.append((seg_start, n_frames * FRAME_DURATION_MS / 1000.0))

    return {
        "speechRatio": round(speech_ratio, 2),
        "segments": len(segments),
        "segmentTimes": segments,
    }


def analyze_prosody(sound: parselmouth.Sound) -> dict[str, float | None]:
    pitch_obj = call(sound, "To Pitch", 0.0, 75, 600)
    frames = pitch_obj.selected_array["frequency"]
    voiced = frames[frames > 0]

    if len(voiced) < 3:
        return {"pitchSlope": None, "pitchRange": None, "rhythmPVI": None}

    # Pitch slope: linear regression coefficient (rising vs falling intonation)
    x = np.arange(len(voiced))
    coeffs = np.polyfit(x, voiced, 1)
    pitch_slope = round(float(coeffs[0]), 3)

    pitch_range = round(float(np.max(voiced) - np.min(voiced)), 1)

    # Pairwise Variability Index for rhythm regularity
    if len(voiced) >= 2:
        diffs = np.abs(np.diff(voiced))
        sums = (np.abs(voiced[:-1]) + np.abs(voiced[1:])) / 2
        sums[sums == 0] = 1
        pvi = float(np.mean(diffs / sums))
        rhythm_pvi = round(pvi, 3)
    else:
        rhythm_pvi = None

    return {
        "pitchSlope": pitch_slope,
        "pitchRange": pitch_range,
        "rhythmPVI": rhythm_pvi,
    }


def analyze_audio(pcm_bytes: bytes) -> dict[str, Any]:
    """Full analysis pipeline. Accepts raw PCM16-LE bytes at 24 kHz mono."""
    samples = pcm16_to_float32(pcm_bytes)

    if len(samples) < SAMPLE_RATE // 4:
        return {"error": "Audio too short for analysis (need at least 0.25s)"}

    sound = parselmouth.Sound(samples, sampling_frequency=SAMPLE_RATE)

    vad_result = analyze_vad(pcm_bytes)
    segment_times: list[tuple[float, float]] = vad_result.get("segmentTimes", [])

    return {
        "pitch": analyze_pitch(sound),
        "jitter": analyze_jitter(sound),
        "shimmer": analyze_shimmer(sound),
        "hnr": analyze_hnr(sound),
        "speakingRate": analyze_speaking_rate(samples, segment_times),
        "mfcc": analyze_mfcc(samples),
        "spectral": analyze_spectral(samples),
        "vad": {
            "speechRatio": vad_result["speechRatio"],
            "segments": vad_result["segments"],
        },
        "prosody": analyze_prosody(sound),
    }
