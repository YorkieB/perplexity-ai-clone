import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'

import WebSocket from 'ws'

const READY_MAX_ATTEMPTS = 10
const READY_POLL_MS = 300
const CONNECT_PROBE_MS = 500

function tryOpenWs(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = `ws://127.0.0.1:${String(port)}`
    const socket = new WebSocket(url)
    const timer = setTimeout(() => {
      socket.removeAllListeners()
      socket.close()
      reject(new Error('probe timeout'))
    }, CONNECT_PROBE_MS)
    socket.once('open', () => {
      clearTimeout(timer)
      socket.close()
      resolve()
    })
    socket.once('error', () => {
      clearTimeout(timer)
      reject(new Error('probe error'))
    })
  })
}

async function waitForSidecarWs(port: number): Promise<void> {
  for (let i = 0; i < READY_MAX_ATTEMPTS; i += 1) {
    try {
      await tryOpenWs(port)
      return
    } catch {
      await new Promise((r) => setTimeout(r, READY_POLL_MS))
    }
  }
  throw new Error('Screen agent sidecar failed to start')
}

/**
 * Spawns the Python screen sidecar with WebSocket transport and waits until the port accepts a client.
 */
export class ScreenAgentLauncher {
  private process: ChildProcess | null = null

  constructor(private readonly port: number) {}

  async start(scriptPath = join(process.cwd(), 'python', 'screen_agent.py')): Promise<void> {
    if (this.process !== null && this.process.exitCode === null) {
      return
    }

    const env = {
      ...process.env,
      SCREEN_AGENT_TRANSPORT: 'websocket',
      SCREEN_AGENT_WS_PORT: String(this.port),
      SCREEN_AGENT_PORT: String(this.port),
    }

    /** Prefer `SCREEN_AGENT_PYTHON` when the default `python` on PATH lacks `python/requirements.txt` deps. */
    const pythonExe = (process.env.SCREEN_AGENT_PYTHON ?? 'python').trim() || 'python'

    this.process = spawn(pythonExe, [scriptPath], {
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    })

    const stderr = this.process.stderr
    if (stderr !== null) {
      stderr.pipe(process.stderr)
    }

    this.process.on('error', (err) => {
      console.error('[ScreenAgentLauncher] child process error:', err)
    })

    await waitForSidecarWs(this.port)
    console.info(`Python sidecar ready on port ${String(this.port)}`)
  }

  stop(): void {
    if (this.process !== null) {
      try {
        this.process.kill('SIGTERM')
      } catch {
        /* ignore */
      }
      this.process = null
    }
    console.info('Python sidecar stopped')
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed
  }
}
