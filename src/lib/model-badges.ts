/**
 * Map model IDs to capability/tier badges for the model selector.
 * Uses known patterns; unknown models get no badges.
 */
export type ModelBadgeKind = 'premium' | 'budget' | 'vision' | 'voice' | 'creative'

export interface ModelBadge {
  kind: ModelBadgeKind
  label: string
}

/** Known premium (high-end) model ID substrings. */
const PREMIUM_PATTERNS = [
  'gpt-4o', // not mini
  'gpt-4-turbo',
  'gpt-4-vision',
  'gpt-4-32k',
  'claude-3-opus',
  'claude-3.5-sonnet',
  'claude-3-5-sonnet',
  'claude-3-sonnet',
  'gemini-1.5-pro',
  'gemini-pro',
  'o1-preview',
  'o1-2024',
  /^o1(?!-mini)/,
  'llama-3-70b',
  'llama-3.1-70b',
  'llama-3.2-90b',
  'llama-70b',
  'qwen-72b',
  'qwen2-72b',
  'mixtral-8x22b',
  'deepseek-r1',
  'deepseek-v3',
  'command-r-plus',
]

/** Known budget (cost-effective) model ID substrings. */
const BUDGET_PATTERNS = [
  'gpt-4o-mini',
  'gpt-3.5-turbo',
  'gpt-35-turbo',
  'claude-3-haiku',
  'claude-3.5-haiku',
  'claude-3-5-haiku',
  'gemini-1.5-flash',
  'gemini-flash',
  'gemini-2.0-flash',
  'gemini-2.5-flash',
  'o1-mini',
  'llama-3-8b',
  'llama-3.1-8b',
  'llama-3.2-3b',
  'llama-8b',
  'qwen-7b',
  'qwen-14b',
  'qwen2-7b',
  'qwen2-14b',
  'mistral-7b',
  'mixtral-8x7b',
  'phi-3',
  'phi-4',
  'deepseek-v2-lite',
  'command-r',
]

/** Heuristic: id suggests premium (pro, opus, large params). */
const PREMIUM_HEURISTICS = [
  /\bpro\b/,
  /\bopus\b/,
  /\b(70b|90b|72b|175b)\b/,
  /\b(sonnet|opus)(?!.*haiku)/,
  /-r1$/,
  /-v3$/,
]

/** Heuristic: id suggests budget (mini, flash, small params). */
const BUDGET_HEURISTICS = [
  /\bmini\b/,
  /\bflash\b/,
  /\bhaiku\b/,
  /\b(7b|8b|3b|1b)\b/,
  /\blite\b/,
  /-small$/,
]

/** Models with vision (image understanding). */
const VISION_PATTERNS = [
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-4-vision',
  'gpt-4o-mini',
  'claude-3',
  'claude-3.5',
  'claude-3-5',
  'gemini',
  'llava',
  'llama-3.2-11b-vision',
  'llama-3.2-90b-vision',
  'qwen-vl',
  'qwen2-vl',
  'vision',
  'llava',
  'pixtral',
  'idefics',
]

/** Heuristic: id suggests vision. */
const VISION_HEURISTICS = [
  /\bvision\b/,
  /\bvl\b/,
  /\bmultimodal\b/,
]

function matches(id: string, patterns: (string | RegExp)[]): boolean {
  const s = id.toLowerCase()
  for (const p of patterns) {
    if (typeof p === 'string') {
      if (s.includes(p.toLowerCase())) return true
    } else if (p.test(id)) return true
  }
  return false
}

function matchesHeuristic(id: string, patterns: RegExp[]): boolean {
  const s = id.toLowerCase()
  return patterns.some((p) => p.test(s))
}

function isPremium(id: string): boolean {
  if (id.includes('gpt-4o-mini')) return false
  if (matches(id, PREMIUM_PATTERNS)) return true
  return matchesHeuristic(id, PREMIUM_HEURISTICS)
}

function isBudget(id: string): boolean {
  if (matches(id, BUDGET_PATTERNS)) return true
  return matchesHeuristic(id, BUDGET_HEURISTICS)
}

function isVision(id: string): boolean {
  if (id.startsWith('a2e-')) return false
  if (matches(id, VISION_PATTERNS)) return true
  return matchesHeuristic(id, VISION_HEURISTICS)
}

function isA2eVoice(id: string): boolean {
  return [
    'a2e-tts',
    'a2e-voice-clone',
    'a2e-talking-photo',
    'a2e-talking-video',
    'a2e-avatar-video',
    'a2e-dubbing',
    'a2e-custom-avatar',
  ].some((prefix) => id.startsWith(prefix))
}

function isA2eCreative(id: string): boolean {
  if (!id.startsWith('a2e-')) return false
  return [
    'a2e-text-to-image',
    'a2e-nano-banana',
    'a2e-image-to-video',
    'a2e-talking-photo',
    'a2e-talking-video',
    'a2e-avatar-video',
    'a2e-caption-removal',
    'a2e-dubbing',
    'a2e-virtual-try-on',
    'a2e-motion-transfer',
    'a2e-face-swap',
    'a2e-watermark',
    'a2e-custom-avatar',
  ].some((prefix) => id.startsWith(prefix))
}

export function getModelBadges(modelId: string): ModelBadge[] {
  const id = modelId.trim()
  if (!id) return []

  const badges: ModelBadge[] = []

  if (id.startsWith('a2e-')) {
    if (isA2eVoice(id)) badges.push({ kind: 'voice', label: 'Voice' })
    if (isA2eCreative(id)) badges.push({ kind: 'creative', label: 'Creative' })
    return badges
  }

  if (isPremium(id)) badges.push({ kind: 'premium', label: 'Premium' })
  else if (isBudget(id)) badges.push({ kind: 'budget', label: 'Budget' })

  if (isVision(id)) badges.push({ kind: 'vision', label: 'Vision' })

  if (badges.length === 0) badges.push({ kind: 'premium', label: 'Chat' })

  return badges
}
