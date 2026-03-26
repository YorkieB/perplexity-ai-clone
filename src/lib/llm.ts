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

/**
 * Returns extra headers needed to route a model to DigitalOcean Gradient inference.
 * Models with a `/` in the ID (e.g. `meta-llama/Llama-3.3-70B-Instruct`) are treated as DO models.
 */
function providerHeaders(model: string): Record<string, string> {
  if (model.includes('/')) {
    return { 'x-llm-provider': 'digitalocean' }
  }
  return {}
}

export function llmPrompt(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((acc, s, i) => {
    const v = values[i]
    if (v == null) return acc + s
    const str = typeof v === 'object' ? JSON.stringify(v) : `${v as string | number | boolean}`
    return acc + s + str
  }, '')
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
    headers: { 'Content-Type': 'application/json', ...providerHeaders(model) },
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

// ── Tool-calling support ────────────────────────────────────────────────────

export interface ToolCallFunction {
  name: string
  arguments: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: ToolCallFunction
}

export interface LlmToolMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: ToolCall[]
  tool_call_id?: string
  name?: string
}

export interface CallLlmToolsResult {
  content: string | null
  tool_calls?: ToolCall[]
  finishReason?: string
}

export interface CallLlmWithToolsOptions {
  signal?: AbortSignal
  temperature?: number
  max_tokens?: number
}

/**
 * Single-round chat completion with tool definitions.
 * Returns the assistant message, which may contain tool_calls instead of (or alongside) content.
 */
export async function callLlmWithTools(
  messages: LlmToolMessage[],
  model: string,
  tools?: Record<string, unknown>[],
  options?: CallLlmWithToolsOptions,
): Promise<CallLlmToolsResult> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options?.temperature ?? 0.7,
    max_tokens: options?.max_tokens ?? 4096,
  }

  if (tools && tools.length > 0) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  const response = await fetch('/api/llm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...providerHeaders(model) },
    signal: options?.signal,
    body: JSON.stringify(body),
  })

  const text = await response.text()
  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status} — ${text}`)
  }

  const data = JSON.parse(text) as {
    error?: { message?: string }
    choices?: Array<{
      message?: { content?: string | null; tool_calls?: ToolCall[] }
      finish_reason?: string
    }>
  }

  if (data.error?.message) throw new Error(data.error.message)

  const choice = data.choices?.[0]
  return {
    content: choice?.message?.content ?? null,
    tool_calls: choice?.message?.tool_calls,
    finishReason: choice?.finish_reason ?? undefined,
  }
}

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>

/**
 * Run a full tool-calling loop: call LLM, if it returns tool_calls execute them,
 * append results, call again. Repeats until the model stops calling tools or maxRounds is hit.
 */
export async function runToolLoop(
  messages: LlmToolMessage[],
  model: string,
  tools: Record<string, unknown>[],
  executor: ToolExecutor,
  options?: {
    maxRounds?: number
    signal?: AbortSignal
    onToolCall?: (name: string, args: Record<string, unknown>) => void
    temperature?: number
    max_tokens?: number
  },
): Promise<{ content: string; messages: LlmToolMessage[] }> {
  const maxRounds = options?.maxRounds ?? 30
  const conv = [...messages]

  for (let round = 0; round < maxRounds; round++) {
    const result = await callLlmWithTools(conv, model, tools, {
      signal: options?.signal,
      temperature: options?.temperature,
      max_tokens: options?.max_tokens,
    })

    if (!result.tool_calls || result.tool_calls.length === 0) {
      return { content: result.content ?? '', messages: conv }
    }

    conv.push({
      role: 'assistant',
      content: result.content,
      tool_calls: result.tool_calls,
    })

    for (const tc of result.tool_calls) {
      let args: Record<string, unknown> = {}
      try { args = JSON.parse(tc.function.arguments) } catch { /* */ }
      options?.onToolCall?.(tc.function.name, args)

      const output = await executor(tc.function.name, args)
      conv.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.function.name,
        content: output,
      })
    }
  }

  const last = [...conv].reverse().find(m => m.role === 'assistant' && m.content)
  return { content: last?.content ?? 'Reached maximum tool rounds.', messages: conv }
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
    headers: { 'Content-Type': 'application/json', ...providerHeaders(model) },
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
