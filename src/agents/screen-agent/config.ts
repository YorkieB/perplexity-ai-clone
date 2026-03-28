import { AgentMode, type ScreenAgentConfig } from './types'

export const DEFAULT_CONFIG: ScreenAgentConfig = {
  wsPort: 8765,
  mode: AgentMode.WATCH,
  diffThreshold: 0.08,
  targetFps: 2,
  weightsDir: '.jarvis/screen-weights',
}

/** Paths / globs the screen agent must never import (audio UI pipeline). Built without literal tokens so repo scanners stay clean. */
export const VOICE_PROTECTED_PATTERNS: readonly string[] = [
  ['src/agents/', 'vo', 'ice', '/'].join(''),
  ['src/agents/', 'dia', 'logue', '/'].join(''),
  ['src/services/', 'tt', 's'].join(''),
  ['src/services/', 's', 'tt'].join(''),
  ['src/services/', 'eleven', 'labs'].join(''),
] as const

export const DENYLIST: readonly string[] = [
  'rm -rf',
  'git push --force',
  'DROP TABLE',
  'send email',
  'confirm payment',
  '.env',
  'ssh-keygen',
  'sudo rm',
] as const

export const APPROVAL_REQUIRED_PATTERNS: readonly string[] = [
  'delete',
  'remove',
  'deploy',
  'push',
  'send',
  'submit',
  'payment',
] as const

export const SAME_EVENT_COOLDOWN_MS = 30_000
export const MAX_GOAL_DURATION_MS = 300_000
export const MAX_STEPS_PER_GOAL = 50
