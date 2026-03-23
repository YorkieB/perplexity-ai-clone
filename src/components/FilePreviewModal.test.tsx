import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { FilePreviewModal } from './FilePreviewModal'
import type { UploadedFile } from '@/lib/types'

describe('FilePreviewModal', () => {
  it('returns null when file is null', () => {
    const { container } = render(
      <FilePreviewModal file={null} open onOpenChange={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders image preview for image files', async () => {
    const file: UploadedFile = {
      id: '1',
      name: 'a.png',
      type: 'image/png',
      size: 8,
      content: 'data:image/png;base64,AAAA',
      uploadedAt: Date.now(),
    }
    render(<FilePreviewModal file={file} open onOpenChange={vi.fn()} />)
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'a.png' })).toBeInTheDocument()
    })
  })

  it('renders text preview for text content', () => {
    const file: UploadedFile = {
      id: '2',
      name: 't.txt',
      type: 'text/plain',
      size: 3,
      content: 'hi',
      uploadedAt: Date.now(),
    }
    render(<FilePreviewModal file={file} open onOpenChange={vi.fn()} />)
    expect(screen.getByText('hi')).toBeInTheDocument()
  })

  it('shows PDF placeholder', () => {
    const pdf: UploadedFile = {
      id: '3',
      name: 'x.pdf',
      type: 'application/pdf',
      size: 1,
      content: '',
      uploadedAt: Date.now(),
    }
    render(<FilePreviewModal file={pdf} open onOpenChange={vi.fn()} />)
    expect(screen.getByText(/PDF preview is not available/i)).toBeInTheDocument()
  })

  it('shows generic fallback for unknown types', () => {
    const other: UploadedFile = {
      id: '4',
      name: 'b.bin',
      type: 'application/octet-stream',
      size: 1,
      content: '',
      uploadedAt: Date.now(),
    }
    render(<FilePreviewModal file={other} open onOpenChange={vi.fn()} />)
    expect(screen.getByText(/Preview not available for this file type/i)).toBeInTheDocument()
  })

  it('download triggers anchor click', async () => {
    const user = userEvent.setup()
    const appendSpy = vi.spyOn(document.body, 'appendChild')
    const removeSpy = vi.spyOn(document.body, 'removeChild')
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const file: UploadedFile = {
      id: '5',
      name: 'f.txt',
      type: 'text/plain',
      size: 1,
      content: 'data',
      uploadedAt: Date.now(),
    }
    render(<FilePreviewModal file={file} open onOpenChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /Download/i }))

    expect(clickSpy).toHaveBeenCalled()
    appendSpy.mockRestore()
    removeSpy.mockRestore()
    clickSpy.mockRestore()
  })

  it('closes via footer Close button', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    const onOpenChange = vi.fn()
    const file: UploadedFile = {
      id: '6',
      name: 'n.txt',
      type: 'text/plain',
      size: 1,
      content: 'z',
      uploadedAt: Date.now(),
    }
    render(<FilePreviewModal file={file} open onOpenChange={onOpenChange} />)
    const dialog = screen.getByRole('dialog')
    const closeBtn = within(dialog).getAllByRole('button', { name: /^Close$/i }).pop()!
    await user.click(closeBtn)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
