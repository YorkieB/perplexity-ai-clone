import { beforeEach, describe, expect, it, vi } from 'vitest'

const callLlmMock = vi.hoisted(() => vi.fn())

vi.mock('./llm', () => ({
  llmPrompt: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((acc, s, i) => acc + s + String(values[i] ?? ''), ''),
  callLlm: (...args: unknown[]) => callLlmMock(...(args as [string, string, boolean?])),
}))

import { analyzeFile, analyzeMultipleFiles } from './fileAnalysis'
import type { UploadedFile } from './types'

describe('analyzeFile', () => {
  beforeEach(() => {
    callLlmMock.mockReset()
  })

  it('merges LLM analysis with basic metrics', async () => {
    callLlmMock.mockResolvedValue(
      JSON.stringify({
        summary: 'S',
        insights: ['i1'],
        metadata: { detectedLanguage: 'en', sentiment: 'neutral' as const },
        recommendations: ['r1'],
        qualityScore: 88,
      })
    )
    const file: UploadedFile = {
      id: '1',
      name: 'f.txt',
      type: 'text/plain',
      size: 100,
      content: 'hello world',
      uploadedAt: 1,
    }
    const out = await analyzeFile(file)
    expect(out.summary).toBe('S')
    expect(out.metadata.wordCount).toBeGreaterThan(0)
    expect(out.qualityScore).toBe(88)
  })

  it('truncates very long content in prompt path', async () => {
    callLlmMock.mockResolvedValue(
      JSON.stringify({
        summary: 'ok',
        insights: [],
        metadata: {},
        recommendations: [],
        qualityScore: 50,
      })
    )
    const long = 'x'.repeat(9000)
    await analyzeFile({
      id: '1',
      name: 'big.txt',
      type: 'text/plain',
      size: long.length,
      content: long,
      uploadedAt: 1,
    })
    const prompt = callLlmMock.mock.calls[0][0] as string
    expect(prompt).toContain('truncated')
  })

  it('estimates 1 min read time for a single word', async () => {
    callLlmMock.mockResolvedValue(
      JSON.stringify({
        summary: 'ok',
        insights: [],
        metadata: {},
        recommendations: [],
        qualityScore: 1,
      })
    )
    const out = await analyzeFile({
      id: '1',
      name: 'f.txt',
      type: 'text/plain',
      size: 4,
      content: 'word',
      uploadedAt: 1,
    })
    expect(out.metadata.estimatedReadTime).toBe('1 min')
  })

  it('estimates multiple minutes for longer text', async () => {
    callLlmMock.mockResolvedValue(
      JSON.stringify({
        summary: 'ok',
        insights: [],
        metadata: {},
        recommendations: [],
        qualityScore: 1,
      })
    )
    const words = Array.from({ length: 500 }, () => 'word').join(' ')
    const out = await analyzeFile({
      id: '1',
      name: 'f.txt',
      type: 'text/plain',
      size: 100,
      content: words,
      uploadedAt: 1,
    })
    expect(out.metadata.estimatedReadTime).toMatch(/mins/)
  })

  it('fills defaults when LLM omits fields', async () => {
    callLlmMock.mockResolvedValue('{}')
    const out = await analyzeFile({
      id: '1',
      name: 'f.txt',
      type: 'text/plain',
      size: 10,
      content: 'hi',
      uploadedAt: 1,
    })
    expect(out.summary).toContain('Analysis')
    expect(out.qualityScore).toBe(75)
  })
})

describe('analyzeMultipleFiles', () => {
  it('returns combined overview string', async () => {
    callLlmMock.mockResolvedValue('overview text')
    const text = await analyzeMultipleFiles([
      {
        id: '1',
        name: 'a.txt',
        type: 'text/plain',
        size: 4,
        content: 'aaaa',
        uploadedAt: 1,
      },
    ])
    expect(text).toBe('overview text')
  })
})
