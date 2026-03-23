import { afterEach, beforeEach, describe, expect, it, vi, beforeAll, afterAll } from 'vitest'
import {
  formatFileSize,
  formatTimestamp,
  generateThreadTitle,
  processFile,
} from './helpers'

describe('generateThreadTitle', () => {
  it('returns short text unchanged', () => {
    expect(generateThreadTitle('hello')).toBe('hello')
  })

  it('truncates long text with ellipsis', () => {
    const long = 'a'.repeat(60)
    expect(generateThreadTitle(long)).toBe('a'.repeat(50) + '...')
  })
})

describe('formatTimestamp', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-15T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns Just now for very recent times', () => {
    const ts = Date.now() - 30_000
    expect(formatTimestamp(ts)).toBe('Just now')
  })

  it('returns minutes ago within an hour', () => {
    const ts = Date.now() - 5 * 60_000
    expect(formatTimestamp(ts)).toBe('5m ago')
  })

  it('returns hours ago within 24h', () => {
    const ts = Date.now() - 3 * 60 * 60_000
    expect(formatTimestamp(ts)).toBe('3h ago')
  })

  it('returns days ago within a week', () => {
    const ts = Date.now() - 2 * 24 * 60 * 60_000
    expect(formatTimestamp(ts)).toBe('2d ago')
  })

  it('returns locale date for times older than 7 days', () => {
    const ts = new Date('2025-01-01T00:00:00.000Z').getTime()
    expect(formatTimestamp(ts)).toMatch(/\d/)
  })
})

describe('formatFileSize', () => {
  it('formats bytes', () => {
    expect(formatFileSize(0)).toBe('0 Bytes')
    expect(formatFileSize(500)).toContain('Bytes')
  })

  it('formats KB', () => {
    expect(formatFileSize(2048)).toContain('KB')
  })

  it('formats MB', () => {
    expect(formatFileSize(2 * 1024 * 1024)).toContain('MB')
  })

  it('formats GB', () => {
    expect(formatFileSize(3 * 1024 ** 3)).toContain('GB')
  })
})

describe('processFile', () => {
  it('reads text file content', async () => {
    const file = new File(['hello world'], 'note.txt', { type: 'text/plain' })
    const out = await processFile(file)
    expect(out.name).toBe('note.txt')
    expect(out.content).toBe('hello world')
    expect(out.type).toBe('text/plain')
  })

  it('rejects oversized files', async () => {
    const huge = new File([new Uint8Array(11 * 1024 * 1024)], 'big.bin', {
      type: 'application/octet-stream',
    })
    await expect(processFile(huge)).rejects.toThrow(/10MB/)
  })

  it('rejects unsupported MIME types', async () => {
    const file = new File(['x'], 'x.exe', { type: 'application/x-msdownload' })
    await expect(processFile(file)).rejects.toThrow(/not supported/)
  })

  it('stores PDF placeholder content', async () => {
    const file = new File(['%PDF'], 'doc.pdf', { type: 'application/pdf' })
    const out = await processFile(file)
    expect(out.content).toContain('[PDF:')
  })

  it('reads image as data URL', async () => {
    const file = new File([new Uint8Array([255, 216, 255])], 'p.jpg', {
      type: 'image/jpeg',
    })
    const out = await processFile(file)
    expect(out.content).toMatch(/^data:image/)
  })

  describe('readFileAsDataURL error path', () => {
    const OriginalReader = globalThis.FileReader

    beforeAll(() => {
      globalThis.FileReader = class MockReader {
        onload: ((ev: ProgressEvent<FileReader>) => void) | null = null
        onerror: ((ev: ProgressEvent<FileReader>) => void) | null = null
        result: string | ArrayBuffer | null = null
        readAsDataURL() {
          queueMicrotask(() => {
            this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>)
          })
        }
      } as unknown as typeof FileReader
    })

    afterAll(() => {
      globalThis.FileReader = OriginalReader
    })

    it('rejects when FileReader errors', async () => {
      const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' })
      await expect(processFile(file)).rejects.toBeDefined()
    })
  })
})
