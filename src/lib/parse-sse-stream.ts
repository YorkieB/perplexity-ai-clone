export interface ParseSseResult {
  /** Content (message) text deltas */
  contentDeltas: string[]
  /** Reasoning/thinking text deltas (o1, extended content, etc.) */
  reasoningDeltas: string[]
  /** Incomplete line left in buffer */
  rest: string
}

/**
 * Parse buffered SSE text: complete lines become deltas; incomplete last line stays in `rest`.
 * Supports both content and reasoning_content (e.g. OpenAI o1, extended APIs).
 */
export function parseSseLines(buffer: string): ParseSseResult {
  const lines = buffer.split('\n')
  const rest = lines.pop() ?? ''
  const contentDeltas: string[] = []
  const reasoningDeltas: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue
    const data = trimmed.slice(5).trim()
    if (data === '[DONE]') continue
    try {
      const json = JSON.parse(data) as {
        choices?: Array<{
          delta?: {
            content?: string | Array<{ type?: string; text?: string }>
            reasoning_content?: string
          }
        }>
      }
      const delta = json.choices?.[0]?.delta
      if (!delta) continue

      if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
        reasoningDeltas.push(delta.reasoning_content)
      }

      const c = delta.content
      if (typeof c === 'string' && c.length > 0) {
        contentDeltas.push(c)
      } else if (Array.isArray(c)) {
        for (const block of c) {
          if (block?.type === 'reasoning' && typeof block.text === 'string' && block.text.length > 0) {
            reasoningDeltas.push(block.text)
          } else if (block?.type === 'message' && typeof block.text === 'string' && block.text.length > 0) {
            contentDeltas.push(block.text)
          } else if (typeof block?.text === 'string' && block.text.length > 0) {
            contentDeltas.push(block.text)
          }
        }
      }
    } catch {
      /* skip malformed line */
    }
  }
  return { contentDeltas, reasoningDeltas, rest }
}
