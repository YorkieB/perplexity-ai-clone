/**
 * Periodic screen observation (Electron + vision model). Gated by user setting proactiveVision.
 */

import { callLlmChat } from '@/lib/llm'
import { getJarvisNative } from '@/lib/jarvis-native-bridge'

const PROACTIVE_MODEL = 'gpt-4o-mini'

const SYSTEM = `You observe a screenshot of the user's desktop. If something clearly actionable stands out (error dialog, risky action, obvious next step they might miss), reply with exactly one line starting with SUGGEST: followed by brief spoken-friendly advice (max 25 words). Otherwise reply exactly: NONE`

/**
 * Captures the primary screen and asks the model for an optional suggestion line.
 * Returns null if capture/native is unavailable, or the raw model text.
 */
export async function runProactiveVisionObservation(signal?: AbortSignal): Promise<string | null> {
  const jn = getJarvisNative()
  if (!jn) return null

  const cap = await jn.screenCapture({ region: undefined })
  if (!cap.ok || !cap.data) return null

  const dataUrl = `data:image/png;base64,${cap.data}`
  const text = await callLlmChat(
    [
      { role: 'system', content: SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this screen. Reply with SUGGEST: ... or NONE.' },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
        ],
      },
    ],
    PROACTIVE_MODEL,
    { signal, max_tokens: 120, temperature: 0.2 },
  )

  return text.trim()
}

export function parseProactiveSuggestion(raw: string): string | null {
  const t = raw.trim()
  if (!t || /^NONE\b/i.test(t)) return null
  const m = t.match(/^SUGGEST:\s*(.{1,500})$/i)
  if (m?.[1]) return m[1].trim()
  if (/^suggest\b/i.test(t)) return t.replace(/^SUGGEST:\s*/i, '').trim()
  return null
}
