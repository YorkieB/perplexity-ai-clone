import EventEmitter from 'eventemitter3'

import type { ScreenAgentEvents } from './types'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

/**
 * WebSocket client to the Python screen-capture / desktop control service (skeleton).
 */
export class PythonBridge extends EventEmitter<ScreenAgentEvents> {
  constructor(private readonly port: number) {
    super()
  }

  async connect(): Promise<void> {
    /* stub */
  }

  send(_command: Record<string, unknown>): void {
    /* stub */
  }

  disconnect(): void {
    /* stub */
  }

  getStatus(): ConnectionStatus {
    return 'disconnected'
  }

  private scheduleReconnect(): void {
    /* stub */
  }
}
