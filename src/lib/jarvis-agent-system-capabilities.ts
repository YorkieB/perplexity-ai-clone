/**
 * JARVIS — IDE Agent System capabilities
 * Autonomous agent loop: plan, execute, recover, human gates, tooling, state, observability.
 */

export type JarvisAgentSystemCapabilityCategory =
  | 'planning'
  | 'execution'
  | 'recovery'
  | 'human-control'
  | 'tools'
  | 'state'
  | 'logging'

export type JarvisAgentSystemCapabilityId =
  | 'agent-sys-create-task'
  | 'agent-sys-break-steps'
  | 'agent-sys-order-steps'
  | 'agent-sys-exec-sequential'
  | 'agent-sys-exec-conditional'
  | 'agent-sys-exec-loops'
  | 'agent-sys-detect-failure'
  | 'agent-sys-generate-hypotheses'
  | 'agent-sys-generate-fixes'
  | 'agent-sys-apply-fixes'
  | 'agent-sys-validate-fixes'
  | 'agent-sys-continue-until-success'
  | 'agent-sys-request-approval'
  | 'agent-sys-reject-action'
  | 'agent-sys-switch-tools'
  | 'agent-sys-maintain-internal-state'
  | 'agent-sys-log-reasoning'
  | 'agent-sys-log-actions'
  | 'agent-sys-log-errors'
  | 'agent-sys-log-fixes'

export interface JarvisAgentSystemCapabilityDef {
  readonly id: JarvisAgentSystemCapabilityId
  readonly label: string
  readonly category: JarvisAgentSystemCapabilityCategory
}

/** Canonical registry — 20 Agent System capabilities. */
export const JARVIS_AGENT_SYSTEM_CAPABILITY_REGISTRY: readonly JarvisAgentSystemCapabilityDef[] = [
  { id: 'agent-sys-create-task', label: 'Create agent task', category: 'planning' },
  { id: 'agent-sys-break-steps', label: 'Break task into steps', category: 'planning' },
  { id: 'agent-sys-order-steps', label: 'Order steps', category: 'planning' },

  { id: 'agent-sys-exec-sequential', label: 'Execute steps sequentially', category: 'execution' },
  { id: 'agent-sys-exec-conditional', label: 'Execute steps conditionally', category: 'execution' },
  { id: 'agent-sys-exec-loops', label: 'Execute loops', category: 'execution' },

  { id: 'agent-sys-detect-failure', label: 'Detect failure', category: 'recovery' },
  { id: 'agent-sys-generate-hypotheses', label: 'Generate hypotheses', category: 'recovery' },
  { id: 'agent-sys-generate-fixes', label: 'Generate fixes', category: 'recovery' },
  { id: 'agent-sys-apply-fixes', label: 'Apply fixes', category: 'recovery' },
  { id: 'agent-sys-validate-fixes', label: 'Validate fixes', category: 'recovery' },
  { id: 'agent-sys-continue-until-success', label: 'Continue until success', category: 'recovery' },

  { id: 'agent-sys-request-approval', label: 'Request approval', category: 'human-control' },
  { id: 'agent-sys-reject-action', label: 'Reject action', category: 'human-control' },

  { id: 'agent-sys-switch-tools', label: 'Switch tools', category: 'tools' },

  { id: 'agent-sys-maintain-internal-state', label: 'Maintain internal state', category: 'state' },

  { id: 'agent-sys-log-reasoning', label: 'Log reasoning', category: 'logging' },
  { id: 'agent-sys-log-actions', label: 'Log actions', category: 'logging' },
  { id: 'agent-sys-log-errors', label: 'Log errors', category: 'logging' },
  { id: 'agent-sys-log-fixes', label: 'Log fixes', category: 'logging' },
]

const BY_ID: ReadonlyMap<JarvisAgentSystemCapabilityId, JarvisAgentSystemCapabilityDef> = new Map(
  JARVIS_AGENT_SYSTEM_CAPABILITY_REGISTRY.map((d) => [d.id, d])
)

export function getJarvisAgentSystemCapabilityDef(
  id: JarvisAgentSystemCapabilityId
): JarvisAgentSystemCapabilityDef | undefined {
  return BY_ID.get(id)
}

export function isJarvisAgentSystemCapabilityId(s: string): s is JarvisAgentSystemCapabilityId {
  return BY_ID.has(s as JarvisAgentSystemCapabilityId)
}

export function jarvisAgentSystemCapabilitiesByCategory(
  cat: JarvisAgentSystemCapabilityCategory
): readonly JarvisAgentSystemCapabilityDef[] {
  return JARVIS_AGENT_SYSTEM_CAPABILITY_REGISTRY.filter((d) => d.category === cat)
}

function categoryTitleAgentSys(cat: JarvisAgentSystemCapabilityCategory): string {
  const map: Record<JarvisAgentSystemCapabilityCategory, string> = {
    planning: 'Planning',
    execution: 'Execution',
    recovery: 'Recovery',
    'human-control': 'Human control',
    tools: 'Tools',
    state: 'State',
    logging: 'Logging',
  }
  return map[cat]
}

export function formatJarvisAgentSystemCapabilityCatalog(): string {
  const cats: JarvisAgentSystemCapabilityCategory[] = [
    'planning',
    'execution',
    'recovery',
    'human-control',
    'tools',
    'state',
    'logging',
  ]
  const lines = cats.map((c) => {
    const items = jarvisAgentSystemCapabilitiesByCategory(c).map((d) => d.label)
    return `${categoryTitleAgentSys(c)}: ${items.join('; ')}.`
  })
  return ['JARVIS Agent System capabilities (canonical ids in `jarvis-agent-system-capabilities` registry):', ...lines].join(
    '\n'
  )
}

export function getJarvisAgentSystemCapabilitiesPromptSection(): string {
  return (
    'JARVIS Agent System: create tasks; break and order steps; run steps sequentially, conditionally, or in loops; ' +
    'on failure, hypothesize, generate/apply/validate fixes, continue until success; request approval or reject actions; ' +
    'switch tools; keep internal state; log reasoning, actions, errors, and fixes. ' +
    'Canonical ids: `src/lib/jarvis-agent-system-capabilities.ts` (JARVIS_AGENT_SYSTEM_CAPABILITY_REGISTRY).'
  )
}
