"""
Optional OpenAI vision pass: rich scene, clothing, mood — matches Jarvis app `VisionContext` / voice prompts.
"""

from __future__ import annotations

import base64
import json
import os
import re
import sys
import threading
import time
from typing import Any

import cv2
import numpy as np

# Lazy client
_client_lock = threading.Lock()
_client: Any = None

_JSON_FENCE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.I)
_warned_no_openai = False
_logged_openai_vision_err = False


def _get_openai_client():
    global _client
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        return None
    with _client_lock:
        if _client is None:
            try:
                from openai import OpenAI

                _client = OpenAI(api_key=key)
            except Exception:
                return None
        return _client


def _resize_max_side(frame: np.ndarray, max_side: int) -> np.ndarray:
    h, w = frame.shape[:2]
    m = max(h, w)
    if m <= max_side:
        return frame
    scale = max_side / float(m)
    return cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def _parse_json_loose(text: str) -> dict[str, Any]:
    t = (text or "").strip()
    m = _JSON_FENCE.search(t)
    if m:
        t = m.group(1).strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        start = t.find("{")
        end = t.rfind("}")
        if start >= 0 and end > start:
            return json.loads(t[start : end + 1])
        raise


def analyze_webcam_frame_openai(frame_bgr: np.ndarray) -> dict[str, Any] | None:
    """
    Returns keys: scene_description, emotion (dict or None), visible_text (str).
    None if no API key or API error.
    """
    global _warned_no_openai
    client = _get_openai_client()
    if client is None:
        if not _warned_no_openai:
            _warned_no_openai = True
            print(
                "[jarvis_visual_engine] OPENAI_API_KEY missing — rich scene/mood vision disabled.",
                file=sys.stderr,
            )
        return None

    max_side = int(os.environ.get("VISION_FRAME_MAX_SIDE", "1280"))
    jpeg_q = int(os.environ.get("VISION_JPEG_QUALITY", "88"))
    model = (os.environ.get("VISION_OPENAI_MODEL") or "gpt-4o-mini").strip()
    # "low" saves tokens but often yields generic office/desk tropes; default "high" for accuracy.
    img_detail = (os.environ.get("VISION_OPENAI_IMAGE_DETAIL") or "high").strip().lower()
    if img_detail not in ("low", "high", "auto"):
        img_detail = "high"

    small = _resize_max_side(frame_bgr, max_side=max(256, min(2048, max_side)))
    ok, buf = cv2.imencode(".jpg", small, [int(cv2.IMWRITE_JPEG_QUALITY), jpeg_q])
    if not ok or buf is None:
        return None
    b64 = base64.standard_b64encode(buf.tobytes()).decode("ascii")

    system_txt = """You are a strict visual describer for a single webcam frame. Rules:
- Describe ONLY what is actually visible. Do NOT guess room type, job, or typical "office" layouts.
- Do NOT mention desks, shelves, books, monitors, whiteboards, filing cabinets, or "office/workspace" unless those objects are clearly visible in THIS image.
- If the frame is mostly a face, hands, ceiling, wall, or blur, say that plainly — do not invent furniture behind the person.
- Mention lighting (bright/dim/window light) and dominant colors you see. Name clothing only if the person/clothes are visible.
- If you are unsure about something, omit it or say "unclear in frame" instead of inventing."""

    user_txt = """Return one JSON object with these keys only:
- "scene_description": string, 2-6 short sentences. Literal description of this frame only: what is in foreground/background, colors, lighting, and clothing if visible. No generic office template.
- "emotion": object with "primary" (short label), "confidence" (0.0-1.0), optional "secondary" (string or null). If face unclear or not visible: primary "neutral", confidence <= 0.35.
- "visible_text": string; readable text in frame only, else "".

JSON only, no markdown."""

    try:
        rsp = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system_txt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_txt},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{b64}", "detail": img_detail},
                        },
                    ],
                },
            ],
            response_format={"type": "json_object"},
            max_tokens=700,
            temperature=0.15,
        )
        raw = (rsp.choices[0].message.content or "").strip()
        data = _parse_json_loose(raw)
        if not isinstance(data, dict):
            return None
        scene = data.get("scene_description")
        if not isinstance(scene, str) or not scene.strip():
            return None
        em = data.get("emotion")
        emotion_out: dict[str, Any] | None = None
        if isinstance(em, dict):
            prim = em.get("primary")
            conf = em.get("confidence")
            if isinstance(prim, str) and prim.strip():
                try:
                    c = float(conf) if conf is not None else 0.5
                except (TypeError, ValueError):
                    c = 0.5
                c = max(0.0, min(1.0, c))
                emotion_out = {"primary": prim.strip()[:80], "confidence": c}
                sec = em.get("secondary")
                if isinstance(sec, str) and sec.strip():
                    emotion_out["secondary"] = sec.strip()[:80]
        vt = data.get("visible_text")
        visible_text = vt.strip() if isinstance(vt, str) else ""
        return {
            "scene_description": scene.strip(),
            "emotion": emotion_out,
            "visible_text": visible_text[:8000],
        }
    except Exception as e:
        global _logged_openai_vision_err
        if not _logged_openai_vision_err:
            _logged_openai_vision_err = True
            print(
                f"[jarvis_visual_engine] OpenAI vision error (check model/key; further errors suppressed): {e}",
                file=sys.stderr,
            )
        return None


# --- Simple throttle + cache (shared with server) ---
_last_llm_mono = 0.0
_cached: dict[str, Any] | None = None
_cache_lock = threading.Lock()


def min_interval_sec() -> float:
    raw = (os.environ.get("VISION_LLM_MIN_INTERVAL_SEC") or "5.0").strip()
    try:
        v = float(raw)
        return max(2.0, min(120.0, v))
    except ValueError:
        return 5.0


def llm_enabled() -> bool:
    return (os.environ.get("VISION_LLM_ENABLED") or "1").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def maybe_analyze(
    frame_bgr: np.ndarray,
    *,
    force: bool,
) -> dict[str, Any] | None:
    """Returns scene/emotion/text from OpenAI, or None to use numeric fallback in server."""
    if not llm_enabled():
        return None
    now = time.monotonic()
    interval = min_interval_sec()
    with _cache_lock:
        if not force and _cached is not None and (now - _last_llm_mono) < interval:
            return dict(_cached)
    out = analyze_webcam_frame_openai(frame_bgr)
    if out is None:
        return None
    with _cache_lock:
        _last_llm_mono = time.monotonic()
        _cached = out
    return dict(out)


def invalidate_cache() -> None:
    global _cached, _last_llm_mono
    with _cache_lock:
        _cached = None
        _last_llm_mono = 0.0
