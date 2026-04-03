"""Pick a free TCP port for the Replicate bridge (avoid clashing with screen-agent on 8765)."""

from __future__ import annotations

import os
import socket


# Screen agent / sidecar commonly uses 8765 — Replicate uses a different band.
DEFAULT_REPLICATE_PORT_START = 18865
DEFAULT_REPLICATE_PORT_END = 18920  # exclusive: try 18865..18919


def _can_bind(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind((host, port))
            return True
        except OSError:
            return False


def resolve_replicate_bridge_port(host: str) -> int:
    """
    REPLICATE_BRIDGE_PORT:
    - unset or empty or `auto` → first free port in [DEFAULT_REPLICATE_PORT_START, DEFAULT_REPLICATE_PORT_END)
    - otherwise → exact integer (uvicorn will fail if still in use)
    """
    raw = (os.environ.get("REPLICATE_BRIDGE_PORT") or "").strip()
    if not raw or raw.lower() == "auto":
        for p in range(DEFAULT_REPLICATE_PORT_START, DEFAULT_REPLICATE_PORT_END):
            if _can_bind(host, p):
                return p
        raise RuntimeError(
            f"No free TCP port in range {DEFAULT_REPLICATE_PORT_START}-{DEFAULT_REPLICATE_PORT_END - 1} on {host}",
        )
    return int(raw)
