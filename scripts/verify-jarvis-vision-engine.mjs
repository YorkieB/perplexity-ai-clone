/**
 * Verifies `jarvis_visual_engine` is importable using the same interpreter
 * implied by `JARVIS_VISION_ENGINE_COMMAND` in `.env` (or the default).
 *
 * Usage: node scripts/verify-jarvis-vision-engine.mjs
 *
 * If import fails, use a full path to the Python that has the package installed, e.g.:
 *   JARVIS_VISION_ENGINE_COMMAND=C:\\path\\to\\venv\\Scripts\\python.exe -m jarvis_visual_engine
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

function parseEnvFile(filePath) {
  const out = {}
  if (!fs.existsSync(filePath)) return out
  const text = fs.readFileSync(filePath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

const fileEnv = parseEnvFile(path.join(root, '.env'))
const cmd = (fileEnv.JARVIS_VISION_ENGINE_COMMAND || process.env.JARVIS_VISION_ENGINE_COMMAND || '')
  .trim() || 'python -m jarvis_visual_engine'

/** Expect `… -m jarvis_visual_engine` (interpreter may be a quoted path with spaces). */
const needle = ' -m jarvis_visual_engine'
const idx = cmd.toLowerCase().lastIndexOf(needle.toLowerCase())
const pythonExe =
  idx === -1 ? null : cmd.slice(0, idx).trim().replace(/^["']|["']$/g, '')

if (!pythonExe) {
  console.error(
    '[verify-vision] Could not parse Python from JARVIS_VISION_ENGINE_COMMAND.\n' +
      `  Current value: ${cmd}\n` +
      '  Expected form: <python> -m jarvis_visual_engine',
  )
  process.exit(1)
}

console.log('[verify-vision] Command:', cmd)
console.log('[verify-vision] Checking import with:', pythonExe)

const result = spawnSync(pythonExe, ['-c', 'import jarvis_visual_engine'], {
  encoding: 'utf8',
  /** Avoid cmd.exe eating `;` inside `-c` on Windows */
  shell: false,
  cwd: root,
  env: { ...process.env },
})

if (result.status !== 0) {
  console.error(result.stderr || result.stdout || 'import failed')
  console.error(
    '\n[verify-vision] FAILED — install the package into this Python, or set JARVIS_VISION_ENGINE_COMMAND to a full python.exe path, e.g.:\n' +
      '  JARVIS_VISION_ENGINE_COMMAND=C:\\\\path\\\\to\\\\venv\\\\Scripts\\\\python.exe -m jarvis_visual_engine',
  )
  process.exit(1)
}

console.log(result.stdout.trim())
console.log('[verify-vision] OK — Electron will use the same command if .env is loaded when you run npm run desktop:dev')
