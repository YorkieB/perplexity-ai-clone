# Agent browser (Playwright MCP bridge)

This app can drive a **separate** Chromium instance via [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp) using the **accessibility tree** (structured snapshots), aligned with the agentic-browser roadmap (Phase 1).

The **Electron in-app Web browser** (`Web browser` in the sidebar) remains a human-facing surface. **Agent browser** uses Playwright MCP and does not embed inside that webview.

## Prerequisites

1. **Node dependencies** (includes `@playwright/mcp`, `@modelcontextprotocol/sdk`, `playwright`).
2. **Playwright browsers** (first time):

   ```bash
   npx playwright install chromium
   ```

## Running locally

1. Start the MCP HTTPS bridge (listens on `127.0.0.1:3847` by default):

   ```bash
   npm run agent:mcp
   ```

2. Start Vite (proxies `/api/agent-browser` → the bridge):

   ```bash
   npm run dev
   ```

   Or run both in one terminal:

   ```bash
   npm run dev:agent
   ```

3. In the app sidebar, open **Agent browser**, enter a URL, then **Navigate** and **Snapshot**.

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `AGENT_MCP_BRIDGE_PORT` | `3847` | Port for `scripts/agent-mcp-bridge.mjs` |
| `AGENT_BROWSER_ALLOW_HOSTS` | _(empty)_ | Optional comma-separated host allowlist for `browser_navigate` (e.g. `example.com,*.wikipedia.org`). Empty allows any URL (dev only). |

## Security

- Treat the bridge as **dev / trusted-local** only; do not expose port `3847` to the public internet.
- Use `AGENT_BROWSER_ALLOW_HOSTS` when testing against untrusted sites.
- Production deployments should add authentication, HTTPS, and the governance layers described in the agentic-browser plan (allowlists, HITL, audit log).

The bridge spawns Playwright MCP with **`--browser chromium --headless`** so automation uses the **bundled Chromium** from `playwright install` (not the system Google Chrome install).

## Files

- [`scripts/agent-mcp-bridge.mjs`](../scripts/agent-mcp-bridge.mjs) — HTTPS bridge to Playwright MCP (stdio).
- [`src/lib/agent-browser-mcp.ts`](../src/lib/agent-browser-mcp.ts) — Browser client for `/api/agent-browser/*`.
- [`src/components/AgentBrowserPanel.tsx`](../src/components/AgentBrowserPanel.tsx) — UI panel.
