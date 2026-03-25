/**
 * Client-side API for OpenAI image generation (gpt-image-1),
 * image editing (gpt-image-1.5), and video generation (Sora).
 * All calls go through same-origin proxy routes so the API key stays server-side.
 */

export interface GenerateImageOpts {
  size?: '1024x1024' | '1024x1536' | '1536x1024'
  quality?: 'low' | 'medium' | 'high' | 'auto'
  model?: string
}

export interface EditImageOpts {
  mask?: Blob
  quality?: 'low' | 'medium' | 'high' | 'auto'
  size?: '1024x1024' | '1024x1536' | '1536x1024'
  model?: string
}

export interface CreateVideoOpts {
  seconds?: 4 | 8 | 12
  size?: '720x1280' | '1280x720' | '1024x1792' | '1792x1024'
  model?: 'sora-2' | 'sora-2-pro'
}

export interface VideoJob {
  id: string
  status: 'queued' | 'in_progress' | 'completed' | 'failed'
  progress: number
  error?: { code: string; message: string }
}

function base64ToBlob(base64: string, mime = 'image/png'): Blob {
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

export async function generateImage(
  prompt: string,
  opts: GenerateImageOpts = {},
): Promise<string> {
  const body = {
    model: opts.model || 'gpt-image-1',
    prompt,
    n: 1,
    size: opts.size || '1024x1024',
    quality: opts.quality || 'high',
  }

  const res = await fetch('/api/images/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
    throw new Error(err?.error?.message || `Image generation failed (${res.status})`)
  }

  const json = await res.json()
  const b64 = json?.data?.[0]?.b64_json
  if (!b64) throw new Error('No image data returned from API.')
  return `data:image/png;base64,${b64}`
}

export async function editImage(
  imageBase64: string,
  prompt: string,
  opts: EditImageOpts = {},
): Promise<string> {
  const pure = imageBase64.replace(/^data:[^;]+;base64,/, '')
  const imageBlob = base64ToBlob(pure, 'image/png')

  const form = new FormData()
  form.append('model', opts.model || 'gpt-image-1')
  form.append('image', imageBlob, 'image.png')
  form.append('prompt', prompt)
  if (opts.quality) form.append('quality', opts.quality)
  if (opts.size) form.append('size', opts.size)
  if (opts.mask) form.append('mask', opts.mask, 'mask.png')

  const res = await fetch('/api/images/edit', {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
    throw new Error(err?.error?.message || `Image edit failed (${res.status})`)
  }

  const json = await res.json()
  const b64 = json?.data?.[0]?.b64_json
  if (!b64) throw new Error('No edited image data returned from API.')
  return `data:image/png;base64,${b64}`
}

export async function pollVideoStatus(videoId: string): Promise<VideoJob> {
  const res = await fetch(`/api/videos/status?id=${encodeURIComponent(videoId)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
    throw new Error(err?.error?.message || `Video status check failed (${res.status})`)
  }
  return res.json()
}

export async function downloadVideoContent(videoId: string): Promise<string> {
  const res = await fetch(`/api/videos/content?id=${encodeURIComponent(videoId)}`)
  if (!res.ok) throw new Error(`Video download failed (${res.status})`)
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export async function createVideo(
  prompt: string,
  opts: CreateVideoOpts = {},
  onProgress?: (progress: number) => void,
): Promise<string> {
  const body = {
    model: opts.model || 'sora-2',
    prompt,
    seconds: String(opts.seconds || 4),
    size: opts.size || '1280x720',
  }

  const res = await fetch('/api/videos/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
    throw new Error(err?.error?.message || `Video creation failed (${res.status})`)
  }

  const job: VideoJob = await res.json()
  if (!job.id) throw new Error('No video job ID returned.')

  for (let i = 0; i < 600; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const status = await pollVideoStatus(job.id)
    onProgress?.(status.progress ?? 0)

    if (status.status === 'completed') {
      return downloadVideoContent(job.id)
    }
    if (status.status === 'failed') {
      throw new Error(status.error?.message || 'Video generation failed.')
    }
  }
  throw new Error('Video generation timed out after 30 minutes.')
}
