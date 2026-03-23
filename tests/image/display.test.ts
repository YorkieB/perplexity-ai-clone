import { describe, expect, it } from 'vitest'
import { altTextForGeneratedImage, displaySrcForGeneratedImage } from '@/lib/image/display'
import type { GeneratedImage } from '@/lib/image/types'

const base: GeneratedImage = {
  id: '1',
  promptSnapshot: 'a',
  width: 1,
  height: 1,
  mimeType: 'image/png',
}

describe('displaySrcForGeneratedImage', () => {
  it('prefers dataUrl', () => {
    expect(
      displaySrcForGeneratedImage({
        ...base,
        dataUrl: 'data:image/png;base64,QQ',
      })
    ).toBe('data:image/png;base64,QQ')
  })

  it('builds data URL from base64 and mimeType', () => {
    expect(
      displaySrcForGeneratedImage({
        ...base,
        base64: 'QQ',
      })
    ).toBe('data:image/png;base64,QQ')
  })

  it('falls back to url', () => {
    expect(
      displaySrcForGeneratedImage({
        ...base,
        url: 'https://example.com/image.png',
      })
    ).toBe('https://example.com/image.png')
  })
})

describe('altTextForGeneratedImage', () => {
  it('truncates long prompts', () => {
    const long = 'x'.repeat(200)
    const alt = altTextForGeneratedImage(long, 120)
    expect(alt.endsWith('…')).toBe(true)
    expect(alt.length).toBeLessThanOrEqual('Generated image: '.length + 120)
  })

  it('handles empty prompt', () => {
    expect(altTextForGeneratedImage('  ')).toBe('Generated image')
  })
})
