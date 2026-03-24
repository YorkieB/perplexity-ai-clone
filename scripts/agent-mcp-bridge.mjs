/**
 * Dev-time HTTP bridge to Playwright MCP (stdio). Run: npm run agent:mcp
 * The Vite dev server proxies /api/agent-browser → this server.
 */
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import process from 'node:process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const cliPath = path.join(root, 'node_modules', '@playwright', 'mcp', 'cli.js')

const PORT = Number(process.env.AGENT_MCP_BRIDGE_PORT ?? 3847)

/** Optional comma-separated host allowlist (e.g. example.com,*.wikipedia.org). Empty = allow any https/http URL. */
const ALLOW_HOSTS = (process.env.AGENT_BROWSER_ALLOW_HOSTS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

function hostAllowed(urlStr) {
  if (ALLOW_HOSTS.length === 0) return true
  let host
  try {
    host = new URL(urlStr).hostname
  } catch {
    return false
  }
  return ALLOW_HOSTS.some((rule) => {
    if (rule.startsWith('*.')) {
      const base = rule.slice(2)
      return host === base || host.endsWith(`.${base}`)
    }
    return host === rule
  })
}

let mcpClient = null
let connectPromise = null

async function getMcpClient() {
  if (mcpClient) return mcpClient
  if (!connectPromise) {
    connectPromise = (async () => {
      const transport = new StdioClientTransport({
        command: process.execPath,
        // Use bundled Chromium from `npx playwright install chromium`, not system Google Chrome.
        args: [cliPath, '--browser', 'chromium', '--headless'],
        cwd: root,
        stderr: 'pipe',
      })
      const client = new Client({ name: 'ai-search-agent-bridge', version: '1.0.0' })
      await client.connect(transport)
      mcpClient = client
      return client
    })()
  }
  return connectPromise
}

function sendJson(res, status, body) {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  })
  res.end(data)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)

  if (req.method === 'GET' && url.pathname === '/health') {
    try {
      await getMcpClient()
      sendJson(res, 200, { ok: true, mcp: 'connected' })
    } catch (e) {
      sendJson(res, 503, {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      })
    }
    return
  }

  if (req.method === 'GET' && url.pathname === '/tools') {
    try {
      const client = await getMcpClient()
      const listed = await client.listTools()
      sendJson(res, 200, { tools: listed.tools ?? [] })
    } catch (e) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) })
    }
    return
  }

  if (req.method === 'POST' && url.pathname === '/call') {
    try {
      const body = await readBody(req)
      const name = body?.name
      const args = body?.arguments ?? {}
      if (!name || typeof name !== 'string') {
        sendJson(res, 400, { error: 'Missing tool name' })
        return
      }
      if (name === 'browser_navigate' && typeof args.url === 'string' && !hostAllowed(args.url)) {
        sendJson(res, 403, { error: 'URL host not in AGENT_BROWSER_ALLOW_HOSTS allowlist' })
        return
      }
      const client = await getMcpClient()
      const result = await client.callTool({ name, arguments: args })
      sendJson(res, 200, { result })
    } catch (e) {
      sendJson(res, 500, { error: e instanceof Error ? e.message : String(e) })
    }
    return
  }

  sendJson(res, 404, { error: 'Not found' })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[agent-mcp-bridge] http://127.0.0.1:${PORT} (POST /call, GET /health, GET /tools)`)
})

server.on('error', (err) => {
  console.error('[agent-mcp-bridge]', err)
  process.exit(1)
})
