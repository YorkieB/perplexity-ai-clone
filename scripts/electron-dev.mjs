/**
 * Starts Vite (or reuses an already-running instance), then launches Electron with
 * ELECTRON_START_URL so `window.electronInAppBrowser` is injected and `<webview>` works.
 *
 * Plain `npm run dev` serves the SPA with an iframe browser proxy, but full in-app
 * browsing (tabs, downloads, DevTools) needs this Electron wrapper.
 *
 * Jarvis Visual Engine: optional auto-start is handled in `electron/main.cjs` via
 * `JARVIS_VISION_ENGINE_COMMAND` in `.env` (starts with Electron, stops on quit).
 *
 * Cloudflare Tunnel: use `npm run desktop:dev:tunnel` (runs `dev:tunnel` = Vite on 5173 + strictPort)
 * so ingress `http://127.0.0.1:5173` matches `vite.config.ts` (`allowedHosts` for jarvis/voice).
 * Override: `JARVIS_VITE_NPM_SCRIPT=dev` or pass `--vite=dev:tunnel`.
 */
import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function viteNpmScript() {
  const fromEnv = (process.env.JARVIS_VITE_NPM_SCRIPT || '').trim()
  if (fromEnv) return fromEnv
  const arg = process.argv.find((a) => a.startsWith('--vite='))
  if (arg) {
    const v = arg.slice('--vite='.length).trim()
    if (v) return v
  }
  return 'dev'
}

const defaultPort = process.env.JARVIS_VITE_PORT || '5173'
// Must match `vite.config.ts` `server.host` (127.0.0.1). Using `localhost` can resolve to [::1]
// while Vite only listens on IPv4 — breaks the page, `/ws/realtime` (voice), and `/api/*`.
const viteUrl = (process.env.JARVIS_VITE_URL || `http://127.0.0.1:${defaultPort}`).replace(/\/$/, '') + '/'

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

  const npmScript = viteNpmScript()
  if (alreadyRunning) {
    console.log(`[desktop:dev] Vite already running at ${viteUrl} — reusing it`)
  } else {
    console.log(`[desktop:dev] Starting Vite (npm run ${npmScript})…`)
    vite = spawn(npmCmd, ['run', npmScript], {
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
