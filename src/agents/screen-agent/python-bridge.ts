import EventEmitter from 'eventemitter3'
import WebSocket from 'ws'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

const CONNECT_TIMEOUT_MS = 10_000
const RECONNECT_DELAY_MS = 3000

/**
 * Wire protocol events from the Python sidecar (distinct from {@link ScreenAgentEvents} in `./types`).
 */
export interface PythonBridgeEvents {
  screen_change: [Record<string, unknown>]
  query_response: [{ answer: string }]
  memory_response: [{ record: unknown }]
  connected: []
  disconnected: []
}

/**
 * WebSocket client to the Python screen-capture sidecar (`ws://localhost:{port}`).
 */
export class PythonBridge extends EventEmitter<PythonBridgeEvents> {
  private readonly url: string
  private ws: WebSocket | null = null
  private status: ConnectionStatus = 'disconnected'
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectScheduled = false
  private closingIntentionally = false

  constructor(private readonly port: number) {
    super()
    this.url = `ws://localhost:${String(port)}`
  }

  getStatus(): ConnectionStatus {
    return this.status
  }

  async connect(): Promise<void> {
    this.clearReconnectTimer()
    this.closingIntentionally = false
    this.status = 'connecting'

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.url)
      this.ws = socket

      let settled = false
      const to = setTimeout(() => {
        if (settled) return
        settled = true
        socket.removeAllListeners()
        try {
          socket.terminate()
        } catch {
          /* ignore */
        }
        this.ws = null
        this.status = 'disconnected'
        reject(new Error(`PythonBridge: connect timeout after ${String(CONNECT_TIMEOUT_MS)}ms`))
      }, CONNECT_TIMEOUT_MS)

      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(to)
        fn()
      }

      const onConnectError = (err: Error) => {
        finish(() => {
          console.error('[PythonBridge] connect error:', err)
          try {
            socket.terminate()
          } catch {
            /* ignore */
          }
          this.ws = null
          this.status = 'disconnected'
          reject(err instanceof Error ? err : new Error(String(err)))
        })
      }
      socket.once('error', onConnectError)

      socket.once('open', () => {
        socket.off('error', onConnectError)
        finish(() => {
          this.status = 'connected'
          socket.on('error', (runtimeErr: Error) => {
            console.error('[PythonBridge] socket error:', runtimeErr)
          })
          this.emit('connected')
          resolve()
        })
      })

      socket.on('message', (data: WebSocket.RawData) => {
        try {
          const text = typeof data === 'string' ? data : data.toString('utf8')
          const msg = JSON.parse(text) as Record<string, unknown>
          const t = msg.type
          if (t === 'screen_change') {
            this.emit('screen_change', msg)
          } else if (t === 'query_response') {
            const answer = typeof msg.answer === 'string' ? msg.answer : ''
            this.emit('query_response', { answer })
          } else if (t === 'memory_response') {
            const record = 'record' in msg ? msg.record : null
            this.emit('memory_response', { record })
          }
        } catch (e) {
          console.error('[PythonBridge] message parse error:', e)
        }
      })

      socket.on('close', () => {
        clearTimeout(to)
        this.status = 'disconnected'
        this.emit('disconnected')
        this.ws = null
        const intentional = this.closingIntentionally
        this.closingIntentionally = false
        if (!intentional) {
          this.scheduleReconnect()
        }
      })
    })
  }

  send(command: Record<string, unknown>): void {
    if (this.status !== 'connected' || this.ws === null) {
      console.warn('[PythonBridge] send skipped — not connected', command)
      return
    }
    try {
      this.ws.send(JSON.stringify(command))
    } catch (e) {
      console.error('[PythonBridge] send failed:', e)
    }
  }

  disconnect(): void {
    this.clearReconnectTimer()
    this.reconnectScheduled = false
    this.closingIntentionally = true
    if (this.ws !== null) {
      try {
        this.ws.removeAllListeners()
        this.ws.close()
      } catch {
        /* ignore */
      }
      this.ws = null
    }
    this.status = 'disconnected'
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectScheduled) {
      return
    }
    this.reconnectScheduled = true
    console.info('[PythonBridge] scheduling reconnect in', RECONNECT_DELAY_MS, 'ms')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.reconnectScheduled = false
      console.info('[PythonBridge] reconnect attempt')
      void this.connect().catch((err: unknown) => {
        console.error('[PythonBridge] reconnect failed:', err)
      })
    }, RECONNECT_DELAY_MS)
  }
}
