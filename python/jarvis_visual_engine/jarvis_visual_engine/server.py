"""
HTTP API compatible with Jarvis Electron/Vite vision proxy: `/api/v1/context`, `/api/v1/analyze`.

Uses OpenCV for capture. When `OPENAI_API_KEY` is set, runs an optional GPT vision pass for
scene, clothing, mood — matching what Jarvis voice expects in [VISUAL CONTEXT UPDATE].
"""

from __future__ import annotations

import os
import threading
import time
from contextlib import asynccontextmanager
from typing import Any

import cv2
from fastapi import FastAPI, Header, HTTPException, Request

try:
    from pathlib import Path

    from dotenv import load_dotenv

    _here = Path(__file__).resolve().parent
    for _ in range(8):
        envp = _here / ".env"
        if envp.is_file():
            load_dotenv(envp)
            break
        _here = _here.parent
    else:
        load_dotenv()
except ImportError:
    pass

from jarvis_visual_engine.openai_vision import invalidate_cache, maybe_analyze

# --- API key (must match VISION_API_KEY in app .env, default jarvis-vision-local) ---
_DEFAULT_KEY = "jarvis-vision-local"


def _expected_api_key() -> str:
    return os.environ.get("VISION_API_KEY", _DEFAULT_KEY).strip() or _DEFAULT_KEY


def _verify_api_key(x_api_key: str | None) -> None:
    if (x_api_key or "").strip() != _expected_api_key():
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key")


# --- Webcam (lazy, thread-safe) ---
_cap: cv2.VideoCapture | None = None
_cap_lock = threading.Lock()
_frame_count = 0
_last_frame_ts: float | None = None
_last_error: str | None = None


def _windows_capture_backends() -> list[int]:
    """Try DSHOW first; fall back to MSMF / default when DSHOW cannot open by index (common on some drivers)."""
    seen: set[int] = set()
    out: list[int] = []
    for name in ("CAP_DSHOW", "CAP_MSMF", "CAP_ANY"):
        try:
            b = int(getattr(cv2, name))
        except AttributeError:
            continue
        if b not in seen:
            seen.add(b)
            out.append(b)
    return out if out else [0]


def _camera_indices_to_try() -> list[int]:
    """Prefer `JARVIS_VISION_CAMERA_INDEX` (e.g. 1 if eMeet is second device), then 0..3."""
    raw = os.environ.get("JARVIS_VISION_CAMERA_INDEX", "").strip()
    preferred: list[int] = []
    if raw.isdigit():
        preferred.append(int(raw))
    for i in range(4):
        if i not in preferred:
            preferred.append(i)
    return preferred


def _open_capture() -> cv2.VideoCapture | None:
    """Try configured index first, then 0..3; on Windows retry each index with alternate backends."""
    indices = _camera_indices_to_try()
    backends = _windows_capture_backends() if os.name == "nt" else [int(cv2.CAP_ANY)]
    for backend in backends:
        for index in indices:
            cap = cv2.VideoCapture(index, backend)
            if cap.isOpened():
                for _ in range(3):
                    cap.read()
                return cap
            cap.release()
    return None


def _get_capture() -> cv2.VideoCapture | None:
    global _cap, _last_error
    with _cap_lock:
        if _cap is not None and _cap.isOpened():
            return _cap
        if _cap is not None:
            try:
                _cap.release()
            except Exception:
                pass
            _cap = None
        try:
            _cap = _open_capture()
            if _cap is None:
                _last_error = "No webcam opened (tried indices 0–3)."
            else:
                _last_error = None
        except Exception as e:
            _last_error = str(e)
            _cap = None
        return _cap


def _read_frame() -> tuple[bool, Any]:
    global _frame_count, _last_frame_ts
    cap = _get_capture()
    if cap is None:
        return False, None
    ok, frame = cap.read()
    if ok and frame is not None:
        with _cap_lock:
            _frame_count += 1
            _last_frame_ts = time.time()
    return ok, frame


def _context_payload(*, force_llm: bool = False) -> dict[str, Any]:
    """Shape matches `useVision.ts` expectations."""
    ok, frame = _read_frame()
    now = time.time()
    iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(now))

    if not ok or frame is None:
        err = _last_error or "Camera not ready or frame grab failed."
        return {
            "connected": True,
            "camera_connected": False,
            "scene_description": err,
            "analysis": err,
            "frames_processed": _frame_count,
            "stats": {"frames_processed": _frame_count},
            "faces": [],
            "emotion": None,
            "motion_detections": 0,
            "faces_recognized": 0,
            "api_calls": 1,
            "last_updated": iso,
            "timestamp": iso,
        }

    h, w = frame.shape[:2]
    mean_b = float(frame.mean()) if frame.size else 0.0
    fallback_scene = (
        f"Live webcam ({w}×{h}). Mean brightness {mean_b:.1f}. "
        "Set OPENAI_API_KEY for rich scene and mood analysis."
    )

    llm: dict[str, Any] | None = None
    try:
        llm = maybe_analyze(frame, force=force_llm)
    except Exception:
        llm = None

    scene = (llm or {}).get("scene_description") or fallback_scene
    emotion = (llm or {}).get("emotion")
    visible_text = (llm or {}).get("visible_text") or ""

    return {
        "connected": True,
        "camera_connected": True,
        "scene_description": scene,
        "analysis": {"description": scene, "text": scene},
        "visible_text": visible_text if isinstance(visible_text, str) else "",
        "frames_processed": _frame_count,
        "stats": {"frames_processed": _frame_count},
        "faces": [],
        "emotion": emotion,
        "motion_detections": 0,
        "faces_recognized": 0,
        "api_calls": 1,
        "last_updated": iso,
        "timestamp": iso,
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup line appears in the same terminal as Uvicorn (Electron spawn or manual)."""
    k = (os.environ.get("OPENAI_API_KEY") or "").strip()
    llm_on = (os.environ.get("VISION_LLM_ENABLED") or "1").strip().lower() not in ("0", "false", "no", "off")
    analysis = "OpenAI scene+mood ON" if (k and llm_on) else ("OpenAI scene+mood OFF (no OPENAI_API_KEY)" if not k else "VISION_LLM_ENABLED=0")
    print(f"[jarvis_visual_engine] Startup: HTTP API ready — {analysis}", flush=True)
    yield
    print("[jarvis_visual_engine] Shutdown", flush=True)


app = FastAPI(title="Jarvis Visual Engine", version="0.1.0", lifespan=lifespan)


@app.get("/api/v1/context")
async def get_context(
    x_api_key: str | None = Header(None, alias="X-API-Key"),
) -> dict[str, Any]:
    _verify_api_key(x_api_key)
    return _context_payload()


@app.post("/api/v1/analyze")
async def post_analyze(
    request: Request,
    x_api_key: str | None = Header(None, alias="X-API-Key"),
) -> dict[str, Any]:
    _verify_api_key(x_api_key)
    _ = await request.body()
    invalidate_cache()
    return _context_payload(force_llm=True)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "jarvis_visual_engine"}
