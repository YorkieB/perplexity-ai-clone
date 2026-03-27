/**
 * Deterministic pre-embedding override rules for Jarvis semantic routing.
 * Evaluated in array order before any embedding model runs.
 */

const LOG = '[OverrideRules]'

/** Single hard override: synchronous test maps a user message to a fixed route. */
export interface OverrideRule {
  /** Stable id for logging and debugging. */
  name: string
  /** Target intent route name when {@link OverrideRule.test} matches. */
  route: string
  /** Returns true when this rule should take the message (no async / no side effects). */
  test: (message: string) => boolean
  /** Override strength; hard rules use `1.0`. */
  confidence: number
  /** Human-readable explanation for logs and telemetry. */
  reason: string
}

/** Non-null result of {@link applyOverrides} when a hard rule matches. */
export interface OverrideApplyResult {
  matched: boolean
  route: string
  confidence: number
  ruleName: string
  reason: string
}

/**
 * Ordered list of overrides. Earlier entries win. May be extended at runtime via
 * {@link addOverrideRule}.
 */
export const OVERRIDE_RULES: OverrideRule[] = [
  {
    name: 'explicit_back_reference',
    route: 'clarification_needed',
    confidence: 1.0,
    reason: 'Message contains explicit back-reference phrases',
    test: (msg) => {
      const lower = msg.toLowerCase()
      const patterns = [
        'i have just given',
        'i already gave',
        'i just gave',
        'i gave you',
        'see above',
        'see my previous',
        'as i mentioned above',
        'as i said above',
        'i already provided',
        'i already shared',
        'you already have',
        'it is in my last',
        'check what i sent',
        'look at what i shared',
        'refer to what i',
        'i sent you that',
        'i told you this',
        'check my last message',
        'look at my last message',
        'as provided above',
        'i already told you',
      ]
      return patterns.some((p) => lower.includes(p))
    },
  },
  {
    name: 'action_verb_on_demonstrative',
    route: 'code_instruction',
    confidence: 1.0,
    reason: 'Message starts with action verb followed by demonstrative pronoun',
    test: (msg) => {
      const lower = msg.trim().toLowerCase()
      const actionVerbs = [
        'recode',
        'rewrite',
        'refactor',
        'fix',
        'update',
        'modify',
        'improve',
        'optimise',
        'optimize',
        'change',
        'add',
        'remove',
        'delete',
        'rename',
        'move',
        'convert',
        'migrate',
        'clean',
        'simplify',
        'extract',
        'split',
        'merge',
        'replace',
      ]
      const demonstratives = [
        ' this',
        ' it',
        ' that',
        ' the code',
        ' the component',
        ' the function',
        ' the file',
        ' the config',
        ' the above',
      ]
      return (
        actionVerbs.some((v) => lower.startsWith(v)) && demonstratives.some((d) => lower.includes(d))
      )
    },
  },
  {
    name: 'code_fence_with_instruction',
    route: 'code_instruction',
    confidence: 1.0,
    reason: 'Message contains a code fence AND an action instruction',
    test: (msg) => {
      const hasCodeFence = msg.includes('```')
      const lower = msg.toLowerCase()
      const hasAction = [
        'fix',
        'update',
        'recode',
        'rewrite',
        'refactor',
        'improve',
        'add',
        'remove',
        'change',
        'here is',
        "here's",
        'use this',
      ].some((a) => lower.includes(a))
      return hasCodeFence && hasAction
    },
  },
  {
    name: 'voice_emotion_instruction',
    route: 'voice_task',
    confidence: 1.0,
    reason: 'Message contains voice emotion modification instruction',
    test: (msg) => {
      const lower = msg.toLowerCase()
      const voiceWords = ['voice', 'speech', 'audio', 'sound', 'speak', 'tone']
      const emotionWords = [
        'angrier',
        'anger',
        'happier',
        'happy',
        'sad',
        'sadder',
        'calmer',
        'calm',
        'excited',
        'energetic',
        'emotional',
        'neutral',
        'whisper',
        'louder',
        'softer',
        'faster',
        'slower',
      ]
      return voiceWords.some((v) => lower.includes(v)) && emotionWords.some((e) => lower.includes(e))
    },
  },
  {
    name: 'gratitude_or_acknowledgement',
    route: 'conversational',
    confidence: 1.0,
    reason: 'Single-word or very short acknowledgement message',
    test: (msg) => {
      const cleaned = msg
        .trim()
        .toLowerCase()
        .replace(/[^a-z\s]/g, '')
      const singleWordAcks = [
        'thanks',
        'thank',
        'ok',
        'okay',
        'sure',
        'yes',
        'no',
        'great',
        'perfect',
        'nice',
        'good',
        'awesome',
        'cool',
        'got it',
        'understood',
        'makes sense',
        'sounds good',
      ]
      return (
        msg.trim().length < 30 &&
        singleWordAcks.some((a) => cleaned === a || cleaned.startsWith(`${a} `))
      )
    },
  },
]

/**
 * Run {@link OVERRIDE_RULES} in order; first match wins.
 *
 * @param message - Raw user text
 * @returns Match details, or `null` when no override applies
 */
export function applyOverrides(message: string): OverrideApplyResult | null {
  for (const rule of OVERRIDE_RULES) {
    if (!rule.test(message)) {
      continue
    }
    console.info(`${LOG} Hard override matched: ${rule.name} → ${rule.route}`)
    return {
      matched: true,
      route: rule.route,
      confidence: rule.confidence,
      ruleName: rule.name,
      reason: rule.reason,
    }
  }
  return null
}

/**
 * Append a custom rule (evaluated after existing rules unless you insert differently — this
 * pushes to the end, so it runs last).
 *
 * @param rule - Complete override definition
 */
export function addOverrideRule(rule: OverrideRule): void {
  OVERRIDE_RULES.push(rule)
  console.info(`${LOG} Added custom override rule: ${rule.name}`)
}
