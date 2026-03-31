/**
 * Starts Vite (or reuses an already-running instance), then launches Electron with
 * ELECTRON_START_URL so `window.electronInAppBrowser` is injected and `<webview>` works.
 *
 * Plain `npm run dev` serves the SPA with an iframe browser proxy, but full in-app
 * browsing (tabs, downloads, DevTools) needs this Electron wrapper.
 */
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const defaultPort = process.env.JARVIS_VITE_PORT || '5173'
// Use `localhost` (not `127.0.0.1`) — Vite on Windows binds to IPv6 [::1]
const viteUrl = (process.env.JARVIS_VITE_URL || `http://localhost:${defaultPort}`).replace(/\/$/, '') + '/'

function probeUrl(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume()
      resolve(true)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(2000, () => { req.destroy(); resolve(false) })
  })
}

async function waitForViteReady() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (await probeUrl(viteUrl)) return
    await new Promise(r => setTimeout(r, 400))
  }
  throw new Error(`Vite did not become ready at ${viteUrl} within 120s`)
}

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
let vite = null

const electronCli = path.join(root, 'node_modules', 'electron', 'cli.js')

function shutdown(code = 0) {
  try { if (vite && !vite.killed) vite.kill('SIGTERM') } catch { /* ignore */ }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

;(async () => {
  const alreadyRunning = await probeUrl(viteUrl)

  if (alreadyRunning) {
    console.log(`[desktop:dev] Vite already running at ${viteUrl} — reusing it`)
  } else {
    console.log('[desktop:dev] Starting Vite…')
    vite = spawn(npmCmd, ['run', 'dev'], {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env },
    })
    await waitForViteReady()
  }

  console.log(`[desktop:dev] Launching Electron with ELECTRON_START_URL=${viteUrl}`)
  const env = { ...process.env, ELECTRON_START_URL: viteUrl }
  const electron = spawn(process.execPath, [electronCli, '.'], {
    cwd: root,
    stdio: 'inherit',
    env,
    shell: false,
  })
  electron.on('exit', (code) => shutdown(code ?? 0))
})().catch((err) => {
  console.error('[desktop:dev]', err instanceof Error ? err.message : err)
  try { if (vite && !vite.killed) vite.kill('SIGTERM') } catch { /* ignore */ }
  process.exit(1)
})
