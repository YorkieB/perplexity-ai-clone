import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const callLlmMock = vi.hoisted(() => vi.fn())

vi.mock('./llm', () => ({
  llmPrompt: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, s, i) => acc + s + String(values[i] ?? ''), ''),
  callLlm: (...args: unknown[]) => callLlmMock(...(args as [string, string, boolean?])),
}))

import type { FocusMode } from './types'
import {
  executeModelCouncil,
  executeWebSearch,
  generateFollowUpQuestions,
} from './api'

describe('executeWebSearch', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [
            {
              url: 'https://example.com/page',
              title: 'T',
              content: 'snippet',
              score: 0.9,
            },
          ],
        }),
      } as Response)
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('returns SearchError when API key missing', async () => {
    vi.stubEnv('VITE_TAVILY_API_KEY', '')
    const out = await executeWebSearch('q')
    expect(out && 'error' in out && out.error).toBe(true)
  })

  it('maps Tavily results to Source list', async () => {
    vi.stubEnv('VITE_TAVILY_API_KEY', 'secret')
    const out = await executeWebSearch('hello', 'all', false)
    expect(Array.isArray(out)).toBe(true)
    if (Array.isArray(out)) {
      expect(out[0].domain).toBe('example.com')
      expect(out[0].confidence).toBe(90)
    }
  })

  it.each<[FocusMode, string]>([
    ['academic', 'arxiv.org'],
    ['reddit', 'reddit.com'],
    ['youtube', 'youtube.com'],
    ['news', 'breaking'],
    ['code', 'github.com'],
    ['all', 'hello'],
  ])('applies focus modifier for %s', async (mode, needle) => {
    vi.stubEnv('VITE_TAVILY_API_KEY', 'secret')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      } as Response)
    )
    await executeWebSearch('hello', mode, false)
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.query).toContain(needle)
    expect(body.search_depth).toBe('basic')
    expect(body.max_results).toBe(6)
  })

  it('uses deep research Tavily params when requested', async () => {
    vi.stubEnv('VITE_TAVILY_API_KEY', 'secret')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ results: [] }),
      } as Response)
    )
    await executeWebSearch('q', 'all', true)
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.search_depth).toBe('advanced')
    expect(body.max_results).toBe(12)
  })

  it('returns SearchError on HTTP failure', async () => {
    vi.stubEnv('VITE_TAVILY_API_KEY', 'secret')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'err',
      } as Response)
    )
    const out = await executeWebSearch('q')
    expect(out && 'error' in out && out.error).toBe(true)
  })

  it('returns SearchError on network throw', async () => {
    vi.stubEnv('VITE_TAVILY_API_KEY', 'secret')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net')))
    const out = await executeWebSearch('q')
    expect(out && 'error' in out && out.error).toBe(true)
  })
})

describe('generateFollowUpQuestions', () => {
  beforeEach(() => {
    callLlmMock.mockReset()
  })

  it('parses questions array from LLM JSON', async () => {
    callLlmMock.mockResolvedValue(
      JSON.stringify({ questions: ['a', 'b', 'c', 'd'] })
    )
    const qs = await generateFollowUpQuestions('q', 'resp', [
      { url: 'u', title: 'Src A', snippet: 's' },
    ])
    expect(qs).toEqual(['a', 'b', 'c'])
    const prompt = callLlmMock.mock.calls[0][0] as string
    expect(prompt).toContain('Src A')
  })

  it('returns empty array on invalid JSON shape', async () => {
    callLlmMock.mockResolvedValue(JSON.stringify({}))
    const qs = await generateFollowUpQuestions('q', 'resp', [])
    expect(qs).toEqual([])
  })

  it('returns empty array on LLM failure', async () => {
    callLlmMock.mockRejectedValue(new Error('fail'))
    const qs = await generateFollowUpQuestions('q', 'resp', [])
    expect(qs).toEqual([])
  })
})

describe('executeModelCouncil', () => {
  beforeEach(() => {
    callLlmMock.mockReset()
  })

  it('aggregates model responses and convergence JSON', async () => {
    callLlmMock
      .mockResolvedValueOnce('answer-a')
      .mockResolvedValueOnce('answer-b')
      .mockResolvedValueOnce(
        JSON.stringify({
          score: 77,
          commonThemes: ['t1'],
          divergentPoints: ['d1'],
        })
      )

    const result = await executeModelCouncil(
      'query',
      'ctx',
      '',
      'sys',
      ['m1', 'm2']
    )
    expect(result.models).toHaveLength(2)
    expect(result.convergence.score).toBe(77)
    expect(result.convergence.commonThemes).toEqual(['t1'])
  })

  it('uses default models when list empty', async () => {
    callLlmMock
      .mockResolvedValue('x')
      .mockResolvedValue('y')
      .mockResolvedValue(
        JSON.stringify({ score: 1, commonThemes: [], divergentPoints: [] })
      )
    await executeModelCouncil('q', '', '', '', [])
    expect(callLlmMock).toHaveBeenCalled()
  })

  it('returns error placeholder content when a model call fails', async () => {
    callLlmMock
      .mockRejectedValueOnce(new Error('bad'))
      .mockResolvedValueOnce('ok')
      .mockResolvedValue(
        JSON.stringify({ score: 0, commonThemes: [], divergentPoints: [] })
      )
    const result = await executeModelCouncil('q', '', '', '', ['m1', 'm2'])
    expect(result.models[0].content).toContain('Error:')
  })

  it('falls back convergence to zeros when analysis JSON fails', async () => {
    callLlmMock
      .mockResolvedValueOnce('a')
      .mockResolvedValueOnce('b')
      .mockRejectedValueOnce(new Error('parse'))
    const result = await executeModelCouncil('q', '', '', '', ['a', 'b'])
    expect(result.convergence.score).toBe(0)
    expect(result.convergence.commonThemes).toEqual([])
  })

  it('uses context-branch wording when contextSection is non-empty', async () => {
    callLlmMock.mockResolvedValue('x').mockResolvedValue('y').mockResolvedValue(
      JSON.stringify({ score: 0, commonThemes: [], divergentPoints: [] })
    )
    await executeModelCouncil('q', 'web results here', '', '', ['only'])
    const prompt = callLlmMock.mock.calls[0][0] as string
    expect(prompt).toContain('web search results')
  })

  it('uses file-branch when only fileContext is set', async () => {
    callLlmMock
      .mockResolvedValueOnce('a')
      .mockResolvedValueOnce('b')
      .mockResolvedValue(
        JSON.stringify({ score: 1, commonThemes: ['t'], divergentPoints: ['d'] })
      )
    await executeModelCouncil('q', '', 'FILE_BLOCK', '', ['x', 'y'])
    const prompt = callLlmMock.mock.calls[0][0] as string
    expect(prompt).toContain('file content')
  })

  it('uses default convergence fields when JSON omits optional arrays', async () => {
    callLlmMock
      .mockResolvedValueOnce('a')
      .mockResolvedValueOnce('b')
      .mockResolvedValue(JSON.stringify({ score: 42 }))
    const r = await executeModelCouncil('q', '', '', '', ['a', 'b'])
    expect(r.convergence.score).toBe(42)
    expect(r.convergence.commonThemes).toEqual([])
    expect(r.convergence.divergentPoints).toEqual([])
  })
})
