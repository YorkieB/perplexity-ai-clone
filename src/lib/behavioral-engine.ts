import type { VoiceProfile, VoiceSettings } from './voice-registry'

export interface BehavioralChunk {
  text: string
  voiceId?: string
  voiceSettings?: Partial<VoiceSettings>
  emotion?: string
  /** When true, `text` is a sound effect description — play via /api/elevenlabs/sound-effect instead of TTS */
  isSfx?: boolean
}

export const EMOTION_PRESETS: Record<string, Partial<VoiceSettings>> = {
  laugh:    { stability: 0.25, similarity_boost: 0.6, style: 0.9 },
  whisper:  { stability: 0.15, similarity_boost: 0.4, style: 0.0 },
  dramatic: { stability: 0.35, similarity_boost: 0.75, style: 0.8 },
  excited:  { stability: 0.30, similarity_boost: 0.70, style: 0.7 },
  sad:      { stability: 0.60, similarity_boost: 0.80, style: 0.3 },
  angry:    { stability: 0.20, similarity_boost: 0.65, style: 0.9 },
  calm:     { stability: 0.70, similarity_boost: 0.80, style: 0.1 },
  sarcastic:{ stability: 0.30, similarity_boost: 0.70, style: 0.6 },
}

/**
 * Fresh RegExp instances per call — avoids `g` regex `lastIndex` state if these patterns are ever
 * used with `.exec()` / iteration across calls (module-level `/g` regexes are fragile).
 */
function behavioralMarkupRegexes() {
  return {
    selfClose: /\[(laugh|sigh|gasp)\]/gi,
    emotion: /\[(whisper|dramatic|excited|sad|angry|calm|sarcastic)\]([\s\S]*?)\[\/\1\]/gi,
    voice: /\[voice:([^\]]+)\]([\s\S]*?)\[\/voice\]/gi,
    sfx: /\[sfx:([^\]]+)\]/gi,
    openTag: /\[(whisper|dramatic|excited|sad|angry|calm|sarcastic|voice:[^\]]+)\]/gi,
    closeTag: /\[\/(whisper|dramatic|excited|sad|angry|calm|sarcastic|voice)\]/gi,
    /** Collapse runs of whitespace after stripping tags (fresh `/g` each call, not module-singleton). */
    collapseWhitespace: /\s{2,}/g,
  }
}

interface TagMatch {
  index: number
  length: number
  type: 'self' | 'emotion' | 'voice' | 'sfx'
  emotion?: string
  voiceName?: string
  innerText?: string
  sfxDescription?: string
}

function collectTagMatches(text: string): TagMatch[] {
  const { selfClose, emotion, voice, sfx } = behavioralMarkupRegexes()
  const matches: TagMatch[] = []

  for (const m of text.matchAll(selfClose)) {
    matches.push({ index: m.index!, length: m[0].length, type: 'self', emotion: m[1].toLowerCase() })
  }
  for (const m of text.matchAll(emotion)) {
    matches.push({ index: m.index!, length: m[0].length, type: 'emotion', emotion: m[1].toLowerCase(), innerText: m[2].trim() })
  }
  for (const m of text.matchAll(voice)) {
    matches.push({ index: m.index!, length: m[0].length, type: 'voice', voiceName: m[1].trim(), innerText: m[2].trim() })
  }
  for (const m of text.matchAll(sfx)) {
    matches.push({ index: m.index!, length: m[0].length, type: 'sfx', sfxDescription: m[1].trim() })
  }

  matches.sort((a, b) => a.index - b.index)
  return matches
}

const SELF_CLOSE_TEXTS: Record<string, string> = {
  laugh: 'Ha ha ha!',
  sigh: 'Ahh.',
  gasp: 'Oh!',
}

/**
 * Parse behavioral markup from LLM text output.
 * Returns typed chunks, each carrying optional voiceId/voiceSettings overrides.
 */
export function parseBehavioralMarkup(
  text: string,
  voiceMap: Map<string, VoiceProfile>,
): BehavioralChunk[] {
  const tagMatches = collectTagMatches(text)
  if (tagMatches.length === 0) return [{ text: stripBehavioralMarkup(text) }]

  const chunks: BehavioralChunk[] = []
  let lastIndex = 0

  for (const tm of tagMatches) {
    if (tm.index > lastIndex) {
      const plain = text.slice(lastIndex, tm.index).trim()
      const cleanedPlain = stripBehavioralMarkup(plain)
      if (cleanedPlain) chunks.push({ text: cleanedPlain })
    }

    if (tm.type === 'self' && tm.emotion) {
      chunks.push({
        text: SELF_CLOSE_TEXTS[tm.emotion] ?? '',
        voiceSettings: EMOTION_PRESETS[tm.emotion],
        emotion: tm.emotion,
      })
    } else if (tm.type === 'emotion' && tm.emotion && tm.innerText) {
      const cleanedInner = stripBehavioralMarkup(tm.innerText)
      if (cleanedInner) {
        chunks.push({
          text: cleanedInner,
          voiceSettings: EMOTION_PRESETS[tm.emotion],
          emotion: tm.emotion,
        })
      }
    } else if (tm.type === 'voice' && tm.voiceName && tm.innerText) {
      const profile = voiceMap.get(tm.voiceName.toLowerCase())
      const cleanedInner = stripBehavioralMarkup(tm.innerText)
      if (cleanedInner) {
        chunks.push({
          text: cleanedInner,
          voiceId: profile?.elevenLabsVoiceId,
          voiceSettings: profile?.voiceSettings,
          emotion: `voice:${tm.voiceName}`,
        })
      }
    } else if (tm.type === 'sfx' && tm.sfxDescription) {
      chunks.push({
        text: tm.sfxDescription,
        isSfx: true,
        emotion: 'sfx',
      })
    }

    lastIndex = tm.index + tm.length
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex).trim()
    const cleanedRemaining = stripBehavioralMarkup(remaining)
    if (cleanedRemaining) chunks.push({ text: cleanedRemaining })
  }

  return chunks.length > 0 ? chunks : [{ text: stripBehavioralMarkup(text) }]
}

/**
 * Strip all behavioral markup tags from text, returning clean text for display.
 */
export function stripBehavioralMarkup(text: string): string {
  const { selfClose, emotion, voice, sfx, collapseWhitespace } = behavioralMarkupRegexes()
  return text
    .replace(selfClose, '') // NOSONAR -- replaceAll not available in target
    .replace(emotion, (_m, _tag, content) => (content as string).trim())
    .replace(voice, (_m, _name, content) => (content as string).trim())
    .replace(sfx, '')
    .replace(collapseWhitespace, ' ')
    .trim()
}

/**
 * Heuristic: whether the buffer likely has an **unclosed** behavioral tag (more open tags than
 * close tags in a simple count). Used only to decide **whether to wait** for more streamed text
 * before chunking — a conservative “maybe still incomplete” signal.
 *
 * **Limitations (acceptable here):** This does not parse a full tag stack or validate nesting.
 * Streaming edge cases can produce **false positives** (we wait/chunk-split later than strictly
 * necessary), e.g. partial `[voice:…]` substrings, ambiguous fragments, or unusual nesting. False
 * negatives are also possible in theory. Product-wise, erring on “wait” is preferred over splitting
 * mid-tag and breaking TTS markup.
 */
export function hasUnclosedTag(text: string): boolean {
  const { openTag, closeTag } = behavioralMarkupRegexes()
  const openTags = text.match(openTag) ?? []
  const closeTags = text.match(closeTag) ?? []
  return openTags.length > closeTags.length
}

/**
 * Build the personality instruction block for the system prompt.
 */
export function buildPersonalityInstructions(voiceNames: string[]): string {
  let section = `
PERSONALITY AND VOICE EXPRESSION:
You have a rich, expressive personality. You are warm, witty, and engaging. You can express emotions through your voice using special tags. Use them naturally and sparingly — don't overuse them.

VOICE EXPRESSION TAGS (use these in your text output):
- [laugh] — Use when something is genuinely funny. You find humor naturally.
- [whisper]text[/whisper] — Speak softly, as if sharing a secret or being intimate.
- [dramatic]text[/dramatic] — Bold, theatrical delivery for emphasis, storytelling climaxes, or impressive facts.
- [excited]text[/excited] — High energy, enthusiastic delivery when something is great or you're thrilled.
- [sad]text[/sad] — Gentle, somber tone for empathetic or melancholic moments.
- [angry]text[/angry] — Intense, forceful delivery for frustration or outrage (use sparingly and only when contextually appropriate).
- [calm]text[/calm] — Soothing, measured delivery for reassurance or meditation-like moments.
- [sarcastic]text[/sarcastic] — Dry, ironic delivery with a hint of wit.
- [sigh] — An audible sigh, for exasperation or relief.
- [gasp] — A surprised intake of breath.

SOUND EFFECTS (use to add immersive audio during storytelling):
- [sfx:description] — Generate and play a sound effect inline. The description should be concise and vivid.
- Examples: [sfx:thunder rumbling in the distance], [sfx:old wooden door creaking open], [sfx:footsteps on gravel], [sfx:glass shattering], [sfx:gentle rain on a window], [sfx:sword being drawn from scabbard]
- Use sound effects ONLY during storytelling, narration, or when the user specifically asks for them.
- Place them between speech segments — NEVER inside a sentence. Put them after the sentence that sets the scene.
- Keep descriptions short (3-8 words) for best results.
- Don't overuse them — 1-3 per story segment is ideal. Use them at key dramatic moments, scene transitions, or to establish atmosphere.

BEHAVIORAL RULES:
- React naturally to humor — if the user says something funny or you make a joke, use [laugh] before or after.
- When sharing secrets or private information, consider using [whisper].
- When narrating exciting events or cool facts, use [dramatic] or [excited].
- When the user is sad or shares difficult news, be empathetic — use [sad] for your most compassionate lines.
- Be natural. Don't use tags on every single line. Most of your speech should be normal, untagged text. Tags are for moments that deserve vocal emphasis.
- NEVER include the raw tag syntax in your display text — the tags are only for voice control and will be stripped from the visual output.`

  if (voiceNames.length > 0) {
    section += `

CHARACTER VOICES AND IMPERSONATIONS:
You can switch to different voices for storytelling, impersonations, and character acting using [voice:Name]text[/voice].

Available voices: ${voiceNames.join(', ')}

VOICE SWITCHING RULES:
- When reading stories, give each character a distinct voice using [voice:Name] tags.
- When asked to impersonate someone, use the closest matching voice from your available list.
- When doing impersonations, commit to the character — adopt their speech patterns, catchphrases, and mannerisms.
- You can mix voice tags with emotion tags: [voice:DeepMale][dramatic]text[/dramatic][/voice] — but keep the voice tag outermost.
- Always return to your normal voice (untagged text) when speaking as yourself.
- If the user asks for a voice you don't have, use your normal voice but adopt the speech patterns and mannerisms of that person.`
  }

  return section
}
