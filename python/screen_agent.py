"""
Jarvis Screen Agent — Python sidecar.

Default: newline-delimited JSON on stdin/stdout (transport=stdio).

For TypeScript PythonBridge (WebSocket JSON frames), run with
SCREEN_AGENT_TRANSPORT=websocket — see src/agents/screen-agent/python-bridge.ts.
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import queue
import re
import sys
import threading
import time
import traceback
from dataclasses import dataclass, field
from typing import Any, Callable, Literal, Optional, TextIO

# Optional numpy for pixel compare
try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None  # type: ignore[assignment]

from dotenv import load_dotenv

# --- deps (import errors surface at runtime with clear stderr logs) ---
try:
    import mss
except ImportError:
    mss = None  # type: ignore[assignment]

from PIL import Image, ImageChops, ImageOps

try:
    import pyautogui
except ImportError:
    pyautogui = None  # type: ignore[assignment]

if pyautogui is not None:
    pyautogui.FAILSAFE = True
    pyautogui.PAUSE = 0.5

try:
    import pytesseract
except ImportError:
    pytesseract = None  # type: ignore[assignment]

if pytesseract is not None:
    _tess_cmd = os.environ.get("TESSERACT_CMD")
    if _tess_cmd:
        pytesseract.pytesseract.tesseract_cmd = _tess_cmd

try:
    import pygetwindow as gw
except ImportError:
    gw = None  # type: ignore[assignment]

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None  # type: ignore[assignment]

try:
    from websockets.sync.server import serve as ws_serve
except ImportError:
    ws_serve = None  # type: ignore[assignment]

# Logging → stderr only
_log = logging.getLogger("screen_agent")
if not _log.handlers:
    _h = logging.StreamHandler(sys.stderr)
    _h.setFormatter(logging.Formatter("[screen_agent] %(levelname)s: %(message)s"))
    _log.addHandler(_h)
_log.setLevel(logging.INFO)


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


class ScreenCapture:
    """Full primary monitor capture via mss; window title via pygetwindow."""

    def __init__(self) -> None:
        self._mss_ctx = mss.mss() if mss else None

    def capture(self) -> Image.Image:
        if self._mss_ctx is None:
            raise RuntimeError("mss is not installed")
        mon = self._mss_ctx.monitors[1]
        shot = self._mss_ctx.grab(mon)
        # BGRA raw → RGB PIL
        img = Image.frombytes("RGB", shot.size, shot.bgra, "raw", "BGRX")
        return img

    def get_window_title(self) -> str:
        if gw is None:
            return ""
        try:
            w = gw.getActiveWindow()
            if w is not None:
                return str(w.title)
        except Exception as e:  # pragma: no cover
            _log.debug("get_window_title: %s", e)
        return ""

    @staticmethod
    def compare(img1: Image.Image, img2: Image.Image) -> float:
        """Return fraction of pixels that differ meaningfully (0.0 identical, 1.0 all different)."""
        if img1.size != img2.size:
            # resize to common size for comparison
            w = min(img1.width, img2.width)
            h = min(img1.height, img2.height)
            img1 = img1.crop((0, 0, w, h))
            img2 = img2.crop((0, 0, w, h))

        if np is not None:
            a1 = np.asarray(img1.convert("RGB"))
            a2 = np.asarray(img2.convert("RGB"))
            diff = np.abs(a1.astype(np.int16) - a2.astype(np.int16))
            mask = np.any(diff > 12, axis=2)
            return float(np.count_nonzero(mask)) / float(mask.size)

        # Fallback: sample every 4th pixel
        w, h = img1.size
        g1 = img1.convert("RGB").getdata()
        g2 = img2.convert("RGB").getdata()
        changed = 0
        total = 0
        for y in range(0, h, 4):
            for x in range(0, w, 4):
                i = y * w + x
                p1, p2 = g1[i], g2[i]
                if any(abs(int(p1[j]) - int(p2[j])) > 12 for j in range(3)):
                    changed += 1
                total += 1
        return float(changed) / float(total) if total else 0.0


class SignificanceDetector:
    def __init__(self, threshold: Optional[float] = None) -> None:
        self.threshold = threshold if threshold is not None else _env_float("SIGNIFICANCE_THRESHOLD", 0.15)

    def is_significant(self, diff_ratio: float, context: dict[str, Any]) -> bool:
        title = str(context.get("window_title", "") or "").lower()
        if "screen-agent" in title:
            return False
        return diff_ratio > self.threshold

    def describe_change(self, img_before: Image.Image, img_after: Image.Image) -> str:
        if pytesseract is None:
            return "Visual change detected"
        try:
            diff = ImageChops.difference(img_before.convert("RGB"), img_after.convert("RGB"))
            bbox = diff.getbbox()
            if bbox is None:
                return "No visible change"
            crop = img_after.crop(bbox) if bbox else img_after
            if max(crop.width, crop.height) > 800:
                crop = ImageOps.contain(crop, (800, 600))
            text = pytesseract.image_to_string(crop, lang="eng")[:500]
            text = text.strip()
            return text[:200] if text else "Visual change detected"
        except Exception as e:  # pragma: no cover
            _log.debug("describe_change OCR failed: %s", e)
            return "Visual change detected"


def _jpeg_b64(img: Image.Image, max_width: int = 800, quality: int = 60) -> str:
    im = ImageOps.contain(img.convert("RGB"), (max_width, max_width * 10))
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=quality)
    return base64.standard_b64encode(buf.getvalue()).decode("ascii")


class AdviseEngine:
    def __init__(self, openai_client: Any, model: str = "gpt-4o-mini") -> None:
        self.client = openai_client
        self.model = model
        self._lock = threading.Lock()
        self._last_call: float = 0.0
        self._min_interval = 8.0

    def analyze(
        self,
        screenshot: Image.Image,
        change_description: str,
        window_title: str,
    ) -> Optional[dict[str, Any]]:
        if self.client is None:
            return None
        now = time.monotonic()
        with self._lock:
            if now - self._last_call < self._min_interval:
                _log.info("AdviseEngine: rate limit skip")
                return None
            self._last_call = now

        b64 = _jpeg_b64(screenshot)
        system = (
            "You are Jarvis, a helpful AI assistant observing the user's screen. "
            "Given what you see, provide ONE brief, actionable suggestion (max 20 words). "
            "If nothing useful to suggest, return null."
        )
        user = f"Window: {window_title}\nChange hint: {change_description}\n[Image attached as base64 JPEG]"
        try:
            resp = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system},
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": user},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                            },
                        ],
                    },
                ],
                max_tokens=120,
            )
            raw = (resp.choices[0].message.content or "").strip()
            if raw.lower() in ("null", "none", ""):
                return None
            # Try JSON parse; else wrap as text
            try:
                data = json.loads(raw)
                if data is None:
                    return None
                if isinstance(data, dict):
                    return {
                        "text": str(data.get("text", "")),
                        "confidence": float(data.get("confidence", 0.8)),
                        "actionable": bool(data.get("actionable", True)),
                    }
            except json.JSONDecodeError:
                pass
            return {"text": raw[:500], "confidence": 0.7, "actionable": True}
        except Exception as e:
            _log.warning("AdviseEngine API error: %s", e)
            return None


class ActEngine:
    """ACT mode: vision LLM plans pyautogui steps."""

    def __init__(self, openai_client: Any, model: str = "gpt-4o-mini") -> None:
        self.client = openai_client
        self.model = model

    def execute_goal(
        self,
        goal: str,
        send_fn: Callable[[dict[str, Any]], None],
        stop_event: threading.Event,
        approval_wait: Callable[[], tuple[bool, float]],
        max_steps: int = 20,
    ) -> None:
        if self.client is None or pyautogui is None:
            send_fn(
                {
                    "type": "goal_failed",
                    "stepsCompleted": 0,
                    "reason": "OpenAI or pyautogui unavailable",
                }
            )
            return

        steps_done = 0
        system = (
            "You are Jarvis executing a computer task. Given the screen, output the NEXT SINGLE action "
            'as JSON only: {"type","target_x","target_y","target","value","keys","reasoning",'
            '"needsApproval","isComplete","failureReason"} '
            "type is one of: click, type, scroll, hotkey, wait, screenshot. "
            "Use target_x/target_y for click. Use value for type text, scroll amount, or wait seconds."
        )

        for step in range(1, max_steps + 1):
            if stop_event.is_set():
                _log.info("ActEngine: stop_event set, exiting")
                return

            try:
                cap = ScreenCapture()
                img = cap.capture()
            except Exception as e:
                send_fn({"type": "goal_failed", "stepsCompleted": steps_done, "reason": str(e)})
                return

            b64 = _jpeg_b64(img)
            user_msg = f"Goal: {goal}\nStep: {step}/{max_steps}\nExecute the next action."
            try:
                resp = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": system},
                        {
                            "role": "user",
                            "content": [
                                {"type": "text", "text": user_msg},
                                {
                                    "type": "image_url",
                                    "image_url": {"url": f"data:image/jpeg;base64,{b64}"},
                                },
                            ],
                        },
                    ],
                    max_tokens=500,
                )
                raw = (resp.choices[0].message.content or "").strip()
            except Exception as e:
                _log.warning("ActEngine LLM error: %s", e)
                send_fn({"type": "goal_failed", "stepsCompleted": steps_done, "reason": f"LLM error: {e!s}"})
                return

            action = _parse_action_json(raw)
            if action is None:
                send_fn({"type": "goal_failed", "stepsCompleted": steps_done, "reason": "Invalid LLM JSON"})
                return

            if action.get("isComplete"):
                send_fn({"type": "goal_complete", "stepsCompleted": max(steps_done, step)})
                return
            if action.get("failureReason"):
                send_fn(
                    {
                        "type": "goal_failed",
                        "stepsCompleted": steps_done,
                        "reason": str(action.get("failureReason")),
                    }
                )
                return

            needs = bool(action.get("needsApproval"))
            reasoning = str(action.get("reasoning", "action"))
            if needs:
                agent_action = {
                    "type": str(action.get("type", "unknown")),
                    "reasoning": reasoning,
                    "needsApproval": True,
                }
                send_fn({"type": "approval_required", "action": agent_action})
                approved, _elapsed = approval_wait()
                if not approved:
                    send_fn(
                        {
                            "type": "goal_failed",
                            "stepsCompleted": steps_done,
                            "reason": "User denied approval",
                            "failureReason": "User denied approval",
                        }
                    )
                    return

            try:
                _execute_pyautogui_action(action)
            except Exception as e:
                send_fn({"type": "goal_failed", "stepsCompleted": steps_done, "reason": str(e)})
                return

            steps_done = step
            send_fn({"type": "goal_progress", "step": step, "description": reasoning})

            time.sleep(1.0)
            if stop_event.is_set():
                return

        send_fn(
            {
                "type": "goal_failed",
                "stepsCompleted": steps_done,
                "reason": "Max steps exceeded",
                "failureReason": "Max steps exceeded",
            }
        )


def _parse_action_json(raw: str) -> Optional[dict[str, Any]]:
    m = re.search(r"\{[\s\S]*\}", raw)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def _execute_pyautogui_action(action: dict[str, Any]) -> None:
    if pyautogui is None:
        raise RuntimeError("pyautogui unavailable")
    t = str(action.get("type", "")).lower()
    if t == "click":
        x = int(action.get("target_x", action.get("x", 0)))
        y = int(action.get("target_y", action.get("y", 0)))
        pyautogui.click(x, y)
    elif t == "type":
        text = str(action.get("value", ""))
        pyautogui.typewrite(text, interval=0.05)
    elif t == "scroll":
        amount = int(action.get("value", action.get("amount", 0)))
        pyautogui.scroll(amount)
    elif t == "hotkey":
        keys = action.get("keys") or []
        if isinstance(keys, str):
            keys = [keys]
        pyautogui.hotkey(*[str(k) for k in keys])
    elif t == "wait":
        sec = float(action.get("value", action.get("seconds", 1)))
        time.sleep(sec)
    elif t == "screenshot":
        pass
    else:
        raise ValueError(f"unknown action type: {t}")


@dataclass
class ScreenAgentProcess:
    """
    Default transport is stdio (newline JSON): first line is usually {"type":"ready"}.

    For TypeScript PythonBridge (WebSocket client), run with:
      SCREEN_AGENT_TRANSPORT=websocket python -m screen_agent
    or pass transport=\"websocket\".
    """

    host: str = "127.0.0.1"
    port: int = field(default_factory=lambda: _env_int("SCREEN_AGENT_WS_PORT", 8765))
    transport: Literal["websocket", "stdio"] = "stdio"
    out_stream: Optional[TextIO] = None

    mode: str = "WATCH"
    goal: Optional[str] = None
    stop_event: threading.Event = field(default_factory=threading.Event)
    act_thread: Optional[threading.Thread] = None
    act_stop_event: threading.Event = field(default_factory=threading.Event)

    _send_lock: threading.Lock = field(default_factory=threading.Lock, repr=False)
    _ws: Any = field(default=None, repr=False)
    _frame_id: int = 0

    _capture: ScreenCapture = field(default_factory=ScreenCapture)
    _sig: SignificanceDetector = field(default_factory=SignificanceDetector)
    _advise: Optional[AdviseEngine] = field(default=None, init=False, repr=False)
    _act: Optional[ActEngine] = field(default=None, init=False, repr=False)
    _approval_queue: "queue.Queue[Optional[bool]]" = field(
        default_factory=queue.Queue, init=False, repr=False
    )

    def __post_init__(self) -> None:
        self._openai: Any = None
        if OpenAI and os.environ.get("OPENAI_API_KEY"):
            try:
                self._openai = OpenAI()
            except Exception as e:  # pragma: no cover
                _log.warning("OpenAI client init failed: %s", e)
        object.__setattr__(self, "_advise", AdviseEngine(self._openai))
        object.__setattr__(self, "_act", ActEngine(self._openai))

    def send(self, msg: dict[str, Any]) -> None:
        line = json.dumps(msg) + "\n"
        with self._send_lock:
            if self.transport == "stdio":
                stream = self.out_stream if self.out_stream is not None else sys.stdout
                stream.write(line)
                stream.flush()
                return
            text = json.dumps(msg)
            if self._ws is not None:
                try:
                    self._ws.send(text)
                except Exception as e:  # pragma: no cover
                    _log.debug("ws send failed: %s", e)

    def emit_ready(self) -> None:
        self.send({"type": "ready"})

    def startup(self) -> None:
        """Load environment variables (used by run() and tests)."""
        load_dotenv()

    def handle_command(self, msg: dict[str, Any]) -> None:
        cmd = msg.get("command")
        if cmd == "set_mode":
            prev = self.mode
            mode = str(msg.get("mode", "WATCH")).upper()
            g = msg.get("goal")
            self.goal = str(g).strip() if g is not None else None

            if prev == "ACT" and mode != "ACT":
                self.act_stop_event.set()
                if self.act_thread is not None and self.act_thread.is_alive():
                    self.act_thread.join(timeout=30.0)
                self.act_thread = None
                self.act_stop_event = threading.Event()

            self.mode = mode

            if mode == "ACT" and self.goal:
                self.act_stop_event.clear()

                def send_fn(m: dict[str, Any]) -> None:
                    self.send(m)

                def approval_wait() -> tuple[bool, float]:
                    try:
                        r = self._approval_queue.get(timeout=15.0)
                        return bool(r), 0.0
                    except queue.Empty:
                        return False, 15.0

                def run_act() -> None:
                    if self._act:
                        self._act.execute_goal(
                            self.goal or "",
                            send_fn,
                            self.act_stop_event,
                            approval_wait,
                        )

                self.act_thread = threading.Thread(target=run_act, name="act-engine", daemon=True)
                self.act_thread.start()

        elif cmd == "stop":
            self.stop_event.set()
            self.act_stop_event.set()
            self.emit_ready()

        elif msg.get("type") == "approval_response":
            self._approval_queue.put(bool(msg.get("approved")))

        elif cmd == "query_screen":
            q = str(msg.get("question", ""))
            # Placeholder: no vision QA without extra LLM wiring
            self.send({"type": "query_response", "answer": f"(stub) query_screen: {q[:200]}"})

        elif cmd == "query_memory":
            ts = msg.get("timestamp")
            self.send({"type": "memory_response", "record": None, "timestamp": ts})

    def _capture_loop(self) -> None:
        prev_img: Optional[Image.Image] = None
        while not self.stop_event.is_set():
            try:
                img = self._capture.capture()
            except Exception as e:  # pragma: no cover
                self.send({"type": "error", "message": str(e)})
                time.sleep(2.0)
                continue

            title = self._capture.get_window_title()
            old = prev_img
            diff = 0.0 if old is None else self._capture.compare(old, img)
            prev_img = img

            ctx = {"window_title": title, "diff_ratio": diff}
            sig = self._sig.is_significant(diff, ctx)

            if self.mode == "ACT":
                time.sleep(2.0)
                continue

            if sig and self.mode in ("WATCH", "ADVISE"):
                self._frame_id += 1
                desc = self._sig.describe_change(old if old is not None else img, img)
                ts = time.time()
                app = title.split(" - ")[-1][:120] if title else "unknown"
                wt = title
                err = False
                sigv = float(min(1.0, max(0.0, diff)))
                payload: dict[str, Any] = {
                    "type": "screen_change",
                    "frame_id": self._frame_id,
                    "timestamp": ts,
                    "app": app,
                    "window": wt,
                    "windowTitle": wt,
                    "error_detected": err,
                    "element_count": 0,
                    "significance": sigv,
                    "description": desc,
                    "context": {
                        "frame_id": self._frame_id,
                        "timestamp": ts,
                        "app": app,
                        "windowTitle": wt,
                        "error_detected": err,
                        "diff_ratio": diff,
                        "mode": self.mode,
                    },
                }
                self.send(payload)

                if self.mode == "ADVISE" and self._advise:
                    adv = self._advise.analyze(img, desc, title)
                    if adv:
                        self.send(
                            {
                                "type": "advice",
                                "text": adv.get("text", ""),
                                "confidence": float(adv.get("confidence", 0)),
                                "actionable": bool(adv.get("actionable", False)),
                            }
                        )

            time.sleep(2.0)

    def _stdin_loop_stdio(self) -> None:
        """Optional dev harness: newline JSON on stdin (not used by TS bridge)."""
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                self.handle_command(json.loads(line))
            except Exception as e:
                _log.warning("stdin parse: %s", e)
            if self.stop_event.is_set():
                break

    def _run_websocket(self) -> None:
        if ws_serve is None:
            raise RuntimeError("websockets package is required for WebSocket transport")

        def handler(ws: Any) -> None:
            self._ws = ws
            try:
                self.emit_ready()
                for message in ws:
                    try:
                        data = json.loads(message)
                        self.handle_command(data)
                    except Exception as e:
                        _log.warning("ws message error: %s", e)
                        self.send({"type": "error", "message": str(e)})
            finally:
                self._ws = None

        _log.info("WebSocket screen agent listening on ws://%s:%s", self.host, self.port)
        with ws_serve(handler, self.host, self.port) as server:
            server.serve_forever()

    def run(self) -> None:
        self.startup()
        if self.transport == "stdio":
            # Stdio mode: ready + stdin only (no capture race on stdout; use websocket for live capture).
            self.emit_ready()
            self._stdin_loop_stdio()
            self.stop_event.set()
            return

        cap_t = threading.Thread(target=self._capture_loop, name="capture", daemon=True)
        cap_t.start()
        try:
            self._run_websocket()
        except KeyboardInterrupt:
            self.stop_event.set()
        finally:
            self.stop_event.set()


def main() -> None:
    transport = os.environ.get("SCREEN_AGENT_TRANSPORT", "stdio").strip().lower()
    if transport == "websocket":
        ScreenAgentProcess(transport="websocket").run()
    else:
        ScreenAgentProcess(transport="stdio").run()


if __name__ == "__main__":
    main()
