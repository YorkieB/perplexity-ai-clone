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
 */
export async function fetchDigitalOceanModels(apiToken?: string): Promise<DigitalOceanModelOption[]> {
  const trimmed = apiToken ? sanitizeDoToken(apiToken) : ''
  const headers: Record<string, string> = {}
  if (trimmed) {
    headers.Authorization = `Bearer ${trimmed}`
  }

  const response = await fetch('/api/digitalocean/models', {
    headers,
  })

  const text = await response.text()
  if (!response.ok) {
    let message = text
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: { message?: string } }
      message = parsed.message || parsed.error?.message || text
    } catch {
      /* use raw */
    }
    throw new Error(message || `Failed to list models (${response.status})`)
  }

  const data = JSON.parse(text) as { models?: DigitalOceanModelOption[] }
  return Array.isArray(data.models) ? data.models : []
}
