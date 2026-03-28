import type { ScreenState } from './types'

const LOCAL_TTL_MS = 7200 * 1000
const SCREEN_KEY_TTL_SEC = 7200
const ERROR_KEY_TTL_SEC = 86400

/** Optional Jarvis memory backend (injected when available). */
export interface JarvisMemoryClient {
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>
}

function nowMs(): number {
  return Date.now()
}

function pruneMap(map: Map<number, ScreenState>): void {
  const cutoff = nowMs() - LOCAL_TTL_MS
  for (const [k, state] of map.entries()) {
    if (state.timestamp < cutoff) {
      map.delete(k)
    }
  }
}

/** Local map key: wall-clock ms (one entry per captured frame). */
function localKey(state: ScreenState): number {
  return state.timestamp
}

/**
 * Persists and queries recent screen frames (memory backend injected).
 */
export class StateManager {
  private latestState: ScreenState | null = null
  private readonly localStore = new Map<number, ScreenState>()

  constructor(private readonly memoryClient: JarvisMemoryClient | null | undefined) {}

  async store(state: ScreenState): Promise<void> {
    this.latestState = state
    this.localStore.set(localKey(state), state)
    pruneMap(this.localStore)

    const client = this.memoryClient
    if (client !== null && client !== undefined) {
      const key = `screen:${state.frameId}:${String(state.timestamp)}`
      try {
        await client.set(key, state, SCREEN_KEY_TTL_SEC)
        if (state.errorDetected) {
          await client.set(`screen:error:${String(state.timestamp)}`, state, ERROR_KEY_TTL_SEC)
        }
      } catch (e) {
        console.warn('[StateManager] memory set failed', e)
      }
    }
  }

  getLatest(): ScreenState | null {
    return this.latestState
  }

  async getStateAt(timestamp: number): Promise<ScreenState | null> {
    let best: ScreenState | null = null
    let bestDelta = Number.POSITIVE_INFINITY
    for (const state of this.localStore.values()) {
      const d = Math.abs(state.timestamp - timestamp)
      if (d < bestDelta) {
        bestDelta = d
        best = state
      }
    }
    if (best === null || bestDelta > 30_000) {
      return null
    }
    return best
  }

  async getRecentErrors(lastNSeconds: number): Promise<ScreenState[]> {
    const cutoff = nowMs() - lastNSeconds * 1000
    const out: ScreenState[] = []
    for (const state of this.localStore.values()) {
      if (state.errorDetected && state.timestamp >= cutoff) {
        out.push(state)
      }
    }
    out.sort((a, b) => b.timestamp - a.timestamp)
    return out
  }

  async getAppHistory(appName: string, lastNSeconds: number): Promise<ScreenState[]> {
    const cutoff = nowMs() - lastNSeconds * 1000
    const needle = appName.toLowerCase()
    const out: ScreenState[] = []
    for (const state of this.localStore.values()) {
      const app = state.activeApp
      if (app !== null && app.toLowerCase().includes(needle) && state.timestamp >= cutoff) {
        out.push(state)
      }
    }
    out.sort((a, b) => a.timestamp - b.timestamp)
    return out
  }
}
