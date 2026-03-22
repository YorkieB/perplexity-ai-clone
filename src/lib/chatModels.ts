/** Models accepted by the dev `/api/llm` OpenAI-compatible proxy (see QueryInput). */
export const CHAT_MODEL_IDS = ['gpt-4o', 'gpt-4o-mini'] as const

export type ChatModelId = (typeof CHAT_MODEL_IDS)[number]

export const DEFAULT_CHAT_MODEL: ChatModelId = 'gpt-4o-mini'

export function normalizeChatModel(id: string | undefined | null): ChatModelId {
  if (id && CHAT_MODEL_IDS.includes(id as ChatModelId)) return id as ChatModelId
  return DEFAULT_CHAT_MODEL
}
