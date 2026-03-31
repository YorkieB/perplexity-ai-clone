/**
 * Jarvis desktop automation: screen vision IPC, native input (optional robotjs + Win PS fallback),
 * clipboard, PowerShell one-shot exec. See docs in repo skill jarvis-desktop-automation.
 */

const { ipcMain, desktopCapturer, screen, clipboard, session } = require('electron')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const os = require('node:os')

const execFileAsync = promisify(execFile)

/** Optional native automation (build from source if missing). */
let robot = null
try {
  robot = require('robotjs')
} catch {
  robot = null
}

const FORBIDDEN_PS = [
  /shutdown/i,
  /restart-computer/i,
  /stop-computer/i,
  /\blogoff\b/i,
  /format\s+[a-z]:\\/i,
]

function validatePowerShellCommand(cmd) {
  if (!cmd || typeof cmd !== 'string') return { safe: false, reason: 'Empty command' }
  for (const p of FORBIDDEN_PS) {
    if (p.test(cmd)) return { safe: false, reason: `Blocked by safety policy (${p.source})` }
  }
  return { safe: true }
}

function isForbiddenNativeType(text) {
  const lower = String(text || '').toLowerCase()
  return ['shutdown', 'restart', 'logoff', 'stop-computer'].some((k) => lower.includes(k))
}

/** Run inline PowerShell (Windows). */
async function runPs(script) {
  return execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { maxBuffer: 10 * 1024 * 1024, windowsHide: true, timeout: 120_000 }
  )
}

function registerScreenVisionIpc() {
  try {
    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => {
          if (!sources.length) {
            callback({})
            return
          }
          callback({ video: sources[0], audio: 'loopback' })
        })
        .catch(() => callback({}))
    }, { useSystemPicker: false })
  } catch (e) {
    console.warn('[jarvis-desktop-automation] setDisplayMediaRequestHandler:', e instanceof Error ? e.message : e)
  }

  ipcMain.handle('jarvis-screen-sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true,
    })
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon ? s.appIcon.toDataURL() : null,
    }))
  })
}

function registerPowerShellExecIpc() {
  ipcMain.handle('jarvis-powershell-exec', async (_e, opts) => {
    const command = opts?.command
    const cwd = typeof opts?.cwd === 'string' ? opts.cwd : os.homedir()
    if (!command || typeof command !== 'string') {
      return { ok: false, error: 'Missing command' }
    }
    const v = validatePowerShellCommand(command)
    if (!v.safe) return { ok: false, error: v.reason || 'Blocked' }
    const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.PSHELL || 'pwsh')
    const args = ['-NoProfile', '-NonInteractive', '-Command', command]
    try {
      const { stdout, stderr } = await execFileAsync(shell, args, {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
        windowsHide: true,
        timeout: 120_000,
      })
      return { ok: true, stdout: stdout || '', stderr: stderr || '' }
    } catch (e) {
      const err = /** @type {NodeJS.ErrnoException & { stdout?: Buffer; stderr?: Buffer }} */ (e)
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(e),
        stdout: err.stdout ? err.stdout.toString('utf8') : '',
        stderr: err.stderr ? err.stderr.toString('utf8') : '',
      }
    }
  })
}

function registerNativeInputIpc() {
  ipcMain.handle('jarvis-native-mouse-move', async (_e, { x, y }) => {
    if (typeof x !== 'number' || typeof y !== 'number') return { ok: false, error: 'Invalid coordinates' }
    if (robot) {
      robot.moveMouse(x, y)
      return { ok: true }
    }
    if (process.platform === 'win32') {
      const ps = `Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public class J{[DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);}
'@; [J]::SetCursorPos(${Math.round(x)},${Math.round(y)})`
      await runPs(ps)
      return { ok: true }
    }
    return { ok: false, error: 'Native mouse requires Windows desktop app with robotjs optional dependency installed.' }
  })

  ipcMain.handle('jarvis-native-mouse-click', async (_e, opts) => {
    const x = opts?.x
    const y = opts?.y
    const button = opts?.button === 'right' ? 'right' : 'left'
    const doubleClick = Boolean(opts?.doubleClick)
    if (robot) {
      if (typeof x === 'number' && typeof y === 'number') robot.moveMouse(x, y)
      robot.mouseClick(button, doubleClick)
      return { ok: true }
    }
    if (process.platform === 'win32') {
      if (typeof x === 'number' && typeof y === 'number') {
        const psMove = `Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public class J{[DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);}
'@; [J]::SetCursorPos(${Math.round(x)},${Math.round(y)})`
        await runPs(psMove)
      }
      const down = button === 'right' ? '0x0008' : '0x0002'
      const up = button === 'right' ? '0x0010' : '0x0004'
      const n = doubleClick ? 2 : 1
      for (let i = 0; i < n; i++) {
        const ps = `Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public class M{[DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,System.UIntPtr e);}
'@; [M]::mouse_event(${down},0,0,0,[System.UIntPtr]::Zero); [M]::mouse_event(${up},0,0,0,[System.UIntPtr]::Zero)`
        await runPs(ps)
      }
      return { ok: true }
    }
    return { ok: false, error: 'Native mouse not available' }
  })

  ipcMain.handle('jarvis-native-mouse-scroll', async (_e, opts) => {
    const amount = Math.min(50, Math.max(1, Math.abs(Number(opts?.amount) || 3)))
    const direction = opts?.direction === 'up' ? 'up' : 'down'
    if (robot) {
      robot.scrollMouse(0, direction === 'up' ? amount : -amount)
      return { ok: true }
    }
    return { ok: false, error: 'Scroll requires robotjs on Windows' }
  })

  ipcMain.handle('jarvis-native-mouse-drag', async (_e, opts) => {
    const { startX, startY, endX, endY } = opts || {}
    if (![startX, startY, endX, endY].every((n) => typeof n === 'number')) {
      return { ok: false, error: 'Invalid drag coordinates' }
    }
    if (robot) {
      robot.moveMouse(startX, startY)
      robot.mouseToggle('down', 'left')
      robot.dragMouse(endX, endY)
      robot.mouseToggle('up', 'left')
      return { ok: true }
    }
    return { ok: false, error: 'Drag requires robotjs' }
  })

  ipcMain.handle('jarvis-native-keyboard-type', async (_e, { text }) => {
    if (typeof text !== 'string') return { ok: false, error: 'Missing text' }
    if (isForbiddenNativeType(text)) return { ok: false, error: 'Forbidden' }
    if (robot) {
      robot.typeString(text)
      return { ok: true }
    }
    if (process.platform === 'win32') {
      const escaped = text.replace(/'/g, "''")
      await runPs(`Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')`)
      return { ok: true }
    }
    return { ok: false, error: 'Keyboard type not available' }
  })

  ipcMain.handle('jarvis-native-keyboard-press', async (_e, { keys }) => {
    if (!Array.isArray(keys) || !keys.length) return { ok: false, error: 'Missing keys' }
    if (robot) {
      for (let i = 0; i < keys.length; i++) {
        robot.keyToggle(keys[i], 'down')
      }
      for (let i = keys.length - 1; i >= 0; i--) {
        robot.keyToggle(keys[i], 'up')
      }
      return { ok: true }
    }
    return { ok: false, error: 'key press requires robotjs' }
  })

  ipcMain.handle('jarvis-native-keyboard-hotkey', async (_e, { combo }) => {
    if (typeof combo !== 'string' || !combo.trim()) return { ok: false, error: 'Missing combo' }
    if (robot) {
      const parts = combo.split('+').map((s) => s.trim().toLowerCase())
      const key = parts.pop()
      if (!key) return { ok: false, error: 'Invalid combo' }
      robot.keyTap(key, parts.length ? parts : undefined)
      return { ok: true }
    }
    return { ok: false, error: 'Hotkey requires robotjs' }
  })

  ipcMain.handle('jarvis-native-screen-size', async () => {
    const { width, height } = screen.getPrimaryDisplay().size
    return { width, height }
  })

  ipcMain.handle('jarvis-native-screen-capture', async (_e, opts) => {
    const region = opts?.region
    const primary = screen.getPrimaryDisplay()
    const tw = Math.min(primary.size.width, 1920)
    const th = Math.min(primary.size.height, 1080)
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: tw, height: th },
    })
    if (!sources.length) return { ok: false, error: 'No screen source' }
    const img = sources[0].thumbnail
    let out = img
    if (region && Number(region.width) > 0 && Number(region.height) > 0) {
      const left = Number(region.left ?? region.x ?? 0)
      const top = Number(region.top ?? region.y ?? 0)
      const { width: iw, height: ih } = img.getSize()
      const crop = {
        x: Math.max(0, Math.floor(left)),
        y: Math.max(0, Math.floor(top)),
        width: Math.min(iw - left, Math.floor(Number(region.width))),
        height: Math.min(ih - top, Math.floor(Number(region.height))),
      }
      if (crop.width > 0 && crop.height > 0) {
        out = img.crop(crop)
      }
    }
    return {
      ok: true,
      data: out.toPNG().toString('base64'),
      width: out.getSize().width,
      height: out.getSize().height,
    }
  })

  ipcMain.handle('jarvis-native-clipboard-read', async () => {
    try {
      const text = clipboard.readText()
      return { ok: true, text }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('jarvis-native-clipboard-write', async (_e, { text }) => {
    if (typeof text !== 'string') return { ok: false, error: 'Missing text' }
    try {
      clipboard.writeText(text)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('jarvis-native-window-list', async () => {
    if (process.platform !== 'win32') return []
    try {
      const { stdout } = await runPs(
        `Get-Process | Where-Object { $_.MainWindowTitle -ne '' } | ForEach-Object { $_.MainWindowTitle }`
      )
      const titles = stdout.split(/\r?\n/).map((t) => t.trim()).filter(Boolean)
      return titles.map((title) => ({ title, x: 0, y: 0, width: 0, height: 0 }))
    } catch {
      return []
    }
  })

  ipcMain.handle('jarvis-native-window-focus', async (_e, { title }) => {
    if (typeof title !== 'string' || !title.trim()) return { ok: false, error: 'Missing title' }
    if (process.platform !== 'win32') return { ok: false, error: 'Windows only' }
    try {
      const safe = title.replace(/'/g, "''")
      await runPs(
        `Add-Type -AssemblyName Microsoft.VisualBasic; [void][Microsoft.VisualBasic.Interaction]::AppActivate('${safe}')`
      )
      return { ok: true, title }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('jarvis-native-active-window', async () => {
    if (process.platform !== 'win32') {
      return { title: '', x: 0, y: 0, width: 0, height: 0 }
    }
    try {
      const { stdout } = await runPs(
        `(Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;using System.Text;
public class W{
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int m);
public static string T(){var b=new StringBuilder(512);GetWindowText(GetForegroundWindow(),b,512);return b.ToString();}
}'@); [W]::T()`
      )
      const t = stdout.trim()
      return { title: t, x: 0, y: 0, width: 0, height: 0 }
    } catch {
      return { title: '', x: 0, y: 0, width: 0, height: 0 }
    }
  })
}

module.exports = {
  registerScreenVisionIpc,
  registerNativeInputIpc,
  registerPowerShellExecIpc,
  validatePowerShellCommand,
}
