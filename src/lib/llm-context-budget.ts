import type { Source, UploadedFile } from '@/lib/types'

/** Rough token estimate (~4 chars per token) for client-side budgeting. */
export function estimateTokensApprox(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / 4)
}

export function getModelContextWindowTokens(): number {
  const v = Number(import.meta.env.VITE_LLM_CONTEXT_WINDOW_TOKENS)
  return Number.isFinite(v) && v > 1024 ? v : 40960
}

export function getDesiredMaxCompletionTokens(): number {
  const v = Number(import.meta.env.VITE_LLM_MAX_COMPLETION_TOKENS)
  return Number.isFinite(v) && v > 0 ? Math.min(v, 128000) : 16384
}

/**
 * Completion budget: stay within model window minus estimated input (provider enforces hard limits).
 */
export function completionMaxTokensForInput(estimatedInputTokens: number): number {
  const window = getModelContextWindowTokens()
  const desired = getDesiredMaxCompletionTokens()
  const reserved = 256
  const headroom = window - estimatedInputTokens - reserved
  return Math.max(256, Math.min(desired, headroom))
}

/** Per-source body cap so many Tavily results cannot blow the whole context. */
const MAX_CHARS_PER_SOURCE_BODY = 10_000

/** Total cap on concatenated web context (~28k tokens) before final safety trim. */
const MAX_TOTAL_WEB_CONTEXT_CHARS = 110_000

const TRUNCATION_NOTE = '\n[… truncated for model context …]'

export function buildWebSearchContextSection(sources: Source[]): string {
  if (sources.length === 0) return ''
  const parts = sources.map((source, idx) => {
    const raw = source.rawContent || source.snippet || ''
    const body =
      raw.length > MAX_CHARS_PER_SOURCE_BODY
        ? `${raw.slice(0, MAX_CHARS_PER_SOURCE_BODY)}${TRUNCATION_NOTE}`
        : raw
    return `[${idx + 1}] ${source.title}\nURL: ${source.url}\nContent: ${body}\n`
  })
  let joined = parts.join('\n')
  if (joined.length > MAX_TOTAL_WEB_CONTEXT_CHARS) {
    joined = joined.slice(0, MAX_TOTAL_WEB_CONTEXT_CHARS) + '\n[… further web results omitted …]'
  }
  return `\n\nWeb Search Results:\n${joined}`
}

const MAX_CHARS_PER_FILE_BODY = 12_000
const MAX_TOTAL_FILES_CONTEXT_CHARS = 80_000

/** Split attachments: text-like content vs images (data URLs) for vision API. */
export function splitAttachmentFiles(files: UploadedFile[]): {
  textContextFiles: UploadedFile[]
  imageDataUrls: string[]
} {
  const textContextFiles: UploadedFile[] = []
  const imageDataUrls: string[] = []
  for (const f of files) {
    if (f.type.startsWith('image/') && f.content.startsWith('data:image')) {
      imageDataUrls.push(f.content)
    } else {
      textContextFiles.push(f)
    }
  }
  return { textContextFiles, imageDataUrls }
}

export function buildAttachedFilesContextSection(files: UploadedFile[]): string {
  if (files.length === 0) return ''
  const parts = files.map((file) => {
    const body =
      file.content.length > MAX_CHARS_PER_FILE_BODY
        ? `${file.content.slice(0, MAX_CHARS_PER_FILE_BODY)}${TRUNCATION_NOTE}`
        : file.content
    return `File: ${file.name} (${file.type})\nContent: ${body}\n`
  })
  let joined = parts.join('\n')
  if (joined.length > MAX_TOTAL_FILES_CONTEXT_CHARS) {
    joined = joined.slice(0, MAX_TOTAL_FILES_CONTEXT_CHARS) + '\n[… further attachments omitted …]'
  }
  return `\n\nAttached Files:\n${joined}`
}

/**
 * Final trim so system + user message stays under ~modelWindow - 1k (safety margin).
 */
export function truncatePromptToContextWindow(prompt: string): string {
  const window = getModelContextWindowTokens()
  const desired = getDesiredMaxCompletionTokens()
  const margin = 1024
  const maxPromptTokens = Math.max(4096, window - desired - margin)
  const maxChars = Math.max(0, maxPromptTokens * 4)
  if (prompt.length <= maxChars) return prompt
  return prompt.slice(0, maxChars) + '\n\n[… Prompt truncated to fit the model context window. …]'
}
