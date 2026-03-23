import { render, screen, waitFor } from '@testing-library/react'
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
})
