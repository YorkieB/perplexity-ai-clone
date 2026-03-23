import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { FileAttachment } from './FileAttachment'
import type { UploadedFile } from '@/lib/types'

const base: UploadedFile = {
  id: '1',
  name: 'doc.txt',
  type: 'text/plain',
  size: 10,
  content: 'hello',
  uploadedAt: Date.now(),
}

describe('FileAttachment', () => {
  it('renders text file icon and triggers preview', async () => {
    const user = userEvent.setup()
    const onPreview = vi.fn()
    render(<FileAttachment file={base} onPreview={onPreview} />)
    await user.click(screen.getByRole('button', { name: /doc\.txt/i }))
    expect(onPreview).toHaveBeenCalled()
  })

  it('renders image preview for data URLs', () => {
    const file: UploadedFile = {
      ...base,
      name: 'x.png',
      type: 'image/png',
      content: 'data:image/png;base64,AAAA',
    }
    const { container } = render(<FileAttachment file={file} />)
    expect(container.querySelector('img')).toBeTruthy()
  })

  it('renders default file icon for non-text, non-csv types', () => {
    render(
      <FileAttachment
        file={{ ...base, type: 'application/json', name: 'data.json' }}
      />
    )
    expect(screen.getByText('data.json')).toBeInTheDocument()
  })

  it('renders CSV icon', () => {
    render(
      <FileAttachment
        file={{ ...base, type: 'text/csv', name: 't.csv' }}
      />
    )
    expect(screen.getByText('t.csv')).toBeInTheDocument()
  })

  it('shows analyze and remove actions when handlers are provided', async () => {
    const user = userEvent.setup()
    const onAnalyze = vi.fn()
    const onRemove = vi.fn()
    render(
      <FileAttachment file={base} onAnalyze={onAnalyze} onRemove={onRemove} showRemove />
    )
    await user.click(screen.getByTitle('Analyze with AI'))
    const buttons = screen.getAllByRole('button')
    await user.click(buttons[buttons.length - 1])
    expect(onAnalyze).toHaveBeenCalled()
    expect(onRemove).toHaveBeenCalled()
  })
})
