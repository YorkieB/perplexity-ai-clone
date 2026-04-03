"""
Replicate integration for Jarvis — async-friendly wrapper around the official `replicate` SDK.

Requires REPLICATE_API_TOKEN in the environment. Outputs are saved under `outputs/replicate/`
at the repository root when URLs are returned.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any, Optional

import httpx

logger = logging.getLogger("jarvis.replicate")

# Repository root: python/jarvis_replicate/replicate_agent.py -> parents[2]
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_OUTPUT_DIR = _PROJECT_ROOT / "outputs" / "replicate"
_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

MAX_RETRIES = 3
REQUEST_TIMEOUT_S = 120.0
HTTP_TIMEOUT = httpx.Timeout(120.0, connect=30.0)


def _ensure_token() -> str:
    token = (os.environ.get("REPLICATE_API_TOKEN") or "").strip()
    if not token:
        raise RuntimeError("REPLICATE_API_TOKEN is not set")
    os.environ["REPLICATE_API_TOKEN"] = token
    return token


def _sync_run(model: str, inputs: dict[str, Any]) -> Any:
    import replicate

    return replicate.run(model, input=inputs)


class ReplicateAgent:
    """
    Autonomous Replicate client with retries, timeouts, and structured logging.

    All public coroutine methods run the blocking SDK in a thread pool so they do not
    block the asyncio event loop.
    """

    def __init__(self, token: Optional[str] = None) -> None:
        self._token = (token or os.environ.get("REPLICATE_API_TOKEN") or "").strip()
        if self._token:
            os.environ["REPLICATE_API_TOKEN"] = self._token

    async def _call_with_retries(self, label: str, factory: Any) -> Any:
        last: Optional[BaseException] = None
        for attempt in range(1, MAX_RETRIES + 1):
            t0 = time.perf_counter()
            try:
                out = await asyncio.wait_for(asyncio.to_thread(factory), timeout=REQUEST_TIMEOUT_S)
                elapsed_ms = int((time.perf_counter() - t0) * 1000)
                logger.info(
                    "[%s] ok in %sms (attempt %s)",
                    label,
                    elapsed_ms,
                    attempt,
                )
                return out
            except Exception as e:
                last = e
                logger.warning("[%s] attempt %s/%s failed: %s", label, attempt, MAX_RETRIES, e)
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(0.8 * attempt * attempt)
        assert last is not None
        raise last

    def _log_result(self, label: str, model: str, inputs: dict[str, Any], duration_ms: int, out: Any) -> None:
        preview = out
        if isinstance(out, (list, tuple)) and out:
            preview = str(out[0])[:500]
        elif isinstance(out, str):
            preview = out[:500]
        else:
            preview = str(out)[:500]
        logger.info(
            "[%s] model=%s duration_ms=%s output_preview=%s",
            label,
            model,
            duration_ms,
            preview,
        )

    async def search_models(self, query: str) -> list[dict[str, Any]]:
        """Search Replicate's model index; return top 5 with name, description, latest version id."""
        token = _ensure_token()
        q = (query or "").strip()
        if not q:
            return []

        last: Optional[BaseException] = None
        t0 = time.perf_counter()
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
                    r = await asyncio.wait_for(
                        client.get(
                            "https://api.replicate.com/v1/models",
                            params={"query": q},
                            headers={
                                "Authorization": f"Token {token}",
                                "Content-Type": "application/json",
                            },
                        ),
                        timeout=REQUEST_TIMEOUT_S,
                    )
                    r.raise_for_status()
                    data = r.json()
                results = data.get("results") or []
                out: list[dict[str, Any]] = []
                for m in results[:5]:
                    owner = m.get("owner") or ""
                    name = m.get("name") or ""
                    full_name = (
                        f"{owner}/{name}".strip("/") if owner and name else (name or str(m.get("url", "")))
                    )
                    desc = (m.get("description") or "")[:2000]
                    latest = m.get("latest_version") or {}
                    vid = latest.get("id") if isinstance(latest, dict) else None
                    out.append(
                        {
                            "name": full_name,
                            "description": desc,
                            "latest_version_id": vid,
                        }
                    )
                logger.info(
                    "search_models query=%r count=%s duration_ms=%s attempt=%s",
                    q,
                    len(out),
                    int((time.perf_counter() - t0) * 1000),
                    attempt,
                )
                return out
            except Exception as e:
                last = e
                logger.warning("search_models attempt %s/%s failed: %s", attempt, MAX_RETRIES, e)
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(0.8 * attempt * attempt)
        assert last is not None
        raise last

    async def list_models_catalog(self, max_total: int = 2000) -> list[dict[str, Any]]:
        """Paginate Replicate GET /v1/models until max_total rows or no next page."""
        token = _ensure_token()
        cap = max(1, min(max_total, 5000))
        out: list[dict[str, Any]] = []
        next_url: Optional[str] = "https://api.replicate.com/v1/models"
        first = True

        async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
            while len(out) < cap and next_url:
                headers = {
                    "Authorization": f"Token {token}",
                    "Content-Type": "application/json",
                }
                if first:
                    lim = min(100, cap - len(out))
                    r = await asyncio.wait_for(
                        client.get(next_url, params={"limit": str(lim)}, headers=headers),
                        timeout=REQUEST_TIMEOUT_S,
                    )
                    first = False
                else:
                    r = await asyncio.wait_for(
                        client.get(next_url, headers=headers),
                        timeout=REQUEST_TIMEOUT_S,
                    )
                r.raise_for_status()
                data = r.json()
                batch = data.get("results") or []
                for m in batch:
                    if len(out) >= cap:
                        break
                    owner = m.get("owner") or ""
                    name = m.get("name") or ""
                    full_name = f"{owner}/{name}".strip("/") if owner and name else str(name or "")
                    if not full_name:
                        continue
                    desc = (m.get("description") or "")[:500]
                    out.append({"name": full_name, "description": desc})
                raw_next = data.get("next")
                next_url = None
                if isinstance(raw_next, str) and raw_next.strip():
                    nu = raw_next.strip()
                    if nu.startswith("/"):
                        nu = f"https://api.replicate.com{nu}"
                    next_url = nu
                if not batch:
                    break

        logger.info("list_models_catalog count=%s (max_total=%s)", len(out), cap)
        return out

    async def run_model(self, model: str, inputs: dict[str, Any]) -> Any:
        """Run any Replicate model by identifier (e.g. black-forest-labs/flux-2-pro)."""
        _ensure_token()
        model = (model or "").strip()
        if not model:
            raise ValueError("model is required")
        if inputs is None:
            inputs = {}

        def _run() -> Any:
            t0 = time.perf_counter()
            out = _sync_run(model, dict(inputs))
            duration_ms = int((time.perf_counter() - t0) * 1000)
            self._log_result("run_model", model, inputs, duration_ms, out)
            return out

        return await self._call_with_retries(f"run_model:{model}", _run)

    async def generate_image(
        self,
        prompt: str,
        model: str = "black-forest-labs/flux-2-pro",
    ) -> dict[str, Any]:
        """Generate an image; returns URL string and optional local path."""
        _ensure_token()
        prompt = (prompt or "").strip()
        if not prompt:
            raise ValueError("prompt is required")

        inputs: dict[str, Any] = {"prompt": prompt, "output_format": "png"}
        out = await self.run_model(model, inputs)
        url = self._extract_primary_url(out)
        local_path = await self._maybe_download(url, prefix="image", ext=".png")
        return {"url": url, "local_path": local_path, "raw": out}

    async def transcribe_audio(self, audio_url: str) -> dict[str, Any]:
        """Transcribe audio via OpenAI Whisper on Replicate."""
        _ensure_token()
        audio_url = (audio_url or "").strip()
        if not audio_url:
            raise ValueError("audio_url is required")
        model = "openai/whisper"
        inputs: dict[str, Any] = {"audio": audio_url}
        out = await self.run_model(model, inputs)
        text = self._extract_text(out)
        return {"text": text, "raw": out}

    async def generate_video(
        self,
        prompt: str,
        image_url: Optional[str] = None,
        model: str = "wan-video/wan-2.1-i2v-720p",
    ) -> dict[str, Any]:
        """Generate video (WAN 2.1 i2v when image_url set; otherwise text-only models may apply)."""
        _ensure_token()
        prompt = (prompt or "").strip()
        if not prompt:
            raise ValueError("prompt is required")
        inputs: dict[str, Any] = {"prompt": prompt}
        if image_url and image_url.strip():
            inputs["image"] = image_url.strip()
        out = await self.run_model(model, inputs)
        url = self._extract_primary_url(out)
        local_path = await self._maybe_download(url, prefix="video", ext=".mp4")
        return {"url": url, "local_path": local_path, "raw": out}

    async def synthesize_speech(
        self,
        text: str,
        voice: str = "af_heart",
        model: str = "hexgrad/kokoro-82m",
    ) -> dict[str, Any]:
        """Kokoro TTS — returns audio URL and optional local path."""
        _ensure_token()
        text = (text or "").strip()
        if not text:
            raise ValueError("text is required")
        inputs = {"text": text, "voice": voice}
        out = await self.run_model(model, inputs)
        url = self._extract_primary_url(out)
        local_path = await self._maybe_download(url, prefix="tts", ext=".wav")
        return {"url": url, "local_path": local_path, "raw": out}

    @staticmethod
    def _extract_primary_url(out: Any) -> str:
        if isinstance(out, str) and out.startswith("http"):
            return out
        if isinstance(out, list) and out:
            for item in out:
                if isinstance(item, str) and item.startswith("http"):
                    return item
        if isinstance(out, dict):
            for k in ("url", "audio", "output", "video"):
                v = out.get(k)
                if isinstance(v, str) and v.startswith("http"):
                    return v
        return str(out) if out is not None else ""

    @staticmethod
    def _extract_text(out: Any) -> str:
        if isinstance(out, str):
            return out
        if isinstance(out, dict):
            t = out.get("text") or out.get("transcription")
            if isinstance(t, str):
                return t
        if isinstance(out, dict) and "segments" in out:
            segs = out.get("segments")
            if isinstance(segs, list):
                parts = [s.get("text", "") for s in segs if isinstance(s, dict)]
                return " ".join(p for p in parts if p).strip()
        return json.dumps(out, default=str)[:8000]

    @staticmethod
    async def _maybe_download(url: str, prefix: str, ext: str) -> Optional[str]:
        if not url or not url.startswith("http"):
            return None
        name = f"{prefix}_{uuid.uuid4().hex[:12]}{ext}"
        path = _OUTPUT_DIR / name
        try:
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
                r = await client.get(url)
                r.raise_for_status()
                path.write_bytes(r.content)
            logger.info("saved output file %s", path)
            return str(path)
        except Exception as e:
            logger.warning("could not download output from %s: %s", url[:80], e)
            return None
