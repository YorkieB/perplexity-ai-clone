import { beforeEach, describe, expect, it, vi } from 'vitest'
import { callLlm, llmPrompt } from './llm'

describe('llmPrompt', () => {
  it('concatenates template parts and values', () => {
    expect(llmPrompt`x ${1} y ${undefined} z`).toBe('x 1 y  z')
  })
})

describe('callLlm', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'ok' } }],
          }),
      } as Response)
    )
  })

  it('POSTs to /api/llm and returns assistant content', async () => {
    await expect(callLlm('hello', 'gpt-4o-mini')).resolves.toBe('ok')
    expect(fetch).toHaveBeenCalledWith(
      '/api/llm',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    )
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string)
    expect(body.messages[1].content).toBe('hello')
    expect(body.model).toBe('gpt-4o-mini')
  })

  it('adds json response_format when jsonMode is true', async () => {
    await callLlm('j', 'm', true)
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string)
    expect(body.response_format).toEqual({ type: 'json_object' })
  })

  it('throws on non-ok HTTP response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'oops',
      } as Response)
    )
    await expect(callLlm('a', 'b')).rejects.toThrow('LLM request failed: 500')
  })

  it('throws on OpenAI-style error payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ error: { message: 'bad key' } }),
      } as Response)
    )
    await expect(callLlm('a', 'b')).rejects.toThrow('bad key')
  })

  it('throws when message content is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => JSON.stringify({ choices: [{}] }),
      } as Response)
    )
    await expect(callLlm('a', 'b')).rejects.toThrow('missing message content')
  })
})
