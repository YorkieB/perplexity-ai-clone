import type { Message, Thread } from '@/lib/types'

/** Max length for a single embedded file excerpt in exports (avoid huge pastes). */
export const EXPORT_FILE_SNIPPET_MAX_CHARS = 4000

export function sanitizeFilenameBase(name: string, maxLen = 80): string {
  const cleaned = name.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').replace(/-+/g, '-')
  const base = cleaned.slice(0, maxLen).replace(/^-+|-+$/g, '')
  return base || 'conversation'
}

export function findLastAssistantMessage(messages: Message[]): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return messages[i]
  }
  return undefined
}

function formatSourcesMarkdown(sources: NonNullable<Message['sources']>): string {
  if (sources.length === 0) return ''
  const lines = sources.map((s, i) => `${i + 1}. [${s.title.replace(/]/g, '\\]')}](${s.url})`)
  return ['', '#### Sources', '', ...lines, ''].join('\n')
}

function assistantBodyToMarkdown(message: Message): string {
  if (message.isModelCouncil && message.modelResponses && message.modelResponses.length > 0) {
    return message.modelResponses
      .map((r) => `### ${r.model}\n\n${r.content}`)
      .join('\n\n---\n\n')
  }
  return message.content
}

function userMessageToMarkdown(message: Message): string {
  const parts: string[] = [message.content]
  if (message.files && message.files.length > 0) {
    const fileLines = message.files.map((f) => {
      const excerpt =
        f.content.length > EXPORT_FILE_SNIPPET_MAX_CHARS
          ? `${f.content.slice(0, EXPORT_FILE_SNIPPET_MAX_CHARS)}\n\n…[truncated]`
          : f.content
      return `#### Attachment: ${f.name} (${f.type})\n\n\`\`\`\n${excerpt}\n\`\`\``
    })
    parts.push('', '**Attached files**', ...fileLines)
  }
  return parts.join('\n\n')
}

/**
 * Markdown for a single assistant message (last answer export).
 */
export function assistantMessageToMarkdown(message: Message): string {
  const header = `# Answer\n\n`
  const body = assistantBodyToMarkdown(message)
  const sources = message.sources && message.sources.length > 0 ? formatSourcesMarkdown(message.sources) : ''
  return `${header}${body}${sources}`
}

/**
 * Full thread export as Markdown (Pages-lite, client-only).
 */
export function threadToMarkdown(thread: Thread, options?: { workspaceName?: string | null }): string {
  const exportedAt = new Date().toISOString()
  const lines: string[] = [
    `# ${thread.title}`,
    '',
    `_Exported ${exportedAt}_`,
    '',
  ]
  if (options?.workspaceName) {
    lines.push(`_Workspace: ${options.workspaceName}_`, '')
  }
  lines.push('---', '')

  for (const msg of thread.messages) {
    if (msg.role === 'user') {
      lines.push('## User', '', userMessageToMarkdown(msg), '', '---', '')
    } else {
      const src =
        msg.sources && msg.sources.length > 0 ? formatSourcesMarkdown(msg.sources) : ''
      lines.push('## Assistant', '', assistantBodyToMarkdown(msg), src, '', '---', '')
    }
  }

  return lines.join('\n').trimEnd() + '\n'
}

export function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.click()
  URL.revokeObjectURL(url)
}

export async function copyTextToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}
