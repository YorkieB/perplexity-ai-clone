export type AutoModelHeuristicReason =
  | 'attachments'
  | 'long-query'
  | 'multi-line'
  | 'complex-keywords'
  | 'short-query'

export interface AutoModelHeuristicDecision {
  model: 'gpt-4o' | 'gpt-4o-mini'
  reason: AutoModelHeuristicReason
}

const COMPLEXITY_KEYWORDS = [
  'compare',
  'analyze',
  'architecture',
  'debug',
  'refactor',
  'tradeoff',
  'step by step',
  'step-by-step',
  'root cause',
  'investigate',
]

/**
 * Lightweight, local-only heuristic for choosing between "mini" and "larger" models.
 * This is intentionally simple and transparent, not an "optimal" router.
 */
export function chooseAutoChatModel(input: {
  query: string
  attachmentCount: number
}): AutoModelHeuristicDecision {
  const trimmed = input.query.trim()
  const lower = trimmed.toLowerCase()

  if (input.attachmentCount > 0) {
    return { model: 'gpt-4o', reason: 'attachments' }
  }
  if (trimmed.length >= 280) {
    return { model: 'gpt-4o', reason: 'long-query' }
  }
  if (trimmed.includes('\n')) {
    return { model: 'gpt-4o', reason: 'multi-line' }
  }
  if (COMPLEXITY_KEYWORDS.some((word) => lower.includes(word))) {
    return { model: 'gpt-4o', reason: 'complex-keywords' }
  }
  return { model: 'gpt-4o-mini', reason: 'short-query' }
}

export function describeAutoModelDecision(decision: AutoModelHeuristicDecision): string {
  switch (decision.reason) {
    case 'attachments':
      return 'attachments detected'
    case 'long-query':
      return 'long prompt'
    case 'multi-line':
      return 'multi-line prompt'
    case 'complex-keywords':
      return 'complex-analysis keywords'
    case 'short-query':
      return 'short prompt'
    default:
      return 'basic heuristic'
  }
}

export interface LocalUsageEstimate {
  messageCount: number
  characterCount: number
  estimatedTokens: number
}

export function estimateLocalUsage(messages: Array<{ content: string }>): LocalUsageEstimate {
  const messageCount = messages.length
  const characterCount = messages.reduce((sum, message) => sum + (message.content?.length ?? 0), 0)
  // Intentionally rough estimate: ~4 characters per token for English-heavy text.
  const estimatedTokens = Math.ceil(characterCount / 4)
  return {
    messageCount,
    characterCount,
    estimatedTokens,
  }
}
