/**
 * Some reasoning models (e.g. DeepSeek-R1 style) emit a think block inside the normal
 * `content` stream instead of (or in addition to) `reasoning_content` deltas.
 */
const OPEN = '<' + 'think' + '>'
const CLOSE = '<' + '/' + 'think' + '>'

export interface SplitThinkingResult {
  /** Visible answer (tags and thinking body stripped from content). */
  readonly answer: string
  /** Combined API reasoning stream + text inside think tags. */
  readonly thinking: string
  /** True while the closing tag has not arrived yet. */
  readonly insideThinkingBlock: boolean
}

/**
 * Merges upstream `reasoning` deltas with optional `think`…`/think` blocks embedded in `content`.
 */
export function splitThinkingFromModelContent(
  rawContent: string,
  apiReasoning: string
): SplitThinkingResult {
  const openIdx = rawContent.indexOf(OPEN)
  if (openIdx === -1) {
    return {
      answer: rawContent,
      thinking: apiReasoning.trim(),
      insideThinkingBlock: false,
    }
  }

  const start = openIdx + OPEN.length
  const closeIdx = rawContent.indexOf(CLOSE, start)
  const api = apiReasoning.trim()

  if (closeIdx === -1) {
    const inTag = rawContent.slice(start)
    const thinking = [api, inTag].filter(Boolean).join('\n').trim()
    return {
      answer: '',
      thinking,
      insideThinkingBlock: true,
    }
  }

  const inTag = rawContent.slice(start, closeIdx)
  const after = rawContent.slice(closeIdx + CLOSE.length)
  const thinking = [api, inTag].filter(Boolean).join('\n\n').trim()

  return {
    answer: after,
    thinking,
    insideThinkingBlock: false,
  }
}
