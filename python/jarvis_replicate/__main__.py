"""Run the Replicate FastAPI bridge (default first free port 18865–18919; screen agent uses 8765)."""

from __future__ import annotations

import os

import uvicorn

from .port_util import resolve_replicate_bridge_port
from .replicate_server import app

if __name__ == "__main__":
    host = (os.environ.get("REPLICATE_BRIDGE_HOST") or "127.0.0.1").strip()
    port = resolve_replicate_bridge_port(host)
    url = f"http://{host}:{port}"
    print(f"[jarvis_replicate] Listening on {url}")
    print(f"[jarvis_replicate] Set REPLICATE_BRIDGE_URL={url} in .env if the proxy cannot reach this port.")
    uvicorn.run(app, host=host, port=port, log_level="info")
