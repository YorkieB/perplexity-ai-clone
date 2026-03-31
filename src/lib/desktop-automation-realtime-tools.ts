/**
 * Normalises a loose or Chat Completions-style tool descriptor into an OpenAI Realtime
 * `session.tools[]` entry (`{ type: 'function', name, description, parameters }`).
 * Returns `null` if the spec cannot be converted safely.
 */
export function desktopAutomationChatSpecToRealtime(spec: Record<string, unknown>): Record<string, unknown> | null {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return null

  const inner = spec.function
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const f = inner as Record<string, unknown>
    const name = typeof f.name === 'string' ? f.name.trim() : ''
    if (!name) return null
    const parameters = f.parameters
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) return null
    return {
      type: 'function',
      name,
      description: typeof f.description === 'string' ? f.description : '',
      parameters,
    }
  }

  if (spec.type !== 'function') return null
  const name = typeof spec.name === 'string' ? spec.name.trim() : ''
  if (!name) return null
  const parameters = spec.parameters
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) return null
  return {
    type: 'function',
    name,
    description: typeof spec.description === 'string' ? spec.description : '',
    parameters,
  }
}

export function isValidRealtimeFunctionTool(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const o = value as Record<string, unknown>
  return (
    o.type === 'function' &&
    typeof o.name === 'string' &&
    o.name.length > 0 &&
    o.parameters != null &&
    typeof o.parameters === 'object' &&
    !Array.isArray(o.parameters)
  )
}

/** Optional Electron / host injection: `globalThis.jarvisDesktopAutomationToolSpecs`. */
export function getOptionalDesktopAutomationToolSpecsFromGlobal(): Record<string, unknown>[] {
  try {
    const raw = (globalThis as Record<string, unknown>).jarvisDesktopAutomationToolSpecs
    if (!Array.isArray(raw)) return []
    return raw.filter((x): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x))
  } catch {
    return []
  }
}
