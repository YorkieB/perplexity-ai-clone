/**
 * Safety checks for desktop automation tools (renderer + shared logic).
 * Align patterns with `validatePowerShellCommand` in `electron/jarvis-desktop-automation.cjs`.
 */

const FORBIDDEN_PS: RegExp[] = [
  /shutdown/i,
  /restart-computer/i,
  /stop-computer/i,
  /\blogoff\b/i,
  /format\s+[a-z]:\\/i,
]

export function validatePowerShellCommand(cmd: string): { safe: boolean; reason?: string } {
  if (!cmd?.trim()) return { safe: false, reason: 'Empty command' }
  for (const p of FORBIDDEN_PS) {
    if (p.test(cmd)) return { safe: false, reason: `Blocked: matches ${p.source}` }
  }
  return { safe: true }
}

export function validateNativeClick(x: number, y: number, screenW: number, screenH: number): { valid: boolean; reason?: string } {
  if (x < 0 || y < 0 || x > screenW || y > screenH) {
    return { valid: false, reason: `Coordinates (${x}, ${y}) outside screen ${screenW}x${screenH}` }
  }
  return { valid: true }
}

const MAX_TYPE_CHARS = 12_000
const MAX_CLIPBOARD_WRITE = 500_000
const MAX_POWERSHELL_COMMAND_CHARS = 20_000
const MAX_POWERSHELL_CWD_CHARS = 1_024
const DANGEROUS_HOTKEY = /(\^|\b)alt\+f4\b|\bwin\+l\b/i

type ToolValidationResult = { ok: true } | { ok: false; reason: string }
type ToolPreValidator = (
  args: Record<string, unknown>,
  screenW: number,
  screenH: number,
) => ToolValidationResult

function validateOptionalCwd(cwd: unknown): { valid: boolean; reason?: string } {
  if (cwd === undefined) return { valid: true }
  if (typeof cwd !== 'string') return { valid: false, reason: 'Invalid cwd type' }
  const trimmed = cwd.trim()
  if (!trimmed) return { valid: false, reason: 'Empty cwd' }
  if (trimmed.length > MAX_POWERSHELL_CWD_CHARS) return { valid: false, reason: 'cwd too long' }
  if (trimmed.includes('\u0000')) return { valid: false, reason: 'cwd contains null bytes' }
  return { valid: true }
}

function validatePowerShellCommandArg(args: Record<string, unknown>): ToolValidationResult {
  const cmd = args.command
  if (typeof cmd !== 'string' || !cmd.trim()) return { ok: false, reason: 'Missing command' }
  if (cmd.length > MAX_POWERSHELL_COMMAND_CHARS) return { ok: false, reason: 'Command too long' }
  const v = validatePowerShellCommand(cmd)
  if (!v.safe) return { ok: false, reason: v.reason ?? 'Blocked command' }
  return { ok: true }
}

function validateMouseClickPre(
  args: Record<string, unknown>,
  screenW: number,
  screenH: number,
): ToolValidationResult {
  const x = args.x
  const y = args.y
  if (typeof x === 'number' && typeof y === 'number') {
    const v = validateNativeClick(x, y, screenW, screenH)
    if (!v.valid) return { ok: false, reason: v.reason ?? 'Bad coordinates' }
  }
  return { ok: true }
}

function validateKeyboardTypePre(args: Record<string, unknown>): ToolValidationResult {
  const text = args.text
  if (typeof text !== 'string' || !text.length) return { ok: false, reason: 'Missing text' }
  if (text.length > MAX_TYPE_CHARS) return { ok: false, reason: 'Text too long' }
  return { ok: true }
}

function validateKeyboardHotkeyPre(args: Record<string, unknown>): ToolValidationResult {
  const combo = args.combo
  if (typeof combo !== 'string' || !combo.trim()) return { ok: false, reason: 'Missing combo' }
  if (DANGEROUS_HOTKEY.test(combo)) return { ok: false, reason: 'Blocked hotkey pattern' }
  return { ok: true }
}

function validateWindowFocusPre(args: Record<string, unknown>): ToolValidationResult {
  const title = args.title
  if (typeof title !== 'string' || !title.trim()) return { ok: false, reason: 'Missing title' }
  if (title.length > 500) return { ok: false, reason: 'Title too long' }
  return { ok: true }
}

function validateScreenCapturePre(
  args: Record<string, unknown>,
  screenW: number,
  screenH: number,
): ToolValidationResult {
  const region = args.region as { left?: number; top?: number; width?: number; height?: number } | undefined
  const v = validateScreenRegion(region, screenW, screenH)
  return v.valid ? { ok: true } : { ok: false, reason: v.reason ?? 'Bad region' }
}

function validateClipboardWritePre(args: Record<string, unknown>): ToolValidationResult {
  const text = args.text
  if (typeof text !== 'string') return { ok: false, reason: 'Missing text' }
  if (text.length > MAX_CLIPBOARD_WRITE) return { ok: false, reason: 'Clipboard payload too large' }
  return { ok: true }
}

function validatePowerShellExecutePre(args: Record<string, unknown>): ToolValidationResult {
  const cmdValidation = validatePowerShellCommandArg(args)
  if (!cmdValidation.ok) return cmdValidation
  const cwdValidation = validateOptionalCwd(args.cwd)
  if (!cwdValidation.valid) return { ok: false, reason: cwdValidation.reason ?? 'Invalid cwd' }
  return { ok: true }
}

function validatePowerShellSessionWritePre(args: Record<string, unknown>): ToolValidationResult {
  const cmdValidation = validatePowerShellCommandArg(args)
  if (!cmdValidation.ok) return cmdValidation
  const sessionId = args.session_id
  if (typeof sessionId !== 'number' || !Number.isFinite(sessionId) || !Number.isInteger(sessionId) || sessionId <= 0) {
    return { ok: false, reason: 'Invalid session_id' }
  }
  return { ok: true }
}

function validatePowerShellSessionCreatePre(args: Record<string, unknown>): ToolValidationResult {
  const cwdValidation = validateOptionalCwd(args.cwd)
  return cwdValidation.valid ? { ok: true } : { ok: false, reason: cwdValidation.reason ?? 'Invalid cwd' }
}

const TOOL_PRE_VALIDATORS: Record<string, ToolPreValidator> = {
  native_mouse_click: validateMouseClickPre,
  native_keyboard_type: (args) => validateKeyboardTypePre(args),
  native_keyboard_hotkey: (args) => validateKeyboardHotkeyPre(args),
  native_window_focus: (args) => validateWindowFocusPre(args),
  native_screen_capture: validateScreenCapturePre,
  native_clipboard_write: (args) => validateClipboardWritePre(args),
  powershell_execute: (args) => validatePowerShellExecutePre(args),
  powershell_session_write: (args) => validatePowerShellSessionWritePre(args),
  powershell_session_create: (args) => validatePowerShellSessionCreatePre(args),
}

export function validateScreenRegion(
  region: { left?: number; top?: number; width?: number; height?: number } | undefined,
  screenW: number,
  screenH: number,
): { valid: boolean; reason?: string } {
  if (!region) return { valid: true }
  const { left = 0, top = 0, width = screenW, height = screenH } = region
  if ([left, top, width, height].some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    return { valid: false, reason: 'Invalid region numbers' }
  }
  if (width <= 0 || height <= 0) return { valid: false, reason: 'Region width/height must be positive' }
  if (left < 0 || top < 0 || left + width > screenW + 1 || top + height > screenH + 1) {
    return { valid: false, reason: `Region outside screen ${screenW}x${screenH}` }
  }
  return { valid: true }
}

/**
 * Sync validation before invoking native / PowerShell tools (extra layer on top of main-process checks).
 */
export function validateNativeToolPre(
  name: string,
  args: Record<string, unknown>,
  screenW: number,
  screenH: number,
): { ok: true } | { ok: false; reason: string } {
  const validator = TOOL_PRE_VALIDATORS[name]
  if (!validator) return { ok: true }
  return validator(args, screenW, screenH)
}
