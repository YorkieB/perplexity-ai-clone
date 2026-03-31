/**
 * Jarvis-v4 orchestrator — shared event bus + screen agent bootstrap.
 * Import bootstrap/shutdown from the app shell (Electron main, server, etc.).
 */
import EventEmitter from 'eventemitter3'

import { SpacesClient } from '../agents/behaviour/spaces-client'
import { BehaviourLogger } from '../agents/behaviour/behaviour-logger'
import { ScreenAgent } from '@/agents/screen-agent'
import type { ScreenState } from '@/agents/screen-agent/types'
import { createVoiceAgent, type VoiceAgent } from '@/agents/voice'

import type { JarvisBrowserActIpcPayload } from '@/browser/screen-browser-act'

import { ScreenAgentHandler } from './screen-agent-handler'
import { ScreenAgentLauncher } from './screen-agent-launcher'

export type BootstrapJarvisScreenAgentOptions = {
  delegateBrowserAct?: (payload: JarvisBrowserActIpcPayload) => void
}

/** Global bus for intents, voice, and agent coordination. */
export const globalEmitter = new EventEmitter()

const logger = {
  info: (message: string) => console.info(`[jarvis] ${message}`),
}

let behaviourLogger: BehaviourLogger | null = null
let voiceAgent: VoiceAgent | null = null
let screenAgent: ScreenAgent | null = null
let screenAgentHandler: ScreenAgentHandler | null = null
let sidecarLauncher: ScreenAgentLauncher | null = null

/**
 * Starts the Python WebSocket sidecar, wires {@link ScreenAgentHandler}, connects {@link ScreenAgent}.
 * Call before other agents that depend on screen state.
 */
/** Latest frame from the Python sidecar (main process). Exposed for IPC → voice instructions. */
export type JarvisScreenContextPayload = {
  activeApp: string | null
  windowTitle: string | null
  summary: string
  resolution: { width: number; height: number }
  updatedAt: number
  bridgeConnected: boolean
}

export function getJarvisLatestScreenContext(): JarvisScreenContextPayload | null {
  const agent = screenAgent
  if (agent === null) {
    return null
  }
  const bridgeConnected = agent.isPythonBridgeConnected()
  const s = agent.getCurrentState()
  if (s === null) {
    return {
      activeApp: null,
      windowTitle: null,
      summary: '',
      resolution: { width: 0, height: 0 },
      updatedAt: 0,
      bridgeConnected,
    }
  }
  return {
    activeApp: s.activeApp,
    windowTitle: s.windowTitle,
    summary: s.fullText,
    resolution: s.resolution,
    updatedAt: s.timestamp,
    bridgeConnected,
  }
}

export async function bootstrapJarvisScreenAgent(
  options?: BootstrapJarvisScreenAgentOptions,
): Promise<void> {
  if (screenAgent !== null || voiceAgent !== null) {
    await shutdownJarvisScreenAgent()
  }

  const spacesClient = new SpacesClient()
  if (spacesClient.isEnabled()) {
    logger.info('Behaviour logging: Spaces upload enabled')
  } else {
    logger.info('Behaviour logging: Spaces disabled — set SPACES_* or DO_SPACES_* in .env to persist events')
  }
  behaviourLogger = new BehaviourLogger(globalEmitter, spacesClient)
  behaviourLogger.init()
  logger.info('Behaviour logger started — session: ' + behaviourLogger.getSessionId())

  // Default off: main-process ElevenLabs for jarvis:speak overlaps Voice Mode (Realtime + EL) in the renderer.
  const voiceAgentTtsEnabled = !['0', 'false', 'no'].includes(
    String(process.env.JARVIS_VOICEAGENT_TTS ?? '0').trim().toLowerCase(),
  )
  if (voiceAgentTtsEnabled) {
    voiceAgent = createVoiceAgent(globalEmitter)
    await voiceAgent.initialize()
    logger.info('Voice agent registered (ElevenLabs jarvis:speak) — set JARVIS_VOICEAGENT_TTS=0 to disable if double voice')
  } else {
    voiceAgent = null
    logger.info('Voice agent TTS disabled (default) — set JARVIS_VOICEAGENT_TTS=1 for screen-agent-only ElevenLabs')
  }

  const port = Number(process.env.SCREEN_AGENT_PORT ?? 8765)

  sidecarLauncher = new ScreenAgentLauncher(port)
  await sidecarLauncher.start()

  screenAgent = new ScreenAgent({ wsPort: port }, { globalBehaviourBus: globalEmitter })
  screenAgentHandler = new ScreenAgentHandler(screenAgent, globalEmitter, {
    delegateBrowserAct: options?.delegateBrowserAct,
  })
  screenAgentHandler.init()
  await screenAgent.initialize()

  screenAgent.on('screen:change', (state: ScreenState) => {
    globalEmitter.emit('screen:change', state)
  })

  logger.info('Screen agent registered and ready')
}

/** Stops handler, screen agent, and Python sidecar (graceful shutdown). */
/**
 * Electron: call while Voice Mode is open so main-process `jarvis:speak` TTS does not overlap Realtime voice.
 * No-op when `JARVIS_VOICEAGENT_TTS` is off or orchestrator not loaded.
 */
export function setJarvisVoiceAgentPlaybackSuppressed(suppress: boolean): void {
  voiceAgent?.setPlaybackSuppressed(suppress)
}

export async function shutdownJarvisScreenAgent(): Promise<void> {
  voiceAgent?.stop()
  voiceAgent = null
  screenAgentHandler?.destroy()
  screenAgent?.stop()
  sidecarLauncher?.stop()
  screenAgentHandler = null
  screenAgent = null
  sidecarLauncher = null

  if (behaviourLogger !== null) {
    await behaviourLogger.endSession()
    behaviourLogger = null
  }
}

export { ScreenAgentHandler, type ScreenAgentHandlerOptions } from './screen-agent-handler'
export { ScreenAgentLauncher } from './screen-agent-launcher'
