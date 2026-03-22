/**
 * Chat completions via same-origin POST /api/llm (proxied by Vite during dev/preview
 * so the OpenAI key can live in OPENAI_API_KEY without CORS issues).
 */
export function llmPrompt(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), '')
}

export type LlmChatRole = 'system' | 'user' | 'assistant'

export interface LlmChatMessage {
  role: LlmChatRole
  content: string
}

export interface CallLlmChatOptions {
  model: string
  messages: LlmChatMessage[]
  jsonMode?: boolean
}

async function postChatCompletion(body: Record<string, unknown>): Promise<string> {
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

export async function callLlm(prompt: string, model: string, jsonMode?: boolean): Promise<string>
export async function callLlm(options: CallLlmChatOptions): Promise<string>
export async function callLlm(
  promptOrOptions: string | CallLlmChatOptions,
  model?: string,
  jsonMode = false
): Promise<string> {
  if (typeof promptOrOptions === 'object' && promptOrOptions !== null && 'messages' in promptOrOptions) {
    const { model: m, messages, jsonMode: j = false } = promptOrOptions
    const body: Record<string, unknown> = {
      model: m,
      messages,
      temperature: 1,
      max_tokens: 4096,
    }
    if (j) {
      body.response_format = { type: 'json_object' }
    }
    return postChatCompletion(body)
  }

  const prompt = promptOrOptions as string
  const mod = model as string
  const body: Record<string, unknown> = {
    model: mod,
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

  return postChatCompletion(body)
}
