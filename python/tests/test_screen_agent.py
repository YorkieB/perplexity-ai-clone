"""Unit tests for python/screen_agent.py (Jarvis Screen Agent sidecar)."""

from __future__ import annotations

import io
import json
import sys
import threading
import time
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image

# Ensure `import screen_agent` resolves to ../screen_agent.py
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

import screen_agent as sa  # noqa: E402


class TestScreenCaptureCompare:
    def test_identical_images_zero(self) -> None:
        cap = sa.ScreenCapture()
        img = Image.new("RGB", (32, 32), color=(10, 20, 30))
        assert cap.compare(img, img) == 0.0

    def test_different_images_positive(self) -> None:
        cap = sa.ScreenCapture()
        a = Image.new("RGB", (32, 32), color=(0, 0, 0))
        b = Image.new("RGB", (32, 32), color=(255, 255, 255))
        assert cap.compare(a, b) > 0.0


class TestSignificanceDetector:
    def test_high_diff_significant(self) -> None:
        d = sa.SignificanceDetector(threshold=0.1)
        assert d.is_significant(0.5, {"window_title": "My App"}) is True

    def test_ignores_screen_agent_title(self) -> None:
        d = sa.SignificanceDetector(threshold=0.01)
        assert d.is_significant(0.99, {"window_title": "foo screen-agent bar"}) is False


class TestAdviseEngine:
    def test_rate_limit_skips_second_call(self) -> None:
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Keep going"))]
        )
        eng = sa.AdviseEngine(mock_client)
        img = Image.new("RGB", (8, 8), color=(1, 2, 3))
        with patch.object(sa.time, "monotonic", side_effect=[100.0, 101.0]):
            r1 = eng.analyze(img, "x", "win")
            r2 = eng.analyze(img, "x", "win")
        assert r1 is not None
        assert r2 is None
        assert mock_client.chat.completions.create.call_count == 1

    def test_returns_none_on_api_error(self) -> None:
        mock_client = MagicMock()
        mock_client.chat.completions.create.side_effect = RuntimeError("boom")
        eng = sa.AdviseEngine(mock_client)
        img = Image.new("RGB", (8, 8), color=(1, 2, 3))
        assert eng.analyze(img, "c", "w") is None

    def test_answer_question_calls_vision(self) -> None:
        mock_client = MagicMock()
        mock_client.chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="  I see a button.  "))]
        )
        eng = sa.AdviseEngine(mock_client)
        img = Image.new("RGB", (8, 8), color=(1, 2, 3))
        out = eng.answer_question(img, "What do you see?", "My Window")
        assert out == "I see a button."
        assert mock_client.chat.completions.create.call_count == 1

    def test_answer_question_empty_question_none(self) -> None:
        eng = sa.AdviseEngine(MagicMock())
        img = Image.new("RGB", (4, 4), color=(0, 0, 0))
        assert eng.answer_question(img, "   ", "w") is None


class TestActEngine:
    def test_goal_complete_when_complete(self) -> None:
        out: list[dict[str, Any]] = []

        def send_fn(m: dict[str, Any]) -> None:
            out.append(m)

        mock_client = MagicMock()

        class _Resp:
            choices = [MagicMock(message=MagicMock(content='{"isComplete": true, "reasoning": "done"}'))]

        mock_client.chat.completions.create.return_value = _Resp()

        eng = sa.ActEngine(mock_client)
        ev = threading.Event()
        with patch.object(sa, "ScreenCapture") as sc:
            sc.return_value.capture.return_value = Image.new("RGB", (16, 16), color=(0, 0, 0))
            with patch.object(sa, "pyautogui", MagicMock()):
                eng.execute_goal("test goal", send_fn, ev, lambda: (True, 0.0), max_steps=5)
        assert any(m.get("type") == "goal_complete" for m in out)

    def test_goal_failed_max_steps(self) -> None:
        out: list[dict[str, Any]] = []

        def send_fn(m: dict[str, Any]) -> None:
            out.append(m)

        mock_client = MagicMock()

        class _Resp:
            choices = [
                MagicMock(
                    message=MagicMock(
                        content=(
                            '{"type":"click","target_x":1,"target_y":2,'
                            '"reasoning":"r","needsApproval":false,"isComplete":false}'
                        )
                    )
                )
            ]

        mock_client.chat.completions.create.return_value = _Resp()

        eng = sa.ActEngine(mock_client)
        ev = threading.Event()
        with patch.object(sa, "ScreenCapture") as sc:
            sc.return_value.capture.return_value = Image.new("RGB", (16, 16), color=(0, 0, 0))
            with patch.object(sa, "pyautogui", MagicMock()):
                eng.execute_goal("goal", send_fn, ev, lambda: (True, 0.0), max_steps=3)
        failed = [m for m in out if m.get("type") == "goal_failed"]
        assert failed
        assert "Max steps" in (failed[-1].get("reason") or failed[-1].get("failureReason") or "")

    def test_stops_cleanly_on_stop_event(self) -> None:
        out: list[dict[str, Any]] = []

        def send_fn(m: dict[str, Any]) -> None:
            out.append(m)

        mock_client = MagicMock()

        class _Resp:
            choices = [
                MagicMock(
                    message=MagicMock(
                        content=(
                            '{"type":"click","target_x":1,"target_y":2,'
                            '"reasoning":"r","needsApproval":false,"isComplete":false}'
                        )
                    )
                )
            ]

        mock_client.chat.completions.create.return_value = _Resp()

        eng = sa.ActEngine(mock_client)
        ev = threading.Event()
        ev.set()

        with patch.object(sa, "ScreenCapture") as sc:
            sc.return_value.capture.return_value = Image.new("RGB", (16, 16), color=(0, 0, 0))
            eng.execute_goal("g", send_fn, ev, lambda: (True, 0.0), max_steps=5)
        assert not any(m.get("type") == "goal_complete" for m in out)


class TestScreenAgentProcess:
    def test_ready_on_startup_sequence(self) -> None:
        buf = io.StringIO()
        p = sa.ScreenAgentProcess(transport="stdio", out_stream=buf)
        p.startup()
        p.emit_ready()
        line = buf.getvalue().strip().splitlines()[-1]
        assert json.loads(line)["type"] == "ready"

    def test_set_mode_switches_mode(self) -> None:
        p = sa.ScreenAgentProcess(transport="stdio", out_stream=io.StringIO())
        p.handle_command({"command": "set_mode", "mode": "ADVISE"})
        assert p.mode == "ADVISE"

    def test_send_flushes_stdout(self) -> None:
        out = MagicMock(wraps=io.StringIO())
        p = sa.ScreenAgentProcess(transport="stdio", out_stream=out)
        p.send({"type": "ping"})
        out.write.assert_called()
        out.flush.assert_called()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
