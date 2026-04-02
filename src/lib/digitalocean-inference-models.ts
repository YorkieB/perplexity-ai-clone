import type { DigitalOceanModelOption } from '@/lib/digitalocean-api'

/**
 * Curated slugs for DigitalOcean Gradient™ serverless inference (`inference.do-ai.run`).
 * Merged with `/v1/models` so the selector still lists common IDs if the API returns nothing.
 * Account availability may vary; the live catalog from the API is authoritative when present.
 */
export const DIGITALOCEAN_INFERENCE_MODEL_FALLBACKS: DigitalOceanModelOption[] = [
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', description: 'OpenAI — serverless inference' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', description: 'OpenAI — serverless inference' },
  { id: 'anthropic/claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Anthropic — serverless inference' },
  { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B Instruct', description: 'Meta — serverless inference' },
  { id: 'meta/llama-3.1-8b-instruct', name: 'Llama 3.1 8B Instruct', description: 'Meta — serverless inference' },
]

/** Prefer API results; fill gaps from {@link DIGITALOCEAN_INFERENCE_MODEL_FALLBACKS}. */
export function mergeDigitalOceanInferenceCatalog(
  fetched: DigitalOceanModelOption[],
): DigitalOceanModelOption[] {
  const byId = new Map<string, DigitalOceanModelOption>()
  for (const m of fetched) {
    byId.set(m.id, m)
  }
  for (const m of DIGITALOCEAN_INFERENCE_MODEL_FALLBACKS) {
    if (!byId.has(m.id)) {
      byId.set(m.id, m)
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name))
}
