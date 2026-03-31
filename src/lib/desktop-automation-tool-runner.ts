/**
 * Shared execution for native OS + PowerShell tools (text chat + voice Realtime).
 */

import { getJarvisNative } from '@/lib/jarvis-native-bridge'
import { validatePowerShellCommand, validateNativeClick, validateNativeToolPre } from '@/lib/desktop-automation-guard'

export async function runDesktopAutomationTool(
  name: string,
  args: Record<string, unknown>,
  onStatus?: (status: string) => void,
): Promise<string> {
  switch (name) {
    case 'native_mouse_click': {
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
      return r.ok
        ? `Clicked (${typeof x === 'number' ? x : 'current'}, ${typeof y === 'number' ? y : 'current'}).`
        : `Failed: ${r.error ?? 'unknown'}`
    }

    case 'native_keyboard_type': {
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

    case 'native_keyboard_hotkey': {
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

    case 'native_window_focus': {
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

    case 'native_window_list': {
      const jn = getJarvisNative()
      if (!jn) return 'Native desktop control requires the Jarvis desktop app.'
      const list = await jn.windowList()
      if (!list.length) return 'No windows returned (or list unavailable).'
      return list.map((w) => `- ${w.title}`).join('\n')
    }

    case 'native_screen_capture': {
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

    case 'native_clipboard_read': {
      const jn = getJarvisNative()
      if (!jn) return 'Native desktop control requires the Jarvis desktop app.'
      const r = await jn.clipboardRead()
      if (!r.ok) return `Clipboard read failed: ${r.error ?? 'unknown'}`
      const t = r.text ?? ''
      return t === '' ? '(clipboard empty)' : t
    }

    case 'native_clipboard_write': {
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

    case 'powershell_execute': {
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
      return `stdout:\n${r.stdout ?? ''}${r.stderr ? `\nstderr:\n${r.stderr}` : ''}`
    }

    case 'powershell_session_create': {
      const ide = typeof window !== 'undefined' ? window.jarvisIde : undefined
      if (!ide) return 'Persistent terminal requires the Jarvis desktop app.'
      onStatus?.('Creating PowerShell session…')
      const r = await ide.terminalCreate({ cwd: typeof args.cwd === 'string' ? args.cwd : undefined })
      return `Created PowerShell session id=${String(r.id)} cwd=${r.cwd}. Use powershell_session_write to send commands; output appears in the IDE terminal panel.`
    }

    case 'powershell_session_write': {
      const ide = typeof window !== 'undefined' ? window.jarvisIde : undefined
      if (!ide) return 'Persistent terminal requires the Jarvis desktop app.'
      const jn = getJarvisNative()
      const size = jn ? await jn.screenSize() : { width: 1920, height: 1080 }
      const pre = validateNativeToolPre('powershell_session_write', args, size.width, size.height)
      if (!pre.ok) return pre.reason
      const sessionId = args.session_id as number
      const cmd = args.command as string
      if (typeof sessionId !== 'number' || !cmd?.trim()) return 'Missing session_id or command.'
      const v = validatePowerShellCommand(cmd)
      if (!v.safe) return v.reason ?? 'Blocked.'
      const line = cmd.endsWith('\n') ? cmd : `${cmd}\n`
      const w = await ide.terminalWrite({ id: sessionId, data: line })
      return w.ok ? `Sent to session ${String(sessionId)}. Check the IDE terminal for output.` : `Failed: ${w.error ?? 'unknown'}`
    }

    default:
      return `Unknown desktop automation tool: ${name}`
  }
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
