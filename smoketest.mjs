/**
 * End-to-end smoke test against the Vite dev server (or preview) + OpenAI proxy.
 *
 * Prerequisites:
 *   1. `npm run dev` running — URL must match `SMOKE_BASE_URL` (default http://localhost:5173)
 *   2. `OPENAI_API_KEY` in `.env` for: voice-ready (200), /api/llm, /ws/realtime upgrade
 *
 * Usage:
 *   SMOKE_BASE_URL=http://localhost:5173 npm run smoke
 *
 * Wire-only (no API key required — checks dev server + proxy routes exist):
 *   SMOKE_WIRE_ONLY=1 npm run smoke
 */

import { WebSocket } from 'ws'

const base = (process.env.SMOKE_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const wireOnly = process.env.SMOKE_WIRE_ONLY === '1'

async function fetchJson(url, options) {
  const res = await fetch(url, options)
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* ignore */
  }
  return { res, text, json }
}

async function smokeVoiceReady() {
  const url = `${base}/api/realtime/voice-ready`
  console.log(`GET ${url} …`)
  const { res, text, json } = await fetchJson(url)
  if (wireOnly) {
    if (res.status !== 200 && res.status !== 503) {
      console.error('Wire smoke FAILED — GET /api/realtime/voice-ready → HTTP', res.status)
      console.error(text.slice(0, 400))
      process.exit(1)
    }
    if (res.status === 503) {
      console.log(`✓ GET /api/realtime/voice-ready → 503 (no OPENAI_API_KEY — proxy route OK)`)
    } else {
      console.log(`✓ GET /api/realtime/voice-ready → ${res.status} ({ ok: true })`)
    }
    return
  }
  if (res.status === 503) {
    console.error('Smoke FAILED — GET /api/realtime/voice-ready → 503 (missing OPENAI_API_KEY in .env?)')
    console.error(text.slice(0, 400))
    process.exit(1)
  }
  if (!res.ok) {
    console.error('Smoke FAILED — GET /api/realtime/voice-ready → HTTP', res.status)
    console.error(text.slice(0, 800))
    process.exit(1)
  }
  if (!json?.ok) {
    console.error('Smoke FAILED — unexpected JSON (expected { ok: true })')
    console.error(text.slice(0, 400))
    process.exit(1)
  }
  console.log(`✓ GET /api/realtime/voice-ready → ${res.status}`)
}

async function smokeLlm() {
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
    console.error('Smoke FAILED — could not reach dev server.')
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
    console.error('Smoke FAILED — POST /api/llm → HTTP', res.status)
    console.error(text.slice(0, 800))
    process.exit(1)
  }

  const content = typeof json?.choices?.[0]?.message?.content === 'string' ? json.choices[0].message.content : ''
  if (!content.includes('SMOKETEST_OK')) {
    console.error('Smoke FAILED — unexpected body (expected SMOKETEST_OK in assistant text)')
    console.error(text.slice(0, 800))
    process.exit(1)
  }

  console.log(`✓ POST /api/llm → ${String(res.status)}`)
  console.log('✓ Response contains SMOKETEST_OK')
  console.log('Assistant snippet:', content.trim().slice(0, 160))
}

function smokeRealtimeWebSocket() {
  const wsBase = base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')
  const model = 'gpt-4o-mini-realtime-preview'
  const wsUrl = `${wsBase}/ws/realtime?model=${encodeURIComponent(model)}`
  console.log(`WebSocket ${wsUrl} …`)

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, ['realtime'], { handshakeTimeout: 20000 })
    const timer = setTimeout(() => {
      ws.terminate()
      reject(new Error('WebSocket handshake timeout (check Vite proxy + OPENAI_API_KEY)'))
    }, 20000)

    ws.on('open', () => {
      clearTimeout(timer)
      ws.close()
      resolve()
    })
    ws.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  }).then(() => {
    console.log('✓ WebSocket /ws/realtime upgrade succeeded')
  })
}

async function main() {
  console.log(`Smoke base: ${base}\n`)

  let res
  try {
    res = await fetch(base, { method: 'HEAD' })
  } catch {
    res = null
  }
  if (!res) {
    console.error(`Smoke FAILED — cannot reach ${base} (is npm run dev running?)`)
    process.exit(1)
  }

  await smokeVoiceReady()
  if (wireOnly) {
    console.log('\nWire-only smoke passed (set OPENAI_API_KEY and omit SMOKE_WIRE_ONLY for full E2E).')
    return
  }
  await smokeLlm()
  await smokeRealtimeWebSocket()

  console.log('\nAll smoke checks passed.')
}

main().catch((err) => {
  console.error('Smoke FAILED:', err.message || err)
  process.exit(1)
})
