import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearImageGenerationCooldown, generateImagesViaApi } from '@/lib/image/generateImages'

describe('generateImagesViaApi', () => {
  beforeEach(() => {
    clearImageGenerationCooldown()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ images: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearImageGenerationCooldown()
  })

  it('returns normalized images with dataUrl from base64', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          images: [
            {
              id: 'a1',
              promptSnapshot: 'cat',
              width: 1024,
              height: 1024,
              mimeType: 'image/png',
              base64: 'AAA',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const out = await generateImagesViaApi({
      mode: 'generations',
      prompt: 'cat',
      size: '1024x1024',
      quality: 'standard',
      photoreal: false,
    })

    expect(out).toHaveLength(1)
    expect(out[0].dataUrl).toBe('data:image/png;base64,AAA')
    expect(out[0].id).toBe('a1')
  })

  it('maps 429 to RATE_LIMITED', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Too many' } }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await expect(
      generateImagesViaApi({
        mode: 'generations',
        prompt: 'x',
        size: '1024x1024',
        quality: 'standard',
        photoreal: false,
      })
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' })
  })

  it('applies client cooldown after a failed request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'bad' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await expect(
      generateImagesViaApi({
        mode: 'generations',
        prompt: 'x',
        size: '1024x1024',
        quality: 'standard',
        photoreal: false,
      })
    ).rejects.toMatchObject({ code: 'UNKNOWN' })

    await expect(
      generateImagesViaApi({
        mode: 'generations',
        prompt: 'x',
        size: '1024x1024',
        quality: 'standard',
        photoreal: false,
      })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
  })
})
