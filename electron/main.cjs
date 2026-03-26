/**
 * Electron shell: serves the Vite build from dist/ on localhost and mirrors
 * dev/preview proxies: POST /api/llm (SSE when stream:true), POST /api/tts, /api/a2e/*, etc.
 */
const http = require('node:http')
const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')
const { execFile, exec } = require('node:child_process')
const { promisify } = require('node:util')
const { Readable } = require('node:stream')
const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)
const { app, BrowserWindow, dialog, ipcMain, session, shell } = require('electron')
const jarvisDb = require('./jarvis-db.cjs')
const ragDb = require('./rag-db.cjs')
const spacesClient = require('./spaces-client.cjs')

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
    ses.loadExtension(envExt).catch((err) => { // NOSONAR
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
      const ext = await session.fromPartition(BROWSER_PARTITION).loadExtension(resolved) // NOSONAR
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

function getJarvisMainWindow() {
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed()) return focused
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow
  return null
}

function registerJarvisIdeIpc() {
  ipcMain.handle('jarvis-ide-app-root', () => PROJECT_ROOT)

  ipcMain.handle('jarvis-ide-open-files', async () => {
    const w = getJarvisMainWindow()
    if (!w) return []
    const r = await dialog.showOpenDialog(w, {
      properties: ['openFile', 'multiSelections'],
    })
    if (r.canceled || !r.filePaths[0]) return []
    const out = []
    for (const p of r.filePaths) {
      try {
        const content = fs.readFileSync(p, 'utf8')
        out.push({ path: p, name: path.basename(p), content })
      } catch (e) {
        out.push({ path: p, name: path.basename(p), error: e instanceof Error ? e.message : String(e) })
      }
    }
    return out
  })

  ipcMain.handle('jarvis-ide-open-folder', async () => {
    const w = getJarvisMainWindow()
    if (!w) return null
    const r = await dialog.showOpenDialog(w, {
      properties: ['openDirectory'],
    })
    if (r.canceled || !r.filePaths[0]) return null
    return r.filePaths[0]
  })

  ipcMain.handle('jarvis-ide-save-file', async (_e, opts) => {
    const w = getJarvisMainWindow()
    if (!w || !opts || typeof opts !== 'object') return null
    const { defaultPath, content } = opts
    const r = await dialog.showSaveDialog(w, {
      defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined,
    })
    if (r.canceled || !r.filePath) return null
    fs.writeFileSync(r.filePath, content == null ? '' : String(content), 'utf8')
    return r.filePath
  })

  ipcMain.handle('jarvis-ide-read-dir', async (_e, dirPath) => {
    if (typeof dirPath !== 'string' || !dirPath) return []
    const resolved = path.resolve(dirPath)
    if (!fs.existsSync(resolved)) return []
    const entries = fs.readdirSync(resolved, { withFileTypes: true })
    return entries.map((e) => ({ name: e.name, isDir: e.isDirectory() }))
  })

  ipcMain.handle('jarvis-ide-walk-files', async (_e, rootPath) => {
    if (typeof rootPath !== 'string') return []
    const root = path.resolve(rootPath)
    if (!fs.existsSync(root)) return []
    const out = []
    const max = 500
    const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next'])
    function walk(dir) {
      if (out.length >= max) return
      let ents
      try {
        ents = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const e of ents) {
        if (out.length >= max) return
        if (e.name.startsWith('.') && e.name !== '.env') continue
        if (skip.has(e.name)) continue
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else out.push(path.relative(root, p).replaceAll('\\', '/'))
      }
    }
    walk(root)
    return out.sort((a, b) => a.localeCompare(b))
  })

  ipcMain.handle('jarvis-ide-fs-read', async (_e, filePath) => {
    if (typeof filePath !== 'string') return { ok: false, error: 'Invalid path' }
    const p = path.resolve(filePath)
    try {
      const content = fs.readFileSync(p, 'utf8')
      return { ok: true, content }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('jarvis-ide-fs-write', async (_e, opts) => {
    const { filePath, content } = opts || {}
    if (typeof filePath !== 'string') return { ok: false, error: 'Invalid path' }
    try {
      const dir = path.dirname(path.resolve(filePath))
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.resolve(filePath), content == null ? '' : String(content), 'utf8')
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('jarvis-ide-fs-delete', async (_e, filePath) => {
    if (typeof filePath !== 'string') return { ok: false, error: 'Invalid path' }
    try {
      fs.unlinkSync(path.resolve(filePath))
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('jarvis-ide-fs-mkdir', async (_e, dirPath) => {
    if (typeof dirPath !== 'string') return { ok: false, error: 'Invalid path' }
    try {
      fs.mkdirSync(path.resolve(dirPath), { recursive: true })
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('jarvis-ide-fs-exists', async (_e, p) => {
    if (typeof p !== 'string') return false
    return fs.existsSync(path.resolve(p))
  })

  ipcMain.handle('jarvis-ide-shell-open-path', async (_e, p) => {
    if (typeof p !== 'string') return 'Invalid path'
    return shell.openPath(p)
  })

  ipcMain.handle('jarvis-ide-open-external', async (_e, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false
    await shell.openExternal(url)
    return true
  })

  ipcMain.handle('jarvis-ide-new-window', async () => {
    await createWindow()
  })

  ipcMain.handle('jarvis-ide-quit', () => {
    app.quit()
  })

  ipcMain.handle('jarvis-ide-toggle-fullscreen', () => {
    const w = getJarvisMainWindow()
    if (!w) return false
    w.setFullScreen(!w.isFullScreen())
    return w.isFullScreen()
  })

  ipcMain.handle('jarvis-ide-git', async (_e, opts) => {
    const { cwd, args } = opts || {}
    if (typeof cwd !== 'string' || !Array.isArray(args)) {
      return { ok: false, stdout: '', stderr: '', error: 'invalid' }
    }
    try {
      const r = await execFileAsync('git', args, {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
        encoding: 'utf8',
      })
      return { ok: true, stdout: r.stdout || '', stderr: r.stderr || '' }
    } catch (e) {
      const err = e
      return {
        ok: false,
        stdout: err && typeof err === 'object' && 'stdout' in err ? String(err.stdout) : '',
        stderr: err && typeof err === 'object' && 'stderr' in err ? String(err.stderr) : '',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  ipcMain.handle('jarvis-ide-run-command', async (_e, opts) => {
    const validation = validateRunCommandArgs(opts)
    if (validation) return validation
    const resolved = path.resolve(opts.cwd)
    const cmd = String(opts.command).trim()
    try {
      const r = await execAsync(cmd, {
        cwd: resolved,
        maxBuffer: 10 * 1024 * 1024,
        timeout: 300000,
        env: { ...process.env },
      })
      return { ok: true, stdout: r.stdout || '', stderr: r.stderr || '', exitCode: 0 }
    } catch (e) {
      const err = e
      const stdout = err && typeof err === 'object' && 'stdout' in err ? String(err.stdout) : ''
      const stderr = err && typeof err === 'object' && 'stderr' in err ? String(err.stderr) : ''
      const code =
        err && typeof err === 'object' && 'code' in err && typeof err.code === 'number'
          ? err.code
          : 1
      return {
        ok: false,
        stdout,
        stderr,
        exitCode: code,
        error: err && typeof err === 'object' && err.killed ? 'timeout' : undefined,
      }
    }
  })
}

function validateRunCommandArgs(opts) {
  const { cwd, command } = opts || {}
  const fail = (error) => ({ ok: false, stdout: '', stderr: '', exitCode: null, error })
  if (typeof cwd !== 'string' || typeof command !== 'string' || !String(command).trim()) {
    return fail('invalid args')
  }
  const resolved = path.resolve(cwd)
  if (!fs.existsSync(resolved)) {
    return fail('cwd does not exist')
  }
  try {
    const st = fs.statSync(resolved)
    if (!st.isDirectory()) {
      return fail('cwd is not a directory')
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e))
  }
  return null
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

  if (parsed?.provider === 'elevenlabs') {
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

/* ── Wake word proxy (Whisper transcription) ────────────────────────── */

async function handleWakeWordProxy(req, res) {
  const env = getEnv()
  const key = (env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || '').trim()
  if (!key) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY for wake word.' } }))
    return
  }

  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const rawBody = Buffer.concat(chunks)
    const contentType = req.headers['content-type'] || ''

    const base = (env.OPENAI_BASE_URL || env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
    const upstream = await fetch(`${base}/audio/transcriptions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': contentType,
      },
      body: rawBody,
    })
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Wake word proxy error' } }))
  }
}

/* ── Web search proxy (Tavily + DuckDuckGo fallback) ────────────────── */

function stripHtmlToText(html) {
  return html
    .replaceAll(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replaceAll(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replaceAll(/<[^>]+>/g, ' ')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll(/\s+/g, ' ')
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
  if (body.includeDomains?.length) params.include_domains = body.includeDomains
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

async function searchViaDuckDuckGo(query, maxResults = 6) {
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
    const title = m[2].replaceAll(/<[^>]*>/g, '').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").trim()
    if (href && title) links.push({ url: href, title })
  }

  const snippets = []
  while ((m = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
    snippets.push(m[1].replaceAll(/<[^>]*>/g, '').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").trim())
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
          voice_settings: body.voice_settings || { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
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


// ── Media Generation Handlers (Images + Videos) ────────────────────────────

function getOpenAiKeyAndBase() {
  const env = getEnv()
  const key = (env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || '').trim()
  const base = (env.OPENAI_BASE_URL || env.VITE_OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
  return { key, base }
}

async function handleImageGenerate(req, res) {
  const { key, base } = getOpenAiKeyAndBase()
  if (!key) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY.' } })); return }
  try {
    const body = await readBody(req)
    const upstream = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body,
    })
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Image generation error' } }))
  }
}

async function handleImageEdit(req, res) {
  const { key, base } = getOpenAiKeyAndBase()
  if (!key) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY.' } })); return }
  try {
    const rawBody = await readBodyRaw(req)
    const contentType = req.headers['content-type'] || ''
    const upstream = await fetch(`${base}/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': contentType },
      body: rawBody,
    })
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Image edit error' } }))
  }
}

async function handleVideoCreate(req, res) {
  const { key, base } = getOpenAiKeyAndBase()
  if (!key) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY.' } })); return }
  try {
    const body = await readBody(req)
    const upstream = await fetch(`${base}/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body,
    })
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Video creation error' } }))
  }
}

async function handleVideoStatus(req, res) {
  const { key, base } = getOpenAiKeyAndBase()
  if (!key) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY.' } })); return }
  const url = new URL(req.url || '', 'http://localhost')
  const videoId = url.searchParams.get('id')
  if (!videoId) { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing id parameter.' } })); return }
  try {
    const upstream = await fetch(`${base}/videos/${encodeURIComponent(videoId)}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Video status error' } }))
  }
}

async function handleVideoContent(req, res) {
  const { key, base } = getOpenAiKeyAndBase()
  if (!key) { res.statusCode = 500; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing OPENAI_API_KEY.' } })); return }
  const url = new URL(req.url || '', 'http://localhost')
  const videoId = url.searchParams.get('id')
  if (!videoId) { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing id parameter.' } })); return }
  try {
    const upstream = await fetch(`${base}/videos/${encodeURIComponent(videoId)}/content`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    res.statusCode = upstream.status
    const ct = upstream.headers.get('content-type')
    if (ct) res.setHeader('Content-Type', ct)
    const cl = upstream.headers.get('content-length')
    if (cl) res.setHeader('Content-Length', cl)
    if (upstream.body) {
      const nodeStream = Readable.fromWeb(upstream.body)
      nodeStream.pipe(res)
    } else {
      const buf = Buffer.from(await upstream.arrayBuffer())
      res.end(buf)
    }
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Video content error' } }))
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



// ── Self-learning API handlers ──────────────────────────────────────────────

async function handleLearnedContextGet(_req, res) {
  try {
    const context = jarvisDb.buildLearnedContext()
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ context }))
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Error loading learned context' } }))
  }
}

function savePreferences(arr) {
  for (const p of arr) {
    if (p.domain && p.key && p.value) jarvisDb.savePreference(p.domain, p.key, p.value)
  }
}

function saveCorrections(arr) {
  for (const c of arr) {
    if (c.category && c.mistake && c.correction) jarvisDb.saveCorrection(c.category, c.mistake, c.correction, c.context)
  }
}

function savePatterns(arr) {
  for (const p of arr) {
    if (p.pattern_type && p.description) jarvisDb.savePattern(p.pattern_type, p.description, p.metadata)
  }
}

function saveKnowledge(arr) {
  for (const k of arr) {
    if (k.topic && k.content) jarvisDb.saveKnowledge(k.topic, k.content, k.source)
  }
}

async function handleLearnPost(req, res) {
  try {
    const bodyStr = await readBody(req)
    const body = JSON.parse(bodyStr)
    const { preferences, corrections, patterns, knowledge } = body

    if (preferences) savePreferences(preferences)
    if (corrections) saveCorrections(corrections)
    if (patterns) savePatterns(patterns)
    if (knowledge) saveKnowledge(knowledge)

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Learn error' } }))
  }
}

async function handleTrackToolPost(req, res) {
  try {
    const bodyStr = await readBody(req)
    const body = JSON.parse(bodyStr)
    jarvisDb.saveToolOutcome(
      body.tool_name,
      body.query_type || null,
      body.success !== false,
      body.execution_time_ms || null,
      body.error_message || null,
    )
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Track tool error' } }))
  }
}

async function handleLearningStatsGet(_req, res) {
  try {
    const stats = jarvisDb.getLearningStats()
    const preferences = jarvisDb.loadPreferences(0.2)
    const corrections = jarvisDb.loadCorrections(15)
    const patterns = jarvisDb.loadPatterns()
    const knowledge = jarvisDb.loadAllKnowledge(20)
    const tool_stats = jarvisDb.getToolStats()

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ stats, preferences, corrections, patterns, knowledge, tool_stats }))
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Stats error' } }))
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

// ── RAG API Handlers ──────────────────────────────────────────────────────────

function readBodyRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

/**
 * Minimal multipart/form-data parser for RAG ingest.
 * Extracts named fields and file parts from the raw body.
 */
function parseMultipart(raw, contentType) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/)
  if (!boundaryMatch) return { fields: {}, files: [] }
  const boundary = boundaryMatch[1] || boundaryMatch[2]
  const sep = Buffer.from('--' + boundary)

  const parts = []
  let start = 0
  while (true) {
    const idx = raw.indexOf(sep, start)
    if (idx === -1) break
    if (start > 0) {
      const partBuf = raw.slice(start, idx)
      parts.push(partBuf)
    }
    start = idx + sep.length
    // skip CRLF after boundary
    if (raw[start] === 0x0d && raw[start + 1] === 0x0a) start += 2
    // check for closing --
    if (raw[start] === 0x2d && raw[start + 1] === 0x2d) break
  }

  const fields = {}
  const files = []
  for (const part of parts) {
    parseMultipartPart(part, fields, files)
  }
  return { fields, files }
}

function parseMultipartPart(part, fields, files) {
  const headerEnd = part.indexOf('\r\n\r\n')
  if (headerEnd === -1) return
  const headerStr = part.slice(0, headerEnd).toString('utf8')
  const body = part.slice(headerEnd + 4, -2)

  const nameMatch = headerStr.match(/name="([^"]+)"/)
  const filenameMatch = headerStr.match(/filename="([^"]*)"/)
  const ctMatch = headerStr.match(/Content-Type:\s*(.+)/i)

  if (filenameMatch) {
    files.push({
      fieldName: nameMatch ? nameMatch[1] : 'file',
      filename: filenameMatch[1],
      contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
      buffer: body,
    })
  } else if (nameMatch) {
    fields[nameMatch[1]] = body.toString('utf8')
  }
}

async function extractTextFromBuffer(buffer, mimeType, filename) {
  let mt = (mimeType || '').toLowerCase()

  // Fallback: detect type from file extension when MIME is generic
  if (!mt || mt === 'application/octet-stream') {
    const ext = (filename || '').split('.').pop()?.toLowerCase()
    const extMap = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon',
      pdf: 'application/pdf', json: 'application/json',
      txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', html: 'text/html',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
    if (ext && extMap[ext]) mt = extMap[ext]
  }

  console.log(`[rag] extractTextFromBuffer: mime=${mt} filename=${filename} size=${buffer.length}`)

  if (mt.includes('text/') || mt.includes('application/json') || mt.includes('text/markdown') || mt.includes('text/csv')) {
    return buffer.toString('utf8')
  }

  if (mt.includes('application/pdf')) {
    return buffer.toString('utf8').replaceAll(/[^\x20-\x7E\n\r\t]/g, ' ').replaceAll(/\s+/g, ' ').trim()
  }

  if (mt.startsWith('image/')) {
    console.log('[rag] Sending image to Vision API for analysis...')
    const description = await describeImageWithVision(buffer, mt)
    console.log(`[rag] Vision result: ${description.slice(0, 120)}...`)
    return description
  }

  if (mt.includes('application/vnd.openxmlformats') || mt.includes('application/msword') || mt.includes('application/vnd.ms-')) {
    const raw = buffer.toString('utf8').replaceAll(/[^\x20-\x7E\n\r\t]/g, ' ').replaceAll(/\s+/g, ' ').trim()
    if (raw.length > 50) return raw
  }

  const fallback = buffer.toString('utf8').replaceAll(/[^\x20-\x7E\n\r\t]/g, ' ').replaceAll(/\s+/g, ' ').trim()
  return fallback
}

async function describeImageWithVision(buffer, mimeType) {
  const env = getEnv()
  const key = (env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || '').trim()
  if (!key) return '[Image — no OpenAI key for vision analysis]'

  const base64 = buffer.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image in detail. Extract ALL visible text, labels, numbers, and data. If it contains a document, transcribe the full content. Be thorough.' },
              { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            ],
          },
        ],
      }),
    })
    if (!resp.ok) {
      console.error('[rag] vision API error:', resp.status, await resp.text())
      return `[Image: ${mimeType}]`
    }
    const data = await resp.json()
    return data.choices?.[0]?.message?.content || `[Image: ${mimeType}]`
  } catch (e) {
    console.error('[rag] vision error:', e.message)
    return `[Image: ${mimeType}]`
  }
}

async function processIngestFile(file, fields, results, errors) {
  try {
    const title = fields.title || file.filename || 'Untitled'

    let spacesKey = null
    if (spacesClient.isConfigured()) {
      const ext = path.extname(file.filename || '') || ''
      spacesKey = `rag-docs/${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
      await spacesClient.uploadFile(spacesKey, file.buffer, file.contentType)
    }

    const text = await extractTextFromBuffer(file.buffer, file.contentType, file.filename)
    if (!text.trim()) {
      errors.push({ filename: file.filename, error: 'Could not extract text from file' })
      return
    }

    const result = await ragDb.ingestText(text, {
      title,
      filename: file.filename,
      spacesKey,
      mimeType: file.contentType,
      source: 'upload',
      sizeBytes: file.buffer.length,
    })
    results.push({ filename: file.filename, ...result })
  } catch (fileErr) {
    console.error(`[rag] ingest error for ${file.filename}:`, fileErr)
    errors.push({ filename: file.filename, error: fileErr instanceof Error ? fileErr.message : 'Ingest error' })
  }
}

async function handleRagIngest(req, res) {
  if (!ragDb.isConfigured()) {
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'RAG database not configured — set DATABASE_URL in .env' } }))
    return
  }
  try {
    const raw = await readBodyRaw(req)
    const ct = req.headers['content-type'] || ''
    const { fields, files } = parseMultipart(raw, ct)
    if (files.length === 0) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: 'No file uploaded' } }))
      return
    }

    const results = []
    const errors = []

    for (const file of files) {
      await processIngestFile(file, fields, results, errors)
    }

    if (results.length === 0 && errors.length > 0) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: errors.map(e => `${e.filename}: ${e.error}`).join('; ') } }))
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ results, errors }))
  } catch (e) {
    console.error('[rag] ingest error:', e)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Ingest error' } }))
  }
}

async function handleRagIngestText(req, res) {
  if (!ragDb.isConfigured()) {
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'RAG database not configured — set DATABASE_URL in .env' } }))
    return
  }
  try {
    const bodyStr = await readBody(req)
    const body = JSON.parse(bodyStr)
    const { text, title } = body
    if (!text?.trim()) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: 'text is required' } }))
      return
    }
    const result = await ragDb.ingestText(text, {
      title: title || 'Untitled',
      source: body.source || 'manual',
      mimeType: 'text/plain',
      sizeBytes: Buffer.byteLength(text, 'utf8'),
      metadata: body.metadata || {},
    })
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(result))
  } catch (e) {
    console.error('[rag] ingest-text error:', e)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Ingest text error' } }))
  }
}

async function handleRagSearch(req, res) {
  if (!ragDb.isConfigured()) {
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'RAG database not configured' } }))
    return
  }
  try {
    const bodyStr = await readBody(req)
    const body = JSON.parse(bodyStr)
    const query = (body.query || '').trim()
    if (!query) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: 'query is required' } }))
      return
    }
    const embedding = await ragDb.embedSingle(query)
    const results = await ragDb.searchSimilar(embedding, body.limit || 5, body.threshold || 0.3)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ results }))
  } catch (e) {
    console.error('[rag] search error:', e)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Search error' } }))
  }
}

async function handleRagCreateDocument(req, res) {
  if (!ragDb.isConfigured()) {
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'RAG database not configured' } }))
    return
  }
  try {
    const bodyStr = await readBody(req)
    const body = JSON.parse(bodyStr)
    const { title, content, format } = body
    if (!title || !content) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: 'title and content are required' } }))
      return
    }

    const fmt = (format || 'md').toLowerCase()
    let fileBuffer, mimeType, ext
    switch (fmt) {
      case 'docx': {
        const { Document, Packer, Paragraph, TextRun } = require('docx')
        const lines = content.split('\n')
        const doc = new Document({
          sections: [{
            children: lines.map(line => new Paragraph({ children: [new TextRun(line)] })),
          }],
        })
        fileBuffer = await Packer.toBuffer(doc)
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ext = '.docx'
        break
      }
      case 'pdf': {
        const { jsPDF } = require('jspdf')
        const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
        const pageW = pdf.internal.pageSize.getWidth()
        const margin = 15
        const maxW = pageW - margin * 2
        const lines = pdf.splitTextToSize(content, maxW)
        let y = margin
        const lineH = 6
        for (const line of lines) {
          if (y + lineH > pdf.internal.pageSize.getHeight() - margin) {
            pdf.addPage()
            y = margin
          }
          pdf.text(line, margin, y)
          y += lineH
        }
        fileBuffer = Buffer.from(pdf.output('arraybuffer'))
        mimeType = 'application/pdf'
        ext = '.pdf'
        break
      }
      default: {
        fileBuffer = Buffer.from(content, 'utf-8')
        mimeType = 'text/markdown'
        ext = '.md'
      }
    }

    // Upload to Spaces
    let spacesKey = null
    if (spacesClient.isConfigured()) {
      const safeTitle = title.replaceAll(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
      spacesKey = `jarvis-docs/${Date.now()}-${safeTitle}${ext}`
      await spacesClient.uploadFile(spacesKey, fileBuffer, mimeType)
    }

    // Index in pgvector
    const result = await ragDb.ingestText(content, {
      title,
      filename: `${title}${ext}`,
      spacesKey,
      mimeType,
      source: 'jarvis_created',
      sizeBytes: fileBuffer.length,
      metadata: { format: fmt },
    })

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ...result, format: fmt, spacesKey }))
  } catch (e) {
    console.error('[rag] create-document error:', e)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Create document error' } }))
  }
}

async function handleRagDocumentsList(req, res) {
  if (!ragDb.isConfigured()) {
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'RAG database not configured' } }))
    return
  }
  try {
    const u = new URL(req.url || '/', 'http://127.0.0.1')
    const limit = Number.parseInt(u.searchParams.get('limit') || '50', 10)
    const offset = Number.parseInt(u.searchParams.get('offset') || '0', 10)
    const docs = await ragDb.listDocuments(limit, offset)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ documents: docs }))
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'List error' } }))
  }
}

async function handleRagDocumentGet(req, res, docId) {
  if (!ragDb.isConfigured()) {
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'RAG database not configured' } }))
    return
  }
  try {
    const doc = await ragDb.getDocument(docId)
    if (!doc) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: 'Document not found' } }))
      return
    }
    const chunks = await ragDb.getDocumentChunks(docId)
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ document: doc, chunks }))
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Get error' } }))
  }
}

async function handleRagDocumentDownload(req, res, docId) {
  try {
    const doc = await ragDb.getDocument(docId)
    if (!doc?.spaces_key) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: 'Document not found or no file stored' } }))
      return
    }
    if (!spacesClient.isConfigured()) {
      res.statusCode = 503
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: 'Spaces not configured' } }))
      return
    }
    const { buffer, contentType } = await spacesClient.downloadFile(doc.spaces_key)
    res.statusCode = 200
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${doc.filename || 'document'}"`)
    res.end(buffer)
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Download error' } }))
  }
}

async function handleRagDocumentDelete(req, res, docId) {
  if (!ragDb.isConfigured()) {
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'RAG database not configured' } }))
    return
  }
  try {
    const doc = await ragDb.deleteDocument(docId)
    if (!doc) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: 'Document not found' } }))
      return
    }
    // Also delete from Spaces
    if (doc.spaces_key && spacesClient.isConfigured()) {
      try { await spacesClient.deleteFile(doc.spaces_key) } catch { /* best-effort */ }
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true, deleted: doc.id }))
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Delete error' } }))
  }
}

async function handleElevenLabsMyVoices(_req, res) {
  const env = getEnv()
  const elKey = (env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY || '').trim()
  if (!elKey) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'Missing ELEVENLABS_API_KEY in .env' } }))
    return
  }
  try {
    const upstream = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': elKey },
    })
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'ElevenLabs voices error' } }))
  }
}

async function handleElevenLabsSharedVoices(req, res) {
  const env = getEnv()
  const elKey = (env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY || '').trim()
  if (!elKey) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'Missing ELEVENLABS_API_KEY in .env' } }))
    return
  }
  try {
    const query = (req.url || '').split('?')[1] || ''
    const upstream = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${query}`, {
      headers: { 'xi-api-key': elKey },
    })
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'ElevenLabs shared voices error' } }))
  }
}

async function handleElevenLabsSoundEffect(req, res) {
  const env = getEnv()
  const elKey = (env.ELEVENLABS_API_KEY || env.VITE_ELEVENLABS_API_KEY || '').trim()
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
    const upstream = await fetch(
      'https://api.elevenlabs.io/v1/sound-generation?output_format=pcm_24000',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'xi-api-key': elKey },
        body: JSON.stringify({
          text,
          duration_seconds: body.duration_seconds || null,
          prompt_influence: body.prompt_influence ?? 0.5,
          model_id: 'eleven_text_to_sound_v2',
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
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Sound effect generation error' } }))
  }
}

const VOICE_ANALYSIS_URL = 'http://localhost:5199/analyze'

async function handleVoiceAnalysis(req, res) {
  try {
    const body = await readBodyRaw(req)
    const upstream = await fetch(VOICE_ANALYSIS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body,
    })
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', 'application/json')
    res.end(text)
  } catch {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Voice analysis service unavailable', vocalState: 'Unable to analyse voice' }))
  }
}

// ── Suno API proxy ──
async function handleSunoGenerate(req, res) {
  const env = getEnv()
  const key = (env.SUNO_API_KEY || env.VITE_SUNO_API_KEY || '').trim()
  if (!key) { res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing SUNO_API_KEY' } })); return }
  try {
    const raw = await readBody(req)
    const parsed = JSON.parse(raw)
    if (!parsed.callBackUrl) parsed.callBackUrl = 'https://localhost/suno-callback'
    const upstream = await fetch('https://api.sunoapi.org/api/v1/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(parsed),
    })
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', 'application/json')
    res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Suno proxy error' } }))
  }
}

async function handleSunoStatus(req, res) {
  const env = getEnv()
  const key = (env.SUNO_API_KEY || env.VITE_SUNO_API_KEY || '').trim()
  if (!key) { res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing SUNO_API_KEY' } })); return }
  const taskId = new URL(req.url || '', 'http://localhost').searchParams.get('taskId')
  if (!taskId) { res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing taskId' } })); return }
  try {
    const upstream = await fetch(`https://api.sunoapi.org/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${key}` },
    })
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', 'application/json')
    res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Suno status error' } }))
  }
}

// ── Hugging Face API proxy ──
async function handleHfSearch(req, res) {
  const params = new URL(req.url || '', 'http://localhost').searchParams
  const q = params.get('q') || ''
  const type = params.get('type') || 'datasets'
  const limit = params.get('limit') || '10'
  try {
    const upstream = await fetch(`https://huggingface.co/api/${encodeURIComponent(type)}?search=${encodeURIComponent(q)}&limit=${limit}&sort=downloads&direction=-1`, {
      headers: { Accept: 'application/json' },
    })
    const data = await upstream.json()
    const results = (Array.isArray(data) ? data : []).map(d => ({
      id: d.id || d.modelId || '',
      description: d.description || d.pipeline_tag || '',
      downloads: d.downloads || 0,
      pipeline_tag: d.pipeline_tag || '',
    }))
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ results }))
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'HF search error' } }))
  }
}

async function handleHfDatasetSample(req, res) {
  const params = new URL(req.url || '', 'http://localhost').searchParams
  const dataset = params.get('dataset') || ''
  const split = params.get('split') || 'train'
  const config = params.get('config') || 'default'
  try {
    const upstream = await fetch(`https://datasets-server.huggingface.co/first-rows?dataset=${encodeURIComponent(dataset)}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(split)}`, {
      headers: { Accept: 'application/json' },
    })
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', 'application/json')
    res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'HF dataset error' } }))
  }
}

// ── GitHub API proxy ──
async function handleGitHubSearch(req, res) {
  const env = getEnv()
  const ghToken = (env.GITHUB_TOKEN || env.VITE_GITHUB_TOKEN || '').trim()
  const params = new URL(req.url || '', 'http://localhost').searchParams
  const q = params.get('q') || ''
  const type = params.get('type') || 'repositories'
  const limit = params.get('limit') || '10'
  const headers = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Jarvis-AI' }
  if (ghToken) headers.Authorization = `Bearer ${ghToken}`
  try {
    const upstream = await fetch(`https://api.github.com/search/${encodeURIComponent(type)}?q=${encodeURIComponent(q)}&per_page=${limit}`, { headers })
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', 'application/json')
    res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'GitHub search error' } }))
  }
}

async function handleGitHubFile(req, res) {
  const env = getEnv()
  const ghToken = (env.GITHUB_TOKEN || env.VITE_GITHUB_TOKEN || '').trim()
  const params = new URL(req.url || '', 'http://localhost').searchParams
  const owner = params.get('owner') || ''
  const repo = params.get('repo') || ''
  const path = params.get('path') || ''
  const headers = { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Jarvis-AI' }
  if (ghToken) headers.Authorization = `Bearer ${ghToken}`
  try {
    const upstream = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`, { headers })
    const text = await upstream.text()
    res.statusCode = upstream.status
    res.setHeader('Content-Type', 'application/json')
    res.end(text)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'GitHub file error' } }))
  }
}

// ── Plaid API proxy ──
function plaidRequest(endpoint, body, env) {
  const clientId = (env.PLAID_CLIENT_ID || '').trim()
  const secret = (env.PLAID_SECRET || '').trim()
  const plaidEnv = (env.PLAID_ENV || 'sandbox').trim()
  const plaidBaseUrls = { production: 'https://production.plaid.com', development: 'https://development.plaid.com' }
  const base = plaidBaseUrls[plaidEnv] || 'https://sandbox.plaid.com'
  return fetch(`${base}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
  })
}

async function handlePlaidLinkToken(req, res) {
  const env = getEnv()
  if (!(env.PLAID_CLIENT_ID || '').trim() || !(env.PLAID_SECRET || '').trim()) {
    res.statusCode = 401; res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'Missing PLAID_CLIENT_ID or PLAID_SECRET' } })); return
  }
  try {
    const upstream = await plaidRequest('/link/token/create', {
      user: { client_user_id: 'jarvis-user-1' },
      client_name: 'Jarvis AI',
      products: ['transactions'],
      country_codes: ['GB', 'US'],
      language: 'en',
    }, env)
    const text = await upstream.text()
    res.statusCode = upstream.status; res.setHeader('Content-Type', 'application/json'); res.end(text)
  } catch (e) {
    res.statusCode = 502; res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Plaid link token error' } }))
  }
}

async function handlePlaidExchange(req, res) {
  const env = getEnv()
  if (!(env.PLAID_CLIENT_ID || '').trim()) { res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'Missing PLAID_CLIENT_ID' } })); return }
  try {
    const body = JSON.parse(await readBody(req))
    const upstream = await plaidRequest('/item/public_token/exchange', { public_token: body.public_token }, env)
    const text = await upstream.text()
    res.statusCode = upstream.status; res.setHeader('Content-Type', 'application/json'); res.end(text)
  } catch (e) {
    res.statusCode = 502; res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Plaid exchange error' } }))
  }
}

async function handlePlaidAccounts(req, res) {
  const env = getEnv()
  const accessToken = (env.PLAID_ACCESS_TOKEN || '').trim()
  if (!accessToken) { res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'No bank account linked. Connect via Settings.' } })); return }
  try {
    const upstream = await plaidRequest('/accounts/get', { access_token: accessToken }, env)
    const text = await upstream.text()
    res.statusCode = upstream.status; res.setHeader('Content-Type', 'application/json'); res.end(text)
  } catch (e) {
    res.statusCode = 502; res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Plaid accounts error' } }))
  }
}

async function handlePlaidBalances(req, res) {
  const env = getEnv()
  const accessToken = (env.PLAID_ACCESS_TOKEN || '').trim()
  if (!accessToken) { res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'No bank account linked.' } })); return }
  try {
    const upstream = await plaidRequest('/accounts/balance/get', { access_token: accessToken }, env)
    const text = await upstream.text()
    res.statusCode = upstream.status; res.setHeader('Content-Type', 'application/json'); res.end(text)
  } catch (e) {
    res.statusCode = 502; res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Plaid balances error' } }))
  }
}

async function handlePlaidTransactions(req, res) {
  const env = getEnv()
  const accessToken = (env.PLAID_ACCESS_TOKEN || '').trim()
  if (!accessToken) { res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ error: { message: 'No bank account linked.' } })); return }
  try {
    const body = JSON.parse(await readBody(req) || '{}')
    const now = new Date()
    const endDate = body.end_date || now.toISOString().slice(0, 10)
    const startDate = body.start_date || new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10)
    const upstream = await plaidRequest('/transactions/get', {
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { count: 100, offset: 0 },
    }, env)
    const text = await upstream.text()
    res.statusCode = upstream.status; res.setHeader('Content-Type', 'application/json'); res.end(text)
  } catch (e) {
    res.statusCode = 502; res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Plaid transactions error' } }))
  }
}

// ── Story library proxy ──

async function searchGutenberg(q, limit) {
  const results = []
  const gutRes = await fetchRetry(`https://gutendex.com/books?search=${encodeURIComponent(q)}`, { timeoutMs: 10000 }).catch(() => null)
  if (gutRes?.ok) {
    const gutData = await gutRes.json()
    for (const b of (gutData.results || []).slice(0, limit)) {
      results.push({
        id: String(b.id),
        title: b.title,
        authors: (b.authors || []).map(a => a.name),
        source: 'gutenberg',
        subjects: (b.subjects || []).slice(0, 5),
      })
    }
  }
  return results
}

function hfRowToResult(row) {
  const text = row.row?.text || ''
  return {
    id: `hf-tinystories-${row.row_idx}`,
    title: text.split(/[.\n]/)[0]?.slice(0, 80) || 'Short Story',
    authors: [],
    source: 'huggingface',
    snippet: text.slice(0, 200),
  }
}

async function searchTinyStories(q, limit) {
  const results = []
  let hfOk = false
  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), 8000)
    const hfRes = await fetch(`https://datasets-server.huggingface.co/search?dataset=roneneldan/TinyStories&config=default&split=train&query=${encodeURIComponent(q)}&offset=0&length=${Math.min(limit, 20)}`, {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    })
    clearTimeout(timeout)
    if (hfRes.ok) {
      const hfData = await hfRes.json()
      for (const row of (hfData.rows || []).slice(0, limit)) {
        results.push(hfRowToResult(row))
      }
      hfOk = true
    }
  } catch { /* search endpoint flaky — fall through to rows fallback */ }

  if (!hfOk) {
    try {
      const offset = Math.floor(Math.random() * 2000000)
      const fallbackRes = await fetch(`https://datasets-server.huggingface.co/rows?dataset=roneneldan/TinyStories&config=default&split=train&offset=${offset}&length=${Math.min(limit, 10)}`)
      if (fallbackRes.ok) {
        const fbData = await fallbackRes.json()
        for (const row of (fbData.rows || []).slice(0, limit)) {
          results.push(hfRowToResult(row))
        }
      }
    } catch { /* ignore fallback errors */ }
  }
  return results
}

async function handleStorySearch(req, res) {
  const params = new URL(req.url || '', 'http://localhost').searchParams
  const q = params.get('q') || ''
  const source = params.get('source') || 'all'
  const limit = Number.parseInt(params.get('limit') || '10', 10)
  const results = []

  try {
    if (source === 'all' || source === 'gutenberg') {
      results.push(...await searchGutenberg(q, limit))
    }

    if (source === 'all' || source === 'short') {
      results.push(...await searchTinyStories(q, limit))
    }

    res.statusCode = 200; res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ results }))
  } catch (e) {
    res.statusCode = 502; res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Story search error' } }))
  }
}

// ── Retry helper for transient upstream errors ──
const RETRYABLE_CODES = new Set([502, 503, 504])
async function fetchRetry(url, opts = {}, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController()
    const ms = opts.timeoutMs || 15000
    const timer = setTimeout(() => ctrl.abort(), ms)
    try {
      const res = await fetch(url, { ...opts, signal: ctrl.signal })
      clearTimeout(timer)
      if (res.ok || !RETRYABLE_CODES.has(res.status) || attempt === retries) return res
    } catch (e) {
      clearTimeout(timer)
      if (attempt === retries) throw e
    }
    await new Promise(r => setTimeout(r, 1000 * 2 ** attempt))
  }
  return fetch(url, opts) // unreachable fallback
}

// ── Book cache for paginated reading ──
const bookCache = new Map() // key: "source:id" → { title, authors, fullText, fetchedAt }
const BOOK_CACHE_TTL = 30 * 60 * 1000 // 30 minutes
const BOOK_PAGE_SIZE = 4000 // ~4000 chars per page (roughly 1-2 book pages)

function stripGutenbergBoilerplate(text) {
  let content = text
  // Strip everything before the "*** START OF" marker
  const startMatch = content.match(/\*{3}\s*START OF (?:THE |THIS )?PROJECT GUTENBERG EBOOK[^*]*\*{3}/i)
  if (startMatch) {
    content = content.slice(startMatch.index + startMatch[0].length)
  }
  // Strip everything after the "*** END OF" marker
  const endMatch = content.match(/\*{3}\s*END OF (?:THE |THIS )?PROJECT GUTENBERG EBOOK/i)
  if (endMatch) {
    content = content.slice(0, endMatch.index)
  }
  // Also strip common front matter that appears after the START marker
  // (Produced by, Transcriber's note, etc.)
  content = content.replace(/^\s*(Produced by|Transcribed by|E-text prepared by)[^\n]*\n*/i, '')
  return content.trim()
}

function getCachedBook(source, id) {
  const key = `${source}:${id}`
  const entry = bookCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.fetchedAt > BOOK_CACHE_TTL) { bookCache.delete(key); return null }
  return entry
}

function cacheBook(source, id, title, authors, fullText) {
  const key = `${source}:${id}`
  // Cap cache at 20 books to prevent memory bloat
  if (bookCache.size >= 20) {
    const oldest = [...bookCache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0]
    if (oldest) bookCache.delete(oldest[0])
  }
  bookCache.set(key, { title, authors, fullText, fetchedAt: Date.now() })
}

function paginateText(fullText, page, pageSize) {
  const totalPages = Math.ceil(fullText.length / pageSize)
  const clampedPage = Math.max(1, Math.min(page, totalPages))
  const start = (clampedPage - 1) * pageSize
  const end = Math.min(start + pageSize, fullText.length)
  return {
    content: fullText.slice(start, end),
    page: clampedPage,
    totalPages,
    totalChars: fullText.length,
    hasMore: clampedPage < totalPages,
  }
}

async function fetchGutenbergContent(id, page) {
  let cached = getCachedBook('gutenberg', id)
  if (!cached) {
    const metaRes = await fetchRetry(`https://gutendex.com/books/${id}`, { timeoutMs: 10000 })
    if (!metaRes.ok) return { error: 'Book not found', status: 404 }
    const meta = await metaRes.json()
    const textUrl = meta.formats?.['text/plain; charset=utf-8'] || meta.formats?.['text/plain'] || meta.formats?.['text/plain; charset=us-ascii'] || ''
    if (!textUrl) return { error: 'No plain text available for this book', status: 404 }
    const textRes = await fetchRetry(textUrl, { timeoutMs: 20000 })
    const rawText = await textRes.text()
    const fullText = stripGutenbergBoilerplate(rawText)
    cacheBook('gutenberg', id, meta.title, (meta.authors || []).map(a => a.name), fullText)
    cached = getCachedBook('gutenberg', id)
  }
  const paginated = paginateText(cached.fullText, page, BOOK_PAGE_SIZE)
  return {
    title: cached.title,
    authors: cached.authors,
    content: paginated.content,
    page: paginated.page,
    totalPages: paginated.totalPages,
    totalChars: paginated.totalChars,
    hasMore: paginated.hasMore,
    truncated: paginated.hasMore,
  }
}

async function fetchTinyStoryContent(id) {
  const rowIdx = id.replace('hf-tinystories-', '')
  const hfCtrl = new AbortController()
  const hfTimeout = setTimeout(() => hfCtrl.abort(), 10000)
  const hfRes = await fetch(`https://datasets-server.huggingface.co/rows?dataset=roneneldan/TinyStories&config=default&split=train&offset=${rowIdx}&length=1`, { signal: hfCtrl.signal })
  clearTimeout(hfTimeout)
  if (!hfRes.ok) return { error: 'Story not found', status: 404 }
  const hfData = await hfRes.json()
  const text = hfData.rows?.[0]?.row?.text || ''
  return { title: text.split(/[.\n]/)[0]?.slice(0, 80) || 'Short Story', authors: [], content: text, page: 1, totalPages: 1, totalChars: text.length, hasMore: false, truncated: false }
}

async function handleStoryContent(req, res) {
  const params = new URL(req.url || '', 'http://localhost').searchParams
  const id = params.get('id') || ''
  const source = params.get('source') || 'gutenberg'
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10))

  try {
    const result = source === 'gutenberg'
      ? await fetchGutenbergContent(id, page)
      : await fetchTinyStoryContent(id)

    if (result.error) {
      res.statusCode = result.status || 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: { message: result.error } }))
      return
    }
    res.statusCode = 200; res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(result))
  } catch (e) {
    console.error('[Stories] Content fetch error:', e instanceof Error ? e.message : e)
    res.statusCode = 502; res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Story content error' } }))
  }
}

async function handleStoryRandom(req, res) {
  const params = new URL(req.url || '', 'http://localhost').searchParams
  const genre = params.get('genre') || ''
  try {
    const topic = genre || ['adventure', 'fairy tale', 'mystery', 'fantasy', 'fable', 'science fiction', 'romance', 'horror'][Math.floor(Math.random() * 8)]

    // Try Gutenberg first
    try {
      const gutRes = await fetchRetry(`https://gutendex.com/books?topic=${encodeURIComponent(topic)}&page=${Math.floor(Math.random() * 3) + 1}`, { timeoutMs: 10000 })
      if (gutRes.ok) {
        const gutData = await gutRes.json()
        const books = gutData.results || []
        if (books.length > 0) {
          const book = books[Math.floor(Math.random() * books.length)]
          const textUrl = book.formats?.['text/plain; charset=utf-8'] || book.formats?.['text/plain'] || ''
          let content = `(Full text not available in plain text format for this book. Try searching for "${book.title}" to find a readable version.)`
          let hasMore = false
          let totalPages = 1
          if (textUrl) {
            const textRes = await fetchRetry(textUrl, { timeoutMs: 15000 })
            const rawText = await textRes.text()
            const fullText = stripGutenbergBoilerplate(rawText)
            cacheBook('gutenberg', String(book.id), book.title, (book.authors || []).map(a => a.name), fullText)
            const paginated = paginateText(fullText, 1, BOOK_PAGE_SIZE)
            content = paginated.content
            hasMore = paginated.hasMore
            totalPages = paginated.totalPages
          }
          res.statusCode = 200; res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ title: book.title, authors: (book.authors || []).map(a => a.name), content, source: 'gutenberg', bookId: String(book.id), page: 1, totalPages, hasMore }))
          return
        }
      }
    } catch { /* Gutenberg timed out or failed — fall through to HF */ }

    // Fallback: random short story from HuggingFace TinyStories
    const offset = Math.floor(Math.random() * 2000000)
    const hfRes = await fetch(`https://datasets-server.huggingface.co/rows?dataset=roneneldan/TinyStories&config=default&split=train&offset=${offset}&length=1`)
    if (hfRes.ok) {
      const hfData = await hfRes.json()
      const text = hfData.rows?.[0]?.row?.text || ''
      if (text) {
        res.statusCode = 200; res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ title: text.split(/[.\n]/)[0]?.slice(0, 80) || 'Short Story', authors: [], content: text, source: 'huggingface' }))
        return
      }
    }

    res.statusCode = 404; res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'No random story found. Try a different genre.' } }))
  } catch (e) {
    res.statusCode = 502; res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'Random story error' } }))
  }
}

// ── X (Twitter) API proxy ──
async function handleXTweet(req, res) {
  const env = getEnv()
  const apiKey = (env.X_API_KEY || '').trim()
  const apiSecret = (env.X_API_SECRET || '').trim()
  const accessToken = (env.X_ACCESS_TOKEN || '').trim()
  const accessTokenSecret = (env.X_ACCESS_TOKEN_SECRET || '').trim()
  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    res.statusCode = 401; res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: 'Missing X API credentials (X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET)' } }))
    return
  }
  try {
    const body = JSON.parse(await readBody(req))
    const OAuth = require('oauth-1.0a')
    const CryptoJS = require('crypto-js')
    const oauth = OAuth({
      consumer: { key: apiKey, secret: apiSecret },
      signature_method: 'HMAC-SHA1',
      hash_function(baseString, key) { return CryptoJS.HmacSHA1(baseString, key).toString(CryptoJS.enc.Base64) },
    })
    const token = { key: accessToken, secret: accessTokenSecret }
    const url = 'https://api.twitter.com/2/tweets'
    const oauthHeader = oauth.toHeader(oauth.authorize({ url, method: 'POST' }, token))
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { ...oauthHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await upstream.text()
    res.statusCode = upstream.status; res.setHeader('Content-Type', 'application/json'); res.end(text)
  } catch (e) {
    res.statusCode = 502; res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: { message: e instanceof Error ? e.message : 'X API error' } }))
  }
}

const exactRoutes = [
  { method: 'POST', path: '/api/x/tweet', handler: handleXTweet },
  { method: 'POST', path: '/api/plaid/link-token', handler: handlePlaidLinkToken },
  { method: 'POST', path: '/api/plaid/exchange', handler: handlePlaidExchange },
  { method: 'POST', path: '/api/plaid/accounts', handler: handlePlaidAccounts },
  { method: 'POST', path: '/api/plaid/balances', handler: handlePlaidBalances },
  { method: 'POST', path: '/api/plaid/transactions', handler: handlePlaidTransactions },
  { method: 'GET', path: '/api/stories/search', handler: handleStorySearch },
  { method: 'GET', path: '/api/stories/content', handler: handleStoryContent },
  { method: 'GET', path: '/api/stories/random', handler: handleStoryRandom },
  { method: 'POST', path: '/api/suno/generate', handler: handleSunoGenerate },
  { method: 'GET', path: '/api/suno/status', handler: handleSunoStatus },
  { method: 'GET', path: '/api/huggingface/search', handler: handleHfSearch },
  { method: 'GET', path: '/api/huggingface/dataset-sample', handler: handleHfDatasetSample },
  { method: 'GET', path: '/api/github/search', handler: handleGitHubSearch },
  { method: 'GET', path: '/api/github/file', handler: handleGitHubFile },
  { method: 'GET', path: '/api/digitalocean/models', handler: handleDigitalOceanModels },
  { method: 'POST', path: '/api/llm', handler: handleLlmProxy },
  { method: 'POST', path: '/api/tts', handler: handleTtsProxy },
  { method: 'POST', path: '/api/elevenlabs-tts', handler: handleElevenLabsStreamingTts },
  { method: 'POST', path: '/api/realtime/session', handler: handleRealtimeSession },
  { method: 'GET', path: '/api/jarvis-memory', handler: handleJarvisMemoryGet },
  { method: 'POST', path: '/api/jarvis-memory', handler: handleJarvisMemoryPost },
  { method: 'POST', path: '/api/jarvis-memory/extract', handler: handleJarvisMemoryExtract },
  { method: 'POST', path: '/api/jarvis-memory/summarize', handler: handleJarvisMemorySummarize },
  { method: 'GET', path: '/api/jarvis-memory/learned-context', handler: handleLearnedContextGet },
  { method: 'POST', path: '/api/jarvis-memory/learn', handler: handleLearnPost },
  { method: 'POST', path: '/api/jarvis-memory/track-tool', handler: handleTrackToolPost },
  { method: 'GET', path: '/api/jarvis-memory/learning-stats', handler: handleLearningStatsGet },
  { method: 'POST', path: '/api/wake-word', handler: handleWakeWordProxy },
  { method: 'GET', path: '/api/elevenlabs/my-voices', handler: handleElevenLabsMyVoices },
  { method: 'GET', path: '/api/elevenlabs/voices', handler: handleElevenLabsSharedVoices },
  { method: 'POST', path: '/api/elevenlabs/sound-effect', handler: handleElevenLabsSoundEffect },
  { method: 'POST', path: '/api/voice-analysis', handler: handleVoiceAnalysis },
  { method: 'POST', path: '/api/rag/ingest', handler: handleRagIngest },
  { method: 'POST', path: '/api/rag/ingest-text', handler: handleRagIngestText },
  { method: 'POST', path: '/api/rag/search', handler: handleRagSearch },
  { method: 'POST', path: '/api/rag/create-document', handler: handleRagCreateDocument },
  { method: 'GET', path: '/api/rag/documents', handler: handleRagDocumentsList },
  { method: 'POST', path: '/api/search', handler: handleSearchProxy },
  { method: 'POST', path: '/api/search/extract', handler: handleSearchExtractProxy },
  { method: 'POST', path: '/api/images/generate', handler: handleImageGenerate },
  { method: 'POST', path: '/api/images/edit', handler: handleImageEdit },
  { method: 'POST', path: '/api/videos/create', handler: handleVideoCreate },
  { method: 'GET', path: '/api/videos/status', handler: handleVideoStatus },
  { method: 'GET', path: '/api/videos/content', handler: handleVideoContent },
]

const patternRoutes = [
  { method: 'GET', pattern: /^\/api\/rag\/documents\/[^/]+\/download$/, handler: (req, res, urlPath) => { handleRagDocumentDownload(req, res, urlPath.split('/')[4]) } },
  { method: 'GET', pattern: /^\/api\/rag\/documents\/[^/]+$/, handler: (req, res, urlPath) => { handleRagDocumentGet(req, res, urlPath.split('/')[4]) } },
  { method: 'DELETE', pattern: /^\/api\/rag\/documents\/[^/]+$/, handler: (req, res, urlPath) => { handleRagDocumentDelete(req, res, urlPath.split('/')[4]) } },
]

const prefixRoutes = [
  { prefix: '/api/vision/', handler: handleVisionProxy },
  { prefix: '/api/reliability/', handler: handleReliabilityProxy },
  { prefix: '/api/a2e/', handler: handleA2eProxy },
  { prefix: '/tunein-opml', methods: ['GET', 'HEAD'], handler: handleTuneInOpmlProxy },
]

function serveStaticFile(req, res, urlPath) {
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
}

function createServer() {
  return http.createServer((req, res) => {
    const urlPath = req.url?.split('?')[0] || '/'

    const exactMatch = exactRoutes.find(r => r.method === req.method && r.path === urlPath)
    if (exactMatch) { exactMatch.handler(req, res); return }

    const patternMatch = patternRoutes.find(r => r.method === req.method && r.pattern.exec(urlPath))
    if (patternMatch) { patternMatch.handler(req, res, urlPath); return }

    const prefixMatch = prefixRoutes.find(r => urlPath.startsWith(r.prefix) && (!r.methods || r.methods.includes(req.method)))
    if (prefixMatch) { prefixMatch.handler(req, res); return }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405
      res.end()
      return
    }

    serveStaticFile(req, res, urlPath)
  })
}

let mainWindow = null
let server = null

function setupSocketProxy(clientSocket, upstreamSocket, upstreamRes, upstreamHead, head, clientRequestedProtocol) {
  let responseHead = 'HTTP/1.1 101 Switching Protocols\r\n'
  const h = upstreamRes.headers
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
}

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
        setupSocketProxy(clientSocket, upstreamSocket, upstreamRes, upstreamHead, head, !!req.headers['sec-websocket-protocol'])
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

  loadEnvFromFile()
  setupBrowserSession()
  registerBrowserIpc()
  registerJarvisIdeIpc()

  // Initialise RAG database schema (pgvector) if configured
  if (ragDb.isConfigured()) {
    ragDb.initSchema().catch((err) => console.error('[rag-db] schema init failed:', err.message))
  }

  void createWindow()
})

app.on('window-all-closed', () => {
  if (server) {
    server.close()
    server = null
  }
  ragDb.shutdown().catch(() => {})
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createWindow()
})
