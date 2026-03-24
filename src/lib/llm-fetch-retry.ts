/**
 * Retries LLM HTTP calls when the provider returns temporary overload / rate limit responses.
 * Provider-side quotas cannot be disabled from the client; this only waits and retries.
 */

const DEFAULT_MAX_ATTEMPTS = 8

function getMaxAttempts(): number {
  const raw = import.meta.env.VITE_LLM_RATE_LIMIT_RETRIES
  if (raw === '0' || raw === 'false') return 1
  const n = Number.parseInt(String(raw ?? ''), 10)
  if (Number.isFinite(n) && n >= 1) return Math.min(n, 50)
  return DEFAULT_MAX_ATTEMPTS
}

function isRetriableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503
}

/**
 * Fetch with retries on 429 / 502 / 503. Drains response body between attempts.
 * Respects `Retry-After` when present (seconds).
 */
export async function fetchLlmWithRetry(
  input: RequestInfo | URL,
  init: RequestInit
): Promise<Response> {
  const maxAttempts = getMaxAttempts()
  let last: Response | null = null

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (init.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    const res = await fetch(input, init)
    last = res

    if (!isRetriableStatus(res.status) || attempt === maxAttempts - 1) {
      return res
    }

    await res.text().catch(() => {})

    if (init.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    const retryAfter = res.headers.get('Retry-After')
    let delayMs = Math.min(120_000, Math.round(900 * 1.75 ** attempt))
    if (retryAfter) {
      const sec = Number.parseInt(retryAfter, 10)
      if (Number.isFinite(sec) && sec >= 0) {
        delayMs = Math.min(120_000, sec * 1000)
      }
    }

    await delayWithAbort(delayMs, init.signal ?? undefined)
  }

  return last!
}

function delayWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const t = globalThis.setTimeout(resolve, ms)
    const onAbort = () => {
      globalThis.clearTimeout(t)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
