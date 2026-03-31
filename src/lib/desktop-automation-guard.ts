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
const DANGEROUS_HOTKEY = /(\^|\b)alt\+f4\b|\bwin\+l\b/i

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
  switch (name) {
    case 'native_mouse_click': {
      const x = args.x
      const y = args.y
      if (typeof x === 'number' && typeof y === 'number') {
        const v = validateNativeClick(x, y, screenW, screenH)
        if (!v.valid) return { ok: false, reason: v.reason ?? 'Bad coordinates' }
      }
      return { ok: true }
    }
    case 'native_keyboard_type': {
      const text = args.text
      if (typeof text !== 'string' || !text.length) return { ok: false, reason: 'Missing text' }
      if (text.length > MAX_TYPE_CHARS) return { ok: false, reason: 'Text too long' }
      return { ok: true }
    }
    case 'native_keyboard_hotkey': {
      const combo = args.combo
      if (typeof combo !== 'string' || !combo.trim()) return { ok: false, reason: 'Missing combo' }
      if (DANGEROUS_HOTKEY.test(combo)) return { ok: false, reason: 'Blocked hotkey pattern' }
      return { ok: true }
    }
    case 'native_window_focus': {
      const title = args.title
      if (typeof title !== 'string' || !title.trim()) return { ok: false, reason: 'Missing title' }
      if (title.length > 500) return { ok: false, reason: 'Title too long' }
      return { ok: true }
    }
    case 'native_screen_capture': {
      const region = args.region as { left?: number; top?: number; width?: number; height?: number } | undefined
      const v = validateScreenRegion(region, screenW, screenH)
      return v.valid ? { ok: true } : { ok: false, reason: v.reason ?? 'Bad region' }
    }
    case 'native_clipboard_write': {
      const text = args.text
      if (typeof text !== 'string') return { ok: false, reason: 'Missing text' }
      if (text.length > MAX_CLIPBOARD_WRITE) return { ok: false, reason: 'Clipboard payload too large' }
      return { ok: true }
    }
    case 'powershell_execute':
    case 'powershell_session_write': {
      const cmd = args.command as string
      if (typeof cmd !== 'string' || !cmd.trim()) return { ok: false, reason: 'Missing command' }
      const v = validatePowerShellCommand(cmd)
      return v.safe ? { ok: true } : { ok: false, reason: v.reason ?? 'Blocked command' }
    }
    default:
      return { ok: true }
  }
}
