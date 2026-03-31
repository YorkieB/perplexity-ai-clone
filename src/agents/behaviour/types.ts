export enum BehaviourEventType {
  VOICE_INPUT = 'voice_input',
  INTENT_RESOLVED = 'intent_resolved',
  MODE_CHANGED = 'mode_changed',
  GOAL_STARTED = 'goal_started',
  GOAL_COMPLETED = 'goal_completed',
  GOAL_FAILED = 'goal_failed',
  ADVICE_GIVEN = 'advice_given',
  SCREEN_CHANGE = 'screen_change',
  SESSION_START = 'session_start',
  SESSION_END = 'session_end',
  ERROR = 'error',
}

export interface BehaviourEvent {
  sessionId: string
  timestamp: number
  timeOfDay: string
  dayOfWeek: number
  app: string | null
  eventType: BehaviourEventType
  intent: string | null
  rawText: string | null
  agentMode: string | null
  durationMs: number | null
  outcome: 'success' | 'failure' | 'pending' | null
  metadata: Record<string, unknown>
}

export interface SessionSummary {
  totalEvents: number
  intentsResolved: string[]
  modesUsed: string[]
  goalsCompleted: number
  goalsFailed: number
  mostActiveApp: string | null
  durationMinutes: number
}

export interface BehaviourSession {
  sessionId: string
  startTime: number
  endTime: number | null
  events: BehaviourEvent[]
  summary: SessionSummary | null
}
