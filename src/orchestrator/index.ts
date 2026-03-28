/**
 * Jarvis-v4 orchestrator — shared event bus + screen agent bootstrap.
 * Import bootstrap/shutdown from the app shell (Electron main, server, etc.).
 */
import EventEmitter from 'eventemitter3'

import { BehaviourLogger } from '@/agents/behaviour/behaviour-logger'
import { SpacesClient } from '@/agents/behaviour/spaces-client'
import { ScreenAgent } from '@/agents/screen-agent'
import type { ScreenState } from '@/agents/screen-agent/types'
import { createVoiceAgent, type VoiceAgent } from '@/agents/voice'

import { ScreenAgentHandler } from './screen-agent-handler'
import { ScreenAgentLauncher } from './screen-agent-launcher'

/** Global bus for intents, voice, and agent coordination. */
export const globalEmitter = new EventEmitter()

let behaviourLogger: BehaviourLogger | null = null
let voiceAgent: VoiceAgent | null = null
let screenAgent: ScreenAgent | null = null
let screenAgentHandler: ScreenAgentHandler | null = null
let sidecarLauncher: ScreenAgentLauncher | null = null

/**
 * Starts the Python WebSocket sidecar, wires {@link ScreenAgentHandler}, connects {@link ScreenAgent}.
 * Call before other agents that depend on screen state.
 */
export async function bootstrapJarvisScreenAgent(): Promise<void> {
  const spacesClient = new SpacesClient()
  behaviourLogger = new BehaviourLogger(globalEmitter, spacesClient)
  behaviourLogger.init()
  console.info('Behaviour logger started — session: ' + behaviourLogger.getSessionId())

  voiceAgent = createVoiceAgent(globalEmitter)
  await voiceAgent.initialize()
  console.info('Voice agent registered')

  const port = Number(process.env.SCREEN_AGENT_PORT ?? 8765)

  sidecarLauncher = new ScreenAgentLauncher(port)
  await sidecarLauncher.start()

  screenAgent = new ScreenAgent({ wsPort: port })
  screenAgentHandler = new ScreenAgentHandler(screenAgent, globalEmitter)
  screenAgentHandler.init()
  await screenAgent.initialize()

  screenAgent.on('screen:change', (state: ScreenState) => {
    globalEmitter.emit('screen:change', state)
  })

  console.info('Screen agent registered and ready')
}

/** Stops handler, screen agent, and Python sidecar (graceful shutdown). */
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

export { ScreenAgentHandler } from './screen-agent-handler'
export { ScreenAgentLauncher } from './screen-agent-launcher'
