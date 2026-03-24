/**
 * Dev-only HTTP bridge to Playwright MCP (see `scripts/agent-mcp-bridge.mjs`).
 * Vite proxies `/api/agent-browser` → `http://127.0.0.1:3847` when `npm run agent:mcp` is running.
 */

const BASE = '/api/agent-browser'

export type AgentBrowserHealth = { ok: boolean; mcp?: string; error?: string }

export async function fetchAgentBrowserHealth(): Promise<AgentBrowserHealth> {
  const r = await fetch(`${BASE}/health`)
  return (await r.json()) as AgentBrowserHealth
}

export type McpCallResponse = { result?: unknown; error?: string }

export async function callAgentBrowserTool(
  name: string,
  args: Record<string, unknown> = {}
): Promise<McpCallResponse> {
  const r = await fetch(`${BASE}/call`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, arguments: args }),
  })
  const data = (await r.json()) as McpCallResponse & { error?: string }
  if (!r.ok) {
    return { error: data.error ?? r.statusText }
  }
  return data
}
