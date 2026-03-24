/**
 * Electron shell: serves the Vite build from dist/ on localhost and mirrors
 * dev/preview proxies: POST /api/llm (SSE when stream:true), POST /api/tts, /api/a2e/*, etc.
 */
const http = require('node:http')
const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')
const { Readable } = require('node:stream')
const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron')
const jarvisDb = require('./jarvis-db.cjs')

const PROJECT_ROOT = path.join(__dirname, '..')
const DIST_DIR = path.join(PROJECT_ROOT, 'dist')
const PRELOAD_PATH = path.join(__dirname, 'preload.cjs')

/** Shared session for all in-app `<webview>` tags (cookies, login state). */
const BROWSER_PARTITION = 'persist:ai-search-browser'

function setupBrowserSession() {
  const ses = session.fromPartition(BROWSER_PARTITION)
  ses.on('will-download', (_event, item) => {
    if (!item.getSavePath()) {
      const base = app.getPath('downloads')
      const target = path.join(base, item.getFilename())
      try {
        item.setSavePath(target)
      } catch {
        /* ignore */
      }
    }
    item.on('updated', (_e, state) => {
      if (state !== 'completed') return
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('browser-download-complete', {
          filename: item.getFilename(),
          path: item.getSavePath(),
        })
      }
    })
  })

  const envExt = (process.env.ELECTRON_BROWSER_EXTENSION_PATH || '').trim()
  if (envExt && fs.existsSync(envExt)) {
    ses.loadExtension(envExt).catch((err) => {
      console.error('[electron] loadExtension failed:', err)
    })
  }
}

function registerBrowserIpc() {
  ipcMain.handle('shell-open-external', async (_e, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false
    await shell.openExternal(url)
    return true
  })

  ipcMain.handle('browser-load-extension', async (_e, folderPath) => {
    if (typeof folderPath !== 'string' || !folderPath.trim()) {
      return { ok: false, error: 'Invalid path' }
    }
    const resolved = path.resolve(folderPath.trim())
    if (!fs.existsSync(resolved)) {
      return { ok: false, error: 'Path does not exist' }
    }
    try {
      const ext = await session.fromPartition(BROWSER_PARTITION).loadExtension(resolved)
      return { ok: true, name: ext.name, version: ext.version }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('dialog-pick-extension-folder', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return null
    const r = await dialog.showOpenDialog(mainWindow, {
      title: 'Select unpacked extension folder',
      properties: ['openDirectory'],
    })
    if (r.canceled || !r.filePaths[0]) return null
    return r.filePaths[0]
  })
}

function loadEnvFromFile() {
  const envPath = path.join(PROJECT_ROOT, '.env')
  let raw = ''
  try {
    raw = fs.readFileSync(envPath, 'utf8')
  } catch {
    return
  }
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

function getEnv() {
  loadEnvFromFile()
  return process.env
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.map': 'application/json',
  }
  return map[ext] || 'application/octet-stream'
}

function safeJoinDist(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0])
  const rel = decoded === '/' ? 'index.html' : decoded.replace(/^\//, '')
  const candidate = path.normalize(path.join(DIST_DIR, rel))
  if (!candidate.startsWith(DIST_DIR)) return null
  return candidate
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

const DO_INFERENCE = 'https://inference.do-ai.run/v1'
const A2E_BASE = 'https://video.a2e.ai'

function getBearerFromReq(req) {
  const raw = req.headers.authorization?.trim()
  if (!raw) return null
  if (raw.toLowerCase().startsWith('bearer ')) return raw.slice(7).trim()
  return null
}

function getXiApiKeyFromReq(req) {
  const raw = req.headers['xi-api-key'] ?? req.headers['x-elevenlabs-api-key']
  if (!raw) return null
  const s = Array.isArray(raw) ? raw[0] : raw
  return sanitizeToken(String(s).trim())
}

function sanitizeToken(token) {
  let t = String(token).trim()
  if (t.toLowerCase().startsWith('bearer ')) {
    t = t.slice(7).trim()
  }
  return t
}

function normalizeDoModels(raw) {
  const seen = new Set()
  const out = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const id = String(item.id ?? item.name ?? item.uuid ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    const name = String(item.name ?? item.id ?? id).trim() || id
    const description = typeof item.description === 'string' ? item.description : ''
    out.push({ id, name, description })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

async function fetchInferenceModelsList(authHeader) {
  const upstream = await fetch(`${DO_INFERENCE}/models`, {
    headers: {
      Authorization: authHeader,
      Accept: 'application/json',
    },
  })
  const text = await upstream.text()
  if (!upstream.ok) {
    const err = new Error(`DigitalOcean Inference ${upstream.status}: ${text}`)
    err.status = upstream.status
    throw err
  }
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON from DigitalOcean Inference /v1/models')
  }
  return Array.isArray(data.data) ? data.data : []
}

function wantsSseStreamFromBody(bodyStr) {
  try {
    return JSON.parse(bodyStr).stream === true
  } catch {
    return false
  }
}

async function forwardChatCompletion(upstream, res, streamRequested) {
  if (!upstream.ok) {
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.end(text)
    return
  }
  const ct = upstream.headers.get('content-type') || ''
  if (streamRequested && ct.includes('text/event-stream') && upstream.body) {
    res.statusCode = upstream.status
    res.setHeader('Content-Type', 'text/event-stream')
    const cache = upstream.headers.get('cache-control')
    if (cache) res.setHeader('Cache-Control', cache)
    Readable.fromWeb(upstream.body).pipe(res)
    return
  }
  const text = await upstream.text()
  res.statusCode = upstream.status
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
  res.end(text)
}

async function handleElevenLabsTtsProxy(req, res, parsed) {
  const env = getEnv()
  const xiKey =
    getXiApiKeyFromReq(req) ||
    (env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY || '').trim()
  const voiceId =
    String(parsed.voice_id || '').trim() ||
    (env.ELEVENLABS_VOICE_ID || env.VITE_ELEVENLABS_VOICE_ID || '').trim()
  if (!xiKey || !voiceId) {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('X-Tts-Unavailable', 'missing-elevenlabs-config')
    res.end(
      JSON.stringify({
        error: {
          message:
            'ElevenLabs TTS requires an API key and voice ID (Settings → API Keys, or ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID in .env).',
        },
      })
    )
    return
  }
  const text = String(parsed.text || '').trim().slice(0, 5000)
  if (!text) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'Empty text' } }))
    return
  }
  const modelId = String(
    parsed.model_id || env.ELEVENLABS_MODEL_ID || env.VITE_ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2'
  ).trim()
  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': xiKey,
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({ text, model_id: modelId }),
      }
    )
    if (!upstream.ok) {
      const errText = await upstream.text()
      res.statusCode = upstream.status
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
      res.end(errText)
      return
    }
    const ct = upstream.headers.get('content-type') || 'audio/mpeg'
    res.statusCode = upstream.status
    res.setHeader('Content-Type', ct)
    if (upstream.body) {
      Readable.fromWeb(upstream.body).pipe(res)
    } else {
      const buf = await upstream.arrayBuffer()
      res.end(Buffer.from(buf))
    }
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: { message: e instanceof Error ? e.message : 'ElevenLabs TTS proxy error' },
      })
    )
  }
}

async function handleTtsProxy(req, res) {
  const bodyStr = await readBody(req)
  let parsed = null
  try {
    parsed = JSON.parse(bodyStr)
  } catch {
    parsed = null
  }

  if (parsed && parsed.provider === 'elevenlabs') {
    await handleElevenLabsTtsProxy(req, res, parsed)
    return
  }

  const env = getEnv()
  const fromClient = getBearerFromReq(req)
  const key =
    (fromClient ? sanitizeToken(fromClient) : '') ||
    (env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || '').trim()
  if (!key) {
    // 200 + sentinel header so the browser does not log "Failed to load resource" for /api/tts;
    // the client treats this as "no server TTS" and uses speechSynthesis fallback.
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('X-Tts-Unavailable', 'missing-openai-key')
    res.end(
      JSON.stringify({
        error: {
          message:
            'TTS requires an OpenAI API key: add OPENAI_API_KEY to .env or paste your key in Settings → API Keys.',
        },
      })
    )
    return
  }

  const base = (env.OPENAI_BASE_URL || env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(
    /\/$/,
    ''
  )

  try {
    const upstream = await fetch(`${base}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: bodyStr,
    })
    if (!upstream.ok) {
      const text = await upstream.text()
      res.statusCode = upstream.status
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
      res.end(text)
      return
    }
    const ct = upstream.headers.get('content-type') || 'audio/mpeg'
    res.statusCode = upstream.status
    res.setHeader('Content-Type', ct)
    if (upstream.body) {
      Readable.fromWeb(upstream.body).pipe(res)
    } else {
      const buf = await upstream.arrayBuffer()
      res.end(Buffer.from(buf))
    }
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: { message: e instanceof Error ? e.message : 'TTS proxy error' },
      })
    )
  }
}

async function handleDigitalOceanModels(req, res) {
  const env = getEnv()
  const raw =
    getBearerFromReq(req) || (env.DIGITALOCEAN_API_KEY || env.VITE_DIGITALOCEAN_API_KEY || '').trim()
  const token = raw ? sanitizeToken(raw) : ''
  if (!token) {
    res.statusCode = 401
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: {
          message:
            'Missing Gradient inference key: use Settings, or set DIGITALOCEAN_API_KEY in project .env',
        },
      })
    )
    return
  }
  const authHeader = `Bearer ${token}`
  try {
    const raw = await fetchInferenceModelsList(authHeader)
    const models = normalizeDoModels(raw)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ models, meta: { count: models.length } }))
  } catch (e) {
    const code =
      e &&
      typeof e === 'object' &&
      'status' in e &&
      typeof e.status === 'number' &&
      e.status >= 400 &&
      e.status < 600
        ? e.status
        : 502
    res.statusCode = code
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: { message: e instanceof Error ? e.message : 'Failed to list DigitalOcean models' },
      })
    )
  }
}

async function handleA2eProxy(req, res) {
  const env = getEnv()
  const key = (env.A2E_API_KEY || env.VITE_A2E_API_KEY || '').trim()
  if (!key) {
    res.statusCode = 401
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: { message: 'Missing A2E API key: set A2E_API_KEY or VITE_A2E_API_KEY in .env' },
      })
    )
    return
  }

  const rawUrl = req.url || '/'
  const u = new URL(rawUrl, 'http://127.0.0.1')
  const subPath = u.pathname.replace(/^\/api\/a2e/, '') || '/'
  const target = `${A2E_BASE}/api${subPath}${u.search}`

  try {
    const init = {
      method: req.method || 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const body = await readBody(req)
      init.headers['Content-Type'] = 'application/json'
      init.body = body
    }
    const upstream = await fetch(target, init)
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: { message: e instanceof Error ? e.message : 'A2E proxy error' },
      })
    )
  }
}

async function handleLlmProxy(req, res) {
  const provider = (req.headers['x-llm-provider'] || '').toLowerCase().trim()

  if (provider === 'digitalocean') {
    const env = getEnv()
    const raw =
      getBearerFromReq(req) || (env.DIGITALOCEAN_API_KEY || env.VITE_DIGITALOCEAN_API_KEY || '').trim()
    const token = raw ? sanitizeToken(raw) : ''
    if (!token) {
      res.statusCode = 401
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: {
            message:
              'Missing Gradient inference key: use Settings, or set DIGITALOCEAN_API_KEY in project .env',
          },
        })
      )
      return
    }
    try {
      const body = await readBody(req)
      const streamRequested = wantsSseStreamFromBody(body)
      const upstream = await fetch(`${DO_INFERENCE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body,
      })
      await forwardChatCompletion(upstream, res, streamRequested)
    } catch (e) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: { message: e instanceof Error ? e.message : 'Proxy error' },
        })
      )
    }
    return
  }

  const env = getEnv()
  const fromClient = getBearerFromReq(req)
  const key =
    (fromClient ? sanitizeToken(fromClient) : '') ||
    (env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || '').trim()
  if (!key) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: {
          message:
            'Missing OpenAI API key: add OPENAI_API_KEY to .env or paste your key in Settings → API Keys.',
        },
      })
    )
    return
  }

  const base = (env.OPENAI_BASE_URL || env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(
    /\/$/,
    ''
  )

  try {
    const body = await readBody(req)
    const streamRequested = wantsSseStreamFromBody(body)
    const upstream = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body,
    })
    await forwardChatCompletion(upstream, res, streamRequested)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: { message: e instanceof Error ? e.message : 'Proxy error' },
      })
    )
  }
}

/* ── Web search proxy (Tavily + DuckDuckGo fallback) ────────────────── */

function stripHtmlToText(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function searchViaTavily(apiKey, body) {
  const params = {
    api_key: apiKey,
    query: body.query,
    include_images: true,
    include_image_descriptions: true,
    include_answer: 'basic',
    include_raw_content: 'markdown',
    include_favicon: true,
    search_depth: body.isAdvanced ? 'advanced' : 'basic',
    max_results: body.maxResults || (body.isAdvanced ? 12 : 6),
  }
  if (body.isAdvanced) params.chunks_per_source = 3
  if (body.topic) params.topic = body.topic
  if (body.includeDomains && body.includeDomains.length) params.include_domains = body.includeDomains
  if (body.timeRange && body.timeRange !== 'any') params.time_range = body.timeRange

  const upstream = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
  if (!upstream.ok) throw new Error('Tavily ' + upstream.status + ': ' + upstream.statusText)
  const data = await upstream.json()
  return {
    results: data.results || [],
    images: data.images || [],
    answer: data.answer || null,
    query: data.query,
    provider: 'tavily',
  }
}

async function searchViaDuckDuckGo(query, maxResults) {
  maxResults = maxResults || 6
  const encoded = encodeURIComponent(query)
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 10000)
  const response = await fetch('https://html.duckduckgo.com/html/?q=' + encoded, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': 'https://html.duckduckgo.com/',
    },
    body: 'q=' + encoded,
    signal: ac.signal,
  })
  clearTimeout(timer)
  const html = await response.text()
  const results = []
  const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi

  const links = []
  let m
  while ((m = linkRegex.exec(html)) !== null && links.length < maxResults) {
    let href = m[1]
    if (href.includes('uddg=')) {
      try {
        const parsed = new URL(href, 'https://duckduckgo.com')
        href = decodeURIComponent(parsed.searchParams.get('uddg') || href)
      } catch {}
    }
    const title = m[2].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
    if (href && title) links.push({ url: href, title })
  }

  const snippets = []
  while ((m = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
    snippets.push(m[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim())
  }

  for (let i = 0; i < links.length; i++) {
    let domain = ''
    try { domain = new URL(links[i].url).hostname.replace('www.', '') } catch {}
    results.push({
      url: links[i].url,
      title: links[i].title,
      content: snippets[i] || '',
      score: Math.max(0.5, 1 - i * 0.05),
      favicon: 'https://www.google.com/s2/favicons?domain=' + domain + '&sz=32',
    })
  }

  return { results, images: [], answer: null, query, provider: 'duckduckgo' }
}

async function handleSearchProxy(req, res) {
  try {
    const bodyStr = await readBody(req)
    const body = JSON.parse(bodyStr)
    const env = getEnv()
    const tavilyKey = (env.TAVILY_API_KEY || env.VITE_TAVILY_API_KEY || '').trim()

    let result
    if (tavilyKey) {
      result = await searchViaTavily(tavilyKey, body)
    } else {
      result = await searchViaDuckDuckGo(body.query, body.maxResults || 6)
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(result))
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Search proxy error' } }))
  }
}

async function handleSearchExtractProxy(req, res) {
  try {
    const bodyStr = await readBody(req)
    const body = JSON.parse(bodyStr)
    const env = getEnv()
    const tavilyKey = (env.TAVILY_API_KEY || env.VITE_TAVILY_API_KEY || '').trim()

    if (tavilyKey) {
      const upstream = await fetch('https://api.tavily.com/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + tavilyKey,
        },
        body: JSON.stringify({ urls: body.urls }),
      })
      if (!upstream.ok) {
        res.statusCode = upstream.status
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: 'Extract failed: ' + upstream.status } }))
        return
      }
      const data = await upstream.json()
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(data))
    } else {
      const results = await Promise.all(
        (body.urls || []).slice(0, 5).map(async (url) => {
          try {
            const ac = new AbortController()
            const t = setTimeout(() => ac.abort(), 10000)
            const page = await fetch(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; JarvisBot/1.0)',
                'Accept': 'text/html,application/xhtml+xml,*/*',
              },
              signal: ac.signal,
            })
            clearTimeout(t)
            const html = await page.text()
            return { url, raw_content: stripHtmlToText(html).slice(0, 8000) }
          } catch {
            return { url, raw_content: '' }
          }
        })
      )
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ results }))
    }
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Extract proxy error' } }))
  }
}

/** Same-origin proxy for RadioTime OPML (TuneIn station search) — mirrors Vite `/tunein-opml`. */
async function handleTuneInOpmlProxy(req, res) {
  const raw = req.url || '/'
  try {
    const u = new URL(raw, 'http://127.0.0.1')
    const rest = u.pathname.replace(/^\/tunein-opml/, '') || '/'
    const targetUrl = `https://opml.radiotime.com${rest}${u.search}`
    const upstream = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TuneInRail/1.0)',
        Accept: 'application/json, */*',
      },
    })
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.statusCode = upstream.status
    const ct = upstream.headers.get('content-type') || 'application/json; charset=utf-8'
    res.setHeader('Content-Type', ct)
    res.setHeader('Access-Control-Allow-Origin', '*')
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    res.end(buf)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Proxy error' }))
  }
}


async function handleElevenLabsStreamingTts(req, res) {
  const env = getEnv()
  const elKey =
    (env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY || '').trim()
  if (!elKey) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'Missing ELEVENLABS_API_KEY in .env' } }))
    return
  }

  try {
    const bodyStr = await readBody(req)
    const body = JSON.parse(bodyStr)
    const text = String(body.text || '').trim()
    if (!text) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: 'Empty text' } }))
      return
    }
    const voiceId =
      String(body.voice_id || '').trim() ||
      (env.ELEVENLABS_VOICE_ID || env.VITE_ELEVENLABS_VOICE_ID || '').trim() ||
      'pNInz6obpgDQGcFmaJgB'

    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=pcm_24000&optimize_streaming_latency=3`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elKey,
        },
        body: JSON.stringify({
          text,
          model_id: body.model_id || 'eleven_turbo_v2_5',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true },
        }),
      }
    )

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => upstream.statusText)
      res.statusCode = upstream.status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: errText } }))
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'audio/pcm')
    if (upstream.body) {
      Readable.fromWeb(upstream.body).pipe(res)
    } else {
      res.end()
    }
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'ElevenLabs TTS error' } }))
  }
}

async function handleRealtimeSession(req, res) {
  const env = getEnv()
  const key = (env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || '').trim()
  if (!key) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY in .env' } }))
    return
  }

  try {
    const bodyStr = await readBody(req)
    const upstream = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: bodyStr,
    })
    res.statusCode = upstream.status
    res.setHeader('Content-Type', 'application/json')
    const text = await upstream.text()
    res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Realtime session error' } }))
  }
}


// ── Jarvis Memory API Handlers ──────────────────────────────────────────────

async function handleJarvisMemoryGet(req, res) {
  try {
    const facts = jarvisDb.loadLongTermMemory()
    const recentTurns = jarvisDb.loadShortTermMemory()
    const summaries = jarvisDb.loadConversationSummaries(5)
    const conversationId = jarvisDb.createConversation()
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ conversationId, facts, recentTurns, summaries }))
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Memory load error' } }))
  }
}

async function handleJarvisMemoryPost(req, res) {
  try {
    const bodyStr = await readBody(req)
    const body = JSON.parse(bodyStr)
    const { conversationId, messages } = body
    // Handle direct fact saving: { facts: [...] }
    if (Array.isArray(body.facts) && body.facts.length > 0) {
      jarvisDb.addFacts(body.facts)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, saved: body.facts.length }))
      return
    }

    if (!conversationId || !Array.isArray(messages)) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: 'conversationId and messages[] required' } }))
      return
    }
    jarvisDb.saveMessages(conversationId, messages)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Memory save error' } }))
  }
}

async function handleJarvisMemoryExtract(req, res) {
  const env = getEnv()
  const key = (env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || '').trim()
  if (!key) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY' } }))
    return
  }
  try {
    const bodyStr = await readBody(req)
    const body = JSON.parse(bodyStr)
    const { userText, aiText } = body
    if (!userText) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: 'userText required' } }))
      return
    }
    const base = (env.OPENAI_BASE_URL || env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
    const prompt = 'You are a fact-extraction engine. Given a user-assistant exchange, extract personal facts about the user (preferences, name, occupation, habits, interests, relationships, etc.). Return ONLY a JSON array of objects with "category" and "fact" fields. If no facts, return [].\n\nUser said: "' + userText + '"\nAssistant said: "' + (aiText || '') + '"\n\nReturn JSON array only, no markdown, no explanation.'
    const upstream = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    })
    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '')
      res.statusCode = upstream.status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: errText } }))
      return
    }
    const result = await upstream.json()
    const content = result.choices?.[0]?.message?.content || '[]'
    let facts = []
    try { const parsed = JSON.parse(content); facts = Array.isArray(parsed) ? parsed : (parsed.facts || []) } catch {}
    if (facts.length > 0) jarvisDb.addFacts(facts)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ extracted: facts.length, facts }))
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Extraction error' } }))
  }
}

async function handleJarvisMemorySummarize(req, res) {
  const env = getEnv()
  const key = (env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || '').trim()
  if (!key) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY' } }))
    return
  }
  try {
    const bodyStr = await readBody(req)
    const body = JSON.parse(bodyStr)
    const { conversationId } = body
    if (!conversationId) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: 'conversationId required' } }))
      return
    }
    const msgs = jarvisDb.getConversationMessages(conversationId)
    if (msgs.length === 0) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, summary: null }))
      return
    }
    const transcript = msgs.map(m => m.role + ': ' + m.content).join('\n')
    const base = (env.OPENAI_BASE_URL || env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
    const prompt = 'Summarize this voice conversation in 2-3 sentences. Also extract 1-5 topic keywords. Return JSON with "summary" (string) and "topics" (comma-separated string).\n\nConversation:\n' + transcript + '\n\nReturn JSON only, no markdown.'
    const upstream = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    })
    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '')
      res.statusCode = upstream.status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: errText } }))
      return
    }
    const result = await upstream.json()
    const content = result.choices?.[0]?.message?.content || '{}'
    let parsed = {}
    try { parsed = JSON.parse(content) } catch {}
    if (parsed.summary) jarvisDb.saveConversationSummary(conversationId, parsed.summary, parsed.topics || '')
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true, summary: parsed.summary || null, topics: parsed.topics || '' }))
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Summarize error' } }))
  }
}



/** Proxy /api/vision/* requests to the Jarvis Visual Engine at localhost:5000 */
async function handleVisionProxy(req, res) {
  try {
    const urlPath = req.url?.split('?')[0] || '/'
    const targetPath = urlPath.replace(/^\/api\/vision/, '/api/v1')
    const targetUrl = 'http://localhost:5000' + targetPath

    const headers = { ...req.headers, 'X-API-Key': process.env.VISION_API_KEY || 'jarvis-vision-local' }
    delete headers.host

    let body = null
    if (req.method === 'POST' || req.method === 'PUT') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      body = Buffer.concat(chunks)
    }

    const fetchOpts = { method: req.method, headers }
    if (body) fetchOpts.body = body

    const upstream = await fetch(targetUrl, fetchOpts)
    res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' })
    const data = await upstream.arrayBuffer()
    res.end(Buffer.from(data))
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Vision proxy error' }))
  }
}


async function handleReliabilityProxy(req, res) {
  try {
    const urlPath = req.url?.split('?')[0] || '/';
    const targetUrl = 'http://localhost:3000' + urlPath;
    const headers = { 'Content-Type': req.headers['content-type'] || 'application/json' };
    let body = null;
    if (req.method === 'POST' || req.method === 'PUT') {
      body = await readBody(req);
    }
    const fetchOpts = { method: req.method || 'GET', headers };
    if (body) fetchOpts.body = body;
    const upstream = await fetch(targetUrl, fetchOpts);
    res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' });
    const data = await upstream.text();
    res.end(data);
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Reliability proxy error' }));
  }
}

function createServer() {
  return http.createServer((req, res) => {
    const urlPath = req.url?.split('?')[0] || '/'

    if (urlPath === '/api/digitalocean/models' && req.method === 'GET') {
      void handleDigitalOceanModels(req, res)
      return
    }

    if (urlPath === '/api/llm' && req.method === 'POST') {
      void handleLlmProxy(req, res)
      return
    }

    if (urlPath === '/api/tts' && req.method === 'POST') {
      void handleTtsProxy(req, res)
      return
    }

    
    if (urlPath === '/api/elevenlabs-tts' && req.method === 'POST') {
      void handleElevenLabsStreamingTts(req, res)
      return
    }

    if (urlPath === '/api/realtime/session' && req.method === 'POST') {
      void handleRealtimeSession(req, res)
      return
    }

    if (urlPath === '/api/jarvis-memory' && req.method === 'GET') {
      void handleJarvisMemoryGet(req, res)
      return
    }

    if (urlPath === '/api/jarvis-memory' && req.method === 'POST') {
      void handleJarvisMemoryPost(req, res)
      return
    }

    if (urlPath === '/api/jarvis-memory/extract' && req.method === 'POST') {
      void handleJarvisMemoryExtract(req, res)
      return
    }

    if (urlPath === '/api/jarvis-memory/summarize' && req.method === 'POST') {
      void handleJarvisMemorySummarize(req, res)
      return
    }

    if (urlPath === '/api/search' && req.method === 'POST') {
      void handleSearchProxy(req, res)
      return
    }

    if (urlPath === '/api/search/extract' && req.method === 'POST') {
      void handleSearchExtractProxy(req, res)
      return
    }

    if (urlPath.startsWith('/api/vision/')) {
      void handleVisionProxy(req, res)
      return
    }

    if (urlPath.startsWith('/api/reliability/')) {
      void handleReliabilityProxy(req, res)
      return
    }

    if (urlPath.startsWith('/api/a2e/')) {
      void handleA2eProxy(req, res)
      return
    }

    if (urlPath.startsWith('/tunein-opml') && (req.method === 'GET' || req.method === 'HEAD')) {
      void handleTuneInOpmlProxy(req, res)
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405
      res.end()
      return
    }

    const filePath = safeJoinDist(urlPath)
    if (!filePath) {
      res.statusCode = 403
      res.end()
      return
    }

    fs.stat(filePath, (err, st) => {
      if (!err && st.isFile()) {
        res.statusCode = 200
        res.setHeader('Content-Type', contentType(filePath))
        if (req.method === 'HEAD') {
          res.end()
          return
        }
        fs.createReadStream(filePath).pipe(res)
        return
      }

      const indexPath = path.join(DIST_DIR, 'index.html')
      fs.access(indexPath, fs.constants.F_OK, (errIndex) => {
        if (errIndex) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        if (req.method === 'HEAD') {
          res.end()
          return
        }
        fs.createReadStream(indexPath).pipe(res)
      })
    })
  })
}

let mainWindow = null
let server = null

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const s = createServer()
    
    // WebSocket proxy for /ws/realtime → OpenAI Realtime API
    s.on('upgrade', (req, clientSocket, head) => {
      const urlPath = req.url || ''
      if (!urlPath.startsWith('/ws/realtime')) {
        clientSocket.destroy()
        return
      }

      const env = getEnv()
      const openaiKey = (env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || '').trim()
      if (!openaiKey) {
        clientSocket.destroy()
        return
      }

      const upstreamPath = urlPath.replace(/^\/ws\/realtime/, '/v1/realtime')
      const upstreamReq = https.request({
        hostname: 'api.openai.com',
        port: 443,
        path: upstreamPath,
        method: 'GET',
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': req.headers['sec-websocket-version'] || '13',
          'Sec-WebSocket-Key': req.headers['sec-websocket-key'] || '',
          'Sec-WebSocket-Extensions': req.headers['sec-websocket-extensions'] || '',
          ...(req.headers['sec-websocket-protocol'] ? { 'Sec-WebSocket-Protocol': req.headers['sec-websocket-protocol'] } : {}),
          Host: 'api.openai.com',
          Authorization: `Bearer ${openaiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      })

      upstreamReq.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
        let responseHead = 'HTTP/1.1 101 Switching Protocols\r\n'
        const h = upstreamRes.headers
        const clientRequestedProtocol = !!req.headers['sec-websocket-protocol']
        for (const key of Object.keys(h)) {
          if (key.toLowerCase() === 'sec-websocket-protocol' && !clientRequestedProtocol) continue
          const val = h[key]
          if (Array.isArray(val)) {
            val.forEach(v => { responseHead += `${key}: ${v}\r\n` })
          } else if (val != null) {
            responseHead += `${key}: ${val}\r\n`
          }
        }
        responseHead += '\r\n'

        clientSocket.write(responseHead)
        if (upstreamHead.length > 0) clientSocket.write(upstreamHead)
        if (head.length > 0) upstreamSocket.write(head)

        upstreamSocket.pipe(clientSocket)
        clientSocket.pipe(upstreamSocket)

        clientSocket.on('error', () => upstreamSocket.destroy())
        upstreamSocket.on('error', () => clientSocket.destroy())
        clientSocket.on('close', () => upstreamSocket.destroy())
        upstreamSocket.on('close', () => clientSocket.destroy())
      })

      upstreamReq.on('error', (err) => {
        console.error('[ws-proxy] upstream error:', err.message)
        clientSocket.destroy()
      })

      upstreamReq.end()
    })

    s.listen(0, '127.0.0.1', () => {
      const addr = s.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      resolve({ server: s, port })
    })
    s.on('error', reject)
  })
}

async function createWindow() {
  const devUrl = process.env.ELECTRON_START_URL
  if (devUrl) {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 840,
      minWidth: 800,
      minHeight: 600,
      title: 'AI Search Engine',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        webviewTag: true,
        preload: PRELOAD_PATH,
      },
    })
    await mainWindow.loadURL(devUrl)
    if (process.env.ELECTRON_OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    }
    return
  }

  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Build required',
      message: 'No production build found.',
      detail: `Run "npm run build" first. Expected: ${DIST_DIR}`,
    })
    app.quit()
    return
  }

  const { server: s, port } = await startLocalServer()
  server = s

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 800,
    minHeight: 600,
    title: 'AI Search Engine',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      preload: PRELOAD_PATH,
    },
  })

  const url = `http://127.0.0.1:${port}/`
  await mainWindow.loadURL(url)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  // Grant microphone + speaker permissions for voice pipeline (STT + TTS)
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'mediaKeySystem']
    callback(allowed.includes(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'audioCapture', 'mediaKeySystem']
    return allowed.includes(permission)
  })

  setupBrowserSession()
  registerBrowserIpc()
  void createWindow()
})

app.on('window-all-closed', () => {
  if (server) {
    server.close()
    server = null
  }
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})
