import { sanitizeDoToken } from '@/lib/sanitize-do-token'

export interface DigitalOceanModelOption {
  id: string
  name: string
  description: string
}

/**
 * Client calls same-origin proxy. Pass a Gradient **model access / inference** key from Settings,
 * or omit it when the dev/proxy server supplies `DIGITALOCEAN_API_KEY` in `.env`.
 * (Listing uses `inference.do-ai.run/v1/models`, same auth as chat — not api.digitalocean.com.)
 * Returns empty array on error (graceful degradation).
 */
export async function fetchDigitalOceanModels(apiToken?: string): Promise<DigitalOceanModelOption[]> {
  try {
    const trimmed = apiToken ? sanitizeDoToken(apiToken) : ''
    const headers: Record<string, string> = {}
    if (trimmed) {
      headers.Authorization = `Bearer ${trimmed}`
    }

    console.log('[DigitalOcean] Fetching models... Token provided:', !!trimmed)
    
    const response = await fetch('/api/digitalocean/models', {
      headers,
    })

    console.log('[DigitalOcean] Response status:', response.status)
    
    const text = await response.text()
    if (!response.ok) {
      let message = text
      try {
        const parsed = JSON.parse(text) as { message?: string; error?: { message?: string } }
        message = parsed.message || parsed.error?.message || text
      } catch {
        /* use raw */
      }
      console.warn(`[DigitalOcean] Failed to list models (${response.status}): ${message}`)
      return []
    }

    const data = JSON.parse(text) as { models?: DigitalOceanModelOption[] }
    const models = Array.isArray(data.models) ? data.models : []
    console.log(`[DigitalOcean] Successfully loaded ${models.length} models`)
    return models
  } catch (e) {
    console.error(`[DigitalOcean] Exception fetching models:`, e instanceof Error ? e.message : e)
    return []
  }
}
