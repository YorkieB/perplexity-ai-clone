/**
 * Additional A2E REST endpoints (beyond the main creative flows in `a2e-api.ts`).
 * Paths match A2E OpenAPI "Default module" (video.a2e.ai).
 */
import { a2eHttp, a2eAssertOk, a2eParseJson, a2eJsonBody, type A2eEnvelope } from '@/lib/a2e-http'

async function postJson<T>(path: string, body: object): Promise<T> {
  const res = await a2eHttp(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: a2eJsonBody(body),
  })
  const json = await a2eParseJson<A2eEnvelope<T>>(res)
  if (!res.ok) throw new Error(`A2E ${path} failed: ${res.status}`)
  return a2eAssertOk(json)
}

async function getJson<T>(path: string): Promise<T> {
  const res = await a2eHttp(path, { method: 'GET' })
  const json = await a2eParseJson<A2eEnvelope<T>>(res)
  if (!res.ok) throw new Error(`A2E ${path} failed: ${res.status}`)
  return a2eAssertOk(json)
}

/** Paginated avatar / lip-sync video jobs */
export async function listAwsVideos(params: { current?: string; pageSize?: string }): Promise<unknown> {
  const q = new URLSearchParams()
  q.set('current', params.current ?? '1')
  if (params.pageSize) q.set('pageSize', params.pageSize)
  return getJson(`/v1/video/awsList?${q.toString()}`)
}

export async function detectLanguage(msg: string): Promise<string> {
  return postJson<string>('/v1/video/lang_classify', { msg })
}

export async function setAutoPublicPool(isAutoToPublicPool: boolean): Promise<{ isAutoToPublicPool: boolean }> {
  return postJson<{ isAutoToPublicPool: boolean }>('/v1/video/auto-public-pool', { isAutoToPublicPool })
}

export async function getR2PresignedUrl(key: string, bucket?: string): Promise<{
  uploadUrl: string
  key: string
  expiresIn?: number
  bucket?: string
}> {
  return postJson('/v1/r2/get_upload_presigned_url', { key, ...(bucket ? { bucket } : {}) })
}

export async function listCustomBackgrounds(): Promise<unknown> {
  const res = await a2eHttp('/v1/custom_back/allBackground', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: '',
  })
  const json = await a2eParseJson<A2eEnvelope<unknown>>(res)
  if (!res.ok) throw new Error(`A2E backgrounds list failed: ${res.status}`)
  return a2eAssertOk(json)
}

export async function addCustomBackground(img_url: string): Promise<unknown> {
  return postJson('/v1/custom_back/add', { img_url })
}

export async function deleteCustomBackground(_id: string): Promise<unknown> {
  return postJson('/v1/custom_back/del', { _id })
}

export async function addFaceSwapImage(face_url: string): Promise<unknown> {
  return postJson('/v1/userFaceSwapImage/add', { face_url })
}

export async function listFaceSwapImages(): Promise<unknown> {
  return getJson('/v1/userFaceSwapImage/records')
}

export async function continueVideoTwinTraining(_id: string): Promise<unknown> {
  return postJson('/v1/userVideoTwin/continueTranining', { _id })
}

export async function quickAddAvatarFromT2I(_id: string): Promise<unknown> {
  return postJson('/v1/userText2image/quickAddAvatar', { _id })
}

export async function startProductAvatar(): Promise<unknown> {
  const res = await a2eHttp('/v1/productAvatar/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: a2eJsonBody({}),
  })
  const json = await a2eParseJson<A2eEnvelope<unknown>>(res)
  if (!res.ok) throw new Error(`A2E productAvatar failed: ${res.status}`)
  return a2eAssertOk(json)
}

export async function addFaceSwapPreview(face_url: string, video_url: string): Promise<unknown> {
  return postJson('/v1/userFaceSwapPreview/add', { face_url, video_url })
}

export async function getFaceSwapPreviewStatus(): Promise<unknown> {
  return getJson('/v1/userFaceSwapPreview/status')
}
