/**
 * Smoke test: Vite dev server + OpenAI proxy (`POST /api/llm`).
 *
 * Prerequisites:
 *   1. `npm run dev` running — use the exact URL Vite prints (e.g. http://localhost:5173/ or :5174)
 *   2. `OPENAI_API_KEY` in `.env` or `.env.local` (loaded by Vite / openai-proxy)
 *
 * Optional: `SMOKE_BASE_URL` to match Vite's "Local:" line if the port differs (default below).
 * On Windows, `localhost` is preferred over `127.0.0.1` when the dev server binds oddly.
 */

const base = (process.env.SMOKE_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')

const payload = {
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: 'You are a test harness. Follow instructions exactly.' },
    { role: 'user', content: 'Reply with exactly one line: SMOKETEST_OK' },
  ],
  max_tokens: 32,
  temperature: 0,
}

const url = `${base}/api/llm`
console.log(`POST ${url} …`)

let res
try {
  res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
} catch (err) {
  const code =
    err && typeof err === 'object' && 'cause' in err && err.cause && typeof err.cause === 'object' && 'code' in err.cause
      ? err.cause.code
      : ''
  console.error('Smoke test FAILED — could not reach dev server.')
  console.error('Start it in another terminal: npm run dev')
  if (code === 'ECONNREFUSED') {
    console.error(`(connection refused — nothing listening on ${base})`)
    if (base.includes('127.0.0.1')) {
      console.error('Tip: try SMOKE_BASE_URL=http://localhost:5173 (or the port Vite printed).')
    }
  } else {
    console.error(err)
  }
  process.exit(1)
}

const text = await res.text()
let json
try {
  json = JSON.parse(text)
} catch {
  json = null
}

if (!res.ok) {
  console.error('Smoke test FAILED — HTTP', res.status)
  console.error(text.slice(0, 800))
  process.exit(1)
}

const content = typeof json?.choices?.[0]?.message?.content === 'string' ? json.choices[0].message.content : ''
if (!content.includes('SMOKETEST_OK')) {
  console.error('Smoke test FAILED — unexpected body (expected SMOKETEST_OK in assistant text)')
  console.error(text.slice(0, 800))
  process.exit(1)
}

console.log(`✓ POST /api/llm → ${String(res.status)}`)
console.log('✓ Response contains SMOKETEST_OK')
console.log('Smoke test passed.')
console.log('Assistant snippet:', content.trim().slice(0, 160))
