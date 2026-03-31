/**
 * Runs smoketest.mjs with SMOKE_WIRE_ONLY=1 (no OpenAI key required).
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(fileURLToPath(import.meta.url))
const r = spawnSync(process.execPath, [join(root, '..', 'smoketest.mjs')], {
  stdio: 'inherit',
  env: { ...process.env, SMOKE_WIRE_ONLY: '1' },
  cwd: join(root, '..'),
})
process.exit(r.status ?? 1)
