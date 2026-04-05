/**
 * Shared execution for native OS + PowerShell tools (text chat + voice Realtime).
 */

import { getJarvisNative } from '@/lib/jarvis-native-bridge'
import { validatePowerShellCommand, validateNativeClick, validateNativeToolPre } from '@/lib/desktop-automation-guard'

type DesktopToolHandler = (
  args: Record<string, unknown>,
  onStatus?: (status: string) => void,
) => Promise<string>

type JarvisIdeBridge = {
  terminalCreate: (opts: { cwd?: string }) => Promise<{ id: number; cwd: string }>
  terminalWrite: (opts: { id: number; data: string }) => Promise<{ ok: boolean; error?: string }>
}

function getIdeBridge(): JarvisIdeBridge | undefined {
  return globalThis.window?.jarvisIde
}

function getClickCoordinateLabel(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : 'current'
}

function formatPowerShellOutput(r: {
  stdout?: string
  stderr?: string
}): string {
  const stdout = r.stdout ?? ''
  const stderrBlock = r.stderr ? `\nstderr:\n${r.stderr}` : ''
  return `stdout:\n${stdout}${stderrBlock}`
}

const handleNativeMouseClick: DesktopToolHandler = async (args, onStatus) => {
  const jn = getJarvisNative()
  if (!jn) return 'Native desktop control requires the Jarvis desktop app (npm run desktop).'
  onStatus?.('Native mouse click…')
  const size = await jn.screenSize()
  const pre = validateNativeToolPre('native_mouse_click', args, size.width, size.height)
  if (!pre.ok) return pre.reason

  const x = args.x as number | undefined
  const y = args.y as number | undefined
  const button = args.button === 'right' ? 'right' : 'left'
  const doubleClick = Boolean(args.doubleClick)
  if (typeof x === 'number' && typeof y === 'number') {
    const v = validateNativeClick(x, y, size.width, size.height)
    if (!v.valid) return v.reason ?? 'Invalid coordinates'
  }

  const r = await jn.mouseClick({ x, y, button, doubleClick })
  if (!r.ok) return `Failed: ${r.error ?? 'unknown'}`
  return `Clicked (${getClickCoordinateLabel(x)}, ${getClickCoordinateLabel(y)}).`
}

const handleNativeKeyboardType: DesktopToolHandler = async (args, onStatus) => {
  const jn = getJarvisNative()
  if (!jn) return 'Native desktop control requires the Jarvis desktop app.'
  const size = await jn.screenSize()
  const pre = validateNativeToolPre('native_keyboard_type', args, size.width, size.height)
  if (!pre.ok) return pre.reason
  const text = args.text as string
  if (!text) return 'Missing text.'
  onStatus?.('Typing (native)…')
  const r = await jn.keyboardType({ text })
  return r.ok ? 'Typed text via native keyboard.' : `Failed: ${r.error ?? 'unknown'}`
}

const handleNativeKeyboardHotkey: DesktopToolHandler = async (args, onStatus) => {
  const jn = getJarvisNative()
  if (!jn) return 'Native desktop control requires the Jarvis desktop app.'
  const size = await jn.screenSize()
  const pre = validateNativeToolPre('native_keyboard_hotkey', args, size.width, size.height)
  if (!pre.ok) return pre.reason
  const combo = args.combo as string
  if (!combo?.trim()) return 'Missing combo.'
  onStatus?.(`Hotkey ${combo}…`)
  const r = await jn.keyboardHotkey({ combo: combo.trim() })
  return r.ok ? `Sent hotkey: ${combo}` : `Failed: ${r.error ?? 'unknown'}`
}

const handleNativeWindowFocus: DesktopToolHandler = async (args) => {
  const jn = getJarvisNative()
  if (!jn) return 'Native desktop control requires the Jarvis desktop app.'
  const size = await jn.screenSize()
  const pre = validateNativeToolPre('native_window_focus', args, size.width, size.height)
  if (!pre.ok) return pre.reason
  const title = args.title as string
  if (!title?.trim()) return 'Missing title.'
  const r = await jn.windowFocus({ title: title.trim() })
  return r.ok ? `Focused window matching "${title}".` : `Failed: ${r.error ?? 'unknown'}`
}

const handleNativeWindowList: DesktopToolHandler = async () => {
  const jn = getJarvisNative()
  if (!jn) return 'Native desktop control requires the Jarvis desktop app.'
  const list = await jn.windowList()
  if (!list.length) return 'No windows returned (or list unavailable).'
  return list.map((w) => `- ${w.title}`).join('\n')
}

const handleNativeScreenCapture: DesktopToolHandler = async (args, onStatus) => {
  const jn = getJarvisNative()
  if (!jn) return 'Native desktop control requires the Jarvis desktop app.'
  const size = await jn.screenSize()
  const pre = validateNativeToolPre('native_screen_capture', args, size.width, size.height)
  if (!pre.ok) return pre.reason
  onStatus?.('Capturing screen…')
  const region = args.region as
    | { left?: number; top?: number; width?: number; height?: number }
    | undefined
  const r = await jn.screenCapture({ region })
  if (!r.ok) return `Capture failed: ${r.error ?? 'unknown'}`
  const data = r.data ?? ''
  const preview = data.length > 12_000 ? `${data.slice(0, 12_000)}… (truncated)` : data
  return `PNG ${r.width}x${r.height} (base64):\n${preview}`
}

const handleNativeClipboardRead: DesktopToolHandler = async () => {
  const jn = getJarvisNative()
  if (!jn) return 'Native desktop control requires the Jarvis desktop app.'
  const r = await jn.clipboardRead()
  if (!r.ok) return `Clipboard read failed: ${r.error ?? 'unknown'}`
  const t = r.text ?? ''
  return t === '' ? '(clipboard empty)' : t
}

const handleNativeClipboardWrite: DesktopToolHandler = async (args) => {
  const jn = getJarvisNative()
  if (!jn) return 'Native desktop control requires the Jarvis desktop app.'
  const size = await jn.screenSize()
  const pre = validateNativeToolPre('native_clipboard_write', args, size.width, size.height)
  if (!pre.ok) return pre.reason
  const text = args.text as string
  if (typeof text !== 'string') return 'Missing text.'
  const r = await jn.clipboardWrite({ text })
  return r.ok ? 'Copied text to clipboard.' : `Failed: ${r.error ?? 'unknown'}`
}

const handlePowerShellExecute: DesktopToolHandler = async (args, onStatus) => {
  const jn = getJarvisNative()
  if (!jn) return 'PowerShell execution requires the Jarvis desktop app.'
  const size = await jn.screenSize()
  const pre = validateNativeToolPre('powershell_execute', args, size.width, size.height)
  if (!pre.ok) return pre.reason
  const cmd = args.command as string
  if (!cmd?.trim()) return 'Missing command.'
  const v = validatePowerShellCommand(cmd)
  if (!v.safe) return v.reason ?? 'Blocked by safety policy.'
  onStatus?.('Running PowerShell…')
  const r = await jn.powershellExec({
    command: cmd,
    cwd: typeof args.cwd === 'string' ? args.cwd : undefined,
  })
  if (!r.ok) {
    return `Exit/error: ${r.error ?? 'unknown'}\nstdout:\n${r.stdout ?? ''}\nstderr:\n${r.stderr ?? ''}`
  }
  return formatPowerShellOutput(r)
}

const handlePowerShellSessionCreate: DesktopToolHandler = async (args, onStatus) => {
  const ide = getIdeBridge()
  if (!ide) return 'Persistent terminal requires the Jarvis desktop app.'
  const jn = getJarvisNative()
  const size = jn ? await jn.screenSize() : { width: 1920, height: 1080 }
  const pre = validateNativeToolPre('powershell_session_create', args, size.width, size.height)
  if (!pre.ok) return pre.reason
  onStatus?.('Creating PowerShell session…')
  const cwd = typeof args.cwd === 'string' ? args.cwd.trim() : undefined
  const r = await ide.terminalCreate({ cwd })
  return `Created PowerShell session id=${String(r.id)} cwd=${r.cwd}. Use powershell_session_write to send commands; output appears in the IDE terminal panel.`
}

const handlePowerShellSessionWrite: DesktopToolHandler = async (args) => {
  const ide = getIdeBridge()
  if (!ide) return 'Persistent terminal requires the Jarvis desktop app.'
  const jn = getJarvisNative()
  const size = jn ? await jn.screenSize() : { width: 1920, height: 1080 }
  const pre = validateNativeToolPre('powershell_session_write', args, size.width, size.height)
  if (!pre.ok) return pre.reason
  const sessionIdRaw = args.session_id
  const sessionId = typeof sessionIdRaw === 'number' ? sessionIdRaw : Number.NaN
  const cmd = args.command as string
  if (!Number.isFinite(sessionId) || !Number.isInteger(sessionId) || sessionId <= 0 || !cmd?.trim()) {
    return 'Missing session_id or command.'
  }
  const v = validatePowerShellCommand(cmd)
  if (!v.safe) return v.reason ?? 'Blocked.'
  const line = cmd.endsWith('\n') ? cmd : `${cmd}\n`
  const w = await ide.terminalWrite({ id: sessionId, data: line })
  return w.ok ? `Sent to session ${String(sessionId)}. Check the IDE terminal for output.` : `Failed: ${w.error ?? 'unknown'}`
}

const TOOL_HANDLERS: Record<string, DesktopToolHandler> = {
  native_mouse_click: handleNativeMouseClick,
  native_keyboard_type: handleNativeKeyboardType,
  native_keyboard_hotkey: handleNativeKeyboardHotkey,
  native_window_focus: handleNativeWindowFocus,
  native_window_list: handleNativeWindowList,
  native_screen_capture: handleNativeScreenCapture,
  native_clipboard_read: handleNativeClipboardRead,
  native_clipboard_write: handleNativeClipboardWrite,
  powershell_execute: handlePowerShellExecute,
  powershell_session_create: handlePowerShellSessionCreate,
  powershell_session_write: handlePowerShellSessionWrite,
}

export async function runDesktopAutomationTool(
  name: string,
  args: Record<string, unknown>,
  onStatus?: (status: string) => void,
): Promise<string> {
  const handler = TOOL_HANDLERS[name]
  if (!handler) return `Unknown desktop automation tool: ${name}`
  return handler(args, onStatus)
}

/** OpenAI Realtime `tools[]` uses flat `name`/`description`/`parameters`; Chat Completions uses nested `function`. */
export function desktopAutomationChatSpecToRealtime(spec: Record<string, unknown>): Record<string, unknown> {
  const fn = spec.function as { name: string; description: string; parameters: Record<string, unknown> }
  return {
    type: 'function',
    name: fn.name,
    description: fn.description,
    parameters: fn.parameters,
  }
}
