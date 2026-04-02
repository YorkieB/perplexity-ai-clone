/**
 * Client-side detection for whether DigitalOcean Gradient™ inference should be exposed in the UI
 * and merged into model lists. Server/Electron still requires `DIGITALOCEAN_API_KEY` (or Settings key)
 * to actually route `x-llm-provider: digitalocean` on `POST /api/llm`.
 */
export function clientMayUseDigitalOceanInference(settingsToken?: string | null): boolean {
  const t = settingsToken?.trim()
  if (t) return true
  const v = import.meta.env.VITE_USE_DO_INFERENCE
  if (v === true) return true
  const s = String(v ?? '').trim().toLowerCase()
  return s === 'true' || s === '1' || s === 'yes'
}
