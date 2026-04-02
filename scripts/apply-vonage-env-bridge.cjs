/**
 * One-off: fix .env Vonage block — PEM → VONAGE_PRIVATE_KEY_BASE64, enable bridge + Cloudflare URL.
 * Run: node scripts/apply-vonage-env-bridge.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const envPath = path.join(__dirname, '..', '.env')
let t = fs.readFileSync(envPath, 'utf8')

const pemMatch = t.match(/MIIEvQIBADAN[\s\S]*?-----END PRIVATE KEY-----/)
if (!pemMatch) {
  console.error('Could not find PEM block in .env — abort.')
  process.exit(1)
}
const pem = pemMatch[0]
const b64 = Buffer.from(pem, 'utf8').toString('base64')
const wsSecret = crypto.randomBytes(24).toString('hex')

t = t.replace(
  /# Vonage Voice \(outbound TTS calls\) — create a Voice application in the dashboard and link your number[\s\S]*?(?=# Vonage AI two-way voice)/,
  `# Vonage Voice (outbound TTS + JWT) — application + private key (base64)
VONAGE_APPLICATION_ID=28e96bdf-5e6b-4489-bcee-44eba76a86d8
VONAGE_PRIVATE_KEY_BASE64=${b64}

`,
)

t = t.replace(/^# (VONAGE_API_KEY=)/m, '$1')
t = t.replace(/^# (VONAGE_API_SECRET=)/m, '$1')

t = t.replace(
  /# Vonage AI two-way voice \(WebSocket media bridge[\s\S]*?(?=# Deepgram streaming STT)/,
  `# Vonage AI two-way voice — Cloudflare Tunnel: voice.yorkiebrown.uk → localhost:3339
VONAGE_PUBLIC_WS_URL=wss://voice.yorkiebrown.uk/voice/ws
VONAGE_WS_SECRET=${wsSecret}
VONAGE_AI_VOICE_BRIDGE_ENABLED=1
VONAGE_AI_VOICE_PORT=3339
VONAGE_AI_MAX_TURNS=30
VONAGE_AI_VOICE_POLL_MS=4500
VONAGE_AI_STREAMING_LLM=1

`,
)

t = t.replace(/^# (VONAGE_AI_USER_NAME=)/m, '$1')
t = t.replace(/^# (JARVIS_USER_NAME=)/m, '$1')
if (/^VONAGE_AI_USER_NAME=\s*$/m.test(t)) {
  t = t.replace(/^VONAGE_AI_USER_NAME=\s*$/m, 'VONAGE_AI_USER_NAME=YorkieB')
}
if (/^JARVIS_USER_NAME=\s*$/m.test(t)) {
  t = t.replace(/^JARVIS_USER_NAME=\s*$/m, 'JARVIS_USER_NAME=YorkieB')
}

fs.writeFileSync(envPath, t, 'utf8')
console.log('Updated .env: VONAGE_PRIVATE_KEY_BASE64, API keys enabled, bridge + WS secret + yorkiebrown URLs.')
console.log('VONAGE_WS_SECRET was generated — stored only in .env.')
console.log('Next: cloudflared tunnel login → create tunnel → credentials in config.yml → route DNS → tunnel run.')
