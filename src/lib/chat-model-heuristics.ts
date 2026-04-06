export type AutoChatModel = 'gpt-4o' | 'gpt-4o-mini'

export interface AutoModelDecision {
  model: AutoChatModel
  reason: string
}

const COMPLEXITY_KEYWORDS = [
  'analyze',
  'analysis',
  'compare',
  'tradeoff',
  'architecture',
  'refactor',
  'debug',
  'investigate',
  'step-by-step',
  'reason',
] as const

/**
 * Lightweight client-side heuristic for "Auto model".
 * This is intentionally simple and transparent (not "optimal"):
 * - attachments => larger model (`gpt-4o`)
 * - long/structured or complexity-heavy prompts => larger model
 * - otherwise => faster/cheaper model (`gpt-4o-mini`)
 */
export function chooseAutoModel(query: string, hasAttachments: boolean): AutoModelDecision {
  const trimmed = query.trim()
  const lower = trimmed.toLowerCase()
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0
  const newlineCount = (trimmed.match(/\n/g) || []).length

  if (hasAttachments) {
    return {
      model: 'gpt-4o',
      reason: 'Attachments present',
    }
  }

  if (trimmed.length >= 320 || wordCount >= 70 || newlineCount >= 2) {
    return {
      model: 'gpt-4o',
      reason: 'Long or structured prompt',
    }
  }

  if (COMPLEXITY_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return {
      model: 'gpt-4o',
      reason: 'Complexity keyword detected',
    }
  }

  return {
    model: 'gpt-4o-mini',
    reason: 'Short direct prompt',
  }
}
