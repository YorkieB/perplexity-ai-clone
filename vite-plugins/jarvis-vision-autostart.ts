/**
 * Dev / preview: start the Jarvis Visual Engine when the Vite server starts, if
 * `JARVIS_VISION_ENGINE_COMMAND` is set and nothing already answers at VISION_ENGINE_URL.
 * Avoids double-spawn when Electron also starts the engine — probe `/api/v1/context` first.
 */
import { spawn, type ChildProcess } from 'node:child_process'

export function attachJarvisVisionAutostart(options: {
  projectRoot: string
  loadedEnv: Record<string, string>
}): () => void {
  const merged = { ...process.env, ...options.loadedEnv } as NodeJS.ProcessEnv
  const cmd = String(merged.JARVIS_VISION_ENGINE_COMMAND || '').trim()
  const viteOff = ['0', 'false', 'no'].includes(String(merged.JARVIS_VISION_AUTOSTART_VITE ?? '1').trim().toLowerCase())
  if (!cmd || viteOff) {
    return () => {}
  }

  let child: ChildProcess | null = null
  let intentionalStop = false
  let restartTimer: ReturnType<typeof setTimeout> | null = null

  const base = String(merged.VISION_ENGINE_URL || merged.JARVIS_VISION_ENGINE_URL || 'http://127.0.0.1:5000')
    .trim()
    .replace(/\/$/, '')
  const key = merged.VISION_API_KEY || 'jarvis-vision-local'
  const label = String(merged.VISION_CAMERA_LABEL || merged.JARVIS_CAMERA_LABEL || 'emeet').trim() || 'emeet'

  async function probeOk(): Promise<boolean> {
    try {
      const r = await fetch(`${base}/api/v1/context`, {
        headers: { 'X-API-Key': key, 'X-Jarvis-Camera-Label': label },
      })
      return r.ok
    } catch {
      return false
    }
  }

  function spawnEngine() {
    if (intentionalStop) return
    try {
      child = spawn(cmd, {
        cwd: options.projectRoot,
        shell: true,
        stdio: 'inherit',
        env: merged,
      })
      console.info('[vite] Jarvis Visual Engine — spawned:', cmd)
      child.on('exit', (code, signal) => {
        child = null
        if (intentionalStop) return
        console.warn('[vite] Jarvis Visual Engine exited', { code, signal: signal || '' })
        restartTimer = setTimeout(() => {
          restartTimer = null
          if (intentionalStop) return
          void runProbeAndMaybeSpawn()
        }, 2000)
      })
      child.on('error', (err) => {
        console.error('[vite] Jarvis Visual Engine spawn error:', err.message)
        child = null
        if (!intentionalStop) {
          restartTimer = setTimeout(() => {
            restartTimer = null
            void runProbeAndMaybeSpawn()
          }, 3000)
        }
      })
    } catch (e) {
      console.error('[vite] Jarvis Visual Engine failed to start:', e instanceof Error ? e.message : e)
    }
  }

  async function runProbeAndMaybeSpawn() {
    if (intentionalStop) return
    if (await probeOk()) {
      console.info('[vite] Jarvis Visual Engine already up at', base, '— skip spawn')
      return
    }
    if (intentionalStop) return
    spawnEngine()
  }

  void runProbeAndMaybeSpawn()

  return () => {
    intentionalStop = true
    if (restartTimer) {
      clearTimeout(restartTimer)
      restartTimer = null
    }
    if (child && !child.killed) {
      try {
        child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
    }
    child = null
  }
}
