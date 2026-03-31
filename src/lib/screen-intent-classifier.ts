/**
 * Pure NLU helpers for screen-agent voice intents (no I/O).
 * Intents use the `screen.*` namespace; map to `jarvis.screen.*` at the emitter boundary.
 */

export interface ScreenIntentResult {
  intent: string
  entities: Record<string, string>
}

export function classifyScreenIntent(transcript: string): ScreenIntentResult | null {
  const t = transcript.trim()
  if (!t) {
    return null
  }
  const lower = t.toLowerCase()

  // 1 — stop + (screen | watching | agent) OR screen off
  if (/\bscreen off\b/i.test(lower) || (/\bstop\b/i.test(lower) && /\b(screen|watching|agent)\b/i.test(lower))) {
    return { intent: 'screen.stop', entities: {} }
  }

  // 2 — watch + screen OR monitor + screen OR keep an eye
  if (
    (/\bwatch\b/i.test(lower) && /\bscreen\b/i.test(lower)) ||
    (/\bmonitor\b/i.test(lower) && /\bscreen\b/i.test(lower)) ||
    /\bkeep an eye\b/i.test(lower)
  ) {
    return { intent: 'screen.watch', entities: {} }
  }

  // 3 — advise OR coach me OR (help me with + screen)
  if (
    /\badvise\b/i.test(lower) ||
    /\bcoach me\b/i.test(lower) ||
    (/\bhelp me with\b/i.test(lower) && /\bscreen\b/i.test(lower))
  ) {
    return { intent: 'screen.advise', entities: {} }
  }

  // 4 — desktop / monitor content questions → query Python vision (maps to jarvis.screen.query)
  if (
    /\bscreen status\b/i.test(lower) ||
    /\bwhat mode\b/i.test(lower) ||
    /\bare you watching\b/i.test(lower) ||
    /\bwhat(?:'s|s| is)\s+(?:on|there)\s+(?:on\s+)?(?:my\s+)?screen\b/i.test(lower) ||
    /\bwhat\s+do\s+you\s+see\b/i.test(lower) ||
    /\bcan\s+you\s+see\s+(?:my\s+)?(?:screen|display|monitor)\b/i.test(lower) ||
    /\b(describe|tell me)\s+(?:what'?s?|what is)\s+on\s+(?:my\s+)?screen\b/i.test(lower)
  ) {
    return { intent: 'screen.status', entities: {} }
  }

  // 5 — (do | execute | automate | open | click | type) + (for me | it | that | this)
  if (/\b(do|execute|automate|open|click|type)\b/i.test(lower) && /\b(for me|it|that|this)\b/i.test(lower)) {
    return { intent: 'screen.act', entities: { goal: t } }
  }

  return null
}

export function isScreenIntent(transcript: string): boolean {
  return classifyScreenIntent(transcript) !== null
}
