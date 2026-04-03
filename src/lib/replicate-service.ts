/**
 * Thin client for the Jarvis Replicate bridge (`python/jarvis_replicate`).
 *
 * Defaults to same-origin `/api/replicate/*` (proxied to `REPLICATE_BRIDGE_URL` in Vite/Electron).
 * Override with `VITE_REPLICATE_BRIDGE_URL` for a direct HTTP base (e.g. `http://127.0.0.1:18865`).
 */

const DEFAULT_RELATIVE_PREFIX = '/api/replicate'

function bridgeBaseUrl(): string {
  const raw = import.meta.env.VITE_REPLICATE_BRIDGE_URL
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return ''
  }
  return String(raw).replace(/\/$/, '')
}

function url(path: string): string {
  const base = bridgeBaseUrl()
  const p = path.startsWith('/') ? path : `/${path}`
  if (base) {
    return `${base}${p}`
  }
  return `${DEFAULT_RELATIVE_PREFIX}${p}`
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(url(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = (await res.json()) as { detail?: unknown }
      if (j.detail !== undefined) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch {
      /* ignore */
    }
    throw new Error(`Replicate bridge ${res.status}: ${detail}`)
  }
  return (await res.json()) as T
}

async function getJson<T>(pathWithQuery: string): Promise<T> {
  const res = await fetch(url(pathWithQuery))
  if (!res.ok) {
    throw new Error(`Replicate bridge ${res.status}: ${res.statusText}`)
  }
  return (await res.json()) as T
}

/** Result from image / video / TTS generation */
export interface ReplicateArtifactResult {
  url: string
  local_path?: string | null
  raw?: unknown
}

export interface ReplicateTranscribeResult {
  text: string
  raw?: unknown
}

export interface ReplicateSearchModelRow {
  name: string
  description: string
  latest_version_id: string | null
}

export interface ReplicateSearchModelsResult {
  results: ReplicateSearchModelRow[]
}

export interface GenerateImageInput {
  prompt: string
  /** Replicate model id, default flux-2-pro */
  model?: string
}

export interface TranscribeAudioInput {
  audio_url: string
}

export interface GenerateVideoInput {
  prompt: string
  image_url?: string | null
  model?: string
}

export interface SynthesizeSpeechInput {
  text: string
  voice?: string
}

export interface SearchModelsInput {
  query: string
}

export interface RunModelInput {
  model: string
  inputs: Record<string, unknown>
}

/**
 * Generate an image via Replicate (default: black-forest-labs/flux-2-pro).
 */
export async function generateImage(input: GenerateImageInput): Promise<ReplicateArtifactResult> {
  return postJson<ReplicateArtifactResult>('/generate-image', {
    prompt: input.prompt,
    model: input.model ?? 'black-forest-labs/flux-2-pro',
  })
}

/**
 * Transcribe audio from a public URL using OpenAI Whisper on Replicate.
 */
export async function transcribeAudio(input: TranscribeAudioInput): Promise<ReplicateTranscribeResult> {
  return postJson<ReplicateTranscribeResult>('/transcribe', { audio_url: input.audio_url })
}

/**
 * Generate a video (default WAN 2.1 i2v); pass `image_url` for image-conditioned video.
 */
export async function generateVideo(input: GenerateVideoInput): Promise<ReplicateArtifactResult> {
  return postJson<ReplicateArtifactResult>('/generate-video', {
    prompt: input.prompt,
    image_url: input.image_url ?? undefined,
    model: input.model ?? 'wan-video/wan-2.1-i2v-720p',
  })
}

/**
 * Synthesize speech with Kokoro TTS on Replicate.
 */
export async function synthesizeSpeech(input: SynthesizeSpeechInput): Promise<ReplicateArtifactResult> {
  return postJson<ReplicateArtifactResult>('/synthesize-speech', {
    text: input.text,
    voice: input.voice ?? 'af_heart',
  })
}

/**
 * Search Replicate's public model index (top 5).
 */
export async function searchModels(input: SearchModelsInput): Promise<ReplicateSearchModelsResult> {
  const q = encodeURIComponent(input.query.trim())
  return getJson<ReplicateSearchModelsResult>(`/search-models?q=${q}`)
}

/** Generic model run — returns raw Replicate output. */
export async function runModel(input: RunModelInput): Promise<{ output: unknown }> {
  return postJson<{ output: unknown }>('/run-model', {
    model: input.model,
    inputs: input.inputs,
  })
}

/** Bridge health — `token_configured` is true when `REPLICATE_API_TOKEN` is set in the bridge process. */
export interface ReplicateHealthResult {
  status: string
  service?: string
  token_configured?: boolean
}

export async function fetchReplicateHealth(): Promise<ReplicateHealthResult | null> {
  try {
    const res = await fetch(url('/health'))
    if (!res.ok) return null
    return (await res.json()) as ReplicateHealthResult
  } catch {
    return null
  }
}

export interface ReplicateCatalogRow {
  name: string
  description: string
}

/** Paginated catalog from Replicate (server-side); requires token on the bridge. */
export async function listModelsCatalog(maxTotal = 2000): Promise<{ results: ReplicateCatalogRow[]; count: number }> {
  const q = encodeURIComponent(String(maxTotal))
  return getJson<{ results: ReplicateCatalogRow[]; count: number }>(`/models?max_total=${q}`)
}
