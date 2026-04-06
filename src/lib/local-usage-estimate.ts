import type { Message } from '@/lib/types'

export interface LocalUsageEstimate {
  recentMessageCount: number
  recentCharacterCount: number
  estimatedTokenCount: number
}

export interface LocalQuotaEstimate {
  contextWindow: number | null
  estimatedUsagePercent: number | null
}

const LOCAL_CONTEXT_WINDOWS: Record<string, number> = {
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16385,
}

function normalizeModel(modelId: string): string {
  let normalized = modelId.trim()
  if (normalized.startsWith('do:')) {
    normalized = normalized.slice(3)
  }
  const slashIndex = normalized.indexOf('/')
  if (slashIndex >= 0) {
    normalized = normalized.slice(0, slashIndex)
  }
  return normalized
}

export function estimateLocalUsage(
  messages: Array<Pick<Message, 'content'>>,
  recentLimit = 12,
): LocalUsageEstimate {
  const recent = messages.slice(-recentLimit)
  const recentCharacterCount = recent.reduce((total, message) => total + (message.content?.length ?? 0), 0)
  return {
    recentMessageCount: recent.length,
    recentCharacterCount,
    estimatedTokenCount: Math.ceil(recentCharacterCount / 4),
  }
}

export function estimateLocalQuota(modelId: string, estimatedTokenCount: number): LocalQuotaEstimate {
  const contextWindow = LOCAL_CONTEXT_WINDOWS[normalizeModel(modelId)] ?? null
  if (!contextWindow || contextWindow <= 0) {
    return {
      contextWindow: null,
      estimatedUsagePercent: null,
    }
  }
  return {
    contextWindow,
    estimatedUsagePercent: Math.min(100, Math.max(0, (estimatedTokenCount / contextWindow) * 100)),
  }
}
