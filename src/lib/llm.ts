/**
 * Chat completions via same-origin POST /api/llm (proxied by Vite during dev/preview
 * so the OpenAI key can live in OPENAI_API_KEY without CORS issues).
 *
 * callLlm        — standard blocking call, returns full string
 * callLlmStream  — streaming SSE, yields text delta chunks as an AsyncGenerator
 */

export type ChatUserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } }

export function llmPrompt(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), '')
}

export async function callLlm(
  prompt: string,
  model: string,
  jsonMode = false
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: prompt },
    ],
    temperature: 1,
    max_tokens: 4096,
  }

  if (jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  const response = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status} — ${text}`)
  }

  const data = JSON.parse(text) as {
    error?: { message?: string }
    choices?: Array<{ message?: { content?: string } }>
  }

  if (data.error?.message) {
    throw new Error(data.error.message)
  }

  const content = data.choices?.[0]?.message?.content
  if (content === undefined || content === null) {
    throw new Error('LLM response missing message content')
  }
  return content
}

export interface LlmStreamOptions {
  signal?: AbortSignal
  systemPrompt?: string
  userContentParts?: ChatUserContentPart[]
}

export interface LlmStreamDelta {
  content?: string
}

/**
 * Streaming variant — yields delta objects as they arrive via SSE.
 * Supports both simple `(prompt, model, signal?)` and rich `(prompt, model, opts?)` signatures.
 */
export async function* callLlmStream(
  prompt: string,
  model: string,
  signalOrOpts?: AbortSignal | LlmStreamOptions
): AsyncGenerator<LlmStreamDelta> {
  const opts: LlmStreamOptions =
    signalOrOpts instanceof AbortSignal ? { signal: signalOrOpts } : (signalOrOpts ?? {})

  const userContent: unknown = opts.userContentParts ?? prompt

  const response = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: opts.signal,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: opts.systemPrompt ?? 'You are a helpful assistant.' },
        { role: 'user', content: userContent },
      ],
      temperature: 1,
      max_tokens: 4096,
      stream: true,
    }),
  })

  if (!response.ok || !response.body) {
    const text = await response.text()
    throw new Error(`LLM stream failed: ${response.status} — ${text}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (!trimmed.startsWith('data: ')) continue

        try {
          const json = JSON.parse(trimmed.slice(6)) as {
            choices?: Array<{ delta?: { content?: string } }>
          }
          const content = json.choices?.[0]?.delta?.content
          if (content) yield { content }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
