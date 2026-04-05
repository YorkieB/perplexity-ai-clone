/**
 * Reliability tests for src/lib/api.ts (generateFollowUpQuestions)
 *
 * Ensures malformed/failed LLM follow-up generation paths emit explicit
 * telemetry before degrading to empty follow-up arrays.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

const callLlmMock = vi.fn()

vi.mock('../../src/lib/llm', () => {
  const formatTemplateValue = (value: unknown): string => {
    if (typeof value === 'string') return value
    if (typeof value === 'number') return `${value}`
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    if (value === null) return 'null'
    if (value === undefined) return 'undefined'

    try {
      return JSON.stringify(value)
    } catch {
      return '[unserializable]'
    }
  }

  return {
    callLlm: callLlmMock,
    llmPrompt: (strings: TemplateStringsArray, ...values: unknown[]) => {
      let out = ''
      for (let i = 0; i < strings.length; i += 1) {
        out += strings[i] ?? ''
        if (i < values.length) out += formatTemplateValue(values[i])
      }
      return out
    },
  }
})

afterEach(() => {
  vi.restoreAllMocks()
  callLlmMock.mockReset()
})

describe('generateFollowUpQuestions degraded-path telemetry', () => {
  it('warns and returns [] when LLM payload lacks questions array', async () => {
    callLlmMock.mockResolvedValueOnce('{"items":["q1"]}')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { generateFollowUpQuestions } = await import('../../src/lib/api')

    const result = await generateFollowUpQuestions('q', 'answer', [])

    expect(result).toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[API] Follow-up generation returned invalid payload shape'),
      expect.any(Object),
    )
  })

  it('logs error and returns [] when LLM call throws', async () => {
    callLlmMock.mockRejectedValueOnce(new Error('llm unavailable'))

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { generateFollowUpQuestions } = await import('../../src/lib/api')

    const result = await generateFollowUpQuestions('q', 'answer', [])

    expect(result).toEqual([])
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to generate follow-up questions:'),
      expect.any(Error),
    )
  })
})

describe('executeModelCouncil degraded-path telemetry', () => {
  it('warns and normalizes malformed convergence payload shape', async () => {
    callLlmMock
      .mockResolvedValueOnce('model output')
      .mockResolvedValueOnce('{"commonThemes":"not-array"}')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { executeModelCouncil } = await import('../../src/lib/api')

    const result = await executeModelCouncil('q', '', '', '', ['gpt-4o-mini'])

    expect(result.models).toHaveLength(1)
    expect(result.convergence).toEqual({
      score: 0,
      commonThemes: [],
      divergentPoints: [],
    })
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[API] Model council convergence payload missing expected shape; using normalized defaults.'),
      expect.any(Object),
    )
  })

  it('logs error and falls back when convergence JSON parse throws', async () => {
    callLlmMock
      .mockResolvedValueOnce('model output')
      .mockResolvedValueOnce('{not-json')

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { executeModelCouncil } = await import('../../src/lib/api')

    const result = await executeModelCouncil('q', '', '', '', ['gpt-4o-mini'])

    expect(result.models).toHaveLength(1)
    expect(result.convergence).toEqual({
      score: 0,
      commonThemes: [],
      divergentPoints: [],
    })
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to analyze convergence:'),
      expect.any(Error),
    )
  })
})

describe('executeWebSearch degraded-path telemetry', () => {
  it('warns and returns SearchError when provider payload misses results array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: vi.fn(async () => ({ items: [] })),
      }),
    )

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { executeWebSearch } = await import('../../src/lib/api')

    const result = await executeWebSearch('q')

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toBe(true)
      expect(result.message).toContain('invalid response payload')
    }
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[API] Tavily search returned invalid payload shape; expected results array.'),
      expect.any(Object),
    )
  })

  it('logs and returns SearchError when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('search network down')))

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { executeWebSearch } = await import('../../src/lib/api')

    const result = await executeWebSearch('q')

    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toBe(true)
      expect(result.message).toContain('Failed to perform web search')
    }
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('Web search error:'),
      expect.any(Error),
    )
  })

  it('drops unsafe or malformed result URLs and keeps valid web results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: vi.fn(async () => ({
          results: [
            {
              url: 'https://example.com/docs',
              title: 'Docs',
              content: 'safe result',
              score: 0.87,
            },
            {
              url: 'javascript:alert(1)',
              title: 'Danger',
              content: 'xss',
              score: 0.91,
            },
            {
              url: 'not a url',
              title: 'Broken',
              content: 'broken',
              score: 0.12,
            },
          ],
        })),
      }),
    )

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { executeWebSearch } = await import('../../src/lib/api')

    const result = await executeWebSearch('q')

    expect(Array.isArray(result)).toBe(true)
    if (Array.isArray(result)) {
      expect(result).toHaveLength(1)
      expect(result[0]?.url).toBe('https://example.com/docs')
      expect(result[0]?.domain).toBe('example.com')
      expect(result[0]?.confidence).toBe(87)
    }
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[API] Dropped 2 search results with invalid or unsafe URLs.'),
    )
  })

  it('returns empty source list when all provider results are unsafe or malformed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: vi.fn(async () => ({
          results: [
            { url: 'javascript:alert(1)', title: 'Danger', content: '', score: 0.2 },
            { url: 'not a url', title: 'Broken', content: '', score: 0.1 },
          ],
        })),
      }),
    )

    const { executeWebSearch } = await import('../../src/lib/api')
    const result = await executeWebSearch('q')

    expect(Array.isArray(result)).toBe(true)
    if (Array.isArray(result)) {
      expect(result).toEqual([])
    }
  })

})
