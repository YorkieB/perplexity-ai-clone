"""
FastAPI bridge for ReplicateAgent — REST on 127.0.0.1 (default port band 18865+, see __main__.py).

Run: python -m jarvis_replicate
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .replicate_agent import ReplicateAgent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
logger = logging.getLogger("jarvis.replicate.server")

app = FastAPI(title="Jarvis Replicate Bridge", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(127\.0\.0\.1|localhost)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_agent: Optional[ReplicateAgent] = None


def get_agent() -> ReplicateAgent:
    global _agent
    if _agent is None:
        _agent = ReplicateAgent()
    return _agent


class GenerateImageBody(BaseModel):
    prompt: str
    model: str = Field(default="black-forest-labs/flux-2-pro")


class TranscribeBody(BaseModel):
    audio_url: str


class GenerateVideoBody(BaseModel):
    prompt: str
    image_url: Optional[str] = None
    model: str = Field(default="wan-video/wan-2.1-i2v-720p")


class SynthesizeSpeechBody(BaseModel):
    text: str
    voice: str = Field(default="af_heart")


class RunModelBody(BaseModel):
    model: str
    inputs: dict[str, Any] = Field(default_factory=dict)


@app.get("/health")
async def health() -> dict[str, Any]:
    tok = bool((os.environ.get("REPLICATE_API_TOKEN") or "").strip())
    return {"status": "ok", "service": "jarvis_replicate", "token_configured": tok}


@app.post("/generate-image")
async def generate_image(body: GenerateImageBody) -> dict[str, Any]:
    try:
        return await get_agent().generate_image(prompt=body.prompt, model=body.model)
    except Exception as e:
        logger.exception("generate_image failed")
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/transcribe")
async def transcribe(body: TranscribeBody) -> dict[str, Any]:
    try:
        return await get_agent().transcribe_audio(audio_url=body.audio_url)
    except Exception as e:
        logger.exception("transcribe failed")
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/generate-video")
async def generate_video(body: GenerateVideoBody) -> dict[str, Any]:
    try:
        return await get_agent().generate_video(
            prompt=body.prompt,
            image_url=body.image_url,
            model=body.model,
        )
    except Exception as e:
        logger.exception("generate_video failed")
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/synthesize-speech")
async def synthesize_speech(body: SynthesizeSpeechBody) -> dict[str, Any]:
    try:
        return await get_agent().synthesize_speech(text=body.text, voice=body.voice)
    except Exception as e:
        logger.exception("synthesize_speech failed")
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.get("/models")
async def list_models_catalog(
    max_total: int = Query(2000, ge=1, le=5000, description="Max models to return (server paginates the Replicate API)"),
) -> dict[str, Any]:
    try:
        rows = await get_agent().list_models_catalog(max_total=max_total)
        return {"results": rows, "count": len(rows)}
    except Exception as e:
        logger.exception("list_models_catalog failed")
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.get("/search-models")
async def search_models(q: str = Query(..., min_length=1, description="Search query")) -> dict[str, Any]:
    try:
        rows = await get_agent().search_models(query=q)
        return {"results": rows}
    except Exception as e:
        logger.exception("search_models failed")
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.post("/run-model")
async def run_model(body: RunModelBody) -> dict[str, Any]:
    try:
        out = await get_agent().run_model(model=body.model, inputs=body.inputs)
        return {"output": out}
    except Exception as e:
        logger.exception("run_model failed")
        raise HTTPException(status_code=502, detail=str(e)) from e


@app.on_event("startup")
async def startup() -> None:
    tok = (os.environ.get("REPLICATE_API_TOKEN") or "").strip()
    if not tok:
        logger.warning("REPLICATE_API_TOKEN is not set — Replicate calls will fail until it is configured.")
    else:
        logger.info("Replicate bridge ready (token present).")
