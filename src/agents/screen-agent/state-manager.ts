import type { ScreenState } from './types'

/**
 * Persists and queries recent screen frames (memory backend injected).
 */
export class StateManager {
  constructor(private readonly _memoryClient: unknown) {}

  async store(_state: ScreenState): Promise<void> {
    /* stub */
  }

  getLatest(): ScreenState | null {
    return null
  }

  async getStateAt(_timestamp: number): Promise<ScreenState | null> {
    return null
  }

  async getRecentErrors(_lastNSeconds: number): Promise<ScreenState[]> {
    return []
  }

  async getAppHistory(_appName: string, _lastNSeconds: number): Promise<ScreenState[]> {
    return []
  }
}
