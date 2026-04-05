/**
 * Shared A2E client: same-origin `/api/a2e/*` → upstream `video.a2e.ai` (Vite/Electron proxy).
 *
 * Optional `VITE_A2E_POST_BODY_EXTRA` (JSON object) is shallow-merged into every JSON POST body
 * (extra keys win on collision). Use this to pass upstream flags from A2E’s docs (e.g. model
 * toggles) — this app does not add its own content filters on A2E traffic.
 */
const PREFIX = '/api/a2e'

/** Parsed once per bundle from env; merged into all A2E JSON request bodies when set. */
export function parseA2ePostBodyExtra(): Record<string, unknown> {
  try {
    const raw = import.meta.env.VITE_A2E_POST_BODY_EXTRA?.trim()
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    if (import.meta.env.DEV) {
      console.warn('[A2E] VITE_A2E_POST_BODY_EXTRA is not valid JSON; ignoring.')
    }
  }
  return {}
}

/** Stringify a request body, merging optional env extras (see `parseA2ePostBodyExtra`). */
export function a2eJsonBody(body: object): string {
  const extra = parseA2ePostBodyExtra()
  if (Object.keys(extra).length === 0) return JSON.stringify(body)
  return JSON.stringify({ ...(body as Record<string, unknown>), ...extra })
}

export async function a2eHttp(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${PREFIX}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers as Record<string, string>),
    },
  })
}

export interface A2eEnvelope<T = unknown> {
  code: number
  data: T
  trace_id?: string
}

export function a2eAssertOk<T>(json: A2eEnvelope<T>): T {
  if (json.code !== 0) {
    throw new Error(`A2E error code ${json.code}`)
  }
  return json.data
}

export async function a2eParseJson<T>(res: Response): Promise<T> {
  const text = await res.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(`A2E invalid JSON (${res.status}): ${text.slice(0, 200)}`)
  }
  return parsed as T
}

/**
 * Build a user-facing message from a failed HTTP response (prefer JSON body over status text).
 * Handles A2E `{ code, data }` envelopes, `{ message }`, and `{ error: { message } }`.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- exhaustive JSON envelope shape branching for A2E API error formats
export function formatA2eHttpError(res: Response, bodyText: string): string {
  const statusLine = (String(res.status) + (res.statusText ? ' ' + res.statusText : '')).trim()
  const trimmed = bodyText.trim()
  if (!trimmed) return statusLine

  let j: unknown
  try {
    j = JSON.parse(trimmed)
  } catch {
    const snippet = trimmed.length <= 400 ? trimmed : trimmed.slice(0, 400) + '…'
    return `${statusLine}: ${snippet}`
  }

  if (!j || typeof j !== 'object' || Array.isArray(j)) {
    const snippet = trimmed.length <= 400 ? trimmed : trimmed.slice(0, 400) + '…'
    return `${statusLine}: ${snippet}`
  }

  const o = j as Record<string, unknown>

  if (typeof o.message === 'string' && o.message) return `${statusLine}: ${o.message}`
  if (typeof o.msg === 'string' && o.msg) return `${statusLine}: ${o.msg}`

  if (o.error && typeof o.error === 'object') {
    const e = o.error as Record<string, unknown>
    if (typeof e.message === 'string' && e.message) return `${statusLine}: ${e.message}`
  }

  if (typeof o.code === 'number' && o.code !== 0) {
    const parts: string[] = [`A2E code ${o.code}`]
    const d = o.data
    if (typeof d === 'string' && d) parts.push(d)
    else if (d && typeof d === 'object') {
      const data = d as Record<string, unknown>
      const fm =
        (typeof data.failed_message === 'string' && data.failed_message) ||
        (typeof data.message === 'string' && data.message) ||
        (typeof data.msg === 'string' && data.msg)
      if (fm) parts.push(fm)
      else parts.push(JSON.stringify(d))
    }
    return `${statusLine}: ${parts.join(' — ')}`
  }

  const tail = trimmed.length <= 500 ? trimmed : trimmed.slice(0, 500) + '…'
  return `${statusLine}: ${tail}`
}

/**
 * Read JSON from a Response; if HTTP status indicates failure, throw with body details (not just "Bad Request").
 */
export async function a2eReadJsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    if (!res.ok) {
      throw new Error(formatA2eHttpError(res, text))
    }
    throw new Error(`A2E invalid JSON (${res.status}): ${text.slice(0, 200)}`)
  }
  if (!res.ok) {
    throw new Error(formatA2eHttpError(res, text))
  }
  return parsed as T
}
