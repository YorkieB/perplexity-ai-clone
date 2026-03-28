/** Operating mode for the screen agent (watch-only, advise, or act). */
export enum AgentMode {
  WATCH = 'WATCH',
  ADVISE = 'ADVISE',
  ACT = 'ACT',
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export interface ScreenElement {
  id: string
  type: string
  label: string
  bbox: BoundingBox
  centre: { x: number; y: number }
  isInteractive: boolean
  confidence: number
  textContent: string
}

export interface ScreenState {
  frameId: string
  timestamp: number
  activeApp: string | null
  windowTitle: string | null
  fullText: string
  errorDetected: boolean
  url: string | null
  elements: ScreenElement[]
  resolution: { width: number; height: number }
}

export interface AgentAction {
  type: string
  targetId?: string
  text?: string
  keys?: string[]
  reasoning: string
  needsApproval: boolean
}

export interface ScreenAgentConfig {
  wsPort: number
  mode: AgentMode
  diffThreshold: number
  targetFps: number
  weightsDir: string
}

export interface SignificanceResult {
  score: number
  reason: string
  shouldSpeak: boolean
}

export interface GoalResult {
  success: boolean
  goal: string
  stepsCompleted: number
  failureReason?: string
}

/**
 * Typed event map for {@link import('./python-bridge').PythonBridge} and {@link GoalExecutor}.
 * Spoken output is signaled only via `jarvis:speak` (consumers outside this module).
 */
export interface ScreenAgentEvents {
  'screen:change': [ScreenState]
  'screen:error': [{ state: ScreenState; errorText: string }]
  'screen:advice_ready': [{ advice: string }]
  /** Emitted by voice/UI when the user confirms an approval prompt (e.g. says “confirm”). */
  'user:confirmed': []
  /** Emitted by voice/UI when the user cancels an approval prompt (e.g. says “cancel”). */
  'user:cancelled': []
  'screen:approval_required': [
    {
      action: AgentAction
      description: string
      resolve: (approved: boolean) => void
    },
  ]
  'screen:agent_stopped': [{ reason: string }]
  'jarvis:speak': [{ text: string; priority: 'low' | 'normal' | 'high' }]
}
