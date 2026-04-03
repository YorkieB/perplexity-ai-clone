/**
 * Starts the Jarvis Replicate FastAPI bridge (default first free port 18865–18919; avoids 8765 used by screen agent).
 * Usage: npm run replicate-bridge — copy REPLICATE_BRIDGE_URL from stdout into .env if needed.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const pyDir = path.join(root, 'python')
const python = process.env.PYTHON?.trim() || 'python'

const child = spawn(python, ['-m', 'jarvis_replicate'], {
  cwd: pyDir,
  stdio: 'inherit',
  env: { ...process.env },
  shell: process.platform === 'win32',
})

child.on('exit', (code) => process.exit(code ?? 0))
child.on('error', (err) => {
  console.error('[replicate-bridge]', err.message)
  process.exit(1)
})
