"""
FastAPI voice analysis microservice.

Accepts raw PCM16-LE audio (24 kHz mono) and returns analysis metrics + vocal state.

Start with:
    uvicorn voice_analysis.server:app --port 5199
"""

from __future__ import annotations

import logging
import time

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from .analyzer import analyze_audio
from .state_interpreter import interpret_vocal_state

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voice-analysis")

# Local-only service: allow browser origins for the Vite dev app only (not "*").
# The app normally proxies via /api/voice-analysis; direct calls to :5199 still get a tight CORS policy.
_LOCAL_DEV_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)

app = FastAPI(title="Jarvis Voice Analysis", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_LOCAL_DEV_ORIGINS),
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/analyze")
async def analyze(request: Request):
    pcm_bytes = await request.body()

    if len(pcm_bytes) < 1000:
        return {"error": "Audio too short", "vocalState": "Unable to analyse voice"}

    start = time.perf_counter()

    try:
        metrics = analyze_audio(pcm_bytes)
    except Exception as exc:
        logger.exception("Analysis failed")
        return {
            "error": str(exc),
            "vocalState": "Unable to analyse voice",
        }

    vocal_state = interpret_vocal_state(metrics)
    metrics["vocalState"] = vocal_state

    elapsed = round((time.perf_counter() - start) * 1000, 1)
    logger.info("Analysis complete in %sms — %s", elapsed, vocal_state)

    return metrics
