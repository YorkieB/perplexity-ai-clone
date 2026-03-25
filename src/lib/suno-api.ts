/**
 * Suno API client for music generation.
 * Submit prompt → poll taskId → return audio URL.
 */

export interface SunoTrack {
  id: string
  audioUrl: string
  title: string
  tags: string
  duration: number
}

export interface SunoGenerateOptions {
  style?: string
  instrumental?: boolean
}

export async function submitSunoGeneration(
  prompt: string,
  options?: SunoGenerateOptions,
): Promise<string> {
  const body: Record<string, unknown> = {
    prompt,
    customMode: Boolean(options?.style),
    instrumental: options?.instrumental ?? false,
    model: 'V4_5ALL',
  }
  if (options?.style) {
    body.style = options.style
    body.title = prompt.slice(0, 80)
  }

  const res = await fetch('/api/suno/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Suno generation failed: ${res.status} — ${text}`)
  }
  const data = await res.json() as { data?: { taskId?: string }; code?: number; msg?: string }
  if (!data.data?.taskId) throw new Error(data.msg || 'No taskId returned from Suno')
  return data.data.taskId
}

export async function pollSunoStatus(
  taskId: string,
): Promise<{ status: string; tracks: SunoTrack[] }> {
  const res = await fetch(`/api/suno/status?taskId=${encodeURIComponent(taskId)}`)
  if (!res.ok) throw new Error(`Suno status poll failed: ${res.status}`)
  const data = await res.json() as {
    data?: {
      status?: string
      response?: { data?: Array<{ id: string; audio_url: string; title: string; tags: string; duration: number }> }
    }
  }
  const status = data.data?.status || 'UNKNOWN'
  const tracks: SunoTrack[] = (data.data?.response?.data || []).map(t => ({
    id: t.id,
    audioUrl: t.audio_url,
    title: t.title,
    tags: t.tags,
    duration: t.duration,
  }))
  return { status, tracks }
}

export async function generateMusic(
  prompt: string,
  options?: SunoGenerateOptions,
): Promise<SunoTrack[]> {
  const taskId = await submitSunoGeneration(prompt, options)

  const maxAttempts = 40 // ~3.5 minutes with 5s intervals
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000))
    const { status, tracks } = await pollSunoStatus(taskId)
    if (status === 'SUCCESS' && tracks.length > 0) return tracks
    if (status === 'FAILED' || status === 'ERROR') throw new Error(`Suno generation failed with status: ${status}`)
  }
  throw new Error('Suno generation timed out after 3.5 minutes')
}
