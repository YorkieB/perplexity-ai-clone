"""Entrypoint: `python -m jarvis_visual_engine`"""

from __future__ import annotations

import os

import uvicorn

from jarvis_visual_engine.server import app


def main() -> None:
    port = int(os.environ.get("VISION_ENGINE_PORT", "5000"))
    host = os.environ.get("VISION_ENGINE_HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
