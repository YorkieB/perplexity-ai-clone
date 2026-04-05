/**
 * A2E (video.a2e.ai) â€” all requests go through same-origin `/api/a2e/*` proxy
 * so the API key stays in server `.env` (Vite dev + Electron production).
 */
import type { A2EMediaType, A2EModelId, A2ETask, UploadedFile } from '@/lib/types'
import { A2E_STREAMING_API_ROOT, A2E_STREAMING_HELP, getA2eStreamingConsoleUrl } from '@/lib/a2e-streaming'
import {
  a2eHttp as a2eFetch,
  a2eAssertOk as assertOk,
  a2eParseJson as parseJson,
  a2eJsonBody,
  a2eReadJsonOrThrow,
  type A2eEnvelope,
} from '@/lib/a2e-http'

export interface A2EModelOption {
  id: string
  name: string
  description: string
}

/** Official A2E text-to-image `req_key` values (see Start Text-to-Image in A2E OpenAPI). */
export const A2E_TEXT_TO_IMAGE_REQ_KEYS: readonly { readonly value: 'high_aes_general_v21_L' | 'high_aes'; readonly label: string }[] = [
  { value: 'high_aes_general_v21_L', label: 'General style' },
  { value: 'high_aes', label: 'Manga style' },
]

/** localStorage key â€” QueryInput and chat T2I share this. */
export const A2E_T2I_REQ_KEY_STORAGE = 'a2e-t2i-req-key'

function logA2eDegradedPath(message: string, error: unknown): void {
  console.warn(`[A2E] ${message}`, error)
}

export function readStoredT2iReqKey(): 'high_aes_general_v21_L' | 'high_aes' {
  if (globalThis.window === undefined) return 'high_aes_general_v21_L'
  try {
    const v = globalThis.window.localStorage.getItem(A2E_T2I_REQ_KEY_STORAGE)
    if (v === 'high_aes' || v === 'high_aes_general_v21_L') return v
  } catch (error) {
    logA2eDegradedPath('Failed to read stored text-to-image req_key; using default.', error)
  }
  return 'high_aes_general_v21_L'
}

export const A2E_MODELS: A2EModelOption[] = [
  { id: 'a2e-text-to-image', name: 'A2E Â· Text to Image', description: 'Generate images from a text prompt' },
  { id: 'a2e-nano-banana', name: 'A2E Â· Gemini Image (Nano)', description: 'Gemini-powered image generation & editing' },
  { id: 'a2e-image-to-video', name: 'A2E Â· Image to Video', description: 'Animate a still image into a short video' },
  { id: 'a2e-talking-photo', name: 'A2E Â· Talking Photo', description: 'Animate a photo with your audio' },
  { id: 'a2e-talking-video', name: 'A2E Â· Talking Video', description: 'Drive a video with new audio + prompts' },
  { id: 'a2e-avatar-video', name: 'A2E Â· Avatar Lip-sync Video', description: 'AI avatar video with lip-sync from audio' },
  { id: 'a2e-tts', name: 'A2E Â· Text to Speech', description: 'Synthesize speech audio from text' },
  { id: 'a2e-voice-clone', name: 'A2E Â· Voice Clone Training', description: 'Train a custom voice from a sample URL' },
  { id: 'a2e-caption-removal', name: 'A2E Â· Caption Removal', description: 'Remove on-screen text from a video' },
  { id: 'a2e-dubbing', name: 'A2E Â· AI Dubbing', description: 'Translate / dub audio to another language' },
  { id: 'a2e-live-stream', name: 'A2E Â· Live Streaming', description: 'Interactive streaming avatars (see A2E docs)' },
  { id: 'a2e-virtual-try-on', name: 'A2E Â· Virtual Try-On', description: 'Four mask images: person, person mask, clothing, clothing mask' },
  { id: 'a2e-motion-transfer', name: 'A2E Â· Motion Transfer', description: 'Drive a video with a reference image (videoâ†’video)' },
  { id: 'a2e-face-swap', name: 'A2E Â· Face Swap', description: 'Swap a face image onto a video' },
  { id: 'a2e-watermark', name: 'A2E Â· Watermark', description: 'Add text or image watermark to media' },
  { id: 'a2e-custom-avatar', name: 'A2E Â· Custom Avatar (train)', description: 'Train a custom avatar from video or image URL' },
]

/** A2E OpenAPI "Start Text-to-Image" only documents two `req_key` values (no separate Flux key). */
export const A2E_T2I_REQ_KEY_DOCUMENTATION =
  'Official A2E OpenAPI lists `req_key` as: high_aes_general_v21_L (general) and high_aes (manga). There is no Flux enum in the published spec; newer backends may accept other keysâ€”check your A2E dashboard or refreshed API docs.'

export function isA2eEnabled(): boolean {
  return Boolean(import.meta.env.VITE_ENABLE_A2E)
}

export function isA2eModelId(id: string): id is A2EModelId {
  return id.startsWith('a2e-')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function transferUrlToStorage(url: string): Promise<string> {
  const res = await a2eFetch('/v1/tos/transferToStorage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: a2eJsonBody({ url }),
  })
  const json = await a2eReadJsonOrThrow<A2eEnvelope<{ url: string }>>(res)
  const data = assertOk(json)
  return data.url
}

type StatusHolder = { current_status?: string; status?: string; failed_message?: string; faild_message?: string }

function readFailedMsg(d: StatusHolder): string {
  return (d.failed_message || d.faild_message || '').trim()
}

function isTerminalStatus(s: string | undefined): boolean {
  if (!s) return false
  const t = s.toLowerCase()
  return t === 'completed' || t === 'failed' || t === 'success' || t === 'fail'
}

function isSuccessStatus(s: string | undefined): boolean {
  if (!s) return false
  const t = s.toLowerCase()
  return t === 'completed' || t === 'success'
}

function asA2eRecord(input: unknown): Record<string, unknown> {
  if (Array.isArray(input)) {
    const firstObj = input.find((it) => typeof it === 'object' && it !== null)
    if (firstObj && typeof firstObj === 'object') {
      return firstObj as Record<string, unknown>
    }
    return {}
  }
  if (typeof input === 'object' && input !== null) return input as Record<string, unknown>
  return {}
}

function toSafeString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function toSafeTrimmedString(value: unknown, fallback = ''): string {
  return toSafeString(value, fallback).trim()
}

/** A2E sometimes returns `_id`, sometimes `id` / `task_id` depending on endpoint version. */
export function extractA2TaskId(data: unknown): string {
  const d = asA2eRecord(data)
  const raw = d._id ?? d.id ?? d.task_id ?? d.taskId
  return toSafeTrimmedString(raw)
}

async function findTextToImageRowInList(id: string): Promise<Record<string, unknown> | null> {
  const res = await a2eFetch(`/v1/userText2image/allRecords?pageNum=1&pageSize=50`)
  if (!res.ok) {
    console.warn('[A2E] Text-to-image list lookup failed during polling fallback; returning null row.', {
      status: res.status,
      statusText: res.statusText,
      id,
    })
    return null
  }
  try {
    const json = await parseJson<A2eEnvelope<{ rows?: Record<string, unknown>[] }>>(res)
    const data = assertOk(json)
    const rows = data.rows ?? []
    return rows.find((r) => String(r._id ?? r.id) === id) ?? null
  } catch (error) {
    console.warn('[A2E] Text-to-image list lookup parsing failed during polling fallback; returning null row.', {
      id,
      error,
    })
    return null
  }
}

async function pollTextToImage(id: string): Promise<{ image_urls?: string[]; current_status?: string; failed_message?: string }> {
  if (!id) throw new Error('Missing text-to-image task id from A2E start response')

  for (let i = 0; i < 120; i++) {
    const res = await a2eFetch(`/v1/userText2image/${encodeURIComponent(id)}`)

    if (res.status === 404) {
      const row = await findTextToImageRowInList(id)
      if (row) {
        const st = toSafeString(row.current_status)
        if (isTerminalStatus(st)) {
          return {
            image_urls: row.image_urls as string[] | undefined,
            current_status: st,
            failed_message: readFailedMsg(row as StatusHolder),
          }
        }
      }
      await sleep(3000)
      continue
    }

    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = asA2eRecord(assertOk(json))
    const st = toSafeString(data.current_status)
    if (isTerminalStatus(st)) {
      return {
        image_urls: data.image_urls as string[] | undefined,
        current_status: st,
        failed_message: (data.failed_message as string) || '',
      }
    }
    await sleep(3000)
  }
  throw new Error('Text-to-image timed out')
}

async function pollNanoBanana(id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 120; i++) {
    const res = await a2eFetch(`/v1/userNanoBanana/${encodeURIComponent(id)}`)
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = assertOk(json)
    const st = toSafeString(data.current_status)
    if (isTerminalStatus(st)) return data
    await sleep(3000)
  }
  throw new Error('Nano Banana timed out')
}

async function pollImageToVideo(id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 200; i++) {
    const res = await a2eFetch(`/v1/userImage2Video/${encodeURIComponent(id)}`)
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = assertOk(json)
    const st = toSafeString(data.current_status)
    if (isTerminalStatus(st)) return data
    await sleep(3000)
  }
  throw new Error('Image-to-video timed out')
}

async function pollTalkingPhoto(id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 200; i++) {
    const res = await a2eFetch(`/v1/talkingPhoto/${encodeURIComponent(id)}`)
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = assertOk(json)
    const st = toSafeString(data.current_status)
    if (isTerminalStatus(st)) return data
    await sleep(3000)
  }
  throw new Error('Talking photo timed out')
}

async function pollTalkingVideoList(id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 200; i++) {
    const res = await a2eFetch(`/v1/talkingVideo/allRecords?pageNum=1&pageSize=20`)
    const json = await a2eReadJsonOrThrow<A2eEnvelope<{ rows: Record<string, unknown>[] }>>(res)
    const data = assertOk(json)
    const row = data.rows?.find((r) => String(r._id) === id)
    if (row) {
      const st = toSafeString(row.current_status)
      if (isTerminalStatus(st)) return row
    }
    await sleep(3000)
  }
  throw new Error('Talking video timed out')
}

async function pollCaptionRemoval(id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 200; i++) {
    const res = await a2eFetch(`/v1/userCaptionRemoval/${encodeURIComponent(id)}`)
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = assertOk(json)
    const st = toSafeString(data.current_status)
    if (isTerminalStatus(st)) return data
    await sleep(3000)
  }
  throw new Error('Caption removal timed out')
}

async function pollDubbing(id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 200; i++) {
    const res = await a2eFetch(`/v1/userDubbing/allRecords?pageNum=1&pageSize=30`)
    const json = await a2eReadJsonOrThrow<A2eEnvelope<{ rows: Record<string, unknown>[] }>>(res)
    const data = assertOk(json)
    const row = data.rows?.find((r) => String(r._id) === id)
    if (row) {
      const st = toSafeString(row.current_status)
      if (isTerminalStatus(st)) return row
    }
    await sleep(3000)
  }
  throw new Error('Dubbing timed out')
}

async function pollVoiceTraining(id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 80; i++) {
    const res = await a2eFetch(`/v1/userVoice/completedRecord`)
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>[]>>(res)
    const rows = assertOk(json)
    const row = rows.find((r) => String(r._id) === id)
    if (row) {
      const st = toSafeString(row.current_status)
      if (isTerminalStatus(st)) return row
    }
    await sleep(2000)
  }
  throw new Error('Voice training timed out')
}

async function pollAvatarVideoAwsResult(id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 200; i++) {
    const res = await a2eFetch(`/v1/video/awsResult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: a2eJsonBody({ _id: id }),
    })
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>[]>>(res)
    const arr = assertOk(json)
    const row = Array.isArray(arr) ? arr.find((r) => String(r._id) === id) || arr[0] : null
    if (row) {
      const st = toSafeString(row.status).toLowerCase()
      if (st === 'success' || st === 'fail') return row
    }
    await sleep(3000)
  }
  throw new Error('Avatar video timed out')
}

async function pollVirtualTryOn(id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 200; i++) {
    const res = await a2eFetch(`/v1/virtualTryOn/${encodeURIComponent(id)}`)
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = assertOk(json)
    const st = toSafeString(data.current_status)
    if (isTerminalStatus(st)) return data
    await sleep(3000)
  }
  throw new Error('Virtual try-on timed out')
}

async function pollMotionTransfer(id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 200; i++) {
    const res = await a2eFetch(`/v1/motionTransfer/${encodeURIComponent(id)}`)
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = assertOk(json)
    const st = toSafeString(data.current_status)
    if (isTerminalStatus(st)) return data
    await sleep(3000)
  }
  throw new Error('Motion transfer timed out')
}

async function pollFaceSwap(id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 200; i++) {
    const res = await a2eFetch(`/v1/userFaceSwapTask/${encodeURIComponent(id)}`)
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = assertOk(json)
    const st = toSafeString(data.current_status).toLowerCase()
    if (st === 'completed' || st === 'failed') return data
    await sleep(3000)
  }
  throw new Error('Face swap timed out')
}

async function pollUserVideoTwin(id: string): Promise<Record<string, unknown>> {
  for (let i = 0; i < 120; i++) {
    const res = await a2eFetch(`/v1/userVideoTwin/${encodeURIComponent(id)}`)
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = assertOk(json)
    const st = toSafeString(data.current_status).toLowerCase()
    const anchor = toSafeTrimmedString(data.anchor_id)
    if (st === 'failed') return data
    if (anchor || st === 'completed') return data
    await sleep(4000)
  }
  throw new Error('Custom avatar training timed out')
}

function taskOk(
  modelId: A2EModelId,
  mediaType: A2EMediaType,
  urls: string[],
  detail?: string
): A2ETask {
  return {
    id: `a2e-${Date.now()}`,
    modelId,
    status: 'completed',
    mediaType,
    resultUrls: urls.filter(Boolean),
    detail,
  }
}

function taskFail(modelId: A2EModelId, mediaType: A2EMediaType, message: string): A2ETask {
  return {
    id: `a2e-${Date.now()}`,
    modelId,
    status: 'failed',
    mediaType,
    resultUrls: [],
    error: message,
  }
}

/** First line: optional URL; rest: prompt text */
export function splitLeadingUrl(text: string): { url: string | null; prompt: string } {
  const lines = text.trim().split(/\r?\n/)
  const first = lines[0]?.trim() ?? ''
  if (/^https?:\/\//i.test(first)) {
    return {
      url: first,
      prompt: lines.slice(1).join('\n').trim() || 'Describe the result you want.',
    }
  }
  return { url: null, prompt: text.trim() }
}

/** Non-empty lines that look like http(s) URLs (order preserved). */
export function extractHttpUrls(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\//i.test(l))
}

function parseLinesWithUrls(text: string): { urls: string[]; restText: string } {
  const lines = text.split(/\r?\n/).map((l) => l.trim())
  const urls: string[] = []
  const rest: string[] = []
  for (const line of lines) {
    if (!line) continue
    if (/^https?:\/\//i.test(line)) urls.push(line)
    else rest.push(line)
  }
  return { urls, restText: rest.join('\n').trim() }
}

function inferMediaFromUrl(url: string): A2EMediaType {
  const u = url.split('?')[0] ?? url
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(u)) return 'image'
  if (/\.(mp3|wav|m4a|aac|ogg)$/i.test(u)) return 'audio'
  return 'video'
}

// NOSONAR: single orchestration gateway intentionally handles all A2E generation modes.
// eslint-disable-next-line sonarjs/cognitive-complexity -- single gateway spanning all A2E model dispatch paths; splitting would break shared task/summary assembly
export async function runA2eChatGeneration( // NOSONAR
  modelId: A2EModelId,
  query: string,
  _files?: UploadedFile[]
): Promise<{ task: A2ETask; summary: string }> {
  const name = `chat-${Date.now()}`

  if (modelId === 'a2e-live-stream') {
    const consoleUrl = getA2eStreamingConsoleUrl()
    const task = taskOk(
      modelId,
      'info',
      [],
      `Streaming uses WebRTC (not this REST proxy). Open the console: ${consoleUrl}`
    )
    return {
      task,
      summary: [
        '**Live / streaming avatars** run in the A2E real-time stack (WebRTC), not through `/api/a2e` REST calls.',
        '',
        `- [Open streaming console](${consoleUrl})`,
        `- [API hub](${A2E_STREAMING_API_ROOT}) (search docs for *streaming* / Agora)`,
        `- [Tutorial](${A2E_STREAMING_HELP.tutorial}) Â· [Discord](${A2E_STREAMING_HELP.discord})`,
        '',
        'In this app: **A2E Studio â†’ Live stream** has launch links and steps.',
      ].join('\n'),
    }
  }

  if (modelId === 'a2e-talking-photo') {
    const { urls, restText } = parseLinesWithUrls(query)
    if (urls.length < 2) {
      return {
        task: taskFail(modelId, 'video', 'Line 1: image URL. Line 2: audio URL. Optional: prompt on following lines.'),
        summary: 'Need image and audio URLs.',
      }
    }
    const res = await a2eFetch('/v1/talkingPhoto/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: a2eJsonBody({
        name,
        image_url: urls[0],
        audio_url: urls[1],
        duration: 3,
        prompt: restText || 'natural speaking',
        negative_prompt: 'blur, low quality, distorted',
      }),
    })
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = asA2eRecord(assertOk(json))
    const id = extractA2TaskId(data)
    if (!id) throw new Error('A2E did not return a task id')
    const polled = await pollTalkingPhoto(id)
    if (!isSuccessStatus(toSafeString(polled.current_status))) {
      return {
        task: taskFail(modelId, 'video', readFailedMsg(polled) || 'Failed'),
        summary: 'Talking photo failed.',
      }
    }
    const out = toSafeString(polled.result_url)
    return { task: taskOk(modelId, 'video', out ? [out] : []), summary: 'Talking photo ready.' }
  }

  if (modelId === 'a2e-talking-video') {
    const { urls, restText } = parseLinesWithUrls(query)
    if (urls.length < 2) {
      return {
        task: taskFail(modelId, 'video', 'Line 1: video URL. Line 2: audio URL. Optional: prompt on following lines.'),
        summary: 'Need video and audio URLs.',
      }
    }
    const res = await a2eFetch('/v1/talkingVideo/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: a2eJsonBody({
        name,
        video_url: urls[0],
        audio_url: urls[1],
        duration: 5,
        prompt: restText || 'natural',
        negative_prompt: 'blur, low quality',
      }),
    })
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = asA2eRecord(assertOk(json))
    const id = extractA2TaskId(data)
    if (!id) throw new Error('A2E did not return a task id')
    const polled = await pollTalkingVideoList(id)
    if (!isSuccessStatus(toSafeString(polled.current_status))) {
      return {
        task: taskFail(modelId, 'video', readFailedMsg(polled) || 'Failed'),
        summary: 'Talking video failed.',
      }
    }
    const out = toSafeString(polled.result_url)
    return { task: taskOk(modelId, 'video', out ? [out] : []), summary: 'Talking video ready.' }
  }

  if (modelId === 'a2e-dubbing') {
    const { urls, restText } = parseLinesWithUrls(query)
    if (urls.length < 1) {
      return {
        task: taskFail(modelId, 'audio', 'Line 1: source video or audio URL. Add source_lang and target_lang after (e.g. zh en).'),
        summary: 'Need a source media URL.',
      }
    }
    const tok = restText.split(/\s+/).filter(Boolean)
    const source_lang = tok[0] || 'zh'
    const target_lang = tok[1] || 'en'
    const res = await a2eFetch('/v1/userDubbing/startDubbing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: a2eJsonBody({
        name,
        source_url: urls[0],
        source_lang,
        target_lang,
        num_speakers: 1,
        drop_background_audio: false,
      }),
    })
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = asA2eRecord(assertOk(json))
    const id = extractA2TaskId(data)
    if (!id) throw new Error('A2E did not return a task id')
    const polled = await pollDubbing(id)
    if (!isSuccessStatus(toSafeString(polled.current_status))) {
      return {
        task: taskFail(modelId, 'audio', readFailedMsg(polled) || 'Failed'),
        summary: 'Dubbing failed.',
      }
    }
    const out = toSafeString(polled.result_url)
    return { task: taskOk(modelId, 'audio', out ? [out] : []), summary: 'Dubbed audio ready.' }
  }

  if (modelId === 'a2e-avatar-video') {
    const lines = query.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const anchor_id = lines[0] && !/^https?:\/\//i.test(lines[0]) ? lines[0] : ''
    const audioSrc = lines.find((l) => /^https?:\/\//i.test(l)) || ''
    const typeStr = lines.find((l) => l === '0' || l === '1')
    const anchor_type = typeStr === undefined ? 0 : Number(typeStr)
    if (!anchor_id || !audioSrc) {
      return {
        task: taskFail(modelId, 'video', 'Line 1: anchor_id from character_list. Line 2: audio URL. Optional line 3: anchor_type 0 or 1.'),
        summary: 'Need anchor_id and audio URL.',
      }
    }
    const res = await a2eFetch('/v1/video/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: a2eJsonBody({
        title: name,
        anchor_id,
        anchor_type,
        audioSrc,
        web_bg_width: 0,
        web_bg_height: 0,
        web_people_width: 0,
        web_people_height: 0,
        web_people_x: 0,
        web_people_y: 0,
        isSkipRs: true,
      }),
    })
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = asA2eRecord(assertOk(json))
    const id = extractA2TaskId(data)
    if (!id) throw new Error('No video task id in response')
    const polled = await pollAvatarVideoAwsResult(id)
    const st = toSafeString(polled.status).toLowerCase()
    if (st !== 'success') {
      return {
        task: taskFail(modelId, 'video', toSafeString(polled.error, 'Failed')),
        summary: 'Avatar lip-sync failed.',
      }
    }
    const u = toSafeString(polled.result)
    return { task: taskOk(modelId, 'video', u ? [u] : []), summary: 'Avatar video ready.' }
  }

  if (modelId === 'a2e-voice-clone') {
    const urls = extractHttpUrls(query)
    const lines = query.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const trainName = lines.find((l) => !/^https?:\/\//i.test(l)) || 'My voice'
    if (urls.length < 1) {
      return {
        task: taskFail(modelId, 'info', 'Provide at least one training audio URL (httpsâ€¦).'),
        summary: 'Need training audio URL.',
      }
    }
    const res = await a2eFetch('/v1/userVoice/training', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: a2eJsonBody({
        name: trainName,
        voice_urls: urls,
        model: 'a2e',
        language: 'en',
        gender: 'female',
      }),
    })
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = asA2eRecord(assertOk(json))
    const id = extractA2TaskId(data)
    if (!id) throw new Error('A2E did not return a task id')
    const polled = await pollVoiceTraining(id)
    if (!isSuccessStatus(toSafeString(polled.current_status))) {
      return {
        task: taskFail(modelId, 'info', readFailedMsg(polled) || 'Training failed'),
        summary: 'Voice training failed.',
      }
    }
    return {
      task: taskOk(modelId, 'info', [], `Voice clone ready. Use this id as user_voice_id / in Studio: ${id}`),
      summary: `Voice clone trained. ID: ${id}`,
    }
  }

  if (modelId === 'a2e-virtual-try-on') {
    const urls = extractHttpUrls(query)
    if (urls.length < 4) {
      return {
        task: taskFail(modelId, 'image', 'Provide **four** URLs in order: person, person mask, clothing, clothing mask.'),
        summary: 'Virtual try-on needs four image URLs.',
      }
    }
    const res = await a2eFetch('/v1/virtualTryOn/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: a2eJsonBody({ name, image_urls: urls.slice(0, 4) }),
    })
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = asA2eRecord(assertOk(json))
    const id = extractA2TaskId(data)
    if (!id) throw new Error('A2E did not return a task id')
    const polled = await pollVirtualTryOn(id)
    if (!isSuccessStatus(toSafeString(polled.current_status))) {
      return {
        task: taskFail(modelId, 'image', readFailedMsg(polled) || 'Failed'),
        summary: 'Virtual try-on failed.',
      }
    }
    const out = toSafeString(polled.result_image_url)
    return { task: taskOk(modelId, 'image', out ? [out] : []), summary: 'Try-on image ready.' }
  }

  if (modelId === 'a2e-motion-transfer') {
    const urls = extractHttpUrls(query)
    const { restText } = parseLinesWithUrls(query)
    if (urls.length < 2) {
      return {
        task: taskFail(modelId, 'video', 'Line order: reference **image** URL, then **video** URL. Optional: prompt text after.'),
        summary: 'Need image + video URLs.',
      }
    }
    const positive = restText || 'natural motion, high quality'
    const negative = 'blurry, distorted, low quality'
    const res = await a2eFetch('/v1/motionTransfer/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: a2eJsonBody({
        name,
        image_url: urls[0],
        video_url: urls[1],
        positive_prompt: positive,
        negative_prompt: negative,
      }),
    })
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = asA2eRecord(assertOk(json))
    const id = extractA2TaskId(data)
    if (!id) throw new Error('A2E did not return a task id')
    const polled = await pollMotionTransfer(id)
    if (!isSuccessStatus(toSafeString(polled.current_status))) {
      return {
        task: taskFail(modelId, 'video', readFailedMsg(polled) || 'Failed'),
        summary: 'Motion transfer failed.',
      }
    }
    const out = toSafeString(polled.result_video_url)
    return { task: taskOk(modelId, 'video', out ? [out] : []), summary: 'Motion transfer video ready.' }
  }

  if (modelId === 'a2e-face-swap') {
    const urls = extractHttpUrls(query)
    if (urls.length < 2) {
      return {
        task: taskFail(modelId, 'video', 'Line 1: **face** image URL. Line 2: **video** URL.'),
        summary: 'Need face and video URLs.',
      }
    }
    const res = await a2eFetch('/v1/userFaceSwapTask/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: a2eJsonBody({
        name,
        face_url: urls[0],
        video_url: urls[1],
      }),
    })
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = asA2eRecord(assertOk(json))
    const id = extractA2TaskId(data)
    if (!id) throw new Error('A2E did not return a task id')
    const polled = await pollFaceSwap(id)
    const st = toSafeString(polled.current_status).toLowerCase()
    if (st !== 'completed') {
      return {
        task: taskFail(modelId, 'video', readFailedMsg(polled) || 'Failed'),
        summary: 'Face swap failed.',
      }
    }
    const out = toSafeString(polled.result_url)
    return { task: taskOk(modelId, 'video', out ? [out] : []), summary: 'Face swap video ready.' }
  }

  if (modelId === 'a2e-watermark') {
    const urls = extractHttpUrls(query)
    const lines = query.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const mode = lines.find((l) => l === 'text' || l === 'image')
    const wt: 'text' | 'image' = mode === 'image' ? 'image' : 'text'
    if (urls.length < 1) {
      return {
        task: taskFail(modelId, 'video', 'Line 1: media URL. Include the word **text** or **image**, then watermark text or watermark image URL.'),
        summary: 'Need source media URL.',
      }
    }
    const body: Record<string, unknown> = {
      media_url: urls[0],
      watermark_type: wt,
    }
    if (wt === 'text') {
      const textLine = lines.find((l) => l !== 'text' && l !== 'image' && !/^https?:\/\//i.test(l))
      body.text = textLine || 'Generated by AI'
    } else {
      body.watermark_image_url = urls[1] || ''
      if (!body.watermark_image_url) {
        return {
          task: taskFail(modelId, 'video', 'For image watermark, provide a second URL for the watermark image.'),
          summary: 'Need watermark image URL.',
        }
      }
    }
    const res = await a2eFetch('/v1/watermark/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: a2eJsonBody(body),
    })
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = asA2eRecord(assertOk(json))
    const out = toSafeString(data.result_url)
    const mt = inferMediaFromUrl(out || urls[0])
    if (!out) {
      return {
        task: taskFail(modelId, mt, 'No result URL from watermark API'),
        summary: 'Watermark failed.',
      }
    }
    return { task: taskOk(modelId, mt, [out]), summary: 'Watermarked media ready.' }
  }

  if (modelId === 'a2e-custom-avatar') {
    const lines = query.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    const nm = lines[0] || name
    const gender = lines[1]?.toLowerCase() === 'male' ? 'male' : 'female'
    const urls = extractHttpUrls(query)
    const video_url = urls.find((u) => /\.(mp4|mov|webm)(\?|$)/i.test(u.split('?')[0]))
    const image_url = urls.find((u) => /\.(png|jpe?g|webp|gif)(\?|$)/i.test(u.split('?')[0]))
    const payload: Record<string, unknown> = { name: nm, gender }
    if (video_url) payload.video_url = video_url
    else if (image_url) payload.image_url = image_url
    else {
      return {
        task: taskFail(modelId, 'info', 'Provide **female** or **male** on line 2 and a **video** or **image** URL (lines after).'),
        summary: 'Need avatar training URL.',
      }
    }
    const res = await a2eFetch('/v1/userVideoTwin/startTraining', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-lang': 'en-US' },
      body: a2eJsonBody(payload),
    })
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = asA2eRecord(assertOk(json))
    const id = extractA2TaskId(data)
    if (!id) throw new Error('A2E did not return a task id')
    const polled = await pollUserVideoTwin(id)
    const anchor = toSafeTrimmedString(polled.anchor_id)
    const preview = toSafeTrimmedString(polled.preview_result_url)
    if (!anchor && !preview) {
      return {
        task: taskFail(modelId, 'info', readFailedMsg(polled) || 'Training failed'),
        summary: 'Custom avatar training failed.',
      }
    }
    const pv = preview ? [preview] : []
    return {
      task: taskOk(modelId, preview ? 'video' : 'info', pv, `anchor_id for /video/generate: ${anchor || '(pending)'}`),
      summary: anchor ? `Custom avatar ready. anchor_id=${anchor}` : 'Custom avatar training produced a preview.',
    }
  }

  if (modelId === 'a2e-text-to-image') {
    const reqKey = readStoredT2iReqKey()
    const res = await a2eFetch('/v1/userText2image/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: a2eJsonBody({
        name,
        prompt: query.trim(),
        req_key: reqKey,
        width: 1024,
        height: 768,
      }),
    })
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = asA2eRecord(assertOk(json))
    const id = extractA2TaskId(data)
    if (!id) throw new Error('Missing task id from A2E')
    if (isSuccessStatus(toSafeString(data.current_status))) {
      const urls = (data.image_urls as string[] | undefined) || []
      if (urls.length > 0) {
        return { task: taskOk(modelId, 'image', urls), summary: `Generated ${urls.length} image(s).` }
      }
    }
    const polled = await pollTextToImage(id)
    if (!isSuccessStatus(polled.current_status)) {
      return {
        task: taskFail(modelId, 'image', polled.failed_message || 'Generation failed'),
        summary: polled.failed_message || 'Failed.',
      }
    }
    const urls = polled.image_urls || []
    return { task: taskOk(modelId, 'image', urls), summary: `Generated ${urls.length} image(s).` }
  }

  if (modelId === 'a2e-nano-banana') {
    const res = await a2eFetch('/v1/userNanoBanana/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: a2eJsonBody({
        name,
        prompt: query.trim(),
      }),
    })
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = asA2eRecord(assertOk(json))
    const id = extractA2TaskId(data)
    if (!id) throw new Error('A2E did not return a task id')
    const polled = await pollNanoBanana(id)
    const st = toSafeString(polled.current_status)
    if (!isSuccessStatus(st)) {
      return {
        task: taskFail(modelId, 'image', readFailedMsg(polled) || 'Failed'),
        summary: 'Nano Banana task failed.',
      }
    }
    const urls = (polled.image_urls as string[] | undefined) || []
    return { task: taskOk(modelId, 'image', urls), summary: `Nano Banana: ${urls.length} image(s).` }
  }

  if (modelId === 'a2e-image-to-video') {
    const { url, prompt } = splitLeadingUrl(query)
    if (!url) {
      return {
        task: taskFail(modelId, 'video', 'Put the **image URL on the first line**, then your motion prompt on the following lines.'),
        summary: 'Image URL required on the first line.',
      }
    }
    const res = await a2eFetch('/v1/userImage2Video/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: a2eJsonBody({
        name,
        image_url: url,
        prompt: prompt,
        negative_prmpt:
          'six fingers, bad hands, lowres, low quality, worst quality, moving camera view point, still image',
      }),
    })
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = asA2eRecord(assertOk(json))
    const id = extractA2TaskId(data)
    if (!id) throw new Error('A2E did not return a task id')
    const polled = await pollImageToVideo(id)
    const st = toSafeString(polled.current_status)
    if (!isSuccessStatus(st)) {
      return {
        task: taskFail(modelId, 'video', readFailedMsg(polled) || 'Failed'),
        summary: 'Image-to-video failed.',
      }
    }
    const out = toSafeString(polled.result_url)
    return { task: taskOk(modelId, 'video', out ? [out] : []), summary: 'Video ready.' }
  }

  if (modelId === 'a2e-tts') {
    let ttsId = ''
    try {
      const res = await a2eFetch('/v1/anchor/voice_list', { method: 'GET' })
      const raw = await res.text()
      const m = /[a-f0-9]{24}/i.exec(raw)
      if (m) ttsId = m[0]
    } catch {
      /* optional */
    }
    const body: Record<string, unknown> = {
      msg: query.trim(),
      speechRate: 1,
    }
    if (ttsId) body.tts_id = ttsId

    const ttsRes = await a2eFetch('/v1/video/send_tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: a2eJsonBody(body),
    })
    let ttsJson: A2eEnvelope<string>
    try {
      ttsJson = await a2eReadJsonOrThrow<A2eEnvelope<string>>(ttsRes)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return {
        task: taskFail(modelId, 'audio', msg),
        summary: msg,
      }
    }
    const audioUrl = assertOk(ttsJson)
    return { task: taskOk(modelId, 'audio', [audioUrl]), summary: 'Speech audio generated.' }
  }

  if (modelId === 'a2e-caption-removal') {
    const { url } = splitLeadingUrl(query)
    if (!url) {
      return {
        task: taskFail(modelId, 'video', 'Put the **source video URL on the first line**.'),
        summary: 'Video URL required.',
      }
    }
    const res = await a2eFetch('/v1/userCaptionRemoval/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: a2eJsonBody({ name, source_url: url }),
    })
    const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
    const data = asA2eRecord(assertOk(json))
    const id = extractA2TaskId(data)
    if (!id) throw new Error('A2E did not return a task id')
    const polled = await pollCaptionRemoval(id)
    const st = toSafeString(polled.current_status)
    if (!isSuccessStatus(st)) {
      return {
        task: taskFail(modelId, 'video', readFailedMsg(polled) || 'Failed'),
        summary: 'Caption removal failed.',
      }
    }
    const out = toSafeString(polled.result_url)
    return { task: taskOk(modelId, 'video', out ? [out] : []), summary: 'Processed video ready.' }
  }

  return {
    task: taskFail(modelId, 'info', 'Unsupported'),
    summary: 'Unsupported A2E mode.',
  }
}

/** ---- Studio / advanced calls (used by A2EStudioPanel) ---- */

export async function studioTextToImage(params: {
  name: string
  prompt: string
  req_key: 'high_aes_general_v21_L' | 'high_aes'
  width: number
  height: number
}): Promise<A2ETask> {
  const res = await a2eFetch('/v1/userText2image/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: a2eJsonBody(params),
  })
  const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
  const data = asA2eRecord(assertOk(json))
  const id = extractA2TaskId(data)
  if (!id) throw new Error('A2E did not return a task id')
  if (isSuccessStatus(toSafeString(data.current_status))) {
    const urls = (data.image_urls as string[] | undefined) || []
    if (urls.length > 0) {
      return taskOk('a2e-text-to-image', 'image', urls)
    }
  }
  const polled = await pollTextToImage(id)
  if (!isSuccessStatus(polled.current_status)) {
    return taskFail('a2e-text-to-image', 'image', polled.failed_message || 'Failed')
  }
  return taskOk('a2e-text-to-image', 'image', polled.image_urls || [])
}

export async function studioNanoBanana(params: { name: string; prompt: string; input_images?: string[] }): Promise<A2ETask> {
  const res = await a2eFetch('/v1/userNanoBanana/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: a2eJsonBody(params),
  })
  const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
  const data = asA2eRecord(assertOk(json))
  const id = extractA2TaskId(data)
  if (!id) throw new Error('A2E did not return a task id')
  const polled = await pollNanoBanana(id)
  if (!isSuccessStatus(toSafeString(polled.current_status))) {
    return taskFail('a2e-nano-banana', 'image', readFailedMsg(polled) || 'Failed')
  }
  const urls = (polled.image_urls as string[]) || []
  return taskOk('a2e-nano-banana', 'image', urls)
}

export async function studioImageToVideo(params: {
  name: string
  image_url: string
  prompt: string
  negative_prmpt: string
}): Promise<A2ETask> {
  const res = await a2eFetch('/v1/userImage2Video/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: a2eJsonBody(params),
  })
  const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
  const data = asA2eRecord(assertOk(json))
  const id = extractA2TaskId(data)
  if (!id) throw new Error('A2E did not return a task id')
  const polled = await pollImageToVideo(id)
  if (!isSuccessStatus(toSafeString(polled.current_status))) {
    return taskFail('a2e-image-to-video', 'video', readFailedMsg(polled) || 'Failed')
  }
  const u = toSafeString(polled.result_url)
  return taskOk('a2e-image-to-video', 'video', u ? [u] : [])
}

export async function studioTalkingPhoto(params: {
  name: string
  image_url: string
  audio_url: string
  duration?: number
  prompt: string
  negative_prompt: string
}): Promise<A2ETask> {
  const res = await a2eFetch('/v1/talkingPhoto/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: a2eJsonBody({ duration: 3, ...params }),
  })
  const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
  const data = asA2eRecord(assertOk(json))
  const id = extractA2TaskId(data)
  if (!id) throw new Error('A2E did not return a task id')
  const polled = await pollTalkingPhoto(id)
  if (!isSuccessStatus(toSafeString(polled.current_status))) {
    return taskFail('a2e-talking-photo', 'video', readFailedMsg(polled) || 'Failed')
  }
  const u = toSafeString(polled.result_url)
  return taskOk('a2e-talking-photo', 'video', u ? [u] : [])
}

export async function studioTalkingVideo(params: {
  name: string
  video_url: string
  audio_url: string
  duration?: number
  prompt: string
  negative_prompt: string
}): Promise<A2ETask> {
  const res = await a2eFetch('/v1/talkingVideo/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: a2eJsonBody({ duration: 5, ...params }),
  })
  const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
  const data = asA2eRecord(assertOk(json))
  const id = extractA2TaskId(data)
  if (!id) throw new Error('A2E did not return a task id')
  const polled = await pollTalkingVideoList(id)
  if (!isSuccessStatus(toSafeString(polled.current_status))) {
    return taskFail('a2e-talking-video', 'video', readFailedMsg(polled) || 'Failed')
  }
  const u = toSafeString(polled.result_url)
  return taskOk('a2e-talking-video', 'video', u ? [u] : [])
}

export async function studioTts(params: {
  msg: string
  speechRate: number
  tts_id?: string
  user_voice_id?: string
  country?: string
  region?: string
}): Promise<A2ETask> {
  const res = await a2eFetch('/v1/video/send_tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: a2eJsonBody(params),
  })
  const json = await a2eReadJsonOrThrow<A2eEnvelope<string>>(res)
  const url = assertOk(json)
  return taskOk('a2e-tts', 'audio', [url])
}

export async function studioVoiceTrain(params: {
  name: string
  voice_urls: string[]
  model?: 'a2e' | 'cartesia' | 'minimax' | 'elevenlabs'
  language?: string
  gender?: 'female' | 'male'
}): Promise<A2ETask> {
  const res = await a2eFetch('/v1/userVoice/training', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: a2eJsonBody({ model: 'a2e', language: 'en', gender: 'female', ...params }),
  })
  const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
  const data = asA2eRecord(assertOk(json))
  const id = extractA2TaskId(data)
  if (!id) throw new Error('A2E did not return a task id')
  const polled = await pollVoiceTraining(id)
  if (!isSuccessStatus(toSafeString(polled.current_status))) {
    return taskFail('a2e-voice-clone', 'info', readFailedMsg(polled) || 'Training failed')
  }
  return taskOk('a2e-voice-clone', 'info', [], `Voice clone ready. ID: ${id}`)
}

export async function studioCaptionRemoval(name: string, source_url: string): Promise<A2ETask> {
  const res = await a2eFetch('/v1/userCaptionRemoval/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: a2eJsonBody({ name, source_url }),
  })
  const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
  const data = asA2eRecord(assertOk(json))
  const id = extractA2TaskId(data)
  if (!id) throw new Error('A2E did not return a task id')
  const polled = await pollCaptionRemoval(id)
  if (!isSuccessStatus(toSafeString(polled.current_status))) {
    return taskFail('a2e-caption-removal', 'video', readFailedMsg(polled) || 'Failed')
  }
  const u = toSafeString(polled.result_url)
  return taskOk('a2e-caption-removal', 'video', u ? [u] : [])
}

export async function studioDubbing(params: {
  name: string
  source_url: string
  target_lang: string
  source_lang: string
  num_speakers: number
  drop_background_audio: boolean
}): Promise<A2ETask> {
  const res = await a2eFetch('/v1/userDubbing/startDubbing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: a2eJsonBody(params),
  })
  const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
  const data = asA2eRecord(assertOk(json))
  const id = extractA2TaskId(data)
  if (!id) throw new Error('A2E did not return a task id')
  const polled = await pollDubbing(id)
  if (!isSuccessStatus(toSafeString(polled.current_status))) {
    return taskFail('a2e-dubbing', 'audio', readFailedMsg(polled) || 'Failed')
  }
  const u = toSafeString(polled.result_url)
  return taskOk('a2e-dubbing', 'audio', u ? [u] : [])
}

export async function studioAvatarVideo(params: {
  title: string
  anchor_id: string
  anchor_type: number
  audioSrc: string
  isSkipRs?: boolean
}): Promise<A2ETask> {
  const res = await a2eFetch('/v1/video/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: a2eJsonBody({
      web_bg_width: 0,
      web_bg_height: 0,
      web_people_width: 0,
      web_people_height: 0,
      web_people_x: 0,
      web_people_y: 0,
      isSkipRs: true,
      ...params,
    }),
  })
  const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
  const data = asA2eRecord(assertOk(json))
  const id = extractA2TaskId(data)
  if (!id) throw new Error('No video task id in response')
  const polled = await pollAvatarVideoAwsResult(id)
  const st = toSafeString(polled.status).toLowerCase()
  if (st !== 'success') {
    return taskFail('a2e-avatar-video', 'video', toSafeString(polled.error, 'Failed'))
  }
  const u = toSafeString(polled.result)
  return taskOk('a2e-avatar-video', 'video', u ? [u] : [])
}

export async function studioVirtualTryOn(params: { name: string; image_urls: string[] }): Promise<A2ETask> {
  const res = await a2eFetch('/v1/virtualTryOn/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: a2eJsonBody(params),
  })
  const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
  const data = asA2eRecord(assertOk(json))
  const id = extractA2TaskId(data)
  if (!id) throw new Error('A2E did not return a task id')
  const polled = await pollVirtualTryOn(id)
  if (!isSuccessStatus(toSafeString(polled.current_status))) {
    return taskFail('a2e-virtual-try-on', 'image', readFailedMsg(polled) || 'Failed')
  }
  const out = toSafeString(polled.result_image_url)
  return taskOk('a2e-virtual-try-on', 'image', out ? [out] : [])
}

export async function studioMotionTransfer(params: {
  name: string
  image_url: string
  video_url: string
  positive_prompt: string
  negative_prompt: string
}): Promise<A2ETask> {
  const res = await a2eFetch('/v1/motionTransfer/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: a2eJsonBody(params),
  })
  const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
  const data = asA2eRecord(assertOk(json))
  const id = extractA2TaskId(data)
  if (!id) throw new Error('A2E did not return a task id')
  const polled = await pollMotionTransfer(id)
  if (!isSuccessStatus(toSafeString(polled.current_status))) {
    return taskFail('a2e-motion-transfer', 'video', readFailedMsg(polled) || 'Failed')
  }
  const u = toSafeString(polled.result_video_url)
  return taskOk('a2e-motion-transfer', 'video', u ? [u] : [])
}

export async function studioFaceSwap(params: { name: string; face_url: string; video_url: string }): Promise<A2ETask> {
  const res = await a2eFetch('/v1/userFaceSwapTask/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: a2eJsonBody(params),
  })
  const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
  const data = asA2eRecord(assertOk(json))
  const id = extractA2TaskId(data)
  if (!id) throw new Error('A2E did not return a task id')
  const polled = await pollFaceSwap(id)
  if (toSafeString(polled.current_status).toLowerCase() !== 'completed') {
    return taskFail('a2e-face-swap', 'video', readFailedMsg(polled) || 'Failed')
  }
  const u = toSafeString(polled.result_url)
  return taskOk('a2e-face-swap', 'video', u ? [u] : [])
}

export async function studioWatermark(params: {
  media_url: string
  watermark_type: 'text' | 'image'
  text?: string
  watermark_image_url?: string
  fontsize?: number
  fontcolor?: number[]
  position?: string
  scale_ratio?: number
  to_720p?: boolean
}): Promise<A2ETask> {
  const res = await a2eFetch('/v1/watermark/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: a2eJsonBody(params),
  })
  const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
  const data = asA2eRecord(assertOk(json))
  const out = toSafeString(data.result_url)
  if (!out) return taskFail('a2e-watermark', 'video', 'No result URL')
  const mt = inferMediaFromUrl(out)
  return taskOk('a2e-watermark', mt, [out])
}

export async function studioCustomAvatar(params: {
  name: string
  gender: 'female' | 'male'
  video_url?: string
  image_url?: string
  video_backgroud_color?: string
}): Promise<A2ETask> {
  const res = await a2eFetch('/v1/userVideoTwin/startTraining', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-lang': 'en-US' },
    body: a2eJsonBody(params),
  })
  const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>>>(res)
  const data = asA2eRecord(assertOk(json))
  const id = extractA2TaskId(data)
  if (!id) throw new Error('A2E did not return a task id')
  const polled = await pollUserVideoTwin(id)
  const anchor = toSafeTrimmedString(polled.anchor_id)
  const preview = toSafeTrimmedString(polled.preview_result_url)
  if (!anchor && !preview) {
    return taskFail('a2e-custom-avatar', 'info', readFailedMsg(polled) || 'Failed')
  }
  return taskOk(
    'a2e-custom-avatar',
    preview ? 'video' : 'info',
    preview ? [preview] : [],
    `anchor_id: ${anchor || '(pending)'}`
  )
}

export async function fetchRemainingCoins(): Promise<{ coins: number; diamonds?: number }> {
  const res = await a2eFetch('/v1/user/remainingCoins')
  const json = await a2eReadJsonOrThrow<A2eEnvelope<{ coins: number; diamonds?: number }>>(res)
  return assertOk(json)
}

export async function fetchCharacterList(params?: { user_video_twin_id?: string; type?: string }): Promise<Record<string, unknown>[]> {
  const q = new URLSearchParams()
  if (params?.user_video_twin_id) q.set('user_video_twin_id', params.user_video_twin_id)
  if (params?.type) q.set('type', params.type)
  const qs = q.toString()
  const path = qs ? '/v1/anchor/character_list?' + qs : '/v1/anchor/character_list'
  const res = await a2eFetch(path)
  const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>[]>>(res)
  return assertOk(json)
}

export async function fetchVoiceList(): Promise<Record<string, unknown>[]> {
  const res = await a2eFetch('/v1/userVoice/completedRecord')
  const json = await a2eReadJsonOrThrow<A2eEnvelope<Record<string, unknown>[]>>(res)
  return assertOk(json)
}

export async function fetchPublicTtsVoices(): Promise<string> {
  const res = await a2eFetch('/v1/anchor/voice_list')
  const text = await res.text()
  return text
}

