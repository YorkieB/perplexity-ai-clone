"""
Jarvis PC Controller — comprehensive Windows automation module.

Integrates with screen_agent.py via Python bridge.
Handles mouse, keyboard, window management, file operations, and app launching.
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Literal, Optional, Union

_log = logging.getLogger("pc_controller")
if not _log.handlers:
    _h = logging.StreamHandler(sys.stderr)
    _h.setFormatter(logging.Formatter("[pc_controller] %(levelname)s: %(message)s"))
    _log.addHandler(_h)
_log.setLevel(logging.INFO)

# --- Optional dependencies ---
try:
    import pyautogui
except ImportError:
    pyautogui = None

if pyautogui is not None:
    pyautogui.FAILSAFE = True
    pyautogui.PAUSE = 0.1  # Reduced for responsiveness

try:
    import pygetwindow as gw
except ImportError:
    gw = None

try:
    import psutil
except ImportError:
    psutil = None


# --- Data Types ---

@dataclass
class MouseAction:
    """Mouse control action."""
    action: Literal["move", "click", "double_click", "drag", "scroll"]
    x: Optional[int] = None
    y: Optional[int] = None
    button: Literal["left", "right", "middle"] = "left"
    duration: Optional[float] = None
    amount: Optional[int] = None
    direction: Optional[Literal["up", "down"]] = None
    start_x: Optional[int] = None
    start_y: Optional[int] = None
    end_x: Optional[int] = None
    end_y: Optional[int] = None


@dataclass
class KeyboardAction:
    """Keyboard control action."""
    action: Literal["type", "press", "hotkey", "key_combo"]
    text: Optional[str] = None
    keys: Optional[list[str]] = None
    modifier: Optional[str] = None  # "ctrl", "alt", "shift"
    key: Optional[str] = None
    interval: float = 0.05  # Interval between keystrokes


@dataclass
class WindowAction:
    """Window management action."""
    action: Literal["get_all", "get_active", "focus", "maximize", "minimize", "close"]
    title: Optional[str] = None
    pattern: Optional[str] = None  # Regex pattern for title matching


@dataclass
class PCActionResult:
    """Result of a PC control action."""
    ok: bool
    data: Any = None
    error: Optional[str] = None
    message: Optional[str] = None


# --- Mouse Controller ---

class MouseController:
    """Handle mouse operations with safety checks."""

    def __init__(self):
        if pyautogui is None:
            raise RuntimeError("pyautogui not installed")
        self.failsafe_enabled = True

    def move(self, x: int, y: int, duration: float = 0.5) -> PCActionResult:
        """Move mouse to coordinates."""
        try:
            if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
                return PCActionResult(ok=False, error="Invalid coordinates")
            pyautogui.moveTo(int(x), int(y), duration=duration)
            _log.info(f"Mouse moved to ({x}, {y})")
            return PCActionResult(ok=True, message=f"Moved to ({x}, {y})")
        except Exception as e:
            _log.error(f"Mouse move failed: {e}")
            return PCActionResult(ok=False, error=str(e))

    def click(
        self,
        x: int,
        y: int,
        button: Literal["left", "right", "middle"] = "left",
        double: bool = False,
        duration: float = 0.1,
    ) -> PCActionResult:
        """Click at coordinates."""
        try:
            if double:
                pyautogui.click(int(x), int(y), button=button, clicks=2, interval=0.1)
                _log.info(f"Double-clicked at ({x}, {y}) with {button} button")
            else:
                pyautogui.click(int(x), int(y), button=button)
                _log.info(f"Clicked at ({x}, {y}) with {button} button")
            return PCActionResult(ok=True, message=f"Clicked at ({x}, {y})")
        except Exception as e:
            _log.error(f"Click failed: {e}")
            return PCActionResult(ok=False, error=str(e))

    def drag(
        self,
        start_x: int,
        start_y: int,
        end_x: int,
        end_y: int,
        duration: float = 1.0,
    ) -> PCActionResult:
        """Drag from start to end coordinates."""
        try:
            pyautogui.drag(int(end_x - start_x), int(end_y - start_y), duration=duration)
            _log.info(f"Dragged from ({start_x}, {start_y}) to ({end_x}, {end_y})")
            return PCActionResult(ok=True, message="Drag completed")
        except Exception as e:
            _log.error(f"Drag failed: {e}")
            return PCActionResult(ok=False, error=str(e))

    def scroll(
        self,
        x: int,
        y: int,
        direction: Literal["up", "down"] = "down",
        amount: int = 3,
    ) -> PCActionResult:
        """Scroll at coordinates."""
        try:
            pyautogui.moveTo(int(x), int(y))
            scroll_amount = -amount if direction == "up" else amount
            pyautogui.scroll(scroll_amount)
            _log.info(f"Scrolled {direction} by {amount} at ({x}, {y})")
            return PCActionResult(ok=True, message=f"Scrolled {direction}")
        except Exception as e:
            _log.error(f"Scroll failed: {e}")
            return PCActionResult(ok=False, error=str(e))

    def get_position(self) -> PCActionResult:
        """Get current mouse position."""
        try:
            x, y = pyautogui.position()
            return PCActionResult(ok=True, data={"x": x, "y": y})
        except Exception as e:
            return PCActionResult(ok=False, error=str(e))


# --- Keyboard Controller ---

class KeyboardController:
    """Handle keyboard operations."""

    def __init__(self):
        if pyautogui is None:
            raise RuntimeError("pyautogui not installed")

    def type_text(self, text: str, interval: float = 0.05) -> PCActionResult:
        """Type text with interval between characters."""
        try:
            # Safety check for system commands
            if self._is_dangerous_text(text):
                return PCActionResult(ok=False, error="Blocked: potentially dangerous input")
            pyautogui.typeString(str(text), interval=interval)
            _log.info(f"Typed text: {text[:50]}...")
            return PCActionResult(ok=True, message=f"Typed {len(text)} characters")
        except Exception as e:
            _log.error(f"Type failed: {e}")
            return PCActionResult(ok=False, error=str(e))

    def press_key(self, key: str) -> PCActionResult:
        """Press a single key."""
        try:
            valid_keys = [
                "enter", "return", "tab", "backspace", "delete", "esc", "escape",
                "space", "up", "down", "left", "right", "home", "end", "pageup", "pagedown",
                "f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10", "f11", "f12",
            ]
            key_lower = str(key).lower().strip()
            if key_lower not in valid_keys:
                return PCActionResult(ok=False, error=f"Unknown key: {key}")
            pyautogui.press(key_lower)
            _log.info(f"Pressed key: {key}")
            return PCActionResult(ok=True, message=f"Pressed {key}")
        except Exception as e:
            _log.error(f"Press key failed: {e}")
            return PCActionResult(ok=False, error=str(e))

    def hotkey(self, *keys: str) -> PCActionResult:
        """Press key combination (e.g., 'ctrl', 'c')."""
        try:
            if not keys or len(keys) < 2:
                return PCActionResult(ok=False, error="Hotkey requires at least 2 keys")
            pyautogui.hotkey(*[str(k).lower() for k in keys])
            combo = "+".join(str(k).upper() for k in keys)
            _log.info(f"Hotkey pressed: {combo}")
            return PCActionResult(ok=True, message=f"Hotkey: {combo}")
        except Exception as e:
            _log.error(f"Hotkey failed: {e}")
            return PCActionResult(ok=False, error=str(e))

    @staticmethod
    def _is_dangerous_text(text: str) -> bool:
        """Check if text contains dangerous patterns."""
        dangerous_patterns = [
            r"shutdown\s*/s",
            r"format\s+[a-z]:\\",
            r"del\s+/s",
            r"rm\s+-rf",
        ]
        text_lower = str(text).lower()
        return any(re.search(pat, text_lower) for pat in dangerous_patterns)


# --- Window Controller ---

class WindowController:
    """Handle window management operations."""

    def __init__(self):
        if gw is None:
            _log.warning("pygetwindow not installed — window ops limited")

    def get_all_windows(self) -> PCActionResult:
        """Get list of all windows."""
        try:
            if gw is None:
                return PCActionResult(ok=False, error="pygetwindow not installed")
            windows = gw.getWindowsWithTitle("")
            data = [
                {
                    "title": w.title,
                    "x": w.left,
                    "y": w.top,
                    "width": w.width,
                    "height": w.height,
                    "is_active": w.isActive,
                }
                for w in windows if w.title.strip()
            ]
            _log.info(f"Found {len(data)} windows")
            return PCActionResult(ok=True, data=data)
        except Exception as e:
            _log.error(f"Get windows failed: {e}")
            return PCActionResult(ok=False, error=str(e))

    def get_active_window(self) -> PCActionResult:
        """Get active window information."""
        try:
            if gw is None:
                return PCActionResult(ok=False, error="pygetwindow not installed")
            active = gw.getActiveWindow()
            if not active:
                return PCActionResult(ok=False, error="No active window")
            return PCActionResult(
                ok=True,
                data={
                    "title": active.title,
                    "x": active.left,
                    "y": active.top,
                    "width": active.width,
                    "height": active.height,
                },
            )
        except Exception as e:
            _log.error(f"Get active window failed: {e}")
            return PCActionResult(ok=False, error=str(e))

    def focus_window(self, title: str, pattern: Optional[str] = None) -> PCActionResult:
        """Focus/activate a window by title or pattern."""
        try:
            if gw is None:
                return PCActionResult(ok=False, error="pygetwindow not installed")
            
            # Find window by exact title or pattern
            search_term = pattern or title
            windows = gw.getWindowsWithTitle(search_term)
            
            if not windows:
                return PCActionResult(ok=False, error=f"Window not found: {search_term}")
            
            target = windows[0]
            target.activate()
            _log.info(f"Focused window: {target.title}")
            return PCActionResult(ok=True, message=f"Focused: {target.title}")
        except Exception as e:
            _log.error(f"Focus window failed: {e}")
            return PCActionResult(ok=False, error=str(e))

    def maximize_window(self, title: str) -> PCActionResult:
        """Maximize a window."""
        try:
            if gw is None:
                return PCActionResult(ok=False, error="pygetwindow not installed")
            windows = gw.getWindowsWithTitle(title)
            if not windows:
                return PCActionResult(ok=False, error=f"Window not found: {title}")
            windows[0].maximize()
            _log.info(f"Maximized: {title}")
            return PCActionResult(ok=True, message=f"Maximized: {title}")
        except Exception as e:
            _log.error(f"Maximize failed: {e}")
            return PCActionResult(ok=False, error=str(e))

    def minimize_window(self, title: str) -> PCActionResult:
        """Minimize a window."""
        try:
            if gw is None:
                return PCActionResult(ok=False, error="pygetwindow not installed")
            windows = gw.getWindowsWithTitle(title)
            if not windows:
                return PCActionResult(ok=False, error=f"Window not found: {title}")
            windows[0].minimize()
            _log.info(f"Minimized: {title}")
            return PCActionResult(ok=True, message=f"Minimized: {title}")
        except Exception as e:
            _log.error(f"Minimize failed: {e}")
            return PCActionResult(ok=False, error=str(e))

    def close_window(self, title: str) -> PCActionResult:
        """Close a window."""
        try:
            if gw is None:
                return PCActionResult(ok=False, error="pygetwindow not installed")
            windows = gw.getWindowsWithTitle(title)
            if not windows:
                return PCActionResult(ok=False, error=f"Window not found: {title}")
            windows[0].close()
            _log.info(f"Closed: {title}")
            return PCActionResult(ok=True, message=f"Closed: {title}")
        except Exception as e:
            _log.error(f"Close failed: {e}")
            return PCActionResult(ok=False, error=str(e))


# --- File System Controller ---

class FileSystemController:
    """Handle file system operations."""

    def __init__(self, base_path: Optional[str] = None):
        self.base_path = base_path or os.path.expanduser("~")

    def _safe_path(self, path: str) -> Optional[Path]:
        """Validate and resolve path safely."""
        try:
            resolved = Path(path).resolve()
            # Ensure path is within user's home directory (safety)
            user_home = Path.home()
            if not str(resolved).startswith(str(user_home)):
                _log.warning(f"Path access denied (outside home): {path}")
                return None
            return resolved
        except Exception:
            return None

    def exists(self, path: str) -> PCActionResult:
        """Check if file/directory exists."""
        safe_path = self._safe_path(path)
        if safe_path is None:
            return PCActionResult(ok=False, error="Invalid path")
        exists = safe_path.exists()
        return PCActionResult(ok=True, data={"exists": exists})

    def list_directory(self, path: str) -> PCActionResult:
        """List files in directory."""
        safe_path = self._safe_path(path)
        if safe_path is None:
            return PCActionResult(ok=False, error="Invalid path")
        if not safe_path.is_dir():
            return PCActionResult(ok=False, error="Not a directory")
        try:
            items = []
            for item in safe_path.iterdir():
                items.append({
                    "name": item.name,
                    "type": "dir" if item.is_dir() else "file",
                    "size": item.stat().st_size if item.is_file() else 0,
                })
            return PCActionResult(ok=True, data=items)
        except Exception as e:
            return PCActionResult(ok=False, error=str(e))

    def read_file(self, path: str) -> PCActionResult:
        """Read file contents."""
        safe_path = self._safe_path(path)
        if safe_path is None:
            return PCActionResult(ok=False, error="Invalid path")
        if not safe_path.is_file():
            return PCActionResult(ok=False, error="Not a file")
        try:
            content = safe_path.read_text(encoding="utf-8")
            return PCActionResult(ok=True, data={"content": content})
        except Exception as e:
            return PCActionResult(ok=False, error=str(e))

    def write_file(self, path: str, content: str, append: bool = False) -> PCActionResult:
        """Write file contents."""
        safe_path = self._safe_path(path)
        if safe_path is None:
            return PCActionResult(ok=False, error="Invalid path")
        try:
            if append:
                safe_path.write_text(safe_path.read_text(encoding="utf-8") + content)
            else:
                safe_path.write_text(content, encoding="utf-8")
            _log.info(f"File written: {safe_path}")
            return PCActionResult(ok=True, message=f"File written: {safe_path}")
        except Exception as e:
            return PCActionResult(ok=False, error=str(e))

    def delete_file(self, path: str) -> PCActionResult:
        """Delete a file."""
        safe_path = self._safe_path(path)
        if safe_path is None:
            return PCActionResult(ok=False, error="Invalid path")
        if not safe_path.is_file():
            return PCActionResult(ok=False, error="Not a file")
        try:
            safe_path.unlink()
            _log.info(f"File deleted: {path}")
            return PCActionResult(ok=True, message=f"Deleted: {path}")
        except Exception as e:
            return PCActionResult(ok=False, error=str(e))


# --- App Launcher ---

class AppLauncher:
    """Handle application launching."""

    COMMON_APPS = {
        "notepad": "notepad.exe",
        "chrome": "chrome.exe",
        "firefox": "firefox.exe",
        "edge": "msedge.exe",
        "outlook": "outlook.exe",
        "excel": "excel.exe",
        "word": "winword.exe",
        "powershell": "powershell.exe",
        "cmd": "cmd.exe",
        "explorer": "explorer.exe",
        "calc": "calc.exe",
        "vscode": "code.exe",
    }

    def launch_app(self, app_name: str, args: Optional[list[str]] = None) -> PCActionResult:
        """Launch application by name or path."""
        try:
            # Check if it's a common app
            if app_name.lower() in self.COMMON_APPS:
                app_path = self.COMMON_APPS[app_name.lower()]
            else:
                app_path = app_name

            cmd = [app_path]
            if args:
                cmd.extend(args)

            subprocess.Popen(cmd, start_new_session=True)
            _log.info(f"Launched app: {app_name}")
            return PCActionResult(ok=True, message=f"Launched: {app_name}")
        except Exception as e:
            _log.error(f"Launch app failed: {e}")
            return PCActionResult(ok=False, error=str(e))

    def list_running_apps(self) -> PCActionResult:
        """List running applications."""
        try:
            if psutil is None:
                return PCActionResult(ok=False, error="psutil not installed")
            apps = []
            for proc in psutil.process_iter(["pid", "name"]):
                try:
                    pinfo = proc.as_dict(attrs=["pid", "name"])
                    apps.append(pinfo)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            return PCActionResult(ok=True, data=apps)
        except Exception as e:
            return PCActionResult(ok=False, error=str(e))


# --- Main PC Controller ---

class PCController:
    """Master PC control orchestrator."""

    def __init__(self):
        self.mouse = MouseController()
        self.keyboard = KeyboardController()
        self.window = WindowController()
        self.filesystem = FileSystemController()
        self.launcher = AppLauncher()

    def handle_action(self, action_dict: dict[str, Any]) -> dict[str, Any]:
        """Route and handle a PC control action."""
        action_type = action_dict.get("type")

        try:
            if action_type == "mouse":
                return self._handle_mouse(action_dict)
            elif action_type == "keyboard":
                return self._handle_keyboard(action_dict)
            elif action_type == "window":
                return self._handle_window(action_dict)
            elif action_type == "file":
                return self._handle_file(action_dict)
            elif action_type == "app":
                return self._handle_app(action_dict)
            else:
                return {"ok": False, "error": f"Unknown action type: {action_type}"}
        except Exception as e:
            _log.error(f"Action handler error: {e}")
            return {"ok": False, "error": str(e)}

    def _handle_mouse(self, action: dict[str, Any]) -> dict[str, Any]:
        """Route mouse actions."""
        op = action.get("operation")
        result = None

        if op == "move":
            result = self.mouse.move(action.get("x"), action.get("y"), action.get("duration", 0.5))
        elif op == "click":
            result = self.mouse.click(
                action.get("x"),
                action.get("y"),
                button=action.get("button", "left"),
                double=action.get("double", False),
            )
        elif op == "drag":
            result = self.mouse.drag(
                action.get("start_x"),
                action.get("start_y"),
                action.get("end_x"),
                action.get("end_y"),
                action.get("duration", 1.0),
            )
        elif op == "scroll":
            result = self.mouse.scroll(
                action.get("x"),
                action.get("y"),
                direction=action.get("direction", "down"),
                amount=action.get("amount", 3),
            )
        elif op == "position":
            result = self.mouse.get_position()
        else:
            return {"ok": False, "error": f"Unknown mouse operation: {op}"}

        return {"ok": result.ok, "data": result.data, "error": result.error, "message": result.message}

    def _handle_keyboard(self, action: dict[str, Any]) -> dict[str, Any]:
        """Route keyboard actions."""
        op = action.get("operation")
        result = None

        if op == "type":
            result = self.keyboard.type_text(action.get("text", ""), action.get("interval", 0.05))
        elif op == "press":
            result = self.keyboard.press_key(action.get("key", ""))
        elif op == "hotkey":
            keys = action.get("keys", [])
            result = self.keyboard.hotkey(*keys)
        else:
            return {"ok": False, "error": f"Unknown keyboard operation: {op}"}

        return {"ok": result.ok, "error": result.error, "message": result.message}

    def _handle_window(self, action: dict[str, Any]) -> dict[str, Any]:
        """Route window actions."""
        op = action.get("operation")
        result = None

        if op == "get_all":
            result = self.window.get_all_windows()
        elif op == "get_active":
            result = self.window.get_active_window()
        elif op == "focus":
            result = self.window.focus_window(action.get("title", ""), action.get("pattern"))
        elif op == "maximize":
            result = self.window.maximize_window(action.get("title", ""))
        elif op == "minimize":
            result = self.window.minimize_window(action.get("title", ""))
        elif op == "close":
            result = self.window.close_window(action.get("title", ""))
        else:
            return {"ok": False, "error": f"Unknown window operation: {op}"}

        return {"ok": result.ok, "data": result.data, "error": result.error, "message": result.message}

    def _handle_file(self, action: dict[str, Any]) -> dict[str, Any]:
        """Route file operations."""
        op = action.get("operation")
        result = None

        if op == "exists":
            result = self.filesystem.exists(action.get("path", ""))
        elif op == "list":
            result = self.filesystem.list_directory(action.get("path", ""))
        elif op == "read":
            result = self.filesystem.read_file(action.get("path", ""))
        elif op == "write":
            result = self.filesystem.write_file(
                action.get("path", ""),
                action.get("content", ""),
                action.get("append", False),
            )
        elif op == "delete":
            result = self.filesystem.delete_file(action.get("path", ""))
        else:
            return {"ok": False, "error": f"Unknown file operation: {op}"}

        return {"ok": result.ok, "data": result.data, "error": result.error, "message": result.message}

    def _handle_app(self, action: dict[str, Any]) -> dict[str, Any]:
        """Route app operations."""
        op = action.get("operation")
        result = None

        if op == "launch":
            result = self.launcher.launch_app(action.get("app", ""), action.get("args"))
        elif op == "list":
            result = self.launcher.list_running_apps()
        else:
            return {"ok": False, "error": f"Unknown app operation: {op}"}

        return {"ok": result.ok, "data": result.data, "error": result.error, "message": result.message}


# --- Testing & Utilities ---

def example_usage():
    """Example of using the PC controller."""
    controller = PCController()

    # Example 1: Mouse click
    result = controller.handle_action({
        "type": "mouse",
        "operation": "click",
        "x": 100,
        "y": 200,
    })
    print(f"Click result: {result}")

    # Example 2: Type text
    result = controller.handle_action({
        "type": "keyboard",
        "operation": "type",
        "text": "Hello, World!",
    })
    print(f"Type result: {result}")

    # Example 3: Get windows
    result = controller.handle_action({
        "type": "window",
        "operation": "get_all",
    })
    print(f"Windows result: {result}")

    # Example 4: Launch app
    result = controller.handle_action({
        "type": "app",
        "operation": "launch",
        "app": "notepad",
    })
    print(f"Launch result: {result}")


if __name__ == "__main__":
    print("PC Controller module loaded. Use in screen_agent.py")
