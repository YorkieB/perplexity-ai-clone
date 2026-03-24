/**
 * Friendly personality names for AI models.
 * Used in the Model Council conversation view and throughout the UI.
 */
const KNOWN_NAMES: Record<string, string> = {
  'gpt-4o': 'Oliver',
  'gpt-4o-mini': 'Sage',
  'gpt-4-turbo': 'Turbo',
  'gpt-4': 'Quinn',
  'gpt-3.5-turbo': 'Sprint',
  'o1': 'One',
  'o1-mini': 'One Mini',
  'claude-3.5-sonnet': 'Claude',
  'claude-3-opus': 'Opus',
  'claude-3-haiku': 'Haiku',
  'claude-3-sonnet': 'Claude Sonnet',
  'gemini-2.0-flash': 'Gemini',
  'gemini-pro': 'Gemini Pro',
  'llama-3.1': 'Llama',
  'llama-3.2': 'Llama',
  'mistral': 'Mistral',
  'mixtral': 'Mixtral',
}

const PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /gpt-4o-mini/i, name: 'Sage' },
  { pattern: /gpt-4o/i, name: 'Oliver' },
  { pattern: /gpt-4-turbo/i, name: 'Turbo' },
  { pattern: /gpt-4\b/i, name: 'Quinn' },
  { pattern: /gpt-3\.5/i, name: 'Sprint' },
  { pattern: /o1-mini/i, name: 'One Mini' },
  { pattern: /\bo1\b/i, name: 'One' },
  { pattern: /claude-3\.5-sonnet/i, name: 'Claude' },
  { pattern: /claude-3-opus/i, name: 'Opus' },
  { pattern: /claude-3-haiku/i, name: 'Haiku' },
  { pattern: /claude-3-sonnet/i, name: 'Claude Sonnet' },
  { pattern: /claude-3/i, name: 'Claude' },
  { pattern: /gemini-2\.0-flash/i, name: 'Gemini' },
  { pattern: /gemini-pro/i, name: 'Gemini Pro' },
  { pattern: /llama-3\.2/i, name: 'Llama' },
  { pattern: /llama-3\.1/i, name: 'Llama' },
  { pattern: /llama-3/i, name: 'Llama' },
  { pattern: /mistral/i, name: 'Mistral' },
  { pattern: /mixtral/i, name: 'Mixtral' },
]

/**
 * Returns a friendly personality name for a model ID.
 * Falls back to a humanized version of the ID if unknown.
 */
export function getModelDisplayName(modelId: string): string {
  const trimmed = String(modelId || '').trim()
  if (!trimmed) return 'AI'

  const known = KNOWN_NAMES[trimmed]
  if (known) return known

  for (const { pattern, name } of PATTERNS) {
    if (pattern.test(trimmed)) return name
  }

  const lastPart = trimmed.split(/[/\\]/).pop() ?? trimmed
  const slug = lastPart.replace(/[-_]/g, ' ')
  return slug.charAt(0).toUpperCase() + slug.slice(1)
}
