import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FileAnalysisDialog } from './FileAnalysisDialog'
import type { UploadedFile } from '@/lib/types'

const { analyzeFileMock } = vi.hoisted(() => ({
  analyzeFileMock: vi.fn(),
}))

vi.mock('@/lib/fileAnalysis', () => ({
  analyzeFile: (...args: unknown[]) => analyzeFileMock(...args),
}))

const file: UploadedFile = {
  id: 'f1',
  name: 'doc.txt',
  type: 'text/plain',
  size: 12,
  content: 'sample content',
  uploadedAt: Date.now(),
}

describe('FileAnalysisDialog', () => {
  beforeEach(() => {
    analyzeFileMock.mockResolvedValue({
      summary: 'Summary',
      insights: ['one'],
      metadata: { wordCount: 2, lineCount: 1 },
      recommendations: ['r'],
      qualityScore: 82,
    })
  })

  it('runs analysis and shows results', async () => {
    const user = userEvent.setup()
    render(
      <FileAnalysisDialog open file={file} onOpenChange={vi.fn()} />
    )
    await user.click(screen.getByRole('button', { name: /Start Analysis/i }))
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument()
    })
    expect(analyzeFileMock).toHaveBeenCalledWith(file)
  })

  it('shows full metadata tabs and re-analyze', async () => {
    const user = userEvent.setup()
    analyzeFileMock.mockResolvedValue({
      summary: 'Long summary text',
      insights: ['a', 'b'],
      metadata: {
        wordCount: 100,
        lineCount: 10,
        characterCount: 500,
        estimatedReadTime: '2 min',
        detectedLanguage: 'en',
        sentiment: 'neutral' as const,
      },
      recommendations: ['do this'],
      qualityScore: 45,
    })
    render(<FileAnalysisDialog open file={file} onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Start Analysis/i }))
    await waitFor(() => screen.getByText(/Needs Improvement/i))
    await user.click(screen.getByRole('tab', { name: /Metadata/i }))
    expect(screen.getByText('500')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Suggestions/i }))
    expect(screen.getByText('do this')).toBeInTheDocument()
    const callsBefore = analyzeFileMock.mock.calls.length
    await user.click(screen.getByRole('button', { name: /Re-analyze/i }))
    expect(analyzeFileMock.mock.calls.length).toBeGreaterThan(callsBefore)
  })

  it('handles analyze errors', async () => {
    const user = userEvent.setup()
    const err = new Error('fail')
    analyzeFileMock.mockRejectedValueOnce(err)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<FileAnalysisDialog open file={file} onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Start Analysis/i }))
    await waitFor(() => expect(analyzeFileMock).toHaveBeenCalled())
    spy.mockRestore()
  })

  it('describes empty file state', () => {
    render(<FileAnalysisDialog open file={null} onOpenChange={vi.fn()} />)
    expect(screen.getByText(/No file selected/i)).toBeInTheDocument()
  })

  it('closes from footer when analysis is present', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onOpenChange = vi.fn()
    render(<FileAnalysisDialog open file={file} onOpenChange={onOpenChange} />)
    await user.click(screen.getByRole('button', { name: /Start Analysis/i }))
    await waitFor(() => screen.getByRole('heading', { name: 'Summary' }))
    const dialog = screen.getAllByRole('dialog')[0]
    await user.click(within(dialog).getAllByRole('button', { name: /^Close$/i }).pop()!)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
