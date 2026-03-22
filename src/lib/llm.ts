/**
 * Chat completions via same-origin POST /api/llm (proxied by Vite during dev/preview
 * so the OpenAI key can live in OPENAI_API_KEY without CORS issues).
 */
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
