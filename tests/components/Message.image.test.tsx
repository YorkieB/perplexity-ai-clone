/** @vitest-environment happy-dom */
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Message } from '@/components/Message'
import type { Message as MessageType } from '@/lib/types'

describe('Message generated images', () => {
  it('renders lazy images with alt from prompt snapshot', () => {
    const message: MessageType = {
      id: 'm1',
      role: 'assistant',
      content: '',
      createdAt: 0,
      generatedImages: [
        {
          id: 'img1',
          promptSnapshot: 'A calm lake at sunset',
          width: 256,
          height: 256,
          mimeType: 'image/png',
          base64:
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        },
      ],
    }
    render(<Message message={message} />)
    const img = screen.getByRole('img', { name: /generated image: a calm lake at sunset/i })
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('src')).toContain('data:image/png;base64,')
  })

  it('shows image prompt chip for user image modality', () => {
    const message: MessageType = {
      id: 'u1',
      role: 'user',
      content: 'Draw a cat',
      createdAt: 0,
      modality: 'image',
    }
    render(<Message message={message} />)
    expect(screen.getByText('Image prompt')).toBeTruthy()
  })
})
